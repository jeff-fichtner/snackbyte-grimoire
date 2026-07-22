#!/usr/bin/env bash
# Tests for clickup-derive-status.sh — repo state → not-started|in-progress|done.
# Run: bash .specify/extensions/clickup-sync/scripts/bash/clickup-derive-status.test.sh
set -uo pipefail

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DERIVE="$DIR/clickup-derive-status.sh"
FAIL_F="$(mktemp)"
ok()  { printf '  ok   %s\n' "$1"; }
bad() { echo x >> "$FAIL_F"; printf '  FAIL %s — got %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# 1. spec only, no plan → not-started
d1="$TMP/f1"; mkdir -p "$d1"; : > "$d1/spec.md"
r="$(bash "$DERIVE" --dir "$d1")"; [[ "$r" == "not-started" ]] && ok "spec-only → not-started" || bad "spec-only" "$r"

# 2. plan present, no tasks.md → in-progress
d2="$TMP/f2"; mkdir -p "$d2"; : > "$d2/spec.md"; : > "$d2/plan.md"
r="$(bash "$DERIVE" --dir "$d2")"; [[ "$r" == "in-progress" ]] && ok "plan, no tasks → in-progress" || bad "plan-no-tasks" "$r"

# 3. plan + tasks with 0 checked → in-progress
d3="$TMP/f3"; mkdir -p "$d3"; : > "$d3/plan.md"
printf -- '- [ ] T001 a\n- [ ] T002 b\n' > "$d3/tasks.md"
r="$(bash "$DERIVE" --dir "$d3")"; [[ "$r" == "in-progress" ]] && ok "tasks 0-checked → in-progress" || bad "zero-checked" "$r"

# 4. plan + tasks some checked → in-progress
d4="$TMP/f4"; mkdir -p "$d4"; : > "$d4/plan.md"
printf -- '- [X] T001 a\n- [ ] T002 b\n' > "$d4/tasks.md"
r="$(bash "$DERIVE" --dir "$d4")"; [[ "$r" == "in-progress" ]] && ok "some-checked → in-progress" || bad "some-checked" "$r"

# 5. plan + tasks all checked → done
d5="$TMP/f5"; mkdir -p "$d5"; : > "$d5/plan.md"
printf -- '- [X] T001 a\n- [x] T002 b\n' > "$d5/tasks.md"
r="$(bash "$DERIVE" --dir "$d5")"; [[ "$r" == "done" ]] && ok "all-checked → done" || bad "all-checked" "$r"

# 6. Per-user-story status (--us, FR-009a): a feature with mixed per-US completion.
if command -v jq >/dev/null 2>&1; then
  d6="$TMP/f6"; mkdir -p "$d6"; : > "$d6/plan.md"
  cat > "$d6/tasks.md" <<'EOF'
## Phase 3: User Story 1 (P1)
- [X] T001 [US1] done one
- [x] T002 [US1] done two
## Phase 4: User Story 2 (P2)
- [X] T003 [US2] done
- [ ] T004 [US2] not yet
## Phase 5: User Story 3 (P3)
- [ ] T005 [US3] none done
EOF
  r="$(bash "$DERIVE" --dir "$d6" --us US1)"; [[ "$r" == "done" ]] && ok "--us US1 all-done → done" || bad "us1" "$r"
  r="$(bash "$DERIVE" --dir "$d6" --us US2)"; [[ "$r" == "in-progress" ]] && ok "--us US2 partial → in-progress" || bad "us2" "$r"
  r="$(bash "$DERIVE" --dir "$d6" --us US3)"; [[ "$r" == "not-started" ]] && ok "--us US3 none-done → not-started" || bad "us3" "$r"
  r="$(bash "$DERIVE" --dir "$d6" --us US9)"; [[ "$r" == "not-started" ]] && ok "--us unknown story → not-started" || bad "us9" "$r"
else
  echo "  skip --us tests — jq not installed"
fi

n="$(wc -l < "$FAIL_F" | tr -d "[:space:]")"; n="${n:-0}"
echo ""
if [[ "$n" -eq 0 ]]; then echo "derive-status: ALL PASS"; else echo "derive-status: $n FAIL"; exit 1; fi
