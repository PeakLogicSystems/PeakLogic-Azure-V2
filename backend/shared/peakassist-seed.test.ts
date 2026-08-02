import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildPeakAssistSeedSql, contentChecksum } from './peakassist-seed';
import { PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION } from './peakassist-content';

// __dirname (= backend/shared) is provided by vitest's module runner; scripts/
// is a sibling of backend/, so ../../scripts reaches the migration.
const MIGRATION_PATH = path.resolve(__dirname, '..', '..', 'scripts', 'migrations', '1784142300000_peakassist-seed.sql');

// Line endings are normalized on BOTH sides before comparing. Without this the
// test fails on any Windows checkout: git applies core.autocrlf and rewrites
// the committed .sql with CRLF, while the generator always emits \n — so the
// golden comparison reports "drift" that is purely a checkout artifact, not a
// real corpus/migration divergence. Found 2026-08-01 when a routine
// main↔dev checkout round-trip re-materialized the file with CRLF and turned
// this guard red for the wrong reason. Normalizing keeps it sensitive to what
// it actually exists to catch (content drift) and blind to what it should not
// care about (how the working copy stores newlines).
const normalizeEol = (s: string) => s.replace(/\r\n/g, '\n');

describe('PeakAssist seed migration — golden file (single source of truth)', () => {
  it('the committed migration is exactly what the corpus generates (no drift)', () => {
    const onDisk = readFileSync(MIGRATION_PATH, 'utf8');
    const generated = buildPeakAssistSeedSql(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    // If this fails, regenerate the .sql from the corpus — never hand-edit it.
    expect(normalizeEol(onDisk)).toBe(normalizeEol(generated));
  });
});

describe('PeakAssist seed generator', () => {
  const sql = buildPeakAssistSeedSql(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);

  it('inserts one row per corpus item', () => {
    const contentRows = sql
      .split('\n')
      .filter((l) => l.startsWith("  ('") && l.includes(`'${PEAKASSIST_CONTENT_VERSION}')`));
    // one per help_content item; the bundle row uses a different column shape and is excluded by the version-suffix filter
    expect(contentRows.length).toBe(PEAKASSIST_CONTENT.length);
  });

  it('seeds the bundle row with the deterministic checksum', () => {
    const checksum = contentChecksum(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    expect(sql).toContain(`INSERT INTO help_content_bundles`);
    expect(sql).toContain(`'${PEAKASSIST_CONTENT_VERSION}', '${checksum}'`);
    expect(checksum).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it('is idempotent by re-seed (DELETE this version, then INSERT)', () => {
    const del = sql.indexOf(`DELETE FROM help_content WHERE content_version = '${PEAKASSIST_CONTENT_VERSION}'`);
    const ins = sql.indexOf('INSERT INTO help_content (help_context_key');
    expect(del).toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(del); // delete precedes insert in the Up migration
    expect(sql).toContain('-- Down Migration');
  });

  it('escapes single quotes in bodies (SQL-injection / syntax safe)', () => {
    const risky: typeof PEAKASSIST_CONTENT = [
      { id: 'x', helpContextKey: 'k', type: 'glossary', title: "O'Brien's valve", body: "it's a test with 'quotes'" },
    ];
    const out = buildPeakAssistSeedSql(risky, '2026.07.9');
    expect(out).toContain("'O''Brien''s valve'");
    expect(out).toContain("'it''s a test with ''quotes'''");
  });

  it('checksum is stable across runs and changes when content changes', () => {
    const a = contentChecksum(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    const b = contentChecksum(PEAKASSIST_CONTENT, PEAKASSIST_CONTENT_VERSION);
    expect(a).toBe(b);
    const mutated = [...PEAKASSIST_CONTENT, { id: 'z', helpContextKey: 'k', type: 'glossary' as const, title: 't', body: 'b' }];
    expect(contentChecksum(mutated, PEAKASSIST_CONTENT_VERSION)).not.toBe(a);
  });
});
