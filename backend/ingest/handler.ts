import type { Context } from 'aws-lambda';

/**
 * Receives telemetry messages forwarded by the IoT Core rule.
 * Full implementation in Phase C (backend API + ingest pipeline).
 *
 * Expected payload shape (after IoT SQL enrichment):
 * {
 *   thingName: string,          // injected by topic(2) in the rule SQL
 *   ts: number,                 // unix epoch ms from device
 *   metrics: { [key: string]: number }  // e.g. { power_kw: 3.2, temp_c: 45.1 }
 * }
 */
export const handler = async (event: unknown, _context: Context): Promise<void> => {
  console.log('telemetry received', JSON.stringify(event));
  // TODO Phase C: validate schema → look up device → write to telemetry table → evaluate alert rules
};
