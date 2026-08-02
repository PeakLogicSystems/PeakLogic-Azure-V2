// Water-Quality Report data — PRD §5.17 / SRS §3.19 (PW-1–PW-14).
// Ported from the retired frontend/ app (2026-08-01) with its preview data
// re-cast for this portal's customer: Bayfront Municipal District also runs a
// community aquatic centre, which is realistic for a municipality and lets the
// feature be demonstrated without inventing a second tenant.
//
// Two spec requirements are encoded in the SHAPE of this data, not just in
// prose, so they cannot be quietly lost:
//
//   PW-1/PW-1.1 — a period with no technician visit must say the panel was not
//   tested. It must never repeat the previous period's values. That is why
//   `reagentPanel` is nullable rather than defaulting to the last reading.
//
//   PW-4/PW-4.1 — a technician-entered value is ATTESTED, not measured, and the
//   report must never blur that line. That is why sensed readings and reagent
//   entries are separate types in separate sections, never one merged table.
//
// Three periods are seeded deliberately: a normal one (with an out-of-range
// reading so the status pill has a real case), one with no technician visit,
// and one with a sensor coverage gap.

export interface SensedReading {
  key: 'ph' | 'free_chlorine_ppm' | 'tds_ppm';
  label: string;
  unit: string;
  /** null — the sensor produced no reading for this period. Never a zero. */
  value: number | null;
  range: [number, number];
  /** One point per day. A null is a real coverage gap and is rendered as a break in the line, never interpolated across. */
  trend: { date: string; value: number | null }[];
}

export interface ReagentEntry {
  key: 'total_alkalinity_ppm' | 'calcium_hardness_ppm' | 'cyanuric_acid_ppm';
  label: string;
  unit: string;
  value: number;
  range: [number, number];
}

export interface ServiceVisit {
  date: string;
  technician: string;
  services: string[];
}

export interface WaterQualityReport {
  siteId: string;
  /** A real dated period — deliberately not a relative label like "this week" (PW-3/PW-3.1). */
  periodStart: string;
  periodEnd: string;
  sensed: SensedReading[];
  /** null = no technician visit in this period. See PW-1.1 above. */
  reagentPanel: { entries: ReagentEntry[]; testDate: string; technician: string; photoUrl?: string } | null;
  serviceVisits: ServiceVisit[];
  coverageNote?: string;
}

const POOL_SITE = 'site-aquatic';

export const WATER_QUALITY_REPORTS: WaterQualityReport[] = [
  // Most recent period. Free chlorine reads low (out of range) so the
  // in/out-of-range treatment has a real case rather than an all-green demo.
  {
    siteId: POOL_SITE,
    periodStart: '2026-07-20',
    periodEnd: '2026-07-26',
    sensed: [
      {
        key: 'ph', label: 'pH', unit: '', range: [7.2, 7.8], value: 7.4,
        trend: [
          { date: '2026-07-20', value: 7.5 }, { date: '2026-07-21', value: 7.5 },
          { date: '2026-07-22', value: 7.4 }, { date: '2026-07-23', value: 7.4 },
          { date: '2026-07-24', value: 7.3 }, { date: '2026-07-25', value: 7.4 },
          { date: '2026-07-26', value: 7.4 },
        ],
      },
      {
        key: 'free_chlorine_ppm', label: 'Free chlorine', unit: 'ppm', range: [1.0, 4.0], value: 0.8,
        trend: [
          { date: '2026-07-20', value: 1.6 }, { date: '2026-07-21', value: 1.4 },
          { date: '2026-07-22', value: 1.2 }, { date: '2026-07-23', value: 1.1 },
          { date: '2026-07-24', value: 0.9 }, { date: '2026-07-25', value: 0.8 },
          { date: '2026-07-26', value: 0.8 },
        ],
      },
      {
        key: 'tds_ppm', label: 'Total dissolved solids', unit: 'ppm', range: [500, 2000], value: 1180,
        trend: [
          { date: '2026-07-20', value: 1150 }, { date: '2026-07-21', value: 1160 },
          { date: '2026-07-22', value: 1165 }, { date: '2026-07-23', value: 1170 },
          { date: '2026-07-24', value: 1175 }, { date: '2026-07-25', value: 1180 },
          { date: '2026-07-26', value: 1180 },
        ],
      },
    ],
    reagentPanel: {
      testDate: '2026-07-24',
      technician: 'D. Alvarez',
      photoUrl: 'preview',
      entries: [
        { key: 'total_alkalinity_ppm', label: 'Total alkalinity', unit: 'ppm', value: 95, range: [80, 120] },
        { key: 'calcium_hardness_ppm', label: 'Calcium hardness', unit: 'ppm', value: 260, range: [200, 400] },
        { key: 'cyanuric_acid_ppm', label: 'Cyanuric acid', unit: 'ppm', value: 48, range: [30, 50] },
      ],
    },
    serviceVisits: [
      { date: '2026-07-24', technician: 'D. Alvarez', services: ['Reagent panel test', 'Backwash filter', 'Added chlorine tablets'] },
    ],
  },

  // PW-1.1 edge case: no technician visited this period. The panel is reported
  // as not tested — the previous period's values are NOT carried forward.
  {
    siteId: POOL_SITE,
    periodStart: '2026-07-13',
    periodEnd: '2026-07-19',
    sensed: [
      {
        key: 'ph', label: 'pH', unit: '', range: [7.2, 7.8], value: 7.6,
        trend: [
          { date: '2026-07-13', value: 7.6 }, { date: '2026-07-14', value: 7.6 },
          { date: '2026-07-15', value: 7.7 }, { date: '2026-07-16', value: 7.6 },
          { date: '2026-07-17', value: 7.6 }, { date: '2026-07-18', value: 7.5 },
          { date: '2026-07-19', value: 7.6 },
        ],
      },
      {
        key: 'free_chlorine_ppm', label: 'Free chlorine', unit: 'ppm', range: [1.0, 4.0], value: 2.1,
        trend: [
          { date: '2026-07-13', value: 2.4 }, { date: '2026-07-14', value: 2.3 },
          { date: '2026-07-15', value: 2.2 }, { date: '2026-07-16', value: 2.2 },
          { date: '2026-07-17', value: 2.1 }, { date: '2026-07-18', value: 2.1 },
          { date: '2026-07-19', value: 2.1 },
        ],
      },
      {
        key: 'tds_ppm', label: 'Total dissolved solids', unit: 'ppm', range: [500, 2000], value: 1140,
        trend: [
          { date: '2026-07-13', value: 1120 }, { date: '2026-07-14', value: 1125 },
          { date: '2026-07-15', value: 1130 }, { date: '2026-07-16', value: 1130 },
          { date: '2026-07-17', value: 1135 }, { date: '2026-07-18', value: 1140 },
          { date: '2026-07-19', value: 1140 },
        ],
      },
    ],
    reagentPanel: null,
    serviceVisits: [],
  },

  // PW-2 edge case: a partial sensor outage. The nulls below are a real gap —
  // the chart breaks rather than drawing a straight line across missing days.
  {
    siteId: POOL_SITE,
    periodStart: '2026-07-06',
    periodEnd: '2026-07-12',
    coverageNote: 'The free-chlorine sensor was offline for three days during this period. Those days are shown as a gap and are not estimated.',
    sensed: [
      {
        key: 'ph', label: 'pH', unit: '', range: [7.2, 7.8], value: 7.5,
        trend: [
          { date: '2026-07-06', value: 7.5 }, { date: '2026-07-07', value: 7.5 },
          { date: '2026-07-08', value: 7.5 }, { date: '2026-07-09', value: 7.6 },
          { date: '2026-07-10', value: 7.5 }, { date: '2026-07-11', value: 7.5 },
          { date: '2026-07-12', value: 7.5 },
        ],
      },
      {
        key: 'free_chlorine_ppm', label: 'Free chlorine', unit: 'ppm', range: [1.0, 4.0], value: 2.4,
        trend: [
          { date: '2026-07-06', value: 2.5 }, { date: '2026-07-07', value: 2.4 },
          { date: '2026-07-08', value: null }, { date: '2026-07-09', value: null },
          { date: '2026-07-10', value: null }, { date: '2026-07-11', value: 2.3 },
          { date: '2026-07-12', value: 2.4 },
        ],
      },
      {
        key: 'tds_ppm', label: 'Total dissolved solids', unit: 'ppm', range: [500, 2000], value: 1100,
        trend: [
          { date: '2026-07-06', value: 1080 }, { date: '2026-07-07', value: 1085 },
          { date: '2026-07-08', value: 1090 }, { date: '2026-07-09', value: 1095 },
          { date: '2026-07-10', value: 1095 }, { date: '2026-07-11', value: 1100 },
          { date: '2026-07-12', value: 1100 },
        ],
      },
    ],
    reagentPanel: {
      testDate: '2026-07-09',
      technician: 'D. Alvarez',
      entries: [
        { key: 'total_alkalinity_ppm', label: 'Total alkalinity', unit: 'ppm', value: 88, range: [80, 120] },
        { key: 'calcium_hardness_ppm', label: 'Calcium hardness', unit: 'ppm', value: 245, range: [200, 400] },
        { key: 'cyanuric_acid_ppm', label: 'Cyanuric acid', unit: 'ppm', value: 61, range: [30, 50] },
      ],
    },
    serviceVisits: [
      { date: '2026-07-09', technician: 'D. Alvarez', services: ['Reagent panel test', 'Replaced chlorine sensor', 'Partial drain & refill'] },
    ],
  },
];

export const waterQualityReportsForSite = (siteId: string): WaterQualityReport[] =>
  WATER_QUALITY_REPORTS.filter((r) => r.siteId === siteId);

export const hasWaterQuality = (siteId: string): boolean => waterQualityReportsForSite(siteId).length > 0;
