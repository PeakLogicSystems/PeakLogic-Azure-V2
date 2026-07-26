import type { Device, Site } from '@/data/types';

// A placeholder pool & pump-system layout for the pool vertical — a simple
// "drawn" schematic (pool body + equipment pad + plumbing) with live device
// readings. This stands in for the Facility Builder output; a real pool would be
// drawn/authored in the Facility Builder (roadmapped). Deliberately lightweight.
const DOT: Record<Device['status'], string> = {
  online: '#22C55E',
  fault: '#F59E0B',
  offline: '#64748B',
};

// Pick the equipment pad devices in a sensible left-to-right order.
const PAD_ORDER = ['Pump', 'Filter', 'Chlorinator', 'Heater', 'Chemistry', 'Salt'];

export function PoolFacility({ site }: { site: Site }) {
  const pad = [...site.devices]
    .filter((d) => d.type.match(/Pump|Filter|Chlorinator|Heater|Chemistry|Salt/))
    .sort((a, b) => rank(a.type) - rank(b.type))
    .slice(0, 5);

  const temp = site.devices.find((d) => d.type.includes('Temp'))?.reading;
  const boxW = 138;
  const gap = 16;
  const totalW = pad.length * boxW + (pad.length - 1) * gap;
  const startX = (820 - totalW) / 2;
  const padY = 300;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <svg viewBox="0 0 820 440" width="100%" role="img" aria-label="Pool and pump system layout">
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7DD3FC" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
        </defs>

        {/* pool body */}
        <rect x="70" y="34" width="680" height="210" rx="34" fill="url(#water)" stroke="#0284C7" strokeWidth="2" />
        <rect x="70" y="34" width="680" height="210" rx="34" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="6" />
        <text x="96" y="66" fill="#0C4A6E" fontSize="14" fontWeight="700">{site.name}</text>
        {temp && <text x="96" y="86" fill="#075985" fontSize="12">Water {temp}</text>}
        {/* skimmer + returns */}
        <circle cx="150" cy="230" r="6" fill="#ffffff" fillOpacity="0.7" />
        <circle cx="670" cy="230" r="6" fill="#ffffff" fillOpacity="0.7" />

        {/* plumbing pool <-> pad */}
        <path d={`M150 244 C 150 280, ${startX + boxW / 2} 270, ${startX + boxW / 2} ${padY - 6}`} fill="none" stroke="#94A3B8" strokeWidth="3" />
        <path d={`M670 244 C 670 280, ${startX + totalW - boxW / 2} 270, ${startX + totalW - boxW / 2} ${padY - 6}`} fill="none" stroke="#94A3B8" strokeWidth="3" />

        {/* equipment pad */}
        <rect x={startX - 16} y={padY - 16} width={totalW + 32} height="118" rx="14" fill="#E2E8F0" fillOpacity="0.5" stroke="#CBD5E1" />
        <text x={startX - 16} y={padY - 24} fill="#64748B" fontSize="11" fontWeight="600" letterSpacing="0.05em">EQUIPMENT PAD</text>

        {pad.map((d, i) => {
          const x = startX + i * (boxW + gap);
          return (
            <g key={d.id} transform={`translate(${x}, ${padY})`}>
              <rect width={boxW} height="86" rx="10" fill="#ffffff" stroke="#CBD5E1" />
              <circle cx="14" cy="16" r="4" fill={DOT[d.status]} />
              <text x="26" y="20" fill="#334155" fontSize="11" fontWeight="600">{shortType(d.type)}</text>
              <text x="12" y="46" fill="#0F172A" fontSize="15" fontWeight="700">
                {d.status === 'offline' ? '—' : d.reading ?? '—'}
              </text>
              <text x="12" y="70" fill="#94A3B8" fontSize="10">{d.name}</text>
            </g>
          );
        })}

        {/* return flow arrow between pad boxes */}
        {pad.slice(1).map((_, i) => {
          const x = startX + (i + 1) * (boxW + gap) - gap / 2;
          return <line key={i} x1={x - 6} y1={padY + 43} x2={x + 6} y2={padY + 43} stroke="#94A3B8" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
}

function rank(type: string): number {
  const i = PAD_ORDER.findIndex((k) => type.includes(k));
  return i === -1 ? 99 : i;
}

function shortType(type: string): string {
  if (type.includes('Chlorinator')) return 'Chlorinator';
  if (type.includes('Pump')) return 'Pump';
  if (type.includes('Filter')) return 'Filter';
  if (type.includes('Heater')) return 'Heater';
  if (type.includes('Chemistry')) return 'pH / ORP';
  if (type.includes('Salt')) return 'Salt';
  return type;
}
