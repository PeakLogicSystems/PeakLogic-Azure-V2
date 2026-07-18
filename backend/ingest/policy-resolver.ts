import type { PoolClient } from 'pg';
import { RULES_BY_CATEGORY, type Rule } from './rules';
import { compilePolicyToRule, type ThresholdPolicyDefinition } from './policy-seed';

// Policy Engine resolver (Policy Engine Design §4). Resolves the EFFECTIVE
// threshold rules for one device reading from the `policies` table, honouring
// platform → tenant → site → asset inheritance, then compiles them into the
// exact same Rule[] evaluateRuleSet() consumes. Runs INSIDE the ingest
// transaction, after app.current_tenant_id is set, so its reads are tenant-
// scoped by the same RLS as everything else (Design §5) — no tenant_id filter
// is hand-written here on purpose; RLS enforces it.
//
// Guarded behind POLICY_ENGINE_ENABLED — until that flag is on, ingest still
// uses the compiled-in RULES_BY_CATEGORY and none of this runs.

// Accept either a Pool's PoolClient or a plain pg Client (both have .query).
type Queryable = Pick<PoolClient, 'query'>;

export interface ResolveParams {
  tenantId: string;
  category: string;
  siteId: string | null;
  assetId: string | null;
  epoch: number;
}

export interface PolicyRow {
  scope_level: 'platform' | 'tenant' | 'site' | 'asset';
  definition: ThresholdPolicyDefinition;
  enabled: boolean;
}

// Specificity: a more specific scope overrides a less specific one for the
// same rule identity (metric, condition, severity).
const SCOPE_RANK: Record<string, number> = { platform: 0, tenant: 1, site: 2, asset: 3 };

// Warm-instance cache — same rationale as the pg pool singleton (Design §4.2).
// Keyed by tenant+category+scope+epoch; a policy write bumps tenants.policy_epoch,
// which changes the key, so a stale entry is simply never read again.
const cache = new Map<string, Rule[]>();

/** Test hook — clear the resolver cache between cases. */
export function __clearPolicyCacheForTests(): void {
  cache.clear();
}

/**
 * PURE: collapse a set of inherited/override policy rows into the effective
 * Rule[]. For each rule identity (metric, condition, severity), the row at the
 * most specific scope wins; if that winner is disabled, the rule is dropped
 * (an override can turn an inherited rule off). Exported so the precedence
 * logic is unit-testable without a database.
 */
export function compileResolvedRows(rows: PolicyRow[]): Rule[] {
  const winnerByIdentity = new Map<string, PolicyRow>();

  for (const row of rows) {
    const d = row.definition;
    const id = `${d.metric}|${d.condition}|${d.severity}`;
    const current = winnerByIdentity.get(id);
    if (!current || SCOPE_RANK[row.scope_level] > SCOPE_RANK[current.scope_level]) {
      winnerByIdentity.set(id, row);
    }
  }

  const rules: Rule[] = [];
  for (const winner of winnerByIdentity.values()) {
    if (!winner.enabled) continue; // most-specific scope disables the rule
    rules.push(compilePolicyToRule(winner.definition));
  }
  return rules;
}

/**
 * Resolves the effective threshold Rule[] for a device reading. Cached per
 * (tenant, category, scope, epoch). Fail-safe: on ANY error, and when the
 * platform catalog isn't seeded (zero rows), falls back to the compiled-in
 * RULES_BY_CATEGORY — a safety monitor must never fail into silence
 * (Design §4.3). The compiled seed is a permanent floor, never removed.
 */
export async function resolvePolicyRules(client: Queryable, params: ResolveParams): Promise<Rule[]> {
  const { tenantId, category, siteId, assetId, epoch } = params;
  const key = `${tenantId}|${category}|${siteId ?? ''}|${assetId ?? ''}|${epoch}`;

  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { rows } = await client.query<PolicyRow>(
      `SELECT scope_level, definition, enabled
         FROM policies
        WHERE kind = 'threshold'
          AND category = $1
          AND ( scope_level IN ('platform','tenant')
             OR (scope_level = 'site'  AND scope_id = $2)
             OR (scope_level = 'asset' AND scope_id = $3) )`,
      [category, siteId, assetId],
    );

    // Zero rows ⇒ the platform catalog isn't seeded (migration not yet applied
    // in this environment). Fall back rather than silently monitor nothing.
    if (rows.length === 0) {
      return RULES_BY_CATEGORY[category] ?? [];
    }

    const resolved = compileResolvedRows(rows);
    cache.set(key, resolved);
    return resolved;
  } catch (err) {
    console.error(
      `Policy resolution failed for category "${category}" — falling back to the compiled seed`,
      err,
    );
    return RULES_BY_CATEGORY[category] ?? [];
  }
}
