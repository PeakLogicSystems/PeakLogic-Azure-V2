import type { HubState } from '../domain/hubs';

// Pieces of the PeakView360 embed genuinely identical across both portals —
// the iframe URL scheme, the theme-sync message name, and the two status-dot
// palettes. Extracted so a change to any of these (a new hub state, a new
// device status, the embed's message contract) happens once.
//
// Deliberately NOT extracted here: equipment-pad ordering. Each portal tunes
// that list to its own device fixtures and it encodes real domain judgement
// ("the order the water actually flows"), not incidental duplication — see
// each portal's own PeakViewEmbed.tsx.

export const PEAKVIEW_URL = 'http://localhost:5175/';

/** Must match ThemeProvider's listener in peakview360/src/theme.tsx. */
export const THEME_MESSAGE = 'peaklogic:theme';

// `site` is the scope contract, not a hint: PeakView360 renders only the site
// it is opened for and refuses outright if it holds no data for that site,
// rather than falling back to whichever facility it happens to have. See
// peakview360/src/scope.ts. `siteName` exists purely so its refusal screen can
// name the site the viewer is actually entitled to see.
export function peakViewUrl(siteId: string, siteName: string, theme: 'light' | 'dark', hubId?: string): string {
  const p = new URLSearchParams({ theme });
  if (siteId) p.set('site', siteId);
  if (siteName) p.set('siteName', siteName);
  // Which Hub's feed to render. A plant has one per acquisition point, so
  // "the site's live view" is incomplete on its own — the viewer picks.
  if (hubId) p.set('hub', hubId);
  return `${PEAKVIEW_URL}?${p.toString()}`;
}

/** Device status dot colour, keyed by the shared `Device['status']` vocabulary. */
export const DEVICE_DOT: Record<'online' | 'fault' | 'offline', string> = {
  online: 'bg-emerald-500',
  fault: 'bg-amber-500',
  offline: 'bg-slate-400',
};

/**
 * Hub status dot colour, keyed by the FULL domain `HubState` (including
 * `available` — in-stock units a portal viewing a live site never renders,
 * but the dict stays total so indexing it never needs a fallback).
 */
export const HUB_DOT: Record<HubState, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  provisioning: 'bg-sky-500',
  available: 'bg-slate-300',
  decommissioned: 'bg-slate-300',
};
