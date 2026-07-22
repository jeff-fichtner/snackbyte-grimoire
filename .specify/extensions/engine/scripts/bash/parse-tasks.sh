#!/usr/bin/env bash
# Parse a feature's tasks.md into user-story-grouped task lines with done-state.
#
# Pure repo-side logic — no ClickUp, no MCP. Emits JSON the sync command consumes to
# build each US-subtask's markdown checkbox list.
#
# A task line looks like:  - [ ] T001 [P] [US1] Description…   (checkbox, ID, opt [P]/[US#])
# Grouping: a line's user story is its [US#] marker; lines with none (e.g. Setup/Polish)
# go in the "unattributed" group. Phase headings are used as a fallback grouping hint only
# when a line carries no [US#] marker but sits under a "User Story N" phase heading.
#
# Usage:  parse-tasks.sh [--file <tasks.md>]
#   --file  path to tasks.md (default: <active feature dir>/tasks.md)
#
# Output (JSON):
#   {
#     "feature": "001-clickup-sync",
#     "groups": [
#       { "us": "US1", "items": [ {"id":"T001","done":false,"text":"T001 Description…"}, … ] },
#       { "us": "unattributed", "items": [ … ] }
#     ]
#   }
# Exit 0 always when the file is readable (empty groups for empty/malformed input);
# exit 2 if the file cannot be found.
set -euo pipefail

FILE=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --file) FILE="${2:-}"; shift 2 ;;
        --help|-h) sed -n '2,26p' "$0"; exit 0 ;;
        *) shift ;;
    esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../../../scripts/bash/common.sh"

# Self-sufficiency: define has_jq only if the host common.sh didn't (older cores lack it).
type has_jq >/dev/null 2>&1 || has_jq() { command -v jq >/dev/null 2>&1; }

if [[ -z "$FILE" ]]; then
    eval "$(get_feature_paths)"
    FILE="${FEATURE_DIR:-}/tasks.md"
fi

if [[ ! -f "$FILE" ]]; then
    echo "ERROR: tasks file not found: $FILE" >&2
    exit 2
fi

FEATURE_NAME="$(basename "$(dirname "$FILE")")"

# Parse into "US<TAB>id<TAB>done<TAB>text" rows. Then assemble JSON.
# - A task line: optional leading spaces, "- [ ]" or "- [x]/[X]", then "T" + 3 digits.
# - done = the box is x/X.
# - us   = the [US#] marker on the line, else the nearest "User Story N" phase heading, else "unattributed".
rows="$(awk '
    # Track the current phase-heading user story as a fallback.
    /^##[[:space:]]+Phase[[:space:]].*User Story[[:space:]]+[0-9]+/ {
        if (match($0, /User Story[[:space:]]+[0-9]+/)) {
            n = substr($0, RSTART, RLENGTH); gsub(/[^0-9]/, "", n); phase_us = "US" n
        }
        next
    }
    # Any OTHER phase heading clears the fallback. Without this, phase_us is
    # sticky: once a "Phase N: User Story N" heading is seen it applies for the
    # rest of the file, so unlabelled Setup/Polish tasks in later phases are
    # silently attributed to the last user story.
    /^##[[:space:]]+Phase[[:space:]]/ { phase_us = ""; next }
    # A task checkbox line.
    /^[[:space:]]*-[[:space:]]*\[[ xX]\][[:space:]]*T[0-9][0-9][0-9]/ {
        line = $0
        # done?
        done = (line ~ /\[[xX]\]/) ? "true" : "false"
        # id
        match(line, /T[0-9][0-9][0-9]/); id = substr(line, RSTART, RLENGTH)
        # explicit [US#] on the line?
        us = ""
        if (match(line, /\[US[0-9]+\]/)) { us = substr(line, RSTART+1, RLENGTH-2) }
        else if (phase_us != "") { us = phase_us }
        else { us = "unattributed" }
        # text = from the id onward, with [P]/[US#] markers stripped for readability
        txt = substr(line, index(line, id))
        gsub(/\[P\][[:space:]]*/, "", txt)
        gsub(/\[US[0-9]+\][[:space:]]*/, "", txt)
        sub(/[[:space:]]+$/, "", txt)
        printf "%s\t%s\t%s\t%s\n", us, id, done, txt
    }
' "$FILE")"

# Assemble JSON. Preserve first-seen group order.
if has_jq; then
    if [[ -z "$rows" ]]; then
        jq -nc --arg feature "$FEATURE_NAME" '{feature:$feature, groups:[]}'
    else
        printf '%s\n' "$rows" | jq -Rn --arg feature "$FEATURE_NAME" '
            [inputs | select(length>0) | split("\t") | {us:.[0], id:.[1], done:(.[2]=="true"), text:.[3]}]
            | group_by(.us)
            # group_by sorts; re-derive first-seen order from the input list
            as $g
            | (reduce .[] as $x ([]; if any(.==$x.us) then . else . + [$x.us] end)) as $order
            | {feature:$feature,
               groups: ($order | map(. as $u | {us:$u, items: ($g[] | select(.[0].us==$u) | map({id,done,text}))}))}
        ' 2>/dev/null || {
            # jq pipeline above is order-preserving but defensive; fall through to simple grouping.
            printf '%s\n' "$rows" | jq -Rn --arg feature "$FEATURE_NAME" '
                [inputs | select(length>0) | split("\t") | {us:.[0], id:.[1], done:(.[2]=="true"), text:.[3]}]
                | {feature:$feature, groups: (group_by(.us) | map({us:.[0].us, items: map({id,done,text})}))}'
        }
    fi
else
    # No-jq fallback: hand-emit JSON. Simpler grouping (stable by first appearance).
    _json_escape() { local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }
    printf '{"feature":"%s","groups":[' "$(_json_escape "$FEATURE_NAME")"
    order="$(printf '%s\n' "$rows" | awk -F'\t' 'NF{if(!seen[$1]++)print $1}')"
    first_group=1
    while IFS= read -r us; do
        [[ -z "$us" ]] && continue
        [[ $first_group -eq 0 ]] && printf ','
        first_group=0
        printf '{"us":"%s","items":[' "$(_json_escape "$us")"
        first_item=1
        while IFS=$'\t' read -r g id done text; do
            [[ "$g" == "$us" ]] || continue
            [[ $first_item -eq 0 ]] && printf ','
            first_item=0
            printf '{"id":"%s","done":%s,"text":"%s"}' "$(_json_escape "$id")" "$done" "$(_json_escape "$text")"
        done <<< "$rows"
        printf ']}'
    done <<< "$order"
    printf ']}\n'
fi
