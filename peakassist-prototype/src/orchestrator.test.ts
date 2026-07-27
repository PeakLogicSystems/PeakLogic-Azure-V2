// Tests the orchestrator's control flow (gating, retry-once-on-uncited)
// with the slow real model mocked out — a real end-to-end run (documented in
// README.md) is what proves the model itself works; this proves the ORCHESTRATION
// logic is correct, independent of how long generation takes. Directly
// documents a real finding from that live run: Phi-3-mini can produce a
// substantively correct, well-grounded answer while ignoring the
// citation-format instruction on the first attempt.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IndexedChunk } from './index-store.js';

const mockSearch = vi.fn();
const mockGenerate = vi.fn();

vi.mock('./embed.js', () => ({ embed: vi.fn(async () => [0.1, 0.2, 0.3]) }));
vi.mock('./index-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./index-store.js')>();
  return { ...actual, search: (...args: unknown[]) => mockSearch(...args) };
});
vi.mock('./llm.js', () => ({ generate: (...args: unknown[]) => mockGenerate(...args) }));

const { ask } = await import('./orchestrator.js');

const FAKE_INDEX: IndexedChunk[] = [];
const ONE_HIT = [{ chunk: { id: 'c1', source: 'peakassist-content' as const, title: 'Acknowledge an alarm', text: 'body' }, score: 0.66 }];
const LOW_HIT = [{ chunk: { id: 'c2', source: 'user-guide' as const, title: 'Unrelated', text: 'body' }, score: 0.2 }];

beforeEach(() => {
  mockSearch.mockReset();
  mockGenerate.mockReset();
});

describe('ask() orchestration', () => {
  it('refuses before generating when retrieval score is below the floor (Gate 1)', async () => {
    mockSearch.mockReturnValue(LOW_HIT);
    const result = await ask(FAKE_INDEX, 'irrelevant question');
    expect(result.status).toBe('refused-low-retrieval');
    expect(result.attempts).toBe(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('returns grounded immediately when the first attempt is cited', async () => {
    mockSearch.mockReturnValue(ONE_HIT);
    mockGenerate.mockResolvedValueOnce('Click Acknowledged [1].');
    const result = await ask(FAKE_INDEX, 'How do I acknowledge an alarm?');
    expect(result.status).toBe('grounded');
    expect(result.attempts).toBe(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('retries once with a strengthened prompt when the first attempt is uncited, and succeeds on the retry — the real case a live run surfaced', async () => {
    mockSearch.mockReturnValue(ONE_HIT);
    mockGenerate
      .mockResolvedValueOnce('Click Acknowledged to mark it as seen.') // real finding: correct content, no citation
      .mockResolvedValueOnce('Click Acknowledged [1] to mark it as seen.');
    const result = await ask(FAKE_INDEX, 'How do I acknowledge an alarm?');
    expect(result.status).toBe('grounded');
    expect(result.attempts).toBe(2);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    // The retry's system prompt (first arg of the second call) must contain the strengthened reminder.
    const secondCallSystemPrompt = mockGenerate.mock.calls[1][0] as string;
    expect(secondCallSystemPrompt).toContain('did not include any [n] citation markers');
  });

  it('gives up after two uncited attempts rather than retrying forever', async () => {
    mockSearch.mockReturnValue(ONE_HIT);
    mockGenerate.mockResolvedValue('Click Acknowledged to mark it as seen.'); // uncited every time
    const result = await ask(FAKE_INDEX, 'How do I acknowledge an alarm?');
    expect(result.status).toBe('refused-uncited');
    expect(result.attempts).toBe(2);
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('treats an explicit model refusal as refused, without a citation retry', async () => {
    mockSearch.mockReturnValue(ONE_HIT);
    mockGenerate.mockResolvedValueOnce("I don't have that documented.");
    const result = await ask(FAKE_INDEX, 'How do I acknowledge an alarm?');
    expect(result.status).toBe('refused-low-retrieval');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
