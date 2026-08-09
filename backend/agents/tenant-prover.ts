import type { Pool, PoolClient } from 'pg';

// WARDEN-TEN (agent-operations-team-design.md §3.14, §9.3) — "the
// highest-priority gap in this entire design." The isolation mechanism
// this whole platform's security model depends on was broken for the
// project's ENTIRE history (the SET LOCAL bind-parameter bug, CLAUDE.md's
// Tenant Isolation section) and nothing detected it — not code review, not
// unit tests, not typechecking. This is the continuous prover the design
// doc says would have. Built first among the 16 agents, per the design
// doc's own instruction (§9.3: "build this first... needs no Azure
// subscription and can ship today").
//
// Pure, testable check logic — no bus publication, no scheduling. See
// tenant-prover-handler.ts for orchestration (enumerating tables, picking
// tenants to probe) and tenant-prover.main.ts for the (currently inert,
// pending deployment) Timer trigger.
//
// FAILURE HANDLING, per the design doc, followed exactly: ANY failed check
// is 'critical'. There is no warning tier for a tenant boundary, and one
// must not be added here. A finding never includes leaked row CONTENTS —
// only which table/tenant/check failed — so the alert itself never becomes
// a second exposure.

export type FindingSeverity = 'critical' | 'gap';

export interface Finding {
  severity: FindingSeverity;
  check: string;
  table: string;
  detail: string;
}

/** Every table in the public schema carrying a tenant_id column — the same
 * convention the schema itself already uses to mean "tenant-scoped" (see
 * docs/data-model.sql). Not a hand-maintained list: a new tenant-scoped
 * table is picked up automatically the next time this runs, which is the
 * whole point of a continuous prover over a point-in-time code review. */
export async function listTenantScopedTables(client: PoolClient | Pool): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT DISTINCT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id'
     ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

/** Check 1 (§9.3): RLS must be both ENABLED and FORCED. FORCE is the part
 * that's easy to forget — without it, the table's own OWNER (not just a
 * superuser) silently bypasses every policy, which is exactly the defect
 * multi-tenant-architecture.md §2.5 found and fixed live. */
export async function checkRlsEnabledAndForced(client: PoolClient | Pool, table: string): Promise<Finding | null> {
  const { rows } = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1 AND relkind = 'r'`,
    [table],
  );
  const row = rows[0];
  if (!row) return { severity: 'critical', check: 'rls-enabled-and-forced', table, detail: `table not found in pg_class` };
  if (!row.relrowsecurity) return { severity: 'critical', check: 'rls-enabled-and-forced', table, detail: 'RLS is not ENABLED' };
  if (!row.relforcerowsecurity) return { severity: 'critical', check: 'rls-enabled-and-forced', table, detail: 'RLS is enabled but not FORCED — the table owner would bypass every policy' };
  return null;
}

/** Check 2 (§9.3): at least one policy must actually reference the tenant
 * session setting — a table with RLS enabled+forced but zero policies, or
 * only policies scoped to something else entirely (e.g. a channel-partner-
 * only policy with no tenant-scoped counterpart), is not actually isolated
 * by tenant even though the flags above would both read true. */
export async function checkHasPolicyReferencingTenant(client: PoolClient | Pool, table: string): Promise<Finding | null> {
  const { rows } = await client.query<{ qual: string | null; with_check: string | null }>(
    `SELECT qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
    [table],
  );
  const referencesTenant = rows.some(
    (r) => (r.qual ?? '').includes('current_tenant_id') || (r.with_check ?? '').includes('current_tenant_id'),
  );
  if (!referencesTenant) {
    return { severity: 'critical', check: 'has-policy-referencing-tenant', table, detail: `no RLS policy on this table references app.current_tenant_id (${rows.length} polic${rows.length === 1 ? 'y' : 'ies'} found)` };
  }
  return null;
}

/** Check 3 (§9.3): the role this check itself is running as must not be a
 * superuser or hold BYPASSRLS — checking pg_class flags from a connection
 * that would ignore them anyway proves nothing (this is precisely TD-50:
 * a superuser connection made every other RLS assertion in this codebase's
 * history pass vacuously). This is a check ON THE PROVER'S OWN CONNECTION,
 * not a fleet-wide role audit — CIPHER-IAM (§3.15, access review) owns
 * the broader "list every role and its grants" concern. */
export async function checkCurrentRoleNotPrivileged(client: PoolClient | Pool): Promise<Finding | null> {
  const { rows: [role] } = await client.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
  );
  if (!role) return { severity: 'critical', check: 'current-role-not-privileged', table: '(connection)', detail: 'could not resolve current_user in pg_roles' };
  if (role.rolsuper) return { severity: 'critical', check: 'current-role-not-privileged', table: '(connection)', detail: `connected as superuser '${role.rolname}' — every check above would pass vacuously; TD-50` };
  if (role.rolbypassrls) return { severity: 'critical', check: 'current-role-not-privileged', table: '(connection)', detail: `connected as '${role.rolname}', which holds BYPASSRLS — every check above would pass vacuously` };
  return null;
}

/** Check 5 (§9.3) — the specific bug this project actually had: SET LOCAL
 * with a bind parameter silently never worked at all (invalid Postgres
 * syntax, no error thrown by node-postgres either), so the isolation
 * mechanism could look correct in every static check while never having
 * applied to a single query. Assert set_config()'s effect directly, and
 * that it reverts at transaction end (is_local=true), rather than trusting
 * the application code that calls it. */
export async function checkSessionVariableActuallyApplies(client: PoolClient): Promise<Finding | null> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, ['warden-ten-probe-value']);
    const { rows: [during] } = await client.query<{ v: string | null }>(`SELECT current_setting('app.current_tenant_id', true) AS v`);
    if (during?.v !== 'warden-ten-probe-value') {
      return { severity: 'critical', check: 'session-variable-applies', table: '(session)', detail: `set_config() did not take effect within the transaction (read back '${during?.v}')` };
    }
    await client.query('COMMIT');
    const { rows: [after] } = await client.query<{ v: string | null }>(`SELECT current_setting('app.current_tenant_id', true) AS v`);
    if (after?.v) {
      return { severity: 'critical', check: 'session-variable-applies', table: '(session)', detail: `is_local=true value leaked past transaction end (read back '${after.v}') — a connection-pool-reused session could see a previous request's tenant` };
    }
    return null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/**
 * Check 4 (§9.3) — the live cross-tenant probe. Opens a transaction as
 * tenant A (via the exact same set_config() mechanism the real application
 * uses, not a shortcut), queries the table, and asserts zero rows carry
 * tenant B's id — then repeats the other direction (as tenant B, looking
 * for tenant A's rows). "Never fabricate. Missing data is reported as a
 * gap, never interpolated, never rendered as healthy" (§9.1 preamble) — a
 * table where a tenant has no visible rows of its own can't be live-probed
 * at all, and says so explicitly rather than reporting a false pass.
 *
 * BUG FIXED 2026-08-09, caught by the real backend-integration-tests CI run
 * (not locally — this file's own integration tests only run there): the
 * original implementation counted rows with a plain, unscoped
 * `count(DISTINCT tenant_id)` query BEFORE setting any tenant context. That
 * query runs through this same non-privileged client — the same client
 * check 3 requires NOT be a superuser/BYPASSRLS role — so on a genuinely,
 * correctly isolated table it always saw zero rows (RLS filters everything
 * out with no tenant context set) and permanently misreported "insufficient
 * data," even with real two-tenant data present. Fixed by folding the
 * data-existence check into the same tenant-scoped transaction as the leak
 * check itself, once per direction.
 */
export async function checkNoCrossTenantLeak(
  client: PoolClient,
  table: string,
  tenantA: string,
  tenantB: string,
): Promise<Finding | null> {
  const asA = await probeAsTenant(client, table, tenantA, tenantB);
  const asB = await probeAsTenant(client, table, tenantB, tenantA);

  if (!asA.hasOwnData || !asB.hasOwnData) {
    return { severity: 'gap', check: 'no-cross-tenant-leak', table, detail: `insufficient data to live-probe (fewer than 2 tenants have rows) — not a pass, a gap` };
  }
  if (asA.sawOtherTenant || asB.sawOtherTenant) {
    // Deliberately no row contents in the finding — the alert must never
    // become a second exposure of the leaked data (§9.3 FAILURE HANDLING).
    return { severity: 'critical', check: 'no-cross-tenant-leak', table, detail: `a tenant's session read at least one row belonging to another tenant — cross-tenant leak` };
  }
  return null;
}

async function probeAsTenant(
  client: PoolClient,
  table: string,
  asTenant: string,
  otherTenant: string,
): Promise<{ hasOwnData: boolean; sawOtherTenant: boolean }> {
  await client.query('BEGIN');
  try {
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [asTenant]);
    const { rows: ownRows } = await client.query(`SELECT 1 FROM ${quoteIdent(table)} LIMIT 1`);
    const { rows: otherRows } = await client.query(`SELECT 1 FROM ${quoteIdent(table)} WHERE tenant_id = $1 LIMIT 1`, [otherTenant]);
    await client.query('COMMIT');
    return { hasOwnData: ownRows.length > 0, sawOtherTenant: otherRows.length > 0 };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/** Postgres identifiers from information_schema are safe to double-quote
 * directly (they're existing real table names from this database's own
 * catalog, not user input) — this only guards against a name needing
 * quoting (mixed case, reserved word), not against injection. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
