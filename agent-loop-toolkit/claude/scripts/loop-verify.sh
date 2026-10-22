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
# INFRA = the gate could not run (ssh down, Groovy missing), not a test result. Exit 3, so the caller
# can retry or hand over without spending an iteration.
infra() { echo "INFRA: $*" | tee -a "$LOG"; cp "$LOG" "$LOOP/last-verify-summary.txt"; exit 3; }

[ -d "$UI" ] || fail "no e2sc-ui_tests harness in $ROOT - this project has nowhere to run locked tests."

# Two lanes. Logic = Groovy harness run on the dev server over SSH (seconds), written before the build.
# UI = Playwright (minutes), written after the build. Logic runs first and a red Logic stops the run.
LOGIC="$UI/tests/logic/$TICKET"
LOGIC_SSH="${LOGIC_SSH:-}"   # ssh target for the Groovy runs: the e2sc host from ~/.claude/loop/servers.md
GROOVY="${LOGIC_GROOVY:-/e2open/app/runtime/groovy-2.4.17/bin/groovy}"
has_logic=0; has_ui=0
ls "$LOGIC"/*.logic.groovy >/dev/null 2>&1 && has_logic=1
[ -d "$UI/tests/locked/$TICKET" ] && ls "$UI/tests/locked/$TICKET"/*.spec.ts >/dev/null 2>&1 && has_ui=1
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
if grep -nE "test\.(fail|skip|fixme|only)\b" "$UI/tests/locked/$TICKET"/*.spec.ts >/dev/null; then
  grep -nE "test\.(fail|skip|fixme|only)\b" "$UI/tests/locked/$TICKET"/*.spec.ts > "$LOG"
  fail "locked tests contain test.fail/skip/fixme/only - not allowed in the oracle."
fi

cd "$UI" || exit 1
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
    # A test can hold several expect.soft failures, each its own "Error:" block, so the cap is per
    # block (not per test) and the long "at <path>" lines are skipped, so every soft failure shows.
    /^ +[0-9]+\) \[/ { print; n = 0; inblk = 1; nerr = 0; next }
    inblk && /^ +[A-Za-z]*Error:/ { nerr++; n = 0 }
    inblk && nerr <= 12 && /^ +at / { if (match($0, /[^\\\/]+\.spec\.ts:[0-9]+/)) print "    at " substr($0, RSTART, RLENGTH); next }
    inblk && nerr <= 12 && n < 5 && /(Error|Expected|Received|Locator|locator|waiting for|Timeout|timeout|\.spec\.ts:[0-9]+)/ { sub(/^ +/, "    "); print; n++ }
    /^ +[0-9]+ (passed|failed|flaky|skipped)/ { inblk = 0 }
  ' "$LOG"
} > "$SUMMARY"
cat "$SUMMARY"
echo "RED: see $LOG" >> "$LOG"
exit 1
