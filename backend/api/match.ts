import type { PeakRequest, PeakResponse } from '../shared/http';

// Route matcher — the Azure-port replacement for AWS API Gateway's exact
// "METHOD + resource-template" key lookup.
//
// On AWS, the routers keyed on `event.httpMethod + " " + event.resource`,
// where `event.resource` was the API Gateway resource TEMPLATE
// (`/v1/devices/{deviceId}`) that API Gateway itself resolved and injected.
// Azure Functions gives the ACTUAL path (`/v1/devices/abc-123`) with no
// template, so this module compiles each template into a regex once and
// matches the actual path against them, extracting path parameters — the
// ROUTES maps in the three routers stay keyed on templates, verbatim.

export type RouteHandler<A> = (req: PeakRequest, auth: A) => Promise<PeakResponse>;

interface CompiledRoute<A> {
  method: string;
  regex: RegExp;
  paramNames: string[];
  /** Count of `{param}` segments — used to prefer more-literal routes on a tie. */
  paramCount: number;
  handler: RouteHandler<A>;
}

/**
 * Compiles a `{ "METHOD /template": handler }` map into matchable routes.
 * Sorted so routes with FEWER params (more literal segments) are tried
 * first — so e.g. `GET /v1/settings/mfa` (a literal) would win over a
 * hypothetical `GET /v1/settings/{key}` (a param) at the same depth. The
 * current route set has no such overlap, but the ordering makes the matcher
 * correct regardless, not reliant on Object insertion order.
 */
export function compileRoutes<A>(routes: Record<string, RouteHandler<A>>): CompiledRoute<A>[] {
  const compiled = Object.entries(routes).map(([key, handler]) => {
    const spaceIdx = key.indexOf(' ');
    const method = key.slice(0, spaceIdx);
    const template = key.slice(spaceIdx + 1);

    const paramNames: string[] = [];
    const pattern = template.replace(/\{([^}]+)\}/g, (_full, name: string) => {
      paramNames.push(name);
      return '([^/]+)';
    });

    return {
      method,
      regex: new RegExp(`^${pattern}$`),
      paramNames,
      paramCount: paramNames.length,
      handler,
    };
  });

  compiled.sort((a, b) => a.paramCount - b.paramCount);
  return compiled;
}

export function matchRoute<A>(
  compiled: CompiledRoute<A>[],
  method: string,
  path: string,
): { handler: RouteHandler<A>; pathParameters: Record<string, string> } | null {
  for (const route of compiled) {
    if (route.method !== method) continue;
    const m = route.regex.exec(path);
    if (!m) continue;

    const pathParameters: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      pathParameters[name] = decodeURIComponent(m[i + 1]);
    });
    return { handler: route.handler, pathParameters };
  }
  return null;
}
