using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Caching;
using PeakLogicEdge.Core.Ingestion;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Agent;

// The portable headless hub agent (dual-platform-hub-design.md §3): the real
// ingestion -> normalization -> durable SQLite queue pipeline, extracted from
// the old Host harness so the SAME agent runs everywhere — a Linux Azure IoT
// Edge module / systemd unit, a Windows Service, or the dev console — instead of
// each launcher keeping its own copy of the pipeline. Pure net8.0; no OS-
// specific code.
//
// Uplink (publishing the queued telemetry) is intentionally NOT wired here yet:
// with no deployed backend / IoT Hub, every reading lands in the durable queue
// and stays pending — the exact offline-durability behavior. Transport is §7.4
// (infra-gated), added behind this pipeline without changing it.
public sealed class HubAgent
{
    private readonly Func<ChannelWriter<RawReading>, IEnumerable<IIngestionSource>> _sourceFactory;
    private readonly HubAgentOptions _options;
    private readonly ILogger _log;

    /// <param name="sourceFactory">
    /// Given the bus writer (the sink), produces the ingestion sources. The
    /// agent owns the bus, so sources are built against its writer — this
    /// decouples source construction from the agent's lifecycle.
    /// </param>
    public HubAgent(
        Func<ChannelWriter<RawReading>, IEnumerable<IIngestionSource>> sourceFactory,
        HubAgentOptions options,
        ILogger log)
    {
        _sourceFactory = sourceFactory;
        _options = options;
        _log = log;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_options.CachePath)!);
        await using var cache = await TelemetryCache.OpenAsync(_options.CachePath);

        var bus = new TelemetryBus();
        var orchestrator = new IngestionOrchestrator(_log);
        foreach (var source in _sourceFactory(bus.Writer)) orchestrator.Register(source);

        _log.LogInformation("HubAgent starting — durable cache at {Path}", _options.CachePath);
        _log.LogInformation("No uplink configured — readings are durably queued, not published (expected until transport is wired).");

        var ingestion = orchestrator.RunAsync(ct);
        var normalization = NormalizeLoopAsync(bus, cache, ct);
        var status = StatusLoopAsync(cache, ct);

        // Any loop returning means we're shutting down (cancellation) or one
        // faulted; let the others observe cancellation, then drain.
        await Task.WhenAny(ingestion, normalization, status);
        await Task.WhenAll(Swallow(ingestion), Swallow(normalization), Swallow(status));
        _log.LogInformation("HubAgent stopped. {Pending} readings remain durably queued.", await SafePendingAsync(cache));
    }

    private async Task NormalizeLoopAsync(TelemetryBus bus, TelemetryCache cache, CancellationToken ct)
    {
        try
        {
            await foreach (var reading in bus.Reader.ReadAllAsync(ct))
            {
                var thingName = _options.ThingNameByDeviceKey.GetValueOrDefault(reading.SourceDeviceKey, reading.SourceDeviceKey);
                var envelope = new TelemetryEnvelope
                {
                    ThingName = thingName,
                    ObservedAt = reading.ObservedAt,
                    Metrics = reading.Metrics,
                };
                await cache.EnqueueAsync(envelope.ThingName, envelope.ToWirePayload());
                _log.LogDebug("Queued {ThingName}: {Count} metrics", thingName, reading.Metrics.Count);
            }
        }
        catch (OperationCanceledException) { /* clean shutdown */ }
    }

    private async Task StatusLoopAsync(TelemetryCache cache, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { await Task.Delay(_options.StatusInterval, ct); }
            catch (OperationCanceledException) { return; }
            _log.LogInformation("Status: {Pending} readings durably queued", await cache.PendingCountAsync());
        }
    }

    private static async Task<long> SafePendingAsync(TelemetryCache cache)
    {
        try { return await cache.PendingCountAsync(); }
        catch { return -1; }
    }

    private static Task Swallow(Task t) => t.ContinueWith(_ => { }, TaskScheduler.Default);
}
