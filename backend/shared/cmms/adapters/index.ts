import type { CmmsAdapter, CmmsVendor } from '../types';
import { genericWebhookAdapter } from './generic-webhook';
import { serviceTitanAdapter } from './servicetitan';

// The adapter registry. Vendor adapters beyond generic_webhook are added here
// as real partners name their CMMS (reporting-and-kpi-design.md §6, §7 — the
// "design against a named need" discipline). servicetitan is adapter #2,
// added 2026-08-09 — The Purple Standard is a real, named partner running
// ServiceTitan. Until a vendor is named, generic_webhook is the fallback.
const ADAPTERS: Partial<Record<CmmsVendor, CmmsAdapter>> = {
  generic_webhook: genericWebhookAdapter,
  servicetitan: serviceTitanAdapter,
};

export function getAdapter(vendor: CmmsVendor): CmmsAdapter | null {
  return ADAPTERS[vendor] ?? null;
}

export function supportedVendors(): CmmsVendor[] {
  return Object.keys(ADAPTERS) as CmmsVendor[];
}
