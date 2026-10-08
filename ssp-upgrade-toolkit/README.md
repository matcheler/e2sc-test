# SSP upgrade kit

Claude Code commands and agents for upgrading an E2open SSP customer overlay project to a new platform drop. Generic across customers.

## Install
Install the agent-loop kit first (it provides `/setup-project`, `test-author`, `reviewer` and `servers.md`), then:

    powershell -File install.ps1            # installs into ~/.claude
    powershell -File install.ps1 -Dest X    # test install elsewhere

## Use
Open Claude Code in the project (SVN working copy) and run `/upgrade-project`. It is resumable via `.upgrade/state.json`.

QA works in parallel without a command (see the QA guide below).

Roles: the **engineer** runs the upgrade and owns Gates A, C and D and the SVN check-in; **QA** owns the test cases and locked tests (Gate B), the sign-off (Gate E) and works in parallel on a separate old-version box (the baseline).

Flow: preflight (versions, SVN rollback point, target box, QA old-version box, dist zip locations) -> platform trees from the dist zips and assessment per component with Jira tickets [Gate A; read-only, before any server action; QA starts drafting cases and the baseline on the old box] -> first deployment (you update `comp_dependencies`, the agent verifies it, then `setup remove` + `setup`) -> capture conflicts from the deployment [Gate C] -> resolve conflicts, redeploy with plain `setup` (max 3 rounds) -> Playwright unit tests of HIGH-risk items and basic upload/download flows, every upgrade [Gate D] -> QA's full end-to-end regression: cases, locked tests and baseline [Gate B] -> verify and fix against the baseline (max 3 iterations) -> independent review -> report -> QA sign-off [Gate E] -> check-in. Redeploys are capped at 5 overall. Nothing commits: you check in with SVN.

Every subagent ends with DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION or STUCK. Assessor, merger and verifier read `~/.claude/upgrade/gotchas.md` first.

## Phases
| # | Phase | Owner | What happens | Output | Stop |
|---|-------|-------|--------------|--------|------|
| 0 | Preflight | Engineer | Check the project is in `servers.md`, `svn status` is clean, record the rollback revision. Confirm current/target/base SSP versions, the target box, the QA old-version box, deploy authorisation, Jira project, names. Check SSH to both boxes. | `state.json` | Any answer fails validation |
| 1 | Platform trees and assessment | Engineer | Extract the old and new platform trees from the dist zips (read-only). One `upgrade-assessor` per component ranks every customisation HIGH/MEDIUM/LOW against the platform delta and drafts Jira tickets (and `unit-tests.md`). Approved drafts become tickets. The orchestrator writes `.loop/<TICKET>/intake.md` from the assessment (scope, hosts, one criterion per HIGH/MEDIUM item, seed-data checklist, risk explanations) and hands QA the brief; QA starts drafting cases and the baseline on the old box. | `platform-old/`, `platform-new/`, `assessment.md`, `assessment.json`, `jiras.md`, tickets, `intake.md` | **Gate A** |
| 2 | First deployment | Engineer | You update `comp_dependencies` and rootpom `ssp.version`; the agent verifies they match the target. `setup remove` then `setup` on the target box. Re-seed data, run the smoke check. | Deployed box | A deploy step fails |
| 3 | Capture conflicts | Engineer | Run any extra p2c/reload/restart steps. Collect the conflicts the deployment reported, tag each with risk and ticket. Cross-check every HIGH assessment item is listed or marked "no action". | `conflicts.md` | **Gate C** |
| 4 | Resolve | Engineer | `upgrade-merger` resolves each conflict (`*.replace` starts from the new platform file and re-applies the customer delta). Redeploy with plain `setup`, re-capture, smoke check. Up to 3 rounds, within the 5-redeploy cap. | `merge-log.md`, updated `conflicts.md` | Unresolved HIGH conflict |
| 5 | Playwright unit tests (every upgrade) | Engineer | Validates the build. The assessor's `.upgrade/unit-tests.md` lists a case for each HIGH-risk item and one basic case per upload/download workflow (carried forward from the previous upgrade's suite where one exists). The engineer approves the cases, `test-author` writes the Playwright tests (recordings by the engineer where requested), and `loop-verify.sh <TICKET>-unit` must be GREEN on the target box. Failures go back through the merger (max 3 rounds). Narrow by design: QA's full end-to-end regression is Phase 6 onward. | `unit-tests.md`, `unit-results.md`, `tests/locked/<TICKET>-unit/` | **Gate D** |
| 6 | Test definition | QA | QA owns the full end-to-end regression, in their own working copy and on the old-version box. QA writes the cases (regression or expected-change), posts them to the Jira parent ticket, writes and locks the Playwright tests (`<TICKET>` and `<TICKET>-xc`), captures the baseline on the old box, and runs both gates on the target box. Each failing test is raised in Jira and assigned to the engineer. `test-author` can help; there is no command. | Cases in Jira, locked tests, `baseline-results.md`, Jira failure issues | **Gate B**; no locked tests = waiting for QA |
| 7 | Verify and fix | Engineer | `upgrade-verifier` runs the locked tests against the baseline, reads server logs, classifies failures and fixes product/config/merge issues (max 3 iterations). Server actions come back as NEEDS_SERVER_ACTION. Then `reviewer` checks the work against the assessment. | `iterations.md`, `handover.md`, review | STUCK, or review findings |
| 8 | Report | Engineer | Summarise versions, files by overlay type, conflicts auto vs human resolved, results vs baseline, open issues, server actions, redeploy count, rollback revision. Append new gotchas. | `report.md`, `gotchas.md` | Ready for manual SVN check-in |
| 9 | QA sign-off | QA | By hand: QA reads the report, re-checks the locked test hashes, re-runs all three gates (`<TICKET>`, `-xc`, `-unit`) on the target box, runs the smoke check and manual checklist, compares with the baseline, checks the Jira failure issues, and decides signed off / with conditions / rejected. The sign-off is tied to the `svn diff` sha256 and last `setup` time, so any later change invalidates it. Rejected items go to Jira, assigned to the engineer, and back to Phase 7 or 4. | `qa-signoff.md` | **Gate E** |

## QA guide
There is no QA command: QA works directly in Claude Code, in their own SVN working copy of the project, after the engineer has shared `.loop/<TICKET>/intake.md`, `.upgrade/assessment.md` and `.upgrade/unit-results.md` (they are untracked, so copy them across). `<TICKET>` is the upgrade parent Jira key, or `UPG-<target version>`. QA needs the agent-loop kit, the `e2sc-ui_tests` harness set up, `jira.js` access (`~/.jira-cookie`), and `SUPER_USER_PASSWORD` where the server needs one.
- **Test definition (Phase 6):** write the cases, post them to the Jira parent ticket, write and lock the Playwright tests, capture the baseline on the old box, run the gates on the target box. `test-author` (CASES or TESTS mode) can help.
- **Failures:** each failing test becomes a Jira issue assigned to the engineer; the engineer fixes, comments and assigns back; QA re-runs and closes.
- **Sign-off (Phase 9):** the checklist in the command, ending in `.upgrade/qa-signoff.md`.
The Playwright files can't be attached through `jira.js`, so they reach the engineer by SVN check-in or copy.

## Safety
- You are asked at preflight whether agents may run `setup remove` / `setup` on the dedicated upgrade box (never the QA old-version box). `setup remove` is used for the first deployment only. Reloads, p2c, restarts and inbox drops always stay with you.
- Locked tests are never edited to pass.
- Platform lessons go in `~/.claude/upgrade/gotchas.md` (kept on reinstall). Keep customer names and hosts out of it.

## Contents
- `claude/commands/upgrade-project.md` - orchestrator
- `claude/agents/upgrade-assessor.md`, `upgrade-merger.md`, `upgrade-verifier.md`
- `claude/upgrade/gotchas.md`
