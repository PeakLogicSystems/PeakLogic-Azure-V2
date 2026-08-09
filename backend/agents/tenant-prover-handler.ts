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

    const policyFinding = await checkHasPolicyReferencingTenant(pool, table);
    if (policyFinding) findings.push(policyFinding);
  }

  const { rows: tenantRows } = await pool.query<{ id: string }>(
    `SELECT id FROM tenants ORDER BY created_at DESC LIMIT 2`,
  );
  const tenantsProbed: [string, string] | null =
    tenantRows.length === 2 ? [tenantRows[0].id, tenantRows[1].id] : null;

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
