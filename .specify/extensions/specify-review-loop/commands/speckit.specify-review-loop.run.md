---
description: "Recursively review an artifact (spec or code) for issues and fix the unambiguous ones until clean or blocked on the user"
argument-hint: "Optional target: spec (default) | code"
---

# Review Loop (spec or code)

A single recursive-review pattern with **two targets** (engine module, FR-037):

- **`target: spec`** (default) — run after `/speckit-specify`: review the just-written `spec.md`.
- **`target: code`** — invoked by `/speckit-engine-verify`: review the implemented **code + tests** for
  the active feature.

The recursion is identical; only *what is read* and *what "fixable" means* differ by target.

## Resolve the target

Read the target from the argument (`$ARGUMENTS`): `code` selects code review; anything else
(including empty) defaults to `spec`.

## The loop (same for both targets)

1. **Review** the target artifact for issues:
   - **spec**: internal consistency, vague/placeholder language, missing acceptance criteria,
     terminology drift, constitution alignment.
   - **code**: correctness against the spec/plan/tasks, obvious bugs, dead or contradictory code,
     missing/mismatched tests for the tasks just implemented, violations of the constitution
     (e.g. deterministic logic that belongs in a tested `scripts/bash/*.sh`), and anything the
     feature's `tasks.md` required but the code does not do.
2. **Fix** every issue that has a single obvious correct resolution (edit the spec, or edit the
   code/tests).
3. **Repeat** from step 1 on the updated artifact.
4. **Terminate** when a pass finds no new unambiguous fixes, OR when the only remaining issues
   need a product/user decision (spec) or a judgment call the human must make (code) — then
   surface those for the user. Always terminate (bounded passes); never loop indefinitely.

## Contract for the `code` target (used by `/speckit-engine-verify`)

- Return a clear **pass/needs-attention** signal: *pass* = nothing fixable remains and no
  attention-needing findings; *needs-attention* = at least one unresolved finding that requires
  the human. `/speckit-engine-verify` treats *needs-attention* as a stop (does not advance to
  `in-review`).
- Never advance any tracker state itself — that is the verify command's job.
- Never modify repo artifacts based on tracker state (Constitution I).
