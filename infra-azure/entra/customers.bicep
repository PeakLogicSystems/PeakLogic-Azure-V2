// Entra app-registration automation — PeakLogicCustomers tenant.
// Enterprise Audit (2026-07-19) §6 P0 item 1's "Entra app-registration
// automation" gap. Populates the ENTRA_CUSTOMERS_* values api.bicep has
// carried as genuinely-blank params since it was written (2026-07-31) —
// see api.bicep's own param comments for exactly which values these are.
//
// ⚠️ DEPLOYED DIFFERENTLY FROM EVERYTHING IN infra-azure/modules/ — READ
// THIS BEFORE RUNNING ANYTHING. This file (and partners.bicep/staff.bicep,
// its siblings) is NOT wired into main.bicep and cannot be, structurally:
// - **This targets a genuinely different Entra tenant** than the one the
//   main Azure subscription/deployment lives in. Security Architecture §2.0
//   decided PeakLogicCustomers is a SEPARATE Entra External ID (CIAM)
//   tenant — the strongest isolation unit Entra offers — not a resource
//   inside the subscription's own tenant. The Microsoft Graph Bicep
//   extension (GA since 2025-07-29 — verified, not a preview bet)
//   authenticates as whichever identity is running `az deployment`, in
//   whatever tenant THAT identity is currently signed into (`az login
//   --tenant <this-tenant's-id>` first) — it cannot reach into a foreign
//   tenant from a subscription-scoped deployment the way an ARM resource
//   reference can. There is no single unified `az deployment group create
//   -c stage=...` command that could ever cover this and infra-azure/main.bicep
//   together; they are fundamentally separate deployment operations against
//   separate tenants.
// - **No resource group needed** — every resource in this file is a
//   Microsoft Graph directory object (an application, a service principal),
//   not an ARM resource. Deploy at subscription (or tenant) scope:
//     az login --tenant <PeakLogicCustomers-tenant-id>
//     az deployment sub create --location <region> --template-file customers.bicep
//   (a region is still required by `az deployment sub create` even though
//   nothing here is region-specific — an Azure CLI mechanic, not a Graph
//   concept.)
// - The External ID tenant itself must already exist (created manually via
//   the Entra admin center or `az` CIAM tenant-creation flow) before this
//   runs — the same "resource group created out-of-band before Bicep runs"
//   precedent main.bicep's own header already establishes for the main
//   subscription, applied here to tenant creation instead of resource-group
//   creation.
//
// REAL, VERIFIED LIMITATION — CLIENT SECRETS ARE NOT DECLARATIVE HERE:
// Microsoft's own documentation confirms `passwordCredentials` (application
// client secrets) are NOT supported on Microsoft.Graph/applications or
// servicePrincipals in Bicep — only keyCredentials (certificates) are.
// `ENTRA_CUSTOMERS_MGMT_CLIENT_SECRET` (backend/shared/identity.ts's
// `credentialFor()`) therefore cannot be produced by this file. Same
// "script, not IaC" discipline this project already applies to DPS device/
// hub enrollments (individual X.509 enrollment is explicitly NOT built in
// iot.bicep, for the analogous reason that it's a per-instance runtime
// operation, not template-time state) — generating this secret is a
// one-time, disclosed post-deployment step:
//   az ad app credential reset --id <mgmtApp's appId output> --years 2
// Store the result in Key Vault (postgres-admin-credential/iot-hub-ingest-
// connection's own precedent), never in a parameter file. Not automated
// further here — a DeploymentScript resource could call Graph's addPassword
// action instead, but that trades a one-line disclosed manual step for a
// new resource needing its own managed identity/Graph permissions/storage
// account, disproportionate for a value only needed once per tenant.
//
// APP GRAPH: two apps in the tenant, not one, mirroring Microsoft's own
// verified two-app quickstart pattern (a "resource"/API app that owns the
// App Roles, a separate "client" app users actually sign into) rather than
// overloading one app registration with both jobs:
//   - `peaklogic-customers-api` — owns the App Roles (admin, operator,
//     Security Architecture §2.1/§2.3 — exactly these two, per §2.3's
//     explicit instruction not to provision a Field-Service-Partner role
//     here). Its service principal's object id is
//     ENTRA_CUSTOMERS_API_SP_OBJECT_ID (backend/shared/identity.ts's
//     apiServicePrincipalObjectId()); its own Application ID URI is the
//     token audience API.bicep already wires as ENTRA_CUSTOMERS_AUDIENCE.
//   - `peaklogic-customers-webapp` — the public-client SPA users sign into
//     (PKCE, no secret — Security Architecture §2.1's explicit requirement).
//     Its client id isn't consumed by any backend/infra env var (only the
//     frontend's own MSAL.js config needs it) — included for completeness
//     since the tenant needs it to ever work end-to-end, not because
//     backend automation strictly requires it.
// A third app, `peaklogic-customers-mgmt`, exists purely so
// backend/shared/identity.ts's Graph user-provisioning calls (creating
// invited users, assigning App Roles, setting the custom tenantId
// attribute) have application-level Graph permissions independent of any
// end user's own session — granted User.ReadWrite.All (Application
// permission id 741f803b-c850-494e-b5df-cde7c675a1ca, verified via
// Microsoft's own Graph permissions reference) against Microsoft Graph's
// own well-known service principal (appId 00000003-0000-0000-c000-000000000000,
// a public, stable constant, not this deployment's own value).
//
// STILL A REAL, DISCLOSED GAP THIS FILE DOES NOT CLOSE: the custom
// attribute carrying tenantId onto a user (ENTRA_CUSTOMERS_TENANTID_EXT_PROP,
// identity.ts's customAttributeProps()) requires a CIAM "custom
// authentication extension" / custom attribute to be defined via the
// External ID admin experience or its own Graph API surface (Microsoft
// Entra `customAuthenticationExtensions`/`identityUserFlowAttributes` —
// genuinely different Graph resources from applications/servicePrincipals,
// not yet re-derived here) and a claims-mapping policy to surface it into
// the token. Security Architecture §2.4/§8 already flagged this exact
// mechanism as "not verified call-by-call" — still true after this file;
// it defines the APP REGISTRATION graph, not the tenant's user-flow/claims-
// mapping configuration, which is separate, sequenced follow-up work.
//
// Sources consulted while writing this file (2026-07-31):
//   - https://learn.microsoft.com/en-us/graph/templates/bicep/overview-bicep-templates-for-graph (GA status, extension mechanics)
//   - https://github.com/microsoftgraph/msgraph-bicep-types/blob/main/quickstart-templates/application-serviceprincipal-create-client-resource/main.bicep (verified applications/servicePrincipals/appRoles shape)
//   - https://learn.microsoft.com/en-us/graph/templates/bicep/limitations (passwordCredentials NOT supported — verified, not assumed)
//   - https://graphpermissions.merill.net/permission/User.ReadWrite.All (Application permission id 741f803b-c850-494e-b5df-cde7c675a1ca)

// Water-Sector Security Hardening Strategy §5 Tier 2 item 3 (2026-08-01) —
// found and fixed while writing .bicepparam files so PSRule for Azure could
// expand this template for CI analysis: this file's own header comment
// documents `az deployment sub create` as the deploy command, but Bicep's
// targetScope defaults to 'resourceGroup' when not declared — a real,
// confirmed mismatch (Bicep raises exactly this as a hard error: "The
// target scope 'resourceGroup' does not match the deployment scope
// 'subscription'", github.com/Azure/bicep#11137), not a style nit. Would
// have failed the very first real run of the documented deploy command.
// Safe to add: neither this file nor its siblings ever call
// resourceGroup() (verified by grep before adding this).
targetScope = 'subscription'

extension microsoftGraphV1

@description('Frontend origin(s) the customer SPA is served from, e.g. ["https://app.peaklogicsolutions.com"] — required for the SPA app registration\'s redirect URIs. Left empty-array-safe (no redirect URIs registered) until a real Azure-hosted frontend domain exists (frontend.bicep, not yet written) — an app registration with zero redirect URIs is valid, it just can\'t complete a real sign-in yet.')
param spaRedirectUris array = []

// Deterministic App Role ids — guid() needs a seed; subscription() is
// available at this file's subscription-scope deployment even though no
// ARM/subscription resource is actually created. Same "deterministic, not
// random" discipline as every other guid()-named resource in this tree
// (role assignment names elsewhere), applied here so re-running this
// deployment is idempotent rather than minting new role ids each time.
var adminRoleId = guid(subscription().id, 'peaklogic-customers-admin-role')
var operatorRoleId = guid(subscription().id, 'peaklogic-customers-operator-role')

resource apiApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-customers-api'
  displayName: 'PeakLogic API (Customers)'
  signInAudience: 'AzureADMyOrg' // This tenant's own users only — no federation with other organizations, matching admin-invited-only (Security Architecture §2.1).
  identifierUris: ['api://peaklogic-customers-api']
  appRoles: [
    {
      id: adminRoleId
      allowedMemberTypes: ['User']
      description: 'Full tenant administration — Security Architecture §2.1.'
      displayName: 'admin'
      value: 'admin'
      isEnabled: true
    }
    {
      id: operatorRoleId
      allowedMemberTypes: ['User']
      description: 'Day-to-day operator access — Security Architecture §2.1.'
      displayName: 'operator'
      value: 'operator'
      isEnabled: true
    }
  ]
}

resource apiSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: apiApp.appId
}

resource webApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-customers-webapp'
  displayName: 'PeakLogic Web App (Customers)'
  signInAudience: 'AzureADMyOrg'
  spa: {
    redirectUris: spaRedirectUris
  }
}

resource webSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: webApp.appId
}

resource mgmtApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-customers-mgmt'
  displayName: 'PeakLogic Backend (Customers Graph Management)'
  signInAudience: 'AzureADMyOrg'
  // No appRoles, no redirectUris — this app only ever authenticates as
  // itself (client-credentials flow, backend/shared/identity.ts's
  // ClientSecretCredential), never as a user-facing sign-in surface.
}

resource mgmtSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: mgmtApp.appId
}

// Microsoft Graph's own well-known, tenant-independent service principal —
// referenced as EXISTING (this file does not and cannot create it; every
// Entra tenant already has it), not a resource this deployment owns.
resource msGraphSp 'Microsoft.Graph/servicePrincipals@v1.0' existing = {
  appId: '00000003-0000-0000-c000-000000000000'
}

// Grants the management app's service principal the User.ReadWrite.All
// APPLICATION permission on Microsoft Graph — this IS the admin-consent
// grant (creating this resource requires the deploying identity to already
// hold consent-granting rights in this tenant, e.g. Global Administrator or
// Privileged Role Administrator — a real prerequisite, not assumed away).
resource mgmtGraphPermission 'Microsoft.Graph/appRoleAssignedTo@v1.0' = {
  appRoleId: '741f803b-c850-494e-b5df-cde7c675a1ca' // User.ReadWrite.All, Application permission — verified via Microsoft's own Graph permissions reference, not guessed.
  principalId: mgmtSp.id
  resourceId: msGraphSp.id
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. Client secret generation for mgmtApp is NOT done here — see the header
//    comment's "REAL, VERIFIED LIMITATION" section. Run `az ad app
//    credential reset --id <mgmtApp appId output> --years 2` once, after
//    this deployment, and store the result in Key Vault.
// 2. The tenantId custom attribute + claims-mapping policy (surfacing
//    ENTRA_CUSTOMERS_TENANTID_EXT_PROP into the token) is not built here —
//    see the header comment. Real, sequenced follow-up.
// 3. MFA enforcement (Conditional Access, or the newer External MFA
//    mechanism Security Architecture §2.2 flagged as a live-moving target)
//    is not configured by this file — a real, separate Graph/Entra resource
//    surface (conditionalAccessPolicies) not yet re-derived here.
// 4. Not validated against a real Entra External ID tenant — no Azure
//    subscription or tenant exists to deploy this against yet (same
//    standing limitation as every file in infra-azure/). The single
//    highest-value thing to verify first: that `identifierUris` accepts an
//    `api://` value with no GUID/verified-domain segment the way this file
//    assumes — Entra's identifierUri validation rules have real,
//    tenant-configuration-dependent constraints not independently
//    re-verified here.

output apiAppId string = apiApp.appId
output apiAppIdentifierUri string = apiApp.identifierUris[0]
output apiServicePrincipalObjectId string = apiSp.id
output webAppId string = webApp.appId
output mgmtAppId string = mgmtApp.appId
output adminRoleId string = adminRoleId
output operatorRoleId string = operatorRoleId
