using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using PeakLogicEdge.Core.Normalization;

namespace PeakLogicEdge.Core.Ingestion.OpcUa;

// An OPC-UA acquisition source (hub-agent-runtime-design.md §7.5). Polls a set
// of nodes on an interval, coerces + scales each to a canonical metric, and
// writes a RawReading to the shared TelemetryBus — indistinguishable downstream
// from any other source. The OPC-UA session lives behind IOpcUaValueReader; the
// concrete SDK-backed reader is a deferred thin adapter (needs a real server to
// test against), consistent with the platform's "no real hardware yet" stance.
public sealed class OpcUaIngestionSource : IIngestionSource
{
    private readonly string _deviceKey;
    private readonly OpcUaTagMap _map;
    private readonly IOpcUaValueReader _reader;
    private readonly ChannelWriter<RawReading> _sink;
    private readonly ILogger _log;
    private readonly TimeSpan _interval;

    public string DeviceKey => _deviceKey;

    public OpcUaIngestionSource(
        string deviceKey,
        OpcUaTagMap map,
        IOpcUaValueReader reader,
        ChannelWriter<RawReading> sink,
        ILogger log,
        TimeSpan? interval = null)
    {
        _deviceKey = deviceKey;
        _map = map;
        _reader = reader;
        _sink = sink;
        _log = log;
        _interval = interval ?? TimeSpan.FromSeconds(5);
    }

    public async Task RunAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                await PollOnceAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogWarning(ex, "OPC-UA poll failed for {DeviceKey}", DeviceKey);
            }
        }
    }

    /// One read-coerce-emit cycle. Public for direct testing / single-shot bring-up.
    public async Task PollOnceAsync(CancellationToken ct)
    {
        var values = await _reader.ReadValuesAsync(_map.NodeIds, ct);

        var metrics = new Dictionary<string, double>(_map.Points.Count);
        foreach (var point in _map.Points)
        {
            if (!values.TryGetValue(point.NodeId, out var raw)) continue;
            var coerced = OpcUaValueCoercion.ToDouble(raw);
            if (coerced is null)
            {
                _log.LogDebug("OPC-UA node {NodeId} value not numeric — skipping metric {Metric}", point.NodeId, point.Metric);
                continue;
            }
            metrics[point.Metric] = coerced.Value * point.Scale + point.Offset;
        }

        if (metrics.Count == 0) return; // nothing readable this cycle — no empty reading

        var reading = new RawReading(DeviceKey, DateTimeOffset.UtcNow, metrics);
        if (!_sink.TryWrite(reading))
        {
            _log.LogWarning("Telemetry bus full — dropped an OPC-UA reading from {DeviceKey}", DeviceKey);
        }
    }
}
