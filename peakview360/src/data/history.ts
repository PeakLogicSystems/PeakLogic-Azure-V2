// Synthetic historical series for the Historian (preview mode). In production
// these points come from the cloud historian — `telemetry` / `telemetry_hourly`
// (the dual-source model: live from the Hub, HISTORY from the cloud, §3.1). The
// series are seeded per (metric, range) so the chart is stable across re-renders
// (Math.random per frame would make it jitter), with a daily cycle + noise so a
// 24h/7d/30d trend looks like real plant data.

export type RangeKey = '24h' | '7d' | '30d';

export const RANGES: { key: RangeKey; label: string; ms: number; points: number }[] = [
  { key: '24h', label: '24 h', ms: 24 * 3_600_000, points: 48 },
  { key: '7d', label: '7 d', ms: 7 * 24 * 3_600_000, points: 84 },
  { key: '30d', label: '30 d', ms: 30 * 24 * 3_600_000, points: 90 },
];

interface Profile {
  base: number;
  daily: number; // daily swing amplitude
  noise: number;
  decimals: number;
}

const PROFILE: Record<string, Profile> = {
  flow_lpm: { base: 1180, daily: 190, noise: 45, decimals: 0 },
  free_chlorine_ppm: { base: 3.1, daily: 0.7, noise: 0.22, decimals: 1 },
  ph: { base: 7.4, daily: 0.22, noise: 0.07, decimals: 2 },
  salt_ppm: { base: 3200, daily: 110, noise: 45, decimals: 0 },
  level_pct: { base: 62, daily: 20, noise: 5, decimals: 0 },
  power_kw: { base: 41, daily: 7, noise: 2.2, decimals: 1 },
  pressure_psi: { base: 48, daily: 8, noise: 3, decimals: 0 },
  temp_c: { base: 19, daily: 3.2, noise: 0.5, decimals: 1 },
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Evenly-spaced timestamps for a range, ending now. Shared across all pens so a
 *  merged row lines up. */
export function timestamps(range: RangeKey): number[] {
  const cfg = RANGES.find((r) => r.key === range)!;
  const now = Date.now();
  const step = cfg.ms / (cfg.points - 1);
  return Array.from({ length: cfg.points }, (_, i) => Math.round(now - (cfg.points - 1 - i) * step));
}

/** The value series for one metric over a range, aligned to timestamps(range). */
export function seriesFor(metric: string, range: RangeKey): number[] {
  const prof = PROFILE[metric] ?? { base: 0, daily: 0, noise: 1, decimals: 2 };
  const rng = mulberry32(hash(`${metric}:${range}`));
  const ts = timestamps(range);
  const f = 10 ** prof.decimals;
  return ts.map((t) => {
    const tod = ((t / 3_600_000) % 24) / 24; // fraction of day
    const daily = Math.sin(tod * 2 * Math.PI - Math.PI / 2); // low overnight, peak midday
    const v = prof.base + prof.daily * daily + (rng() - 0.5) * 2 * prof.noise;
    return Math.round(v * f) / f;
  });
}
