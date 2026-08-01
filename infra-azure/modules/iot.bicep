// IoT module — Azure IoT Hub + Device Provisioning Service (DPS), the
// Azure-native replacement for AWS IoT Core in infra/lib/iot-stack.ts.
// Enterprise Audit (2026-07-19) §6 P0 item 1's other remaining "Functions
// hosting" sibling gap; unblocks backend/ingest/main.ts's Event Hub trigger
// (api.bicep's IOT_HUB_EVENTHUB_CONNECTION/IOT_HUB_EVENTHUB_NAME, blank
// until now) and gives Device & Command Security Architecture §2 / Hub
// Enrollment & Identity Design (D2/D3) a real target to design against.
//
// DEVICE/HUB IDENTITY MODEL THIS SERVES (already designed, re-verified here
// rather than re-derived — see the two docs above):
//   - Individual X.509 DPS enrollment for BOTH devices (Device & Command
//     Security §2) and Hubs (Hub Enrollment & Identity Design D3) — NOT
//     group enrollment. This module provisions the DPS *service* and its
//     link to this stage's IoT Hub; it deliberately does NOT create any
//     enrollment entries — those are per-device/per-hub, created at
//     provisioning time by provision-devices.ts's Azure port (a script, not
//     IaC), exactly as both design docs already state. Nothing here departs
//     from that.
//   - D2 (Hub Enrollment & Identity Design, DECIDED 2026-07-25): hub
//     heartbeat and PeakAssist-sync target are twin-native (reported/
//     desired properties), not the built HTTP endpoints. That requires
//     device twins, which — verified via Microsoft Learn — are a
//     STANDARD-TIER-ONLY IoT Hub feature; Basic tier does not support them.
//     This module uses S1 (Standard) for exactly that reason, not as a
//     default. Same requirement applies to the future Direct-Methods
//     command channel (Device & Command Security §4.3) — not built at MVP
//     (CC-3.1/CC-4.1), but S1 keeps that door open without a later tier
//     migration.
//
// COST, DISCLOSED HONESTLY: unlike Functions (api.bicep's whole reason for
// choosing Flex Consumption), IoT Hub has no genuinely-free tier that
// supports this architecture. Free (F1) tier technically supports twins/
// Direct Methods too, but caps at 500 devices / 8,000 messages per day and
// — verified via Microsoft Learn — only ONE F1 hub is allowed per
// subscription, which would conflict with this project's per-stage
// resource-group model the moment a second stage also wants one. S1
// (~$25/mo per unit, 1 unit = 400,000 messages/day) is used uniformly
// across every stage — the same category of accepted real cost as
// data.bicep's Postgres server (which also has no $0 path), not a reversal
// of the Functions-hosting cost discipline (which had a genuine zero-cost
// alternative to choose).
//
// Sources consulted while writing this module (2026-07-31):
//   - https://learn.microsoft.com/en-us/azure/iot-hub/iot-hub-devguide-device-twins (Standard-tier-only)
//   - https://learn.microsoft.com/en-us/azure/iot-dps/quick-setup-auto-provision-bicep (verified DPS+IoT Hub linking shape)
//   - https://learn.microsoft.com/en-us/azure/iot-hub/iot-hub-devguide-messages-read-builtin (built-in Event Hub-compatible endpoint)

@description('Stage-prefixed resource name base, e.g. "peaklogic-dev".')
param namePrefix string

@description('Mixed into IoT Hub/DPS names — both must be globally unique across all of Azure, same reasoning as data.bicep\'s Key Vault/Postgres naming.')
param uniqueSuffix string

param location string

@allowed(['dev', 'staging', 'prod'])
param stage string

@description('data.bicep\'s Key Vault name — the ingest Event-Hub-compatible connection string is written here as a secret (iot-hub-ingest-connection), never returned as a plain module output, matching data.bicep\'s own postgres-admin-credential precedent. api.bicep\'s Function App reads it via an App-Service Key-Vault-reference app setting (@Microsoft.KeyVault(SecretUri=...)), resolved by the platform using the identity it already holds (Key Vault Secrets User, granted in api.bicep) — no code change needed in backend/ingest/main.ts, which already just reads IOT_HUB_EVENTHUB_CONNECTION from its environment.')
param keyVaultName string

@description('IoT Hub unit count. 1 unit = 400,000 messages/day (S1) — generous for this platform\'s near-term traffic (one pilot facility); raise deliberately if a real device count needs more, not preemptively (same "don\'t build/pay ahead of a named need" discipline as api.bicep\'s maximumInstanceCount).')
param iotHubCapacity int = 1

resource iotHub 'Microsoft.Devices/IotHubs@2023-06-30' = {
  name: '${namePrefix}-iothub-${uniqueSuffix}'
  location: location
  sku: {
    name: 'S1' // Standard — required for device twins (D2) and future Direct Methods (Device & Command Security §4.3). Basic/Free would not support either.
    capacity: iotHubCapacity
  }
  properties: {
    // No custom message routing — the platform's default fallback route
    // already sends every device-to-cloud message to the built-in
    // Event-Hub-compatible endpoint (eventHubEndpoints.events), which is
    // exactly what backend/ingest/main.ts's Event Hub trigger reads. Real,
    // disclosed follow-up: per-message-type routing (e.g. separating hub
    // heartbeat/twin-change events from device telemetry) is a genuine
    // future refinement, not needed for this platform's current single
    // ingest path.
    //
    // A dedicated, minimally-scoped authorization policy for the ingest
    // Function's read access — ServiceConnect only (verified: "Only shared
    // access policies with ServiceConnect permissions can connect to the
    // specified event hub," Microsoft Learn). Deliberately NOT reusing the
    // default iothubowner policy (which also grants RegistryRead/Write and
    // DeviceConnect) for this — least-privilege-at-scope, the same pattern
    // as every RBAC role assignment elsewhere in this tree.
    authorizationPolicies: [
      {
        keyName: 'ingestConnect'
        rights: 'ServiceConnect'
      }
      {
        // Water-Sector Security Hardening Strategy §5 Tier 0.3 — a second
        // narrowly-scoped policy for the ADMIN-PLANE device-identity-
        // revocation path (backend/shared/device-identity.ts's
        // disableDeviceIdentity()), deliberately separate from ingestConnect
        // (ServiceConnect only, no registry rights) and from DPS's own link
        // below (which reuses the all-powerful default iothubowner per
        // Microsoft's verified sample). RegistryReadWrite is the narrowest
        // named right that can disable a device identity — verified via
        // Microsoft Learn's IoT Hub permissions reference; there is no
        // narrower "disable only" right documented.
        keyName: 'registryReadWrite'
        rights: 'RegistryReadWrite'
      }
    ]
  }
}

// Ingest connection string — built from the scoped ingestConnect policy
// above (found by keyName, not assumed to be at a fixed array index, since
// Microsoft's own docs only guarantee index 0 is iothubowner specifically,
// not the position of any custom policy). Written to Key Vault, never
// returned as a module output — see the keyVaultName param comment.
var ingestKey = filter(iotHub.listKeys().value, k => k.keyName == 'ingestConnect')[0]
var ingestConnectionString = 'Endpoint=${iotHub.properties.eventHubEndpoints.events.endpoint};SharedAccessKeyName=ingestConnect;SharedAccessKey=${ingestKey.primaryKey};EntityPath=${iotHub.properties.eventHubEndpoints.events.path}'

resource existingKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource ingestConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: existingKeyVault
  name: 'iot-hub-ingest-connection'
  properties: {
    value: ingestConnectionString
  }
}

// Registry connection string for the admin-plane revocation path — same
// filter()-by-keyName construction and same "written to Key Vault, never a
// plain output" discipline as ingestConnectionString above.
var registryKey = filter(iotHub.listKeys().value, k => k.keyName == 'registryReadWrite')[0]
var registryConnectionString = 'HostName=${iotHub.properties.hostName};SharedAccessKeyName=registryReadWrite;SharedAccessKey=${registryKey.primaryKey}'

resource registryConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: existingKeyVault
  name: 'iot-hub-registry-connection'
  properties: {
    value: registryConnectionString
  }
}

resource dps 'Microsoft.Devices/provisioningServices@2022-02-05' = {
  name: '${namePrefix}-dps-${uniqueSuffix}'
  location: location
  sku: {
    name: 'S1' // DPS's only SKU — not a tier choice the way IoT Hub's is.
    capacity: iotHubCapacity
  }
  properties: {
    iotHubs: [
      {
        // iothubowner, not a scoped-down policy — matching Microsoft's own
        // verified DPS-linking sample exactly (learn.microsoft.com's DPS
        // Bicep quickstart uses iothubowner here, not a custom policy).
        // Unlike the ingest connection above (this module's own
        // construction), DPS's exact required rights for device-identity
        // provisioning aren't independently documented as a narrower named
        // right — deviating from the verified sample here would be a
        // guess, not a verified tightening. Real, disclosed follow-up:
        // revisit if Microsoft ever documents DPS's minimal required rights
        // explicitly.
        connectionString: 'HostName=${iotHub.properties.hostName};SharedAccessKeyName=iothubowner;SharedAccessKey=${iotHub.listKeys().value[0].primaryKey}'
        location: location
      }
    ]
    // Single-hub-per-stage today (this platform has one IoT Hub per
    // resource group/stage) — allocationPolicy is irrelevant with only one
    // linked hub (everything routes there regardless of policy), left at
    // DPS's own default ('Hashed') rather than set explicitly for a
    // decision that doesn't yet matter.
  }
}

// ── Real, disclosed gaps, not silently omitted ──
// 1. No DPS enrollment entries are created here — individual X.509
//    enrollment for both devices and hubs is a per-device/per-hub runtime
//    operation (provision-devices.ts's Azure port + the hub-provisioning
//    script Hub Enrollment & Identity Design §7 names), not a template-time
//    resource. Real follow-up work, not started.
// 2. The twin-native heartbeat/PeakAssist-sync transport (Hub Enrollment &
//    Identity Design §5's "IoT Hub connection-state events via Event Grid")
//    needs an Event Grid System Topic scoped to this IoT Hub, subscribed to
//    Microsoft.Devices.DeviceConnected/DeviceDisconnected, routed to
//    whatever finally consumes them (a Function, most likely) — not built
//    here. This module provisions the IoT Hub itself; the event-routing
//    layer on top of it is a distinct, not-yet-reconciled piece of work.
// 3. monitoring.bicep's disclosed gap #3 ("IoT Hub / Event Hub metrics...
//    deferred until iot.bicep provides a resource id") is now unblockable —
//    same circular-module-dependency consideration already flagged for
//    api.bicep's alerts applies here too (a metric alert scoped to this
//    IoT Hub needs a module that depends on both monitoring.bicep's
//    actionGroupId and this module's iotHub.id).
// 4. Not validated against a real subscription/DPS instance — same
//    standing caveat as every other file in this tree (no Azure CLI here).
//    The single highest-value thing to verify first: that the
//    authorizationPolicies array syntax and the filter()-by-keyName
//    approach for a NON-default policy actually returns what's expected —
//    every official sample checked only demonstrates reading index 0
//    (iothubowner), not a custom policy looked up by name.

output iotHubId string = iotHub.id // consumed by ingest-alerts.bicep's ingest-rate-zero metric alert
output iotHubName string = iotHub.name
output iotHubHostName string = iotHub.properties.hostName
output eventHubName string = iotHub.properties.eventHubEndpoints.events.path
output dpsName string = dps.name
output dpsIdScope string = dps.properties.idScope
output dpsGlobalEndpoint string = 'global.azure-devices-provisioning.net' // Fixed, well-known DPS endpoint — not resource-specific, output for convenience/documentation at device/hub enrollment time.
