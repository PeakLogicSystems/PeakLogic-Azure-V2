import type { AssetSpecs } from '../shared/types';
import type { Condition, Rule } from './rules';

// Policy Engine — the platform-default policy seed (Policy Engine Design §3.2,
// §8 step 1). This module is the SINGLE SOURCE OF TRUTH for the structured
// form of the default alert rules. It exists to:
//   1. express every rule in RULES_BY_CATEGORY as data (JSONB-shaped), and
//   2. compile that data back into the exact same `Rule[]` the pure
//      evaluateRuleSet() consumes.
//
// The SQL migration seeds these same rows into the `policies` table; the
// golden-baseline test (policy-seed.test.ts) proves this structured form
// reproduces RULES_BY_CATEGORY byte-for-byte (messages included), and a
// second test proves the migration's SQL seed matches this module. So the
// chain is: SQL seed == this module == RULES_BY_CATEGORY. If any of the three
// drifts, a test fails — that's the whole point of doing it this way.
//
// NOTE: nothing imports this at runtime yet. The ingest path still uses the
// compiled-in RULES_BY_CATEGORY until the resolver + feature flag land
// (Design §8 steps 2–3). This is the zero-behaviour-change first step.

// Closed structured threshold — deliberately NOT an expression language.
// Every function-threshold in the seed is exactly `(specs.SPEC ?? FALLBACK) *
// FACTOR`, so these two shapes cover 100% of them with no eval / no injection
// surface (Design §0, §3.2). If a future rule needs richer math, add a new
// `type`, never a formula string.
export type ThresholdSpec =
  | { type: 'static'; value: number }
  | { type: 'spec_relative'; spec: string; fallback: number; factor: number };

export interface ThresholdPolicyDefinition {
  metric: string;
  condition: Condition;
  severity: Rule['severity'];
  threshold: ThresholdSpec;
  // Template with {value} / {threshold} tokens and optional precision
  // ({value:1} -> toFixed(1)). Reproduces the seed's message() closures.
  message_template: string;
}

export interface SeedPolicy {
  category: string;
  kind: 'threshold';
  definition: ThresholdPolicyDefinition;
}

// Order within each category MIRRORS RULES_BY_CATEGORY exactly — evaluateRuleSet
// returns fired rules in rule order, so the golden test compares order too.
export const PLATFORM_THRESHOLD_POLICIES: SeedPolicy[] = [
  // pump
  t('pump', 'power_kw', 'gt', 'warning', rel('power_kw', 5, 1.25),
    'Power draw {value:1} kW exceeds rated limit {threshold:1} kW'),
  t('pump', 'power_kw', 'gt', 'critical', rel('power_kw', 5, 1.5),
    'Power draw {value:1} kW is critically high (limit: {threshold:1} kW)'),
  t('pump', 'flow_lpm', 'lt', 'warning', rel('flow_lpm', 100, 0.75),
    'Flow rate {value:0} L/min is below minimum {threshold:0} L/min'),
  t('pump', 'pressure_psi', 'gt', 'critical', rel('pressure_psi', 80, 1.2),
    'Pressure {value:0} psi exceeds safe limit {threshold:0} psi'),

  // hvac
  t('hvac', 'temp_c', 'gt', 'critical', rel('temp_max_c', 180, 1),
    'Temperature {value:0}°C exceeds maximum {threshold:0}°C'),
  t('hvac', 'temp_c', 'lt', 'warning', stat(60),
    'Temperature {value:0}°C is below operating range (min 60°C)'),

  // pool_system
  t('pool_system', 'flow_lpm', 'lt', 'warning', rel('flow_lpm', 150, 0.8),
    'Pool flow rate {value:0} L/min is below minimum {threshold:0} L/min'),
  t('pool_system', 'temp_c', 'gt', 'warning', stat(35),
    'Pool temperature {value:1}°C is above safe limit (35°C)'),

  // pool_chemistry (CDC MAHC-sourced; see rules.ts comments)
  t('pool_chemistry', 'ph', 'lt', 'warning', stat(7.0),
    'Pool pH {value:1} is below the CDC-recommended range (7.0-7.8) — water may be corrosive and irritating to swimmers'),
  t('pool_chemistry', 'ph', 'gt', 'warning', stat(7.8),
    "Pool pH {value:1} is above the CDC-recommended range (7.0-7.8) — chlorine's ability to kill germs is reduced"),
  t('pool_chemistry', 'ph', 'gt', 'critical', stat(8.0),
    "Pool pH {value:1} is critically high — chlorine's disinfecting effectiveness is significantly impaired above pH 8.0 (CDC MAHC)"),
  t('pool_chemistry', 'free_chlorine_ppm', 'lt', 'warning', stat(2),
    'Free chlorine {value:1} ppm is below the CDC-recommended minimum (2 ppm) — water may not be adequately disinfected'),
  t('pool_chemistry', 'free_chlorine_ppm', 'gt', 'critical', stat(10),
    'Free chlorine {value:1} ppm exceeds the CDC bather-safety limit (10 ppm)'),
  t('pool_chemistry', 'tds_ppm', 'gt', 'warning', stat(1500),
    'Total dissolved solids {value:0} ppm exceeds the industry-standard guideline ({threshold:0} ppm) — water clarity and chemical efficiency may degrade'),

  // gas_sensor
  t('gas_sensor', 'gas_leak_detected', 'gt', 'critical', stat(0.5),
    'Gas leak detected — immediate shutoff/inspection required'),

  // refrigeration (probe temp of the product itself)
  t('refrigeration', 'product_temp_c', 'gt', 'warning', rel('temp_max_c', 4.4, 1),
    'Product temperature {value:1}°C exceeds FDA safe cold-holding limit {threshold:1}°C'),
  t('refrigeration', 'product_temp_c', 'gt', 'critical', stat(7),
    'Product temperature {value:1}°C has been in the food-safety danger zone — discard-risk threshold exceeded'),

  // leak_sensor
  t('leak_sensor', 'leak_detected', 'gt', 'critical', stat(0.5),
    'Leak detected — immediate shutoff/inspection required to prevent water damage'),

  // energy_meter
  t('energy_meter', 'power_kw', 'gt', 'warning', rel('power_kw', 10, 1.3),
    'Power draw {value:1} kW exceeds expected baseline {threshold:1} kW'),
  t('energy_meter', 'power_kw', 'gt', 'critical', rel('power_kw', 10, 1.6),
    'Power draw {value:1} kW is critically high (expected baseline: {threshold:1} kW)'),
];

// ── Compilers (pure) ───────────────────────────────────────────────────────

/** Renders a message_template, reproducing the seed's toFixed() formatting. */
export function renderMessage(template: string, value: number, threshold: number): string {
  return template.replace(/\{(value|threshold)(?::(\d+))?\}/g, (_m, name: string, prec?: string) => {
    const n = name === 'value' ? value : threshold;
    return prec !== undefined ? n.toFixed(Number(prec)) : String(n);
  });
}

/** Turns a structured threshold into the `number | (specs)=>number` a Rule expects. */
export function compileThreshold(t: ThresholdSpec): Rule['threshold'] {
  if (t.type === 'static') return t.value;
  return (specs: AssetSpecs) => (specs?.[t.spec] ?? t.fallback) * t.factor;
}

/** Compiles one policy definition into a Rule (identical shape to RULES_BY_CATEGORY entries). */
export function compilePolicyToRule(def: ThresholdPolicyDefinition): Rule {
  return {
    metric: def.metric,
    condition: def.condition,
    threshold: compileThreshold(def.threshold),
    severity: def.severity,
    message: (value: number, threshold: number) => renderMessage(def.message_template, value, threshold),
  };
}

/** Compiles the flat seed into the same Record<category, Rule[]> shape as RULES_BY_CATEGORY. */
export function buildSeedRulesByCategory(): Record<string, Rule[]> {
  const out: Record<string, Rule[]> = {};
  for (const p of PLATFORM_THRESHOLD_POLICIES) {
    (out[p.category] ??= []).push(compilePolicyToRule(p.definition));
  }
  return out;
}

// ── tiny constructors (keep the seed table above readable) ──────────────────
function stat(value: number): ThresholdSpec {
  return { type: 'static', value };
}
function rel(spec: string, fallback: number, factor: number): ThresholdSpec {
  return { type: 'spec_relative', spec, fallback, factor };
}
function t(
  category: string,
  metric: string,
  condition: Condition,
  severity: Rule['severity'],
  threshold: ThresholdSpec,
  message_template: string,
): SeedPolicy {
  return { category, kind: 'threshold', definition: { metric, condition, severity, threshold, message_template } };
}
