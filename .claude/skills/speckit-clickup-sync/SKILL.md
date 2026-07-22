---
name: speckit-clickup-sync
description: Make the active feature's ClickUp card (body, US-subtasks, checklist, dependencies, status) match the repo; idempotent, one-way
compatibility: Requires spec-kit project structure with .specify/ directory and a connected ClickUp MCP server
metadata:
  author: snackbyte
  source: clickup-sync:commands/speckit.clickup.sync.md
user-invocable: true
disable-model-invocation: false
---

# ClickUp Sync — Sync

Make the feature's ClickUp representation match the committed repo: one feature-card in the
shared list, a subtask per user story (with dependency links and a markdown checkbox list of
its task lines), a verbose description body, and a derived status. **One-way** (repo →
ClickUp), **idempotent** (a no-op run makes zero ClickUp writes), **MCP-only**. The card
materializes as soon as `spec.md` exists and is enriched on every run.

## Preconditions

- The ClickUp MCP server is connected.
- The manifest has `listId` and `statusMapping`. If not, **refuse** and instruct the user to
  run `/speckit-clickup-provision` first — do NOT create the list or guess a mapping here:

  ```bash
  .specify/extensions/clickup-sync/scripts/bash/clickup-manifest.sh get listId
  .specify/extensions/clickup-sync/scripts/bash/clickup-manifest.sh get statusMapping
  ```
- `spec.md` exists for the feature.

## Derive (repo-side, no MCP)

```bash
.specify/extensions/clickup-sync/scripts/bash/clickup-parse-tasks.sh    # US-grouped task lines + done-state
.specify/extensions/clickup-sync/scripts/bash/clickup-derive-status.sh  # not-started | in-progress | done
```

Compute desired content:

- **Card body** (verbose, bounded): spec summary + user-story list w/ priorities + artifact
  links (not full contents).
- **Per user story**: a US-subtask whose `markdown_description` is the story's title/why plus a
  `- [ ] T00x …` checkbox list (boxes reflect `done`). Unattributed lines go in a checkbox list
  in the feature-card's own description.
- **US dependency edges**: from the spec's user-story numbering/priority (US2 waits_on US1, US3
  waits_on US1+US2, …) — NOT tasks.md phase order.
- **Card status**: the feature-wide derived value, written via `statusMapping`.
- **Per-US-subtask status**: each US-subtask also derives its OWN status from its story's task
  completion (all done → done; some → in-progress; none → not-started), mapped via
  `statusMapping`, re-computed each run — a subtask's status reflects its own progress, not the card's.

Hash each element with a canonical, reproducible serialization of the **derived repo-side data**
(not the rendered ClickUp prose) via `clickup-manifest.sh hash --string "<content>"`, to drive
create/update/skip:

- **Card**: `status=<feature-derived-status>;feature=<feature-dir-name>`
- **US-subtask**: `us=<US#>;status=<per-us-derived-status>;items=<compact-json of that story's parse-tasks items>`

These derive purely from repo state, so an unchanged repo recomputes identical hashes → every element skips (SC-002).

## Diff and apply (toward the repo — one-way)

Compare each fresh hash to the manifest (`get-card`, `get-us <US>`). Unchanged → skip (no MCP
call). New → create. Changed → update. The repo is authoritative; ClickUp is overwritten to
match, never merged back — a hand-edit in ClickUp reverts on the next sync.

1. **Feature-card** — create (`clickup_create_task` in `listId`, `markdown_description`,
   `status`) / update (`clickup_update_task`) / recreate on 404. Record via `set-card`.
2. **US-subtasks** — `clickup_create_task` with `parent` = card id, `name` = `US# - <title>`,
   description = story body + checkbox list; update / recreate on 404. Record via `set-us`.
3. **Dependencies** — reconcile `waiting_on` edges via `clickup_add_task_dependency` /
   `clickup_remove_task_dependency`; no stale links.
4. **Status** — set the card's feature-wide status and each US-subtask's own per-story status via `clickup_update_task`; write only elements whose mapped status changed.

## Progressive materialization & edge cases

- **Spec but no tasks**: create card + US-subtasks, no checkbox list (no empty-checklist noise).
- **Task line removed**: checkbox section rewritten wholesale, so removed lines disappear.
- **US removed/renumbered**: v1 default — report the orphaned US-subtask and leave it (do NOT
  delete); re-point dependency edges.
- **Unrelated cards in the list**: only touch cards/subtasks in this feature's manifest.

## Report

Card created/updated/unchanged; US-subtasks added/updated/orphaned; checkbox items
added/flipped/removed; dependencies set/removed; status set.

## Never

- Never modifies `tasks.md` or any repo artifact (one-way).
- Never deletes a tracked feature-card for a removed feature (v1).
- Never sets statuses beyond not-started / in-progress / done.
- Never re-scans the whole list for dedup — the manifest is the index.
