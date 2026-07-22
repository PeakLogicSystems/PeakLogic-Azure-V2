import { describe, it, expect } from 'vitest';
import { isValidSecret } from './auth';

describe('isValidSecret', () => {
  it('accepts a matching secret', () => {
    expect(isValidSecret('correct-horse-battery-staple', 'correct-horse-battery-staple')).toBe(true);
  });

  it('rejects a non-matching secret of the same length', () => {
    expect(isValidSecret('correct-horse-battery-staplE', 'correct-horse-battery-staple')).toBe(false);
  });

  it('rejects a non-matching secret of a different length', () => {
    expect(isValidSecret('short', 'correct-horse-battery-staple')).toBe(false);
  });

  it('fails closed when nothing was provided by the caller', () => {
    expect(isValidSecret(null, 'correct-horse-battery-staple')).toBe(false);
    expect(isValidSecret(undefined, 'correct-horse-battery-staple')).toBe(false);
    expect(isValidSecret('', 'correct-horse-battery-staple')).toBe(false);
  });

  it('fails closed when the expected secret is unset (misconfigured deployment) — never "any secret works"', () => {
    expect(isValidSecret('anything-at-all', undefined)).toBe(false);
    expect(isValidSecret('anything-at-all', '')).toBe(false);
  });

  it('fails closed when both are empty/unset, rather than treating "nothing == nothing" as valid', () => {
    expect(isValidSecret('', '')).toBe(false);
    expect(isValidSecret(undefined, undefined)).toBe(false);
  });
});
