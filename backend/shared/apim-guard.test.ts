import { describe, it, expect } from 'vitest';
import { isDirectBackendCallAllowed } from './apim-guard';

describe('isDirectBackendCallAllowed', () => {
  it('allows any call when no secret is configured for this stage (not enforced yet)', () => {
    expect(isDirectBackendCallAllowed(undefined, undefined)).toBe(true);
    expect(isDirectBackendCallAllowed('anything', undefined)).toBe(true);
    expect(isDirectBackendCallAllowed(null, undefined)).toBe(true);
  });

  it('rejects a call with no header once a secret is configured', () => {
    expect(isDirectBackendCallAllowed(undefined, 'real-secret')).toBe(false);
    expect(isDirectBackendCallAllowed(null, 'real-secret')).toBe(false);
    expect(isDirectBackendCallAllowed('', 'real-secret')).toBe(false);
  });

  it('rejects a mismatched header once a secret is configured', () => {
    expect(isDirectBackendCallAllowed('wrong-secret', 'real-secret')).toBe(false);
  });

  it('allows a matching header once a secret is configured', () => {
    expect(isDirectBackendCallAllowed('real-secret', 'real-secret')).toBe(true);
  });

  it('rejects a header that differs only in length (no crash on the char-by-char loop)', () => {
    expect(isDirectBackendCallAllowed('real-secret-but-longer', 'real-secret')).toBe(false);
    expect(isDirectBackendCallAllowed('short', 'real-secret')).toBe(false);
  });
});
