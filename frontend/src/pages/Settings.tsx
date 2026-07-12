import { useState } from 'react';
import { Sun, Moon, Users, Shield, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

// API Specification §4.8 (SET-1 through SET-7, PRD/SRS v1.6). Mock-data
// only, matching every other page in this frontend today (CLAUDE.md: "All
// frontend pages currently use hardcoded mock data — they are not yet
// wired to the real API") — theme is the one exception, since it's real,
// client-side state (ThemeContext), not something a mock API response
// could stand in for.

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'UTC',
];

const MOCK_TEAM = [
  { id: '1', email: 'jane.ops@acme-water.com', display_name: 'Jane Rodriguez', role: 'admin' as const,    status: 'active' },
  { id: '2', email: 'mike.tech@acme-water.com', display_name: 'Mike Chen',      role: 'operator' as const, status: 'active' },
  { id: '3', email: 'sara.field@acme-water.com', display_name: 'Sara Patel',    role: 'operator' as const, status: 'active' },
];

const ROLE_BADGE: Record<string, string> = {
  admin:    'bg-brand-purple-soft text-brand-purple dark:bg-brand-purple/20 dark:text-brand-purple-mid',
  operator: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export function Settings() {
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState('Jane Rodriguez');
  const [clockFormat, setClockFormat] = useState<'12h' | '24h'>('24h');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [saved, setSaved] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    // PUT /v1/settings — mock submit, matching this frontend's not-yet-
    // wired-to-real-API convention (see file header note).
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your profile, preferences, and team</p>
      </div>

      {/* Profile & display preferences — SET-1/SET-3/SET-4/SET-5 */}
      <SectionCard title="Profile & Display Preferences" description="How your name and the monitoring clock appear across the app">
        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Clock format</label>
            <div className="flex gap-2">
              {(['12h', '24h'] as const).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setClockFormat(fmt)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    clockFormat === fmt
                      ? 'bg-brand-purple text-white border-brand-purple'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-brand-purple/50'
                  }`}
                >
                  {fmt === '12h' ? '12-hour (2:30 PM)' : '24-hour (14:30)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Time zone</label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple"
            >
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              Applies to alert timestamps and telemetry views — independent of any individual site's own configured time zone.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="bg-brand-purple text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-purple/90 transition-colors"
            >
              Save changes
            </button>
            {saved && <span className="text-xs text-brand-green font-medium">Saved</span>}
          </div>
        </form>
      </SectionCard>

      {/* Theme — SET-4 */}
      <SectionCard title="Appearance" description="Light or dark mode for the web app">
        <div className="flex gap-2">
          <button
            onClick={() => setTheme('light')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              theme === 'light'
                ? 'bg-brand-purple text-white border-brand-purple'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-brand-purple/50'
            }`}
          >
            <Sun size={15} /> Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              theme === 'dark'
                ? 'bg-brand-purple text-white border-brand-purple'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-brand-purple/50'
            }`}
          >
            <Moon size={15} /> Dark
          </button>
        </div>
      </SectionCard>

      {/* Security — SET-2/SET-6 */}
      <SectionCard title="Security">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <KeyRound size={16} className="text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Password</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Change your account password</p>
              </div>
            </div>
            <button className="text-sm font-medium text-brand-purple hover:underline">Change password</button>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <Shield size={16} className="text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Multi-factor authentication</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Required on every account (Security Architecture §2.2)</p>
              </div>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-green-soft text-green-700 dark:bg-green-500/15 dark:text-green-400">
              Enrolled
            </span>
          </div>
        </div>
      </SectionCard>

      {/* Team — SET-7, admin only in the real API (requireRole(auth, 'admin')) */}
      <SectionCard title="Team" description="Manage who has access to this account">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Users size={14} /> {MOCK_TEAM.length} members
          </span>
          <button className="flex items-center gap-1.5 text-sm font-medium text-brand-purple hover:underline">
            <Plus size={14} /> Invite member
          </button>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
              <tr>
                {['Name', 'Email', 'Role', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {MOCK_TEAM.map(member => (
                <tr key={member.id}>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{member.display_name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{member.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE[member.role]}`}>{member.role}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-gray-400 hover:text-red-500 transition-colors" title="Remove member">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
