import { app, type InvocationContext } from '@azure/functions';
import { processIngestEvent } from './handler';
import { recordPoisonMessage } from '../shared/poison-messages';
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
// doesn't natively provide here (Threat Model §4.1 v1.1). Enterprise Audit
// (2026-07-19) finding 2.4a's real poison-message sink is now built
// (backend/shared/poison-messages.ts, migration 1784055300000) — a failed
// message gets a durable DB record here, not just a log line, before this
// catch swallows it and lets the batch continue.
app.eventHub('ingest', {
  connection: 'IOT_HUB_EVENTHUB_CONNECTION',
  eventHubName: process.env.IOT_HUB_EVENTHUB_NAME ?? 'messages/events',
  cardinality: 'many',
  handler: async (messages: unknown, context: InvocationContext): Promise<void> => {
    const batch = Array.isArray(messages) ? messages : [messages];
    for (const message of batch) {
      // Captured before the try so it's available to recordPoisonMessage
      // even when JSON.parse itself is what throws (a message that isn't
      // valid JSON at all — the other real failure mode this covers,
      // distinct from a well-formed IoTIngestEvent that processIngestEvent
      // rejects for some other reason).
      const raw = typeof message === 'string' ? message : JSON.stringify(message);
      try {
        const event = (typeof message === 'string' ? JSON.parse(message) : message) as IoTIngestEvent;
        await processIngestEvent(event);
      } catch (err) {
        // Do NOT rethrow — a single malformed/failed message must not abort
        // the rest of the batch.
        context.error('Failed to process an ingest message', err);
        await recordPoisonMessage(raw, err);
      }
    }
  },
});
