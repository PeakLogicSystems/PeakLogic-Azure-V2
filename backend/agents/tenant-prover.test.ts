import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  listTenantScopedTables,
  checkRlsEnabledAndForced,
  checkHasPolicyReferencingTenant,
  checkCurrentRoleNotPrivileged,
} from './tenant-prover';

// Unit coverage for the checks that can be meaningfully exercised against a
// mocked query() response (i.e. everything except the live cross-tenant
// probe and the session-variable-actually-applies check, both of which
// need a real transaction and real Postgres semantics to mean anything —
// see tenant-prover.integration.test.ts for those, following the same
// split db.integration.test.ts already establishes in this codebase.

function fakePool(response: unknown) {
  const query = vi.fn().mockResolvedValue(response);
  return { query } as unknown as Pool & { query: ReturnType<typeof vi.fn> };
}

describe('listTenantScopedTables', () => {
  it('returns every table name from the information_schema query, in order', async () => {
    const pool = fakePool({ rows: [{ table_name: 'assets' }, { table_name: 'devices' }] });
    const tables = await listTenantScopedTables(pool);
    expect(tables).toEqual(['assets', 'devices']);
    expect(pool.query.mock.calls[0][0]).toContain("column_name = 'tenant_id'");
  });
});

describe('checkRlsEnabledAndForced', () => {
  it('returns null (pass) when RLS is both enabled and forced', async () => {
    const pool = fakePool({ rows: [{ relrowsecurity: true, relforcerowsecurity: true }] });
    expect(await checkRlsEnabledAndForced(pool, 'devices')).toBeNull();
  });

  it('flags a table where RLS is not enabled at all', async () => {
    const pool = fakePool({ rows: [{ relrowsecurity: false, relforcerowsecurity: false }] });
    const finding = await checkRlsEnabledAndForced(pool, 'devices');
    expect(finding?.severity).toBe('critical');
    expect(finding?.detail).toMatch(/not.*ENABLED/);
  });

  it('flags a table where RLS is enabled but NOT forced — the exact multi-tenant-architecture.md §2.5 defect', async () => {
    const pool = fakePool({ rows: [{ relrowsecurity: true, relforcerowsecurity: false }] });
    const finding = await checkRlsEnabledAndForced(pool, 'devices');
    expect(finding?.severity).toBe('critical');
    expect(finding?.detail).toMatch(/not FORCED/);
  });

  it('flags a table that does not exist in pg_class at all, rather than silently passing', async () => {
    const pool = fakePool({ rows: [] });
    const finding = await checkRlsEnabledAndForced(pool, 'nonexistent');
    expect(finding?.severity).toBe('critical');
  });
});

describe('checkHasPolicyReferencingTenant', () => {
  it('returns null (pass) when a policy references app.current_tenant_id', async () => {
    const pool = fakePool({ rows: [{ qual: "tenant_id = app_uuid('app.current_tenant_id')", with_check: null }] });
    expect(await checkHasPolicyReferencingTenant(pool, 'devices')).toBeNull();
  });

  it('flags a table with zero policies', async () => {
    const pool = fakePool({ rows: [] });
    const finding = await checkHasPolicyReferencingTenant(pool, 'devices');
    expect(finding?.severity).toBe('critical');
    expect(finding?.detail).toContain('0 policies');
  });

  it('flags a table whose only policies reference something other than the tenant setting (e.g. channel-partner-only)', async () => {
    const pool = fakePool({ rows: [{ qual: "channel_partner_id = app_uuid('app.current_channel_partner_id')", with_check: null }] });
    const finding = await checkHasPolicyReferencingTenant(pool, 'devices');
    expect(finding?.severity).toBe('critical');
  });
});

describe('checkCurrentRoleNotPrivileged', () => {
  it('returns null (pass) for an ordinary, non-superuser, non-bypassrls role', async () => {
    const pool = fakePool({ rows: [{ rolname: 'peaklogic_app', rolsuper: false, rolbypassrls: false }] });
    expect(await checkCurrentRoleNotPrivileged(pool)).toBeNull();
  });

  it('flags a superuser connection — this is the exact TD-50 defect: every other check passes vacuously through it', async () => {
    const pool = fakePool({ rows: [{ rolname: 'postgres', rolsuper: true, rolbypassrls: false }] });
    const finding = await checkCurrentRoleNotPrivileged(pool);
    expect(finding?.severity).toBe('critical');
    expect(finding?.detail).toContain('superuser');
  });

  it('flags a BYPASSRLS role even if not a superuser', async () => {
    const pool = fakePool({ rows: [{ rolname: 'peaklogic_bypass', rolsuper: false, rolbypassrls: true }] });
    const finding = await checkCurrentRoleNotPrivileged(pool);
    expect(finding?.severity).toBe('critical');
    expect(finding?.detail).toContain('BYPASSRLS');
  });
});
