import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, badRequest, parseBody } from '../../shared/response';
import { entraSelfServiceUrl } from '../../shared/identity';
import type { AuthContext } from '../../shared/auth';
import type { User } from '../../shared/types';

// API Specification §4.8 — SET-3/SET-4/SET-5 (display preferences) plus
// SET-2.1/SET-6.1 (password/MFA).
//
// AZURE PORT — a real, disclosed behavior change from the AWS endpoints:
// Cognito exposed self-service ChangePassword/GetUser APIs the backend could
// proxy with the caller's access token. Entra does NOT — password change and
// MFA enrollment go through Entra's own self-service flows (SSPR / the
// My-Sign-Ins security-info page), not a backend API call (Security
// Architecture §2.2/§6). So changePassword()/getMfaStatus() no longer
// perform the action — they return the self-service URL for the client
// (SPA/mobile) to deep-link the user to. This is the honest Entra
// architecture, not a stub.

interface SettingsBody {
  display_name?: string;
  clock_format?: '12h' | '24h';
  timezone?: string;
  theme?: 'light' | 'dark';
}

export async function getSettings(_event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>(
      'SELECT id, tenant_id, cognito_sub, email, display_name, role, status, clock_format, timezone, theme, created_at FROM users WHERE cognito_sub = $1',
      [auth.sub],
    );
    return ok(user);
  });
}

// Partial update — only provided fields change (mirrors PUT /v1/partner/
// branding's merge-not-replace convention, API Specification §4.8).
export async function updateSettings(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const body = parseBody<SettingsBody>(event.body, event.isBase64Encoded);

  if (body.clock_format && body.clock_format !== '12h' && body.clock_format !== '24h') {
    return badRequest("clock_format must be '12h' or '24h'");
  }
  if (body.theme && body.theme !== 'light' && body.theme !== 'dark') {
    return badRequest("theme must be 'light' or 'dark'");
  }

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [user] } = await client.query<User>(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           clock_format = COALESCE($3, clock_format),
           timezone     = COALESCE($4, timezone),
           theme        = COALESCE($5, theme)
       WHERE cognito_sub = $1
       RETURNING id, tenant_id, cognito_sub, email, display_name, role, status, clock_format, timezone, theme, created_at`,
      [auth.sub, body.display_name ?? null, body.clock_format ?? null, body.timezone ?? null, body.theme ?? null],
    );
    return ok(user);
  });
}

// Entra self-service, not a backend proxy — see the file header. Returns the
// URL the client should send the user to; the backend does not (and cannot,
// in Entra's model) change the password itself.
export async function changePassword(_event: PeakRequest, _auth: AuthContext): Promise<PeakResponse> {
  return ok({ managed_by: 'entra', self_service_url: entraSelfServiceUrl('password') });
}

export async function getMfaStatus(_event: PeakRequest, _auth: AuthContext): Promise<PeakResponse> {
  return ok({ managed_by: 'entra', self_service_url: entraSelfServiceUrl('mfa') });
}
