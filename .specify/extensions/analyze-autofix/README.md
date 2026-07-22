# Analyze Auto-Fix Extension

Runs as the `after_analyze` hook for `/speckit-analyze`. The analyze command is
read-only — it reports findings but never edits files. This extension closes the
loop: it applies the **unambiguous** fixes from that report to `spec.md` /
`plan.md` / `tasks.md`, then **re-presents** the analysis so the only thing left
is work that needs the user's judgment.

## What it fixes vs. leaves alone

- **Fixes automatically** — findings with a single obvious correct resolution at
  any severity: terminology drift, obvious placeholders, typos, broken
  references, exact-duplicate requirements, mechanical coverage gaps.
- **Leaves for the user** — anything ambiguous or needing a product decision:
  conflicting requirements, vague-criteria targets, MUST conflicts that change the
  design, or any finding with multiple reasonable fixes.

This split is fixed by the bundled skill (`speckit-analyze-autofix-run`).

## Commands

| Command | Description |
|---------|-------------|
| `speckit.analyze-autofix.run` | Apply unambiguous analysis fixes and re-present the report. |

Invoked as `/speckit-analyze-autofix-run`.

## Hook wiring

Registered in `.specify/extensions.yml` under `hooks.after_analyze` as an
**optional** hook. To run it automatically after every analyze, set
`optional: false` (with `settings.auto_execute_hooks: true`).

## Disable

Remove (or set `enabled: false` on) the `after_analyze` entry for
`analyze-autofix` in `.specify/extensions.yml`.
