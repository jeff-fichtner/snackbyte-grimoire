---
description: "Certify a completed feature: recursive code review + full unit gate + automatable E2E, then advance the card to in-review"
argument-hint: "(no arguments)"
---

# Verify — earn the review state (US8)

The certification pass. Run **after** `/speckit-implement` (and the `after_implement`→converge
chain). It makes the AI do everything it can to verify the feature, and only on success advances
the card to `in-review`. `in-review` therefore means "the AI verified all it could" — not merely
"converge finished". User-invoked (a deliberate step); not an automatic hook.

Stop on the first failure — never advance to `in-review` over a red gate or an unresolved review
finding (FR-034). The card stays at `in-development`.

## Steps (in order; stop on first failure)

1. **Recursive code review** — invoke the consolidated review module with target `code`:

   Run `/speckit-specify-review-loop code` (the `specify-review-loop` module, generalized to a
   `spec | code` target — FR-037). It recursively reviews the implemented code + tests for the
   active feature: correctness against spec/plan/tasks, obvious bugs, missing/mismatched tests for
   the tasks just implemented, and constitution violations (e.g. deterministic logic that belongs
   in a tested `scripts/bash/*.sh`). It fixes the unambiguous issues each pass and returns
   **pass** (nothing fixable remains, no attention-needing findings) or **needs-attention**.
   - **needs-attention → STOP.** Report the findings; leave the card at `in-development`.

2. **Full unit gate** — run the project's check gate. It MUST pass.

   ```bash
   npm run check:all      # or the project's equivalent (shell lint + every *.test.sh)
   ```
   - **red → STOP.** Report the failure; leave the card at `in-development` (FR-005/006).

3. **Automatable E2E** — drive whatever end-to-end testing the AI can automate **for the feature
   at hand** (FR-002): exercise the real flow as far as available tooling allows (apply
   migrations, seed/clean up data, invoke real inputs/CLI/APIs/MCP, read back real results).
   Record what you could NOT exercise and why — that goes into the handoff (do not silently skip).
   An un-automatable E2E slice is *reported*, not a hard stop; a *failing* automatable E2E is a
   stop.

4. **Advance to `in-review`** — only if steps 1–3 passed:
   - Set the marker:
     ```bash
     .specify/extensions/engine/scripts/bash/manifest.sh set-lifecycle --key verifyPassed --value true
     ```
   - Run `/speckit-clickup-sync` so the card advances to `in-review` (the derive helper now reads
     `verifyPassed`). If ClickUp is disabled/uninstalled, this is a silent no-op — verify still
     succeeds (the marker is the source of truth).

## Handoff report (produced in the flow — the US1 capability, FR-004)

Emit an honest end-of-verify handoff, in the flow (no committed HANDOFF file):
- what the feature does and where it lives;
- what was verified automatically, with evidence (gate output, test counts, E2E results read
  back);
- what remains **manual** and **why** each item could not be automated (the irreducible slice);
- any follow-ups / known gaps surfaced during verification.

This same handoff capability is reused by `/speckit-engine-close`.

## Outcomes
- **Pass** → `verifyPassed` recorded, card `in-review`, handoff produced.
- **Fail at any required step** → card stays `in-development`, `verifyPassed` NOT set, failure
  surfaced. `in-review` is reachable ONLY through a passing verify.

## Never
- Never advances to `in-review` over a red gate or an unresolved review finding.
- Never signs off manual tasks or moves the card to `done` — that is `/speckit-engine-close`.
- Never writes back into repo artifacts based on tracker state (Constitution I).
