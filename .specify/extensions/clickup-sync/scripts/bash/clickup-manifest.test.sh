#!/usr/bin/env bash
# Tests for clickup-manifest.sh — manifest read/merge/write + stable hashing.
# Run: bash .specify/extensions/clickup-sync/scripts/bash/clickup-manifest.test.sh
set -uo pipefail

DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
M="$DIR/clickup-manifest.sh"
FAIL_F="$(mktemp)"
ok()  { printf '  ok   %s\n' "$1"; }
bad() { echo x >> "$FAIL_F"; printf '  FAIL %s — %s\n' "$1" "$2"; }
have_jq() { command -v jq >/dev/null 2>&1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# --- hash stability + normalization (no jq needed) ---
h1="$(bash "$M" hash --string "hello world")"
h2="$(bash "$M" hash --string "hello world")"
[[ "$h1" == "$h2" && -n "$h1" ]] && ok "hash stable for identical input" || bad "hash" "unstable: $h1 / $h2"
[[ "$h1" == sha256:* ]] && ok "hash is sha256-prefixed" || bad "hash" "bad prefix: $h1"
h3="$(bash "$M" hash --string "hello world   ")"   # trailing ws normalized away
[[ "$h1" == "$h3" ]] && ok "hash normalizes trailing whitespace" || bad "hash" "ws not normalized"
h4="$(bash "$M" hash --string "different")"
[[ "$h1" != "$h4" ]] && ok "hash differs for different input" || bad "hash" "collision"

# The remaining tests need jq (documented dependency for read/write). Skip loudly if absent.
if ! have_jq; then
    echo "  skip manifest read/write tests — jq not installed (hash tests still ran)"
    n="$(wc -l < "$FAIL_F" | tr -d "[:space:]")"; n="${n:-0}"
    echo ""; [[ "$n" -eq 0 ]] && echo "manifest: ALL PASS (hash only)" || { echo "manifest: $n FAIL"; exit 1; }
    exit 0
fi

D="$TMP/feat"; mkdir -p "$D"

# --- init + round-trip ---
bash "$M" init --dir "$D"
[[ -f "$D/.clickup-sync.json" ]] && ok "init creates manifest" || bad "init" "no file"

bash "$M" set-targets --dir "$D" --workspace W --space S --list L \
    --status-map '{"not-started":"to do","in-progress":"in progress","done":"complete"}'
[[ "$(bash "$M" get --dir "$D" listId)" == "L" ]] && ok "set/get listId" || bad "targets" "listId"
[[ "$(bash "$M" get --dir "$D" statusMapping.done)" == "complete" ]] && ok "get nested statusMapping.done" || bad "targets" "status map"

bash "$M" set-card --dir "$D" --id CARD --hash sha256:aaa
[[ "$(bash "$M" get --dir "$D" card.id)" == "CARD" ]] && ok "set/get card.id" || bad "card" "id"

bash "$M" set-us --dir "$D" --us US1 --id SUB1 --hash sha256:b
bash "$M" set-us --dir "$D" --us US3 --id SUB3 --hash sha256:c --depends-on "US1,US2"
[[ "$(bash "$M" get-us --dir "$D" US3 | jq -r '.dependsOn|join(",")')" == "US1,US2" ]] \
    && ok "US deps round-trip" || bad "us" "deps"

# --- merge without clobber: re-set targets keeps card + US ---
bash "$M" set-targets --dir "$D" --workspace W --space S --list L --status-map '{"done":"complete"}'
[[ "$(bash "$M" get --dir "$D" card.id)" == "CARD" ]] && ok "set-targets preserves card" || bad "merge" "card clobbered"
[[ "$(bash "$M" get-us --dir "$D" US1 | jq -r '.id')" == "SUB1" ]] && ok "set-targets preserves US" || bad "merge" "US clobbered"

# --- upsert US (same us replaces, not duplicates) ---
bash "$M" set-us --dir "$D" --us US1 --id SUB1b --hash sha256:d
cnt="$(jq '[.userStories[]|select(.us=="US1")]|length' "$D/.clickup-sync.json")"
[[ "$cnt" == "1" ]] && ok "US upsert does not duplicate" || bad "upsert" "count=$cnt"
[[ "$(bash "$M" get-us --dir "$D" US1 | jq -r '.id')" == "SUB1b" ]] && ok "US upsert updates id" || bad "upsert" "id"

# --- get on absent manifest → empty, no crash ---
[[ -z "$(bash "$M" get --dir "$TMP/none" listId)" ]] && ok "get on absent manifest → empty" || bad "absent" "not empty"

n="$(wc -l < "$FAIL_F" | tr -d "[:space:]")"; n="${n:-0}"
echo ""
if [[ "$n" -eq 0 ]]; then echo "manifest: ALL PASS"; else echo "manifest: $n FAIL"; exit 1; fi
