import { PoolClient } from 'pg';
import { getPool } from '../shared/db';
import { evaluateRuleSet, sanitizeMetrics, RULES_BY_CATEGORY, type Rule, type FiredRule } from './rules';
import { resolvePolicyRules } from './policy-resolver';
import { updateBaseline } from './baseline';
import { scoreAnomaly, formatAnomalyMessage } from './anomaly';
import { CONNECTION_INTERVAL_METRIC, computeConnectionIntervalSeconds, formatConnectionAnomalyMessage } from './connection-anomaly';
import { createAlertAndMaybeTicket } from '../shared/alerts';
import type { AssetSpecs, Device, IoTIngestEvent, MetricBaseline } from '../shared/types';

// Policy Engine cutover (Policy Engine Design §8 step 3). When
// POLICY_ENGINE_ENABLED is 'true', alert thresholds are resolved from the DB
// `policies` table (platform defaults + tenant/site/asset overrides); when it
// is anything else, ingest uses the compiled-in RULES_BY_CATEGORY exactly as
// before. Read per-call (not at module load) so it can be toggled in tests
// and per environment without a redeploy.
function policyEngineEnabled(): boolean {
  return process.env.POLICY_ENGINE_ENABLED === 'true';
}

// AI Analytics Layer (artifact #34) Tier 1 cutover — same zero-default-
// behavior-change discipline as the Policy Engine flag above. When 'true',
// each reading is scored against the device's own metric_baselines row
// (anomaly.ts) and an 'anomaly'-type alert is raised through the existing
// pipeline if it deviates enough. Baseline MAINTENANCE (baseline.ts) is NOT
// gated by this flag — see processIngestEvent's step 3b comment for why.
function aiAnalyticsEnabled(): boolean {
  return process.env.AI_ANALYTICS_ENABLED === 'true';
}

// Device shape after the ingest lookup join (category/specs/site_id come from
// the linked asset).
type IngestDevice = Device & { category: string; specs: AssetSpecs | null; site_id: string | null };

// Alert rule definitions moved to rules.ts (Test Strategy §3) — pure logic,
// exported, unit-testable in isolation from this file's DB I/O.
//
// Azure port: this function is invoked once per IoT Hub telemetry message by
// the Event Hub trigger registered in ingest/main.ts (IoT Hub exposes an
// Event Hub-compatible endpoint). The processing logic — sanitize, RLS-scoped
// device lookup, telemetry insert, rule evaluation — is entirely cloud-
// agnostic and unchanged from the AWS version (Threat Model §4.1 confirmed
// sanitizeMetrics() ports verbatim). Only the trigger wrapper (main.ts) is
// Azure-specific.

// ── Main processing function ─────────────────────────────────────────────

export async function processIngestEvent(event: IoTIngestEvent): Promise<void> {
  const { thingName, ts, metrics: rawMetrics } = event;

  if (!thingName || !rawMetrics || Object.keys(rawMetrics).length === 0) {
    console.warn('Invalid ingest payload', JSON.stringify(event));
    return;
  }

  // Threat Model §4.1 — drop any metric whose value isn't actually a finite
  // number before it can reach either the SQL insert (DOUBLE PRECISION NOT
  // NULL — a non-numeric value throws there) or rule evaluation. Azure note
  // (Threat Model §4.1 v1.1): Azure Functions has NO native dead-letter for
  // Event Hub/IoT Hub triggers — a thrown exception here is retried per the
  // Event Hubs extension's retry policy and then, without custom poison-
  // message handling, the message is effectively lost. Sanitizing up front
  // (rather than throwing on a bad value) is what keeps one malformed metric
  // from ever reaching that failure path — a materially bigger gap on Azure
  // than the AWS DLQ residual, flagged for a real custom-DLQ design later.
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
    // must run before any tenant is known. a.site_id is pulled through for the
    // Policy Engine resolver's site-scope lookups (Design §4.1); it's granted
    // by the same assets ingest_lookup policy as a.category/a.specs.
    const { rows: [device] } = await client.query<IngestDevice>(
      `SELECT d.*, a.category, a.specs, a.site_id AS site_id
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

    // 2. Update device heartbeat. device.last_seen_at (from the step-1 SELECT,
    // captured BEFORE this UPDATE overwrites it) is this event's "previous"
    // reading time — exactly the input the connection-interval anomaly check
    // below needs, at zero extra queries.
    const previousLastSeenAt = device.last_seen_at;
    await client.query(
      `UPDATE devices SET last_seen_at = $1, status = 'online', updated_at = now() WHERE id = $2`,
      [time, device.id],
    );

    // Read once, used by both the connection-interval check below and the
    // per-metric loop in step 3 — same AI_ANALYTICS_ENABLED gate throughout.
    const aiEnabled = aiAnalyticsEnabled();

    // 2b. Water-Sector Security Hardening Strategy §5 Tier 2 item 2 —
    // connection-behavior anomaly: is the GAP since this device's last
    // reading itself unusual, independent of what the reading contains?
    // Reuses updateBaseline()/scoreAnomaly() unchanged against a reserved
    // pseudo-metric (CONNECTION_INTERVAL_METRIC) in the same metric_baselines
    // table — same cold-start withholding, same 3-sigma default, same
    // AI_ANALYTICS_ENABLED gate on SCORING (maintenance always runs, exactly
    // mirroring the per-metric baseline discipline in step 3 below). Runs
    // once per event (a connection-cadence property of the device), not once
    // per metric in the payload.
    const intervalSeconds = computeConnectionIntervalSeconds(previousLastSeenAt, time);
    if (intervalSeconds !== null) {
      const { rows: [existingIntervalBaseline] } = await client.query<MetricBaseline>(
        `SELECT * FROM metric_baselines WHERE device_id = $1 AND metric = $2`,
        [device.id, CONNECTION_INTERVAL_METRIC],
      );

      if (aiEnabled && existingIntervalBaseline) {
        const result = scoreAnomaly(existingIntervalBaseline, intervalSeconds);
        if (result) {
          const { rows: [alert] } = await createAlertAndMaybeTicket(client, device, {
            type: 'connection_anomaly',
            severity: result.severity,
            metric: result.metric,
            message: formatConnectionAnomalyMessage(result),
            context: { metric: result.metric, expected: result.expected, observed: result.observed, deviation_sigma: result.deviationSigma },
            time,
          });
          await client.query(
            `INSERT INTO ai_findings (tenant_id, device_id, model_id, kind, score, explanation, alert_id)
             VALUES ($1, $2, NULL, 'anomaly', $3, $4, $5)`,
            [
              device.tenant_id,
              device.id,
              result.deviationSigma,
              // signal: 'connection_interval' distinguishes this from a
              // value-based Tier 1 finding without needing a schema change —
              // ai_findings.kind's CHECK constraint only allows
              // ('anomaly','prediction','prescription'), and this genuinely
              // is an anomaly, just scored on a different data dimension.
              JSON.stringify({ signal: 'connection_interval', metric: result.metric, expected: result.expected, observed: result.observed, deviation_sigma: result.deviationSigma }),
              alert?.id ?? null,
            ],
          );
        }
      }

      const updatedIntervalBaseline = updateBaseline(
        { tenant_id: device.tenant_id!, device_id: device.id, metric: CONNECTION_INTERVAL_METRIC },
        existingIntervalBaseline ?? null,
        intervalSeconds,
        time,
      );
      await client.query(
        `INSERT INTO metric_baselines (tenant_id, device_id, metric, trailing_mean, trailing_stddev, window_start, window_end, sample_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (device_id, metric) DO UPDATE SET
           trailing_mean = EXCLUDED.trailing_mean,
           trailing_stddev = EXCLUDED.trailing_stddev,
           window_end = EXCLUDED.window_end,
           sample_count = EXCLUDED.sample_count`,
        [updatedIntervalBaseline.tenant_id, updatedIntervalBaseline.device_id, updatedIntervalBaseline.metric,
         updatedIntervalBaseline.trailing_mean, updatedIntervalBaseline.trailing_stddev,
         updatedIntervalBaseline.window_start, updatedIntervalBaseline.window_end, updatedIntervalBaseline.sample_count],
      );
    }

    // 3. Bulk-insert telemetry rows (idempotent — migration 1784055300000,
    // Enterprise Audit finding 2.4b) AND maintain metric_baselines + (if
    // enabled) score Tier 1 anomalies, per metric, in one pass. Combined
    // into one loop (previously two separate loops over the same metrics)
    // specifically so baseline/anomaly work can be skipped for a metric
    // whose telemetry row turns out to be a REDELIVERED DUPLICATE (Event
    // Hubs is at-least-once) — without this, a redelivered batch would
    // double-count that exact reading into the EWMA baseline, subtly
    // skewing trailing_mean/trailing_stddev, even though the alert
    // pipeline's own separate dedup (createAlertAndMaybeTicket) already
    // protects against a duplicate ALERT.
    //
    // Baseline MAINTENANCE always runs for a genuinely new reading
    // (cheap, no alert-pipeline coupling, so real history exists the moment
    // AI_ANALYTICS_ENABLED flips on); anomaly SCORING stays gated behind
    // that flag (it can emit alerts, so it gets the same zero-default-
    // behavior-change treatment as the Policy Engine). Scores against the
    // PRE-update baseline (fetched before this reading is folded in) — the
    // question is "how unusual is this reading relative to what came
    // before," not relative to a baseline this same reading already shifted.
    for (const [metric, value] of Object.entries(metrics)) {
      const insertResult = await client.query(
        `INSERT INTO telemetry (time, device_id, tenant_id, metric, value)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_id, time, metric) DO NOTHING`,
        [time, device.id, device.tenant_id, metric, value],
      );
      if (insertResult.rowCount === 0) {
        // A redelivered duplicate of this EXACT reading (same device, same
        // timestamp, same metric) — already fully processed once. Skip
        // baseline/anomaly for this metric only; rule evaluation (step 4)
        // still runs over the full event as before, protected by its own
        // alert-level dedup — simpler than threading a per-metric skip list
        // through an unrelated evaluation path for no additional safety
        // benefit.
        console.warn(`Duplicate telemetry delivery skipped: ${thingName} ${metric} @ ${time.toISOString()}`);
        continue;
      }

      const { rows: [existingBaseline] } = await client.query<MetricBaseline>(
        `SELECT * FROM metric_baselines WHERE device_id = $1 AND metric = $2`,
        [device.id, metric],
      );

      if (aiEnabled && existingBaseline) {
        const result = scoreAnomaly(existingBaseline, value);
        if (result) {
          // Record the finding whenever the AI layer actually detects
          // something — independent of whether the resulting alert is new
          // or deduped against one already open. ai_findings is the AI
          // layer's own audit trail ("what did it find"); alerts is the
          // user-facing, deduped surface ("what should a human see") —
          // conflating the two (only recording a finding when a NEW alert
          // was created) would silently under-count real detections any
          // time the same anomaly persists across multiple readings.
          const { rows: [alert] } = await createAlertAndMaybeTicket(client, device, {
            type: 'anomaly',
            severity: result.severity,
            metric: result.metric,
            message: formatAnomalyMessage(result),
            context: { metric: result.metric, expected: result.expected, observed: result.observed, deviation_sigma: result.deviationSigma },
            time,
          });
          await client.query(
            `INSERT INTO ai_findings (tenant_id, device_id, model_id, kind, score, explanation, alert_id)
             VALUES ($1, $2, NULL, 'anomaly', $3, $4, $5)`,
            [
              device.tenant_id,
              device.id,
              result.deviationSigma,
              JSON.stringify({ metric: result.metric, expected: result.expected, observed: result.observed, deviation_sigma: result.deviationSigma }),
              alert?.id ?? null,
            ],
          );
        }
      }

      const updated = updateBaseline(
        { tenant_id: device.tenant_id!, device_id: device.id, metric },
        existingBaseline ?? null,
        value,
        time,
      );
      await client.query(
        `INSERT INTO metric_baselines (tenant_id, device_id, metric, trailing_mean, trailing_stddev, window_start, window_end, sample_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (device_id, metric) DO UPDATE SET
           trailing_mean = EXCLUDED.trailing_mean,
           trailing_stddev = EXCLUDED.trailing_stddev,
           window_end = EXCLUDED.window_end,
           sample_count = EXCLUDED.sample_count`,
        [updated.tenant_id, updated.device_id, updated.metric, updated.trailing_mean, updated.trailing_stddev, updated.window_start, updated.window_end, updated.sample_count],
      );
    }

    // 4. Evaluate alert rules if device is linked to an asset with known category
    if (device.asset_id && device.category) {
      const rules = policyEngineEnabled()
        ? await resolveRulesForDevice(client, device)
        : RULES_BY_CATEGORY[device.category] ?? [];
      const fired = evaluateRuleSet(rules, metrics, device.specs);
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
}

// Resolve the effective threshold rules for a device via the Policy Engine.
// Runs after app.current_tenant_id is set, so both the epoch read and the
// resolver's policy read are tenant-scoped by RLS. The epoch is a cheap PK
// lookup that keys the resolver's warm-instance cache (Design §4.2).
async function resolveRulesForDevice(client: PoolClient, device: IngestDevice): Promise<Rule[]> {
  const { rows: [row] } = await client.query<{ policy_epoch: number }>(
    'SELECT policy_epoch FROM tenants WHERE id = $1',
    [device.tenant_id],
  );
  return resolvePolicyRules(client, {
    tenantId: device.tenant_id!,
    category: device.category,
    siteId: device.site_id,
    assetId: device.asset_id ?? null,
    epoch: row?.policy_epoch ?? 0,
  });
}

// ── Alert deduplication + creation ────────────────────────────────────────
// createAlertAndMaybeTicket()/createTicketForAlert() moved to
// ../shared/alerts.ts (2026-07-21) — a second consumer (device-silence
// detection) needed the exact same dedup→insert→maybe-ticket path, so it's
// now shared rather than duplicated. Behavior unchanged.

async function maybeCreateAlert(
  client: PoolClient,
  device: Device & { category: string; specs: AssetSpecs | null },
  fired: FiredRule,
  time: Date,
): Promise<void> {
  const { rule, value, threshold, message } = fired;
  await createAlertAndMaybeTicket(client, device, {
    type: 'threshold',
    severity: rule.severity,
    metric: rule.metric,
    message,
    context: { metric: rule.metric, threshold, actual: value },
    time,
  });
}
