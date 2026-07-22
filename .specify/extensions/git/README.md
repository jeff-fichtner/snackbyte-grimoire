# Git Commit Spec Artifacts Extension

This bundled extension commits the current feature's **Spec Kit artifacts**
(`specs/<feature>/`) as a clean checkpoint, primarily as a `before_implement`
hook so the planning state (`spec.md`, `plan.md`, `tasks.md`, and friends) is
captured in history right before code starts.

## Why an extension?

`/speckit-implement` declares a `before_implement` hook point. Wiring the
commit as an opt-in extension hook — rather than hardcoding it into the
implement skill — keeps the skill text untouched, lets the behavior be disabled
in one place, and follows the same lifecycle as the bundled `agent-context`
extension.

## Commands

| Command | Description |
|---------|-------------|
| `speckit.git.commit` | Stage and commit the current feature's spec artifacts. |

Invoked as the slash command `/speckit-git-commit` (Spec Kit maps the dotted
hook name to hyphens).

## Scope

- Stages **only** `specs/<feature>/`. Unrelated working-tree changes are left
  untouched and are not committed.
- No-op (clean exit, no empty commit) when the spec directory has no changes.

## Hook wiring

Registered in `.specify/extensions.yml` under `hooks.before_implement` as an
**optional** hook: `/speckit-implement` surfaces it and prompts before running.
To make it run automatically, set `optional: false` on the hook entry (with
`settings.auto_execute_hooks: true`).

## Disable

Remove (or set `enabled: false` on) the `before_implement` entry for
`git-commit` in `.specify/extensions.yml`.

## Requirements

A git repository. The script uses only `git` and the core
`.specify/scripts/bash/common.sh` helpers; `jq` is used for `--json` output
when available, with a plain-string fallback otherwise.
