import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, MonitorPlay } from 'lucide-react';
import { useSettings } from '@/SettingsContext';
import { usePartner } from '@/PartnerContext';

// PeakView360, embedded in the site page rather than linked away to — the
// partner-portal counterpart of the customer portal's component of the same
// name, ported 2026-08-02 so both portals launch the operator app the same way.
//
// Deliberately a portal-local copy rather than a shared module: the two portals
// are separate Vite apps with no shared package, and this one is white-labelled
// (partner accent colour, the partner's own word for "site"). Duplicating a
// small presentational component is the existing convention here; the part that
// genuinely must not drift — the ?theme=/postMessage contract — is pinned by the
// comment on THEME_MESSAGE in both copies and by peakview360/src/theme.tsx.

const PEAKVIEW_URL = 'http://localhost:5175/';

/** Must match ThemeProvider's listener in peakview360/src/theme.tsx. */
const THEME_MESSAGE = 'peaklogic:theme';

// `theme` is the value the app OPENS with. Once loaded, further changes are
// pushed down by postMessage, so this URL is never re-read.
function peakViewUrl(siteId: string, theme: 'light' | 'dark') {
  const p = new URLSearchParams({ theme });
  if (siteId) p.set('site', siteId);
  return `${PEAKVIEW_URL}?${p.toString()}`;
}

export function PeakViewEmbed({
  siteId,
  enabled,
  defaultOpen = true,
}: {
  siteId: string;
  enabled: boolean;
  defaultOpen?: boolean;
}) {
  const { settings } = useSettings();
  const { partner } = usePartner();
  const t = partner.terms;
  const [open, setOpen] = useState(defaultOpen);
  const frame = useRef<HTMLIFrameElement>(null);

  const post = () => {
    const el = frame.current;
    if (!el?.contentWindow) return;
    try {
      el.contentWindow.postMessage({ type: THEME_MESSAGE, theme: settings.theme }, new URL(PEAKVIEW_URL).origin);
    } catch {
      /* frame not ready or blocked — onLoad re-sends, and the URL already carries the opening theme */
    }
  };

  // Keep the embedded app's theme in step with the portal's. Also re-sent on
  // load, because the frame can finish loading after a toggle and a message
  // posted before its listener mounts is simply dropped.
  useEffect(post, [settings.theme, open]);

  // Deliberately no listener for theme changes coming FROM the frame. Sync is
  // one-way: this portal drives the operator view, and a toggle inside the
  // frame stays a local override rather than rewriting the user's saved
  // portal setting.

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600';
  const heading = 'text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  if (!enabled) {
    return (
      <section>
        <h2 className={`mb-3 ${heading}`}>Live view</h2>
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <MonitorPlay size={22} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No live view at this {t.siteSingular.toLowerCase()} yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
            PeakView360 is served by a PeakLogic Hub on site over the local network. This{' '}
            {t.siteSingular.toLowerCase()} doesn’t have one — installing a Hub is what turns it on.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={heading}>Live view</h2>
        <div className="flex items-center gap-2">
          <a href={peakViewUrl(siteId, settings.theme)} target="_blank" rel="noreferrer" className={btn}>
            Open in new window <ExternalLink size={12} />
          </a>
          <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className={btn}>
            {open ? (
              <>
                Hide <ChevronUp size={12} />
              </>
            ) : (
              <>
                Show <ChevronDown size={12} />
              </>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#0b1120] dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-800 px-3 py-2">
          <MonitorPlay size={13} className="text-partner-primary" />
          <span className="text-xs font-semibold text-slate-200">PeakView360 — live operator view</span>
          <span className="text-[11px] text-slate-500">
            Served by the on-site Hub over the local network, so it keeps working if the internet drops.
          </span>
        </div>

        {open ? (
          <iframe
            ref={frame}
            // Keyed on siteId ONLY. Keying on theme would remount and reload the
            // app on every toggle, losing whatever was being watched; the URL's
            // theme is just the value it opens with, later changes come by
            // postMessage.
            key={siteId}
            src={peakViewUrl(siteId, settings.theme)}
            title="PeakView360 live operator view"
            onLoad={post}
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
        Preview build — the operator view renders PeakLogic’s demonstration facility, so the equipment
        shown here is not yet this {t.siteSingular.toLowerCase()}’s own.
      </p>
    </section>
  );
}
