import { useEffect, useRef, useState } from 'react';

// Site photos — READ ONLY on the customer side.
//
// Photos are taken by whoever is physically at the site, which is the service
// partner's technician, not the equipment owner. So this portal displays the
// set and offers no upload or delete: a control that looks like it works but
// has nobody behind it is worse than no control.
//
// Read through the same cross-origin broker the partner portal writes to
// (peakview360/public/photo-broker.html), because the two portals run on
// different ports and therefore have separate localStorage. Without the broker
// a photo the technician uploads would never reach the customer who is meant
// to see it — which is the whole point of taking it.

export interface SitePhoto {
  id: string;
  dataUrl: string;
  addedAt: string;
  caption?: string;
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
  // Never hang: if the operator app is not running there are simply no photos,
  // which is a normal state rather than an error worth blocking the page for.
  return new Promise((resolve) => {
    waiting.push(resolve);
    setTimeout(resolve, 2500);
  });
}

let seq = 0;
function fetchPhotos(siteId: string): Promise<SitePhoto[]> {
  return whenReady().then(
    () =>
      new Promise((resolve) => {
        const reqId = `c${++seq}`;
        const onMsg = (e: MessageEvent) => {
          if (e.origin !== BROKER_ORIGIN) return;
          const d = e.data;
          if (!d || d.type !== 'pl-photos:result' || d.reqId !== reqId) return;
          window.removeEventListener('message', onMsg);
          clearTimeout(timer);
          resolve(Array.isArray(d.photos) ? d.photos : []);
        };
        const timer = setTimeout(() => {
          window.removeEventListener('message', onMsg);
          resolve([]);
        }, 4000);
        window.addEventListener('message', onMsg);
        try {
          frame!.contentWindow!.postMessage({ type: 'pl-photos:get', reqId, siteId }, BROKER_ORIGIN);
        } catch {
          window.removeEventListener('message', onMsg);
          clearTimeout(timer);
          resolve([]);
        }
      }),
  );
}

export function useSitePhotos(siteId: string): SitePhoto[] {
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const live = useRef(true);

  // Following siteId means navigating between sites shows the right photos
  // rather than the previous site's.
  useEffect(() => {
    live.current = true;
    void fetchPhotos(siteId).then((p) => {
      if (live.current) setPhotos(p);
    });
    return () => {
      live.current = false;
    };
  }, [siteId]);

  return photos;
}
