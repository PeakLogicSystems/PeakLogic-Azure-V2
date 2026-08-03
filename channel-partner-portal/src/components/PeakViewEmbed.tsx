import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Camera, ChevronDown, ChevronUp, ExternalLink, MonitorPlay, PencilRuler, Router, X } from 'lucide-react';
import { useSettings } from '@/SettingsContext';
import { usePartner } from '@/PartnerContext';
import type { Device, Site } from '@/data/types';
import { HUB_MODELS, type Hub } from '@/data/hubs';
import { useSitePhotos } from '@/sitePhoto';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { DecommissionDialog } from '@/components/DecommissionDialog';

// PeakView360, embedded in the site page rather than linked away to.
//
// Three states, decided by whether the site has a Hub:
//
//   Hub + expanded   the live operator view, full height
//   Hub + collapsed  a compact equipment strip with each unit's live reading
//   no Hub           what the site could have, and the action to add it
//
// The collapsed state carrying the equipment readings is deliberate. It used to
// be an empty bar reading "Show the live operator view", with a SECOND section
// below it repeating the same equipment as a static sketch. Collapsing the live
// view therefore cost you nothing and gained you nothing. Now collapsing trades
// the Facility View for a dense readout of the same equipment, the duplicate
// section is gone, and the page has one place where equipment lives instead of
// two that can disagree.

const PEAKVIEW_URL = 'http://localhost:5175/';

/** Must match ThemeProvider's listener in peakview360/src/theme.tsx. */
const THEME_MESSAGE = 'peaklogic:theme';

// `site` is the scope contract, not a hint: PeakView360 renders only the site
// it is opened for and refuses outright if it holds no data for that site,
// rather than falling back to whichever facility it happens to have. See
// peakview360/src/scope.ts. `siteName` exists purely so its refusal screen can
// name the site the viewer is actually entitled to see.
function peakViewUrl(siteId: string, siteName: string, theme: 'light' | 'dark', hubId?: string) {
  const p = new URLSearchParams({ theme });
  if (siteId) p.set('site', siteId);
  if (siteName) p.set('siteName', siteName);
  // Which Hub's feed to render. A plant's three Hubs each acquire a different
  // part of the process, so "the site's live view" is an incomplete idea —
  // there is one per acquisition point and the operator picks.
  if (hubId) p.set('hub', hubId);
  return `${PEAKVIEW_URL}?${p.toString()}`;
}

const HUB_DOT: Record<Hub['state'], string> = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-400',
  provisioning: 'bg-sky-500',
  available: 'bg-slate-300',
  decommissioned: 'bg-slate-300',
};

const DOT: Record<Device['status'], string> = {
  online: 'bg-emerald-500',
  fault: 'bg-amber-500',
  offline: 'bg-slate-400',
};

/** Equipment-pad order, so the strip reads the way the water actually flows. */
const PAD_ORDER = ['Pump', 'Filter', 'Chlorinator', 'Heater', 'Chemistry', 'Controller', 'Salt', 'Blower', 'Analyzer', 'Level', 'Temp'];
const rank = (type: string) => {
  const i = PAD_ORDER.findIndex((k) => type.includes(k));
  return i === -1 ? PAD_ORDER.length : i;
};

// Starts COLLAPSED. The equipment strip is the denser, faster read — an
// operator scanning a site wants the numbers, and the full plant scene is
// something they open deliberately. It also means the page does not load a
// whole second application before anyone has asked for it.
export function PeakViewEmbed({ site, defaultOpen = false }: { site: Site; defaultOpen?: boolean }) {
  const { settings } = useSettings();
  const { partner, hubsAt, decommissionHub } = usePartner();
  const t = partner.terms;
  const [open, setOpen] = useState(defaultOpen);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [activeHubId, setActiveHubId] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<Hub | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const { photos, add, remove, error: photoError, busy, max } = useSitePhotos(site.id);
  const fileInput = useRef<HTMLInputElement>(null);

  const post = () => {
    const el = frame.current;
    if (!el?.contentWindow) return;
    try {
      el.contentWindow.postMessage({ type: THEME_MESSAGE, theme: settings.theme }, new URL(PEAKVIEW_URL).origin);
    } catch {
      /* frame not ready or blocked — onLoad re-sends, and the URL already carries the opening theme */
    }
  };

  useEffect(post, [settings.theme, open]);

  // Deliberately no listener for theme changes coming FROM the frame. Sync is
  // one-way: this portal drives the operator view, and a toggle inside the
  // frame stays a local override rather than rewriting the user's saved
  // portal setting.

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600';
  const heading = 'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  // Offered on EVERY site, Hub or not. The one picture of a facility that
  // needs no equipment to produce is the most useful thing a site with no
  // instrumentation can have.
  const photoControls = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void add(e.target.files);
          e.target.value = ''; // allow re-picking the same file after a removal
        }}
      />
      <button className={btn} onClick={() => fileInput.current?.click()} disabled={busy || photos.length >= max}>
        <Camera size={12} />
        {busy ? 'Saving…' : photos.length ? `Add photos (${photos.length}/${max})` : 'Add site photos'}
      </button>
    </>
  );

  // A grid rather than one hero image: on a real site the useful set is the
  // pad, the panel label, the serial plate — each worth seeing side by side,
  // and each removable on its own.
  const photoPanel = photos.length ? (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((p, i) => (
        <figure key={p.id} className="group relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
          {/* The image itself opens the viewer — a thumbnail this size cannot
              show a serial plate or a leak, which is what these are taken for. */}
          <button
            onClick={() => setLightbox(i)}
            aria-label={`Open photo ${i + 1} full screen`}
            className="block w-full"
          >
            <img src={p.dataUrl} alt={`${site.name} — site photo`} className="block h-32 w-full object-cover transition-transform hover:scale-[1.03]" />
          </button>
          <button
            onClick={() => void remove(p.id)}
            title="Remove this photo"
            aria-label="Remove this photo"
            className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md bg-slate-900/70 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
          >
            <X size={13} />
          </button>
          <figcaption className="border-t border-slate-200 bg-white px-2 py-1 text-[10.5px] text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
            {new Date(p.addedAt).toLocaleDateString()}
          </figcaption>
        </figure>
      ))}
    </div>
  ) : null;

  const lightboxEl =
    lightbox !== null && photos.length ? (
      <PhotoLightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} caption={site.name} />
    ) : null;

  const photoErrorNote = photoError ? (
    <p className="text-xs text-rose-600 dark:text-rose-400">{photoError}</p>
  ) : null;

  // ── No Hub on site ────────────────────────────────────────────────────
  // Not an error state — plenty of sites are monitored without one. So this
  // says what a Hub would add and gives the partner the action to add it,
  // rather than an empty panel implying something is broken.
  if (!site.peakview) {
    return (
      <section>
        <h2 className={`mb-3 ${heading}`}>Live view</h2>
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-partner-primary/10">
              <Router size={19} className="text-partner-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                No PeakView360 at this {t.siteSingular.toLowerCase()} yet
              </p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                PeakView360 is served by a PeakLogic Hub on site, over the local network — so the live
                view keeps working even if the internet drops. Adding a Hub turns on the live
                Facility View, trending history, and one-click work orders raised straight from an
                alarm. Your customer sees it in their portal too.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: 'var(--partner-primary)' }}
                >
                  <Router size={13} /> Add PeakView360 to this {t.siteSingular.toLowerCase()}
                </button>
                {photoControls}
              </div>
              {photoErrorNote && <div className="mt-2">{photoErrorNote}</div>}
              <p className="mt-2.5 text-[11px] text-slate-400 dark:text-slate-500">
                Without a Hub you can still add photos and draw the {t.facilityNoun} below. Either
                shows the equipment and its latest readings — but not the live Facility View, and not
                trending history.
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
  // Hubs are infrastructure, not instrumentation — they come from the fleet
  // register rather than the site's device list, and are never shown in the
  // equipment strip beside a chemistry probe.
  const hubs = hubsAt(site.id);
  const active = hubs.find((h) => h.id === activeHubId) ?? hubs.find((h) => h.state === 'online') ?? hubs[0];
  const pad = site.devices
    .filter((d) => d.type !== 'Hub')
    .sort((a, b) => rank(a.type) - rank(b.type))
    .slice(0, 8);

  // The switcher. Rendered whenever there is a Hub, not only when there are
  // several: with one Hub it is the only place its ID, model and health are
  // visible on this page, and hiding it until a second unit appears would make
  // that information show up out of nowhere the day someone installs one.
  const hubBar = (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
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
            title={`${HUB_MODELS[h.model].name} · ${HUB_MODELS[h.model].protocols} · firmware ${h.firmware} (${h.channel}) · ${h.tags ?? 0} tags · last seen ${h.lastSeen ?? '—'}`}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
              on
                ? 'border-partner-primary bg-partner-primary/10'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
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
      {active && (
        <button
          onClick={() => setRetiring(active)}
          title={`Decommission ${active.id}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-amber-300 hover:text-amber-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-amber-800 dark:hover:text-amber-400"
        >
          <Archive size={11} /> Decommission
        </button>
      )}
    </div>
  );

  const retireDialog = retiring ? (
    <DecommissionDialog
      hub={retiring}
      siteName={site.name}
      isLastAtSite={hubs.length === 1}
      actor={partner.user.name}
      onCancel={() => setRetiring(null)}
      onConfirm={(opts) => {
        decommissionHub(retiring.id, opts);
        // Fall back to whatever Hub is left, rather than holding a selection
        // that no longer exists and rendering an empty frame.
        setActiveHubId(null);
        setRetiring(null);
      }}
    />
  ) : null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={heading}>Live view</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* A real route, on every site. This is the ONLY way to reach the
              Builder on a Hub site now that the static sketch section is hidden
              there, so it must never be disabled. */}
          <Link to={`/sites/${site.id}/facility`} className={btn}>
            <PencilRuler size={12} /> {site.hasFacility ? 'Edit layout' : 'Build layout'}
          </Link>
          {photoControls}
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
          <MonitorPlay size={13} className="text-partner-primary" />
          <span className={`text-xs font-semibold ${open ? 'text-slate-200' : 'text-slate-700 dark:text-slate-200'}`}>
            PeakView360 — live operator view
          </span>
          <span className="text-[11px] text-slate-500">
            {hubs.length > 1
              ? `Served by ${hubs.length} on-site Hubs over the local network, so it keeps working if the internet drops.`
              : 'Served by the on-site Hub over the local network, so it keeps working if the internet drops.'}
          </span>
        </div>

        {/* Expanded too: switching Hub is the point of the control, and having
            to collapse the view to reach it would be the opposite of that. */}
        {open && <div className="bg-white dark:bg-slate-900">{hubBar}</div>}

        {open ? (
          <iframe
            ref={frame}
            // Keyed on the ACTIVE HUB, not just the site. Switching Hub is a
            // genuine change of source, so the frame must reload; switching
            // theme is not, and keying on it would throw away whatever the
            // operator was watching on every toggle.
            key={`${site.id}:${active?.id ?? ''}`}
            src={peakViewUrl(site.id, site.name, settings.theme, active?.id)}
            title="PeakView360 live operator view"
            onLoad={post}
            className="block h-[clamp(440px,68vh,820px)] w-full border-0 bg-[#0b1120]"
          />
        ) : (
          // Collapsed: the equipment readings, in flow order. This is what the
          // separate facility section used to show — moved here, so collapsing
          // the Facility View still leaves the site's equipment on screen.
          <div className="bg-white dark:bg-slate-900">
            {hubs.length > 0 && hubBar}
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

      {photoErrorNote && <div className="mt-2">{photoErrorNote}</div>}
      {/* Only while collapsed: the live scene is the better picture when it is
          on screen, and stacking a still photo under it is just noise. */}
      {!open && photoPanel && <div className="mt-3">{photoPanel}</div>}

      {lightboxEl}
      {retireDialog}

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Preview build. PeakView360 serves only the {t.siteSingular.toLowerCase()} it is opened for —
        if it holds no data for this one it says so rather than showing another customer’s facility
        in its place.
      </p>
    </section>
  );
}
