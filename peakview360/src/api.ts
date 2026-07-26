// The real API client. When VITE_API_URL is set (a deployed backend / the local
// Hub's LAN endpoint), the SPA fetches live data; otherwise it runs in PREVIEW
// mode against the simulated store (data/preview.ts), clearly labeled in the UI
// so preview data is never mistaken for a real fleet.

const BASE = import.meta.env.VITE_API_URL as string | undefined;

/** No backend configured -> preview mode. */
export const PREVIEW = !BASE;

export async function apiGet<T>(path: string): Promise<T> {
  if (!BASE) throw new Error('No VITE_API_URL configured — PeakView360 is in preview mode.');
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Endpoints this SPA consumes once a backend exists (all already defined in the
// API spec / router): GET /v1/hmi-screens, GET /v1/tags, GET /v1/alerts,
// GET /v1/telemetry. Live process values additionally resolve from the Hub over
// the LAN (dual-source, §3.1). Wiring these is the post-infra step.
