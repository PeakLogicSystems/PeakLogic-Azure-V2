import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { serviceTitanAdapter, __resetTokenCacheForTests, type ServiceTitanCredential } from './servicetitan';
import type { CmmsConnector, WorkOrder, BillingRecord } from '../types';

const cred: ServiceTitanCredential = {
  clientId: 'client-1',
  clientSecret: 'secret-1',
  appKey: 'app-key-1',
  webhookSigningSecret: 'whsec-1',
  servicetitanTenantId: '999888777',
};

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; json?: unknown; text?: string }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
      text: async () => r.text ?? (r.json ? JSON.stringify(r.json) : ''),
    });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  __resetTokenCacheForTests();
});

const connectorFor = (tenantMappings: Record<string, unknown>): CmmsConnector => ({
  id: 'conn-1',
  vendor: 'servicetitan',
  baseUrl: null,
  credentialRef: 'kv-servicetitan-purple-standard',
  fieldMapping: { tenantMappings },
  inboundMode: 'webhook',
});

const workOrder: WorkOrder = {
  peaklogicTicketId: 'tk-1',
  tenantId: 'tenant-1',
  title: 'Critical alert: pump pressure',
  description: 'Auto-generated from alert',
  priority: 'emergency',
  source: 'automated',
  assetId: 'asset-1',
  deviceThingName: 'plx-1',
  createdAt: new Date().toISOString(),
};

describe('send() — work order dispatch', () => {
  it('fetches an OAuth token then creates a Job, returning the ServiceTitan job id as externalRef', async () => {
    const connector = connectorFor({ 'tenant-1': { servicetitanLocationId: '555', servicetitanCustomerId: '444' } });
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'tok-abc', expires_in: 900 } },
      { ok: true, json: { id: 778899 } },
    ]);

    const result = await serviceTitanAdapter.send(connector, workOrder, JSON.stringify(cred));

    expect(result).toEqual({ ok: true, externalRef: '778899' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://auth.servicetitan.io/connect/token');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.servicetitan.io/jpm/v2/tenant/999888777/jobs');
    const jobCallHeaders = fetchMock.mock.calls[1][1].headers;
    expect(jobCallHeaders.Authorization).toBe('Bearer tok-abc');
    expect(jobCallHeaders['ST-App-Key']).toBe('app-key-1');
  });

  it('uses the sandbox host when the credential is flagged sandbox', async () => {
    const connector = connectorFor({ 'tenant-1': { servicetitanLocationId: '555' } });
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'tok-abc', expires_in: 900 } },
      { ok: true, json: { id: 1 } },
    ]);
    await serviceTitanAdapter.send(connector, workOrder, JSON.stringify({ ...cred, sandbox: true }));
    expect(fetchMock.mock.calls[0][0]).toBe('https://auth-integration.servicetitan.io/connect/token');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api-integration.servicetitan.io/jpm/v2/tenant/999888777/jobs');
  });

  it('fails cleanly (never throws) when no tenant mapping exists for this connector', async () => {
    const connector = connectorFor({}); // no mapping for tenant-1
    const result = await serviceTitanAdapter.send(connector, workOrder, JSON.stringify(cred));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('tenant-1');
  });

  it('fails cleanly when the connector has no resolved credential', async () => {
    const connector = connectorFor({ 'tenant-1': { servicetitanLocationId: '555' } });
    const result = await serviceTitanAdapter.send(connector, workOrder, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no resolved credential');
  });

  it('fails cleanly when the credential secret is malformed JSON', async () => {
    const connector = connectorFor({ 'tenant-1': { servicetitanLocationId: '555' } });
    const result = await serviceTitanAdapter.send(connector, workOrder, 'not json');
    expect(result.ok).toBe(false);
  });

  it('fails cleanly when the Job-create call itself fails', async () => {
    const connector = connectorFor({ 'tenant-1': { servicetitanLocationId: '555' } });
    mockFetchSequence([
      { ok: true, json: { access_token: 'tok-abc', expires_in: 900 } },
      { ok: false, status: 500, text: 'internal error' },
    ]);
    const result = await serviceTitanAdapter.send(connector, workOrder, JSON.stringify(cred));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});

describe('sendBilling() — billing export', () => {
  const billingRecord: BillingRecord = {
    tenantId: 'tenant-1', siteId: null, siteName: null, channelPartnerId: 'partner-1',
    periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-08-01T00:00:00.000Z',
    description: 'PeakLogic remote monitoring — July 2026', serviceVisitCount: 3, ticketIds: ['tk1', 'tk2', 'tk3'], metadata: {},
  };

  it('creates an invoice and returns its id as externalRef', async () => {
    const connector = connectorFor({ 'tenant-1': { servicetitanCustomerId: '444' } });
    const fetchMock = mockFetchSequence([
      { ok: true, json: { access_token: 'tok-abc', expires_in: 900 } },
      { ok: true, json: { id: 55 } },
    ]);
    const result = await serviceTitanAdapter.sendBilling!(connector, billingRecord, JSON.stringify(cred));
    expect(result).toEqual({ ok: true, externalRef: '55' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.servicetitan.io/accounting/v2/tenant/999888777/invoices');
  });

  it('fails cleanly when no customer mapping exists for the tenant', async () => {
    const connector = connectorFor({});
    const result = await serviceTitanAdapter.sendBilling!(connector, billingRecord, JSON.stringify(cred));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('tenant-1');
  });
});

describe('syncAccountData()', () => {
  it('pulls customers/locations/proposals/invoices into normalized CmmsAccountRecords', async () => {
    const connector = connectorFor({});
    mockFetchSequence([
      { ok: true, json: { access_token: 'tok-abc', expires_in: 900 } },
      { ok: true, json: { data: [{ id: 1, name: 'Acme Water Co' }] } },        // customers
      { ok: true, json: { data: [{ id: 2, address: '123 Main St' }] } },       // locations
      { ok: true, json: { data: [{ id: 3, total: 4500 }] } },                  // estimates/proposals
      { ok: true, json: { data: [{ id: 4, total: 900 }] } },                   // invoices
    ]);

    const records = await serviceTitanAdapter.syncAccountData!(connector, JSON.stringify(cred));

    expect(records).toHaveLength(4);
    expect(records.find((r) => r.recordType === 'customer')).toMatchObject({ externalId: '1' });
    expect(records.find((r) => r.recordType === 'location')).toMatchObject({ externalId: '2' });
    expect(records.find((r) => r.recordType === 'proposal')).toMatchObject({ externalId: '3' });
    expect(records.find((r) => r.recordType === 'invoice')).toMatchObject({ externalId: '4' });
  });

  it('returns an empty array without calling the API when no secret is resolved', async () => {
    const connector = connectorFor({});
    const fetchMock = mockFetchSequence([]);
    const records = await serviceTitanAdapter.syncAccountData!(connector, null);
    expect(records).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips a record with no id rather than caching something it can’t dedupe on', async () => {
    const connector = connectorFor({});
    mockFetchSequence([
      { ok: true, json: { access_token: 'tok-abc', expires_in: 900 } },
      { ok: true, json: { data: [{ name: 'no id here' }] } },
      { ok: true, json: { data: [] } },
      { ok: true, json: { data: [] } },
      { ok: true, json: { data: [] } },
    ]);
    const records = await serviceTitanAdapter.syncAccountData!(connector, JSON.stringify(cred));
    expect(records).toEqual([]);
  });
});

describe('verifyWebhookSignature()', () => {
  const secret = JSON.stringify(cred);
  const rawBody = JSON.stringify({ jobId: 123, status: 'Completed' });

  it('accepts a correctly-signed payload', () => {
    const sig = createHmac('sha256', cred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
    expect(serviceTitanAdapter.verifyWebhookSignature!(rawBody, { 'x-servicetitan-signature': sig }, secret)).toBe(true);
  });

  it('rejects a payload with the wrong signature', () => {
    expect(serviceTitanAdapter.verifyWebhookSignature!(rawBody, { 'x-servicetitan-signature': 'deadbeef'.repeat(8) }, secret)).toBe(false);
  });

  it('rejects when the signature header is missing entirely — fails closed', () => {
    expect(serviceTitanAdapter.verifyWebhookSignature!(rawBody, {}, secret)).toBe(false);
  });

  it('rejects when the credential secret is unparseable — fails closed, never throws', () => {
    expect(serviceTitanAdapter.verifyWebhookSignature!(rawBody, { 'x-servicetitan-signature': 'anything' }, 'not json')).toBe(false);
  });

  it('rejects a signature computed against a DIFFERENT body (tamper detection)', () => {
    const sig = createHmac('sha256', cred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
    const tamperedBody = JSON.stringify({ jobId: 123, status: 'Completed', amount: 999999 });
    expect(serviceTitanAdapter.verifyWebhookSignature!(tamperedBody, { 'x-servicetitan-signature': sig }, secret)).toBe(false);
  });
});

describe('mapWebhookEventToStage()', () => {
  it('maps a recognized status to its funnel stage', () => {
    expect(serviceTitanAdapter.mapWebhookEventToStage!({ jobId: 42, status: 'Completed' }))
      .toEqual({ externalWorkOrderId: '42', stage: 'completed' });
    expect(serviceTitanAdapter.mapWebhookEventToStage!({ id: 42, jobStatus: 'InProgress' }))
      .toEqual({ externalWorkOrderId: '42', stage: 'on_site' });
  });

  it('returns null for an unrecognized status rather than guessing', () => {
    expect(serviceTitanAdapter.mapWebhookEventToStage!({ jobId: 42, status: 'SomeFutureStatus' })).toBeNull();
  });

  it('returns null for a payload missing the job id or status', () => {
    expect(serviceTitanAdapter.mapWebhookEventToStage!({ status: 'Completed' })).toBeNull();
    expect(serviceTitanAdapter.mapWebhookEventToStage!({ jobId: 42 })).toBeNull();
    expect(serviceTitanAdapter.mapWebhookEventToStage!(null)).toBeNull();
    expect(serviceTitanAdapter.mapWebhookEventToStage!('not an object')).toBeNull();
  });
});
