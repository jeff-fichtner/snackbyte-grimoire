# Implementation Plan: The Invocation

**Branch**: `spec/001-the-invocation` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-the-invocation/spec.md`

## Summary

Build one complete invocation — an external call arrives, the law admits it and derives whose
it is, the owning tenant's spell is matched, its logic runs, its verb fires, and logistics
delivers once and records the outcome — with tenancy present in the first migration rather
than retrofitted.

The technical approach is shaped by one rule that outranks convenience: **a tenant reference
must be unconstructible from request input.** That is not a convention to follow but a type
to design, and it decides the shape of the repository, the law module, and every signature
downstream. Everything else here is ordinary: an HTTP service, a Postgres-backed store, one
delivery chokepoint, and a Discord binding that is the only place an SDK appears.

## Technical Context

**Language/Version**: TypeScript 6 (strict, ESM), Node 24 — fixed by the constitution's
Technology Constraints, already pinned in `package.json` and `.nvmrc`.

**Primary Dependencies**: `express` 5 (HTTP), `pg` (Postgres client), `pino` (structured
logging), `discord.js` (binding only — imported nowhere outside `src/bindings/discord/`).

**Storage**: Postgres-compatible (Supabase), reached through a thin repository whose every
method takes a tenant reference. Schema changes by numbered migration files.

**Testing**: Vitest; `supertest` for HTTP-level tests. Unit tests for pure logic, integration
tests for the walk, and a fake repository so ownership rules are testable without a database.

**Target Platform**: Cloud Run, one always-on service, deployed from a container. A **new**
service, never the predecessor's.

**Project Type**: Web service with a small bundled web surface (already present).

**Performance Goals**: Not throughput-bound. The binding constraint is answering the source
before it times out and resends — target an acknowledgment well inside the tightest source
budget (GitHub's is 10s), which means acknowledging after durability, not after delivery.

**Constraints**: Delivery must never be reported for something that did not happen; refusals
must be indistinguishable in body, status, and timing; secrets never appear in logs or
responses; no single tenant's configuration may prevent the service from starting.

**Scale/Scope**: Small by design — a handful of tenants, one external source, one destination
platform. The requirement is that the second of each costs a row, not a refactor.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                              | How this design satisfies it                                                                                                                            | Verdict |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **I. Patterns over instances**         | Trigger species, logic forms, and verbs self-register; the invocation dispatches generically. No switch enumerates them. Core has no Discord import      | PASS    |
| **II. Verify before process**          | Raw bytes captured before any parsing; signature checked with `timingSafeEqual`; unknown selector and bad signature take the same path and same response | PASS    |
| **III. Idempotent, rate-limited**      | One `deliver()` chokepoint. Dedupe enforced by a DB uniqueness constraint, not application logic. Per-tenant concurrency cap for fairness (FR-019)       | PASS    |
| **IV. Total language, code vocabulary** | One predicate form and one transform form, both data-driven and total. No eval, no network, no filesystem, no unbounded iteration                       | PASS    |
| **V. Pinned, typed, tested**           | Toolchain already pinned; `check:all` green is the gate. No spec citations in shipped files                                                             | PASS    |
| **VI. Always-on resilience**           | Liveness independent of DB and Discord; readiness separate. A tenant-scoped failure stays tenant-scoped                                                  | PASS    |
| **VII. Secrets by reference**          | Rows store reference names; values resolve at runtime from a writable store; redaction enforced at the logger                                            | PASS    |
| **VIII. Tenant isolation by default**  | `TenantRef` is a branded type mintable only inside `core/law/`. Repository methods require it, so an unscoped query does not typecheck                   | PASS    |

**No violations. Complexity Tracking is therefore empty and omitted.**

One item deserves naming rather than a checkmark: Principle VIII says scoping prevents
accidents while only unforgeable derivation prevents attacks. This design takes that
literally — the tenant reference has no public constructor, and the only functions that mint
one are the law's resolvers, which take verified evidence. A route handler cannot fabricate
one even by mistake, because the type it would need is not exported.

## Project Structure

### Documentation (this feature)

```text
specs/001-the-invocation/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions and their rejected alternatives
├── data-model.md        # Phase 1 — schema, entities, constraints
├── quickstart.md        # Phase 1 — how to run and prove it
├── contracts/           # Phase 1 — inbound HTTP, module seams
├── checklists/          # requirements.md (from /speckit-specify)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── core/                      # the model. Imports no binding, names no platform.
│   ├── language/
│   │   ├── triggers/          # species registry + the external-call species
│   │   ├── logic/             # the ONE rule language: predicates + transforms
│   │   └── verbs/             # verb registry + the message verb (a charm)
│   ├── law/
│   │   ├── tenant-ref.ts      # the branded type — the only place one is minted
│   │   ├── authenticate.ts    # signature verification over exact bytes
│   │   └── resolve.ts         # selector → verified tenant reference
│   ├── logistics/
│   │   ├── deliver.ts         # THE chokepoint: dedupe, retry, fairness, record
│   │   └── outcome.ts         # the closed outcome vocabulary
│   ├── spells/                # matching stored sentences to an event
│   └── invocation.ts          # the walk, in order
├── bindings/
│   └── discord/               # the ONLY place discord.js is imported
├── sources/                   # external-call adapters (parse + normalize)
├── db/                        # repository interface + Postgres implementation
├── web/                       # the tenant surface (already built)
├── server.ts                  # HTTP wiring
└── main.ts                    # composition root

migrations/                    # 0001_… numbered, forward-only
tests/
├── unit/                      # pure logic, no I/O
├── integration/               # the walk, with a fake repository
└── web/                       # existing surface tests
```

**Structure Decision**: `core/` is organized by the three platform branches — language, law,
logistics — rather than by technical layer, so the model is legible in the directory listing
and a misplaced file is obvious in review. `bindings/` is a sibling, never a parent: the
dependency runs binding → core, never the reverse, which is the inversion the predecessor got
wrong (`core/routing/engine.ts` imported from `core/discord/`). A lint rule enforces it, so it
cannot regress quietly.

## Post-Design Constitution Re-Check

_Re-evaluated after Phase 1. Same eight principles, now against concrete design._

| Principle                     | Design artifact that carries it                                                                                         | Verdict |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| **I. Patterns over instances** | `TriggerSpecies` / `Verb` registries in contracts; the binding→core dependency rule with a lint guard                     | PASS    |
| **II. Verify before process**  | research §2 (raw bytes, verify then parse), §3 (decoy secret so refusals match in timing); contract's single-401 rule     | PASS    |
| **III. Idempotent + fair**     | data-model `UNIQUE (spell_id, dedupe_key)`; `beginRecord` returning `'duplicate'`; per-tenant concurrency cap in `deliver` | PASS    |
| **IV. Total rule language**    | `condition` / `verb_config` are closed, validated jsonb shapes — an unrecognized key is a refusal, not an escape hatch    | PASS    |
| **V. Pinned, typed, tested**   | quickstart's ten scenarios map 1:1 to success criteria; `check:all` is the ship gate                                     | PASS    |
| **VI. Always-on resilience**   | Split `/health/live` and `/health/ready`; liveness forbidden from consulting downstreams                                  | PASS    |
| **VII. Secrets by reference**  | `secrets` table keyed `(tenant_id, ref)`; only `resolveSecret` reads it; no surface selects `value`                       | PASS    |
| **VIII. Isolation by default** | Branded `TenantRef` with no public constructor; every `Repository` method takes it; composite uniqueness includes tenant  | PASS    |

**Still no violations.** Two design decisions are worth flagging as deliberate debts rather
than gaps, both recorded where they will be picked up:

1. **Acknowledgment precedes delivery** (research §10). A crash in that window leaves a
   `pending` record and an unsent message. This is visible rather than silent, and `pending`
   exists in the outcome vocabulary specifically so the durable-outbox spec has a seam to grow
   from instead of a schema to change.
2. **Fairness is a concurrency cap, not a queue** (research §6). Total and untunable-by-design;
   a weighted mechanism needs real traffic to justify, which does not exist yet.

Neither requires an amendment: the constitution states obligations, and both are met — just
minimally, which is what a walking skeleton is for.
