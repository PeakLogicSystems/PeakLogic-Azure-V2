import type { Alert, AssetSpecs } from '../shared/types';

// Extracted from handler.ts (Test Strategy §3) — this logic was previously
// inline inside the DB-touching handler function and not exported, so it
// could not be unit tested without mocking the entire pg Pool/Client, which
// would have tested the mock, not the actual threshold math. Pure function,
// no I/O: same behavior, now testable in isolation.

export type Condition = 'gt' | 'lt';

export interface Rule {
  metric: string;
  condition: Condition;
  // Static threshold OR function of asset specs
  threshold: number | ((specs: AssetSpecs) => number);
  severity: Alert['severity'];
  message: (value: number, threshold: number) => string;
}

export const RULES_BY_CATEGORY: Record<string, Rule[]> = {
  pump: [
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 5) * 1.25,
      severity: 'warning',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW exceeds rated limit ${t.toFixed(1)} kW`,
    },
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 5) * 1.5,
      severity: 'critical',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW is critically high (limit: ${t.toFixed(1)} kW)`,
    },
    {
      metric: 'flow_lpm', condition: 'lt',
      threshold: (s) => (s.flow_lpm ?? 100) * 0.75,
      severity: 'warning',
      message: (v, t) => `Flow rate ${v.toFixed(0)} L/min is below minimum ${t.toFixed(0)} L/min`,
    },
    {
      metric: 'pressure_psi', condition: 'gt',
      threshold: (s) => (s.pressure_psi ?? 80) * 1.2,
      severity: 'critical',
      message: (v, t) => `Pressure ${v.toFixed(0)} psi exceeds safe limit ${t.toFixed(0)} psi`,
    },
  ],
  hvac: [
    {
      metric: 'temp_c', condition: 'gt',
      threshold: (s) => s.temp_max_c ?? 180,
      severity: 'critical',
      message: (v, t) => `Temperature ${v.toFixed(0)}°C exceeds maximum ${t.toFixed(0)}°C`,
    },
    {
      metric: 'temp_c', condition: 'lt',
      threshold: 60,
      severity: 'warning',
      message: (v, _t) => `Temperature ${v.toFixed(0)}°C is below operating range (min 60°C)`,
    },
  ],
  pool_system: [
    {
      metric: 'flow_lpm', condition: 'lt',
      threshold: (s) => (s.flow_lpm ?? 150) * 0.8,
      severity: 'warning',
      message: (v, t) => `Pool flow rate ${v.toFixed(0)} L/min is below minimum ${t.toFixed(0)} L/min`,
    },
    {
      metric: 'temp_c', condition: 'gt',
      threshold: 35,
      severity: 'warning',
      message: (v, _t) => `Pool temperature ${v.toFixed(1)}°C is above safe limit (35°C)`,
    },
  ],
  // SN-4.1 — separate adapter from pool_system (SRS §3.2, Domain Model §2.3),
  // since a pool can have a flow/temp sensor without a chemistry probe or
  // vice versa. Thresholds sourced from CDC's Model Aquatic Health Code, 5th
  // Ed. (Dec 2024) for pH and free chlorine; TDS has no CDC-published figure,
  // so it's sourced from pool-industry consensus (AQUA Magazine/APSP-style
  // guidance: max 1,500 ppm above a pool's fill/startup TDS) and flagged as
  // an industry-standard citation, not a CDC one — resolves SRS Open Issue
  // #1's "placeholder pending real verified pool-safety standards" for this
  // adapter specifically.
  pool_chemistry: [
    {
      // CDC MAHC: pH should be maintained at 7.0-7.8; below 7.0 water becomes
      // corrosive/irritating and chlorine over-reacts, breaking down faster.
      metric: 'ph', condition: 'lt',
      threshold: 7.0,
      severity: 'warning',
      message: (v, _t) => `Pool pH ${v.toFixed(1)} is below the CDC-recommended range (7.0-7.8) — water may be corrosive and irritating to swimmers`,
    },
    {
      metric: 'ph', condition: 'gt',
      threshold: 7.8,
      severity: 'warning',
      message: (v, _t) => `Pool pH ${v.toFixed(1)} is above the CDC-recommended range (7.0-7.8) — chlorine's ability to kill germs is reduced`,
    },
    {
      // CDC MAHC: chlorine's disinfecting power drops sharply above pH 8.0 —
      // called out specifically in CDC's own rationale, so it's a distinct,
      // more severe tier rather than folded into the 7.8 warning above.
      metric: 'ph', condition: 'gt',
      threshold: 8.0,
      severity: 'critical',
      message: (v, _t) => `Pool pH ${v.toFixed(1)} is critically high — chlorine's disinfecting effectiveness is significantly impaired above pH 8.0 (CDC MAHC)`,
    },
    {
      // CDC MAHC: at least 2 ppm free chlorine required.
      metric: 'free_chlorine_ppm', condition: 'lt',
      threshold: 2,
      severity: 'warning',
      message: (v, _t) => `Free chlorine ${v.toFixed(1)} ppm is below the CDC-recommended minimum (2 ppm) — water may not be adequately disinfected`,
    },
    {
      // CDC MAHC: free chlorine should not exceed 10 ppm while bathers are
      // present — a bather-safety limit, not just a water-quality one, so
      // this is critical rather than warning.
      metric: 'free_chlorine_ppm', condition: 'gt',
      threshold: 10,
      severity: 'critical',
      message: (v, _t) => `Free chlorine ${v.toFixed(1)} ppm exceeds the CDC bather-safety limit (10 ppm)`,
    },
    {
      // Industry-standard guidance (not CDC-published): max 1,500 ppm TDS
      // above a pool's startup level; using 1,500 ppm as an absolute
      // threshold since this adapter has no per-pool startup baseline yet.
      metric: 'tds_ppm', condition: 'gt',
      threshold: 1500,
      severity: 'warning',
      message: (v, t) => `Total dissolved solids ${v.toFixed(0)} ppm exceeds the industry-standard guideline (${t.toFixed(0)} ppm) — water clarity and chemical efficiency may degrade`,
    },
  ],
  // SN-5.1 — identical structure to leak_sensor (SRS §3.2): a binary
  // detected/not-detected signal, immediate critical alert, no warning tier.
  // No concentration threshold (e.g. LEL%, ppm) at MVP — that's a distinct,
  // future content addition, not a re-architecture (matches SN-7.1's framing
  // for air_quality).
  gas_sensor: [
    {
      metric: 'gas_leak_detected', condition: 'gt',
      threshold: 0.5,
      severity: 'critical',
      message: (_v, _t) => `Gas leak detected — immediate shutoff/inspection required`,
    },
  ],
  // Probe temp of the food/drink itself, not ambient air — lets the unit run warmer
  // (saving energy) while still catching an actual food-safety violation early.
  refrigeration: [
    {
      metric: 'product_temp_c', condition: 'gt',
      threshold: (s) => s.temp_max_c ?? 4.4, // FDA cold-holding limit: 41°F / 4.4°C
      severity: 'warning',
      message: (v, t) => `Product temperature ${v.toFixed(1)}°C exceeds FDA safe cold-holding limit ${t.toFixed(1)}°C`,
    },
    {
      metric: 'product_temp_c', condition: 'gt',
      threshold: 7,
      severity: 'critical',
      message: (v, _t) => `Product temperature ${v.toFixed(1)}°C has been in the food-safety danger zone — discard-risk threshold exceeded`,
    },
  ],
  leak_sensor: [
    {
      metric: 'leak_detected', condition: 'gt',
      threshold: 0.5,
      severity: 'critical',
      message: (_v, _t) => `Leak detected — immediate shutoff/inspection required to prevent water damage`,
    },
  ],
  energy_meter: [
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 10) * 1.3,
      severity: 'warning',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW exceeds expected baseline ${t.toFixed(1)} kW`,
    },
    {
      metric: 'power_kw', condition: 'gt',
      threshold: (s) => (s.power_kw ?? 10) * 1.6,
      severity: 'critical',
      message: (v, t) => `Power draw ${v.toFixed(1)} kW is critically high (expected baseline: ${t.toFixed(1)} kW)`,
    },
  ],
};

export interface FiredRule {
  rule: Rule;
  value: number;
  threshold: number;
  message: string;
}

export interface SanitizeMetricsResult {
  clean: Record<string, number>;
  dropped: string[]; // metric names removed for having a non-finite-number value
}

/**
 * Threat Model §4.1 — a device's telemetry payload arrives with no runtime
 * type checking (the Record<string, number> annotation is compile-time
 * only). A malformed value (null, a non-numeric string) previously reached
 * both the telemetry INSERT (DOUBLE PRECISION NOT NULL — fails at the SQL
 * layer) and evaluateRules() unchecked. Pure — no I/O, no console output;
 * the caller (handler.ts) decides what to log for `dropped`, keeping this
 * function's behavior fully deterministic and testable like the rest of
 * this module.
 *
 * Deliberately does NOT range-check plausibility per metric (e.g. rejecting
 * a physically-impossible pressure_psi value) — that needs real,
 * domain-sourced bounds per metric this document doesn't have authority to
 * invent, and isn't required to close the actual bug (a malformed value
 * crashing the SQL insert), only "is this actually a usable number."
 */
export function sanitizeMetrics(raw: Record<string, number>): SanitizeMetricsResult {
  const clean: Record<string, number> = {};
  const dropped: string[] = [];

  for (const [metric, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      clean[metric] = value;
    } else {
      dropped.push(metric);
    }
  }

  return { clean, dropped };
}

/**
 * Evaluates an explicit list of rules against a single telemetry reading.
 * Pure — no DB access, no side effects. Rules whose metric isn't present in
 * `metrics` are skipped (matches handler.ts's original
 * `if (value === undefined) continue`), not treated as a missing-data alert.
 *
 * This is the rule-source-agnostic core: it neither knows nor cares whether
 * the rules came from the compiled-in `RULES_BY_CATEGORY` or from the Policy
 * Engine resolver (Policy Engine Design §4). Split out from evaluateRules()
 * as a pure refactor — evaluateRules() is now a thin wrapper over it, so the
 * existing signature and behavior are byte-for-byte unchanged, but the
 * resolver and the golden-baseline test can evaluate a resolved rule set
 * through the exact same math.
 */
export function evaluateRuleSet(
  rules: Rule[],
  metrics: Record<string, number>,
  specs: AssetSpecs | null,
): FiredRule[] {
  const fired: FiredRule[] = [];

  for (const rule of rules) {
    const value = metrics[rule.metric];
    if (value === undefined) continue;

    const threshold =
      typeof rule.threshold === 'function' ? rule.threshold(specs ?? {}) : rule.threshold;

    const isFired = rule.condition === 'gt' ? value > threshold : value < threshold;
    if (isFired) {
      fired.push({ rule, value, threshold, message: rule.message(value, threshold) });
    }
  }

  return fired;
}

/**
 * Evaluates every rule for a device's category against a single telemetry
 * reading, using the compiled-in default rule set. Unchanged in behavior —
 * now delegates to evaluateRuleSet() (see its doc). Still the path ingest
 * uses while the Policy Engine feature flag is off.
 */
export function evaluateRules(
  category: string,
  metrics: Record<string, number>,
  specs: AssetSpecs | null,
): FiredRule[] {
  return evaluateRuleSet(RULES_BY_CATEGORY[category] ?? [], metrics, specs);
}
