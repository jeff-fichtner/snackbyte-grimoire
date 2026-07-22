#!/usr/bin/env bash
# Derive a feature's ClickUp status from observable repo state.
#
# Pure repo-side logic — no ClickUp, no MCP. The canonical rule (FR-008 / research D4):
#   - no plan.md yet                          -> not-started
#   - plan.md exists, not all tasks checked   -> in-progress   (incl. tasks.md with 0 checked)
#   - tasks.md exists and all tasks checked   -> done
#
# Usage:  clickup-derive-status.sh [--dir <feature dir>] [--us <US#>]
#   --dir  the feature directory (default: active feature via get_feature_paths)
#   --us   derive the status of a SINGLE user story from its own tasks (FR-009a) instead of
#          the whole feature. Rule for a story: all its tasks checked -> done; some -> in-progress;
#          none (or the story has no tasks yet) -> not-started.
#
# Output: one of  not-started | in-progress | done  on stdout. Exit 0.
set -euo pipefail

DIR=""
US=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dir) DIR="${2:-}"; shift 2 ;;
        --us) US="${2:-}"; shift 2 ;;
        --help|-h) sed -n '2,18p' "$0"; exit 0 ;;
        *) shift ;;
    esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../../../scripts/bash/common.sh"

# Self-sufficiency: define has_jq only if the host common.sh didn't (older cores lack it).
type has_jq >/dev/null 2>&1 || has_jq() { command -v jq >/dev/null 2>&1; }

if [[ -z "$DIR" ]]; then
    eval "$(get_feature_paths)"
    DIR="${FEATURE_DIR:-}"
fi

PLAN="$DIR/plan.md"
TASKS="$DIR/tasks.md"

# --us: per-user-story status from that story's own task completion (FR-009a).
# Uses the parse-tasks helper so grouping (explicit [US#] + phase-heading fallback) matches sync.
if [[ -n "$US" ]]; then
    if [[ ! -f "$TASKS" ]] || ! has_jq; then
        # No tasks yet (or no jq to read groups) → the story hasn't started.
        echo "not-started"; exit 0
    fi
    counts="$(bash "$SCRIPT_DIR/clickup-parse-tasks.sh" --file "$TASKS" \
        | jq -r --arg us "$US" '(.groups[] | select(.us==$us)) as $g
            | if $g == null then "0 0"
              else "\([$g.items[]|select(.done)]|length) \($g.items|length)" end' 2>/dev/null || echo "0 0")"
    us_done="${counts%% *}"; us_total="${counts##* }"
    if [[ "${us_total:-0}" -eq 0 || "${us_done:-0}" -eq 0 ]]; then echo "not-started"
    elif [[ "$us_done" -lt "$us_total" ]]; then echo "in-progress"
    else echo "done"; fi
    exit 0
fi

# No plan yet → not-started (spec may or may not exist; caller only syncs when spec exists).
if [[ ! -f "$PLAN" ]]; then
    echo "not-started"
    exit 0
fi

# Count task checkboxes in tasks.md (T-lines only, matching the tasks.md convention).
total=0; checked=0
if [[ -f "$TASKS" ]]; then
    total="$(grep -cE '^[[:space:]]*-[[:space:]]*\[[ xX]\][[:space:]]*T[0-9]{3}' "$TASKS" || true)"
    checked="$(grep -cE '^[[:space:]]*-[[:space:]]*\[[xX]\][[:space:]]*T[0-9]{3}' "$TASKS" || true)"
fi

# plan.md present but no tasks yet, or tasks not all done → in-progress.
if [[ "$total" -eq 0 || "$checked" -lt "$total" ]]; then
    echo "in-progress"
    exit 0
fi

# tasks.md exists and every task is checked → done.
echo "done"
