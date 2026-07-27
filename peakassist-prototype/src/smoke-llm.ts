// One-off check that the local Phi-3 model downloads, loads, and generates
// at all, before wiring it into the full orchestrator. First run downloads
// ~1.7GB (q4 ONNX weights) from Hugging Face — a one-time, local-only cost,
// no cloud spend.
import { generate } from './llm.js';

async function main() {
  console.log('Loading Phi-3-mini-4k-instruct (Xenova, q4)... first run downloads ~1.7GB, please wait.');
  const start = Date.now();
  const answer = await generate(
    'You are a concise assistant. Answer in one short sentence.',
    'What is the capital of France?',
  );
  console.log(`\nGenerated in ${((Date.now() - start) / 1000).toFixed(1)}s:`);
  console.log(answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
