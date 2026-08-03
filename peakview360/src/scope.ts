import { DEFAULT_SITE_ID, SITE_CONFIGS } from './data/sites';

// ─────────────────────────────────────────────────────────────────────────────
// SITE SCOPE GUARD — fail closed.
//
// PeakView360 is always opened FOR a site. When a host embeds it, it says which
// one via ?site=. This module decides whether this app actually holds data for
// that site, and the answer is enforced before anything renders.
//
// Why this exists (2026-08-02): the operator view was embedded into every
// portal site page while its preview data was hardcoded to a single facility —
// `site-riverside`, which belongs to Bayfront Municipal District. Opening a WTR
// DR site therefore rendered Bayfront's plant, its equipment and its live
// values inside a different organisation's page. That is a cross-tenant
// disclosure, and it is exactly the failure this platform's security model
// exists to prevent.
//
// The rule, and it is not negotiable: if a site is requested and this app does
// not hold that site's data, it renders NOTHING about any other site. It does
// not fall back to whatever data it happens to have. Falling back is how a leak
// happens — the correct behaviour when scope cannot be satisfied is refusal,
// not a best effort.
//
// This mirrors how the backend behaves. Row-level security returns zero rows
// for a tenant that may not see them; it does not return a different tenant's
// rows because they were closer to hand.
//
// Note that adding sites does NOT weaken this. A site renders because it has a
// configuration of its own in data/sites.ts, never because it was near to hand.
// ─────────────────────────────────────────────────────────────────────────────

function param(name: string): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get(name);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** The site this app was opened for, or null when opened standalone. */
export const REQUESTED_SITE_ID = param('site');

/**
 * The requested site's display name, passed by the host.
 *
 * Used ONLY to name the site in the refusal screen, so the message refers to
 * the site the viewer is entitled to see. The refusal must never name, or hint
 * at, whichever sites this build does hold.
 */
export const REQUESTED_SITE_NAME = param('siteName');

/**
 * True when it is safe to render.
 *
 * No `?site=` means standalone use — the default demo facility, which is nobody
 * else's data. A `?site=` with a configuration of its own is in scope. Anything
 * else is out of scope and must render the refusal.
 */
export const SITE_IN_SCOPE = REQUESTED_SITE_ID === null || REQUESTED_SITE_ID in SITE_CONFIGS;

/** The site actually being rendered. Only meaningful when SITE_IN_SCOPE. */
export const ACTIVE_SITE_ID = REQUESTED_SITE_ID ?? DEFAULT_SITE_ID;
