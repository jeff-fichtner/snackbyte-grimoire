#!/usr/bin/env bash
# Commit the current feature's Spec Kit artifacts (specs/<feature>/) as a
# pre-implementation checkpoint.
#
# Behavior:
#   - Resolves REPO_ROOT and FEATURE_DIR via the core get_feature_paths().
#   - Stages ONLY the feature's spec directory (specs/<feature>/). Unrelated
#     working-tree changes are left untouched.
#   - If nothing under the spec directory is dirty, exits 0 as a clean no-op
#     (an empty commit is never created).
#   - Otherwise commits with a generated message (override with --message/-m).
#
# Usage:
#   commit-spec-artifacts.sh [--json] [--message "msg"]
#
# Exit status: 0 on success or clean no-op; non-zero on error (not a git repo,
# no feature context, commit failure).
set -euo pipefail

JSON_MODE=false
MESSAGE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --json)
            JSON_MODE=true
            shift
            ;;
        --message|-m)
            MESSAGE="${2:-}"
            shift 2
            ;;
        --help|-h)
            sed -n '2,18p' "$0"
            exit 0
            ;;
        *)
            echo "ERROR: unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# Source core common.sh. SCRIPT_DIR is .specify/extensions/git/scripts/bash,
# so four levels up reaches .specify, then into scripts/bash.
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../../../../scripts/bash/common.sh"

# Emit a result, honoring --json. status is "committed" | "nothing-to-commit" | "error".
emit() {
    local status="$1" message="$2"
    if [[ "$JSON_MODE" == true ]]; then
        if has_jq; then
            jq -nc --arg status "$status" --arg message "$message" \
                '{status: $status, message: $message}'
        else
            printf '{"status":"%s","message":"%s"}\n' "$status" "$message"
        fi
    else
        printf '%s\n' "$message"
    fi
}

# Must be inside a git work tree.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
    emit error "Not a git repository; skipping spec-artifact commit." >&2
    exit 1
fi

# Resolve feature paths from core. eval is safe: values are printf '%q'-quoted.
eval "$(get_feature_paths)"

if [[ -z "${FEATURE_DIR:-}" || ! -d "$FEATURE_DIR" ]]; then
    emit error "Feature directory not found; cannot commit spec artifacts." >&2
    exit 1
fi

# Compute the spec directory path relative to the repo root for git pathspec.
REL_SPEC_DIR="${FEATURE_DIR#"$REPO_ROOT"/}"

# Stage only the feature's spec artifacts.
git -C "$REPO_ROOT" add -- "$REL_SPEC_DIR"

# Nothing staged under the spec dir => clean no-op.
if git -C "$REPO_ROOT" diff --cached --quiet -- "$REL_SPEC_DIR"; then
    emit nothing-to-commit "No spec-artifact changes to commit for $REL_SPEC_DIR."
    exit 0
fi

FEATURE_NAME="$(basename "$FEATURE_DIR")"
if [[ -z "$MESSAGE" ]]; then
    MESSAGE="chore(spec): checkpoint ${FEATURE_NAME} artifacts before implement"
fi

# Commit only the staged spec-dir changes. --only restricts the commit to the
# given pathspec even if other paths happen to be staged. Options (-m) must
# precede the `--` separator; everything after `--` is treated as a pathspec.
git -C "$REPO_ROOT" commit --only -m "$MESSAGE" -- "$REL_SPEC_DIR" >/dev/null

COMMIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
emit committed "Committed ${REL_SPEC_DIR} as ${COMMIT_SHA}: ${MESSAGE}"
