# PeakAssist Phase 1 Prototype — offline RAG how-to assistant

Validates the retrieval/groundedness contract from
[`docs/architecture/peakassist-intelligent-assistant-architecture.md`](../docs/architecture/peakassist-intelligent-assistant-architecture.md)
§13 Phase 1 and §15 next-step 2 — **with zero Azure spend.** Everything here
runs fully offline after a one-time model download: local embeddings, a
local vector index, and local Phi-3 generation. No API key, no cloud call,
no billing.

This does **not** replace the real, shipped deterministic resolver
(`backend/shared/peakassist.ts`) — it sits on top of it, exactly as the
architecture doc requires: **the resolver is the floor, the LLM is the
ceiling.** `npm run ask -- --context <key>` bypasses the LLM entirely and
shows what the real resolver returns.

## What's real here

- **The corpus is the actual shipped content** — `sysadmin-guides/PeakLogic_SysAdmin_Guide.html`,
  `user-guides/PeakLogic_User_Guide.html`, and `backend/shared/peakassist-content.ts`
  (`PEAKASSIST_CONTENT`), loaded directly from the repo (the corpus file is
  transpiled via esbuild and imported live — never hand-copied, so this can
  never drift from the real source of truth).
- **Embeddings are real and local** — `Xenova/all-MiniLM-L6-v2` via
  `@huggingface/transformers`, downloaded once (~90MB) then fully offline.
- **Generation is real and local** — see "Model substitution" below.
- **The deterministic resolver bridge calls the real, unmodified
  `resolveHelp()`** from `backend/shared/peakassist.ts` — not a reimplementation.
- **Two real, mechanical groundedness gates** (architecture doc §4.3, §14
  risk 2), calibrated against this actual corpus:
  1. **Pre-generation score floor** — if the best retrieved chunk scores
     below `MIN_RETRIEVAL_SCORE` (0.35), the question is refused before any
     generation call. Calibrated from real measurements: in-corpus questions'
     top hits scored 0.47–0.66; a deliberately out-of-scope question ("what's
     the weather in Paris") scored 0.21–0.25 — a wide, clean gap.
  2. **Post-generation citation check** — the prompt requires `[n]` citation
     markers tied to the numbered context passages; an answer with none is
     flagged `refused-uncited` rather than silently trusted.

## Model substitution (disclosed)

The architecture doc's production target is **Phi-3.5-mini-instruct**. This
prototype runs **Phi-3-mini-4k-instruct** (`Xenova/Phi-3-mini-4k-instruct`,
same Phi-3 family, same 3.8B-parameter class) instead, for one real,
mechanical reason: the only Phi-3.5-mini ONNX conversion suitable for
`transformers.js` (`onnx-community/Phi-3.5-mini-instruct-onnx-web`) is
packaged for the browser/WASM runtime — its `provider_options` target `web`,
and it triggers a real `onnxruntime-node` bug with empty float16 KV-cache
tensors on the very first forward pass (`Tensor.data must be a typed array
(4)... but got (11)`). `Xenova/Phi-3-mini-4k-instruct`'s plain `q4`
quantization (no separate float16 KV-cache path) runs cleanly under
`onnxruntime-node`. Swap back to Phi-3.5-mini once a Node-compatible
conversion exists, or once production moves to Azure AI Foundry hosting
(§3) — this substitution is a laptop-inference limitation, not an
architecture change.

## Setup

```bash
cd peakassist-prototype
npm install
npm run build-index    # loads + chunks + embeds the real corpus (~266 chunks); ~90MB model download, first run only
npm run ask -- "How do I acknowledge an alarm?"
npm run ask -- --context pv360.overview    # the deterministic resolver floor, no LLM
npm test                # 21 tests: chunking, groundedness gates, the real resolver bridge, real-corpus retrieval quality
```

First `ask` also downloads the ~1.7GB Phi-3 weights (one time, cached
locally afterward).

## Real results from actually running this (not projected)

- **Retrieval, real corpus:** "How do I acknowledge an alarm?" → top hit is
  the exact matching PEAKASSIST_CONTENT procedure at **0.662** similarity.
  "What is the weather in Paris tomorrow?" (deliberately out-of-scope) → top
  hit **0.253** — a wide, clean gap that makes the 0.35 grounding floor a real
  signal, not an arbitrary number.
- **Gate 1 (pre-generation refusal) confirmed live:** the out-of-scope
  question is refused in 0.0s — no generation call made at all.
- **Gate 2 (citation retry) confirmed live — twice — and it's the most
  important finding this prototype produced.** On two separate real runs of
  "How do I acknowledge an alarm?", Phi-3-mini produced a genuinely correct,
  well-grounded answer both times — it reproduced the real procedure's 4
  steps accurately and even cross-referenced a second retrieved source (the
  "Coming soon" Acknowledge-button caveat from the User Guide) — but included
  **zero `[n]` citation markers on any attempt**, including the retry with an
  explicit, blunt reminder ("your previous answer did not include any [n]
  citation markers... do not skip this"). Total: 2 attempts, both uncited,
  478.4s, correctly returned as `refused-uncited` rather than silently
  trusted. **This is real, concrete evidence — not a hypothetical — for why
  the architecture doc specs a bigger-model escalation tier (§3): retrying
  the same small model with a stronger prompt was not sufficient to fix a
  citation-format failure that repeated consistently across independent
  runs.** A model this size can be substantively grounded while structurally
  unable to reliably comply with a mechanical output format — exactly the
  case §3's "escalate to Claude via Foundry" tier exists for. Phase 1 has no
  escalation target built yet (that's Phase 6); this finding is the argument
  for building it, backed by a repeatable observation rather than a guess.
- **Generation latency, CPU-only, this hardware:** ~80s for a short prompt
  with no retrieved context; ~4-8 minutes per attempt for a full RAG prompt
  (5 retrieved passages + citation instructions) — two attempts took 478s
  total. This is a laptop-inference prototype for validating retrieval
  quality and the groundedness contract — not a latency benchmark for the
  production Azure AI Foundry-hosted path, which this number says nothing
  about.

## Known, disclosed limitations (not hidden)

- **Retrieval is vector-only**, not the hybrid vector+keyword+semantic-ranker
  search Azure AI Search provides in production (§4.3) — sufficient to prove
  the concept against this corpus size (266 chunks), not a substitute for
  the real search service at scale.
- **The citation check is mechanical, not semantic** — it confirms the
  answer references a provided passage number, not that every individual
  claim within the answer is actually supported by that passage. Production
  needs a real groundedness evaluator (Azure AI Content Safety, §12). The
  real run above shows exactly why this matters: a mechanically-uncited
  answer can still be substantively correct, and a semantic checker would
  catch that nuance where a bracket-parser can't.
- **No role-filtering, no tenant-scoped tools, no compliance module** —
  those are Phase 2+ (§13). This prototype is deliberately how-to-only.
- **`npm audit` reports transitive vulnerabilities** in `onnxruntime-node`'s
  dependency chain (`protobufjs`, `sharp` — both from parsing/image-handling
  code paths this prototype never exercises: no untrusted protobuf input, no
  image processing). Evaluated, not blindly fixed — a forced downgrade would
  break Phi-3 support entirely. Irrelevant to production, which runs on
  Azure AI Foundry/AI Search, not this local ONNX stack.
