import { describe, it, expect } from 'vitest';
import { checkHubAgentIntegrity } from './hub-integrity';

describe('checkHubAgentIntegrity', () => {
  const known = ['edge-v0.1.0', 'edge-v0.1.1'];

  it('is in_sync when the reported version is in the known-published set', () => {
    expect(checkHubAgentIntegrity('edge-v0.1.1', known)).toEqual({
      status: 'in_sync',
      reportedVersion: 'edge-v0.1.1',
    });
  });

  it('is unreported when no version has been reported yet (not tamper)', () => {
    expect(checkHubAgentIntegrity(null, known)).toEqual({ status: 'unreported', reportedVersion: null });
    expect(checkHubAgentIntegrity(undefined, known)).toEqual({ status: 'unreported', reportedVersion: null });
    expect(checkHubAgentIntegrity('', known)).toEqual({ status: 'unreported', reportedVersion: null });
  });

  it('is unexpected when the reported version was never published — the tamper signal', () => {
    expect(checkHubAgentIntegrity('edge-v9.9.9', known)).toEqual({
      status: 'unexpected',
      reportedVersion: 'edge-v9.9.9',
    });
  });

  it('is case-sensitive — a version string is an exact identifier, not free text', () => {
    expect(checkHubAgentIntegrity('EDGE-V0.1.1', known).status).toBe('unexpected');
  });

  it('defaults to the real KNOWN_HUB_AGENT_VERSIONS list when none is passed', () => {
    expect(checkHubAgentIntegrity('edge-v0.1.1').status).toBe('in_sync');
    expect(checkHubAgentIntegrity('not-a-real-version').status).toBe('unexpected');
  });
});
