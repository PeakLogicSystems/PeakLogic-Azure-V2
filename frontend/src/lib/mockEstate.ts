// Shared mock data for Sites/Assets/Devices and their detail/drill-down
// pages (NAV-1 through NAV-5, PRD/SRS v1.6). Previously each list page
// (Sites.tsx/Assets.tsx/Devices.tsx) held its own independent mock array
// with loosely-matching site/asset names and no real ids linking them —
// fine for a flat list, but drill-down needs actual siteId/assetId
// relationships to navigate through, so this consolidates them into one
// relational mock dataset. Matches this frontend's existing "mock data
// until wired to the real API" convention (CLAUDE.md) — replace with real
// GET /v1/sites, /v1/assets?siteId=, /v1/devices?assetId= calls together,
// not page by page, once the frontend is wired to the backend for real.

export interface MockSite {
  id: string;
  name: string;
  type: 'pumping_station' | 'qsr' | 'pool' | 'nursing_home' | 'restaurant';
  location: string;
  status: 'healthy' | 'warning' | 'critical';
}

export interface MockAsset {
  id: string;
  siteId: string;
  name: string;
  category: string;
  make: string;
  model: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
}

export interface MockDevice {
  id: string;
  assetId: string | null;
  serial: string;
  thingName: string;
  role: string;       // what this device measures/does on its asset — e.g. "Flow sensor"
  status: 'online' | 'offline' | 'provisioning';
  firmware: string;
  lastSeen: string;
  telemetry: Record<string, { label: string; value: number | string; unit: string }>;
}

export const MOCK_SITES: MockSite[] = [
  { id: 'site-1', name: 'Riverside Pump Station',  type: 'pumping_station', location: 'Houston, TX',      status: 'healthy'  },
  { id: 'site-2', name: 'QSR — Downtown Branch',   type: 'qsr',             location: 'Austin, TX',       status: 'warning'  },
  { id: 'site-3', name: 'Lakewood Pool Complex',   type: 'pool',            location: 'Dallas, TX',       status: 'healthy'  },
  { id: 'site-4', name: 'Northside Pump Station',  type: 'pumping_station', location: 'Houston, TX',      status: 'critical' },
  { id: 'site-5', name: 'QSR — Airport Rd',        type: 'qsr',             location: 'Dallas, TX',       status: 'healthy'  },
  { id: 'site-6', name: 'Sunrise Nursing Home',    type: 'nursing_home',    location: 'San Antonio, TX',  status: 'warning'  },
  { id: 'site-7', name: 'Maple Street Diner',      type: 'restaurant',      location: 'Austin, TX',       status: 'healthy'  },
];

export const MOCK_ASSETS: MockAsset[] = [
  { id: 'asset-1', siteId: 'site-1', name: 'Primary Pump P1',      category: 'pump',         make: 'Grundfos', model: 'CM10-A',   status: 'healthy'  },
  { id: 'asset-2', siteId: 'site-1', name: 'Backup Pump P2',       category: 'pump',         make: 'Grundfos', model: 'CM10-A',   status: 'warning'  },
  { id: 'asset-3', siteId: 'site-2', name: 'Fryer Unit 1',         category: 'hvac',         make: 'Henny',    model: 'OFE',      status: 'healthy'  },
  { id: 'asset-4', siteId: 'site-2', name: 'Fryer Unit 2',         category: 'hvac',         make: 'Henny',    model: 'OFE',      status: 'critical' },
  { id: 'asset-5', siteId: 'site-3', name: 'Main Pool Circulation', category: 'pool_system',  make: 'Pentair',  model: 'IntelliChlor IC40', status: 'healthy' },
  { id: 'asset-6', siteId: 'site-7', name: 'Walk-in Cooler',       category: 'refrigeration', make: 'True',     model: 'T-49',     status: 'healthy'  },
  { id: 'asset-7', siteId: 'site-6', name: 'Basement Utility Room', category: 'leak_sensor',  make: 'Zircon',   model: 'LS-100',   status: 'warning'  },
];

// The water-pump example from the product ask: a single asset monitored by
// several distinct devices (flow sensor, energy monitor, leak sensor,
// actuator), each its own row in `devices` — devices.asset_id already had
// no uniqueness constraint (Database Schema, verified pre-existing), so
// this needed no schema change, only real UI to show it. asset-1 (Primary
// Pump P1) is deliberately given 3 devices, and asset-5 (the Pentair
// IntelliChlor salt system) is the second worked example from the same
// ask — one device, several telemetry channels (temp/salt/flow) on it.
export const MOCK_DEVICES: MockDevice[] = [
  {
    id: 'device-1', assetId: 'asset-1', serial: 'PLG-0001', thingName: 'plg-device-0001',
    role: 'Flow sensor', status: 'online', firmware: '1.2.4', lastSeen: '2 min ago',
    telemetry: { flow_lpm: { label: 'Flow rate', value: 84.2, unit: 'L/min' } },
  },
  {
    id: 'device-2', assetId: 'asset-1', serial: 'PLG-0002', thingName: 'plg-device-0002',
    role: 'Energy monitor', status: 'online', firmware: '1.2.4', lastSeen: '2 min ago',
    telemetry: { power_kw: { label: 'Power draw', value: 2.8, unit: 'kW' } },
  },
  {
    id: 'device-3', assetId: 'asset-1', serial: 'PLG-0003', thingName: 'plg-device-0003',
    role: 'Power actuator', status: 'online', firmware: '1.1.9', lastSeen: '4 min ago',
    telemetry: { state: { label: 'Valve state', value: 'Open', unit: '' } },
  },
  {
    id: 'device-4', assetId: 'asset-2', serial: 'PLG-0004', thingName: 'plg-device-0004',
    role: 'Flow sensor', status: 'online', firmware: '1.2.4', lastSeen: '2 min ago',
    telemetry: { flow_lpm: { label: 'Flow rate', value: 0, unit: 'L/min' } },
  },
  {
    id: 'device-5', assetId: 'asset-3', serial: 'PLG-0005', thingName: 'plg-device-0005',
    role: 'Temperature probe', status: 'online', firmware: '1.2.3', lastSeen: '5 min ago',
    telemetry: { temp_c: { label: 'Oil temperature', value: 178.4, unit: '°C' } },
  },
  {
    id: 'device-6', assetId: 'asset-4', serial: 'PLG-0006', thingName: 'plg-device-0006',
    role: 'Temperature probe', status: 'offline', firmware: '1.2.3', lastSeen: '3 hr ago',
    telemetry: { temp_c: { label: 'Oil temperature', value: null as unknown as number, unit: '°C' } },
  },
  // Pentair IntelliChlor salt system — one device, three telemetry
  // channels (temperature/salt/flow), the exact example from the product ask.
  {
    id: 'device-7', assetId: 'asset-5', serial: 'PLG-0007', thingName: 'plg-device-0007',
    role: 'Salt chlorinator', status: 'online', firmware: '2.0.1', lastSeen: '1 min ago',
    telemetry: {
      temp_c:   { label: 'Water temperature', value: 27.8, unit: '°C'  },
      salt_ppm: { label: 'Salt level',        value: 3200, unit: 'ppm' },
      flow_lpm: { label: 'Flow rate',         value: 112,  unit: 'L/min' },
    },
  },
  {
    id: 'device-8', assetId: 'asset-6', serial: 'PLG-0008', thingName: 'plg-device-0008',
    role: 'Temperature probe', status: 'online', firmware: '1.2.4', lastSeen: '1 min ago',
    telemetry: { product_temp_c: { label: 'Product temperature', value: 2.1, unit: '°C' } },
  },
  {
    id: 'device-9', assetId: 'asset-7', serial: 'PLG-0009', thingName: 'plg-device-0009',
    role: 'Leak sensor', status: 'online', firmware: '1.0.6', lastSeen: '6 min ago',
    telemetry: { leak_detected: { label: 'Leak detected', value: 'No', unit: '' } },
  },
  { id: 'device-10', assetId: null, serial: 'PLG-0010', thingName: 'plg-device-0010', role: 'Unassigned', status: 'provisioning', firmware: '—', lastSeen: 'Never', telemetry: {} },
];

export const siteAssets = (siteId: string) => MOCK_ASSETS.filter(a => a.siteId === siteId);
export const assetDevices = (assetId: string) => MOCK_DEVICES.filter(d => d.assetId === assetId);
export const siteDeviceCount = (siteId: string) =>
  MOCK_DEVICES.filter(d => d.assetId && siteAssets(siteId).some(a => a.id === d.assetId)).length;

export const TYPE_LABEL: Record<string, string> = {
  pumping_station: 'Pumping Station',
  qsr:             'Quick Service Restaurant',
  pool:            'Pool',
  nursing_home:    'Nursing Home',
  restaurant:      'Restaurant',
};

export const STATUS_BADGE: Record<string, string> = {
  healthy:  'bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400',
  warning:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  offline:  'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  unknown:  'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
};

export const STATUS_DOT: Record<string, string> = {
  healthy:  'bg-brand-green',
  warning:  'bg-amber-400',
  critical: 'bg-red-500',
  offline:  'bg-gray-400',
  unknown:  'bg-gray-300',
};
