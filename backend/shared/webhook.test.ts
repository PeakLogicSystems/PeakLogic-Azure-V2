import { describe, it, expect } from 'vitest';
import { assertSafeWebhookUrl, isPrivateOrReservedIp, UnsafeWebhookUrlError } from './webhook';

describe('isPrivateOrReservedIp — pure range checks', () => {
  it.each([
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.15.255.255', false], // just outside 172.16.0.0/12
    ['172.32.0.0', false],     // just outside 172.16.0.0/12
    ['192.168.1.1', true],
    ['127.0.0.1', true],
    ['169.254.169.254', true], // the cloud-metadata address specifically
    ['169.254.170.2', true],   // Lambda's own credential-vending address
    ['0.0.0.0', true],
    ['100.64.0.1', true],
    ['224.0.0.1', true],       // multicast
    ['8.8.8.8', false],        // real public IP
    ['1.1.1.1', false],        // real public IP
    ['93.184.216.34', false],  // real public IP (example.com, historical)
  ])('%s -> private/reserved: %s', (ip, expected) => {
    expect(isPrivateOrReservedIp(ip)).toBe(expected);
  });

  it.each([
    ['::1', true],                                     // loopback
    ['fe80::1', true],                                  // link-local
    ['fc00::1', true],                                  // unique local
    ['fd12:3456:789a::1', true],                        // unique local
    ['::ffff:169.254.169.254', true],                   // IPv4-mapped metadata address
    ['2001:4860:4860::8888', false],                    // real public IPv6 (Google DNS)
  ])('%s -> private/reserved: %s', (ip, expected) => {
    expect(isPrivateOrReservedIp(ip)).toBe(expected);
  });
});

describe('assertSafeWebhookUrl', () => {
  it('rejects non-https schemes', async () => {
    await expect(assertSafeWebhookUrl('http://example.com/hook')).rejects.toThrow(UnsafeWebhookUrlError);
    await expect(assertSafeWebhookUrl('ftp://example.com/hook')).rejects.toThrow(UnsafeWebhookUrlError);
    await expect(assertSafeWebhookUrl('file:///etc/passwd')).rejects.toThrow(UnsafeWebhookUrlError);
  });

  it('rejects an unparseable URL', async () => {
    await expect(assertSafeWebhookUrl('not a url')).rejects.toThrow(UnsafeWebhookUrlError);
  });

  it('rejects a literal cloud-metadata IP — the exact SSRF payload this guard exists for', async () => {
    await expect(assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      UnsafeWebhookUrlError,
    );
  });

  it('rejects a literal private IP', async () => {
    await expect(assertSafeWebhookUrl('https://10.0.0.5/hook')).rejects.toThrow(UnsafeWebhookUrlError);
    await expect(assertSafeWebhookUrl('https://192.168.1.1/hook')).rejects.toThrow(UnsafeWebhookUrlError);
  });

  it('rejects "localhost" — resolves to a loopback address', async () => {
    await expect(assertSafeWebhookUrl('https://localhost/hook')).rejects.toThrow(UnsafeWebhookUrlError);
  });

  it('accepts a literal public IP with https', async () => {
    await expect(assertSafeWebhookUrl('https://8.8.8.8/hook')).resolves.toBeUndefined();
  });

  it('accepts a real public hostname (live DNS lookup, not mocked)', async () => {
    await expect(assertSafeWebhookUrl('https://example.com/hook')).resolves.toBeUndefined();
  });
});
