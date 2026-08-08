import type { Partner } from '@/data/types';
import { brandFavicon as sharedBrandFavicon, useBrandTab as useSharedBrandTab } from '@shared/ui/useBrandTab';

// Thin, partner-shaped wrapper over the generic implementation in
// packages/ui/useBrandTab.ts — see that file for the favicon/title logic
// itself. This file only resolves a `Partner` record down to the generic
// `BrandTabSubject` shape and preserves this portal's existing call sites
// (`brandFavicon(partner)`, `useBrandTab(partner)`) unchanged.

/**
 * The partner's own mark, from their Control Center branding.
 *
 * `logoImg` is the uploaded image when one exists — the same field Control
 * Center's branding tab writes.
 */
export function brandFavicon(partner: Partner & { logoImg?: string }): string {
  return sharedBrandFavicon({
    name: partner.name,
    logoImg: partner.logoImg,
    brandColor: partner.primaryColor,
    logoText: partner.logoText,
    lowercaseLogo: partner.lowercaseLogo,
  });
}

export function useBrandTab(partner: Partner): void {
  useSharedBrandTab(
    {
      name: partner.name,
      logoImg: partner.logoImg,
      brandColor: partner.primaryColor,
      logoText: partner.logoText,
      lowercaseLogo: partner.lowercaseLogo,
    },
    'Partner Portal',
  );
}
