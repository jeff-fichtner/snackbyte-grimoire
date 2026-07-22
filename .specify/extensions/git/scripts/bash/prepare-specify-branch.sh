#!/usr/bin/env bash
# Prepare a clean git working area and the feature branch before /speckit-specify.
#
# This script is the MECHANICAL half of the before_specify hook. The interactive
# half (deciding what to do with uncommitted changes) is driven by the
# speckit-git-specify-branch skill, which calls the subcommands here.
#
# Subcommands:
#   status                 Report git working-tree state as JSON. Use this first.
#                          Fields: in_git, clean, current_branch, ahead_of_remote,
#                          dirty_count, dirty (porcelain lines, truncated to 200),
#                          on_default_branch, default_branch.
#   commit -m "msg"        Stage all changes (git add -A) and commit with msg.
#   stash [label]          Stash all changes (including untracked) with optional label.
#   create-branch NAME     Create-and-switch to NAME (or switch to it if it already
#                          exists). NAME is validated. Refuses to switch when the
#                          working tree is dirty (commit/stash first), to avoid
#                          carrying changes onto the new branch unexpectedly.
#
# All subcommands emit JSON when --json is passed (recommended for the skill).
# Exit status: 0 on success, non-zero on error.
set -euo pipefail

JSON_MODE=false
MESSAGE=""
SUBCMD=""
POSITIONAL=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --json) JSON_MODE=true; shift ;;
        -m|--message) MESSAGE="${2:-}"; shift 2 ;;
        --help|-h) sed -n '2,22p' "$0"; exit 0 ;;
        status|commit|stash|create-branch)
            if [[ -z "$SUBCMD" ]]; then SUBCMD="$1"; else POSITIONAL+=("$1"); fi
            shift ;;
        *) POSITIONAL+=("$1"); shift ;;
    esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# SCRIPT_DIR is .specify/extensions/git/scripts/bash; four levels
# up reaches .specify, then into scripts/bash for core helpers.
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../../../scripts/bash/common.sh"

if [[ -z "$SUBCMD" ]]; then
    echo "ERROR: no subcommand. One of: status, commit, stash, create-branch." >&2
    exit 2
fi

# Must be inside a git work tree for everything except a graceful status report.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    if [[ "$SUBCMD" == "status" ]]; then
        if [[ "$JSON_MODE" == true ]]; then
            printf '{"in_git":false,"clean":false}\n'
        else
            echo "in_git=false"
        fi
        exit 0
    fi
    echo "ERROR: not a git repository." >&2
    exit 1
fi

REPO_ROOT="$(get_repo_root)" || exit 1

# Best-effort detection of the repository's default branch (main/master/…).
detect_default_branch() {
    local d
    d="$(git -C "$REPO_ROOT" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
    d="${d#origin/}"
    if [[ -z "$d" ]]; then
        for cand in main master; do
            if git -C "$REPO_ROOT" show-ref --quiet --verify "refs/heads/$cand"; then d="$cand"; break; fi
        done
    fi
    printf '%s' "$d"
}

json_str() {
    # Minimal JSON string escaper for fallback when jq is unavailable.
    local s="$1"
    s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"; s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

cmd_status() {
    local current default dirty_lines dirty_count clean on_default ahead
    current="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
    default="$(detect_default_branch)"
    dirty_lines="$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null || true)"
    if [[ -z "$dirty_lines" ]]; then dirty_count=0; clean=true; else dirty_count="$(printf '%s\n' "$dirty_lines" | grep -c .)"; clean=false; fi
    [[ "$current" == "$default" && -n "$default" ]] && on_default=true || on_default=false
    # Commits on current branch not on origin (best-effort; 0 if no upstream).
    ahead="$(git -C "$REPO_ROOT" rev-list --count '@{upstream}..HEAD' 2>/dev/null || echo 0)"

    if [[ "$JSON_MODE" == true ]]; then
        # `grep .` exits 1 on a clean tree (no matches); `|| true` keeps set -e happy.
        local truncated; truncated="$(printf '%s\n' "$dirty_lines" | grep . | head -200 || true)"
        if has_jq; then
            jq -nc \
                --argjson in_git true \
                --argjson clean "$clean" \
                --arg current_branch "$current" \
                --arg default_branch "$default" \
                --argjson on_default_branch "$on_default" \
                --argjson dirty_count "$dirty_count" \
                --argjson ahead_of_remote "$ahead" \
                --arg dirty "$truncated" \
                '{in_git:true,clean:$clean,current_branch:$current_branch,default_branch:$default_branch,on_default_branch:$on_default_branch,dirty_count:$dirty_count,ahead_of_remote:$ahead_of_remote,dirty:($dirty|split("\n")|map(select(length>0)))}'
        else
            printf '{"in_git":true,"clean":%s,"current_branch":"%s","default_branch":"%s","on_default_branch":%s,"dirty_count":%s,"ahead_of_remote":%s}\n' \
                "$clean" "$(json_str "$current")" "$(json_str "$default")" "$on_default" "$dirty_count" "$ahead"
        fi
    else
        echo "in_git=true"; echo "clean=$clean"; echo "current_branch=$current"
        echo "default_branch=$default"; echo "on_default_branch=$on_default"
        echo "dirty_count=$dirty_count"; echo "ahead_of_remote=$ahead"
        [[ -n "$dirty_lines" ]] && { echo "--- dirty ---"; printf '%s\n' "$dirty_lines"; }
    fi
}

emit_result() {
    local status="$1" message="$2" extra_key="${3:-}" extra_val="${4:-}"
    if [[ "$JSON_MODE" == true ]]; then
        if has_jq; then
            if [[ -n "$extra_key" ]]; then
                jq -nc --arg status "$status" --arg message "$message" --arg ek "$extra_key" --arg ev "$extra_val" \
                    '{status:$status,message:$message} + {($ek):$ev}'
            else
                jq -nc --arg status "$status" --arg message "$message" '{status:$status,message:$message}'
            fi
        else
            if [[ -n "$extra_key" ]]; then
                printf '{"status":"%s","message":"%s","%s":"%s"}\n' "$(json_str "$status")" "$(json_str "$message")" "$(json_str "$extra_key")" "$(json_str "$extra_val")"
            else
                printf '{"status":"%s","message":"%s"}\n' "$(json_str "$status")" "$(json_str "$message")"
            fi
        fi
    else
        printf '%s\n' "$message"
    fi
}

cmd_commit() {
    [[ -n "$MESSAGE" ]] || { echo "ERROR: commit requires -m \"message\"." >&2; exit 2; }
    if git -C "$REPO_ROOT" diff --quiet && git -C "$REPO_ROOT" diff --cached --quiet && [[ -z "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)" ]]; then
        emit_result nothing-to-commit "Working tree already clean; nothing to commit."
        return 0
    fi
    git -C "$REPO_ROOT" add -A
    git -C "$REPO_ROOT" commit -m "$MESSAGE" >/dev/null
    emit_result committed "Committed all changes as $(git -C "$REPO_ROOT" rev-parse --short HEAD): $MESSAGE" sha "$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
}

cmd_stash() {
    local label="${POSITIONAL[0]:-spec-prep $(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)}"
    if git -C "$REPO_ROOT" diff --quiet && git -C "$REPO_ROOT" diff --cached --quiet && [[ -z "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)" ]]; then
        emit_result nothing-to-stash "Working tree already clean; nothing to stash."
        return 0
    fi
    git -C "$REPO_ROOT" stash push --include-untracked -m "$label" >/dev/null
    emit_result stashed "Stashed all changes (label: $label). Restore later with: git stash pop"
}

# Validate a branch name: git's own check plus a guard against empty/space.
valid_branch_name() {
    local n="$1"
    [[ -n "$n" ]] || return 1
    [[ "$n" != *' '* ]] || return 1
    git check-ref-format --branch "$n" >/dev/null 2>&1
}

cmd_create_branch() {
    local name="${POSITIONAL[0]:-}"
    valid_branch_name "$name" || { echo "ERROR: invalid branch name: '${name}'." >&2; exit 2; }

    # Refuse to switch with a dirty tree — changes would follow onto the new branch.
    if ! { git -C "$REPO_ROOT" diff --quiet && git -C "$REPO_ROOT" diff --cached --quiet; } || [[ -n "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)" ]]; then
        emit_result dirty "Refusing to switch branches: working tree has uncommitted changes. Commit or stash first." branch "$name"
        exit 1
    fi

    if git -C "$REPO_ROOT" show-ref --quiet --verify "refs/heads/$name"; then
        if [[ "$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)" == "$name" ]]; then
            emit_result already-on "Already on branch '$name'." branch "$name"
        else
            git -C "$REPO_ROOT" switch "$name" >/dev/null 2>&1 || git -C "$REPO_ROOT" checkout "$name" >/dev/null
            emit_result switched "Switched to existing branch '$name'." branch "$name"
        fi
    else
        git -C "$REPO_ROOT" switch -c "$name" >/dev/null 2>&1 || git -C "$REPO_ROOT" checkout -b "$name" >/dev/null
        emit_result created "Created and switched to new branch '$name'." branch "$name"
    fi
}

case "$SUBCMD" in
    status) cmd_status ;;
    commit) cmd_commit ;;
    stash) cmd_stash ;;
    create-branch) cmd_create_branch ;;
    *) echo "ERROR: unknown subcommand: $SUBCMD" >&2; exit 2 ;;
esac
