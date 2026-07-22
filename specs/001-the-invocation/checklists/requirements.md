# Specification Quality Checklist: The Invocation

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation notes

**Iteration 1 → 2.** The first draft failed *"no implementation details"* in several
places. The feature description this spec was written from is deliberately architectural —
it names stations of the model, HTTP status families, constant-time comparison, branded
types, and named services. Those belong in the plan, not the spec. Rewritten so every
requirement states an observable obligation instead:

| Removed from the spec | Restated as |
| --- | --- |
| "401/403/404 permanent, 429/5xx transient with `Retry-After`" | FR-016 — temporary vs permanent failures, honouring the destination's stated wait time |
| "opaque branded type minted only by the resolver" | FR-007 — identity derived from what was verified, not constructible from the request |
| "constant-time comparison on exact received bytes" | FR-002 + FR-004 — verify before parsing; refusals indistinguishable, including timing |
| "Dockerfile, cloudbuild, Cloud Run, CI is-env gate" | FR-020 / SC-010 — deployable from a clean checkout by an automated process |
| Station names (trigger / law / logic / logistics) | Ordinary language: arrival and admission, ownership, the spell, delivery |

**Two judgement calls worth flagging for review, rather than [NEEDS CLARIFICATION] markers**
— both have a defensible default recorded in Assumptions:

1. **Discord is named**, in Assumptions and once in scope-setting. A spec that refused to
   say where the first message lands would be less testable, not more neutral. It is framed
   as the first of several, and FR-023 carries the actual constraint.
2. **Story 2 is P1 alongside Story 1.** The template implies a single P1. Isolation is not a
   separable increment here — shipping Story 1 alone would mean shipping a cross-community
   defect, and the whole reason this feature exists is that retrofitting isolation is what
   proved expensive before.

**No [NEEDS CLARIFICATION] markers were needed.** Scope, security posture, and boundaries
were all determined by `GRIMOIRE.md`, the constitution, and `MIGRATION.md`.

## Review loop

Three passes. Terminated when a pass produced no new unambiguous fix.

**Pass 1 — six fixes.** The two that mattered:

- **A constitutional requirement had no requirement.** Constitution III obliges the single
  delivery point to arbitrate shared capacity fairly — _"one tenant's burst MUST NOT starve
  another"_ — and nothing in the spec covered it. Now **FR-019**; the rest of the section
  renumbered.
- **`Binding` was used against its meaning.** In `GRIMOIRE.md` a binding is _platform-level_
  — a whole chat platform mounted onto the model. The spec used it per-community, which
  would have misled the plan into building one binding per community.

Also: FR-001 gained the obligation to answer the source promptly (only refusals had been
specified, so the happy path left the source to guess); FR-009's "without collision" became
concrete; SC-005 now accounts for retries preceding the failure verdict; and the
store-unreachable edge case now states that liveness survives it, which was the only
acceptance coverage FR-020 lacked.

**Pass 2 — two fixes.** Removed the `Install` entity introduced in pass 1: establishing an
install is explicitly out of scope, no requirement referenced it, and an unreferenced entity
is noise. Story 3's independent test listed four outcomes where FR-017 defines five.

**Pass 3 — clean.** Audited every constitutional principle against the requirements that
carry it (I, II, III both halves, IV, VI, VII, VIII) — all covered. No vague qualifiers, no
unreferenced entities, no remaining markers.

**Nothing was left needing a product decision.**

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
