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
 * Evaluates every rule for a device's category against a single telemetry
 * reading. Pure — no DB access, no side effects. Rules whose metric isn't
 * present in `metrics` are skipped (matches handler.ts's original
 * `if (value === undefined) continue`), not treated as a missing-data alert.
 */
export function evaluateRules(
  category: string,
  metrics: Record<string, number>,
  specs: AssetSpecs | null,
): FiredRule[] {
  const rules = RULES_BY_CATEGORY[category] ?? [];
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
