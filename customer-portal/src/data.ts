// The Customer Portal shows ONE tenant their OWN sites — the customer's view of
// the PeakLogic platform (a municipality here: Bayfront Municipal District,
// serviced by the channel partner Ace Septic & Waste). Isolated: a customer
// never sees another customer's data or their service partner's other accounts.
// Preview data; shaped like GET /v1/sites|devices|alerts under withTenant.

export type Health = 'healthy' | 'watch' | 'critical';
export type DeviceStatus = 'online' | 'offline' | 'fault';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type ReportStatus = 'submitted' | 'draft' | 'due';

export interface Device {
  id: string;
  name: string;
  type: string;
  status: DeviceStatus;
  reading?: string;
}

export interface Site {
  id: string;
  name: string;
  location: string;
  health: Health;
  peakview: boolean;
  devices: Device[];
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  siteId: string;
  asset: string;
  message: string;
  minutesAgo: number;
  acknowledged: boolean;
}

export interface Report {
  id: string;
  title: string;
  period: string;
  kind: string;
  status: ReportStatus;
  date: string;
}

export interface Customer {
  name: string;
  kind: string;
  location: string;
  user: { name: string; role: string; email: string };
  provider: string;
  providerSince: string;
  sites: Site[];
  alerts: Alert[];
  reports: Report[];
}

export const CUSTOMER: Customer = {
  name: 'Bayfront Municipal District',
  kind: 'Municipal Utility',
  location: 'Bayfront, FL',
  user: { name: 'Sarah Rivera', role: 'Operations Manager', email: 'srivera@bayfrontmd.gov' },
  provider: 'Ace Septic & Waste',
  providerSince: '2024',
  sites: [
    {
      id: 'site-riverside',
      name: 'Riverside Water Reclamation Facility',
      location: 'Riverside, FL',
      health: 'watch',
      peakview: true,
      devices: [
        { id: 'PLG-1042', name: 'Influent Pump P-101', type: 'Pump', status: 'online', reading: '1,180 L/min' },
        { id: 'PLG-1043', name: 'Aeration Blower B-3', type: 'Blower', status: 'fault', reading: '52 kW' },
        { id: 'PLG-1044', name: 'Chlorinator CL-1', type: 'Chlorinator', status: 'online', reading: '3.1 ppm' },
        { id: 'PLG-1045', name: 'Chem Probe AN-2', type: 'pH Analyzer', status: 'online', reading: '7.4 pH' },
        { id: 'PLG-1046', name: 'Wet Well Level LT-1', type: 'Level Sensor', status: 'online', reading: '62 %' },
        { id: 'PLG-1047', name: 'Basin Temp T-9', type: 'Temp Sensor', status: 'offline' },
      ],
    },
    {
      id: 'site-liftstation7',
      name: 'Bayfront Lift Station 7',
      location: 'Bayfront, FL',
      health: 'healthy',
      peakview: false,
      devices: [
        { id: 'PLG-1101', name: 'Lead Pump LS7-A', type: 'Pump', status: 'online', reading: '860 L/min' },
        { id: 'PLG-1102', name: 'Lag Pump LS7-B', type: 'Pump', status: 'online', reading: 'idle' },
        { id: 'PLG-1103', name: 'Wet Well Level', type: 'Level Sensor', status: 'online', reading: '41 %' },
      ],
    },
    {
      // A municipality plausibly runs a public aquatic centre alongside its
      // water infrastructure. Added 2026-08-01 so the ported Water-Quality
      // Report (PRD §5.17 / SRS §3.19) has a real site to render against
      // without inventing a second tenant.
      id: 'site-aquatic',
      name: 'Bayfront Community Aquatic Center',
      location: 'Bayfront, FL',
      health: 'watch',
      peakview: false,
      devices: [
        { id: 'PLG-1210', name: 'Pool pH Probe', type: 'pH Analyzer', status: 'online', reading: '7.4 pH' },
        { id: 'PLG-1211', name: 'Free Chlorine Probe', type: 'Chlorine Analyzer', status: 'online', reading: '0.8 ppm' },
        { id: 'PLG-1212', name: 'TDS Probe', type: 'TDS Sensor', status: 'online', reading: '1,180 ppm' },
        { id: 'PLG-1213', name: 'Circulation Pump CP-1', type: 'Pump', status: 'online', reading: '410 L/min' },
      ],
    },
  ],
  alerts: [
    { id: 'AL-3391', severity: 'warning', siteId: 'site-riverside', asset: 'Aeration Blower B-3', message: 'Blower power 52 kW above expected baseline — service dispatched', minutesAgo: 42, acknowledged: false },
    { id: 'AL-3388', severity: 'info', siteId: 'site-riverside', asset: 'Basin Temp T-9', message: 'Temp sensor has not reported in over 5 minutes', minutesAgo: 340, acknowledged: true },
    { id: 'AL-3380', severity: 'warning', siteId: 'site-riverside', asset: 'Chem Probe AN-2', message: 'pH trending toward upper range (7.4)', minutesAgo: 95, acknowledged: true },
    { id: 'AL-3402', severity: 'warning', siteId: 'site-aquatic', asset: 'Free Chlorine Probe', message: 'Free chlorine 0.8 ppm below the 1.0 ppm minimum — service requested', minutesAgo: 26, acknowledged: false },
  ],
  reports: [
    { id: 'DMR-2026-06', title: 'NPDES Discharge Monitoring Report', period: 'June 2026', kind: 'Compliance · NPDES/DMR', status: 'submitted', date: 'Jul 10, 2026' },
    { id: 'DMR-2026-07', title: 'NPDES Discharge Monitoring Report', period: 'July 2026', kind: 'Compliance · NPDES/DMR', status: 'draft', date: 'due Aug 10, 2026' },
    { id: 'OPS-2026-Q2', title: 'Quarterly Operations Summary', period: 'Q2 2026', kind: 'Operations', status: 'submitted', date: 'Jul 5, 2026' },
    { id: 'OPS-2026-07', title: 'Monthly Fleet Health Report', period: 'July 2026', kind: 'Operations', status: 'due', date: 'due Aug 1, 2026' },
  ],
};

export const siteById = (id: string): Site | undefined => CUSTOMER.sites.find((s) => s.id === id);
export const alertsForSite = (id: string): Alert[] => CUSTOMER.alerts.filter((a) => a.siteId === id);

export function kpis() {
  const devices = CUSTOMER.sites.flatMap((s) => s.devices);
  return {
    sites: CUSTOMER.sites.length,
    devicesOnline: devices.filter((d) => d.status === 'online').length,
    devicesTotal: devices.length,
    activeAlerts: CUSTOMER.alerts.filter((a) => !a.acknowledged).length,
    reportsDue: CUSTOMER.reports.filter((r) => r.status !== 'submitted').length,
  };
}
