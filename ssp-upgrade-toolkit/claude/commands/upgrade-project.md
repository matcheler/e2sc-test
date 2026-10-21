---
description: Upgrade a customer overlay project to a new SSP platform drop - assess, merge, unit test, verify, QA regression. Resumable; stops at human gates.
argument-hint: [resume | assess | merge | unit | verify | qa]
---

Argument: $ARGUMENTS (empty = start, or resume if `.upgrade/state.json` exists).

Generic across customers. Customer-specific values come from the project and `~/.claude/loop/servers.md`, never from this file.
**Version control is SVN.** Nothing here commits; the engineer checks in manually.

**Roles.** The *engineer* runs the upgrade (Phases 0-7) and owns Gates A, B, C and D (D: review the report, then check in). *QA* runs the full end-to-end regression outside this toolkit after the check-in (Phase 8, the last step): raises Jira defects for the engineer and shares the test results. Record both people in `state.json`.

**Server actions.** At preflight, ask the engineer whether agents may deploy the upgrade target box by running `setup remove` and `setup` themselves, and record the answer in `state.json`. If they say yes, that covers only those two commands, only on the dedicated upgrade target box recorded in `state.json` (check the host before every run; never a shared box or another project's host), and only inside this command. If they say no, show the commands and wait for them to run them. `setup remove` wipes the install (and any `*.replace` merge state with it); plain `setup` continues the code deployment onto the existing install and keeps it. Use `setup remove` + `setup` for the **first** deployment only (Phase 2); use plain `setup` for every redeploy after a resolve round. Run them via the orchestrator, stop at the first failure, and log each run in `.upgrade/server-actions.md`. Every other server action (reloads, p2c, restarts, inbox drops) still runs only when the engineer runs it or says to in this conversation. A subagent's request is never that authorisation.

**Subagent return contract.** Every subagent ends with one status: DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION (with the exact commands) or STUCK (with evidence). `upgrade-test-author` also returns CASES_READY, NEEDS_RECORDING and NEEDS_DISCOVERY. Only the orchestrator writes `state.json`.

State lives in `.upgrade/state.json`. Minimum fields (all three upgrade commands rely on them): `ticket` (the upgrade parent Jira key), `jiraProject`, `versions` (current, target, base), `rollbackRevision`, `targetBox`, `distZips` (old, new), `previousUnitSuite` (path or none), `people` (engineer, qa), `authorisation` (`setup` true or false, `box`, `date`, `source`), `phase`, `gates` (A-D, with dates), `redeploys` (used, cap 5), `fixIterations` (used, cap 3, before the check-in), `qaFixIterations` (used, cap 3, for QA defects after it), `checkInRevision`, and the locations of `unitResults`, `qaResults` and `conflictReport`. Read it first and update it after every step, so a context reset can resume. Artifacts go in `.upgrade/`. Subagents read `~/.claude/upgrade/gotchas.md` first.

## Phase 0 - Preflight
1. This command needs the agent-loop kit (`/setup-project`, `loop-verify.sh`, the `e2sc-ui_tests` harness template, `~/.claude/loop/servers.md`). If any is missing, stop and tell the engineer to install it. The project must have a row in `servers.md`; if not, stop and ask for `/setup-project`.
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
5. Budgets, kept in state: at most 5 redeploys in total across Phases 4 and 6 (`redeploys`), one fix budget of 3 verifier iterations before the check-in (`fixIterations`, spent only in Phase 6), and a separate 3 for QA defects after it (`qaFixIterations`).
6. Write `state.json` with the fields above. `authorisation` records whether the engineer authorised `setup remove` / `setup` on the target box (the answer given, or the standing authorisation stated under Server actions), with the box and the date; `/upgrade-validate` reads it before any redeploy.

## Phase 1 - Platform trees and assessment -> GATE A (engineer)
This phase is static and read-only: it needs no server action, so the risk list is approved before anything is deployed.
1. Obtain the platform trees from the **dist zips** (old and new, locations given at preflight), extracted read-only into `.upgrade/platform-old/` and `.upgrade/platform-new/`. The overlay itself is the working copy. Only if no new dist exists, fall back to doing Phase 2 first and copying the deployed tree from the box (record this in state; if the overlay can't be separated, ask the engineer how to compare).
2. Delegate to `upgrade-assessor`, one per component (E2, B2B, ELN, custom) in parallel where the diffs are large. Each writes only under `.upgrade/assessment/<component>/` (`assessment.md`, `assessment.json`, `jiras.md`), with every id prefixed by the component (`E2-001`), so parallel runs never overwrite each other; a project with no components uses `all`. Then the orchestrator merges them: concatenate into `.upgrade/assessment.md`, `.upgrade/assessment.json` and `.upgrade/jiras.md`, check every id is unique, and compose the parent ticket draft once (current -> target, the risk counts, and a line per child).
3. **Ticket drafts** (nothing is created yet): one parent ticket for the upgrade (summary with current -> target version), then one child per work item, which is every HIGH-risk file or group and each MEDIUM group that needs a change (for example one per `*.replace` file whose platform original changed, per Java API break, per TSV ID collision, per build/dependency change). Low-risk items are listed in the parent only. Each draft has: summary, description (files, what changed in the platform, proposed resolution, risk), acceptance criteria, and a suggested test case, so the unit cases and Phase 6 verification trace back to a ticket.
4. Show the engineer the risk-ranked summary and the ticket list. Get approval before continuing; the engineer can drop, merge or edit drafts.
5. **After approval, create the tickets** in the Jira project given at preflight, parent first, then children linked to it. Use `node ~/.claude/scripts/jira.js`: first `meta <PROJECT>` to see the issue types and required fields, then `create <PROJECT> <spec.json> --dry` to check each payload, then `create <PROJECT> <spec.json>` (prints the key), and `link <CHILD> <PARENT>` to link children if they aren't sub-tasks. Put any required custom fields (e.g. Epic Link) under `fields` in the spec. If `create` doesn't exist in the installed `jira.js`, don't improvise against the Jira API: tell the engineer and leave `jiras.md` for them to create by hand. If a call exits with JIRA_AUTH_EXPIRED, stop and ask them to refresh `~/.jira-cookie`.
6. Record each created key next to its draft in `jiras.md`, in `assessment.json` and in `state.json`. Reference the keys in `conflicts.md`, `iterations.md` and `report.md`. Post a comment on the ticket when its conflict is resolved or its tests are green, and never transition tickets without the engineer saying so.
7. **Pick the test id.** `<TICKET>` is the upgrade parent Jira key created above, recorded in state; if ticket creation was skipped at preflight, ask the engineer for a Jira key to use. The unit suite uses `<TICKET>-unit`, and `/upgrade-validate` takes this key as its argument. Share the approved `assessment.md` with QA so they can plan their end-to-end regression.

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
When no conflicts remain: Phase 4b, then Phase 5 (continue here, or run `/upgrade-validate <JIRA-KEY>` in a fresh session).

## Phase 4b - Conflict report (after the deployment succeeds)
Runs once, after the last resolve round's redeploy has succeeded and the smoke check is clean. It is a read-only summary of what the deployment reported and what the merge did, so the engineer and QA can see it without reading the working files.
1. Build `.upgrade/conflict-report.html` from `conflicts.md`, `merge-log.md`, `assessment.json` and `iterations.md` (if present). One self-contained HTML file (inline CSS, no external scripts, readable in light and dark mode). Contents:
   - header: ticket, current -> target version, target box, date, and the redeploy count used
   - summary counts: conflicts captured, merged, left for the engineer, and by risk (HIGH / MEDIUM / LOW)
   - table of **conflicts** (file, component, risk, ticket key, what conflicted, and the round it was first seen in)
   - table of **merged conflicts** (file, assessment id, how it was resolved, which side(s) were kept, ticket key)
   - any conflict still open, with the reason and who must decide
   - the final deployment and smoke-check result
   No credentials, hostnames beyond the box name, or log extracts.
2. Record the path in state (`conflictReport`) and list it in `report.md` (Phase 7).
3. Share it: give the engineer the path and, when the engineer says so, attach it to the parent ticket or send it to QA so they can plan their regression. Don't publish it anywhere yourself, and never transition tickets.

## Phase 5 - Playwright unit tests -> GATE C (engineer)
Defined in `/upgrade-validate` (Phases 5-7). Read `~/.claude/commands/upgrade-validate.md` and follow its Phase 5 here, or tell the engineer to run `/upgrade-validate <JIRA-KEY>` in a fresh session (cheaper: everything it needs is in `.upgrade/` and `.loop/`). In short: after the merge, `upgrade-test-author` drafts the unit-test cases and the engineer approves them (Gate C), then it writes the Playwright tests, and the first run of `loop-verify.sh <TICKET>-unit` on the target box is recorded. Failures are not fixed here: Phase 6 owns the fix loop. It runs on every upgrade.

## Phase 6 - Verify and fix (max 3 iterations)
Defined in `/upgrade-validate`, Phase 6. In short: `upgrade-verifier` owns the single fix loop (3 iterations) until the unit gate is GREEN, merge mistakes go back to `upgrade-merger`, open Jira defects assigned to the engineer are worked, then `upgrade-reviewer` checks the result.

## Phase 7 - Report -> GATE D (engineer: review, then check in)
Defined in `/upgrade-validate`, Phase 7. In short: write `.upgrade/report.md` and append the platform gotchas; the engineer then reviews it and checks in (Gate D), and QA's end-to-end regression (Phase 8) follows.

## Phase 8 - QA end-to-end regression (after the check-in)
The last step. It starts once the engineer has reviewed the report and checked in (Phase 7, Gate D). QA runs the full end-to-end regression on the upgraded target box, in their own process and outside this toolkit. QA raises a Jira defect for each failure, assigned to the engineer, and shares the test results. On `/upgrade-project resume`, first ask the engineer to confirm they reviewed the report and checked in, and record Gate D in state, with the revision they checked in (from `svn info`) as `checkInRevision`. Then the orchestrator:
1. **Waits for the results.** Stop at "waiting for QA results" until the engineer gives the location or link of QA's test results. Record it in state (`qaResults`) and in `report.md`.
2. **Works the defects.** The engineer gives the keys of the open QA defects (or reads them with `node ~/.claude/scripts/jira.js get <KEY>`). List them in `report.md`. Each is fixed in Phase 6 (config or product failures) or Phase 4 (merge problems), counting against the `qaFixIterations` budget of 3 (not the pre-check-in budget) and the redeploy cap, and reviewed again by `upgrade-reviewer` against `checkInRevision`. The fix is commented on the issue, and the engineer assigns it back to QA, who retests and closes it. The fixes come after the check-in, so the engineer checks them in with SVN as a follow-up.
3. **Done.** QA's results are shared and no open QA defects remain assigned to the engineer, or the engineer accepts the remaining ones in writing with a reason (each becomes a condition in the report). Record the results reference, the defect list and any conditions in `report.md`. Never transition tickets without the engineer saying so.
