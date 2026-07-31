// API module — Azure Functions compute hosting the real backend/ code
// (backend/api/main.ts's HTTP catch-all, backend/ingest/main.ts's Event Hub
// trigger, backend/jobs/*.main.ts's Timer triggers) — Enterprise Audit
// (2026-07-19) §6 P0 item 1's "Functions hosting" gap, and the piece every
// other not-yet-written module (frontend.bicep) and every disclosed
// follow-up in monitoring.bicep/budget.bicep has been waiting on. iot.bicep
// (IoT Hub + DPS) is written too, same day — see the iotHubDeployed/
// iotHubEventHubName params below for how this module wires to it.
//
// PLAN CHOICE: Flex Consumption (SKU FC1), not classic Consumption (Y1) or
// Premium (EP1) — a real, deliberated decision, not a default:
//   - Postgres (data.bicep) has NO public endpoint — only snet-compute can
//     reach it. Linux classic Consumption CANNOT do virtual network
//     integration at all (verified, Microsoft Learn), so it structurally
//     cannot reach the database. Ruled out.
//   - Premium (EP1) supports VNet integration but bills a dedicated-instance
//     floor (~$170/mo per instance, PAYG US list pricing) regardless of
//     traffic, in every stage including dev — a direct reversal of this
//     project's consistent $0-dev-cost posture (TD-43, 0 NAT gateways for
//     dev, both cost kill switches). Modeled the crossover: Flex
//     Consumption's on-demand billing only exceeds one EP1 instance's flat
//     cost somewhere around 1-12 sustained requests/second, continuously,
//     all month (depending on average function duration) — far beyond this
//     platform's near-term traffic (one pilot facility). Ruled out for now.
//   - Flex Consumption supports VNet integration (Linux) AND true
//     scale-to-zero on-demand billing with a monthly free grant (100,000
//     GB-s + 250,000 executions) — genuinely near-$0 at today's traffic,
//     with a real, deliberately-accepted long-term tradeoff: Microsoft does
//     NOT support in-place migration from Flex Consumption to another plan
//     (verified, Microsoft Learn "Considerations") — moving to
//     Premium/Dedicated later means standing up a new Function App and
//     redeploying, not a SKU change. Accepted because (a) everything here is
//     Bicep-driven, so "new resource + redeploy" is a contained, mechanical
//     operation for this codebase specifically, not a rebuild, and (b) this
//     project's own repeated discipline is "don't build/pay ahead of a
//     named need" (the BACnet/OPC-UA egress server, CMMS vendor adapters,
//     Facility Builder's phased scope all follow this) — paying Premium's
//     floor today, before a single real tenant exists, is that same mistake
//     in infrastructure form. Revisit via real usage data (App Insights,
//     already wired below) approaching the crossover range above, not on a
//     schedule or a guess.
//
// REAL PREREQUISITE, NOT SOMETHING THIS TEMPLATE CAN DO: the `Microsoft.App`
// resource provider must be registered on the target subscription before a
// Flex Consumption app can integrate with a virtual network (`az provider
// register --namespace Microsoft.App`) — a one-time, subscription-level,
// out-of-band step, the same category as domain-stack.ts's Cloudflare
// validation-CNAME precedent (CLAUDE.md).
//
// SINGLE UNVERIFIED ASSUMPTION IN THIS MODULE, FLAGGED HONESTLY: neither of
// the two official Microsoft Flex Consumption Bicep samples checked while
// writing this (Azure-Samples/azure-functions-flex-consumption-samples,
// Azure/azure-quickstart-templates's function-app-flex-managed-identities)
// demonstrates virtual network integration — both are managed-identity/
// getting-started scenarios with no VNet. `properties.virtualNetworkSubnetId`
// below is the long-standing, general Microsoft.Web/sites mechanism for
// regional VNet integration (used by ordinary App Service/Functions plans
// for years), applied here to a Flex Consumption site on the strength of
// Microsoft Learn's prose confirmation that Flex Consumption "supports
// virtual network integration" — but this exact property-on-this-exact-SKU
// combination has not been confirmed against a live deployment or an
// official sample. The single highest-value thing to verify first against
// a real subscription, same "flagged, not silently assumed" discipline as
// every other module in this tree.
//
// Sources consulted while writing this module (2026-07-31):
//   - https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan
//   - https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-how-to
//   - https://github.com/Azure/azure-quickstart-templates/blob/master/quickstarts/microsoft.web/function-app-flex-managed-identities/main.bicep
//   - https://github.com/Azure-Samples/azure-functions-flex-consumption-samples

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

@description('Mixed into the storage account name — must be globally unique across all of Azure, same reasoning as data.bicep\'s Key Vault/Postgres naming.')
param uniqueSuffix string

param location string

@allowed(['dev', 'staging', 'prod'])
param stage string

@description('network.bicep\'s compute subnet — delegated to Microsoft.App/environments (NOT Microsoft.Web/serverFarms; that delegation is for Premium/App Service plans and does not work for Flex Consumption — see network.bicep\'s own note on this fix).')
param computeSubnetId string

@description('data.bicep\'s Key Vault — the Function App\'s managed identity is granted Key Vault Secrets User on it below, so backend/shared/db.ts\'s getCredentialFromKeyVault() (DefaultAzureCredential + KEY_VAULT_URI) works with no stored credential anywhere.')
param keyVaultName string
param keyVaultUri string

@description('monitoring.bicep\'s Application Insights connection string — wired straight into APPLICATIONINSIGHTS_CONNECTION_STRING, the standard Functions app setting.')
param appInsightsConnectionString string

@description('Cost ceiling, not a performance target: caps Flex Consumption\'s scale-out well below its 1,000-instance max, consistent with this project\'s standing "extra layer of surprise-cost defense" posture (both cost kill switches, the budget alerts). Raise deliberately if real load ever approaches it — not preemptively.')
param maximumInstanceCount int = 40

@description('Flex Consumption instance memory size in MB — 2048 is Microsoft\'s documented default/recommended size for most workloads. This is also the exact figure the $/traffic crossover model (project_peaklogic_next_steps memory, "Option C" pricing discussion) was computed against — changing it invalidates that estimate and it should be recomputed.')
param instanceMemoryMB int = 2048

// ── Real, disclosed gap: Entra app-registration automation (audit §6 P0
// item 1's own remaining sub-item) has not been built — these 12 values
// don't exist yet. Left as optional/blank rather than fabricated: an empty
// value here means backend/shared/auth.ts's tenantConfig() throws its own
// existing, deliberate "Missing Entra configuration" error for that tenant
// kind — the code's own "fail loudly, not silently" guard already does the
// right thing with no value supplied. Populate at deploy time once the
// three Entra tenants (customers/partners/staff) and this API's own app
// registration(s) actually exist.
param entraCustomersIssuer string = ''
param entraCustomersJwksUri string = ''
param entraCustomersAudience string = ''
param entraPartnersIssuer string = ''
param entraPartnersJwksUri string = ''
param entraPartnersAudience string = ''
param entraStaffIssuer string = ''
param entraStaffJwksUri string = ''
param entraStaffAudience string = ''
@description('backend/shared/identity.ts\'s custom-extension-attribute names for the Customers/Partners Entra tenants — real names, not guessed, but only known once those tenants\' schema extensions are actually registered.')
param entraCustomersTenantIdExtProp string = ''
param entraPartnersChannelPartnerIdExtProp string = ''
param entraSelfServicePasswordUrl string = ''
param entraSelfServiceSecurityInfoUrl string = ''

// iot.bicep (2026-07-31) now provisions the real IoT Hub + writes its
// ingest connection string to Key Vault as `iot-hub-ingest-connection` —
// see this param's own reasoning. `iotHubDeployed` gates whether the
// Key-Vault-reference app setting below is even emitted: referencing a
// secret that doesn't exist yet (a deploy of api.bicep BEFORE iot.bicep)
// would leave the app setting permanently unresolvable rather than simply
// blank, a worse failure mode than not setting it at all.
@description('Set true once iot.bicep has been deployed to this stage and populated the iot-hub-ingest-connection secret — main.bicep passes this through once both modules exist together. Defaults false so api.bicep alone (before iot.bicep exists) doesn\'t reference a Key Vault secret that isn\'t there.')
param iotHubDeployed bool = false

@description('iot.bicep\'s eventHubEndpoints.events.path output — the real built-in Event Hub entity path (conventionally the IoT Hub\'s own name), NOT the code\'s generic "messages/events" fallback default, which was never reconciled against a real Azure IoT Hub. Blank until iot.bicep exists; backend/ingest/main.ts\'s own `?? \'messages/events\'` fallback applies in the meantime (harmlessly wrong, since there\'s no real Event Hub connection to pair it with yet either).')
param iotHubEventHubName string = ''

@description('backend/shared/response.ts already defaults to \'*\' when unset — left blank here (not hardcoded to a guessed domain) until frontend.bicep/a real Azure-hosted frontend domain exists to scope it to.')
param corsAllowedOrigin string = ''

// Storage account backing both AzureWebJobsStorage (Functions host
// bookkeeping — queues/tables/blobs) and the Flex Consumption deployment
// package container. Identity-based access only (no shared key), matching
// the pattern Microsoft's own managed-identity quickstart uses — a
// deliberately STRONGER posture than budget.bicep's cost-killswitch
// Function, which still uses a listKeys()-embedded connection string
// (flagged there as the one high-confidence listKeys() usage in this repo).
// Reconciling budget.bicep to the same identity-based pattern is real,
// disclosed follow-up work, not done here — out of scope for standing up
// this module.
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: take(toLower(replace('${namePrefix}api${uniqueSuffix}', '-', '')), 24)
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource deploymentBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: deploymentBlobService
  name: 'app-package'
  properties: {
    publicAccess: 'None'
  }
}

resource apiPlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${namePrefix}-api-plan'
  location: location
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true // Linux — Flex Consumption is Linux-only
  }
}

resource apiFunctionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: '${namePrefix}-api'
  location: location
  kind: 'functionapp,linux'
  identity: {
    // System-assigned, matching this repo's existing convention
    // (budget.bicep's cost-killswitch Function) — no client secret ever
    // stored anywhere; the role assignments below are what grant it real
    // access, scoped to just the resources it needs (Key Vault, this
    // storage account), not the resource group.
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: apiPlan.id
    httpsOnly: true
    virtualNetworkSubnetId: computeSubnetId
    siteConfig: {
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storageAccount.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'KEY_VAULT_URI', value: keyVaultUri }
        { name: 'CORS_ALLOWED_ORIGIN', value: corsAllowedOrigin }
        // Feature flags — both real, both documented (CLAUDE.md) to default
        // OFF; set explicitly here rather than relying on the code's own
        // undefined-is-falsy fallback, so a stage's flag state is visible in
        // one place (this deploy config) rather than implicit.
        { name: 'AI_ANALYTICS_ENABLED', value: 'false' }
        { name: 'POLICY_ENGINE_ENABLED', value: 'false' }
        // Entra — see the disclosed-gap comment on the params above.
        { name: 'ENTRA_CUSTOMERS_ISSUER', value: entraCustomersIssuer }
        { name: 'ENTRA_CUSTOMERS_JWKS_URI', value: entraCustomersJwksUri }
        { name: 'ENTRA_CUSTOMERS_AUDIENCE', value: entraCustomersAudience }
        { name: 'ENTRA_PARTNERS_ISSUER', value: entraPartnersIssuer }
        { name: 'ENTRA_PARTNERS_JWKS_URI', value: entraPartnersJwksUri }
        { name: 'ENTRA_PARTNERS_AUDIENCE', value: entraPartnersAudience }
        { name: 'ENTRA_STAFF_ISSUER', value: entraStaffIssuer }
        { name: 'ENTRA_STAFF_JWKS_URI', value: entraStaffJwksUri }
        { name: 'ENTRA_STAFF_AUDIENCE', value: entraStaffAudience }
        { name: 'ENTRA_CUSTOMERS_TENANTID_EXT_PROP', value: entraCustomersTenantIdExtProp }
        { name: 'ENTRA_PARTNERS_CHANNELPARTNERID_EXT_PROP', value: entraPartnersChannelPartnerIdExtProp }
        { name: 'ENTRA_SELF_SERVICE_PASSWORD_URL', value: entraSelfServicePasswordUrl }
        { name: 'ENTRA_SELF_SERVICE_SECURITY_INFO_URL', value: entraSelfServiceSecurityInfoUrl }
        // IoT Hub — see the iotHubDeployed/iotHubEventHubName param
        // comments above. The connection itself is a Key-Vault-reference
        // app setting, not a plain value: the platform resolves it at
        // runtime using this Function App's own managed identity (already
        // granted Key Vault Secrets User below for the DB credential),
        // exactly like an App Service secret reference is meant to work —
        // backend/ingest/main.ts needs no code change, it already just
        // reads IOT_HUB_EVENTHUB_CONNECTION from its environment.
        { name: 'IOT_HUB_EVENTHUB_CONNECTION', value: iotHubDeployed ? '@Microsoft.KeyVault(SecretUri=${keyVaultUri}secrets/iot-hub-ingest-connection/)' : '' }
        { name: 'IOT_HUB_EVENTHUB_NAME', value: iotHubEventHubName }
      ]
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${deploymentContainer.name}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
      runtime: {
        name: 'node'
        // Node 22 — a real, deliberate bump from this repo's existing Node
        // 20 convention (matched the AWS Lambda runtime everywhere else):
        // Flex Consumption's supported Node.js versions are 22 and 24 only,
        // verified via Microsoft Learn — 20 is not offered. Companion fix:
        // backend/package.json's "main" glob (see this commit) now also
        // picks up backend/jobs/*.main.ts, which it previously did not.
        version: '22'
      }
    }
  }
}

// ── Storage RBAC — scoped to just this storage account, not the resource
// group (same least-privilege-at-scope pattern as budget.bicep's Postgres
// Contributor assignment). Three roles, matching Microsoft's own
// managed-identity Flex Consumption sample: Blob Data Owner covers the
// deployment package container + AzureWebJobsStorage's blob needs; Queue/
// Table Data Contributor cover AzureWebJobsStorage's queue/table bookkeeping
// (the Functions host uses both for its own internal state, identity-based
// access needs explicit grants for each data plane, unlike a connection-
// string/key which implicitly has all of them).
var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource storageBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, apiFunctionApp.id, 'BlobDataOwner')
  scope: storageAccount
  properties: {
    principalId: apiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}

resource storageQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, apiFunctionApp.id, 'QueueDataContributor')
  scope: storageAccount
  properties: {
    principalId: apiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRoleId)
  }
}

resource storageTableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, apiFunctionApp.id, 'TableDataContributor')
  scope: storageAccount
  properties: {
    principalId: apiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
  }
}

// ── Key Vault RBAC — "Key Vault Secrets User" (read-only get/list on
// secrets), scoped to just the vault, matching data.bicep's
// enableRbacAuthorization: true. This is what makes
// backend/shared/db.ts's getCredentialFromKeyVault() work with zero stored
// credentials: DefaultAzureCredential resolves to this Function App's own
// managed identity at runtime.
resource existingKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource keyVaultSecretsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(existingKeyVault.id, apiFunctionApp.id, 'KeyVaultSecretsUser')
  scope: existingKeyVault
  properties: {
    principalId: apiFunctionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
  }
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. Virtual network integration on Flex Consumption is unverified against
//    a live deployment — see the header comment. Highest-priority item to
//    check first once a real subscription/first deploy exists.
// 2. Entra values are genuinely blank — Entra app-registration automation
//    is a separate, not-yet-built P0 item (audit §6 P0 item 1). The app's
//    own code already fails loudly (not silently) in their absence — see
//    the params' own comments. IoT Hub connectivity (iot.bicep, 2026-07-31)
//    now exists — see iotHubDeployed/iotHubEventHubName above for how this
//    module wires to it.
// 3. No deployment pipeline wired yet — this module provisions the
//    Function App resource; actually publishing backend/'s built code into
//    the deployment container (func azure functionapp publish / a CI/CD
//    step) is separate, sequenced work (CI/CD pipeline port, its own P0
//    remaining item).
// 4. budget.bicep's cost-killswitch Function still uses a listKeys()-based
//    storage connection string rather than this module's identity-based
//    pattern — a real, disclosed inconsistency, not reconciled here.
// 5. `stage` is accepted (for interface consistency with every other module
//    main.bicep calls uniformly) but not yet used to vary anything here
//    (unlike data.bicep's SKU/HA stage-conditionals) — Flex Consumption's
//    cost model means dev/staging/prod can reasonably share the same plan
//    shape for now; revisit if/when a stage-specific need actually appears
//    (e.g. higher maximumInstanceCount or always-ready instances for prod
//    once real traffic justifies it — not preemptively).

output functionAppName string = apiFunctionApp.name
output functionAppId string = apiFunctionApp.id
output functionAppPrincipalId string = apiFunctionApp.identity.principalId
output functionAppDefaultHostName string = apiFunctionApp.properties.defaultHostName
