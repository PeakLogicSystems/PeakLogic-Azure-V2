import type { PeakResponse } from './http';

// Corrected for the Azure port (review finding C2): CORS origin is no longer
// a hardcoded wildcard. It reads CORS_ALLOWED_ORIGIN (a single origin) and
// defaults to '*' ONLY if unset, with a loud comment that a real deployment
// must set it. For multi-origin (localhost + prod), the recommended
// enforcement point is the Azure Function App's own platform CORS config,
// which supports an allow-list natively — this in-code header is the
// per-response fallback, not the primary control.
const ALLOWED_ORIGIN = process.env.CORS_ALLOWED_ORIGIN ?? '*';

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  // X-Channel-Partner-Id added for the (not-yet-implemented) channel-partner-
  // manager acting-as header (API Specification §4.10 / Security Architecture §2.6).
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Channel-Partner-Id',
};

const json = (statusCode: number, body: unknown): PeakResponse => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

export const ok        = <T>(data: T)          => json(200, data);
export const created   = <T>(data: T)          => json(201, data);
export const noContent = (): PeakResponse      => ({ statusCode: 204, headers: CORS_HEADERS, body: '' });
export const badRequest  = (message: string)             => json(400, { message });
export const forbidden   = (message = 'Forbidden')       => json(403, { message });
export const notFound    = (message = 'Not found')       => json(404, { message });
export const conflict    = (message: string)             => json(409, { message });
export const serverError = (message = 'Internal error')  => json(500, { message });

export function parseBody<T>(body: string | null, isBase64: boolean): T {
  if (!body) throw Object.assign(new Error('Missing request body'), { statusCode: 400 });
  const raw = isBase64 ? Buffer.from(body, 'base64').toString('utf8') : body;
  return JSON.parse(raw) as T;
}
