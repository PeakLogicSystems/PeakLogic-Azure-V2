# PeakAssist — Intelligent Assistant Architecture & Implementation Plan

**Company:** PeakLogic  ·  **Project codename:** Project Vantage
**Product (unified platform):** PeakLogicSystems (cloud) · PeakView360 (HMI/SCADA) · PeakLogic Hubs (edge) · PeakAssist (help + intelligent assistant)
**Status:** 🟡 Draft v0.1 (2026-07-26) — net-new design artifact. Evolves the existing deterministic PeakAssist help resolver into a retrieval-augmented, LLM-backed assistant on the Microsoft AI stack.
**Depends on / reconciles with:** [PeakAssist Help System](peakassist-help-system-architecture.md) (the built resolver + content model this extends) · [AI Analytics Layer](ai-analytics-layer-design.md) §7a (locked LLM vendor) · [Platform Control Center](platform-control-center-architecture.md) (the review/edit console) · [Security Architecture](security-architecture.md) §2 (Entra identity + RLS) · [Policy Engine](policy-engine-design.md) (permit-limit substrate) · [Multi-Tenant Architecture](multi-tenant-architecture.md) · [Compliance & Certification Roadmap](compliance-certification-roadmap.md) · `backend/compliance/report-generator.ts` (built DMR draft) · `backend/shared/peakassist*.ts` (built resolver/corpus/sync)
**Design target (clickable):** [`prototypes/super-console-demo.html`](prototypes/super-console-demo.html) — the one-click PeakAssist help drawer + Control Center views

---

## 0. Thesis & positioning

PeakAssist already exists as a **deterministic, offline-first help resolver** (`backend/shared/peakassist.ts`, tested; content corpus + Hub sync built — see [PeakAssist Help System](peakassist-help-system-architecture.md)). This document does **not** replace it. It adds an **intelligent-assistant layer on top of the same content model**, so PeakAssist becomes a conversational "how-to + operational + compliance" assistant while keeping every guarantee the resolver already gives (contextual, one-click, offline-via-Hub, no-screen-without-help).

**The load-bearing decision:** the deterministic resolver is the **floor**, the LLM is the **ceiling**. When a Hub is offline or the LLM is unavailable, PeakAssist degrades to the exact resolver behavior that ships today — a safety monitor must never fail into silence. The LLM never becomes a hard dependency for basic help.

**Three answer domains**, one assistant:
1. **How-to / product knowledge** — RAG over the codebase, System Administrator Guide, and System User Guide. Grounded, cited, role-aware.
2. **Live operational answers** — tenant-scoped queries (fleet status, alarms, work orders, permit limits, routes, operator logs) via **function-calling tools that go through the existing `withTenant()` RLS path** — never a raw cross-tenant query.
3. **Compliance guidance (a subset module)** — RAG over a **versioned Florida DEP / EPA regulatory index**, always non-legal, always cited, and wired to interpret the outputs of the automated compliance-validation agent.

---

## 1. Scope

**In:** model selection, RAG architecture, the knowledge-base structure, tenant-scoped data-access tooling, tenant isolation, the Compliance Assistant module, compliance-agent integration, the Platform Control Center authoring/approval/versioning workflow, cost optimization, and the RBAC/security plan.

**Out:** the underlying screens' own behavior (PeakView360 / cloud app); the Hub runtime that serves the offline bundle (that's [PeakLogic Hubs](windows-endpoint-application.md)); the compliance-validation agent's own detection logic (this doc integrates with its **outputs**, it does not design its rule engine — that rides the [Policy Engine](policy-engine-design.md) + `report-generator.ts`); actually filing anything with a regulator (PeakLogic is never the filer of record).

---

## 2. Full system architecture

### 2.1 Component inventory

| # | Component | Microsoft service | Build state |
|---|-----------|-------------------|-------------|
| A | **Assistant orchestrator** — the request brain: classify intent, retrieve, ground, call tools, invoke model, cite, log | Azure Functions (HTTP-triggered), .NET/Node | New |
| B | **Intent router** — how-to vs. operational vs. compliance vs. small-talk; picks the tool/index set | SLM (Phi-3.5-mini) or rules-first classifier | New |
| C | **Knowledge retrieval** — hybrid (vector + keyword) search over the KB indexes | Azure AI Search (vector + semantic ranker) | New |
| D | **Embeddings** — chunk + query embedding | Azure OpenAI `text-embedding-3-small` (cheapest tier) *or* an open embedding model self-hosted; see §5.3 | New |
| E | **Primary generation model** — grounded answer synthesis | **Phi-3.5-mini-instruct** served via Azure AI Foundry serverless (Models-as-a-Service) | New |
| F | **Escalation model** — hard synthesis / long-context reasoning only | **Claude (Haiku 4.5 → Opus 4.8) via Microsoft Foundry** (§7a of AI Analytics, already locked) | New |
| G | **Tenant-data tool layer** — function-calling tools that read tenant data | Azure Functions calling `backend/shared/db.ts` `withTenant()` | New (reuses built RLS) |
| H | **Deterministic resolver (fallback + grounding seed)** | `backend/shared/peakassist.ts` | ✅ Built |
| I | **Regulatory index** — versioned FL DEP / EPA corpus | Azure AI Search index + `regulatory_documents` table | New |
| J | **Compliance-agent bridge** — reads compliance-validation-agent findings, explains + cites | Azure Functions + existing `report-generator.ts` outputs | New |
| K | **Authoring / approval CMS** — Control Center surface for KB review/edit/version/publish | Platform Control Center UI + `kb_*` tables | New (design-stage) |
| L | **Audit + query log** — every question, retrieval set, tool call, answer, citations | `audit_log_entries` + `peakassist_query_log` | New (extends built audit) |
| M | **Guardrail / grounding checker** — refuse-if-ungrounded, PII/prompt-injection screen | Azure AI Content Safety + a groundedness check | New |

### 2.2 Component diagram (text)

```
                         ┌───────────────────────────── PeakView360 (HMI, on-Hub) ────────────────────────────┐
   User surfaces  ───►   │  cloud app (browser)   ·   channel-partner portal   ·   Platform Control Center     │
                         └───────────────────────────────────────┬──────────────────────────────────────────┘
                                                                  │  (validated Entra token: tenantId + roles)
                                                                  ▼
                                              ┌──────────────────────────────────┐
                                              │   (A) Assistant Orchestrator      │  Azure Functions
                                              │   Azure Functions (stateless)     │
                                              └───┬───────────┬───────────┬───────┘
                        ┌─────────────────────────┘           │           └──────────────────────────┐
                        ▼                                      ▼                                      ▼
             ┌────────────────────┐              ┌────────────────────────┐            ┌──────────────────────────┐
             │ (B) Intent router  │              │ (C) Knowledge retrieval │            │ (G) Tenant-data tools    │
             │  Phi-3.5 / rules   │              │  Azure AI Search        │            │  withTenant() → RLS      │
             └────────────────────┘              │  hybrid vector+keyword  │            │  (Postgres, per-tenant)  │
                                                 └───────────┬────────────┘            └────────────┬─────────────┘
                                                             │                                       │
                            ┌────────────────────────────────┼──────────────────────┐               │
                            ▼                                 ▼                      ▼               ▼
                 ┌────────────────────┐          ┌────────────────────┐   ┌────────────────┐  (only THIS tenant's
                 │ Product KB index   │          │ Regulatory index   │   │ Help corpus    │   rows are ever
                 │ code + SysAdmin +  │          │ (I) FL DEP / EPA,  │   │ (H) resolver   │   returned — RLS
                 │ User Guides        │          │ versioned + cited  │   │ deterministic  │   fails closed)
                 └────────────────────┘          └────────────────────┘   └────────────────┘
                            │                                 │
                            └───────────────┬─────────────────┘
                                            ▼
                            ┌──────────────────────────────────┐
                            │ (E) Phi-3.5 generate (grounded)   │──► (M) groundedness + Content Safety
                            │   escalate → (F) Claude/Foundry   │        │
                            └──────────────────┬────────────────┘        │
                                               ▼                         ▼
                                   answer + citations + role-scoped   (L) audit + query log
                                                                      (append-only)

   Authoring path:  Platform Control Center (K) ──edit/approve/version──► kb_* tables ──publish──► reindex (C)/(I)
```

### 2.3 Data-flow diagram (text) — three canonical requests

**Flow 1 — "How do I add a new device to a lift station?" (how-to)**
```
token(tenantId,roles) → orchestrator → intent=how_to → embed query (D)
  → hybrid search product KB (C), filter by role visibility → top-k chunks
  → Phi-3.5 (E) synthesizes step-by-step answer grounded ONLY in retrieved chunks
  → groundedness check (M): every claim traces to a chunk, else "I don't have that documented"
  → answer + citations (guide §, file path) + "Was this helpful?" → log (L)
```

**Flow 2 — "Which of my sites have open critical alarms right now?" (operational)**
```
token → orchestrator → intent=operational → router picks tool `getAlarms(status=critical)`
  → tool layer (G) opens withTenant(tenantId) → SET LOCAL app.current_tenant_id → RLS query
  → rows returned are, by construction, ONLY this tenant's (RLS fails closed)
  → Phi-3.5 (E) formats a natural-language summary over the structured result (no free-floating facts)
  → answer + "as of <timestamp>" + log the exact tool call + row count (L)
```

**Flow 3 — "The compliance agent flagged a TSS exceedance at Riverside — what do I do?" (compliance)**
```
token → orchestrator → intent=compliance → bridge (J) loads the agent finding (tenant-scoped)
  → retrieve regulatory index (I): matching FL DEP/EPA citation for the parameter + permit context
  → Phi-3.5 (E) [escalate to Claude (F) if multi-rule synthesis] produces:
       what the flag means · citation + summary · operational steps · safety note · documentation reminder · escalation contact
  → ALWAYS append: "This is guidance only, not legal advice."
  → groundedness check (M): every regulatory claim cites a versioned regulatory_documents row
  → log finding id + citations + regulatory index version (L)
```

---

## 3. Model selection & justification

**Directive honored:** prefer no-/low-cost Microsoft small language models; avoid expensive proprietary models unless absolutely necessary. This reconciles with the already-locked "Claude via Microsoft Foundry" decision (AI Analytics §7a) by making Claude the **rare escalation**, not the default.

| Task | Model | Why | Cost posture |
|------|-------|-----|--------------|
| Intent routing | **Phi-3.5-mini-instruct** (or a rules-first classifier) | Tiny, fast, classification is easy; often no model call at all | Near-zero |
| Embeddings | **`text-embedding-3-small`** (Azure OpenAI) | Cheapest first-party embedding; 1536-dim, strong retrieval | ~$0.02 / 1M tokens; embed-once-at-index |
| **Primary generation** | **Phi-3.5-mini-instruct** via **Azure AI Foundry serverless (MaaS)** | Microsoft SLM, RAG-grounded answers over retrieved chunks need synthesis not deep reasoning; runs cheap; can also be self-hosted for $0 marginal | Pay-per-token serverless, or fixed compute if self-hosted |
| **Escalation only** | **Claude Haiku 4.5 → Opus 4.8 via Microsoft Foundry** | For multi-document compliance synthesis or long-context reasoning the SLM can't ground reliably. Azure-native (§7a), no new egress/vendor review | Gated: only when groundedness/complexity thresholds trip |
| Guardrails | **Azure AI Content Safety** + a groundedness evaluator | Prompt-injection / PII / jailbreak screening; refuse-if-ungrounded | Low, per-call |

**Escalation policy (explicit, so cost stays predictable):** the orchestrator escalates from Phi-3.5 to Claude only when **(a)** the groundedness check on the SLM answer fails twice, **(b)** the retrieved context exceeds the SLM's reliable context budget, or **(c)** intent = compliance AND the finding spans ≥ 2 regulatory rules. Every escalation is logged with the reason, so escalation rate is a monitored, budgetable metric (see §11 cost).

**Fine-tuning stance — deliberately NOT fine-tuning first.** The directive says "trained or fine-tuned on the codebase/guides." **RAG, not fine-tuning, is the correct primary mechanism** here, and this is a real recommendation, not a shortcut:
- The codebase and guides change every release (the project has a hard "docs stay current every release" rule). A fine-tuned model goes stale the moment code merges; a RAG index is re-built on publish and is always current.
- Fine-tuning bakes content into weights with no citation trail — this assistant **must cite** (product answers → guide §/file; compliance → regulation). RAG preserves provenance; fine-tuning destroys it.
- Fine-tuning a model on a single tenant's data would be a tenant-isolation hazard. RAG keeps tenant data out of weights entirely.
- **Where fine-tuning earns its place (Phase 4+):** a small LoRA/PEFT adapter on Phi-3.5 for **tone and format** (operator-friendly, step-numbered, wrench-in-hand voice) — trained only on the *public, non-tenant* guide corpus, never on tenant data. That improves style without touching provenance or isolation.

---

## 4. Retrieval augmentation strategy

### 4.1 Indexes (Azure AI Search)
- **`kb-product`** — the codebase + System Administrator Guide + System User Guide + the existing `PEAKASSIST_CONTENT` corpus. Global (PeakLogic-authored, same for every tenant), non-tenant.
- **`kb-regulatory`** — the versioned FL DEP / EPA corpus (§8). Global, versioned, citation-bearing.
- Both are **global/non-tenant** indexes because product docs and regulations are not tenant data. **Tenant data is never embedded into a search index** — it's read live through the RLS tool layer (§6). This is the single most important isolation choice in the retrieval design.

### 4.2 Chunking & metadata
- **Guides:** chunk by section/subsection with heading breadcrumbs; carry `{source, section, version, role_visibility}`.
- **Codebase:** chunk by symbol/function with file-path + doc-comment; only files that inform *how-to* (routes, handlers, config, migrations, the guides' referenced behavior) — not secrets, not `.env`, not test fixtures.
- **Regulatory:** chunk by rule/subsection (e.g., F.A.C. 62-600/62-610 subsections, EPA NPDES parameters); carry `{citation, effective_date, superseded_by, source_url, regulatory_index_version}`.
- Every chunk carries a stable `chunk_id` so citations are reproducible and the Control Center can trace an answer back to an editable KB entry.

### 4.3 Retrieval mechanics
- **Hybrid search**: vector (embedding) + keyword (BM25) + Azure AI Search **semantic ranker** — hybrid beats pure-vector for the exact-term matches operators use ("TSS", "wet well", "IC40 salt cell").
- **Role-filtered retrieval**: chunks tagged `role_visibility` are filtered by the caller's Entra roles *before* generation, so a Field Technician and a Customer Administrator get answers scoped to what they may see/do.
- **Grounding contract**: the generation prompt instructs "answer only from the provided context; if it isn't there, say you don't have it documented and offer to escalate." The groundedness evaluator (M) enforces this — an ungrounded answer is suppressed, not shown.
- **Embed-once**: embeddings are computed at **publish/index time**, not per query (only the short query is embedded live) — the dominant cost control.

---

## 5. Knowledge-base structure

Three KB sources, one authoring model, distinct isolation postures:

| KB | Source | Isolation | Versioning | In an index? |
|----|--------|-----------|------------|--------------|
| **Product** | Codebase + SysAdmin Guide + User Guide + `PEAKASSIST_CONTENT` | Global (all tenants) | Tied to platform release (SemVer) + guide `vN.M` | Yes (`kb-product`) |
| **Regulatory** | FL DEP (F.A.C. 62-600 domestic wastewater, 62-610 reuse, biosolids rules), EPA NPDES/CWA | Global | Its own `regulatory_index_version` (§8) | Yes (`kb-regulatory`) |
| **Tenant operational** | Fleet, facility config, equipment, alarms, work orders, operator logs, compliance flags, routes, permit limits | **Per-tenant, RLS** | Live (not versioned KB) | **No — never indexed; read live via RLS** |

The existing `help_content` / `help_content_bundles` schema (built) is the seed and the offline-delivery vehicle for the Product KB. The intelligent layer extends it with `kb_*` authoring/versioning tables (§9) and the two search indexes; it does not fork the content model.

---

## 6. Tenant-scoped data access architecture

**Principle: PeakAssist has no privileged data path.** Every operational answer flows through the **same `withTenant()` RLS transaction** the rest of the backend uses (`SET LOCAL app.current_tenant_id = '<uuid>'`, Postgres Row-Level Security on every tenant-scoped table — CLAUDE.md "Tenant Isolation" pattern). PeakAssist is just another authenticated caller.

### 6.1 The tool layer (function calling)
The model never writes SQL and never sees another tenant's rows. It selects from a **fixed catalog of typed, read-only tools**, each of which:
1. Is invoked by the orchestrator (not the model directly), with `tenantId` taken from the **validated Entra token**, never from the prompt.
2. Opens `withTenant(tenantId)` and runs a parameterized query — RLS makes cross-tenant rows unreturnable even if the query were wrong (fails closed: no tenant context → 0 rows, not all rows).
3. Returns structured data the model formats but cannot fabricate around (groundedness applies to operational answers too — "as of <timestamp>", exact counts).

Tool catalog (read-only, all RLS-scoped): `getFleetStatus`, `getFacilityConfig(siteId)`, `getEquipmentProfile(deviceId)`, `getAlarms(filter)`, `getWorkOrders(filter)`, `getOperatorLogs(siteId, period)`, `getComplianceFlags(siteId)`, `getRouteData`, `getPermitLimits(siteId)`.

### 6.2 Staff act-as (Control Center)
When PeakLogic staff use PeakAssist from the Control Center *about a specific tenant*, the tool layer uses the already-built **`withStaffActingOnTenant()`** (Security Architecture §2; audited act-as, not impersonation). Every such call writes `audit_log_entries.actor_staff_user_id`. Staff never get an ambient cross-tenant read — a "fleet-wide" staff question is answered by **fan-out** (N per-tenant scoped reads merged), never a cross-tenant query, preserving the Platform Control Center's load-bearing invariant.

### 6.3 What is logged (auditability)
Every request appends to `peakassist_query_log` (tenant-scoped) + `audit_log_entries`: `{ actor, actor_staff_user_id?, tenant_id, question, intent, tools_called[], row_counts, kb_index_versions, model_used, escalated?, citations[], answer_hash, timestamp }`. This is the evidence trail for SOC 2 and for "prove PeakAssist never leaked cross-tenant."

---

## 7. Tenant isolation strategy (defense in depth)

Five independent layers, each of which alone prevents cross-tenant leakage:

1. **Identity** — three separate Entra tenants (Security Architecture §2): `PeakLogicCustomers` (CIAM), `PeakLogicPartners` (CIAM), `StaffPool` (workforce). The token's `tenantId`/`roles` claim is the only source of tenant identity; the prompt is never trusted for it.
2. **Data plane (RLS)** — Postgres Row-Level Security via `withTenant()`; fails **closed** (no context ⇒ no rows). The ingest bypass (system process) is explicitly *not* reachable from PeakAssist.
3. **Retrieval plane** — tenant operational data is **never embedded** into any search index; only global product/regulatory content is indexed. There is no vector store that could return another tenant's data because their data isn't in one.
4. **Prompt/context plane** — the model only ever receives (a) global KB chunks and (b) the current tenant's own tool results. No cross-tenant content can enter the context window.
5. **Audit plane** — every query + tool call + row count logged, append-only, attributable. An isolation regression is detectable after the fact and testable before ship.

**Isolation architecture test (hard gate, mirrors the super-console rule):** an automated test asserts that no PeakAssist tool path can execute without a tenant context, and that a staff fleet query is a fan-out of scoped reads, never a single cross-tenant query. This ships as a build-time gate, not a runtime hope.

---

## 8. Compliance Assistant (subset module)

A specialization of the same pipeline, with a dedicated regulatory index and stricter guardrails. **It gives regulatory *guidance*, never legal advice, and PeakLogic is never the filer of record** (consistent with the built `report-generator.ts` filer-of-record disclaimer).

### 8.1 What it produces (for any compliance question or agent finding)
- **Citation + summary** — the specific FL DEP (F.A.C. 62-600 domestic wastewater / 62-610 reuse / biosolids) or EPA NPDES/CWA provision, with a plain-language summary.
- **Operational guidance** — concrete steps to investigate/respond (grounded, cited).
- **Safety considerations** — e.g., chlorine/disinfection handling, confined-space, effluent hazards.
- **Documentation reminders** — what to log/retain (operator logs, sampling records, DMR fields).
- **Escalation contacts** — the tenant's configured compliance officer + the relevant FL DEP district office (data, not invented).
- **Mandatory disclaimer, every response:** *"This is guidance only, not legal advice."* — appended by the orchestrator, non-removable by the model.

### 8.2 Regulatory data: storage, versioning, retrieval, update
- **Storage:** `regulatory_documents` (global, non-RLS — reference data, same posture as other platform reference tables) — `{ id, jurisdiction (FL-DEP|EPA), citation, title, body, effective_date, superseded_by, source_url, checksum, regulatory_index_version }`. Embedded into the `kb-regulatory` Azure AI Search index.
- **Versioning:** a monotonic **`regulatory_index_version`** (a checksummed set, mirroring the built `help_content_bundles` pattern). Every compliance answer records the exact index version it cited, so an answer is reproducible and an outdated citation is provable — never silently current.
- **Update strategy (human-gated, never auto-live):** regulations change and a wrong citation is a real harm, so updates flow through the Control Center approval pipeline (§9): draft new/updated `regulatory_documents` → editor review → **approver sign-off** → publish a new `regulatory_index_version` → reindex → real-time push to the assistant. Sourcing can be assisted (scheduled fetch/diff of FL DEP / EPA published sources) but the diff is a *proposal*, not a live change — a human approves before it can be cited.
- **Retrieval:** identical hybrid search to §4, filtered to `kb-regulatory`, citation-bearing, groundedness-enforced.

---

## 9. Automated compliance-validation agent integration

PeakLogic's compliance-validation agent periodically evaluates treatment performance, disinfection levels, flow rates, permit limits, monitoring frequencies, biosolids handling, reuse-system performance, alarm conditions, operator-log completeness, and sampling/reporting requirements. Its rule substrate is the **[Policy Engine](policy-engine-design.md)** (permit limits as platform→tenant→site→asset policies) + `report-generator.ts` (period summaries, exceedances, coverage gaps). *That engine is out of scope here; PeakAssist integrates with its **outputs**.*

**PeakAssist as the interpretation layer over agent findings:**
- **Interpret outputs** — the bridge (J) loads a finding (tenant-scoped via RLS) and turns "TSS 32 mg/L > permit 30 mg/L on 2026-07-25" into an operator-legible explanation.
- **Contextual guidance** — retrieves the matching regulatory citation + the relevant screen/procedure help, produces investigate/respond steps.
- **Citations** — every regulatory claim cites a versioned `regulatory_documents` row; every operational step cites the guide/procedure.
- **Recommended operational steps** — grounded, role-scoped, advisory-never-authoritative (like the AI Analytics layer, the assistant *drafts*, the operator decides; it never arms actuation).
- **Log all outputs** — each interpretation is written to `peakassist_query_log` + `audit_log_entries` with the finding id, citations, and index versions, so the Control Center can review exactly what guidance was given for which finding.
- **Console-level review & editing** — every agent-finding interpretation is a reviewable, editable record in the Control Center (§10): staff can correct guidance, and a correction becomes a KB improvement (a new/edited `kb_*` entry) that flows through the approval pipeline.

**Coverage honesty (inherited from `report-generator.ts`):** a parameter with no readings is a *coverage gap*, surfaced as such — PeakAssist never interpolates or implies a value that wasn't measured.

---

## 10. Platform Control Center integration (authoring, approval, versioning, real-time push)

PeakAssist's knowledge and outputs are governed from the **[Platform Control Center](platform-control-center-architecture.md)** (the revised Super Admin Console). This is the human-in-the-loop that keeps the assistant correct and current.

### 10.1 Data model (`kb_*` tables)
- **`kb_entry`** — an editable knowledge unit: `{ id, kb (product|regulatory), title, body, source_ref, role_visibility, status (draft|in_review|approved|published|archived), current_version_id }`.
- **`kb_entry_version`** — immutable snapshot per edit: `{ id, entry_id, version_no, body, editor_id, created_at, change_note }`. Append-only (nothing is edited in place — the audit trail is the versions).
- **`kb_publication`** — a checksummed, published set of approved versions = one `kb_index_version` / `regulatory_index_version`. Mirrors the built `help_content_bundles` pattern (versioned + checksummed + reproducible).
- **`peakassist_query_log`** / **`compliance_interpretation_log`** — the reviewable output records (§6.3, §9).

### 10.2 Workflow & approval pipeline
```
draft (editor) → in_review → approver sign-off (2nd person, RBAC-gated) → publish
      → new kb_publication (version bump + checksum) → reindex Azure AI Search → real-time push
```
- **Review** — staff review any PeakAssist output or agent-finding interpretation; a bad answer becomes an edit.
- **Edit / add / correct** — edit an existing entry, add new reference material, correct outdated regulatory citations.
- **Approve before live** — publishing requires an approver distinct from the editor (segregation of duties; RBAC — §11). Nothing an editor drafts is citable until approved.
- **Versioned regulatory index** — each publish is an immutable, checksummed version; answers record which version they cited (reproducibility + provable staleness).
- **Real-time push** — publish triggers an Azure Function that reindexes the affected chunks and flips the live `kb_index_version`; in-flight requests finish on the prior version, new requests use the new one (no torn reads). Hubs pull the new Product-KB bundle via the **already-built `PeakAssistSync`** delta/checksum mechanism, so offline surfaces converge too.

### 10.3 Retrieval architecture (publish → serve)
Approved+published entries are chunked (§4.2), embedded once (§3), and written to `kb-product` / `kb-regulatory` with their `kb_index_version`. The orchestrator always queries the current published version; the Control Center can preview an unpublished version against a staging index before flipping it live.

---

## 11. Cost optimization plan

The Azure cost kill-switch/budget discipline (CLAUDE.md "Azure Cost Kill Switch") applies to every always-on or per-call AI cost. Concrete controls:

1. **SLM-first, escalate rarely** — Phi-3.5 answers the overwhelming majority; Claude-via-Foundry only on the explicit escalation triggers (§3), and escalation rate is a logged, budgeted metric.
2. **Embed once, at publish** — only the short query is embedded per request; the corpus is embedded at index time, not per query.
3. **Deterministic resolver handles the trivial** — many "how-to" hits are answered by the built resolver with **no model call at all** (contextual screen guide). The LLM is for the questions the resolver can't shape.
4. **Cache** — cache (question-embedding → answer) for common questions per KB version; invalidate on publish. Operator questions repeat heavily ("how do I acknowledge an alarm").
5. **Right-size hosting** — Phi-3.5 via Foundry serverless (pay-per-token) until volume justifies a fixed endpoint; self-hosting Phi-3.5 on existing App Service/AKS compute is the $0-marginal path once volume is steady. Decide with real usage, not up front.
6. **No always-on GPU by default** — serverless/MaaS until metered demand proves a reserved endpoint is cheaper. Any reserved endpoint is gated behind the same budget action as Postgres.
7. **Token discipline** — top-k retrieval capped; role-filtering shrinks context; system prompt is terse and cached where the platform supports prompt caching.

---

## 12. Security & RBAC plan

- **AuthN** — every request carries a validated Entra token (customer/partner CIAM or staff workforce). `tenantId`/`roles` come from the token, never the prompt (`getAuth()` discipline, fail-closed on missing/invalid).
- **AuthZ / RBAC** —
  - *Ask PeakAssist*: any authenticated user, scoped to their tenant + role-filtered retrieval.
  - *Compliance Assistant*: available to operator/admin roles; findings scoped by RLS.
  - *Edit KB / regulatory*: **KB Editor** role (draft/edit) vs. **KB Approver** role (publish) — segregation of duties, both PeakLogic-staff roles in the Control Center's RBAC expansion (Platform Control Center §6). No editor can self-publish.
  - *Act-as*: staff answering about a tenant use audited `withStaffActingOnTenant()`.
- **Guardrails** — Azure AI Content Safety (prompt-injection, jailbreak, PII) on input and output; groundedness evaluator suppresses ungrounded answers; the compliance disclaimer is non-removable.
- **Data handling** — tenant data never leaves the RLS path into an index or into model weights; model calls to Foundry stay Azure-native (no new egress, per §7a). Prompts/answers logged for audit are tenant-scoped and access-controlled like any tenant data.
- **Isolation test as a gate** (§7) — build-time, not runtime.

---

## 13. Implementation roadmap

| Phase | Deliverable | Depends on | State |
|-------|-------------|------------|-------|
| **0** | Foundation: Azure AI Search + Foundry SLM endpoint provisioned in `infra-azure/`; budget/kill-switch coverage extended to AI spend | Azure subscription (still none in this env) | design |
| **1** | **Product-KB RAG (how-to), read-only** — index code+guides+`PEAKASSIST_CONTENT`; orchestrator; Phi-3.5 grounded answers + citations; resolver stays the fallback | built resolver/corpus | design |
| **2** | **Tenant-data tool layer** — the 9 RLS tools via `withTenant()`; operational answers; full query logging; isolation architecture test | built RLS/`withTenant` | design |
| **3** | **Compliance Assistant** — `regulatory_documents` + `kb-regulatory` index; FL DEP 62-600/62-610 + EPA NPDES seed corpus; disclaimer; citations; versioned regulatory index | Phase 1 | design |
| **4** | **Compliance-agent bridge** — interpret agent findings, guidance+citations, logging | compliance agent (Policy Engine + `report-generator.ts`) | design |
| **5** | **Control Center CMS** — `kb_*` tables, draft→review→approve→publish, versioned index, real-time push/reindex; Hub bundle sync reuse | Platform Control Center UI | design |
| **6** | **Escalation + tuning** — Claude-via-Foundry escalation path; optional style LoRA on Phi-3.5 (public corpus only); caching; cost dashboards | Phases 1–5 | design |

Governance: each phase traces to the PRD once amended (PA-* requirements), holds the "no-screen-without-help" gate, and ships behind a feature flag (same discipline as `AI_ANALYTICS_ENABLED`/`POLICY_ENGINE_ENABLED` — default off until validated).

---

## 14. Risks & mitigation

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **Cross-tenant leakage** (the catastrophic one) | 5-layer defense (§7); tenant data never indexed; RLS fails closed; isolation test as a build gate; full audit |
| 2 | **Hallucinated regulatory citation** (real-world harm) | Groundedness evaluator suppresses ungrounded answers; every citation ties to a versioned `regulatory_documents` row; mandatory "guidance only, not legal advice"; human-approved index only |
| 3 | **Stale regulations** | Versioned regulatory index; answers record the version cited; assisted diff-and-propose, human-approved publish; "as of" surfaced |
| 4 | **Prompt injection via tenant data or docs** | Content Safety screening; tenantId from token not prompt; tools are a fixed typed catalog (model can't craft SQL); output screening |
| 5 | **Runaway LLM cost** | SLM-first, gated escalation with logged rate; embed-once; resolver handles trivial; cache; serverless until volume; budget kill-switch |
| 6 | **Offline degradation** | Deterministic resolver is the always-available floor; Hub carries the Product-KB bundle; LLM/operational answers gracefully unavailable offline, help never is |
| 7 | **Model/vendor drift** (Foundry availability/pricing moves) | Re-verify Foundry model availability at build time (§7a discipline); SLM-primary means no single-vendor hostage; abstraction over the model call |
| 8 | **Over-trust of advisory output** | Advisory-never-authoritative; operator is decision-maker + filer of record; deterministic Policy-Engine thresholds remain the safety floor; every answer cited |
| 9 | **Fine-tuning isolation hazard** | No fine-tuning on tenant data ever; only optional style-LoRA on the public guide corpus |

---

## 15. Recommended next steps

1. **Amend the PRD/SRS** with PeakAssist intelligent-assistant requirements (PA-8+: RAG how-to, operational tools, Compliance Assistant, agent bridge, CMS) so the build traces to spec (architecture-first governance).
2. **Prototype Phase 1 offline-safe** — the orchestrator + `kb-product` index + Phi-3.5 grounding can be built and evaluated against the existing guides/corpus with **no Azure subscription** (local Phi-3.5 + a local vector store) to validate answer quality and the groundedness contract before spending.
3. **Write the isolation architecture test first** (§7) — before any tenant-data tool ships, the "no query without tenant context / fleet = fan-out" test is the gate.
4. **Seed the regulatory corpus deliberately** with a compliance SME — FL DEP 62-600/62-610 + EPA NPDES for the wastewater beachhead (Ace/Bayfront), citation-accurate, human-approved. This is content work, not code work, and is the long pole for the Compliance Assistant.
5. **Confirm the Phi-3.5-vs-Claude escalation thresholds** against real answer-quality evals before wiring the escalation path (Phase 6), so escalation stays rare and cost stays predictable.
6. **Reconcile with AI Analytics §7a** in that doc's next revision — note that PeakAssist makes Claude-via-Foundry the *escalation* tier, SLM the default, which is fully consistent with the locked vendor choice.

---

## 16. Honesty ledger (real vs. design)

- **Real today (built, tested):** the deterministic PeakAssist resolver (`peakassist.ts`), the content corpus (`peakassist-content.ts`, `PEAKASSIST_CONTENT`), the seed migration + golden-file test, the Hub bundle-sync delta/checksum engine (`peakassist-sync.ts`); the tenant-isolation substrate (`withTenant()` RLS, `withStaffActingOnTenant()`, `audit_log_entries`); the Policy Engine (permit-limit substrate); the compliance `report-generator.ts` (DMR draft + coverage-gap honesty + filer-of-record disclaimer); the Control Center design + prototype.
- **Design-stage (this document):** everything in the intelligent-assistant layer — the orchestrator, the RAG indexes, the SLM/embedding/escalation model wiring, the tenant-data tool layer, the Compliance Assistant + regulatory index, the compliance-agent bridge, the Control Center CMS/approval/versioning, and the cost/guardrail machinery. **No Azure subscription exists in this environment**, so none of the Azure AI services here have been provisioned or validated — same disclosed limitation as every other `infra-azure/` artifact. Re-verify Foundry/AI Search availability and pricing at build time.

## 17. Revision history
| Version | Date | Notes |
|---|---|---|
| Draft v0.1 | 2026-07-26 | Initial intelligent-assistant architecture. Evolves the built deterministic resolver into a RAG + SLM (Phi-3.5) assistant with a gated Claude-via-Foundry escalation, tenant-scoped RLS tool layer, Compliance Assistant with a versioned FL DEP/EPA regulatory index, compliance-agent-output interpretation, and a Platform Control Center authoring/approval/versioning pipeline. SLM-first cost posture reconciles the low-cost directive with the locked §7a vendor choice. All Azure services design-stage/unprovisioned. |
