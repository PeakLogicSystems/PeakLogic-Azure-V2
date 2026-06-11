import type { APIGatewayProxyResult } from 'aws-lambda';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const json = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

export const ok       = <T>(data: T)          => json(200, data);
export const created  = <T>(data: T)          => json(201, data);
export const noContent = ()                   => ({ statusCode: 204, headers: CORS_HEADERS, body: '' });
export const badRequest = (message: string)  => json(400, { message });
export const forbidden  = (message = 'Forbidden')       => json(403, { message });
export const notFound   = (message = 'Not found')       => json(404, { message });
export const conflict   = (message: string)             => json(409, { message });
export const serverError = (message = 'Internal error') => json(500, { message });

export function parseBody<T>(body: string | null, isBase64: boolean): T {
  if (!body) throw Object.assign(new Error('Missing request body'), { statusCode: 400 });
  const raw = isBase64 ? Buffer.from(body, 'base64').toString('utf8') : body;
  return JSON.parse(raw) as T;
}
