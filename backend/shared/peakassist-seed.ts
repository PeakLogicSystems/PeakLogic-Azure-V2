/**
 * PeakAssist seed — SQL generator.
 *
 * Projects the authored corpus (`peakassist-content.ts`, the source of truth)
 * into a seed migration that populates the global `help_content` catalog + a
 * `help_content_bundles` row (PeakAssist Help System Architecture §3/§5). Pure:
 * `buildPeakAssistSeedSql()` returns the migration text; `scripts/migrations/
 * 1784142300000_peakassist-seed.sql` is its committed output, and
 * `peakassist-seed.test.ts` fails if the two ever diverge (so the corpus stays
 * the single source of truth — never hand-edit the .sql).
 *
 * Idempotent by re-seed: the Up migration DELETEs this content_version's rows
 * before INSERTing, so re-running replaces cleanly. `help_content.id` is a DB
 * UUID; the corpus's authoring ids (e.g. 'sg-fleet') are build-time keys and
 * are not stored — a DB row's identity is its UUID, which is all the resolver
 * needs.
 */

import type { HelpContentItem } from './peakassist';

// Field / record separators for the checksum serialization (ASCII US / RS —
// never present in help text), so item and field boundaries are unambiguous.
const FS = String.fromCharCode(31);
const RS = String.fromCharCode(30);

/**
 * Deterministic content checksum (FNV-1a). Order- and id-independent: a hash of
 * the CONTENT itself, so the same corpus reproduces the same value whether it
 * is hashed from the authored array or rebuilt from `help_content` rows (whose
 * ids are DB UUIDs and whose read order is arbitrary). This is what lets a Hub
 * verify a synced bundle against the recorded checksum (PA-5, see
 * peakassist-sync.ts). Pure, no crypto dependency; stable across platforms.
 */
export function contentChecksum(content: HelpContentItem[], version: string): string {
  const serialized =
    version +
    '\n' +
    content
      .map((c) => [c.helpContextKey, c.type, c.alarmType ?? '', c.title, c.body].join(FS))
      .sort()
      .join(RS);
  let h = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    h ^= serialized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'fnv1a-' + (h >>> 0).toString(16).padStart(8, '0');
}

/** Single-quote a SQL string literal (standard_conforming_strings on), or NULL. */
function sql(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
}

export function buildPeakAssistSeedSql(content: HelpContentItem[], version: string): string {
  const checksum = contentChecksum(content, version);
  const values = content
    .map(
      (c) =>
        `  (${sql(c.helpContextKey)}, ${sql(c.type)}, ${sql(c.title)}, ${sql(c.body)}, ${sql(c.alarmType ?? null)}, ${sql(version)})`,
    )
    .join(',\n');

  return `-- PeakAssist seed content (v1) — GENERATED from backend/shared/peakassist-content.ts.
-- Do NOT hand-edit. Regenerate from the corpus (the source of truth); the
-- golden-file test peakassist-seed.test.ts fails if this drifts from it.
--
-- Projects the authored help corpus into the global help_content catalog + a
-- help_content_bundles row (PeakAssist Help System Architecture §3/§5). Both
-- are global reference tables (non-RLS, PeakLogic-authored). Idempotent by
-- re-seed: the Up migration clears this content_version's rows before inserting.

-- Up Migration

INSERT INTO help_content_bundles (version, checksum, notes) VALUES
  (${sql(version)}, ${sql(checksum)}, ${sql(`PeakAssist v1 seed — ${content.length} items, generated from peakassist-content.ts`)})
ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum, notes = EXCLUDED.notes;

DELETE FROM help_content WHERE content_version = ${sql(version)};

INSERT INTO help_content (help_context_key, type, title, body, alarm_type, content_version) VALUES
${values};

-- Down Migration

DELETE FROM help_content WHERE content_version = ${sql(version)};
DELETE FROM help_content_bundles WHERE version = ${sql(version)};
`;
}
