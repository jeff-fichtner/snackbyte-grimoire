#!/usr/bin/env bash
# Read / merge / write a feature's ClickUp sync manifest, and hash derived content.
#
# The manifest is specs/<feature>/.clickup-sync.json — the committed dedup index + target
# locator (see contracts/manifest.schema.md). Pure repo-side logic; no ClickUp, no MCP.
#
# Subcommands:
#   path                         Print the manifest path for the active feature.
#   init                         Create an empty manifest ({schemaVersion, feature}) if absent.
#   get <dotted.key>             Print a value (e.g. `listId`, `statusMapping.done`, `card.id`).
#                                Empty output + exit 0 if unset; missing manifest → empty.
#   set-targets --workspace W --space S --list L [--status-map JSON]
#                                Merge target IDs + status mapping WITHOUT clobbering card/US.
#   set-card --id ID --hash H    Record the feature-card id + content hash.
#   get-card                     Print the recorded card as JSON ({} if none).
#   set-us --us US --id ID --hash H [--depends-on "US1,US2"]
#                                Upsert a user-story subtask entry (merge by `us`).
#   get-us <US>                  Print the recorded US entry as JSON ({} if none).
#   set-lifecycle --key K --value V   Set a lifecycle marker (K: implementStarted|verifyPassed|
#                                closedOut; V: true|false). Gates card states 4–6 (US3).
#   get-lifecycle [K]            Print a marker's value (false if unset), or the whole block.
#   set-provenance-hash --hash H Record card.provenanceHash (US6 dedup) without touching id/hash.
#   hash [--file F | --string S] Stable sha256 of normalized content (no time/random).
#
# --dir <feature dir> overrides the active-feature resolution (used by tests).
# Reads via jq when available; documented no-jq fallback for `get`/`hash`/`path`.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../../../scripts/bash/common.sh"

# Self-sufficiency: older spec-kit cores ship a common.sh without these helpers.
# Define fallbacks only if the host did not provide them, so the extension works on
# any core version (do not assume a specific common.sh).
type has_jq >/dev/null 2>&1 || has_jq() { command -v jq >/dev/null 2>&1; }
type json_escape >/dev/null 2>&1 || json_escape() {
    local s="$1"; s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"; s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

DIR_OVERRIDE=""
SUB=""
ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dir) DIR_OVERRIDE="${2:-}"; shift 2 ;;
        --help|-h) sed -n '2,30p' "$0"; exit 0 ;;
        path|init|get|set-targets|set-card|get-card|set-us|get-us|hash|set-lifecycle|get-lifecycle|set-provenance-hash)
            if [[ -z "$SUB" ]]; then SUB="$1"; else ARGS+=("$1"); fi; shift ;;
        *) ARGS+=("$1"); shift ;;
    esac
done

resolve_dir() {
    if [[ -n "$DIR_OVERRIDE" ]]; then printf '%s' "$DIR_OVERRIDE"; return; fi
    eval "$(get_feature_paths)"
    printf '%s' "${FEATURE_DIR:-}"
}

FEATURE_DIR_R="$(resolve_dir)"
MANIFEST="$FEATURE_DIR_R/.clickup-sync.json"
FEATURE_NAME="$(basename "$FEATURE_DIR_R")"

require_jq() {
    has_jq || { echo "ERROR: '$SUB' requires jq." >&2; exit 3; }
}

# --- hash: stable sha256 over normalized content (whitespace-trimmed, LF-normalized) ---
cmd_hash() {
    local mode="" val=""
    local i=0
    while [[ $i -lt ${#ARGS[@]} ]]; do
        case "${ARGS[$i]}" in
            --file) mode="file"; val="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --string) mode="string"; val="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            *) i=$((i+1)) ;;
        esac
    done
    local content
    if [[ "$mode" == "file" ]]; then content="$(cat "$val")"; else content="$val"; fi
    # Normalize: strip trailing whitespace per line + collapse trailing newlines.
    local norm; norm="$(printf '%s' "$content" | sed 's/[[:space:]]*$//')"
    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s' "$norm" | sha256sum | awk '{print "sha256:"$1}'
    elif command -v shasum >/dev/null 2>&1; then
        printf '%s' "$norm" | shasum -a 256 | awk '{print "sha256:"$1}'
    else
        echo "ERROR: no sha256sum/shasum available." >&2; exit 3
    fi
}

cmd_path() { printf '%s\n' "$MANIFEST"; }

cmd_init() {
    require_jq
    [[ -f "$MANIFEST" ]] && return 0
    jq -n --arg f "$FEATURE_NAME" '{schemaVersion:"1", feature:$f}' > "$MANIFEST"
}

cmd_get() {
    local key="${ARGS[0]:-}"
    [[ -f "$MANIFEST" ]] || { printf ''; return 0; }
    require_jq
    jq -r --arg k "$key" 'getpath($k|split(".")) // "" | if type=="object" or type=="array" then tojson else . end' "$MANIFEST"
}

cmd_set_targets() {
    require_jq
    local w="" s="" l="" smap="{}"
    local i=0
    while [[ $i -lt ${#ARGS[@]} ]]; do
        case "${ARGS[$i]}" in
            --workspace) w="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --space) s="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --list) l="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --status-map) smap="${ARGS[$((i+1))]:-}"; [[ -z "$smap" ]] && smap="{}"; i=$((i+2)) ;;
            *) i=$((i+1)) ;;
        esac
    done
    cmd_init
    local tmp; tmp="$(jq --arg w "$w" --arg s "$s" --arg l "$l" --argjson sm "$smap" \
        '.workspaceId=$w | .spaceId=$s | .listId=$l | .statusMapping=$sm' "$MANIFEST")"
    printf '%s\n' "$tmp" > "$MANIFEST"
}

cmd_set_card() {
    require_jq
    local id="" hash=""
    local i=0
    while [[ $i -lt ${#ARGS[@]} ]]; do
        case "${ARGS[$i]}" in
            --id) id="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --hash) hash="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            *) i=$((i+1)) ;;
        esac
    done
    cmd_init
    # Merge, don't replace: preserve sibling card fields (e.g. provenanceHash) across a status
    # or body change. Replacing the whole object would silently drop the provenance dedup key.
    local tmp; tmp="$(jq --arg id "$id" --arg h "$hash" '.card=((.card // {}) + {id:$id,hash:$h})' "$MANIFEST")"
    printf '%s\n' "$tmp" > "$MANIFEST"
}

cmd_get_card() {
    [[ -f "$MANIFEST" ]] || { echo '{}'; return 0; }
    require_jq
    jq -c '.card // {}' "$MANIFEST"
}

cmd_set_us() {
    require_jq
    local us="" id="" hash="" deps=""
    local i=0
    while [[ $i -lt ${#ARGS[@]} ]]; do
        case "${ARGS[$i]}" in
            --us) us="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --id) id="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --hash) hash="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --depends-on) deps="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            *) i=$((i+1)) ;;
        esac
    done
    cmd_init
    # deps "US1,US2" → JSON array
    local deps_json="[]"
    if [[ -n "$deps" ]]; then
        deps_json="$(printf '%s' "$deps" | jq -Rc 'split(",") | map(select(length>0))')"
    fi
    local tmp; tmp="$(jq --arg us "$us" --arg id "$id" --arg h "$hash" --argjson d "$deps_json" '
        .userStories = ((.userStories // []) | map(select(.us != $us)) + [{us:$us, id:$id, hash:$h, dependsOn:$d}])
    ' "$MANIFEST")"
    printf '%s\n' "$tmp" > "$MANIFEST"
}

cmd_get_us() {
    local us="${ARGS[0]:-}"
    [[ -f "$MANIFEST" ]] || { echo '{}'; return 0; }
    require_jq
    jq -c --arg us "$us" '(.userStories // []) | map(select(.us==$us)) | (.[0] // {})' "$MANIFEST"
}

# --- lifecycle markers (US3 / data-model.md): implementStarted, verifyPassed, closedOut ---
# These are the only imperatively-set fields; the six-state derivation reads them (states 4–6).
cmd_set_lifecycle() {
    require_jq
    local key="" val=""
    local i=0
    while [[ $i -lt ${#ARGS[@]} ]]; do
        case "${ARGS[$i]}" in
            --key) key="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            --value) val="${ARGS[$((i+1))]:-}"; i=$((i+2)) ;;
            *) i=$((i+1)) ;;
        esac
    done
    case "$key" in implementStarted|verifyPassed|closedOut) ;; *)
        echo "ERROR: unknown lifecycle key: $key (implementStarted|verifyPassed|closedOut)" >&2; exit 2 ;;
    esac
    # Normalize value to a JSON boolean.
    local jbool="false"; [[ "$val" == "true" || "$val" == "1" ]] && jbool="true"
    cmd_init
    local tmp; tmp="$(jq --arg k "$key" --argjson v "$jbool" '.lifecycle = ((.lifecycle // {}) + {($k): $v})' "$MANIFEST")"
    printf '%s\n' "$tmp" > "$MANIFEST"
}

cmd_get_lifecycle() {
    local key="${ARGS[0]:-}"
    [[ -f "$MANIFEST" ]] || { [[ -n "$key" ]] && echo "false" || echo '{}'; return 0; }
    require_jq
    if [[ -n "$key" ]]; then
        jq -r --arg k "$key" '(.lifecycle[$k]) // false' "$MANIFEST"
    else
        jq -c '.lifecycle // {}' "$MANIFEST"
    fi
}

# Set the provenance dedup hash on the card (US6) without disturbing card.id/hash.
cmd_set_provenance_hash() {
    require_jq
    local h="${ARGS[0]:-}"
    [[ "$h" == "--hash" ]] && h="${ARGS[1]:-}"
    cmd_init
    local tmp; tmp="$(jq --arg h "$h" '.card = ((.card // {}) + {provenanceHash:$h})' "$MANIFEST")"
    printf '%s\n' "$tmp" > "$MANIFEST"
}

case "$SUB" in
    path) cmd_path ;;
    init) cmd_init ;;
    get) cmd_get ;;
    set-targets) cmd_set_targets ;;
    set-card) cmd_set_card ;;
    get-card) cmd_get_card ;;
    set-us) cmd_set_us ;;
    get-us) cmd_get_us ;;
    set-lifecycle) cmd_set_lifecycle ;;
    get-lifecycle) cmd_get_lifecycle ;;
    set-provenance-hash) cmd_set_provenance_hash ;;
    hash) cmd_hash ;;
    "") echo "ERROR: no subcommand. See --help." >&2; exit 2 ;;
    *) echo "ERROR: unknown subcommand: $SUB" >&2; exit 2 ;;
esac
