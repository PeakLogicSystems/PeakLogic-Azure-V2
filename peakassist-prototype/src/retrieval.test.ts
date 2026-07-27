import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { embed } from './embed.js';
import { loadIndex, search, type IndexedChunk } from './index-store.js';
import { isRetrievalGrounded } from './ground.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'index.json');

// Integration test against the REAL built index (run `npm run build-index`
// first) — validates retrieval quality against the actual shipped corpus,
// not a fixture. Skips cleanly if the index hasn't been built yet, rather
// than failing the whole suite on a missing artifact.
const indexExists = existsSync(INDEX_PATH);
const maybeDescribe = indexExists ? describe : describe.skip;

maybeDescribe('retrieval against the real built index', () => {
  let index: IndexedChunk[];

  beforeAll(() => {
    index = loadIndex(INDEX_PATH);
  });

  it('surfaces the exact "Acknowledge an alarm" procedure for that question', async () => {
    const q = await embed('How do I acknowledge an alarm?');
    const hits = search(index, q, 3);
    expect(hits[0].chunk.title.toLowerCase()).toContain('acknowledge');
    expect(isRetrievalGrounded(hits)).toBe(true);
  });

  it('surfaces alert/threshold documentation for "what does a threshold alarm mean"', async () => {
    const q = await embed('What does a threshold alarm mean?');
    const hits = search(index, q, 3);
    expect(isRetrievalGrounded(hits)).toBe(true);
    expect(hits.some((h) => /alert|threshold|alarm/i.test(h.chunk.title + h.chunk.text))).toBe(true);
  });

  it('scores a deliberately out-of-corpus question well below the grounding floor', async () => {
    const q = await embed('What is the weather in Paris tomorrow?');
    const hits = search(index, q, 3);
    expect(isRetrievalGrounded(hits)).toBe(false);
  });
});
