#!/usr/bin/env bash
# Tests for parse-tasks.sh — tasks.md → US-grouped JSON.
# Run: bash .specify/extensions/engine/scripts/bash/parse-tasks.test.sh
set -uo pipefail

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PARSE="$DIR/parse-tasks.sh"
FAIL_F="$(mktemp)"
ok()  { printf '  ok   %s\n' "$1"; }
bad() { echo x >> "$FAIL_F"; printf '  FAIL %s — %s\n' "$1" "$2"; }

have_jq() { command -v jq >/dev/null 2>&1; }

# jget <json> <filter> — read a value with jq if present, else crude grep fallback for the tests.
jget() { printf '%s' "$1" | jq -r "$2"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# --- Fixture 1: mixed checked/unchecked, explicit [US#] and unattributed ---
cat > "$TMP/tasks.md" <<'EOF'
# Tasks

## Phase 1: Setup
- [X] T001 Setup one
- [ ] T002 [P] Setup two

## Phase 3: User Story 1 - Something (Priority: P1)
- [X] T003 [US1] Do a thing
- [ ] T004 [US1] Do another

## Phase 4: User Story 2 - Else (Priority: P2)
- [ ] T005 [US2] Second story task
EOF

out="$(bash "$PARSE" --file "$TMP/tasks.md")"

if have_jq; then
    # unattributed group has T001 (done) + T002 (not done)
    [[ "$(jget "$out" '.groups[]|select(.us=="unattributed").items|length')" == "2" ]] \
        && ok "T1 unattributed group has 2 items" || bad "T1" "unattributed count wrong"
    [[ "$(jget "$out" '.groups[]|select(.us=="unattributed").items[0].done')" == "true" ]] \
        && ok "T1 T001 done=true" || bad "T1" "T001 done flag wrong"
    [[ "$(jget "$out" '.groups[]|select(.us=="US1").items|length')" == "2" ]] \
        && ok "T1 US1 group has 2 items" || bad "T1" "US1 count wrong"
    [[ "$(jget "$out" '.groups[]|select(.us=="US2").items[0].id')" == "T005" ]] \
        && ok "T1 US2 has T005" || bad "T1" "US2 item wrong"
    [[ "$(jget "$out" '.feature')" == "$(basename "$TMP")" ]] \
        && ok "T1 feature name from dir" || bad "T1" "feature name wrong"
else
    printf '%s' "$out" | grep -q '"us":"US1"' && ok "T1 (no-jq) US1 present" || bad "T1" "US1 missing"
fi

# --- Fixture 2: empty tasks.md → empty groups, no crash ---
: > "$TMP/empty.md"
out2="$(bash "$PARSE" --file "$TMP/empty.md")"
if have_jq; then
    [[ "$(jget "$out2" '.groups|length')" == "0" ]] && ok "T2 empty file → 0 groups" || bad "T2" "empty not empty"
else
    printf '%s' "$out2" | grep -q '"groups":\[\]' && ok "T2 (no-jq) empty groups" || bad "T2" "empty groups missing"
fi

# --- Fixture 3: malformed (no recognizable task lines) → empty groups ---
cat > "$TMP/malformed.md" <<'EOF'
# Not tasks
Just prose. - [ ] not-a-task (no T-id)
- [ ] TXYZ bad id
EOF
out3="$(bash "$PARSE" --file "$TMP/malformed.md")"
if have_jq; then
    [[ "$(jget "$out3" '.groups|length')" == "0" ]] && ok "T3 malformed → 0 groups" || bad "T3" "malformed produced groups"
else
    printf '%s' "$out3" | grep -q '"groups":\[\]' && ok "T3 (no-jq) malformed empty" || bad "T3" "malformed not empty"
fi

# --- Fixture 4: missing file → exit 2 ---
if bash "$PARSE" --file "$TMP/nope.md" >/dev/null 2>&1; then bad "T4" "missing file did not error"; else ok "T4 missing file → non-zero exit"; fi

# --- Fixture 5: a non-US phase AFTER a US phase clears the fallback (regression) ---
# The phase_us fallback used to be sticky, so unlabelled Polish tasks trailing a
# "User Story N" phase were silently attributed to that story.
cat > "$TMP/trailing.md" <<'EOF'
# Tasks

## Phase 1: User Story 1 - First (Priority: P1)
- [ ] T001 Story task, no explicit marker

## Phase 2: Polish
- [ ] T002 Polish task, belongs to nobody
EOF
out5="$(bash "$PARSE" --file "$TMP/trailing.md")"
if have_jq; then
    [[ "$(jget "$out5" '.groups[]|select(.us=="US1").items|map(.id)|join(",")')" == "T001" ]] \
        && ok "T5 US1 keeps only its own task" || bad "T5" "US1 absorbed a later-phase task"
    [[ "$(jget "$out5" '.groups[]|select(.us=="unattributed").items[0].id')" == "T002" ]] \
        && ok "T5 trailing Polish task is unattributed" || bad "T5" "T002 not unattributed"
else
    printf '%s' "$out5" | grep -q '"us":"unattributed"' && ok "T5 (no-jq) unattributed present" || bad "T5" "unattributed missing"
fi

n="$(wc -l < "$FAIL_F" | tr -d "[:space:]")"; n="${n:-0}"
echo ""
if [[ "$n" -eq 0 ]]; then echo "parse-tasks: ALL PASS"; else echo "parse-tasks: $n FAIL"; exit 1; fi
