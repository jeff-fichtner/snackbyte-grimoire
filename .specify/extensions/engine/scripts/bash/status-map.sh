#!/usr/bin/env bash
# Map one of the engine's six logical lifecycle states to a target list's ACTUAL status name.
#
# Pure repo-side logic — no ClickUp, no MCP (US3 / FR-015 / contracts/status-model.md).
#
# The six logical states, in order:
#   open · in-design · ready · in-development · in-review · done
#
# A list that has distinct statuses for all six maps 1:1 (from config `statuses:` /
# manifest `statusMapping`). A list WITHOUT six distinct statuses degrades to a three-state
# floor — not-started / in-progress / done — by collapsing the six logical states:
#   open, in-design, ready        -> not-started  (nothing has shipped code yet)
#   in-development, in-review      -> in-progress  (work is underway)
#   done                           -> done
# Each collapsed logical state then maps to the nearest configured actual status.
#
# Usage:
#   status-map.sh resolve --logical <state> --map <json>
#       Print the actual status name for <state> given the mapping JSON
#       ({"open":"backlog",...} or a 3-state {"not-started":..,"in-progress":..,"done":..}).
#       If <state> is absent from a six-key map, or the map is 3-key, the fallback applies.
#   status-map.sh floor --logical <state>
#       Print the three-state floor bucket for <state> (not-started|in-progress|done).
#   status-map.sh degraded --map <json>
#       Print "true" if <map> is a three-state (floor) map, "false" if it maps six states.
#
# Output: one status name (resolve) or bucket/bool. Exit 0. Exit 2 on bad usage.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../../../scripts/bash/common.sh"
type has_jq >/dev/null 2>&1 || has_jq() { command -v jq >/dev/null 2>&1; }
# Test hook: CLICKUP_NO_JQ=1 forces the documented no-jq fallback path so it can be covered by
# tests on a machine that has jq installed (Constitution: the fallback must keep working).
if [[ "${CLICKUP_NO_JQ:-}" == "1" ]]; then has_jq() { return 1; }; fi

SIX="open in-design ready in-development in-review done"

# The three-state floor bucket for a logical state.
floor_bucket() {
    case "$1" in
        open|in-design|ready) echo "not-started" ;;
        in-development|in-review) echo "in-progress" ;;
        done) echo "done" ;;
        not-started|in-progress) echo "$1" ;;   # already a floor bucket
        *) echo "not-started" ;;                 # unknown → safest default
    esac
}

# Read a key's value from a JSON object map. Empty if absent. jq preferred; grep fallback.
map_get() {
    local map="$1" key="$2"
    if has_jq; then
        printf '%s' "$map" | jq -r --arg k "$key" '.[$k] // empty' 2>/dev/null || true
    else
        printf '%s' "$map" | grep -oE "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" 2>/dev/null \
            | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/' | head -1 || true
    fi
}

# Is the map a three-state floor map (has not-started/in-progress/done, lacks the six)?
is_degraded() {
    local map="$1"
    local ns; ns="$(map_get "$map" "not-started")"
    local idesign; idesign="$(map_get "$map" "in-design")"
    # Degraded when a floor key is present and a six-only key (in-design) is absent.
    if [[ -n "$ns" && -z "$idesign" ]]; then echo "true"; else echo "false"; fi
}

SUB="${1:-}"; shift || true
LOGICAL=""; MAP=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --logical) LOGICAL="${2:-}"; shift 2 ;;
        --map) MAP="${2:-}"; shift 2 ;;
        --help|-h) sed -n '2,30p' "$0"; exit 0 ;;
        *) shift ;;
    esac
done

case "$SUB" in
    floor)
        [[ -n "$LOGICAL" ]] || { echo "usage: floor --logical <state>" >&2; exit 2; }
        floor_bucket "$LOGICAL"
        ;;
    degraded)
        [[ -n "$MAP" ]] || { echo "usage: degraded --map <json>" >&2; exit 2; }
        is_degraded "$MAP"
        ;;
    resolve)
        [[ -n "$LOGICAL" && -n "$MAP" ]] || { echo "usage: resolve --logical <state> --map <json>" >&2; exit 2; }
        # Direct hit on a six-state map wins.
        actual="$(map_get "$MAP" "$LOGICAL")"
        if [[ -n "$actual" ]]; then printf '%s\n' "$actual"; exit 0; fi
        # Otherwise collapse to the floor bucket and map that.
        bucket="$(floor_bucket "$LOGICAL")"
        actual="$(map_get "$MAP" "$bucket")"
        if [[ -n "$actual" ]]; then printf '%s\n' "$actual"; exit 0; fi
        # Last resort: emit the floor bucket name itself (caller reports degradation).
        printf '%s\n' "$bucket"
        ;;
    *)
        echo "usage: status-map.sh {resolve|floor|degraded} ..." >&2; exit 2 ;;
esac
