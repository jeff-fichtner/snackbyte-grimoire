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

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
