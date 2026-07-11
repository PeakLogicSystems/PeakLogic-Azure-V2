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
    await client.query('BEGIN');

    // Multi-Tenant Architecture v1.1 — every table now has FORCE ROW LEVEL
    // SECURITY (migration 1783728060000), closing a foundational bug: the
    // app's DB role owns every table it queries, and an owner silently
    // bypasses RLS by default regardless of how many policies exist, unless
    // FORCE is set. That means this handler's old comment ("no RLS — ingest
    // is a system operation") was describing an accident, not a deliberate
    // exemption — once FORCE actually takes effect, an ingest connection
    // that never sets any RLS session variable would be blocked from
    // reading/writing anything at all, silently breaking telemetry
    // ingestion entirely, not just tightening it.
    //
    // app.ingest_context marks this specific, narrowly-scoped read — a
    // device looking itself up by its own unique, certificate-authenticated
    // thing_name, before its tenant is even known — as trusted (devices'
    // and assets' ingest_lookup policies, docs/data-model.sql). It grants
    // SELECT only, nothing else, and only on these two tables. The instant
    // the device's tenant_id is resolved below, every remaining operation
    // in this transaction switches to normal app.current_tenant_id scoping
    // — this ends up MORE correctly isolated than the old framing, not a
    // weaker version of it.
    await client.query("SET LOCAL app.ingest_context = 'true'");

    // 1. Look up device + linked asset by thing_name — the one read that
    // must run before any tenant is known.
    const { rows: [device] } = await client.query<Device & { category: string; specs: AssetSpecs | null }>(
      `SELECT d.*, a.category, a.specs
       FROM devices d
       LEFT JOIN assets a ON a.id = d.asset_id
       WHERE d.thing_name = $1`,
      [thingName],
    );

    if (!device) {
      console.warn(`Received telemetry from unknown device: ${thingName}`);
      await client.query('ROLLBACK');
      return;
    }

    // devices.tenant_id is nullable (Multi-Tenant Architecture v1.1) — a
    // device reports telemetry before ever being claimed only in an
    // unexpected/misconfigured scenario (normal onboarding claims it before
    // it's installed and powered on), but there's no tenant to scope this
    // reading to either way, so drop it rather than guess.
    if (!device.tenant_id) {
      console.warn(`Received telemetry from an unclaimed device: ${thingName}`);
      await client.query('ROLLBACK');
      return;
    }

    // Tenant now known — every remaining query in this transaction is
    // properly tenant-scoped, same as any human-facing API request.
    await client.query('SET LOCAL app.current_tenant_id = $1', [device.tenant_id]);

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

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
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
