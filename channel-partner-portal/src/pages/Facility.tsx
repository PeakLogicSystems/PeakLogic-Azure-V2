import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Hammer, PencilRuler } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { siteById } from '@/data/types';
import { PoolFacility } from '@/components/PoolFacility';

// The Facility page: the built layout for a site, or the Facility Builder entry
// point when nothing is built. Vertical-aware — pools render a pool & pump-system
// layout (placeholder); wastewater sites open their process view in PeakView360.
export function Facility() {
  const { partner } = usePartner();
  const { siteId = '' } = useParams();
  const site = siteById(partner, siteId);
  const t = partner.terms;

  if (!site) {
    return (
      <div className="py-16 text-center text-slate-500">
        Not found. <Link to="/" className="text-partner-primary hover:underline">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to={`/sites/${site.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> {site.name}
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold capitalize text-slate-900">{t.facilityNoun}</h1>
          <p className="text-sm text-slate-500">
            {site.hasFacility ? 'Live layout for this ' + t.siteSingular.toLowerCase() : 'Not built yet'}
          </p>
        </div>
        {site.hasFacility && (
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-300">
            <PencilRuler size={15} /> Edit in Facility Builder
          </button>
        )}
      </div>

      {site.hasFacility && partner.vertical === 'pool' ? (
        <>
          <PoolFacility site={site} />
          <p className="text-xs text-slate-400">
            Placeholder pool &amp; pump-system layout. In the Facility Builder (roadmapped) this is drawn/authored and bound to
            live devices; here it's a static preview.
          </p>
        </>
      ) : site.hasFacility ? (
        <PeakViewNote />
      ) : (
        <BuilderCta label={t.facilityBuild} vertical={partner.vertical} />
      )}
    </div>
  );
}

function PeakViewNote() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
      <ExternalLink size={26} className="mx-auto text-partner-primary" />
      <p className="mt-3 font-semibold text-slate-800">Process view opens in PeakView360</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        This facility's interactive plant view (isometric, top/front/side, live sensors) lives in the PeakView360 operator
        surface. Preview — cross-app link not wired here.
      </p>
    </div>
  );
}

function BuilderCta({ label, vertical }: { label: string; vertical: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Hammer size={28} className="mx-auto text-partner-primary" />
      <h2 className="mt-3 text-lg font-bold text-slate-900">{label}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        The <span className="font-medium">Facility Builder</span> lets you {vertical === 'pool' ? 'draw the pool and pump/filter system' : 'lay out the process'} and bind
        each element to its live devices. It's optional — you can monitor and service this {vertical === 'pool' ? 'pool' : 'site'} without it.
      </p>
      <button disabled className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white opacity-50" style={{ backgroundColor: 'var(--partner-primary)' }}>
        <Hammer size={15} /> {label}
      </button>
      <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">Roadmapped</p>
    </div>
  );
}
