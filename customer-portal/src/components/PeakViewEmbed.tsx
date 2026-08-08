import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, MonitorPlay, Router } from 'lucide-react';
import { useSettings } from '@/settings';
import { CUSTOMER, type Device, type Site } from '@/data';
import { liveHubsAt } from '@/data/hardware';
import { useSitePhotos } from '@/sitePhoto';
import { PhotoLightbox } from '@shared/ui/PhotoLightbox';
import { DEVICE_DOT, HUB_DOT, PEAKVIEW_URL, THEME_MESSAGE, peakViewUrl } from '@shared/ui/peakViewShared';

// PeakView360, embedded in the site page rather than linked away to.
//
// Three states, decided by whether the site has a Hub:
//
//   Hub + expanded   the live operator view, full height
//   Hub + collapsed  a compact equipment strip with each unit's live reading
//   no Hub           what a Hub would add, and who to ask for one
//
// The collapsed state carrying the equipment readings is deliberate: collapsing
// the Facility View should trade it for a denser readout of the same equipment,
// not for an empty bar.
//
// The customer-side difference from the partner build is the no-Hub state. A
// customer cannot install a Hub themselves, so offering them an "add it" button
// would be a dead end. It names their service provider instead — the party who
// can actually do it.
//
// PEAKVIEW_URL/THEME_MESSAGE/peakViewUrl/DEVICE_DOT/HUB_DOT live in
// packages/ui/peakViewShared.ts — identical to the partner portal's copy by
// construction, not by coincidence. PAD_ORDER stays local: it encodes real
// domain judgement about equipment ordering, tuned separately per portal.

const DOT: Record<Device['status'], string> = DEVICE_DOT;

/** Equipment-pad order, so the strip reads the way the water actually flows. */
const PAD_ORDER = ['Pump', 'Blower', 'Filter', 'Chlorinator', 'Analyzer', 'Chemistry', 'Level', 'Temp'];
const rank = (type: string) => {
  const i = PAD_ORDER.findIndex((k) => type.includes(k));
  return i === -1 ? PAD_ORDER.length : i;
};

// Starts COLLAPSED — the equipment strip is the faster read, and the page does
// not load a whole second application before anyone has asked for it.
export function PeakViewEmbed({ site, defaultOpen = false }: { site: Site; defaultOpen?: boolean }) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(defaultOpen);
  const [activeHubId, setActiveHubId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const photos = useSitePhotos(site.id);

  const post = () => {
    const el = frame.current;
    if (!el?.contentWindow) return;
    try {
      el.contentWindow.postMessage({ type: THEME_MESSAGE, theme: settings.theme }, new URL(PEAKVIEW_URL).origin);
    } catch {
      /* not ready yet — onLoad re-sends, and the URL already carries the opening theme */
    }
  };

  useEffect(post, [settings.theme, open]);

  // Deliberately no listener for theme changes coming FROM the frame. Sync is
  // one-way: this portal drives the operator view, and a toggle inside the
  // frame stays a local override rather than rewriting the user's saved
  // portal setting.

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-purple-mid hover:text-brand-purple-mid dark:border-slate-700 dark:text-slate-200';
  const heading = 'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  const lightboxEl =
    lightbox !== null && photos.length ? (
      <PhotoLightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} caption={site.name} />
    ) : null;

  const photoPanel = photos.length ? (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <figure key={p.id} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <button onClick={() => setLightbox(i)} aria-label={`Open photo ${i + 1} full screen`} className="block w-full">
              <img src={p.dataUrl} alt={`${site.name} — site photo`} className="block h-32 w-full object-cover transition-transform hover:scale-[1.03]" />
            </button>
            <figcaption className="border-t border-slate-200 bg-white px-2 py-1 text-[10.5px] text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
              {new Date(p.addedAt).toLocaleDateString()}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        Site photos · added by {CUSTOMER.provider}
      </p>
    </div>
  ) : null;

  // ── No Hub on site ────────────────────────────────────────────────────
  if (!site.peakview) {
    return (
      <section>
        <h2 className={`mb-3 ${heading}`}>Live view</h2>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-brand-purple/10">
              <Router size={19} className="text-brand-purple-mid" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-white">No live view at this site yet</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                The live view needs a PeakLogic Hub installed on site. It serves the operator view over
                your local network, so it keeps working even if the internet drops — and it adds
                trending history and faster dispatch when something does go wrong.
              </p>
              <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                <b>{CUSTOMER.provider}</b> services this site and can tell you what installing one here
                would involve.
              </p>
            </div>
          </div>
          {photoPanel && <div className="mt-4">{photoPanel}</div>}
        </div>
        {lightboxEl}
      </section>
    );
  }

  // ── Hub present ───────────────────────────────────────────────────────
  const hubs = liveHubsAt(site.id);
  const active = hubs.find((h) => h.id === activeHubId) ?? hubs.find((h) => h.state === 'online') ?? hubs[0];
  const pad = [...site.devices].sort((a, b) => rank(a.type) - rank(b.type)).slice(0, 8);

  const hubBar = hubs.length ? (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
        {hubs.length > 1 ? `${hubs.length} Hubs` : 'Hub'}
      </span>
      {hubs.map((h) => {
        const on = h.id === active?.id;
        return (
          <button
            key={h.id}
            onClick={() => setActiveHubId(h.id)}
            aria-pressed={on}
            title={`${h.model} · firmware ${h.firmware} · last seen ${h.lastSeen ?? '—'}`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
              on ? 'border-brand-purple-mid bg-brand-purple-mid/10' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${HUB_DOT[h.state]}`} />
            <span className={`font-mono text-[11px] ${on ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
              {h.id}
            </span>
            {h.label && <span className="text-[11px] text-slate-500 dark:text-slate-400">{h.label}</span>}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={heading}>Live view</h2>
        <div className="flex items-center gap-2">
          <a href={peakViewUrl(site.id, site.name, settings.theme, active?.id)} target="_blank" rel="noreferrer" className={btn}>
            Open in new window <ExternalLink size={12} />
          </a>
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={btn}>
            {open ? (
              <>
                Hide Facility View <ChevronUp size={12} />
              </>
            ) : (
              <>
                Show Facility View <ChevronDown size={12} />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 ${
            open ? 'border-b border-slate-800 bg-[#0b1120]' : 'border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
          }`}
        >
          <MonitorPlay size={13} className="text-brand-purple-mid" />
          <span className={`text-xs font-semibold ${open ? 'text-slate-200' : 'text-slate-700 dark:text-slate-200'}`}>
            PeakView360 — live operator view
          </span>
          <span className="text-[11px] text-slate-500">
            Served by the on-site Hub over the local network, so it keeps working if the internet drops.
          </span>
        </div>

        {open && hubBar}

        {open ? (
          <iframe
            ref={frame}
            // Keyed on the ACTIVE HUB — switching Hub is a real change of
            // source and must reload. Theme is not, and keying on it would
            // throw away whatever was being watched on every toggle.
            key={`${site.id}:${active?.id ?? ''}`}
            src={peakViewUrl(site.id, site.name, settings.theme, active?.id)}
            title="PeakView360 live operator view"
            onLoad={post}
            className="block h-[clamp(440px,68vh,820px)] w-full border-0 bg-[#0b1120]"
          />
        ) : (
          // Collapsed: the equipment readings, so collapsing the Facility View
          // still leaves the site's equipment on screen.
          <div className="bg-white dark:bg-slate-900">
            {hubBar}
            <div className="flex min-w-max items-center gap-2 overflow-x-auto p-3">
              {pad.map((d, i) => (
                <div key={d.id} className="flex items-center gap-2">
                  <div className="min-w-[136px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 flex-none rounded-full ${DOT[d.status]}`} />
                      <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">{d.type}</span>
                    </div>
                    <p className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900 dark:text-white">
                      {d.status === 'offline' ? <span className="text-slate-400">—</span> : d.reading ?? '—'}
                    </p>
                    <p className="truncate text-[10.5px] text-slate-400 dark:text-slate-500">{d.name}</p>
                  </div>
                  {i < pad.length - 1 && <span aria-hidden className="text-slate-300 dark:text-slate-600">—</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Only while collapsed: the live scene is the better picture when it is
          on screen, and stacking a still photo under it is just noise. */}
      {!open && photoPanel && <div className="mt-3">{photoPanel}</div>}

      {lightboxEl}

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Preview build. PeakView360 serves only the site it is opened for — if it holds no data for this
        one it says so rather than showing another site&rsquo;s facility in its place.
      </p>
    </section>
  );
}
