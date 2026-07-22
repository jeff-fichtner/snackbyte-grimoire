---
description: "Stage and commit the current feature's Spec Kit artifacts as a pre-implementation checkpoint"
---

# Commit Spec Artifacts

Capture the current feature's Spec Kit planning state in git history before
implementation begins. This stages **only** the feature's spec directory
(`specs/<feature>/` — `spec.md`, `plan.md`, `tasks.md`, `research.md`,
`data-model.md`, `contracts/`, checklists, etc.) and commits it as a clean
checkpoint, leaving any unrelated working-tree changes untouched.

## Behavior

- Resolves the active feature directory via the core `get_feature_paths()`
  helper (honors `SPECIFY_FEATURE_DIRECTORY` / `.specify/feature.json`).
- Stages only `specs/<feature>/`.
- If nothing under that directory is dirty, exits successfully as a no-op — it
  never creates an empty commit.
- Otherwise commits with the message
  `chore(spec): checkpoint <feature> artifacts before implement` (override with
  `--message`).

## Execution

- **Bash**: `.specify/extensions/git/scripts/bash/commit-spec-artifacts.sh [--json] [--message "msg"]`

Run from anywhere inside the repo. Add `--json` for machine-readable output
(`{"status": "...", "message": "..."}` where status is `committed`,
`nothing-to-commit`, or `error`).
