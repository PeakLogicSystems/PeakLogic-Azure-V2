import { useEffect } from 'react';
import type { Partner } from '@/data/types';

// Keeps the BROWSER TAB in step with the rest of the portal.
//
// The tab is part of the white label. Title and icon both come from the
// ORGANISATION'S OWN branding as configured in Control Center — not from
// PeakLogic's. A partner portal carrying the platform vendor's mark in the tab
// is the same mistake as carrying a competitor's name, which is what it did
// when the title was hardcoded in index.html.
//
// The mark mirrors Control Center's `brandMark()` exactly, so what an operator
// configures there is what the partner sees here:
//
//   uploaded logo image  →  use it
//   otherwise            →  a rounded tile in their brand colour, with their
//                           short logo text (their default branding)
//
// Nothing here falls back to the PeakLogic mark. If an organisation has no
// branding configured at all, the tile still uses their initial — their
// identity, undecorated, rather than ours.

import { inkOn } from '@/brandColor';

const RADIUS = 0.28; // matches Control Center's brandMark()

function tileFavicon(color: string, text: string, lowercase: boolean): string {
  // Every configured brand is dark enough for white; this guards a future one
  // that is not, rather than silently shipping an unreadable mark.
  const fg = inkOn(color);
  const label = lowercase ? text.toLowerCase() : text.toUpperCase();
  // Font size scales with label length so three characters still fit at 16px.
  const size = label.length >= 3 ? 22 : label.length === 2 ? 28 : 36;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${Math.round(64 * RADIUS)}" fill="${color}"/>
<text x="32" y="${label.length >= 3 ? 40 : 43}" font-family="Inter,system-ui,sans-serif" font-size="${size}"
      font-weight="800" letter-spacing="-1" fill="${fg}" text-anchor="middle">${label}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The partner's own mark, from their Control Center branding.
 *
 * `logoImg` is the uploaded image when one exists — the same field Control
 * Center's branding tab writes.
 */
export function brandFavicon(partner: Partner & { logoImg?: string }): string {
  if (partner.logoImg) return partner.logoImg;
  const initials = partner.logoText.trim().split(/\s+/).filter(Boolean);
  const text = initials.length >= 2 ? initials[0][0] + initials[1][0] : partner.logoText.slice(0, 3);
  return tileFavicon(partner.primaryColor, text, Boolean(partner.lowercaseLogo));
}

export function useBrandTab(partner: Partner): void {
  useEffect(() => {
    document.title = `${partner.name} — Partner Portal`;

    // Reuse one managed link element rather than appending on every switch,
    // which would leave a growing pile of stale icons in <head>.
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.setAttribute('data-brand', '');
      document.head.appendChild(link);
    }
    link.type = partner.logoImg ? 'image/png' : 'image/svg+xml';
    link.href = brandFavicon(partner);
  }, [partner]);
}
