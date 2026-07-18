import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { handleApiRequest } from './handler';

// Azure Functions v4 entry point — the replacement for the AWS Lambda
// `handler` export that API Gateway invoked. A single catch-all HTTP
// function serves every /v1/* route; the internal routers (router.ts /
// partner-router.ts / admin-router.ts) dispatch by path, exactly as the
// single AWS Lambda did.
//
// authLevel 'anonymous' is deliberate and correct: authorization is done
// IN CODE via Entra JWT validation (shared/auth.ts), NOT by a Functions
// host key. A host key would be a second, weaker credential surface — the
// real auth is the bearer token every get*Auth() validates against the
// right Entra tenant's JWKS.
//
// route 'v1/{*rest}' requires host.json to clear the default '/api' route
// prefix so paths resolve as /v1/... (see host.json). The {*rest} wildcard
// is unused directly — handler.ts reads the path from the request URL — but
// is required for the catch-all to match multi-segment paths.
app.http('api', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'v1/{*rest}',
  handler: async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    const res = await handleApiRequest(request);
    return {
      status: res.statusCode,
      headers: res.headers,
      body: res.body,
    };
  },
});
