---
description: "Ensure a clean git working area and a dedicated feature branch before specifying"
---

# Prepare Specify Branch

Run before `/speckit-specify` to make sure the working area is clean and ready to
move on, and that the new feature will live on its own git branch.

This command has a **mechanical** half (a bash script) and an **interactive** half
(driven by the running agent). See the `speckit-git-specify-branch` skill for the
full agent-driven procedure.

## Mechanical operations (script)

`.specify/extensions/git/scripts/bash/prepare-specify-branch.sh <subcommand> [--json]`

- `status` — report working-tree state as JSON (clean/dirty, current branch,
  default branch, dirty file list, ahead-of-remote count). Run this first.
- `commit -m "msg"` — `git add -A` and commit.
- `stash [label]` — stash all changes (including untracked).
- `create-branch <name>` — create-and-switch (or switch) to `<name>`. Refuses when
  the tree is dirty.

## Interactive procedure (agent)

1. Run `status --json`. If not in a git repo, report and skip.
2. If the tree is **dirty**, show the changes and ask the user whether to
   **commit** (prompt for a message), **stash**, or **abort**. Never commit or
   stash without the user's choice.
3. Once clean, if currently on the **default branch** (main/master), create/switch
   to the feature branch for the work about to be specified.
4. **On the new feature branch, suggest a minor version bump.** A new feature is a new
   minor version. If this repo derives its version from `package.json` (a `"version"` of
   the form `MAJOR.MINOR`, e.g. `1.4`, with the patch derived by CI — the
   `snackbyte-release-flow-action`, driven by `environments.json`), and you just
   created/switched to the feature branch,
   **suggest** bumping the minor so the feature ships under its own minor line:
   - Read `package.json` `"version"`. If it is `MAJOR.MINOR` (two numeric parts), propose
     bumping the minor by one (e.g. `1.4` → `1.5`); on the user's confirmation, update
     `package.json` and the root `"version"` in `package-lock.json` to match. Do **not**
     write a patch — the patch is CI-derived.
   - This is a **suggestion, not automatic**: state the current and proposed version and let
     the user confirm, skip, or choose a different bump (e.g. MAJOR for a breaking change).
   - Only do this **after** the feature branch exists (never bump on the default branch), and
     skip silently if `package.json` has no `MAJOR.MINOR` version or the repo doesn't use this
     derived-version scheme.
5. Report the final branch, version state, and clean state so `/speckit-specify` can proceed.
