import { useEffect } from 'react';
import { inkOn } from './brandColor';

// Keeps the BROWSER TAB in step with the rest of the portal.
//
// Title and icon both come from the account's OWN branding as configured in
// Control Center — never PeakLogic's. A portal carrying the platform vendor's
// mark in the tab is the same mistake as carrying a competitor's name, which
// is what the partner portal did when its title was hardcoded.
//
// The mark mirrors Control Center's `brandMark()` exactly, so what an operator
// configures there is what shows here:
//
//   uploaded logo image  →  use it
//   otherwise            →  a rounded tile in their brand colour, with their
//                           short logo text (their default branding)
//
// Nothing here falls back to the PeakLogic mark. If an account has no branding
// configured at all, the tile still uses their initial — their identity,
// undecorated, rather than ours.
//
// Generic over BOTH portals' subjects (Customer, Partner) — see each portal's
// own src/useBrandTab.ts for the thin per-subject wrapper that resolves a
// Customer/Partner record down to this shape.

const RADIUS = 0.28; // matches Control Center's brandMark()

export interface BrandTabSubject {
  /** Shown before the em dash, e.g. "Bayfront Municipal District". */
  name: string;
  logoImg?: string;
  brandColor: string;
  logoText: string;
  lowercaseLogo?: boolean;
}

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
 * The subject's own mark, from their Control Center branding.
 *
 * `logoImg` is the uploaded image when one exists — the same field Control
 * Center's branding tab writes.
 */
export function brandFavicon(subject: BrandTabSubject): string {
  if (subject.logoImg) return subject.logoImg;
  const initials = subject.logoText.trim().split(/\s+/).filter(Boolean);
  const text = initials.length >= 2 ? initials[0][0] + initials[1][0] : subject.logoText.slice(0, 3);
  return tileFavicon(subject.brandColor, text, Boolean(subject.lowercaseLogo));
}

export function useBrandTab(subject: BrandTabSubject, tabSuffix: string): void {
  useEffect(() => {
    document.title = `${subject.name} — ${tabSuffix}`;

    // Reuse one managed link element rather than appending on every switch,
    // which would leave a growing pile of stale icons in <head>.
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.setAttribute('data-brand', '');
      document.head.appendChild(link);
    }
    link.type = subject.logoImg ? 'image/png' : 'image/svg+xml';
    link.href = brandFavicon(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.name, subject.logoImg, subject.brandColor, subject.logoText, subject.lowercaseLogo, tabSuffix]);
}
