import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/**
 * Single Lambda entry point for all REST API routes.
 * Routes by event.httpMethod + event.resource.
 * Full implementation in Phase C.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log(`${event.httpMethod} ${event.resource}`);

  return {
    statusCode: 501,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Not implemented — Phase C coming soon.' }),
  };
};
