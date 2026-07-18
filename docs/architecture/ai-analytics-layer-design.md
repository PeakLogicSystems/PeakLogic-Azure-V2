# AI Analytics Layer — Design (Draft)

**Status:** 🟡 Draft v0.1 (2026-07-18)
**Delivers:** the named gap from [Channel Partner Intelligence Layer §3](channel-partner-intelligence-layer.md) — a first-class AI Analytics capability (anomaly → predictive → prescriptive) that makes "get AI analytics" real, and the 9th logical service in [Platform Services](platform-services-architecture.md).
**Grounded in:** the existing `metric_baselines` table (already carries `trailing_mean`/`trailing_stddev`/`sample_count` with a "withhold until minimum history" note — the schema *already anticipates* anomaly detection), the [Policy Engine](policy-engine-design.md) (the emit path), the [CMMS/KPI design](reporting-and-kpi-design.md) (the label source), and the [Normalization Fabric + Capability Model](platform-services-architecture.md) (the inputs).

---

## 0. Thesis

The Policy Engine gives **deterministic** intelligence — fixed and learned thresholds a human can read. The AI layer adds the three things thresholds can't do: notice that *this* device is drifting from *its own* normal (**anomaly**), that a failure is *coming* (**predictive**), and *what to do about it* (**prescriptive**). Crucially, the AI layer is **additive over the platform's existing spine, not a parallel stack**: it consumes canonical telemetry, and it *emits through the same alert/Policy-Engine pipeline* — so dedup, audit, ticketing, and CMMS dispatch all keep working unchanged. AI is a new alert **source**, never a new alert **path**.

And it closes a loop the platform is uniquely positioned to close: the **CMMS service-call outcomes** (§4) become the **training labels** for prediction. Detect → dispatch → outcome → learn.

---

## 1. Principles (what keeps this safe and honest)

1. **Advisory, never authoritative for safety.** Deterministic Policy-Engine thresholds remain the safety floor and the *sole* authority for any safety-critical auto-action (a leak/gas shutoff still trips local-first on a hard rule, never on a model). AI raises alerts and recommends work; it does not arm actuation. This is non-negotiable for safety-critical equipment.
2. **Explainable or it doesn't ship.** A black-box "anomaly" on an industrial asset isn't actionable and won't be trusted. Every AI output carries *why*: which metric, its expected range, the observed value, the deviation magnitude, and (for prescriptive) the likely cause. This also matters for a future regulated/enterprise buyer.
3. **Emit through the existing pipeline.** An AI finding becomes an `alerts` row (new `type='anomaly'`/`'prediction'`) → same dedup, same audit, same critical→ticket→CMMS dispatch. No second notification system.
4. **Isolation preserved.** Models and inference are tenant-scoped by default (RLS, fan-out). Cross-fleet learning, if adopted, uses privacy-preserving aggregate features only — its own review (§7).
5. **Proportionality.** Start with cheap, explainable, classical methods on data we already have; escalate to heavier ML only against a named need. No "AI everything."
6. **Human-in-the-loop first.** Predictive dispatch *recommends*; a person (or the partner) confirms — mirroring the existing advisory route-confirmation gate (`route_assignments.status`). Auto-dispatch is earned later, per asset class, once precision is proven.

---

## 2. The three capability tiers

### Tier 1 — Anomaly detection (build directly on `metric_baselines`)

Learn each device/metric's *own* normal and flag deviations the fixed thresholds miss (a pump drawing a little more power every day; a compressor cycling more often — trending, but still under the hard limit).

- **Method (classical-first):** the baseline already stores `trailing_mean`/`trailing_stddev`. Score a reading by robust deviation — z-score, or better MAD/EWMA for resilience to outliers, with seasonal/daily adjustment where the signal is periodic. Withhold flags until `sample_count` clears a minimum (the note already in the schema). Cheap, explainable, runs per-tenant.
- **Output:** an `alerts` row `type='anomaly'` with context `{metric, expected: [lo,hi], observed, deviation_sigma}` — emitted through the normal pipeline (§1.3). A tenant/partner can tune sensitivity via a **Policy Engine `notification`/anomaly policy** (the AI layer reuses the Policy Engine for its knobs rather than inventing config).
- **Why first:** highest value-per-effort — the table, the "min history" guard, and the emit path already exist; this is mostly a scoring job + a new alert type.

### Tier 2 — Predictive maintenance (the revenue lever)

Turn "something is off" into "this asset will likely fail within N days" → dispatch *before* the breakdown. This is the sharpest partner-revenue lever (planned, higher-margin work; the proactive-service story the intelligence-layer positioning sells).

- **Per asset class** (pump, compressor, filter…), features from **canonical telemetry** (Normalization Fabric) interpreted via the **Capability Model** (knowing what each metric means), plus derived degradation indicators (runtime hours, cycle frequency, efficiency drift).
- **Approaches, sequenced:** trend extrapolation on a degradation indicator (simple, explainable) → regression/survival model → learned classifier once labels exist. **The labels come from the CMMS loop (§4)** — `service_visits.outcome` and whether a predicted failure actually occurred.
- **Output:** a `prediction` alert + a recommendation (probability, horizon, evidence) → a *proactive* work order (human-confirmed at first, §1.6).

### Tier 3 — Prescriptive recommendations (attach intelligence to the work order)

Not just "failure predicted" but "**likely cause + recommended action + parts**," attached to the CMMS work order so the technician arrives informed — a direct efficiency and first-time-fix win.

- **Knowledge-based first:** map anomaly/prediction signatures → likely causes per asset class (a curated rule/knowledge base), plus history ("last 3 times this signature appeared, the fix was X").
- **LLM enrichment later:** natural-language work-order summaries via **RAG over equipment manuals + historical resolutions** (Azure OpenAI, scoped and guard-railed — the model *drafts*, it doesn't decide). Grounded, cited, never free-floating.
- **Output:** enriches the CMMS work-order payload (§ CMMS dispatch), carried in the dispatch connector's `field_mapping`.

---

## 3. The closed feedback loop (the platform's unfair advantage)

```
   telemetry ──▶ AI detects (anomaly/prediction) ──▶ alert ──▶ CMMS work order dispatched
        ▲                                                              │
        │                                                              ▼
   models improve  ◀──  labels: service_visits.outcome  ◀──  tech works the job (did it fail? what was it?)
```

The CMMS outcome data PeakLogic already captures for the **conversion KPI** doubles as **supervised-learning labels**: was the predicted failure real? what was the actual cause? This makes the models get better precisely where the platform is used most — a compounding moat competitors without the dispatch loop can't easily copy. It also feeds precision/recall tracking to tune false-positive rates (critical — a noisy predictor destroys partner trust fast).

---

## 4. Data foundation & new schema (additive)

Inputs already exist: canonical telemetry (`telemetry`/`telemetry_hourly`), `metric_baselines`, capability semantics, and CMMS outcomes (`service_visits`). New, additive:

```sql
-- A model artifact/registry row (per scope + asset-class/metric). Small metadata;
-- heavy artifacts live in blob storage, referenced.
CREATE TABLE ai_models (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = cross-fleet asset-class model (§7)
  scope_level   TEXT NOT NULL CHECK (scope_level IN ('platform','tenant')),
  kind          TEXT NOT NULL CHECK (kind IN ('anomaly','prediction','prescription')),
  asset_class   TEXT,               -- 'pump' | 'compressor' | ... (capability model)
  metric        TEXT,
  method        TEXT NOT NULL,      -- 'ewma' | 'mad' | 'trend' | 'azureml:<id>' ...
  artifact_ref  TEXT,               -- blob path for heavy artifacts; NULL for pure-statistical
  metrics_json  JSONB,              -- precision/recall/last-eval
  trained_at    TIMESTAMPTZ, enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- A prediction/finding, before it becomes an alert (audit + label-join surface).
CREATE TABLE ai_findings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id     UUID REFERENCES devices(id) ON DELETE CASCADE,
  model_id      UUID REFERENCES ai_models(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,              -- anomaly | prediction | prescription
  score         DOUBLE PRECISION,          -- deviation sigma / failure probability
  horizon_days  INTEGER,                   -- prediction only
  explanation   JSONB NOT NULL,            -- {metric, expected, observed, likely_cause, ...}
  alert_id      UUID REFERENCES alerts(id) ON DELETE SET NULL,   -- emitted alert, if any
  outcome_label TEXT,                       -- backfilled from service_visits (§3) for training
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Both RLS-scoped exactly like every other tenant table (tenant_isolation on
-- app.current_tenant_id); platform-scope ai_models (tenant_id NULL) are
-- global-read catalog, staff-write only — same pattern as Policy Engine defaults.
```

`alerts` gains `'anomaly'`/`'prediction'` to its `type`; `metric_baselines` may gain EWMA/seasonal columns as methods advance (additive).

---

## 5. Where it runs (9th logical service, not a parallel stack)

- **AI Analytics is a logical service** on the modular monolith (Platform Services §0 discipline) — it can split to its own Azure Functions job / Azure ML endpoint when compute justifies it, not before.
- **Batch/scheduled scoring** is the default: a periodic job refreshes baselines and scans for anomalies/predictions per tenant (fan-out), writing `ai_findings` and emitting alerts. **Keeps the hot ingest path lean** — heavy scoring is async, not inline. A *fast* anomaly check (cheap z-score against the cached baseline) *can* run in ingest for latency-critical signals, but the default is out-of-band.
- **Emits into the existing alert pipeline** — an `ai_finding` above threshold creates an `alerts` row and rides the same dedup→ticket→CMMS path.

---

## 6. Isolation & privacy (the real decision)

- **Per-tenant models by default** — trained on a tenant's own history, RLS-scoped, no cross-tenant exposure. Simple, safe, and enough for anomaly detection.
- **Cross-fleet asset-class models (optional, higher value, needs review):** a "pump-failure" model is stronger trained across *all* pumps. To get that without leaking tenant data, train on **de-identified, aggregated features** — asset-class + telemetry-shape signals stripped of tenant/site identity — never raw per-tenant rows. This is a genuine **privacy/threat-model decision**, not a default: it gets its own review (data-minimization, differential-privacy considerations, contractual data-use terms) before it's built. Until then, per-tenant only.
- **All aggregates fan out** (per-scope, merged) — the isolation rule is unchanged; the AI layer widens capability, not the attack surface.

---

## 7. Cost & technology (Azure, cost-conscious)

- **Classical-first.** Tier 1 and early Tier 2 are statistical (EWMA/MAD/trend) — they run in a cheap scheduled Function with negligible cost and full explainability. This alone delivers most of the near-term value.
- **Escalate deliberately.** Azure ML for models that earn it (Tier 2 learned classifiers); Azure OpenAI for Tier 3 RAG enrichment, scoped and grounded. Both are opt-in per capability, not a platform-wide dependency.
- **Verify managed services against current availability** — some cloud "anomaly detector" managed services have been retired/renamed; do not pin to one without checking (same "verify against real Microsoft docs" discipline as the rest of the Azure pivot). Leading with classical methods means the roadmap isn't hostage to any single managed product.
- **The Azure cost kill-switch/budget concern applies** — any always-on ML endpoint is a recurring cost to gate behind the same budget discipline as Postgres.

---

## 8. Phasing

1. **Anomaly detection (Tier 1)** — statistical scoring on `metric_baselines`, `type='anomaly'` alerts, sensitivity via a Policy-Engine anomaly policy, `ai_findings` recorded. Cheap, explainable, high-value; the flagship first step.
2. **Feedback wiring** — backfill `ai_findings.outcome_label` from `service_visits` (§3), plus precision/recall tracking. Turns the loop on.
3. **Predictive maintenance for ONE named asset class** — chosen against a real partner need, trend-first, human-confirmed dispatch.
4. **Prescriptive (knowledge-based)** — signature→cause map + history, attached to the work order.
5. **LLM work-order enrichment** — RAG, grounded, guard-railed.
6. **Cross-fleet asset-class models** — only after the §6 privacy review.

---

## 9. Open decisions

1. **Cross-fleet learning** — per-tenant only vs privacy-preserving global asset-class models. Needs a privacy/threat-model review before global is built. Default: per-tenant.
2. **First predictive asset class** — which does a launch partner most want (pool pumps? refrigeration compressors? HVAC)? Names the Tier-3 target.
3. **Auto-dispatch vs human-in-the-loop** for predictions, per asset class — recommend human-confirmed until precision is proven.
4. **Managed ML vs in-house** hosting for heavier models — a cost/ops call, gated by the budget discipline.

---

## 10. Artifact amendments when built

**Database Schema** (`ai_models`, `ai_findings`, `alerts.type` values, `metric_baselines` method columns + RLS), **Domain Model** (`AiModel`/`AiFinding`; anomaly/prediction alert types), **API Specification** (findings/insights endpoints; sensitivity policy), **Security / Multi-Tenant Architecture** (the cross-fleet privacy review; `ai_findings`/`ai_models` scope audit), **Platform Services** (AI Analytics as the 9th named service), **Policy Engine** (an `anomaly`/sensitivity policy kind), **CMMS/KPI design** (`service_visits` outcomes as training labels; prescriptive enrichment in the work-order payload), **SRS §3.7** (the anomaly-baseline requirement this realizes), and **CLAUDE.md** (the AI-analytics emit-through-the-alert-pipeline flow).
