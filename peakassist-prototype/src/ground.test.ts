import { describe, it, expect } from 'vitest';
import { isRetrievalGrounded, checkCitations, formatContext, MIN_RETRIEVAL_SCORE, buildSystemPrompt } from './ground.js';
import type { SearchHit } from './index-store.js';

function hit(score: number, text = 'body text', title = 'Title'): SearchHit {
  return { score, chunk: { id: 'x', source: 'user-guide', title, text } };
}

describe('isRetrievalGrounded', () => {
  it('is false with no hits at all', () => {
    expect(isRetrievalGrounded([])).toBe(false);
  });

  it('is false when the best score is below the floor', () => {
    expect(isRetrievalGrounded([hit(MIN_RETRIEVAL_SCORE - 0.01)])).toBe(false);
  });

  it('is true when the best score meets or exceeds the floor', () => {
    expect(isRetrievalGrounded([hit(MIN_RETRIEVAL_SCORE)])).toBe(true);
    expect(isRetrievalGrounded([hit(0.9)])).toBe(true);
  });

  it('only looks at the top hit — a strong first result outweighs a weak second one', () => {
    expect(isRetrievalGrounded([hit(0.9), hit(0.01)])).toBe(true);
  });
});

describe('checkCitations', () => {
  it('reports uncited when no bracket marker is present', () => {
    const result = checkCitations('Just acknowledge the alarm in the panel.', 3);
    expect(result.cited).toBe(false);
    expect(result.citedIndexes).toEqual([]);
  });

  it('extracts valid citation indexes within range', () => {
    const result = checkCitations('Do X [1], then Y [2]. See also [1] again.', 3);
    expect(result.cited).toBe(true);
    expect(result.citedIndexes.sort()).toEqual([1, 2]);
  });

  it('ignores citation markers outside the retrieved-hit range (hallucinated reference)', () => {
    const result = checkCitations('According to [7], do this.', 3);
    expect(result.cited).toBe(false);
    expect(result.citedIndexes).toEqual([]);
  });
});

describe('formatContext / buildSystemPrompt', () => {
  it('numbers context passages starting at 1, matching the citation contract', () => {
    const text = formatContext([hit(0.6, 'first body'), hit(0.5, 'second body')]);
    expect(text).toContain('[1]');
    expect(text).toContain('[2]');
    expect(text).toContain('first body');
    expect(text).toContain('second body');
  });

  it('the system prompt states the refusal phrase and the citation requirement', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("I don't have that documented.");
    expect(prompt.toLowerCase()).toContain('cite');
  });
});
