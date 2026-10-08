# SSP upgrade kit

Claude Code commands and agents for upgrading an E2open SSP customer overlay project to a new platform drop. Generic across customers.

## Install
Install the agent-loop kit first (it provides `/setup-project`, `test-author`, `reviewer` and `servers.md`), then:

    powershell -File install.ps1            # installs into ~/.claude
    powershell -File install.ps1 -Dest X    # test install elsewhere

## Use
Open Claude Code in the project (SVN working copy) and run `/upgrade-project`. It is resumable via `.upgrade/state.json`.

QA works in parallel with `/upgrade-tests <TICKET>` (see the QA guide below).

Roles: the **engineer** runs the upgrade and owns the gates and the SVN check-in; **QA** owns the test cases and locked tests and works in parallel on a separate old-version box (the baseline).

Flow: preflight (versions, SVN rollback point, target box, QA old-version box, dist zip locations) -> platform trees from the dist zips and assessment per component with Jira tickets [Gate A; read-only, before any server action; QA starts drafting cases and the baseline on the old box] -> first deployment (you update `comp_dependencies`, the agent verifies it, then `setup remove` + `setup`) -> capture conflicts from the deployment [Gate C] -> resolve conflicts, redeploy with plain `setup` (max 3 rounds) -> QA finalises cases and locks the tests [Gate B] -> verify and fix against the baseline (max 3 iterations) -> independent review -> report. Redeploys are capped at 5 overall. Nothing commits: you check in with SVN.

Every subagent ends with DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION or STUCK. Assessor, merger and verifier read `~/.claude/upgrade/gotchas.md` first.

## Phases
| # | Phase | Owner | What happens | Output | Stop |
|---|-------|-------|--------------|--------|------|
| 0 | Preflight | Engineer | Check the project is in `servers.md`, `svn status` is clean, record the rollback revision. Confirm current/target/base SSP versions, the target box, the QA old-version box, deploy authorisation, Jira project, names. Check SSH to both boxes. | `state.json` | Any answer fails validation |
| 1 | Platform trees and assessment | Engineer | Extract the old and new platform trees from the dist zips (read-only). One `upgrade-assessor` per component ranks every customisation HIGH/MEDIUM/LOW against the platform delta and drafts Jira tickets. Approved drafts become tickets. The orchestrator writes `.loop/<TICKET>/intake.md` from the assessment (scope, hosts, one criterion per HIGH/MEDIUM item, seed-data checklist, risk explanations) and hands QA the brief; QA starts drafting cases and the baseline on the old box. | `platform-old/`, `platform-new/`, `assessment.md`, `assessment.json`, `jiras.md`, tickets, `intake.md` | **Gate A** |
| 2 | First deployment | Engineer | You update `comp_dependencies` and rootpom `ssp.version`; the agent verifies they match the target. `setup remove` then `setup` on the target box. Re-seed data, run the smoke check. | Deployed box | A deploy step fails |
| 3 | Capture conflicts | Engineer | Run any extra p2c/reload/restart steps. Collect the conflicts the deployment reported, tag each with risk and ticket. Cross-check every HIGH assessment item is listed or marked "no action". | `conflicts.md` | **Gate C** |
| 4 | Resolve | Engineer | `upgrade-merger` resolves each conflict (`*.replace` starts from the new platform file and re-applies the customer delta). Redeploy with plain `setup`, re-capture, smoke check. Up to 3 rounds, within the 5-redeploy cap. | `merge-log.md`, updated `conflicts.md` | Unresolved HIGH conflict |
| 5 | Test definition | QA | With `test-author` doing the drafting and code: CASES mode drafts cases from the assessment risks (via `.loop/<TICKET>/intake.md`, written by the orchestrator); QA edits, tags each case regression or expected-change, and approves (`cases.approved`); QA records any flows the agent requests (codegen); TESTS mode writes and locks the Playwright tests, with expected-change cases in a separate `<TICKET>-xc` directory. The gate runs on the old box (regression must pass; expected-change is expected RED) to give the baseline, and on the target box in Phase 6. Run as `/upgrade-tests <TICKET>`. | Approved cases, locked tests in `e2sc-ui_tests/tests/locked/<TICKET>/` and `<TICKET>-xc/`, `baseline-results.*` | **Gate B**; no locked tests = waiting for QA |
| 6 | Verify and fix | Engineer | `upgrade-verifier` runs the locked tests against the baseline, reads server logs, classifies failures and fixes product/config/merge issues (max 3 iterations). Server actions come back as NEEDS_SERVER_ACTION. Then `reviewer` checks the work against the assessment. | `iterations.md`, `handover.md`, review | STUCK, or review findings |
| 7 | Report | Engineer | Summarise versions, files by overlay type, conflicts auto vs human resolved, results vs baseline, open issues, server actions, redeploy count, rollback revision. Append new gotchas. | `report.md`, `gotchas.md` | Ready for manual SVN check-in |

## QA guide
QA runs `/upgrade-tests <TICKET>` in their own SVN working copy of the project, after the engineer has shared `.loop/<TICKET>/intake.md` and `.upgrade/assessment.md` (these are untracked, so copy them across). `<TICKET>` is the upgrade parent Jira key, or `UPG-<target version>`. Needs the agent-loop kit, the `e2sc-ui_tests` harness set up, and `SUPER_USER_PASSWORD` where the server needs one. The command drafts cases with `test-author`, waits for QA's approval, writes and locks the tests, runs them on the old-version box for the baseline, and lists what to hand back to the engineer. Resume with `/upgrade-tests <TICKET> resume`.

## Safety
- You are asked at preflight whether agents may run `setup remove` / `setup` on the dedicated upgrade box (never the QA old-version box). `setup remove` is used for the first deployment only. Reloads, p2c, restarts and inbox drops always stay with you.
- Locked tests are never edited to pass.
- Platform lessons go in `~/.claude/upgrade/gotchas.md` (kept on reinstall). Keep customer names and hosts out of it.

## Contents
- `claude/commands/upgrade-project.md` - orchestrator
- `claude/commands/upgrade-tests.md` - QA's test definition and baseline (Phase 5)
- `claude/agents/upgrade-assessor.md`, `upgrade-merger.md`, `upgrade-verifier.md`
- `claude/upgrade/gotchas.md`
