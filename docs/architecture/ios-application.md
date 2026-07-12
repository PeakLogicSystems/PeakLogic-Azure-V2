# iOS Application

**Product:** PeakView Hub / PeakView 360
**Cloud Platform:** PeakLogicSystems
**Project Codename:** Vantage
**Status:** Draft v1.1 — specification only, no code shipped
**Depends on:** [Security Architecture](security-architecture.md) (Draft v1.2), [API Specification](api-specification.md) (Draft v1.2), [Multi-Tenant Architecture](multi-tenant-architecture.md) (Draft v1.2), [Windows Endpoint Application](windows-endpoint-application.md) (Draft v1.1)
**Last updated:** 2026-07-12 (v1.1 — role-model decisions locked: no PeakLogic-staff login mode ships in this app at all; "Manager" means a new Channel Partner Manager role spanning multiple channel-partner accounts, requiring new backend work sketched in §2.1a)

---

## 0. Ground rules

This document specifies a **new, physically separate application** — an iPhone/iPad client. It does not change `backend/`, `frontend/`, or `infra/`. This app authenticates against exactly **two** of the platform's three real identity pools — tenant `userPool` and `PartnerPool`. **`StaffPool` is out of scope entirely and permanently**: no PeakLogic team member uses this app, in any build, hidden or otherwise (locked decision, §12). This app is strictly for customer telemetry/control and channel-partner setup/management.

**Two real gaps this document must disclose rather than paper over, because they change what "real-time" and "push notifications" can mean today:**

1. **No live push/streaming channel exists for user-facing clients.** The only real-time transport in this system is device-to-cloud MQTT (AWS IoT Core), authenticated by per-device X.509 certs — not accessible to a Cognito-authenticated human session, and not designed for fan-out to many viewers of the same data. Neither the web frontend nor any backend service exposes a WebSocket/streaming API today. §4 designs the iOS app to degrade gracefully via polling now, with a recommended (not yet built) API Gateway WebSocket addition as the real-time upgrade path.
2. **No push-notification device-token registration endpoint exists.** APNs requires the backend to hold a per-user, per-device push token to target notifications. This is new, minimal backend surface — flagged in §9, not assumed.

**A third real gap, found while resolving the role-model decision: the "Channel Partner Manager" role this app needs to support does not exist in the backend at all today.** `channel_partner_users` ties one login to exactly one `channel_partners` row — there is no existing way for a non-PeakLogic user to hold cross-account visibility the way `PeakLogicStaffUser`/`account_assignments` already lets PeakLogic staff do for tenants and channel partners. §2.1a sketches the new table/RLS pattern this requires — real, disclosed, not-yet-built backend work, following the exact same handoff design already proven for the Internal Administration Console rather than inventing a new pattern.

---

## 1. Architecture Overview

### 1.1 What this application is

One iOS app (universal iPhone/iPad binary), **PeakLogic Mobile**, serving whichever of two real identity types a signed-in user actually holds — a tenant `admin`/`operator`, or a channel-partner user, which is itself now two shapes: the existing single-account `partner_admin`/`technician`, or the new cross-account **Channel Partner Manager** (§2.1a). It is a **client of the existing REST API**, nothing more — no local rule evaluation, no local RLS, no shadow copy of tenant logic. Its two jobs: **view** (sites/assets/devices/telemetry/alerts/tickets, matching each pool's existing scoping) and **act** (the subset of writes each role's real backend permissions already allow — acknowledge an alert, update a ticket, confirm a route, whatever `requireRole()`/`requirePartnerRole()` already permit that user to do today).

### 1.2 Component diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          PeakLogic Mobile (iOS)                            │
│                                                                              │
│  ┌────────────────┐        ┌─────────────────────┐                         │
│  │ Authentication   │───────▶│ Session Manager       │                       │
│  │ Layer (Cognito    │       │ (Keychain-backed,     │                       │
│  │ SRP + refresh)     │       │ Face ID/Touch ID gate) │                     │
│  └────────────────┘        └──────────┬────────────┘                       │
│                                          │                                    │
│                                          ▼                                    │
│  ┌────────────────────────────────────────────────────────────────┐         │
│  │ Authorization Layer — resolves the real role from the JWT this     │       │
│  │ session actually holds; gates navigation, UI, and API call sites   │       │
│  └───────────────────────────┬──────────────────────────────────┘         │
│                                 │                                            │
│           ┌─────────────────────┼─────────────────────┐                      │
│           ▼                       ▼                     ▼                     │
│  ┌────────────────┐    ┌──────────────────┐   ┌──────────────────┐            │
│  │ REST API Client   │    │ Telemetry           │   │ Command Dispatch    │      │
│  │ (Cognito-auth'd,   │    │ Ingestion Layer      │   │ Layer (role-gated,   │     │
│  │ certificate-pinned)│    │ — poll now (§4),     │   │ inert where backend   │    │
│  │                     │    │ WebSocket later       │   │ has no endpoint —      │   │
│  └────────┬───────────┘    └──────────┬───────────┘   │ mirrors Windows Edge's  │   │
│           │                             │                │ §0/§6.4 gate)            │  │
│           ▼                             ▼                └──────────┬───────────┘   │
│  ┌────────────────────────────────────────────────────┐             │                │
│  │ Local Caching Layer (Core Data) — read cache + write-  │◀────────────┘                │
│  │ ahead queue for offline command/ack durability          │                              │
│  └───────────────────────────┬────────────────────────┘                                │
│                                 │                                                          │
│                                 ▼                                                          │
│  ┌────────────────────────────────────────────────────────────────┐                       │
│  │ UI Layer (SwiftUI) — role-driven NavigationStack, adaptive iPhone/  │                     │
│  │ iPad layouts, charts/gauges, push-notification deep links            │                    │
│  └────────────────────────────────────────────────────────────────┘                       │
│                                                                                              │
│  Cross-cutting: Configuration Layer (remote flags) · Security Layer (Keychain, Secure       │
│  Enclave, pinning) · Navigation Layer (role/state-driven routing)                            │
└──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │ HTTPS/TLS (Cognito JWT, pinned)
                                              ▼
                                    API Gateway → peaklogic-api Lambda (existing, unchanged)
```

### 1.3 Major components

| Component | Responsibility |
|---|---|
| **Authentication Layer** | Cognito SRP login against the *correct* pool for the account type; refresh-token lifecycle |
| **Session Manager** | Keychain-backed token storage, Face ID/Touch ID re-auth gate, secure logout |
| **Authorization Layer** | Resolves real role from JWT claims/DB-round-trip (pool-dependent, §2.1); the single source every gating decision reads from |
| **Telemetry Ingestion Layer** | Polling now, WebSocket-ready later (§4); never invents client-side alerting |
| **Command Dispatch Layer** | Routes writes through the exact REST endpoints that already enforce role, RLS, and audit — never a local decision |
| **Local Caching Layer** | Core Data read cache + durable outbound write queue |
| **UI Layer** | SwiftUI, adaptive iPhone/iPad, role-driven visibility |
| **Navigation Layer** | `NavigationStack`-based, state/role-driven, deep-link aware |
| **Security Layer** | Keychain, Secure Enclave-backed biometric gate, certificate pinning, encrypted local storage |
| **Configuration Layer** | Remote feature flags (§9), no local override of anything security-relevant |

---

## 2. Role-Based Access + Control

### 2.1 The real role landscape (decided — not the originally-requested four)

| Backend identity pool | Real roles | Resolved from |
|---|---|---|
| Tenant `userPool` | `admin`, `operator` | Cognito `cognito:groups` claim, directly off the JWT |
| `PartnerPool` (channel partner) | `partner_admin`, `technician` | **Not** a JWT claim — resolved server-side per-request from `channel_partner_users.role` (Security Architecture §2.4's deliberate design: the partner pool carries no Cognito groups). |
| `PartnerPool` (channel partner) | **`channel_partner_manager`** — new, §2.1a | Also not a JWT claim — resolved server-side by checking `channel_partner_managers` (new table) when a `channel_partner_users` lookup finds nothing for that `cognito_sub`. |

`StaffPool` does not appear in this table at all — no build of this app, hidden or otherwise, authenticates against it. This is a locked decision (§12), not an open question.

**Locked mapping of the originally-requested vocabulary onto reality:**

- **"Viewer"** — not a distinct backend role anywhere. Every real role above can already read more than a pure viewer would need; a client-side-only "viewer mode" (hide write affordances, still call read endpoints normally) is achievable entirely in the iOS app's UI layer without any backend change.
- **"Technician"** — real and exact for `PartnerPool`. For the tenant pool, `operator` is the closest real equivalent.
- **"Manager" — decided: a Channel Partner Manager.** One person, not employed by PeakLogic, who needs the same administrative capability a `partner_admin` already has (branding, territories, technician management, route confirmation), but across **several independent, otherwise-unrelated `channel_partners` accounts** rather than one — e.g. someone who manages the PeakLogic relationship for multiple separate pool-service franchise locations. Structurally the same shape as the Internal Administration Console's `account_manager`↔`account_assignments` pattern, but for a person outside PeakLogic entirely, which is exactly why it can't just reuse `StaffPool` (§2.1a).
- **"Admin"** — tenant `admin`, `partner_admin`, and the new `channel_partner_manager` are all real, distinct "administrative" roles depending on which side of the platform someone is on. The iOS app never collapses these into one generic "Admin" label — the role badge shown always reflects the real, specific role name.

### 2.1a New backend requirement: Channel Partner Manager (not yet built)

Mirrors the Internal Administration Console's `account_assignments` handoff pattern exactly (Database Schema §4.5, Security Architecture §2.5) — same proven shape, applied to a person who isn't PeakLogic staff:

```sql
-- A channel-partner-side login that is NOT scoped to one channel_partners
-- row the way channel_partner_users is — deliberately a separate table,
-- not a nullable channel_partner_id on the existing one, for the same
-- reason peaklogic_staff_users is its own table rather than a flag on
-- users: the identity/authorization shape is genuinely different (cross-
-- account vs. single-account), not a variant of the same thing.
CREATE TABLE channel_partner_managers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub  TEXT        NOT NULL UNIQUE,   -- same PartnerPool, a second user type within it
  email        TEXT        NOT NULL,
  display_name TEXT,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE channel_partner_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_partner_managers FORCE ROW LEVEL SECURITY;
-- Keyed on cognito_sub for the same reason peaklogic_staff_users' policy
-- is (Database Schema §4.5's "corrected during implementation" fix) --
-- the lookup that resolves this row's own id must be possible BEFORE
-- that id is known.
CREATE POLICY manager_self_lookup ON channel_partner_managers
  USING (cognito_sub = current_setting('app.current_manager_cognito_sub', true));

-- The "book of business" -- independent, unrelated accounts (decided,
-- not the franchise/parent-child alternative that was considered).
CREATE TABLE channel_partner_manager_assignments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id          UUID        NOT NULL REFERENCES channel_partner_managers(id) ON DELETE CASCADE,
  channel_partner_id  UUID        NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  assigned_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by         UUID        NOT NULL,  -- who may grant this is itself open — §12 item 6
  UNIQUE (manager_id, channel_partner_id)
);
```

**Access pattern — reuses `withChannelPartner()`'s existing shape, not a new one:** a `withPartnerManagerActingOnChannelPartner(auth, targetChannelPartnerId, fn)` function, structurally identical to `withStaffActingOnTenant()` (Database Schema §4.5) — verify a `channel_partner_manager_assignments` row (itself RLS-scoped, so a manager session can't even see proof of an assignment they don't hold), then set `app.current_channel_partner_id` and defer entirely to the channel-partner-scoped RLS policies that already exist and are already hardened (territories, routes, `channel_partner_users`, everything `withChannelPartner()` already governs). **Zero new permissive policies on any operational table** — same "why this doesn't repeat the earlier pattern's risk" reasoning already established for the admin console.

**What this app needs to work with this once it ships:** a manager-facing "switch account" picker (reads the manager's own assignment list — a new `GET /v1/partner-manager/assignments`-shape endpoint — and re-authenticates the active `channel_partner_id` context per switch, the same mental model as the Windows hub's per-device identity switching, just for a human instead of a device).

### 2.2 What role maps to, concretely

| Dimension | Mechanism |
|---|---|
| UI visibility | SwiftUI view-level gating, reading `AuthorizationContext.current.role` |
| Available screens | `NavigationDestination` enum filtered by role before being handed to the navigation layer (§7) |
| Available controls | Individual buttons/actions wrapped in a `RoleGate` view modifier (§2.3) |
| Allowed commands | **Never decided client-side alone** — the API call is always attempted with the real JWT; a role that shouldn't be able to do something gets a real `403` from the same `requireRole()`/`requirePartnerRole()` check the web app is subject to. Client-side gating is a UX convenience (don't show a button that will 403), not the security boundary. |

### 2.3 Enforcement at four points

**1. Login — pool selection is explicit, not inferred.** The login screen has exactly two modes (Tenant / Channel Partner — no third mode exists, hidden or otherwise, per §0/§12's locked decision), each hard-wired to its own Cognito User Pool ID / Client ID — there is no "try all pools" auto-detection, since that would mean sending credentials to a pool that was never meant to receive them. The Channel Partner mode covers all three real partner-side shapes (`partner_admin`, `technician`, the new `channel_partner_manager`) — they share one pool and one login screen; which shape a given login turns out to be is resolved after authentication (§2.1), not chosen at the login screen itself.

```swift
enum AuthPool {
    case tenant, partner

    var userPoolId: String {
        switch self {
        case .tenant:  return Config.current.tenantUserPoolId
        case .partner: return Config.current.partnerUserPoolId
        }
    }
    var clientId: String {
        switch self {
        case .tenant:  return Config.current.tenantClientId
        case .partner: return Config.current.partnerClientId
        }
    }
}
```

**2. Navigation — the route table is pre-filtered before the navigation layer ever sees it.**

```swift
struct AuthorizationContext {
    let pool: AuthPool
    let role: String          // "admin" | "operator" | "partner_admin" | "technician" | "channel_partner_manager"
    let tenantId: String?          // present only for .tenant sessions
    let channelPartnerId: String?  // present for .partner sessions with a single account; for a
                                     // channel_partner_manager this is the CURRENTLY ACTIVE account
                                     // out of possibly several (§2.1a's account switcher sets this)
    let managedChannelPartnerIds: [String]  // non-empty only for role == "channel_partner_manager"

    func allows(_ destination: NavigationDestination) -> Bool {
        switch destination {
        case .teamManagement:      return pool == .tenant && role == "admin"
        case .partnerTerritories:  return pool == .partner && ["partner_admin", "channel_partner_manager"].contains(role)
        case .accountSwitcher:     return role == "channel_partner_manager" && managedChannelPartnerIds.count > 1
        case .deviceDetail, .assetDetail, .siteDetail, .alerts, .tickets:
            return true // every real role can read these — RLS/pool scoping already narrows the data itself
        case .controlPanel:        return false // §6.4 — inert everywhere until backend command channel ships
        }
    }
}
```

**3. API call sites — every request carries the real bearer token, unconditionally; the client never fabricates a "this should be allowed" bypass.**

**4. UI rendering — a single reusable modifier, not scattered `if role == ...` checks:**

```swift
struct RoleGate: ViewModifier {
    let allowedWhen: (AuthorizationContext) -> Bool
    @EnvironmentObject var authContext: AuthorizationContextStore

    func body(content: Content) -> some View {
        if allowedWhen(authContext.current) {
            content
        } else {
            EmptyView() // hidden, not disabled-and-visible — matches this platform's existing
                        // "no route handler ever checked for X" failure class (Security Architecture
                        // §2.3's service_partner incident) being avoided on the client side too:
                        // a control that's merely disabled still leaks its existence/label.
        }
    }
}

extension View {
    func requiresRole(_ predicate: @escaping (AuthorizationContext) -> Bool) -> some View {
        modifier(RoleGate(allowedWhen: predicate))
    }
}

// Usage:
Button("Acknowledge") { viewModel.acknowledge(alert) }
    .requiresRole { $0.pool == .tenant && ["admin", "operator"].contains($0.role) }
```

---

## 3. Authentication + Session Management

### 3.1 Authentication flow

Cognito SRP (Secure Remote Password) via AWS Amplify's Swift SDK (`Amplify.Auth.signIn`) — the same auth flow the web frontend uses via `@aws-amplify/ui-react`, not a custom implementation. MFA is `Mfa.REQUIRED` pool-wide server-side (Security Architecture §2.2) for the tenant pool, `Required TOTP` for the partner pool too — the iOS app must implement the TOTP challenge step for both, not just assume password-only.

```swift
enum SessionState { case signedOut, needsMfa(challengeSession: String), signedIn(AuthorizationContext) }

final class SessionManager: ObservableObject {
    @Published private(set) var state: SessionState = .signedOut
    private let keychain: KeychainTokenStore

    func signIn(email: String, password: String, pool: AuthPool) async throws {
        let result = try await Amplify.Auth.signIn(username: email, password: password,
                                                     options: .init(pluginOptions: CognitoPoolOptions(pool: pool)))
        switch result.nextStep {
        case .confirmSignInWithTOTPCode:
            state = .needsMfa(challengeSession: result.sessionId)
        case .done:
            try await completeSignIn(pool: pool)
        default:
            throw AuthError.unexpectedChallenge
        }
    }

    func confirmMfa(code: String, pool: AuthPool) async throws {
        let result = try await Amplify.Auth.confirmSignIn(challengeResponse: code)
        guard case .done = result.nextStep else { throw AuthError.mfaFailed }
        try await completeSignIn(pool: pool)
    }

    private func completeSignIn(pool: AuthPool) async throws {
        let session = try await Amplify.Auth.fetchAuthSession()
        guard let cognitoSession = session as? AuthCognitoTokensProvider,
              let tokens = try? cognitoSession.getCognitoTokens().get() else { throw AuthError.noTokens }

        try keychain.store(refreshToken: tokens.refreshToken, pool: pool) // Keychain, not UserDefaults — §8.1
        let ctx = try AuthorizationContext.resolve(idToken: tokens.idToken, pool: pool) // §2.1 — partner pool needs one extra API round-trip here
        state = .signedIn(ctx)
    }
}
```

### 3.2 Keychain storage

```swift
final class KeychainTokenStore {
    func store(refreshToken: String, pool: AuthPool) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.peaklogic.mobile.refreshtoken.\(pool)",
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly, // never synced to iCloud Keychain, never accessible before first unlock
            kSecValueData as String: Data(refreshToken.utf8),
        ]
        SecItemDelete(query as CFDictionary)
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.storeFailed(status) }
    }
}
```

`kSecAttrAccessibleWhenUnlockedThisDeviceOnly` is the deliberate choice — device-bound (no iCloud Keychain sync, so a refresh token never leaves the physical device it was issued to) and requires the device to have been unlocked at least once since boot, matching the sensitivity of a credential that grants real tenant-data access.

### 3.3 Face ID / Touch ID re-authentication

Two distinct uses, not conflated: (a) app-launch/foreground-resume gate on an *already-valid* session (fast, local, no network call), and (b) a step-up re-auth before a role-gated write action, for roles where that's warranted (technician/admin-class writes).

```swift
final class BiometricGate {
    func unlock(reason: String) async throws {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            throw BiometricError.unavailable(error)
        }
        let success = try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason)
        guard success else { throw BiometricError.failed }
    }
}

// App-resume gate — SessionManager already holds a valid (unexpired) token;
// biometrics here just re-proves physical possession of the device, no
// network round-trip, no re-fetch of tokens.
.onChange(of: scenePhase) { phase in
    if phase == .active, sessionManager.requiresBiometricUnlock {
        Task { try? await biometricGate.unlock(reason: "Unlock PeakLogic") }
    }
}
```

**Session refresh** uses Cognito's `REFRESH_TOKEN_AUTH` flow (same mechanism the Windows Edge app's kiosk identity uses, Windows Endpoint Application §5.2) — access/ID tokens (1h validity per every pool's client config) refreshed transparently ahead of expiry; the refresh token itself (30-day validity) is what Face ID gates access to on relaunch, not re-entered credentials.

**Secure logout:** revoke locally (delete Keychain entries for the active pool, clear in-memory `AuthorizationContext`) and call Cognito's `GlobalSignOut` to invalidate the refresh token server-side too — a device that's lost/stolen after logout can't silently keep using a cached refresh token.

### 3.4 Secure API calls

```swift
final class PeakLogicAPIClient {
    private let session: URLSession // configured with certificate pinning, §8.3
    private let sessionManager: SessionManager

    func get<T: Decodable>(_ path: String) async throws -> T {
        var request = URLRequest(url: Config.current.apiBaseURL.appendingPathComponent(path))
        request.setValue("Bearer \(try await sessionManager.validAccessToken())", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        try Self.validate(response)
        return try JSONDecoder.peakLogic.decode(T.self, from: data)
    }

    static func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        switch http.statusCode {
        case 200..<300: return
        case 401: throw APIError.unauthorized      // triggers a forced re-login, not a silent retry loop
        case 403: throw APIError.forbidden          // real role/RLS denial — surfaced to the user, not swallowed
        default:  throw APIError.server(http.statusCode)
        }
    }
}
```

---

## 4. Telemetry Ingestion (Real-Time)

### 4.1 Recommendation, given the real gap in §0

**Poll `GET /v1/telemetry` on a tiered interval now; design for an API Gateway WebSocket upgrade later.** MQTT-over-WebSocket direct-to-IoT-Core was considered and rejected for the same reason the Windows Edge app didn't take that path for the kiosk UI's data needs (Windows Endpoint Application §5.2's reasoning applies identically here): IoT Core's device policies are scoped to per-device X.509 identity, not per-user Cognito sessions, and there is no existing mechanism for a human's session to subscribe to arbitrary devices' topics — building one would mean either minting a broad, dangerous IAM policy or a new per-user IoT Core identity model neither of which this document is positioned to design as a side effect of a mobile client spec.

**Tiered polling**, driven by what's currently on screen — not one global interval:

| Context | Interval |
|---|---|
| Device Detail screen open, app foregrounded | 10s |
| Dashboard/list screens, app foregrounded | 30s |
| App backgrounded | Suspended — background App Refresh (§4.4) only |

### 4.2 Reconnection / backoff for the *future* WebSocket path

Specified now so the eventual backend addition has a known client contract to build against, not invented at that point under time pressure:

```swift
actor TelemetryStreamClient {
    private var task: URLSessionWebSocketTask?
    private var backoff = BackoffPolicy(initial: .seconds(1), max: .seconds(30), jitter: 0.2)

    func connect(deviceId: String) async {
        while !Task.isCancelled {
            do {
                let request = try await authorizedWebSocketRequest(deviceId: deviceId) // Bearer token in the Sec-WebSocket-Protocol subprotocol header, matching API Gateway WebSocket's supported auth pattern
                task = URLSession.shared.webSocketTask(with: request)
                task?.resume()
                backoff.reset()
                try await receiveLoop()
            } catch {
                let delay = backoff.next()
                try? await Task.sleep(for: delay)
            }
        }
    }

    private func receiveLoop() async throws {
        while let task, task.state == .running {
            let message = try await task.receive()
            if case .string(let json) = message {
                let envelope = try JSONDecoder.peakLogic.decode(TelemetryEnvelope.self, from: Data(json.utf8))
                await TelemetryStore.shared.ingest(envelope)
            }
        }
    }
}
```

### 4.3 Parsing the telemetry envelope (works identically for poll or stream)

```swift
struct TelemetryEnvelope: Decodable {
    let deviceId: String
    let time: Date
    let metric: String
    let value: Double
    let quality: Int // matches telemetry.quality, docs/data-model.sql
}
```

No client-side threshold evaluation, no client-side alert generation — a metric crossing a threshold is exclusively `RULES_BY_CATEGORY`'s (server-side) job; the app only ever *displays* what `/v1/alerts` already reports, never infers its own.

### 4.4 Background App Refresh

`BGAppRefreshTask` registered for a lightweight "check for new critical alerts" poll (not full telemetry — bandwidth/battery discipline) when the app is backgrounded; the primary mechanism for backgrounded alerting is push notifications (§6.5/§9), not background polling, since iOS's background execution budget is not a reliable substitute for real push delivery.

---

## 5. Local Caching + Offline Mode

### 5.1 Core Data model

Two concerns, kept in separate entities: a **read cache** (last-known-good server state, for offline viewing) and a **durable outbound write queue** (for offline command/ack queuing) — mirrors the Windows Edge app's own split between its read-side normalization pipeline and its `outbound_telemetry`/`outbound_api_calls` durable queue (Windows Endpoint Application §4.1), same principle applied client-side.

```
CachedSite, CachedAsset, CachedDevice, CachedAlert, CachedTicket   — read cache, upserted on every successful fetch
PendingWrite { id, method, path, bodyJSON, idempotencyKey, createdAt, attempts, status }  — outbound queue
```

### 5.2 Offline viewing

Every list/detail ViewModel reads through a repository that tries network first, falls back to Core Data on failure, and always upserts Core Data on a successful network response — the UI never has to know which source served a given screen, only whether it's showing possibly-stale data (a visible "Last updated Xm ago" badge when serving from cache, not a silent stale-data presentation).

### 5.3 Offline command queuing — role-gated, and explicitly narrow

**Only idempotent, already-role-permitted writes queue offline** (acknowledge alert, update ticket status/assignee) — matches exactly what §2.2 already established: the client never expands what a role can do, offline or online. **Anything routed through §6's Command Dispatch Layer does not queue offline at all** — per the CC-3.1/CC-4.1 gate this document inherits (§0), there is no live command endpoint to eventually deliver to, so there is nothing meaningful to queue.

```swift
final class WriteQueue {
    private let context: NSManagedObjectContext

    func enqueue(method: String, path: String, body: Encodable) async throws {
        let write = PendingWrite(context: context)
        write.id = UUID()
        write.method = method
        write.path = path
        write.bodyJSON = try JSONEncoder.peakLogic.encode(body)
        write.idempotencyKey = UUID().uuidString // §5.4 — same idempotency-key discipline as the Windows Edge app's REST queue
        write.status = .pending
        try context.save()
    }
}

final class WriteFlusher {
    func flushReadyWrites() async {
        let pending = try? await writeQueue.fetchPending(limit: 50)
        for write in pending ?? [] {
            do {
                try await apiClient.send(method: write.method, path: write.path,
                                          body: write.bodyJSON, idempotencyKey: write.idempotencyKey)
                write.status = .sent
            } catch APIError.forbidden {
                write.status = .failedPermanent // role was revoked/changed since queuing — surface to user, don't retry forever
            } catch {
                write.attempts += 1
                if write.attempts > 20 { write.status = .failedPermanent }
            }
        }
        try? context.save()
    }
}
```

### 5.4 Guaranteed delivery

Same `Idempotency-Key` header pattern as the Windows Edge app (Windows Endpoint Application §4.3) — generated client-side at enqueue time, sent on every retry of the same write, so a flaky-connectivity retry never double-applies an action. `WriteFlusher` runs on network-reachability-change (via `NWPathMonitor`) and on a coarse background timer, not tied to any particular screen being open.

---

## 6. UI/UX Design (SwiftUI)

### 6.1 Screen inventory

Mirrors the tenant web app's information architecture (`frontend/src/pages/*`) and the Windows Edge app's kiosk screens (Windows Endpoint Application §6.2) — the same drill-down shape across every PeakLogic client, deliberately:

```
Login (pool picker → credentials → MFA)
  → Dashboard (role-appropriate KPI cards, recent alerts)
     → Sites → Site Detail (assets at site)
        → Asset Detail (devices on asset)
           → Device Detail (live telemetry, gauges/charts, Control Panel — §6.4, inert)
     → Alerts → (same Device Detail drill-down)
     → Tickets
     → Settings (profile, biometric preference, notification preferences, sign out)
```

Channel-partner sessions additionally see **Territories** and **Routes** (read + route-confirm, matching `/v1/partner/*`'s real endpoint set). A `channel_partner_manager` session (§2.1a) also sees an **Account Switcher** entry point in Settings whenever `managedChannelPartnerIds.count > 1` — everything else in the navigation tree is identical to a single-account `partner_admin`'s, just re-scoped to whichever account is currently active.

### 6.2 Real-time telemetry views

```swift
struct DeviceDetailView: View {
    @StateObject var viewModel: DeviceDetailViewModel

    var body: some View {
        ScrollView {
            LazyVGrid(columns: adaptiveColumns) { // 2 columns on iPhone portrait, up to 4 on iPad — §6.3
                ForEach(viewModel.telemetryChannels) { channel in
                    TelemetryGaugeCard(channel: channel) // current value + unit + a Swift Charts sparkline of the last N samples
                }
            }
            if let trend = viewModel.primaryTrend {
                Chart(trend.samples) {
                    LineMark(x: .value("Time", $0.time), y: .value("Value", $0.value))
                }
                .frame(height: 200)
            }
            ControlPanelSection(device: viewModel.device) // §6.4
        }
        .task { await viewModel.startPolling() }   // §4.1 tiered polling starts on appear
        .onDisappear { viewModel.stopPolling() }
        .refreshable { await viewModel.refreshNow() }
    }
}
```

`Swift Charts` (native, iOS 16+) for trend lines and sparkline gauges — no third-party charting dependency, consistent with keeping the dependency surface of a security-sensitive enterprise client small.

### 6.3 Adaptive layout: iPhone vs. iPad

**One SwiftUI codebase, `NavigationSplitView` as the structural backbone on both, collapsing appropriately:**

```swift
struct RootView: View {
    @Environment(\.horizontalSizeClass) var sizeClass

    var body: some View {
        NavigationSplitView {
            SidebarView() // Dashboard/Sites/Assets/Devices/Alerts/Tickets/Settings
        } content: {
            // iPad: populated list-of-current-section (e.g. Sites list)
            // iPhone: NavigationSplitView auto-collapses this column away entirely — no dead space
            SectionListView()
        } detail: {
            DetailView() // Site/Asset/Device Detail — always present on iPad regular width; pushed via NavigationStack on iPhone
        }
        .navigationSplitViewStyle(sizeClass == .compact ? .automatic : .balanced)
    }
}
```

`NavigationSplitView` is the deliberate choice over hand-rolling `UISplitViewController` bridging or maintaining two separate navigation trees — it natively collapses to the iPhone's single-column push/pop behavior and expands to iPad's two/three-column layout from **one** view hierarchy, which is the actual engineering win here (one navigation state model, §7, not two).

**Landscape on iPhone** uses the same `RootView` — `horizontalSizeClass` still reports `.compact` on most iPhones in landscape (all but the largest Plus/Max models), so the collapsed single-column behavior is correct there too without special-casing orientation directly.

### 6.4 Control panels — same inert gate as the Windows app

```swift
struct ControlPanelSection: View {
    let device: Device
    var body: some View {
        Section("Control") {
            Text("Remote control is not yet available for this device.")
                .foregroundStyle(.secondary)
            // No functioning command UI — Device & Command Security Architecture
            // §5's CC-3.1/CC-4.1 gate applies here exactly as it does to the
            // Windows Edge app's Control Panel (Windows Endpoint Application §6.4).
            // This section exists in the navigation/layout structure now so
            // shipping the real thing later is additive, not a redesign.
        }
        .requiresRole { _ in false } // literally never renders controls until the backend gate lifts — see §12 item 3
    }
}
```

---

## 7. Navigation + State Management

### 7.1 Pattern: MVVM + Combine/async-await, `NavigationStack`/`NavigationSplitView` for routing

Each screen's ViewModel is an `ObservableObject` owning its own network/cache calls (via the repository pattern, §5.2) — no shared "God" view model. Navigation state itself lives in a single `AppRouter`, not scattered across views, so deep links (§9's push-notification handling) and role changes (a token refresh that reveals a *different* role than before — rare, but real if an admin changes a user's group mid-session) can both drive navigation from one place.

```swift
@MainActor
final class AppRouter: ObservableObject {
    @Published var path = NavigationPath()
    @Published var selectedSidebarItem: SidebarItem = .dashboard

    private let authContext: AuthorizationContextStore

    func navigate(to destination: NavigationDestination) {
        guard authContext.current.allows(destination) else {
            // Not silently ignored — the user sees why, matching the API layer's
            // own "surface 403, don't swallow it" discipline (§3.4).
            presentUnauthorizedAlert(for: destination)
            return
        }
        path.append(destination)
    }

    func handleDeepLink(_ url: URL) {
        // e.g. peaklogic://alert/{alertId} from a push notification (§9)
        guard let destination = NavigationDestination(deepLink: url) else { return }
        path = NavigationPath() // reset to a known-good root before pushing, avoids a malformed stack from a stale deep link
        navigate(to: destination)
    }
}
```

### 7.2 Navigation driven by role, device type, telemetry availability

- **Role**: `AppRouter.navigate` is the single choke point (§7.1) — every push-notification deep link, every sidebar tap, every "View device" button funnels through the same `authContext.current.allows(...)` check from §2.3.
- **Device type**: `RootView`'s `NavigationSplitView`/size-class branching (§6.3) — not a separate navigation graph per device type, one graph that renders differently.
- **Telemetry availability**: a device with zero telemetry channels (e.g. `provisioning` status) renders Device Detail's telemetry section as an empty state, not a navigation-level block — the drill-down path itself is always reachable, matching the "drill down from any page to the lowest level" requirement already established for the web app's own Site→Asset→Device navigation.

---

## 8. Security Architecture Alignment

### 8.1 Keychain storage

Refresh tokens (§3.2), biometric-preference flag, and cached role/tenant metadata needed to render UI before the first network call completes — all Keychain, `WhenUnlockedThisDeviceOnly`. **Never** `UserDefaults` for anything token-shaped, even transiently.

### 8.2 Secure Enclave usage

Face ID/Touch ID itself is already Secure-Enclave-backed by the OS (`LAContext`, §3.3) — no direct Secure Enclave key-generation API usage is required for the biometric gate itself. Where the Secure Enclave *is* used directly: an optional device-bound keypair (`kSecAttrTokenID: kSecAttrTokenIDSecureEnclave`) generated at first login, used to sign a device-attestation header on login requests — an additional signal the backend *could* check (not required by anything server-side today, a forward-looking hardening option, not a dependency).

### 8.3 Certificate pinning

```swift
final class PinnedSessionDelegate: NSObject, URLSessionDelegate {
    private let pinnedPublicKeyHashes: Set<String> // SHA-256 of API Gateway's leaf cert's SPKI, rotated via §9's remote config — pinning to a hash the app can update remotely avoids the classic "pin, then cert rotates, app bricks" failure mode

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                     completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard let trust = challenge.protectionSpace.serverTrust,
              let cert = SecTrustCopyCertificateChain(trust)?.first as! SecCertificate?,
              let publicKey = SecCertificateCopyKey(cert),
              let keyData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?,
              pinnedPublicKeyHashes.contains(SHA256.hash(data: keyData).hexString)
        else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
}
```

Pins the **public key**, not the full certificate (survives a cert renewal with the same key) — API Gateway's managed cert here, mirroring the Windows Edge app's equivalent pinning decision for its own REST client (Windows Endpoint Application §5.2 notes API Gateway doesn't need the RDS-style CA-bundle pinning the IoT leg gets, since it's a standard public-CA cert; this app pins anyway as an additional MITM-defense layer appropriate for a device that isn't in a controlled physical environment the way a kiosk is).

### 8.4 Encrypted local storage

Core Data's `NSPersistentStoreDescription.setOption(true, forKey: NSPersistentHistoryTrackingKey)` alone doesn't encrypt at rest — enable **`NSFileProtectionComplete`** on the SQLite store file (Core Data's default file-protection integration via `NSPersistentStoreFileProtectionKey`), so the cache is unreadable while the device is locked, matching the Keychain's own `WhenUnlocked` posture for consistency across every local data surface.

### 8.5 Secure logging

No PII, tokens, or full API response bodies in `os_log`/console output at `default`/`info` levels — structured, redacted logging only (`Logger` with `.private` privacy annotations on anything user- or tenant-identifying):

```swift
Logger.api.info("API call \(path, privacy: .public) returned \(status, privacy: .public)")
Logger.api.debug("Response body: \(body, privacy: .private)") // never .public for body content
```

### 8.6 Hardening checklist

- [ ] `NSAppTransportSecurity` — no exceptions, TLS 1.2+ enforced platform-default
- [ ] Jailbreak/tamper detection (best-effort, not a hard security boundary — document as defense-in-depth only) gates access to cached tenant data on a detected-compromised device
- [ ] Screenshot/screen-recording redaction (`UIScreen.capturedDidChangeNotification`) blurs telemetry/PII views when the device is being recorded or mirrored
- [ ] MDM-deployed builds pin `Config.current` to a build-time-injected, non-user-editable API base URL (no "dev/staging/prod" picker exposed in a production build)
- [ ] App Transport Security + pinning (§8.3) verified against a live MITM-proxy test before each release, not assumed to still hold
- [ ] Biometric fallback (passcode) still requires the device's own passcode — never a PeakLogic-specific PIN as the fallback (avoids a second, weaker credential surface)

---

## 9. Configuration + Remote Feature Flags

### 9.1 Design

A small, versioned, **non-security-relevant** JSON document (mirrors the Windows Edge app's config-sync pattern, Windows Endpoint Application §8.2 — same S3/CloudFront-fronted delivery mechanism, one object per environment rather than per-site since there's no per-device identity to key on here) fetched on launch and cached, with sane hardcoded defaults if the fetch fails — the app must be fully usable with zero remote config present, since remote config is a UX/rollout lever, never a required dependency.

```json
{
  "featureFlags": {
    "swiftChartsTrendView": true,
    "partnerRoutesScreen": true,
    "channelPartnerManagerAccountSwitcher": false
  },
  "polling": {
    "deviceDetailIntervalSeconds": 10,
    "listScreenIntervalSeconds": 30
  },
  "pinnedPublicKeyHashes": ["base64sha256...", "base64sha256..."],
  "minimumSupportedBuild": 42
}
```

### 9.2 What is and isn't remote-configurable

**Never remote-configurable:** which Cognito pool/client IDs the app targets, whether certificate pinning is enforced, whether biometric re-auth is required — these are the actual security boundary and live in the compiled app / MDM app-config only (§9.3), never in a document an attacker who compromised the CDN distribution could edit to weaken them.

**Safely remote-configurable:** feature flags, polling cadence, pinned-hash rotation (additive — new hashes can be added ahead of a cert rotation; old ones only removed after confirming the new cert is live), `minimumSupportedBuild` (a kill-switch forcing an update prompt, not an auto-update — App Store review timing means this must be advisory, not blocking, unless MDM-distributed).

### 9.3 MDM App Configuration (managed app config, not remote JSON)

For MDM-distributed (not App Store) deployments, the tenant-specific `apiBaseURL` and default pool selection are delivered via Apple's **Managed App Configuration** (`com.apple.configuration.managed` dictionary, read via `UserDefaults.standard.dictionary(forKey: "com.apple.configuration.managed")`) at install time — this is how one binary serves many tenants without a per-tenant App Store build, and how a device gets pinned to its correct backend before the user ever sees a pool picker.

---

## 10. Implementation Blueprint

### 10.1 Build sequence

1. **Security Layer skeleton** — Keychain wrapper, biometric gate, pinning delegate. Everything depends on this.
2. **Authentication Layer** — both pool flows (tenant/partner, including the partner pool's `channel_partner_manager` post-auth resolution, §2.1a), MFA challenge handling, session refresh.
3. **REST API Client + Local Caching Layer** — repository pattern wired to Core Data, validated against real dev-stage endpoints for both pools.
4. **UI Layer** — screens per §6.1, built against the now-real data layer (not mocked separately, same discipline the Windows Edge app's own blueprint calls out, Windows Endpoint Application §11.1).
5. **Navigation + Deep Links** — `AppRouter`, then push-notification wiring once §9's backend token-registration endpoint exists (flagged §12 item 4 — this step is blocked on new backend work).
6. **Offline queue + polling tiers** — §5/§4, once the UI has real screens to observe reachability changes against.
7. **MDM packaging + remote config** — last, mirroring the Windows app's own "packaging comes after the app's shape is stable" sequencing.

### 10.2 Recommended project structure

```
PeakLogicMobile/
├── PeakLogicMobile.xcodeproj
├── PeakLogicMobile/
│   ├── App/
│   │   ├── PeakLogicMobileApp.swift
│   │   └── RootView.swift
│   ├── Auth/
│   │   ├── SessionManager.swift
│   │   ├── AuthorizationContext.swift
│   │   ├── KeychainTokenStore.swift
│   │   └── BiometricGate.swift
│   ├── Networking/
│   │   ├── PeakLogicAPIClient.swift
│   │   ├── PinnedSessionDelegate.swift
│   │   └── TelemetryStreamClient.swift
│   ├── Persistence/
│   │   ├── PeakLogicModel.xcdatamodeld
│   │   ├── Repositories/            # one per entity — Sites, Assets, Devices, Alerts, Tickets
│   │   └── WriteQueue.swift
│   ├── Navigation/
│   │   ├── AppRouter.swift
│   │   └── NavigationDestination.swift
│   ├── Features/
│   │   ├── Dashboard/
│   │   ├── Sites/
│   │   ├── Assets/
│   │   ├── Devices/                 # includes ControlPanelSection (§6.4)
│   │   ├── Alerts/
│   │   ├── Tickets/
│   │   ├── Partner/                 # Territories, Routes — .partner pool only
│   │   └── Settings/
│   ├── Configuration/
│   │   ├── RemoteConfig.swift
│   │   └── ManagedAppConfig.swift
│   └── PushNotifications/
│       └── NotificationHandler.swift
└── PeakLogicMobileTests/
    ├── AuthorizationContextTests.swift
    └── WriteQueueTests.swift
```

### 10.3 Example class responsibilities

| Class | Responsibility |
|---|---|
| `SessionManager` | Owns sign-in/refresh/logout across both pools |
| `AuthorizationContext` | The single resolved-role source every gate (§2) reads |
| `AppRouter` | The single navigation choke point (§7.1) — role checks, deep links |
| `PeakLogicAPIClient` | All REST calls, pinned, bearer-authenticated |
| `WriteQueue` / `WriteFlusher` | Offline durability for role-permitted writes only |
| `TelemetryStreamClient` | Poll today; the exact contract a future WebSocket upgrade slots into |
| `RemoteConfig` | Non-security feature flags/polling cadence only |

### 10.4 Representative snippets already shown above

Authentication: §3.1/§3.4 · Telemetry ingestion: §4.2–4.3 · Role-based UI gating: §2.3 · Command dispatch (inert): §6.4 · Offline caching: §5.3 · Navigation: §7.1

---

## 11. Traceability

| Section | Traces to |
|---|---|
| §2.1 | Security Architecture §2.3/§2.4 (the two pools this app uses); §2.1a's Channel Partner Manager traces to the Internal Administration Console's `account_assignments` pattern (Security Architecture §2.5) by analogy, not by reuse |
| §3.1 | Security Architecture §2.2 (MFA required, all pools) |
| §4.1 | Real gap — no streaming API exists; Windows Endpoint Application §5.2's identical reasoning for why device-side MQTT isn't reusable for human sessions |
| §5.3, §6.4 | Device & Command Security Architecture §5 (CC-3.1/CC-4.1 gate) — identical inert posture to Windows Endpoint Application §6.4 |
| §9.3 | New backend surface required — not yet built, §12 item 4 |

---

## 12. Open Questions

**Decided this session (no longer open):**

- ~~The "manager" role has no real backend equivalent~~ — **decided**: a new cross-account Channel Partner Manager role, sketched in §2.1a. What remains open is the *implementation* of §2.1a (item 6 below), not the product decision itself.
- ~~Whether a PeakLogic-staff login mode ships in a customer-facing build~~ — **decided**: no, never, in any build. `StaffPool` is entirely out of scope for this app (§0).

**Still open:**

1. **The Control Panel's activation path (§6.4)** needs its own amendment in lockstep with the Windows Edge app's equivalent (Windows Endpoint Application §12 item 3) the day Device & Command Security Architecture §5's gate lifts — the two clients should not go live with command UI on different schedules without a deliberate reason.
2. **Push notifications require new backend work**: a device-token registration endpoint (e.g. `POST /v1/settings/push-token`), and a place server-side to actually trigger an APNs send when a critical alert fires (most naturally alongside the existing webhook-on-critical-alert path in `backend/ingest/handler.ts`, not a new, separate notification pipeline). Not designed here — flagged as a prerequisite, matching this document's own §0 disclosure discipline.
3. **Real-time telemetry's WebSocket upgrade path (§4.1)** is a recommendation, not a decision — needs its own scoping pass (API Gateway WebSocket + Lambda authorizer cost/complexity vs. the tiered-polling approach's actual observed staleness in practice) before committing engineering time to it.
4. **§2.1a's `channel_partner_manager_assignments` table, `withPartnerManagerActingOnChannelPartner()`, and the account-list/switch endpoints are a sketch, not a shipped design.** Following this project's own discipline, this needs a real Domain Model → Database Schema → Security Architecture → API Specification amendment sequence before implementation, the same sequence the Internal Administration Console went through — not built directly off this sketch.
5. **Who may grant a `channel_partner_manager_assignments` row is undecided** (§2.1a's `assigned_by` column). Candidates: a superadmin only (mirrors how only a superadmin can grant PeakLogic-staff `account_assignments`), or self-service by an existing `partner_admin` who already controls the accounts being granted (lower friction, but means a channel partner can grant cross-account access without PeakLogic's own staff being involved in the decision at all — a real product/trust question, not just a technical one).
6. **Whether a Channel Partner Manager should be able to see combined/aggregate data across their managed accounts** (e.g. one dashboard summing alerts across every account they manage) or must always view one account at a time via the switcher — this document assumes the latter (simpler, reuses `withChannelPartner()`'s existing single-account-at-a-time scoping unchanged) but that's an assumption, not a confirmed requirement.

---

## 13. Review Log

Not yet reviewed — Draft v1.0, first pass. Recommend a dedicated review before implementation begins, focused on: (1) §12 item 1's role-mapping decision, since it's load-bearing for §2's entire gating design; (2) re-verifying §0's "no streaming/push infrastructure exists" claim against the codebase at the time implementation actually starts, in case either has shipped in the interim (e.g. if the Windows Edge app's own §10 fleet-management backend work incidentally produces reusable infrastructure).
