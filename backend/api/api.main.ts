import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { handleApiRequest } from './handler';

// Azure Functions v4 entry point — the replacement for the AWS Lambda
// `handler` export that API Gateway invoked. A single catch-all HTTP
// function serves every /v1/* route; the internal routers (router.ts /
// partner-router.ts / admin-router.ts) dispatch by path, exactly as the
// single AWS Lambda did.
//
// RENAMED from main.ts to api.main.ts (2026-08-09, architecture-review Gap 6/
// ADR-004, found while wiring a post-deploy smoke test) — a real,
// pre-existing bug: package.json's "main": "dist/**/*.main.js" is how the
// Azure Functions Node.js worker discovers which compiled files to load at
// startup (every app.http/app.timer registration is a side-effecting
// top-level call — a file that's never imported never runs). "main.js"
// does NOT match "*.main.js" (the pattern requires a literal ".main.js"
// suffix, and "main.js" is shorter than that suffix) — so this file's
// app.http('api', ...) call, the ENTIRE /v1/* API surface, would never
// have registered on a real deploy. The three jobs/*.main.ts files already
// followed the correct convention; this file just wasn't named consistently
// with it. Never caught before because nothing has ever actually been
// deployed to a real Function App to notice the routes were missing.
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
