# Data Model — 001 The Invocation

Phase 1. Every table carries its owner from the first migration; there is no unowned row and
no "tenant zero".

## The ownership rule, stated once

**Every tenant-owned table has `tenant_id NOT NULL REFERENCES tenants(id)`, and every unique
constraint on such a table includes `tenant_id`.** The second half is the one that gets
forgotten: a globally-unique `slug` means the second tenant integrating the same source
collides with the first on a primary key. That was a real defect in the predecessor
(`sources.slug` was a global PK), and it is designed out here rather than migrated away later.

---

## Entities

### `tenants`

The isolation boundary. Everything else belongs to exactly one.

| Column       | Type          | Notes                          |
| ------------ | ------------- | ------------------------------ |
| `id`         | `uuid` PK     |                                |
| `name`       | `text`        | human label, not an identifier |
| `created_at` | `timestamptz` |                                |

### `applications` — platform-owned, not tenant-scoped

The platform's identity on one binding: the credential a verb ultimately speaks through. Exactly
one row in this feature.

It is a row rather than a constant so that identity is always a **lookup** —
`getRest(applicationId)` — and never `env.DISCORD_BOT_TOKEN` read once at boot. That is the seam
the constitution's Technology Constraints require, and it is what keeps a second application (a
tenant's own, or one connection of a sharded pool) a data change rather than a signature change
at every call site. The predecessor deferred exactly this and then priced the resulting refactor
as the single most expensive item in its tenancy work.

| Column      | Type            | Notes                                                     |
| ----------- | --------------- | --------------------------------------------------------- |
| `id`        | `uuid` PK       | every consumer resolves its client by this                |
| `binding`   | `text` NOT NULL | which platform, e.g. `discord`                            |
| `tenant_id` | `uuid` NULL     | → `tenants`. **NULL = the platform's shared application** |
| `token_ref` | `text` NOT NULL | a name, never a value                                     |
| `enabled`   | `boolean`       | default true                                              |
|             |                 | **UNIQUE** `(binding, tenant_id)` + partial index, below   |

**The composite uniqueness is not sufficient on its own, and this is easy to miss.** Postgres
treats NULLs as *distinct* in a `UNIQUE` constraint, so `('discord', NULL)` can be inserted more
than once — two platform applications for one binding, with `getRest` then picking arbitrarily
between them. The migration must therefore add a partial unique index alongside it:

```sql
CREATE UNIQUE INDEX applications_one_platform_per_binding
  ON applications (binding) WHERE tenant_id IS NULL;
```

The composite constraint keeps one application per tenant per binding; the partial index keeps
exactly one platform-owned application per binding. Both are required.

`tenant_id` is nullable here and `NOT NULL` everywhere else. That is deliberate, not an
inconsistency: this is the one platform-layer table, and the constitution forbids giving platform
infrastructure a tenant reference merely to look symmetrical. While it is NULL the `token_ref`
resolves through the platform config path; a tenant-owned application would resolve through the
tenant secret store. **The call site is identical either way** — which is the entire point.

### `installs`

The verified fact that the platform may act in one community on one binding. Created by hand
in this feature; the install flow that creates it is a later spec.

| Column           | Type            | Notes                                            |
| ---------------- | --------------- | ------------------------------------------------ |
| `id`             | `uuid` PK       |                                                  |
| `tenant_id`      | `uuid` NOT NULL | → `tenants`                                      |
| `binding`        | `text` NOT NULL | which platform, e.g. `discord`                   |
| `community_ref`  | `text` NOT NULL | the platform's own id for the community          |
| `enabled`        | `boolean`       | default true                                     |
|                  |                 | **UNIQUE** `(binding, community_ref)`            |

That uniqueness is deliberately **not** tenant-scoped: one community may belong to only one
tenant, and two tenants claiming the same community is precisely the conflict to reject.

### `source_registrations`

A tenant's relationship with one external source, and the reference to the secret that proves
an event genuinely came from it.

| Column       | Type            | Notes                                       |
| ------------ | --------------- | ------------------------------------------- |
| `id`         | `uuid` PK       | also the public selector in the inbound path |
| `tenant_id`  | `uuid` NOT NULL | → `tenants`                                 |
| `source`     | `text` NOT NULL | adapter key, e.g. `github`                  |
| `secret_ref` | `text` NOT NULL | a name, never a value                       |
| `enabled`    | `boolean`       | default true                                |
|              |                 | **UNIQUE** `(tenant_id, source, id)`        |

**The `id` is the untrusted selector.** It appears in the URL, so it must be unguessable
(uuid v4) but must grant nothing on its own — it selects which secret to check (FR-003).

### `destinations`

Somewhere a spell can speak.

| Column        | Type            | Notes                                    |
| ------------- | --------------- | ---------------------------------------- |
| `id`          | `uuid` PK       |                                          |
| `tenant_id`   | `uuid` NOT NULL | → `tenants`                              |
| `install_id`  | `uuid` NOT NULL | → `installs`; ties it to a community     |
| `channel_ref` | `text` NOT NULL | the platform's own id for the place      |
| `enabled`     | `boolean`       | default true                             |
|               |                 | **UNIQUE** `(tenant_id, install_id, channel_ref)` |

### `spells`

A stored sentence. One trigger, an optional condition, a verb, and where it speaks.

| Column           | Type            | Notes                                                     |
| ---------------- | --------------- | --------------------------------------------------------- |
| `id`             | `uuid` PK       |                                                           |
| `tenant_id`      | `uuid` NOT NULL | → `tenants`                                               |
| `name`           | `text` NOT NULL |                                                           |
| `trigger_species`| `text` NOT NULL | `external_call` in this feature                           |
| `source`         | `text` NOT NULL | which adapter's events start it                           |
| `event_type`     | `text` NOT NULL | exact match                                               |
| `condition`      | `jsonb`         | nullable; a predicate in the one rule language            |
| `verb`           | `text` NOT NULL | registry key, e.g. `post_message`                         |
| `verb_config`    | `jsonb` NOT NULL| transform + destination reference                         |
| `enabled`        | `boolean`       | default true                                              |
|                  |                 | **UNIQUE** `(tenant_id, name)`                            |

`condition` and `verb_config` are data in the one rule language (see contracts). They are
**not** a place to smuggle logic: the shapes are closed and validated on read, so an
unrecognized key is a refusal rather than an escape hatch.

### `secrets`

Reference name → value. Written at runtime; never rendered.

| Column      | Type            | Notes                          |
| ----------- | --------------- | ------------------------------ |
| `tenant_id` | `uuid` NOT NULL | → `tenants`                    |
| `ref`       | `text` NOT NULL |                                |
| `value`     | `text` NOT NULL | encrypted at rest              |
|             |                 | **PK** `(tenant_id, ref)`      |

No surface selects `value`. The repository exposes only `resolveSecret(tenantRef, ref)`.

### `records`

The durable outcome of one invocation. Also the idempotency arbiter.

| Column       | Type            | Notes                                                       |
| ------------ | --------------- | ----------------------------------------------------------- |
| `id`         | `uuid` PK       |                                                             |
| `tenant_id`  | `uuid` NOT NULL | → `tenants`                                                 |
| `spell_id`   | `uuid`          | NULL when the law refused before a spell was reached         |
| `source`     | `text`          |                                                             |
| `event_type` | `text`          |                                                             |
| `dedupe_key` | `text` NOT NULL | derived from the source's own event id                       |
| `outcome`    | `text` NOT NULL | see the closed vocabulary below                              |
| `detail`     | `text`          | never contains a secret or a full payload                    |
| `created_at` | `timestamptz`   |                                                             |
|              |                 | **UNIQUE** `(spell_id, dedupe_key)` — the concurrency arbiter |

## The outcome vocabulary is closed

`pending` · `delivered` · `deduped` · `declined` · `refused` · `failed`

- **`pending`** — recorded before the attempt. A record left here by a crash is *truthful*: it
  says an attempt began and its end is unknown. It is the seam a durable outbox grows from.
- **`delivered`** — the destination accepted it. Written only after that is true.
- **`deduped`** — this event already acted for this spell; nothing was sent.
- **`declined`** — a condition said no. Distinct from a failure (FR-012).
- **`refused`** — the law turned it away; no spell was reached, so `spell_id` is NULL.
- **`failed`** — retries were exhausted, or the failure was permanent.

Adding a seventh is a schema change and a deliberate act. The surface renders exactly these
(the built Records screen already does), so an invented outcome would fail typecheck rather
than render as a mystery.

## Relationships

```text
applications                                  (platform layer — tenant_id NULL)

tenants ─┬─< installs ──< destinations
         ├─< source_registrations
         ├─< spells ──────────────────┐
         ├─< secrets                  │
         └─< records >────────────────┘   (records.spell_id → spells.id, nullable)
```

## Validation rules, from the requirements

| Rule                                                                    | From             |
| ----------------------------------------------------------------------- | ---------------- |
| Every query carries a `TenantRef`; an unscoped one does not typecheck    | FR-006, VIII     |
| The selector in the URL grants nothing; it only picks a secret to check  | FR-003           |
| `secrets.value` is never selected by any read a surface can reach        | FR-018, VII      |
| `(spell_id, dedupe_key)` is unique — the database enforces exactly-once  | FR-015           |
| `outcome` is constrained to the six values above                        | FR-017           |
| A disabled tenant, install, registration, or spell is inert, not deleted | FR-021 (isolation)|
| The binding's client is resolved by application id, never from a constant | FR-025           |

## What is deliberately absent

No per-tenant bot identity (the `applications` row exists, but its `tenant_id` stays NULL), no
gateway state, no faces, no composer-authored spells, no infractions or counters. Each belongs to
a later spec, and each would be a column or a table then — not a reshaping of what is above,
because ownership is already present on every row and identity is already a lookup.
