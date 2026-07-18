import { app, type InvocationContext } from '@azure/functions';
import { processIngestEvent } from './handler';
import type { IoTIngestEvent } from '../shared/types';

// Azure Functions v4 entry for telemetry ingestion — the replacement for the
// AWS IoT-Core-Topic-Rule → Lambda invocation. Azure IoT Hub exposes a
// built-in Event Hub-compatible endpoint; the Event Hub trigger consumes
// device telemetry from it (Device & Command Security Architecture §2 /
// Deployment Architecture §2.2 — one IoT Hub resource per stage).
//
// cardinality 'many' + a per-message loop: the Event Hubs extension delivers
// batches for throughput. Each message body is the device's telemetry JSON
// in the IoTIngestEvent shape ({ thingName, ts, metrics }). We process each
// independently and catch per-message so one bad message doesn't abort the
// whole batch — the closest safe stand-in for the DLQ Azure Functions
// doesn't natively provide here (Threat Model §4.1 v1.1); a real poison-
// message sink is flagged follow-up work, not built in this port.
app.eventHub('ingest', {
  connection: 'IOT_HUB_EVENTHUB_CONNECTION',
  eventHubName: process.env.IOT_HUB_EVENTHUB_NAME ?? 'messages/events',
  cardinality: 'many',
  handler: async (messages: unknown, context: InvocationContext): Promise<void> => {
    const batch = Array.isArray(messages) ? messages : [messages];
    for (const message of batch) {
      try {
        const event = (typeof message === 'string' ? JSON.parse(message) : message) as IoTIngestEvent;
        await processIngestEvent(event);
      } catch (err) {
        // Do NOT rethrow — a single malformed/failed message must not abort
        // the rest of the batch. Logged for the (still-unbuilt) forensic
        // path; see main.ts header + Threat Model §4.1 for the real DLQ gap.
        context.error('Failed to process an ingest message', err);
      }
    }
  },
});
