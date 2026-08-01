import type { PeakRequest, PeakResponse } from '../../shared/http';
import { withTenant } from '../../shared/db';
import { ok, created, notFound, parseBody } from '../../shared/response';
import { requireRole } from '../../shared/auth';
import { writeAuditLog } from '../../shared/audit';
import type { AuthContext } from '../../shared/auth';
import type { Asset, AssetSpecs } from '../../shared/types';

interface AssetBody {
  site_id: string;
  name: string;
  category: string;
  make?: string;
  model?: string;
  serial_number?: string;
  install_date?: string;
  specs?: AssetSpecs;
}

export async function list(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const siteId = event.queryStringParameters?.siteId;
  return withTenant(auth.tenantId, async (client) => {
    const { rows } = await client.query<Asset>(
      siteId
        ? 'SELECT a.*, s.name AS site_name FROM assets a JOIN sites s ON s.id = a.site_id WHERE a.site_id = $1 ORDER BY a.name'
        : 'SELECT a.*, s.name AS site_name FROM assets a JOIN sites s ON s.id = a.site_id ORDER BY s.name, a.name',
      siteId ? [siteId] : [],
    );
    return ok(rows);
  });
}

export async function getOne(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  const { assetId } = event.pathParameters!;
  return withTenant(auth.tenantId, async (client) => {
    const { rows: [asset] } = await client.query<Asset>(
      'SELECT a.*, s.name AS site_name FROM assets a JOIN sites s ON s.id = a.site_id WHERE a.id = $1',
      [assetId],
    );
    return asset ? ok(asset) : notFound(`Asset ${assetId} not found`);
  });
}

export async function create(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin', 'operator');
  const body = parseBody<AssetBody>(event.body, event.isBase64Encoded);

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [asset] } = await client.query<Asset>(
      `INSERT INTO assets (tenant_id, site_id, name, category, make, model, serial_number, install_date, specs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        auth.tenantId,
        body.site_id,
        body.name,
        body.category,
        body.make ?? null,
        body.model ?? null,
        body.serial_number ?? null,
        body.install_date ?? null,
        body.specs ? JSON.stringify(body.specs) : null,
      ],
    );

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'asset.create', targetEntity: 'asset', targetId: asset.id, newValue: { name: asset.name, category: asset.category },
    });
    return created(asset);
  });
}

export async function update(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin', 'operator');
  const { assetId } = event.pathParameters!;
  const body = parseBody<Partial<AssetBody>>(event.body, event.isBase64Encoded);

  return withTenant(auth.tenantId, async (client) => {
    const { rows: [asset] } = await client.query<Asset>(
      `UPDATE assets
       SET name         = COALESCE($2, name),
           category     = COALESCE($3, category),
           make         = COALESCE($4, make),
           model        = COALESCE($5, model),
           serial_number= COALESCE($6, serial_number),
           specs        = COALESCE($7::jsonb, specs),
           updated_at   = now()
       WHERE id = $1
       RETURNING *`,
      [assetId, body.name, body.category, body.make, body.model, body.serial_number,
       body.specs ? JSON.stringify(body.specs) : null],
    );
    if (!asset) return notFound(`Asset ${assetId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'asset.update', targetEntity: 'asset', targetId: asset.id, newValue: body,
    });
    return ok(asset);
  });
}

export async function remove(event: PeakRequest, auth: AuthContext): Promise<PeakResponse> {
  requireRole(auth, 'admin');
  const { assetId } = event.pathParameters!;

  return withTenant(auth.tenantId, async (client) => {
    const { rowCount } = await client.query('DELETE FROM assets WHERE id = $1', [assetId]);
    if (!rowCount) return notFound(`Asset ${assetId} not found`);

    await writeAuditLog(client, {
      scope: 'tenant', tenantId: auth.tenantId, actorId: auth.sub,
      action: 'asset.delete', targetEntity: 'asset', targetId: assetId,
    });
    return ok({ deleted: true });
  });
}
