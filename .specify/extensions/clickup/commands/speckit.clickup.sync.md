---
description: "Make the active feature's ClickUp card (body, US-subtasks, checklist, dependencies, status) match the repo; idempotent, one-way"
---

# ClickUp Sync — Sync

Make the feature's ClickUp representation match the committed repo: one feature-card in the
shared list, a subtask per user story (with dependency links and a markdown checkbox list of
its task lines), a verbose description body, and a **six-state lifecycle status**. **One-way**
(repo → ClickUp), **idempotent** (a no-op run makes zero ClickUp writes), **MCP-only**. The card
is created in `open` at provision and re-synced on **every** Spec Kit command — writing the
artifacts (spec, plan, tasks) is visible as work, not just implementation.

**The AI is the sole writer** of the card in the normal flow (US4): every status/content write
comes from a Spec Kit command or close-out. Humans never need to touch the tracker; it is a
read-only mirror for them.

**Which command called this sync** determines the target lifecycle state (the hook wiring in
`.specify/extensions.yml` passes the moment). The command→state mapping (contracts/status-model.md):
`after_specify`/`clarify`/`plan` → `in-design`; `after_tasks`/`after_analyze` → `ready`;
`after_implement` → `in-development` (also **set the `implementStarted` marker**, below);
`after_converge` → stays `in-development`. `/speckit-engine-verify` (→ `in-review`) and `/speckit-engine-close`
(→ `done`) set their own markers and call this sync themselves.

## Preconditions

- The ClickUp MCP server is connected.
- ClickUp sync is not disabled for this repo. Config is layered — read
  `.specify/extensions/clickup/config.local.yml` (gitignored override) first, then
  `config.yml` (distributed source) for anything it omits. If the merged view has
  `enabled: false` (the user previously declined), **silently do nothing and exit 0** — do not
  ask, do not sync. (Matches provision's decline state.)
- The manifest has `listId` and `statusMapping`. If not, **refuse** and instruct the user to
  run `/speckit-clickup-provision` first — do NOT create the list or guess a mapping here.
  Check with:

  ```bash
  .specify/extensions/engine/scripts/bash/manifest.sh get listId
  .specify/extensions/engine/scripts/bash/manifest.sh get statusMapping
  ```
- `spec.md` exists for the feature (the card is keyed off the spec).

## Derive (repo-side, no MCP)

First, **if this sync was triggered by `after_implement`**, record the implement marker so the
card can derive `in-development` (artifact presence alone can't distinguish `ready` from
`in-development` — see contracts/status-model.md):

```bash
.specify/extensions/engine/scripts/bash/manifest.sh set-lifecycle --key implementStarted --value true
```

Then run the helpers to compute the desired state:

```bash
# US-grouped task lines with done-state (empty groups if no tasks.md yet):
.specify/extensions/engine/scripts/bash/parse-tasks.sh
# Six-state CARD status (open|in-design|ready|in-development|in-review|done):
.specify/extensions/engine/scripts/bash/derive-status.sh --card
# Map a logical state to this list's actual status name (handles the 3-state fallback):
.specify/extensions/engine/scripts/bash/status-map.sh resolve --logical <state> --map "$(manifest.sh get statusMapping)"
```

Then compute each element's desired content:

- **Card body** (verbose, bounded): a short spec summary, the list of user stories with their
  priorities, and links/pointers to the artifacts that exist (spec/research/plan/tasks) — NOT
  their full contents.
- **Per user story**: a US-subtask whose markdown description is the story's title/why plus a
  `- [ ] T00x …` / `- [x] T00x …` checkbox list of that story's task lines (boxes reflecting
  `done`). Task lines with no user story (the `unattributed` group) go into a checkbox list in
  the **feature-card's own** description, not a subtask.
- **US dependency edges**: from the **spec's user-story numbering/priority order** (US2
  waits_on US1, US3 waits_on US1+US2, …) — NOT tasks.md phase order.
- **Card status**: the feature-wide six-state value (`derive-status.sh --card`), mapped
  to the list's actual status name via `status-map.sh resolve` against `statusMapping`
  (this also applies the 3-state fallback for reduced lists — report the degradation once).
- **Per-US-subtask status**: EACH US-subtask gets its own **three-state** status (a subtask is a
  unit of work, FR-016), from that story's own task completion — `derive-status.sh --us
  <US#>` (all its tasks checked → done; some → in-progress; none → not-started) — mapped via
  `status-map.sh` (the floor buckets) and re-computed every run. A subtask never carries
  the design/ready/review states — those are feature-level.

Hash each element with a **canonical, reproducible serialization** (hash the derived repo-side
data, NOT the rendered ClickUp prose — so any future run recomputes the identical hash and a
no-op stays a no-op):

```bash
.specify/extensions/engine/scripts/bash/manifest.sh hash --string "<content>"
```

Canonical content per element (keep this exact — the stored manifest hashes depend on it):

- **Card**: `status=<feature-derived-status>;feature=<feature-dir-name>`
- **US-subtask**: `us=<US#>;status=<per-us-derived-status>;items=<compact-json of that story's parse-tasks items array>`

where the items array is `parse-tasks.sh` output filtered to that story
(`.groups[] | select(.us==$u) | .items`, compact). Because these derive purely from repo state,
re-running with no repo change yields identical hashes → every element skips (SC-002).

## Diff and apply (toward the repo — one-way)

Compare each freshly-derived hash to the manifest (`get-card`, `get-us <US>`). For each
element: **unchanged** (hash equal) → skip, no MCP call; **new** → create; **changed** → update.
The repo is authoritative: whatever the derived content says overwrites ClickUp. A hand-edit in
ClickUp to an owned element is reverted on the next sync (never merged back into the repo).

1. **Feature-card**:
   - No `card.id` in manifest → `clickup_create_task` in `listId` with `name` = feature title,
     `markdown_description` = card body, `status` = `statusMapping[derived]`. Record via
     `manifest.sh set-card --id <id> --hash <hash>`.
   - Have `card.id`, hash changed → `clickup_update_task` (name/description/status). Refresh hash.
   - Have `card.id` but `clickup_get_task` 404s (deleted in UI) → recreate and refresh the id.
2. **US-subtasks** (one per user story):
   - No recorded id → `clickup_create_task` with `parent` = card id, `name` = `US# - <title>`,
     `markdown_description` = the story body + checkbox list, `status` = the subtask's own
     derived status via `statusMapping`. Record via `set-us`.
   - Recorded, hash changed → `clickup_update_task` (description and/or its own status). Refresh hash.
   - Recorded but missing in ClickUp → recreate under the card, refresh id.
3. **Dependencies**: reconcile each US-subtask's `waiting_on` edges to match the derived set —
   `clickup_add_task_dependency` (type `waiting_on`) for new edges, `clickup_remove_task_dependency`
   for edges no longer implied. No stale links remain.
4. **Status**: set the card's feature-wide status and each US-subtask's own per-story status via
   `clickup_update_task` using `statusMapping`; only write an element whose mapped status changed.
5. **Commit provenance (US6)** — attach the feature's commits to the card, deduped:
   - Route through a single **provenance-mode** check (config `provenance-mode`, default `A`) so
     Option B (ClickUp's native GitHub integration) can tack on later as the other branch without
     reworking A. Only Option A is built now; when `provenance-mode: B` is opted in, A stands down
     entirely (no double-posting — FR-024a).
   - **Option A**: render + hash the block:
     ```bash
     .specify/extensions/engine/scripts/bash/provenance.sh render --feature <feature>
     .specify/extensions/engine/scripts/bash/provenance.sh hash --feature <feature>
     ```
     If the hash differs from the manifest's `card.provenanceHash`, push the block to the card via
     MCP (a comment or a body section) and record the new hash with
     `manifest.sh set-provenance-hash --hash <h>`. If the hash is unchanged, **skip** — no
     duplicate links (SC-009). One-way, like everything else.

## Progressive materialization & edge cases

- **Spec but no tasks yet**: still create the card (body + status) and the US-subtasks; add no
  checkbox list (an absent/empty `tasks.md` is not an absent spec — do not create empty-checklist
  noise).
- **Task line removed**: because each US-subtask's checkbox section is rewritten wholesale from
  the derived content, a line dropped from `tasks.md` simply disappears — no residual boxes.
- **User story removed / renumbered** (a manifest US with no matching story now): **v1 default —
  report it in the run summary and leave the orphaned US-subtask in place (do NOT delete)**;
  re-point dependency edges so nothing dangles.
- **Shared list holds unrelated or MANUAL cards (US5)**: only ever touch cards/subtasks recorded
  in this feature's manifest; never modify or count anything else in the list. A **manual item**
  (a hand-made card with no backing `tasks.md`, tracked by a human) is simply never in any
  feature manifest, so it is never derived, overwritten, or counted — safe by construction, no
  marker needed.

## Report

Print a per-run summary: card created/updated/unchanged; US-subtasks added/updated/orphaned;
checkbox items added/flipped/removed; dependencies set/removed; status set.

## Never

- Never modifies `tasks.md` or any repo artifact based on ClickUp state (one-way).
- Never deletes a whole tracked feature-card for a removed feature (v1).
- Never sets `in-review` or `done` from a sync alone — those states come only from
  `/speckit-engine-verify` (marker `verifyPassed`) and `/speckit-engine-close` (marker `closedOut`). A plain
  sync derives at most `in-development`.
- Never requires a human to touch the tracker; the AI writes every state.
- Never re-scans the whole list for dedup — the manifest is the index.
