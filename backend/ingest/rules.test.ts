import { describe, it, expect } from 'vitest';
import { evaluateRules } from './rules';

describe('evaluateRules', () => {
  describe('unknown/missing data', () => {
    it('returns no fired rules for an unknown category', () => {
      expect(evaluateRules('unknown_category', { power_kw: 999 }, null)).toEqual([]);
    });

    it('skips a rule whose metric is absent from the telemetry payload', () => {
      // pump's rules key off power_kw/flow_lpm/pressure_psi — sending only an
      // unrelated metric should fire nothing, not throw or treat it as 0.
      expect(evaluateRules('pump', { some_other_metric: 1 }, null)).toEqual([]);
    });

    it('falls back to default thresholds when asset specs are null', () => {
      // pump power_kw warning threshold defaults to (5) * 1.25 = 6.25 when specs are unset
      const fired = evaluateRules('pump', { power_kw: 7 }, null);
      expect(fired).toHaveLength(1);
      expect(fired[0].rule.severity).toBe('warning');
      expect(fired[0].threshold).toBeCloseTo(6.25);
    });
  });

  describe('pump — spec-relative thresholds, multiple severities can co-fire', () => {
    it('fires only the warning tier just above the warning threshold', () => {
      const fired = evaluateRules('pump', { power_kw: 13 }, { power_kw: 10 });
      // warning: 10*1.25=12.5 (13 > 12.5, fires), critical: 10*1.5=15 (13 > 15 is false)
      expect(fired).toHaveLength(1);
      expect(fired[0].rule.severity).toBe('warning');
    });

    it('fires BOTH warning and critical tiers when value clears both thresholds', () => {
      const fired = evaluateRules('pump', { power_kw: 20 }, { power_kw: 10 });
      // warning: 12.5, critical: 15 — 20 clears both, since these are two
      // independent rule entries, not a single min/max range
      expect(fired).toHaveLength(2);
      expect(fired.map(f => f.rule.severity).sort()).toEqual(['critical', 'warning']);
    });

    it('fires the low-flow (lt) rule when flow drops below the spec-relative minimum', () => {
      const fired = evaluateRules('pump', { flow_lpm: 50 }, { flow_lpm: 100 });
      // threshold: 100*0.75=75; 50 < 75 fires
      expect(fired).toHaveLength(1);
      expect(fired[0].rule.condition).toBe('lt');
      expect(fired[0].message).toContain('below minimum');
    });

    it('does not fire when flow is within the acceptable range', () => {
      expect(evaluateRules('pump', { flow_lpm: 90 }, { flow_lpm: 100 })).toEqual([]);
    });
  });

  describe('refrigeration — FDA cold-holding limit and danger zone (food-safety critical)', () => {
    it('fires the FDA warning at the default 4.4°C (41°F) limit when no spec override exists', () => {
      const fired = evaluateRules('refrigeration', { product_temp_c: 5 }, null);
      expect(fired).toHaveLength(1);
      expect(fired[0].rule.severity).toBe('warning');
      expect(fired[0].threshold).toBeCloseTo(4.4);
      expect(fired[0].message).toContain('FDA safe cold-holding limit');
    });

    it('respects a custom temp_max_c spec instead of the FDA default', () => {
      const fired = evaluateRules('refrigeration', { product_temp_c: 6 }, { temp_max_c: 8 });
      // 6 > 8 is false — should not fire the warning tier at all despite
      // exceeding the hardcoded FDA number, since a spec override exists
      expect(fired).toHaveLength(0);
    });

    it('fires BOTH the FDA warning and the critical danger-zone rule once product temp is high enough', () => {
      const fired = evaluateRules('refrigeration', { product_temp_c: 8 }, null);
      expect(fired).toHaveLength(2);
      const critical = fired.find(f => f.rule.severity === 'critical');
      expect(critical?.message).toContain('danger zone');
    });
  });

  describe('leak_sensor — binary critical alert', () => {
    it('fires critical when leak_detected is truthy (>0.5)', () => {
      const fired = evaluateRules('leak_sensor', { leak_detected: 1 }, null);
      expect(fired).toHaveLength(1);
      expect(fired[0].rule.severity).toBe('critical');
    });

    it('does not fire when leak_detected is 0', () => {
      expect(evaluateRules('leak_sensor', { leak_detected: 0 }, null)).toEqual([]);
    });
  });

  describe('hvac — static (non-spec) thresholds', () => {
    it('fires the low-temperature warning using a hardcoded threshold, independent of specs', () => {
      const fired = evaluateRules('hvac', { temp_c: 55 }, { temp_max_c: 200 });
      expect(fired).toHaveLength(1);
      expect(fired[0].threshold).toBe(60);
    });
  });
});
