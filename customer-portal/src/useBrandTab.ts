import type { Customer } from '@/data';
import { brandFavicon as sharedBrandFavicon, useBrandTab as useSharedBrandTab } from '@shared/ui/useBrandTab';

// Thin, customer-shaped wrapper over the generic implementation in
// packages/ui/useBrandTab.ts — see that file for the favicon/title logic
// itself. This file only resolves a `Customer` record down to the generic
// `BrandTabSubject` shape and preserves this portal's existing call sites
// (`brandFavicon(customer)`, `useBrandTab(customer)`) unchanged.

export function brandFavicon(c: Customer): string {
  return sharedBrandFavicon({ name: c.name, logoImg: c.logoImg, brandColor: c.brand, logoText: c.logoText || c.name.slice(0, 1) });
}

export function useBrandTab(customer: Customer): void {
  useSharedBrandTab(
    { name: customer.name, logoImg: customer.logoImg, brandColor: customer.brand, logoText: customer.logoText || customer.name.slice(0, 1) },
    'Customer Portal',
  );
}
