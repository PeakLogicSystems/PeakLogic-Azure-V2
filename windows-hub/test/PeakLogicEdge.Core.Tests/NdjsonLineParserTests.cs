using System.Text;
using PeakLogicEdge.Core.Ingestion;
using PeakLogicEdge.Core.Normalization;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

public class NdjsonLineParserTests
{
    private static IPayloadMapper IdentityMapper() =>
        new JsonPassthroughMapper(new Dictionary<string, string> { ["value"] = "value" });

    [Fact]
    public void TryParseFrames_ParsesACompleteLine()
    {
        var parser = new NdjsonLineParser("dev-1", IdentityMapper());
        var bytes = Encoding.UTF8.GetBytes("{\"value\": 42}\n");

        var readings = parser.TryParseFrames(bytes).ToList();

        Assert.Single(readings);
        Assert.Equal(42, readings[0].Metrics["value"]);
    }

    [Fact]
    public void TryParseFrames_BuffersAPartialLineAcrossCalls()
    {
        // A line split across two serial reads — the real-world case this
        // parser exists to handle (§2.2's "buffers a partial trailing line
        // across calls" design note).
        var parser = new NdjsonLineParser("dev-1", IdentityMapper());

        var firstChunk = parser.TryParseFrames(Encoding.UTF8.GetBytes("{\"value\":")).ToList();
        Assert.Empty(firstChunk); // no complete line yet

        var secondChunk = parser.TryParseFrames(Encoding.UTF8.GetBytes(" 99}\n")).ToList();
        Assert.Single(secondChunk);
        Assert.Equal(99, secondChunk[0].Metrics["value"]);
    }

    [Fact]
    public void TryParseFrames_SkipsAMalformedLineWithoutThrowing()
    {
        var parser = new NdjsonLineParser("dev-1", IdentityMapper());
        var bytes = Encoding.UTF8.GetBytes("not valid json\n{\"value\": 7}\n");

        var readings = parser.TryParseFrames(bytes).ToList();

        Assert.Single(readings); // the garbage line was skipped, not fatal
        Assert.Equal(7, readings[0].Metrics["value"]);
    }

    [Fact]
    public void TryParseFrames_HandlesMultipleCompleteLinesInOneRead()
    {
        var parser = new NdjsonLineParser("dev-1", IdentityMapper());
        var bytes = Encoding.UTF8.GetBytes("{\"value\": 1}\n{\"value\": 2}\n{\"value\": 3}\n");

        var readings = parser.TryParseFrames(bytes).ToList();

        Assert.Equal(3, readings.Count);
        Assert.Equal([1, 2, 3], readings.Select(r => r.Metrics["value"]));
    }
}
