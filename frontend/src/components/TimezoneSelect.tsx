import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronsUpDown, Check, Search } from 'lucide-react';
import { getTimezoneOptions } from '@/lib/datetime';

interface TimezoneSelectProps {
  value: string;
  onChange: (tz: string) => void;
}

// SET-3 (PRD/SRS v1.6) — "a full standard international time zone
// selector... to lend to enterprise credibility." A plain <select> with
// ~400 IANA entries is technically complete but reads as a developer
// afterthought; this is a searchable combobox instead, the pattern every
// serious enterprise SaaS product (Salesforce, Workday, Google Workspace
// admin, etc.) actually uses for this exact field.
export function TimezoneSelect({ value, onChange }: TimezoneSelectProps) {
  const options = useMemo(() => getTimezoneOptions(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronsUpDown size={14} className="text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <Search size={14} className="text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search city, region, or UTC offset…"
              className="w-full text-sm bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none placeholder:text-gray-400"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No matching time zone</li>
            ) : (
              filtered.map(opt => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); setQuery(''); }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60"
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === value && <Check size={14} className="text-brand-purple flex-shrink-0" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
