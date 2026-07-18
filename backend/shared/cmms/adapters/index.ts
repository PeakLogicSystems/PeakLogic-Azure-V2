import type { CmmsAdapter, CmmsVendor } from '../types';
import { genericWebhookAdapter } from './generic-webhook';

// The adapter registry. Vendor adapters beyond generic_webhook are added here
// as real partners name their CMMS (reporting-and-kpi-design.md §6, §7 — the
// "design against a named need" discipline). Until then, generic_webhook is
// the universal fallback.
const ADAPTERS: Partial<Record<CmmsVendor, CmmsAdapter>> = {
  generic_webhook: genericWebhookAdapter,
};

export function getAdapter(vendor: CmmsVendor): CmmsAdapter | null {
  return ADAPTERS[vendor] ?? null;
}

export function supportedVendors(): CmmsVendor[] {
  return Object.keys(ADAPTERS) as CmmsVendor[];
}
