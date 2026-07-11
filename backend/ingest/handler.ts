import type { Context } from 'aws-lambda';
import { PoolClient } from 'pg';
import { getPool } from '../shared/db';
import { evaluateRules, sanitizeMetrics, type FiredRule } from './rules';
import { postWebhook } from '../shared/webhook';
import type { Asset, AssetSpecs, Device, IoTIngestEvent, Alert } from '../shared/types';

// Alert rule definitions moved to rules.ts (Test Strategy §3) — pure logic,
// exported, unit-testable in isolation from this file's DB I/O.

// ── Main handler ───────────────────────────────────────────────────────────

export const handler = async (event: IoTIngestEvent, _context: Context): Promise<void> => {
  const { thingName, ts, metrics: rawMetrics } = event;

  if (!thingName || !rawMetrics || Object.keys(rawMetrics).length === 0) {
    console.warn('Invalid ingest payload', JSON.stringify(event));
    return;
  }

  // Threat Model §4.1 — drop any metric whose value isn't actually a finite
  // number before it can reach either the SQL insert (DOUBLE PRECISION NOT
  // NULL — a non-numeric value throws there, and since this Lambda is
  // invoked asynchronously by the IoT rule, a thrown exception here means
  // AWS Lambda's own default async retry silently retries the same bad
  // value 2 more times before giving up with no DLQ to catch it — see
  // Threat Model §4.1's review log for how that failure mode was confirmed)
  // or rule evaluation.
  const { clean: metrics, dropped } = sanitizeMetrics(rawMetrics);
  if (dropped.length > 0) {
    console.warn(`Dropped ${dropped.length} non-numeric metric(s) from ${thingName}: ${dropped.join(', ')}`);
  }
  if (Object.keys(metrics).length === 0) {
    console.warn(`All metrics from ${thingName} were invalid — nothing to ingest`, JSON.stringify(event));
    return;
  }

  const pool = await getPool();
  const client = await pool.connect();

  try {
    // 1. Look up device + linked asset (no RLS — ingest is a system operation)
    const { rows: [device] } = await client.query<Device & { category: string; specs: AssetSpecs | null }>(
      `SELECT d.*, a.category, a.specs
       FROM devices d
       LEFT JOIN assets a ON a.id = d.asset_id
       WHERE d.thing_name = $1`,
      [thingName],
    );

    if (!device) {
      console.warn(`Received telemetry from unknown device: ${thingName}`);
      return;
    }

    const time = ts ? new Date(ts) : new Date();

    // 2. Update device heartbeat
    await client.query(
      `UPDATE devices SET last_seen_at = $1, status = 'online', updated_at = now() WHERE id = $2`,
      [time, device.id],
    );

    // 3. Bulk-insert telemetry rows
    for (const [metric, value] of Object.entries(metrics)) {
      await client.query(
        `INSERT INTO telemetry (time, device_id, tenant_id, metric, value) VALUES ($1, $2, $3, $4, $5)`,
        [time, device.id, device.tenant_id, metric, value],
      );
    }

    // 4. Evaluate alert rules if device is linked to an asset with known category
    if (device.asset_id && device.category) {
      const fired = evaluateRules(device.category, metrics, device.specs);
      for (const f of fired) {
        await maybeCreateAlert(client, device, f, time);
      }
    }
  } finally {
    client.release();
  }
};

// ── Alert deduplication + creation ────────────────────────────────────────

async function maybeCreateAlert(
  client: PoolClient,
  device: Device & { category: string; specs: AssetSpecs | null },
  fired: FiredRule,
  time: Date,
): Promise<void> {
  const { rule, value, threshold, message } = fired;

  // Skip if an open alert of the same severity already exists for this device+metric
  const { rows: [existing] } = await client.query(
    `SELECT id FROM alerts
     WHERE device_id = $1
       AND type      = 'threshold'
       AND severity  = $2
       AND context->>'metric' = $3
       AND status IN ('open', 'acknowledged')
     LIMIT 1`,
    [device.id, rule.severity, rule.metric],
  );

  if (existing) return; // already alerted, skip

  const { rows: [alert] } = await client.query<Alert>(
    `INSERT INTO alerts (tenant_id, device_id, asset_id, severity, type, message, context, triggered_at)
     VALUES ($1, $2, $3, $4, 'threshold', $5, $6, $7)
     RETURNING *`,
    [
      device.tenant_id,
      device.id,
      device.asset_id,
      rule.severity,
      message,
      JSON.stringify({ metric: rule.metric, threshold, actual: value }),
      time,
    ],
  );

  console.info(`Alert created: ${rule.severity} — ${message}`);

  // Auto-create a service ticket for critical alerts
  if (rule.severity === 'critical') {
    await createTicketForAlert(client, device, alert);
  }
}

async function createTicketForAlert(
  client: PoolClient,
  device: Device & { category: string },
  alert: Alert,
): Promise<void> {
  // Get tenant webhook URL from settings
  const { rows: [tenant] } = await client.query<{ settings: { webhook_url?: string } }>(
    'SELECT settings FROM tenants WHERE id = $1',
    [device.tenant_id],
  );

  const webhookUrl = tenant?.settings?.webhook_url ?? null;

  const { rows: [ticket] } = await client.query(
    `INSERT INTO service_tickets
       (tenant_id, alert_id, asset_id, title, description, priority, webhook_url)
     VALUES ($1, $2, $3, $4, $5, 'emergency', $6)
     RETURNING *`,
    [
      device.tenant_id,
      alert.id,
      alert.asset_id,
      `Critical alert: ${alert.message}`,
      `Auto-generated from alert ${alert.id} — ${alert.type} on device ${device.thing_name}`,
      webhookUrl,
    ],
  );

  // postWebhook validates the URL (Threat Model §4 — SSRF guard) before ever
  // calling fetch(). Not directly reachable via any API today (nothing sets
  // tenants.settings.webhook_url yet — Multi-Tenant Architecture found no
  // tenant-settings endpoint exists), but the same unguarded pattern as
  // tickets.ts's POST /v1/tickets webhookUrl, closed here too so it doesn't
  // become live the moment a settings endpoint is built.
  if (webhookUrl && ticket) {
    postWebhook(webhookUrl, { event: 'ticket.created', ticket })
      .catch((err: unknown) => console.error('Webhook delivery failed', err));
  }
}
