import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAuth } from '../shared/auth';
import { serverError, forbidden } from '../shared/response';
import { route } from './router';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const auth = getAuth(event);
    return await route(event, auth);
  } catch (err: unknown) {
    if (err instanceof Error) {
      const status = (err as Error & { statusCode?: number }).statusCode;
      if (status === 401 || status === 403) return forbidden(err.message);
      if (status === 400) {
        return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: err.message }) };
      }
      console.error('Unhandled error', err.message, err.stack);
    }
    return serverError();
  }
};
