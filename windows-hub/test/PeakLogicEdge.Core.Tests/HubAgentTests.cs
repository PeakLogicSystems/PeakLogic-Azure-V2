using Microsoft.Extensions.Logging.Abstractions;
using PeakLogicEdge.Core.Agent;
using PeakLogicEdge.Core.Caching;
using PeakLogicEdge.Core.Ingestion;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

// HubAgent is the wiring nobody else covers end-to-end: sources -> bus ->
// normalization -> durable SQLite queue. This runs the real agent briefly
// against a fast simulated source and asserts readings actually land in the
// durable cache (and survive the agent shutting down), which is the whole point
// of the offline-durability design.
public class HubAgentTests
{
    [Fact]
    public async Task Run_QueuesReadings_ToDurableCache_ThatSurviveShutdown()
    {
        var cachePath = Path.Combine(Path.GetTempPath(), $"peaklogic-hubagent-{Guid.NewGuid():N}.db");
        try
        {
            var agent = new HubAgent(
                sourceFactory: writer => new IIngestionSource[]
                {
                    new SimulatedIngestionSource(
                        deviceKey: "dev-1",
                        metrics: new Dictionary<string, (double Base, double Spread)> { ["temp_c"] = (25, 1) },
                        sink: writer,
                        log: NullLogger.Instance,
                        interval: TimeSpan.FromMilliseconds(20)),
                },
                options: new HubAgentOptions
                {
                    CachePath = cachePath,
                    ThingNameByDeviceKey = new Dictionary<string, string> { ["dev-1"] = "plg-test-0001" },
                    StatusInterval = TimeSpan.FromMilliseconds(50),
                },
                log: NullLogger.Instance);

            using var cts = new CancellationTokenSource();
            var run = agent.RunAsync(cts.Token);

            await Task.Delay(500); // ~25 readings at 20ms — comfortably >0
            cts.Cancel();
            await run; // agent closes its own cache connection on exit

            // Re-open the cache fresh (agent has released it) and confirm the
            // readings are durably persisted, not just held in memory.
            await using var cache = await TelemetryCache.OpenAsync(cachePath);
            Assert.True(await cache.PendingCountAsync() > 0, "expected readings to be durably queued");
        }
        finally
        {
            if (File.Exists(cachePath)) File.Delete(cachePath);
        }
    }
}
