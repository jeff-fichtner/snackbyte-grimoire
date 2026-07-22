#!/usr/bin/env bash
# Tests for derive-status.sh — six-state CARD lifecycle + three-state SUBTASK status.
# Run: bash .specify/extensions/engine/scripts/bash/derive-status.test.sh
set -uo pipefail

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DERIVE="$DIR/derive-status.sh"
FAIL_F="$(mktemp)"
ok()  { printf '  ok   %s\n' "$1"; }
bad() { echo x >> "$FAIL_F"; printf '  FAIL %s — got %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# ---- CARD mode: the six-state lifecycle ----

# 1. provisioned, no spec.md → open
d1="$TMP/f1"; mkdir -p "$d1"
r="$(bash "$DERIVE" --dir "$d1" --card)"; [[ "$r" == "open" ]] && ok "no spec → open" || bad "open" "$r"

# 2. spec present, no tasks → in-design (default mode is --card)
d2="$TMP/f2"; mkdir -p "$d2"; : > "$d2/spec.md"; : > "$d2/plan.md"
r="$(bash "$DERIVE" --dir "$d2")"; [[ "$r" == "in-design" ]] && ok "spec, no tasks → in-design" || bad "in-design" "$r"

# 3. spec + tasks present (no implement marker) → ready
d3="$TMP/f3"; mkdir -p "$d3"; : > "$d3/spec.md"; : > "$d3/plan.md"
printf -- '- [ ] T001 a\n- [ ] T002 b\n' > "$d3/tasks.md"
r="$(bash "$DERIVE" --dir "$d3")"; [[ "$r" == "ready" ]] && ok "tasks present, no marker → ready" || bad "ready" "$r"

# 4. implementStarted marker → in-development (even though artifacts look like 'ready')
d4="$TMP/f4"; mkdir -p "$d4"; : > "$d4/spec.md"; : > "$d4/plan.md"
printf -- '- [ ] T001 a\n' > "$d4/tasks.md"
printf '{"schemaVersion":"1","lifecycle":{"implementStarted":true}}' > "$d4/.clickup-sync.json"
r="$(bash "$DERIVE" --dir "$d4")"; [[ "$r" == "in-development" ]] && ok "implementStarted → in-development" || bad "in-development" "$r"

# 5. verifyPassed marker → in-review (wins over artifact state)
d5="$TMP/f5"; mkdir -p "$d5"; : > "$d5/spec.md"; : > "$d5/plan.md"; printf -- '- [x] T001 a\n' > "$d5/tasks.md"
printf '{"schemaVersion":"1","lifecycle":{"implementStarted":true,"verifyPassed":true}}' > "$d5/.clickup-sync.json"
r="$(bash "$DERIVE" --dir "$d5")"; [[ "$r" == "in-review" ]] && ok "verifyPassed → in-review" || bad "in-review" "$r"

# 6. closedOut marker → done (wins over everything)
d6="$TMP/f6"; mkdir -p "$d6"; : > "$d6/spec.md"; : > "$d6/plan.md"; printf -- '- [x] T001 a\n' > "$d6/tasks.md"
printf '{"schemaVersion":"1","lifecycle":{"verifyPassed":true,"closedOut":true}}' > "$d6/.clickup-sync.json"
r="$(bash "$DERIVE" --dir "$d6")"; [[ "$r" == "done" ]] && ok "closedOut → done" || bad "done" "$r"

# 7. idempotence: re-deriving states 1–3 from the same artifacts yields the same state
r1="$(bash "$DERIVE" --dir "$d3")"; r2="$(bash "$DERIVE" --dir "$d3")"
[[ "$r1" == "$r2" && "$r1" == "ready" ]] && ok "ready is idempotent" || bad "idempotent" "$r1/$r2"

# 8. no-jq fallback: the marker read must still work without jq (Constitution: documented fallback).
#    CLICKUP_NO_JQ=1 forces the grep branch even on a machine that has jq.
r="$(CLICKUP_NO_JQ=1 bash "$DERIVE" --dir "$d5")"
[[ "$r" == "in-review" ]] && ok "no-jq: verifyPassed marker read via grep fallback" || bad "nojq-marker" "$r"
r="$(CLICKUP_NO_JQ=1 bash "$DERIVE" --dir "$d6")"
[[ "$r" == "done" ]] && ok "no-jq: closedOut marker read via grep fallback" || bad "nojq-closed" "$r"
r="$(CLICKUP_NO_JQ=1 bash "$DERIVE" --dir "$d3")"
[[ "$r" == "ready" ]] && ok "no-jq: artifact-derived state unaffected" || bad "nojq-ready" "$r"

# ---- SUBTASK mode (--us): three states, unchanged from 001 ----
if command -v jq >/dev/null 2>&1; then
  d7="$TMP/f7"; mkdir -p "$d7"; : > "$d7/spec.md"; : > "$d7/plan.md"
  cat > "$d7/tasks.md" <<'EOF'
## Phase 3: User Story 1 (P1)
- [X] T001 [US1] done one
- [x] T002 [US1] done two
## Phase 4: User Story 2 (P2)
- [X] T003 [US2] done
- [ ] T004 [US2] not yet
## Phase 5: User Story 3 (P3)
- [ ] T005 [US3] none done
EOF
  r="$(bash "$DERIVE" --dir "$d7" --us US1)"; [[ "$r" == "done" ]] && ok "--us US1 all-done → done" || bad "us1" "$r"
  r="$(bash "$DERIVE" --dir "$d7" --us US2)"; [[ "$r" == "in-progress" ]] && ok "--us US2 partial → in-progress" || bad "us2" "$r"
  r="$(bash "$DERIVE" --dir "$d7" --us US3)"; [[ "$r" == "not-started" ]] && ok "--us US3 none-done → not-started" || bad "us3" "$r"
  r="$(bash "$DERIVE" --dir "$d7" --us US9)"; [[ "$r" == "not-started" ]] && ok "--us unknown story → not-started" || bad "us9" "$r"
  # subtask never emits a card-only state
  case "$(bash "$DERIVE" --dir "$d7" --us US1)" in open|in-design|ready|in-review) bad "us leaked card state" "$r" ;; *) ok "subtask stays three-state" ;; esac
else
  echo "  skip --us tests — jq not installed"
fi

n="$(wc -l < "$FAIL_F" | tr -d "[:space:]")"; n="${n:-0}"
echo ""
if [[ "$n" -eq 0 ]]; then echo "derive-status: ALL PASS"; else echo "derive-status: $n FAIL"; exit 1; fi
