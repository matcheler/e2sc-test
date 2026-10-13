# SSP upgrade kit

Claude Code commands and agents for upgrading an E2open SSP customer overlay project to a new platform drop. Generic across customers.

## Install
Install the agent-loop kit first (it provides `/setup-project`, `test-author`, `reviewer` and `servers.md`), then:

    powershell -File install.ps1            # installs into ~/.claude
    powershell -File install.ps1 -Dest X    # test install elsewhere

## Use
Open Claude Code in the project (SVN working copy) and run `/upgrade-project`. It is resumable via `.upgrade/state.json`.

Phases 5-7 (unit tests, verify, report) can also be run on their own with `/upgrade-validate`, ideally in a fresh session after `/clear`; `/upgrade-project resume` then picks up again for Phase 8.

Roles: the **engineer** runs the upgrade and owns Gates A, B and C and the SVN check-in; **QA** runs the full end-to-end regression outside this toolkit, raises Jira defects for the engineer and shares the test results (Gate D).

Flow: preflight (versions, SVN rollback point, target box, dist zip locations) -> platform trees from the dist zips and assessment per component with Jira tickets [Gate A; read-only, before any server action] -> first deployment (you update `comp_dependencies`, the agent verifies it, then `setup remove` + `setup`) -> capture conflicts from the deployment [Gate B] -> resolve conflicts, redeploy with plain `setup` (max 3 rounds) -> Playwright unit tests of HIGH-risk items and basic upload/download flows, every upgrade [Gate C] -> verify and fix (max 3 iterations) -> independent review -> report -> QA end-to-end regression, defects and results shared [Gate D] -> check-in. Redeploys are capped at 5 overall. Nothing commits: you check in with SVN.

Every subagent ends with DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION or STUCK. Assessor, merger and verifier read `~/.claude/upgrade/gotchas.md` first.

## Phases
| # | Phase | Owner | What happens | Output | Stop |
|---|-------|-------|--------------|--------|------|
| 0 | Preflight | Engineer | Check the project is in `servers.md`, `svn status` is clean, record the rollback revision. Confirm current/target/base SSP versions, the target box, dist zip locations, the previous unit suite, deploy authorisation, Jira project, names. Check SSH to the target box. | `state.json` | Any answer fails validation |
| 1 | Platform trees and assessment | Engineer | Extract the old and new platform trees from the dist zips (read-only). One `upgrade-assessor` per component ranks every customisation HIGH/MEDIUM/LOW against the platform delta and drafts Jira tickets (and `unit-tests.md`). Approved drafts become tickets. The approved assessment is shared with QA. | `platform-old/`, `platform-new/`, `assessment.md`, `assessment.json`, `jiras.md`, tickets | **Gate A** |
| 2 | First deployment | Engineer | You update `comp_dependencies` and rootpom `ssp.version`; the agent verifies they match the target. `setup remove` then `setup` on the target box. Re-seed data, run the smoke check. | Deployed box | A deploy step fails |
| 3 | Capture conflicts | Engineer | Run any extra p2c/reload/restart steps. Collect the conflicts the deployment reported, tag each with risk and ticket. Cross-check every HIGH assessment item is listed or marked "no action". | `conflicts.md` | **Gate B** |
| 4 | Resolve | Engineer | `upgrade-merger` resolves each conflict (`*.replace` starts from the new platform file and re-applies the customer delta). Redeploy with plain `setup`, re-capture, smoke check. Up to 3 rounds, within the 5-redeploy cap. | `merge-log.md`, updated `conflicts.md` | Unresolved HIGH conflict |
| 5 | Playwright unit tests (every upgrade) | Engineer | Validates the build. The assessor's `.upgrade/unit-tests.md` lists a case for each HIGH-risk item and one basic case per upload/download workflow (carried forward from the previous upgrade's suite where one exists). The engineer approves the cases, `test-author` writes the Playwright tests (recordings by the engineer where requested), and `loop-verify.sh <TICKET>-unit` must be GREEN on the target box. Failures go back through the merger (max 3 rounds). Narrow by design: QA's full end-to-end regression is separate and outside this toolkit. | `unit-tests.md`, `unit-results.md`, `tests/locked/<TICKET>-unit/` | **Gate C** |
| 6 | Verify and fix | Engineer | `upgrade-verifier` runs the unit gate on the target box, reads server logs, classifies failures and fixes product/config/merge issues (max 3 iterations), and works any open Jira defects assigned to the engineer. Server actions come back as NEEDS_SERVER_ACTION. Then `reviewer` checks the work against the assessment. | `iterations.md`, `handover.md`, review | STUCK, or review findings |
| 7 | Report | Engineer | Summarise versions, files by overlay type, conflicts auto vs human resolved, unit test results, open issues, server actions, redeploy count, rollback revision. Append new gotchas. | `report.md`, `gotchas.md` | QA regression is next |
| 8 | QA end-to-end regression | QA | QA runs the full end-to-end regression on the target box outside this toolkit, raises a Jira defect for each failure (assigned to the engineer) and shares the test results. The engineer gives the orchestrator the results location and the open defect keys; defects are fixed in Phase 6 or 4 and QA retests. Gate D passes when results are shared and no open defects remain (or the engineer accepts them in writing). | Results reference and defect list in `report.md` | **Gate D** |

## Agents
`/upgrade-project` is the orchestrator: it runs in the main Claude Code session, holds `.upgrade/state.json`, stops at the gates, runs the authorised `setup` commands and delegates the work below. Every subagent ends with DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION or STUCK, and never runs server actions itself.

![SSP upgrade agents: the phases, agents, gates and handoffs](docs/upgrade-agents.png)

Editable source: `docs/upgrade-agents.svg`.

| Agent | Phase | What it does |
|-------|-------|--------------|
| `upgrade-assessor` | 1, and 5 (update) | Read-only on the project; writes under `.upgrade/`. One per component. Compares the old and new platform against every customisation, ranks risk HIGH/MEDIUM/LOW, drafts the Jira tickets, and writes the Playwright unit-test case list (`unit-tests.md`) and `assessment.json`. |
| `upgrade-merger` | 4 | Resolves the conflicts the deployment reported, in the working copy, using the old platform, new platform and customer versions (`*.replace` files start from the new platform file). Uses the config skills, logs every decision in `merge-log.md`, and returns NEEDS_SERVER_ACTION where a server compile is needed. |
| `upgrade-verifier` | 6 | Runs the unit gate on the target box, reads the server logs, classifies each failure, and fixes product, config and merge issues through the config skills. Works any open Jira defects assigned to the engineer. Never edits locked tests. Max 3 iterations. |
| `test-author` (agent-loop kit) | 5 | Writes the Playwright unit tests for the approved cases (TESTS mode) and asks for codegen recordings where it needs them. |
| `reviewer` (agent-loop kit) | 6 | Independent review of the finished changes against the assessment and tickets: checks no `*.replace` file still drops platform changes and that locked tests are untouched. |

The agents use these skills for config changes and checks: `e2sc-config`, `e2sc-ocmm`, `e2sc-pcmm`, `e2sc-io`, `e2sc-cfg`, `alert-config`, `e2na-config`, `e2sc-logging` and `e2sc-playwright`.

## Safety
- You are asked at preflight whether agents may run `setup remove` / `setup` on the dedicated upgrade box. `setup remove` is used for the first deployment only. Reloads, p2c, restarts and inbox drops always stay with you.
- Locked tests are never edited to pass.
- Platform lessons go in `~/.claude/upgrade/gotchas.md` (kept on reinstall). Keep customer names and hosts out of it.

## Contents
- `claude/commands/upgrade-project.md` - orchestrator
- `claude/commands/upgrade-validate.md` - Phases 5-7: unit tests, verify and fix, report
- `claude/agents/upgrade-assessor.md`, `upgrade-merger.md`, `upgrade-verifier.md`
- `docs/upgrade-agents.png`, `upgrade-agents.svg` - agent and phase diagram
- `claude/upgrade/gotchas.md`
