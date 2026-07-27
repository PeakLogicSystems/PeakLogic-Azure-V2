// Ask PeakAssist a question from the command line, end-to-end, against the
// real built index. Usage:
//   npm run ask -- "How do I acknowledge an alarm?"
//   npm run ask -- --context pv360.overview   (bypasses RAG — shows the
//                                               deterministic resolver floor
//                                               directly, as PeakView360
//                                               would render it)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex } from './index-store.js';
import { ask, fallbackToResolver } from './orchestrator.js';
import { listKnownContextKeys } from './resolver-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'data', 'index.json');

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--context') {
    const key = args[1];
    if (!key) {
      const keys = await listKnownContextKeys();
      console.log('Usage: npm run ask -- --context <key>\nKnown keys:', keys.join(', '));
      return;
    }
    console.log(`Deterministic resolver floor for context "${key}" (no LLM involved):\n`);
    const items = await fallbackToResolver(key);
    if (items.length === 0) {
      console.log('(nothing resolved for this context key)');
    }
    for (const item of items) {
      console.log(`— [${item.type}] ${item.title}\n  ${item.body}\n`);
    }
    return;
  }

  const question = args.join(' ').trim();
  if (!question) {
    console.log('Usage: npm run ask -- "your question here"');
    process.exit(1);
  }

  console.log('Loading index...');
  const index = loadIndex(INDEX_PATH);

  console.log(`Loading Phi-3-mini (first call only — cached after)...\n`);
  console.log(`Q: ${question}\n`);
  const result = await ask(index, question);

  console.log('Retrieved:');
  for (const h of result.hits) {
    console.log(`  [${h.score.toFixed(3)}] (${h.source}) "${h.title}"`);
  }
  console.log(`\nStatus: ${result.status}`);
  console.log(`Generation time: ${(result.generationMs / 1000).toFixed(1)}s`);
  console.log(`\nAnswer:\n${result.answer}`);
  if (result.citedIndexes.length) {
    console.log(`\nCited passages: ${result.citedIndexes.map((n) => `[${n}]`).join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
