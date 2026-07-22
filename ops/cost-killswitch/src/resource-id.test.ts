import { describe, it, expect } from 'vitest';
import { parsePostgresServerId, buildStopUrl, POSTGRES_ARM_API_VERSION } from './resource-id';

const VALID_ID = '/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/peaklogic-dev-rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/peaklogic-dev-pg-ab12cd';

describe('parsePostgresServerId', () => {
  it('extracts subscriptionId, resourceGroupName, and serverName from a well-formed resource id', () => {
    const ref = parsePostgresServerId(VALID_ID);
    expect(ref).toEqual({
      subscriptionId: '11111111-1111-1111-1111-111111111111',
      resourceGroupName: 'peaklogic-dev-rg',
      serverName: 'peaklogic-dev-pg-ab12cd',
    });
  });

  it('is case-insensitive on the provider/resource-type segments (ARM itself is)', () => {
    const lower = VALID_ID.toLowerCase();
    expect(() => parsePostgresServerId(lower)).not.toThrow();
  });

  it('tolerates surrounding whitespace (e.g. a value pasted from an env var/App Setting)', () => {
    expect(parsePostgresServerId(`  ${VALID_ID}  `)).toEqual(parsePostgresServerId(VALID_ID));
  });

  it('rejects a resource id for a different resource type rather than silently misparsing it', () => {
    const vmId = '/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/peaklogic-dev-rg/providers/Microsoft.Compute/virtualMachines/some-vm';
    expect(() => parsePostgresServerId(vmId)).toThrow(/Not a valid Postgres Flexible Server resource id/);
  });

  it('rejects a malformed/truncated id rather than guessing partial values', () => {
    expect(() => parsePostgresServerId('/subscriptions/abc/resourceGroups/rg')).toThrow();
    expect(() => parsePostgresServerId('')).toThrow();
    expect(() => parsePostgresServerId('not-a-resource-id-at-all')).toThrow();
  });

  it('rejects a resource id with a trailing child segment (e.g. accidentally pointing at a sub-resource)', () => {
    expect(() => parsePostgresServerId(`${VALID_ID}/databases/peaklogic`)).toThrow();
  });
});

describe('buildStopUrl', () => {
  it('builds the exact expected ARM stop-action URL', () => {
    const ref = parsePostgresServerId(VALID_ID);
    const url = buildStopUrl(ref);
    expect(url).toBe(
      'https://management.azure.com/subscriptions/11111111-1111-1111-1111-111111111111' +
      '/resourceGroups/peaklogic-dev-rg' +
      '/providers/Microsoft.DBforPostgreSQL/flexibleServers/peaklogic-dev-pg-ab12cd' +
      `/stop?api-version=${POSTGRES_ARM_API_VERSION}`,
    );
  });

  it('allows overriding the api-version explicitly', () => {
    const ref = parsePostgresServerId(VALID_ID);
    expect(buildStopUrl(ref, '2099-01-01')).toContain('api-version=2099-01-01');
  });
});
