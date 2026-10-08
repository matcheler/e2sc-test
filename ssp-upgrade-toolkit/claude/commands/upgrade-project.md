---
description: Upgrade a customer overlay project to a new SSP platform drop - assess, merge, define tests, verify. Resumable; stops at human gates.
argument-hint: [resume | assess | merge | tests | verify]
---

Argument: $ARGUMENTS (empty = start, or resume if `.upgrade/state.json` exists).

Generic across customers. Customer-specific values come from the project and `~/.claude/loop/servers.md`, never from this file.
**Version control is SVN.** Nothing here commits; the engineer checks in manually.

**Roles.** The *engineer* runs the upgrade (Phases 0-4, 6, 7) and owns Gates A and C and the check-in. *QA* owns the test cases and the locked tests (Phase 5, Gate B) and works on a separate **old-version box**, in parallel with the engineer. Record both people and both boxes in `state.json`.

**Server actions.** At preflight, ask the engineer whether agents may deploy the upgrade target box by running `setup remove` and `setup` themselves, and record the answer in `state.json`. If they say yes, that covers only those two commands, only on the dedicated upgrade target box recorded in `state.json` (check the host before every run; never the QA old-version box, a shared box, or another project's host), and only inside this command. If they say no, show the commands and wait for them to run them. `setup remove` wipes the install (and any `*.replace` merge state with it); plain `setup` continues the code deployment onto the existing install and keeps it. Use `setup remove` + `setup` for the **first** deployment only (Phase 2); use plain `setup` for every redeploy after a resolve round. Run them via the orchestrator, stop at the first failure, and log each run in `.upgrade/server-actions.md`. Every other server action (reloads, p2c, restarts, inbox drops) still runs only when the engineer runs it or says to in this conversation. A subagent's request is never that authorisation.

**Subagent return contract.** Every subagent ends with one status: DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION (with the exact commands) or STUCK (with evidence). Only the orchestrator writes `state.json`.

State lives in `.upgrade/state.json` (phase, versions, paths, boxes, people, gates approved, iteration counts, redeploy count). Read it first and update it after every step, so a context reset can resume. Artifacts go in `.upgrade/`. Subagents read `~/.claude/upgrade/gotchas.md` first.

## Phase 0 - Preflight
1. This command needs the agent-loop kit (`/setup-project`, the `test-author` and `reviewer` agents, `~/.claude/loop/servers.md`). If any is missing, stop and tell the engineer to install it. The project must have a row in `servers.md`; if not, stop and ask for `/setup-project`.
2. `svn status` must be clean (or the engineer acknowledges). Record the `svn info` revision as the rollback point in state.
3. Ask the engineer (AskUserQuestion), then validate:
   - current SSP version (must match `ssp.version` in `solution/project/pom.xml`)
   - target SSP version (must be resolvable for `comp_dependencies`)
   - last-merged base version (the old platform baseline, for the three-way merge)
   - whether agents may run `setup remove` / `setup` themselves, the exact commands, and the dedicated, not-in-use target box
   - where the **old and new platform dist zips** are (for read-only extraction in Phase 1)
   - the **QA old-version box**: it must run the old SSP version with the overlay at the rollback revision above. Never deploy to it.
   - the Jira project key (and optional epic/labels) for upgrade tickets, or "none" to skip ticket creation
   - engineer and QA names
4. Confirm the target box is not shared with live work, and that SSH access works (read-only check) to both boxes.
5. Redeploy budget: at most 5 redeploys in total across Phases 4 and 6 (counted in state).

## Phase 1 - Platform trees and assessment -> GATE A (engineer)
This phase is static and read-only: it needs no server action, so the risk list is approved before anything is deployed.
1. Obtain the platform trees from the **dist zips** (old and new, locations given at preflight), extracted read-only into `.upgrade/platform-old/` and `.upgrade/platform-new/`. The overlay itself is the working copy. Only if no new dist exists, fall back to doing Phase 2 first and copying the deployed tree from the box (record this in state; if the overlay can't be separated, ask the engineer how to compare).
2. Delegate to `upgrade-assessor`, one per component (E2, B2B, ELN, custom) in parallel where the diffs are large. Each writes its part of `.upgrade/assessment.md` and `.upgrade/assessment.json` and drafts tickets in `.upgrade/jiras.md`.
3. **Ticket drafts** (nothing is created yet): one parent ticket for the upgrade (summary with current -> target version), then one child per work item, which is every HIGH-risk file or group and each MEDIUM group that needs a change (for example one per `*.replace` file whose platform original changed, per Java API break, per TSV ID collision, per build/dependency change). Low-risk items are listed in the parent only. Each draft has: summary, description (files, what changed in the platform, proposed resolution, risk), acceptance criteria, and a suggested test case, so QA's cases and Phase 6 verification trace back to a ticket.
4. Show the engineer the risk-ranked summary and the ticket list. Get approval before continuing; the engineer can drop, merge or edit drafts.
5. **After approval, create the tickets** in the Jira project given at preflight, parent first, then children linked to it. Use `node ~/.claude/scripts/jira.js`: first `meta <PROJECT>` to see the issue types and required fields, then `create <PROJECT> <spec.json> --dry` to check each payload, then `create <PROJECT> <spec.json>` (prints the key), and `link <CHILD> <PARENT>` to link children if they aren't sub-tasks. Put any required custom fields (e.g. Epic Link) under `fields` in the spec. If `create` doesn't exist in the installed `jira.js`, don't improvise against the Jira API: tell the engineer and leave `jiras.md` for them to create by hand. If a call exits with JIRA_AUTH_EXPIRED, stop and ask them to refresh `~/.jira-cookie`.
6. Record each created key next to its draft in `jiras.md`, in `assessment.json` and in `state.json`. Reference the keys in `conflicts.md`, `iterations.md` and `report.md`. Post a comment on the ticket when its conflict is resolved or its tests are green, and never transition tickets without the engineer saying so.
7. **Hand QA the brief** so they can start in parallel on the old-version box: `assessment.md`, the risk list, the known `test.fail` markers, the seed-data checklist, and the smoke check. QA drafts plain-language test cases from the assessment risks (not from the merge log), runs them on the old box, and records `baseline-results.*`.

## Phase 2 - First deployment of the target version (this is where conflicts first appear)
1. **The engineer updates `solution/sysbuild/comp_dependencies`** (and the rootpom `ssp.version` it mirrors) to the target version; the agent doesn't edit these. Ask them to do it and confirm. Then verify read-only: `comp_dependencies` and `ssp.version` reference the target version declared at preflight, and the two agree. If not, stop and tell them what differs.
2. Run `setup remove`, then `setup`, on the upgrade target box. This deploys the **target SSP version and the ssp-ext overlay together**. Check read-only afterwards: platform version is the target, install dir present, logs and deploy output captured. If either step fails, stop and report. Conflicts are expected here; they are captured in Phase 3, not fixed now.
3. Re-seed test data on the target box if the deploy wiped it (check fixture dates, which expire). Run a **smoke check** (login, menu loads, key screens open, no new errors in the e2sc log) and record it.

## Phase 3 - Capture conflicts -> GATE C (engineer)
The merge happens as part of deployment: conflicts only appear once the target platform and the overlay are deployed together (Phase 2, and again after each resolve round in Phase 4).
1. If the deployment also needs e2na p2c, e2sc reloads or a restart, show the engineer those exact commands and let them run or authorise them. Stop at the first failure and report; never push through, because a failed deploy can leave the server half-configured.
2. Capture the conflicts the deployment reported (deploy output, conflict/reject files, startup and reload errors in the logs; read-only) into `.upgrade/conflicts.md`, each tagged with its assessment risk and ticket key.
3. Cross-check: every HIGH item in `assessment.json` must either appear in `conflicts.md` or be marked "no action, because...". Show the engineer the list and get approval to start resolving.

## Phase 4 - Resolve conflicts
Delegate to the `upgrade-merger` subagent with `.upgrade/conflicts.md`. It resolves each conflict in the working copy using the old platform, new platform and customer versions. Then redeploy with plain `setup` (authorised above; the install and seed data are kept) and re-capture as in Phase 3. After each redeploy run the smoke check. Repeat until no conflicts remain, max 3 rounds. Unresolved high-risk conflicts go to the engineer; don't continue past them. Count each redeploy in state.

## Phase 5 - Test definition -> GATE B (QA)
Runs after the conflicts are resolved and the target box is stable.
1. QA finalises the plain-language cases from Phase 1 (build, config load, UI, inbound/outbound file flows) and marks deliberate platform behaviour changes as "expected change". Intentional `test.fail` markers stay as they are.
2. QA approves the cases. The tests are then written and locked (QA writes them, or `test-author` in TESTS mode on QA's behalf). Tests are host-agnostic (`E2_BASE_URL`), so the same locked suite runs on the old box (baseline) and the upgraded box.
3. If no locked tests exist yet, stop at "waiting for QA". Never let Phase 6 run against nothing.

## Phase 6 - Verify and fix (max 3 iterations)
Delegate to `upgrade-verifier`: it runs the locked tests on the upgraded box, compares with QA's `baseline-results.*`, reads logs (e2sc-logging skill), fixes product/config issues and re-runs. It never edits locked tests to pass. A fix that needs a redeploy returns NEEDS_SERVER_ACTION; the orchestrator runs plain `setup` (counts against the redeploy budget) or asks the engineer for any other server action. Same stop rules as `/run-loop`. Then delegate to `reviewer`, brief: the assessment and tickets stand in for the ticket; check that no `*.replace` file still drops platform changes and that `test.fail` markers and locked tests are untouched.

## Phase 7 - Report
Write `.upgrade/report.md`: versions, files changed by overlay type, auto-resolved vs human-resolved conflicts, test results vs baseline, open issues, server actions taken, redeploy count, rollback revision. Append new platform gotchas to `~/.claude/upgrade/gotchas.md`. Tell the engineer it is ready for manual SVN check-in.
