using PeakLogicEdge.Core.Ingestion;
using Xunit;

namespace PeakLogicEdge.Core.Tests;

public class BackoffPolicyTests
{
    [Fact]
    public void NextDelay_GrowsWithEachCallForTheSameKey()
    {
        var key = $"test-{Guid.NewGuid()}";

        var first = BackoffPolicy.NextDelay(key);
        var second = BackoffPolicy.NextDelay(key);
        var third = BackoffPolicy.NextDelay(key);

        // Exponential growth with jitter (±20%) — assert ordering trends
        // upward, not exact values, since jitter makes exact equality
        // testing meaningless here.
        Assert.True(second.TotalMilliseconds > first.TotalMilliseconds * 1.3);
        Assert.True(third.TotalMilliseconds > second.TotalMilliseconds * 1.3);
    }

    [Fact]
    public void NextDelay_NeverExceedsTheCapEvenAfterManyAttempts()
    {
        var key = $"test-{Guid.NewGuid()}";
        TimeSpan last = default;

        for (var i = 0; i < 20; i++)
        {
            last = BackoffPolicy.NextDelay(key);
        }

        // 30s cap * 1.2 (max jitter factor) — never meaningfully more than that.
        Assert.True(last.TotalSeconds <= 36);
    }

    [Fact]
    public void Reset_RestartsTheBackoffSequenceForThatKey()
    {
        var key = $"test-{Guid.NewGuid()}";
        for (var i = 0; i < 5; i++) BackoffPolicy.NextDelay(key);

        BackoffPolicy.Reset(key);
        var afterReset = BackoffPolicy.NextDelay(key);

        // Back near the initial ~500ms delay, not still escalated from the
        // pre-reset sequence.
        Assert.True(afterReset.TotalMilliseconds < 1000);
    }

    [Fact]
    public void NextDelay_TracksDifferentKeysIndependently()
    {
        var keyA = $"test-a-{Guid.NewGuid()}";
        var keyB = $"test-b-{Guid.NewGuid()}";

        for (var i = 0; i < 5; i++) BackoffPolicy.NextDelay(keyA); // escalate A only

        var freshB = BackoffPolicy.NextDelay(keyB);

        // B's first call should still be near the initial delay, unaffected
        // by A's escalation — the whole point of per-key tracking (§2.1's
        // "one flapping source doesn't synchronize retry storms").
        Assert.True(freshB.TotalMilliseconds < 1000);
    }
}
