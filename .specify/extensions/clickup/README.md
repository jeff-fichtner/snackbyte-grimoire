# ClickUp plug (Spec Kit extension)

The **ClickUp plug** for [snackbyte-speckit-engine](../../../README.md) — the first (and, so far,
only) external tracker plug. It is one implementation of the engine's tracker interface: the engine
drives the generic lifecycle, this plug turns those lifecycle events into real ClickUp actions.

**The tracker interface a plug implements** (what the engine asks any plug to do):

- **resolve-target / status-mapping** — find-or-create the tracker's container and map the engine's
  **six logical states** (`open · in-design · ready · in-development · in-review · done`) onto the
  tracker's real statuses (here: provision the ClickUp space + shared list, map the six onto the
  list's statuses, falling back to three where a list can't express six).
- **create/update item** — materialize a feature and its user stories as tracker items.
- **set-checklist** — render the feature's `tasks.md` lines onto the item.
- **link-dependency** — reflect user-story dependencies.
- **update-status** — write the derived lifecycle state (card: six states; subtasks: three).
- **attach-provenance** — link the commits that shipped the feature (Option A, hash-deduped).

Another plug (Linear, a local file, …) implements the same interface its own way; the engine does
not change. This plug's implementation follows.

> **Seam, not machinery (research Decision 7).** The interface above is the boundary that lets a
> second plug slot in. The engine's **local plug** (zero-tracker file mode) and **multi-plug
> broadcasting** are specified (FR-032/SC-013) but deliberately **not built** — ClickUp is the one
> concrete plug today. An uninstalled/disabled plug is a silent no-op, not an error
> (Constitution VI), so adding a plug later is additive, never a rework.

---

Mirrors each Spec Kit feature into ClickUp for project-management visibility. **One-way**
(repo → ClickUp), idempotent, and **MCP-only** — every ClickUp operation goes through the
connected ClickUp MCP server; this plug ships no API client, auth, or credentials.

## What it creates in ClickUp

```
Shared List (one per repo)
└── Feature-card (one ClickUp task per feature)        ← verbose body + derived status
    ├── US-subtask (one per user story)                ← native dependency links
    │     description: "- [ ] T001 …" checkbox list    ← one line per tasks.md task
    └── …
```

- **Feature → ClickUp task** ("feature-card") in a single shared list.
- **User story → subtask** under the card, carrying native ClickUp dependency links
  (US3 waits-on US1 & US2), derived from the spec's user-story numbering.
- **`tasks.md` line → markdown checkbox** inside its US-subtask's description. (The ClickUp
  MCP server has no checklist API, so the checklist is rendered as markdown in the task
  description.)
- **Status** (`not-started` / `in-progress` / `done`) derived from the feature's Spec Kit
  stage (plan presence + checkbox counts) and written via a per-list status mapping.
- The card **materializes as soon as `spec.md` exists** and is enriched on every later sync.

## Configure

Edit [`config.yml`](config.yml) and set your `space` and `list` names (no IDs, no secrets).
Provisioning refuses to run while the `<...>` placeholders remain.

## Commands & hooks

| Command | Hook | What it does |
|---|---|---|
| `/speckit-clickup-provision` | `after_plan` (optional) | Find-or-create the space + shared list, resolve & record the status mapping and target IDs into the feature manifest. |
| `/speckit-clickup-sync` | `after_tasks`, `after_implement` (optional) | Make the feature-card (body, US-subtasks, checklist, dependencies, status) match the repo. Idempotent — a no-op run makes zero ClickUp writes. |

## State

Each feature carries a committed manifest at `specs/<feature>/.clickup-sync.json` holding the
target IDs, the status mapping, the card + US-subtask IDs, and content hashes. It is the
dedup index (create/update/skip) and the target locator — the **only** place runtime ClickUp
IDs are committed. Nothing else in this package contains IDs or secrets.

## Guarantees

- **One-way**: the sync overwrites ClickUp toward the repo; it never writes back to
  `tasks.md` or any repo artifact, and a hand-edit in ClickUp is reverted on the next sync.
- **MCP-only**: no custom ClickUp API/auth code.
- **Portable**: set only `config.yml` to retarget a different workspace/space/list — no code
  edits.
- **Scaffolding-only**: this lives entirely under `.specify/` + `.claude/` + per-feature
  manifests; it introduces no ClickUp references into shipped app source, docs, or CI.

## Repo-side helpers

Deterministic logic (tasks.md parsing, status derivation, manifest I/O, hashing) lives in
[`scripts/bash/`](scripts/bash/) and is unit-tested (`*.test.sh`). The command prompts own
only the ClickUp MCP orchestration, which is validated manually via the feature's
`quickstart.md` against a real workspace.
