# Platform Services Architecture — Cisco-Style Decomposition, Reconciled

**Status:** 🟡 Draft v0.1 (2026-07-18)
**Purpose:** Fold a Cisco-style service decomposition of the device-management platform into PeakLogic's existing security-first architecture — adopting the genuinely world-class additions it surfaces, keeping every isolation guarantee we've built, and refusing the over-engineering it could be misread to imply.
**Reads with:** [Target Reference Architecture](target-reference-architecture.md) (the plane/trust model — unchanged by this doc), [Super-Console Implementation Plan](super-console-implementation-plan.md), [Device Onboarding](device-onboarding-and-telemetry-acquisition.md), [Multi-Tenant Architecture](multi-tenant-architecture.md).

---

## 0. The one-paragraph thesis

The reference design decomposes the "core platform" into eight services (tenant mgmt, device mgmt, ingestion, command/control, policy, branding, analytics, gateway). PeakLogic already **has** the security-critical half of that and most of the data-plane half. The decomposition's real gift is three services we under-specified: a **Policy Engine** (config-driven rules replacing hardcoded ones), a **Device Capability Model** (declarative device types), and a **Telemetry Normalization Fabric** (vendor-agnostic canonical telemetry). Those three are what move PeakLogic from "a working multi-tenant monitor" to "a platform you can extend to any device or vertical without touching core code" — the actual definition of world-class here. Everything else is either already built, a generalization of something built, or a deliberately-deferred scaling concern.

**Critical framing:** "eight services" is a **logical** decomposition, not a mandate to run eight microservices. PeakLogic stays a **modular monolith** (one Azure Functions backend, one PostgreSQL) with clean internal service boundaries. Splitting into physical services is a scaling/team decision made per-service when a real boundary demands it — never up front. This is the same proportionality discipline that has served this project throughout.

---

## 1. Honest reconciliation — Have / Partial / New

| Reference-design service | PeakLogic today | Verdict |
|---|---|---|
| **API Gateway** (authN/Z, routing, rate limit) | In-code Entra JWT validation in Functions; route matcher (`api/match.ts`); no gateway tier | **Partial** — works; add a managed gateway *later*, cost-gated (§7) |
| **Tenant & Org Management** (RBAC, RLS) | Built: tenants/partners/orgs, RLS + `SET LOCAL`, four scoped wrappers, `account_assignments` | **Have** — this is our strongest asset |
| **Device Management Service** (registry, capabilities, lifecycle) | Device registry + lifecycle states (ZTP §9); **no capability model** | **Partial → New** (capability model, §5) |
| **Telemetry Ingestion Fabric** (ingress, normalization, stream processing, TSDB) | Ingest Function, alert rules, Postgres time-series; **normalization/schema-mapping thin** | **Partial → New** (normalization fabric, §6) |
| **Command & Control Bus** (downlink, policy actions) | Direct Methods + device twins **designed** (Target Ref §8), not built; no policy-driven actions | **Partial** — unify as a bus (§4) |
| **Policy Engine** (thresholds, config templates, notifications) | **Hardcoded** `RULES_BY_CATEGORY` in `ingest/rules.ts`; per-tenant `webhook_url` only | **New — the headline improvement (§3)** |
| **Branding & White-Label Layer** | Channel-partner branding fields exist; not a platform service | **Partial → generalize (§8)** |
| **Analytics & Reporting** (dashboards, scorecards) | Dashboards + fan-out aggregation; **no reports/scorecards** | **Partial → New (§9)** |
| **Super Admin Console / Support-NOC** | Console designed + prototyped (Target Ref §5); support = a role | **Have** (NOC = a console mode, not a new app — §10) |

**Net:** nothing here forces a rewrite. Three genuinely new services, three generalizations, one cost-gated addition, and a strong existing security core to build them on.

---

## 2. Non-negotiables every new service must honor

Any service added below inherits these unchanged — they are the reason a decomposition is *safe*:

1. **Isolation by fan-out.** No service issues a cross-tenant query. Tenant-scoped data (policies, branding, telemetry, reports) is reached only through a scoped wrapper; "global" is a fan-out of per-org scoped reads.
2. **RLS fails closed.** Every new tenant-scoped table (`policies`, `brand_profiles`, report read-models) gets an RLS policy on `app.current_tenant_id`. Platform-catalog tables (capability definitions) are global-read, tenant-write-forbidden.
3. **Act-as, not impersonation.** Staff configure a tenant's policy/branding through `withStaffActingOnTenant`, audited to their `oid`.
4. **Secretless + audited.** Managed Identity + Key Vault; every policy change, command, and branding edit writes to `audit_log_entries`.
5. **Logical services, physical monolith** until a real boundary demands otherwise.

---

## 3. Policy Engine — the headline improvement

**Today:** alert logic is `RULES_BY_CATEGORY: Record<category, Rule[]>` in `ingest/rules.ts`, where each `Rule` is `{ metric, condition: 'gt'|'lt', threshold: number | (specs)=>number, severity, message }`. Excellent, testable code — but **every customer gets the same thresholds, changeable only by a code deploy.** For safety-critical equipment across many verticals and many customers, that is the single biggest ceiling on the product.

**Target:** a Policy Engine that makes thresholds, device-config templates, and notification rules **data, not code** — tenant-configurable, inheritable, versioned, audited. The existing `RULES_BY_CATEGORY` becomes the **seed platform-default policy set**, not throwaway.

### 3.1 Policy model

Three policy kinds, all JSONB documents in a `policies` table:
- **Threshold policies** — the same `{metric, condition, threshold, severity, message}` shape, now rows. `threshold` stays expressible as a value or a spec-relative formula (preserve the `(specs)=>threshold` power as a small safe expression, e.g. `power_kw * 1.25`).
- **Config templates** — desired device-twin properties (reporting interval, metrics, firmware channel) → drives ZTP config-push (Target Ref §9). A template change re-pushes twin desired properties to matching devices.
- **Notification rules** — routing/escalation (which severities page whom, webhook/email, quiet hours), generalizing today's single `webhook_url`.

### 3.2 Scope & inheritance (the part that makes it powerful *and* safe)

```
platform default  (tenant_id = NULL, seeded from RULES_BY_CATEGORY)
   └─ tenant override      (RLS-scoped)
        └─ site/asset override   (RLS-scoped, most specific wins)
```

Effective policy for a reading = resolve(platform → tenant → site/asset) at evaluation time. Platform defaults are the global catalog (every device is covered even with zero tenant config); overrides are RLS-scoped tenant data. **A tenant can only ever read/write its own overrides** — the isolation model is unchanged; policies are just another tenant-scoped table.

### 3.3 Evaluation & migration

- The **ingest path** stops importing the hardcoded map and instead resolves the effective policy for `(tenant, category, asset)` — cached per warm instance, keyed by a policy-version stamp so an edit invalidates cleanly.
- **Migration is low-risk and reversible:** seed `policies` from `RULES_BY_CATEGORY` (a script), switch ingest to the resolver, verify identical alerts fire (the existing rules tests become the golden baseline), *then* expose tenant overrides in the console/portal. If the resolver misbehaves, the seed data reproduces today's exact behavior.
- **Security:** policy edits go through act-as (staff) or tenant-admin RBAC; every change audited and versioned (who/when/diff) — this is safety-critical config, so an append-only history is mandatory, not optional.

**Why world-class:** customers/partners self-serve their own thresholds and escalation; new verticals are a policy set, not a release; and safety-config changes are audited and reversible. This is the difference between a product and a platform.

> **Full design:** [`policy-engine-design.md`](policy-engine-design.md) — schema, the closed structured-threshold form (no evaluator), the resolver that feeds the existing pure `evaluateRules`, warm-instance caching, the never-fail-to-silence fallback, and the reversible golden-baseline migration.

---

## 4. Command & Control Bus — unify, don't over-build

Fold the three downlink mechanisms into one audited **command service** (a logical bus, *not* a new message broker):

| Mechanism | Nature | Source |
|---|---|---|
| Device-twin desired properties | Declarative desired state | Policy Engine config templates (§3) |
| Direct Methods | Imperative one-shot (reset, diagnostics, valve) | Console/portal action or policy-driven action |
| Policy-driven actions | Automated response to a condition | Policy Engine notification/action rules |

One command service issues all three through IoT Hub, writes every command to the audit trail with who/what/outcome, and enforces **safety-critical-local-first** (a leak shutoff trips on-device; the cloud path is override/reset/audit). **Do not** introduce Kafka/Service Bus as a "bus" until throughput actually requires it — IoT Hub + a command service module is the bus at current scale.

---

## 5. Device Capability Model — extend the registry

**Today** devices have a free-text `category` and asset `specs`. **Add** a declarative **capability catalog** (`device_types`): for each type, what telemetry metrics it emits (name, unit, canonical schema), what commands it accepts (which Direct Methods), and what config parameters it takes. A device references a `device_type`.

Payoff: the platform knows what any device *can do* without per-device code. Onboarding a new device model = a capability definition + a normalization adapter (§6), not a core change. The capability catalog is **global platform data** (not tenant-scoped) — read by all, written only by staff. It's also what the Policy Engine and the console's device-twin drawer read to know which metrics/commands are valid for a device.

---

## 6. Telemetry Normalization Fabric — the vendor-agnostic layer

**Today** ingest largely assumes PeakLogic's own payload shape. To carry Resideo/Honeywell/Pentair (Path C) and heterogeneous edge MCUs (ESP32 hubs) as first-class, insert a **normalization stage** between ingress and stream processing:

```
ingress adapter (per transport/vendor)  →  canonical telemetry envelope  →  policy-driven stream processing
  MQTT direct (Path A)                      { tenant_id, device_id, metric,      (§3 evaluation on
  gateway-relayed (Path B, Edge hub)          value, unit, ts, quality }          the CANONICAL form)
  OEM cloud poll (Path C)
```

- **Adapters** translate each source's raw payload into the canonical envelope, using the **capability model** (§5) to know the target metric names/units.
- All downstream logic — alert evaluation, health, anomaly, storage — runs on the **canonical form only**, so adding a vendor is one adapter, never a rearchitecture.
- Partial-telemetry tolerance (already verified in code, Device Onboarding) is preserved: a device reporting a subset of its capability's metrics is normal, not an error.

**This is what makes the "any device" promise real** and directly de-risks the Path C cloud-to-cloud gap (the one honestly-flagged unbuilt area).

---

## 7. The API Gateway question — evaluated, not assumed

The reference design shows a dedicated API Gateway. PeakLogic today validates JWTs in-code (tested, secretless, working). A managed gateway (Azure **API Management**) would add: centralized rate-limiting, WAF (with Front Door), API versioning, subscription keys for partner/OEM integrations, and one place for cross-cutting policy.

**Recommendation: not yet — and that's the disciplined call.** APIM's real value shows up at enterprise scale (a customer's security review, throttling abusive callers, exposing a partner/OEM API with metered keys), and it carries real cost/complexity (Consumption tier is the only cheap fit; Standard/Premium are not, and this project runs cost-conscious — see the Azure cost-findings work). So:
- **Now:** keep in-code auth. Add **Azure Front Door** earlier than APIM if/when we need WAF, TLS termination, and CDN at the edge — it's the higher-value, lower-cost first step.
- **Design for it:** keep routing centralized (the `v1/{*rest}` catch-all + route matcher) so an **APIM Consumption-tier** gateway can slot in front without touching handlers, the day rate-limiting or a metered OEM API justifies it.

Documenting *why not now* is as important as the eventual yes.

---

## 8. Branding & White-Label — generalize to a platform service

Generalize the existing channel-partner branding into a `brand_profiles` service (partner- and tenant-level): logo, color tokens, custom domain, and **email/notification templates**. Consumed by (a) the portals for white-label UI and (b) the notification path (§3.3) for branded alerts. This is mostly a generalization of data that already exists — the new part is branded notification templates and making the profile a first-class, RLS-scoped, act-as-editable entity.

---

## 9. Analytics, Reporting & Scorecards — the commercial differentiator

Beyond live dashboards, add **read-model aggregates** for:
- **Usage/performance reports** (per site/asset/device over time).
- **Partner & customer scorecards** — uptime %, mean-time-to-resolution, alert-response time, and vertical-specific value (e.g. energy saved, refrigeration food-safety compliance). Scorecards *prove ROI*, which is a direct commercial lever for renewals and partner growth.

Built on the **fan-out aggregation pattern** (never cross-tenant). Heavy reporting eventually wants materialized views / a read replica — a later scaling step, not a v1 concern. Keep aggregation server-side and scoped.

> **Full design:** [`reporting-and-kpi-design.md`](reporting-and-kpi-design.md) — the **CMMS dispatch integration** (automated tickets pushed into partners' CMMS as work orders, via a per-vendor connector framework), the **auto-ticket → service-call conversion KPI** it enables, and the standard/custom **Reports** section.

---

## 10. Support / NOC — a console mode, not a new app

The reference design separates "Support/NOC Tools." PeakLogic gets the same capability more cheaply as a **role-gated read-only mode of the Super-Console**: a `support_engineer` sees troubleshooting views and can enter *read-only* act-as, without a second application, second deploy, or second auth surface. The distinction the design draws is a *permission boundary*, and we already have the role. Build the mode, not the app.

---

## 11. Prioritized adoption roadmap

Ordered by value-per-effort on the foundation that exists:

**Tier 1 — the platform-making moves (highest leverage):**
1. **Policy Engine** (§3) — seed from `RULES_BY_CATEGORY`, switch ingest to the resolver, expose tenant overrides. Reversible, high-value, unblocks self-serve thresholds + config templates.
2. **Device Capability Model** (§5) — declarative `device_types`; prerequisite for both the Policy Engine's config templates and the normalization fabric.

**Tier 2 — the "any device" promise:**
3. **Telemetry Normalization Fabric** (§6) — canonical envelope + per-source adapters; directly enables Path C (OEM clouds) and de-risks vendor sprawl.
4. **Command & Control Bus** (§4) — unify twin/Direct-Method/policy actions behind one audited service (gated on IoT Hub deploy).

**Tier 3 — commercial polish:**
5. **Branding service** (§8) and **Scorecards/Reporting** (§9) — differentiation and ROI evidence.

**Tier 4 — scale-gated, deliberately deferred:**
6. **APIM gateway** (§7) — only when enterprise security review / metered OEM API / rate-limiting is real. Front Door (WAF) comes first if edge protection is needed sooner.

**Explicitly NOT now (over-engineering guard):** physical microservice split, a dedicated message broker "bus," a separate NOC app, or APIM ahead of a concrete need. Each is a real option *later*, triggered by a real constraint — never adopted just because the reference diagram draws a box.

---

## 12. Reconciliation actions on existing artifacts

When these are built, amend (per this project's non-silent-amendment discipline):
- **Database Schema** — new `policies`, `device_types`, `brand_profiles`, report read-models + their RLS policies.
- **API Specification** — policy CRUD, capability catalog, branding, reports endpoints (all `/v1/admin/tenants/{id}/...` act-as + tenant-portal equivalents).
- **Security Architecture / Multi-Tenant Architecture** — audit each new tenant-scoped table through the same two-question cross-scope framework.
- **Device & Command Security Architecture** — the Command & Control Bus + capability-gated commands.
- **Ingest** — `rules.ts` becomes the seed generator; the resolver replaces the direct import.
- **CLAUDE.md** — the "alert rules are hardcoded in `RULES_BY_CATEGORY`" note updates to "seeded from `RULES_BY_CATEGORY`, resolved via the Policy Engine."

---

## 13. Summary — what makes this world-class

- **Configurable, not hardcoded.** The Policy Engine turns safety thresholds, device config, and escalation into audited, inheritable, tenant-owned data. Product → platform.
- **Extensible by definition.** Capability model + normalization fabric mean a new device or vertical is a definition + an adapter, not a release — the honest answer to "does it support X device?" becomes "yes."
- **Secure by construction, unchanged.** Every new service inherits fan-out isolation, RLS-fails-closed, act-as, secretless, and full audit. Decomposition adds capability without widening the attack surface.
- **Disciplined.** A logical decomposition on a physical monolith; a gateway and a broker adopted only when a real constraint arrives. World-class is knowing what *not* to build yet as much as what to build.
