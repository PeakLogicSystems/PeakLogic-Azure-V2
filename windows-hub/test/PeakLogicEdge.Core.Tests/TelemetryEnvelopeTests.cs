using System.Text.Json;
using PeakLogicEdge.Core.Normalization;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

public class TelemetryEnvelopeTests
{
    [Fact]
    public void ToWirePayload_MatchesIoTIngestEventShape()
    {
        // Must match backend/shared/types.ts's IoTIngestEvent exactly:
        // { thingName, ts, metrics } — this is the real integration point
        // with the existing, unmodified ingest Lambda, so the shape here
        // is not a style choice, it's a contract.
        var envelope = new TelemetryEnvelope
        {
            ThingName = "plg-0001",
            ObservedAt = DateTimeOffset.FromUnixTimeMilliseconds(1_700_000_000_000),
            Metrics = new Dictionary<string, double> { ["temp_c"] = 27.8, ["salt_ppm"] = 3200 },
        };

        var json = envelope.ToWirePayload();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("plg-0001", root.GetProperty("thingName").GetString());
        Assert.Equal(1_700_000_000_000, root.GetProperty("ts").GetInt64());
        Assert.Equal(27.8, root.GetProperty("metrics").GetProperty("temp_c").GetDouble());
        Assert.Equal(3200, root.GetProperty("metrics").GetProperty("salt_ppm").GetDouble());
    }
}
