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
export type SensorType = 'flow' | 'level' | 'pressure' | 'chemistry' | 'temperature' | 'power' | 'speed';

export const SENSOR_TYPE_OF: Record<string, SensorType> = {
  flow_lpm: 'flow',
  level_pct: 'level',
  pressure_psi: 'pressure',
  free_chlorine_ppm: 'chemistry',
  salt_ppm: 'chemistry',
  ph: 'chemistry',
  temp_c: 'temperature',
  power_kw: 'power',
  orp_mv: 'chemistry',  // oxidation-reduction potential — a chemistry reading, not a separate class
  pump_rpm: 'speed',    // variable-speed drives report RPM, not power
};

export const SENSOR_TYPE_META: Record<SensorType, { label: string; color: string }> = {
  flow: { label: 'Flow', color: '#3B82F6' },
  level: { label: 'Level', color: '#06B6D4' },
  pressure: { label: 'Pressure', color: '#8B5CF6' },
  chemistry: { label: 'Chemistry', color: '#22C55E' },
  temperature: { label: 'Temperature', color: '#F59E0B' },
  power: { label: 'Power', color: '#EC4899' },
  speed: { label: 'Speed', color: '#F97316' },
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

// Sunset Ridge HOA — Community Pool. Serviced by WTR DR.
//
// A real scene in the same projected model as Riverside, not a flat schematic.
// It is laid out the way a pool actually plumbs, because that is what makes the
// view diagnostic rather than decorative: water leaves the pool through the
// skimmer, is pulled by the variable-speed pump, pushed through the filter,
// past the salt cell and the heater, and returns. When filter pressure climbs,
// an operator can see that everything downstream of it is what suffers.
//
// The equipment pad sits alongside the pool body (z: 8) as it does on site,
// rather than being drawn in an abstract line.
export const SUNSET_RIDGE_FACILITY: Facility = {
  siteId: 'pool-sunsetridge',
  name: 'Sunset Ridge HOA — Community Pool',
  center: { x: 50, z: 26 },
  units: [
    // The pool body — wide, shallow, and the only unit that is not equipment.
    { id: 'pool', label: 'Community Pool', x: 44, z: 40, w: 46, d: 22, h: 2, metrics: ['temp_c', 'ph'] },
    { id: 'skimmer', label: 'Skimmer', x: 18, z: 26, w: 4, d: 4, h: 3, metrics: [] },
    { id: 'pump', label: 'VS Pump', x: 30, z: 10, w: 8, d: 7, h: 6, metrics: ['pump_rpm', 'flow_lpm'] },
    { id: 'filter', label: 'Cartridge Filter', x: 45, z: 10, w: 8, d: 8, h: 11, metrics: ['pressure_psi'] },
    { id: 'chlorinator', label: 'Salt Cell', x: 60, z: 10, w: 7, d: 6, h: 6, metrics: ['free_chlorine_ppm', 'salt_ppm'] },
    { id: 'heater', label: 'Heater', x: 74, z: 10, w: 9, d: 7, h: 7, metrics: ['temp_c'] },
    { id: 'controller', label: 'pH / ORP Controller', x: 60, z: 24, w: 5, d: 4, h: 5, metrics: ['ph', 'orp_mv'] },
    { id: 'returns', label: 'Returns', x: 88, z: 26, w: 4, d: 6, h: 3, metrics: [] },
  ],
  pipes: [
    { from: 'pool', to: 'skimmer' },
    { from: 'skimmer', to: 'pump' },
    { from: 'pump', to: 'filter' },
    { from: 'filter', to: 'chlorinator' },
    { from: 'chlorinator', to: 'heater' },
    { from: 'chlorinator', to: 'controller' },
    { from: 'heater', to: 'returns' },
    { from: 'returns', to: 'pool' },
  ],
};

// The Johnson Residence — a backyard pool, drawn to its actual relative scale.
//
// Deliberately smaller than the HOA scene rather than the same boxes renamed:
// a compact kidney-ish body, one skimmer, a tight equipment pad against the
// house, and no separate ORP controller cabinet — residential controllers are
// wall units on the pad. A partner opening this after Sunset Ridge should see
// immediately that it is a different class of job.
export const JOHNSON_FACILITY: Facility = {
  siteId: 'pool-johnson',
  name: 'The Johnson Residence',
  center: { x: 44, z: 26 },
  units: [
    { id: 'pool', label: 'Pool', x: 40, z: 36, w: 28, d: 16, h: 2, metrics: ['temp_c', 'ph'] },
    { id: 'skimmer', label: 'Skimmer', x: 22, z: 24, w: 3, d: 3, h: 2, metrics: [] },
    { id: 'pump', label: 'VS Pump', x: 36, z: 12, w: 6, d: 5, h: 4, metrics: ['pump_rpm'] },
    { id: 'filter', label: 'Filter', x: 48, z: 12, w: 6, d: 6, h: 8, metrics: ['pressure_psi'] },
    { id: 'chlorinator', label: 'Salt Cell', x: 60, z: 12, w: 5, d: 4, h: 4, metrics: ['free_chlorine_ppm', 'salt_ppm', 'orp_mv'] },
    { id: 'returns', label: 'Returns', x: 68, z: 26, w: 3, d: 4, h: 2, metrics: [] },
  ],
  pipes: [
    { from: 'pool', to: 'skimmer' },
    { from: 'skimmer', to: 'pump' },
    { from: 'pump', to: 'filter' },
    { from: 'filter', to: 'chlorinator' },
    { from: 'chlorinator', to: 'returns' },
    { from: 'returns', to: 'pool' },
  ],
};

const FACILITIES: Record<string, Facility> = {
  [RIVERSIDE_FACILITY.siteId]: RIVERSIDE_FACILITY,
  [SUNSET_RIDGE_FACILITY.siteId]: SUNSET_RIDGE_FACILITY,
  [JOHNSON_FACILITY.siteId]: JOHNSON_FACILITY,
};

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
