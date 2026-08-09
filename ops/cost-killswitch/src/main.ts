import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { stopPostgresServer } from './stop-server';
import { setThrottleFlag } from './throttle';
import { isValidSecret } from './auth';

// Invoked by the Azure Monitor Action Group budget.bicep wires to the cost
// budget's 100% threshold (a plain webhook receiver, `serviceUri` carrying
// `?secret=...` as a query param).
//
// authLevel: 'anonymous' + our OWN shared-secret check (auth.ts), NOT
// Azure's built-in Function-key mechanism. Deliberate: this function has
// real, dangerous power (it stops the production database), and getting
// Bicep's listKeys()-on-host-default expression exactly right, unverified
// against a live subscription, felt like the wrong thing to bet an
// unattended safety mechanism on. A secret we generate, thread through as
// a normal @secure() Bicep parameter (mirroring dbAdminPassword's existing
// pattern in this exact repo), and can fully unit-test (auth.ts) is a
// design we can actually verify end-to-end without a subscription.
// Disclosed trade-off: the secret rides in a query string, which can end
// up in request logs — Action Group webhook receivers don't support custom
// headers (that needs the heavier AAD-based "Secure Webhook" receiver
// type), so this is the available option, not the ideal one.
//
// Deliberately does NOT read which server to stop from the incoming
// request body — POSTGRES_SERVER_RESOURCE_ID is a fixed App Setting
// (injected by budget.bicep from data.bicep's postgresServerId output).
// This function always stops the ONE server it was deployed to protect;
// nothing about which resource to act on is ever trusted from the caller.
app.http('cost-killswitch', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const providedSecret = request.query.get('secret');
    if (!isValidSecret(providedSecret, process.env.KILLSWITCH_SECRET)) {
      context.warn('Rejected cost-killswitch invocation — missing or incorrect secret');
      return { status: 401, body: 'Unauthorized' };
    }

    const resourceId = process.env.POSTGRES_SERVER_RESOURCE_ID;
    if (!resourceId) {
      context.error('POSTGRES_SERVER_RESOURCE_ID is not set — refusing to guess which server to stop');
      return { status: 500, body: 'Misconfigured: POSTGRES_SERVER_RESOURCE_ID is not set' };
    }

    context.warn(`Cost budget threshold breached — stopping Postgres server ${resourceId}`);
    try {
      const result = await stopPostgresServer(resourceId);
      context.log(`Stop request result: ${JSON.stringify(result)}`);
      return { status: 200, body: JSON.stringify(result) };
    } catch (err) {
      context.error('Failed to stop Postgres server', err);
      return { status: 500, body: String(err) };
    }
  },
});

// The 90% graduated tier (architecture-review Gap 4/ADR-003) — sets a Key
// Vault flag rather than stopping anything. Same shared-secret auth as
// cost-killswitch above (KILLSWITCH_SECRET is reused, not a second secret
// to provision/rotate — this function has far less power than the one
// above, but there's no reason to weaken auth just because the action is
// gentler). See throttle.ts for why this latches rather than auto-clearing.
app.http('cost-throttle', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const providedSecret = request.query.get('secret');
    if (!isValidSecret(providedSecret, process.env.KILLSWITCH_SECRET)) {
      context.warn('Rejected cost-throttle invocation — missing or incorrect secret');
      return { status: 401, body: 'Unauthorized' };
    }

    const keyVaultUri = process.env.KEY_VAULT_URI;
    if (!keyVaultUri) {
      context.error('KEY_VAULT_URI is not set — refusing to guess where to write the throttle flag');
      return { status: 500, body: 'Misconfigured: KEY_VAULT_URI is not set' };
    }

    context.warn('Cost budget reached 90% — setting cost-throttle-active=true in Key Vault');
    try {
      await setThrottleFlag(keyVaultUri, true);
      return { status: 200, body: JSON.stringify({ throttleActive: true }) };
    } catch (err) {
      context.error('Failed to set cost-throttle flag', err);
      return { status: 500, body: String(err) };
    }
  },
});
