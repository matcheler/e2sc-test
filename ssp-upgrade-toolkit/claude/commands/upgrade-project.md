---
description: Upgrade a customer overlay project to a new SSP platform drop - assess, merge, unit test, verify, QA sign-off. Resumable; stops at human gates.
argument-hint: [resume | assess | merge | unit | verify | signoff]
---

Argument: $ARGUMENTS (empty = start, or resume if `.upgrade/state.json` exists).

Generic across customers. Customer-specific values come from the project and `~/.claude/loop/servers.md`, never from this file.
**Version control is SVN.** Nothing here commits; the engineer checks in manually.

**Roles.** The *engineer* runs the upgrade (Phases 0-7) and owns Gates A, B and C and the check-in. *QA* runs the full end-to-end regression outside this toolkit and owns the sign-off (Phase 8, Gate D). Record both people in `state.json`.

**Server actions.** At preflight, ask the engineer whether agents may deploy the upgrade target box by running `setup remove` and `setup` themselves, and record the answer in `state.json`. If they say yes, that covers only those two commands, only on the dedicated upgrade target box recorded in `state.json` (check the host before every run; never a shared box or another project's host), and only inside this command. If they say no, show the commands and wait for them to run them. `setup remove` wipes the install (and any `*.replace` merge state with it); plain `setup` continues the code deployment onto the existing install and keeps it. Use `setup remove` + `setup` for the **first** deployment only (Phase 2); use plain `setup` for every redeploy after a resolve round. Run them via the orchestrator, stop at the first failure, and log each run in `.upgrade/server-actions.md`. Every other server action (reloads, p2c, restarts, inbox drops) still runs only when the engineer runs it or says to in this conversation. A subagent's request is never that authorisation.

**Subagent return contract.** Every subagent ends with one status: DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION (with the exact commands) or STUCK (with evidence). Only the orchestrator writes `state.json`.

State lives in `.upgrade/state.json` (phase, versions, paths, box, people, gates approved, iteration counts, redeploy count). Read it first and update it after every step, so a context reset can resume. Artifacts go in `.upgrade/`. Subagents read `~/.claude/upgrade/gotchas.md` first.

## Phase 0 - Preflight
1. This command needs the agent-loop kit (`/setup-project`, the `test-author` and `reviewer` agents, `~/.claude/loop/servers.md`). If any is missing, stop and tell the engineer to install it. The project must have a row in `servers.md`; if not, stop and ask for `/setup-project`.
2. `svn status` must be clean (or the engineer acknowledges). Record the `svn info` revision as the rollback point in state.
3. Ask the engineer (AskUserQuestion), then validate:
   - current SSP version (must match `ssp.version` in `solution/project/pom.xml`)
   - target SSP version (must be resolvable for `comp_dependencies`)
   - last-merged base version (the old platform baseline, for the three-way merge)
   - whether agents may run `setup remove` / `setup` themselves, the exact commands, and the dedicated, not-in-use target box
   - where the **old and new platform dist zips** are (for read-only extraction in Phase 1)
   - the path of the previous upgrade's Playwright unit suite (`e2sc-ui_tests/tests/locked/<previous>-unit/`), or "none" on the first upgrade: it is carried forward and extended in Phase 5
   - the Jira project key (and optional epic/labels) for upgrade tickets, or "none" to skip ticket creation
   - engineer and QA names
4. Confirm the target box is not shared with live work, and that SSH access works (read-only check).
5. Redeploy budget: at most 5 redeploys in total across Phases 4, 5 and 6 (counted in state).

## Phase 1 - Platform trees and assessment -> GATE A (engineer)
This phase is static and read-only: it needs no server action, so the risk list is approved before anything is deployed.
1. Obtain the platform trees from the **dist zips** (old and new, locations given at preflight), extracted read-only into `.upgrade/platform-old/` and `.upgrade/platform-new/`. The overlay itself is the working copy. Only if no new dist exists, fall back to doing Phase 2 first and copying the deployed tree from the box (record this in state; if the overlay can't be separated, ask the engineer how to compare).
2. Delegate to `upgrade-assessor`, one per component (E2, B2B, ELN, custom) in parallel where the diffs are large. Each writes its part of `.upgrade/assessment.md` and `.upgrade/assessment.json` and its Playwright unit-test cases in `.upgrade/unit-tests.md` and drafts tickets in `.upgrade/jiras.md`.
3. **Ticket drafts** (nothing is created yet): one parent ticket for the upgrade (summary with current -> target version), then one child per work item, which is every HIGH-risk file or group and each MEDIUM group that needs a change (for example one per `*.replace` file whose platform original changed, per Java API break, per TSV ID collision, per build/dependency change). Low-risk items are listed in the parent only. Each draft has: summary, description (files, what changed in the platform, proposed resolution, risk), acceptance criteria, and a suggested test case, so the unit cases and Phase 6 verification trace back to a ticket.
4. Show the engineer the risk-ranked summary and the ticket list. Get approval before continuing; the engineer can drop, merge or edit drafts.
5. **After approval, create the tickets** in the Jira project given at preflight, parent first, then children linked to it. Use `node ~/.claude/scripts/jira.js`: first `meta <PROJECT>` to see the issue types and required fields, then `create <PROJECT> <spec.json> --dry` to check each payload, then `create <PROJECT> <spec.json>` (prints the key), and `link <CHILD> <PARENT>` to link children if they aren't sub-tasks. Put any required custom fields (e.g. Epic Link) under `fields` in the spec. If `create` doesn't exist in the installed `jira.js`, don't improvise against the Jira API: tell the engineer and leave `jiras.md` for them to create by hand. If a call exits with JIRA_AUTH_EXPIRED, stop and ask them to refresh `~/.jira-cookie`.
6. Record each created key next to its draft in `jiras.md`, in `assessment.json` and in `state.json`. Reference the keys in `conflicts.md`, `iterations.md` and `report.md`. Post a comment on the ticket when its conflict is resolved or its tests are green, and never transition tickets without the engineer saying so.
7. **Pick the test id.** `<TICKET>` is the upgrade parent Jira key, or `UPG-<target version>` if there is none; the unit suite uses `<TICKET>-unit`. Share the approved `assessment.md` with QA so they can plan their end-to-end regression.

## Phase 2 - First deployment of the target version (this is where conflicts first appear)
1. **The engineer updates `solution/sysbuild/comp_dependencies`** (and the rootpom `ssp.version` it mirrors) to the target version; the agent doesn't edit these. Ask them to do it and confirm. Then verify read-only: `comp_dependencies` and `ssp.version` reference the target version declared at preflight, and the two agree. If not, stop and tell them what differs.
2. Run `setup remove`, then `setup`, on the upgrade target box. This deploys the **target SSP version and the ssp-ext overlay together**. Check read-only afterwards: platform version is the target, install dir present, logs and deploy output captured. If either step fails, stop and report. Conflicts are expected here; they are captured in Phase 3, not fixed now.
3. Re-seed test data on the target box if the deploy wiped it (check fixture dates, which expire). Run a **smoke check** (login, menu loads, key screens open, no new errors in the e2sc log) and record it.

## Phase 3 - Capture conflicts -> GATE B (engineer)
The merge happens as part of deployment: conflicts only appear once the target platform and the overlay are deployed together (Phase 2, and again after each resolve round in Phase 4).
1. If the deployment also needs e2na p2c, e2sc reloads or a restart, show the engineer those exact commands and let them run or authorise them. Stop at the first failure and report; never push through, because a failed deploy can leave the server half-configured.
2. Capture the conflicts the deployment reported (deploy output, conflict/reject files, startup and reload errors in the logs; read-only) into `.upgrade/conflicts.md`, each tagged with its assessment risk and ticket key.
3. Cross-check: every HIGH item in `assessment.json` must either appear in `conflicts.md` or be marked "no action, because...". Show the engineer the list and get approval to start resolving.

## Phase 4 - Resolve conflicts
Delegate to the `upgrade-merger` subagent with `.upgrade/conflicts.md`. It resolves each conflict in the working copy using the old platform, new platform and customer versions. Then redeploy with plain `setup` (authorised above; the install and seed data are kept) and re-capture as in Phase 3. After each redeploy run the smoke check. Repeat until no conflicts remain, max 3 rounds. Unresolved high-risk conflicts go to the engineer; don't continue past them. Count each redeploy in state.
When no conflicts remain: Phase 5.

## Phase 5 - Playwright unit tests -> GATE C (engineer)
Runs on **every** upgrade. It validates the build: automated Playwright tests on the target box prove the HIGH-risk items and the basic upload and download workflows. It is deliberately narrow. QA's full end-to-end regression is separate and outside this toolkit, and this phase does not replace it.
1. **Cases come from the assessor.** `.upgrade/unit-tests.md` was written in Phase 1: part A has a case for each HIGH-risk item (and MEDIUM items that change behaviour), part B has one basic case per upload and download workflow found in the overlay (IoDocTypeDef uploads/downloads, e2na inbound/outbound EBL routes and specs). If the previous upgrade's unit suite exists (path given at preflight), the assessor marks each carried-forward case as unchanged, needs update (a platform or overlay change touched it) or obsolete, and adds new cases for new items. Now re-invoke `upgrade-assessor` in update mode with `merge-log.md`, so items that became HIGH during the merge are reflected.
2. **Approve the cases.** Show the engineer the list; they can drop, add or edit cases. Write `.loop/<TICKET>-unit/cases.approved`: the date, the approved case ids, and what the engineer allows (inbox file drops over SSH, server log reads, which test data). Tests use only what is allowed.
3. **Write the tests.** Copy the carried-forward suite into `e2sc-ui_tests/tests/locked/<TICKET>-unit/`, then delegate to `test-author` in **TESTS mode** for the new and needs-update cases only (the assessor already drafted the cases, so skip CASES mode). Add these instructions to the prompt: host from `E2_BASE_URL`, never hard-coded; the tests are expected to **pass** on the target box (not RED first); no `test.fail/skip/fixme/only`; unique test data; file drops over SSH only if `cases.approved` allows. If it returns NEEDS_RECORDING, show the engineer each flow from `recording-requests.md` (steps, assertions, and the codegen command on the target box), wait for the recordings, and resume the same agent.
4. **Check the agent's work yourself:** one test per approved case, named with its case id, no banned markers, no access beyond what was allowed.
5. **Run the gate on the target box.** `E2_BASE_URL=<target box> bash ~/.claude/scripts/loop-verify.sh <TICKET>-unit` must be GREEN. Classify each failure: a test defect (fix via `test-author`, max 2 rounds), a product/config/merge issue (add it to `conflicts.md` with its ticket key, run Phase 4 for it, redeploy with plain `setup`, which counts against the redeploy cap, smoke check, re-run; max 3 rounds), a platform behaviour change (a question for the engineer), or stale data (fixture dates expire). Never edit a test to make it pass. If it is unclear whether the upgrade caused a failure, ask QA to run the same case on an old-version box.
6. **Gate C.** The unit gate is GREEN. If a failing case cannot be fixed, the engineer may accept it in writing with a reason; it is recorded as a condition and carried to the report and the QA sign-off. Write `.upgrade/unit-results.md` (per case: result and evidence) and `.loop/<TICKET>-unit/tests.locked` (sha256 of every file). Post a comment on each ticket when its cases pass, and never transition tickets without the engineer saying so.
7. **Share the results.** `unit-results.md` is available to QA, and the unit gate is re-run in Phase 6.

## Phase 6 - Verify and fix (max 3 iterations)
Delegate to `upgrade-verifier`: it runs the unit gate on the upgraded box (`E2_BASE_URL=<target box> bash ~/.claude/scripts/loop-verify.sh <TICKET>-unit`, which must be GREEN), reads logs (e2sc-logging skill), fixes product/config issues and re-runs. It never edits locked tests to pass. A fix that needs a redeploy returns NEEDS_SERVER_ACTION; the orchestrator runs plain `setup` (counts against the redeploy budget) or asks the engineer for any other server action. Same stop rules as `/run-loop`. Open Jira defects assigned to the engineer (for example from QA's end-to-end regression) are part of the work list: read them with `node ~/.claude/scripts/jira.js get <KEY>`, fix, and comment the fix on the issue; reassigning and closing are for the people. Then delegate to `reviewer`, brief: the assessment and tickets stand in for the ticket; check that no `*.replace` file still drops platform changes and that `test.fail` markers and locked tests are untouched.
At the end, when GREEN and reviewed, record the sha256 of `svn diff` and the time of the last `setup` run in `handover.md` and state, then go to Phase 7 (report), then Phase 8 (QA sign-off).

## Phase 7 - Report
Runs when Phase 6 is GREEN and reviewed. Write `.upgrade/report.md`: versions, files changed by overlay type, auto-resolved vs human-resolved conflicts, unit test results (Phase 5), open issues, server actions taken, redeploy count, rollback revision. Append new platform gotchas to `~/.claude/upgrade/gotchas.md`. Tell the engineer the report is ready and that QA sign-off (Phase 8) is next. Do not say it is ready for check-in yet.

## Phase 8 - QA sign-off -> GATE D (QA)
The last gate, after the report (Phase 7): Phase 6 is GREEN, the reviewer has reported and `.upgrade/report.md` is written. QA runs the full end-to-end regression and makes the decision in their own process, outside this toolkit. This phase only records the decision and enforces it. Once `.upgrade/qa-signoff.md` exists, the orchestrator:
1. **Checks the file.** If it is missing, stop at "waiting for QA sign-off". It must state the decision (**signed off**, **signed off with conditions** or **rejected**), the date, the QA name, the target box and platform version, the `svn diff` sha256 and last `setup` time, each condition with who accepted it, and the reason if rejected. If a required field is missing, stop and ask.
2. **Checks it is not stale.** A sign-off is only valid for what QA tested. At the end of Phase 6 the orchestrator records in `handover.md` and state the sha256 of `svn diff` (the overlay as it will be checked in) and the time of the last `setup` run from `server-actions.md`. If either differs from the values in the sign-off (another fix, another redeploy), stop and ask QA to sign off again.
3. **Rejected:** the failing items go back to Phase 6 (test or config failures) or Phase 4 (merge problems), counting against the iteration and redeploy budgets, then the report (Phase 7) is regenerated and Phase 8 repeats. Unresolved after the budgets are spent: stop and show the engineer.
4. **Signed off or with conditions:** record Gate D in state, append the decision and conditions to `report.md`, and tell the engineer it is ready for manual SVN check-in. Never transition tickets without the engineer saying so.
5. Sign-off is not the check-in: the engineer still checks in with SVN manually, and only after Gate D.
