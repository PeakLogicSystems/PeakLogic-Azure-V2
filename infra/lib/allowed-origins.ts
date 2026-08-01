// ⚠️ DEPRECATED — pre-pivot AWS CDK. NOT deployed, NOT referenced by CI or the
// backend. PeakLogic runs on Azure; live infrastructure is Bicep in infra-azure/.
// Retained as read-only historical reference only — see infra/README.md.

// Single source of truth for front-end origins allowed to talk to this platform.
// Auth stack (Cognito callback/logout URLs) and API stack (CORS) must both use
// this list — Security Architecture §3.2 found them out of sync (API Gateway
// allowed all origins while Cognito only ever accepted these two).
//
// Stage-aware since domain-stack.ts's real domain (peaklogicsolutions.com,
// purchased via Cloudflare) is itself per-stage — prod owns the bare domain,
// dev/staging get their own subdomain (dev.peaklogicsolutions.com) — matching
// this project's existing per-stage resource-naming convention everywhere
// else. Replaces the app.peaklogic.io placeholder this constant had
// referenced since before any real domain existed for this project.
export function getAllowedOrigins(stage: string): string[] {
  const domainRoot = stage === 'prod' ? 'peaklogicsolutions.com' : `${stage}.peaklogicsolutions.com`;
  return ['http://localhost:5173', `https://app.${domainRoot}`];
}
