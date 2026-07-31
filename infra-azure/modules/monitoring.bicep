// Monitoring module — Enterprise Audit (2026-07-19) §6 P0 item 4: "App
// Insights + alert rules (ingest rate zero, DLQ depth, error rate) wired to
// a real on-call address in the FIRST Azure deploy." Same "write it now,
// validate against a real subscription later" posture as network.bicep/
// data.bicep — no Azure CLI/subscription access exists in the environment
// this was written in (Infrastructure as Code §8 item 1, still true).
//
// SCOPED HONESTLY, NOT FULLY: this module provisions everything that is
// possible to alert on TODAY (the Postgres Flexible Server, provisioned by
// data.bicep) plus the foundational Log Analytics/App Insights/Action Group
// resources every later module will need. It deliberately does NOT fake
// alert rules for "ingest rate zero" or "Function error rate" — those need
// a Function App resource (api.bicep, audit §6 P0 item 1's own "Functions
// hosting" gap) that doesn't exist yet; an alert rule scoped to a
// non-existent resource ID would fail to deploy, not degrade gracefully.
// See the bottom of this file for the explicit, disclosed follow-up list —
// same "flagged, not silently omitted" discipline as every other partial
// module in this tree (data.bicep's credential-rotation/PostGIS gaps, etc.).

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

param location string

@allowed(['dev', 'staging', 'prod'])
param stage string

@description('Required — mirrors main.bicep\'s own "fail synth loudly if missing" discipline. The email address Azure Monitor\'s Action Group notifies.')
param alertEmail string

@description('Resource ID of the Postgres Flexible Server to alert on (data.bicep\'s postgresServerId output).')
param postgresServerId string

var isProd = stage == 'prod'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-law'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    // 30 days is the Azure default and this project's own existing
    // retention posture elsewhere (CloudWatch log retention was flagged at
    // 2 weeks as "may be too short for real incident investigation" on the
    // AWS side, Security Architecture §13 — deliberately not repeating that
    // mistake here without at least a documented, revisitable choice).
    retentionInDays: isProd ? 90 : 30
  }
}

// Workspace-based Application Insights (the only mode Microsoft now
// recommends — classic/non-workspace App Insights is on a deprecation
// path). Nothing sends it telemetry yet (no Function App exists — see
// header comment); provisioning it now means api.bicep, when written, only
// needs to wire its connection string into the Function App's app settings,
// not stand up a new resource.
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    IngestionMode: 'LogAnalytics'
  }
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: '${namePrefix}-oncall-ag'
  location: 'global' // Action Groups are always deployed at 'global', regardless of the parent template's location
  properties: {
    groupShortName: take('${stage}-oncall', 12) // Azure hard limit: groupShortName <= 12 chars
    enabled: true
    emailReceivers: [
      {
        name: 'primary-oncall'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// ── Postgres Flexible Server metric alerts ──────────────────────────────
// Thresholds/severities sourced from Microsoft's own "Azure Monitor
// Baseline Alerts" reference (azure.github.io/azure-monitor-baseline-alerts,
// DBforPostgreSQL/flexibleServers "Must Have" tier) — verified via live
// lookup 2026-07-21, not guessed. Metric namespace:
// Microsoft.DBforPostgreSQL/flexibleServers.

resource cpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-pg-cpu-high'
  location: 'global'
  properties: {
    severity: 2
    enabled: true
    scopes: [postgresServerId]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighCpu'
          metricName: 'cpu_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 90
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

resource storageAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-pg-storage-high'
  location: 'global'
  properties: {
    severity: 2
    enabled: true
    scopes: [postgresServerId]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighStorage'
          metricName: 'storage_percent'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 90
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// The closest available leading indicator of "ingest stopped working"
// (audit's named concern) until a real Function App exists to alert on
// directly: a spike in failed DB connections would catch the app→Postgres
// path breaking, which every ingest write depends on. Not a substitute for
// a real ingest-rate-zero alert (see follow-up list below) — a genuinely
// silent-but-healthy-connection ingest stall (e.g. IoT Hub itself receiving
// nothing) would NOT trip this.
resource connectionsFailedAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-pg-connections-failed'
  location: 'global'
  properties: {
    severity: 2
    enabled: true
    scopes: [postgresServerId]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'FailedConnections'
          metricName: 'connections_failed'
          metricNamespace: 'Microsoft.DBforPostgreSQL/flexibleServers'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. "Ingest rate zero" and "Function error rate" (the audit's own primary
//    ask) need a Function App resource to attach a metrics alert to
//    (requests count / failure count, Microsoft.Web/sites metric
//    namespace). api.bicep now exists (2026-07-31) — but adding those
//    alerts HERE would create a circular module dependency (this module
//    would need api.bicep's functionAppId output; api.bicep already
//    consumes THIS module's appInsightsConnectionString output). Build them
//    as a small separate module/resource block instead, taking both this
//    module's actionGroupId output and api.bicep's functionAppId output as
//    inputs, deployed after both — same shape main.bicep's budget module
//    already uses (postgresServerId + oncallActionGroupId from two
//    different upstream modules).
// 2. "DLQ depth" (poison_messages row count, backend/shared/poison-
//    messages.ts) has no Azure Monitor metric at all — it's a row count in
//    Postgres, not a platform metric. Real options once api.bicep exists:
//    (a) a scheduled Function that queries the count and emits it as a
//    custom metric via the Application Insights SDK, or (b) a Log
//    Analytics query alert if Postgres query logs are ever streamed there.
//    Neither is built here — flagged as real follow-up work, not faked.
// 3. IoT Hub / Event Hub metrics (message ingress rate, throttled
//    requests) would be a genuine, more direct proxy for "ingest stopped"
//    than the Postgres connection-failure alert above. iot.bicep now exists
//    (2026-07-31) and provides a resource ID (iotHub.id) to scope an alert
//    to — same circular-module-dependency consideration as item 1 applies
//    here too (this module would need iot.bicep's output; iot.bicep has no
//    reason to depend on this module today, but adding the alert here
//    directly would still require importing that ID as a new param and
//    updating main.bicep's wiring). Real, sequenced follow-up, same shape
//    as item 1's proposed small separate module.

output logAnalyticsWorkspaceId string = logAnalytics.id
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output actionGroupId string = actionGroup.id // reusable by budget.bicep when written, rather than provisioning a second Action Group
