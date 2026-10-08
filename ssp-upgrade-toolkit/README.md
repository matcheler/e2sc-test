# SSP upgrade kit

Claude Code commands and agents for upgrading an E2open SSP customer overlay project to a new platform drop. Generic across customers.

## Install
Install the agent-loop kit first (it provides `/setup-project`, `test-author`, `reviewer` and `servers.md`), then:

    powershell -File install.ps1            # installs into ~/.claude
    powershell -File install.ps1 -Dest X    # test install elsewhere

## Use
Open Claude Code in the project (SVN working copy) and run `/upgrade-project`. It is resumable via `.upgrade/state.json`.

Roles: the **engineer** runs the upgrade and owns the gates and the SVN check-in; **QA** owns the test cases and locked tests and works in parallel on a separate old-version box (the baseline).

Flow: preflight (versions, SVN rollback point, target box, QA old-version box) -> first deployment (you update `comp_dependencies`, the agent verifies it, then `setup remove` + `setup`; platform trees come from the dist zips) -> assessment per component and Jira tickets [Gate A; QA starts drafting cases and the baseline on the old box] -> capture conflicts from the deployment [Gate C] -> resolve conflicts, redeploy with plain `setup` (max 3 rounds) -> QA finalises cases and locks the tests [Gate B] -> verify and fix against the baseline (max 3 iterations) -> independent review -> report. Redeploys are capped at 5 overall. Nothing commits: you check in with SVN.

Every subagent ends with DONE, NEEDS_DECISION, NEEDS_SERVER_ACTION or STUCK. Assessor, merger and verifier read `~/.claude/upgrade/gotchas.md` first.

## Safety
- You are asked at preflight whether agents may run `setup remove` / `setup` on the dedicated upgrade box (never the QA old-version box). `setup remove` is used for the first deployment only. Reloads, p2c, restarts and inbox drops always stay with you.
- Locked tests are never edited to pass.
- Platform lessons go in `~/.claude/upgrade/gotchas.md` (kept on reinstall). Keep customer names and hosts out of it.

## Contents
- `claude/commands/upgrade-project.md` - orchestrator
- `claude/agents/upgrade-assessor.md`, `upgrade-merger.md`, `upgrade-verifier.md`
- `claude/upgrade/gotchas.md`
