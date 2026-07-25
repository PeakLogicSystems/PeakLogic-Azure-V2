import type { PoolClient } from 'pg';
import { getPool, withTenant } from '../shared/db';
import { findDuePmSchedules, type PmSchedule } from './pm-generation';

/**
 * PM work-order generation orchestrator (PRD §5.20 CM-3.1). Runs as a
 * scheduled sweep (Timer-triggered, see pm-generation.main.ts), so — exactly
 * like silence-detection-handler.ts — it can't use withTenant()'s single-
 * tenant entry point directly. Same two-phase isolation discipline:
 *
 *   1. A narrowly-scoped system read (app.system_sweep_context, migration
 *      1784051700000) to enumerate tenant ids — the only cross-tenant step,
 *      reads `id` only.
 *   2. Per-tenant fan-out through the UNMODIFIED withTenant() — every write
 *      (work-order INSERT, next_due_at advance) is fully RLS-scoped.
 *
 * One tenant erroring never aborts the sweep. A due schedule advances its
 * next_due_at in the SAME transaction that creates its work orders, so a
 * re-run before the next due date is a no-op — idempotent within a run.
 *
 * (The tenant-id enumeration mirrors silence-detection-handler.ts's private
 * helper rather than sharing one; a later simplify pass can lift a single
 * `enumerateTenantIds()` into shared/db.ts. Kept local here to avoid
 * touching the working silence-detection path.)
 */

interface PmScheduleRow {
  id: string;
  asset_id: string | null;
  category: string | null;
  title: string;
  interval_days: number;
  next_due_at: Date;
  enabled: boolean;
}

export interface PmSweepResult {
  tenantsScanned: number;
  tenantsSkipped: number;
  workOrdersCreated: number;
}

export async function runPmGenerationSweep(now: Date = new Date()): Promise<PmSweepResult> {
  const tenantIds = await enumerateTenantIds();

  let tenantsScanned = 0;
  let tenantsSkipped = 0;
  let workOrdersCreated = 0;

  for (const tenantId of tenantIds) {
    try {
      workOrdersCreated += await withTenant(tenantId, (client) => scanTenant(client, tenantId, now));
      tenantsScanned++;
    } catch (err) {
      tenantsSkipped++;
      console.error(`PM generation sweep: skipped tenant ${tenantId}`, err);
    }
  }

  return { tenantsScanned, tenantsSkipped, workOrdersCreated };
}

async function enumerateTenantIds(): Promise<string[]> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.system_sweep_context = 'true'");
    const { rows } = await client.query<{ id: string }>('SELECT id FROM tenants');
    await client.query('COMMIT');
    return rows.map((r) => r.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function scanTenant(client: PoolClient, tenantId: string, now: Date): Promise<number> {
  const { rows } = await client.query<PmScheduleRow>(
    `SELECT id, asset_id, category, title, interval_days, next_due_at, enabled
     FROM pm_schedules
     WHERE enabled AND next_due_at <= $1`,
    [now],
  );
  if (rows.length === 0) return 0;

  const schedules: PmSchedule[] = rows.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    category: r.category,
    title: r.title,
    intervalDays: r.interval_days,
    nextDueAt: r.next_due_at,
    enabled: r.enabled,
  }));

  let created = 0;
  for (const due of findDuePmSchedules(schedules, now)) {
    // Resolve the target assets: a specific asset, or every asset of a
    // category (one work order per asset — service_tickets.asset_id is NOT
    // NULL, so a category schedule fans out to its members).
    const assetIds = due.assetId
      ? [due.assetId]
      : (
          await client.query<{ id: string }>(`SELECT id FROM assets WHERE category = $1`, [due.category])
        ).rows.map((r) => r.id);

    for (const assetId of assetIds) {
      // A PM-generated work order: source 'automated' (not alarm-driven —
      // alert_id stays null), linked back to its schedule. tenant_id is set
      // explicitly to the tenant under RLS context (WITH CHECK requires it to
      // match app.current_tenant_id, which withTenant() has set).
      await client.query(
        `INSERT INTO service_tickets
           (tenant_id, asset_id, title, description, priority, source, pm_schedule_id, status)
         VALUES ($1, $2, $3, $4, 'medium', 'automated', $5, 'open')`,
        [tenantId, assetId, due.title, `Scheduled preventive maintenance (auto-generated).`, due.scheduleId],
      );
      created++;
    }

    await client.query(`UPDATE pm_schedules SET next_due_at = $1, updated_at = now() WHERE id = $2`, [
      due.newNextDueAt,
      due.scheduleId,
    ]);
  }

  return created;
}
