// Local generation via @huggingface/transformers (the maintained v3
// successor to @xenova/transformers — needed here because v2 doesn't
// support the `phi3` architecture at all) — Phi-3.5-mini-instruct (Microsoft
// SLM, architecture doc §3's grounded default), running fully offline after a
// one-time download. No Azure Foundry endpoint, no per-token cloud cost.
//
// This is Phase 1's one deliberate, disclosed substitution: the design doc's
// production target is Azure AI Foundry serverless hosting for Phi-3.5-mini;
// here it's the same model weights (Microsoft's own ONNX release), run
// locally via ONNX Runtime instead, because Phase 1's whole point is proving
// the RAG/groundedness contract with zero cloud spend (§15 item 2).

import { pipeline, type TextGenerationPipeline } from '@huggingface/transformers';

// Disclosed substitution: the onnx-community "-web" packaging of
// Phi-3.5-mini-instruct (q4f16) hits a real onnxruntime-node bug — the
// native addon can't handle the empty float16 KV-cache tensors that
// packaging produces on the first forward pass ("Tensor.data must be a typed
// array (4)... but got (11)"), because that repo's provider_options target
// the browser/WASM runtime, not onnxruntime-node. Xenova/Phi-3-mini-4k-instruct
// is the same Phi-3 model family (3.8B, architecture `phi3`), converted with
// plain int4 quantization (no separate fp16 KV-cache path) — this is the
// variant that actually runs under onnxruntime-node. Swap back to
// Phi-3.5-mini once a Node-compatible conversion of it exists, or once
// production moves to Azure AI Foundry hosting (§3) where this doesn't apply.
const MODEL_ID = 'Xenova/Phi-3-mini-4k-instruct';

let generator: TextGenerationPipeline | null = null;

async function getGenerator(): Promise<TextGenerationPipeline> {
  if (!generator) {
    generator = (await pipeline('text-generation', MODEL_ID, {
      dtype: 'q4',
    } as never)) as TextGenerationPipeline;
  }
  return generator;
}

export interface GenerateOptions {
  maxNewTokens?: number;
}

/**
 * Chat-style generation using Phi-3.5's own chat template (system + user
 * turns). Returns only the newly generated assistant text, not the echoed
 * prompt.
 */
export async function generate(
  systemPrompt: string,
  userPrompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const model = await getGenerator();
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const output = await model(messages as never, {
    max_new_tokens: opts.maxNewTokens ?? 350,
    do_sample: false, // deterministic — a grounded assistant shouldn't roll dice on facts
  } as never);

  // With chat-formatted input, transformers.js returns `generated_text` as
  // the FULL message list (system/user/assistant), not a plain string — the
  // new assistant turn is the last entry. `return_full_text` only affects
  // plain-string (non-chat) generation, so it's not used here.
  const result = output as unknown as { generated_text: string | { role: string; content: string }[] }[];
  const generated = result[0].generated_text;
  if (typeof generated === 'string') return generated.trim();
  const last = generated[generated.length - 1];
  return last.content.trim();
}
