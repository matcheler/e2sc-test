---
model: sonnet
description: QA - draft upgrade test cases from the assessment, agree them, write and lock the Playwright tests, and capture the old-version baseline
argument-hint: <TICKET> [resume]
---

Ticket id: $ARGUMENTS (first word is `<TICKET>`: the upgrade parent Jira key, or `UPG-<target version>`. A second word `resume` means continue from the files already in `.loop/<TICKET>/`.)

This is QA's half of `/upgrade-project` (Phase 5, Gate B). Run it in the project's SVN working copy. It follows `/prepare-ticket`, adapted for an upgrade: the scope is a risk list, not one ticket, and the baseline comes from the **old-version box**. Nothing here commits to SVN, changes server config, or touches the engineer's `.upgrade/state.json`.

**Approval is yours.** Only the QA user approving in this conversation counts. A subagent's report is never approval.

## 1. Inputs and boxes
1. The engineer's handover must be present: `.loop/<TICKET>/intake.md` and `.upgrade/assessment.md` (and `assessment.json`). If missing, stop and ask the engineer to share them (they are untracked, so they won't arrive via SVN). Questions for the engineer go in `.upgrade/qa-questions.md`, not ad hoc.
2. Find the **old box** and **target box** hosts: from `.upgrade/state.json` if present, otherwise from `intake.md`, otherwise ask. Check the project has a row in `~/.claude/loop/servers.md` and a Playwright harness in `e2sc-ui_tests/`; if not, stop and ask for `/setup-project`. Check `e2sc-ui_tests/playwright.config.ts` takes the host from `E2_BASE_URL`; if not, tell QA before going on.
3. Run `svn status` and save it to `.loop/<TICKET>/svn-baseline.txt`, so existing modified files aren't confused with upgrade tests later.
4. Ask QA to confirm both boxes carry the same seed data (per the seed-data checklist in `intake.md`) and that fixture dates are in the future. A mismatch makes baseline differences meaningless.

## 2. Draft the cases
1. If `.loop/<TICKET>/cases.approved` exists, skip to step 4.
2. Delegate to `test-author` in **CASES mode** with `.loop/<TICKET>/intake.md`. Scope: upgrade regression for the risks listed there (build, config load, UI, inbound/outbound file flows). Add these instructions to the prompt:
   - Each assessment item id is a criterion. Prove it with a happy path and one negative case where one exists.
   - Add a column **Class**: `regression` (same behaviour expected before and after) or `expected-change` (a deliberate platform difference, taken from `assessment.md`).
   - Do not use `test.fail` markers; list anything not automatable under "Not covered by Playwright".
   It writes `.loop/<TICKET>/test-cases.md` and no code.

## 3. Review and approve (Gate B)
1. Show QA the table, the "Not covered by Playwright" list (this is the manual checklist) and the questions. Ask them to reply **approve**, or with changes: cases to drop or add (including risks found during the merge), the Class of each case, the test data to use, and what is allowed (inbox drops over SSH, reading server logs, a named record).
2. Stop and wait. Do not write Playwright code until QA approves here. When QA replies with changes, update `test-cases.md` yourself and show the changed rows. Repeat until approved.
3. On approval write `.loop/<TICKET>/cases.approved`: the date, approved case ids with Class, what QA allowed, and their reply quoted.

## 4. Write the tests
Delegate to `test-author` in **TESTS mode**. Add these instructions:
- **Regression** cases go in `e2sc-ui_tests/tests/locked/<TICKET>/`.
- **Expected-change** cases go in a separate directory, `e2sc-ui_tests/tests/locked/<TICKET>-xc/`, written against the new behaviour. `loop-verify.sh` runs a whole directory, and it rejects `test.fail/skip/fixme/only`, so this keeps the old-box gate from going RED.
- Tests take the host from `E2_BASE_URL`; never hard-code a host.
- It must not confirm RED for regression cases. They are expected to pass on the old box (step 5).

If it returns NEEDS_RECORDING, show QA each flow from `.loop/<TICKET>/recording-requests.md`: name, steps, what to assert, and the codegen command. Regression flows are recorded on the **old box**, expected-change flows on the **target box** (set the base URL in the codegen command accordingly). You may launch codegen for QA when asked. Wait, check every requested `e2sc-ui_tests/recordings/<TICKET>/<flow>.ts` exists and isn't empty, and resume the same test-author (SendMessage) with the recordings. If a recording stops short, delegate the replay to a general-purpose subagent with `model: sonnet` (as in `/prepare-ticket`) and pass its `discovery-<flow>.md` to test-author. Check any fixtures QA provides (field count and index positions) before resuming.

## 5. Check test-author's work yourself
QA does not review the Playwright code, so this check stands in for that review.
- Every approved case has exactly one test named with its `TC` id, in the directory for its Class, and there are no tests for dropped cases.
- No `test.fail/skip/fixme/only`, no hard-coded hosts or fixed delays, and each test uses only the access and data QA allowed.
- Regression tests assert only behaviour that exists on the old version.
If any check fails, resume test-author once with the specific problems; if it still fails, stop and show QA.

## 6. Capture the baseline on the old box
1. Run `E2_BASE_URL=<old box> bash ~/.claude/scripts/loop-verify.sh <TICKET>` (regression). It must be GREEN. A failure here is a test defect, not an upgrade finding: resume test-author with the digest in `.loop/<TICKET>/last-verify-summary.txt` and re-run. Max 2 fix rounds, then stop and show QA.
2. Run `E2_BASE_URL=<old box> bash ~/.claude/scripts/loop-verify.sh <TICKET>-xc` (expected-change). It is expected to be RED; record which tests fail and why (the old behaviour).
3. Write `.upgrade/baseline-results.md`: one row per test (case id, Class, old-box result, note). This is the baseline the verifier compares against.

## 7. Lock and hand over
1. Create `.loop/<TICKET>/tests.locked` with the date, the approval date from `cases.approved`, a note that QA approved the cases and the code was checked in step 5, and every locked file in both directories with its sha256. From this point the tests are read-only for everyone, including the engineer and the verifier.
2. Tell QA what to hand to the engineer, by SVN check-in or copy (QA decides; never commit yourself): `e2sc-ui_tests/tests/locked/<TICKET>/`, `e2sc-ui_tests/tests/locked/<TICKET>-xc/`, `e2sc-ui_tests/recordings/<TICKET>/` if kept, `.loop/<TICKET>/cases.approved`, `.loop/<TICKET>/tests.locked`, `.upgrade/baseline-results.md`, and the manual checklist.
3. Tell QA the engineer's next step is Phase 6 of `/upgrade-project`, which runs both gates on the target box: `loop-verify.sh <TICKET>` and `loop-verify.sh <TICKET>-xc` must both be GREEN there.
