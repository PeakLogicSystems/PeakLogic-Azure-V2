# AI Analytics Layer — Design

**Status:** 🟢 Approved v1.0 (2026-07-21) — §9's open decisions resolved (below); Tier 1 (anomaly detection) scaffolded in real code behind `AI_ANALYTICS_ENABLED`, Tiers 2–3 remain design-only pending their own named triggers.
**Delivers:** the named gap from [Channel Partner Intelligence Layer §3](channel-partner-intelligence-layer.md) — a first-class AI Analytics capability (anomaly → predictive → prescriptive) that makes "get AI analytics" real, and the 9th logical service in [Platform Services](platform-services-architecture.md).
**Grounded in:** the existing `metric_baselines` table (already carries `trailing_mean`/`trailing_stddev`/`sample_count` with a "withhold until minimum history" note — the schema *already anticipates* anomaly detection), the [Policy Engine](policy-engine-design.md) (the emit path), the [CMMS/KPI design](reporting-and-kpi-design.md) (the label source), and the [Normalization Fabric + Capability Model](platform-services-architecture.md) (the inputs).

---

> **⚡ Unified Platform (v2.0) amendment — 2026-07-25.** Tier 2 (predictive maintenance) now absorbs **MooreView's PdM**: its asset↔SCADA-tag mapping is exactly the `Tag` entity (Domain Model §2.10), and feature batching feeds the existing `AiModel`(kind=`prediction`)/`AiFinding` records (§2.5) — **no new PdM entity**. PdM runs **fleet-central** in the cloud, not per-plant as MooreView did (MV-2.1). Tier 1 (shipped anomaly detection) is unchanged; Tier 2 remains design-stage. Full plan: [`unified-platform-integration-plan.md`](unified-platform-integration-plan.md).

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
- **LLM enrichment later:** natural-language work-order summaries, site-health narratives, and recommendations via **RAG over equipment manuals + historical resolutions**, using **Claude (Anthropic) via Microsoft Foundry** — see §7a for why this is now the Azure-native choice, not a vendor exception. Scoped and guard-railed: the model *drafts*, it doesn't decide. Grounded, cited, never free-floating.
- **Output:** enriches the CMMS work-order payload (§ CMMS dispatch), carried in the dispatch connector's `field_mapping`; also the natural mechanism for site-health summaries surfaced in the Platform Control Center (a distinct future UI item, not yet designed).

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

- **Classical-first.** Tier 1 (shipped) and early Tier 2 are statistical (EWMA/MAD/trend) — they run inline in the existing ingest transaction (Tier 1) or a cheap scheduled Function (heavier Tier 2 work) with negligible cost and full explainability. This alone delivers most of the near-term value.
- **Escalate deliberately.** Azure ML for models that earn it (Tier 2 learned classifiers, hosting still an open decision — §9 item 4); Claude via Microsoft Foundry for Tier 3 RAG enrichment (§7a), scoped and grounded. Both are opt-in per capability, not a platform-wide dependency.
- **Verify managed services against current availability** — some cloud "anomaly detector" managed services have been retired/renamed; do not pin to one without checking (same "verify against real Microsoft docs" discipline as the rest of the Azure pivot). Leading with classical methods means the roadmap isn't hostage to any single managed product.
- **The Azure cost kill-switch/budget concern applies** — any always-on ML endpoint (or LLM call volume) is a recurring cost to gate behind the same budget discipline as Postgres.

### 7a. LLM vendor: Claude via Microsoft Foundry (locked 2026-07-21)

The user's requirement was **LLM AI, vendor-flexible** — Claude specifically named as preferred, not mandated. Verified via live search (not assumed): **Anthropic's Claude models (including Opus 4.8 and Haiku 4.5) went generally available in Microsoft Foundry on 2026-06-29** — hosted on Azure infrastructure, callable via the Messages API, with existing Azure authentication, billing, and governance workflows (Microsoft Azure Blog, "Introducing Anthropic's Claude models in Microsoft Foundry," 2026-06-29). This resolves what would otherwise be a real architectural tension: every other capability in this pivot is deliberately Azure-only (cost-conscious, single-cloud governance, "verify managed service availability" discipline — §7). Calling Anthropic's own public API directly would have meant a first non-Azure network egress path and a new vendor/data-processing-agreement review nobody had done. Calling Claude *through Microsoft Foundry* means neither trade-off applies — it is the Azure-native choice, not an exception to the Azure-only posture.

**Practical consequence:** Tier 3 (§2) targets Claude-via-Foundry as the default LLM for work-order summarization, site-health narratives, and RAG-grounded recommendations. Not yet implemented (Tier 3 is design-only pending the knowledge-base-first step in §2 and a real named use case) — this section locks the *vendor choice* so that work isn't relitigated when Tier 3 is actually scheduled. Re-verify Foundry model availability/pricing at that time regardless (services move; do not treat a 2026-07-21 search result as permanently current).

---

## 8. Phasing

1. **Anomaly detection (Tier 1) — ✅ SHIPPED 2026-07-21, behind `AI_ANALYTICS_ENABLED` (default off).** `backend/ingest/baseline.ts` (EWMA baseline maintenance — runs unconditionally, closing a real gap found while implementing: `metric_baselines` existed in the schema since the Policy Engine era but nothing ever wrote to it) + `backend/ingest/anomaly.ts` (z-score scoring, capped at `severity='warning'`, §9 item 3) + migration `1783962000000_ai-analytics.sql` (`ai_models`/`ai_findings`). Wired into `handler.ts` step 3b, emitting through the existing `alerts`/dedup/ticket pipeline (§1.3). 17 new unit tests. **Not yet done: sensitivity via a Policy-Engine anomaly policy** (thresholds are hardcoded module constants, `MIN_SAMPLES_FOR_ANOMALY`/`DEFAULT_SIGMA_THRESHOLD` — fine for a first cut with zero real telemetry history to tune against, but should move to the Policy Engine once real data exists); **no read API** for `ai_findings` yet (API Specification amendment, §10).
2. **Feedback wiring** — backfill `ai_findings.outcome_label` from `service_visits` (§3), plus precision/recall tracking. Turns the loop on. Blocked on CMMS/KPI design §6 phase 2 (inbound status sync → `service_visits`), which isn't built yet either.
3. **Predictive maintenance for ONE named asset class** — deliberately deferred (§9 item 2), chosen against a real partner need, trend-first, human-confirmed dispatch.
4. **Prescriptive (knowledge-based)** — signature→cause map + history, attached to the work order.
5. **LLM work-order enrichment** — RAG, grounded, guard-railed, via Claude/Microsoft Foundry (§7a).
6. **Cross-fleet asset-class models** — only after the §6 privacy review. Cross-tenant *benchmarking* (§6a) has its own, lighter-weight gate but is equally unbuilt.

---

## 9. Open decisions — resolved 2026-07-21

1. **Cross-fleet learning: per-tenant only, confirmed.** Not reopened. See new §6a for the cross-tenant *benchmarking* question this decision surfaced (a distinct, still-gated capability, not built).
2. **First predictive asset class: deliberately deferred, not yet named.** Tier 2 (predictive maintenance) stays design-only until a launch partner names a real target — building it against a guessed asset class would violate this doc's own proportionality principle (§1.5). This does **not** block Tier 1: anomaly detection is asset-class-agnostic (it scores any device/metric against its own baseline), so it ships now without this decision.
3. **Auto-dispatch vs human-in-the-loop: human-confirmed, agreed.** Applies to Tier 2 predictions as designed. Extended, conservatively, to Tier 1 anomalies too: every Tier 1 finding is capped at `severity='warning'` in code (`backend/ingest/anomaly.ts`), which structurally prevents auto-ticket-creation (only `'critical'` alerts auto-dispatch, per `handler.ts`) — anomaly detection has no measured precision/recall yet (Tier 1 doesn't consume the CMMS feedback loop the way Tier 2 will), so it stays visible-but-non-dispatching until real false-positive data exists.
4. **Managed ML vs in-house hosting: resolved for the NL/prescriptive layer, open for Tier 2 learned models.** See §7a — Claude via Microsoft Foundry is the locked choice for Tier 3 LLM enrichment. Tier 2's eventual learned-classifier hosting (Azure ML vs. in-house) stays an open cost/ops call, revisited when a first predictive asset class (item 2) is named.

### 6a. Cross-tenant benchmarking (deferred, gated — distinct from "cross-fleet models")

Raised directly by the user alongside the per-tenant-only decision: could anonymized data be used to **benchmark** one customer against similar others ("your energy use vs. comparable facilities"), and is that legal? Worth separating from §6's "cross-fleet *models*" question — benchmarking doesn't require a shared trained model, just shared aggregate statistics, which is a smaller, more tractable version of the same isolation problem.

**Technical shape (reuses §6's existing answer, made concrete):** never expose row-level or raw per-tenant data across the boundary. A benchmark stat is computed only from **de-identified, aggregated features** (asset-class + normalized/derived signal — e.g. "average kWh/ton for HVAC systems in this climate zone," not "Tenant X's specific reading"), and only surfaced once at least **k=10 contributing tenants** feed a given aggregate (a k-anonymity floor — publishing a "benchmark" derived from 2–3 tenants is not actually anonymous, since a customer who knows their own value can sometimes back out a peer's by elimination). No aggregate is ever computed, let alone shown, below that floor.

**Legal answer — not legal advice, real counsel review required before shipping:** industry benchmarking against aggregated/de-identified data is common and generally permissible SaaS practice (utilities and CMMS vendors already do "you vs. peer facilities" reporting), *provided*:
- The customer agreement / Terms of Service explicitly permits aggregated or de-identified use for benchmarking or product improvement — verify PeakLogic's current ToS actually says this; if it doesn't yet, this is a contract-language prerequisite, not a code prerequisite.
- The k-anonymity floor above is real and enforced in code, not just a policy promise — "anonymized" datasets have been re-identified before (Netflix Prize, AOL search logs) when aggregation was too thin or paired with public auxiliary data; the floor is the actual control, not the word "anonymized."
- Segments that are HIPAA-adjacent or otherwise regulated (Assisted Living & Healthcare, per the Enterprise Audit §1) get extra scrutiny before inclusion in any cross-tenant aggregate — this compounds the platform's existing provisional (not yet counsel-confirmed) HIPAA-BAA read, it doesn't replace it.

**Status: not built, not scheduled.** Gate before implementation: (a) real counsel review of the ToS/DPA language, (b) the k-anonymity floor implemented and tested, (c) a named benchmark use case from an actual partner request. Default until then: per-tenant only, no cross-tenant aggregation of any kind.

---

## 10. Artifact amendments

**Done 2026-07-21:** **Database Schema** (`ai_models`/`ai_findings` added, migration `1783962000000`, mirrored in `docs/data-model.sql`), **Domain Model** (`AiModel`/`AiFinding` entities), **CLAUDE.md** (new "AI Analytics" section, mirroring the Policy Engine section's format).

**Still pending, when their trigger condition is met:** **API Specification** (findings/insights read endpoints — no route exists yet; needed before any frontend/Platform Control Center surface can show `ai_findings`), **Security / Multi-Tenant Architecture** (the cross-fleet privacy review, §6/§6a — only needed if/when cross-fleet models or benchmarking are actually scheduled), **Platform Services** (already names AI Analytics as the 9th logical service — no further change needed), **Policy Engine** (an `anomaly`/sensitivity policy kind — move `anomaly.ts`'s hardcoded constants there once real telemetry history exists to tune against), **CMMS/KPI design** (`service_visits` outcomes as training labels — blocked on that design's own phase-2 inbound-sync not being built yet), **SRS §3.7** (verify the anomaly-baseline requirement's wording matches what actually shipped, not just that it existed as a placeholder).
