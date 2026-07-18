import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { RULES_BY_CATEGORY, evaluateRules, evaluateRuleSet, type FiredRule } from './rules';
import { resolvePolicyRules, __clearPolicyCacheForTests } from './policy-resolver';
import { PLATFORM_THRESHOLD_POLICIES } from './policy-seed';

// Policy Engine Design §8 step 3 — the DB-backed half of the golden proof.
// policy-seed.test.ts already proved the seed reproduces RULES_BY_CATEGORY and
// that the SQL migration matches the seed. This proves the RESOLVER, reading
// those rows out of a real Postgres UNDER RLS, produces the same effective
// rules — and that a tenant override actually takes precedence.
//
// Requires TEST_DATABASE_URL (a real, disposable Postgres). Skips itself with
// a clear message otherwise, same pattern as db.integration.test.ts.

const RUN = !!process.env.TEST_DATABASE_URL;
const describeIfDb = RUN ? describe : describe.skip;

// A fixed tenant id — the resolver relies on RLS (app.current_tenant_id), not
// a hand-written tenant_id filter, so this only needs to be a stable uuid.
const TENANT_A = '11111111-1111-1111-1111-111111111111';

const identity = (r: { metric: string; condition: string; severity: string }) =>
  `${r.metric}|${r.condition}|${r.severity}`;
// Compare fired alerts as a SET (order-independent — the resolver's SQL has no
// ORDER BY, and rule order doesn't affect which alerts fire).
function firedSet(fired: FiredRule[]) {
  return fired
    .map((f) => ({
      id: identity(f.rule),
      value: f.value,
      threshold: f.threshold,
      message: f.message,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

describeIfDb('policy resolver — DB-backed resolution under RLS (real Postgres)', () => {
  let setup: Client; // superuser — creates role, seeds (bypasses RLS)
  let owner: Client; // non-superuser, NOBYPASSRLS — RLS actually applies to reads

  beforeAll(async () => {
    setup = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await setup.connect();
    await setup.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await setup.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'policy_rls_owner') THEN
          CREATE ROLE policy_rls_owner LOGIN PASSWORD 'test' NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$;
    `);
    await setup.query('GRANT CREATE ON SCHEMA public TO policy_rls_owner');

    const ownerUrl = new URL(process.env.TEST_DATABASE_URL!);
    ownerUrl.username = 'policy_rls_owner';
    ownerUrl.password = 'test';
    owner = new Client({ connectionString: ownerUrl.toString() });
    await owner.connect();

    // policies table + RLS, mirroring the migration (minus the tenants FK,
    // unneeded here). Created AS the non-superuser owner so FORCE applies to it.
    await owner.query(`
      CREATE TABLE policies (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id    UUID,
        scope_level  TEXT NOT NULL,
        scope_id     UUID,
        category     TEXT NOT NULL,
        kind         TEXT NOT NULL,
        definition   JSONB NOT NULL,
        enabled      BOOLEAN NOT NULL DEFAULT TRUE
      );
      ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
      ALTER TABLE policies FORCE ROW LEVEL SECURITY;
      CREATE POLICY policies_platform_read ON policies FOR SELECT USING (tenant_id IS NULL);
      CREATE POLICY policies_tenant_rw ON policies FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
      GRANT SELECT, INSERT, UPDATE, DELETE ON policies TO policy_rls_owner;
    `);

    // Seed platform defaults as the SUPERUSER (bypasses RLS — mirrors the
    // migration runner). The non-superuser owner could not INSERT a
    // tenant_id NULL row (no policy grants it), which is exactly the intended
    // "tenants can't write the platform catalog" protection.
    for (const p of PLATFORM_THRESHOLD_POLICIES) {
      await setup.query(
        `INSERT INTO policies (tenant_id, scope_level, scope_id, category, kind, definition)
         VALUES (NULL, 'platform', NULL, $1, 'threshold', $2::jsonb)`,
        [p.category, JSON.stringify(p.definition)],
      );
    }
  });

  afterAll(async () => {
    if (owner) {
      await owner.query('DROP TABLE IF EXISTS policies CASCADE');
      await owner.end();
    }
    if (setup) {
      await setup.query('DROP ROLE IF EXISTS policy_rls_owner');
      await setup.end();
    }
  });

  it('resolves platform defaults identically to the compiled RULES_BY_CATEGORY', async () => {
    __clearPolicyCacheForTests();
    await owner.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);

    const VALUES = [0, 0.5, 1, 2, 7, 7.9, 8, 10, 35, 60, 100, 180, 1500];
    const METRICS = [
      'power_kw', 'flow_lpm', 'pressure_psi', 'temp_c', 'ph',
      'free_chlorine_ppm', 'tds_ppm', 'gas_leak_detected', 'product_temp_c', 'leak_detected',
    ];

    for (const category of Object.keys(RULES_BY_CATEGORY)) {
      const resolved = await resolvePolicyRules(owner, {
        tenantId: TENANT_A, category, siteId: null, assetId: null, epoch: 1,
      });
      for (const metric of METRICS) {
        for (const value of VALUES) {
          const reading = { [metric]: value };
          expect(firedSet(evaluateRuleSet(resolved, reading, null))).toEqual(
            firedSet(evaluateRules(category, reading, null)),
          );
        }
      }
    }
  });

  it('applies a tenant override with precedence over the platform default', async () => {
    // pool_system: temp_c > 35 (warning) is a platform default. Override it at
    // tenant scope to 40, so 37°C fires under platform but NOT under the tenant.
    const platform = await resolvePolicyRules(owner, {
      tenantId: TENANT_A, category: 'pool_system', siteId: null, assetId: null, epoch: 1,
    });
    expect(evaluateRuleSet(platform, { temp_c: 37 }, null)).toHaveLength(1);

    await setup.query(
      `INSERT INTO policies (tenant_id, scope_level, scope_id, category, kind, definition)
       VALUES ($1, 'tenant', NULL, 'pool_system', 'threshold', $2::jsonb)`,
      [
        TENANT_A,
        JSON.stringify({
          metric: 'temp_c', condition: 'gt', severity: 'warning',
          threshold: { type: 'static', value: 40 },
          message_template: 'Pool temperature {value:1}°C is above the site limit (40°C)',
        }),
      ],
    );

    __clearPolicyCacheForTests(); // epoch would change in prod; clear here
    const overridden = await resolvePolicyRules(owner, {
      tenantId: TENANT_A, category: 'pool_system', siteId: null, assetId: null, epoch: 2,
    });
    // 37 no longer fires (limit raised to 40); 41 still does.
    expect(evaluateRuleSet(overridden, { temp_c: 37 }, null)).toHaveLength(0);
    const fired = evaluateRuleSet(overridden, { temp_c: 41 }, null);
    expect(fired).toHaveLength(1);
    expect(fired[0].threshold).toBe(40);
  });
});
