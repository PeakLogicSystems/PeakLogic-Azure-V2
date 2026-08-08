// Moved to packages/domain/hubs.ts — the single canonical Hub domain model,
// shared with the customer portal's read-only view of the same fleet
// register (customer-portal/src/data/hardware.ts). Re-exported verbatim so
// every existing import of '@/data/hubs' in this portal keeps working.
export * from '@shared/domain/hubs';
