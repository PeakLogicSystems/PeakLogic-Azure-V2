# Policy Engine — Design (Draft)

**Status:** 🟡 Draft v0.1 (2026-07-18)
**Delivers:** [Platform Services Architecture §3](platform-services-architecture.md) Tier-1 item 1 — turn hardcoded alert rules into config-driven, inheritable, versioned, tenant-owned policy. The single highest-leverage "product → platform" move.
**Grounded in:** `backend/ingest/rules.ts` (the live rule engine) and `backend/ingest/handler.ts` (how it's evaluated).

---

## 0. What's live today (the thing we're generalizing)

`ingest/rules.ts` holds `RULES_BY_CATEGORY: Record<string, Rule[]>` across 8 categories (`pump`, `hvac`, `pool_system`, `pool_chemistry`, `gas_sensor`, `refrigeration`, `leak_sensor`, `energy_meter`). Each `Rule`:

```ts
interface Rule {
  metric: string;
  condition: 'gt' | 'lt';
  threshold: number | ((specs: AssetSpecs) => number);   // static OR spec-relative
  severity: Alert['severity'];                            // 'warning' | 'critical'
  message: (value: number, threshold: number) => string;
}
```

Evaluated by a **pure** function in the ingest hot path (`handler.ts` step 4):

```ts
const fired = evaluateRules(device.category, metrics, device.specs);   // → FiredRule[]
// then: dedup on (device_id, metric, severity) while open/ack, INSERT alert,
//       critical → create ticket → tenant.settings.webhook_url → postWebhook
```

**Two facts that shape the entire design:**
1. **Every function-threshold in the seed is exactly `(specs.SPEC ?? FALLBACK) * FACTOR`.** No richer math exists. So a *structured* threshold (`{spec, fallback, factor}`) reproduces 100% of the current rules with **no expression evaluator and no injection surface**. This is the key simplification.
2. The evaluator is already a pure function taking a rule list. If the resolver produces a `Rule[]` identical in shape, **the evaluation logic barely changes** — we swap the *source* of the rules, not the math.

---

## 1. Goals / non-goals

**Goals:** thresholds, device-config templates, and notification routing become **data**: tenant/site/asset-scoped, inheritable, versioned, audited, self-serviceable — without a code deploy, and without ever weakening tenant isolation or failing a safety-critical monitor into silence.

**Non-goals (deliberate):** a general rules DSL / scripting engine (the structured form suffices); ML/anomaly policies (separate concern); replacing dedup/ticket/webhook mechanics (unchanged); a config UI (that's the console/portal work, downstream).

---

## 2. Three policy kinds

| Kind | Generalizes | Status in this design |
|---|---|---|
| **`threshold`** | `RULES_BY_CATEGORY` alert rules | **Primary — fully designed here (live subsystem)** |
| **`config_template`** | Device-twin desired properties (ZTP config-push) | Schema slot defined; build gated on IoT Hub deploy |
| **`notification`** | `tenants.settings.webhook_url` + severity routing/escalation | Schema slot defined; generalize after threshold ships |

The data model below is one table serving all three (`kind` discriminates). Only `threshold` is wired end-to-end first.

---

## 3. Data model

### 3.1 `policies` table

```sql
CREATE TABLE policies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid REFERENCES tenants(id),         -- NULL = platform default (global catalog)
  scope_level  text NOT NULL CHECK (scope_level IN ('platform','tenant','site','asset')),
  scope_id     uuid,                                 -- site_id or asset_id when scope_level is site/asset; else NULL
  category     text NOT NULL,                        -- 'pump', 'pool_chemistry', ... (matches assets.category)
  kind         text NOT NULL CHECK (kind IN ('threshold','config_template','notification')),
  definition   jsonb NOT NULL,                       -- see §3.2
  enabled      boolean NOT NULL DEFAULT true,         -- false at a scope = disable an inherited rule
  version      integer NOT NULL DEFAULT 1,
  created_by   text,                                 -- staff oid or tenant user id
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Fast resolution lookups
CREATE INDEX policies_resolve_idx ON policies (category, kind, tenant_id, scope_level);
```

Invariants: `scope_level='platform'` ⇒ `tenant_id IS NULL`; `scope_level IN ('tenant','site','asset')` ⇒ `tenant_id NOT NULL`; `site`/`asset` ⇒ `scope_id NOT NULL` (enforced by a CHECK + a resolution-time guard).

### 3.2 `definition` JSONB — the `threshold` kind

One row = one rule. Reproduces every seed rule with a closed structured form:

```jsonc
// spec-relative (covers all function-thresholds in the seed):
{
  "metric": "power_kw",
  "condition": "gt",
  "severity": "warning",
  "threshold": { "type": "spec_relative", "spec": "power_kw", "fallback": 5, "factor": 1.25 },
  "message_template": "Power draw {value:1} kW exceeds rated limit {threshold:1} kW"
}
// static:
{
  "metric": "ph", "condition": "gt", "severity": "critical",
  "threshold": { "type": "static", "value": 8.0 },
  "message_template": "Pool pH {value:1} is critically high — chlorine disinfection is impaired above pH 8.0 (CDC MAHC)"
}
```

- `threshold.type` is a **closed enum** (`static` | `spec_relative`). No eval, no formula strings. If a future rule genuinely needs richer math, *extend the enum* with a new structured type — never introduce a string evaluator.
- `message_template` uses `{value}` / `{threshold}` with optional precision `:{n}` (e.g. `{value:1}` → `toFixed(1)`), rendered by the resolver. This reproduces the seed messages exactly, which the golden-baseline test (§8) enforces.

`config_template` and `notification` definitions get their own JSONB shapes (§6, §7).

### 3.3 Rule identity & inheritance

**Rule identity within a category = `(metric, condition, severity)`** — verified unique across every seed rule (e.g. `pump.power_kw/gt/warning` vs `pump.power_kw/gt/critical` are distinct). This identity is what an override *targets*.

```
platform default  (tenant_id NULL)         ← full seed rule set, always present
   └─ tenant override    (scope tenant)     ← change threshold / disable / add, per identity
        └─ site override  (scope site)
             └─ asset override (scope asset)  ← most specific wins
```

Three override operations, all expressed as a row:
- **Modify** — a row at a more specific scope with the same identity → replaces threshold/message.
- **Disable** — same identity, `enabled=false` at that scope → rule removed for matching devices.
- **Add** — a new identity at any scope → an extra rule.

### 3.4 RLS (isolation preserved, unchanged model)

```sql
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies FORCE ROW LEVEL SECURITY;

-- Read: platform defaults are global-read; tenant rows only within tenant scope
CREATE POLICY policies_read ON policies FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Write to tenant-scoped rows: only within that tenant's scope
CREATE POLICY policies_write ON policies FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

Platform-default rows (`tenant_id NULL`) are **read-only to tenants** and writable only by staff through a distinct staff path (created/edited via `withStaffSession` with an explicit superadmin check, never through the tenant policy). A tenant can *override* a platform default (its own scoped row) but can never *edit* the global catalog. This is the same platform-catalog-vs-tenant-data split the capability model uses.

### 3.5 Versioning & history (safety-critical, non-optional)

A threshold change on safety equipment is a safety event and must be reconstructable. Every write:
- bumps `version`,
- appends the prior state to `policy_history` (append-only: `policy_id, version, definition, enabled, changed_by, changed_at, reason`),
- writes an `audit_log_entries` row attributed to the actor `oid` with a before/after diff.

History is never deleted (same discipline as the doc-archiving rule).

---

## 4. Resolution & evaluation

### 4.1 Resolver → `Rule[]`

`resolveThresholdRules(client, { category, siteId, assetId }) → Rule[]`:

```
rows = SELECT * FROM policies
       WHERE kind='threshold' AND category=$category
         AND ( scope_level='platform'
            OR scope_level='tenant'
            OR (scope_level='site'  AND scope_id=$siteId)
            OR (scope_level='asset' AND scope_id=$assetId) )
       -- RLS already restricts tenant_id to platform-null + current tenant

group rows by identity (metric, condition, severity)
for each group:
    winner = most specific scope present (asset > site > tenant > platform)
    if winner.enabled == false: skip (rule disabled at this scope)
    else: emit a Rule { metric, condition, threshold: compile(winner.definition.threshold),
                        severity, message: render(winner.definition.message_template) }
return rules
```

`compile()` turns the structured threshold into the same `number | (specs)=>number` the evaluator already expects — a `spec_relative` becomes `(s) => (s[spec] ?? fallback) * factor`, reproducing today's closures exactly. So **the existing `evaluateRules` needs only a signature tweak** — take a resolved `Rule[]` instead of reaching into the hardcoded map:

```ts
// before: evaluateRules(category, metrics, specs)   // internally reads RULES_BY_CATEGORY
// after:  evaluateRules(rules, metrics, specs)       // rules from resolveThresholdRules(...)
```

The threshold math, `gt/lt`, undefined-metric skip, and `FiredRule` output are **unchanged** — which is exactly why the migration can be proven byte-identical.

### 4.2 Caching (the hot path stays hot)

Ingest evaluates per reading; a DB round-trip per reading is unacceptable. Cache resolved `Rule[]` per **`(tenant_id, category, siteId, assetId)`** in the warm Function instance, invalidated by a **policy epoch**:
- `tenants.policy_epoch integer` (and a global `platform_policy_epoch`) bumped on any relevant write.
- The device lookup already in `handler.ts` also selects `policy_epoch`; if the cached entry's epoch matches, use it; else re-resolve. Cheap check, rare refetch — same warm-instance pattern the pg pool already uses.

### 4.3 Fail-safe: never fail a monitor into silence

This is a **safety system**. If policy resolution fails (DB blip, malformed row), the evaluator must NOT skip alerting:
1. Fall back to the last-known-good cached `Rule[]` for that key.
2. If none, fall back to the **compiled-in seed** — `rules.ts` stays shipped permanently as the ultimate fallback, not deleted after cutover.
3. Emit an operational alert that policy resolution degraded.

Fail *closed toward more monitoring*, never toward none. Keeping the compiled seed as a permanent floor is a deliberate world-class safety choice.

---

## 5. Integration point in ingest (the exact change)

In `handler.ts` step 4, replace:

```ts
if (device.asset_id && device.category) {
  const fired = evaluateRules(device.category, metrics, device.specs);   // reads hardcoded map
  ...
}
```

with:

```ts
if (device.asset_id && device.category) {
  const rules = POLICY_ENGINE_ENABLED
    ? await resolvePolicyRules(client, {                 // RLS-scoped, cached, fail-safe
        category: device.category, siteId: device.site_id, assetId: device.asset_id,
        epoch: device.policy_epoch })
    : RULES_BY_CATEGORY[device.category] ?? [];           // legacy path (flag off)
  const fired = evaluateRules(rules, metrics, device.specs);
  ...
}
```

Everything downstream (dedup on `(device_id, metric, severity)`, alert INSERT, critical→ticket→webhook) is **untouched**. The resolver runs *after* `SET LOCAL app.current_tenant_id` (line 104), so its policy reads are naturally tenant-scoped by the same RLS as everything else.

---

## 6. `config_template` kind (device-plane, gated)

Definition shape (desired device-twin properties, ZTP config-push per Target Ref §8–9):

```jsonc
{ "reporting_interval_s": 60, "metrics": ["flow_gpm","ph","orp"],
  "firmware_channel": "stable-4.2.1", "thresholds_hint": "…" }
```

Same scoping/inheritance/RLS. A change resolves the effective template for matching devices and **re-pushes twin desired properties** through the Command & Control bus (Platform Services §4). Build **after** a real IoT Hub deploy — schema is reserved now so the model is coherent.

## 7. `notification` kind (generalize `webhook_url`)

Definition shape generalizing today's single `tenants.settings.webhook_url`:

```jsonc
{ "on_severity": ["critical"], "channels": [{"type":"webhook","url":"…"},{"type":"email","to":["ops@…"]}],
  "escalate_after_min": 15, "quiet_hours": {"tz":"America/Los_Angeles","from":"22:00","to":"06:00"} }
```

Resolved at alert/ticket creation; replaces the inline `webhook_url` lookup. Same scoping/RLS/audit. Generalize **after** thresholds ship, so there's one proven pattern before widening.

---

## 8. Migration & rollout (reversible, proven)

1. **Schema + seed (no behavior change).** Add `policies`/`policy_history`/`policy_epoch`; a seed migration writes every `RULES_BY_CATEGORY` rule as a `platform`/`tenant_id NULL` `threshold` row — messages hand-mapped to templates (≈24 rows, one-time). `POLICY_ENGINE_ENABLED=false`. Ingest still uses the hardcoded map. Nothing observable changes.
2. **Golden-baseline test (the proof).** For a matrix of `(category, metrics, specs)` covering every rule and boundary, assert `evaluateRules(resolve(seed)) === evaluateRules(RULES_BY_CATEGORY)` — identical fired rules, thresholds, **and messages**. The existing rules tests become the baseline. If it isn't byte-identical, the seed is wrong, not the code.
3. **Enable platform-only.** Flip `POLICY_ENGINE_ENABLED=true` in `dev`; ingest now resolves from DB (platform defaults only — still identical behavior). Soak.
4. **Expose overrides.** Add tenant/site/asset override CRUD (§9) via console act-as + tenant portal. Now customers self-serve.
5. **Config templates + notifications** follow (§6–7), device-plane gated.

Rollback at any step = flip the flag off (legacy hardcoded path) — always available because `rules.ts` is never removed.

---

## 9. API surface

All RLS-scoped, audited, versioned:
- **Tenant portal** (`withTenant`): `GET/POST/PUT/DELETE /v1/policies` — a tenant admin manages its own overrides.
- **Platform Control Center** (`withStaffActingOnTenant`): `.../v1/admin/tenants/{id}/policies` — staff manage a tenant's policies via act-as.
- **Platform catalog** (staff, superadmin-gated): manage the `tenant_id NULL` defaults.
- Reads return the **effective** (resolved) policy set plus the raw overrides, so a UI can show "inherited vs overridden."

---

## 10. Security, audit & safety (summary)

- **Isolation unchanged** — `policies` is just another RLS-scoped tenant table; platform defaults are global-read/staff-write catalog. No cross-tenant read path introduced.
- **Least privilege** — tenants override, never edit the global catalog; platform writes are superadmin-gated.
- **Audited + versioned** — every change → `policy_history` (append-only) + `audit_log_entries` with actor `oid` and diff.
- **Fail-safe** — compiled seed is a permanent fallback; a monitor never fails into silence (§4.3).
- **Safety-critical stays local-first** — the Policy Engine governs *cloud* alerting/config; on-device trip logic (leak/gas shutoff) is unaffected.

---

## 11. Testing

- **Golden-baseline** (§8.2) — the cutover proof.
- **Resolution unit tests** — precedence (asset > site > tenant > platform), disable, add; identity collisions.
- **Threshold compile tests** — `spec_relative` with/without the spec present (fallback path), `static`.
- **Message render tests** — precision tokens reproduce seed strings exactly.
- **RLS tests** — a tenant can't read/write another tenant's policies; can't edit platform defaults.
- **Fail-safe test** — resolution error falls back to cache, then seed; never returns "no rules."
- **Isolation architecture test** — the resolver only touches the DB through the tenant-scoped connection.

---

## 12. Phasing & what NOT to build yet

**Build now:** schema + seed + golden test + resolver + cached fail-safe evaluation + platform-only enablement + threshold override CRUD.
**Next:** config templates (post-IoT-Hub), notification rules.
**Do NOT build yet:** a rules DSL/scripting engine, ML/anomaly policies, a per-metric plausibility-bounds system, or a policy UI ahead of the endpoints. Each is a real later option triggered by a real need — not now.

---

## 13. Artifact amendments when built

Per non-silent-amendment discipline: **Database Schema** (new tables + RLS), **API Specification** (policy endpoints), **Security/Multi-Tenant Architecture** (audit `policies` through the two-question cross-scope framework), **Ingest/`rules.ts`** (seed-source + resolver, seed retained as fallback), **CLAUDE.md** ("hardcoded in `RULES_BY_CATEGORY`" → "seeded from `RULES_BY_CATEGORY`, resolved via the Policy Engine; seed retained as compiled fallback").
