import type { Context } from 'aws-lambda';
import { PoolClient } from 'pg';
import { getPool } from '../shared/db';
import type { Asset, AssetSpecs, Device, IoTIngestEvent, Alert } from '../shared/types';

// ── Alert rule definitions (hardcoded for MVP) ─────────────────────────────

type Condition = 'gt' | 'lt';

interface Rule {
  metric: string;
  condition: Condition;
  // Static threshold OR function of asset specs
  threshold: number | ((specs: AssetSpecs) => number);
  severity: Alert['severity'];
  message: (value: number, threshold: number) => string;
}

const RULES_BY_CATEGORY: Record<string, Rule[]> = {
  pump: [
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 5) * 1.25,
      severity: 'warning',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW exceeds rated limit ${t.toFixed(1)} kW`,
    },
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 5) * 1.5,
      severity: 'critical',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW is critically high (limit: ${t.toFixed(1)} kW)`,
    },
    {
      metric: 'flow_lpm', condition: 'lt',
      threshold: (s) => (s.flow_lpm ?? 100) * 0.75,
      severity: 'warning',
      message: (v, t) => `Flow rate ${v.toFixed(0)} L/min is below minimum ${t.toFixed(0)} L/min`,
    },
    {
      metric: 'pressure_psi', condition: 'gt',
      threshold: (s) => (s.pressure_psi ?? 80) * 1.2,
      severity: 'critical',
      message: (v, t) => `Pressure ${v.toFixed(0)} psi exceeds safe limit ${t.toFixed(0)} psi`,
    },
  ],
  hvac: [
    {
      metric: 'temp_c', condition: 'gt',
      threshold: (s) => s.temp_max_c ?? 180,
      severity: 'critical',
      message: (v, t) => `Temperature ${v.toFixed(0)}°C exceeds maximum ${t.toFixed(0)}°C`,
    },
    {
      metric: 'temp_c', condition: 'lt',
      threshold: 60,
      severity: 'warning',
      message: (v, _t) => `Temperature ${v.toFixed(0)}°C is below operating range (min 60°C)`,
    },
  ],
  pool_system: [
    {
      metric: 'flow_lpm', condition: 'lt',
      threshold: (s) => (s.flow_lpm ?? 150) * 0.8,
      severity: 'warning',
      message: (v, t) => `Pool flow rate ${v.toFixed(0)} L/min is below minimum ${t.toFixed(0)} L/min`,
    },
    {
      metric: 'temp_c', condition: 'gt',
      threshold: 35,
      severity: 'warning',
      message: (v, _t) => `Pool temperature ${v.toFixed(1)}°C is above safe limit (35°C)`,
    },
  ],
  // Probe temp of the food/drink itself, not ambient air — lets the unit run warmer
  // (saving energy) while still catching an actual food-safety violation early.
  refrigeration: [
    {
      metric: 'product_temp_c', condition: 'gt',
      threshold: (s) => s.temp_max_c ?? 4.4, // FDA cold-holding limit: 41°F / 4.4°C
      severity: 'warning',
      message: (v, t) => `Product temperature ${v.toFixed(1)}°C exceeds FDA safe cold-holding limit ${t.toFixed(1)}°C`,
    },
    {
      metric: 'product_temp_c', condition: 'gt',
      threshold: 7,
      severity: 'critical',
      message: (v, _t) => `Product temperature ${v.toFixed(1)}°C has been in the food-safety danger zone — discard-risk threshold exceeded`,
    },
  ],
  leak_sensor: [
    {
      metric: 'leak_detected', condition: 'gt',
      threshold: 0.5,
      severity: 'critical',
      message: (_v, _t) => `Leak detected — immediate shutoff/inspection required to prevent water damage`,
    },
  ],
  energy_meter: [
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 10) * 1.3,
      severity: 'warning',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW exceeds expected baseline ${t.toFixed(1)} kW`,
    },
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 10) * 1.6,
      severity: 'critical',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW is critically high (expected baseline: ${t.toFixed(1)} kW)`,
    },
  ],
};

// ── Main handler ───────────────────────────────────────────────────────────

export const handler = async (event: IoTIngestEvent, _context: Context): Promise<void> => {
  const { thingName, ts, metrics } = event;

  if (!thingName || !metrics || Object.keys(metrics).length === 0) {
    console.warn('Invalid ingest payload', JSON.stringify(event));
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
      const rules = RULES_BY_CATEGORY[device.category] ?? [];
      for (const rule of rules) {
        const value = metrics[rule.metric];
        if (value === undefined) continue;

        const threshold =
          typeof rule.threshold === 'function'
            ? rule.threshold(device.specs ?? {})
            : rule.threshold;

        const fired =
          rule.condition === 'gt' ? value > threshold : value < threshold;

        if (fired) {
          await maybeCreateAlert(client, device, rule, value, threshold, time);
        }
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
  rule: Rule,
  value: number,
  threshold: number,
  time: Date,
): Promise<void> {
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

  const message = rule.message(value, threshold);

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

  if (webhookUrl && ticket) {
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ticket.created', ticket }),
      signal: AbortSignal.timeout(8_000),
    }).catch((err: unknown) => console.error('Webhook delivery failed', err));
  }
}
