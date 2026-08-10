import { describe, it, expect, vi } from 'vitest';
import { buildBillingRecord, dispatchBillingRecord } from './billing';

describe('buildBillingRecord — PURE', () => {
  it('summarizes a period’s completed visits into a normalized billing record', () => {
    const record = buildBillingRecord({
      tenantId: 't1',
      tenantName: 'Riverside Water District',
      channelPartnerId: 'p1',
      periodStart: new Date('2026-07-01T00:00:00Z'),
      periodEnd: new Date('2026-08-01T00:00:00Z'),
      visits: [
        { ticketId: 'tk1', completedAt: new Date('2026-07-05T00:00:00Z') },
        { ticketId: 'tk2', completedAt: new Date('2026-07-20T00:00:00Z') },
      ],
    });

    expect(record.tenantId).toBe('t1');
    expect(record.channelPartnerId).toBe('p1');
    expect(record.siteId).toBeNull();
    expect(record.serviceVisitCount).toBe(2);
    expect(record.ticketIds).toEqual(['tk1', 'tk2']);
    expect(record.description).toContain('Riverside Water District');
    expect(record.description).toContain('July 2026');
    expect(record.periodStart).toBe('2026-07-01T00:00:00.000Z');
  });

  it('produces a valid record with zero visits (the caller decides whether to send it)', () => {
    const record = buildBillingRecord({
      tenantId: 't1', tenantName: 'Empty Co', channelPartnerId: 'p1',
      periodStart: new Date('2026-07-01T00:00:00Z'), periodEnd: new Date('2026-08-01T00:00:00Z'),
      visits: [],
    });
    expect(record.serviceVisitCount).toBe(0);
    expect(record.ticketIds).toEqual([]);
  });
});

describe('dispatchBillingRecord', () => {
  it('enqueues the record as a billing_record outbox row with no ticket association', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'ob-1' }] });
    const record = buildBillingRecord({
      tenantId: 't1', tenantName: 'X', channelPartnerId: 'p1',
      periodStart: new Date('2026-07-01T00:00:00Z'), periodEnd: new Date('2026-08-01T00:00:00Z'),
      visits: [{ ticketId: 'tk1', completedAt: new Date() }],
    });

    await dispatchBillingRecord({ query } as never, record, 'connector-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO cmms_dispatch_outbox'),
      ['t1', 'connector-1', null, 'billing_record', JSON.stringify(record)],
    );
  });
});
