// CMMS connector framework (reporting-and-kpi-design.md §2). A per-vendor
// adapter turns a PeakLogic service ticket into a work order in the channel
// partner's (or tenant's) CMMS. There is no universal CMMS standard, so each
// vendor is an adapter — the same discipline the telemetry normalization
// fabric uses for heterogeneous device sources. generic_webhook is adapter #1
// (it wraps the existing SSRF-guarded postWebhook), preserving today's
// behaviour; every other vendor is a sibling added against a named need.

import type { WorkOrderStage } from './work-order-lifecycle';

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
  // Added for the servicetitan adapter's per-tenant Customer/Location
  // mapping resolution (connector.fieldMapping.tenantMappings) — send()
  // deliberately stays DB-free (matches generic_webhook's shape), so the
  // tenant id has to travel on the WorkOrder itself rather than being
  // looked up inside the adapter.
  tenantId: string;
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

// The "send necessary services information about the tenant to the system
// for billing" half of the enterprise CMMS ask (2026-08-09) — a normalized
// summary of billable services PeakLogic delivered in a period, dispatched
// to the vendor's own billing surface (ServiceTitan: an Accounting API
// invoice/line item) so the channel partner's existing invoicing process
// can pick it up. Deliberately period-based, not per-event: a partner
// bills on their own cadence, not PeakLogic's dispatch timing.
export interface BillingRecord {
  tenantId: string;
  siteId: string | null;
  siteName: string | null;
  channelPartnerId: string;
  periodStart: string; // ISO8601 date
  periodEnd: string; // ISO8601 date
  description: string; // human-readable summary, e.g. "Remote monitoring — August 2026"
  serviceVisitCount: number;
  ticketIds: string[]; // service_tickets this record summarizes
  metadata: Record<string, unknown>; // vendor-agnostic extra context (e.g. monitored-metric counts)
}

// A normalized customer/proposal/billing record pulled FROM the vendor —
// the "receive data from these systems" half of the ask. Deliberately
// generic (not one interface per ServiceTitan Customer/Location/Estimate/
// Invoice shape): cmms_account_records stores whatever the vendor actually
// returned as JSONB, and this is just the envelope every adapter normalizes
// its own vendor-specific records into before the sync handler upserts them.
export type CmmsAccountRecordType = 'customer' | 'location' | 'proposal' | 'invoice';

export interface CmmsAccountRecord {
  recordType: CmmsAccountRecordType;
  externalId: string;
  data: Record<string, unknown>; // the vendor's own record, as returned — not reshaped
}

export interface CmmsAdapter {
  vendor: CmmsVendor;
  // `secret` is resolved from connector.credentialRef via Key Vault by the
  // caller; null when the vendor needs none (generic_webhook).
  send(connector: CmmsConnector, workOrder: WorkOrder, secret: string | null): Promise<DispatchResult>;
  // Optional — not every vendor supports/needs a billing push (generic_webhook
  // doesn't). Absent means the outbox rejects a billing_record dispatch for
  // that vendor outright rather than silently dropping it (see outbox.ts).
  sendBilling?(connector: CmmsConnector, record: BillingRecord, secret: string | null): Promise<DispatchResult>;
  // Optional — pulls customer/location/proposal/invoice data FROM the
  // vendor for the account-sync job (cmms-account-sync.main.ts). Absent
  // means the vendor has no readable account API (or none built yet);
  // the sync job skips connectors whose adapter lacks this cleanly.
  syncAccountData?(connector: CmmsConnector, secret: string | null): Promise<CmmsAccountRecord[]>;
  // Optional — verifies an inbound webhook's signature. `secret` is the raw
  // Key-Vault-resolved connector secret (same value send()/sendBilling()
  // receive) — each adapter parses its own credential shape internally,
  // same discipline as those two methods, rather than expecting the caller
  // to know which sub-field is the signing secret. Absent means the
  // vendor's inbound_mode can never legitimately be 'webhook' (the callback
  // handler refuses to process a payload it can't authenticate — fail
  // closed, never "any payload is trusted because the vendor sent no
  // signature scheme").
  verifyWebhookSignature?(rawBody: string, headers: Record<string, string | undefined>, secret: string): boolean;
  // Optional — maps an already-verified inbound webhook payload to a work-
  // order funnel stage (work-order-lifecycle.ts's WorkOrderStage) plus the
  // vendor's own work-order id the payload refers to. Returns null for an
  // event this integration doesn't track a stage for (e.g. a vendor event
  // type outside the four funnel stages) — not every inbound event needs
  // to advance anything.
  mapWebhookEventToStage?(payload: unknown): { externalWorkOrderId: string; stage: WorkOrderStage } | null;
}
