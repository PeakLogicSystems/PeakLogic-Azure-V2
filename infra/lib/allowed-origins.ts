// Single source of truth for front-end origins allowed to talk to this platform.
// Auth stack (Cognito callback/logout URLs) and API stack (CORS) must both use
// this list — Security Architecture §3.2 found them out of sync (API Gateway
// allowed all origins while Cognito only ever accepted these two).
export const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://app.peaklogic.io'];
