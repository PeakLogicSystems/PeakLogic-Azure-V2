-- Policy Engine — schema + platform-default seed (Policy Engine Design §3, §8
-- step 1: "Schema + seed, no behaviour change").
--
-- This migration is deliberately INERT at runtime: nothing reads `policies`
-- yet. The ingest path still evaluates the compiled-in RULES_BY_CATEGORY
-- (backend/ingest/rules.ts) until the resolver + POLICY_ENGINE_ENABLED flag
-- land (Design §8 steps 2–3). So applying this changes no observable
-- behaviour — it only creates the tables and seeds the platform defaults.
--
-- Isolation model is UNCHANGED (Design §3.4): `policies` is an ordinary
-- tenant-scoped table (RLS on app.current_tenant_id, like users/sites/assets),
-- PLUS a global-read allowance for the platform-default rows (tenant_id NULL),
-- which are the shared catalog every tenant inherits. Platform rows are
-- writable only by a superuser (this migration) or a future staff path —
-- no tenant policy grants write to a NULL-tenant row.
--
-- The seed rows below are the SQL mirror of backend/ingest/policy-seed.ts
-- (PLATFORM_THRESHOLD_POLICIES). policy-seed.test.ts asserts (a) that module
-- reproduces RULES_BY_CATEGORY byte-for-byte and (b) this SQL seed matches
-- that module — so SQL == module == hardcoded rules, guarded by tests.

-- Up Migration

CREATE TABLE policies (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id) ON DELETE CASCADE,   -- NULL = platform default
  scope_level  TEXT        NOT NULL CHECK (scope_level IN ('platform','tenant','site','asset')),
  scope_id     UUID,                                                    -- site/asset id when scoped there
  category     TEXT        NOT NULL,
  kind         TEXT        NOT NULL CHECK (kind IN ('threshold','config_template','notification')),
  definition   JSONB       NOT NULL,
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  version      INTEGER     NOT NULL DEFAULT 1,
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- platform rows have no tenant; tenant/site/asset rows must; site/asset rows need a scope_id
  CONSTRAINT policies_scope_check CHECK (
    (scope_level = 'platform' AND tenant_id IS NULL)
    OR (scope_level = 'tenant' AND tenant_id IS NOT NULL)
    OR (scope_level IN ('site','asset') AND tenant_id IS NOT NULL AND scope_id IS NOT NULL)
  )
);
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies FORCE ROW LEVEL SECURITY;

-- Every tenant may READ the platform-default catalog (tenant_id NULL)...
CREATE POLICY policies_platform_read ON policies FOR SELECT
  USING (tenant_id IS NULL);

-- ...and may read/write ONLY its own scoped rows (same shape as the
-- tenant_isolation policy on every other operational table). A USING-only
-- policy is reused as WITH CHECK, so this governs SELECT/INSERT/UPDATE/DELETE
-- and, crucially, blocks writing a row for any other tenant or for the
-- platform (tenant_id NULL never equals a set tenant id).
CREATE POLICY policies_tenant_rw ON policies FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX policies_resolve_idx ON policies (category, kind, tenant_id, scope_level);

-- Append-only change history (Design §3.5). Safety-critical config: a
-- threshold change on real equipment must be reconstructable, so prior
-- states are retained here, never updated in place. Empty until the override
-- CRUD lands (Design §8 step 4); created now so the model is coherent.
CREATE TABLE policy_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id   UUID        NOT NULL,
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  definition  JSONB       NOT NULL,
  enabled     BOOLEAN     NOT NULL,
  changed_by  TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason      TEXT
);
ALTER TABLE policy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_history FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_history_platform_read ON policy_history FOR SELECT
  USING (tenant_id IS NULL);
CREATE POLICY policy_history_tenant_rw ON policy_history FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE INDEX policy_history_policy_idx ON policy_history (policy_id, version);

-- Cache-invalidation epoch (Design §4.2): bumped whenever a tenant's policies
-- change so a warm ingest instance knows to re-resolve. Additive, defaulted —
-- no backfill. The resolver reads it later; nothing reads it now.
ALTER TABLE tenants ADD COLUMN policy_epoch INTEGER NOT NULL DEFAULT 1;

-- ── Platform-default threshold seed (mirror of policy-seed.ts) ──────────────
INSERT INTO policies (tenant_id, scope_level, scope_id, category, kind, definition) VALUES
  (NULL, 'platform', NULL, 'pump', 'threshold', '{"metric":"power_kw","condition":"gt","severity":"warning","threshold":{"type":"spec_relative","spec":"power_kw","fallback":5,"factor":1.25},"message_template":"Power draw {value:1} kW exceeds rated limit {threshold:1} kW"}'::jsonb),
  (NULL, 'platform', NULL, 'pump', 'threshold', '{"metric":"power_kw","condition":"gt","severity":"critical","threshold":{"type":"spec_relative","spec":"power_kw","fallback":5,"factor":1.5},"message_template":"Power draw {value:1} kW is critically high (limit: {threshold:1} kW)"}'::jsonb),
  (NULL, 'platform', NULL, 'pump', 'threshold', '{"metric":"flow_lpm","condition":"lt","severity":"warning","threshold":{"type":"spec_relative","spec":"flow_lpm","fallback":100,"factor":0.75},"message_template":"Flow rate {value:0} L/min is below minimum {threshold:0} L/min"}'::jsonb),
  (NULL, 'platform', NULL, 'pump', 'threshold', '{"metric":"pressure_psi","condition":"gt","severity":"critical","threshold":{"type":"spec_relative","spec":"pressure_psi","fallback":80,"factor":1.2},"message_template":"Pressure {value:0} psi exceeds safe limit {threshold:0} psi"}'::jsonb),
  (NULL, 'platform', NULL, 'hvac', 'threshold', '{"metric":"temp_c","condition":"gt","severity":"critical","threshold":{"type":"spec_relative","spec":"temp_max_c","fallback":180,"factor":1},"message_template":"Temperature {value:0}°C exceeds maximum {threshold:0}°C"}'::jsonb),
  (NULL, 'platform', NULL, 'hvac', 'threshold', '{"metric":"temp_c","condition":"lt","severity":"warning","threshold":{"type":"static","value":60},"message_template":"Temperature {value:0}°C is below operating range (min 60°C)"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_system', 'threshold', '{"metric":"flow_lpm","condition":"lt","severity":"warning","threshold":{"type":"spec_relative","spec":"flow_lpm","fallback":150,"factor":0.8},"message_template":"Pool flow rate {value:0} L/min is below minimum {threshold:0} L/min"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_system', 'threshold', '{"metric":"temp_c","condition":"gt","severity":"warning","threshold":{"type":"static","value":35},"message_template":"Pool temperature {value:1}°C is above safe limit (35°C)"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_chemistry', 'threshold', '{"metric":"ph","condition":"lt","severity":"warning","threshold":{"type":"static","value":7},"message_template":"Pool pH {value:1} is below the CDC-recommended range (7.0-7.8) — water may be corrosive and irritating to swimmers"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_chemistry', 'threshold', '{"metric":"ph","condition":"gt","severity":"warning","threshold":{"type":"static","value":7.8},"message_template":"Pool pH {value:1} is above the CDC-recommended range (7.0-7.8) — chlorine''s ability to kill germs is reduced"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_chemistry', 'threshold', '{"metric":"ph","condition":"gt","severity":"critical","threshold":{"type":"static","value":8},"message_template":"Pool pH {value:1} is critically high — chlorine''s disinfecting effectiveness is significantly impaired above pH 8.0 (CDC MAHC)"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_chemistry', 'threshold', '{"metric":"free_chlorine_ppm","condition":"lt","severity":"warning","threshold":{"type":"static","value":2},"message_template":"Free chlorine {value:1} ppm is below the CDC-recommended minimum (2 ppm) — water may not be adequately disinfected"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_chemistry', 'threshold', '{"metric":"free_chlorine_ppm","condition":"gt","severity":"critical","threshold":{"type":"static","value":10},"message_template":"Free chlorine {value:1} ppm exceeds the CDC bather-safety limit (10 ppm)"}'::jsonb),
  (NULL, 'platform', NULL, 'pool_chemistry', 'threshold', '{"metric":"tds_ppm","condition":"gt","severity":"warning","threshold":{"type":"static","value":1500},"message_template":"Total dissolved solids {value:0} ppm exceeds the industry-standard guideline ({threshold:0} ppm) — water clarity and chemical efficiency may degrade"}'::jsonb),
  (NULL, 'platform', NULL, 'gas_sensor', 'threshold', '{"metric":"gas_leak_detected","condition":"gt","severity":"critical","threshold":{"type":"static","value":0.5},"message_template":"Gas leak detected — immediate shutoff/inspection required"}'::jsonb),
  (NULL, 'platform', NULL, 'refrigeration', 'threshold', '{"metric":"product_temp_c","condition":"gt","severity":"warning","threshold":{"type":"spec_relative","spec":"temp_max_c","fallback":4.4,"factor":1},"message_template":"Product temperature {value:1}°C exceeds FDA safe cold-holding limit {threshold:1}°C"}'::jsonb),
  (NULL, 'platform', NULL, 'refrigeration', 'threshold', '{"metric":"product_temp_c","condition":"gt","severity":"critical","threshold":{"type":"static","value":7},"message_template":"Product temperature {value:1}°C has been in the food-safety danger zone — discard-risk threshold exceeded"}'::jsonb),
  (NULL, 'platform', NULL, 'leak_sensor', 'threshold', '{"metric":"leak_detected","condition":"gt","severity":"critical","threshold":{"type":"static","value":0.5},"message_template":"Leak detected — immediate shutoff/inspection required to prevent water damage"}'::jsonb),
  (NULL, 'platform', NULL, 'energy_meter', 'threshold', '{"metric":"power_kw","condition":"gt","severity":"warning","threshold":{"type":"spec_relative","spec":"power_kw","fallback":10,"factor":1.3},"message_template":"Power draw {value:1} kW exceeds expected baseline {threshold:1} kW"}'::jsonb),
  (NULL, 'platform', NULL, 'energy_meter', 'threshold', '{"metric":"power_kw","condition":"gt","severity":"critical","threshold":{"type":"spec_relative","spec":"power_kw","fallback":10,"factor":1.6},"message_template":"Power draw {value:1} kW is critically high (expected baseline: {threshold:1} kW)"}'::jsonb);

-- Down Migration

ALTER TABLE tenants DROP COLUMN IF EXISTS policy_epoch;
DROP TABLE IF EXISTS policy_history;
DROP TABLE IF EXISTS policies;
