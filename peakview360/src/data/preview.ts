import { useEffect, useState } from 'react';
import type { Alarm, HmiScreen, ProcessValue, Severity, Site } from '../types';

// Preview data + a live simulation. Deliberately coherent: alarms are DERIVED
// from the same live process values the tiles show (via the same kind of
// threshold rules the real platform runs, backend/ingest/rules.ts), so the
// alarm panel reacts to the floor in real time and alarms auto-clear when a
// value returns to range — the real alarm lifecycle, not a scripted list. One
// sensor is intentionally OFFLINE (no data), exercising the silent/offline state
// the platform's device-silence detection is built around.

// The site's outbound work-order link. Set to null to see the ungated
// behaviour: the "Issue WO" action disappears entirely rather than appearing
// disabled, because a control an operator cannot use should not be on screen
// implying the capability exists.
export const PREVIEW_SITE: Site = {
  id: 'site-riverside',
  name: 'Riverside Water Reclamation Facility',
  cmms: { partner: 'Ace Septic & Waste', system: 'UpKeep', active: true },
};

export const PREVIEW_SCREEN: HmiScreen = {
  id: 'screen-chlor-aer',
  siteId: PREVIEW_SITE.id,
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
};

const ASSET_BY_METRIC = Object.fromEntries(PREVIEW_SCREEN.tiles.map((t) => [t.metric, t.asset]));

const BASE: Record<string, number> = {
  flow_lpm: 1180, free_chlorine_ppm: 3.1, ph: 7.4, salt_ppm: 3200,
  level_pct: 62, power_kw: 41, pressure_psi: 48,
};
const SPREAD: Record<string, number> = {
  flow_lpm: 55, free_chlorine_ppm: 0.9, ph: 0.28, salt_ppm: 70,
  level_pct: 14, power_kw: 6, pressure_psi: 9,
};
const OFFLINE = new Set(['temp_c']); // basin temp sensor is silent — shows offline / no data

interface Rule {
  metric: string;
  severity: Severity;
  test: (v: number) => boolean;
  message: (v: number) => string;
  ai: string;
}

// Thresholds echo backend/ingest/rules.ts (pool_chemistry CDC values, etc.).
const RULES: Rule[] = [
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
];

const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

// The worst severity currently firing for a metric, or null if none. Tile
// state and the alarm panel are both driven from this one function, which is
// what keeps them from disagreeing.
function worstFiring(metric: string, value: number): Severity | null {
  let worst: Severity | null = null;
  for (const r of RULES) {
    if (r.metric !== metric || !r.test(value)) continue;
    if (worst === null || SEV_RANK[r.severity] < SEV_RANK[worst]) worst = r.severity;
  }
  return worst;
}

function stateFor(metric: string, value: number): 'running' | 'warning' | 'fault' {
  const sev = worstFiring(metric, value);
  return sev === 'critical' ? 'fault' : sev === 'warning' ? 'warning' : 'running';
}

// How long a sensor must be silent before it is reported as such. Mirrors the
// real sweep's shape (expected interval x grace multiplier) rather than
// inventing a different rule for the demo.
const SILENCE_AFTER_MS = 300_000;

function seed(): Record<string, ProcessValue> {
  const now = Date.now();
  const out: Record<string, ProcessValue> = {};
  for (const tile of PREVIEW_SCREEN.tiles) {
    const m = tile.metric;
    if (OFFLINE.has(m)) {
      out[m] = { metric: m, value: NaN, state: 'offline', trend: 0, updatedAt: now - 340_000 };
    } else {
      const value = round(BASE[m], m);
      out[m] = { metric: m, value, state: 'running', trend: 0, updatedAt: now };
    }
  }
  return out;
}

function step(prev: Record<string, ProcessValue>): Record<string, ProcessValue> {
  const now = Date.now();
  const out: Record<string, ProcessValue> = {};
  for (const tile of PREVIEW_SCREEN.tiles) {
    const m = tile.metric;
    if (OFFLINE.has(m)) {
      out[m] = prev[m]; // stays offline, stale
      continue;
    }
    const p = prev[m];
    // Random walk that gently reverts toward BASE, occasionally excursions.
    const drift = (BASE[m] - p.value) * 0.15;
    const jitter = (Math.random() - 0.5) * SPREAD[m];
    const value = round(p.value + drift + jitter, m);
    out[m] = {
      metric: m,
      value,
      state: stateFor(m, value),
      trend: value - p.value,
      updatedAt: now,
    };
  }
  return out;
}

function reconcileAlarms(prev: Alarm[], values: Record<string, ProcessValue>): Alarm[] {
  const byKey = new Map(prev.map((a) => [`${a.metric}:${a.severity}`, a]));
  const seen = new Set<string>();
  const next: Alarm[] = [];

  // A sensor that has stopped reporting raises a real alarm, exactly as
  // backend/jobs/silence-detection.ts does in production (type 'device_silent',
  // capped at warning because losing visibility is not the same as measuring a
  // dangerous value). Without this the offline sensor showed a red "At risk"
  // asset with an empty alarm panel behind it.
  for (const [metric, pv] of Object.entries(values)) {
    if (pv.state !== 'offline') continue;
    const silentMs = Date.now() - pv.updatedAt;
    if (silentMs < SILENCE_AFTER_MS) continue;
    const key = `${metric}:warning`;
    seen.add(key);
    const existing = byKey.get(key);
    const mins = Math.floor(silentMs / 60_000);
    next.push(
      existing
        ? { ...existing, message: `No reading for ${mins} min — sensor is not reporting` }
        : {
            id: `alm-${key}-${Date.now()}`,
            severity: 'warning',
            status: 'active',
            asset: ASSET_BY_METRIC[metric] ?? metric,
            metric,
            message: `No reading for ${mins} min — sensor is not reporting`,
            aiContext:
              'Device silence is detected by absence, not by a bad reading — every threshold rule needs a value to test, so a dead sensor would otherwise be indistinguishable from a healthy one.',
            helpContextKey: `alarm.${metric}`,
            raisedAt: Date.now(),
          },
    );
  }

  for (const rule of RULES) {
    const pv = values[rule.metric];
    if (!pv || Number.isNaN(pv.value) || !rule.test(pv.value)) continue;
    const key = `${rule.metric}:${rule.severity}`;
    if (seen.has(key)) continue; // one alarm per metric+severity
    seen.add(key);

    const existing = byKey.get(key);
    next.push(
      existing
        ? { ...existing, message: rule.message(pv.value), aiContext: rule.ai } // keep id/raisedAt/ack
        : {
            id: `alm-${key}-${Date.now()}`,
            severity: rule.severity,
            status: 'active',
            asset: ASSET_BY_METRIC[rule.metric] ?? rule.metric,
            metric: rule.metric,
            message: rule.message(pv.value),
            aiContext: rule.ai,
            helpContextKey: `alarm.${rule.metric}`,
            raisedAt: Date.now(),
          },
    );
  }
  // Alarms whose rule no longer fires simply drop out — auto-cleared.
  return next.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.raisedAt - a.raisedAt);
}

function round(v: number, metric: string): number {
  const decimals = metric === 'ph' ? 2 : metric === 'free_chlorine_ppm' ? 1 : 0;
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export interface PeakViewData {
  site: Site;
  screen: HmiScreen;
  values: Record<string, ProcessValue>;
  alarms: Alarm[];
  acknowledge: (id: string) => void;
}

export function usePeakView(): PeakViewData {
  const [values, setValues] = useState<Record<string, ProcessValue>>(seed);
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      setValues((prev) => {
        const nextValues = step(prev);
        setAlarms((prevAlarms) => reconcileAlarms(prevAlarms, nextValues));
        return nextValues;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const acknowledge = (id: string) =>
    setAlarms((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a)));

  return { site: PREVIEW_SITE, screen: PREVIEW_SCREEN, values, alarms, acknowledge };
}
