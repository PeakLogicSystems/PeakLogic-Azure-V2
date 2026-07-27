// Phase 1 orchestrator (architecture doc §2.2/§13 Phase 1): "Product-KB RAG
// (how-to), read-only — index code+guides+PEAKASSIST_CONTENT; orchestrator;
// Phi-3.5 grounded answers + citations; resolver stays the fallback."
//
// Flow 1 from §2.3 ("How do I add a new device to a lift station?"):
//   embed query -> hybrid search product KB -> top-k chunks -> Phi-3.5
//   synthesizes, grounded ONLY in retrieved chunks -> groundedness check ->
//   answer + citations, or refuse.
//
// This prototype's hybrid search is vector-only (no BM25/semantic-ranker —
// Azure AI Search's job in production, §4.3); the groundedness check is the
// two mechanical gates in ground.ts, not a semantic judge model (§12/§14).
import { embed } from './embed.js';
import { generate } from './llm.js';
import { search, type IndexedChunk } from './index-store.js';
import {
  buildSystemPrompt,
  buildUserPrompt,
  checkCitations,
  isRetrievalGrounded,
  REFUSAL,
  MIN_RETRIEVAL_SCORE,
} from './ground.js';
import { resolveHelpForContext } from './resolver-bridge.js';

export type AnswerStatus = 'grounded' | 'refused-low-retrieval' | 'refused-uncited';

export interface AskResult {
  status: AnswerStatus;
  answer: string;
  hits: { source: string; title: string; score: number }[];
  citedIndexes: number[];
  generationMs: number;
  attempts: number;
}

const TOP_K = 5;
// §3's escalation policy: "escalate ... when the groundedness check on the
// SLM answer fails twice." Phase 1 has no bigger-model escalation target
// built yet (that's Phase 6) — but the retry-before-giving-up half of that
// policy is real and testable now. A real run surfaced exactly this case:
// Phi-3-mini produced a substantively correct, well-grounded answer but
// didn't reliably follow the "[n]" citation format on the first attempt
// (src/orchestrator.test.ts documents this with a mocked generate()).
const MAX_ATTEMPTS = 2;

export async function ask(index: IndexedChunk[], question: string): Promise<AskResult> {
  const queryVector = await embed(question);
  const hits = search(index, queryVector, TOP_K);
  const hitSummary = hits.map((h) => ({ source: h.chunk.source, title: h.chunk.title, score: h.score }));

  // Gate 1 — pre-generation score floor. Don't spend a generation call (cheap
  // here; a real Azure Foundry token cost in production, §11) on a question
  // the corpus plainly doesn't cover.
  if (!isRetrievalGrounded(hits)) {
    return {
      status: 'refused-low-retrieval',
      answer: `${REFUSAL} (best match scored ${hits[0]?.score.toFixed(2) ?? 'n/a'}, below the ${MIN_RETRIEVAL_SCORE} floor)`,
      hits: hitSummary,
      citedIndexes: [],
      generationMs: 0,
      attempts: 0,
    };
  }

  const userPrompt = buildUserPrompt(question, hits);
  let totalMs = 0;
  let lastAnswer = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const systemPrompt = buildSystemPrompt(attempt > 1);
    const start = Date.now();
    const answer = await generate(systemPrompt, userPrompt);
    totalMs += Date.now() - start;
    lastAnswer = answer;

    if (answer.trim().startsWith(REFUSAL)) {
      return { status: 'refused-low-retrieval', answer, hits: hitSummary, citedIndexes: [], generationMs: totalMs, attempts: attempt };
    }

    // Gate 2 — post-generation citation check. An answer with no citation
    // marker is flagged, not silently trusted, per the groundedness contract.
    const { cited, citedIndexes } = checkCitations(answer, hits.length);
    if (cited) {
      return { status: 'grounded', answer, hits: hitSummary, citedIndexes, generationMs: totalMs, attempts: attempt };
    }
    // else: fall through to the next attempt (if any) with a stronger reminder
  }

  return { status: 'refused-uncited', answer: lastAnswer, hits: hitSummary, citedIndexes: [], generationMs: totalMs, attempts: MAX_ATTEMPTS };
}

/**
 * The always-available deterministic floor (§0): if the RAG path refused, or
 * the caller already knows the screen context, show what the real resolver
 * would render — this never depends on the LLM at all.
 */
export async function fallbackToResolver(contextKey: string) {
  const items = await resolveHelpForContext(contextKey);
  return items.map((i) => ({ type: i.type, title: i.title, body: i.body }));
}
