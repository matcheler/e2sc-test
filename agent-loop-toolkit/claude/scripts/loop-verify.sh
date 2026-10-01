#!/usr/bin/env bash
# Verification gate for the agent loop: GREEN only if every locked test for the ticket passes.
# Usage (from the project root): bash ~/.claude/scripts/loop-verify.sh <TICKET>
# Writes the full output to .loop/<TICKET>/last-verify.log and a short digest (counts + first error lines per
# failing test) to .loop/<TICKET>/last-verify-summary.txt, which it also prints. Exit 0 = GREEN, non-zero = RED.
set -u
TICKET="${1:?usage: loop-verify.sh <TICKET>}"
ROOT="$(pwd)"
LOOP="$ROOT/.loop/$TICKET"
LOG="$LOOP/last-verify.log"
SUMMARY="$LOOP/last-verify-summary.txt"
UI="$ROOT/e2sc-ui_tests"
mkdir -p "$LOOP"

fail() { echo "RED: $*" | tee "$LOG"; cp "$LOG" "$LOOP/last-verify-summary.txt"; exit 1; }

[ -d "$UI" ] || fail "no e2sc-ui_tests harness in $ROOT - this project has nowhere to run locked tests."
[ -d "$UI/tests/locked/$TICKET" ] || fail "no locked tests at e2sc-ui_tests/tests/locked/$TICKET."
ls "$UI/tests/locked/$TICKET"/*.spec.ts >/dev/null 2>&1 || fail "no *.spec.ts files in e2sc-ui_tests/tests/locked/$TICKET."
# Some dev servers log in with the username only, and a harness config may read
# the password from a file, so a missing variable is a warning, not a failure.
[ -n "${SUPER_USER_PASSWORD:-}" ] || echo "WARNING: SUPER_USER_PASSWORD is not set; OK only if this server logs in without a password or the harness config supplies it."

# test.fail / test.skip / test.fixme would let a test "pass" without proving the behaviour.
if grep -nE "test\.(fail|skip|fixme|only)\b" "$UI/tests/locked/$TICKET"/*.spec.ts >/dev/null; then
  grep -nE "test\.(fail|skip|fixme|only)\b" "$UI/tests/locked/$TICKET"/*.spec.ts > "$LOG"
  fail "locked tests contain test.fail/skip/fixme/only - not allowed in the oracle."
fi

cd "$UI" || exit 1
echo "== loop-verify $TICKET $(date -Is)" > "$LOG"
npx playwright test "tests/locked/$TICKET" --project=chromium --workers=1 --retries=0 --reporter=list >> "$LOG" 2>&1
rc=$?
# Exit 0 alone is not enough: also require at least one pass and no failed/flaky/skipped tests.
if [ "$rc" = "0" ] && grep -qE "[0-9]+ passed" "$LOG" && ! grep -qE "[0-9]+ (failed|flaky|skipped)" "$LOG"; then
  echo "GREEN: all locked tests for $TICKET passed ($(grep -oE '[0-9]+ passed' "$LOG" | tail -1))." | tee -a "$LOG" | tee "$SUMMARY"
  exit 0
fi
# Digest for the agent: failure headers from the list reporter plus the lines that usually carry the cause.
{
  echo "RED: locked tests for $TICKET failed. Full log: $LOG"
  grep -E "^ *[0-9]+ (passed|failed|flaky|skipped|did not run)" "$LOG"
  echo
  awk '
    /^ +[0-9]+\) \[/ { print; n = 0; inblk = 1; next }
    inblk && n < 8 && /(Error|Expected|Received|Locator|locator|waiting for|Timeout|timeout|\.spec\.ts:[0-9]+)/ { sub(/^ +/, "    "); print; n++ }
    /^ +[0-9]+ (passed|failed|flaky|skipped)/ { inblk = 0 }
  ' "$LOG"
} > "$SUMMARY"
cat "$SUMMARY"
echo "RED: see $LOG" >> "$LOG"
exit 1
