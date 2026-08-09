import type { HttpRequest } from '@azure/functions';

// Cloud-neutral request/response shapes for the API layer — the Azure port's
// replacement for AWS's APIGatewayProxyEvent/APIGatewayProxyResult.
//
// Deliberately keeps the SAME field names the route handlers already read
// (`pathParameters`, `queryStringParameters`, `body`, `isBase64Encoded`,
// `httpMethod`) so porting a route handler is a type-import change only —
// the handler bodies are unchanged. `resource` (the AWS API Gateway resource
// TEMPLATE, e.g. /v1/devices/{deviceId}) has no Azure Functions equivalent;
// the router (api/match.ts) reconstructs the template match from the actual
// path instead, so it's dropped from this shape and `path` (the actual
// request path, e.g. /v1/devices/abc-123) is added.

export interface PeakRequest {
  httpMethod: string;
  /** Actual request path, e.g. `/v1/devices/abc-123`. */
  path: string;
  /** Filled in by the route matcher (api/match.ts) after a template matches. */
  pathParameters: Record<string, string> | null;
  queryStringParameters: Record<string, string> | null;
  headers: Record<string, string>;
  body: string | null;
  /** Always false on Azure Functions — kept so `parseBody(body, isBase64Encoded)` call sites don't change. */
  isBase64Encoded: boolean;
}

export interface PeakResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Normalizes an Azure Functions v4 HttpRequest into a PeakRequest. The
 * single catch-all Function (api/api.main.ts) calls this once per request before
 * handing off to the dispatcher.
 *
 * `path` is taken from the URL pathname, which is `/v1/...` provided
 * host.json sets an empty HTTP route prefix (default is `/api/`). See
 * host.json — the API Specification's routes are all `/v1/*`, so the prefix
 * must be cleared or every path would be `/api/v1/*` and no template would
 * match.
 */
export async function toPeakRequest(request: HttpRequest): Promise<PeakRequest> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) query[k] = v;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });

  let body: string | null = null;
  if (method !== 'GET' && method !== 'HEAD') {
    const text = await request.text();
    body = text.length > 0 ? text : null;
  }

  return {
    httpMethod: method,
    path: url.pathname,
    pathParameters: null,
    queryStringParameters: Object.keys(query).length > 0 ? query : null,
    headers,
    body,
    isBase64Encoded: false,
  };
}
