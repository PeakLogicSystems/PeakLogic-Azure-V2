// Entra app-registration automation — PeakLogicPartners tenant.
// Sibling of customers.bicep — READ THAT FILE'S HEADER FIRST for shared
// reasoning this file doesn't repeat: why this deploys separately from
// main.bicep (`az login --tenant <PeakLogicPartners-tenant-id>` then
// `az deployment sub create --location <region> --template-file partners.bicep`,
// no resource group), the verified passwordCredentials/client-secret
// limitation (same manual `az ad app credential reset` step, once, for
// mgmtApp below), and the Microsoft Graph well-known service principal
// constant.
//
// THE ONE STRUCTURAL DIFFERENCE FROM customers.bicep, NOT A COPY-PASTE
// OVERSIGHT: only ONE App Role here (`channel_partner_manager`), not two.
// Security Architecture §2.4 decided role resolution for ordinary
// ChannelPartnerUsers comes from the DB (`channel_partner_users.role`) at
// request time, NOT a token claim — App Roles are deliberately NOT used for
// role resolution in this tenant. §2.6 then adds exactly ONE narrow
// exception: `channel_partner_manager`, used purely as an identity-TYPE
// discriminator (this token belongs to a cross-account manager, not an
// ordinary single-account partner user) — not a role in the authorization
// sense, since a manager's authority is always partner_admin-equivalent by
// construction (Domain Model §2.9) once handed off, so there is no second
// role value to distinguish. Provisioning a second App Role here (e.g. a
// naive "admin"/"operator" pair mirroring customers.bicep) would
// contradict this design directly — deliberately not done.
//
// Sources: same as customers.bicep's header.

// Water-Sector Security Hardening Strategy §5 Tier 2 item 3 (2026-08-01) —
// same real targetScope/deploy-command mismatch found and fixed in
// customers.bicep, fixed here too — see that file's header for the full
// reasoning and the confirmed Bicep error it would have produced.
targetScope = 'subscription'

extension microsoftGraphV1

@description('Partner portal frontend origin(s), e.g. ["https://partners.peaklogicsolutions.com"] — see customers.bicep\'s spaRedirectUris param for why an empty array is safe.')
param spaRedirectUris array = []

var managerRoleId = guid(subscription().id, 'peaklogic-partners-manager-role')

resource apiApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-partners-api'
  displayName: 'PeakLogic API (Partners)'
  signInAudience: 'AzureADMyOrg'
  identifierUris: ['api://peaklogic-partners-api']
  appRoles: [
    {
      id: managerRoleId
      allowedMemberTypes: ['User']
      description: 'Identity-type discriminator for a cross-account Channel Partner Manager — Security Architecture §2.6. NOT an authorization role; ordinary ChannelPartnerUser role resolution stays DB-driven (§2.4), deliberately not mirrored here.'
      displayName: 'channel_partner_manager'
      value: 'channel_partner_manager'
      isEnabled: true
    }
  ]
}

resource apiSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: apiApp.appId
}

resource webApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-partners-webapp'
  displayName: 'PeakLogic Partner Portal'
  signInAudience: 'AzureADMyOrg'
  spa: {
    redirectUris: spaRedirectUris
  }
}

resource webSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: webApp.appId
}

resource mgmtApp 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: 'peaklogic-partners-mgmt'
  displayName: 'PeakLogic Backend (Partners Graph Management)'
  signInAudience: 'AzureADMyOrg'
}

resource mgmtSp 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: mgmtApp.appId
}

resource msGraphSp 'Microsoft.Graph/servicePrincipals@v1.0' existing = {
  appId: '00000003-0000-0000-c000-000000000000'
}

resource mgmtGraphPermission 'Microsoft.Graph/appRoleAssignedTo@v1.0' = {
  appRoleId: '741f803b-c850-494e-b5df-cde7c675a1ca' // User.ReadWrite.All, Application permission — see customers.bicep for the verification source.
  principalId: mgmtSp.id
  resourceId: msGraphSp.id
}

// ── Real, disclosed gaps, not silently omitted ──
// Same three items as customers.bicep: (1) mgmtApp's client secret needs
// the same one-time `az ad app credential reset`, (2) the
// channelPartnerId custom attribute + claims-mapping policy
// (ENTRA_PARTNERS_CHANNELPARTNERID_EXT_PROP) isn't built here, same
// "not verified call-by-call" status Security Architecture §2.4 already
// disclosed, (3) not validated against a real tenant. One partners-specific
// addition: Security Architecture §2.6's invite-flow API contract (an
// admin-created user with the channel_partner_manager App Role assigned)
// still needs its own API Specification amendment (§2.6's own disclosed
// gap) — this file provisions the App Role to assign, not the invite
// endpoint itself.

output apiAppId string = apiApp.appId
output apiAppIdentifierUri string = apiApp.identifierUris[0]
output apiServicePrincipalObjectId string = apiSp.id
output webAppId string = webApp.appId
output mgmtAppId string = mgmtApp.appId
output managerRoleId string = managerRoleId
