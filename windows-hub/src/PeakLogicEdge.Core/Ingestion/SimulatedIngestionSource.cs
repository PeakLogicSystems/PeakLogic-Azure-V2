using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Ingestion;

// NOT part of the original architecture spec's three real ingestion types
// (§2.2/§2.3) — added so there's something to actually run end-to-end
// today, before any real sensor is wired up to the hub. Generates
// plausible-looking telemetry on a timer for a configured metric set (e.g.
// temp_c/salt_ppm/flow_lpm, matching the Pentair IntelliChlor example from
// the original product ask). Wire this in place of a real
// SerialIngestionSource/RestPollIngestionSource for a device entry during
// initial bring-up; swap it out once real hardware is attached — nothing
// downstream (normalization, caching, publishing) needs to know or care
// which kind of source produced a RawReading.
public sealed class SimulatedIngestionSource : IIngestionSource
{
    private readonly string _deviceKey;
    private readonly IReadOnlyDictionary<string, (double Base, double Spread)> _metrics;
    private readonly TimeSpan _interval;
    private readonly ChannelWriter<RawReading> _sink;
    private readonly ILogger _log;
    private readonly Random _random = new();

    public string DeviceKey => _deviceKey;

    public SimulatedIngestionSource(
        string deviceKey,
        IReadOnlyDictionary<string, (double Base, double Spread)> metrics,
        ChannelWriter<RawReading> sink,
        ILogger log,
        TimeSpan? interval = null)
    {
        _deviceKey = deviceKey;
        _metrics = metrics;
        _sink = sink;
        _log = log;
        _interval = interval ?? TimeSpan.FromSeconds(10);
    }

    public async Task RunAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(_interval);
        do
        {
            var metrics = _metrics.ToDictionary(
                kv => kv.Key,
                kv => Math.Round(kv.Value.Base + (_random.NextDouble() - 0.5) * kv.Value.Spread, 2));

            var reading = new RawReading(_deviceKey, DateTimeOffset.UtcNow, metrics);
            if (!_sink.TryWrite(reading))
            {
                _log.LogWarning("Telemetry bus full — dropped a simulated reading from {DeviceKey}", _deviceKey);
            }
            else
            {
                _log.LogDebug("Simulated reading from {DeviceKey}: {Metrics}", _deviceKey, metrics);
            }
        } while (await timer.WaitForNextTickAsync(ct));
    }
}
