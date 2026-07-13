using Microsoft.Data.Sqlite;

namespace PeakLogicEdge.Core.Caching;

public enum QueueStatus { Pending, Sent, FailedPermanent }

public sealed record PendingTelemetry(long Id, string ThingName, string Payload, int Attempts);

// §4 — SQLite-backed durable queue. Every telemetry envelope lands here
// BEFORE any network attempt is made — this is what makes delivery
// guaranteed-at-least-once rather than best-effort. Deliberately a
// separate concern from the read-side (there is no "read cache" in this
// app the way the iOS/web clients have one — the hub has no UI reads to
// serve from a local cache in this first pass; §6's Kiosk UI layer comes
// later and will read live from the ingestion pipeline / REST API
// directly, not from this table).
public sealed class TelemetryCache : IAsyncDisposable
{
    private readonly SqliteConnection _db;

    private TelemetryCache(SqliteConnection db) => _db = db;

    public static async Task<TelemetryCache> OpenAsync(string dbPath)
    {
        var db = new SqliteConnection($"Data Source={dbPath}");
        await db.OpenAsync();

        var create = db.CreateCommand();
        create.CommandText = """
            CREATE TABLE IF NOT EXISTS outbound_telemetry (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              thing_name      TEXT    NOT NULL,
              payload         TEXT    NOT NULL,
              enqueued_at     INTEGER NOT NULL,
              attempts        INTEGER NOT NULL DEFAULT 0,
              next_attempt_at INTEGER NOT NULL DEFAULT 0,
              status          TEXT    NOT NULL DEFAULT 'pending'
            );
            CREATE INDEX IF NOT EXISTS idx_outbound_telemetry_ready ON outbound_telemetry(status, next_attempt_at);
            """;
        await create.ExecuteNonQueryAsync();

        return new TelemetryCache(db);
    }

    public async Task EnqueueAsync(string thingName, string payload)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO outbound_telemetry (thing_name, payload, enqueued_at, next_attempt_at)
            VALUES ($thing, $payload, $now, $now)
            """;
        cmd.Parameters.AddWithValue("$thing", thingName);
        cmd.Parameters.AddWithValue("$payload", payload);
        cmd.Parameters.AddWithValue("$now", now);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<PendingTelemetry>> ReadReadyBatchAsync(int limit = 200)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var cmd = _db.CreateCommand();
        cmd.CommandText = """
            SELECT id, thing_name, payload, attempts FROM outbound_telemetry
            WHERE status = 'pending' AND next_attempt_at <= $now
            ORDER BY id ASC LIMIT $limit
            """;
        cmd.Parameters.AddWithValue("$now", now);
        cmd.Parameters.AddWithValue("$limit", limit);

        var results = new List<PendingTelemetry>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new PendingTelemetry(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3)));
        }
        return results;
    }

    public async Task MarkSentAsync(long id)
    {
        var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE outbound_telemetry SET status = 'sent' WHERE id = $id";
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeferAsync(long id, TimeSpan delay)
    {
        var nextAttempt = DateTimeOffset.UtcNow.Add(delay).ToUnixTimeSeconds();
        var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE outbound_telemetry SET next_attempt_at = $next WHERE id = $id";
        cmd.Parameters.AddWithValue("$next", nextAttempt);
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    // maxAttempts default (50) matches §4.2's "permanent-fail after 50
    // tries (~ a few days at capped backoff) — surfaced, not silently
    // dropped" — the kiosk UI's health/status view is the "surfaced" half
    // of that; this method only owns the state transition.
    public async Task RecordFailureAsync(long id, int maxAttempts = 50)
    {
        var cmd = _db.CreateCommand();
        cmd.CommandText = """
            UPDATE outbound_telemetry
            SET attempts = attempts + 1,
                status = CASE WHEN attempts + 1 >= $max THEN 'failed_permanent' ELSE status END,
                next_attempt_at = $next
            WHERE id = $id
            """;
        var nextAttempt = DateTimeOffset.UtcNow.Add(TimeSpan.FromSeconds(2)).ToUnixTimeSeconds();
        cmd.Parameters.AddWithValue("$max", maxAttempts);
        cmd.Parameters.AddWithValue("$next", nextAttempt);
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<int> PendingCountAsync()
    {
        var cmd = _db.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM outbound_telemetry WHERE status = 'pending'";
        var result = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }

    // Retention/eviction (§4.3) — bounds local disk growth on a site
    // that's been offline for a long stretch without silently discarding
    // still-pending data. Default 14 days matches the spec.
    public async Task PurgeOldSentAsync(TimeSpan retention)
    {
        var cutoff = DateTimeOffset.UtcNow.Subtract(retention).ToUnixTimeSeconds();
        var cmd = _db.CreateCommand();
        cmd.CommandText = "DELETE FROM outbound_telemetry WHERE status != 'pending' AND enqueued_at < $cutoff";
        cmd.Parameters.AddWithValue("$cutoff", cutoff);
        await cmd.ExecuteNonQueryAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _db.DisposeAsync();
        // Microsoft.Data.Sqlite pools the underlying native connection by
        // default — DisposeAsync() above returns the connection to the
        // pool rather than actually releasing the OS file handle, so the
        // .db file can still appear "in use" immediately afterward (a real
        // bug this caught: TelemetryCacheTests' cleanup tried to delete the
        // file right after disposal and got IOException). ClearPool makes
        // disposal actually deterministic, which matters beyond tests too —
        // e.g. anything that needs to safely move/back up/delete the cache
        // file right after closing it.
        SqliteConnection.ClearPool(_db);
    }
}
