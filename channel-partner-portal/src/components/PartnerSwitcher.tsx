import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Repeat } from 'lucide-react';
import { usePartner } from '@/PartnerContext';

// The demo switcher: flip the whole portal between partners (Ace ↔ WTR DR) to
// show two separate businesses — different brand, vertical, customers, devices —
// running on one PeakLogicSystems core. Switching returns to home (the other
// partner has different site ids).
export function PartnerSwitcher() {
  const { partner, partners, setPartnerId } = usePartner();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const pick = (id: string) => {
    setPartnerId(id);
    setOpen(false);
    navigate('/');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-medium text-white/90 hover:bg-white/20"
        title="Demo: switch partner"
      >
        <Repeat size={14} />
        <span className="hidden sm:inline">Switch partner</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-1 text-slate-900 shadow-xl">
            <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Demo · view as partner</p>
            {partners.map((p) => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-black text-white" style={{ backgroundColor: p.secondaryColor }}>
                  {p.logoText.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block text-[11px] capitalize text-slate-400">{p.vertical} · on PeakLogicSystems</span>
                </span>
                {p.id === partner.id && <Check size={16} className="shrink-0 text-emerald-500" />}
              </button>
            ))}
            <p className="px-3 pb-1.5 pt-1 text-[11px] text-slate-400">Same core · separate tenants & data</p>
          </div>
        </>
      )}
    </div>
  );
}
