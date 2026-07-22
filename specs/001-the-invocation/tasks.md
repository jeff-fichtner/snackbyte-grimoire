# Tasks: The Invocation

**Feature**: `spec/001-the-invocation` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable: touches different files and depends on nothing incomplete
- **[US1]/[US2]/[US3]** — the user story this task serves (story phases only)
- A **letter-suffixed id** (`T028a`) is a task inserted after the list was first numbered.
  Renumbering would be churn and would break every external reference to a task, so ids are
  append-only once assigned.

## Path Conventions

Paths are repo-relative and follow the structure in [plan.md](./plan.md): `src/core/` names
no platform, `src/bindings/discord/` is the only place an SDK appears.

## Tests are included

The constitution's quality gate and the project's testing discipline both require tests
alongside implementation, and four of this feature's properties — isolation, tenant
enumeration, exactly-once, honest recording — are only observable through tests. They are
not optional here.

## One structural note before starting

**US2 (isolation) is P1 alongside US1, and its mechanism lands in Phase 2, not in its own
phase.** `TenantRef` and the scoped repository must exist before the first spell can be
matched at all — building US1 on unscoped queries and adding tenancy afterward is precisely
the retrofit this whole project exists to avoid. Phase 5 is therefore US2's **proof**, not its
construction: the crossings, the enumeration probe, the timing assertion.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Runtime dependencies and the deploy path. Nothing here is product logic.

- [X] T001 Add runtime dependencies (`express`, `pg`, `pino`) and dev deps (`supertest`, `@types/express`, `@types/pg`) to `package.json`
- [X] T002 [P] Add `tsconfig.build.json` emitting `dist/server` from `src/`, excluding `src/web/**` and `tests/**`
- [X] T003 [P] Add `.env.example` documenting platform config only — `DATABASE_URL`, `PORT`, `LOG_LEVEL`, `DISCORD_BOT_TOKEN` — with a comment stating that anything a second tenant would need differently belongs in the store, not here, and that `DISCORD_BOT_TOKEN` is read **only** by the resolver behind `applications.token_ref`, never directly by a caller
- [X] T004 [P] Add `scripts/migrate.mjs` — forward-only runner applying `migrations/*.sql` in order, recording applied names in a `schema_migrations` table, registered as `npm run migrate` in `package.json`
- [X] T005 [P] Add `Dockerfile` (multi-stage: build server + web, run `dist/server/main.js` on Node 24 slim)
- [X] T006 [P] Add `cloudbuild.yaml` building the image and deploying to a **new** Cloud Run service — never the predecessor's
- [X] T007 Extend `.github/workflows/release.yml` with a deploy job gated on the release Action's `is-env` output, keyed off `steps.release.outputs.tag`
- [X] T008 Add an ESLint rule to `config/eslint.config.js` forbidding imports from `src/bindings/**` inside `src/core/**` — the dependency inversion the predecessor shipped, made impossible to regress quietly

**Checkpoint**: `npm run check:all` green; `npm run build` produces a runnable server bundle.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ownership, the store, and the shape of the walk. **No user story can begin until
this phase is done** — and specifically, no query may exist before the type that scopes it.

- [X] T009 Write `migrations/0001_the_invocation.sql` creating `applications`, `tenants`, `installs`, `source_registrations`, `destinations`, `spells`, `secrets`, `records` exactly as specified in [data-model.md](./data-model.md) — every **tenant-owned** table with `tenant_id NOT NULL`, every composite uniqueness including `tenant_id`, `UNIQUE (spell_id, dedupe_key)` on `records`, and `applications` as the one platform-layer table (nullable `tenant_id`, seeded with a single row for the Discord binding, plus the partial unique index that makes "one platform application per binding" actually hold — a plain `UNIQUE` does not, because Postgres treats NULLs as distinct)
- [X] T010 Implement `TenantRef` in `src/core/law/tenant-ref.ts` — a branded type whose brand symbol is **not exported**, with minting functions that take verified evidence only
- [X] T011 [P] Write `tests/unit/tenant-ref.test.ts` proving a `TenantRef` cannot be produced from a plain string or a request-shaped object without an explicit `as unknown as` cast
- [X] T012 Define the `Repository` interface in `src/db/repository.ts` — every method takes `TenantRef` first, per [contracts/inbound-http.md](./contracts/inbound-http.md); `ping()` is the sole exception and reads nothing
- [X] T013 [P] Implement `src/db/fake-repository.ts` — an in-memory implementation that **throws** if asked for rows belonging to a different tenant, so isolation is testable without a database
- [X] T014 Implement `src/db/pg-repository.ts` against the interface, with `beginRecord` translating a unique-violation into `'duplicate'` rather than throwing
- [X] T015 [P] Define the closed outcome vocabulary in `src/core/logistics/outcome.ts` — `pending | delivered | deduped | declined | refused | failed` — as a union type, so a seventh fails typecheck
- [X] T016 [P] Configure `pino` in `src/core/log.ts` with a redaction serializer keyed on secret-ish names, so a credential cannot reach a log line even if passed by mistake
- [X] T017 Implement `GET /health/live` and `GET /health/ready` in `src/server.ts` — liveness must not consult the database or Discord
- [X] T018 Implement the composition root in `src/main.ts` wiring config, repository, binding, and server, and failing loudly at startup on any missing required variable

**Checkpoint**: migrations apply to a real database; **quickstart scenario 9 passes** — with the database stopped, `/health/live` still answers `200` while `/health/ready` returns `503`; `TenantRef` cannot be forged; the fake repository refuses cross-tenant reads.

---

## Phase 3: User Story 1 — A community's first spell speaks (P1) 🎯 MVP

**Goal**: An external event reaches a channel, worded by the owning tenant's spell.

**Independent test**: Seed one tenant, one registration, one spell, one destination; send a
signed event; observe the message and a `delivered` record.

### Tests for User Story 1

- [X] T019 [P] [US1] Write `tests/unit/logic.test.ts` for the predicate and transform forms — matching, declining, and rejecting an unrecognized shape
- [X] T020 [P] [US1] Write `tests/unit/source-github.test.ts` for parse/normalize into a canonical event, including the dedupe key derivation
- [ ] T021 [US1] Write `tests/integration/walk.test.ts` driving the whole invocation against the fake repository — event in, message out, `delivered` recorded

### Implementation for User Story 1

- [X] T022 [P] [US1] Implement the trigger species registry and the `external_call` species in `src/core/language/triggers/` — `opensReturnChannel: false`
- [X] T023 [P] [US1] Implement the one rule language in `src/core/language/logic/` — a typed predicate and a typed transform, total by construction: no eval, no network, no filesystem, no unbounded iteration
- [X] T024 [P] [US1] Implement the GitHub source adapter in `src/sources/github/` — lifting the predecessor's parse/normalize logic per [MIGRATION.md](../../MIGRATION.md) Tier 1, with its tests
- [X] T025 [US1] Implement `authenticate()` in `src/core/law/authenticate.ts` — HMAC over the **raw request bytes** using `timingSafeEqual`
- [X] T026 [US1] Implement `resolveTenant()` in `src/core/law/resolve.ts` — selector → registration → verified `TenantRef`
- [X] T027 [P] [US1] Implement the verb registry and the `post_message` charm in `src/core/language/verbs/` — carrying `verbClass: 'charm'` and `needsReturnChannel: false`
- [X] T028 [US1] Implement the Discord binding in `src/bindings/discord/` — REST message send, the only file importing `discord.js`. Its client is obtained from `getRest(applicationId)`, which loads the `applications` row and resolves `token_ref`; the binding never reads `DISCORD_BOT_TOKEN` and holds no module-level client (FR-025)
- [X] T028a [P] [US1] Write `tests/unit/application-identity.test.ts` — `getRest` resolves a client for a given application id, two ids resolve independently, and no exported surface returns a client without one
- [X] T029 [US1] Implement `deliver()` in `src/core/logistics/deliver.ts` — the single chokepoint; happy path only at this stage
- [X] T030 [US1] Implement the walk in `src/core/invocation.ts` — trigger → law → spell → logic → verb → nouns → logistics, in that order, each spell handled independently so one failure cannot block another
- [X] T031 [US1] Implement `POST /invoke/:registrationId` in `src/server.ts` with `express.raw()` mounted on this route only, verifying **before** parsing, and answering `202` once the record is durably `pending`
- [X] T032 [US1] Add `scripts/seed-dev.mjs` (registered as `npm run seed:dev`) creating **two** tenants with their own registrations, spells, and destinations — one tenant cannot demonstrate the property US2 exists to prove

**Checkpoint**: quickstart scenarios 1–3 pass — a spell speaks, an edit takes effect with no restart, a condition declines and is recorded as `declined`.

---

## Phase 4: User Story 3 — The record is trustworthy (P2)

**Goal**: Every invocation ends in an honest, durable outcome. Nothing is ever reported
delivered that was not.

**Independent test**: Drive one event of each kind — delivered, duplicate, declined, refused,
undeliverable — and confirm the record shows each accurately.

> Sequenced before US2's proof phase because the delivery guarantees it adds (dedupe, retry,
> honest recording) are what the isolation tests then assert *across* tenants.

### Tests for User Story 3

- [X] T033 [P] [US3] Write `tests/unit/classify-failure.test.ts` — 401/403/404 permanent, 429/5xx and network errors transient, `Retry-After` honoured
- [ ] T034 [P] [US3] Write `tests/integration/idempotency.test.ts` — the same event five times including two concurrently produces exactly one delivery and four `deduped` records
- [ ] T035 [US3] Write `tests/integration/failure-recording.test.ts` — a permanently failing destination retries **zero** times; a transiently failing one retries and ends `failed`, never `delivered`

### Implementation for User Story 3

- [X] T036 [US3] Implement the two-write record lifecycle — `pending` claimed before the attempt, settled to a terminal outcome after — in `src/core/logistics/deliver.ts`
- [X] T037 [US3] Implement dedupe in `src/core/logistics/deliver.ts` by claiming `(spell_id, dedupe_key)` **before** delivery, treating the unique violation as `deduped`
- [X] T038 [P] [US3] Implement permanent-vs-transient classification and bounded backoff in `src/core/logistics/retry.ts`, lifting the predecessor's rule per MIGRATION Tier 1
- [X] T039 [US3] Implement the per-tenant concurrency cap in `src/core/logistics/deliver.ts` — the fairness mechanism required by FR-019 and Principle III
- [ ] T040 [P] [US3] Write `tests/integration/spell-independence.test.ts` — two spells match one event, the first fails, the second still delivers (FR-010)

**Checkpoint**: quickstart scenarios 6–8 pass — duplicates act once, failures record as failures, recovery needs no restart.

---

## Phase 5: User Story 2 — One community can never reach another's book (P1)

**Goal**: Prove the isolation that Phase 2 built. No crossing succeeds, and no response
reveals whether another tenant exists.

**Independent test**: Every crossing attempted; every one refused; the enumeration probe finds
no distinguishable signal.

> The mechanism is already in place from Phase 2 — this phase is where it is **proven**, plus
> the one piece that cannot be built earlier: making an unknown registration and a forged
> signature indistinguishable requires the real authentication path to exist first.

### Tests for User Story 2

- [X] T041 [P] [US2] Write `tests/integration/isolation.test.ts` — tenant A's event signed with B's secret, A's event sent to B's registration id, and a body claiming a `tenant_id` it does not own; all refused, nothing delivered to either
- [ ] T042 [P] [US2] Write `tests/integration/scoping.test.ts` — every repository method, given tenant A, never returns a row owned by B (drive it against both the fake and, if available, a real database)
- [ ] T043 [US2] Write `tests/integration/enumeration.test.ts` — many samples of unknown-registration versus bad-signature; assert identical status and body, and assert the **median latency difference sits inside the measured noise band** rather than comparing single requests

### Implementation for User Story 2

- [X] T044 [US2] Implement the decoy-secret path in `src/core/law/authenticate.ts` — when the selector resolves to nothing, verify against a same-length decoy and discard the result, so both branches perform one lookup and one `timingSafeEqual`
- [X] T045 [US2] Ensure every refusal in `src/server.ts` returns the identical `401` body and status, and that `503` is returned only when the store is unreachable, so the source retries rather than discarding
- [ ] T046 [US2] Audit every repository call site across `src/` for a `TenantRef` argument derived from verified evidence, and add the lint ban on `as unknown as TenantRef` to `config/eslint.config.js`

**Checkpoint**: quickstart scenarios 4, 5, and 10 pass — every crossing refused, no enumeration signal, a third tenant is data only.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T047 [P] Add the quickstart driver scripts — `scripts/dev-send.mjs`, `scripts/dev-cross.mjs`, `scripts/dev-probe.mjs` — and register them in `package.json` as `dev:send`, `dev:cross`, `dev:probe`, so the commands in [quickstart.md](./quickstart.md) resolve
- [ ] T048 [P] Write `tests/integration/tenant-blast-radius.test.ts` — a tenant whose destination, secret, or spell config is broken fails only for that tenant, while another tenant's invocation in the same process still delivers (SC-009)
- [ ] T049 [P] Write `tests/integration/redaction.test.ts` asserting no secret value reaches a log line or an HTTP response, by deliberately passing a credential through both
- [ ] T050 Deploy via `cloudbuild.yaml` to the new Cloud Run service and confirm `/health/ready` is `ready: true`, then run quickstart scenario 1 against the deployed URL with a real GitHub webhook
- [ ] T051 Update `MIGRATION.md` cutover step 1 to record which infrastructure pieces landed here, and step 3 with the new service name

---

## Dependencies

```text
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ── blocks everything; TenantRef and scoping exist here
    ↓
Phase 3 (US1) ─────────── the walk works for one tenant
    ↓
Phase 4 (US3) ─────────── the walk is honest and exactly-once
    ↓
Phase 5 (US2) ─────────── the walk cannot be crossed  ← proof, not construction
    ↓
Phase 6 (Polish)
```

**Why the story phases are not independent here.** The template's usual promise — any story
shippable alone — does not hold for this feature and should not be pretended. US1 alone is a
single-tenant hub, which is the predecessor. US2's mechanism is foundational by necessity.
US3 hardens the delivery US1 introduces. The feature is one walking skeleton, which is the
declared exception recorded in the spec and in MIGRATION.

## Parallel opportunities

- **Phase 1**: T002–T006 are all independent files.
- **Phase 2**: T011, T013, T015, T016 after their subjects exist.
- **Phase 3**: T019, T020 (tests) with T022, T023, T024, T027 (independent modules); T028a after T028.
- **Phase 4**: T033, T034 with T038, T040.
- **Phase 5**: T041, T042 in parallel; T043 after T044.

## Implementation strategy

**The MVP is Phase 1 → 2 → 3.** That is a real, demonstrable product: a tenant's spell speaks
in response to a real outside event. Phases 4 and 5 are not optional polish — they are what
makes it shippable to a second person — but Phase 3's checkpoint is the first moment there is
something to show.

**Stop at any checkpoint.** Each phase ends with quickstart scenarios that either pass or do
not; there is no phase whose value is only visible after the next one.
