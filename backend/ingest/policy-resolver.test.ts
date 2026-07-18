import { describe, it, expect } from 'vitest';
import { compileResolvedRows, type PolicyRow } from './policy-resolver';
import type { ThresholdPolicyDefinition } from './policy-seed';

// Unit coverage for the PURE precedence/merge core of the resolver (the DB
// query + cache + fail-safe are covered by policy-resolver.integration.test.ts
// against a real Postgres). Verifies platform → tenant → site → asset
// inheritance with modify / disable / add (Policy Engine Design §3.3, §4.1).

function def(
  metric: string,
  severity: 'warning' | 'critical',
  value: number,
  message = 'msg',
): ThresholdPolicyDefinition {
  return {
    metric,
    condition: 'gt',
    severity,
    threshold: { type: 'static', value },
    message_template: message,
  };
}
const row = (scope: PolicyRow['scope_level'], d: ThresholdPolicyDefinition, enabled = true): PolicyRow => ({
  scope_level: scope,
  definition: d,
  enabled,
});

describe('compileResolvedRows — inheritance & precedence', () => {
  it('passes a platform default straight through when there is no override', () => {
    const rules = compileResolvedRows([row('platform', def('power_kw', 'warning', 5))]);
    expect(rules).toHaveLength(1);
    expect(rules[0].threshold).toBe(5);
    expect(rules[0].metric).toBe('power_kw');
  });

  it('MODIFY: a more specific scope overrides the same rule identity', () => {
    const rules = compileResolvedRows([
      row('platform', def('power_kw', 'warning', 5)),
      row('tenant', def('power_kw', 'warning', 9)),
      row('asset', def('power_kw', 'warning', 12)), // most specific wins
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].threshold).toBe(12);
  });

  it('MODIFY: precedence is by specificity, not row order', () => {
    // asset row appears BEFORE the platform row — specificity must still win.
    const rules = compileResolvedRows([
      row('asset', def('power_kw', 'warning', 12)),
      row('platform', def('power_kw', 'warning', 5)),
    ]);
    expect(rules[0].threshold).toBe(12);
  });

  it('DISABLE: a disabled override at the most specific scope removes the rule', () => {
    const rules = compileResolvedRows([
      row('platform', def('power_kw', 'warning', 5)),
      row('tenant', def('power_kw', 'warning', 5), false), // disabled → dropped
    ]);
    expect(rules).toHaveLength(0);
  });

  it('DISABLE only affects the matching identity, not sibling severities', () => {
    const rules = compileResolvedRows([
      row('platform', def('power_kw', 'warning', 5)),
      row('platform', def('power_kw', 'critical', 8)),
      row('tenant', def('power_kw', 'warning', 5), false), // disable warning only
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].severity).toBe('critical');
  });

  it('ADD: a brand-new identity at a specific scope is included', () => {
    const rules = compileResolvedRows([
      row('platform', def('power_kw', 'warning', 5)),
      row('tenant', def('vibration_mm_s', 'critical', 20)), // new metric
    ]);
    expect(rules.map((r) => r.metric).sort()).toEqual(['power_kw', 'vibration_mm_s']);
  });

  it('treats (metric, condition, severity) as the identity — same metric, different severity are distinct', () => {
    const rules = compileResolvedRows([
      row('platform', def('power_kw', 'warning', 5)),
      row('platform', def('power_kw', 'critical', 8)),
    ]);
    expect(rules).toHaveLength(2);
  });

  it('renders the winning row’s message template', () => {
    const rules = compileResolvedRows([
      row('tenant', def('power_kw', 'warning', 9, 'Draw {value:0} over {threshold:0}')),
    ]);
    expect(rules[0].message(12.4, 9)).toBe('Draw 12 over 9');
  });
});
