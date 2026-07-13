using System.Text.Json;

namespace PeakLogicEdge.Core.Normalization;

// §3.2 — the ONLY device-specific code in the whole app. Adding a new
// device type is: write one of these, add a config entry, provision +
// claim the device normally. Nothing else in the pipeline changes.
public interface IPayloadMapper
{
    RawReading Map(string deviceKey, string rawPayload);
}

// A JSON-emitting LAN device (or a simulated/test source, §Ingestion) whose
// field names don't already match backend-recognized metric keys —
// fieldMap (from DeviceConfig, e.g. { "waterTempC": "temp_c" }) reshapes
// them. If a device already emits backend-recognized keys directly, pass
// an empty/identity fieldMap.
public sealed class JsonPassthroughMapper : IPayloadMapper
{
    private readonly IReadOnlyDictionary<string, string> _fieldToMetric;

    public JsonPassthroughMapper(IReadOnlyDictionary<string, string> fieldToMetric)
    {
        _fieldToMetric = fieldToMetric;
    }

    public RawReading Map(string deviceKey, string rawPayload)
    {
        using var doc = JsonDocument.Parse(rawPayload);
        var metrics = new Dictionary<string, double>();
        foreach (var (sourceField, metricName) in _fieldToMetric)
        {
            if (doc.RootElement.TryGetProperty(sourceField, out var element) && element.TryGetDouble(out var value))
            {
                metrics[metricName] = value;
            }
        }
        return new RawReading(deviceKey, DateTimeOffset.UtcNow, metrics, rawPayload);
    }
}
