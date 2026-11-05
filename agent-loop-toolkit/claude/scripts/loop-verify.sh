#!/usr/bin/env bash
# Verification gate for the agent loop: GREEN only if every locked test for the ticket passes.
# Usage (from the project root): bash ~/.claude/scripts/loop-verify.sh <TICKET>
# Writes the full output to .loop/<TICKET>/last-verify.log and a short digest (counts + first error lines per
# failing test) to .loop/<TICKET>/last-verify-summary.txt, which it also prints. Exit 0 = GREEN, non-zero = RED.
#   --ui-only: skip the Logic lane and run only the Playwright tests (Phase A's UNBOUND run, before the build,
#   while the Logic harness is still RED). Used by the main session only.
# Exit 4 (CHECK:) = loop-ui-check.js found the locked UI contract tampered with (specs, signatures, files outside
# pages/, lint). Nothing was run. Not an iteration and not a test result: stop and show the user.
set -u
TICKET="${1:?usage: loop-verify.sh <TICKET> [--ui-only]}"
UI_ONLY=0; [ "${2:-}" = "--ui-only" ] && UI_ONLY=1
ROOT="$(pwd)"
LOOP="$ROOT/.loop/$TICKET"
LOG="$LOOP/last-verify.log"
SUMMARY="$LOOP/last-verify-summary.txt"
UI="$ROOT/e2sc-ui_tests"
UICHECK="$HOME/.claude/scripts/loop-ui-check.js"
mkdir -p "$LOOP"

fail() { echo "RED: $*" | tee "$LOG"; cp "$LOG" "$LOOP/last-verify-summary.txt"; exit 1; }
# INFRA = the gate could not run (ssh down, Groovy missing), not a test result. Exit 3, so the caller
# can retry or hand over without spending an iteration.
infra() { echo "INFRA: $*" | tee -a "$LOG"; cp "$LOG" "$LOOP/last-verify-summary.txt"; exit 3; }

[ -d "$UI" ] || fail "no e2sc-ui_tests harness in $ROOT - this project has nowhere to run locked tests."

# Two-phase UI tests: once Phase A is locked, the contract check runs before every gate run. Specs without a lock
# (never locked, or the marker was deleted) only run in --ui-only, Phase A's UNBOUND run.
if [ -d "$UI/tests/locked/$TICKET/specs" ] && [ ! -f "$LOOP/ui.locked" ] && [ "$UI_ONLY" = "0" ]; then
  echo "CHECK: tests/locked/$TICKET/specs exists but .loop/$TICKET/ui.locked does not. Lock Phase A (loop-ui-check.js --lock) or, after a contract change, re-run Phase A; compare with the ui.locked sha256 posted to Jira." | tee "$SUMMARY" "$LOG"; exit 4
fi
if [ -f "$LOOP/ui.locked" ]; then
  if ! node "$UICHECK" "$TICKET" > "$LOOP/last-ui-check.txt" 2>&1; then
    { echo "CHECK: the locked UI contract for $TICKET was changed; no tests were run."; cat "$LOOP/last-ui-check.txt"; } > "$SUMMARY"
    cp "$SUMMARY" "$LOG"; cat "$SUMMARY"; exit 4
  fi
fi

# Two lanes. Logic = Groovy harness run on the dev server over SSH (seconds), written before the build.
# UI = Playwright (minutes), written after the build. Logic runs first and a red Logic stops the run.
LOGIC="$UI/tests/logic/$TICKET"
LOGIC_SSH="${LOGIC_SSH:-}"   # ssh target for the Groovy runs: the e2sc host from ~/.claude/loop/servers.md
GROOVY="${LOGIC_GROOVY:-/e2open/app/runtime/groovy-2.4.17/bin/groovy}"
has_logic=0; has_ui=0
[ "$UI_ONLY" = "0" ] && ls "$LOGIC"/*.logic.groovy >/dev/null 2>&1 && has_logic=1
# Specs sit in tests/locked/<T>/ (older tickets) or tests/locked/<T>/specs/ (two-phase UI tests).
SPECS="$(find "$UI/tests/locked/$TICKET" -name '*.spec.ts' 2>/dev/null)"
[ -n "$SPECS" ] && has_ui=1
[ "$UI_ONLY" = "1" ] && [ "$has_ui" = "0" ] && fail "--ui-only: no specs under e2sc-ui_tests/tests/locked/$TICKET."
[ "$has_logic" = "1" ] || [ "$has_ui" = "1" ] || fail "no tests for $TICKET: need e2sc-ui_tests/tests/logic/$TICKET/*.logic.groovy and/or e2sc-ui_tests/tests/locked/$TICKET/*.spec.ts."

echo "== loop-verify $TICKET $(date -Is)" > "$LOG"

if [ "$has_logic" = "1" ]; then
  # A skipped or always-passing case would let the oracle pass without proving the behaviour.
  if grep -nE "@Ignore|System\.exit\(0\)|Thread\.sleep|\bsleep\(" "$LOGIC"/*.logic.groovy >> "$LOG"; then
    fail "logic tests contain @Ignore / System.exit(0) / sleep - not allowed in the oracle."
  fi
  # Per-user folder: /tmp/<TICKET> on a shared box is often someone else's (a shared folder can give Permission denied).
  [ -n "$LOGIC_SSH" ] || infra "LOGIC_SSH is not set: export it as the ssh target (the e2sc host in servers.md) before running Logic tests."
  RBASE="$(ssh -o BatchMode=yes "$LOGIC_SSH" 'echo /tmp/loop-logic-$(id -un)' 2>/dev/null | tail -1)"
  case "$RBASE" in /tmp/loop-logic-?*) ;; *) infra "could not reach $LOGIC_SSH to pick a working folder." ;; esac
  REMOTE="$RBASE/$TICKET"
  # sources.txt lists the repo files under test (repo-relative, one per line). The harness runs against the
  # working copy, so it is RED before the build and green only once the change is in the tree.
  SRCS=""
  [ -f "$LOGIC/sources.txt" ] && SRCS="$(grep -vE '^\s*(#|$)' "$LOGIC/sources.txt" | tr -d '\r')"
  DIRS="$REMOTE/src"
  for s in $SRCS; do DIRS="$DIRS $REMOTE/src/$(dirname "$s")"; done
  ssh -o BatchMode=yes "$LOGIC_SSH" "rm -rf $REMOTE && mkdir -p $DIRS" >> "$LOG" 2>&1 || infra "ssh to $LOGIC_SSH failed (see $LOG)."
  scp -o BatchMode=yes "$LOGIC"/*.logic.groovy "$LOGIC_SSH:$REMOTE/" >> "$LOG" 2>&1 || infra "scp of the logic tests to $LOGIC_SSH failed."
  SRC_ROOT="${LOGIC_SRC_ROOT:-$ROOT}"   # override to run the harness against another working copy
  for s in $SRCS; do
    if [ -f "$SRC_ROOT/$s" ]; then
      scp -o BatchMode=yes "$SRC_ROOT/$s" "$LOGIC_SSH:$REMOTE/src/$s" >> "$LOG" 2>&1 || infra "scp of $s failed."
    else
      echo "NOTE: source under test not in the tree yet: $s" >> "$LOG"
    fi
  done
  OUT="$LOOP/last-logic.out"
  ssh -o BatchMode=yes "$LOGIC_SSH" "cd $REMOTE && export JAVA_HOME=/usr LOGIC_SRC=$REMOTE/src && rc=0; for f in *.logic.groovy; do $GROOVY \"\$f\" || rc=1; done; exit \$rc" > "$OUT" 2>&1
  lrc=$?
  cat "$OUT" >> "$LOG"
  [ "$lrc" = "255" ] && infra "ssh to $LOGIC_SSH dropped during the logic run."
  [ "$lrc" = "127" ] && infra "Groovy not found at $GROOVY on $LOGIC_SSH."
  lpass=$(grep -cE '^PASS ' "$OUT"); lfail=$(grep -cE '^FAIL ' "$OUT")
  if [ "$lrc" != "0" ] || [ "$lpass" = "0" ] || [ "$lfail" != "0" ]; then
    {
      echo "RED (logic): $lfail failed, $lpass passed. Playwright was not run. Full output: $OUT"
      echo "  $lpass passed"; echo "  $lfail failed"; echo
      # FAIL lines come with their message on the next line; anything else (compile error, stack) is shown too.
      grep -vE '^PASS ' "$OUT" | head -40
    } > "$SUMMARY"
    cat "$SUMMARY"
    exit 1
  fi
  echo "logic: $lpass passed" >> "$LOG"
  if [ "$has_ui" = "0" ]; then
    echo "GREEN: all locked logic tests for $TICKET passed ($lpass passed)." | tee -a "$LOG" | tee "$SUMMARY"
    exit 0
  fi
fi

# Some dev servers (some dev boxes) log in with the username only, and a harness config may read
# the password from a file, so a missing variable is a warning, not a failure.
[ -n "${SUPER_USER_PASSWORD:-}" ] || echo "WARNING: SUPER_USER_PASSWORD is not set; OK only if this server logs in without a password or the harness config supplies it."

# test.fail / test.skip / test.fixme would let a test "pass" without proving the behaviour.
if grep -rnE --include='*.spec.ts' "test\.(fail|skip|fixme|only)\b" "$UI/tests/locked/$TICKET" >/dev/null; then
  grep -rnE --include='*.spec.ts' "test\.(fail|skip|fixme|only)\b" "$UI/tests/locked/$TICKET" > "$LOG"
  fail "locked tests contain test.fail/skip/fixme/only - not allowed in the oracle."
fi

TWO_PHASE=0; [ -d "$UI/tests/locked/$TICKET/specs" ] && TWO_PHASE=1
rm -f "$LOOP/last-ui.json"
cd "$UI" || exit 1
# The JSON report feeds loop-ui-check.js (--lock reads the UNBOUND run, --classify sorts failures).
PLAYWRIGHT_JSON_OUTPUT_NAME="$LOOP/last-ui.json" npx playwright test "tests/locked/$TICKET" --project=chromium --workers=1 --retries=0 --reporter=list,json >> "$LOG" 2>&1
rc=$?
cd "$ROOT" || exit 1
classify() { [ "$TWO_PHASE" = "1" ] && { echo; node "$UICHECK" "$TICKET" --classify 2>&1; }; }
# Exit 0 alone is not enough: also require at least one pass and no failed/flaky/skipped tests. Anchored to
# Playwright's indented summary lines, so the Logic lane's "LOGIC: 4 passed, 0 failed" in the same log counts for neither.
if [ "$rc" = "0" ] && grep -qE "^ +[0-9]+ passed" "$LOG" && ! grep -qE "^ +[1-9][0-9]* (failed|flaky|skipped)" "$LOG"; then
  echo "GREEN: all locked tests for $TICKET passed ($(grep -oE '[0-9]+ passed' "$LOG" | tail -1))." | tee -a "$LOG" | tee "$SUMMARY"
  classify >> "$SUMMARY"
  exit 0
fi
# Digest for the agent: failure headers from the list reporter plus the lines that usually carry the cause.
{
  echo "RED: locked tests for $TICKET failed. Full log: $LOG"
  grep -E "^ *[0-9]+ (passed|failed|flaky|skipped|did not run)" "$LOG"
  echo
  awk '
    # A test can hold several expect.soft failures, each its own "Error:" block, so the cap is per
    # block (not per test) and the long "at <path>" lines are skipped, so every soft failure shows.
    /^ +[0-9]+\) \[/ { print; n = 0; inblk = 1; nerr = 0; next }
    inblk && /^ +[A-Za-z]*(Error|UnboundStep):/ { nerr++; n = 0 }
    inblk && nerr <= 12 && /^ +at / { if (match($0, /[^\\\/]+\.ts:[0-9]+/)) print "    at " substr($0, RSTART, RLENGTH); next }
    inblk && nerr <= 12 && n < 5 && /(Error|UNBOUND|Expected|Received|Locator|locator|waiting for|Timeout|timeout|\.spec\.ts:[0-9]+)/ { sub(/^ +/, "    "); print; n++ }
    /^ +[0-9]+ (passed|failed|flaky|skipped)/ { inblk = 0 }
  ' "$LOG"
  classify
} > "$SUMMARY"
cat "$SUMMARY"
echo "RED: see $LOG" >> "$LOG"
exit 1
