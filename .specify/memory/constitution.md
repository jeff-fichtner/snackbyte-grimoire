<!--
DERIVATION NOTE
===============
Grimoire Constitution v1.0.0 — founded 2026-07-21.
Derived from the snackbyte-discord constitution v2.0.0 (the predecessor repo, private),
which governed the proof-of-concept this project starts fresh from. The eight principles
carry forward, rewritten platform-neutral around the model in GRIMOIRE.md (language · law ·
logistics over spells · nouns). Two substantive additions relative to the predecessor:
  - Principle I now also forbids binding special-cases (core never names a platform).
  - Principle IV now governs logic forms explicitly (one total rule language, everywhere) —
    closing a gap the predecessor deferred to its composer spec.

SYNC IMPACT REPORT
==================
v1.0.0 → v1.0.1 (PATCH — clarification, no principle changed).
Trigger: spec 002 (faces) surfaced a terminology collision — "face" was used for both the
lexicon NOUN (a tenant's custom speaking identity, per GRIMOIRE.md) and, in two places,
inherited-from-the-predecessor senses of "app surface". Separated so "face" now means only
the noun:
  - Principle VIII: "reachable by every face" → "reachable by every capability".
  - Technology & Platform Constraints (Shape): "core depending on no face" → "core depending
    on no binding" (consistent with "Core imports no binding SDK" in the same section).
The remaining use — "the next spell, face, or rule" (intro) — is the noun and is unchanged.
No dependent template or doc references the two edited phrases; no other propagation needed.
-->

# Grimoire Constitution

Grimoire is a multi-tenant platform for performative speech in chat communities. Tenants
own **spells** (stored sentences that do things when cast) and **nouns** (their resources
and records); the platform supplies a **language** (what can be said), a **law** (who may
say it), and a **logistics** (how it reliably happens). **Discord is the first binding**;
the core is platform-agnostic and further bindings are intended if wanted. `GRIMOIRE.md`
is the design element this constitution makes law; spec, plan, and task artifacts MUST
conform to both.

The platform's reason for existing is cheap extension — for its engineers and for its
tenants. Adding the next verb, trigger species, or binding must be near-zero effort for an
engineer; adding the next spell, face, or rule must be near-zero effort for a tenant
who cannot ship code and never will.

## The Model

Every principle below assumes this layering. It is normative.

- **Platform layer** — the language, the law, the logistics; the process, the database,
  each binding's application identity. One of everything, engineer-grown, code. Not
  tenant-scoped, and MUST NOT pretend to be.
- **Tenant layer** — spells and nouns. Many of everything, data. Every row belongs to
  exactly one tenant.
- **The community install is the tenant boundary.** A tenant's rights over a community
  derive from a fact the platform verified there — never from a value the tenant supplied.
- **Bindings are mounts, not identities.** A binding contributes trigger species, media,
  and law hooks; it never adds a second model. Core code MUST NOT name a binding.
- **Every invocation walks both layers**: trigger → law → spell → logic → verbs → nouns →
  logistics. Three refusals, in order: unspeakable (law), ungrammatical (language),
  undeliverable (logistics).

## Core Principles

### I. Patterns Over Instances

Every extension point MUST be an instance of a reusable pattern, never a special case
wired into core code.

- Trigger species, verbs, logic forms, and bindings MUST self-register in registries and
  be dispatched generically. No central switch enumerates them.
- Adding a source, verb, species, or binding MUST be "write one module + register it at
  the one wiring point."
- **No tenant may be a special case.** Core code MUST NOT name or branch on a specific
  tenant, community, or channel. The first tenant is an instance of the pattern, not the
  pattern's definition.
- **No binding may be a special case.** Core code MUST NOT name or branch on a specific
  platform. The first binding is an instance of the pattern, not the pattern's definition.

**Rationale**: The product is the set of patterns. Special-casing an integration makes the
Nth as expensive as the first; special-casing a tenant makes the second tenant impossible;
special-casing a binding makes the second platform a rewrite.

### II. Verify Before Process

No inbound trigger may be parsed, routed, or acted on until the law has admitted it.

- Every external trigger adapter MUST verify authenticity (signature or the provider's
  scheme) against a secret resolved from configuration — never from the request — using
  constant-time comparison on the exact received bytes. Failures are rejected as
  unauthorized and MUST NOT be parsed or dispatched; infrastructure failures fail closed
  so the provider retries.
- **Tenant selection precedes verification, and the selector is untrusted.** A non-secret
  identifier may pick which candidate secret to check; it grants nothing, and an unknown
  identifier MUST fail exactly like a bad signature, indistinguishably.
- Binding capability requests (gateway intents, scopes, permissions) MUST follow least
  privilege: request only what registered handlers require; privileged capabilities MUST
  be optional and isolated.

**Rationale**: An unverified trigger is an open command channel. Multi-tenancy adds a
chicken-and-egg — you must know whose secret before you can check it — and the only safe
resolution is that the "whose" hint is a lookup key, never a claim of identity.

### III. Idempotent, Rate-Limited Delivery

All performance of verbs MUST flow through one logistics chokepoint, idempotently and
rate-limit-aware.

- Every outbound effect goes through the single delivery service and shared clients.
  Ad-hoc calls that bypass it are prohibited.
- Every invocation carries a stable dedupe key; a delivery is short-circuited if the same
  (spell, key) already succeeded. Provider retries MUST NOT produce duplicate effects.
- The chokepoint honors each binding's rate limits and backoff signals, and records every
  outcome.
- **Tenants share the platform's rate capacity; no tenant may consume it without bound.**
  One tenant's burst MUST NOT starve another. The chokepoint is the only place that can
  see the contention and MUST be the place that arbitrates it fairly.

**Rationale**: Providers retry and platforms rate-limit; one chokepoint is the only place
these are enforced once and correctly. With many tenants on shared capacity,
noisy-neighbor starvation is the platform's problem to solve.

### IV. A Total Language: Code Vocabulary, Data Sentences

What an engineer writes and what a tenant composes MUST stay on opposite sides of a
deliberate line: **vocabulary in code, sentences in data.**

- **Verbs live in code**: typed, reviewed, tested, enumerable. The vocabulary is finite
  and grows only by engineering. Verbs are classed **charms** (reversible, low blast
  radius — composable by tenants) or **hexes** (irreversible or high blast radius —
  engineer-authored spells only, cast by a human exercising judgment).
- **Spells live in the database**, tenant-scoped, changeable without a deploy. A tenant
  composes spells from the vocabulary; a tenant never authors a verb.
- **Logic forms are total, and there is ONE rule language.** Predicates and transforms —
  everywhere in the system, routing included — MUST be pure (no effects), typed, and
  bounded: bounded iteration only, no eval, no arbitrary HTTP or file/env portals, no
  backtracking-unbounded patterns. A second rule dialect MUST NOT be introduced.
- **Verification and parsing MUST NOT be composable.** No row may change how authenticity
  is checked or how a payload is parsed. Absolute, and survives every future capability.
- **A tenant MUST NOT author, upload, or inject executable behavior.** If a wish cannot be
  composed from existing vocabulary, the answer is a new verb in code — never an escape
  hatch, an evaluator, or a sandbox. A tenant reaching the vocabulary's edge is a product
  signal, not a support failure.

**Rationale**: Tenants cannot ship code, so a platform extensible only by engineers is not
a platform for them; but authored behavior imports sandboxing, resource limits, and
cross-tenant exfiltration — a hosting product this is not. Total composition gives tenants
every sentence and no verbs. Dangerous spells are refused at authoring time as
ungrammatical; the allowlist line (charms vs hexes) keeps blast radius a property of the
language, not of reviewer vigilance.

### V. Pinned, Typed, Tested — and Spec Stays in Spec Spaces

- The project pins its toolchain (TypeScript strict, a pinned Node major, ESLint,
  Prettier, Vitest). The full check gate (format, lint, typecheck, test) MUST pass on a
  clean checkout before code is green.
- The spec workflow (`specs/`, `.specify/`, `.claude/`) is scaffolding. Shipped files MUST
  NOT reference specs, FRs, or principles by number — they state the rule directly. If the
  spec spaces were deleted, every remaining file MUST still make sense.

**Rationale**: Pinned gates keep dev and CI identical; a codebase free of spec citations
stands on its own.

### VI. Always-On Resilience

The service is always-on; liveness MUST NOT be hostage to downstream health; and no
tenant's — or binding's — failure may become another's outage.

- Liveness stays green while the process is up, independent of any binding or the
  database. Readiness MAY reflect downstream state but is separate from liveness.
- Degradation is graceful and defined: when a binding is down, deliveries retry then
  record failure while inbound still acknowledges; when the database is down, routing
  fails closed while capabilities that need no database still work. Connections
  auto-reconnect; a crash restarts clean.
- **A tenant-scoped failure MUST stay tenant-scoped**; nothing tenant-specific may gate
  global readiness. **A binding-scoped failure MUST stay binding-scoped**: one platform's
  outage degrades that binding only.

**Rationale**: With many tenants in one process, "partial" means blast radius: the
worst-configured tenant must never decide whether everyone is serving — and once there is
more than one binding, neither may the flakiest platform.

### VII. Secrets By Reference

Secrets MUST NOT live in source control, in browsable rows, or in process configuration a
tenant would need to differ.

- Credentials come from a secret manager; rows store reference names resolved at runtime,
  never values.
- **Environment variables are platform configuration only.** If a second tenant would need
  a different value, it is data — not config. Tenant-scoped secrets resolve from a store
  writable at runtime, because a tenant adding an integration MUST NOT require a deploy —
  and a deploy MUST NOT be an event every tenant feels.
- A capability URL (a webhook endpoint that acts on possession) is a credential in the
  strongest sense and MUST be treated as a secret, never an address.
- Logs MUST NOT contain secrets, tokens, or full payloads at normal levels.

**Rationale**: Reference indirection keeps configuration legible without exposing
credentials, and it is the seam that lets the storage backend change without touching a
row.

### VIII. Tenant Isolation By Default

Every persisted row belongs to exactly one tenant — its circle — and nothing is reachable
unscoped.

- Every tenant-owned table carries a tenant reference; every query is scoped by it. An
  unscoped read or write is a defect, not a shortcut.
- **Authorization MUST be verifiable, never claimed.** A right derives from a fact the
  platform can check — the install exists; the speaker holds the power there; the platform
  minted this credential — never from an identifier the requester supplied.
- **The tenant reference MUST be derived, never accepted** — and the derivation MUST be
  structural: a tenant reference MUST NOT be constructible from untrusted input. Scoping
  prevents accidents; only unforgeable derivation prevents attacks.
- **The law's layers MUST NOT be merged.** Tenant authority ("owns this community at
  all?") is more fundamental than any capability and lives in core, reachable by every
  capability; member authority ("holds this power here?") is checked per capability. Row
  presence is never authorization.
- Nothing that identifies a tenant may live in process configuration or be defaulted when
  absent. **Tenant identity is an argument, never an ambient.**

**Rationale**: The failure mode is not a crash — it is a missing WHERE, discovered by the
victim. An argument that is missing fails at compile time; an ambient that is wrong fails
in production, quietly, for someone else.

## Technology & Platform Constraints

- **Language/runtime**: TypeScript (ESM, strict), pinned Node major.
- **Shape**: one combined always-on service (HTTP surface + binding connections) until
  scale demands otherwise; any split MUST preserve core depending on no binding.
- **Bindings**: each binding owns its SDK and mounts trigger species, media, and law hooks.
  Core imports no binding SDK. Discord is the first binding.
- **Application identity is data**: each binding's application/credential is a row resolved
  by id, never a constant — the seam that keeps second applications and new connection
  species a data change.
- **Session-shaped and multi-connection logistics are deliberately unbuilt, and expected.**
  Introducing a new logistics species (session executors, connection pools, per-tenant
  applications) changes the platform's shape and REQUIRES a constitution amendment.
- **Persistence**: a Postgres-compatible database behind a thin repository layer;
  migrations for schema changes. **Secrets**: a runtime-writable secret manager.
  **Observability**: structured logging under Principle VII's redaction rule.

## Development Workflow & Quality Gates

- Spec-driven development via Spec Kit: constitution → specify → plan → tasks → implement.
  Specs live at `specs/NNN-short-name/` on `spec/NNN-*` branches, merged only when built.
- Every plan MUST pass a Constitution Check; violations are justified in writing or the
  design changes. Unjustified complexity is rejected.
- The full check gate MUST pass before merge; CI re-runs it and gates the release tag.
- Architecture decisions live in spec artifacts and `GRIMOIRE.md` — never as spec-workflow
  citations inside shipped code.

## Governance

This constitution supersedes other practices for Grimoire. Amendments require an explicit
edit with a Sync Impact Report and a version bump (MAJOR: principle removals or
redefinitions; MINOR: new principles or materially expanded guidance; PATCH:
clarifications), propagated to dependent templates and docs in the same change. Plans and
specs are checked against these principles before implementation; the Technology &
Platform Constraints are fixed — changing them is an amendment, not a per-feature choice.

**Version**: 1.0.1 | **Ratified**: 2026-07-21 | **Last Amended**: 2026-07-23
