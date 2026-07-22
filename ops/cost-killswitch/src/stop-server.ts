import { DefaultAzureCredential } from '@azure/identity';
import { parsePostgresServerId, buildStopUrl } from './resource-id';

/**
 * The Azure equivalent of the AWS side's Budget Actions RDS auto-stop
 * (infra/lib/budget-stack.ts, project_peaklogic_azure_cost_findings memory
 * — "Azure Cost Management budgets are alert-only... replicating the same
 * protection requires hand-building custom automation"). This is that
 * automation.
 *
 * Auth: DefaultAzureCredential resolves to this Function App's own
 * system-assigned managed identity when running in Azure (budget.bicep
 * grants it a Contributor role assignment SCOPED TO JUST THE POSTGRES
 * SERVER RESOURCE, not the resource group — least-privilege at the scope
 * level, since there's no narrower built-in role for "start/stop only" on
 * this resource type). Locally/in tests, DefaultAzureCredential falls
 * through its normal chain (env vars, Azure CLI login, etc.) — never
 * exercised by the unit tests here, which stop at the pure resource-id
 * layer (resource-id.test.ts) and never construct a real credential.
 *
 * KNOWN LIMITATION, same as the AWS side's own kill switch (disclosed
 * there too): Azure auto-restarts a stopped Postgres Flexible Server after
 * 7 days regardless of what stopped it (verified via Microsoft's own docs,
 * 2026-07-21) — this buys time to notice and fix the actual cost driver,
 * it is not a permanent shutdown.
 */

export interface StopResult {
  alreadyStopped: boolean;
  status: number;
}

export async function stopPostgresServer(resourceId: string): Promise<StopResult> {
  const ref = parsePostgresServerId(resourceId);
  const url = buildStopUrl(ref);

  const credential = new DefaultAzureCredential();
  const token = await credential.getToken('https://management.azure.com/.default');
  if (!token) {
    throw new Error("Failed to acquire an ARM access token via this Function's managed identity");
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Length': '0',
    },
  });

  // ARM "action" operations (start/stop/restart-style POSTs) return 202
  // Accepted on success — the stop itself is asynchronous. A server that's
  // already stopped or mid-transition commonly answers 409 Conflict; that's
  // "already handled," not a failure — this function's job is to GUARANTEE
  // the server ends up stopped, not to complain that it already is.
  if (response.status === 202) {
    return { alreadyStopped: false, status: response.status };
  }
  if (response.status === 409) {
    return { alreadyStopped: true, status: response.status };
  }

  const body = await response.text().catch(() => '<unreadable body>');
  throw new Error(`ARM stop request failed: ${response.status} ${body}`);
}
