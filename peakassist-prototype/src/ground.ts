// The groundedness contract (architecture doc §4.3 / §14 risk 2): "answer
// only from retrieved context; if it isn't there, say so; every claim should
// trace to a citation." Two real, mechanical checks — not a semantic judge
// model (that's the production Content Safety/groundedness-evaluator piece,
// §12/§14, not reproducible offline in Phase 1):
//
//  1. PRE-GENERATION SCORE GATE — if the best retrieved chunk doesn't clear a
//     similarity floor, don't even call the model; refuse up front. Calibrated
//     against this corpus: in-scope questions' top hit scored 0.47-0.66;  a
//     deliberately out-of-scope question ("what's the weather in Paris")
//     scored 0.21-0.25 — a clean, wide gap (see src/smoke-retrieval.ts).
//  2. POST-GENERATION CITATION CHECK — the prompt requires the model to cite
//     retrieved chunks as [1]/[2]/[3]; if the answer contains no such marker,
//     it's flagged uncited rather than silently trusted.
import type { SearchHit } from './index-store.js';

export const MIN_RETRIEVAL_SCORE = 0.35;

export const REFUSAL = "I don't have that documented.";

export function isRetrievalGrounded(hits: SearchHit[]): boolean {
  return hits.length > 0 && hits[0].score >= MIN_RETRIEVAL_SCORE;
}

/** Numbers the retrieved chunks for the prompt AND for the citation check afterward. */
export function formatContext(hits: SearchHit[]): string {
  return hits
    .map((h, i) => `[${i + 1}] (${h.chunk.source} — "${h.chunk.title}")\n${h.chunk.text}`)
    .join('\n\n');
}

/**
 * @param strengthenCitation — set on a retry (architecture doc §3: "escalate
 * ... when the groundedness check fails twice" implies retrying once first).
 * A real run showed Phi-3-mini can produce a substantively correct answer
 * while ignoring the citation-format instruction on the first pass — this
 * gives it one more explicit, blunt reminder before the orchestrator gives up.
 */
export function buildSystemPrompt(strengthenCitation = false): string {
  const base = [
    'You are PeakAssist, a help assistant for the PeakLogic industrial IoT platform.',
    'Answer ONLY using the numbered context passages provided below the question.',
    'Cite every factual claim with its passage number in brackets, e.g. [1].',
    `If the answer is not contained in the context, reply with exactly: "${REFUSAL}"`,
    'Write in plain, operator-friendly language — short sentences, step-by-step where relevant.',
  ];
  if (strengthenCitation) {
    base.push(
      'IMPORTANT: your previous answer did not include any [n] citation markers. This answer MUST include at least one, e.g. "...click Acknowledged [1]." Do not skip this.',
    );
  }
  return base.join(' ');
}

export function buildUserPrompt(question: string, hits: SearchHit[]): string {
  return `Context:\n${formatContext(hits)}\n\nQuestion: ${question}`;
}

export interface GroundednessResult {
  cited: boolean;
  citedIndexes: number[];
}

/** Mechanical check: does the answer contain at least one [n] citation matching a provided chunk? */
export function checkCitations(answer: string, hitCount: number): GroundednessResult {
  const matches = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const valid = matches.filter((n) => n >= 1 && n <= hitCount);
  return { cited: valid.length > 0, citedIndexes: [...new Set(valid)] };
}
