// CMMS connector framework (reporting-and-kpi-design.md §2). A per-vendor
// adapter turns a PeakLogic service ticket into a work order in the channel
// partner's (or tenant's) CMMS. There is no universal CMMS standard, so each
// vendor is an adapter — the same discipline the telemetry normalization
// fabric uses for heterogeneous device sources. generic_webhook is adapter #1
// (it wraps the existing SSRF-guarded postWebhook), preserving today's
// behaviour; every other vendor is a sibling added against a named need.

export type CmmsVendor =
  | 'generic_webhook'
  | 'upkeep'
  | 'fiix'
  | 'limble'
  | 'maintainx'
  | 'maximo'
  | 'servicetitan';

export interface CmmsConnector {
  id: string | null; // null for a connector synthesised from a legacy webhook_url
  vendor: CmmsVendor;
  baseUrl: string | null;
  credentialRef: string | null; // Key Vault secret NAME — never the secret itself
  fieldMapping: Record<string, unknown>;
  inboundMode: 'webhook' | 'poll' | 'none';
}

// The normalized work order an adapter serialises for its vendor.
export interface WorkOrder {
  peaklogicTicketId: string;
  title: string;
  description: string;
  priority: string;
  source: 'automated' | 'manual' | 'api';
  assetId: string | null;
  deviceThingName: string | null;
  createdAt: string; // ISO8601
}

export interface DispatchResult {
  ok: boolean;
  // The CMMS work-order id, IF the vendor returns one synchronously. Many
  // (incl. generic_webhook) don't — inbound sync (step 2) reconciles by
  // peaklogicTicketId, so a null externalRef here is normal, not a failure.
  externalRef: string | null;
  error?: string;
}

export interface CmmsAdapter {
  vendor: CmmsVendor;
  // `secret` is resolved from connector.credentialRef via Key Vault by the
  // caller; null when the vendor needs none (generic_webhook).
  send(connector: CmmsConnector, workOrder: WorkOrder, secret: string | null): Promise<DispatchResult>;
}
