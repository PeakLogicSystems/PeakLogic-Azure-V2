import { useState } from 'react';
import { AlertTriangle, Archive, X } from 'lucide-react';
import { DECOMMISSION_REASONS, DEFAULT_RETENTION, HUB_MODELS, RETENTION, type Hub, type RetentionKey } from '@/data/hubs';

// Retiring a Hub, with the retention decision made at the same moment.
//
// The hold period is asked for HERE rather than set once in a settings screen
// because it is a judgement about this specific unit: a warranty swap on a
// pool pad and a failed Hub at a permitted discharge site have genuinely
// different evidentiary lives. A single global default would be right for one
// of them and quietly wrong for the other, and nobody would notice until the
// record was gone.
//
// The dialog states the consequence in the same words for every choice — what
// is kept, and when (or whether) it may be purged — because "90 days" means
// nothing on its own to the person clicking it at 4pm on a Friday.

export function DecommissionDialog({
  hub,
  siteName,
  isLastAtSite,
  actor,
  onCancel,
  onConfirm,
}: {
  hub: Hub;
  siteName: string;
  isLastAtSite: boolean;
  actor: string;
  onCancel: () => void;
  onConfirm: (opts: { by: string; reason: string; retention: RetentionKey }) => void;
}) {
  const [reason, setReason] = useState(DECOMMISSION_REASONS[0]);
  const [other, setOther] = useState('');
  const [retention, setRetention] = useState<RetentionKey>(DEFAULT_RETENTION);

  const finalReason = reason === 'Other' ? other.trim() : reason;
  const canConfirm = finalReason.length > 2;
  const hold = RETENTION[retention];

  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-partner-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-amber-100 dark:bg-amber-950">
              <Archive size={17} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Decommission this Hub</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono">{hub.id}</span> · {HUB_MODELS[hub.model].name}
                {hub.label ? ` · ${hub.label}` : ''} · {siteName}
              </p>
            </div>
          </div>
          <button onClick={onCancel} aria-label="Cancel" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {isLastAtSite && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle size={15} className="mt-0.5 flex-none" />
              <span>
                This is the last Hub at {siteName}. Retiring it turns off the live Facility View here — for you and for
                your customer. Readings already collected are unaffected.
              </span>
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
              {DECOMMISSION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {reason === 'Other' && (
              <input
                autoFocus
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="What happened to it?"
                className={`${field} mt-2`}
              />
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Retention hold</label>
            <div className="space-y-1.5">
              {(Object.keys(RETENTION) as RetentionKey[]).map((k) => (
                <label
                  key={k}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                    retention === k
                      ? 'border-partner-primary bg-partner-primary/5'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="retention"
                    checked={retention === k}
                    onChange={() => setRetention(k)}
                    className="mt-0.5 accent-[var(--partner-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {RETENTION[k].label}
                      {k === DEFAULT_RETENTION && <span className="ml-1.5 text-[10.5px] font-medium text-slate-400">default</span>}
                    </span>
                    <span className="block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{RETENTION[k].sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            The record stays in <strong>{hub.customer ?? 'the customer'}</strong>&rsquo;s tenant under{' '}
            <strong>Decommissioned Hardware</strong>, with its serial, its site, its service history and the readings it
            produced.{' '}
            {hold.days === null
              ? 'Nothing is scheduled — it is kept until someone deletes it deliberately.'
              : `It becomes eligible for purge after ${hold.label}.`}{' '}
            <span className="text-slate-500 dark:text-slate-400">
              The Hub ID <span className="font-mono">{hub.id}</span> is retired with it and is never reissued.
            </span>
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ by: actor, reason: finalReason, retention })}
            disabled={!canConfirm}
            className="rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Decommission {hub.id}
          </button>
        </div>
      </div>
    </div>
  );
}
