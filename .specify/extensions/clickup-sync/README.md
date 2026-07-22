# ClickUp Task Sync (Spec Kit extension)

Mirrors each Spec Kit feature into ClickUp for project-management visibility. **One-way**
(repo → ClickUp), idempotent, and **MCP-only** — every ClickUp operation goes through the
connected ClickUp MCP server; this extension ships no API client, auth, or credentials.

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
