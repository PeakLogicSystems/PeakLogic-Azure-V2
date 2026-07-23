// Mock data for the weekly pool Water-Quality Report prototype (PRD §5.17 /
// SRS §3.19, PW-1–PW-14 / PW-1.1–PW-14.1, v1.9). This is the FIRST artifact
// built against that spec — no water_tests/reagent-panel entity, migration,
// or wireframe exists anywhere else in the repo yet (verified by grep across
// docs/architecture/domain-model.md, database-schema.md, docs/data-model.sql).
// Shape here loosely shadows the real entities that DO exist (route_stops,
// channel_partner_users) so a future real integration is a natural fit, but
// nothing here is a committed schema — see this feature's own page header
// comment for the sensing/attestation limits this file is modeling.
//
// Three periods are seeded for site-3 (Lakewood Pool Complex, the one
// pool-type mock site in mockEstate.ts) specifically to make the PW-1/PW-1.1
// and PW-4/PW-4.1 edge cases real, inspectable data rather than only prose:
// a normal period, a period with no technician visit at all (reagent panel
// "not tested," never a repeated stale value), and a period with a partial
// sensor outage (a real gap in the trend, not interpolated across).

export interface SensedReading {
  key: 'ph' | 'free_chlorine_ppm' | 'tds_ppm';
  label: string;
  unit: string;
  value: number | null; // null — sensor produced no reading for the period
  range: [number, number];
  trend: { date: string; value: number | null }[]; // one point per day; null = coverage gap, never interpolated
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
  periodStart: string; // ISO date, ("this week"/"prior week" avoided deliberately — PW-3/PW-3.1 wants a real dated period, not a relative label)
  periodEnd: string;
  sensed: SensedReading[];
  // null — PW-1/PW-1.1's "a period with no technician visit" edge case:
  // the report states the panel was not tested, it never repeats the prior
  // period's values.
  reagentPanel: { entries: ReagentEntry[]; testDate: string; technician: string; photoUrl?: string } | null;
  serviceVisits: ServiceVisit[];
  coverageNote?: string;
}

export const MOCK_WATER_QUALITY_REPORTS: WaterQualityReport[] = [
  // Most recent period — normal shape, but free chlorine reads low (out of
  // range) so the in/out-of-range status pill has a real case to show.
  {
    siteId: 'site-3',
    periodStart: '2026-07-13',
    periodEnd: '2026-07-19',
    sensed: [
      {
        key: 'ph', label: 'pH', unit: '', range: [7.2, 7.8], value: 7.4,
        trend: [
          { date: '2026-07-13', value: 7.5 }, { date: '2026-07-14', value: 7.5 },
          { date: '2026-07-15', value: 7.4 }, { date: '2026-07-16', value: 7.4 },
          { date: '2026-07-17', value: 7.3 }, { date: '2026-07-18', value: 7.4 },
          { date: '2026-07-19', value: 7.4 },
        ],
      },
      {
        key: 'free_chlorine_ppm', label: 'Free Chlorine', unit: 'ppm', range: [1, 3], value: 0.6,
        trend: [
          { date: '2026-07-13', value: 2.1 }, { date: '2026-07-14', value: 1.8 },
          { date: '2026-07-15', value: 1.4 }, { date: '2026-07-16', value: 1.1 },
          { date: '2026-07-17', value: 0.9 }, { date: '2026-07-18', value: 0.7 },
          { date: '2026-07-19', value: 0.6 },
        ],
      },
      {
        key: 'tds_ppm', label: 'TDS', unit: 'ppm', range: [0, 1500], value: 1150,
        trend: [
          { date: '2026-07-13', value: 1120 }, { date: '2026-07-14', value: 1130 },
          { date: '2026-07-15', value: 1135 }, { date: '2026-07-16', value: 1140 },
          { date: '2026-07-17', value: 1145 }, { date: '2026-07-18', value: 1148 },
          { date: '2026-07-19', value: 1150 },
        ],
      },
    ],
    reagentPanel: {
      testDate: '2026-07-17',
      technician: 'Marcus Lindqvist',
      entries: [
        { key: 'total_alkalinity_ppm', label: 'Total Alkalinity', unit: 'ppm', value: 100, range: [80, 120] },
        { key: 'calcium_hardness_ppm', label: 'Calcium Hardness', unit: 'ppm', value: 280, range: [200, 400] },
        { key: 'cyanuric_acid_ppm', label: 'Cyanuric Acid', unit: 'ppm', value: 42, range: [30, 50] },
      ],
    },
    serviceVisits: [
      { date: '2026-07-17', technician: 'Marcus Lindqvist', services: ['Reagent test panel', 'Filter backwash', 'Skimmer basket cleared'] },
    ],
  },

  // Prior period — PW-1/PW-1.1 edge case: no technician visit at all, so
  // the reagent panel is genuinely untested. reagentPanel is null, not a
  // repeat of the previous period's numbers.
  {
    siteId: 'site-3',
    periodStart: '2026-07-06',
    periodEnd: '2026-07-12',
    sensed: [
      {
        key: 'ph', label: 'pH', unit: '', range: [7.2, 7.8], value: 7.5,
        trend: [
          { date: '2026-07-06', value: 7.4 }, { date: '2026-07-07', value: 7.5 },
          { date: '2026-07-08', value: 7.5 }, { date: '2026-07-09', value: 7.6 },
          { date: '2026-07-10', value: 7.5 }, { date: '2026-07-11', value: 7.5 },
          { date: '2026-07-12', value: 7.5 },
        ],
      },
      {
        key: 'free_chlorine_ppm', label: 'Free Chlorine', unit: 'ppm', range: [1, 3], value: 2.1,
        trend: [
          { date: '2026-07-06', value: 2.4 }, { date: '2026-07-07', value: 2.3 },
          { date: '2026-07-08', value: 2.2 }, { date: '2026-07-09', value: 2.2 },
          { date: '2026-07-10', value: 2.1 }, { date: '2026-07-11', value: 2.1 },
          { date: '2026-07-12', value: 2.1 },
        ],
      },
      {
        key: 'tds_ppm', label: 'TDS', unit: 'ppm', range: [0, 1500], value: 1080,
        trend: [
          { date: '2026-07-06', value: 1090 }, { date: '2026-07-07', value: 1085 },
          { date: '2026-07-08', value: 1085 }, { date: '2026-07-09', value: 1082 },
          { date: '2026-07-10', value: 1080 }, { date: '2026-07-11', value: 1080 },
          { date: '2026-07-12', value: 1080 },
        ],
      },
    ],
    reagentPanel: null,
    serviceVisits: [],
  },

  // Two periods back — PW-11/PW-11.1-adjacent edge case: the free-chlorine
  // sensor was offline for part of the period. The gap is represented (two
  // null trend points), never interpolated across. Reagent panel also shows
  // an out-of-range value (calcium hardness) so both status-pill states are
  // demonstrated somewhere in the seeded data, not just the healthy case.
  {
    siteId: 'site-3',
    periodStart: '2026-06-29',
    periodEnd: '2026-07-05',
    sensed: [
      {
        key: 'ph', label: 'pH', unit: '', range: [7.2, 7.8], value: 7.3,
        trend: [
          { date: '2026-06-29', value: 7.3 }, { date: '2026-06-30', value: 7.3 },
          { date: '2026-07-01', value: 7.4 }, { date: '2026-07-02', value: 7.3 },
          { date: '2026-07-03', value: 7.3 }, { date: '2026-07-04', value: 7.3 },
          { date: '2026-07-05', value: 7.3 },
        ],
      },
      {
        key: 'free_chlorine_ppm', label: 'Free Chlorine', unit: 'ppm', range: [1, 3], value: 1.8,
        trend: [
          { date: '2026-06-29', value: 2.0 }, { date: '2026-06-30', value: 1.9 },
          { date: '2026-07-01', value: 1.9 }, { date: '2026-07-02', value: null },
          { date: '2026-07-03', value: null }, { date: '2026-07-04', value: 1.8 },
          { date: '2026-07-05', value: 1.8 },
        ],
      },
      {
        key: 'tds_ppm', label: 'TDS', unit: 'ppm', range: [0, 1500], value: 1200,
        trend: [
          { date: '2026-06-29', value: 1190 }, { date: '2026-06-30', value: 1195 },
          { date: '2026-07-01', value: 1198 }, { date: '2026-07-02', value: 1200 },
          { date: '2026-07-03', value: 1200 }, { date: '2026-07-04', value: 1200 },
          { date: '2026-07-05', value: 1200 },
        ],
      },
    ],
    reagentPanel: {
      testDate: '2026-07-03',
      technician: 'Elena Márquez',
      entries: [
        { key: 'total_alkalinity_ppm', label: 'Total Alkalinity', unit: 'ppm', value: 95, range: [80, 120] },
        { key: 'calcium_hardness_ppm', label: 'Calcium Hardness', unit: 'ppm', value: 410, range: [200, 400] },
        { key: 'cyanuric_acid_ppm', label: 'Cyanuric Acid', unit: 'ppm', value: 38, range: [30, 50] },
      ],
    },
    serviceVisits: [
      { date: '2026-07-03', technician: 'Elena Márquez', services: ['Reagent test panel', 'Chemical feed pump inspected', 'Pool vacuumed'] },
    ],
    coverageNote: 'Free chlorine sensor was offline Jul 2–3 — no readings are available for that window. Values are not interpolated across a coverage gap.',
  },
];

export const siteWaterQualityReports = (siteId: string): WaterQualityReport[] =>
  MOCK_WATER_QUALITY_REPORTS
    .filter(r => r.siteId === siteId)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
