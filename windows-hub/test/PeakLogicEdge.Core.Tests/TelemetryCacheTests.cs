using PeakLogicEdge.Core.Caching;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

public class TelemetryCacheTests : IAsyncLifetime
{
    private string _dbPath = string.Empty;
    private TelemetryCache _cache = null!;

    public async Task InitializeAsync()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"peaklogic-edge-test-{Guid.NewGuid():N}.db");
        _cache = await TelemetryCache.OpenAsync(_dbPath);
    }

    public async Task DisposeAsync()
    {
        await _cache.DisposeAsync();
        if (File.Exists(_dbPath)) File.Delete(_dbPath);
    }

    [Fact]
    public async Task EnqueueThenReadReadyBatch_ReturnsTheEnqueuedRow()
    {
        await _cache.EnqueueAsync("plg-0001", """{"thingName":"plg-0001","ts":1,"metrics":{}}""");

        var batch = await _cache.ReadReadyBatchAsync();

        Assert.Single(batch);
        Assert.Equal("plg-0001", batch[0].ThingName);
    }

    [Fact]
    public async Task MarkSent_RemovesRowFromTheReadyBatch()
    {
        await _cache.EnqueueAsync("plg-0001", "{}");
        var batch = await _cache.ReadReadyBatchAsync();

        await _cache.MarkSentAsync(batch[0].Id);

        var remaining = await _cache.ReadReadyBatchAsync();
        Assert.Empty(remaining);
    }

    [Fact]
    public async Task Defer_HidesTheRowUntilItsNextAttemptTimeArrives()
    {
        await _cache.EnqueueAsync("plg-0001", "{}");
        var batch = await _cache.ReadReadyBatchAsync();

        // Deferred far into the future — must not reappear as "ready" now.
        await _cache.DeferAsync(batch[0].Id, TimeSpan.FromHours(1));

        var stillHidden = await _cache.ReadReadyBatchAsync();
        Assert.Empty(stillHidden);
    }

    [Fact]
    public async Task RecordFailure_MarksPermanentlyFailedAfterMaxAttempts()
    {
        await _cache.EnqueueAsync("plg-0001", "{}");
        var id = (await _cache.ReadReadyBatchAsync())[0].Id;

        // §4.2's "permanent-fail after N tries, surfaced not silently
        // dropped" — verified here with a small maxAttempts so the test
        // doesn't need to loop 50 times.
        for (var i = 0; i < 3; i++)
        {
            await _cache.RecordFailureAsync(id, maxAttempts: 3);
        }

        var pendingCount = await _cache.PendingCountAsync();
        Assert.Equal(0, pendingCount); // no longer pending — it's failed_permanent now
    }

    [Fact]
    public async Task PendingCount_ReflectsOnlyRowsStillAwaitingDelivery()
    {
        await _cache.EnqueueAsync("plg-0001", "{}");
        await _cache.EnqueueAsync("plg-0002", "{}");
        var batch = await _cache.ReadReadyBatchAsync();
        await _cache.MarkSentAsync(batch[0].Id);

        var pending = await _cache.PendingCountAsync();

        Assert.Equal(1, pending);
    }
}
