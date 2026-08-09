// Ingest-alerts module — closes monitoring.bicep's own disclosed-gap items
// 1 and 3 (Water-Sector Security Hardening Strategy §5 Tier 0.4). The
// Enterprise Audit's (2026-07-19) primary ask — "ingest rate zero" and
// "Function error rate" alerts — needed api.bicep's Function App and
// iot.bicep's IoT Hub to exist first (both built 2026-07-31); this module
// exists SEPARATELY from monitoring.bicep specifically to avoid the
// circular dependency that would otherwise result (monitoring would need
// api's/iot's resource-id outputs; both already consume monitoring's own
// appInsightsConnectionString/actionGroupId outputs) — same shape
// budget.bicep already uses for postgresServerId + oncallActionGroupId from
// two different upstream modules.
//
// Why this specific gap matters more here than for most SaaS: this
// platform's entire value proposition is detecting problems in equipment it
// monitors. "Ingest silently stopped" is the one failure mode that looks
// identical to "everything is fine" from every other angle — the Enterprise
// Audit named it the worst possible undetected incident, and the 2026-07-26/
// 27 water-sector attacks' operator-lockout technique is a real-world
// instance of exactly this failure mode (monitoring/control silently lost).
//
// Metric names verified via Microsoft Learn documentation, not guessed:
//   - https://learn.microsoft.com/en-us/azure/iot-hub/monitor-iot-hub-reference
//     (d2c.telemetry.ingress.success — Count metric, Total aggregation only)
//   - Http5xx is a documented, alertable metric on Flex Consumption Function
//     Apps specifically (verified live, not assumed identical to the older
//     Consumption plan's FunctionExecutionCount/FunctionExecutionUnits,
//     which are NOT available on Flex Consumption).
// Not validated against a real subscription — same standing caveat as every
// other file in this tree (no Azure CLI/subscription access here).

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

@description('monitoring.bicep\'s actionGroupId output — reused, not a second Action Group, same discipline as budget.bicep.')
param actionGroupId string

@description('api.bicep\'s functionAppId output.')
param functionAppId string

@description('iot.bicep\'s iotHubId output.')
param iotHubId string

@description('Standard resource tags (project/stage/managedBy) — Azure.Resource.UseTags, architecture-review PSRule remediation 2026-08-09.')
param tags object = {}

// Function App error-rate alert (Microsoft.Web/sites, Http5xx). Threshold
// is a disclosed placeholder engineering estimate, not tuned against real
// traffic — same honesty as device-silence detection's interval defaults
// (backend/jobs/silence-detection.ts): nothing has ever deployed, so no
// real request volume exists yet to calibrate against. Revisit once a real
// pilot's traffic baseline exists.
resource functionErrorRateAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-api-http5xx-high'
  location: 'global'
  tags: tags
  properties: {
    severity: 1 // Error — a 5xx spike on the one API surface this platform has is a real, active incident, not a warning
    enabled: true
    // Azure.Alert.MetricAutoMitigate, architecture-review PSRule
    // remediation 2026-08-09 — see monitoring.bicep's identical comment.
    autoMitigate: true
    scopes: [functionAppId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'Http5xxHigh'
          metricName: 'Http5xx'
          metricNamespace: 'Microsoft.Web/sites'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Total'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroupId }
    ]
  }
}

// Ingest-rate-zero alert (Microsoft.Devices/IotHubs,
// d2c.telemetry.ingress.success). A 30-minute zero-message window before
// firing — long enough to not false-positive during a real quiet period
// with few pilot devices reporting infrequently, short enough to catch a
// real platform-wide disruption well before a customer would notice.
// Disclosed placeholder, same reasoning as the Http5xx threshold above —
// revisit once a real device fleet's actual reporting cadence is known.
resource ingestRateZeroAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: '${namePrefix}-iot-ingest-rate-zero'
  location: 'global'
  tags: tags
  properties: {
    severity: 1
    enabled: true
    // Azure.Alert.MetricAutoMitigate, architecture-review PSRule
    // remediation 2026-08-09 — see monitoring.bicep's identical comment.
    autoMitigate: true
    scopes: [iotHubId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT30M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'ZeroIngest'
          metricName: 'd2c.telemetry.ingress.success'
          metricNamespace: 'Microsoft.Devices/IotHubs'
          operator: 'LessThanOrEqual'
          threshold: 0
          timeAggregation: 'Total' // the only valid aggregation for this Count metric (Microsoft Learn)
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroupId }
    ]
  }
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. DLQ depth (poison_messages row count) still has no Azure Monitor
//    metric at all — monitoring.bicep's own disclosed-gap item 2, unchanged
//    by this module. It's a Postgres row count, not a platform metric;
//    needs a custom-metric emitter (a scheduled Function reading the count
//    via Application Insights SDK) or a Log Analytics query alert, neither
//    built here.
// 2. Both thresholds above are engineering placeholders, not tuned against
//    real traffic — flagged explicitly in each resource's own comment, not
//    just here.
// 3. Not validated against a real subscription — same standing caveat as
//    every file in infra-azure/.
