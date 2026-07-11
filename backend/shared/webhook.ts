import * as dns from 'dns/promises';
import * as net from 'net';

// SSRF guard (Threat Model §4, found and fixed 2026-07-11) — both webhook
// call sites (backend/api/routes/tickets.ts's POST /v1/tickets webhookUrl
// field, and backend/ingest/handler.ts's tenant-settings-sourced auto
// webhook) previously called fetch() on a caller/tenant-supplied URL with
// zero validation. Any authenticated operator-or-higher user could make
// this VPC-attached Lambda send an outbound request anywhere they chose —
// internal network reconnaissance, or abusing this Lambda's AWS egress IP
// as a relay against a third party. Consolidated into one validated
// postWebhook() so both call sites get the same guard, not two copies that
// could drift.

export class UnsafeWebhookUrlError extends Error {}

/**
 * Rejects anything that isn't a plain https:// URL resolving to a public
 * (non-private, non-loopback, non-link-local, non-reserved) IP address.
 *
 * Deliberately https-only, not http — these are external, tenant-facing
 * integration endpoints, not an internal protocol that needs http for
 * legacy reasons.
 *
 * Real, disclosed limitation: this checks the IP the hostname resolves to
 * *at validation time*, immediately before the request. A DNS-rebinding
 * attack (the attacker's DNS server returns a public IP on this lookup,
 * then a private/internal IP on the actual TCP connection Node's fetch()
 * makes microseconds later) is not fully closed by this alone — a complete
 * fix would need a custom fetch dispatcher that re-validates the IP at
 * connection time, not just before. Judged disproportionate to build for
 * MVP scale; this closes the overwhelmingly more likely case (a caller
 * just directly supplying an internal/private URL) and is a real,
 * meaningful reduction in attack surface, not a complete one — see Threat
 * Model §4 for the accepted-residual-risk reasoning.
 */
export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeWebhookUrlError(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeWebhookUrlError(`Webhook URL must use https:// (got ${url.protocol})`);
  }

  const hostname = url.hostname;

  // A literal IP in the URL — check it directly, no DNS lookup needed.
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new UnsafeWebhookUrlError(`Webhook URL resolves to a private/reserved address: ${hostname}`);
    }
    return;
  }

  // A hostname — resolve it and check every returned address (a DNS
  // response can legitimately return multiple A/AAAA records).
  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new UnsafeWebhookUrlError(`Could not resolve webhook hostname: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new UnsafeWebhookUrlError(`Webhook hostname resolved to no addresses: ${hostname}`);
  }

  for (const address of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new UnsafeWebhookUrlError(
        `Webhook hostname ${hostname} resolves to a private/reserved address: ${address}`,
      );
    }
  }
}

/**
 * Covers the ranges that actually matter for SSRF: RFC 1918 private space,
 * loopback, link-local (169.254.0.0/16 — the range cloud metadata endpoints
 * live in), and a few less common but real reserved blocks. Not a
 * formally-verified complete IANA special-purpose-registry implementation —
 * a deliberate, documented scope limit (see assertSafeWebhookUrl's own
 * comment), not an oversight.
 */
export function isPrivateOrReservedIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;

    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 127) return true;                          // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;             // 169.254.0.0/16 link-local (cloud metadata range)
    if (a === 0) return true;                             // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;    // 100.64.0.0/10 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
    if (a === 192 && b === 0 && octets[2] === 0) return true; // 192.0.0.0/24 IETF protocol assignments
    if (a === 192 && b === 0 && octets[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a >= 224) return true;                            // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved

    return false;
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === '::1') return true;                          // loopback
    if (normalized === '::') return true;                           // unspecified
    if (normalized.startsWith('fe80:') || normalized.startsWith('fe8')) return true; // link-local fe80::/10
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;          // link-local fe80::/10 (full range)
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;          // fc00::/7 unique local
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — unwrap and re-check as IPv4.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);

    return false;
  }

  // Not a recognizable IP at all — fail closed, not open.
  return true;
}

interface WebhookPayload {
  event: string;
  ticket: Record<string, unknown>;
}

export async function postWebhook(url: string, payload: WebhookPayload): Promise<void> {
  await assertSafeWebhookUrl(url);

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });
}
