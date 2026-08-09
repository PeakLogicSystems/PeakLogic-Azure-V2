import type { Pool, PoolClient } from 'pg';
import {
  listTenantScopedTables,
  checkRlsEnabledAndForced,
  checkHasPolicyReferencingTenant,
  checkCurrentRoleNotPrivileged,
  checkSessionVariableActuallyApplies,
  checkNoCrossTenantLeak,
  type Finding,
} from './tenant-prover';

// Orchestration for WARDEN-TEN (see tenant-prover.ts for the check logic
// itself and the full design rationale). This is the part that decides
// WHICH tables and tenants to check against a real, connected Pool — kept
// separate from the pure checks so each check stays independently testable
// with a minimal fake client (tenant-prover.test.ts).

export interface ProveResult {
  tablesChecked: string[];
  tenantsProbed: [string, string] | null;
  findings: Finding[];
}

/**
 * Tables that carry a `tenant_id` column but are NOT tenant-facing —
 * staff-only administrative tables no tenant-authenticated connection can
 * reach through any grant, where `tenant_id` is an attribute of the row
 * (e.g. "which tenant is this staff assignment for"), not an access
 * boundary. `checkHasPolicyReferencingTenant` assumes the opposite for
 * every tenant-scoped table; this is a deliberate, narrow, WRITTEN
 * exception to that assumption, not a hand-maintained substitute for the
 * table-discovery itself — every other table is still auto-discovered.
 *
 * Found by CI (2026-08-09): `account_assignments`' only policy
 * (`account_assignment_visibility`, docs/data-model.sql) scopes by
 * `staff_user_id`/superadmin role, matching `channel_partners`' own
 * documented, deliberate exemption from the standard tenant model in the
 * same file. Any addition here needs the same citation of the real policy
 * that provides isolation instead.
 */
const TENANT_POLICY_CHECK_EXEMPT_TABLES: ReadonlySet<string> = new Set(['account_assignments']);

/**
 * Runs every WARDEN-TEN check against every tenant-scoped table this
 * database actually has, plus the two connection/session-level checks that
 * only need to run once. Picks the two most-recently-created real tenants
 * for the live cross-tenant probe (check 4) — real data, not a fixture
 * this checker invents itself, so it can never accidentally prove its own
 * synthetic setup rather than the database's actual state.
 */
export async function proveTenantIsolation(pool: Pool): Promise<ProveResult> {
  const findings: Finding[] = [];

  const connectionClient = await pool.connect();
  let sessionCheckResult: Finding | null;
  try {
    const roleFinding = await checkCurrentRoleNotPrivileged(connectionClient);
    if (roleFinding) findings.push(roleFinding);
    sessionCheckResult = await checkSessionVariableActuallyApplies(connectionClient);
    if (sessionCheckResult) findings.push(sessionCheckResult);
  } finally {
    connectionClient.release();
  }

  const tables = await listTenantScopedTables(pool);

  for (const table of tables) {
    const rlsFinding = await checkRlsEnabledAndForced(pool, table);
    if (rlsFinding) findings.push(rlsFinding);

    if (!TENANT_POLICY_CHECK_EXEMPT_TABLES.has(table)) {
      const policyFinding = await checkHasPolicyReferencingTenant(pool, table);
      if (policyFinding) findings.push(policyFinding);
    }
  }

  const tenantsProbed = await enumerateTwoTenantsToProbe(pool);

  if (tenantsProbed) {
    const probeClient = await pool.connect();
    try {
      for (const table of tables) {
        if (table === 'tenants') continue; // tenants itself has no cross-tenant leak concept — it IS the tenant row
        const leakFinding = await checkNoCrossTenantLeak(probeClient, table, tenantsProbed[0], tenantsProbed[1]);
        if (leakFinding) findings.push(leakFinding);
      }
    } finally {
      probeClient.release();
    }
  } else {
    findings.push({
      severity: 'gap',
      check: 'no-cross-tenant-leak',
      table: '(all tenant-scoped tables)',
      detail: 'fewer than 2 tenants exist in this database — live cross-tenant probe skipped entirely, not a pass',
    });
  }

  return { tablesChecked: tables, tenantsProbed, findings };
}

/**
 * `tenants` itself is RLS-protected (`staff_tenant_access`, staff-only) —
 * this prover's own connection is deliberately a non-privileged app role
 * (check 3 requires it), so a plain `SELECT id FROM tenants` through `pool`
 * sees zero rows regardless of how much real tenant data exists. Same bug
 * shape as checkNoCrossTenantLeak's original count query, and the exact
 * reason it went uncaught until the real warden-ten CI job ran against the
 * genuinely migrated schema (2026-08-09) rather than a synthetic one.
 *
 * Fixed using the SAME narrowly-scoped system read jobs/silence-detection-
 * handler.ts's enumerateTenantIds() already established for this identical
 * problem (a scheduled cross-tenant job needing to enumerate tenants
 * without becoming a general-purpose cross-tenant hole): `SET LOCAL
 * app.system_sweep_context = 'true'` (migration 1784051700000) is a
 * hardcoded literal, not a bind parameter, so it's unaffected by the SET
 * LOCAL bind-parameter bug — activates ONLY tenants' permissive
 * system_sweep_read policy, for this one query, then reverts at COMMIT.
 */
async function enumerateTwoTenantsToProbe(pool: Pool): Promise<[string, string] | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.system_sweep_context = 'true'");
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM tenants ORDER BY created_at DESC LIMIT 2`,
    );
    await client.query('COMMIT');
    return rows.length === 2 ? [rows[0].id, rows[1].id] : null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Exit-code-ready summary, per §9.3: "In CI: fail the build." */
export function hasCriticalFinding(result: ProveResult): boolean {
  return result.findings.some((f) => f.severity === 'critical');
}

export function formatReport(result: ProveResult): string {
  const lines: string[] = [];
  lines.push(`WARDEN-TEN — tenant isolation prover`);
  lines.push(`Tables checked: ${result.tablesChecked.length} (${result.tablesChecked.join(', ')})`);
  lines.push(
    result.tenantsProbed
      ? `Live probe: tenant ${result.tenantsProbed[0]} <-> tenant ${result.tenantsProbed[1]}`
      : `Live probe: SKIPPED (fewer than 2 tenants exist)`,
  );
  if (result.findings.length === 0) {
    lines.push('PASS — no findings.');
    return lines.join('\n');
  }
  const critical = result.findings.filter((f) => f.severity === 'critical');
  const gaps = result.findings.filter((f) => f.severity === 'gap');
  if (critical.length) {
    lines.push(`\nCRITICAL (${critical.length}):`);
    for (const f of critical) lines.push(`  [${f.check}] ${f.table}: ${f.detail}`);
  }
  if (gaps.length) {
    lines.push(`\nGAPS — not failures, but not verified either (${gaps.length}):`);
    for (const f of gaps) lines.push(`  [${f.check}] ${f.table}: ${f.detail}`);
  }
  return lines.join('\n');
}
