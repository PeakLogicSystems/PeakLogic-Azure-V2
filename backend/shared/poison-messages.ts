import { getPool } from './db';

/**
 * Enterprise Audit (2026-07-19) finding 2.4a — Azure Functions has no native
 * dead-letter path for Event Hub/IoT Hub triggers; a message that fails
 * processing was previously just gone once Event Hubs' own retry policy
 * gave up (nothing beyond a finite-retention log line). This gives it a
 * durable forensic trail.
 *
 * Deliberately best-effort and never-throwing: recording a poison message
 * must never itself crash the message loop it's meant to be a safety net
 * for. If even this write fails (DB down, etc.), the caller's own log
 * (`context.error`, in ingest/main.ts) is the last line of defense — logged
 * here too, not silently swallowed.
 */
/**
 * Best-effort, pure extraction — the payload may not even be valid JSON at
 * all (exactly the case poison_messages exists to capture), so returning
 * null is an expected, not exceptional, outcome. Split out from
 * recordPoisonMessage() so this logic is unit-testable without a DB.
 */
export function extractThingName(rawPayload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(rawPayload);
    if (parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).thingName === 'string') {
      return (parsed as Record<string, unknown>).thingName as string;
    }
  } catch {
    // Not valid JSON — nothing to recover here.
  }
  return null;
}

export async function recordPoisonMessage(rawPayload: string, err: unknown, source = 'ingest'): Promise<void> {
  const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const thingName = extractThingName(rawPayload);

  try {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO poison_messages (source, raw_payload, error, thing_name) VALUES ($1, $2, $3, $4)`,
      [source, rawPayload, errorMessage, thingName],
    );
  } catch (logErr) {
    console.error('Failed to record poison message (DB write itself failed)', logErr);
  }
}
