// SET-3/SET-4 (PRD/SRS v1.6) — formatting utilities so a user's clock
// format (12h/24h) and timezone preference actually change what's
// rendered, instead of being settings that exist but do nothing (the bug
// this file exists to fix: PreferencesContext held the values, but nothing
// in Dashboard/DeviceDetail ever read them when rendering a date).

export interface DateTimePrefs {
  clockFormat: '12h' | '24h';
  timezone: string;
}

export function formatClock(date: Date, prefs: DateTimePrefs): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: prefs.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: prefs.clockFormat === '12h',
  }).format(date);
}

// Short label for chart axes — e.g. "14:00" or "2 PM", never includes the date.
export function formatHourLabel(date: Date, prefs: DateTimePrefs): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: prefs.timezone,
    hour: 'numeric',
    minute: prefs.clockFormat === '24h' ? '2-digit' : undefined,
    hour12: prefs.clockFormat === '12h',
  }).format(date);
}

// Full date + time + zone abbreviation, e.g. "Sun, Jul 12, 2026, 2:30 PM CDT"
// — used for the "current time" indicator so a user can immediately see a
// timezone/clock-format change take effect, not just infer it from a chart.
export function formatFullDateTime(date: Date, prefs: DateTimePrefs): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: prefs.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: prefs.clockFormat === '12h',
    timeZoneName: 'short',
  }).format(date);
}

// Curated fallback for the rare browser without Intl.supportedValuesOf
// ('timeZone') — one representative zone per standard UTC offset band, not
// an exhaustive IANA list, so timezone selection still works everywhere,
// just with less precision than the full list below.
const FALLBACK_ZONES = [
  'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Athens',
  'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

export interface TimezoneOption {
  value: string;
  label: string;
  offsetMinutes: number;
}

// Full standard IANA timezone database via Intl.supportedValuesOf — ~400
// real zones, not a hand-picked shortlist. This is what SET-4's "enterprise
// credibility" ask actually means: the same timezone picker a customer
// would expect from any serious enterprise SaaS product, not 6 US cities.
export function getTimezoneOptions(referenceDate: Date = new Date()): TimezoneOption[] {
  const zones: string[] =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : FALLBACK_ZONES;

  const options = zones.map((tz): TimezoneOption => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(referenceDate);
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value ?? 'UTC';
    const offsetMinutes = parseGmtOffsetToMinutes(offsetPart);
    const cityLabel = tz.replace(/_/g, ' ').split('/').slice(1).join(' – ') || tz;
    return {
      value: tz,
      label: `(${normalizeOffsetLabel(offsetPart)}) ${cityLabel}`,
      offsetMinutes,
    };
  });

  return options.sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label));
}

function parseGmtOffsetToMinutes(offset: string): number {
  const match = offset.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + minutes);
}

function normalizeOffsetLabel(offset: string): string {
  // Intl gives "GMT+5:30" / "GMT-8" — normalize to "UTC+05:30" / "UTC-08:00"
  const match = offset.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 'UTC+00:00';
  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = (match[3] ?? '00').padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
