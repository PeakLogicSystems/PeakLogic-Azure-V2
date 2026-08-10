# CMMS Dispatch, Conversion KPI & Reporting — Design (Draft)

**Status:** 🟡 Draft v0.1 (2026-07-18)
**Delivers:** [Platform Services §9](platform-services-architecture.md) (Analytics & Reporting) made concrete, plus two superadmin asks — (1) automated tickets are **pushed into the channel partner's CMMS**, and PeakLogic tracks **how many resulted in a service call** (the value KPI); (2) a **Reports** section for standard + custom reports.
**Grounded in:** `docs/data-model.sql` (`service_tickets` already has `webhook_url` + `external_ref`, `tenants.channel_partner_id`, the channel-partner dispatch tables) and `backend/ingest/handler.ts` (auto-ticket creation + webhook post — the seed of the outbound integration).

---

> **⚡ Unified Platform (v2.0) amendment — 2026-07-25.** Adds **compliance / DMR automation** as a reporting class: a regulator-relevant report compiled from a period's monitored values + exceedances (wastewater NPDES/DMR first), operator-as-filer-of-record, audit-backed — schema `compliance_reports`/`compliance_templates`/`exceedance_records` (migration `1784142180000`) plus a built, tested generator (`backend/compliance/report-generator.ts`, coverage-gap-honest). Generation ≠ delivery (CP-5 blocked on absent outbound infra). The dispatch→on-site conversion funnel defined here is unchanged and now also feeds the CMMS view. Full plan: [`unified-platform-integration-plan.md`](unified-platform-integration-plan.md).

> **🚀 Enterprise CMMS amendment — 2026-08-09.** §7 open decision #2 resolved: **The Purple Standard runs ServiceTitan** — a real, named FSM/CRM/billing system, adapter #2 (`backend/shared/cmms/adapters/servicetitan.ts`). Closes the phase-1 "remaining sub-items" named in §6 (durable retry outbox, real `external_ref` persistence) and builds phase 2 (inbound sync + `service_visits`) for real, plus two capabilities not originally scoped here: an **account-data sync** (pulls ServiceTitan Customers/Locations/Estimates/Invoices into a new `cmms_account_records` cache — the "receive data about customer accounts, proposals, and billing" ask) and a **billing export** (a new `BillingRecord`/`sendBilling()` path, period-based, dispatched through the same outbox as work orders). See §2.4/§2.5/§9 below for the full detail; this amendment does not change §3's funnel model or §4's Reports section, both still open.

## 0. The asks, precisely

1. **CMMS dispatch + value KPI:** automated tickets (from critical alerts) must land in the channel partner's **CMMS** (Computerized Maintenance Management System — UpKeep, Fiix, Limble, MaintainX, eMaint, Maximo, ServiceTitan, etc.) as a **work order**. PeakLogic then needs to know **how many of those automated work orders resulted in an actual service call** — the conversion metric that proves the platform generates real service work, shown on the Platform Control Center.
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

**✅ Built 2026-08-09** (adapter #2, ServiceTitan), a real, if narrower, shape than sketched above: the callback is `backend/api/cmms-callback.main.ts` (standalone anonymous Function, `POST /cmms/callback/{connectorId}`), signature-verified per-adapter (`CmmsAdapter.verifyWebhookSignature`), and reconciles via the **existing, unmodified** `advanceWorkOrderStage()` (`work-order-lifecycle-handler.ts`) — funnel stages are `service_tickets`' own four timestamp columns, not a separate `cmms_work_order_ref`/`outcome`-enum table as first sketched; a matching ticket is found by `(cmms_connector_id, external_ref)`, not a synced `service_visits.cmms_work_order_ref`. `poll` mode remains undesigned (webhook is what ServiceTitan's own V2 platform actually offers, confirmed via live lookup — see the adapter's own header).

### 2.4 Billing export — "send service information for billing" (added 2026-08-09)

Not originally scoped in this doc: a **period-based** (not per-event) export of billable services delivered, dispatched to whichever vendor adapter supports it. `BillingRecord` (`backend/shared/cmms/types.ts`) summarizes a tenant's completed `service_visits` for a period; `backend/jobs/cmms-billing-export.main.ts` runs monthly (1st, 06:00 UTC), exporting the **prior** calendar month, and skips a tenant with zero completed visits rather than sending an empty record (this codebase's "never fabricate" discipline applied to invoicing). Dispatched through the **same durable outbox** as work orders (`kind='billing_record'`), to `CmmsAdapter.sendBilling()` — ServiceTitan's posts a standalone Accounting-API invoice, deliberately not an appended line item on a partner-created invoice (this integration has no way to know that invoice's id). A partner's own pricing is never dictated by PeakLogic — the exported record states *what service was delivered*, not a dollar amount.

### 2.5 Account-data sync — "receive data... customer accounts, proposals, and billings" (added 2026-08-09)

Also not originally scoped: a **daily** (05:00 UTC) pull of a connector's own CRM/Sales/Accounting data — ServiceTitan Customers, Locations, Estimates (proposals), Invoices — into a new generic cache table, `cmms_account_records` (`connector_id`, `record_type`, `external_id`, `data JSONB`, nullable `tenant_id`). Deliberately generic JSONB, not a rigid per-field schema: the exact vendor record shape is unverified against a live account (see `adapters/servicetitan.ts`'s own disclosed-uncertainty header). A record's `tenant_id` starts null and is set only when an admin confirms the match (`PUT /v1/admin/channel-partners/{id}/cmms-tenant-mapping/{tenantId}`) — this is also what populates `cmms_connectors.field_mapping.tenantMappings[tenantId]`, the per-tenant Customer/Location ids §2.2's dispatch and §2.4's billing export both require before they can target the right ServiceTitan entity. Runs outside `withTenant()` entirely (`app.cmms_sync_context`, migration `1784300180000`) — a connector-scoped sync has no natural per-tenant iteration boundary the way the dispatch sweep does.

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

**Where it surfaces:** Platform Control Center Fleet Overview (headline conversion card + trend), partner detail (their full funnel), and the Reports section (full breakdown + export).

---

## 4. The Reports section

A new Platform Control Center section (scoped variants in the tenant/partner portals). Two tiers.

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

- `GET /v1/admin/reports/kpi/dispatch-conversion?from=&to=&groupBy=partner|tenant` — the headline KPI. Not yet built (§6 phase 3).
- `GET /v1/admin/reports` · `GET /v1/admin/reports/{id}/run` · `POST /v1/admin/reports` (+ `.../schedule`). Not yet built (§6 phase 4).
- **CMMS connectors — ✅ built 2026-08-09:** `GET/PUT /v1/admin/channel-partners/{id}/cmms-connector` (staff via act-as; `backend/api/routes/admin-cmms-connectors.ts`), plus two endpoints not originally named here — `GET .../cmms-account-records` (review synced data before mapping) and `PUT .../cmms-tenant-mapping/{tenantId}` (confirm a tenant's ServiceTitan Customer/Location ids, §2.5). No partner-portal equivalent yet — staff-only for now.
- **Inbound callback — ✅ built 2026-08-09, one real change from the original design:** `POST /cmms/callback/{connectorId}` — no `/v1/` prefix. This runs as a **standalone anonymous Azure Function** (`backend/api/cmms-callback.main.ts`), not a router.ts route: the caller is a CMMS vendor's server, not an authenticated PeakLogic session, so it needs no Entra JWT and the v1 API's own auth pipeline would only break it. Authentication is the adapter's own signature verification (`CmmsAdapter.verifyWebhookSignature`), not a connector-level shared secret.
- Tenant/partner-scoped equivalents for their own reports and connectors — not yet built.

---

## 6. Delivery phases

1. **Connector framework + outbound push** — `cmms_connectors`, the `service_tickets` attribution columns, the vendor-adapter interface with **`generic_webhook`** (today's `postWebhook`) as adapter #1, and a durable/idempotent dispatch. **Every auto-ticket now becomes an attributable work order.** *(Shipped: migration `1783875900000`, `backend/shared/cmms/*`, ingest wiring, 12 unit tests — behaviour preserved, dispatch stamped transactionally.)* **✅ All three remaining sub-items closed 2026-08-09:** the durable **retry outbox** (`cmms_dispatch_outbox`, migration `1784300180000`, `backend/shared/cmms/outbox.ts` + `cmms-dispatch-sweep.main.ts` running every minute) now actually persists `external_ref` on confirmed dispatch — a real, previously-silent gap (the original fire-and-forget path never wrote it anywhere); per-vendor **secret resolution** from Key Vault is built (`credentials.ts`, generic over any connector's `credential_ref`, not just Postgres's). The one-time **backfill** for pre-existing alert-generated rows remains genuinely undone — no rows existed to backfill in this environment (nothing has ever deployed), flagged as real follow-up before a first production migration from an earlier schema state, not forgotten.
2. **Inbound sync + `service_visits`** — ✅ **built 2026-08-09** for ServiceTitan (adapter #2) — see §2.3's amendment. The numerator starts filling with real data the moment a real connector is configured and dispatching.
3. **The KPI** — the conversion endpoint (fan-out) + Fleet Overview card + partner funnel. Still not built — `computeFunnel()` (work-order-lifecycle.ts) already computes the model from real timestamps; only the `GET /v1/admin/reports/kpi/dispatch-conversion` endpoint and its UI card are missing.
4. **Reports section** — the standard catalog (seeded) + export. Not built.
5. **Custom builder + scheduling.** Not built.
6. **Read-model rollups** — materialize heavy aggregates when volume warrants. Not built — no real dispatch volume exists yet to warrant it.

**Two capabilities not originally scoped in this phase list, built 2026-08-09 alongside adapter #2:** a **billing export** (§2.4) and an **account-data sync** (§2.5) — both real, named asks ("send service information for billing," "receive data... customer accounts, proposals, billings") that arrived with the same partner/vendor decision phase 2 was waiting on, so built together rather than as a separate future phase.

First real CMMS vendor adapter is chosen by the first partner's actual system (named-need discipline) — **resolved 2026-08-09, see §7 item 2**; `generic_webhook` covers every other partner until their own vendor is named.

---

## 7. Open decisions

1. ~~**"Service call" definition**~~ **Decided (2026-07-18):** track the **full funnel** (dispatched → accepted → on-site → completed); the **headline KPI is dispatched → on-site** (`service_visits.started_at`). See §3.
2. ~~**First CMMS vendor(s)**~~ **Decided (2026-08-09): ServiceTitan**, named by a real partner — The Purple Standard. Adapter #2 (`servicetitan.ts`), built alongside this decision rather than after it. Still open for every OTHER partner: UpKeep/Fiix/Limble/MaintainX/Maximo remain unimplemented enum values, `generic_webhook` covers them until their own partner names one.
3. **Dispatch target** — always the tenant's attributed `channel_partner_id`, or can a ticket route to a different/tenant-owned CMMS? Schema supports both; default = attributed partner. Still open — unaffected by the ServiceTitan build.
4. ~~**Inbound trust**~~ **Decided/built 2026-08-09:** HMAC-SHA256 signature verification (`x-servicetitan-signature`, confirmed via live lookup — see `servicetitan.ts`'s own "Sources consulted" header), constant-time comparison, fails closed on any missing/malformed credential. **Genuinely unverified, disclosed honestly, not resolved by this decision:** the digest encoding (hex assumed, not confirmed) and the exact webhook envelope field names (`jobId`/`status` assumed) — both need a real ServiceTitan developer sandbox to confirm before go-live, named explicitly in the adapter's own header rather than silently assumed correct.

---

## 8. Artifact amendments when built

**Database Schema** (`cmms_connectors`, `service_visits`, `service_tickets` columns, read-models + RLS), **Domain Model** (`CmmsConnector`, `ServiceVisit`; ticket `source`/dispatch), **API Specification** (reports, KPI, connector, callback endpoints), **Security / Multi-Tenant Architecture** (audit `service_visits` + connector partner-scope through the two-question framework; the inbound callback threat model; Key Vault credential refs), **Device & Command / Platform Services §6** (CMMS connectors reuse the adapter framework), **ingest `handler.ts`** (stamp `source`/attribution + route through the dispatch outbox), **CLAUDE.md** (the alert→ticket→CMMS dispatch flow).

**✅ Done 2026-08-09:** Database Schema (`cmms_dispatch_outbox`, `cmms_account_records`, the `service_tickets_connector_external_ref_idx`/`cmms_callback_lookup`/`cmms_*_sync_context` additions — migration `1784300180000`, mirrored in `docs/data-model.sql`); CLAUDE.md (new CMMS/ServiceTitan section). **Still open:** Domain Model, API Specification, and Security/Multi-Tenant Architecture have not been formally amended with this pass's additions (`BillingRecord`, `CmmsAccountRecord`, the callback's two-marker system-context read pattern) — a real, disclosed documentation gap, not a silent one, tracked the same way this project tracks every other stale-doc risk (Technical Debt Register).
