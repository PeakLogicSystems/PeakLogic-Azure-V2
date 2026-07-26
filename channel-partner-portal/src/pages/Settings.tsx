import type { ReactNode } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { usePartner } from '@/PartnerContext';
import { useSettings } from '@/SettingsContext';

// Per-user settings — like the control surface's. Changes save immediately
// (persisted per user), so each user keeps their own theme + preferences.
export function Settings() {
  const { partner } = usePartner();
  const { settings, update } = useSettings();
  const u = partner.user;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Preferences for {u.name} · changes are saved automatically.</p>
      </div>

      <Card title="Appearance">
        <Row label="Theme" desc="Light or dark for this portal.">
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            <SegBtn active={settings.theme === 'light'} onClick={() => update({ theme: 'light' })}><Sun size={15} /> Light</SegBtn>
            <SegBtn active={settings.theme === 'dark'} onClick={() => update({ theme: 'dark' })}><Moon size={15} /> Dark</SegBtn>
          </div>
        </Row>
      </Card>

      <Card title="Notifications">
        <ToggleRow label="Email alerts" desc="Critical alarms and work-order updates by email." checked={settings.emailAlerts} onChange={(v) => update({ emailAlerts: v })} />
        <ToggleRow label="SMS alerts" desc="Text the on-call technician for critical alarms." checked={settings.smsAlerts} onChange={(v) => update({ smsAlerts: v })} />
        <ToggleRow label="Weekly digest" desc="A Monday summary of fleet health and open work." checked={settings.weeklyDigest} onChange={(v) => update({ weeklyDigest: v })} />
      </Card>

      <Card title="Account">
        <div className="space-y-1 text-sm">
          <Field label="Name" value={u.name} />
          <Field label="Role" value={u.role} />
          <Field label="Email" value={u.email} />
        </div>
        <p className="mt-3 text-xs text-slate-400">Account details are managed by your administrator.</p>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <Check size={14} /> Saved to this browser for {u.name}.
      </p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} desc={desc}>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? '' : 'bg-slate-300 dark:bg-slate-700'}`}
        style={checked ? { backgroundColor: 'var(--partner-primary)' } : undefined}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'left-0.5 translate-x-5' : 'left-0.5'}`} />
      </button>
    </Row>
  );
}

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'}`}
      style={active ? { backgroundColor: 'var(--partner-primary)' } : undefined}
    >
      {children}
    </button>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}
