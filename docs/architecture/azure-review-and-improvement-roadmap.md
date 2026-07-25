# Azure Architecture — Deep Review & Improvement Roadmap

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help) (PeakLogic-Azure fork)
**Status:** Review artifact — findings + recommendations for review, not yet approved decisions
**Depends on:** the full 27-artifact Azure-restructuring pass (`azure-restructuring-plan.md` §2, all ✅ as of 2026-07-17) plus the first implementation slice (`infra-azure/`, ported `backend/shared/db.ts`+`auth.ts`)
**Last updated:** 2026-07-17

---

## 1. What was reviewed, and how

This is a genuine second-pass review of the Azure architecture and the first code slice, in the same "verify, don't assert" discipline the rest of this project uses. Reviewed directly:

- The two Bicep modules written this session (`infra-azure/main.bicep`, `modules/network.bicep`, `modules/data.bicep`) — read line by line for real Azure Resource Manager correctness, not just plausibility.
- The ported `backend/shared/db.ts` and `auth.ts` — read against the AWS originals and the amended Security Architecture / Multi-Tenant Architecture designs.
- Cross-document consistency across the 27 artifacts for the identity model, the device model, and the two new features.

**Standing honesty caveat, unchanged:** nothing on this fork has been deployed or validated against a real Azure subscription. No Azure CLI exists in the environment. Every finding below that says "verify" means exactly that — verify against a real deploy, don't treat this review as a substitute for one.

**One real bug was found and fixed during this review** (not just flagged) — the Entra `oid`-vs-`sub` identity-key defect, §2 finding C1 below.

---

## 2. Findings (bugs / oversights)

Severity: **High** = would break a core path or cause a real security/data issue; **Medium** = real gap with plausible consequences; **Low** = hygiene / verify-before-deploy.

### Code-level findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| **C1** | **High** | **`auth.ts` keyed identity on the pairwise Entra `sub` claim instead of the stable `oid`.** Entra's `sub` is unique per (user, app registration) — the SPA, MSAL mobile app, and hub each get a *different* `sub` for the same person. The DB subject columns must resolve the same row across all clients, so they must store `oid`. Keying on `sub` would orphan any user on their second-client login. | **Fixed** this review — all three `get*Auth()` prefer `oid`; decision locked in Security Architecture §2.5. |
| **C2** | Medium | **`response.ts` still returns `Access-Control-Allow-Origin: *`.** Carried verbatim from AWS v1.0.0. Security Architecture §3.2's own lesson (the AWS repo's `Cors.ALL_ORIGINS` finding) says scope this to the real deployed origins from the first commit — not repeat the wildcard on the port. | Open — fix when `response.ts` is ported off `aws-lambda` types. |
| **C3** | Medium | **`data.bicep` serializes the Key Vault secret with `string({...})`.** Whether Bicep's `string()` on an object produces JSON that `db.ts`'s `JSON.parse` accepts must be verified — if it emits ARM's object notation rather than strict JSON, the credential read fails at runtime. Low-effort fix if wrong (build the JSON string explicitly). | Verify against a real `bicep build` + deploy. |
| **C4** | Medium | **Key Vault `networkAcls` denies by default with only `bypass: AzureServices`, no VNet/private-endpoint rule for the compute subnet.** A VNet-integrated Function using `DefaultAzureCredential` over the public Key Vault endpoint would be denied. Needs either a Key Vault private endpoint on `snet-compute` or a service-endpoint ACL rule — otherwise the very first `getCredentialFromKeyVault()` call fails. | Open — real gap in `data.bicep`, not yet wired. |
| **C5** | Low | **`main.bicep`'s `alertEmail` and `dbAdminUsername` params exist but `alertEmail` has no consumer yet** (the `budget.bicep`/monitoring module that would use it isn't written). Harmless but a lint smell — an unused required parameter. | Resolves when the monitoring module lands. |
| **C6** | Low | **`certs/azure-postgres-ca-bundle.pem` is required-but-absent** — `db.ts` fails loudly without it (correct by design). Means the DB path can't run end-to-end until the real DigiCert G2 + Microsoft RSA Root 2017 bundle is placed there. Documented in `certs/README.md`. | Expected — a real pre-deploy step, not a defect. |
| **C7** | Low | **Postgres private DNS zone name `<prefix>.postgres.database.azure.com`** in `data.bicep` — Azure Flexible Server VNet integration has specific zone-naming rules (some configs require a `.private.` infix). Verify the exact requirement. | Verify. |
| **C8** | — | **The rest of `backend/` (~20 route/router/ingest files) still imports `aws-lambda` types and, in 4 files, the AWS Cognito SDK; `get*Auth()` are now `async` and every call site needs `await`.** This is the known, disclosed remaining port — not a new finding, restated so the review is complete. `tsc --noEmit` fails on these today by design (nothing was faked to make it pass). | Sequenced follow-up (MVP Roadmap §5 item 3). |

### Architecture-level findings

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| **A1** | **High** (for the stated vision) | **No frontend exists for the Internal Administration Console** (TD-42) — and your entire "central management, Cisco-style" vision depends on it. The backend act-as handoff, the three identity surfaces, and the RLS isolation are all built/designed; the single-pane-of-glass UI is the missing piece. | §3 below is a concrete design direction for it. |
| **A2** | Medium | **No staff "launch into a tenant/partner context" session mechanism at the token layer** — only the *data-layer* act-as handoff (`withStaffActingOnTenant`) exists. To "navigate and log into all of these," you need either an impersonation-token flow or the console-renders-everything model. | §3.3 lays out both; recommends the render-everything (Meraki) model. |
| **A3** | **High** (for the ZTP goal) | **DPS *individual* enrollment (Device & Command §2) is at odds with true zero-touch provisioning.** Individual enrollment needs a per-device enrollment pre-created; ZTP at scale wants *enrollment groups* (CA-signed) so a field-connected device self-provisions with no per-device cloud step. | §4 makes this the central ZTP decision. |
| **A4** | Medium | **No device-twin / configuration-push mechanism is specified anywhere.** Device & Command chose Direct Methods for *commands* but never addressed *configuration state*. ZTP's "all configurations are pushed" is exactly IoT Hub **device twin desired properties** — an unaddressed gap. | §4.3 specifies it. |
| **A5** | Medium | **The central console must NOT introduce a cross-tenant "show everything" query.** The temptation, building a single-pane UI, is a new query that reads across tenants directly — which would bypass the RLS isolation this whole project spent three audit passes hardening. | §3.4: compose per-tenant act-as calls (the fan-out pattern already designed for the channel-partner-manager overview), never a new cross-scope policy. This *is* the "clear separation" guarantee. |
| **A6** | Low | **Device-silence/offline detection (Device Onboarding §5 open item) becomes first-class under ZTP** — "registered in cloud but never phoned home" is a real ZTP state a technician needs to see. | Fold into the ZTP phase 3, §4. |
| **A7** | Low | **Entra External ID custom-attribute claim names (`extension_tenantId`, `extension_channelPartnerId`) are written to Entra's documented convention but never verified call-by-call** (Security Architecture §8 item 4). Directory-extension claims can carry an app-id infix. | Verify against a real tenant before wiring routes. |

**Net read:** the architecture is sound and internally consistent. The one real code bug (C1) is fixed. Everything else is either a verify-on-deploy item or a *forward-looking gap the two roadmap sections below turn into a plan* — which is exactly what you asked for.

---

## 3. The central management platform ("single pane of glass")

Your reference — Cisco's dashboard model (Meraki / Catalyst Center): one console for the operator, hard multi-tenant separation underneath, the ability to drop into any customer's context. The good news is **PeakLogic's backend already models this correctly**; the work is almost entirely UI plus one session mechanism. Here is how it maps, keeping the tenant / data / portal separation you want.

### 3.1 The three surfaces, kept genuinely separate

| Surface | Who logs in | Identity (Entra) | Sees |
|---|---|---|---|
| **Internal Super-Console** (new UI, the "single pane") | PeakLogic staff | PeakLogic's own **corporate Entra ID workforce tenant** (Security Architecture §2.5) | Everything, *via act-as* — never a raw cross-tenant query |
| **Tenant Portal** (the existing React app) | Customer admins/operators | **PeakLogicCustomers** External ID tenant | Only their own org's data (RLS) |
| **Channel-Partner Portal** (white-label, separate app) | Partner admins/technicians/managers | **PeakLogicPartners** External ID tenant | Only their attributed accounts |

These are three separate Entra tenants and three separate front-end apps by design — that *is* the "clear separation." A customer can never authenticate into the staff console; a partner's branded portal is its own surface. This separation is structural (different token issuers, different RLS scoping), not just a UI convention.

### 3.2 What the Super-Console actually shows (the Meraki-style layout)

A concrete first-cut information architecture, built entirely on endpoints that already exist or are already designed:

```
Super-Console (PeakLogic staff)
├── Fleet Overview            ← global health: every tenant/partner, open-issue counts,
│                               device online/offline rollup, "needs attention" list
│                               (fan-out over assigned accounts — §3.4)
├── Organizations
│   ├── Tenants (list/search) ← GET /v1/admin/tenants
│   │   └── [Tenant] ──"Manage"──▶ launches act-as context (§3.3)
│   │         ├── Sites / Assets / Devices  ← the SAME views the tenant portal
│   │         ├── Users / Alerts / Tickets    renders, via withStaffActingOnTenant()
│   │         └── (a persistent "you are acting as <Tenant> — exit" banner)
│   └── Channel Partners (list/search) ← GET /v1/admin/channel-partners
│         └── [Partner] ──"Manage"──▶ act-as into the partner context
│               ├── Territories / Technicians / Routes
│               └── Branding
├── Devices (global inventory)  ← every device across every org (§4 ZTP makes this
│                                 the ZTP registration/reconciliation surface)
├── Staff & Access             ← GET/POST /v1/admin/staff-users, /v1/admin/assignments
│                                 (superadmin manages account managers' books of business)
└── Audit Log                  ← every act-as action, attributed to the staff member
                                 (audit_log_entries, already the third-actor-aware table)
```

**The "book of business" model already supports the org chart you want:** a `superadmin` sees all orgs; an `account_manager` sees only their assigned tenants/partners (`account_assignments`). That's the Cisco MSP hierarchy, already in the schema.

### 3.3 "Navigate and log into all of these" — two options, one recommended

You said you want to *log into* all of these. There are two real ways, and the choice matters:

**Option A — Render-everything (the Meraki model). Recommended.**
Staff never separately "log in" to a tenant or partner portal. They stay authenticated to the Super-Console (corporate Entra ID) and "Manage <Org>" switches the *active org context*. The console calls the admin API, which uses the **already-built** `withStaffActingOnTenant()` handoff — verify the staff member's assignment, then run the *exact same* queries the tenant portal runs, scoped by RLS. Every action is audit-logged to the acting staff member.
- **Pros:** no second credential, no impersonation-token risk, isolation preserved by construction (the fan-out discipline of §3.4), one navigation model, exactly how Meraki/Catalyst work.
- **Cons:** the Super-Console has to *re-render* tenant/partner views (shared component library helps — the three apps can share a UI package).

**Option B — Impersonation / launch-in-context token.**
Staff click "Open portal as this tenant" and the backend mints a scoped, short-lived, audit-tagged token for that tenant/partner surface, opening the real portal in an impersonation session.
- **Pros:** staff see the *literal* customer portal (useful for "reproduce what the customer sees" support).
- **Cons:** a real new security surface (token issuance, blast radius, revocation), and it partly re-introduces the cross-surface coupling the three-tenant separation deliberately avoids. Needs its own threat-model pass.

**Recommendation:** build **Option A** for management (it's mostly UI on top of finished backend), and add **Option B** later, narrowly, only for the "see exactly what the customer sees" support case — gated behind superadmin, time-boxed, and threat-modeled as its own artifact.

### 3.4 The isolation guarantee (finding A5, stated as a rule)

**The Super-Console must never issue a query that reads across tenants directly.** Every "global" view (Fleet Overview, the needs-attention list) is built by **fan-out**: loop the staff member's assigned orgs, open the single-org `withStaffActingOnTenant()` / `withManagerActingOnChannelPartner()` handoff once per org, collect, merge in application code. This is the identical pattern already designed and reasoned-about for the channel-partner-manager cross-account overview (API Specification §4.10, Multi-Tenant Architecture §2.7) — N small individually-scoped queries, not one cross-scope query, so the RLS surface never grows and the three-pass isolation hardening keeps holding. Scale is fine (staff oversee tens–hundreds of orgs, not millions). **This rule is what makes "central management" and "clear separation" coexist rather than conflict.**

---

## 4. Zero-touch provisioning (ZTP) roadmap

Your description is precise and maps cleanly onto Azure IoT primitives: *register a device in the cloud; when the field technician connects it (to the hub, to the internet, or via a third-party cloud), it registers itself and its full configuration is pushed down.* This is literally what **DPS + device twins** are for — but it requires two decisions the current design hasn't made.

### 4.1 The core decision: enrollment groups, not individual enrollments (finding A3)

- **Today (Device & Command §2):** DPS **individual enrollment** — a per-device enrollment record must be pre-created in the cloud before that specific device can provision. Fine at design-partner scale; it is *not* zero-touch at fleet scale (you pre-register each unit).
- **For ZTP:** DPS **enrollment groups** — you register *one* signing CA (or a symmetric group key) with DPS. Any device presenting a leaf cert signed by that CA can self-provision on first connect, with *no* per-device cloud step. That is the "register via cloud" you want: you register the *device family / batch*, not each unit.
- **Real trade-off to weigh (don't default it):** enrollment groups lower friction but raise blast radius — a leaked group CA key lets anyone enroll. Mitigations: per-device disenrollment (DPS supports it; ties into Device & Command §3.2's decommission design), short-lived leaf certs, and keeping the signing CA in Key Vault / an HSM. This is a real security decision for its own threat-model pass, not a config flag.

**Recommendation:** move to **enrollment-group-based provisioning** as the ZTP foundation, keeping individual enrollment as the fallback for one-off / high-value devices.

### 4.2 The unifying concept across all three connection paths

The elegant part: all three of your paths reduce to **one model** — *a "device intent" record created in the cloud, reconciled automatically when the physical device first appears.* The `devices` table already has the `tenant_id = NULL` "unclaimed inventory" concept (Device Onboarding §4); ZTP extends it with **desired configuration** attached to that intent, reconciled on first contact:

| Your path | ZTP "register in cloud" | ZTP "connect in field → auto-register + config push" |
|---|---|---|
| **Direct-to-internet device** (Path A) | Batch registered via enrollment group (§4.1); a `devices` intent row + desired config created | Device powers on at site → self-provisions via DPS → assigned to the right IoT Hub → **device twin desired properties** push its full config down (§4.3). True zero-touch. |
| **Hub-relayed device** (Path B) | Same intent row; the hub already holds device identities | Tech plugs the sensor into the hub; the hub comes online → the *hub's* twin desired properties carry the new device's mapper/asset-link/thresholds → hub's `EdgeConfig` is updated automatically (replaces the manual §8 step in the Windows doc). |
| **Third-party OEM cloud** (Path C) | Intent row is really an *OEM account link* | Tech links the OEM account (or the OEM device appears in the OEM cloud) → PeakLogic's polling integration auto-discovers the new device → reconciles it against the intent row, no DPS involved. |

**One reconciliation engine, three triggers.** That framing is the roadmap's backbone.

### 4.3 Config push = IoT Hub device twins (finding A4)

- **Desired properties** (cloud → device): the device's configuration — reporting interval, which metrics, thresholds/asset-linkage hints, firmware channel. Set at registration, pushed automatically by IoT Hub whenever the device connects. This is the "all configurations are pushed" mechanism, and it's **native — no polling, no custom channel.**
- **Reported properties** (device → cloud): what the device *actually* applied + its live health — feeds the "device-silence / not-yet-configured" states (finding A6).
- This is complementary to Device & Command §4's Direct Methods (which stay for *imperative* commands like a valve shutoff). Twins = *declarative desired state*; Direct Methods = *imperative one-shot action*. Both are real IoT Hub features; the design just hasn't claimed twins yet.

### 4.4 Sequenced ZTP phases

1. **Phase 1 — Cloud registration surface.** In the Super-Console (§3): a "Register devices" flow that creates intent rows + desired-config, individually or by batch/CSV. Still individual-enrollment-backed (no new security decision yet). Delivers "register via cloud" immediately.
2. **Phase 2 — Enrollment groups + twin config push.** Adopt DPS enrollment groups (§4.1, with its threat-model pass) and device-twin desired properties (§4.3). Delivers true zero-touch for direct-connect (Path A) and hub (Path B) devices: connect in field → self-register → config auto-pushed.
3. **Phase 3 — Reconciliation + lifecycle visibility.** The one reconciliation engine (§4.2) across all three triggers, plus device-silence detection (finding A6) surfaced in the console: *registered / provisioning / configured / reporting / silent / decommissioned* as first-class states.
4. **Phase 4 — Path C (OEM cloud-to-cloud) auto-discovery.** Per-OEM integrations that reconcile OEM-cloud device appearance against intent rows — sequenced per real OEM partnership (Device Onboarding §6's existing "design against a named need, not speculatively" discipline).

**Prerequisites, honestly:** all of this sits behind the same real gate everything else does — a real Azure subscription, a real IoT Hub + DPS deployed, and the `infra-azure/iot.bicep` module (not yet written). ZTP is a genuinely great roadmap, but it is roadmap, not near-term, until the foundation is deployed.

---

## 5. Prioritized improvement backlog (the list to review)

Ordered by "unblocks the most / lowest regret," not by effort.

**Tier 1 — real defects / do-before-anything-runs**
1. ~~Fix the `oid`-vs-`sub` identity bug~~ **Done this review** (C1).
2. Fix wildcard CORS in `response.ts` when it's ported (C2).
3. Wire Key Vault network access for the compute subnet (C4) — nothing authenticates to the DB without it.
4. Finish the `backend/` port: `aws-lambda`→`@azure/functions` types, the 4 Cognito-SDK files → Microsoft Graph, and `await` every `get*Auth()` call site (C8).

**Tier 2 — verify-on-first-deploy (cheap to check, expensive to discover late)**
5. Verify Bicep `string()`→JSON for the Key Vault secret (C3), the Postgres private DNS zone name (C7), and the Entra custom-attribute claim names (A7).
6. Place the real Azure Postgres CA bundle (C6) and confirm the TLS chain.
7. Write the remaining Bicep modules: `iot.bicep`, `api.bicep`, `frontend.bicep`, `budget.bicep` (monitoring/alerts) — and run PSRule for Azure against all of them.

**Tier 3 — the central management platform (your Cisco-style vision)**
8. Build the Super-Console frontend (A1) on the **render-everything / act-as** model (§3.3 Option A), with the fan-out isolation rule (§3.4) as a hard architectural constraint.
9. Extract a **shared UI component package** so the three surfaces (super-console, tenant portal, partner portal) render the same Site→Asset→Device views without three copies.
10. (Later, narrow) Add the impersonation/launch-in-context flow (§3.3 Option B) for support "see what the customer sees," as its own threat-modeled artifact.

**Tier 4 — zero-touch provisioning**
11. Phase 1 (cloud registration surface) — deliverable as soon as the Super-Console exists.
12. Phase 2+ (enrollment groups + twin config push) — after the IoT Hub foundation is deployed; the enrollment-group security decision gets its own threat-model pass.

**Cross-cutting**
13. Add a real integration test for the `oid` cross-client identity behavior once a real Entra tenant exists (the C1 bug class is invisible to single-client tests).
14. Consider renaming the `cognito_sub` DB columns to a cloud-neutral `auth_subject` in the next Database Schema touch (Security Architecture §2.5's standing recommendation).

---

## 6. Bottom line

The Azure architecture holds up under review: it's internally consistent, the cloud-specific mechanisms are real and verified against Microsoft docs, and the one genuine code defect (the `oid` identity bug) is fixed. Your two big forward asks are both well-supported by what already exists:

- **The Cisco-style central console** is ~90% a UI build on top of a backend that already models exactly the tenant/data/portal separation you want — provided it follows the fan-out isolation rule instead of inventing a cross-tenant query.
- **Zero-touch provisioning** is a natural fit for Azure's DPS + device-twin primitives, gated on two real decisions (enrollment groups, twin-driven config) and the IoT Hub foundation being deployed.

Neither is near-term buildable until a real Azure subscription exists — the same standing gate the whole fork sits behind — but both are now concrete, sequenced, and grounded in the real architecture rather than aspiration.
