/**
 * Telemetry Normalization Fabric — tag mapping.
 *
 * Platform Services Architecture (the "canonical telemetry" service) + Domain
 * Model §2.10 (`Tag`) + PRD §5.18 / §5.19 (HUB-1). Pure, no I/O — this is the
 * shared vocabulary layer that **both** PeakLogic Hubs (normalizing raw
 * PLC/RTU reads at the edge) and PeakView360 (rendering configured `tags`)
 * depend on.
 *
 * A `Tag` maps a heterogeneous source — a PLC register, or a device metric —
 * into the SAME canonical metric space `telemetry.metric` already uses, via a
 * linear transform: value = raw * scale + offset. That single vocabulary is
 * why PeakView360, the historian, and the rule/AI pipeline can all read one
 * set of metric names regardless of the underlying device (Domain Model
 * §6.10). Identity (scale=1, offset=0) is the common case when a source
 * already reports engineering units.
 */

export interface Tag {
  id: string;
  sourceRef: string; // PLC address (Modbus register / OPC-UA node) or 'device_id:metric'
  canonicalMetric: string; // the metric name it maps INTO (telemetry.metric space)
  unit: string | null;
  scale: number; // raw -> engineering-unit linear transform…
  offset: number; // …value = raw * scale + offset
}

export interface RawSample {
  sourceRef: string;
  value: number;
  time: Date;
}

export interface NormalizedReading {
  metric: string; // canonical
  value: number; // raw * scale + offset
  unit: string | null;
  sourceRef: string;
  time: Date;
}

export interface NormalizeResult {
  readings: NormalizedReading[];
  unmapped: RawSample[]; // no tag declares this sourceRef — skipped, never guessed
  rejected: RawSample[]; // raw or transformed value is non-finite — a bad read, never fabricated
}

/** The linear transform a Tag applies. Identity when scale=1, offset=0. */
export function applyTag(tag: Tag, rawValue: number): number {
  return rawValue * tag.scale + tag.offset;
}

/**
 * Normalize a batch of raw source samples against a tag set.
 *
 * Disciplined, never-silent handling (mirrors ingest/rules' "skip what we
 * can't evaluate" precedent — nothing is dropped without landing somewhere):
 *   - a sample whose `sourceRef` no tag declares → `unmapped`;
 *   - a sample whose raw value, or whose transformed value, is non-finite
 *     (NaN / ±Infinity) → `rejected` — a bad PLC read must never become a
 *     fabricated canonical reading;
 *   - otherwise → a canonical `NormalizedReading`.
 *
 * If two tags declare the same `sourceRef` (a configuration error), the FIRST
 * one wins, deterministically, so the output never depends on tag ordering
 * from the DB.
 */
export function normalizeReadings(tags: Tag[], samples: RawSample[]): NormalizeResult {
  const bySource = new Map<string, Tag>();
  for (const t of tags) {
    if (!bySource.has(t.sourceRef)) bySource.set(t.sourceRef, t); // first wins
  }

  const readings: NormalizedReading[] = [];
  const unmapped: RawSample[] = [];
  const rejected: RawSample[] = [];

  for (const s of samples) {
    const tag = bySource.get(s.sourceRef);
    if (!tag) {
      unmapped.push(s);
      continue;
    }
    if (!Number.isFinite(s.value)) {
      rejected.push(s);
      continue;
    }
    const value = applyTag(tag, s.value);
    if (!Number.isFinite(value)) {
      // e.g. a misconfigured non-finite scale/offset — never emit a NaN reading.
      rejected.push(s);
      continue;
    }
    readings.push({ metric: tag.canonicalMetric, value, unit: tag.unit, sourceRef: s.sourceRef, time: s.time });
  }

  return { readings, unmapped, rejected };
}
