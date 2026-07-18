# Target Reference Architecture (Azure) — Security-First North Star

**Status:** 🟡 Draft v0.1 (2026-07-17) — synthesizing artifact, not a new set of requirements
**Scope:** The optimal, highly secure end-state for PeakLogic on Azure. This is the *target* the existing artifacts point at, drawn together into one coherent picture.

---

## 0. How to read this document

This is a **synthesizing** artifact. It invents no new requirements; it consolidates decisions already made across the numbered artifacts into a single reference the whole team (and any future Claude session) can hold in their head at once. Where it corrects a mental model, it says so and cites the governing doc.

Authoritative sources it draws on:
- [Security Architecture](security-architecture.md) — identity, the act-as handoffs, RLS
- [Multi-Tenant Architecture](multi-tenant-architecture.md) — the cross-scope isolation framework
- [Device & Command Security Architecture](device-command-security-architecture.md) — DPS, Direct Methods, safety-critical actuation
- [Device Onboarding & Telemetry Acquisition](device-onboarding-and-telemetry-acquisition.md) — the 3-path device taxonomy
- [Azure Review & Improvement Roadmap](azure-review-and-improvement-roadmap.md) — the Super-Console design (§3) and ZTP roadmap (§4)
- [Threat Model](threat-model.md) and [SOC 2 Control Mapping](soc2-control-mapping.md) — the security posture this must satisfy

**When this doc and a numbered artifact disagree, the numbered artifact wins** until this one is promoted past Draft — this is a proposal for the consolidated target, offered for review.

---

## 1. The goal, stated as an architecture problem

PeakLogic monitors safety-critical industrial equipment (pumps, HVAC, pool systems, refrigeration, energy, leak sensors) for many independent organizations, sold both **direct** (customers) and **through channel partners** (white-label). The architecture must simultaneously deliver:

1. **One operator console** — PeakLogic staff manage every environment and device from a single pane (the Cisco/Meraki model).
2. **Hard separation** — a customer can never see another customer's data; a partner sees only its attributed accounts; a customer can never reach the staff console.
3. **Low-friction device onboarding** — register in the cloud, connect in the field, and configuration flows down automatically (zero-touch).
4. **Enterprise-grade security** — SOC 2-aligned, defensible under a large customer's security review.

These pull against each other. "One console over everything" and "hard separation" are the central tension. **The resolution is the single most important idea in this document (§5.3): central management is built from many small, individually-scoped operations fanned out — never one privileged cross-tenant query.** That one rule is what lets both goals be true at once.

---

## 2. Design principles (the security tenets, in priority order)

Every decision below traces to one of these. When two designs are otherwise equal, the one that honors the higher principle wins.

1. **Isolation by construction, not by discipline.** Separation must be enforced by the *shape* of the system (distinct token issuers, RLS that fails closed, per-org scoped handoffs), so that forgetting a check yields *no data* rather than *the wrong data*. A design that relies on developers "remembering to filter" is rejected.
2. **Fail closed.** Missing tenant context returns zero rows (RLS), not all rows. A missing CA bundle refuses to connect, not connects insecurely. Absence of a positive authorization is denial.
3. **Least privilege, everywhere, always scoped.** No component holds a credential or a query capability broader than its job. Staff see their book of business; an account manager is not a superadmin; the ingest process writes telemetry and nothing reads customer PII through it.
4. **Secretless where the platform allows.** Prefer Azure Managed Identity + Key Vault references over any static, long-lived secret in config, env vars, or templates. Every remaining static secret is a tracked exception with a revert gate.
5. **No inbound to the customer edge.** Devices connect *outbound* over mutual-TLS. The cloud never needs a firewall hole, port-forward, or inbound rule on a customer network — a hard requirement for zero-trust enterprise buyers.
6. **Defense in depth.** Every sensitive path has at least two independent controls (e.g., token audience validation *and* RLS; network isolation *and* managed-identity auth). No single failure is catastrophic.
7. **Everything privileged is audited.** Every act-as action, every device command, every staff assignment change is attributed to a real human identity and written to an append-only trail.
8. **Safety-critical logic is local-first.** A leak shutoff trips off the device's own sensor immediately; the cloud command path is for override/reset/audit, never the sole trigger.

---

## 3. The three planes

The system decomposes cleanly into three planes with different trust models. Keeping them conceptually distinct is what makes the security story tractable.

| Plane | What it does | Trust model |
|---|---|---|
| **Identity plane** | Authenticates humans, issues JWTs | Three *separate* Entra directories (§4). Token issuers only — never data sources. |
| **Control plane** | Human-facing apps + API + RLS-scoped data access | Zero-trust; every request re-authorized; isolation by RLS + fan-out (§5–6). |
| **Device plane** | Telemetry ingestion + config/command push | Mutual-TLS device identity; outbound-only; system-process ingest that *deliberately* bypasses RLS (§7–8). |

The most common architecture mistake — the one the reviewed diagram made — is drawing an identity-plane edge (SSO) and a device-plane edge (telemetry) as the same kind of arrow into the control plane. They are different planes with different trust semantics. Keep them separate in every diagram.

---

## 4. Identity plane — three separate directories

```
┌─────────────────────────────┐   ┌─────────────────────────────┐   ┌─────────────────────────────┐
│  Corporate Entra ID         │   │  PeakLogicCustomers         │   │  PeakLogicPartners          │
│  (Workforce)                │   │  (Entra External ID)        │   │  (Entra External ID)        │
│  → PeakLogic staff only     │   │  → customer users           │   │  → partner users            │
│  Conditional Access + MFA   │   │  self-service, MFA           │   │  self-service, MFA          │
│  + PIM for privileged roles │   │                             │   │                             │
└──────────────┬──────────────┘   └──────────────┬──────────────┘   └──────────────┬──────────────┘
     issues staff JWT                  issues customer JWT               issues partner JWT
   (audience: super-console)         (audience: tenant portal)        (audience: partner portal)
```

**These are three distinct token issuers with three distinct audiences.** This is the structural root of "hard separation." A customer's token is minted by a directory the staff console does not trust and cannot be replayed against it. The backend validates each request against the *specific* issuer/JWKS/audience for its surface (`validateEntraToken(kind)` — `'customers' | 'partners' | 'staff'`).

**Identity keying — a hard-won correction (finding C1, fixed this cycle).** Human identity is keyed on the Entra **`oid`** (object ID — stable for a user across every app registration), **never `sub`** (which is pairwise-per-app: the SPA, the mobile app, and the hub each see a *different* `sub` for the same person). Keying on `sub` silently fragments one human into several identities across surfaces. Locked in Security Architecture §2.5/§9.

**Custom claims** carry authorization context: `extension_tenantId` (customer's org), `extension_channelPartnerId` (partner). These are verified against Entra's documented directory-extension convention on first real-tenant wiring (finding A7 — the claim name can carry an app-id infix).

**Privileged-access hardening for staff:** the corporate workforce tenant gates the Super-Console behind **Conditional Access** (compliant device + MFA) and puts `superadmin` behind **Entra PIM** (just-in-time elevation, time-boxed, approval-logged) rather than standing admin. An account manager's day-to-day role is *not* superadmin.

---

## 5. Control plane — the three surfaces and the Super-Console

### 5.1 Three surfaces, genuinely separate

| Surface | Who | Backed by | Sees |
|---|---|---|---|
| **Internal Super-Console** (new UI) | PeakLogic staff | Corporate workforce Entra ID | Their book of business, via act-as (superadmin = all) |
| **Tenant Portal** (existing React app) | Customer admins/operators | PeakLogicCustomers | Only their own org (RLS) |
| **Channel-Partner Portal** (white-label) | Partner admins/techs/managers | PeakLogicPartners | Only attributed accounts (RLS) |

Three separate front-end apps, three separate issuers. A **shared UI component package** lets all three render the same Site→Asset→Device views without three divergent copies (roadmap item 9) — shared *code*, not shared *sessions*.

> **Clickable prototype:** [`prototypes/super-console-demo.html`](prototypes/super-console-demo.html) is a self-contained, operable mockup of this console — fleet fan-out, tenant *and* partner act-as, the device-twin drawer (§8), and the ZTP registration flow (§9). It's the design target for roadmap items 8–9, not an implementation.
>
> **Implementation plan:** [`super-console-implementation-plan.md`](super-console-implementation-plan.md) turns that prototype into a phased build — grounded in the real admin API on `dev`, with the fan-out isolation rule as an enforced architecture test.

### 5.2 The Super-Console act-as model — **act-as, not impersonation**

This is the correction the reviewed diagram most needed. There are two models; they are not the same, and the default matters enormously:

**Option A — Render-everything / server-side act-as. ✅ The architecture.**
Staff stay authenticated to the Super-Console with their *own* corporate identity. "Manage &lt;Org&gt;" switches the **active org context**; the console calls the admin API, which runs the **already-built** `withStaffActingOnTenant()` handoff:
1. Verify the staff member's assignment to that org (`account_assignments`).
2. Open a DB transaction, `SET LOCAL app.current_tenant_id`, `FORCE ROW LEVEL SECURITY`.
3. Run the *exact same* RLS-scoped queries the tenant portal runs.
4. Audit-log the action to the **staff member's own `oid`**, plus the org acted upon.

No second credential is minted. No token is issued *as the customer*. There is no impersonation session to steal, scope, or revoke. Isolation is preserved by construction. This is exactly how Meraki/Catalyst Center work.

**Option B — Impersonation / launch-in-context token. Deferred, gated, separate.**
Mint a short-lived, audit-tagged, scoped token and open the *literal* customer portal — only for the narrow support case "reproduce exactly what the customer sees." This is a **real new security surface** (token issuance, blast radius, revocation) and gets its own threat-model artifact before it is built. When built: superadmin-only, PIM-elevated, time-boxed, every session logged.

> **Rule:** the diagram/label must never call the default model "impersonation." The default is server-side scoped act-as. Conflating them invites building the risky path by default.

### 5.3 The isolation guarantee — **fan-out, never cross-tenant**

**The Super-Console must never issue a query that reads across tenants directly.** Every "global" view — Fleet Overview, the needs-attention list, global device inventory — is assembled by **fan-out**:

```
for org in staffMember.assignedOrgs:        # tens–hundreds, not millions
    rows += withStaffActingOnTenant(org, q) # one RLS-scoped query per org
merge(rows) in application code
```

N small individually-scoped queries, each passing through the identical RLS gate the tenant portal uses — **never one privileged cross-scope `SELECT`**. The RLS attack surface therefore never grows as the console gains "global" features; the three-pass isolation hardening (Multi-Tenant Architecture) keeps holding unchanged. This is the same pattern already reasoned-about for the channel-partner-manager cross-account overview (API Spec §4.10, Multi-Tenant §2.7).

**This is the rule that dissolves the central tension of §1.** Central management is an *application-layer aggregation of individually-authorized reads*, not a privileged bypass. Write it into the code as a hard constraint (a lint/review rule that the admin API never calls the pool without a `withStaffActingOnTenant`/`withManagerActingOnChannelPartner` wrapper), not a convention.

### 5.4 The four scoped handoffs (the complete set)

| Wrapper | Caller | Scope set by |
|---|---|---|
| `withTenant()` | Tenant portal | Customer's own `tenantId` from JWT |
| `withChannelPartner()` | Partner portal | Partner's `channelPartnerId` from JWT |
| `withStaffActingOnTenant()` | Super-Console | Staff assignment → target `tenantId` |
| `withManagerActingOnChannelPartner()` | Partner-manager (design-only, v1.3) | Manager assignment → target partner |

Every one of them is a transaction that sets a `SET LOCAL` scope var and lets RLS enforce. **No route touches the DB outside one of these wrappers** — the single exception is ingest (§7.4).

---

## 6. Data plane — multi-tenant with RLS that fails closed

- **Single shared backend** (Azure Functions v4) + **single multi-tenant PostgreSQL Flexible Server**, tenant-partitioned by **Row-Level Security**, not by schema/DB-per-tenant. Cost-appropriate and — critically — the isolation is enforced in the database engine, below the application, so an application bug cannot leak across tenants as long as the scope var is set.
- **RLS fails closed:** with no `app.current_tenant_id` set, tenant-scoped tables return **zero rows** (or, for a superuser, all rows — which is why the app role is *never* superuser and `FORCE ROW LEVEL SECURITY` is on).
- **Secretless DB auth:** the Functions app authenticates to Postgres and Key Vault via **Managed Identity** (`DefaultAzureCredential`), pulling the DB credential from **Key Vault** at runtime — no static password in env, config, or IaC templates. (⚠️ the `dev` home-lab stage has a tracked plaintext exception, TD-43, with a hard revert gate before any real customer data — see [technical-debt-register](technical-debt-register.md) and the dev-credential memory.)
- **TLS to the DB is verified against the real Azure CA bundle** (fail-loud if the bundle is missing — no `rejectUnauthorized: false` escape hatch).

### Core entity model (disambiguated)

The reviewed diagram listed "Tenants, Partners, Customers" as three flat entities, which is ambiguous. The real model is **two org types**:

- **Tenant** = a customer organization (the account that owns sites, assets, devices, users). "Customer" and "Tenant" are the same thing.
- **Channel Partner** = a distinct org type that has *attributed* tenants (via `account_assignments`) and its own white-label portal, technicians, territories, routes.

Under an org: **Sites → Assets → Devices**, plus **Users**, **Alerts**, **Tickets**, **Telemetry streams**. Staff-to-org relationships (`account_assignments`) are the "book of business" that scopes each account manager.

---

## 7. Device plane — ingestion (outbound-only, three paths)

All device connectivity is **outbound, mutual-TLS, no inbound rule ever** (principle 5). Three onboarding/transport paths reduce to one model (Device Onboarding taxonomy):

```
                       ┌──────────────── Azure IoT Hub ────────────────┐
 Path A: direct        │  per-device X.509 identity (via DPS)          │
 device ──MQTT/TLS:443─┤                                               │
                       │                                               │──► Event Hub ──► ingest
 Path B: PeakLogic Edge│  hub holds device identities; relays          │      Function
 hub ──MQTT/TLS:443────┤  local sensors it aggregates                  │   (system process,
                       │                                               │    RLS-bypass by design)
 Path C: OEM cloud ────┼──► polling integration (Resideo/Honeywell/    │
 (Resideo/Pentair/…)   │      Pentair) — no DPS, cloud-to-cloud        │
                       └───────────────────────────────────────────────┘
```

- **Path A — direct-to-internet device.** Self-provisions via **DPS**, gets a per-device X.509 identity, connects to IoT Hub.
- **Path B — hub-relayed (PeakLogic Edge / the Windows hub).** The on-site hub aggregates local sensors and relays over one authenticated outbound session. This tier was **missing from the reviewed diagram** — it is a first-class ingestion path, not a variant of A.
- **Path C — third-party OEM cloud.** No device cert; a **polling integration** reconciles OEM-cloud device state against a cloud "intent" record (§9). This is the real unbuilt gap (Device Onboarding §6) — sequenced per named OEM partnership, not speculatively.

**Transport hardening:** prefer **port 443** over 8883 for all firmware (identical MQTT session, looks like ordinary HTTPS to egress appliances). TLS-inspection proxies that break mutual-TLS are handled as a **customer onboarding allowlist step**, not engineered around.

### 7.4 The one deliberate RLS bypass

The **ingest Function is a system process** that writes telemetry and alerts *across* tenants and therefore connects with a direct pool connection, **not** a `withTenant()` wrapper. This is the single sanctioned exception to §5.4's rule, and it is safe because ingest is **write-mostly and reads no cross-tenant PII through that connection** — it resolves a device to its owning tenant by the device's own identity, then writes within that scope. Every diagram must show this exception explicitly so no future reader assumes *everything* flows through RLS.

---

## 8. Device plane — config push & command (the downward direction)

The reviewed diagram was ingestion-only (arrows up). The target architecture also pushes **down**, via two distinct, native IoT Hub mechanisms — do not conflate them:

| Mechanism | Direction | Semantics | Use |
|---|---|---|---|
| **Device Twin — desired properties** | cloud → device | *Declarative desired state* | Reporting interval, metrics, thresholds, firmware channel, asset-linkage. The "all configurations are pushed" mechanism. Applied automatically whenever the device connects. |
| **Device Twin — reported properties** | device → cloud | *Actual applied state + health* | Feeds device-silence / not-yet-configured detection (finding A6). |
| **Direct Methods** | cloud → device | *Imperative one-shot action* | Valve shutoff, reset, manual override. |

**Safety-critical actuation is local-first (principle 8):** a leak shutoff trips off the device's own reading immediately; Direct Methods are for remote override/reset/audit, never the sole trigger. Every command is audit-logged (who/what/outcome) — design the publish path and the audit trail as one unit, never the publish path alone.

---

## 9. Zero-touch provisioning (the unifying model)

**One reconciliation engine, three triggers.** All three paths reduce to: *a "device intent" record created in the cloud, reconciled automatically when the physical device first appears.* The `devices` table already has the `tenant_id = NULL` "unclaimed inventory" concept; ZTP attaches **desired configuration** to that intent and reconciles on first contact.

- **Register in cloud:** batch-register a device *family* via **DPS enrollment groups** (one signing CA, not one record per unit) — the actual "zero-touch at fleet scale" enabler (finding A3). Trade-off: lower friction, higher blast radius on a leaked group CA → mitigated by per-device disenrollment, short-lived leaf certs, CA in Key Vault/HSM. **This gets its own threat-model pass — it is a security decision, not a config flag.** Keep individual enrollment as the fallback for one-off/high-value devices.
- **Connect in field → auto-register + config push:** device self-provisions (DPS) → assigned to the right IoT Hub → **device-twin desired properties push the full config down** (§8). True zero-touch for Paths A and B; Path C reconciles via OEM-cloud polling.

**Lifecycle as first-class state:** `registered → provisioning → configured → reporting → silent → decommissioned`, surfaced in the Super-Console's global device inventory (folds in device-silence detection, finding A6).

---

## 10. Audit, monitoring & detection

- **Append-only audit trail** (`audit_log_entries`, already third-actor-aware): every act-as action attributed to the staff `oid` + target org; every device command with outcome; every staff-assignment change.
- **Fleet-wide health & anomaly** via device-twin reported properties + telemetry rules (alert categories in `RULES_BY_CATEGORY`).
- **Security monitoring:** Entra sign-in/risk logs (Conditional Access, PIM elevations), Key Vault access logs, Postgres audit logging, Functions/App Insights. Wired to the SOC 2 CC-series monitoring controls (soc2-control-mapping).
- **Cost guardrail** (Azure has no native RDS-style auto-stop kill switch — see the Azure cost-findings memory): a custom budget-action equivalent must be built for the Postgres Flexible Server, mirroring the AWS budget kill switch.

---

## 11. Trust boundaries & data classification

```
Boundary 1: Internet ↔ Identity plane      → three Entra directories, MFA, Conditional Access
Boundary 2: Identity ↔ Control plane       → per-issuer JWT validation (issuer+JWKS+audience+oid)
Boundary 3: Control plane ↔ Data           → RLS scope var per request; app role never superuser
Boundary 4: Tenant ↔ Tenant                → RLS + fan-out (never a cross-tenant query)
Boundary 5: Cloud ↔ Customer edge          → outbound mutual-TLS only; zero inbound
Boundary 6: Control plane ↔ Secrets        → Managed Identity + Key Vault; no static creds
Boundary 7: Corporate net ↔ superadmin     → PIM just-in-time elevation, time-boxed
```

| Data class | Examples | Handling |
|---|---|---|
| **Cross-tenant secrets** | DPS group CA, DB credential, JWT signing trust | Key Vault / HSM, managed-identity access only, audited |
| **Tenant PII / operational** | users, sites, alerts, tickets | RLS-scoped; reachable only through a scoped handoff |
| **Telemetry** | device readings | Written by ingest (system), read RLS-scoped |
| **Audit** | act-as, commands, assignments | Append-only, never deletable |

---

## 12. Corrected master diagram

```
                         ┌───────────────────────── IDENTITY PLANE ─────────────────────────┐
                         │  Corporate Entra ID      PeakLogicCustomers    PeakLogicPartners  │
                         │  (staff, MFA+CA+PIM)     (External ID)          (External ID)      │
                         └───────┬───────────────────────┬───────────────────────┬───────────┘
                            staff JWT               customer JWT              partner JWT
                          (aud: console)          (aud: tenant app)        (aud: partner app)
                                 │                        │                        │
          ┌──────────────────────▼───┐      ┌─────────────▼──────────┐  ┌──────────▼───────────────┐
          │  INTERNAL SUPER-CONSOLE  │      │   TENANT PORTAL (React) │  │ CHANNEL-PARTNER PORTAL   │
          │  staff · act-as · fan-out│      │   customer admins/ops   │  │ (white-label) · techs    │
          └──────────────┬───────────┘      └────────────┬───────────┘  └──────────┬───────────────┘
        per-org scoped calls, fanned out         withTenant()            withChannelPartner()
        withStaffActingOnTenant() ×N                     │                          │
                         └───────────────┬───────────────┴──────────────┬──────────┘
                                         ▼                              CONTROL PLANE
                         ┌───────────────────────────────────────────────────────────┐
                         │        SHARED BACKEND (Azure Functions v4) + RLS           │
                         │  every request: validate issuer+aud+oid → scoped handoff   │
                         │  ── auth to DB/secrets via Managed Identity + Key Vault ──  │
                         └───────────────────────────┬───────────────────────────────┘
                                                     ▼
                         ┌───────────────────────────────────────────────────────────┐
                         │   PostgreSQL Flexible Server — multi-tenant, RLS fails closed│
                         │   Tenant(=customer) · Channel Partner · Sites→Assets→Devices│
                         │   Users · Alerts · Tickets · Telemetry · audit_log_entries  │
                         └─────────────▲───────────────────────────────┬──────────────┘
                          ingest (system process,          twin desired-props / Direct Methods
                          RLS-BYPASS by design)                   (config push / commands)
                                       │                                 │ (down)
                         ┌─────────────┴─────────── DEVICE PLANE ────────▼──────────────┐
                         │        Azure IoT Hub  ◄── DPS (enrollment groups / X.509)     │
                         │   ▲(A direct)     ▲(B PeakLogic Edge hub)     ▲(C OEM cloud)   │
                         │   │ MQTT/TLS:443  │ MQTT/TLS:443              │ cloud poll     │
                         │  device        on-site hub                Resideo/Honeywell/  │
                         │                (relays local sensors)      Pentair            │
                         └──────────────────────────────────────────────────────────────┘
              ── all device links OUTBOUND, mutual-TLS, ZERO inbound to customer network ──
```

---

## 13. What's real vs designed vs roadmap (honesty ledger)

| Element | State |
|---|---|
| Three-tenant identity separation | **Designed & ported** (auth.ts validates per-issuer; `oid` bug fixed this cycle) |
| `withTenant` / `withChannelPartner` / `withStaffActingOnTenant` | **Built** (ported to Azure, RLS logic cloud-agnostic) |
| Internal admin console backend + settings (v1.2) | **Shipped on `dev`** (20 endpoints) — but no frontend UI yet |
| Super-Console frontend (the single pane) | **Designed, not built** (roadmap Tier 3, items 8–9) |
| `withManagerActingOnChannelPartner` (v1.3) | **Design-only** — no code/migration yet |
| Ingestion (IoT Hub + DPS individual enrollment) | **Designed**; not deployed (no Azure subscription yet) |
| Device twins / Direct Methods / config push | **Designed, not claimed in code yet** (findings A4/A3) |
| ZTP enrollment groups + reconciliation | **Roadmap** (needs its own threat-model pass) |
| Path C OEM cloud-to-cloud | **Roadmap**, per named partnership |
| Managed Identity + Key Vault DB auth | **Ported** (db.ts); `dev` has tracked plaintext exception (TD-43) |
| Bicep: network + data modules | **Written**, not `bicep build`-validated; iot/api/frontend/budget **not written** |

**The honest through-line:** the *control-plane security model is real and largely built*; the *device plane and the Super-Console UI are designed but await a real Azure subscription and frontend work*. Nothing here has run against a live Azure deployment yet.

---

## 14. Open decisions / gates (must be resolved before the relevant phase)

1. **DPS enrollment-group threat model** — before ZTP phase 2. Blast radius of a leaked group CA is a real security decision, not a config toggle.
2. **Option B impersonation flow** — its own threat-model artifact before any launch-in-context token is built.
3. **`dev` plaintext DB credential (TD-43)** — hard revert to Key Vault before any real customer data, staging, or prod. Proactively flag on any "promote to prod" request.
4. **Custom-claim names (`extension_*`)** — verify against a real Entra tenant (app-id infix) before wiring routes (A7).
5. **Postgres cost kill switch** — Azure has no native auto-stop; a custom equivalent must exist before a long-lived deploy (Azure cost-findings memory).
6. **Key Vault network ACL for the compute subnet** — nothing authenticates to the DB until this is wired (finding C4).

---

## 15. Summary — why this is the optimal shape

- **The central tension is dissolved, not traded off.** "One console over everything" + "hard separation" coexist because global views are *fan-outs of individually-authorized reads* (§5.3), so central management never widens the isolation surface.
- **Separation is structural,** rooted in three token issuers and RLS that fails closed — not in developer discipline.
- **The default staff model is act-as, not impersonation** — no impersonation session exists to steal until, and unless, a narrowly-scoped, separately-threat-modeled Option B is deliberately built.
- **Secretless, outbound-only, least-privilege, audited** — the four properties that survive an enterprise security review.
- **The device plane is symmetric** — telemetry up, declarative config + imperative commands down — with safety-critical logic local-first, which is what makes zero-touch provisioning a config-push problem rather than a new trust problem.
