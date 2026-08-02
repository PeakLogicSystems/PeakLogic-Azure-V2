import type { EquipmentState, ProcessValue } from '../types';

// The Facility View scene model (PV-5) — the plant view shown on the site
// dashboard once a facility has been saved in the Facility Builder
// (facility-builder-roadmap.md). This is a near-term REPLICATION of MooreView's
// plant view: an interactive isometric scene with Top/Front/Side orthographic
// views, rotation, and locate-sensors-by-type. It is a lightweight SVG
// projection (no 3D engine yet) — the full-fidelity 3D + the authoring tool are
// roadmapped, to be integrated/modernized from MooreView's code.
//
// World axes: x = left↔right, z = depth (front↔back), y = height (up). Units sit
// on the ground (y: 0→h).

export type FacilityView = 'iso' | 'top' | 'front' | 'side';
export type SensorType = 'flow' | 'level' | 'pressure' | 'chemistry' | 'temperature' | 'power';

export const SENSOR_TYPE_OF: Record<string, SensorType> = {
  flow_lpm: 'flow',
  level_pct: 'level',
  pressure_psi: 'pressure',
  free_chlorine_ppm: 'chemistry',
  salt_ppm: 'chemistry',
  ph: 'chemistry',
  temp_c: 'temperature',
  power_kw: 'power',
};

export const SENSOR_TYPE_META: Record<SensorType, { label: string; color: string }> = {
  flow: { label: 'Flow', color: '#3B82F6' },
  level: { label: 'Level', color: '#06B6D4' },
  pressure: { label: 'Pressure', color: '#8B5CF6' },
  chemistry: { label: 'Chemistry', color: '#22C55E' },
  temperature: { label: 'Temperature', color: '#F59E0B' },
  power: { label: 'Power', color: '#EC4899' },
};

export interface FacilityUnit {
  id: string;
  label: string;
  x: number; // ground center
  z: number;
  w: number; // footprint width (x)
  d: number; // footprint depth (z)
  h: number; // height
  metrics: string[]; // first = primary readout; each maps to a sensor
}

export interface FacilityPipe {
  from: string;
  to: string;
  kind?: 'flow' | 'air';
}

export interface Facility {
  siteId: string;
  name: string;
  center: { x: number; z: number };
  units: FacilityUnit[];
  pipes: FacilityPipe[];
}

export const RIVERSIDE_FACILITY: Facility = {
  siteId: 'site-riverside',
  name: 'Riverside Water Reclamation Facility',
  center: { x: 50, z: 30 },
  units: [
    { id: 'influent', label: 'Influent', x: 8, z: 30, w: 7, d: 10, h: 3, metrics: [] },
    { id: 'pump', label: 'Influent Pump', x: 24, z: 30, w: 10, d: 10, h: 10, metrics: ['flow_lpm', 'level_pct', 'pressure_psi'] },
    { id: 'blower', label: 'Blower', x: 48, z: 12, w: 8, d: 8, h: 9, metrics: ['power_kw'] },
    { id: 'aeration', label: 'Aeration Basin', x: 48, z: 34, w: 18, d: 18, h: 13, metrics: ['temp_c'] },
    { id: 'chlorinator', label: 'Chlorinator', x: 74, z: 30, w: 9, d: 9, h: 10, metrics: ['free_chlorine_ppm', 'salt_ppm'] },
    { id: 'probe', label: 'pH Probe', x: 74, z: 50, w: 5, d: 5, h: 6, metrics: ['ph'] },
    { id: 'effluent', label: 'Effluent', x: 92, z: 30, w: 7, d: 10, h: 3, metrics: [] },
  ],
  pipes: [
    { from: 'influent', to: 'pump' },
    { from: 'pump', to: 'aeration' },
    { from: 'blower', to: 'aeration', kind: 'air' },
    { from: 'aeration', to: 'chlorinator' },
    { from: 'chlorinator', to: 'probe' },
    { from: 'chlorinator', to: 'effluent' },
  ],
};

const FACILITIES: Record<string, Facility> = { [RIVERSIDE_FACILITY.siteId]: RIVERSIDE_FACILITY };

export function facilityForSite(siteId: string): Facility | undefined {
  return FACILITIES[siteId];
}

export function unitState(unit: FacilityUnit, values: Record<string, ProcessValue>): EquipmentState {
  if (unit.metrics.length === 0) return 'running';
  const states = unit.metrics.map((m) => values[m]?.state ?? 'offline');
  if (states.includes('offline')) return 'offline';
  if (states.includes('fault')) return 'fault';
  if (states.includes('warning')) return 'warning';
  return 'running';
}

// These now line up with alarm severity, which they previously did not: `fault`
// is raised by a CRITICAL rule but was drawn amber, the same colour a warning
// gets everywhere else in the app. A red critical alarm in the panel beside an
// amber unit on the plant view is exactly the kind of mismatch that teaches an
// operator to distrust the colours.
export const STATE_COLOR: Record<EquipmentState, string> = {
  running: '#22C55E', // status.running
  warning: '#F59E0B', // sev.warning
  fault: '#EF4444', // sev.critical
  offline: '#64748B', // status.offline
};

// ── Projection ───────────────────────────────────────────────────────────────

export interface P2 {
  sx: number;
  sy: number;
}

const ISO_COS = Math.cos(Math.PI / 6); // ~0.866
const ISO_SIN = Math.sin(Math.PI / 6); // 0.5

function rotateGround(x: number, z: number, steps: number, cx: number, cz: number): { x: number; z: number } {
  const s = ((steps % 4) + 4) % 4;
  let dx = x - cx;
  let dz = z - cz;
  for (let i = 0; i < s; i++) {
    const nx = -dz;
    const nz = dx;
    dx = nx;
    dz = nz;
  }
  return { x: cx + dx, z: cz + dz };
}

/** Project a world point to unscaled screen space for a given view + rotation. */
export function projectPoint(x: number, y: number, z: number, view: FacilityView, steps: number, c: { x: number; z: number }): P2 {
  if (view === 'top') {
    const r = rotateGround(x, z, steps, c.x, c.z);
    return { sx: r.x, sy: r.z };
  }
  if (view === 'front') return { sx: x, sy: -y };
  if (view === 'side') return { sx: z, sy: -y };
  const r = rotateGround(x, z, steps, c.x, c.z);
  return { sx: (r.x - r.z) * ISO_COS, sy: (r.x + r.z) * ISO_SIN - y };
}

/** The 8 corners of a unit's box, in a fixed order (see FACES). */
export function boxCorners(u: FacilityUnit): Array<{ x: number; y: number; z: number }> {
  const xs = [u.x - u.w / 2, u.x + u.w / 2];
  const zs = [u.z - u.d / 2, u.z + u.d / 2];
  const ys = [0, u.h];
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (const y of ys) for (const x of xs) for (const z of zs) out.push({ x, y, z });
  return out;
}

// Faces as indices into boxCorners(): bottom, top, then the four sides.
export const FACES: number[][] = [
  [0, 1, 3, 2], // bottom (y0)
  [4, 5, 7, 6], // top (y1)
  [0, 1, 5, 4], // x-min side
  [2, 3, 7, 6], // x-max side
  [0, 2, 6, 4], // z-min side
  [1, 3, 7, 5], // z-max side
];
