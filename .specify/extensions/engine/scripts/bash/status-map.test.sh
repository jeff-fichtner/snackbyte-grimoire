#!/usr/bin/env bash
# Tests for status-map.sh — logical→actual status mapping + 3-state fallback.
# Run: bash .specify/extensions/engine/scripts/bash/status-map.test.sh
set -uo pipefail

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MAP="$DIR/status-map.sh"
FAIL_F="$(mktemp)"
ok()  { printf '  ok   %s\n' "$1"; }
bad() { echo x >> "$FAIL_F"; printf '  FAIL %s — got %s\n' "$1" "$2"; }

SIX='{"open":"backlog","in-design":"in design","ready":"ready for development","in-development":"in development","in-review":"in review","done":"shipped"}'
THREE='{"not-started":"todo","in-progress":"doing","done":"complete"}'

# ---- full six-state map: 1:1 resolution ----
r="$(bash "$MAP" resolve --logical open --map "$SIX")";            [[ "$r" == "backlog" ]] && ok "six: open→backlog" || bad "six-open" "$r"
r="$(bash "$MAP" resolve --logical in-design --map "$SIX")";       [[ "$r" == "in design" ]] && ok "six: in-design" || bad "six-design" "$r"
r="$(bash "$MAP" resolve --logical ready --map "$SIX")";           [[ "$r" == "ready for development" ]] && ok "six: ready" || bad "six-ready" "$r"
r="$(bash "$MAP" resolve --logical in-development --map "$SIX")";  [[ "$r" == "in development" ]] && ok "six: in-development" || bad "six-dev" "$r"
r="$(bash "$MAP" resolve --logical in-review --map "$SIX")";       [[ "$r" == "in review" ]] && ok "six: in-review" || bad "six-review" "$r"
r="$(bash "$MAP" resolve --logical done --map "$SIX")";            [[ "$r" == "shipped" ]] && ok "six: done→shipped" || bad "six-done" "$r"

# ---- three-state (degraded) map: six logical states collapse onto three ----
r="$(bash "$MAP" resolve --logical open --map "$THREE")";           [[ "$r" == "todo" ]] && ok "3: open→todo" || bad "3-open" "$r"
r="$(bash "$MAP" resolve --logical in-design --map "$THREE")";      [[ "$r" == "todo" ]] && ok "3: in-design→todo" || bad "3-design" "$r"
r="$(bash "$MAP" resolve --logical ready --map "$THREE")";          [[ "$r" == "todo" ]] && ok "3: ready→todo" || bad "3-ready" "$r"
r="$(bash "$MAP" resolve --logical in-development --map "$THREE")"; [[ "$r" == "doing" ]] && ok "3: in-development→doing" || bad "3-dev" "$r"
r="$(bash "$MAP" resolve --logical in-review --map "$THREE")";      [[ "$r" == "doing" ]] && ok "3: in-review→doing" || bad "3-review" "$r"
r="$(bash "$MAP" resolve --logical done --map "$THREE")";           [[ "$r" == "complete" ]] && ok "3: done→complete" || bad "3-done" "$r"

# ---- floor buckets ----
r="$(bash "$MAP" floor --logical open)";           [[ "$r" == "not-started" ]] && ok "floor open" || bad "floor-open" "$r"
r="$(bash "$MAP" floor --logical in-development)";  [[ "$r" == "in-progress" ]] && ok "floor in-development" || bad "floor-dev" "$r"
r="$(bash "$MAP" floor --logical done)";            [[ "$r" == "done" ]] && ok "floor done" || bad "floor-done" "$r"

# ---- degraded detection ----
r="$(bash "$MAP" degraded --map "$SIX")";    [[ "$r" == "false" ]] && ok "six map not degraded" || bad "deg-six" "$r"
r="$(bash "$MAP" degraded --map "$THREE")";  [[ "$r" == "true" ]] && ok "three map degraded" || bad "deg-three" "$r"

# ---- edge: unknown logical state → safe not-started bucket, mapped through the map ----
r="$(bash "$MAP" resolve --logical bogus --map "$THREE")"; [[ "$r" == "todo" ]] && ok "unknown→not-started bucket" || bad "unknown" "$r"

# ---- edge: bad usage exits non-zero ----
if bash "$MAP" resolve --logical open >/dev/null 2>&1; then bad "missing --map should fail" "exit0"; else ok "missing --map → non-zero exit"; fi

# ---- no-jq fallback (Constitution: the documented fallback must keep working) ----
# CLICKUP_NO_JQ=1 forces the grep branch even on a machine that has jq installed.
r="$(CLICKUP_NO_JQ=1 bash "$MAP" resolve --logical in-review --map "$SIX")"
[[ "$r" == "in review" ]] && ok "no-jq: six-state resolve via grep fallback" || bad "nojq-six" "$r"
r="$(CLICKUP_NO_JQ=1 bash "$MAP" resolve --logical done --map "$SIX")"
[[ "$r" == "shipped" ]] && ok "no-jq: done resolve via grep fallback" || bad "nojq-done" "$r"
r="$(CLICKUP_NO_JQ=1 bash "$MAP" resolve --logical in-design --map "$THREE")"
[[ "$r" == "todo" ]] && ok "no-jq: 3-state collapse via grep fallback" || bad "nojq-three" "$r"
r="$(CLICKUP_NO_JQ=1 bash "$MAP" degraded --map "$THREE")"
[[ "$r" == "true" ]] && ok "no-jq: degraded detection via grep fallback" || bad "nojq-deg" "$r"

n="$(wc -l < "$FAIL_F" | tr -d "[:space:]")"; n="${n:-0}"
echo ""
if [[ "$n" -eq 0 ]]; then echo "status-map: ALL PASS"; else echo "status-map: $n FAIL"; exit 1; fi
