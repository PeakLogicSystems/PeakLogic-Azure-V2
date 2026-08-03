import { useEffect } from 'react';
import type { Customer } from '@/data';

// Keeps the BROWSER TAB in step with the rest of the portal.
//
// Title and icon both come from the CUSTOMER'S OWN branding as configured in
// Control Center — not from PeakLogic's. A customer's portal carrying the
// platform vendor's mark in the tab is the same mistake the partner portal made
// when its title was hardcoded to one partner.
//
// Mirrors Control Center's `brandMark()`:
//
//   uploaded logo image  ->  use it
//   otherwise            ->  a rounded tile in their brand colour with their
//                            short logo text (their default branding)

const RADIUS = 0.28; // matches Control Center's brandMark()

function tileFavicon(color: string, text: string): string {
  const label = text.toUpperCase();
  const size = label.length >= 3 ? 22 : label.length === 2 ? 28 : 36;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${Math.round(64 * RADIUS)}" fill="${color}"/>
<text x="32" y="${label.length >= 3 ? 40 : 43}" font-family="Inter,system-ui,sans-serif" font-size="${size}"
      font-weight="800" letter-spacing="-1" fill="#fff" text-anchor="middle">${label}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function brandFavicon(c: Customer): string {
  if (c.logoImg) return c.logoImg;
  return tileFavicon(c.brand, c.logoText || c.name.slice(0, 1));
}

export function useBrandTab(customer: Customer): void {
  useEffect(() => {
    document.title = `${customer.name} — Customer Portal`;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.setAttribute('data-brand', '');
      document.head.appendChild(link);
    }
    link.type = customer.logoImg ? 'image/png' : 'image/svg+xml';
    link.href = brandFavicon(customer);
  }, [customer]);
}
