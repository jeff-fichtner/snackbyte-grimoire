-- 001 The Invocation — the whole schema, with ownership present from the first row.
--
-- Every tenant-owned table carries tenant_id NOT NULL, and every composite uniqueness on
-- such a table includes it. That second half is the one that gets forgotten: a globally
-- unique slug means the second tenant integrating the same source collides with the first
-- on a primary key. The predecessor shipped exactly that defect.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── platform layer ──────────────────────────────────────────────────────────────────────
-- The one table that is NOT tenant-scoped. It exists so identity is always a lookup —
-- getRest(applicationId) — and never a constant read once at boot.
CREATE TABLE applications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding    text NOT NULL,
  tenant_id  uuid,                      -- NULL = the platform's shared application
  token_ref  text NOT NULL,             -- a name, never a value
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (binding, tenant_id)
);

-- The composite above does NOT enforce one platform application per binding: Postgres
-- treats NULLs as distinct in a UNIQUE constraint, so ('discord', NULL) would insert
-- repeatedly and getRest would then pick arbitrarily between two identities. Nothing
-- would error. This partial index is what actually holds the invariant.
CREATE UNIQUE INDEX applications_one_platform_per_binding
  ON applications (binding) WHERE tenant_id IS NULL;

-- ── tenant layer ────────────────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE applications
  ADD CONSTRAINT applications_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id);

-- One community belongs to exactly one tenant. This uniqueness is deliberately NOT
-- tenant-scoped: two tenants claiming the same community is the conflict to reject.
CREATE TABLE installs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id),
  binding       text NOT NULL,
  community_ref text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (binding, community_ref)
);

-- `id` is the untrusted selector that appears in the inbound URL. Unguessable so it is not
-- enumerable, but it grants nothing on its own — it only picks which secret to check.
CREATE TABLE source_registrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants (id),
  source     text NOT NULL,
  secret_ref text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source, id)
);

CREATE TABLE destinations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants (id),
  install_id  uuid NOT NULL REFERENCES installs (id),
  channel_ref text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, install_id, channel_ref)
);

-- A stored sentence. `condition` and `verb_config` hold the one rule language: closed,
-- validated shapes, not a place to smuggle logic.
CREATE TABLE spells (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id),
  name            text NOT NULL,
  trigger_species text NOT NULL,
  source          text NOT NULL,
  event_type      text NOT NULL,
  condition       jsonb,
  verb            text NOT NULL,
  verb_config     jsonb NOT NULL,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX spells_match ON spells (tenant_id, source, event_type) WHERE enabled;

-- No surface selects `value`. The repository exposes only resolveSecret(tenantRef, ref).
CREATE TABLE secrets (
  tenant_id  uuid NOT NULL REFERENCES tenants (id),
  ref        text NOT NULL,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, ref)
);

CREATE TABLE records (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants (id),
  spell_id   uuid REFERENCES spells (id),   -- NULL when the law refused before a spell
  source     text,
  event_type text,
  dedupe_key text NOT NULL,
  outcome    text NOT NULL,
  detail     text,                          -- never a secret, never a full payload
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CONSTRAINT records_outcome_closed CHECK (
    outcome IN ('pending', 'delivered', 'deduped', 'declined', 'refused', 'failed')
  ),
  -- The concurrency arbiter. Claimed BEFORE delivery is attempted, so two concurrent
  -- copies of one event cannot both deliver: the database serializes the claim, where a
  -- check-then-act in application code has a race window open exactly during a retry storm.
  UNIQUE (spell_id, dedupe_key)
);

CREATE INDEX records_recent ON records (tenant_id, created_at DESC);
