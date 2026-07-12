// ── Database row types ────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// ── Internal Administration Console (Domain Model §2.8, added v1.2) ────────

export interface PeakLogicStaffUser {
  id: string;
  cognito_sub: string;
  email: string;
  display_name: string | null;
  role: 'superadmin' | 'account_manager';
  status: 'active' | 'disabled';
  created_at: Date;
  updated_at: Date;
}

export interface AccountAssignment {
  id: string;
  staff_user_id: string;
  tenant_id: string | null;
  channel_partner_id: string | null;
  assigned_at: Date;
  assigned_by: string;
}

// ── Tenant user (SET-3/SET-4/SET-5 preferences, added v1.2) ────────────────

export interface User {
  id: string;
  tenant_id: string;
  cognito_sub: string;
  email: string;
  display_name: string | null;
  role: 'admin' | 'operator';
  status: string;
  clock_format: '12h' | '24h' | null;
  timezone: string | null;
  theme: 'light' | 'dark' | null;
  created_at: Date;
}

export interface Site {
  id: string;
  tenant_id: string;
  name: string;
  type: 'pumping_station' | 'qsr' | 'pool' | 'other';
  address: Record<string, string> | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Asset {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  category: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  install_date: Date | null;
  spec_sheet_key: string | null;
  specs: AssetSpecs | null;
  health_status: 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown';
  created_at: Date;
  updated_at: Date;
}

export interface AssetSpecs {
  power_kw?: number;
  flow_lpm?: number;
  pressure_psi?: number;
  temp_max_c?: number;
  duty_cycle_pct?: number;
  [key: string]: number | undefined;
}

export interface Device {
  id: string;
  tenant_id: string | null;  // null until a customer claims it (backend/api/routes/devices.ts's claim())
  asset_id: string | null;
  serial: string;
  thing_name: string;
  firmware_version: string | null;
  status: 'provisioning' | 'online' | 'offline' | 'decommissioned';
  last_seen_at: Date | null;
  provisioned_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Alert {
  id: string;
  tenant_id: string;
  device_id: string | null;
  asset_id: string | null;
  severity: 'info' | 'warning' | 'critical';
  type: string;
  message: string;
  context: Record<string, unknown> | null;
  status: 'open' | 'acknowledged' | 'resolved' | 'suppressed';
  triggered_at: Date;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
}

export interface ServiceTicket {
  id: string;
  tenant_id: string;
  alert_id: string | null;
  asset_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  webhook_url: string | null;
  external_ref: string | null;
  due_at: Date | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Telemetry ─────────────────────────────────────────────────────────────

export interface TelemetryPoint {
  time: Date;
  device_id: string;
  tenant_id: string;
  metric: string;
  value: number;
  quality: number;
}

// ── IoT ingest event from IoT Core rule ───────────────────────────────────

export interface IoTIngestEvent {
  thingName: string;          // injected by topic(2) in rule SQL
  ts: number;                 // unix epoch ms — device clock
  metrics: Record<string, number>;
}
