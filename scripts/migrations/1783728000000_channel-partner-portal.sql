-- Channel-partner portal entities (Domain Model v1.1 §2.7, approved
-- 2026-07-11): white-label branding on channel_partners, plus four new
-- tables backing TR-1.1-TR-3.2 (territory/technician/dispatch
-- management) and CH-3.1 (the scoped operational-dispatch portal).
--
-- All four new tables are channel-partner-scoped, not tenant-scoped --
-- no tenant_id column, no RLS. This mirrors the existing channel_partners
-- precedent (PeakLogic-internal/partner reference data, access controlled
-- at the application layer, not by tenant isolation, since there is no
-- single tenant_id to isolate by -- a route_stops row can reference sites
-- across multiple different tenants attributed to the same partner).
-- The concrete access-control mechanism (how a partner_admin/technician
-- session is authorized to read across those tenants) is Multi-Tenant
-- Architecture's (#14) job, not decided here -- see Database Schema §4.4.

-- Up Migration

ALTER TABLE channel_partners ADD COLUMN branding JSONB;
COMMENT ON COLUMN channel_partners.branding IS
  'Nullable. {logo_url, primary_color, secondary_color} for the white-label portal login (CH-3.1). Null for an attribution-only partner not onboarded to the portal.';

CREATE TABLE territories (
  id                 UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID                  NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  name               TEXT                  NOT NULL,
  boundary           GEOGRAPHY(POLYGON, 4326) NOT NULL,
  created_at         TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX territories_channel_partner_idx ON territories(channel_partner_id);

CREATE TABLE channel_partner_users (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_partner_id UUID        NOT NULL REFERENCES channel_partners(id) ON DELETE CASCADE,
  cognito_sub        TEXT        NOT NULL UNIQUE,
  email              TEXT        NOT NULL,
  display_name       TEXT,
  role               TEXT        NOT NULL
                     CHECK (role IN ('partner_admin','technician')),
  territory_id       UUID        REFERENCES territories(id) ON DELETE SET NULL,  -- 0..1, technician only
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX channel_partner_users_partner_idx ON channel_partner_users(channel_partner_id);
CREATE INDEX channel_partner_users_territory_idx ON channel_partner_users(territory_id);

CREATE TABLE route_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_user_id UUID        NOT NULL REFERENCES channel_partner_users(id) ON DELETE CASCADE,
  route_date         DATE        NOT NULL,
  source             TEXT        NOT NULL
                     CHECK (source IN ('ai_suggested','manual')),
  status             TEXT        NOT NULL DEFAULT 'suggested'
                     CHECK (status IN ('suggested','confirmed')),
  confirmed_by       UUID        REFERENCES channel_partner_users(id) ON DELETE SET NULL,
  confirmed_at       TIMESTAMPTZ,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (technician_user_id, route_date)
);

CREATE TABLE route_stops (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  route_assignment_id UUID    NOT NULL REFERENCES route_assignments(id) ON DELETE CASCADE,
  site_id             UUID    NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  sequence_number     INTEGER NOT NULL,
  UNIQUE (route_assignment_id, sequence_number)
);

CREATE INDEX route_stops_assignment_idx ON route_stops(route_assignment_id);

-- Down Migration

DROP TABLE IF EXISTS route_stops;
DROP TABLE IF EXISTS route_assignments;
DROP TABLE IF EXISTS channel_partner_users;
DROP TABLE IF EXISTS territories;
ALTER TABLE channel_partners DROP COLUMN IF EXISTS branding;
