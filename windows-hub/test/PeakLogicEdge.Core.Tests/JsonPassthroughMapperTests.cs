using PeakLogicEdge.Core.Normalization;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

public class JsonPassthroughMapperTests
{
    [Fact]
    public void Map_ReshapesFieldNamesToBackendMetricKeys()
    {
        // The Pentair IntelliChlor example from the product ask — a LAN
        // device emitting its own field names, reshaped to the metric
        // keys backend/ingest/rules.ts's RULES_BY_CATEGORY recognizes.
        var mapper = new JsonPassthroughMapper(new Dictionary<string, string>
        {
            ["waterTempC"] = "temp_c",
            ["saltPpm"] = "salt_ppm",
            ["flowLpm"] = "flow_lpm",
        });

        var reading = mapper.Map("chlorinator-1", """{"waterTempC": 27.8, "saltPpm": 3200, "flowLpm": 112}""");

        Assert.Equal("chlorinator-1", reading.SourceDeviceKey);
        Assert.Equal(27.8, reading.Metrics["temp_c"]);
        Assert.Equal(3200, reading.Metrics["salt_ppm"]);
        Assert.Equal(112, reading.Metrics["flow_lpm"]);
    }

    [Fact]
    public void Map_IgnoresFieldsNotInTheMap()
    {
        var mapper = new JsonPassthroughMapper(new Dictionary<string, string> { ["waterTempC"] = "temp_c" });

        var reading = mapper.Map("device-1", """{"waterTempC": 20.0, "someIrrelevantField": "ignored"}""");

        Assert.Single(reading.Metrics);
        Assert.Equal(20.0, reading.Metrics["temp_c"]);
    }

    [Fact]
    public void Map_SkipsAFieldMissingFromThePayload()
    {
        var mapper = new JsonPassthroughMapper(new Dictionary<string, string>
        {
            ["waterTempC"] = "temp_c",
            ["saltPpm"] = "salt_ppm",
        });

        // saltPpm sensor temporarily not reporting — the mapper shouldn't
        // throw, it should just produce a reading with only what's present.
        var reading = mapper.Map("device-1", """{"waterTempC": 20.0}""");

        Assert.Single(reading.Metrics);
        Assert.False(reading.Metrics.ContainsKey("salt_ppm"));
    }
}
