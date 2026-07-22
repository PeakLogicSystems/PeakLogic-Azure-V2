/**
 * Pure — no I/O. Parses/builds the ARM resource id and stop-action URL for
 * an Azure Database for PostgreSQL Flexible Server. Split out from
 * stop-server.ts so this logic is unit-testable without an Azure SDK,
 * mirroring backend/'s own "pure logic separate from I/O" discipline.
 */

export interface PostgresServerRef {
  subscriptionId: string;
  resourceGroupName: string;
  serverName: string;
}

// e.g. /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.DBforPostgreSQL/flexibleServers/{name}
const POSTGRES_SERVER_ID_PATTERN =
  /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)\/providers\/Microsoft\.DBforPostgreSQL\/flexibleServers\/([^/]+)\/?$/i;

export function parsePostgresServerId(resourceId: string): PostgresServerRef {
  const match = POSTGRES_SERVER_ID_PATTERN.exec(resourceId.trim());
  if (!match) {
    throw new Error(`Not a valid Postgres Flexible Server resource id: "${resourceId}"`);
  }
  const [, subscriptionId, resourceGroupName, serverName] = match;
  return { subscriptionId, resourceGroupName, serverName };
}

// Same api-version data.bicep already uses for this resource type — kept in
// sync deliberately, not independently chosen, so the ARM management-plane
// contract this function relies on doesn't silently drift from what
// provisioned the server in the first place.
export const POSTGRES_ARM_API_VERSION = '2024-08-01';

export function buildStopUrl(ref: PostgresServerRef, apiVersion: string = POSTGRES_ARM_API_VERSION): string {
  return (
    `https://management.azure.com/subscriptions/${ref.subscriptionId}` +
    `/resourceGroups/${ref.resourceGroupName}` +
    `/providers/Microsoft.DBforPostgreSQL/flexibleServers/${ref.serverName}` +
    `/stop?api-version=${apiVersion}`
  );
}
