import { describe, it, expect } from 'vitest';
import { resolveEstateBranding, type EstatePartnerRef, type EstateGroupRef } from './branding';

const wtrDr: EstatePartnerRef = {
  id: 'wtr-dr', name: 'WTR DR', groupId: 'purple-standard',
  branding: { logo_url: null, primary_color: '#0EA5E9', secondary_color: '#0C4A6E', tagline: null },
};
const aceSeptic: EstatePartnerRef = {
  id: 'ace-septic', name: 'ACE Septic & Waste', groupId: 'purple-standard',
  branding: { logo_url: null, primary_color: '#7C3AED', secondary_color: '#4C1D95', tagline: null },
};
const rodriguesRoofing: EstatePartnerRef = {
  id: 'rodrigues-roofing', name: 'Rodrigues Roofing LLC', groupId: null, // not in any group
  branding: null,
};
const someOtherGroupPartner: EstatePartnerRef = {
  id: 'other-partner', name: 'Some Other Partner', groupId: 'a-different-group',
  branding: null,
};

const purpleStandardGroup: EstateGroupRef = {
  id: 'purple-standard', name: 'Purple Standard',
  branding: { logo_url: null, primary_color: '#7C3AED', secondary_color: '#2FB074', tagline: null },
};

describe('resolveEstateBranding', () => {
  it('returns "none" when no site is partner-attributed at all (a direct PeakLogic customer)', () => {
    expect(resolveEstateBranding([null, null], {})).toEqual({ kind: 'none' });
  });

  it('returns the single partner when every attributed site resolves to the same partner', () => {
    const result = resolveEstateBranding([wtrDr, wtrDr, wtrDr], {});
    expect(result).toEqual({ kind: 'partner', partner: wtrDr });
  });

  it('is unaffected by unattributed (null) sites mixed in with a single consistent partner', () => {
    const result = resolveEstateBranding([wtrDr, null, wtrDr], {});
    expect(result).toEqual({ kind: 'partner', partner: wtrDr });
  });

  it('falls back to the shared group brand when sites span multiple partners under the same group', () => {
    const result = resolveEstateBranding([wtrDr, aceSeptic], { 'purple-standard': purpleStandardGroup });
    expect(result).toEqual({ kind: 'group', group: purpleStandardGroup });
  });

  it('falls back to "none" when multiple partners are mixed but one has no group at all', () => {
    const result = resolveEstateBranding([wtrDr, rodriguesRoofing], { 'purple-standard': purpleStandardGroup });
    expect(result).toEqual({ kind: 'none' });
  });

  it('falls back to "none" when the mixed partners belong to two DIFFERENT groups', () => {
    const result = resolveEstateBranding([wtrDr, someOtherGroupPartner], {
      'purple-standard': purpleStandardGroup,
      'a-different-group': { id: 'a-different-group', name: 'Some Other Group', branding: null },
    });
    expect(result).toEqual({ kind: 'none' });
  });

  it('falls back to "none" if all partners share a group id but that group has no branding row available to the caller', () => {
    // Defensive case: groups lookup doesn't include the id (e.g. a lookup miss) — never silently fabricate a group.
    const result = resolveEstateBranding([wtrDr, aceSeptic], {});
    expect(result).toEqual({ kind: 'none' });
  });

  it('does not widen partner-side access — this function only ever picks a DISPLAY brand, never grants data visibility', () => {
    // Purely a documentation-style test: resolveEstateBranding has no notion
    // of RLS/access at all — it only classifies branding intent from
    // already-resolved, already-authorized site/partner data the caller
    // supplies. Asserting the shape stays a plain classification, not
    // anything access-related.
    const result = resolveEstateBranding([wtrDr, aceSeptic], { 'purple-standard': purpleStandardGroup });
    expect(result.kind).toBe('group');
    expect(Object.keys(result)).not.toContain('accessGrant');
  });
});
