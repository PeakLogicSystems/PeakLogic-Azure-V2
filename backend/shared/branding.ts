import type { BrandingInfo } from './types';

/**
 * Resolves what brand a tenant's post-login estate view should show
 * (whitelabel-estate-branding-design.md, artifact #35). Pure — no I/O; the
 * caller resolves each site's EFFECTIVE channel partner (COALESCE(site
 * override, tenant default) — see channel_partner_can_read_site() in
 * docs/data-model.sql for the same resolution applied to RLS) and looks up
 * each partner's group, then hands both to this function.
 *
 * Theming is POST-LOGIN ONLY (user decision, 2026-07-21) — this never runs
 * before authentication, so it doesn't need to be reachable from an
 * unauthenticated endpoint or resolve anything from a request's domain.
 */

export interface EstatePartnerRef {
  id: string;
  name: string;
  groupId: string | null;
  branding: BrandingInfo | null;
}

export interface EstateGroupRef {
  id: string;
  name: string;
  branding: BrandingInfo | null;
}

export type EstateBranding =
  | { kind: 'none' } // no site is partner-attributed, OR mixed partners with no shared group — honest fallback to plain PeakLogic
  | { kind: 'partner'; partner: EstatePartnerRef } // every attributed site resolves to the same single partner
  | { kind: 'group'; group: EstateGroupRef }; // sites span multiple partners, all siblings under one group

/**
 * `sitePartners` — one entry per site in the tenant's estate, already
 * resolved to that site's EFFECTIVE partner (or null if that site has no
 * partner attribution at all, e.g. a direct PeakLogic customer). `groups` —
 * a lookup of group branding by group id, for the case where multiple
 * distinct partners share one group.
 */
export function resolveEstateBranding(
  sitePartners: Array<EstatePartnerRef | null>,
  groups: Record<string, EstateGroupRef>,
): EstateBranding {
  const distinctById = new Map<string, EstatePartnerRef>();
  for (const p of sitePartners) {
    if (p) distinctById.set(p.id, p);
  }
  const distinct = [...distinctById.values()];

  if (distinct.length === 0) return { kind: 'none' };
  if (distinct.length === 1) return { kind: 'partner', partner: distinct[0] };

  // Multiple distinct partners — only resolve to a group brand if EVERY one
  // of them shares the exact same non-null group id. A single ungrouped
  // partner mixed in, or partners from two different groups, both fall
  // through to 'none' — showing an arbitrary partner's brand, or a wrong
  // group's brand, would be worse than the honest plain-PeakLogic default.
  const firstGroupId = distinct[0].groupId;
  const allShareGroup = firstGroupId !== null && distinct.every((p) => p.groupId === firstGroupId);

  if (allShareGroup) {
    const group = groups[firstGroupId!];
    if (group) return { kind: 'group', group };
  }

  return { kind: 'none' };
}
