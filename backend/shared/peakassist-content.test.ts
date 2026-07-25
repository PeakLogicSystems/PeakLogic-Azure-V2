import { describe, it, expect } from 'vitest';
import { resolveHelp, resolveAlarmHelp, type HelpType } from './peakassist';
import { PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION, SCREEN_CONTEXT_KEYS, EMITTED_ALARM_TYPES } from './peakassist-content';

const VALID_TYPES: HelpType[] = ['screen_guide', 'procedure', 'alarm_explanation', 'troubleshooting', 'playbook', 'glossary'];

describe('PeakAssist content — integrity', () => {
  it('has a sensible bundle version', () => {
    expect(PEAKASSIST_CONTENT_VERSION).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  });

  it('has unique ids', () => {
    const ids = PEAKASSIST_CONTENT.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only valid content types', () => {
    for (const c of PEAKASSIST_CONTENT) expect(VALID_TYPES).toContain(c.type);
  });

  it('every item has a non-empty title and body written in plain sentences', () => {
    for (const c of PEAKASSIST_CONTENT) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body.length).toBeGreaterThan(20);
    }
  });

  it('only alarm_explanation items carry an alarmType', () => {
    for (const c of PEAKASSIST_CONTENT) {
      if (c.alarmType) expect(c.type).toBe('alarm_explanation');
    }
  });
});

describe('PeakAssist content — governance (PA-7): every screen has a guide', () => {
  it.each(SCREEN_CONTEXT_KEYS)('screen "%s" resolves a screen guide first', (key) => {
    const help = resolveHelp(PEAKASSIST_CONTENT, key);
    expect(help.length).toBeGreaterThan(0);
    expect(help[0].type).toBe('screen_guide'); // guide leads (PA-2 ordering)
  });
});

describe('PeakAssist content — governance (PA-3): every emitted alarm type is explained', () => {
  it.each(EMITTED_ALARM_TYPES)('alarm type "%s" has a deep-linkable explanation', (alarmType) => {
    const explanation = resolveAlarmHelp(PEAKASSIST_CONTENT, alarmType);
    expect(explanation).not.toBeNull();
    expect(explanation!.type).toBe('alarm_explanation');
    expect(explanation!.alarmType).toBe(alarmType);
  });
});

describe('PeakAssist content — resolution behavior', () => {
  it('the operator screen offers guide → then how-to/troubleshooting, not alarm explanations', () => {
    const help = resolveHelp(PEAKASSIST_CONTENT, 'pv360.overview');
    expect(help[0].type).toBe('screen_guide');
    expect(help.some((h) => h.type === 'procedure')).toBe(true);
    expect(help.some((h) => h.type === 'troubleshooting')).toBe(true);
    // alarm explanations live in the pv360.alarms context, reached by deep-link
    expect(help.some((h) => h.type === 'alarm_explanation')).toBe(false);
  });

  it('opening help from an anomaly alarm prepends that explanation (PA-3)', () => {
    const help = resolveHelp(PEAKASSIST_CONTENT, 'pv360.overview', { alarmType: 'anomaly' });
    expect(help[0].type).toBe('alarm_explanation');
    expect(help[0].alarmType).toBe('anomaly');
  });

  it('an unknown alarm type falls back to the screen’s normal help (no dead link)', () => {
    const help = resolveHelp(PEAKASSIST_CONTENT, 'pv360.overview', { alarmType: 'prediction' });
    expect(help[0].type).toBe('screen_guide');
  });

  it('the glossary is populated under its own context', () => {
    const glossary = resolveHelp(PEAKASSIST_CONTENT, 'glossary');
    expect(glossary.length).toBeGreaterThanOrEqual(5);
    expect(glossary.every((g) => g.type === 'glossary')).toBe(true);
  });
});
