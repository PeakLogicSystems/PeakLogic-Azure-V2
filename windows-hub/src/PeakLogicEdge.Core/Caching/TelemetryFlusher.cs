using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Ingestion;
using PeakLogicEdge.Core.Publishing;

namespace PeakLogicEdge.Core.Caching;

// §4.2 — drains TelemetryCache, publishes via MqttPublisherPool. This is
// what makes delivery guaranteed rather than best-effort: every row was
// already durably written before this loop ever sees it, so a crash mid-
// publish just means the row is still 'pending' next time this runs.
public sealed class TelemetryFlusher
{
    private readonly TelemetryCache _cache;
    private readonly MqttPublisherPool _publishers;
    private readonly ILogger _log;

    public TelemetryFlusher(TelemetryCache cache, MqttPublisherPool publishers, ILogger log)
    {
        _cache = cache;
        _publishers = publishers;
        _log = log;
    }

    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var batch = await _cache.ReadReadyBatchAsync(limit: 200);
            foreach (var row in batch)
            {
                var client = _publishers.GetClientFor(row.ThingName);
                if (client is null || !client.IsConnected)
                {
                    await _cache.DeferAsync(row.Id, BackoffPolicy.NextDelay(row.ThingName));
                    continue;
                }

                try
                {
                    await _publishers.PublishAsync(row.ThingName, row.Payload, ct);
                    await _cache.MarkSentAsync(row.Id);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Publish failed for outbound row {Id} ({ThingName}), attempt {Attempts}",
                        row.Id, row.ThingName, row.Attempts + 1);
                    await _cache.RecordFailureAsync(row.Id);
                }
            }

            var pending = await _cache.PendingCountAsync();
            if (pending > 5000)
            {
                // §4.3 — backpressure signal. The Kiosk UI layer (not yet
                // built) is the "visible, not hidden telemetry loss risk"
                // half of this; the flusher's own job stops at making the
                // number available to whatever reads it.
                _log.LogWarning("Outbound telemetry queue depth is {Pending} — connectivity may be degraded", pending);
            }

            try { await Task.Delay(TimeSpan.FromSeconds(2), ct); }
            catch (OperationCanceledException) { return; }
        }
    }
}
