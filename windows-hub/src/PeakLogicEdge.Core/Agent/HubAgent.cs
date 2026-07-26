using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Caching;
using PeakLogicEdge.Core.Ingestion;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Agent;

/// A reading that has just been normalized and durably queued — the observation
/// payload a host (e.g. the kiosk UI) hooks to project into its own state.
public sealed record HubReadingEvent(string ThingName, RawReading Reading);

// The portable headless hub agent (dual-platform-hub-design.md §3): the real
// ingestion -> normalization -> durable SQLite queue pipeline, so the SAME agent
// runs everywhere — a Linux Azure IoT Edge module / systemd unit, a Windows
// Service, the WinUI kiosk (via EdgeRuntimeService), or the dev console — instead
// of each launcher keeping its own copy of the pipeline. Pure net8.0.
//
// Observation is via two optional async hooks (OnReadingQueued / OnStatus) and
// the IngestionHealth property — a UI-agnostic seam. Headless launchers leave
// the hooks null; the kiosk sets them to drive its observable state. Uplink
// (publishing) is intentionally NOT wired yet: readings durably queue, which is
// the offline-durability behavior; transport is §7.4 (infra-gated).
public sealed class HubAgent
{
    private readonly TelemetryBus _bus = new();
    private readonly IngestionOrchestrator _orchestrator;
    private readonly HubAgentOptions _options;
    private readonly ILogger _log;

    /// <param name="sourceFactory">
    /// Given the bus writer (the sink), produces the ingestion sources. The
    /// agent owns the bus, so sources are built against its writer.
    /// </param>
    public HubAgent(
        Func<ChannelWriter<RawReading>, IEnumerable<IIngestionSource>> sourceFactory,
        HubAgentOptions options,
        ILogger log)
    {
        _options = options;
        _log = log;
        _orchestrator = new IngestionOrchestrator(log);
        foreach (var source in sourceFactory(_bus.Writer)) _orchestrator.Register(source);
    }

    /// Per-source ingestion health (running/crashed/stopped), live from the orchestrator.
    public IReadOnlyDictionary<string, string> IngestionHealth => _orchestrator.Health;

    /// Invoked after each reading is durably queued (e.g. to update a UI). Optional; async.
    public Func<HubReadingEvent, CancellationToken, Task>? OnReadingQueued { get; set; }

    /// Invoked each status tick with the current durable-queue depth. Optional; async.
    public Func<long, CancellationToken, Task>? OnStatus { get; set; }

    public async Task RunAsync(CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_options.CachePath)!);
        await using var cache = await TelemetryCache.OpenAsync(_options.CachePath);

        _log.LogInformation("HubAgent starting — durable cache at {Path}", _options.CachePath);
        _log.LogInformation("No uplink configured — readings are durably queued, not published (expected until transport is wired).");

        var ingestion = _orchestrator.RunAsync(ct);
        var normalization = NormalizeLoopAsync(cache, ct);
        var status = StatusLoopAsync(cache, ct);

        await Task.WhenAny(ingestion, normalization, status);
        await Task.WhenAll(Swallow(ingestion), Swallow(normalization), Swallow(status));
        _log.LogInformation("HubAgent stopped. {Pending} readings remain durably queued.", await SafePendingAsync(cache));
    }

    private async Task NormalizeLoopAsync(TelemetryCache cache, CancellationToken ct)
    {
        try
        {
            await foreach (var reading in _bus.Reader.ReadAllAsync(ct))
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

                if (OnReadingQueued is { } hook)
                {
                    // A UI/observer callback must never be able to stop telemetry
                    // from queuing — isolate its failures from the pipeline.
                    try { await hook(new HubReadingEvent(thingName, reading), ct); }
                    catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
                    catch (Exception ex) { _log.LogWarning(ex, "OnReadingQueued observer threw — ignored"); }
                }
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

            var pending = await cache.PendingCountAsync();
            _log.LogInformation("Status: {Pending} readings durably queued", pending);

            if (OnStatus is { } hook)
            {
                try { await hook(pending, ct); }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { return; }
                catch (Exception ex) { _log.LogWarning(ex, "OnStatus observer threw — ignored"); }
            }
        }
    }

    private static async Task<long> SafePendingAsync(TelemetryCache cache)
    {
        try { return await cache.PendingCountAsync(); }
        catch { return -1; }
    }

    private static Task Swallow(Task t) => t.ContinueWith(_ => { }, TaskScheduler.Default);
}
