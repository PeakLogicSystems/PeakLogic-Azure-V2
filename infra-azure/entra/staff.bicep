// Entra app-registration automation — PeakLogic's own corporate/workforce
// Microsoft Entra ID tenant (Administration Console). Sibling of
// customers.bicep/partners.bicep — READ customers.bicep's HEADER FIRST for
// shared reasoning (GA status of the Graph Bicep extension, verified
// passwordCredentials limitation, Microsoft Graph's well-known service
// principal constant).
//
// TWO REAL STRUCTURAL DIFFERENCES FROM customers.bicep/partners.bicep, NOT
// OVERSIGHTS:
//   1. **This tenant is presumed to be the SAME tenant the Azure
//      subscription itself lives in** (Security Architecture §2.0/§2.5's
//      whole point: PeakLogic's own staff already have real accounts in
//      the company's ordinary Microsoft 365/workforce tenant — reusing it
//      is the explicit architectural improvement over the AWS design's
//      fabricated StaffPool). If that assumption is wrong for the actual
//      subscription this ultimately deploys to, this file still deploys
//      correctly (it only ever needs "some Entra ID tenant to register an
//      app in," same as the other two) — the assumption only affects
//      whether a SEPARATE `az login --tenant` is needed before running
//      this file, or whether it's already the default context.
//   2. **No separate "mgmt" app registration/client secret.**
//      backend/shared/identity.ts's credentialFor('staff') deliberately
//      uses DefaultAzureCredential() — api.bicep's Function App's own
//      system-assigned managed identity — not a ClientSecretCredential the
//      way customers/partners need. There is no secret to generate here.
//      Instead, THIS FILE grants User.ReadWrite.All directly to that
//      Function App's managed identity via apiFunctionAppPrincipalId
//      (main.bicep's own output, once populated — see that param's own
//      comment for why this is a required manual hand-off between two
//      genuinely separate deployments, not a Bicep cross-reference).
//
// App Roles here: superadmin, account_manager — Security Architecture
// §2.5, exactly these two, mirroring customers.bicep's admin/operator
// pattern for the same reason (App Roles avoid the 200-member token-
// overage limit security groups have, §2.1).
//
// signInAudience: 'AzureADMyOrg' is not a default here, it's THE decision
// Security Architecture §2.5 names explicitly: "the app registration must
// be configured single-tenant... this is what prevents any other
// organization's Entra ID users from ever being able to sign in" — the
// functional equivalent of Cognito's admin-invited-only/no-self-signup
// posture, achieved by tenant restriction rather than a signup-flow toggle.
//
// Sources: same as customers.bicep's header, plus
//   https://graphpermissions.merill.net/permission/User.ReadWrite.All (re-cited: this file's own appRoleAssignedTo target)

// Water-Sector Security Hardening Strategy §5 Tier 2 item 3 (2026-08-01) —
// same real targetScope/deploy-command mismatch found and fixed in
// customers.bicep, fixed here too — see that file's header for the full
// reasoning and the confirmed Bicep error it would have produced.
targetScope = 'subscription'

extension microsoftGraphV1

@description('Admin Console frontend origin(s) — see customers.bicep\'s spaRedirectUris param.')
param spaRedirectUris array = []

@description('api.bicep\'s Function App managed identity object id (main.bicep\'s apiFunctionAppPrincipalId output, once that deployment has run) — REQUIRED for the User.ReadWrite.All grant below to mean anything. This is a genuine manual hand-off between two separate deployments (infra-azure/main.bicep\'s resource-group-scoped Azure deployment, and this file\'s tenant-scoped Graph deployment) — there is no Bicep mechanism that reaches across both in one operation, the same structural reality customers.bicep/partners.bicep\'s header explains for their own cross-tenant separation. No default: passing an empty/wrong value here would silently grant Graph permissions to nothing, worse than failing loudly.')
param apiFunctionAppPrincipalId string

var superadminRoleId = guid(subscription().id, 'peaklogic-staff-superadmin-role')
var accountManagerRoleId = guid(subscription().id, 'peaklogic-staff-account-manager-role')

resource apiApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-staff-api'
  displayName: 'PeakLogic API (Staff / Administration Console)'
  signInAudience: 'AzureADMyOrg'
  identifierUris: ['api://peaklogic-staff-api']
  appRoles: [
    {
      id: superadminRoleId
      allowedMemberTypes: ['User']
      description: 'Unrestricted administration console access — Security Architecture §2.5.'
      displayName: 'superadmin'
      value: 'superadmin'
      isEnabled: true
    }
    {
      id: accountManagerRoleId
      allowedMemberTypes: ['User']
      description: 'Assignment-scoped ("act as") administration console access — Security Architecture §2.5/Database Schema §4.5.'
      displayName: 'account_manager'
      value: 'account_manager'
      isEnabled: true
    }
  ]
}

resource apiSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: apiApp.appId
}

resource webApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-staff-webapp'
  displayName: 'PeakLogic Administration Console'
  signInAudience: 'AzureADMyOrg' // Single-tenant — Security Architecture §2.5's explicit, named requirement, not this file's default.
  spa: {
    redirectUris: spaRedirectUris
  }
}

resource webSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: webApp.appId
}

resource msGraphSp 'Microsoft.Graph/servicePrincipals@v1.0' existing = {
  appId: '00000003-0000-0000-c000-000000000000'
}

// Grants api.bicep's Function App's OWN managed identity (not a new app
// registration) User.ReadWrite.All — the direct replacement for the
// mgmtApp+client-secret pattern customers.bicep/partners.bicep need,
// possible here specifically because DefaultAzureCredential() already
// resolves to a real principal in this tenant with no secret required.
resource staffGraphPermission 'Microsoft.Graph/appRoleAssignedTo@v1.0' = {
  appRoleId: '741f803b-c850-494e-b5df-cde7c675a1ca' // User.ReadWrite.All, Application permission.
  principalId: apiFunctionAppPrincipalId
  resourceId: msGraphSp.id
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. Deployment ordering dependency: apiFunctionAppPrincipalId must come
//    from a completed infra-azure/main.bicep deploy — this file cannot run
//    meaningfully (the permission grant would target an empty/invalid
//    principal) before that exists. Not enforced by tooling, only by this
//    comment and the param's own required-no-default status.
// 2. No customer-tenant-mapping/act-as UI configuration — this file
//    provisions the App Role graph Database Schema §4.5's
//    withStaffActingOnTenant() depends on; the account_assignments rows
//    themselves are application data, created via the console once it
//    exists, not an Entra/Graph resource.
// 3. MFA / Conditional Access — Security Architecture §2.5 states staff
//    inherit whatever the corporate tenant's OWN workforce policy already
//    enforces, rather than a bespoke policy this file would configure. If
//    the corporate tenant does NOT already require MFA for all staff, that
//    real prerequisite (flagged in §8 of that document) is not satisfied by
//    anything in this file.
// 4. Not validated against a real Entra ID tenant — same standing
//    limitation as customers.bicep/partners.bicep.

output apiAppId string = apiApp.appId
output apiAppIdentifierUri string = apiApp.identifierUris[0]
output apiServicePrincipalObjectId string = apiSp.id
output webAppId string = webApp.appId
output superadminRoleId string = superadminRoleId
output accountManagerRoleId string = accountManagerRoleId
