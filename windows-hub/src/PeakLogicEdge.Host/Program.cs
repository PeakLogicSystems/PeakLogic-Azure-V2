using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Caching;
using PeakLogicEdge.Core.Ingestion;
using PeakLogicEdge.Core.Normalization;

// This is the FIRST runnable milestone of the hub app — proves the real
// pipeline (ingestion -> normalization -> durable SQLite caching) works
// end to end, without depending on anything not built/deployed yet:
//
//   - No real AWS backend deployed (user explicitly holding off on this)
//     -> publishing is deliberately NOT attempted; every reading lands in
//        the durable queue and stays 'pending', which is exactly the
//        offline-durability behavior the architecture doc's §4 describes
//        for a real connectivity outage. Nothing here is faked to LOOK
//        like it's publishing when it isn't.
//   - No real sensor hardware wired up yet -> SimulatedIngestionSource
//     stands in for a real SerialIngestionSource/RestPollIngestionSource,
//     using the Pentair IntelliChlor example from the original product
//     ask (temp_c/salt_ppm/flow_lpm) as the demo device.
//
// Swap SimulatedIngestionSource for a real one, and un-comment the
// TelemetryFlusher/MqttPublisherPool wiring at the bottom, once real
// hardware and a real deployed AWS backend both exist — nothing else in
// this file needs to change to make that swap.

using var loggerFactory = LoggerFactory.Create(builder => builder
    .AddSimpleConsole(o => { o.SingleLine = true; o.TimestampFormat = "HH:mm:ss "; })
    .SetMinimumLevel(LogLevel.Information));
var log = loggerFactory.CreateLogger("PeakLogicEdge");

var cacheDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PeakLogicEdge");
Directory.CreateDirectory(cacheDir);
var cachePath = Path.Combine(cacheDir, "edge-cache.db");

log.LogInformation("PeakLogic Edge — dev console harness");
log.LogInformation("Local cache: {Path}", cachePath);
log.LogInformation("No AWS backend configured — readings will be durably queued, not published. This is expected.");

var bus = new TelemetryBus();
var orchestrator = new IngestionOrchestrator(log);

// Demo device: mirrors the Pentair IntelliChlor salt chlorinator example
// from the product ask — one device, three telemetry channels.
orchestrator.Register(new SimulatedIngestionSource(
    deviceKey: "demo-chlorinator",
    metrics: new Dictionary<string, (double Base, double Spread)>
    {
        ["temp_c"] = (27.8, 1.5),
        ["salt_ppm"] = (3200, 100),
        ["flow_lpm"] = (112, 8),
    },
    sink: bus.Writer,
    log: log,
    interval: TimeSpan.FromSeconds(5)));

// deviceKey -> thingName mapping — in the real app this comes from
// EdgeConfig.Devices (Configuration/EdgeConfig.cs); hardcoded here since
// this harness has no real commissioned config file yet.
var thingNameByDeviceKey = new Dictionary<string, string> { ["demo-chlorinator"] = "plg-demo-0001" };

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

await using var cache = await TelemetryCache.OpenAsync(cachePath);

var ingestionTask = orchestrator.RunAsync(cts.Token);

var normalizationTask = Task.Run(async () =>
{
    await foreach (var reading in bus.Reader.ReadAllAsync(cts.Token))
    {
        var thingName = thingNameByDeviceKey.GetValueOrDefault(reading.SourceDeviceKey, reading.SourceDeviceKey);
        var envelope = new TelemetryEnvelope
        {
            ThingName = thingName,
            ObservedAt = reading.ObservedAt,
            Metrics = reading.Metrics,
        };
        await cache.EnqueueAsync(envelope.ThingName, envelope.ToWirePayload());
        log.LogInformation("Queued: {ThingName} {Metrics}", thingName,
            string.Join(", ", reading.Metrics.Select(kv => $"{kv.Key}={kv.Value}")));
    }
});

var statusTask = Task.Run(async () =>
{
    while (!cts.IsCancellationRequested)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(15), cts.Token); }
        catch (OperationCanceledException) { return; }

        var pending = await cache.PendingCountAsync();
        log.LogInformation("Status: {Pending} readings durably queued, awaiting a real backend to publish to", pending);
    }
});

log.LogInformation("Running. Press Ctrl+C to stop.");
await Task.WhenAny(ingestionTask, normalizationTask, statusTask);
cts.Cancel();
await Task.WhenAll(
    ingestionTask.ContinueWith(_ => { }, TaskScheduler.Default),
    normalizationTask.ContinueWith(_ => { }, TaskScheduler.Default),
    statusTask.ContinueWith(_ => { }, TaskScheduler.Default));

log.LogInformation("Stopped.");
