/**
 * PeakAssist — contextual help resolution. PRD §5.22 (PA-2.1/PA-3.1) / SRS
 * §3.24, Domain Model §2.14. Pure: given the help-content catalog and the
 * context the user is in, decide WHAT to show and in WHAT ORDER. No I/O — the
 * catalog is loaded by the caller (from the DB in the cloud, or from the
 * Hub's bundled offline copy, PA-4.1; identical content model both ways).
 *
 * Ordering realizes PA-2.1 ("lead with this screen's guidance"): a screen
 * guide first, then the how-to procedures, then troubleshooting, then the
 * rest. When the user opened Help from an active alarm (PA-3.1), that alarm's
 * explanation is pulled to the very front regardless of type ordering.
 */

export type HelpType =
  | 'screen_guide'
  | 'procedure'
  | 'alarm_explanation'
  | 'troubleshooting'
  | 'playbook'
  | 'glossary';

export interface HelpContentItem {
  id: string;
  helpContextKey: string;
  type: HelpType;
  title: string;
  body: string;
  alarmType?: string | null; // set on 'alarm_explanation' items; links an alerts.type value
}

// Lead with the screen guide, then actionable how-tos, then troubleshooting,
// then playbooks; alarm explanations and the glossary sit last in the default
// context view (an alarm explanation is normally reached by its deep-link, PA-3.1).
const TYPE_ORDER: Record<HelpType, number> = {
  screen_guide: 0,
  procedure: 1,
  troubleshooting: 2,
  playbook: 3,
  alarm_explanation: 4,
  glossary: 5,
};

/**
 * The ordered help for a screen/page context.
 *
 * @param opts.alarmType when Help was opened from an active alarm, the
 *   matching alarm explanation (found anywhere in the catalog, not only in
 *   this context) is prepended so the operator sees "what this alarm means"
 *   first (PA-3.1).
 */
export function resolveHelp(
  catalog: HelpContentItem[],
  contextKey: string,
  opts: { alarmType?: string | null } = {},
): HelpContentItem[] {
  const forContext = catalog
    .filter((c) => c.helpContextKey === contextKey)
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.title.localeCompare(b.title));

  if (!opts.alarmType) return forContext;

  const alarmHelp = resolveAlarmHelp(catalog, opts.alarmType);
  if (!alarmHelp) return forContext;

  // Prepend the alarm explanation; never duplicate it if it was already in
  // this context's list.
  return [alarmHelp, ...forContext.filter((c) => c.id !== alarmHelp.id)];
}

/**
 * The explanation for a specific alarm type (PA-3.1 deep-link target), or
 * null if the catalog has none for it — the caller falls back to the context
 * index or the top-level index (PA-2.1 error condition), never a dead link.
 */
export function resolveAlarmHelp(catalog: HelpContentItem[], alarmType: string): HelpContentItem | null {
  return catalog.find((c) => c.type === 'alarm_explanation' && c.alarmType === alarmType) ?? null;
}
