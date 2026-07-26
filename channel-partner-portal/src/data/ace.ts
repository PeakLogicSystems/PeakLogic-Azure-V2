// Ace Septic & Waste's book of business — the sites they service (across their
// customers/tenants), the devices at each, and their CMMS tickets. Shaped like
// what the partner API would return for the acting channel partner (a fan-out of
// individually-scoped reads, never a cross-tenant query — Target Reference
// Architecture §5.3). Preview data: no backend deployed; swap for real fetches
// (GET /v1/sites, /v1/devices, /v1/tickets under withChannelPartner) later.

export type SiteHealth = 'healthy' | 'watch' | 'critical';
export type DeviceStatus = 'online' | 'offline' | 'fault';
export type TicketStatus = 'open' | 'scheduled' | 'in_progress' | 'completed';
export type TicketPriority = 'critical' | 'high' | 'normal';

export interface Device {
  id: string; // serial
  name: string;
  type: string;
  status: DeviceStatus;
  reading?: string; // primary live reading, e.g. "1,180 L/min"
  controllable: boolean;
  running?: boolean; // for controllable equipment (on/off)
}

export interface Site {
  id: string;
  name: string;
  customer: string; // the tenant Ace services
  location: string;
  health: SiteHealth;
  alarms: number;
  hasFacility: boolean; // a facility has been built in the Facility Builder
  peakview: boolean; // PeakView360 operator view available
  devices: Device[];
}

export interface Ticket {
  id: string;
  title: string;
  siteId: string;
  priority: TicketPriority;
  status: TicketStatus;
  technician?: string;
  createdDaysAgo: number;
  source: 'alarm' | 'pm' | 'manual';
}

export const SITES: Site[] = [
  {
    id: 'site-riverside',
    name: 'Riverside Water Reclamation Facility',
    customer: 'Bayfront Municipal District',
    location: 'Riverside, FL',
    health: 'watch',
    alarms: 1,
    hasFacility: true,
    peakview: true,
    devices: [
      { id: 'PLG-1042', name: 'Influent Pump P-101', type: 'Pump', status: 'online', reading: '1,180 L/min', controllable: true, running: true },
      { id: 'PLG-1043', name: 'Aeration Blower B-3', type: 'Blower', status: 'fault', reading: '52 kW', controllable: true, running: true },
      { id: 'PLG-1044', name: 'Chlorinator CL-1', type: 'Chlorinator', status: 'online', reading: '3.1 ppm', controllable: true, running: true },
      { id: 'PLG-1045', name: 'Chem Probe AN-2', type: 'pH Analyzer', status: 'online', reading: '7.4 pH', controllable: false },
      { id: 'PLG-1046', name: 'Wet Well Level LT-1', type: 'Level Sensor', status: 'online', reading: '62 %', controllable: false },
      { id: 'PLG-1047', name: 'Basin Temp T-9', type: 'Temp Sensor', status: 'offline', controllable: false },
    ],
  },
  {
    id: 'site-liftstation7',
    name: 'Bayfront Lift Station 7',
    customer: 'Bayfront Municipal District',
    location: 'Bayfront, FL',
    health: 'healthy',
    alarms: 0,
    hasFacility: false,
    peakview: false,
    devices: [
      { id: 'PLG-1101', name: 'Lead Pump LS7-A', type: 'Pump', status: 'online', reading: '860 L/min', controllable: true, running: true },
      { id: 'PLG-1102', name: 'Lag Pump LS7-B', type: 'Pump', status: 'online', reading: 'idle', controllable: true, running: false },
      { id: 'PLG-1103', name: 'Wet Well Level', type: 'Level Sensor', status: 'online', reading: '41 %', controllable: false },
    ],
  },
  {
    id: 'site-lakeside',
    name: 'Lakeside Estates WWTP',
    customer: 'Lakeside HOA',
    location: 'Land O\' Lakes, FL',
    health: 'critical',
    alarms: 2,
    hasFacility: false,
    peakview: false,
    devices: [
      { id: 'PLG-1201', name: 'Recirc Pump R-1', type: 'Pump', status: 'fault', reading: 'high amps', controllable: true, running: true },
      { id: 'PLG-1202', name: 'Clarifier Level', type: 'Level Sensor', status: 'online', reading: '94 %', controllable: false },
      { id: 'PLG-1203', name: 'Effluent Flow', type: 'Flow Meter', status: 'online', reading: '410 L/min', controllable: false },
    ],
  },
  {
    id: 'site-harborpoint',
    name: 'Harbor Point Grease Interceptor',
    customer: 'Harbor Point Grill',
    location: 'Tampa, FL',
    health: 'healthy',
    alarms: 0,
    hasFacility: false,
    peakview: false,
    devices: [
      { id: 'PLG-1301', name: 'Interceptor Level', type: 'Level Sensor', status: 'online', reading: '28 %', controllable: false },
      { id: 'PLG-1302', name: 'Grease Layer', type: 'Level Sensor', status: 'online', reading: '6 cm', controllable: false },
    ],
  },
  {
    id: 'site-cedargrove',
    name: 'Cedar Grove Septic Cluster',
    customer: 'Cedar Grove Utilities',
    location: 'Dade City, FL',
    health: 'watch',
    alarms: 0,
    hasFacility: false,
    peakview: false,
    devices: [
      { id: 'PLG-1401', name: 'Dosing Pump D-1', type: 'Pump', status: 'online', reading: '12 dose/hr', controllable: true, running: true },
      { id: 'PLG-1402', name: 'Tank Level', type: 'Level Sensor', status: 'offline', controllable: false },
    ],
  },
];

export const TICKETS: Ticket[] = [
  { id: 'WO-4821', title: 'Blower B-3 elevated power — inspect diffusers & bearings', siteId: 'site-riverside', priority: 'high', status: 'in_progress', technician: 'M. Alvarez', createdDaysAgo: 1, source: 'alarm' },
  { id: 'WO-4820', title: 'pH trending high — calibrate probe AN-2', siteId: 'site-riverside', priority: 'normal', status: 'scheduled', technician: 'J. Chen', createdDaysAgo: 2, source: 'alarm' },
  { id: 'WO-4818', title: 'Lakeside recirc pump fault — high-level alarm', siteId: 'site-lakeside', priority: 'critical', status: 'open', createdDaysAgo: 0, source: 'alarm' },
  { id: 'WO-4815', title: 'Lift Station 7 — quarterly preventive maintenance', siteId: 'site-liftstation7', priority: 'normal', status: 'open', createdDaysAgo: 3, source: 'pm' },
  { id: 'WO-4809', title: 'Cedar Grove tank level sensor not reporting', siteId: 'site-cedargrove', priority: 'normal', status: 'scheduled', technician: 'R. Diaz', createdDaysAgo: 2, source: 'alarm' },
  { id: 'WO-4801', title: 'Harbor Point grease interceptor pump-out', siteId: 'site-harborpoint', priority: 'normal', status: 'completed', technician: 'R. Diaz', createdDaysAgo: 5, source: 'manual' },
];

// ── selectors ────────────────────────────────────────────────────────────────

export const siteById = (id: string): Site | undefined => SITES.find((s) => s.id === id);
export const ticketsForSite = (id: string): Ticket[] => TICKETS.filter((t) => t.siteId === id);
export const openTickets = (): Ticket[] => TICKETS.filter((t) => t.status !== 'completed');

export function kpis() {
  const devices = SITES.flatMap((s) => s.devices);
  return {
    sites: SITES.length,
    devicesOnline: devices.filter((d) => d.status === 'online').length,
    devicesTotal: devices.length,
    activeAlarms: SITES.reduce((n, s) => n + s.alarms, 0),
    openTickets: openTickets().length,
    faults: devices.filter((d) => d.status === 'fault').length,
  };
}
