---
description: "Inspect the real ClickUp workspace and propose a project-specific sync ruleset for approval; honored by sync when approved, else defaults apply"
argument-hint: "(no arguments)"
---

# ClickUp — Design Rules (US7)

Adapt the sync to *this* project's ClickUp conventions instead of forcing the project onto the
baked-in defaults. This command **inspects** the real workspace and **proposes** a tailored
ruleset for explicit human approval — it never silently reshapes the board. Opt-in enrichment:
with no approved ruleset, the baked-in defaults (from 001/US3) apply unchanged.

## Steps

1. **Inspect the real workspace** (read-only) via the ClickUp MCP tools:
   - `clickup_get_workspace_hierarchy`, `clickup_get_list` (statuses), `clickup_get_custom_fields`.
   - Learn: the list's actual statuses (for the six-state mapping), any custom fields, and how the
     team's board is shaped.

2. **Propose a ruleset** — present, for the user's approval, a concrete proposal covering:
   - the six logical states → this list's actual status names (the `statuses:` mapping),
   - whether user stories map to subtasks vs. tags vs. lists (default: subtasks),
   - what the card body emphasizes, and any custom-field usage.
   Show it as a diff/summary and **ask for explicit approval**. Never apply board-reshaping changes
   without a yes (FR-025).

3. **On approval** — record the ruleset as config the sync honors: write the resolved `statuses:`
   block into `config.yml` and any additional rules into a `rules:` block (or the manifest). With
   no approved ruleset present, sync uses the baked-in defaults unchanged (FR-026).

4. **Reject constitution-violating rules** — if a proposed rule would break a constitution
   principle (e.g. require two-way sync, or move tracker I/O out of the plug), **reject it** and
   explain; do not honor it (FR-027).

## Never
- Never silently applies board-reshaping changes — always propose + confirm.
- Never honors a ruleset that violates a constitution principle.
- Never removes the baked-in defaults — designed rules layer over them; absent, defaults stand.
