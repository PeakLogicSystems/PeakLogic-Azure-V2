import { describe, it, expect } from 'vitest';
import { generateComplianceReportDraft, type ReportInput } from './report-generator';

const periodStart = new Date('2026-06-01T00:00:00Z');
const periodEnd = new Date('2026-06-30T23:59:59Z');
const now = new Date('2026-07-01T06:00:00Z');

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    templateKey: 'npdes_dmr',
    periodStart,
    periodEnd,
    parameters: ['ph', 'do_mgl'],
    readings: [
      { metric: 'ph', value: 7.0, time: new Date('2026-06-10T12:00:00Z') },
      { metric: 'ph', value: 7.4, time: new Date('2026-06-20T12:00:00Z') },
      { metric: 'do_mgl', value: 6.0, time: new Date('2026-06-15T12:00:00Z') },
    ],
    exceedances: [],
    now,
    ...overrides,
  };
}

describe('generateComplianceReportDraft', () => {
  it('summarizes each parameter (count/min/max/avg)', () => {
    const report = generateComplianceReportDraft(input());
    const ph = report.parameters.find((p) => p.metric === 'ph')!;
    expect(ph.sampleCount).toBe(2);
    expect(ph.min).toBe(7.0);
    expect(ph.max).toBe(7.4);
    expect(ph.average).toBeCloseTo(7.2);
    expect(ph.coverageGap).toBe(false);
  });

  it('reports a parameter with no readings as a coverage gap, not a fabricated value', () => {
    const report = generateComplianceReportDraft(input({ parameters: ['ph', 'tss_mgl'] }));
    const tss = report.parameters.find((p) => p.metric === 'tss_mgl')!;
    expect(tss.coverageGap).toBe(true);
    expect(tss.sampleCount).toBe(0);
    expect(tss.average).toBeNull();
  });

  it('excludes readings taken outside the period (late-synced prior-period reading does not leak in)', () => {
    const report = generateComplianceReportDraft(
      input({
        readings: [
          { metric: 'ph', value: 7.0, time: new Date('2026-06-10T12:00:00Z') }, // in period
          { metric: 'ph', value: 9.9, time: new Date('2026-05-31T12:00:00Z') }, // prior period — must be excluded
        ],
      }),
    );
    const ph = report.parameters.find((p) => p.metric === 'ph')!;
    expect(ph.sampleCount).toBe(1);
    expect(ph.max).toBe(7.0); // the 9.9 outlier did not leak in
  });

  it('counts exceedances per parameter', () => {
    const report = generateComplianceReportDraft(
      input({
        exceedances: [
          { metric: 'ph', permitLimit: 9.0, observedValue: 9.3, occurredAt: new Date('2026-06-12T00:00:00Z') },
        ],
      }),
    );
    expect(report.parameters.find((p) => p.metric === 'ph')!.exceedanceCount).toBe(1);
    expect(report.exceedances).toHaveLength(1);
  });

  it('always carries the operator-filer-of-record disclaimer (CP-2.1)', () => {
    const report = generateComplianceReportDraft(input());
    expect(report.filerOfRecordDisclaimer).toMatch(/filer of record/i);
    expect(report.filerOfRecordDisclaimer).toMatch(/does not submit filings/i);
  });
});
