// PeakView360 view models. These mirror the real backend contracts the SPA will
// call once a backend exists (peakview360-hmi-architecture.md §2):
//   GET /v1/hmi-screens -> HmiScreen[]   (hmi_screens: layout + help_context_key)
//   GET /v1/tags        -> Tag[]          (tags: source->canonical metric, scale/offset)
//   GET /v1/alerts      -> Alarm[]        (a projection over the alerts pipeline)
// Live process values resolve from the on-site Hub over the LAN; history/cross-
// site from the cloud (the dual-source model, §3.1).

// 'warning' exists so a warning-severity alarm has somewhere to show on the
// tile. Without it a raised alarm sat behind a green "Running" tile.
export type EquipmentState = 'running' | 'warning' | 'fault' | 'offline';
export type Severity = 'critical' | 'warning' | 'info';
export type AlarmStatus = 'active' | 'acknowledged';
export type DataSource = 'hub-lan' | 'cloud';

/** A canonical metric definition (tags row). */
export interface Tag {
  metric: string; // canonical key, e.g. "free_chlorine_ppm"
  label: string;
  unit: string;
}

/** One tile on an operator screen — a metric to render, bound to an asset. */
export interface Tile {
  id: string;
  label: string;
  metric: string;
  unit: string;
  asset: string;
}

/** An operator screen (hmi_screens row; layout projected to tiles). */
export interface HmiScreen {
  id: string;
  siteId: string;
  name: string;
  helpContextKey: string; // enforced: no screen ships without one (PA-7)
  tiles: Tile[];
}

/** The current value of a metric, as rendered live in a tile. */
export interface ProcessValue {
  metric: string;
  value: number; // NaN when the source is offline / not reporting
  state: EquipmentState;
  trend: number; // change vs. the previous sample (for the ▲/▼ indicator)
  updatedAt: number; // epoch ms
}

/** An alarm — a projection over the alerts pipeline, with AI/threshold context. */
export interface Alarm {
  id: string;
  severity: Severity;
  status: AlarmStatus;
  asset: string;
  metric: string;
  message: string;
  aiContext?: string; // the AI finding / threshold explanation shown beside the alarm (PV-2 / PA-3)
  helpContextKey: string; // one-click PeakAssist deep-link target
  raisedAt: number;
}

export interface Site {
  id: string;
  name: string;
}
