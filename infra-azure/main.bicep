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

// ── Not yet written — tracked honestly, not silently omitted ──
// Per Infrastructure as Code §3's planned module structure and §8's open
// items: api.bicep (Azure Functions compute), iot.bicep (IoT Hub + DPS,
// Device & Command Security Architecture §2), frontend.bicep (static
// hosting/CDN, Deployment Architecture §5), budget.bicep (Azure Monitor
// budget + action group, SOC 2 Control Mapping §4's Azure Monitor Alerts
// design) all remain real, sequenced follow-up work — this entry point
// wires up only the two foundational modules (network, data) this session's
// bounded implementation pass covers. Adding each module here as it's
// written is a one-line change; deliberately not stubbed out with empty
// placeholder modules, which would misrepresent partial work as scaffolded.

output vnetId string = network.outputs.vnetId
output postgresServerFqdn string = data.outputs.postgresServerFqdn
output keyVaultUri string = data.outputs.keyVaultUri
