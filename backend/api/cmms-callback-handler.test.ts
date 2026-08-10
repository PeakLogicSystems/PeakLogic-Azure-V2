import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../shared/cmms/credentials', () => ({ resolveConnectorSecret: vi.fn() }));
vi.mock('../shared/cmms/work-order-lifecycle-handler', () => ({ advanceWorkOrderStage: vi.fn() }));

import { resolveConnectorSecret } from '../shared/cmms/credentials';
import { advanceWorkOrderStage } from '../shared/cmms/work-order-lifecycle-handler';
import { handleCmmsCallback } from './cmms-callback-handler';

const mockedResolveSecret = vi.mocked(resolveConnectorSecret);
const mockedAdvance = vi.mocked(advanceWorkOrderStage);

const servicetitanCred = {
  clientId: 'c', clientSecret: 's', appKey: 'a', webhookSigningSecret: 'whsec', servicetitanTenantId: '123',
};

function fakePool(connectorRow: unknown, extraResponses: unknown[] = []) {
  const query = vi.fn()
    .mockResolvedValueOnce(undefined) // BEGIN
    .mockResolvedValueOnce(undefined) // set_config ingest_context
    .mockResolvedValueOnce({ rows: connectorRow ? [connectorRow] : [] }); // connector lookup
  for (const r of extraResponses) query.mockResolvedValueOnce(r);
  const client = { query, release: vi.fn() };
  return { pool: { connect: vi.fn().mockResolvedValue(client) }, client };
}

const genericConnectorRow = {
  id: 'conn-1', vendor: 'generic_webhook', base_url: 'https://hooks.example', credential_ref: null,
  field_mapping: {}, inbound_mode: 'webhook',
};
const servicetitanConnectorRow = {
  id: 'conn-2', vendor: 'servicetitan', base_url: null, credential_ref: 'kv-st',
  field_mapping: {}, inbound_mode: 'webhook',
};

beforeEach(() => {
  mockedResolveSecret.mockReset();
  mockedAdvance.mockReset();
});

describe('handleCmmsCallback', () => {
  it('returns unknown_connector when the connector does not exist or is disabled', async () => {
    const { pool } = fakePool(null);
    const result = await handleCmmsCallback(pool as never, 'missing', '{}', {});
    expect(result.status).toBe('unknown_connector');
  });

  it('returns unauthorized when the connector is not configured for webhook inbound', async () => {
    const { pool } = fakePool({ ...genericConnectorRow, inbound_mode: 'poll' });
    const result = await handleCmmsCallback(pool as never, 'conn-1', '{}', {});
    expect(result.status).toBe('unauthorized');
    expect(result.detail).toContain('not configured for webhook inbound');
  });

  it('returns unauthorized when the adapter does not support inbound webhooks at all (generic_webhook)', async () => {
    const { pool } = fakePool(genericConnectorRow);
    const result = await handleCmmsCallback(pool as never, 'conn-1', '{}', {});
    expect(result.status).toBe('unauthorized');
    expect(result.detail).toContain('does not support inbound webhooks');
  });

  it('returns unauthorized when the connector has no credential configured', async () => {
    const { pool } = fakePool({ ...servicetitanConnectorRow, credential_ref: null });
    const result = await handleCmmsCallback(pool as never, 'conn-2', '{}', {});
    expect(result.status).toBe('unauthorized');
    expect(result.detail).toContain('no credential configured');
  });

  it('returns unauthorized when signature verification fails', async () => {
    mockedResolveSecret.mockResolvedValue(JSON.stringify(servicetitanCred));
    const { pool } = fakePool(servicetitanConnectorRow);
    const result = await handleCmmsCallback(pool as never, 'conn-2', '{"jobId":1,"status":"Completed"}', {
      'x-servicetitan-signature': 'wrong',
    });
    expect(result.status).toBe('unauthorized');
    expect(result.detail).toBe('signature verification failed');
  });

  it('returns unrecognized_event when the (verified) payload is not valid JSON', async () => {
    mockedResolveSecret.mockResolvedValue(JSON.stringify(servicetitanCred));
    const rawBody = 'not json';
    const sig = createHmac('sha256', servicetitanCred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
    const { pool } = fakePool(servicetitanConnectorRow);
    const result = await handleCmmsCallback(pool as never, 'conn-2', rawBody, { 'x-servicetitan-signature': sig });
    expect(result.status).toBe('unrecognized_event');
  });

  it('returns unrecognized_event when the adapter recognizes the signature but not the event', async () => {
    mockedResolveSecret.mockResolvedValue(JSON.stringify(servicetitanCred));
    const rawBody = JSON.stringify({ jobId: 1, status: 'SomeNewStatus' });
    const sig = createHmac('sha256', servicetitanCred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
    const { pool } = fakePool(servicetitanConnectorRow);
    const result = await handleCmmsCallback(pool as never, 'conn-2', rawBody, { 'x-servicetitan-signature': sig });
    expect(result.status).toBe('unrecognized_event');
  });

  it('returns unknown_ticket when no service_ticket matches (connector, external work-order id)', async () => {
    mockedResolveSecret.mockResolvedValue(JSON.stringify(servicetitanCred));
    const rawBody = JSON.stringify({ jobId: 999, status: 'Completed' });
    const sig = createHmac('sha256', servicetitanCred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
    const { pool } = fakePool(servicetitanConnectorRow, [
      undefined, // set_config cmms_callback_context
      { rows: [] }, // ticket lookup — none found
    ]);
    const result = await handleCmmsCallback(pool as never, 'conn-2', rawBody, { 'x-servicetitan-signature': sig });
    expect(result.status).toBe('unknown_ticket');
  });

  it('advances the funnel and returns "advanced" when a matching ticket is found', async () => {
    mockedResolveSecret.mockResolvedValue(JSON.stringify(servicetitanCred));
    mockedAdvance.mockResolvedValue({ advanced: true, visitCreated: true });
    const rawBody = JSON.stringify({ jobId: 42, status: 'Completed' });
    const sig = createHmac('sha256', servicetitanCred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
    const { pool, client } = fakePool(servicetitanConnectorRow, [
      undefined, // set_config cmms_callback_context
      { rows: [{ id: 'tk-1', tenant_id: 'tenant-1' }] }, // ticket lookup
      undefined, // set_config current_tenant_id
    ]);
    const result = await handleCmmsCallback(pool as never, 'conn-2', rawBody, { 'x-servicetitan-signature': sig });
    expect(result.status).toBe('advanced');
    expect(mockedAdvance).toHaveBeenCalledWith(client, 'tenant-1', 'tk-1', 'completed');
  });

  it('returns "noop" when the ticket has already reached (or passed) the mapped stage', async () => {
    mockedResolveSecret.mockResolvedValue(JSON.stringify(servicetitanCred));
    mockedAdvance.mockResolvedValue({ advanced: false, visitCreated: false });
    const rawBody = JSON.stringify({ jobId: 42, status: 'Completed' });
    const sig = createHmac('sha256', servicetitanCred.webhookSigningSecret).update(rawBody, 'utf8').digest('hex');
    const { pool } = fakePool(servicetitanConnectorRow, [
      undefined,
      { rows: [{ id: 'tk-1', tenant_id: 'tenant-1' }] },
      undefined,
    ]);
    const result = await handleCmmsCallback(pool as never, 'conn-2', rawBody, { 'x-servicetitan-signature': sig });
    expect(result.status).toBe('noop');
  });

  it('always releases the client, even on the unauthorized/rejected paths', async () => {
    const { pool, client } = fakePool(null);
    await handleCmmsCallback(pool as never, 'missing', '{}', {});
    expect(client.release).toHaveBeenCalled();
  });
});
