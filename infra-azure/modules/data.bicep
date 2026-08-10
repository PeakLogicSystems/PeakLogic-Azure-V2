// Data module — Azure equivalent of infra/lib/data-stack.ts
//
// Azure Database for PostgreSQL Flexible Server + Azure Key Vault, mirroring
// the AWS version's stage-conditional HA/SKU/backup decisions (Deployment
// Architecture §3.1) and its RLS-portability confirmation (Database Schema
// §4.7) — the schema/RLS pattern itself needs zero change here, only the
// hosting resource.
//
// A REAL, DELIBERATE DIVERGENCE FROM THE AWS VERSION, NOT AN OVERSIGHT:
// data-stack.ts's `dev` branch bypasses Secrets Manager entirely (a
// plaintext CDK-context password, TD-43) as a disclosed, user-approved
// cost/security trade-off. Technical Debt Register v1.4 explicitly flagged
// that this fork has NOT made the equivalent decision for Azure Key Vault —
// this module does NOT default to a bypass. Every stage, including dev,
// stores its admin credential in Key Vault. If a genuine $0-cost dev posture
// is later decided to require an Azure-side equivalent of TD-43, that is a
// new, deliberate decision to make explicitly (Technical Debt Register's own
// disclosure), not something this module should assume by copying the AWS
// shortcut forward.

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

@description('Mixed into globally-unique resource names (Key Vault, Postgres server) — resource-group-per-stage alone does not guarantee global uniqueness for these resource types (Deployment Architecture §2.1).')
param uniqueSuffix string

param location string

@allowed(['dev', 'staging', 'prod'])
param stage string

param vnetId string
param dataSubnetId string
param computeSubnetId string

param dbAdminUsername string

@secure()
param dbAdminPassword string

@description('Entra ID object ID (GUID) of the user/group/service principal to register as this Postgres server\'s Entra administrator (Azure.PostgreSQL.AAD, architecture-review PSRule pass, 2026-08-09). Defaults to empty — the `pgAadAdministrator` resource below is skipped entirely when empty, same off-by-default convention as `apimSharedSecret`/the `entra*` block in main.bicep: a real value is a genuinely new per-deployment decision (whose Entra identity should administer this database) this template cannot make on its own, not something to fabricate. Setting this does NOT disable password authentication — `passwordAuth` stays `Enabled` below, so `backend/shared/db.ts`\'s existing Key-Vault-password connection path is completely unaffected; this only ADDS Entra ID as an available second authentication method. Azure.PostgreSQL.AADOnly (which requires disabling password auth) is a separate, larger, deliberately NOT-done change — see this file\'s disclosed-gaps list below.')
param pgAadAdminObjectId string = ''

@description('User principal name (or display name for a group/service principal) matching pgAadAdminObjectId — required by the administrators sub-resource\'s own schema alongside the object ID. Ignored when pgAadAdminObjectId is empty.')
param pgAadAdminPrincipalName string = ''

@allowed(['User', 'Group', 'ServicePrincipal'])
@description('Principal type of the Entra administrator identified by pgAadAdminObjectId. Ignored when pgAadAdminObjectId is empty.')
param pgAadAdminPrincipalType string = 'User'

@description('Standard resource tags (project/stage/managedBy) — Azure.Resource.UseTags, architecture-review PSRule remediation 2026-08-09.')
param tags object = {}

var isProd = stage == 'prod'

// Mirrors data-stack.ts's exact instanceType table: t3.micro (Burstable)
// for dev/staging, t3.medium-equivalent (General Purpose) for prod —
// Multi-Tenant Architecture §4's own naming for these tiers, carried
// through here as the actual SKU choice.
var postgresSkuName = isProd ? 'Standard_D2s_v3' : 'Standard_B1ms'
var postgresSkuTier = isProd ? 'GeneralPurpose' : 'Burstable'

// Key Vault name must be globally unique and ≤24 characters — a real Azure
// constraint the AWS version's Secrets Manager naming never had to satisfy
// (Infrastructure as Code §2.1's disclosed global-uniqueness finding).
var keyVaultName = take('${namePrefix}-kv-${uniqueSuffix}', 24)

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    // Azure.KeyVault.PurgeProtect (architecture-review PSRule remediation,
    // 2026-08-09) — irreversible once enabled (a purge-protected vault can
    // never have this turned back off) and, since keyVaultName is derived
    // deterministically from resourceGroup().id (uniqueSuffix), a deleted-
    // and-recreated dev resource group would collide with its own
    // soft-deleted, purge-protected predecessor for up to the 7-day
    // retention window. Prod only, matching postgresDeleteLock's and
    // highAvailability's own isProd-only precedent below: dev/staging keep
    // the ability to tear down and rebuild cleanly, which this project's
    // pre-first-real-deploy phase genuinely still needs.
    enablePurgeProtection: isProd
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      // Real, disclosed gap: this should be scoped to a VNet service
      // endpoint/private endpoint on snet-compute specifically, not left as
      // a subscription-wide "AzureServices" bypass — flagged for the same
      // real-deploy verification pass every other item in this module
      // needs (Infrastructure as Code §8), not resolved further here.
    }
  }
}

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${namePrefix}-pg-${uniqueSuffix}'
  location: location
  tags: tags
  sku: {
    name: postgresSkuName
    tier: postgresSkuTier
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUsername
    administratorLoginPassword: dbAdminPassword
    // Azure.PostgreSQL.AAD (architecture-review PSRule remediation,
    // 2026-08-09) — activeDirectoryAuth: 'Enabled' plus the
    // pgAadAdministrator sub-resource below together satisfy the rule.
    // passwordAuth stays 'Enabled' deliberately: this ADDS Entra ID as an
    // available auth method, it does not replace the existing
    // Key-Vault-password path db.ts already uses. Azure.PostgreSQL.AADOnly
    // (passwordAuth: 'Disabled') is a separate, NOT-done change — see the
    // disclosed-gaps list below for why.
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
      tenantId: subscription().tenantId
    }
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      // Azure.PostgreSQL.GeoRedundantBackup (architecture-review PSRule
      // remediation, 2026-08-09) — prod only, same isProd-only shape as
      // highAvailability below and postgresDeleteLock above: geo-redundant
      // backup roughly doubles backup storage cost, a real expense this
      // project's dev/staging cost-consciousness (TD-43, $0 dev-stage NAT)
      // doesn't ask for on non-production data. Originally 'Disabled' for
      // every stage (Deployment Architecture §3.2's single-region posture)
      // — narrowed to just dev/staging now that prod's actual disaster-
      // recovery posture benefits from it and can absorb the cost.
      geoRedundantBackup: isProd ? 'Enabled' : 'Disabled'
    }
    highAvailability: {
      mode: isProd ? 'ZoneRedundant' : 'Disabled'
      // Zone-redundant HA is the verified Azure-native equivalent of RDS
      // Multi-AZ (Deployment Architecture §3.1) — confirmed via Microsoft's
      // own business-continuity documentation, not assumed to exist by
      // analogy to AWS's feature name alone.
    }
    // Azure.PostgreSQL.MaintenanceWindow (architecture-review PSRule
    // remediation, 2026-08-09) — Sunday 04:00 UTC, a low-traffic placeholder
    // window (this platform has no real traffic pattern yet to tune
    // against, same disclosed-estimate honesty as every other placeholder
    // constant in this codebase, e.g. jobs/silence-detection.ts's reporting
    // intervals). Customer-controlled rather than Azure's own system-chosen
    // window, so a future maintenance event can't collide unpredictably
    // with a real customer's operating hours once one exists.
    maintenanceWindow: {
      customWindow: 'Enabled'
      dayOfWeek: 0
      startHour: 4
      startMinute: 0
    }
    network: {
      delegatedSubnetResourceId: dataSubnetId
      privateDnsZoneArmResourceId: privateDnsZone.id
    }
  }
  dependsOn: [
    privateDnsZoneVnetLink
  ]
}

// Flexible Server with VNet integration requires a private DNS zone for
// name resolution — a real Azure requirement with no AWS RDS equivalent
// (RDS's private-subnet DNS resolution is handled implicitly by the VPC's
// own Route 53 Resolver, no separate zone resource to declare).
resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${namePrefix}.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource privateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${namePrefix}-pg-dns-link'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}

// Deletion protection — the AWS version's `deletionProtection: isProd` maps
// to Azure Resource Manager's resource-lock mechanism (a real, disclosed
// GENERALIZATION over RDS's instance-specific flag, not a narrower
// equivalent — Deployment Architecture §3.1), applied only to prod.
resource postgresDeleteLock 'Microsoft.Authorization/locks@2020-05-01' = if (isProd) {
  name: '${namePrefix}-pg-delete-lock'
  scope: postgresServer
  properties: {
    level: 'CanNotDelete'
    notes: 'Prod database — mirrors AWS RDS deletionProtection (Deployment Architecture §3.1). Prevents accidental az resource delete / deployment rollback from taking out the production database.'
  }
}

// Azure.PostgreSQL.AAD's sub-resource requirement (verified against
// PSRule.Rules.Azure's own rule doc, 2026-08-09: the rule checks for this
// specific sub-resource's existence, not just the authConfig property above)
// — skipped entirely when pgAadAdminObjectId is empty, so a deploy that
// hasn't yet decided who the Entra administrator should be does not fail or
// fabricate one. main.psrule.bicepparam supplies a placeholder value purely
// so PSRule's own Bicep-expansion analysis can resolve this conditional
// resource and evaluate the rule — never a real deployment input, same
// convention as that file's dbAdminPassword/killswitchSecret placeholders.
resource pgAadAdministrator 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = if (!empty(pgAadAdminObjectId)) {
  parent: postgresServer
  name: pgAadAdminObjectId
  properties: {
    principalType: pgAadAdminPrincipalType
    principalName: pgAadAdminPrincipalName
    tenantId: subscription().tenantId
  }
}

// Store the admin credential in Key Vault immediately after provisioning —
// direct analogue of fromGeneratedSecret()'s automatic Secrets Manager
// entry, done explicitly here since Bicep has no equivalent "generate and
// store a credential" convenience construct the way CDK's RDS construct does.
resource dbCredentialSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'postgres-admin-credential'
  properties: {
    value: string({
      username: dbAdminUsername
      password: dbAdminPassword
      host: postgresServer.properties.fullyQualifiedDomainName
      port: 5432
      dbname: 'peaklogic'
    })
  }
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. Automatic credential ROTATION (data-stack.ts's addRotationSingleUser(),
//    30-day schedule) has no equivalent construct here yet. Azure supports
//    Key Vault secret rotation via a scheduled Azure Function + the Key
//    Vault rotation policy feature, but that's real, separate implementation
//    work (a rotation Function, its own VNet/Key-Vault-access wiring) not
//    built in this bounded pass — flagged for follow-up, not faked with a
//    property that doesn't actually rotate anything.
// 2. PostGIS activation (Database Schema §4.7's disclosed `azure.extensions`
//    allowlist requirement) is NOT set here — it requires a
//    `Microsoft.DBforPostgreSQL/flexibleServers/configurations` resource
//    named `azure.extensions` with `postgis` in its value, applied AFTER
//    server creation, then a `CREATE EXTENSION postgis` run against the
//    database itself (which this Bicep template cannot do — that's a
//    migration-tooling concern, `scripts/migrate.ts`'s Azure port, not IaC).
//    Flagged as real, sequenced follow-up work.
// 3. Azure.PostgreSQL.AAD — ✅ Fixed 2026-08-09 (TD-57). authConfig plus the
//    conditional pgAadAdministrator sub-resource above satisfy the rule
//    without touching db.ts's existing password-based connection path.
//    Azure.PostgreSQL.AADOnly (passwordAuth: 'Disabled') is DELIBERATELY
//    still NOT done — it would break every existing connection unless
//    backend/shared/db.ts is also changed to resolve an Entra access token
//    instead of the Key-Vault-stored password this module already
//    provisions (dbCredentialSecret below), which this pass did not
//    attempt blind on the platform's one database. Real, scoped follow-up.

output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output postgresServerId string = postgresServer.id // consumed by monitoring.bicep's metric alerts (Enterprise Audit §6 P0 item 4)
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultName string = keyVault.name
// Consumed by monitoring.bicep's diagnostic setting (Azure.KeyVault.Logs,
// architecture-review PSRule remediation 2026-08-09) — data.bicep runs
// before monitoring.bicep (main.bicep's module order), so the Log
// Analytics workspace the setting streams to doesn't exist yet here; the
// diagnostic setting itself is created from the monitoring module instead,
// which already depends on both this vault and that workspace.
output keyVaultId string = keyVault.id
