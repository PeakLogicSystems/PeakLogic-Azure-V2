// PeakLogic-Azure — main deployment entry point
//
// Mirrors infra/bin/peaklogic.ts's role for the AWS-native repo: the one
// place a deploy is actually invoked from, and the one place the required
// `stage` parameter is enforced with no default (Infrastructure as Code §3,
// Deployment Architecture §2.1's resource-group-per-stage decision).
//
// Deployed AT RESOURCE GROUP SCOPE, not subscription scope — the resource
// group itself (`peaklogic-{stage}-rg`) is created once, out of band, via
// `az group create` before this template is ever deployed, the same way
// `cdk deploy` never creates the AWS account it deploys into. This is a
// disclosed, deliberate choice, not an oversight — see Infrastructure as
// Code §8 item 1: no infra-azure/ code has been deployed or validated
// against a real Azure subscription yet (no Azure CLI/subscription access
// exists in the environment this was written in).
targetScope = 'resourceGroup'

@allowed(['dev', 'staging', 'prod'])
@description('Required. No default — mirrors infra/bin/peaklogic.ts\'s own "missing flag fails loudly" discipline (Deployment Architecture §2.1). A mistyped or omitted stage must fail the deployment outright, never silently target the wrong environment.')
param stage string

@description('Azure region for every resource this template deploys. Not defaulted to a hardcoded region — the resource group\'s own location is the natural source of truth, but left explicit here so a future multi-region need doesn\'t have to retrofit this parameter.')
param location string = resourceGroup().location

@description('Required. The email address Azure Monitor Action Groups notify on alert — mirrors the AWS-native repo\'s own `-c budgetAlertEmail=`/`-c alarmEmail=` "fail synth loudly if missing" discipline (SOC 2 Control Mapping §4, Infrastructure as Code). No default on purpose.')
param alertEmail string

@description('Admin username for Azure Database for PostgreSQL Flexible Server.')
param dbAdminUsername string = 'peaklogic_admin'

@secure()
@description('Admin password for Azure Database for PostgreSQL Flexible Server, supplied at deploy time (e.g. `az deployment group create ... --parameters dbAdminPassword=$SECRET`). Stored in Key Vault by data.bicep immediately after provisioning — never left in a parameter file or source control. See data.bicep\'s own header comment for why this fork does NOT default to a dev-stage plaintext-bypass path the way the AWS-native repo\'s TD-43 did: that question is explicitly undecided for Azure (Technical Debt Register v1.4) and this template does not assume the answer is "yes."')
param dbAdminPassword string

@description('Monthly cost budget in USD for this stage\'s resource group — mirrors the AWS-native repo\'s own `-c budgetLimitUsd=` convention and its $5 default (project_peaklogic_next_steps memory, "Cost Kill Switch" section, CLAUDE.md).')
param budgetLimitUsd int = 5

@secure()
@description('Shared secret the cost-killswitch webhook must present, e.g. `az deployment group create ... --parameters killswitchSecret=$(openssl rand -hex 32)`. See budget.bicep\'s header comment for why this exists instead of Azure\'s built-in Function-key mechanism.')
param killswitchSecret string

// ── api.bicep pass-throughs — genuinely blank until Entra app-registration
// automation exists. See api.bicep's own param comments for why these are
// safe to leave empty rather than defaulted to something fabricated.
param entraCustomersIssuer string = ''
param entraCustomersJwksUri string = ''
param entraCustomersAudience string = ''
param entraPartnersIssuer string = ''
param entraPartnersJwksUri string = ''
param entraPartnersAudience string = ''
param entraStaffIssuer string = ''
param entraStaffJwksUri string = ''
param entraStaffAudience string = ''
param entraCustomersTenantIdExtProp string = ''
param entraPartnersChannelPartnerIdExtProp string = ''
param entraSelfServicePasswordUrl string = ''
param entraSelfServiceSecurityInfoUrl string = ''
param entraCustomersTenantId string = ''
param entraPartnersTenantId string = ''
param entraCustomersApiSpObjectId string = ''
param entraStaffApiSpObjectId string = ''
param entraCustomersApproleAdmin string = ''
param entraCustomersApproleOperator string = ''
param entraStaffApproleSuperadmin string = ''
param entraStaffApproleAccountManager string = ''
param entraCustomersDeployed bool = false
param entraPartnersDeployed bool = false
param entraCustomersMgmtClientId string = ''
param entraPartnersMgmtClientId string = ''
param corsAllowedOrigin string = ''

// ── Naming convention: stage-suffixed everywhere a resource needs a unique
// name, mirroring Deployment Architecture §2.1's dual discipline —
// resource-group-per-stage provides structural isolation, but several Azure
// resource types (storage accounts, Postgres Flexible Server names, Key
// Vault names) require GLOBAL uniqueness across all of Azure, not just
// uniqueness within this resource group. A stage suffix alone is not
// guaranteed globally unique — `uniqueString(resourceGroup().id)` is mixed
// in for exactly the resource types that need it, not applied uniformly,
// so names stay human-readable where global uniqueness isn't required.
var namePrefix = 'peaklogic-${stage}'
var uniqueSuffix = uniqueString(resourceGroup().id)

module network 'modules/network.bicep' = {
  name: 'network-${stage}'
  params: {
    namePrefix: namePrefix
    location: location
    stage: stage
  }
}

module data 'modules/data.bicep' = {
  name: 'data-${stage}'
  params: {
    namePrefix: namePrefix
    uniqueSuffix: uniqueSuffix
    location: location
    stage: stage
    vnetId: network.outputs.vnetId
    dataSubnetId: network.outputs.dataSubnetId
    computeSubnetId: network.outputs.computeSubnetId
    dbAdminUsername: dbAdminUsername
    dbAdminPassword: dbAdminPassword
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring-${stage}'
  params: {
    namePrefix: namePrefix
    location: location
    stage: stage
    alertEmail: alertEmail
    postgresServerId: data.outputs.postgresServerId
  }
}

module budget 'modules/budget.bicep' = {
  name: 'budget-${stage}'
  params: {
    namePrefix: namePrefix
    uniqueSuffix: uniqueSuffix
    location: location
    stage: stage
    alertEmail: alertEmail
    budgetLimitUsd: budgetLimitUsd
    postgresServerId: data.outputs.postgresServerId
    oncallActionGroupId: monitoring.outputs.actionGroupId
    killswitchSecret: killswitchSecret
  }
}

module iot 'modules/iot.bicep' = {
  name: 'iot-${stage}'
  params: {
    namePrefix: namePrefix
    uniqueSuffix: uniqueSuffix
    location: location
    stage: stage
    keyVaultName: data.outputs.keyVaultName
  }
}

module api 'modules/api.bicep' = {
  name: 'api-${stage}'
  params: {
    namePrefix: namePrefix
    uniqueSuffix: uniqueSuffix
    location: location
    stage: stage
    computeSubnetId: network.outputs.computeSubnetId
    keyVaultName: data.outputs.keyVaultName
    keyVaultUri: data.outputs.keyVaultUri
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    entraCustomersIssuer: entraCustomersIssuer
    entraCustomersJwksUri: entraCustomersJwksUri
    entraCustomersAudience: entraCustomersAudience
    entraPartnersIssuer: entraPartnersIssuer
    entraPartnersJwksUri: entraPartnersJwksUri
    entraPartnersAudience: entraPartnersAudience
    entraStaffIssuer: entraStaffIssuer
    entraStaffJwksUri: entraStaffJwksUri
    entraStaffAudience: entraStaffAudience
    entraCustomersTenantIdExtProp: entraCustomersTenantIdExtProp
    entraPartnersChannelPartnerIdExtProp: entraPartnersChannelPartnerIdExtProp
    entraSelfServicePasswordUrl: entraSelfServicePasswordUrl
    entraSelfServiceSecurityInfoUrl: entraSelfServiceSecurityInfoUrl
    entraCustomersTenantId: entraCustomersTenantId
    entraPartnersTenantId: entraPartnersTenantId
    entraCustomersApiSpObjectId: entraCustomersApiSpObjectId
    entraStaffApiSpObjectId: entraStaffApiSpObjectId
    entraCustomersApproleAdmin: entraCustomersApproleAdmin
    entraCustomersApproleOperator: entraCustomersApproleOperator
    entraStaffApproleSuperadmin: entraStaffApproleSuperadmin
    entraStaffApproleAccountManager: entraStaffApproleAccountManager
    entraCustomersDeployed: entraCustomersDeployed
    entraPartnersDeployed: entraPartnersDeployed
    entraCustomersMgmtClientId: entraCustomersMgmtClientId
    entraPartnersMgmtClientId: entraPartnersMgmtClientId
    iotHubDeployed: true
    iotHubEventHubName: iot.outputs.eventHubName
    corsAllowedOrigin: corsAllowedOrigin
  }
}

module apim 'modules/apim.bicep' = {
  name: 'apim-${stage}'
  params: {
    namePrefix: namePrefix
    uniqueSuffix: uniqueSuffix
    location: location
    stage: stage
    publisherEmail: alertEmail
    functionAppDefaultHostName: api.outputs.functionAppDefaultHostName
  }
}

// Water-Sector Security Hardening Strategy §5 Tier 0.4 (2026-08-01) — closes
// monitoring.bicep's disclosed-gap items 1 and 3 (ingest-rate-zero,
// Function error rate), deployed as its own module specifically to avoid
// the circular dependency documented in ingest-alerts.bicep's own header
// (monitoring's actionGroupId + api's/iot's resource-id outputs, same shape
// budget.bicep already uses for postgresServerId + oncallActionGroupId).
module ingestAlerts 'modules/ingest-alerts.bicep' = {
  name: 'ingest-alerts-${stage}'
  params: {
    namePrefix: namePrefix
    actionGroupId: monitoring.outputs.actionGroupId
    functionAppId: api.outputs.functionAppId
    iotHubId: iot.outputs.iotHubId
  }
}

// ── Not yet written — tracked honestly, not silently omitted ──
// Per Infrastructure as Code §3's planned module structure and §8's open
// items: frontend.bicep (static hosting/CDN, Deployment Architecture §5) is
// the one remaining unwritten module — api.bicep, iot.bicep (both
// 2026-07-31), apim.bicep (2026-07-31, rate limiting only — WAF/Front Door
// deliberately deferred, see apim.bicep's own header), and ingest-alerts.
// bicep (2026-08-01) all now exist, closing those gaps. Adding
// frontend.bicep here as it's written is a one-line change; deliberately
// not stubbed out with an empty placeholder module, which would
// misrepresent partial work as scaffolded. DLQ depth (poison_messages row
// count) still has no Azure Monitor metric to scope to regardless — no
// platform metric exists for a Postgres row count (monitoring.bicep's own
// disclosed-gap item 2, ingest-alerts.bicep's own disclosed-gap item 1).
// CI/CD pipeline (wired 2026-08-01, see cicd-pipeline.md), Entra
// app-registration automation, and the first real deploy remain gated on a
// real Azure subscription existing.

output vnetId string = network.outputs.vnetId
output postgresServerFqdn string = data.outputs.postgresServerFqdn
output apimGatewayUrl string = apim.outputs.apimGatewayUrl
output keyVaultUri string = data.outputs.keyVaultUri
output appInsightsConnectionString string = monitoring.outputs.appInsightsConnectionString
output iotHubName string = iot.outputs.iotHubName
output iotHubHostName string = iot.outputs.iotHubHostName
output dpsName string = iot.outputs.dpsName
output dpsIdScope string = iot.outputs.dpsIdScope
output dpsGlobalEndpoint string = iot.outputs.dpsGlobalEndpoint
output costKillswitchFunctionAppName string = budget.outputs.functionAppName
output apiFunctionAppName string = api.outputs.functionAppName
output apiFunctionAppDefaultHostName string = api.outputs.functionAppDefaultHostName
// Consumed by entra/staff.bicep's apiFunctionAppPrincipalId param — a
// genuine manual hand-off between this deployment and that one (different
// deployment scope, potentially a different tenant) — see that param's own
// comment for why no Bicep mechanism spans both automatically.
output apiFunctionAppPrincipalId string = api.outputs.functionAppPrincipalId
