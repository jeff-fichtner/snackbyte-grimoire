# Implementation Plan: Faces

**Branch**: `spec/002-faces` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-faces/spec.md`

## Summary

A **face** is a community-owned persona — a name and an avatar — that a spell speaks through,
so a message arrives as "GitHub" or "miss honey" rather than as the platform bot. Faces are
**nouns**: tenant-owned rows. All of a channel's faces are delivered through one **per-channel
webhook**, whose URL is a **credential stored by reference** (never an address). A spell that
names a face is delivered exactly as any other message — through the one logistics chokepoint,
with the same idempotency, failure classification, and honest record — only the outbound step
posts through the channel's webhook with the face's name/avatar instead of as the application.

The technical approach: one migration adds a `faces` table; the core `Binding` interface gains
model-named face operations (establish / list / retire a channel's speaking credential, and
"post through a face"), implemented by the Discord binding via channel webhooks; the
`post_message` verb gains an optional face; and a provisioning path (a script, as tenants are
seeded today) exercises mint / adopt / list / rename / delete. No HTTP surface and no UI — the
composer is a later spec.

## Technical Context

**Language/Version**: TypeScript (ESM, strict), Node 24 — unchanged from 001.

**Primary Dependencies**: Express 5 (HTTP surface, untouched here), `pg` (store), `pino`
(logging with Principle VII redaction), Vitest + supertest (tests). No new runtime dependency.

**Storage**: PostgreSQL (Supabase). One new migration `migrations/0002_faces.sql` adding the
`faces` table; the per-channel webhook credential reuses the existing `secrets` table.

**Testing**: Vitest — unit (verb face-branch, binding webhook calls against a stub fetch,
credential redaction) and integration (`tests/integration/`, real Postgres + stub HTTP
platform: mint→speak→delivered, cross-tenant refusal, delete→failed-record).

**Target Platform**: the existing always-on Cloud Run service; no new service, no new endpoint.

**Project Type**: single web service — the same shape as 001.

**Performance Goals**: no new hot path; face resolution is one indexed row read plus one
secret read per invocation that names a face, inside the existing per-tenant delivery budget.

**Constraints**: core names no platform (faces operations are model-named on the `Binding`
interface); the webhook URL is a secret, never logged or returned; delivery through a face
must not create a second delivery path — it flows through the one chokepoint.

**Scale/Scope**: ~one webhook per channel (Discord cap 15/channel; faces share it). Faces per
tenant are unbounded rows. The feature adds one table, ~5 repository methods, ~4 `Binding`
methods, one verb branch, and a provisioning script.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Patterns Over Instances** — PASS. Face operations are methods on the core `Binding`
  interface, model-named (a face, a channel, a persona), never "webhook". The Discord binding
  implements them; a second binding would implement the same interface. Core names no platform.
  No tenant or binding is special-cased.
- **II. Verify Before Process** — PASS. Faces add no inbound trigger, so no new verification
  path. Establishing/listing a channel's credential requires a management authority the binding
  may lack; per least-privilege that authority is requested only where those operations are
  used, and its absence fails clearly (FR-002, FR-006). Adopting a supplied credential is
  gated as more-privileged and non-default (FR-004), matching "minting beats consuming".
- **III. Idempotent, Rate-Limited Delivery** — PASS. A face message goes through the single
  `deliver` chokepoint unchanged (FR-011): same dedupe-by-(spell,key), same permanent-vs-
  transient classification, same fair per-tenant budget. Only the binding's outbound call
  differs (post through the webhook vs. as the application).
- **IV. A Total Language** — PASS. Faces add no rule dialect. A face is selected by id in
  `verb_config` (data), not authored logic; the name/avatar are stored strings, not templates
  a tenant can make Turing-complete. Verification and parsing stay non-composable.
- **VI. Always-On Resilience** — PASS. A tenant's missing/mis-permissioned face is a
  tenant-scoped failure recorded as failed; it does not gate global readiness.
- **VII. Secrets By Reference** — PASS, and central. The webhook URL is "a capability URL …
  a credential in the strongest sense … never an address" (VII, verbatim). It lives in
  `secrets`, referenced by the face row, resolved at delivery, redacted in logs, never returned
  in a listing (FR-013).
- **VIII. Tenant Isolation By Default** — PASS. `faces` carries `tenant_id`; every read/write
  is tenant-scoped. Authorization is verifiable ("the platform minted this credential" — the
  mint-vs-adopt distinction is exactly VIII's third example). A spell may name only its own
  tenant's face (FR-008); cross-tenant operations are refused (FR-007).

**Result**: no violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-faces/
├── plan.md              # This file
├── research.md          # Phase 0 — the design decisions
├── data-model.md        # Phase 1 — the faces table + the extensions
├── quickstart.md        # Phase 1 — how to prove it end to end
├── contracts/
│   └── faces.md         # Phase 1 — the Binding face operations, the verb, the repo methods
└── tasks.md             # Phase 2 — /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
migrations/
└── 0002_faces.sql                     # NEW — the faces table

src/
├── core/
│   ├── logistics/
│   │   ├── binding.ts                 # EXTEND — Binding gains face ops; OutboundMessage gains an optional face
│   │   └── deliver.ts                 # UNCHANGED path; carries the face through to the binding, redacted
│   ├── language/verbs/
│   │   ├── index.ts                   # EXTEND — VerbContext can speak through a face
│   │   └── post-message.ts            # EXTEND — an optional faceId in verb_config
│   ├── invocation.ts                  # EXTEND — resolve the face + its credential before speak
│   └── nouns/
│       └── faces.ts                   # NEW — the face noun: the tenant-scoped operations (mint/adopt/list/rename/delete)
├── bindings/discord/
│   └── index.ts                       # EXTEND — implement the Binding face ops via channel webhooks
└── db/
    ├── repository.ts                  # EXTEND — face row methods (create/list/get/rename/delete) + reuse secrets
    ├── pg-repository.ts               # EXTEND — their SQL
    └── fake-repository.ts             # EXTEND — their in-memory doubles

scripts/
└── provision-face.mjs                 # NEW — mint/adopt/list/rename/delete a face (the "as seeded today" path)

tests/
├── unit/                              # verb face-branch; binding webhook calls (stub fetch); credential redaction
└── integration/                       # mint→speak→delivered; cross-tenant refusal; delete→failed-record
```

**Structure Decision**: The single-service layout from 001 is unchanged. Faces slot into the
existing grammar — a new **noun** (`src/core/nouns/faces.ts`, the tenant-scoped operations), a
**binding** extension (the webhook mechanics, quarantined in `src/bindings/discord/`), and a
**verb** extension (`post_message` learns an optional face). The one new table follows the
`destinations`/`secrets` shape. No new area outside `src/core/` is introduced — the `nouns/`
directory joins the existing core grammar.

## Complexity Tracking

> No Constitution Check violations — this section is intentionally empty.
