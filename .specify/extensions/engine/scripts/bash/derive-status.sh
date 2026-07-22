#!/usr/bin/env bash
# Derive a feature's lifecycle status from observable repo state.
#
# Pure repo-side logic — no ClickUp, no MCP. Two modes:
#
# CARD (six logical states — the engine lifecycle, US3 / contracts/status-model.md):
#   open           : no spec.md yet (feature just provisioned)
#   in-design      : spec.md present (specify/clarify/plan)
#   ready          : tasks.md present (design complete, code not started)
#   in-development : manifest lifecycle.implementStarted == true (/speckit-implement ran)
#   in-review      : manifest lifecycle.verifyPassed == true (/speckit-engine-verify passed)
#   done           : manifest lifecycle.closedOut == true (/speckit-engine-close signed off)
#   States 1–3 derive purely from artifact presence (idempotent). States 4–6 read recorded
#   markers from the manifest — because `ready` (tasks written) and `in-development` (implement
#   run) share the same artifacts (spec+plan+tasks), artifact presence alone cannot distinguish
#   them, so `implementStarted` is recorded by the after_implement sync. Markers are never
#   inferred from artifacts; a later command re-derives the same state from the same markers.
#
# SUBTASK (three states — a user story is a unit of work, FR-016; the 001 behavior, unchanged):
#   not-started | in-progress | done  from that story's own task completion.
#
# Usage:  derive-status.sh [--dir <feature dir>] [--card | --us <US#>] [--manifest <path>]
#   --dir       feature directory (default: active feature via get_feature_paths)
#   --card      derive the six-state CARD status (default when neither --card nor --us given)
#   --us <US#>  derive the three-state status of a single user story from its own tasks
#   --manifest  path to the feature manifest (default: <dir>/.clickup-sync.json) — read for the
#               lifecycle markers that gate in-review/done
#
# Output: one logical state on stdout. Exit 0.
set -euo pipefail

DIR=""
US=""
MANIFEST=""
MODE="card"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dir) DIR="${2:-}"; shift 2 ;;
        --us) US="${2:-}"; MODE="us"; shift 2 ;;
        --card) MODE="card"; shift ;;
        --manifest) MANIFEST="${2:-}"; shift 2 ;;
        --help|-h) sed -n '2,24p' "$0"; exit 0 ;;
        *) shift ;;
    esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../../../scripts/bash/common.sh"

# Self-sufficiency: define has_jq only if the host common.sh didn't (older cores lack it).
type has_jq >/dev/null 2>&1 || has_jq() { command -v jq >/dev/null 2>&1; }
# Test hook: CLICKUP_NO_JQ=1 forces the documented no-jq fallback path so it can be covered by
# tests on a machine that has jq installed (Constitution: the fallback must keep working).
if [[ "${CLICKUP_NO_JQ:-}" == "1" ]]; then has_jq() { return 1; }; fi

if [[ -z "$DIR" ]]; then
    eval "$(get_feature_paths)"
    DIR="${FEATURE_DIR:-}"
fi

SPEC="$DIR/spec.md"
PLAN="$DIR/plan.md"
TASKS="$DIR/tasks.md"
[[ -z "$MANIFEST" ]] && MANIFEST="$DIR/.clickup-sync.json"

# --- SUBTASK mode: per-user-story three-state status (FR-016; the 001 rule, unchanged) ---
if [[ "$MODE" == "us" ]]; then
    if [[ ! -f "$TASKS" ]] || ! has_jq; then
        echo "not-started"; exit 0
    fi
    counts="$(bash "$SCRIPT_DIR/parse-tasks.sh" --file "$TASKS" \
        | jq -r --arg us "$US" '(.groups[] | select(.us==$us)) as $g
            | if $g == null then "0 0"
              else "\([$g.items[]|select(.done)]|length) \($g.items|length)" end' 2>/dev/null || echo "0 0")"
    us_done="${counts%% *}"; us_total="${counts##* }"
    if [[ "${us_total:-0}" -eq 0 || "${us_done:-0}" -eq 0 ]]; then echo "not-started"
    elif [[ "$us_done" -lt "$us_total" ]]; then echo "in-progress"
    else echo "done"; fi
    exit 0
fi

# --- CARD mode: the six-state engine lifecycle ---

# Read a lifecycle marker from the manifest (true/false). Empty/absent manifest → false.
manifest_flag() {
    local key="$1"
    [[ -f "$MANIFEST" ]] || { echo "false"; return; }
    if has_jq; then
        jq -r --arg k "$key" '(.lifecycle[$k]) // false' "$MANIFEST" 2>/dev/null || echo "false"
    else
        # no-jq fallback: grep the flat "key": true|false out of the lifecycle block
        grep -oE "\"$key\"[[:space:]]*:[[:space:]]*(true|false)" "$MANIFEST" 2>/dev/null \
            | grep -oE 'true|false' | head -1 || echo "false"
    fi
}

# States 4–6 first (recorded markers win over artifact-derived states once set, and later
# markers win over earlier ones: closedOut > verifyPassed > implementStarted).
if [[ "$(manifest_flag closedOut)" == "true" ]]; then echo "done"; exit 0; fi
if [[ "$(manifest_flag verifyPassed)" == "true" ]]; then echo "in-review"; exit 0; fi
if [[ "$(manifest_flag implementStarted)" == "true" ]]; then echo "in-development"; exit 0; fi

# States 1–3 from artifact presence.
if [[ ! -f "$SPEC" ]]; then echo "open"; exit 0; fi          # provisioned, no spec yet

# Distinguish in-design (no tasks yet) from ready (tasks written, design complete).
task_lines=0
if [[ -f "$TASKS" ]]; then
    task_lines="$(grep -cE '^[[:space:]]*-[[:space:]]*\[[ xX]\][[:space:]]*T[0-9]{3}' "$TASKS" || true)"
fi

if [[ ! -f "$TASKS" || "$task_lines" -eq 0 ]]; then
    echo "in-design"; exit 0                                  # spec present, no tasks yet
fi

echo "ready"                                                 # tasks written → ready (until implement runs)
