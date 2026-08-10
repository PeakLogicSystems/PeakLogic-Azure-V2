import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CmmsAdapter, CmmsConnector, WorkOrder, DispatchResult, BillingRecord, CmmsAccountRecord } from '../types';
import type { WorkOrderStage } from '../work-order-lifecycle';

// ServiceTitan adapter — adapter #2 (reporting-and-kpi-design.md §7 open
// decision #2, resolved 2026-08-09: first real CMMS vendor named by an
// actual partner, The Purple Standard). Named-need discipline, same as
// generic_webhook was adapter #1: this is not speculative vendor coverage,
// it's the specific system a real partner runs.
//
// Sources consulted (2026-08-09, live web lookup — this project's
// established "verified, not guessed" discipline for external-vendor
// integration code, e.g. iot.bicep/apim.bicep's own "Sources consulted"
// header blocks):
//   - github.com/api-evangelist/servicetitan — full module/base-URL list
//     (crm, jpm, sales, accounting, equipmentsystems, webhooks, ... all
//     versioned https://api.servicetitan.io/{module}/v2/tenant/{tenant}/...)
//   - help.servicetitan.com/how-to/get-started-with-apidev-portal-v2 —
//     OAuth2 client-credentials flow, ST-App-Key header requirement,
//     production base https://api.servicetitan.io vs. sandbox
//     https://api-integration.servicetitan.io
//   - rollout.com/integration-guides/servicetitan/api-essentials — the
//     exact token endpoints (auth.servicetitan.io/connect/token prod,
//     auth-integration.servicetitan.io/connect/token sandbox),
//     confirmed 900s token TTL, confirmed NO refresh token is issued
//     (client_credentials is re-requested on expiry, not refreshed)
//   - rollout.com/integration-guides/servicetitan/quick-guide-to-
//     implementing-webhooks-in-servicetitan — x-servicetitan-signature
//     header, HMAC-SHA256 over the JSON payload
//   - developer-next.servicetitan.io/docs/webhooks/ (via search summary,
//     page itself is client-rendered and not fetchable in this
//     environment) — V2 Webhooks platform exists, HMAC-verified,
//     10s/30s/60s/300s vendor-side retry backoff on a non-2xx response
//
// GENUINELY UNVERIFIED, DISCLOSED HONESTLY — NOT GUESSED PAST WHAT WAS
// CONFIRMED ABOVE: ServiceTitan's official developer portal
// (developer.servicetitan.io) renders its actual request/response JSON
// schemas client-side; this environment's fetch tooling could not extract
// them past the module/base-URL/auth level confirmed above. Specifically
// unverified, each flagged again at its point of use below:
//   1. The exact Job-create payload shape (buildJobPayload) — field names
//      are this adapter's best reasonable inference from the confirmed JPM
//      module, not a confirmed schema. Real ServiceTitan Jobs also require
//      jobTypeId/businessUnitId, deliberately left out here rather than
//      guessed — see buildJobPayload's own comment.
//   2. The exact Invoice-create payload shape (sendBilling) — same
//      category of inference, plus a real open question (does invoice
//      creation require a non-zero unit price?) this integration cannot
//      answer without a partner's live sandbox.
//   3. The webhook signature digest ENCODING (hex vs. base64) — the source
//      above didn't specify; this defaults to hex (verifyWebhookSignature).
//   4. Pagination beyond one page in syncAccountData — real ServiceTitan
//      V2 list endpoints paginate; this pulls one page (200 records) and
//      does not yet follow a continuation token, since the exact
//      pagination field names are unconfirmed.
//   5. The V2 webhook envelope shape and Job-status vocabulary
//      (mapWebhookEventToStage) — jobId/status field names and the
//      Scheduled/Dispatched/InProgress/Completed values are this
//      adapter's best reasonable inference, not a confirmed schema.
//      work-order-lifecycle.ts's advanceWorkOrder() tolerates a partial/
//      wrong mapping gracefully (an unrecognized status just doesn't
//      advance anything) rather than corrupting the funnel, but the exact
//      strings need a real sandbox account to confirm.
// Each of these is the single highest-priority thing to verify first
// against a real ServiceTitan developer sandbox account before go-live —
// the same disclosed-uncertainty posture api.bicep's own "SINGLE
// UNVERIFIED ASSUMPTION" header comment already establishes for this
// codebase, applied here to an external vendor instead of an Azure SKU.

const PROD_API_BASE = 'https://api.servicetitan.io';
const SANDBOX_API_BASE = 'https://api-integration.servicetitan.io';
const PROD_AUTH_URL = 'https://auth.servicetitan.io/connect/token';
const SANDBOX_AUTH_URL = 'https://auth-integration.servicetitan.io/connect/token';

/**
 * The JSON shape stored behind a servicetitan cmms_connectors.credential_ref
 * Key Vault secret. servicetitanTenantId is ServiceTitan's OWN tenant/
 * account identifier (every V2 API path is /{module}/v2/tenant/{this}/...)
 * — unrelated to and never confused with a PeakLogic tenants.id.
 */
export interface ServiceTitanCredential {
  clientId: string;
  clientSecret: string;
  appKey: string;
  webhookSigningSecret: string;
  servicetitanTenantId: string;
  sandbox?: boolean;
}

function parseCredential(secret: string): ServiceTitanCredential {
  let parsed: Partial<ServiceTitanCredential>;
  try {
    parsed = JSON.parse(secret) as Partial<ServiceTitanCredential>;
  } catch {
    throw new Error('ServiceTitan credential secret is not valid JSON');
  }
  for (const field of ['clientId', 'clientSecret', 'appKey', 'webhookSigningSecret', 'servicetitanTenantId'] as const) {
    if (!parsed[field]) throw new Error(`ServiceTitan credential missing required field "${field}"`);
  }
  return parsed as ServiceTitanCredential;
}

// 900s TTL, no refresh token (both confirmed) — an "expired" token is just
// re-requested via client_credentials again. Keyed by clientId since one
// warm Function instance may hold connectors for more than one partner
// over its lifetime (Multi-Tenant Architecture §2.1a's warm-reuse
// precondition, same reasoning db.ts's pool singleton already relies on).
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();

async function getAccessToken(cred: ServiceTitanCredential): Promise<string> {
  const cached = tokenCache.get(cred.clientId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.accessToken; // 30s clock-skew margin

  const res = await fetch(cred.sandbox ? SANDBOX_AUTH_URL : PROD_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`ServiceTitan OAuth token request failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  const token: CachedToken = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  tokenCache.set(cred.clientId, token);
  return token.accessToken;
}

async function callServiceTitan(
  cred: ServiceTitanCredential,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<any> {
  const token = await getAccessToken(cred);
  const base = cred.sandbox ? SANDBOX_API_BASE : PROD_API_BASE;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': cred.appKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ServiceTitan API ${method} ${path} failed: ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Per-tenant ServiceTitan Customer/Location mapping — lives inside the
 * connector's own field_mapping JSONB (docs/data-model.sql: "onboarding a
 * partner's CMMS is config, not code"), not a new column, since a single
 * partner-owned connector serves every tenant attributed to that partner
 * and each needs its own mapping. Populated by an admin (via the
 * cmms-connectors route) after reviewing cmms_account_records — the sync
 * job (cmms-account-sync.main.ts) is what makes a real ServiceTitan
 * customer/location visible to map against in the first place.
 */
interface TenantMapping {
  servicetitanCustomerId?: string;
  servicetitanLocationId?: string;
}
function resolveTenantMapping(connector: CmmsConnector, tenantId: string): TenantMapping {
  const raw = connector.fieldMapping as { tenantMappings?: Record<string, TenantMapping> } | undefined;
  return raw?.tenantMappings?.[tenantId] ?? {};
}

function mapPriority(priority: string): string {
  // Unverified against ServiceTitan's own Job-priority enum — Urgent/High/
  // Normal/Low is a common FSM-industry vocabulary, not confirmed as this
  // vendor's exact values. A partner's field_mapping can override once
  // confirmed; this is the reasonable default in the meantime.
  switch (priority) {
    case 'emergency': return 'Urgent';
    case 'high': return 'High';
    case 'low': return 'Low';
    default: return 'Normal';
  }
}

async function send(connector: CmmsConnector, workOrder: WorkOrder, secret: string | null): Promise<DispatchResult> {
  if (!secret) return { ok: false, externalRef: null, error: 'servicetitan connector has no resolved credential' };
  let cred: ServiceTitanCredential;
  try {
    cred = parseCredential(secret);
  } catch (err) {
    return { ok: false, externalRef: null, error: err instanceof Error ? err.message : String(err) };
  }

  const mapping = resolveTenantMapping(connector, workOrder.tenantId);
  if (!mapping.servicetitanLocationId) {
    return {
      ok: false,
      externalRef: null,
      error: `No ServiceTitan location mapped for tenant ${workOrder.tenantId} — set connector.field_mapping.tenantMappings["${workOrder.tenantId}"].servicetitanLocationId`,
    };
  }

  try {
    const job = await callServiceTitan(cred, 'POST', `/jpm/v2/tenant/${cred.servicetitanTenantId}/jobs`, buildJobPayload(workOrder, mapping));
    return { ok: true, externalRef: job?.id != null ? String(job.id) : null };
  } catch (err) {
    return { ok: false, externalRef: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildJobPayload(workOrder: WorkOrder, mapping: TenantMapping): Record<string, unknown> {
  // DISCLOSED UNVERIFIED SCHEMA — see this file's header, item 1. A real
  // ServiceTitan Job create call also requires jobTypeId and
  // businessUnitId; deliberately left out here rather than guessed —
  // field_mapping.tenantMappings is where a real integration supplies
  // them once a partner's actual Job Type/Business Unit ids are known.
  return {
    locationId: Number(mapping.servicetitanLocationId),
    ...(mapping.servicetitanCustomerId ? { customerId: Number(mapping.servicetitanCustomerId) } : {}),
    summary: workOrder.title,
    priority: mapPriority(workOrder.priority),
    externalId: workOrder.peaklogicTicketId,
    notes: workOrder.description,
  };
}

async function sendBilling(connector: CmmsConnector, record: BillingRecord, secret: string | null): Promise<DispatchResult> {
  if (!secret) return { ok: false, externalRef: null, error: 'servicetitan connector has no resolved credential' };
  let cred: ServiceTitanCredential;
  try {
    cred = parseCredential(secret);
  } catch (err) {
    return { ok: false, externalRef: null, error: err instanceof Error ? err.message : String(err) };
  }

  const mapping = resolveTenantMapping(connector, record.tenantId);
  if (!mapping.servicetitanCustomerId) {
    return {
      ok: false,
      externalRef: null,
      error: `No ServiceTitan customer mapped for tenant ${record.tenantId} — set connector.field_mapping.tenantMappings["${record.tenantId}"].servicetitanCustomerId`,
    };
  }

  try {
    // DISCLOSED UNVERIFIED SCHEMA — see this file's header, item 2. Posts a
    // standalone invoice representing PeakLogic's own service period
    // rather than appending a line item to an existing partner-created
    // invoice (this integration has no way to know that invoice's id) — a
    // partner reconciling in ServiceTitan sees a distinct, clearly-labeled
    // PeakLogic line, not a silent edit to their own work.
    const invoice = await callServiceTitan(cred, 'POST', `/accounting/v2/tenant/${cred.servicetitanTenantId}/invoices`, {
      customerId: Number(mapping.servicetitanCustomerId),
      ...(mapping.servicetitanLocationId ? { locationId: Number(mapping.servicetitanLocationId) } : {}),
      summary: record.description,
      externalId: `peaklogic-billing-${record.tenantId}-${record.periodStart}`,
      items: [
        {
          description: record.description,
          quantity: 1,
          // No unit price: PeakLogic reports SERVICE DELIVERED, not a
          // dollar amount — pricing is the partner's own commercial
          // decision, made in ServiceTitan, not dictated by this
          // integration. Real go-live needs the partner to confirm whether
          // invoice creation requires a non-zero price; if so,
          // field_mapping supplies it per-connector.
        },
      ],
    });
    return { ok: true, externalRef: invoice?.id != null ? String(invoice.id) : null };
  } catch (err) {
    return { ok: false, externalRef: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function syncAccountData(connector: CmmsConnector, secret: string | null): Promise<CmmsAccountRecord[]> {
  if (!secret) return [];
  const cred = parseCredential(secret);
  const t = cred.servicetitanTenantId;
  const records: CmmsAccountRecord[] = [];

  // DISCLOSED UNVERIFIED SCHEMA — see this file's header, item 4. One page
  // (200 records) per entity type; a real partner's full customer/proposal/
  // invoice history is not fully pulled by this until pagination is added.
  const pulls: Array<[CmmsAccountRecord['recordType'], string]> = [
    ['customer', `/crm/v2/tenant/${t}/customers?pageSize=200`],
    ['location', `/crm/v2/tenant/${t}/locations?pageSize=200`],
    ['proposal', `/sales/v2/tenant/${t}/estimates?pageSize=200`],
    ['invoice', `/accounting/v2/tenant/${t}/invoices?pageSize=200`],
  ];
  for (const [recordType, path] of pulls) {
    const page = await callServiceTitan(cred, 'GET', path);
    for (const item of (page?.data ?? []) as Array<Record<string, unknown>>) {
      if (item.id == null) continue; // never cache a record we can't dedupe on
      records.push({ recordType, externalId: String(item.id), data: item });
    }
  }
  return records;
}

function verifyWebhookSignature(rawBody: string, headers: Record<string, string | undefined>, secret: string): boolean {
  // `secret` is the raw Key-Vault-resolved connector secret (the same JSON
  // blob send()/sendBilling() receive) — parsed here exactly like those two,
  // not pre-extracted by the caller.
  let cred: ServiceTitanCredential;
  try {
    cred = parseCredential(secret);
  } catch {
    return false; // an unparseable credential can never validate a signature — fail closed
  }

  // Header name and HMAC-SHA256-over-the-raw-JSON-body are confirmed (see
  // this file's header); the digest ENCODING (hex vs. base64) is not —
  // defaults to hex, item 3 above.
  const provided = headers['x-servicetitan-signature'] ?? headers['X-ServiceTitan-Signature'];
  if (!provided) return false;

  const expected = createHmac('sha256', cred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
  if (provided.length !== expected.length) return false;
  // Constant-time comparison — same discipline as apim-guard.ts /
  // ops/cost-killswitch's auth.ts: this endpoint's sole authentication is
  // this signature, so even a timing side-channel is worth closing.
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

// DISCLOSED UNVERIFIED MAPPING — see this file's header. ServiceTitan's
// exact Job-status vocabulary is not confirmed against a live account;
// these are the common, industry-typical FSM status strings (matching the
// same reasonable-inference posture as mapPriority above). A partial
// mapping is fine (work-order-lifecycle.ts's advanceWorkOrder() is
// designed for exactly this — a stage this adapter doesn't recognize
// simply doesn't advance anything, rather than erroring).
const STATUS_TO_STAGE: Record<string, WorkOrderStage> = {
  Scheduled: 'accepted',
  Dispatched: 'accepted',
  InProgress: 'on_site',
  Completed: 'completed',
};

function mapWebhookEventToStage(payload: unknown): { externalWorkOrderId: string; stage: WorkOrderStage } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  // V2 webhook envelopes carry the changed entity under a vendor-specific
  // key; jobId/id and status/jobStatus are this adapter's best reasonable
  // inference from the confirmed JPM Job resource shape, not a confirmed
  // webhook envelope schema (this file's header, unconfirmed items).
  const jobId = p.jobId ?? p.id;
  const status = p.status ?? p.jobStatus;
  if (jobId == null || typeof status !== 'string') return null;

  const stage = STATUS_TO_STAGE[status];
  if (!stage) return null;

  return { externalWorkOrderId: String(jobId), stage };
}

/** Test-only — mirrors db.ts's __resetPoolForTests() / credentials.ts's __resetCredentialCacheForTests() naming convention. */
export function __resetTokenCacheForTests(): void {
  tokenCache.clear();
}

export const serviceTitanAdapter: CmmsAdapter = {
  vendor: 'servicetitan',
  send,
  sendBilling,
  syncAccountData,
  verifyWebhookSignature,
  mapWebhookEventToStage,
};
