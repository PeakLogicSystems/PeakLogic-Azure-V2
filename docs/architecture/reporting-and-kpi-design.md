# CMMS Dispatch, Conversion KPI & Reporting — Design (Draft)

**Status:** 🟡 Draft v0.1 (2026-07-18)
**Delivers:** [Platform Services §9](platform-services-architecture.md) (Analytics & Reporting) made concrete, plus two superadmin asks — (1) automated tickets are **pushed into the channel partner's CMMS**, and PeakLogic tracks **how many resulted in a service call** (the value KPI); (2) a **Reports** section for standard + custom reports.
**Grounded in:** `docs/data-model.sql` (`service_tickets` already has `webhook_url` + `external_ref`, `tenants.channel_partner_id`, the channel-partner dispatch tables) and `backend/ingest/handler.ts` (auto-ticket creation + webhook post — the seed of the outbound integration).

---

## 0. The asks, precisely

1. **CMMS dispatch + value KPI:** automated tickets (from critical alerts) must land in the channel partner's **CMMS** (Computerized Maintenance Management System — UpKeep, Fiix, Limble, MaintainX, eMaint, Maximo, ServiceTitan, etc.) as a **work order**. PeakLogic then needs to know **how many of those automated work orders resulted in an actual service call** — the conversion metric that proves the platform generates real service work, shown on the Super-Console.
2. **Reports section:** run standard, industry-typical reports for these services/devices, plus custom reports.

The KPI depends on a **bi-directional CMMS integration**: push the work order *out*, and learn the outcome *back*. That integration is the backbone of this doc; the KPI and Reports sit on top of it.

---

## 1. What exists vs. the gap (grounded)

| Signal the KPI needs | In the schema today? |
|---|---|
| Ticket was **automated** (alert-generated) | ✅ Derivable — `service_tickets.alert_id IS NOT NULL` |
| Ticket was **pushed to the partner's CMMS** | ⚠️ Only a generic `webhook_url` POST exists (fire-and-forget); no CMMS connector, no per-partner CMMS config, no returned work-order id captured as such, no `channel_partner_id` on the ticket |
| A **service call actually happened** | ❌ **Not tracked.** Nothing reads work-order status back from the CMMS; `route_stops` aren't linked to tickets; `status='completed'` doesn't mean a truck rolled |

**Conclusion:** the outbound path exists in primitive form (a raw webhook); the **CMMS connector framework** and the **inbound outcome sync** are the real gaps. Both are additive.

---

## 2. CMMS integration — the backbone

A **connector framework** with **per-vendor adapters** — the same adapter discipline the platform already uses for heterogeneous device sources (the Telemetry Normalization Fabric, Platform Services §6). There is no universal CMMS standard, so each vendor is an adapter, sequenced per real partner need ("design against a named need, not speculatively").

### 2.1 Per-org CMMS connector config

A connector belongs to whichever org fulfills the service — normally the **channel partner** (the service provider), optionally a **tenant** that runs its own CMMS/CAFM.

```sql
CREATE TABLE cmms_connectors (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE CASCADE,
  tenant_id          UUID        REFERENCES tenants(id) ON DELETE CASCADE,   -- one of the two is set
  vendor             TEXT        NOT NULL,     -- 'upkeep' | 'fiix' | 'limble' | 'maintainx' | 'maximo' | 'servicetitan' | 'generic_webhook'
  base_url           TEXT,
  credential_ref     TEXT        NOT NULL,     -- Key Vault secret name; NEVER the secret itself
  field_mapping      JSONB       NOT NULL DEFAULT '{}',   -- PeakLogic ticket → vendor work-order fields
  inbound_mode       TEXT        NOT NULL DEFAULT 'webhook' CHECK (inbound_mode IN ('webhook','poll','none')),
  enabled            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cmms_connector_owner_check CHECK (
    (channel_partner_id IS NOT NULL AND tenant_id IS NULL)
    OR (channel_partner_id IS NULL AND tenant_id IS NOT NULL)
  )
);
```

- **Secretless:** `credential_ref` is a **Key Vault secret name**, resolved at call time via Managed Identity (the same posture as `db.ts`). A partner's CMMS API key never sits in the DB. This preserves the platform's secretless invariant.
- **Field mapping** is data, so onboarding a partner's CMMS is config, not code, once the vendor adapter exists.

### 2.2 Outbound — push the work order

When ingest auto-creates a critical-alert ticket (or on explicit dispatch), the **dispatch service** resolves the owning tenant's attributed partner (`tenants.channel_partner_id`), looks up that partner's `cmms_connectors`, and the vendor adapter creates a work order via the CMMS API. The returned **work-order id is stored on the ticket**, and attribution is stamped:

```sql
ALTER TABLE service_tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('automated','manual','api'));
ALTER TABLE service_tickets ADD COLUMN channel_partner_id UUID
  REFERENCES channel_partners(id) ON DELETE SET NULL;
ALTER TABLE service_tickets ADD COLUMN dispatched_at TIMESTAMPTZ;
ALTER TABLE service_tickets ADD COLUMN cmms_connector_id UUID
  REFERENCES cmms_connectors(id) ON DELETE SET NULL;
-- external_ref (already present) now holds the CMMS work-order id.
```

`handler.ts` is updated so auto-tickets set `source='automated'`, and the dispatch stamps `channel_partner_id` / `dispatched_at` / `cmms_connector_id` / `external_ref`. Today's raw `webhook_url` becomes the `generic_webhook` vendor adapter — the fallback for partners without a supported CMMS. **The existing SSRF-guarded `postWebhook` is preserved as that adapter**, not thrown away.

One more attribution column carries the **accepted** funnel stage (§3), set by inbound sync when the CMMS acknowledges/accepts the work order:

```sql
ALTER TABLE service_tickets ADD COLUMN accepted_at TIMESTAMPTZ;   -- CMMS accepted the work order
```

Dispatch must be **reliable + idempotent**: a CMMS API is an external call, so it runs through a durable outbox (retry, dedupe on ticket id) rather than fire-and-forget — a missed dispatch is a missed service call and a missed KPI event.

### 2.3 Inbound — learn the outcome (the conversion signal)

The service call is detected by reading work-order progress **back from the CMMS**, into `service_visits`:

```sql
CREATE TABLE service_visits (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id          UUID        NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  channel_partner_id UUID        REFERENCES channel_partners(id) ON DELETE SET NULL,
  cmms_work_order_ref TEXT,                          -- the CMMS work-order id this visit came from
  started_at         TIMESTAMPTZ,                    -- tech on site / work-order in progress (the conversion signal)
  completed_at       TIMESTAMPTZ,
  outcome            TEXT        CHECK (outcome IN
                       ('resolved','no_fault_found','follow_up_needed','parts_ordered','referred')),
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE service_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_visits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_visits
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY channel_partner_rw ON service_visits
  USING (channel_partner_id = current_setting('app.current_channel_partner_id', true)::uuid);
```

Three inbound modes (per connector, in priority order):
1. **`webhook`** — the CMMS calls a PeakLogic callback endpoint on work-order status change (best; near-real-time). The callback maps vendor status onto the **funnel stages** (§3): `accepted` → `service_tickets.accepted_at`; on-site/in-progress → a `service_visits` row (`started_at`); done → `completed_at` + `outcome`. Keyed by `external_ref` (the CMMS work-order id), upserted so out-of-order events converge.
2. **`poll`** — PeakLogic polls the CMMS API on a schedule for work orders it dispatched, reconciling the same funnel stages (for CMMS vendors without outbound webhooks). Same reconciliation model as the OEM-cloud Path C poller.
3. **`none`** — no automated readback; the on-site stage is logged via the partner portal "on site" action or manually. The floor, always available.

Vendor status → funnel-stage mapping is part of each adapter (e.g. UpKeep `open`→accepted, `in_progress`→`started_at`, `done`→`completed_at`+`outcome`). Adapters that only surface a subset of stages simply leave the others null — a partial funnel is fine (the conversion headline only needs `dispatched_at` and `started_at`).

---

## 3. The conversion funnel (the model) + the headline KPI

The metric is a **full dispatch funnel**, not a single ratio — because the number alone tells you *what* is happening, but the funnel tells you *where the value leaks*, which is what a partner can act on. Each stage is a timestamp already captured by dispatch (§2.2) or inbound sync (§2.3):

```
Automated WO dispatched to CMMS   (service_tickets.dispatched_at)      100
        │  acceptance rate
        ▼
Accepted in the CMMS              (service_tickets.accepted_at)         92
        │  dispatch→on-site rate  ◄── THE HEADLINE KPI
        ▼
On-site service call             (service_visits.started_at)           68
        │  resolution rate
        ▼
Completed / resolved             (service_visits.completed_at)         61
```

- **Stage counts** (per partner, per tenant, overall, over a period), each scoped to `source='automated' AND channel_partner_id = P AND dispatched_at ∈ [range]`.
- **Stage-to-stage rates:** acceptance (dispatched→accepted), **conversion (dispatched→on-site)**, resolution (on-site→completed).
- **The headline KPI** shown on the dashboard is **dispatched → on-site** — the tangible service the platform generated. It's one stage of the funnel, deliberately chosen as the lead number; the full funnel is retained so no re-instrumentation is needed if a different stage is ever wanted as the headline.

**Why the funnel over a single ratio (decided):** it's a strict superset — it *contains* the headline conversion plus the stages on either side, at the cost of the CMMS adapter reporting a few more status transitions inbound. That extra data is exactly what makes the metric actionable (a leak at accept vs. on-site vs. resolve points to different fixes) and is a stronger partner-facing value story. So: **track the full funnel; lead with dispatched→on-site.**

**Isolation:** every stage count is assembled by **fan-out** — computed per tenant/partner through a scoped read and merged in app code, never a cross-tenant query (Target Ref §5.3). Superadmin fans out over the whole book of business; a partner sees only their own.

**Where it surfaces:** Super-Console Fleet Overview (headline conversion card + trend), partner detail (their full funnel), and the Reports section (full breakdown + export).

---

## 4. The Reports section

A new Super-Console section (scoped variants in the tenant/partner portals). Two tiers.

### 4.1 Standard report catalog (predefined, industry-typical)

Seeded, parameterized report definitions (date range, org/partner/site filter, grouping), exportable CSV/PDF:

| Report | Answers | Vertical |
|---|---|---|
| **Automated Dispatch → Service Call Conversion** | The §3 full funnel (dispatched → accepted → on-site → completed) with each stage-to-stage rate; headline = dispatched→on-site; by partner/tenant/period | Cross-cutting (the value story) |
| **CMMS Dispatch Log** | Every automated work order pushed, its CMMS ref, and current status | Channel |
| **Partner Scorecard** | Work orders received, response time, conversion, outcomes — per partner | Channel |
| **Alert & Response Summary** | Alerts by severity/category/site; MTTA / MTTR | All |
| **Fleet Health & Uptime** | Device online/offline, silent devices, reporting compliance | All |
| **Energy Performance** | Consumption/demand trends, peak demand, cost-saving estimate | Energy |
| **Refrigeration Compliance** | Product-temp excursions vs. FDA cold-holding; food-safety log | Refrigeration |
| **Pool Chemistry Compliance** | pH / free-chlorine / TDS vs. CDC MAHC; out-of-range time | Pool |
| **Pump/HVAC Runtime & Faults** | Runtime hours, fault frequency, threshold breaches | Pump / HVAC |

Seeded definitions (data, like the Policy Engine defaults) — a new standard report is config, not a release.

### 4.2 Custom reports

A saved **report definition** — `{ domain, filters, group_by, metrics, date_range, visualization, format }` over the canonical entities (sites, assets, devices, telemetry, alerts, tickets, **visits**, **CMMS dispatch**). Composed, saved, and optionally **scheduled** (delivered via the Policy Engine notification channels). A bounded builder over known entities — **not** arbitrary SQL, so isolation and the no-injection posture hold.

### 4.3 How reports run (isolation + performance)

- Every report runs as **fan-out of scoped reads** — never a cross-tenant query; RLS enforces scope on every table incl. `service_visits`/`cmms_connectors`.
- Heavy/long-range reports use **read-model aggregates / materialized views** (e.g. nightly `ticket_conversion_daily` by (tenant, partner, day)) so the dashboard KPI is a cheap read.
- CSV/PDF exports generated server-side from the same scoped queries.

---

## 5. API surface (RLS-scoped; fan-out for cross-org)

- `GET /v1/admin/reports/kpi/dispatch-conversion?from=&to=&groupBy=partner|tenant` — the headline KPI.
- `GET /v1/admin/reports` · `GET /v1/admin/reports/{id}/run` · `POST /v1/admin/reports` (+ `.../schedule`).
- **CMMS connectors:** `GET/POST/PUT /v1/admin/channel-partners/{id}/cmms-connector` (staff via act-as) and a partner-portal equivalent.
- **Inbound callback:** `POST /v1/cmms/callback/{connectorId}` — authenticated per-connector; maps a CMMS status change to a `service_visits` upsert.
- Tenant/partner-scoped equivalents for their own reports and connectors.

---

## 6. Delivery phases

1. **Connector framework + outbound push** — `cmms_connectors`, the `service_tickets` attribution columns, the vendor-adapter interface with **`generic_webhook`** (today's `postWebhook`) as adapter #1, and a durable/idempotent dispatch. **Every auto-ticket now becomes an attributable work order.** *(Shipped: migration `1783875900000`, `backend/shared/cmms/*`, ingest wiring, 12 unit tests — behaviour preserved, dispatch stamped transactionally. Remaining sub-items: the durable **retry sweep** for dispatches that never confirm, the one-time **backfill** reclassifying existing alert-generated rows to `source='automated'`, and per-vendor **secret resolution** from Key Vault as credential-backed adapters are added.)*
2. **Inbound sync + `service_visits`** — the callback endpoint and/or poller for the first real partner's CMMS vendor; the numerator starts filling with real data.
3. **The KPI** — the conversion endpoint (fan-out) + Fleet Overview card + partner funnel.
4. **Reports section** — the standard catalog (seeded) + export.
5. **Custom builder + scheduling.**
6. **Read-model rollups** — materialize heavy aggregates when volume warrants.

First real CMMS vendor adapter is chosen by the first partner's actual system (named-need discipline); `generic_webhook` covers the rest until then.

---

## 7. Open decisions

1. ~~**"Service call" definition**~~ **Decided (2026-07-18):** track the **full funnel** (dispatched → accepted → on-site → completed); the **headline KPI is dispatched → on-site** (`service_visits.started_at`). See §3.
2. **First CMMS vendor(s)** — which do the launch partners actually run (UpKeep / Fiix / Limble / MaintainX / ServiceTitan …)? That names adapter #1.
3. **Dispatch target** — always the tenant's attributed `channel_partner_id`, or can a ticket route to a different/tenant-owned CMMS? Schema supports both; default = attributed partner.
4. **Inbound trust** — the callback endpoint must authenticate the CMMS per connector (signed secret / mTLS) and is a real external attack surface — its own threat-model pass before go-live.

---

## 8. Artifact amendments when built

**Database Schema** (`cmms_connectors`, `service_visits`, `service_tickets` columns, read-models + RLS), **Domain Model** (`CmmsConnector`, `ServiceVisit`; ticket `source`/dispatch), **API Specification** (reports, KPI, connector, callback endpoints), **Security / Multi-Tenant Architecture** (audit `service_visits` + connector partner-scope through the two-question framework; the inbound callback threat model; Key Vault credential refs), **Device & Command / Platform Services §6** (CMMS connectors reuse the adapter framework), **ingest `handler.ts`** (stamp `source`/attribution + route through the dispatch outbox), **CLAUDE.md** (the alert→ticket→CMMS dispatch flow).
