import type { HmiScreen, Severity, Site } from '../types';

// Per-site configuration for the preview simulation.
//
// PeakView360 used to hold exactly one site, hardcoded — which is how embedding
// it in every portal page ended up showing Bayfront's plant inside WTR DR's
// pages (see src/scope.ts). This registry is the structural fix: a site either
// has a configuration here or the app refuses to render it. Adding a site is a
// data entry, never a code change.
//
// Each config is a whole vertical: its own metrics, its own thresholds, its own
// equipment names. A pool is not a wastewater plant with different labels — the
// chemistry, the failure modes and the regulatory basis are all different, and
// the thresholds below are sourced accordingly.

export interface SiteRule {
  metric: string;
  severity: Severity;
  test: (v: number) => boolean;
  message: (v: number) => string;
  ai: string;
}

export interface SiteConfig {
  site: Site;
  screen: HmiScreen;
  /** Steady-state value each metric reverts toward. */
  base: Record<string, number>;
  /** Per-tick random-walk amplitude. */
  spread: Record<string, number>;
  /** Metrics whose sensor is silent — they report no value at all. */
  offline: Set<string>;
  /** Decimal places when displaying each metric. */
  decimals: Record<string, number>;
  rules: SiteRule[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Riverside Water Reclamation Facility — municipal wastewater.
// Customer: Bayfront Municipal District. Thresholds echo backend/ingest/rules.ts.
// ─────────────────────────────────────────────────────────────────────────────
const RIVERSIDE: SiteConfig = {
  site: {
    id: 'site-riverside',
    name: 'Riverside Water Reclamation Facility',
    cmms: { partner: 'Ace Septic & Waste', system: 'UpKeep', active: true },
  },
  screen: {
    id: 'screen-chlor-aer',
    siteId: 'site-riverside',
    name: 'Chlorination & Aeration',
    helpContextKey: 'screen.chlorination',
    tiles: [
      { id: 't-flow', label: 'Influent Flow', metric: 'flow_lpm', unit: 'L/min', asset: 'Influent Pump P-101' },
      { id: 't-cl', label: 'Chlorine Residual', metric: 'free_chlorine_ppm', unit: 'ppm', asset: 'Chlorinator CL-1' },
      { id: 't-ph', label: 'pH', metric: 'ph', unit: '', asset: 'Chem Probe AN-2' },
      { id: 't-salt', label: 'Salt', metric: 'salt_ppm', unit: 'ppm', asset: 'Chlorinator CL-1' },
      { id: 't-lvl', label: 'Wet Well Level', metric: 'level_pct', unit: '%', asset: 'Influent Pump P-101' },
      { id: 't-pwr', label: 'Blower Power', metric: 'power_kw', unit: 'kW', asset: 'Aeration Blower B-3' },
      { id: 't-psi', label: 'Header Pressure', metric: 'pressure_psi', unit: 'psi', asset: 'Influent Pump P-101' },
      { id: 't-temp', label: 'Basin Temp', metric: 'temp_c', unit: '°C', asset: 'Aeration Basin Sensor T-9' },
    ],
  },
  base: { flow_lpm: 1180, free_chlorine_ppm: 3.1, ph: 7.4, salt_ppm: 3200, level_pct: 62, power_kw: 41, pressure_psi: 48 },
  spread: { flow_lpm: 55, free_chlorine_ppm: 0.9, ph: 0.28, salt_ppm: 70, level_pct: 14, power_kw: 6, pressure_psi: 9 },
  offline: new Set(['temp_c']), // basin temp sensor is silent — exercises device-silence detection
  decimals: { ph: 2, free_chlorine_ppm: 1 },
  rules: [
    { metric: 'ph', severity: 'critical', test: (v) => v > 8.0,
      message: (v) => `pH ${v.toFixed(2)} critically high — chlorine disinfection significantly impaired above 8.0`,
      ai: 'CDC MAHC: disinfection efficacy drops sharply above pH 8.0.' },
    { metric: 'ph', severity: 'warning', test: (v) => v < 7.0 || (v > 7.8 && v <= 8.0),
      message: (v) => `pH ${v.toFixed(2)} outside CDC-recommended range (7.0–7.8)`,
      ai: 'Trending out of range; recommend checking acid feed calibration.' },
    { metric: 'free_chlorine_ppm', severity: 'critical', test: (v) => v > 10,
      message: (v) => `Free chlorine ${v.toFixed(1)} ppm exceeds the bather-safety limit (10 ppm)`,
      ai: 'Overfeed detected — verify chlorinator output setpoint.' },
    { metric: 'free_chlorine_ppm', severity: 'warning', test: (v) => v < 2,
      message: (v) => `Free chlorine ${v.toFixed(1)} ppm below the 2 ppm minimum`,
      ai: 'Residual falling; disinfection may be inadequate.' },
    { metric: 'level_pct', severity: 'warning', test: (v) => v > 88,
      message: (v) => `Wet well level ${v.toFixed(0)}% — approaching high-level`,
      ai: 'Inflow exceeding pump-out; watch for a lead-pump fault.' },
    { metric: 'pressure_psi', severity: 'critical', test: (v) => v > 62,
      message: (v) => `Header pressure ${v.toFixed(0)} psi exceeds the safe limit`,
      ai: 'Possible downstream blockage or closed valve.' },
    { metric: 'power_kw', severity: 'warning', test: (v) => v > 52,
      message: (v) => `Blower power ${v.toFixed(1)} kW above expected baseline`,
      ai: 'Elevated draw may indicate a fouled diffuser or bearing wear.' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Sunset Ridge HOA — Community Pool. Serviced by WTR DR.
//
// A genuinely different vertical, not Riverside relabelled. A public pool is
// regulated on bather safety rather than discharge quality, so the governing
// numbers are CDC Model Aquatic Health Code: pH 7.2–7.8, free chlorine at least
// 1 ppm, ORP at least 650 mV as the disinfection-strength proxy. Filter
// pressure rising above its clean baseline is the classic "backwash / clean the
// cartridge" signal, and a variable-speed pump dropping below its turnover
// speed means the water is no longer being circulated fast enough for the
// chemistry to hold.
// ─────────────────────────────────────────────────────────────────────────────
const SUNSET_RIDGE: SiteConfig = {
  site: {
    id: 'pool-sunsetridge',
    name: 'Sunset Ridge HOA — Community Pool',
    cmms: { partner: 'WTR DR', system: 'ServiceTitan', active: true },
  },
  screen: {
    id: 'screen-pool-plant',
    siteId: 'pool-sunsetridge',
    name: 'Pool & Pump System',
    helpContextKey: 'screen.pool',
    tiles: [
      { id: 'p-ph', label: 'pH', metric: 'ph', unit: '', asset: 'pH / ORP Controller' },
      { id: 'p-orp', label: 'ORP', metric: 'orp_mv', unit: 'mV', asset: 'pH / ORP Controller' },
      { id: 'p-cl', label: 'Free Chlorine', metric: 'free_chlorine_ppm', unit: 'ppm', asset: 'IntelliChlor IC40' },
      { id: 'p-salt', label: 'Salt', metric: 'salt_ppm', unit: 'ppm', asset: 'IntelliChlor IC40' },
      { id: 'p-rpm', label: 'Pump Speed', metric: 'pump_rpm', unit: 'RPM', asset: 'IntelliFlo VSF Pump' },
      { id: 'p-flow', label: 'Circulation', metric: 'flow_lpm', unit: 'L/min', asset: 'IntelliFlo VSF Pump' },
      { id: 'p-psi', label: 'Filter Pressure', metric: 'pressure_psi', unit: 'psi', asset: 'Cartridge Filter' },
      { id: 'p-temp', label: 'Water Temp', metric: 'temp_c', unit: '°C', asset: 'Heater / Temp Sensor' },
    ],
  },
  // pH seeded just above range so the site opens with one live, explainable
  // warning rather than an all-green screen nothing can be demonstrated on.
  base: { ph: 7.85, orp_mv: 710, free_chlorine_ppm: 2.4, salt_ppm: 3200, pump_rpm: 2400, flow_lpm: 246, pressure_psi: 17, temp_c: 29 },
  spread: { ph: 0.12, orp_mv: 45, free_chlorine_ppm: 0.4, salt_ppm: 60, pump_rpm: 120, flow_lpm: 18, pressure_psi: 1.6, temp_c: 0.5 },
  offline: new Set(),
  decimals: { ph: 2, free_chlorine_ppm: 1, temp_c: 1, pressure_psi: 1 },
  rules: [
    { metric: 'ph', severity: 'critical', test: (v) => v > 8.0,
      message: (v) => `pH ${v.toFixed(2)} critically high — chlorine is largely ineffective above 8.0`,
      ai: 'CDC MAHC: at pH 8.0 roughly a fifth of free chlorine remains in its active form. Check the acid feed before adding more chlorine — more chlorine at this pH will not fix it.' },
    { metric: 'ph', severity: 'warning', test: (v) => v < 7.2 || (v > 7.8 && v <= 8.0),
      message: (v) => `pH ${v.toFixed(2)} outside the bather-comfort range (7.2–7.8)`,
      ai: 'Drifting high is normal for a salt pool — chlorine generation is alkaline. Usually acid feed or aeration, not a chemistry fault.' },
    { metric: 'free_chlorine_ppm', severity: 'critical', test: (v) => v < 1.0,
      message: (v) => `Free chlorine ${v.toFixed(1)} ppm is below the 1 ppm public-pool minimum`,
      ai: 'Below the regulated minimum the pool should not be open to bathers. Verify the chlorinator is generating and salt is in range.' },
    { metric: 'free_chlorine_ppm', severity: 'warning', test: (v) => v > 4.0,
      message: (v) => `Free chlorine ${v.toFixed(1)} ppm above the 4 ppm comfort limit`,
      ai: 'Overfeed — reduce chlorinator output. High residual causes eye and skin irritation complaints.' },
    { metric: 'orp_mv', severity: 'warning', test: (v) => v < 650,
      message: (v) => `ORP ${v.toFixed(0)} mV below the 650 mV disinfection threshold`,
      ai: 'ORP measures how effectively the chlorine present is actually working, which is why it can fall while the chlorine reading looks fine — usually high pH or cyanuric acid.' },
    { metric: 'salt_ppm', severity: 'warning', test: (v) => v < 2700,
      message: (v) => `Salt ${v.toFixed(0)} ppm below the chlorinator's operating range`,
      ai: 'A salt cell cannot generate below its minimum and will fault rather than under-produce. Add salt before the residual falls.' },
    { metric: 'pressure_psi', severity: 'warning', test: (v) => v > 24,
      message: (v) => `Filter pressure ${v.toFixed(1)} psi — roughly 8 psi above the clean baseline`,
      ai: 'A rise of about 8 psi over clean is the standard signal to clean the cartridge. Circulation falls as it climbs, which then drags the chemistry with it.' },
    { metric: 'pump_rpm', severity: 'warning', test: (v) => v < 1200 && v > 0,
      message: (v) => `Pump at ${v.toFixed(0)} RPM — below the speed needed for a full turnover`,
      ai: 'Running slow saves energy but stops the pool turning over daily. Chemistry problems that look chemical often start here.' },
    { metric: 'temp_c', severity: 'warning', test: (v) => v > 32,
      message: (v) => `Water ${v.toFixed(1)} °C — above the comfort range`,
      ai: 'Warm water accelerates chlorine loss and algae growth; expect residual to fall while it stays high.' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// The Johnson Residence — a backyard residential pool. Serviced by WTR DR.
//
// Deliberately a different SCALE, not a different skin. A residential pool is
// roughly a tenth the volume of the HOA pool, so it runs a smaller salt cell at
// lower output, a pump at half the speed, and a filter at lower pressure — and
// its chemistry swings faster because there is less water to buffer it, which
// is why the spreads below are wider relative to the values.
//
// The thresholds are looser than Sunset Ridge on purpose: a private pool is not
// a regulated public bathing facility, so the 1 ppm public-pool minimum and the
// bather-load rules do not apply. Using the public-pool numbers here would
// generate alarms a homeowner should never receive.
// ─────────────────────────────────────────────────────────────────────────────
const JOHNSON: SiteConfig = {
  site: {
    id: 'pool-johnson',
    name: 'The Johnson Residence',
    cmms: { partner: 'WTR DR', system: 'ServiceTitan', active: true },
  },
  screen: {
    id: 'screen-pool-residential',
    siteId: 'pool-johnson',
    name: 'Pool & Pump System',
    helpContextKey: 'screen.pool',
    tiles: [
      { id: 'j-ph', label: 'pH', metric: 'ph', unit: '', asset: 'pH / ORP' },
      { id: 'j-orp', label: 'ORP', metric: 'orp_mv', unit: 'mV', asset: 'pH / ORP' },
      { id: 'j-cl', label: 'Free Chlorine', metric: 'free_chlorine_ppm', unit: 'ppm', asset: 'IntelliChlor IC20' },
      { id: 'j-salt', label: 'Salt', metric: 'salt_ppm', unit: 'ppm', asset: 'IntelliChlor IC20' },
      { id: 'j-rpm', label: 'Pump Speed', metric: 'pump_rpm', unit: 'RPM', asset: 'SuperFlo VS Pump' },
      { id: 'j-psi', label: 'Filter Pressure', metric: 'pressure_psi', unit: 'psi', asset: 'Filter' },
      { id: 'j-temp', label: 'Water Temp', metric: 'temp_c', unit: '°C', asset: 'Water Temp' },
    ],
  },
  base: { ph: 7.4, orp_mv: 740, free_chlorine_ppm: 2.1, salt_ppm: 3100, pump_rpm: 1800, pressure_psi: 12, temp_c: 28 },
  spread: { ph: 0.16, orp_mv: 55, free_chlorine_ppm: 0.5, salt_ppm: 70, pump_rpm: 90, pressure_psi: 1.2, temp_c: 0.7 },
  offline: new Set(),
  decimals: { ph: 2, free_chlorine_ppm: 1, temp_c: 1, pressure_psi: 1 },
  rules: [
    { metric: 'ph', severity: 'critical', test: (v) => v > 8.2,
      message: (v) => `pH ${v.toFixed(2)} very high — chlorine is largely ineffective`,
      ai: 'Well above range. Check the acid feed; adding chlorine at this pH will not help.' },
    { metric: 'ph', severity: 'warning', test: (v) => v < 7.2 || (v > 7.8 && v <= 8.2),
      message: (v) => `pH ${v.toFixed(2)} outside the comfortable range (7.2–7.8)`,
      ai: 'Salt pools drift alkaline as they generate chlorine — normal, but it needs correcting.' },
    { metric: 'free_chlorine_ppm', severity: 'warning', test: (v) => v < 1.0,
      message: (v) => `Free chlorine ${v.toFixed(1)} ppm is low`,
      ai: 'Warning rather than critical: a private pool is not a regulated public facility, so this is a service prompt, not a closure trigger.' },
    { metric: 'orp_mv', severity: 'warning', test: (v) => v < 650,
      message: (v) => `ORP ${v.toFixed(0)} mV below the 650 mV disinfection threshold`,
      ai: 'ORP can fall while chlorine reads fine — usually high pH or accumulated stabiliser.' },
    { metric: 'salt_ppm', severity: 'warning', test: (v) => v < 2700,
      message: (v) => `Salt ${v.toFixed(0)} ppm below the cell's operating range`,
      ai: 'The cell will fault rather than under-produce. Add salt before the residual drops.' },
    { metric: 'pressure_psi', severity: 'warning', test: (v) => v > 20,
      message: (v) => `Filter pressure ${v.toFixed(1)} psi — around 8 psi above clean`,
      ai: 'Time to clean the cartridge. Circulation drops as this climbs.' },
  ],
};

export const SITE_CONFIGS: Record<string, SiteConfig> = {
  [RIVERSIDE.site.id]: RIVERSIDE,
  [SUNSET_RIDGE.site.id]: SUNSET_RIDGE,
  [JOHNSON.site.id]: JOHNSON,
};

/** Used when opened standalone with no ?site= — the original demo facility. */
export const DEFAULT_SITE_ID = RIVERSIDE.site.id;

export function configForSite(siteId: string | null): SiteConfig | undefined {
  return SITE_CONFIGS[siteId ?? DEFAULT_SITE_ID];
}
