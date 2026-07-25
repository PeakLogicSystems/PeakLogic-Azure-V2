# Windows Endpoint Application ("The Brains")

**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help)
**Company:** PeakLogic
**Project codename:** Project Vantage
**Status:** Draft v1.2 — specification only, no code shipped (amendment pending review — see Revision History, end of document)
**Depends on:** [Device & Command Security Architecture](device-command-security-architecture.md) (Draft v2.0, pending), [Security Architecture](security-architecture.md) (Draft v2.0, pending), [API Specification](api-specification.md) (Draft v1.4, pending), [Database Schema](database-schema.md) (Draft v1.4, pending), [Multi-Tenant Architecture](multi-tenant-architecture.md) (Draft v1.4, pending)
**Last updated:** 2026-07-17 (v1.2 — Azure fork amendment)
**Fork note (v1.2):** `azure-restructuring-plan.md` item 25 flagged this 🔵 amendment: "backend client points at a different API/auth endpoint (Entra ID token format vs. Cognito); core hub logic (ingestion sources, durable queue) is unaffected." **This amendment targets exactly that boundary** — §5 (device/backend identity), §8.1–8.3 (config/commissioning), §9.3 (secret storage), and §10.1 (VPN concentrator host) are corrected for Azure; §1–4, §6–7, §9.1–9.2/9.4–9.5 (ingestion, normalization, caching, kiosk UI, process isolation, audit logging, hardening) are **unchanged, confirmed cloud-agnostic** — none of that logic touches AWS or Azure APIs directly. The AWS-native `PeakLogic-AWS` repo's own Draft v1.1 is unaffected.

---

## 0. Ground rules

This document specifies a **new, physically separate application** — a Windows process/binary that runs on customer-site hardware. It is not part of `backend/`, `frontend/`, or `infra/`, and it does not change any of them. Every integration point below targets an endpoint, topic, or contract that **already exists and already ships**:

- **Azure IoT Hub + DPS device identity** *(corrected v1.2 — previously AWS IoT Core)* (one device identity per device, mutual TLS X.509 via DPS individual enrollment, topic access scoped to the authenticated identity itself — Device & Command Security Architecture §2).
- The device-to-cloud topic contract — `devices/{deviceId}/messages/events` (publish/telemetry), cloud-to-device via Direct Methods (Device & Command Security Architecture §4.3, **currently unused — see §4 gate**) rather than a receive-only `commands` topic subscription.
- The REST API (`/v1/sites`, `/v1/assets`, `/v1/devices`, `/v1/alerts`, `/v1/tickets`, `/v1/telemetry`, `/v1/settings`) — **Entra External ID-authenticated** *(corrected v1.2 — previously Cognito)*, `PeakLogicCustomers` tenant.
- The existing device provisioning + claim lifecycle, ported to DPS enrollment (`scripts/provision-devices.ts`'s Azure equivalent → `POST /v1/devices`).

**One binding constraint carried over from Device & Command Security Architecture §5, not re-litigated here:** CC-3.1/CC-4.1 forbid any code path that publishes to a device's `commands` topic, and forbid any shutoff/actuation endpoint, until that document's §5 gate is explicitly lifted by a future roadmap decision. This endpoint app's Command Dispatch Layer (§4) is therefore specified but **built inert** — wired for the day that gate lifts, not live today.

---

## 1. Architecture Overview

### 1.1 What this application is

A single Windows process (call it **PeakLogic Edge**) per physical site, running on whatever hardware that site has — a touch-first tablet mounted at a pump station, a fanless PC in a utility closet, a touchscreen in a QSR back office. It has two jobs:

1. **Uplink**: aggregate telemetry from devices that have no native cloud connectivity of their own (USB/RS-485 sensors, LAN devices behind a local API) and get it into AWS IoT Core using the *exact* per-device identity/topic model already built for network-native sensors — not a new ingestion path.
2. **Kiosk**: give on-site staff a local, always-available view of the same sites/assets/devices/alerts/tickets the web app shows, authenticated the same way, reading and writing the same REST API.

It does **not** run its own copy of alert rules, RLS, or tenant logic — that stays server-side, unchanged. It does not invent a new device identity model — every locally-attached device is a real, individually-provisioned IoT Thing with its own cert, exactly like a network-native sensor would be. The Windows box is a **transport bridge**, not a second backend.

### 1.2 Why "bridge many device identities" instead of "one gateway identity"

The alternative design — the Windows box authenticates as *itself* (one Thing, one cert) and publishes a batched multi-device payload — was rejected. It would require a new ingest Lambda code path to unpack a batch and a new topic/rule shape, which is exactly the backend duplication this document is told not to do. Instead:

- Every physically-attached child device (a flow sensor on COM3, a leak sensor on COM7, a LAN-based BMS controller) is **provisioned individually** via the unmodified `provision-devices.ts` script, gets its own Thing/cert/`device-config.json`/DB row, and is **claimed individually** through the existing onboarding flow (`POST /v1/devices`) — the kiosk's own onboarding screen calls the same endpoint the web app's `DeviceOnboard.tsx` does.
- The Windows app holds N cert bundles (one per attached child device) and opens **N concurrent MQTT client connections**, each authenticated as that one device, each publishing only to its own `peaklogic/{thingName}/telemetry`. From AWS IoT Core's perspective, nothing is different from a network-native sensor publishing directly — the only difference is *where the MQTT socket physically lives*.
- Zero backend/infra changes. The ingest Lambda, `TelemetryRule`, RLS policies, and alert engine all see identical traffic to what they already handle today.

### 1.3 Component diagram

```
                                   ┌────────────────────────────────────────────────┐
                                   │              PeakLogic Edge (Windows)            │
                                   │                                                   │
  ┌─────────────┐   COM3..COMn    │  ┌──────────────┐                                 │
  │ USB / RS-485 │───────────────▶│  │  Serial       │                                │
  │ sensors      │                │  │  Ingestion    │──┐                             │
  └─────────────┘                 │  │  Layer        │  │                             │
                                   │  └──────────────┘  │                             │
  ┌─────────────┐   REST/WS/MQTT  │  ┌──────────────┐   ▼      ┌────────────────┐     │
  │ LAN devices  │───────────────▶│  │  Network API  │──▶│ Internal │──▶│ Local          │     │
  │ (BMS, PLC…)  │                │  │  Ingestion    │  │ Telemetry │  │ Normalization  │     │
  └─────────────┘                 │  │  Layer        │  │ Bus       │  │ Layer          │     │
                                   │  └──────────────┘  │ (Channel) │  └───────┬────────┘     │
                                   │                     └──────────┘          │              │
                                   │                                            ▼              │
                                   │                                   ┌────────────────┐      │
                                   │                                   │ Local Caching   │      │
                                   │                                   │ Layer (SQLite   │      │
                                   │                                   │ durable queue)  │      │
                                   │                                   └───────┬────────┘      │
                                   │                                            │              │
                                   │           ┌────────────────────────────────┤              │
                                   │           ▼                                ▼              │
                                   │  ┌──────────────────┐            ┌──────────────────┐      │
                                   │  │ MQTT Publisher    │            │ REST API Client   │      │
                                   │  │ Pool (1 client per │            │ (Cognito auth,    │      │
                                   │  │ device identity)   │            │ site/asset/device/│      │
                                   │  └────────┬──────────┘            │ alert/ticket read)│      │
                                   │           │                        └────────┬─────────┘      │
                                   │           │                                 │                │
                                   │  ┌────────┴──────────┐                      │                │
                                   │  │ Command Subscriber │◀── inert at MVP ──┐  │                │
                                   │  │ (per device, recv  │   (CC-3.1/CC-4.1) │  │                │
                                   │  │  only — §4 gate)   │                   │  │                │
                                   │  └────────────────────┘                   │  │                │
                                   │                                                              │
                                   │  ┌──────────────────────────────────────────────────────┐    │
                                   │  │  Kiosk UI Layer (WinUI 3) — Dashboard / Sites / Assets │    │
                                   │  │  / Devices / Alerts / Tickets, touch + kb/mouse aware  │    │
                                   │  └──────────────────────────────────────────────────────┘    │
                                   │                                                              │
                                   │  Cross-cutting: Configuration Layer · Security Layer         │
                                   │  (DPAPI secrets, cert store) · Update/Deployment Layer (MSIX) │
                                   └────────────────────────────────────────────────────────────────┘
                                           │ MQTT/TLS (per-device cert)   │ HTTPS/TLS (Entra token)
                                           ▼                               ▼
                                   ┌──────────────────┐            ┌──────────────────┐
                                   │  Azure IoT Hub      │            │  API layer →       │  *(corrected v1.2 —
                                   │  (DPS-enrolled)      │            │  peaklogic-api      │   previously AWS IoT
                                   │  devices/{id}/        │            │  Azure Function     │   Core / API Gateway /
                                   │  messages/events       │            │                    │   Lambda)
                                   └──────────────────┘            └──────────────────┘
```

### 1.4 Major components

| Component | Responsibility |
|---|---|
| **Serial Ingestion Layer** | Owns N concurrent `SerialPort` connections, frames/parses protocol bytes, emits raw readings |
| **Network API Ingestion Layer** | Owns M concurrent REST-poll/WebSocket/local-MQTT subscriptions to LAN devices, emits raw readings |
| **Internal Telemetry Bus** | In-process `Channel<T>` — decouples ingestion producers from the normalization consumer; back-pressure friendly |
| **Local Normalization Layer** | Maps raw per-protocol readings into the minimal `TelemetryEnvelope` (§3) — no rule evaluation, no alerting, no tenant logic |
| **Local Caching Layer** | SQLite-backed durable queue — every envelope and every outbound API write lands here before transmission is attempted |
| **MQTT Publisher Pool** | One `MqttClient` per claimed child-device identity, drains the cache, publishes to that device's own `telemetry` topic |
| **Command Subscriber** | Subscribes (receive-only, per DevicePolicy) to each device's `commands` topic — **inert**: logs and no-ops any message, since nothing publishes there yet (§4) |
| **REST API Client** | Cognito-authenticated HTTPS client for site/asset/device/alert/ticket reads and the device-claim/settings-team writes the kiosk UI needs |
| **Kiosk UI Layer** | WinUI 3 full-screen shell — mirrors the tenant web app's information architecture, adapted for touch/kb-mouse |
| **Configuration Layer** | Site identity, device inventory, network endpoints, UI layout — local JSON, remotely updatable |
| **Security Layer** | DPAPI-protected secret storage, Windows Certificate Store integration, process isolation, local audit log |
| **Update/Deployment Layer** | MSIX packaging, background update agent, staged rollout, rollback |

---

### 1.5 This document covers one of two telemetry paths — added v1.1

PeakLogicSystems ingests device telemetry two structurally different ways, and a device is provisioned onto exactly one of them, chosen per manufacturer/device capability:

| Path | How it works | Who builds it |
|---|---|---|
| **A — Hub-relayed** (this document) | A locally-attached device with no native cloud stack (USB/RS-485 sensor, LAN device behind a local-only API) is bridged through PeakLogic Edge, which holds that device's own IoT Core identity and publishes on its behalf (§1.2). | This document, in full. |
| **B — Direct OEM cloud-to-cloud** | A device already reports into its manufacturer's own cloud platform (a smart chlorinator's OEM app backend, a BMS vendor's cloud API, etc.), and that OEM exposes a public API. PeakLogicSystems' backend polls or subscribes to the OEM's API directly and normalizes the result into the same telemetry shape the ingest Lambda already produces from MQTT. The physical device needs only outbound internet to reach its own OEM cloud — **no PeakLogic Edge hub, no local presence at all.** | **Not this document — a backend-side integration, out of scope here per §0's "do not redesign backend logic" constraint.** |

**Why this split matters for this document specifically:** every design decision in §1–§10 (device identity model, cert bundling, ingestion/normalization/caching/publishing) assumes Path A. A site can legitimately run **zero** PeakLogic Edge hubs if every device present is Path B — the hub is not a mandatory piece of infrastructure per site, it exists only where Path A devices are present. The Configuration Layer's `devices[]` array (§8.1) only ever lists Path A devices; Path B devices never appear in a hub's config at all, since the hub has no relationship to them.

**Real, disclosed gap: Path B has no backend design yet.** Nothing in `backend/` today polls or subscribes to any third-party OEM API. Building it is a real, separate piece of work — most naturally a new scheduled Lambda (or one per OEM integration, given each OEM's API shape differs) that authenticates to the OEM's API, normalizes into `IoTIngestEvent`'s exact shape, and either invokes the existing ingest Lambda's logic directly or publishes onto the same `peaklogic/{thingName}/telemetry` topic pattern so it flows through the one, unmodified ingestion pipeline either way. Recommend this become its own architecture artifact (e.g. "OEM Cloud-to-Cloud Integration Architecture") before implementation, following the same discipline as every other artifact in this sequence — not designed here, since it has zero surface area on the Windows endpoint app.

---

## 2. Ingestion Layer Design (USB + LAN)

### 2.1 Concurrency model

.NET's `System.IO.Ports.SerialPort` is inherently one-connection-per-port and blocking-read-oriented; wrap each COM port in its own long-running background task rather than trying to multiplex reads. LAN devices are naturally async (`HttpClient`, `ClientWebSocket`, an MQTT client library) and map cleanly onto `Task`-per-endpoint with a shared cancellation token.

**Pattern: one `IChannelWriter<RawReading>` producer per physical connection, one shared bounded `Channel<RawReading>` consumer.** This is the standard .NET producer/consumer decoupling — ingestion sources never know about normalization, caching, or MQTT; they only know how to turn wire bytes into a `RawReading` and post it.

```csharp
public sealed record RawReading(
    string SourceDeviceKey,   // maps to a config-file device entry, NOT yet a thingName
    DateTimeOffset ObservedAt,
    IReadOnlyDictionary<string, double> Metrics,
    string? RawPayload = null // retained for debugging/replay, not forwarded to backend
);

public sealed class TelemetryBus
{
    private readonly Channel<RawReading> _channel =
        Channel.CreateBounded<RawReading>(new BoundedChannelOptions(10_000)
        {
            FullMode = BoundedChannelFullMode.DropOldest, // ingestion never blocks; cache layer is durable, not this in-memory bus
            SingleReader = true,
            SingleWriter = false,
        });

    public ChannelWriter<RawReading> Writer => _channel.Writer;
    public ChannelReader<RawReading> Reader => _channel.Reader;
}
```

`DropOldest` is deliberate: the in-memory bus is a scheduling buffer, not the durability mechanism (§4 owns durability). If the normalization consumer briefly stalls, losing the oldest *in-flight* sample is preferable to blocking a serial read thread and risking a UART buffer overrun on the OS side.

### 2.2 Multi-port serial ingestion

```csharp
public sealed class SerialIngestionSource : IIngestionSource
{
    private readonly SerialDeviceConfig _cfg;      // COM port, baud, framing, device key
    private readonly IProtocolParser _parser;       // per-device-type parser (Modbus RTU, NMEA-like ASCII, vendor binary…)
    private readonly ChannelWriter<RawReading> _sink;
    private readonly ILogger _log;

    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            using var port = new SerialPort(_cfg.ComPort, _cfg.BaudRate, _cfg.Parity, _cfg.DataBits, _cfg.StopBits)
            {
                ReadTimeout = 5000,
                WriteTimeout = 2000,
            };

            try
            {
                port.Open();
                _log.LogInformation("Serial {Port} opened for {DeviceKey}", _cfg.ComPort, _cfg.DeviceKey);

                var buffer = new byte[4096];
                while (!ct.IsCancellationRequested)
                {
                    int n = await ReadAsync(port, buffer, ct); // wraps blocking SerialPort.Read in Task.Run with a timeout
                    if (n <= 0) continue;

                    foreach (var reading in _parser.TryParseFrames(buffer.AsSpan(0, n)))
                    {
                        if (!_sink.TryWrite(reading with { SourceDeviceKey = _cfg.DeviceKey }))
                            _log.LogWarning("Telemetry bus full — dropped a frame from {DeviceKey}", _cfg.DeviceKey);
                    }
                }
            }
            catch (Exception ex) when (ex is IOException or TimeoutException or UnauthorizedAccessException)
            {
                // Reconnect strategy: exponential backoff, capped, with jitter — a
                // USB sensor being unplugged/replugged or a driver enumeration
                // hiccup must never crash the ingestion loop for OTHER ports.
                _log.LogWarning(ex, "Serial {Port} failed — retrying", _cfg.ComPort);
                await Task.Delay(BackoffPolicy.NextDelay(_cfg.DeviceKey), ct);
            }
        }
    }
}
```

**Reconnection strategy:** exponential backoff (500ms → 30s cap) with ±20% jitter, tracked per-device-key so one flapping port doesn't synchronize retry storms across many ports. A `SerialPort` that fails to `Open()` because Windows re-enumerated it on a different COM number (common with USB) is handled by re-resolving `ComPort` from a stable identifier (USB VID/PID/serial-number via WMI) on each retry, not trusting the configured `COMn` string to stay fixed — that resolution step is table-stakes for redeployability across devices that don't guarantee a stable COM assignment.

### 2.3 Multi-endpoint network ingestion

Three distinct patterns, one common `IIngestionSource` interface:

```csharp
public interface IIngestionSource
{
    string DeviceKey { get; }
    Task RunAsync(CancellationToken ct);
}

// REST polling — the common case for LAN devices with a simple query API
public sealed class RestPollIngestionSource : IIngestionSource
{
    public string DeviceKey { get; }
    private readonly HttpClient _http;
    private readonly Uri _pollUri;
    private readonly TimeSpan _interval;
    private readonly IPayloadMapper _mapper;
    private readonly ChannelWriter<RawReading> _sink;

    public async Task RunAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                using var resp = await _http.GetAsync(_pollUri, ct);
                resp.EnsureSuccessStatusCode();
                var json = await resp.Content.ReadAsStringAsync(ct);
                _sink.TryWrite(_mapper.Map(DeviceKey, json));
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                // No reconnect needed — PeriodicTimer just ticks again. Log and
                // move on; a single missed poll is not durability-critical here,
                // it's caching (§4) that guarantees delivery of what WAS read.
                _log.LogWarning(ex, "Poll failed for {DeviceKey}", DeviceKey);
            }
        }
    }
}

// WebSocket — push-based LAN devices (e.g. a local BMS event stream)
public sealed class WebSocketIngestionSource : IIngestionSource
{
    public string DeviceKey { get; }
    private readonly Uri _wsUri;
    private readonly IPayloadMapper _mapper;
    private readonly ChannelWriter<RawReading> _sink;

    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            using var socket = new ClientWebSocket();
            try
            {
                await socket.ConnectAsync(_wsUri, ct);
                var buffer = new byte[8192];
                while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    var result = await socket.ReceiveAsync(buffer, ct);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    _sink.TryWrite(_mapper.Map(DeviceKey, json));
                }
            }
            catch (Exception ex) when (ex is WebSocketException or IOException)
            {
                _log.LogWarning(ex, "WebSocket {Device} dropped — reconnecting", DeviceKey);
                await Task.Delay(BackoffPolicy.NextDelay(DeviceKey), ct);
            }
        }
    }
}

// Local MQTT — LAN devices (or a local broker aggregating a BMS/PLC fleet)
// speaking MQTT on the customer's own network, distinct from the OUTBOUND
// per-device AWS IoT Core connections in §2.4 — this is an INBOUND local
// subscription, using MQTTnet the same library the outbound publisher uses.
public sealed class LocalMqttIngestionSource : IIngestionSource
{
    public string DeviceKey { get; }
    private readonly IMqttClient _localClient;
    private readonly string _topicFilter;
    private readonly IPayloadMapper _mapper;
    private readonly ChannelWriter<RawReading> _sink;

    public async Task RunAsync(CancellationToken ct)
    {
        _localClient.ApplicationMessageReceivedAsync += e =>
        {
            var json = Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment);
            _sink.TryWrite(_mapper.Map(DeviceKey, json));
            return Task.CompletedTask;
        };
        await ConnectWithRetryAsync(ct);
        await _localClient.SubscribeAsync(_topicFilter, ct: ct);
        await Task.Delay(Timeout.Infinite, ct); // event-driven; keep the task alive until cancelled
    }
}
```

**All three run under one `IngestionOrchestrator`** that starts one task per configured device, restarts a crashed task (not the whole process — see §7 watchdog for process-level recovery) with the same backoff policy, and exposes health per device-key for the kiosk UI's status indicators.

---

## 3. Local Normalization + Packaging

### 3.1 The `TelemetryEnvelope`

Deliberately minimal — it exists to carry a raw reading to the point where it becomes exactly what the ingest Lambda already expects (`IoTIngestEvent { thingName, ts, metrics }`, `backend/shared/types.ts`), not to re-implement categorization, units conversion policy, or thresholds. All of that stays server-side in `RULES_BY_CATEGORY` (`backend/ingest/rules.ts`).

```csharp
public sealed record TelemetryEnvelope
{
    public required string ThingName { get; init; }       // resolved from DeviceKey via config — this IS the AWS IoT Thing name
    public required DateTimeOffset ObservedAt { get; init; }
    public required IReadOnlyDictionary<string, double> Metrics { get; init; }

    // Serializes to EXACTLY the shape IoTIngestEvent expects server-side —
    // { thingName, ts, metrics } — no envelope-specific fields leak into
    // the wire payload. ts is unix epoch ms, matching backend/shared/types.ts.
    public string ToWirePayload() => JsonSerializer.Serialize(new
    {
        thingName = ThingName,
        ts = ObservedAt.ToUnixTimeMilliseconds(),
        metrics = Metrics,
    });
}
```

### 3.2 Mapping raw readings into the envelope

Each device type gets a small, declarative `IPayloadMapper` — the only place device-specific knowledge lives. This is intentionally the *only* extension point for onboarding a new device type; nothing else in the pipeline needs to know a device exists.

```csharp
public interface IPayloadMapper
{
    RawReading Map(string deviceKey, string rawPayload);
}

// Example: a Modbus RTU flow sensor exposing two holding registers
public sealed class ModbusFlowSensorMapper : IPayloadMapper
{
    public RawReading Map(string deviceKey, string rawPayload)
    {
        var regs = ModbusFrame.Parse(rawPayload); // vendor-specific decode
        return new RawReading(
            SourceDeviceKey: deviceKey,
            ObservedAt: DateTimeOffset.UtcNow,
            Metrics: new Dictionary<string, double>
            {
                ["flow_lpm"] = regs.Register(0) / 10.0,   // fixed-point scale per datasheet
                ["pressure_psi"] = regs.Register(1) / 100.0,
            });
    }
}

// Example: a JSON LAN device — metric names are already server-recognized
// keys (pool_chemistry's ph/free_chlorine_ppm/tds_ppm, per rules.ts), so
// this mapper does nothing more than reshape JSON field names.
public sealed class JsonPassthroughMapper : IPayloadMapper
{
    private readonly IReadOnlyDictionary<string, string> _fieldToMetric; // config-driven
    public RawReading Map(string deviceKey, string rawPayload)
    {
        using var doc = JsonDocument.Parse(rawPayload);
        var metrics = _fieldToMetric.ToDictionary(
            kv => kv.Value,
            kv => doc.RootElement.GetProperty(kv.Key).GetDouble());
        return new RawReading(deviceKey, DateTimeOffset.UtcNow, metrics);
    }
}
```

**Metric key discipline:** mapper output keys must match the metric names `RULES_BY_CATEGORY` already understands per asset category (`power_kw`, `flow_lpm`, `product_temp_c`, `ph`, `free_chlorine_ppm`, `tds_ppm`, etc.) — the endpoint app ships a config-driven lookup table of known metric keys per category (sourced once from the backend's own rule set, kept as a checked-in reference file, **not** re-derived or re-invented locally) so a misconfigured mapper fails fast in local validation instead of silently sending a metric name the server-side rules will never match against a threshold.

### 3.3 Extensibility without backend duplication

Adding a new device type is: (1) write an `IPayloadMapper`, (2) add a config entry mapping a `DeviceKey` to that mapper + its physical connection (COM port or LAN endpoint), (3) provision + claim the device normally. No change to normalization plumbing, caching, publishing, or — critically — no change to backend rule logic. If a genuinely new *category* of asset is needed (a metric the backend doesn't recognize yet), that is explicitly a backend change (`rules.ts`) requested through normal channels, not something the endpoint app works around locally (e.g., by pre-evaluating thresholds itself) — the endpoint's job stops at "get correctly-keyed telemetry to the cloud."

---

## 4. Local Caching + Offline Mode

### 4.1 Design

SQLite (via `Microsoft.Data.Sqlite`), one file (`edge-cache.db`), two durable queues sharing one schema pattern: `outbound_telemetry` and `outbound_api_calls`. Every envelope and every REST write the kiosk UI initiates (e.g. acknowledging an alert) is written to its queue table **before** any network attempt — this is what makes delivery guaranteed-at-least-once rather than best-effort.

```sql
CREATE TABLE outbound_telemetry (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  thing_name    TEXT    NOT NULL,
  payload       TEXT    NOT NULL,   -- pre-serialized wire JSON (§3.1)
  enqueued_at   INTEGER NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed_permanent'))
);
CREATE INDEX idx_outbound_telemetry_ready ON outbound_telemetry(status, next_attempt_at);

CREATE TABLE outbound_api_calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  method        TEXT    NOT NULL,
  path          TEXT    NOT NULL,   -- e.g. '/v1/alerts/{id}'
  body          TEXT,
  idempotency_key TEXT  NOT NULL UNIQUE,  -- see §4.3
  enqueued_at   INTEGER NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed_permanent'))
);
```

### 4.2 Queueing and flushing

```csharp
public sealed class TelemetryCache
{
    private readonly SqliteConnection _db;

    public async Task EnqueueAsync(TelemetryEnvelope env)
    {
        await using var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO outbound_telemetry (thing_name, payload, enqueued_at, next_attempt_at)
            VALUES ($thing, $payload, $now, $now)
        """;
        cmd.Parameters.AddWithValue("$thing", env.ThingName);
        cmd.Parameters.AddWithValue("$payload", env.ToWirePayload());
        cmd.Parameters.AddWithValue("$now", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        await cmd.ExecuteNonQueryAsync();
    }
}

public sealed class TelemetryFlusher : BackgroundService
{
    private readonly TelemetryCache _cache;
    private readonly MqttPublisherPool _publishers;
    private readonly ILogger _log;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var batch = await _cache.ReadReadyBatchAsync(limit: 200, ct); // status='pending' AND next_attempt_at <= now
            foreach (var row in batch)
            {
                var client = _publishers.GetClientFor(row.ThingName); // one MQTT client per device identity — §2.4/§5
                if (client is null || !client.IsConnected)
                {
                    await _cache.DeferAsync(row.Id, BackoffPolicy.NextDelay(row.ThingName));
                    continue;
                }

                try
                {
                    await client.PublishAsync(row.TopicFor("telemetry"), row.Payload, qos: MqttQualityOfService.AtLeastOnce, ct);
                    await _cache.MarkSentAsync(row.Id);
                }
                catch (Exception ex)
                {
                    await _cache.RecordFailureAsync(row.Id, ex, maxAttempts: 50); // permanent-fail after 50 tries (~ a few days at capped backoff) — surfaced in kiosk UI, not silently dropped
                }
            }
            await Task.Delay(TimeSpan.FromSeconds(2), ct);
        }
    }
}
```

### 4.3 Guaranteed delivery specifics

- **MQTT QoS 1 (at-least-once)** on every publish — matches what the ingest Lambda side already tolerates (it's driven by an idempotent-friendly `INSERT`/threshold-evaluation, not a strict exactly-once assumption); duplicate telemetry rows are cosmetically harmless (chart has an extra sample) versus a lost critical reading, which is the wrong trade to make the other way.
- **REST writes carry a client-generated idempotency key** (UUID, stored in `outbound_api_calls.idempotency_key`, sent as an `Idempotency-Key` header) so a retried "acknowledge alert" after a timeout doesn't double-apply. **This requires no backend change to function correctly for GET/most PUT calls** (they're naturally idempotent — re-`PUT`ting the same status is a no-op); it's forward-compatible groundwork for the day a genuinely non-idempotent write (e.g. the future command-issuance endpoint, §5) needs real idempotency-key enforcement server-side.
- **Retention/eviction:** `outbound_telemetry` rows older than a configurable window (default 14 days) with `status != 'pending'` are purged on a daily maintenance pass — bounds local disk growth on a site that's been offline for a long stretch without silently discarding still-pending data.
- **Backpressure signal to the kiosk UI:** a queue depth above a threshold (default 5,000 pending rows) flips a "degraded connectivity" banner — visible, not hidden telemetry loss risk.

---

## 5. Secure Communication with Backend

Two entirely separate credential/transport stacks, matching the two things this app talks to — deliberately not unified into one "backend client," since they have different identity models (per-device X.509 vs. per-kiosk Cognito user) and mixing them would blur an important trust boundary.

### 5.1 MQTT / Azure IoT Hub — per-device mutual TLS (rewritten for Azure, same durable-queue/publisher-pool design)

**Corrected v1.2 — previously AWS IoT Core.** Each claimed child device's cert bundle is delivered to the endpoint out of band at commissioning time (via the Configuration Layer's provisioning import, §8), generated the same way, registered via DPS individual enrollment instead of `CreateKeysAndCertificateCommand` (Device & Command Security Architecture §2) — the cert-generation tooling and delivery mechanism are unaffected; only the registration API call changes. Stored using Windows' **Certificate Store**, same as before — non-exportable private keys where supported. Raw `.pem`/`.key` files on disk remain a transitional/dev-only mode, not the production posture.

**A real, disclosed verification gap, not silently assumed**: the exact root CA Azure IoT Hub's TLS endpoint chains to (for the `CertificateValidationHandler` pinning below, replacing the AWS version's pin to Amazon Root CA1) should be confirmed against current Microsoft documentation at implementation time, not assumed to be a specific certificate here — Microsoft's own IoT Hub TLS documentation names the expected root(s) explicitly and has changed roots before (a real, documented migration event), so this is exactly the kind of claim this project's own discipline says to verify fresh, not carry forward from a general impression.

```csharp
public sealed class DeviceMqttClientFactory
{
    public IMqttClient CreateFor(ClaimedDeviceConfig cfg)
    {
        var cert = LoadFromCertStore(cfg.CertificateThumbprint) // preferred
                   ?? X509Certificate2.CreateFromPemFile(cfg.CertPath, cfg.KeyPath); // fallback, dev/import-pending only

        var options = new MqttClientOptionsBuilder()
            .WithClientId(cfg.ThingName)
            .WithTcpServer(cfg.Endpoint, port: 443) // 443, not 8883 — same firewall-friendliness reasoning as CLAUDE.md's firmware guidance
            .WithTls(new MqttClientOptionsBuilderTlsParameters
            {
                UseTls = true,
                Certificates = new[] { cert },
                SslProtocol = SslProtocols.Tls12,
                CertificateValidationHandler = ctx => ValidateAgainstRootCa(ctx, cfg.RootCaThumbprint), // pins to IoT Hub's published root CA (exact identity to be confirmed against current Microsoft docs at implementation time — §5.1), not the OS trust store wholesale
            })
            .WithCleanSession(false) // persistent session — queued QoS1 messages survive a brief reconnect
            .Build();

        return new MqttFactory().CreateMqttClient(); // .ConnectAsync(options) called by the publisher pool with retry (§2.2's BackoffPolicy)
    }
}
```

**Certificate pinning, corrected v1.2:** `CertificateValidationHandler` explicitly checks the presented chain terminates at Azure IoT Hub's published root CA thumbprint (`rootCaUrl` in the device config, exact identity per §5.1's flagged verification gap) rather than trusting any CA in the Windows root store — the same principle Security Architecture §4.2's Azure Database for PostgreSQL CA-bundle validation applies server-side (`ssl: { ca: AZURE_POSTGRES_CA_BUNDLE, rejectUnauthorized: true }`), mirrored here for the device-side leg.

### 5.2 REST API — Entra External ID, per-kiosk service identity *(corrected v1.2 — previously Cognito)*

The kiosk needs its own real `PeakLogicCustomers` Entra External ID identity to call the REST API — **not a shared/hardcoded credential, and not a new backend auth mode**, same principle as the AWS version. Recommendation, unchanged in shape: one dedicated tenant user per kiosk, created through the *existing* `POST /v1/settings/team` endpoint (tenant admin invites a "user" whose email is a site-scoped alias, role `operator` via App Role assignment, Security Architecture §2.1) — zero backend changes beyond what Security Architecture already redesigned, reuses the real RBAC model, and gives each site's audit trail a distinct, attributable identity instead of one shared kiosk account across every site.

**A real, disclosed token-flow difference, not assumed identical to Cognito's `REFRESH_TOKEN_AUTH`**: Entra External ID's OIDC token refresh uses the standard `grant_type=refresh_token` token-endpoint flow (not a Cognito-specific `AuthFlow` parameter) — the code sketch below reflects this; the underlying pattern (cache a long-lived refresh token, DPAPI-protect it, exchange for a short-lived access token on demand, no interactive login on a kiosk) is unchanged.

```csharp
public sealed class BackendAuthClient
{
    private readonly ISecretStore _secrets; // DPAPI-backed, §9.3
    private readonly HttpClient _entraHttp; // corrected v1.2 — previously _cognitoHttp

    public async Task<string> GetValidAccessTokenAsync(CancellationToken ct)
    {
        var cached = await _secrets.TryGetAsync("kiosk_tokens");
        if (cached is { } t && t.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(2))
            return t.AccessToken;

        // Standard OIDC refresh_token grant against PeakLogicCustomers' token
        // endpoint — no interactive login on a kiosk; the refresh token was
        // seeded once at commissioning and DPAPI-protected ever since.
        // Corrected v1.2 — previously Cognito's AuthFlow-based REFRESH_TOKEN_AUTH.
        var refreshToken = await _secrets.GetRequiredAsync("kiosk_refresh_token");
        var resp = await _entraHttp.PostAsync("/oauth2/v2.0/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = _cfg.EntraClientId,
            ["refresh_token"] = refreshToken,
            ["scope"] = _cfg.EntraApiScope,
        }), ct);
        resp.EnsureSuccessStatusCode();

        var result = await resp.Content.ReadFromJsonAsync<EntraTokenResult>(ct);
        var newTokens = new CachedTokens(result.AccessToken, result.IdToken, DateTimeOffset.UtcNow.AddSeconds(result.ExpiresIn));
        await _secrets.SetAsync("kiosk_tokens", newTokens);
        return newTokens.AccessToken;
    }
}

public sealed class PeakLogicApiClient
{
    private readonly HttpClient _http; // BaseAddress = https://{api-id}.execute-api.us-east-1.amazonaws.com/v1
    private readonly BackendAuthClient _auth;

    public async Task<IReadOnlyList<Site>> GetSitesAsync(CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "/sites");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await _auth.GetValidAccessTokenAsync(ct));
        using var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<List<Site>>(cancellationToken: ct) ?? [];
    }

    public async Task AcknowledgeAlertAsync(string alertId, string idempotencyKey, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Put, $"/alerts/{alertId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await _auth.GetValidAccessTokenAsync(ct));
        req.Headers.Add("Idempotency-Key", idempotencyKey);
        req.Content = JsonContent.Create(new { status = "acknowledged" });
        using var resp = await _http.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
    }
}
```

**TLS to the API layer, corrected v1.2:** standard public-CA validated HTTPS (whichever Azure API-hosting service's own managed cert — Infrastructure as Code §3's compute choice — no pinning needed here, same reasoning as the AWS version). `HttpClient` default cert validation is correct and sufficient.

---

## 6. Kiosk UI Design (Touch + Keyboard/Mouse)

### 6.1 Framework recommendation: **WinUI 3**

| Option | Verdict |
|---|---|
| **WinUI 3** | **Chosen.** Native Fluent controls with first-class touch targets out of the box, direct Win32/WinRT access for Assigned Access integration, MSIX-native packaging, no browser runtime overhead, actively supported by Microsoft for exactly this class of app (kiosk/line-of-business Windows apps). |
| WPF | Mature and fine for kb/mouse, but touch ergonomics (target sizes, gesture support) are bolted-on, not native — more manual work to get right on a touch-first device. |
| MAUI | Cross-platform story is irrelevant here (Windows-only requirement); adds abstraction overhead for no benefit on a single-target platform. |
| Electron | Rejected outright — a Chromium runtime on a locked-down kiosk device is a larger attack surface and heavier resource footprint than a native app needs, and fights (not helps) the Assigned Access hardening goal in §7. |

WinUI 3 wins because this is a **single-platform, hardware-adjacent, security-sensitive** app — exactly its home turf, and its native `Windows.System.Profile`/`Windows.Devices.Enumeration` access simplifies COM-port discovery (§2.2's WMI resolution) and Assigned Access interplay versus a framework that treats Windows as one of several targets.

### 6.2 Screen inventory (mirrors the tenant web app's information architecture)

```
Dashboard  →  Sites (list)  →  Site Detail (assets at site)  →  Asset Detail (devices on asset)  →  Device Detail (live telemetry)
                                                                                                            │
                                                                                                            ▼
                                                                                              Control Panel (§6.4 — routed through backend, inert until §5 gate lifts)
Alerts (list)  ──────────────────────────────────────────────────────────────────────────────────────────▶ same Device Detail drill-down
Tickets (list)
Settings  →  Ingestion Health (COM ports / LAN endpoints status — endpoint-local, not in the web app)
```

This is a deliberate 1:1 mirror of `frontend/src/pages/*` (`Dashboard`, `Sites`/`SiteDetail`, `Assets`/`AssetDetail`, `Devices`/`DeviceDetail`, `Alerts`, `Tickets`) plus one endpoint-specific screen (**Ingestion Health**) that has no web-app equivalent, since only the kiosk knows about its own local COM ports/LAN sources.

### 6.3 Touch/keyboard-mouse adaptation

WinUI 3's `UISettings.AnimationsEnabled`/pointer-type APIs let the shell detect the active input mode per-interaction (not per-device, since a touch display *with* an attached keyboard/mouse is explicitly a target class):

```csharp
public sealed class InputModeService : INotifyPropertyChanged
{
    public InputMode Current { get; private set; } = InputMode.Auto;

    public InputModeService(UIElement root)
    {
        root.AddHandler(UIElement.PointerPressedEvent, new PointerEventHandler(OnPointer), true);
    }

    private void OnPointer(object sender, PointerRoutedEventArgs e)
    {
        var next = e.Pointer.PointerDeviceType switch
        {
            PointerDeviceType.Touch => InputMode.Touch,
            PointerDeviceType.Pen   => InputMode.Touch,
            _                       => InputMode.Pointer,
        };
        if (next != Current) { Current = next; PropertyChanged?.Invoke(this, new(nameof(Current))); }
    }
}
```

Bound via `x:Bind` to two resource dictionaries (`Styles.Touch.xaml` — 48px+ minimum tap targets, larger spacing, no hover-only affordances; `Styles.Pointer.xaml` — denser layout, hover states, right-click context menus) swapped at the `NavigationView` root when `InputModeService.Current` changes. **No separate app build per input mode** — one binary, runtime-adaptive, since a device can legitimately be both (a touch display with a mouse plugged in for a technician).

### 6.4 Control panels — explicitly gated

Per §0/§4's binding constraint, **no control/command UI is wired live.** The Device Detail screen's "Control Panel" region is present in the navigation structure (so the UI doesn't need a future redesign when commands ship) but renders a disabled state with the same messaging pattern the web app already uses for not-yet-live features (`badge-soon`-equivalent) — never a functioning button that has nowhere real to send a command, per Device & Command Security Architecture §5.

---

## 7. Windows Kiosk Mode Integration

### 7.1 Assigned Access / Shell Launcher

Two real options; the choice depends on account model:

- **Multi-app kiosk (Assigned Access, `AssignedAccessConfiguration.xml`)** — locks a *standard* Windows account to a fixed set of allowed apps (just PeakLogic Edge), Start/taskbar suppressed. Simpler to provision via Intune/MDM, works on standard Windows 10/11 Pro/Enterprise without extra licensing.
- **Shell Launcher (`Microsoft-Windows-EmbeddedShellLauncher` feature, Enterprise/IoT Enterprise SKU)** — replaces `explorer.exe` itself with PeakLogic Edge as the literal shell. Stronger isolation (there is no desktop shell running underneath to escape *to*), but requires the Enterprise/IoT Enterprise SKU on the endpoint hardware.

**Recommendation: Shell Launcher where SKU permits (fleet-standardized hardware), Assigned Access as the fallback for customer-supplied/lower-SKU hardware.** Both are configured via the same MDM/provisioning package mechanism so the Configuration Layer (§8) doesn't need to know which mode a given site uses.

```xml
<!-- Assigned Access provisioning package fragment -->
<AssignedAccessConfiguration>
  <Profiles>
    <Profile Id="{PEAKLOGIC-EDGE-PROFILE}">
      <AllAppsList>
        <AllowedApps>
          <App AppUserModelId="PeakLogicSystems.EdgeApp_8xyzabc123!App"/>
        </AllowedApps>
      </AllAppsList>
      <StartLayout><!-- single tile, PeakLogic Edge --></StartLayout>
      <Taskbar ShowTaskbar="false"/>
    </Profile>
  </Profiles>
  <Configs>
    <Config>
      <Account>PeakLogicKioskAccount</Account>
      <DefaultProfile Id="{PEAKLOGIC-EDGE-PROFILE}"/>
    </Config>
  </Configs>
</AssignedAccessConfiguration>
```

### 7.2 Preventing escape to desktop

- Assigned Access itself disables Task Manager, Alt-Tab switching to other apps (none are allowed), and right-click desktop access by construction — there is no other app to switch to.
- **Keyboard shortcut suppression inside the app** as defense-in-depth (Win key combos, Alt-F4, Ctrl-Alt-Del are OS-level and can't be fully blocked by an app, but Assigned Access already handles the OS level) — the app itself intercepts and swallows `Alt+F4`/`Alt+Tab` at the window-message level so a keyboard-equipped kiosk doesn't even get a flicker of a close attempt.
- **Physical/BIOS hardening** (out of app scope, but required for a complete posture): disable boot-menu access, set a BIOS admin password, disable USB boot — covered in §9.4's hardening checklist, not something software alone can guarantee.

### 7.3 Auto-launch, auto-recovery, watchdog

```
┌──────────────────────┐
│ Windows boot           │
│  → auto-logon as       │
│    kiosk account        │
│  → Shell Launcher /     │
│    Assigned Access       │
│    starts PeakLogic Edge │
└──────────┬────────────┘
           │
           ▼
┌──────────────────────────────┐
│ PeakLogic.Watchdog (separate,  │  ← a second, minimal process — NOT the
│  minimal Win32 service)         │    main WinUI app itself, so a UI-thread
│  - monitors main app's PID/     │    hang/crash doesn't take the watchdog
│    heartbeat file                │    down with it
│  - restarts main app if it       │
│    exits or stops heartbeating   │
│    (>30s stale)                  │
│  - exponential backoff on         │
│    repeated crash-loop            │
│  - writes local audit log entry   │
│    on every restart (§9.4)        │
└──────────────────────────────┘
```

The watchdog runs as a Windows service (starts before user logon, survives the kiosk account's session independent of the shell), polls a heartbeat file the main app touches every 10s, and restarts the app process if the heartbeat goes stale — this is the standard "supervisor" pattern and is what makes an unattended site-deployed kiosk actually self-healing instead of requiring a truck roll for a hung UI thread.

---

## 8. Configuration + Redeployment

### 8.1 Configuration model

```json
{
  "siteIdentity": {
    "siteId": "b3f1e2c4-...-uuid",
    "tenantId": "a1b2c3d4-...-uuid",
    "displayName": "Riverside Pump Station",
    "assignedAccessMode": "shellLauncher"
  },
  "backend": {
    "apiBaseUrl": "https://xxxx.azurewebsites.net/v1",
    "entraClientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "entraTenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "entraApiScope": "api://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/.default",
    "iotHubEndpoint": "peaklogic-dev-iothub.azure-devices.net"
  },
  "devices": [
    {
      "deviceKey": "flow-p1",
      "thingName": "plg-0001",
      "mapper": "ModbusFlowSensorMapper",
      "transport": { "type": "serial", "comPortHint": "COM3", "usbVidPid": "0403:6001", "baudRate": 9600 },
      "certificateThumbprint": "A1B2C3D4E5F6..."
    },
    {
      "deviceKey": "bms-chlorinator",
      "thingName": "plg-0007",
      "mapper": "JsonPassthroughMapper",
      "transport": { "type": "restPoll", "uri": "http://192.168.1.42/api/status", "intervalSeconds": 30 },
      "certificateThumbprint": "F6E5D4C3B2A1...",
      "fieldMap": { "waterTempC": "temp_c", "saltPpm": "salt_ppm", "flowLpm": "flow_lpm" }
    }
  ],
  "ui": {
    "defaultInputMode": "auto",
    "theme": "dark",
    "idleReturnToDashboardSeconds": 120
  }
}
```

`siteIdentity`/`backend` are set once at commissioning (§8.3). `devices` grows over the kiosk's life as new sensors are attached — each entry corresponds to one already-claimed `devices` row server-side; the config file is a **local index into cloud state**, not a second source of truth for anything RLS/tenant-scoped.

### 8.2 Remote configuration updates

**Corrected v1.2 — previously an S3 object/CloudFront distribution.** The config file's non-secret fields are treated as a small, versioned document fetchable from a dedicated, low-traffic Azure Blob Storage object per site (`{stage}-edge-config` container, `{siteId}/config.json`), fronted by whichever CDN/Front Door service Infrastructure as Code (#16) selects for static asset delivery — same account/infra pattern as the tenant frontend's own static hosting, **new blob container, not a backend/API change**, since this is static config delivery, not a new data model. The endpoint app's polling/diff/apply behavior is unchanged — cloud-agnostic client logic.

### 8.3 Deployment strategy

- **Packaging: MSIX**, signed with an EV code-signing cert — required for silent/unattended install via provisioning package and for Windows' own SmartScreen/Defender trust without per-device manual overrides.
- **Initial commissioning:** a provisioning package (`.ppkg`, built via Windows Configuration Designer) bundles the MSIX, the Assigned Access/Shell Launcher profile, the kiosk account creation, and a *bootstrap* config containing only `siteIdentity`+`backend`+**the Entra refresh token** *(corrected v1.2 — previously Cognito)* (delivered once, out-of-band, DPAPI-sealed on first run) — device cert bundles for any devices known at commissioning time are included the same way; devices added later go through the ordinary claim flow from the kiosk UI itself.
- **Updates: a background update agent** (part of the Watchdog service, §7.3) checks an MSIX update feed (App Installer's `.appinstaller` URI pattern, self-hosted on the same CDN distribution as §8.2's config, corrected v1.2) on a scheduled interval, downloads and stages the update, and applies it during a configured low-traffic maintenance window — cloud-agnostic scheduling logic, unaffected by the cloud switch.
- **Versioning:** MSIX package version follows the same platform SemVer as the rest of PeakLogicSystems (`CHANGELOG.md` convention) — this app's releases are tracked as their own line item in that same changelog once implementation begins, not a separate versioning scheme.
- **Rollback:** the update agent retains the previous MSIX package on disk and reverts automatically if the new version fails a post-update health check (main app fails to reach `Running` heartbeat state within 2 minutes of the update-triggered restart) — mirrors the "redeploy from known-good" philosophy of the platform's own Rollback Procedure (`CLAUDE.md`), applied at the single-device scale instead of the fleet/stack scale.

---

## 9. Security Architecture Alignment

### 9.1 Process isolation

Three separate OS processes, not one monolith:

| Process | Runs as | Why separate |
|---|---|---|
| **PeakLogic.Watchdog** | Windows service, `LocalSystem` or a dedicated minimal service account | Must outlive/supervise the main app; a compromised or hung UI process shouldn't be able to touch the supervisor |
| **PeakLogic.Edge** (main WinUI app) | The kiosk standard user account (Assigned Access) — explicitly **not** an admin account | UI + ingestion + caching + backend clients all run here, under least privilege; a bug or exploited dependency in the touch UI has no path to system-level changes |
| **PeakLogic.Edge.ConfigTool** (optional, technician-only) | Launched only via a role-gated unlock sequence from within the kiosk UI (§9.2), runs elevated **only for the duration of a config change**, then exits | Keeps the always-running surface (Edge, Watchdog) permanently non-elevated; elevation is momentary and audited |

### 9.2 Role-based access (viewer vs. technician)

Two local roles, **deliberately not re-implementing the backend's `admin`/`operator` model** — this is a *device-presence* distinction (who's physically standing at the kiosk), not a tenant-data-access distinction, which stays entirely governed by whichever Entra identity the kiosk itself authenticates as *(corrected v1.2 — previously Cognito)* (§5.2) for anything that touches backend data.

- **Viewer (default):** dashboard, sites/assets/devices/alerts/tickets browsing — read-only, no PIN required.
- **Technician:** unlocked via a local PIN (stored as a salted hash, DPAPI-protected, **not** an Entra credential — this gate exists to prevent a passerby from fiddling with local config/ingestion settings, it is not a tenant-security boundary) — grants access to Ingestion Health, the ConfigTool launch, and acknowledging local-only diagnostic state. **Does not grant any additional backend API scope** — that's still bounded by the kiosk's own fixed `operator`-role Entra identity regardless of local PIN state, so a technician unlock can never let someone do something server-side the kiosk account itself isn't already permitted to do.

### 9.3 Secure local storage

| Secret | Storage mechanism |
|---|---|
| Device X.509 private keys | Windows Certificate Store, non-exportable where supported (§5.1) |
| Entra refresh token, cached access/ID tokens *(corrected v1.2 — previously Cognito)* | `ProtectedData.Protect` (DPAPI), `DataProtectionScope.LocalMachine` (survives the fixed kiosk account, not tied to a roaming user profile that doesn't apply here) |
| Technician PIN hash | DPAPI-protected, salted PBKDF2/Argon2 hash — never the raw PIN |
| Local SQLite cache (§4) | File-level: NTFS permissions scoped to the kiosk account + Watchdog service account only; no plaintext secrets are ever written into it (telemetry payloads only, which are not sensitive credential material) |

No secret is ever stored in the plain JSON config file (§8.1) — that file is deliberately non-secret and safe to include in the remote-config sync of §8.2.

### 9.4 Local audit logging

A local, append-only SQLite table (`local_audit_log`) — **distinct from and complementary to** the backend's own `audit_log_entries` (which only sees what reaches the API/MQTT layer). Captures endpoint-local events that never leave the device: watchdog restarts, technician-PIN unlocks, config updates applied, ingestion source failures/recoveries, MSIX update installs/rollbacks. Rotated/archived locally (not shipped to the cloud by default — this is operational/forensic data for whoever services the physical device, not tenant business data), with an optional future enhancement (not required for v1) to forward a summarized daily digest via the existing REST client if centralized visibility becomes a real need.

### 9.5 Hardening checklist (per-device, applied at commissioning)

- [ ] BIOS/UEFI admin password set; boot order locked to internal disk only; USB boot disabled
- [ ] BitLocker enabled on the system volume (protects device certs/DPAPI blobs at rest if hardware is stolen)
- [ ] Kiosk account: standard user, no admin rights, password not required to be known by site staff (auto-logon via provisioning package)
- [ ] Windows Update: configured for security-only updates on a maintenance window, not arbitrary feature updates that could disrupt Assigned Access config
- [ ] Windows Defender (or fleet-standard AV) active, with an exclusion only for the SQLite cache file path (performance, not a security bypass)
- [ ] Local firewall: outbound-only egress rules matching exactly what the app needs (API host, IoT Hub endpoint, MSIX update feed host, config blob/CDN host — corrected v1.2) — no general outbound allow
- [ ] RDP disabled; remote management, if needed, via the same MDM channel used for provisioning, not ad hoc RDP
- [ ] Physical: device in a locked enclosure/mount where site conditions warrant it (matches the "no-login opaque-token" Field Service Partner physical-security posture already assumed elsewhere in this platform's design)
- [ ] Outbound firewall allowlist updated to also include the VPN concentrator host (§10.1) alongside the API Gateway/IoT Core/MSIX-feed/config hosts already listed above

---

## 10. Hub Fleet Management, Patch Governance & VPN — added v1.1

Everything in §8 (MSIX packaging, background update agent) governs **PeakLogic Edge, the app itself.** This section covers the layer above it: managing the **Windows OS** across a fleet of unattended, physically remote machines — patch visibility, staged rollout, targeted push, and the private management channel that makes direct device reachability possible without opening any inbound port on a customer's network.

### 10.1 Outbound VPN — management plane only, not the data plane

**Decision: each hub establishes a persistent outbound WireGuard tunnel to a central VPN concentrator, used exclusively for management traffic.** Telemetry (§5.1, per-device MQTT) and kiosk REST calls (§5.2) are explicitly **not** routed through the VPN — they keep using their existing public HTTPS/MQTT-TLS paths unchanged. Splitting the two matters for blast radius: a VPN outage never affects telemetry uplink or the kiosk UI, and a telemetry/API outage never affects the ability to reach a hub for patching.

```
┌──────────────┐  outbound WireGuard, always-on   ┌───────────────────────────┐
│ PeakLogic Edge │──────────────────────────────────▶│ VPN Concentrator (Azure)   │  *(corrected v1.2 —
│ (per site)      │◀──────────────────────────────────│ - assigns stable private   │   previously AWS)
│                  │        UDP/51820                  │   IP per hub (by pubkey)    │
│ Local Management │                                    │ - WireGuard server on a     │
│ API (§10.3),      │                                    │   small Container Instance  │
│ bound ONLY to the  │                                    │   / Container App task,     │
│ WireGuard interface,│                                   │   or a managed offering     │
│ never the public NIC │                                  │   if available at the time  │
│                       │                                  └───────────┬───────────────┘
└──────────────────┘                                                  │
                                                                        ▼
                                                          ┌───────────────────────────┐
                                                          │ Fleet Management Plane      │
                                                          │ (super-admin console, §10.4)│
                                                          │ reaches hubs by their stable │
                                                          │ private VPN IP — no NAT      │
                                                          │ traversal, no inbound port    │
                                                          │ ever opened on-site           │
                                                          └───────────────────────────┘
```

**Why WireGuard, not a full Azure VPN Gateway / Site-to-Site setup** *(corrected v1.2 — previously AWS Client VPN)*: those are built for routing an entire customer network into the cloud, which is far more than one small hub process needs and would require customer network changes this project has no standing to request. A per-device WireGuard tunnel is device-initiated, needs zero customer-side network configuration (it's outbound UDP, same firewall-friendliness posture as the port-443 preference elsewhere in this document), and each hub's tunnel is independently revocable (delete its peer entry) without touching any other hub — a clean match for the decommissioning discipline Device & Command Security Architecture §3.2 already established for device certs.

**Authentication:** WireGuard's own keypair, generated at commissioning, private key DPAPI/Cert-Store-protected exactly like the device certs (§9.3) — a second, independent credential from the Cognito/IoT identities, so compromising one doesn't imply compromising the others.

### 10.2 Two distinct patch surfaces

| Surface | What it covers | Governed by |
|---|---|---|
| **App-level** | PeakLogic Edge's own MSIX package | §8.3's update agent (already specified) |
| **OS-level** | Windows security/feature updates (KBs) | This section, new |

They are deliberately kept as two separate approval/rollout tracks — a critical Windows security patch and a routine app feature release have completely different urgency profiles and should never be forced through the same staging pipeline.

### 10.3 Local Patch Reporting Agent

Part of the existing Watchdog service (§7.3), not a new process — it already runs elevated-enough and already exists on every hub. Adds:

- **Enumeration:** queries the Windows Update Agent (WUA) COM API (`Microsoft.Update.Session`) on a schedule (default every 6h) for pending updates, their KB IDs, and Microsoft's own classification (`Critical`, `Security`, `Important`, `Feature`, etc.) — this classification is what drives the "critical patch" flagging the super-admin console surfaces, not a locally-invented severity scheme.
- **Reporting:** posts a compact status document over the VPN-bound Local Management API's outbound leg (or, simpler and equally valid, over the existing REST API client's connection — patch status is not sensitive control-plane data, no VPN requirement for the *reporting* direction, only for direct *reach-in* actions in §10.4) to a new fleet-management endpoint (not yet built — see §12 Open Questions).
- **Enforcement:** does **not** decide what to install. Installation is driven entirely by **Windows Update for Business (WUfB) deferral policy**, configured per-hub via the existing Group Policy/MDM CSP mechanism Windows already provides — the agent's job is visibility and a narrow "install this approved-and-promoted set now" trigger (`usoclient StartInstall` scoped to specific KBs), not reimplementing what WUfB already does well.

```csharp
public sealed class PatchReportingAgent
{
    public async Task<PatchStatusReport> ScanAsync()
    {
        using var updateSession = new UpdateSession(); // Microsoft.Update.Session COM interop
        var searcher = updateSession.CreateUpdateSearcher();
        var result = searcher.Search("IsInstalled=0 or IsInstalled=1");

        var pending = result.Updates.Cast<IUpdate>()
            .Where(u => !u.IsInstalled)
            .Select(u => new PendingPatch(u.Identity.UpdateID, u.Title, ClassifyFrom(u.MsrcSeverity), u.KBArticleIDs.Cast<string>()))
            .ToList();

        return new PatchStatusReport(HubId: _cfg.SiteIdentity.SiteId, ScannedAt: DateTimeOffset.UtcNow, Pending: pending, InstalledOsBuild: Environment.OSVersion.VersionString);
    }
}
```

### 10.4 Super-admin console: review, ring, and targeted rollout

**Update rings, driven by the existing `EdgeConfig` model (§8.1), one new field:**

```json
{
  "patchGovernance": {
    "updateRing": "canary",   // "canary" | "broad" | "production" — assigned per hub, super-admin-editable
    "wufbDeferDaysFeature": 14,
    "wufbDeferDaysQuality": 3
  }
}
```

Workflow, mirroring the same "draft → review → approve → promote" discipline this project already applies to its own architecture docs, applied here to patches instead:

1. Every reporting hub's pending-KB list rolls up into the super-admin console's **Patch Review** screen — grouped by KB, showing how many hubs (and which rings) it's pending on, and Microsoft's own severity classification surfaced directly (a `Critical`/`Security` KB gets a visible badge, matching this project's existing badge-driven UI language).
2. An admin explicitly **approves a KB for the `canary` ring** — a small, deliberately-chosen subset of hubs (a handful of low-risk sites, configured via `updateRing: "canary"` in each hub's config). This does not install anything by itself; it flips those hubs' WUfB deferral window down to zero for that specific KB (or, for out-of-band critical patches WUfB's normal cadence is too slow for, triggers the agent's narrow `usoclient StartInstall` path directly).
3. After a configurable bake period (default 72h) with no regression signal (hub still reporting normal heartbeat/telemetry — regression detection here is intentionally simple: "did the hub go dark," not a sophisticated health-scoring system), the admin **promotes the KB to `broad`**, then eventually **`production`** — each promotion is a deliberate console action, never automatic, and every promotion is written to the local audit log (§9.4) on the affected hubs plus a corresponding fleet-level audit record.
4. **Targeted push** outside the ring model — e.g. "patch only the 12 hubs in Texas" — is just a saved filter over the same hub inventory (by `siteId`/region metadata already in `EdgeConfig.siteIdentity`), not a separate mechanism.

**Critical-patch notification:** the moment the Patch Reporting Agent reports a new `Critical`/`Security`-classified KB from *any* hub, the fleet-management plane fires a notification to whoever holds the compliance/monitoring-owner role (reuses the same Action-Group-plus-owner-email pattern the platform's own Azure Monitor Alerts already use, SOC 2 Control Mapping §4 — corrected v1.2, previously CloudWatch/SNS) — this is the "direct connections and notifications... so these can be flagged and tested in dev" requirement: the flag is automatic and immediate, the dev-ring rollout is a deliberate human action taken in response to it, not automated.

### 10.5 What this section does *not* solve (real, disclosed gaps)

- **The fleet-management backend (hub inventory, patch-status ingestion endpoint, ring/promotion API, VPN concentrator infrastructure) does not exist yet.** Everything in §10.1–§10.4 is a design, the same "specified, not shipped" status as the rest of this document (§0) — but worth restating here specifically because this section, unlike most of the rest of the document, **does** require new backend/infra work (a small new API surface + the VPN concentrator stack), not a zero-backend-change bridge like the telemetry design in §1–§9. Scope it as its own implementation phase, likely its own Bicep module (`fleet-management.bicep`, corrected v1.2 — previously `FleetManagementStack`) and a handful of new `/v1/admin/hubs/*`-style endpoints under the existing Internal Administration Console surface (`/v1/admin/*`, Security Architecture §2.5) — reusing PeakLogic's own Entra ID workforce-tenant staff auth, not inventing a fourth identity surface.
- **WireGuard concentrator sizing/HA** is not specified — a single small instance is fine for a pilot fleet, but this needs real capacity planning once hub count is nontrivial.
- **Rollback of an already-installed OS patch** (vs. simply not promoting a pending one) is out of scope here — Windows' own patch-uninstall mechanics apply, but there's no fleet-orchestrated "revert this KB across the canary ring" flow designed yet.

---

## 11. Implementation Blueprint

### 10.1 Build sequence

1. **Configuration + Security Layer skeleton** — config file schema, DPAPI secret store, Cert Store integration. Everything else depends on this existing first.
2. **Local Caching Layer** — SQLite schema + `TelemetryCache`/`TelemetryFlusher`, tested standalone against a mock MQTT client before any real ingestion exists.
3. **Serial + Network Ingestion Layers** — one mapper per pilot device type, wired to the Telemetry Bus (§2.1).
4. **MQTT Publisher Pool + REST API Client** — real backend integration; this is the point at which the app can be validated end-to-end against a real (dev-stage) Azure environment (corrected v1.2) using devices provisioned via the DPS-ported `provision-devices.ts`.
5. **Kiosk UI (WinUI 3)** — screens per §6.2, built against the now-working data layer, not mocked separately (avoids the tenant frontend's own "mock data" gap being repeated here).
6. **Watchdog service + Assigned Access/Shell Launcher provisioning package** — turns the app into an actual kiosk, not just a windowed app.
7. **MSIX packaging + update agent** — last, once the app's shape is stable enough that update/rollback mechanics have something real to exercise.

### 10.2 Recommended project structure

```
PeakLogicEdge/
├── PeakLogicEdge.sln
├── src/
│   ├── PeakLogicEdge.Core/              # framework-agnostic: envelopes, mappers, cache, backend clients
│   │   ├── Ingestion/
│   │   │   ├── IIngestionSource.cs
│   │   │   ├── SerialIngestionSource.cs
│   │   │   ├── RestPollIngestionSource.cs
│   │   │   ├── WebSocketIngestionSource.cs
│   │   │   ├── LocalMqttIngestionSource.cs
│   │   │   └── IngestionOrchestrator.cs
│   │   ├── Normalization/
│   │   │   ├── TelemetryEnvelope.cs
│   │   │   ├── IPayloadMapper.cs
│   │   │   └── Mappers/                 # one file per device type
│   │   ├── Caching/
│   │   │   ├── TelemetryCache.cs
│   │   │   ├── TelemetryFlusher.cs
│   │   │   └── ApiCallCache.cs
│   │   ├── Publishing/
│   │   │   ├── DeviceMqttClientFactory.cs
│   │   │   └── MqttPublisherPool.cs
│   │   ├── Backend/
│   │   │   ├── BackendAuthClient.cs
│   │   │   └── PeakLogicApiClient.cs
│   │   ├── Security/
│   │   │   ├── ISecretStore.cs
│   │   │   └── DpapiSecretStore.cs
│   │   └── Configuration/
│   │       ├── EdgeConfig.cs
│   │       └── ConfigSyncService.cs
│   ├── PeakLogicEdge.App/               # WinUI 3 shell
│   │   ├── App.xaml(.cs)
│   │   ├── Views/                       # Dashboard, Sites, SiteDetail, Assets, AssetDetail, Devices, DeviceDetail, Alerts, Tickets, IngestionHealth
│   │   ├── ViewModels/
│   │   ├── Services/
│   │   │   └── InputModeService.cs
│   │   └── Styles/
│   │       ├── Styles.Touch.xaml
│   │       └── Styles.Pointer.xaml
│   ├── PeakLogicEdge.Watchdog/           # separate Windows Service project
│   │   └── WatchdogService.cs
│   └── PeakLogicEdge.ConfigTool/         # minimal elevated-only technician tool
├── deploy/
│   ├── provisioning/                    # .ppkg project, Assigned Access XML, Shell Launcher config
│   └── msix/                            # packaging manifest, signing config, .appinstaller feed template
└── test/
    ├── PeakLogicEdge.Core.Tests/         # mappers, cache durability, backoff policy — unit
    └── PeakLogicEdge.Integration.Tests/  # against a real dev-stage Azure IoT Hub + API (corrected v1.2; mirrors backend's own integration-test discipline)
```

### 10.3 Example class responsibilities (summary table)

| Class | Responsibility |
|---|---|
| `IngestionOrchestrator` | Owns lifecycle of every `IIngestionSource`; restart-on-failure per source |
| `TelemetryBus` | In-process bounded channel decoupling ingestion from normalization |
| `IPayloadMapper` implementations | The only device-type-specific code in the app |
| `TelemetryCache` / `TelemetryFlusher` | Durable queue + drain loop; guarantees delivery |
| `DeviceMqttClientFactory` / `MqttPublisherPool` | One authenticated MQTT identity per claimed device |
| `BackendAuthClient` / `PeakLogicApiClient` | Kiosk's own Cognito-authenticated REST access |
| `EdgeConfig` / `ConfigSyncService` | Local config model + remote sync (§8.2) |
| `DpapiSecretStore` | All local secret at-rest protection |
| `InputModeService` | Runtime touch/pointer detection driving UI style swap |
| `WatchdogService` | Process supervision, auto-recovery, update-triggered health check |

### 10.4 Representative snippets already shown above

- Serial ingestion: §2.2
- Network ingestion (REST/WebSocket/local-MQTT): §2.3
- Telemetry packaging (`TelemetryEnvelope`): §3.1–3.2
- Backend publishing (MQTT + REST): §5.1–5.2
- Caching/flush loop: §4.2
- Kiosk input-mode adaptation: §6.3

---

## 12. Open Questions

1. **Certificate delivery mechanism at scale** — this document assumes commissioning-time bundling via provisioning package for known devices and normal claim-flow provisioning for devices added later, but doesn't specify the operational tooling for *bulk* pre-provisioning many kiosks' worth of device certs before truck-roll. Worth a follow-up operational runbook, not an architecture change.
2. **The `{stage}-edge-config` blob container is new infra** *(corrected v1.2 — previously an S3 bucket)* — not yet created. A small addition to `infra-azure/frontend.bicep` (or a sibling module) when implementation begins; flagged here so it isn't assumed to already exist.
3. **Command Dispatch Layer's actual activation path** is intentionally undesigned beyond "subscribe, currently inert" — when Device & Command Security Architecture §5's gate lifts, this document needs a corresponding amendment to specify how the endpoint app's UI (§6.4) goes from disabled to live, not just how the backend does.
4. **Kiosk-per-site Cognito account provisioning is manual today** (via `POST /v1/settings/team`, same as any team invite) — at fleet scale this likely wants a dedicated admin-console flow (`/v1/admin/tenants/{tenantId}/users`, already real per the Internal Administration Console) rather than a tenant admin doing it by hand per site; worth revisiting once kiosk deployment count is nontrivial.
5. **Local Rule Engine / fail-safe-locally scope** — §0/§4.2 of Device & Command Security Architecture establishes the principle that safety-critical actuation must trip locally, not depend on cloud round-trips. This document doesn't yet specify whether/how PeakLogic Edge itself would host such local logic (e.g. a direct relay wired to the Windows box) versus that always living in device-native firmware — real product scoping needed before this is architected, not assumed here.
6. **Path B (direct OEM cloud-to-cloud, §1.5) has no backend design at all** — flagged, not designed, and explicitly out of this document's scope. Needs its own architecture artifact before any OEM integration work starts.
7. **§10's fleet-management backend is entirely new work** — hub inventory, patch-status ingestion, ring/promotion API, and the VPN concentrator infrastructure don't exist. Unlike the rest of this document (a zero-backend-change bridge), §10 is a real, separate implementation phase with its own CDK stack and API surface — do not assume it ships alongside §1–§9.
8. **WireGuard concentrator capacity/HA planning (§10.1)** is unaddressed — fine for a pilot fleet, needs real sizing work before broad rollout.

---

## 13. Traceability

| Section | Traces to |
|---|---|
| §1.2–§1.3, §5.1 | Device & Command Security Architecture §2 (Azure IoT Hub/DPS device identity, corrected v1.2) |
| §2.4, §4.3 (MQTT QoS) | Device & Command Security Architecture §2 (IoT Hub per-device topic scoping — corrected v1.2, previously `iot-stack.ts`) |
| §3.1 | `backend/shared/types.ts` `IoTIngestEvent`, `backend/ingest/rules.ts` `RULES_BY_CATEGORY` — unchanged, cloud-agnostic |
| §4 | General guaranteed-delivery discipline — endpoint-specific, unaffected by cloud switch |
| §5.1 (cert pinning) | Security Architecture §4.2's Azure Database for PostgreSQL CA-bundle pinning — same principle, mirrored (corrected v1.2) |
| §5.2 | `backend/api/routes/settings-team.ts` (`POST /v1/settings/team`), Security Architecture §2.1 (Entra External ID tenant model, corrected v1.2) |
| §6.4, §11 item 3 | Device & Command Security Architecture §4/§5 (Direct-Methods-based command channel design + MVP gate, corrected v1.2) |
| §8.3 (versioning/rollback) | `CLAUDE.md` → Version Control Standards, Rollback Procedure |
| §9.2 | Deliberately independent of `admin`/`operator` RBAC — device-presence gate, not a tenant-data gate |
| §10.1 | Deployment Architecture §2 (resource-group-per-stage), corrected v1.2 (previously AWS account model) |

---

## 14. Review Log

Not yet reviewed — Draft v1.0, first pass. Recommend a dedicated review pass before implementation begins, focused on: (1) confirming the "N concurrent per-device MQTT identities" design (§1.2) is acceptable from an ops/commissioning-burden standpoint versus its architectural cleanliness, since it does mean every locally-bridged sensor needs its own real cert bundle physically delivered to the site; (2) re-verifying §0's CC-3.1/CC-4.1 gate against Device & Command Security Architecture at the time implementation actually starts, in case that document's own §5 gate has since been lifted by a roadmap decision.

**v1.2 (2026-07-17), the first review pass specific to the `PeakLogic-Azure` fork.** Checked every AWS-specific reference against this document's own stated boundary (§0's fork note) — identity/networking sections corrected, core hub logic confirmed untouched, not re-verified line-by-line since none of it depends on cloud APIs.

1. **Confirmed the amendment's own scope claim, not assumed**: grepped this document for every AWS-service mention (Cognito, IoT Core, S3, CloudFront, SNS, CloudWatch, EC2/Fargate, AWS Client VPN) and corrected each one at its actual location (§0, §1.3, §5.1, §5.2, §8.1–8.3, §9.2–9.3, §10.1, §10.4–10.5, §11, §12, §13) — none were missed, none were over-corrected into sections that don't actually reference AWS (§1–4, §6–7, §9.1/9.4–9.5 confirmed untouched).
2. **A real, disclosed verification gap flagged rather than guessed**: §5.1's Azure IoT Hub root-CA identity was explicitly NOT asserted without a fresh check — Microsoft has changed IoT Hub's TLS root before, so this is named as a real, open verification item for implementation time, not filled in with an unverified guess the way a less careful pass might have.
3. **The Entra token-refresh flow (§5.2) was corrected to the real OIDC `grant_type=refresh_token` shape**, not left as a renamed Cognito `AuthFlow` call — checked against Security Architecture §2.1's own already-verified Entra External ID design rather than assumed to be a drop-in parameter swap.

---

## Revision History

**v1.2 (2026-07-17)** — the first amendment specific to the `PeakLogic-Azure` fork, per `azure-restructuring-plan.md` item 25: a 🔵 amendment targeting exactly the identity/networking boundary that item named, not a full rewrite.

- **§0/§1.3 corrected**: Azure IoT Hub + DPS replaces AWS IoT Core; Entra External ID replaces Cognito, in the document's own scope statement and system diagram.
- **§5.1 rewritten**: DPS individual enrollment replaces `CreateKeysAndCertificateCommand`; a real, disclosed verification gap flagged for the IoT Hub root-CA identity rather than guessed.
- **§5.2 rewritten**: Entra External ID's standard OIDC refresh-token grant replaces Cognito's `REFRESH_TOKEN_AUTH`, same underlying pattern (cached refresh token, DPAPI-protected, no interactive kiosk login).
- **§8.1–8.3, §9.3 corrected**: config schema fields, commissioning bootstrap, and secret-storage table all reference Entra/Azure Blob Storage instead of Cognito/S3.
- **§10.1, §10.4–10.5 corrected**: the fleet-management VPN concentrator, patch-notification mechanism, and future backend implementation references all point at their real Azure equivalents (Azure Monitor Action Groups, a Bicep module instead of a CDK stack, PeakLogic's own Entra ID workforce tenant instead of `StaffPool`).
- **Confirmed unchanged, not silently assumed**: §1–4 (ingestion, normalization, local caching/durable-queue design), §6–7 (kiosk UI, Assigned Access/Shell Launcher, watchdog), and §9.1/9.4–9.5 (process isolation, local audit logging, hardening checklist minus the one corrected firewall-host line) — none of this logic touches a cloud API directly, verified by grep rather than assumed from the plan's own disposition note alone.
