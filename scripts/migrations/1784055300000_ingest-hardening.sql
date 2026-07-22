-- Ingest hardening — Enterprise Audit (2026-07-19) finding 2.4, P0/P1.
--
-- Two independent gaps closed together since they're both "ingest
-- reliability" and touch the same handler:
--
-- (a) No dead-letter path. Azure Functions has NO native DLQ for Event
--     Hub/IoT Hub triggers (Threat Model §4.1 v1.1, already disclosed) — a
--     message that throws is retried per the Event Hubs extension's policy
--     and then, on final failure, simply gone. `poison_messages` gives it a
--     durable forensic trail instead. NOT tenant data (often the tenant
--     isn't even resolvable when a message fails — that may be *why* it
--     failed) — deliberately NOT RLS-enabled, same posture as
--     channel_partners/channel_partner_groups (system/ops table, PeakLogic-
--     internal access only).
--
-- (b) No idempotency. Event Hubs is at-least-once — a redelivered batch
--     would previously double-insert an identical telemetry row (skewing
--     analytics/baselines with a phantom duplicate reading) and re-run rule
--     evaluation against it. The unique index + ON CONFLICT DO NOTHING
--     (application-side change, backend/ingest/handler.ts) makes a
--     redelivered EXACT reading (same device_id/time/metric) a no-op.
--     Alert-level duplication was already protected by
--     createAlertAndMaybeTicket()'s own dedup (checks for an existing
--     open/acknowledged alert) — this migration closes the telemetry-row
--     and metric_baselines double-counting gap specifically, which that
--     existing mechanism did not cover.

-- Up Migration

CREATE TABLE poison_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT        NOT NULL DEFAULT 'ingest',
  raw_payload TEXT        NOT NULL,   -- the raw message body, even if it never parsed as JSON at all
  error       TEXT        NOT NULL,   -- the exception message/stack that caused processing to fail
  thing_name  TEXT,                   -- best-effort extraction from the payload; null if unparseable
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS — see header comment.

CREATE INDEX poison_messages_received_idx ON poison_messages(received_at DESC);

-- Idempotency: a redelivered message carries the identical device/time/
-- metric triple (the device's own clock, echoed verbatim on redelivery —
-- not a freshly-stamped arrival time), so this is the correct dedup key.
CREATE UNIQUE INDEX telemetry_dedup_idx ON telemetry(device_id, time, metric);

-- Down Migration

DROP INDEX IF EXISTS telemetry_dedup_idx;

DROP INDEX IF EXISTS poison_messages_received_idx;
DROP TABLE IF EXISTS poison_messages;
