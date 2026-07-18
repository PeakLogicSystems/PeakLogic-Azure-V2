import { postWebhook } from '../../webhook';
import type { CmmsAdapter } from '../types';

// Adapter #1 — the generic webhook. This IS the legacy tenant
// settings.webhook_url path, now behind the connector interface: it POSTs the
// work order to the configured URL through the same SSRF-guarded postWebhook,
// with the same { event, ticket } wire shape, so nothing that consumed the old
// webhook breaks. It's the fallback for any partner without a supported CMMS.
export const genericWebhookAdapter: CmmsAdapter = {
  vendor: 'generic_webhook',
  async send(connector, workOrder) {
    if (!connector.baseUrl) {
      return { ok: false, externalRef: null, error: 'generic_webhook connector has no base URL' };
    }
    try {
      await postWebhook(connector.baseUrl, {
        event: 'ticket.created',
        ticket: workOrder as unknown as Record<string, unknown>,
      });
      // A generic webhook returns no work-order id synchronously; inbound sync
      // (step 2) reconciles status by peaklogicTicketId.
      return { ok: true, externalRef: null };
    } catch (err) {
      return { ok: false, externalRef: null, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
