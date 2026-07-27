// The "Azure AI Search" stand-in for this offline prototype: an in-memory
// vector index with cosine-similarity top-k search (architecture doc §4.3 —
// real hybrid vector+keyword search is the production target; a laptop
// prototype validating the retrieval/groundedness contract doesn't need
// Azure AI Search's semantic ranker to prove the concept). Persisted to a
// flat JSON file so `build-index` and `ask`/`cli` are separate steps, like
// the real "publish → reindex → serve" pipeline (§10.3).

import { readFileSync, writeFileSync } from 'node:fs';
import type { Chunk } from './chunk.js';

export interface IndexedChunk extends Chunk {
  vector: number[];
}

export interface SearchHit {
  chunk: Chunk;
  score: number; // cosine similarity, [-1, 1]; vectors are pre-normalized so this is a plain dot product
}

export function saveIndex(path: string, chunks: IndexedChunk[]): void {
  writeFileSync(path, JSON.stringify(chunks), 'utf-8');
}

export function loadIndex(path: string): IndexedChunk[] {
  return JSON.parse(readFileSync(path, 'utf-8')) as IndexedChunk[];
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Top-k nearest chunks to a (pre-normalized) query vector. */
export function search(index: IndexedChunk[], queryVector: number[], k: number): SearchHit[] {
  const scored = index.map((c) => ({ chunk: c as Chunk, score: dot(c.vector, queryVector) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
