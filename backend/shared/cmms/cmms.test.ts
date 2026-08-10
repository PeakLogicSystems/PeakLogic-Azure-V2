import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the SSRF-guarded webhook poster so the generic_webhook adapter can be
// tested without real DNS/fetch. The adapter's job is the mapping + result
// contract; postWebhook's own guard is covered by webhook.test.ts.
vi.mock('../webhook', () => ({ postWebhook: vi.fn(async () => undefined) }));

import { postWebhook } from '../webhook';
import { getAdapter, supportedVendors } from './adapters';
import { genericWebhookAdapter } from './adapters/generic-webhook';
import { buildWorkOrder, selectConnector, resolveConnector } from './dispatch';
import type { CmmsConnector } from './types';

const mockedPost = vi.mocked(postWebhook);

beforeEach(() => {
  mockedPost.mockReset();
  mockedPost.mockResolvedValue(undefined);
});

describe('buildWorkOrder', () => {
  it('maps a ticket to a normalized work order, defaulting source to automated', () => {
    const wo = buildWorkOrder({
      id: 'tkt-1', tenantId: 'tenant-1', title: 'Critical alert', description: 'pump down',
      priority: 'emergency', assetId: 'asset-1', deviceThingName: 'plx-1',
    });
    expect(wo.peaklogicTicketId).toBe('tkt-1');
    expect(wo.source).toBe('automated');
    expect(wo.assetId).toBe('asset-1');
    expect(wo.deviceThingName).toBe('plx-1');
    expect(typeof wo.createdAt).toBe('string');
  });
});

describe('selectConnector — precedence', () => {
  const partner: CmmsConnector = {
    id: 'c1', vendor: 'upkeep', baseUrl: 'https://api.upkeep.example',
    credentialRef: 'kv-upkeep', fieldMapping: {}, inboundMode: 'webhook',
  };

  it('prefers a configured connector over a legacy webhook', () => {
    expect(selectConnector(partner, 'https://legacy.example')).toBe(partner);
  });

  it('falls back to a synthesized generic_webhook from a legacy URL', () => {
    const c = selectConnector(null, 'https://legacy.example');
    expect(c).not.toBeNull();
    expect(c!.vendor).toBe('generic_webhook');
    expect(c!.baseUrl).toBe('https://legacy.example');
    expect(c!.id).toBeNull(); // synthesized, not a persisted row
  });

  it('returns null when there is no connector and no legacy URL', () => {
    expect(selectConnector(null, null)).toBeNull();
  });
});

describe('adapter registry', () => {
  it('resolves the generic_webhook adapter and reports it supported', () => {
    expect(getAdapter('generic_webhook')).toBe(genericWebhookAdapter);
    expect(supportedVendors()).toContain('generic_webhook');
  });

  it('resolves the servicetitan adapter (adapter #2, added 2026-08-09) and reports it supported', () => {
    expect(getAdapter('servicetitan')).not.toBeNull();
    expect(getAdapter('servicetitan')!.vendor).toBe('servicetitan');
    expect(supportedVendors()).toContain('servicetitan');
  });

  it('returns null for a vendor with no adapter registered', () => {
    expect(getAdapter('maximo')).toBeNull();
  });
});

describe('genericWebhookAdapter.send', () => {
  const connector: CmmsConnector = {
    id: null, vendor: 'generic_webhook', baseUrl: 'https://hooks.example/wo',
    credentialRef: null, fieldMapping: {}, inboundMode: 'none',
  };
  const wo = buildWorkOrder({ id: 'tkt-9', tenantId: 'tenant-9', title: 't', description: 'd', priority: 'emergency', assetId: null, deviceThingName: 'thing-9' });

  it('posts the work order and reports ok (no synchronous external ref)', async () => {
    const res = await genericWebhookAdapter.send(connector, wo, null);
    expect(res.ok).toBe(true);
    expect(res.externalRef).toBeNull();
    expect(mockedPost).toHaveBeenCalledWith(connector.baseUrl, { event: 'ticket.created', ticket: wo });
  });

  it('returns ok:false with the error when the post throws (never throws itself)', async () => {
    mockedPost.mockRejectedValueOnce(new Error('SSRF blocked'));
    const res = await genericWebhookAdapter.send(connector, wo, null);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('SSRF blocked');
  });

  it('fails cleanly when the connector has no base URL', async () => {
    const res = await genericWebhookAdapter.send({ ...connector, baseUrl: null }, wo, null);
    expect(res.ok).toBe(false);
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('resolveConnector — DB wiring (fake client)', () => {
  it('uses the attributed partner’s enabled connector when present', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ channel_partner_id: 'p1', settings: {} }] })      // tenant
      .mockResolvedValueOnce({ rows: [{ id: 'c1', vendor: 'generic_webhook', base_url: 'https://p.example', credential_ref: null, field_mapping: {}, inbound_mode: 'webhook' }] }); // connector
    const { connector, channelPartnerId } = await resolveConnector({ query } as never, 't1');
    expect(channelPartnerId).toBe('p1');
    expect(connector!.id).toBe('c1');
    expect(connector!.baseUrl).toBe('https://p.example');
  });

  it('falls back to the legacy tenant webhook_url when the partner has no connector', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ channel_partner_id: 'p1', settings: { webhook_url: 'https://legacy.example' } }] })
      .mockResolvedValueOnce({ rows: [] }); // no connector row
    const { connector } = await resolveConnector({ query } as never, 't1');
    expect(connector!.vendor).toBe('generic_webhook');
    expect(connector!.baseUrl).toBe('https://legacy.example');
    expect(connector!.id).toBeNull();
  });

  it('returns null connector when there is neither a connector nor a legacy URL', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ channel_partner_id: null, settings: {} }] });
    const { connector } = await resolveConnector({ query } as never, 't1');
    expect(connector).toBeNull();
  });
});
