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
- `.specify/extensions/clickup-sync/config.yml` has real `space` and `list` values (not the
  `<...>` placeholders). If either is still a placeholder, **stop** and tell the user to fill
  `config.yml`.

## Steps

1. **Resolve the active feature** and manifest path:

   ```bash
   .specify/extensions/clickup-sync/scripts/bash/clickup-manifest.sh path
   ```

2. **Read config** — parse `space` and `list` from
   `.specify/extensions/clickup-sync/config.yml`. If either is `<...>`, stop with an
   instruction to configure.

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

5. **Resolve the status mapping** — read the list's available statuses (via
   `clickup_get_list`). Map the three logical states onto real statuses:
   - `not-started` → the list's first not-done/open status,
   - `done` → the list's closed/done status,
   - `in-progress` → a distinct middle status if the list has one; otherwise reuse the open
     status is NOT acceptable — the three logical states MUST map to statuses that can be told
     apart. If the list cannot represent all three distinctly, **stop** and print exactly which
     statuses the list needs (name them), and record nothing (fail-loud; do not sync to an
     unusable mapping).

6. **Write the manifest targets** (merge, preserving any existing `card`/`userStories`):

   ```bash
   .specify/extensions/clickup-sync/scripts/bash/clickup-manifest.sh set-targets \
     --workspace "<workspace id>" --space "<space id>" --list "<list id>" \
     --status-map '{"not-started":"<name>","in-progress":"<name>","done":"<name>"}'
   ```

7. **Report** what happened: space found, list found-or-created, the resolved status mapping —
   or the stop-reason.

## Idempotence

Re-running finds the same space + list and rewrites the same target values; it creates no
duplicate space or list (the 2nd+ feature is a pure reuse).

## Never

- Never creates a ClickUp space automatically (only find; instruct if missing).
- Never writes to the repo other than the feature manifest.
- Never touches unrelated cards/tasks in the list.
- Never proceeds past an ambiguous space or an insufficient status set — it stops.
