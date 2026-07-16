using Microsoft.Data.Sqlite;

namespace PeakLogicEdge.Core.Caching;

public sealed record LocalAlert(
    long Id, string ThingName, string Severity, string Message, long RaisedAtUnix, long? ClearedAtUnix);

// A genuinely new mechanism, not part of the original architecture doc --
// real alerting is, by design, computed server-side (backend/ingest/
// rules.ts's RULES_BY_CATEGORY), not duplicated here. This store exists
// for a narrower, real need: once alerts eventually reach this hub (a
// future REST poll or cloud-pushed list once a backend exists), a
// technician standing at the kiosk needs to be able to locally dismiss
// ones that aren't real issues -- a local override on top of whatever the
// authoritative source says, not a replacement for it. "Cleared" here is
// deliberately local-only state (ClearedAtUnix), not a claim that the
// cloud's own alert record was acknowledged -- that's a separate, real
// AcknowledgeAlertAsync call (Backend/PeakLogicApiClient.cs) this store
// does not attempt to make on its own.
public sealed class LocalAlertStore : IAsyncDisposable
{
    private readonly SqliteConnection _db;

    private LocalAlertStore(SqliteConnection db) => _db = db;

    public static async Task<LocalAlertStore> OpenAsync(string dbPath)
    {
        var db = new SqliteConnection($"Data Source={dbPath}");
        await db.OpenAsync();

        var create = db.CreateCommand();
        create.CommandText = """
            CREATE TABLE IF NOT EXISTS local_alerts (
              id             INTEGER PRIMARY KEY AUTOINCREMENT,
              thing_name     TEXT    NOT NULL,
              severity       TEXT    NOT NULL,
              message        TEXT    NOT NULL,
              raised_at      INTEGER NOT NULL,
              cleared_at     INTEGER NULL
            );
            CREATE INDEX IF NOT EXISTS idx_local_alerts_active ON local_alerts(cleared_at);
            """;
        await create.ExecuteNonQueryAsync();

        return new LocalAlertStore(db);
    }

    public async Task<long> RaiseAsync(string thingName, string severity, string message)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var cmd = _db.CreateCommand();
        cmd.CommandText = """
            INSERT INTO local_alerts (thing_name, severity, message, raised_at)
            VALUES ($thing, $severity, $message, $now);
            SELECT last_insert_rowid();
            """;
        cmd.Parameters.AddWithValue("$thing", thingName);
        cmd.Parameters.AddWithValue("$severity", severity);
        cmd.Parameters.AddWithValue("$message", message);
        cmd.Parameters.AddWithValue("$now", now);
        var id = (long)(await cmd.ExecuteScalarAsync())!;
        return id;
    }

    public async Task<List<LocalAlert>> ListActiveAsync()
    {
        var cmd = _db.CreateCommand();
        cmd.CommandText = """
            SELECT id, thing_name, severity, message, raised_at, cleared_at
            FROM local_alerts WHERE cleared_at IS NULL ORDER BY raised_at DESC
            """;

        var results = new List<LocalAlert>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new LocalAlert(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.GetInt64(4), reader.IsDBNull(5) ? null : reader.GetInt64(5)));
        }
        return results;
    }

    // "Clear" is deliberately idempotent (WHERE cleared_at IS NULL) --
    // clearing an already-cleared alert is a harmless no-op, not an error,
    // since a technician double-tapping Clear on a slow device shouldn't
    // need special handling.
    public async Task ClearAsync(long id)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var cmd = _db.CreateCommand();
        cmd.CommandText = "UPDATE local_alerts SET cleared_at = $now WHERE id = $id AND cleared_at IS NULL";
        cmd.Parameters.AddWithValue("$now", now);
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await _db.DisposeAsync();
        // Same pooled-connection gotcha TelemetryCache.DisposeAsync()
        // documents -- ClearPool releases the real OS file handle
        // deterministically instead of leaving it to the pool.
        SqliteConnection.ClearPool(_db);
    }
}
