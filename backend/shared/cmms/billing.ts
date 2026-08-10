import type { PoolClient } from 'pg';
import type { BillingRecord } from './types';
import { enqueueOutbox } from './outbox';

// "Send any necessary services information about the tenant to the system
// for billing" (2026-08-09) — a normalized, period-based summary of
// billable services, dispatched through the SAME durable outbox as work
// orders (kind='billing_record'), to whichever vendor adapter supports it
// (ServiceTitan does — adapters/servicetitan.ts's sendBilling()).

type Queryable = Pick<PoolClient, 'query'>;

export interface BillingPeriodInput {
  tenantId: string;
  tenantName: string;
  channelPartnerId: string;
  periodStart: Date;
  periodEnd: Date;
  visits: Array<{ ticketId: string; completedAt: Date | null }>;
}

/** PURE — assembles the normalized record from a period's completed service visits. */
export function buildBillingRecord(input: BillingPeriodInput): BillingRecord {
  const monthLabel = input.periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    tenantId: input.tenantId,
    // Tenant-wide, not per-site — the common case (one CMMS customer
    // account per PeakLogic tenant). Per-site billing is a real, later
    // extension if a partner ever needs it, not built speculatively now.
    siteId: null,
    siteName: null,
    channelPartnerId: input.channelPartnerId,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    description: `PeakLogic remote monitoring & service coordination — ${input.tenantName} — ${monthLabel}`,
    serviceVisitCount: input.visits.length,
    ticketIds: input.visits.map((v) => v.ticketId),
    metadata: {},
  };
}

export async function dispatchBillingRecord(client: Queryable, record: BillingRecord, connectorId: string): Promise<void> {
  await enqueueOutbox(client, {
    tenantId: record.tenantId,
    connectorId,
    ticketId: null, // a billing_record summarizes a period, not one ticket
    kind: 'billing_record',
    payload: record,
  });
}
