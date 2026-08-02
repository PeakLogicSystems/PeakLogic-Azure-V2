import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, MonitorPlay } from 'lucide-react';
import { useSettings } from '@/settings';

// PeakView360, embedded in the page rather than linked away to.
//
// This is the faithful implementation of how the operator app is actually
// specified: "launched from within any portal for a given site — it is NOT a
// separate login surface." A link that navigated the tab away contradicted that
// and, worse, stranded the customer outside their authenticated session with no
// way back. Embedding solves both, and matches what the Control Center already
// does, so there is one pattern in the product instead of two.
//
// The "Open in new window" button is kept deliberately: a technician actually
// working an event wants the full screen, and a framed panel is not that.

const PEAKVIEW_URL = 'http://localhost:5175/';

/** Must match ThemeProvider's listener in peakview360/src/theme.tsx. */
const THEME_MESSAGE = 'peaklogic:theme';

// `theme` is the value the app OPENS with. Once loaded, further changes are
// pushed down by postMessage, so this URL is never re-read.
function peakViewUrl(siteId: string, theme: 'light' | 'dark') {
  const p = new URLSearchParams({ theme });
  // Forward-wiring: PeakView360 resolves its site from the API once one exists.
  // In preview it renders its own demo facility regardless — which is why the
  // panel says so rather than letting a different site name sit silently under
  // this page's heading.
  if (siteId) p.set('site', siteId);
  return `${PEAKVIEW_URL}?${p.toString()}`;
}

export function PeakViewEmbed({ siteId, enabled }: { siteId: string; enabled: boolean }) {
  const { settings } = useSettings();
  const [open, setOpen] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);

  // Keep the embedded app's theme in step with the portal's. Sent on every
  // theme change and again on load, because the frame can finish loading after
  // a toggle and a message posted before its listener mounts is simply dropped.
  useEffect(() => {
    const el = frame.current;
    if (!el || !el.contentWindow) return;
    try {
      el.contentWindow.postMessage({ type: THEME_MESSAGE, theme: settings.theme }, new URL(PEAKVIEW_URL).origin);
    } catch {
      /* not ready yet — the load handler below re-sends */
    }
  }, [settings.theme, open]);

  // Deliberately no listener for theme changes coming FROM the frame. Sync is
  // one-way: this portal drives the operator view, and a toggle inside the
  // frame stays a local override rather than rewriting the user's saved
  // portal setting.

  if (!enabled) {
    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Live view</h2>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <MonitorPlay size={22} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No live view at this site yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            PeakView360 needs a PeakLogic Hub on site to serve the live operator view over the local
            network. Your service provider can tell you what installing one here would involve.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Live view</h2>
        <div className="flex items-center gap-2">
          <a
            href={peakViewUrl(siteId, settings.theme)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-purple-mid hover:text-brand-purple-mid dark:border-slate-700 dark:text-slate-200"
          >
            Open in new window <ExternalLink size={12} />
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-purple-mid hover:text-brand-purple-mid dark:border-slate-700 dark:text-slate-200"
          >
            {open ? <>Hide <ChevronUp size={12} /></> : <>Show <ChevronDown size={12} /></>}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#0b1120] dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-800 px-3 py-2">
          <MonitorPlay size={13} className="text-brand-purple-mid" />
          <span className="text-xs font-semibold text-slate-200">PeakView360 — live operator view</span>
          <span className="text-[11px] text-slate-500">
            Served by the on-site Hub over the local network, so it keeps working if the internet drops.
          </span>
        </div>

        {open ? (
          <iframe
            ref={frame}
            // Remounting on theme change would reload the app and lose whatever
            // the operator was looking at, so the URL's theme is only the value
            // it OPENS with; later changes arrive by postMessage instead. Keying
            // on siteId alone is what makes that true.
            key={siteId}
            src={peakViewUrl(siteId, settings.theme)}
            title="PeakView360 live operator view"
            onLoad={() => {
              const el = frame.current;
              if (!el?.contentWindow) return;
              try {
                el.contentWindow.postMessage({ type: THEME_MESSAGE, theme: settings.theme }, new URL(PEAKVIEW_URL).origin);
              } catch {
                /* cross-origin blocked — it still opens on the right theme via the URL */
              }
            }}
            className="block h-[clamp(440px,68vh,820px)] w-full border-0 bg-[#0b1120]"
          />
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex h-24 w-full items-center justify-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200"
          >
            <ChevronDown size={14} /> Show the live operator view
          </button>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Preview build — the operator view renders PeakLogic's demonstration facility, so the
        equipment shown here is not yet this site's own.
      </p>
    </section>
  );
}
