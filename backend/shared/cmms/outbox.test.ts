import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextBackoffAt, hasExhaustedRetries, enqueueOutbox, claimDueOutboxRows, recordOutboxResult, attemptOutboxDispatch } from './outbox';
import type { CmmsConnector, WorkOrder } from './types';

describe('nextBackoffAt — PURE', () => {
  it('uses the backoff schedule indexed by attempt count', () => {
    const now = new Date('2026-08-09T00:00:00Z');
    expect(nextBackoffAt(0, now)).toEqual(new Date('2026-08-09T00:00:30Z')); // 30s
    expect(nextBackoffAt(1, now)).toEqual(new Date('2026-08-09T00:02:00Z')); // 120s
  });

  it('clamps to the last backoff step once attempts exceed the schedule length', () => {
    const now = new Date('2026-08-09T00:00:00Z');
    expect(nextBackoffAt(99, now)).toEqual(nextBackoffAt(5, now));
  });
});

describe('hasExhaustedRetries — PURE', () => {
  it('is false below the max attempt count and true at/above it', () => {
    expect(hasExhaustedRetries(0)).toBe(false);
    expect(hasExhaustedRetries(5)).toBe(false);
    expect(hasExhaustedRetries(6)).toBe(true);
    expect(hasExhaustedRetries(20)).toBe(true);
  });
});

function fakeClient(responses: unknown[]) {
  const query = vi.fn();
  for (const r of responses) query.mockResolvedValueOnce(r);
  return { query };
}

describe('enqueueOutbox', () => {
  it('inserts a row and returns its id', async () => {
    const client = fakeClient([{ rows: [{ id: 'ob-1' }] }]);
    const id = await enqueueOutbox(client as never, {
      tenantId: 't1', connectorId: 'c1', ticketId: 'tk1', kind: 'work_order', payload: {} as WorkOrder,
    });
    expect(id).toBe('ob-1');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO cmms_dispatch_outbox'), expect.any(Array));
  });
});

describe('claimDueOutboxRows', () => {
  it('maps snake_case DB rows to camelCase OutboxRow', async () => {
    const client = fakeClient([
      { rows: [{ id: 'ob-1', tenant_id: 't1', connector_id: 'c1', ticket_id: 'tk1', kind: 'work_order', payload: { a: 1 }, attempt_count: 2, next_attempt_at: new Date('2026-01-01') }] },
    ]);
    const rows = await claimDueOutboxRows(client as never);
    expect(rows).toEqual([
      { id: 'ob-1', tenantId: 't1', connectorId: 'c1', ticketId: 'tk1', kind: 'work_order', payload: { a: 1 }, attemptCount: 2, nextAttemptAt: new Date('2026-01-01') },
    ]);
  });
});

describe('recordOutboxResult', () => {
  it('marks the row sent with the external ref on success', async () => {
    const client = fakeClient([{ rows: [] }]);
    await recordOutboxResult(client as never, 'ob-1', 0, { ok: true, externalRef: 'job-123' });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'sent'"), ['job-123', 'ob-1']);
  });

  it('schedules a retry with backoff when attempts remain', async () => {
    const client = fakeClient([{ rows: [] }]);
    const now = new Date('2026-08-09T00:00:00Z');
    await recordOutboxResult(client as never, 'ob-1', 0, { ok: false, externalRef: null, error: 'boom' }, now);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('next_attempt_at'),
      [1, 'boom', nextBackoffAt(1, now), 'ob-1'],
    );
  });

  it('marks the row failed once retries are exhausted', async () => {
    const client = fakeClient([{ rows: [] }]);
    await recordOutboxResult(client as never, 'ob-1', 5, { ok: false, externalRef: null, error: 'still down' });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'failed'"), [6, 'still down', 'ob-1']);
  });
});

describe('attemptOutboxDispatch', () => {
  const connector: CmmsConnector = {
    id: 'c1', vendor: 'generic_webhook', baseUrl: 'https://hooks.example', credentialRef: null, fieldMapping: {}, inboundMode: 'none',
  };
  const row = { id: 'ob-1', tenantId: 't1', connectorId: 'c1', ticketId: 'tk1', kind: 'work_order' as const, payload: { peaklogicTicketId: 'tk1' } as WorkOrder, attemptCount: 0, nextAttemptAt: new Date() };

  it('records a failed attempt (never throws) when no adapter is registered for the vendor', async () => {
    const client = fakeClient([{ rows: [] }]);
    await attemptOutboxDispatch(client as never, row, { ...connector, vendor: 'maximo' });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('next_attempt_at'),
      expect.arrayContaining([expect.stringContaining('no adapter registered for vendor "maximo"')]),
    );
  });

  it('rejects a billing_record dispatch for a vendor whose adapter has no sendBilling', async () => {
    const client = fakeClient([{ rows: [] }]);
    const billingRow = { ...row, kind: 'billing_record' as const };
    await attemptOutboxDispatch(client as never, billingRow, connector); // generic_webhook has no sendBilling
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('next_attempt_at'),
      expect.arrayContaining([expect.stringContaining('does not support billing export')]),
    );
  });
});
