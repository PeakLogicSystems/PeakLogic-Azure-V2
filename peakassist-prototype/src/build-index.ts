// The "publish" step (architecture doc §10.3): load the real corpus, chunk
// it, embed every chunk once, and persist the index. Run this once (or
// whenever the guides/corpus change) — `ask`/`cli` only ever load the
// pre-built index, never re-embed at query time (only the query itself is
// embedded live, per §4.3's "embed-once" cost discipline).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpus } from './corpus.js';
import { embed } from './embed.js';
import { saveIndex, type IndexedChunk } from './index-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'index.json');

async function main() {
  console.log('Loading corpus (SysAdmin Guide, User Guide, PEAKASSIST_CONTENT)...');
  const chunks = await loadCorpus();
  console.log(`Loaded ${chunks.length} chunks:`);
  const bySource = new Map<string, number>();
  for (const c of chunks) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
  for (const [source, count] of bySource) console.log(`  ${source}: ${count} chunks`);

  console.log('Embedding chunks (first run downloads Xenova/all-MiniLM-L6-v2, ~90MB, one time)...');
  const indexed: IndexedChunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const vector = await embed(chunks[i].text);
    indexed.push({ ...chunks[i], vector });
    if ((i + 1) % 25 === 0 || i === chunks.length - 1) {
      console.log(`  embedded ${i + 1}/${chunks.length}`);
    }
  }

  saveIndex(INDEX_PATH, indexed);
  console.log(`Wrote index: ${INDEX_PATH} (${indexed.length} chunks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
