import { useCallback, useEffect, useRef, useState } from 'react';

// Site photos — a set per site, shared across both portals.
//
// Available for EVERY site, not only those with a Hub: a photo is the one
// picture of a facility that needs no equipment at all to produce, so it is
// most valuable exactly where there is no live view. A tech standing at the
// equipment pad can take one; nobody has to draw anything.
//
// STORAGE IS CROSS-ORIGIN. The two portals run on different ports, which means
// different origins and therefore separate localStorage — a photo uploaded by
// the technician would have been invisible to the customer who is meant to see
// it. Both portals therefore read and write through a broker page hosted on one
// origin (peakview360/public/photo-broker.html). See that file for why.
//
// The contract here is shaped like the API that will replace it: list and
// replace, per site.

export interface SitePhoto {
  id: string;
  dataUrl: string;
  /** ISO date — shown so an operator can tell a current photo from an old one. */
  addedAt: string;
  caption?: string;
}

const BROKER_URL = 'http://localhost:5175/photo-broker.html';
const BROKER_ORIGIN = new URL(BROKER_URL).origin;

export const MAX_PHOTOS = 16;
const MAX_PER_PHOTO_BYTES = 700_000;
const MAX_EDGE = 1400;

// One hidden broker frame for the whole app, created on first use. Creating one
// per component would open a frame per site page and re-race the ready handshake
// every navigation.
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
  // Resolve on the handshake, but never hang forever: if the operator app is not
  // running, the caller should get an empty result and a clear message rather
  // than a spinner that never stops.
  return new Promise((resolve) => {
    waiting.push(resolve);
    setTimeout(resolve, 2500);
  });
}

let seq = 0;
function call(type: 'get' | 'set', siteId: string, photos?: SitePhoto[]): Promise<{ photos: SitePhoto[]; ok?: boolean; error?: string | null }> {
  return whenReady().then(
    () =>
      new Promise((resolve) => {
        const reqId = `r${++seq}`;
        const onMsg = (e: MessageEvent) => {
          if (e.origin !== BROKER_ORIGIN) return;
          const d = e.data;
          if (!d || d.type !== 'pl-photos:result' || d.reqId !== reqId) return;
          window.removeEventListener('message', onMsg);
          clearTimeout(timer);
          resolve({ photos: Array.isArray(d.photos) ? d.photos : [], ok: d.ok, error: d.error ?? null });
        };
        const timer = setTimeout(() => {
          window.removeEventListener('message', onMsg);
          resolve({ photos: [], ok: false, error: 'The photo store did not respond. Is the operator app running on port 5175?' });
        }, 4000);
        window.addEventListener('message', onMsg);
        try {
          frame!.contentWindow!.postMessage({ type: `pl-photos:${type}`, reqId, siteId, photos }, BROKER_ORIGIN);
        } catch {
          window.removeEventListener('message', onMsg);
          clearTimeout(timer);
          resolve({ photos: [], ok: false, error: 'The photo store is unreachable.' });
        }
      }),
  );
}

/**
 * Downscale and re-encode before storing.
 *
 * A modern phone photo is 3–8 MB. Sixteen of those would blow the storage
 * budget many times over and throw a quota error that looks to the user like
 * the upload silently failed. Resizing keeps each around 100–250 KB, so a full
 * set of sixteen fits.
 */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image we can read.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('This browser could not process the image.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function useSitePhotos(siteId: string) {
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    setError(null);
    void call('get', siteId).then((r) => {
      if (live.current) setPhotos(r.photos);
    });
    return () => {
      live.current = false;
    };
  }, [siteId]);

  /** Accepts several files at once — a tech uploads a set, not one at a time. */
  const add = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const list = Array.from(files);
      const images = list.filter((f) => f.type.startsWith('image/'));
      if (!images.length) {
        setError('Choose image files — photos of the site or its equipment.');
        return;
      }

      setBusy(true);
      try {
        const current = (await call('get', siteId)).photos;
        const room = MAX_PHOTOS - current.length;
        if (room <= 0) {
          setError(`This site already has ${MAX_PHOTOS} photos. Remove one before adding another.`);
          return;
        }

        const added: SitePhoto[] = [];
        const skipped: string[] = [];
        for (const file of images.slice(0, room)) {
          try {
            const dataUrl = await downscale(file);
            if (dataUrl.length > MAX_PER_PHOTO_BYTES) {
              skipped.push(`${file.name} is too large even after resizing`);
              continue;
            }
            added.push({
              id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              dataUrl,
              addedAt: new Date().toISOString(),
            });
          } catch {
            skipped.push(`${file.name} could not be read`);
          }
        }

        if (added.length) {
          const res = await call('set', siteId, [...current, ...added]);
          if (live.current) setPhotos(res.photos);
          if (!res.ok && res.error) {
            setError(res.error);
            return;
          }
        }

        // Report partial success honestly rather than showing a clean result
        // while some of the chosen files were quietly dropped.
        const notes: string[] = [];
        if (images.length > room) notes.push(`only ${room} more fit (limit ${MAX_PHOTOS} per site)`);
        if (list.length !== images.length) notes.push(`${list.length - images.length} non-image file(s) skipped`);
        if (skipped.length) notes.push(skipped.join('; '));
        if (notes.length && live.current) setError(notes.join(' · '));
      } finally {
        if (live.current) setBusy(false);
      }
    },
    [siteId],
  );

  const remove = useCallback(
    async (id: string) => {
      const current = (await call('get', siteId)).photos;
      const res = await call('set', siteId, current.filter((p) => p.id !== id));
      if (!live.current) return;
      setPhotos(res.photos);
      setError(res.ok === false ? res.error ?? null : null);
    },
    [siteId],
  );

  return { photos, add, remove, error, busy, max: MAX_PHOTOS };
}
