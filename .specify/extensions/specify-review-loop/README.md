# Specify Review Loop Extension

Runs as the `after_specify` hook for `/speckit-specify`. Immediately after a spec
is written, it **recursively** reviews `spec.md` for inconsistencies, ambiguity,
and gaps, fixing the **unambiguous** issues each pass, and stops when either
nothing fixable remains or an issue needs the user's direct attention.

## Loop behavior

- Each pass: review → apply all single-obvious-fix changes → decide whether to
  loop again.
- **Terminates** when a pass produces no new unambiguous fixes, or the only
  remaining findings need a user decision. Bounded to a small number of passes so
  it always terminates.
- **Auto-fixes** any issue with one obvious correct resolution (terminology,
  placeholders, structure, exact duplicates) regardless of severity.
- **Surfaces** anything requiring judgment (conflicting requirements, vague
  targets that are product decisions, MUST conflicts that change scope).

This behavior is fixed by the bundled skill (`speckit-specify-review-loop-run`).

## Commands

| Command | Description |
|---------|-------------|
| `speckit.specify-review-loop.run` | Recursively review-and-fix the spec until clean or blocked on the user. |

Invoked as `/speckit-specify-review-loop-run`.

## Hook wiring

Registered in `.specify/extensions.yml` under `hooks.after_specify` as a
**mandatory** hook (`optional: false`, priority 5). It auto-fires after
`/speckit-specify` and is ordered to run **before** the chained
`/speckit-clarify` (priority 20) — "recursively review THEN clarify". The
`agent-context` hook (priority 10) sits between them but only prompts. To make
this hook prompt instead of auto-firing, set `optional: true`.

## Disable

Remove (or set `enabled: false` on) the `after_specify` entry for
`specify-review-loop` in `.specify/extensions.yml`.
