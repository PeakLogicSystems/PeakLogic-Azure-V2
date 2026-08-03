import { useEffect, useState } from 'react';
import type { Alarm, HmiScreen, ProcessValue, Severity, Site } from '../types';
import { configForSite } from './sites';
import { ACTIVE_SITE_ID } from '../scope';

// The live preview simulation. Alarms are DERIVED from the same process values
// the tiles show, using the same kind of threshold rules the real platform runs
// (backend/ingest/rules.ts), so the alarm panel reacts to the floor in real time
// and alarms auto-clear when a value returns to range — the real alarm
// lifecycle, not a scripted list.
//
// Which site this simulates is decided by src/scope.ts, which has already
// refused to render anything if the requested site has no configuration. By the
// time this module runs, ACTIVE_SITE_ID is known-good.
const ACTIVE = configForSite(ACTIVE_SITE_ID)!;

export const PREVIEW_SITE: Site = ACTIVE.site;
export const PREVIEW_SCREEN: HmiScreen = ACTIVE.screen;

const BASE = ACTIVE.base;
const SPREAD = ACTIVE.spread;
const OFFLINE = ACTIVE.offline;
const RULES = ACTIVE.rules;
const ASSET_BY_METRIC: Record<string, string> = Object.fromEntries(
  ACTIVE.screen.tiles.map((t) => [t.metric, t.asset]),
);

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
  const f = 10 ** (ACTIVE.decimals[metric] ?? 0);
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
