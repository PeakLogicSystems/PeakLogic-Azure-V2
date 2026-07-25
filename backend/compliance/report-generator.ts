/**
 * Compliance report generation — PRD §5.21 (CP-1.1/CP-2.1/CP-3.1) / SRS
 * §3.23, Domain Model §2.13. Pure: given a reporting period's readings and
 * exceedances, produce a regulator-relevant report DRAFT (wastewater DMR the
 * first template). No I/O.
 *
 * Two boundaries are baked in, not bolted on:
 *   - GENERATION != DELIVERY. This produces the report content only.
 *     Automated recurring DELIVERY (CP-5.1) is blocked on outbound
 *     infrastructure that does not exist yet (shared with PW-7/PW-8, SET-8)
 *     and is deliberately not attempted here.
 *   - OPERATOR-ASSIST, not liability. Every draft carries an explicit
 *     filer-of-record disclaimer (CP-2.1); PeakLogic does not file with a
 *     regulator or adjudicate compliance.
 *
 * Coverage honesty: a parameter with no readings in the period is reported
 * as a coverage gap, never as a fabricated or interpolated value — the same
 * discipline the pool water-quality report (§5.17) uses.
 */

export interface ReadingSample {
  metric: string;
  value: number;
  time: Date;
}

export interface ExceedanceInput {
  metric: string;
  permitLimit: number;
  observedValue: number;
  occurredAt: Date;
}

export interface ParameterSummary {
  metric: string;
  sampleCount: number;
  min: number | null;
  max: number | null;
  average: number | null;
  exceedanceCount: number;
  coverageGap: boolean; // true when no readings covered this parameter in the period
}

export interface ComplianceReportDraft {
  templateKey: string;
  periodStart: Date;
  periodEnd: Date;
  parameters: ParameterSummary[];
  exceedances: ExceedanceInput[];
  generatedAt: Date;
  filerOfRecordDisclaimer: string;
}

const FILER_OF_RECORD_DISCLAIMER =
  'This report is generated to assist the operator, who remains the filer of record. ' +
  'PeakLogic does not submit filings to any regulator and does not assume regulatory responsibility. ' +
  'Values are compiled from retained monitoring data and are reproducible from it.';

export interface ReportInput {
  templateKey: string; // e.g. 'npdes_dmr'
  periodStart: Date;
  periodEnd: Date;
  parameters: string[]; // the metrics this permit requires reporting on
  readings: ReadingSample[];
  exceedances: ExceedanceInput[];
  now?: Date;
}

/**
 * Build the report draft. Only readings whose `time` falls within
 * [periodStart, periodEnd] are counted — a reading synced late but taken in a
 * prior period must not leak into this one (mirrors §5.17's period-binding
 * rule).
 */
export function generateComplianceReportDraft(input: ReportInput): ComplianceReportDraft {
  const startMs = input.periodStart.getTime();
  const endMs = input.periodEnd.getTime();

  const inPeriod = input.readings.filter((r) => {
    const t = r.time.getTime();
    return t >= startMs && t <= endMs;
  });

  const exceedanceCountByMetric = new Map<string, number>();
  for (const e of input.exceedances) {
    exceedanceCountByMetric.set(e.metric, (exceedanceCountByMetric.get(e.metric) ?? 0) + 1);
  }

  const parameters: ParameterSummary[] = input.parameters.map((metric) => {
    const values = inPeriod.filter((r) => r.metric === metric).map((r) => r.value);
    if (values.length === 0) {
      return {
        metric,
        sampleCount: 0,
        min: null,
        max: null,
        average: null,
        exceedanceCount: exceedanceCountByMetric.get(metric) ?? 0,
        coverageGap: true,
      };
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      metric,
      sampleCount: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      average: sum / values.length,
      exceedanceCount: exceedanceCountByMetric.get(metric) ?? 0,
      coverageGap: false,
    };
  });

  return {
    templateKey: input.templateKey,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    parameters,
    exceedances: input.exceedances,
    generatedAt: input.now ?? new Date(),
    filerOfRecordDisclaimer: FILER_OF_RECORD_DISCLAIMER,
  };
}
