import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetSpecs } from '../shared/types';
import { RULES_BY_CATEGORY, evaluateRules, evaluateRuleSet, type FiredRule } from './rules';
import {
  PLATFORM_THRESHOLD_POLICIES,
  buildSeedRulesByCategory,
  compileThreshold,
  renderMessage,
  type ThresholdPolicyDefinition,
} from './policy-seed';

// Policy Engine Design §8 step 2 — the GOLDEN BASELINE. The whole migration
// strategy hinges on this: the structured seed must reproduce the compiled-in
// RULES_BY_CATEGORY exactly (fired rules, thresholds, AND messages) before the
// resolver is ever allowed to feed ingest. If this fails, the seed is wrong,
// not the code — do not "fix" it by editing the golden expectation.

// Compare only the OBSERVABLE output of a fired rule (what an alert row gets).
// The `rule.threshold`/`rule.message` closures differ by identity between the
// seed-compiled and hardcoded rules, so comparing them directly would be
// meaningless — the value/threshold/message they PRODUCE is the real contract.
function observable(fired: FiredRule[]) {
  return fired.map((f) => ({
    metric: f.rule.metric,
    condition: f.rule.condition,
    severity: f.rule.severity,
    value: f.value,
    threshold: f.threshold,
    message: f.message,
  }));
}
const identity = (r: { metric: string; condition: string; severity: string }) =>
  `${r.metric}|${r.condition}|${r.severity}`;

describe('policy seed — structural equivalence with RULES_BY_CATEGORY', () => {
  const seed = buildSeedRulesByCategory();

  it('covers exactly the same categories', () => {
    expect(Object.keys(seed).sort()).toEqual(Object.keys(RULES_BY_CATEGORY).sort());
  });

  it('has the same rule identities in the same order, per category', () => {
    for (const category of Object.keys(RULES_BY_CATEGORY)) {
      expect(seed[category].map(identity)).toEqual(RULES_BY_CATEGORY[category].map(identity));
    }
  });

  it('has a unique (metric, condition, severity) identity per rule within each category', () => {
    for (const category of Object.keys(seed)) {
      const ids = seed[category].map(identity);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('policy seed — golden behavioural baseline (seed == hardcoded)', () => {
  const seed = buildSeedRulesByCategory();

  // Values chosen to straddle every threshold and default in the seed
  // (fallbacks, spec-relative factors, static cutoffs, detection 0.5s).
  const VALUES = [
    -1, 0, 0.4, 0.5, 0.6, 1, 1.9, 2, 2.1, 6.9, 7, 7.1, 7.5, 7.79, 7.8, 7.81, 8, 8.1,
    9, 9.9, 10, 10.1, 34, 35, 36, 59, 60, 61, 99, 100, 124, 125, 149, 150, 179, 180,
    181, 1499, 1500, 1501,
  ];
  const METRICS = [
    'power_kw', 'flow_lpm', 'pressure_psi', 'temp_c', 'ph', 'free_chlorine_ppm',
    'tds_ppm', 'gas_leak_detected', 'product_temp_c', 'leak_detected',
  ];
  const SPECS: (AssetSpecs | null)[] = [
    null, {}, { power_kw: 10 }, { power_kw: 2 }, { flow_lpm: 200 }, { pressure_psi: 50 },
    { temp_max_c: 100 }, { temp_max_c: 4 },
    { power_kw: 10, flow_lpm: 150, pressure_psi: 80, temp_max_c: 120 },
  ];

  it('produces identical alerts for every category × metric × value × specs', () => {
    const mismatches: string[] = [];
    for (const category of Object.keys(RULES_BY_CATEGORY)) {
      for (const specs of SPECS) {
        for (const metric of METRICS) {
          for (const value of VALUES) {
            const reading = { [metric]: value };
            const fromSeed = JSON.stringify(observable(evaluateRuleSet(seed[category], reading, specs)));
            const fromHardcoded = JSON.stringify(observable(evaluateRules(category, reading, specs)));
            if (fromSeed !== fromHardcoded) {
              mismatches.push(
                `${category} ${metric}=${value} specs=${JSON.stringify(specs)}\n` +
                  `  seed: ${fromSeed}\n  base: ${fromHardcoded}`,
              );
            }
          }
        }
      }
    }
    // Show the first few divergences if any, then assert none at all.
    expect(mismatches.slice(0, 8)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });
});

describe('policy seed — compiler primitives', () => {
  it('renders {value:n} / {threshold:n} with the same toFixed formatting as the seed', () => {
    expect(renderMessage('Power draw {value:1} kW exceeds {threshold:1} kW', 12.34, 6.25)).toBe(
      'Power draw 12.3 kW exceeds 6.3 kW',
    );
    expect(renderMessage('Flow {value:0} L/min below {threshold:0}', 149.6, 112.5)).toBe(
      'Flow 150 L/min below 113',
    );
  });

  it('compiles a static threshold to its literal value', () => {
    const t = compileThreshold({ type: 'static', value: 35 });
    expect(t).toBe(35);
  });

  it('compiles a spec_relative threshold, using the fallback when the spec is absent', () => {
    const t = compileThreshold({ type: 'spec_relative', spec: 'power_kw', fallback: 5, factor: 1.25 });
    expect(typeof t).toBe('function');
    const fn = t as (s: AssetSpecs) => number;
    expect(fn({})).toBeCloseTo(6.25); // 5 * 1.25
    expect(fn({ power_kw: 10 })).toBeCloseTo(12.5); // 10 * 1.25
  });
});

describe('policy seed — SQL migration matches the TS module (SQL == module)', () => {
  // Parse the platform-default seed rows straight out of the migration file and
  // assert they equal PLATFORM_THRESHOLD_POLICIES. Combined with the golden
  // baseline above (module == hardcoded), this gives SQL == module == hardcoded,
  // so the DB a resolver will read is provably faithful — no hand-transcription
  // trust required.
  const sqlPath = join(__dirname, '../../scripts/migrations/1783875840000_policy-engine.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const rowRe =
    /\(\s*NULL,\s*'platform',\s*NULL,\s*'([^']+)',\s*'threshold',\s*'((?:[^']|'')*)'::jsonb\)/g;

  const canonThreshold = (t: ThresholdPolicyDefinition['threshold']) =>
    t.type === 'static' ? `static:${t.value}` : `rel:${t.spec}:${t.fallback}:${t.factor}`;
  const canon = (category: string, d: ThresholdPolicyDefinition) =>
    [category, d.metric, d.condition, d.severity, canonThreshold(d.threshold), d.message_template].join('|');

  it('extracts every seed row and matches the module exactly', () => {
    const sqlRows = [...sql.matchAll(rowRe)].map((m) => ({
      category: m[1],
      definition: JSON.parse(m[2].replace(/''/g, "'")) as ThresholdPolicyDefinition,
    }));

    // Sanity: parsed the file at all, and every module row is present in SQL.
    expect(sqlRows.length).toBe(PLATFORM_THRESHOLD_POLICIES.length);
    expect(sqlRows.length).toBeGreaterThan(0);

    const sqlSet = sqlRows.map((r) => canon(r.category, r.definition)).sort();
    const moduleSet = PLATFORM_THRESHOLD_POLICIES.map((p) => canon(p.category, p.definition)).sort();
    expect(sqlSet).toEqual(moduleSet);
  });
});
