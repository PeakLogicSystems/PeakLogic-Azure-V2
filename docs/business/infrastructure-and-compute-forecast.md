# Infrastructure & Compute Forecast

**Artifact #39** · v1.0 · 2026-08-02
**Status:** Model. Derived from the architecture in `docs/architecture/`, priced against Azure list rates. No environment has been deployed, so these are computed projections, not measured bills.

---

## 1. What this answers

Three questions, in the order they get asked:

1. **What does the cloud actually cost per site?** — because the recurring price is $22–38 per site per month, and infrastructure has to disappear inside that.
2. **At what site counts does each service change tier?** — so capacity is planned before it becomes an incident.
3. **Does the cost curve stay under the revenue curve?** — the question behind both of the others.

Answers: **$0.72–$0.91 per site per month**, **under 2% of ARR at every stage of the plan**, with the first hard inflection at ~250 sites.

---

## 2. Telemetry assumptions

Every figure below traces to these. They are the load-bearing numbers; change one and the model moves.

| Assumption | Value | Why |
|---|---|---|
| Metrics per site | 8 | Matches the tile count on both configured site types (`peakview360/src/data/sites.ts`) |
| Sample interval | 60 s | Below the fastest silence-detection window (gas/leak, 2 min × 3 grace), so a dead sensor is still caught inside one sweep |
| Messages per site per day | 1,440 | **Batched** — one message carrying all 8 metrics |
| Readings per site per day | 11,520 | 8 metrics × 1,440 |
| Bytes per reading | 48 | Narrow row: device FK, metric, value, timestamp |
| Full-resolution retention | 90 days | In Postgres; then compressed to blob |
| Archive compression | ~12% of raw | zstd over columnar batches |

**Batching is the single most consequential decision here.** IoT Hub bills per message, not per byte, for anything under 4 KB. Sending one message per metric would multiply IoT Hub cost **eightfold** for no operational gain — the readings arrive in the same second either way. One batched message per site per minute is the difference between S1 ×7 and S2 ×3 at 1,800 sites.

---

## 3. Monthly Azure cost

Priced at East US pay-as-you-go list rates. No reserved instances, no enterprise agreement, no negotiated discount — all of which are available later and only improve these figures.

| Yr | Sites | Msg/day | IoT Hub | Postgres | Functions | Log Analytics | APIM | Blob | Egress | **Total/mo** | **$/site/mo** |
|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 150 | 216K | S1 ×1 · $25 | B2s · $33 | $13 | $35 | $11 | $0 | $3 | **$122** | **$0.82** |
| 2 | 600 | 864K | S1 ×3 · $75 | D2ds_v5 · $143 | $72 | $159 | $53 | $0 | $38 | **$544** | **$0.91** |
| 3 | 1,800 | 2.59M | S1 ×7 · $175 | D4ds_v5 · $292 | $227 | $490 | $167 | $0 | $132 | **$1,540** | **$0.83** |
| 4 | 4,000 | 5.76M | S2 ×1 · $250 | D4ds_v5 · $313 | $512 | $1,100 | $375 | $1 | $305 | **$2,860** | **$0.71** |
| 5 | 8,000 | 11.5M | S2 ×2 · $500 | D8ds_v5 · $625 | $1,000 | $2,200 | $753 | $2 | $618 | **$5,700** | **$0.72** |

### Against revenue

| Yr | Infrastructure / yr | ARR | Infra as % of ARR |
|---:|---:|---:|---:|
| 1 | $1.5K | $97K | 1.5% |
| 2 | $6.5K | $328K | 2.0% |
| 3 | $17.8K | $922K | 1.9% |
| 4 | $34.3K | $1.97M | 1.7% |
| 5 | $68.8K | $3.75M | 1.8% |

**Infrastructure never exceeds 2% of ARR.** The 82% software gross margin assumed in the business plan is not at risk from cloud spend — it is at risk from support and field cost, which is where attention belongs.

Cost per site **falls** as the estate grows (from $0.91 to $0.72) because the fixed floor — Postgres compute, Log Analytics baseline, Key Vault — amortises across more sites. There is no point at which this model inverts.

---

## 4. Where the money actually goes

Two lines dominate, and neither is the one people expect.

**Log Analytics is the largest single line by year 3** ($490/mo, rising to $2,200). Observability, not compute. It is also the most compressible: ingestion is sampled rather than full-fidelity, and moving verbose diagnostic logs to a Basic table would cut this roughly in half. **Flagged as the first optimisation to make, not the first thing to buy more of.**

**Postgres is the largest fixed commitment** and the least elastic. Everything else scales smoothly with usage; the database steps.

**IoT Hub is cheaper than intuition suggests** — $500/mo at 8,000 sites — precisely because of batching.

---

## 5. Scaling inflection points

The site counts at which something must change. These are planning triggers, not failures.

| Sites | What changes | Action |
|---:|---|---|
| ~6 | IoT Hub leaves the free tier (F1 → S1) | None. $25/mo. |
| ~24 | Functions exceeds 1M free monthly executions | None. Marginal cost is pennies. |
| **~250** | **Postgres must leave Burstable** | **First real decision.** B-series runs on CPU credits; sustained ingest exhausts them and latency collapses without warning. Move to D2ds_v5 *before* this, not after. |
| ~278 | IoT Hub needs a second S1 unit | Units are additive and instant; no migration. |
| ~1,500 | Postgres → D4ds_v5 | Index maintenance on `telemetry` becomes the bottleneck ahead of raw CPU. |
| **~2,000** | **Partition `telemetry` by month** | Vacuum and full-scan cost on a single large table starts to hurt. Partitioning also makes the 90-day retention drop a metadata operation instead of a mass delete. |
| ~2,778 | IoT Hub → S2 | Also the point to evaluate consuming Event Hubs directly and bypassing IoT Hub's per-device features for high-volume sites. |
| **~3,500** | **Read replica for reporting** | Analytics and compliance reporting begin competing with ingest. A replica is cheaper than sizing the primary for both. |
| ~5,000 | Postgres → D8ds_v5; archive tiering becomes streaming | Nightly batch archival no longer completes inside its window. |

**The one to plan for is 250.** Everything before it is automatic; everything after it is a scheduled migration with a known cost. Burstable-to-General-Purpose is the only transition where getting the timing wrong produces a visible outage rather than a bill.

---

## 6. What is not in these numbers

Stated plainly, because a forecast that omits its own gaps is not usable.

- **Non-production environments.** Dev and staging add roughly 25–30% to years 1–2, less thereafter as they stay small while production grows.
- **Hub-side compute.** The on-premises appliance is customer hardware, costed in the $1,800 site kit, not here.
- **AI/LLM inference.** Tier 3 prescriptive analytics (`ai-analytics-layer-design.md` §7a, Claude via Microsoft Foundry) is design-only. When it ships it will be the fastest-growing line in this table and needs its own forecast.
- **Egress on bulk export.** Compliance evidence packs and historian exports are bursty. Modelled at 0.9 GB/site/month, which is generous for telemetry but could be low if customers routinely export full history.
- **Reserved-instance discounts.** One- and three-year commitments cut Postgres compute 30–55%. Not assumed; available once the load is proven.

---

## 7. Method

Computed by `docs/business/infra-forecast.mjs`, which is the source of every figure above. It is deliberately committed alongside this document: the assumptions are arguable, and an argument about them should be settled by changing an input and re-running rather than by debating a spreadsheet nobody can see.

Prices last checked against Azure list rates on 2026-08-02. Re-run before quoting these externally.
