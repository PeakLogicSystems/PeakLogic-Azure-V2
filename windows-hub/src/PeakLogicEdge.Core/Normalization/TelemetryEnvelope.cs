using System.Text.Json;

namespace PeakLogicEdge.Core.Normalization;

// windows-endpoint-application.md §3.1 — deliberately minimal. Exists to
// carry a raw reading to exactly the shape backend/shared/types.ts's
// IoTIngestEvent already expects server-side ({ thingName, ts, metrics }).
// No categorization, no unit conversion policy, no thresholds — all of
// that stays server-side in backend/ingest/rules.ts's RULES_BY_CATEGORY.
public sealed record TelemetryEnvelope
{
    public required string ThingName { get; init; }
    public required DateTimeOffset ObservedAt { get; init; }
    public required IReadOnlyDictionary<string, double> Metrics { get; init; }

    // Serializes to EXACTLY the wire shape the ingest Lambda expects via
    // AWS IoT Core's topic(2)-derived thingName + this JSON body — ts is
    // unix epoch milliseconds, matching backend/shared/types.ts precisely.
    public string ToWirePayload()
    {
        var payload = new { thingName = ThingName, ts = ObservedAt.ToUnixTimeMilliseconds(), metrics = Metrics };
        return JsonSerializer.Serialize(payload);
    }
}

public sealed record RawReading(
    string SourceDeviceKey,
    DateTimeOffset ObservedAt,
    IReadOnlyDictionary<string, double> Metrics,
    string? RawPayload = null);
