---
description: "Find-or-create the ClickUp space + shared list and record the target IDs and status mapping in the active feature's manifest"
---

# ClickUp Sync — Provision

Ensure the ClickUp target for this repo exists and record where it is, so later `sync` runs
never have to discover or guess. Provisioning is separate from and earlier than sync; it is a
near-no-op after the first feature (the shared list is reused). All ClickUp access is through
the connected ClickUp MCP server — no API/auth code.

## Preconditions

- The ClickUp MCP server is connected.
- `.specify/extensions/clickup/config.yml` resolves to real `space`/`list` values via the
  placeholder flow below.

## Config resolution (local override → placeholder → ask → remember)

Config is layered. Read `.specify/extensions/clickup/config.local.yml` **first** if it
exists (gitignored; holds this machine's real `space`/`list`), then fall back to
`config.yml` (distributed source; ships `<...>` placeholders) for any key the override omits.
Resolve `space` and `list` from that merged view:

1. If `enabled: false` is set in `config.yml`, the user has previously **declined** ClickUp
   sync for this repo. **Silently do nothing and exit 0** — do NOT ask again. (This is the
   "know not to ask them again" state.)
2. If both `space` and `list` hold real values (not `<...>` placeholders), use them — proceed
   to the Steps below. Do not ask.
3. If either is still a `<...>` placeholder, **ask the user once**: "This repo isn't wired to a
   ClickUp space/list yet. Give me the ClickUp space name and shared-list name to sync into, or
   say you don't want ClickUp sync here."
   - **If they provide values** → write them into **`config.local.yml`** (the gitignored
     override), NOT into `config.yml` — the distributed source must keep its placeholders so a
     fresh install still refuses rather than pointing at someone else's space. The saved values
     mean this question is never asked again.
   - **If they decline** → set `enabled: false` in `config.local.yml` and record a short note,
     then exit 0. Never ask again on subsequent runs (handled by rule 1). Do not sync.
   - Only ask **once per run**; if the user gives an unusable answer, stop with a clear message
     rather than re-prompting in a loop.

## Steps

1. **Resolve the active feature** and manifest path:

   ```bash
   .specify/extensions/engine/scripts/bash/manifest.sh path
   ```

2. **Read config** — use the `space`/`list` values resolved by the "Config resolution" block
   above (placeholders are already handled there; if you reached this step they are real).

3. **Locate the space** — call the ClickUp MCP tool `clickup_get_workspace_hierarchy`
   (`max_depth: "2"`). Find the space whose name matches `config.space`.
   - **0 matches**: stop and tell the user the space does not exist and must be created (or the
     name corrected). Do not create a space automatically.
   - **>1 matches** (ambiguous): stop and ask the user to disambiguate; do not guess.
   - **1 match**: record its id and workspace id.

4. **Find-or-create the shared list** under that space:
   - If a list named `config.list` already exists under the space (from the hierarchy), adopt
     its id (no create — this is the reuse path for the 2nd+ feature).
   - Otherwise call `clickup_create_task`'s sibling `clickup_create_list` with
     `name: config.list`, `space_id: <space id>`; record the new list id.

5. **Resolve the six-state status mapping** — read the list's available statuses (via
   `clickup_get_list`) and map the engine's **six logical states** onto real status names:
   `open · in-design · ready · in-development · in-review · done`.
   - **Prefer `config.yml`'s `statuses:` block** if present — it explicitly names the actual
     status for each logical state. Validate every named status actually exists on the list;
     if one doesn't, **stop** and name the mismatch.
   - **Otherwise resolve a best-effort mapping** from the list's real statuses (e.g. an open-type
     status → `open`, a done/closed-type → `done`, distinct middle statuses → the in-between
     states in order).
   - **Degrade, don't fail**: a list without six distinct statuses maps to the three-state floor
     (not-started / in-progress / done) — `open`/`in-design`/`ready` → the open status,
     `in-development`/`in-review` → a middle status, `done` → the done status. Use
     `status-map.sh` semantics. The list only needs to distinguish those three; **stop**
     (fail-loud) only if it cannot even represent three distinct states, naming what it needs.

6. **Write the manifest targets** (merge, preserving any existing `card`/`userStories`). Pass the
   full six-state mapping (or the degraded three-state one) as the status map:

   ```bash
   .specify/extensions/engine/scripts/bash/manifest.sh set-targets \
     --workspace "<workspace id>" --space "<space id>" --list "<list id>" \
     --status-map '{"open":"<name>","in-design":"<name>","ready":"<name>","in-development":"<name>","in-review":"<name>","done":"<name>"}'
   ```

7. **Create the feature-card in `open`** (FR-013a) — so the `open → in-design` transition at
   `/speckit-specify` is itself visible as "design work started". Derive the desired state with
   `derive-status.sh --card` (with no spec yet this yields `open`), map it via
   `status-map.sh resolve --logical open --map <statusMapping>`, and:
   - `clickup_create_task` in `listId` with `name` = feature title, a minimal body, and
     `status` = the mapped `open` status.
   - Record it: `manifest.sh set-card --id <id> --hash <hash>` (hash the derived
     card content per the sync contract). If a `card.id` already exists in the manifest, this
     is a re-provision — do NOT create a second card.

8. **Report** what happened: space found, list found-or-created, the resolved six-state (or
   degraded three-state) mapping, the card created in `open` — or the stop-reason.

## Idempotence

Re-running finds the same space + list and rewrites the same target values; it creates no
duplicate space or list (the 2nd+ feature is a pure reuse).

## Never

- Never creates a ClickUp space automatically (only find; instruct if missing).
- Never writes to the repo other than the feature manifest.
- Never touches unrelated cards/tasks in the list.
- Never proceeds past an ambiguous space or an insufficient status set — it stops.
