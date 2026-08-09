// Budget module — the Azure equivalent of the AWS side's Budget Actions
// RDS auto-stop kill switch (infra/lib/budget-stack.ts,
// project_peaklogic_azure_cost_findings memory: "Azure Cost Management
// budgets are alert-only... replicating the same protection requires
// hand-building custom automation"). This is that automation.
//
// 50% / 80% / 90% / 100%, deliberately graduated (architecture-review
// Gap 4/ADR-003, added 2026-08-09 — the previous binary 50/80/100 shape
// meant a telemetry spike could shut off the very production database
// serving live alarms, which is itself an availability failure the
// platform would have deliberately introduced): 50%/80% are email-only
// early warnings (reusing monitoring.bicep's existing on-call Action
// Group); 90% invokes a SEPARATE, much gentler Function that sets a Key
// Vault flag (cost-throttle-active) for budget-conscious background
// workloads to check and skip themselves — it stops nothing; 100% invokes
// the dedicated, narrowly-scoped Function that stops the Postgres Flexible
// Server. THREE separate Action Groups are required, not one: an Action
// Group fires every receiver it has whenever ANY alert references it, so
// if the stop-function receiver lived on the SAME action group as
// monitoring.bicep's health alerts (CPU/storage/connections), a mere CPU
// spike would ALSO stop the database — clearly wrong; the same reasoning
// is why the 90% throttle receiver needs its own group separate from both.
//
// NOT VALIDATED AGAINST A REAL SUBSCRIPTION (no Azure CLI/subscription
// access in this environment) — same disclosed limitation as every other
// file in infra-azure/. The single piece of this module most worth
// double-checking against a live deployment: the exact
// Microsoft.Consumption/budgets notification schema and whether
// thresholdType 'Actual' (not 'Forecasted') behaves as expected for a
// resource-group-scoped budget.
//
// PROD DOES NOT DEPLOY THE AUTOMATED ACTIONS (added 2026-08-09, user
// decision) — the Function App, both role assignments, and both the
// throttle and kill-switch Action Groups below are all `if (!isProd)`.
// An unattended mechanism able to stop the production database is itself
// an availability risk on the one environment where that risk is least
// acceptable — prod is closely enough watched via the same email alerts
// dev/staging get at 50%/80% without needing an automated action wired to
// it. Prod still gets a real, four-threshold budget (50/80/90/100%, see
// the `budget` resource below) — it just routes every threshold to email
// only, which is exactly what native Azure Cost Management already
// provides for free. `killswitchSecret` stays a required deploy-time
// input for all three stages for consistency; for prod it is simply
// inert — no resource in this module references it.
//
// AUTH DESIGN NOTE (see ops/cost-killswitch/src/main.ts's own header
// comment for the full reasoning): the webhook that reaches the stop
// function carries a shared secret as a query-string parameter, not
// Azure's built-in Function-key mechanism — chosen specifically because
// getting Bicep's listKeys()-on-host-default expression right, unverified,
// felt like the wrong thing to bet an unattended safety mechanism on. A
// secret we generate and can fully unit-test (auth.ts) is verifiable
// end-to-end without a subscription; a function key retrieved via an
// unvalidated ARM expression is not.

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

@description('Mixed into the Function App\'s storage account name — must be globally unique across all of Azure, same reasoning as data.bicep\'s Key Vault/Postgres naming.')
param uniqueSuffix string

param location string

@allowed(['dev', 'staging', 'prod'])
param stage string

@description('Required — mirrors main.bicep\'s own "fail synth loudly if missing" discipline. Notified by the killswitch Action Group\'s email receiver AND, indirectly, by monitoring.bicep\'s existing on-call Action Group reused for the 50%/80% warnings.')
param alertEmail string

@description('Monthly cost budget in USD for this stage\'s resource group. Mirrors the AWS side\'s `-c budgetLimitUsd=` convention and its $5 default.')
param budgetLimitUsd int = 5

@description('Resource ID of the Postgres Flexible Server this kill switch protects (data.bicep\'s postgresServerId output).')
param postgresServerId string

@description('monitoring.bicep\'s existing on-call Action Group — reused for the 50%/80% email-only warnings so a second "just email" Action Group isn\'t provisioned redundantly.')
param oncallActionGroupId string

@description('data.bicep\'s Key Vault name — the 90% throttle Function needs Secrets Officer access to it to set cost-throttle-active.')
param keyVaultName string

@description('data.bicep\'s Key Vault URI — passed straight through as the throttle Function\'s KEY_VAULT_URI app setting, same pattern api.bicep already uses (data.outputs.keyVaultUri), rather than reconstructing it from keyVaultName and assuming the DNS suffix.')
param keyVaultUri string

@secure()
@description('Shared secret the cost-killswitch webhook must present (query string ?secret=...) — supplied at deploy time, e.g. `az deployment group create ... --parameters killswitchSecret=$(openssl rand -hex 32)`. Mirrors main.bicep\'s existing @secure() dbAdminPassword convention. Never logged, never defaulted. Required for all three stages for consistency, but INERT for prod (2026-08-09) — no resource in this module references it there, since prod does not deploy the Function that would consume it. See this file\'s header comment.')
param killswitchSecret string

// Bicep's utcNow() may only be used as a param default (an ARM evaluation-
// order restriction, not a style choice) — formats to the first of the
// current month, matching Microsoft.Consumption/budgets' own requirement
// that timePeriod.startDate align to a billing-period boundary for Monthly
// time grain.
param budgetStartDate string = utcNow('yyyy-MM-01')

@description('Standard resource tags (project/stage/managedBy) — Azure.Resource.UseTags, architecture-review PSRule remediation 2026-08-09.')
param tags object = {}

var isProd = stage == 'prod'

// ── Storage account (required by every Function App) ───────────────────
// !isProd — see header comment.
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = if (!isProd) {
  name: take(toLower(replace('${namePrefix}ksw${uniqueSuffix}', '-', '')), 24)
  location: location
  tags: tags
  // Azure.Storage.UseReplication (architecture-review PSRule remediation,
  // 2026-08-09) — ZRS over LRS: replicates across availability zones
  // within the region for a small (~1.25x) cost delta, meaningful given
  // this is the storage account backing an availability-safety mechanism.
  sku: {
    name: 'Standard_ZRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // Azure.Storage.Firewall (network ACLs) deliberately NOT set here,
    // unlike api.bicep's storage account: this Function App has no VNet
    // integration (it's a plain Y1 Consumption plan, not Flex Consumption),
    // so there is no virtualNetworkRules subnet to scope a default-deny
    // policy to, and Consumption-tier Functions' reliance on the
    // "AzureServices" bypass alone for AzureWebJobsStorage access is not
    // reliably documented as sufficient. Real, disclosed follow-up once
    // this can be verified against a live deployment rather than guessed
    // on a safety-relevant Function.
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = if (!isProd) {
  parent: storageAccount
  name: 'default'
  properties: {
    // Azure.Storage.SoftDelete / Azure.Storage.ContainerSoftDelete
    // (architecture-review PSRule remediation, 2026-08-09) — 7 days,
    // matching this module's own Key-Vault-adjacent retention convention
    // elsewhere in infra-azure/ (data.bicep's softDeleteRetentionInDays).
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource functionPlan 'Microsoft.Web/serverfarms@2023-12-01' = if (!isProd) {
  name: '${namePrefix}-ksw-plan'
  location: location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {
    reserved: true // Linux
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = if (!isProd) {
  name: '${namePrefix}-cost-killswitch'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    // System-assigned managed identity — the Contributor role assignment
    // below (scoped to JUST the Postgres server, not the resource group)
    // is what actually lets this function call the ARM stop API.
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: functionPlan.id
    httpsOnly: true
    // Azure.AppService.ARRAffinity (architecture-review PSRule remediation,
    // 2026-08-09) — this Function has no session state to pin a caller to
    // a specific instance for; disabling affinity is strictly correct for
    // a stateless HTTP-triggered webhook target, not just rule-compliance.
    clientAffinityEnabled: false
    siteConfig: {
      minTlsVersion: '1.2'
      http20Enabled: true
      linuxFxVersion: 'Node|20'
      appSettings: [
        // Standard AzureWebJobsStorage wiring — the one listKeys() usage in
        // this file that IS the universally-documented, high-confidence
        // pattern (storage account keys, not a Function host key).
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'POSTGRES_SERVER_RESOURCE_ID', value: postgresServerId }
        { name: 'KILLSWITCH_SECRET', value: killswitchSecret }
        // Consumed by the 90% /api/cost-throttle route (throttle.ts) — the
        // same app hosts both functions, so this setting is unused by the
        // 100% route but harmless there.
        { name: 'KEY_VAULT_URI', value: keyVaultUri }
      ]
    }
  }
}

// ── Scoped role assignment: Contributor on JUST the Postgres server ────
// No narrower built-in role exists for "start/stop only" on this resource
// type (verified: this is the standard pattern used in Microsoft's own
// budget-control-sample reference) — least privilege is applied at the
// SCOPE (this one resource) rather than the role itself.
resource existingPostgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = if (!isProd) {
  name: last(split(postgresServerId, '/'))
}

resource stopPermission 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!isProd) {
  name: guid(existingPostgres.id, functionApp.id, 'Contributor')
  scope: existingPostgres
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    // Built-in "Contributor" role definition GUID — a well-known Azure
    // constant, not something specific to this deployment.
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
  }
}

// ── Scoped role assignment: Key Vault Secrets Officer on JUST this vault ──
// Same least-privilege-at-scope reasoning as stopPermission above, applied
// to the 90% throttle route's much gentler action (set one secret) — this
// grants set/get/list/delete on secrets, not the whole vault's management
// plane. "Key Vault Secrets Officer" is a well-known built-in role GUID.
resource existingKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = if (!isProd) {
  name: keyVaultName
}

resource throttleSecretPermission 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!isProd) {
  name: guid(existingKeyVault.id, functionApp.id, 'KeyVaultSecretsOfficer')
  scope: existingKeyVault
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}

// ── The dedicated throttle Action Group — 90% threshold ONLY, dev/staging
// only. Separate from BOTH the on-call group (50%/80%) and the kill-switch
// group (100%) — see this file's header comment for why three groups, not
// one or two, are required.
resource throttleActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!isProd) {
  name: '${namePrefix}-cost-throttle-ag'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: take('${stage}-thrtl', 12)
    enabled: true
    emailReceivers: [
      {
        name: 'throttle-notify'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
    webhookReceivers: [
      {
        name: 'setThrottleFlag'
        serviceUri: 'https://${functionApp.properties.defaultHostName}/api/cost-throttle?secret=${killswitchSecret}'
        useCommonAlertSchema: true
      }
    ]
  }
}

// ── The dedicated kill-switch Action Group — 100% threshold ONLY,
// dev/staging only. See header comment: prod deliberately does not deploy
// the Function capable of stopping the production database at all.
resource killswitchActionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!isProd) {
  name: '${namePrefix}-cost-killswitch-ag'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: take('${stage}-kill', 12)
    enabled: true
    emailReceivers: [
      {
        name: 'killswitch-notify'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
    webhookReceivers: [
      {
        name: 'stopPostgresServer'
        serviceUri: 'https://${functionApp.properties.defaultHostName}/api/cost-killswitch?secret=${killswitchSecret}'
        useCommonAlertSchema: true
      }
    ]
  }
}

// ── The budget itself: 50% / 80% / 100% thresholds ──────────────────────
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: '${namePrefix}-monthly-budget'
  properties: {
    category: 'Cost'
    amount: budgetLimitUsd
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
      endDate: '2034-12-31' // far-future — an ongoing, recurring monthly budget, not a one-time window
    }
    notifications: {
      // 50%/80% — early warnings, email only, reusing monitoring.bicep's
      // existing on-call Action Group (no stop-function receiver on it).
      Actual_GreaterThan_50_Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: []
        contactGroups: [oncallActionGroupId]
        contactRoles: []
      }
      Actual_GreaterThan_80_Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: []
        contactGroups: [oncallActionGroupId]
        contactRoles: []
      }
      // 90% — dev/staging: email AND set the cost-throttle-active Key Vault
      // flag (stops nothing; a budget-conscious background workload checks
      // the flag and skips its own non-critical work,
      // backend/shared/cost-throttle.ts). Prod: email only, same as 50/80% —
      // no automated action, per this file's header comment.
      Actual_GreaterThan_90_Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 90
        thresholdType: 'Actual'
        contactEmails: []
        contactGroups: [isProd ? oncallActionGroupId : throttleActionGroup.id]
        contactRoles: []
      }
      // 100% — dev/staging: email AND stop the Postgres server. Prod: email
      // only — deliberately no automated stop capability is deployed for
      // prod at all (this file's header comment).
      Actual_GreaterThan_100_Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: []
        contactGroups: [isProd ? oncallActionGroupId : killswitchActionGroup.id]
        contactRoles: []
      }
    }
  }
}

// ── Real, disclosed limitations — same honesty standard as the AWS side's
// own kill switch (CLAUDE.md's "Cost Kill Switch" section) ──
// 1. Azure auto-restarts a stopped Postgres Flexible Server after 7 days
//    regardless of what stopped it (verified via Microsoft's own docs,
//    2026-07-21) — this buys time to notice and fix the cost driver, it is
//    NOT a permanent shutdown, identical in spirit to the AWS side's own
//    7-day RDS auto-restart caveat.
// 2. Azure Cost Management budgets track ACTUAL cost with reporting lag
//    (typically several times a day, not real-time) — a fast first
//    response, not an instantaneous circuit breaker, same disclosed
//    limitation as AWS Budget Actions.
// 3. This budget is resource-group-scoped (one per stage, matching this
//    architecture's resource-group-per-stage model) — if multiple stages
//    are ever deployed to the same subscription, each stage's budget only
//    tracks that stage's own resource group, not shared/aggregate spend
//    across stages. This is actually BETTER isolation than the AWS side's
//    own disclosed limitation (AWS Budgets track account-wide spend, not
//    per-stage) — a genuine structural improvement, not parity.
// 4. Only the Postgres server is wired to auto-stop. Once api.bicep/
//    iot.bicep exist and introduce other billable, stoppable resources,
//    extend stopPostgresServer()'s pattern (or generalize it) to cover
//    them too — not done here since those resources don't exist yet.
// 5. The 90% throttle flag (added 2026-08-09) LATCHES — it does not clear
//    itself when next month's budget period starts at $0 again, the same
//    documented behavior as the separate, agent-specific AGENT_KILLSWITCH
//    (CLAUDE.md: "lowering spend does not quietly re-arm the team"). A
//    human (or a future ops workflow) must explicitly clear
//    cost-throttle-active in Key Vault to resume throttled work.
// 6. No non-critical background workload checks the throttle flag yet —
//    Policy Engine notification fan-out and agent Timer functions are the
//    two named candidates, and neither runs in production today. The
//    mechanism (this module + backend/shared/cost-throttle.ts) is built
//    ahead of its first real consumer, the same precedent
//    disableDeviceIdentity() set before DPS enrollment existed.
// 7. Prod deploys none of the automated-action machinery above (added
//    2026-08-09, user decision) — no Function App, no Contributor-on-
//    Postgres role assignment, no throttle/kill-switch Action Group. Prod
//    still gets the full four-threshold budget, routed entirely to email.
//    This is a deliberate reduction in prod's automated blast radius, not
//    an oversight: dev/staging accept the (mitigated, by ADR-003's
//    graduated tiers) risk of an automated stop in exchange for tighter
//    cost control on non-production spend; prod does not, since an
//    availability incident there is strictly worse than a cost overrun
//    caught a day later by the same email alert dev/staging also get.
// 8. This storage account still uses a listKeys()-embedded connection
//    string for AzureWebJobsStorage (Azure.Storage.LocalAuth), unlike
//    api.bicep's identity-based pattern (AzureWebJobsStorage__accountName +
//    __credential=managedidentity + Blob/Queue/Table data-plane role
//    assignments). NOT reconciled to that pattern in this same PSRule-
//    remediation pass (2026-08-09), deliberately: this Function's own AUTH
//    DESIGN NOTE above already explains why an unattended safety mechanism
//    only adopts a pattern that's been proven, and while api.bicep's
//    identity-based storage wiring is real and used elsewhere in this repo,
//    switching this specific Function's bootstrap mechanism without a live
//    deployment to verify it still starts is a real, disclosed risk this
//    pass chose not to take on a safety-relevant path. Real, scoped
//    follow-up, not silently declined.
// 9. Azure.AppService.PlanInstanceCount / Azure.AppService.AvailabilityZone
//    not fixed, same reasoning as api.bicep's identical disclosed gap:
//    this Y1 Consumption plan's scale-to-zero billing model has no
//    multi-instance/zone-redundancy knob short of moving to Premium, which
//    would reintroduce the always-on cost floor this Function was
//    specifically built to avoid for a background cost-control mechanism.

output functionAppName string = isProd ? '' : functionApp.name
output killswitchActionGroupId string = isProd ? '' : killswitchActionGroup.id
output throttleActionGroupId string = isProd ? '' : throttleActionGroup.id
