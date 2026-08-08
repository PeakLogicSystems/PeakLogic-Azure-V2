import { useEffect, useState } from 'react';

// Live branding from Control Center.
//
// An administrator changing a partner's mark or colour in Control Center must
// reach that partner's portal. Without this the portals carry hand-mirrored
// copies and the three surfaces drift — which is exactly what happened: Control
// Center had WTR DR at #0891B2/"WDR" while the portal rendered #0EA5E9/"wtr dr".
//
// Control Center publishes to a store on the operator app's origin (:5175);
// this reads it. All three run on different ports, so a shared origin is the
// only way to pass anything between them. In production one API replaces it.
//
// The bundled values in data/ remain the DEFAULT — what a partner looks like
// before an administrator has customised anything, and what they fall back to
// if the store is unreachable. An override never invents branding; it only
// replaces branding that already exists.

export interface BrandOverride {
  /** Mark colour — the vivid tier, for the logo tile and accents. */
  brand?: string;
  /** Header colour — the deep tier, for the page banner behind white text. */
  header?: string;
  logo?: string;
  logoImg?: string | null;
  name?: string;
  /** Banner copy, configurable per organisation in Control Center. */
  bannerTitle?: string;
  bannerSub?: string;
}

const BROKER_URL = 'http://localhost:5175/photo-broker.html';
const BROKER_ORIGIN = new URL(BROKER_URL).origin;

let frame: HTMLIFrameElement | null = null;
let ready = false;
const waiting: Array<() => void> = [];

function ensureFrame(): void {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.src = BROKER_URL;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  window.addEventListener('message', (e) => {
    if (e.origin !== BROKER_ORIGIN) return;
    if (e.data?.type === 'pl-photos:ready') {
      ready = true;
      waiting.splice(0).forEach((fn) => fn());
    }
  });
}

function whenReady(): Promise<void> {
  ensureFrame();
  if (ready) return Promise.resolve();
  // Never block the portal on this. No store reachable simply means the
  // bundled default branding stands, which is a correct outcome, not an error.
  return new Promise((resolve) => {
    waiting.push(resolve);
    setTimeout(resolve, 2000);
  });
}

let seq = 0;
function fetchBrand(orgId: string): Promise<BrandOverride | null> {
  return whenReady().then(
    () =>
      new Promise((resolve) => {
        const reqId = `br${++seq}`;
        const onMsg = (e: MessageEvent) => {
          if (e.origin !== BROKER_ORIGIN) return;
          const d = e.data;
          if (!d || d.type !== 'pl-brand:result' || d.reqId !== reqId) return;
          window.removeEventListener('message', onMsg);
          clearTimeout(timer);
          resolve(d.brand ?? null);
        };
        const timer = setTimeout(() => {
          window.removeEventListener('message', onMsg);
          resolve(null);
        }, 3000);
        window.addEventListener('message', onMsg);
        try {
          frame!.contentWindow!.postMessage({ type: 'pl-brand:get', reqId, orgId }, BROKER_ORIGIN);
        } catch {
          window.removeEventListener('message', onMsg);
          clearTimeout(timer);
          resolve(null);
        }
      }),
  );
}

/**
 * Branding configured in Control Center for this organisation, or null.
 *
 * Re-checked when the window regains focus, so an administrator can change
 * branding in one tab and see it in the portal tab without a reload — which is
 * how anyone actually demonstrates this.
 */
export function useBrandOverride(orgId: string): BrandOverride | null {
  const [brand, setBrand] = useState<BrandOverride | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      void fetchBrand(orgId).then((b) => {
        if (live) setBrand(b);
      });
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      live = false;
      window.removeEventListener('focus', load);
    };
  }, [orgId]);

  return brand;
}
