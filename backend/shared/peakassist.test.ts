import { describe, it, expect } from 'vitest';
import { resolveHelp, resolveAlarmHelp, type HelpContentItem } from './peakassist';

const catalog: HelpContentItem[] = [
  { id: 'g1', helpContextKey: 'pv360.overview', type: 'glossary', title: 'Terms', body: '' },
  { id: 's1', helpContextKey: 'pv360.overview', type: 'screen_guide', title: 'About this screen', body: '' },
  { id: 'p1', helpContextKey: 'pv360.overview', type: 'procedure', title: 'Acknowledge an alarm', body: '' },
  { id: 't1', helpContextKey: 'pv360.overview', type: 'troubleshooting', title: 'No live data', body: '' },
  { id: 'a1', helpContextKey: 'pv360.alarms', type: 'alarm_explanation', title: 'Device silent', body: '', alarmType: 'device_silent' },
  { id: 'other', helpContextKey: 'pv360.hubs', type: 'screen_guide', title: 'Hubs', body: '' },
];

describe('resolveHelp', () => {
  it('returns only the requested context, screen guide first', () => {
    const help = resolveHelp(catalog, 'pv360.overview');
    expect(help.map((h) => h.id)).toEqual(['s1', 'p1', 't1', 'g1']); // guide, procedure, troubleshooting, glossary
    expect(help.every((h) => h.helpContextKey === 'pv360.overview')).toBe(true);
  });

  it('prepends the matching alarm explanation when opened from an alarm (PA-3.1)', () => {
    const help = resolveHelp(catalog, 'pv360.overview', { alarmType: 'device_silent' });
    expect(help[0].id).toBe('a1'); // the alarm explanation leads
  });

  it('does not duplicate the alarm explanation if it is already in-context', () => {
    const help = resolveHelp(catalog, 'pv360.alarms', { alarmType: 'device_silent' });
    expect(help.filter((h) => h.id === 'a1')).toHaveLength(1);
  });

  it('falls back gracefully when the alarm type has no explanation (no dead link)', () => {
    const help = resolveHelp(catalog, 'pv360.overview', { alarmType: 'nonexistent' });
    expect(help[0].id).toBe('s1'); // just the normal context ordering, no crash
  });

  it('returns an empty list for an unknown context', () => {
    expect(resolveHelp(catalog, 'nope')).toEqual([]);
  });
});

describe('resolveAlarmHelp', () => {
  it('finds the explanation for a known alarm type', () => {
    expect(resolveAlarmHelp(catalog, 'device_silent')?.id).toBe('a1');
  });
  it('returns null for an unknown alarm type', () => {
    expect(resolveAlarmHelp(catalog, 'anomaly')).toBeNull();
  });
});
