---
description: "Terminal close-out: re-run the gate, surface manual tasks for sign-off, mark done, final sync, commit"
argument-hint: "(no arguments)"
---

# Close — terminal ceremony (US2)

The single ordered ceremony that takes a verified feature to `done`: re-run the gate → confirm
completeness → surface remaining manual tasks → **wait for explicit human sign-off** → mark them
done → final sync (card → `done`) → commit the close-out edits. User-invoked, run when the human
is ready (human-paced — it waits on sign-off, which no fixed hook can time).

The human signs off **in the flow** (here, in the terminal) — never by editing the tracker. The
AI reflects the decision onto the card.

## Preconditions
- Normally the card is at `in-review` (i.e. `/speckit-engine-verify` passed). If it isn't, tell the user
  to run `/speckit-engine-verify` first.

## Steps (in order)

1. **Re-run the check gate** (FR-010a):
   ```bash
   npm run check:all      # or the project's equivalent
   ```
   - **red → REFUSE.** No sign-off, no sync, no commit. Surface the failure. Close never closes
     over a red gate.

2. **Confirm non-manual completeness** — every non-manual task in `tasks.md` is complete. If not,
   **refuse** and report exactly what remains (FR-010).

3. **Surface the manual tasks** — list the remaining manual / human-in-the-loop tasks (the
   irreducible slice from verify's handoff) and **wait for explicit sign-off**. NEVER auto-check
   them (FR-007). Present them plainly: "These need your sign-off: … — confirm to close, or tell
   me what's not done."

4. **On sign-off**:
   - Mark those manual tasks done in `tasks.md` (edit the checkboxes).
   - Set the close marker:
     ```bash
     .specify/extensions/engine/scripts/bash/manifest.sh set-lifecycle --key closedOut --value true
     ```

5. **Final sync** — run `/speckit-clickup-sync` so the card + subtasks reach `done`/shipped (the
   derive helper now reads `closedOut`). The sync itself makes **no commit** (FR-009 /
   Constitution I). If ClickUp is disabled/uninstalled, this is a silent no-op.

6. **Commit the close-out edits** — the implement-time checkpoint fired before these edits
   existed, so a fresh commit is required. Reuse the git-commit module:
   run `/speckit-git-commit` (or commit directly) to capture the `tasks.md` + manifest close-out
   edits as a distinct commit. **Sync must never commit; the commit is this separate step.**

7. **Emit the closing handoff** — the same handoff capability as verify (FR-004): what shipped,
   what was verified, and the (now signed-off) manual items, as the closing artifact.

## Outcomes
- **Signed off** → manual tasks checked, card `done`, close-out committed, handoff emitted.
- **Refused** (red gate / incomplete non-manual work / no sign-off) → nothing changes; report why.

## Never
- Never auto-checks a manual task (FR-007) or advances to `done` without sign-off (FR-020).
- The sync step never commits (FR-009); the commit is a separate step.
- Never requires the human to touch the tracker — sign-off is a flow input (FR-017).
