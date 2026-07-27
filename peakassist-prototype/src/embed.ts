// Local embeddings via @huggingface/transformers (the maintained v3 successor
// to @xenova/transformers) — no Azure OpenAI, no API key, no network call
// per-request. The model (Xenova/all-MiniLM-L6-v2, ~90MB) is downloaded once
// to the local Hugging Face cache and then runs fully offline. This is the
// "embed-once, cheap" half of §3/§11's cost posture, just running on a laptop
// instead of Azure OpenAI's embedding endpoint.

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = (await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
    )) as FeatureExtractionPipeline;
  }
  return extractor;
}

/** Embeds one string to a normalized 384-dim vector (mean-pooled, L2-normalized — the standard sentence-embedding recipe for this model). */
export async function embed(text: string): Promise<number[]> {
  const model = await getExtractor();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

/** Embeds many strings sequentially. Kept simple (no batching) — the corpus here is small (a few hundred chunks), not worth the complexity. */
export async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) out.push(await embed(t));
  return out;
}
