import type { EquipmentState, ProcessValue, Tile } from '../types';

// Per-asset equipment health for the dashboard (PV-4). Groups the screen's tiles
// by asset and derives a PdM-style health score, status, and a recommended
// action. In production the health score comes from the Intelligence tier (AI
// Tier 2 PdM, fleet-central) — here it's a plausible preview derived from a
// stable per-asset baseline plus the current fault/offline state, so scores
// have a believable spread and react to the live floor without jittering.

export type HealthStatus = 'healthy' | 'watch' | 'at-risk';

export interface AssetHealth {
  asset: string;
  category: string;
  metrics: Tile[];
  score: number; // 0–100
  status: HealthStatus;
  state: EquipmentState;
  recommendation: string;
  runtimeHours: number;
  lastServiceDays: number;
}

interface AssetMeta {
  category: string;
  baseHealth: number;
  runtime: number;
  lastService: number;
}

const ASSET_META: Record<string, AssetMeta> = {
  'Influent Pump P-101': { category: 'Pump', baseHealth: 91, runtime: 12840, lastService: 38 },
  'Chlorinator CL-1': { category: 'Chemical Feed', baseHealth: 86, runtime: 9200, lastService: 12 },
  'Chem Probe AN-2': { category: 'Analyzer', baseHealth: 94, runtime: 4100, lastService: 61 },
  'Aeration Blower B-3': { category: 'Blower', baseHealth: 74, runtime: 22350, lastService: 96 },
  'Aeration Basin Sensor T-9': { category: 'Sensor', baseHealth: 100, runtime: 1500, lastService: 20 },
};

function worstState(states: EquipmentState[]): EquipmentState {
  if (states.includes('offline')) return 'offline';
  if (states.includes('fault')) return 'fault';
  return 'running';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function computeAssets(tiles: Tile[], values: Record<string, ProcessValue>): AssetHealth[] {
  const byAsset = new Map<string, Tile[]>();
  for (const t of tiles) {
    const list = byAsset.get(t.asset);
    if (list) list.push(t);
    else byAsset.set(t.asset, [t]);
  }

  const out: AssetHealth[] = [];
  for (const [asset, metrics] of byAsset) {
    const meta = ASSET_META[asset] ?? { category: 'Equipment', baseHealth: 90, runtime: 0, lastService: 0 };
    const states = metrics.map((t) => values[t.metric]?.state ?? 'offline');
    const state = worstState(states);

    let score = meta.baseHealth;
    if (states.includes('offline')) score = Math.min(score, 24);
    else if (states.includes('fault')) score -= 30;
    score = Math.round(clamp(score, 0, 100));

    const status: HealthStatus = score >= 85 ? 'healthy' : score >= 60 ? 'watch' : 'at-risk';

    out.push({
      asset,
      category: meta.category,
      metrics,
      score,
      status,
      state,
      recommendation: recommend(meta.category, state, status, metrics, values),
      runtimeHours: meta.runtime,
      lastServiceDays: meta.lastService,
    });
  }
  // Worst health first — needs-attention rises to the top (an operator scans this).
  return out.sort((a, b) => a.score - b.score);
}

function recommend(
  category: string,
  state: EquipmentState,
  status: HealthStatus,
  metrics: Tile[],
  values: Record<string, ProcessValue>,
): string {
  if (state === 'offline') {
    const silent = metrics.find((t) => (values[t.metric]?.state ?? 'offline') === 'offline');
    return `Dispatch a technician — ${silent?.label ?? 'a sensor'} has not reported in over 5 minutes.`;
  }
  if (state === 'fault') {
    switch (category) {
      case 'Blower':
        return 'Inspect diffusers and bearings — power draw is above the expected baseline.';
      case 'Pump':
        return 'Check for a downstream restriction or closed valve — header pressure is high.';
      case 'Chemical Feed':
        return 'Verify the feed setpoint and probe calibration — chlorine is out of range.';
      default:
        return 'Investigate the active alarm on this asset.';
    }
  }
  if (status === 'watch') {
    return 'Schedule preventive maintenance — trending toward its service interval.';
  }
  return 'No action — operating within normal range.';
}
