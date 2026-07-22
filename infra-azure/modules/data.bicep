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
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
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
  sku: {
    name: postgresSkuName
    tier: postgresSkuTier
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUsername
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
      // Single-region posture, matching the AWS version's own deliberate
      // choice (Deployment Architecture §3.2) — geo-redundant backup is a
      // real, named Azure option (~1hr RPO) not adopted here, consistent
      // with that decision, not silently different from it.
    }
    highAvailability: {
      mode: isProd ? 'ZoneRedundant' : 'Disabled'
      // Zone-redundant HA is the verified Azure-native equivalent of RDS
      // Multi-AZ (Deployment Architecture §3.1) — confirmed via Microsoft's
      // own business-continuity documentation, not assumed to exist by
      // analogy to AWS's feature name alone.
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

output postgresServerFqdn string = postgresServer.properties.fullyQualifiedDomainName
output postgresServerId string = postgresServer.id // consumed by monitoring.bicep's metric alerts (Enterprise Audit §6 P0 item 4)
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultName string = keyVault.name
