import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok } from '../../shared/response';
import type { AuthContext } from '../../shared/auth';

// PeakView360 HMI configuration API — the operator screens and the tag
// (source→canonical-metric) map. Tenant-scoped reads; live values and the
// historian come from the existing telemetry/alerts endpoints and (on-site)
// the Hub, per the dual-source model — these routes serve the screen/tag
// *configuration*, not the live data.

/** GET /v1/hmi-screens[?siteId=] — configured operator screens. */
export async function listScreens(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const siteId = event.queryStringParameters?.siteId;
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = siteId
      ? await client.query('SELECT * FROM hmi_screens WHERE site_id = $1 ORDER BY name', [siteId])
      : await client.query('SELECT * FROM hmi_screens ORDER BY name');
    return ok(rows);
  });
}

/** GET /v1/tags[?siteId=] — the source→canonical-metric tag map (Normalization Fabric rows). */
export async function listTags(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const siteId = event.queryStringParameters?.siteId;
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = siteId
      ? await client.query('SELECT * FROM tags WHERE site_id = $1 ORDER BY canonical_metric', [siteId])
      : await client.query('SELECT * FROM tags ORDER BY canonical_metric');
    return ok(rows);
  });
}
