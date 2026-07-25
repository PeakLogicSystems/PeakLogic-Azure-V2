# PeakLogic Hub — Enrollment & Identity Design (Q6/Q7 resolution)

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Status:** 🟡 Draft v0.1 (2026-07-25) — resolves `hub-agent-runtime-design.md` §8 **Q6** (first-run auth) and **Q7** (site resolution)
**Depends on:** [Hub Agent Runtime](hub-agent-runtime-design.md) §4–§7 · [Device & Command Security Architecture](device-command-security-architecture.md) §2–§3 (the DPS/IoT-Hub device-identity model this reuses) · [Target Reference Architecture](target-reference-architecture.md) §(DPS/IoT Hub) · [Security Architecture](security-architecture.md) §2 · [Domain Model](domain-model.md) §2.11 · [Database Schema](database-schema.md) §4.9
**Implementation touch-points:** `backend/api/routes/hubs.ts` · `backend/shared/hubs-handler.ts` · `windows-hub/` (`PeakLogicEdge`) · `scripts/` (a hub-provisioning script, the DPS analogue of `provision-devices.ts`)

---

## 0. Thesis

**A PeakLogic Hub authenticates the same way a device does: one X.509 certificate obtained through Azure DPS, and nothing else.** It never holds a human's Entra token, never needs an admin login typed at the kiosk, and never becomes a first-class Entra principal. Registration stays a human-admin action in the cloud (where it belongs); the hub bootstraps its *own* identity from a site-bound enrollment artifact. This reuses the device-identity model already designed and verified in Device & Command Security Architecture §2 — it invents no new credential mechanism — and in doing so it resolves both open questions at once: the hub gets a credential (Q6), and it learns its real `siteId` from the enrollment (Q7), never guessing from a display name.

**Boundary that removes the confusion (load-bearing):** a *hub identity* (an X.509 device cert, this doc) is not an *operator identity* (a human Entra user signing into PeakView360). The PeakView360 offline-operator sign-in (cached short-lived Entra token, PeakView360 §3.4) is a separate path and is out of scope here. Q6 is strictly about the hub's own machine identity.

---

## 1. The problem, stated precisely

- `POST /v1/hubs` is gated by `getAuth` + `requireRole('admin')` (`backend/shared/auth.ts`) — a **PeakLogicCustomers Entra user** action. The three API auth surfaces (customers/partners/staff) are all *human* identities; there is no device/machine token surface.
- A bare, first-run hub therefore has **no token** to call that endpoint, and **no real `siteId`** — the setup form collects a friendly *site name*. `SetupPage` correctly defers today (`HubCommissioning.Plan` → `DeferLocalOnly`).
- Meanwhile devices already have a coherent Azure identity story: **individual X.509 DPS enrollment → one IoT Hub device identity** (Device & Command Security §2), revocable by dual-disable (§3.2).

**The resolution is to stop treating the hub as an API *user* and treat it as an IoT Hub *device*.** It is, physically, edge gateway hardware — the device model fits it exactly.

## 2. What already exists to build on

- **Device-identity model (designed, verified against Microsoft docs, not yet implemented):** individual X.509 DPS enrollment; leaf-cert **Subject CN = serial** becomes the DPS registration ID (≤64 chars, `PLG-XXXX` fits); mutual TLS to IoT Hub; **twin desired-properties push config down** (Target Reference Architecture); revocation = disable device identity **and** disable DPS enrollment (§3.2).
- **`hubs` table (shipped, migration `1784142000000`):** `hardware_serial` (the cert-CN source), `status ∈ {online, offline, provisioning}`, `last_seen_at`, `agent_version`, `peakassist_content_version`, tenant-scoped RLS. A hub already *starts* `provisioning` — this design gives that state its real meaning.
- **Built handler logic (tested):** `registerHub`, `recordHeartbeat` (COALESCE-safe), `syncForHub`, and the silence sweep. **These are reused unchanged** — only the *trigger* in front of `recordHeartbeat`/`syncForHub` changes (§5).
- **Provisioning-package precedent:** `windows-endpoint-application.md` §8.3 + `EdgeConfig`/`SeedRefreshTokenAsync` already assume a "provisioning package bootstrap" — the natural carrier for cert material.

## 3. The two-phase commissioning flow (the design)

### Phase 1 — Cloud registration (human admin, in the console)
A tenant admin registers the hub — the existing admin-gated `POST /v1/hubs` — picking a **real site** (`siteId`) from their own sites. This one action:
1. Writes the `hubs` row (`status = 'provisioning'`) — already built.
2. Provisions the hub's **DPS individual enrollment** and generates its **X.509 leaf cert** (CN = the hub serial) — the hub-side analogue of `provision-devices.ts`, run cloud-side/by script.
3. Mints a **site-bound enrollment artifact**: either the cert material itself (for a provisioning package) or a short-lived, single-use **claim code** that maps to `{hubId, siteId, tenantId}`.

Because a human admin does this from an authenticated console session, **the admin-gating is satisfied by the right actor** — the hub never needs admin rights. This is why the endpoint stays admin-gated and correct as-built.

### Phase 2 — Field bootstrap (technician, at the hub)
Two options; recommend **A**, keep **B** as the lower-touch alternative:

- **A. Provisioning package (recommended).** Cert material + backend/DPS coordinates ship on the hub (installer/USB, §8.3). The technician runs setup; the hub reads its cert, self-provisions via DPS, and is assigned to its IoT Hub. **No secret is typed or transmitted at the kiosk.** Highest security, mirrors the per-device provisioning shape.
- **B. Claim-code exchange (lower-touch).** The technician types the short-lived claim code into the existing setup field; the hub calls a **new, code-gated enrollment endpoint** (`POST /v1/hubs/enroll`, unauthenticated *except* by the one-time code, TLS-only, single-use, rate-limited, short TTL). The endpoint returns the hub's `hubId`, real `siteId`, and a DPS-attestable credential (symmetric key or a just-issued leaf cert). Lower friction, no USB — but the claim code is a bearer secret in transit, so **this option needs its own threat-model pass** (same treatment enrollment *groups* got in Target Reference Architecture; do not ship it as a config flag).

Either option ends with the hub holding its own cert, its `hubId`, and its real `siteId` — persisted to `SiteIdentity.HubId`/`SiteId` (the field wired in §7.1). **Q7 dissolves:** the site is bound by the admin at registration and delivered by enrollment, never inferred from a name.

## 4. Hub runtime identity — one credential

After Phase 2 the hub authenticates **only** with its X.509 cert:
- **Telemetry:** device-to-cloud over **IoT Hub MQTT** (mutual TLS). This also settles Runtime-design §5/Q1 in favour of **IoT Hub MQTT** — the hub is an IoT Hub identity that relays its own health and its bridged devices' normalized telemetry.
- **No Entra token, ever, for the hub's own operation.** The AWS-era `BackendAuthClient` (Cognito refresh-token flow) is **not needed for hub identity** and should be retired from that path — a concrete piece of the Runtime-design §5 AWS→Azure reconciliation debt, resolved here for the hub. (Operator sign-in for PeakView360 is the separate Entra path, §0 boundary.)

## 5. Heartbeat & PeakAssist-sync over the twin (reconciling the built HTTP endpoints)

The hub can't present a human Entra token, so the **hub-facing** heartbeat/sync **HTTP** endpoints (built under `getAuth`) don't fit the hub as-authored. The identity model makes the **device twin** the natural channel, and the built handler logic is reused behind it:

| Concern | Built (HTTP, hub-facing) | Target (twin-native) | Handler reuse |
|---|---|---|---|
| Heartbeat | `POST /v1/hubs/{hubId}/heartbeat` | Twin **reported properties** (`agentVersion`, `peakassistContentVersion`) + IoT Hub **connection-state** events (`DeviceConnected`/`Disconnected` via Event Grid) | `recordHeartbeat` runs behind an Event Grid/timer trigger instead of HTTP — **logic unchanged** |
| PeakAssist target | `GET /v1/hubs/{hubId}/peakassist-sync` (hub polls) | Twin **desired properties** set the target bundle version; hub reads desired, pulls bundle, reports installed version back | `syncForHub` computes the target the same way — **logic unchanged** |
| Telemetry | (MQTT publish, AWS-era) | IoT Hub D2C MQTT | durable queue unchanged (transport-agnostic) |

**The built HTTP `hubs` routes are retained as an admin/console read surface** (an admin viewing hub fleet health in the super console) — they are not wasted; they just stop being the hub's *own* write path. This is the honest consequence of settling identity **after** the endpoints were built: the pure handler logic was the durable asset (why it was built separate from the HTTP wiring), and it survives the re-fronting intact.

> Decision point flagged, not hidden: an alternative (**Option B-HTTP**) keeps the hub-facing HTTP endpoints and authenticates them by the hub's **leaf cert at APIM/Front Door (mTLS), CN→hubId** — no Entra, no twin. Viable and reuses the endpoints directly. Recommendation is still **twin-native for heartbeat/sync**: connection-state heartbeat is essentially free and more reliable than a polling call, and desired-properties is the platform's own config-push channel (Target Reference Architecture already commits to it for devices). Pick one before building Runtime §7.2/§7.3.

## 6. Revocation & lifecycle (a hub is revocable exactly like a device)

- **Revoke a hub:** disable its IoT Hub **device identity** *and* disable its **DPS enrollment** — the dual-control from Device & Command Security §3.2, applied unchanged. Disabling (not deleting) preserves the twin/telemetry history for forensics.
- **Claim-code hygiene (Option B):** single-use, short TTL, rate-limited, invalidated on first successful enrollment; a `hubs` row that never completes Phase 2 stays `provisioning` and is visible as such.
- **Cert rotation:** inherits the same unresolved rotation question devices have (Device & Command Security §3.3) — DPS's "roll certificates" capability applies; left to Security Architecture, not solved here.

## 7. Schema & endpoint implications (design-stage, not built here)

- **`hubs` columns to add** for enrollment state (a small migration, not written in this pass): `iot_device_id` (defaults to the serial/CN), `dps_registration_id`, `enrolled_at`, and — for Option B — `claim_code_hash` + `claim_code_expires_at` (never store the raw code). `hardware_serial` already exists as the CN source.
- **New endpoint (Option B only):** `POST /v1/hubs/enroll` — code-gated, unauthenticated-except-by-code, single-use. Needs its own threat-model pass (§3B).
- **`POST /v1/hubs` extension:** on register, additionally trigger DPS-enrollment + cert generation + artifact minting (Phase 1.2/1.3). The DB-write half is built; the DPS/cert half is the hub analogue of `provision-devices.ts` (unbuilt, no Azure subscription).

## 8. Honesty ledger (real vs. design)

- **Reuses, doesn't invent:** the entire identity mechanism is Device & Command Security §2's already-designed DPS/IoT-Hub model. This doc extends it to the hub and defines the *commissioning choreography* around it.
- **Built and unaffected:** `hubs` table, `registerHub`/`recordHeartbeat`/`syncForHub` handler logic, the silence sweep, the §7.1 `RegisterHubAsync`/`HubCommissioning`/`HubId` client work.
- **Design-stage (not built):** DPS hub-enrollment + cert generation (the `provision-devices.ts` hub analogue), the twin reported/desired wiring on both sides, the Option-B enrollment endpoint, and the `hubs` schema additions. **None of it has run against a real Azure subscription or DPS instance** — same standing caveat as all Azure-track design here (Device & Command Security §8.7).
- **Reconciliation resolved for the hub:** the AWS-era Cognito `BackendAuthClient` is retired from the hub-identity path (§4); the hub-facing HTTP heartbeat/sync endpoints are re-fronted to twin-native with handler logic reused (§5).
- **Deliberately out of scope:** PeakView360 operator (human) sign-in and its offline-credential cache (§0 boundary); safety-rated control (never the hub's role).

## 9. Open decisions (down-scoped from Q6/Q7 to concrete choices)

- **D1:** Phase-2 bootstrap — provisioning package (A, recommended) vs. claim-code exchange (B). B unblocks lowest-touch field install but requires a threat-model pass first.
- **D2:** heartbeat/sync channel — twin-native (recommended) vs. mTLS-HTTP (Option B-HTTP). Blocks Runtime §7.2/§7.3.
- **D3:** individual vs. group DPS enrollment for hubs — individual (recommended, mirrors the device decision at design-partner scale); revisit at fleet scale (Device & Command Security §8.8).
- **D4:** exact `hubs` schema additions (§7) — finalize with the migration when Azure device-provisioning code is first written.

## 10. Revision history

| Version | Date | Change |
|---|---|---|
| Draft v0.1 | 2026-07-25 | Resolves Runtime-design Q6 (first-run auth) and Q7 (site resolution) by modelling the hub as an X.509/DPS IoT Hub device (reusing Device & Command Security §2), with two-phase commissioning (admin cloud-registration + field bootstrap), twin-native heartbeat/sync reconciling the built HTTP endpoints (handler logic reused), and dual-disable revocation. Settles Runtime §5/Q1 toward IoT Hub MQTT; retires the AWS-era Cognito path from hub identity. Schema/endpoint additions and four decisions (D1–D4) flagged design-stage. |
