// One-off manual check of retrieval quality against the real built index —
// not part of the shipped CLI, just a fast way to eyeball relevance before
// wiring the (slow to download) generation model on top.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embed } from './embed.js';
import { loadIndex, search } from './index-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'index.json');

const QUESTIONS = [
  'How do I acknowledge an alarm?',
  'What does a threshold alarm mean?',
  'How does row-level security work for tenant isolation?',
  'What is the weather in Paris tomorrow?', // deliberately out-of-scope
];

async function main() {
  const index = loadIndex(INDEX_PATH);
  for (const q of QUESTIONS) {
    const qVec = await embed(q);
    const hits = search(index, qVec, 3);
    console.log(`\nQ: ${q}`);
    for (const h of hits) {
      console.log(`  [${h.score.toFixed(3)}] (${h.chunk.source}) "${h.chunk.title}" — ${h.chunk.text.slice(0, 100)}...`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
