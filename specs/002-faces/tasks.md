# Tasks: Faces

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data model**:
[data-model.md](./data-model.md) · **Contracts**: [contracts/faces.md](./contracts/faces.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different files, no dependency on an incomplete task).
- **[US#]** — the user story a task serves (implementation phases only).

## Path Conventions

Single web service, unchanged from 001. New code lives in `src/core/nouns/`, extends
`src/core/logistics/`, `src/core/language/verbs/`, `src/bindings/discord/`, `src/db/`, plus one
`migrations/` file and one `scripts/` file. Tests in `tests/unit/` and `tests/integration/`.

## Tests are included

The constitution requires the full check gate green (V), and the honest-record and isolation
promises are exactly the properties a single-path read cannot prove. Unit tests for the verb
branch, the binding webhook calls (against a stub `fetch`), and credential redaction; integration
tests for mint→speak→delivered, cross-tenant refusal, and delete→failed.

## One structural note before starting

A **face is a persona (a row); a channel's faces share one webhook whose URL is a
credential-by-reference.** Core names no platform — the binding's face operations are
model-named (`establish`/`retire`/`reidentify`/post-through), and the Discord binding is the
only file that says "webhook". Delivery goes through the one 001 chokepoint; only the binding's
final call branches. Do not add a second delivery path, an HTTP route, or a `webhook_url` column.

---

## Phase 1: Setup

- [ ] T001 Write `migrations/0002_faces.sql` — the `faces` table with `tenant_id`/`install_id`
  NOT NULL, `name`, nullable `avatar_url`, `secret_ref` (the **per-channel** webhook credential
  reference), `origin` (`'minted' | 'adopted'`), `UNIQUE (tenant_id, install_id, channel_ref,
  name)`, and index `faces_by_channel (tenant_id, install_id, channel_ref)` — exactly as
  [data-model.md](./data-model.md) specifies. No `webhook_url` column (Constitution VII).
- [ ] T002 Apply it locally — `node --env-file=.env.local scripts/migrate.mjs` — and confirm the
  table, the composite unique, and the index exist.

## Phase 2: Foundational (Blocking Prerequisites)

**These block every user story. No story starts until Phase 2 is done.**

- [ ] T003 Add the `Face` type and tenant-scoped face methods to the `Repository` interface in
  `src/db/repository.ts` — `createFace`, `listFaces`, `getFace`, `renameFace`, `deleteFace`
  (returns `{ wasLastInChannel }`), `countChannelFaces` — every method taking `TenantRef` first.
- [ ] T004 [P] Extend `OutboundMessage` in `src/core/logistics/binding.ts` with an optional
  `face { credential: string; username: string; avatarUrl?: string }`, and add the model-named
  face operations to the `Binding` interface — `establishFace`, `adoptFace`, `listChannelFaces`,
  `reidentifyFace`, `retireFace` — with no webhook/Discord vocabulary in the interface.
- [ ] T005 Implement the face methods in `src/db/pg-repository.ts` — tenant-scoped SQL; the
  per-channel `secret_ref` is shared by a channel's faces; `deleteFace` derives `wasLastInChannel`
  from `countChannelFaces` inside one transaction.
- [ ] T006 [P] Implement the face methods in `src/db/fake-repository.ts` — in-memory doubles that
  **throw** on a cross-tenant face read/write, so isolation is unit-testable without a database.
- [ ] T007 Confirm `deliver` (`src/core/logistics/deliver.ts`) carries `message.face` through the
  chokepoint unchanged, and extend the redaction in `src/core/log.ts` so `face.credential` can
  never reach a log line (Constitution VII), with a probe test as in 001's redaction test.
- [ ] T008 [P] Extend the ESLint `no-restricted-imports` guard so `src/core/**` cannot import a
  Discord/webhook type — faces stay model-named in core (Constitution I).

## Phase 3: User Story 1 — A spell speaks with a face the community chose (Priority: P1) 🎯 MVP

**Goal**: mint a face, point a spell at it, and see the message arrive under its name/avatar.
**Independent test**: quickstart Scenario 1 — mint, wire a spell, drive an event, observe the
name/avatar and a `delivered` record.

### Tests for User Story 1

- [ ] T009 [P] [US1] `tests/unit/faces-verb.test.ts` — `post_message` config parse: `faceId` XOR
  `destinationId`; an unknown/both-present shape is refused (Constitution IV).
- [ ] T010 [P] [US1] `tests/unit/discord-faces.test.ts` — binding `establishFace` (mint) issues
  the create call; `send` with a `face` posts through `face.credential` carrying `username`/
  `avatar_url`; `send` without a face is unchanged — all against a stub `fetch`.

### Implementation for User Story 1

- [ ] T011 [US1] In `src/bindings/discord/index.ts` implement `establishFace`, `reidentifyFace`,
  and the `send` face-branch (post through the webhook URL with `username`/`avatar_url`; else the
  001 application path), reusing the 001 permanent-vs-transient classification.
- [ ] T012 [US1] Create the face noun `src/core/nouns/faces.ts` — `mintFace` (establish-or-reuse
  the channel credential via the binding, store its URL as a secret through the repo, insert the
  row `origin: 'minted'`) and `renameFace` (update the row + `reidentifyFace`); tenant-scoped.
- [ ] T013 [US1] Teach the verb to speak through a face: extend `verb_config` parsing in
  `src/core/language/verbs/post-message.ts` to accept `faceId`; resolve the face + its credential
  in `src/core/invocation.ts` and place them on `OutboundMessage.face`; extend `VerbContext` in
  `src/core/language/verbs/index.ts` accordingly. (Depends on T011, T012.)
- [ ] T014 [P] [US1] `scripts/provision-face.mjs` — `mint`, `rename`, `list` subcommands;
  fail-loud on missing env (no fallback); never prints the webhook URL.
- [ ] T015 [US1] `tests/integration/faces.e2e.test.ts` — mint a face, point a spell at it, invoke
  → `delivered` and the outbound message carries the face's name/avatar; a **second** face in the
  same channel establishes **no** second webhook (FR-010). (Depends on T011–T013.)

**Checkpoint**: US1 is independently demoable — a community's chosen face speaks.

## Phase 4: User Story 2 — A face belongs to one community and no other can reach it (Priority: P1)

**Goal**: prove isolation. Most enforcement is inherent in the tenant-scoped repo (Phase 2);
this story proves it and closes the spell-reference path.

- [ ] T016 [US2] `tests/integration/faces-isolation.e2e.test.ts` — A's spell naming B's `faceId`
  is recorded `failed`, never delivered (FR-008); `listFaces` as A returns only A's and never
  reveals B's (FR-006); `renameFace`/`deleteFace` on B's face as A is refused and leaves it
  unchanged (FR-007).

**Checkpoint**: every cross-tenant crossing is refused.

## Phase 5: User Story 3 — A face can be revoked, and revocation never lies (Priority: P2)

**Goal**: delete revokes future use; the record stays honest.

- [ ] T017 [US3] Extend the face noun `deleteFace` (`src/core/nouns/faces.ts`) — reference-count
  the channel's faces; when the deleted one is the last, call `binding.retireFace` and remove the
  channel secret; never touch already-sent messages (FR-015/016).
- [ ] T018 [US3] `scripts/provision-face.mjs` — add the `delete` subcommand.
- [ ] T019 [P] [US3] `tests/unit/faces-delete.test.ts` — `deleteFace` retires the credential only
  on the channel's last face; an invocation whose credential no longer resolves classifies as
  permanent (a retired webhook → 404).
- [ ] T020 [US3] Integration test in `tests/integration/faces.e2e.test.ts` — delete a face a
  spell speaks through → next invocation recorded `failed`, no message appears; messages sent
  before deletion remain unchanged. (Depends on T017.)

**Checkpoint**: a revoked face is closed, and the record never claims a message that did not appear.

## Phase 6: User Story 4 — An existing persona comes home (Priority: P3)

**Goal**: adopt an existing webhook — the non-default, more-privileged path.

- [ ] T021 [US4] In `src/bindings/discord/index.ts` implement `adoptFace` (validate a supplied
  credential is reachable); in `src/core/nouns/faces.ts` add `adoptFace` (store the supplied URL
  as the channel secret, `origin: 'adopted'`) — explicit, never the default (FR-004).
- [ ] T022 [US4] `scripts/provision-face.mjs` — add the `adopt` subcommand, requiring an explicit
  `ADOPT_WEBHOOK_URL`; `mint` never adopts.
- [ ] T023 [P] [US4] `tests/integration/faces-adopt.e2e.test.ts` — adopt stores the supplied
  credential and posts under the pre-existing persona; `adopt` with no URL refuses; `mint` never
  adopts.

**Checkpoint**: an existing "miss honey" comes home without members noticing a change.

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T024 Run the full gate green — `npm run check:all` and `npm run test:e2e` — and run
  quickstart Scenarios 1–4 against staging with a live channel (the one manual slice: confirm the
  message **visibly** wears the face's name and avatar).
- [ ] T025 [P] Document the **Manage Webhooks** bot permission (mint/list require it) in the
  deploy notes and `.env.local.example` comments, and record the faces provisioning path.
- [ ] T026 [P] Note in `MIGRATION.md` that faces discharges the predecessor's 010-faces, and in
  `PARITY.md` if the webhook-mode-target row it left behind is now covered.

---

## Dependencies

- **Phase 1 → Phase 2 → all stories.** The migration and the interface/impl of the `faces` row
  and the `Binding` face ops block everything.
- **US1 (P1)** is the MVP and unblocks the others — it builds the binding face-branch, the noun,
  and the verb path the rest reuse.
- **US2 (P1)** depends only on Phase 2's tenant-scoped repo (it is mostly proof).
- **US3 (P2)** depends on US1's noun (`deleteFace` extends it).
- **US4 (P3)** depends on US1's binding/noun (adds the adopt entry).
- Within a story, `[P]` tasks (different files) run together; the binding (T011) precedes the
  verb wiring (T013); the noun (T012) precedes delete (T017) and adopt (T021).

## Parallel execution example

After Phase 2, US1's independent pieces can start together: **T009**, **T010**, and **T014**
(tests + script, different files) in parallel, while **T011 → T012 → T013 → T015** run in order.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + US1.** That is a mintable face a spell speaks through — the whole
value proposition. Ship/validate it, then layer US2 (isolation proof), US3 (revocation), and
US4 (adopt) in priority order; each is an independently testable increment.
