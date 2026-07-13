using System.Collections.Concurrent;

namespace PeakLogicEdge.Core.Ingestion;

// Exponential backoff (500ms -> 30s cap) with jitter, tracked per key so one
// flapping source doesn't synchronize retry storms against others. Shared
// by ingestion reconnects (§2.2/§2.3) and the outbound cache flush loop
// (§4.2) — one implementation, not two copies of the same policy.
public static class BackoffPolicy
{
    private static readonly ConcurrentDictionary<string, int> Attempts = new();
    private static readonly TimeSpan Initial = TimeSpan.FromMilliseconds(500);
    private static readonly TimeSpan Max = TimeSpan.FromSeconds(30);
    private static readonly Random Jitter = new();

    public static TimeSpan NextDelay(string key)
    {
        var attempt = Attempts.AddOrUpdate(key, 1, (_, n) => n + 1);
        var raw = Initial.TotalMilliseconds * Math.Pow(2, attempt - 1);
        var capped = Math.Min(raw, Max.TotalMilliseconds);
        var jitterFactor = 0.8 + (Jitter.NextDouble() * 0.4); // ±20%
        return TimeSpan.FromMilliseconds(capped * jitterFactor);
    }

    public static void Reset(string key) => Attempts.TryRemove(key, out _);
}
