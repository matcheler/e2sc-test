# SSP upgrade kit

Claude Code commands and agents for upgrading an E2open SSP customer overlay project to a new platform drop. Generic across customers.

## Install
Install the agent-loop kit first (it provides `/setup-project`, `test-author`, `reviewer` and `servers.md`), then:

    powershell -File install.ps1            # installs into ~/.claude
    powershell -File install.ps1 -Dest X    # test install elsewhere

## Use
Open Claude Code in the project (SVN working copy) and run `/upgrade-project`. It is resumable via `.upgrade/state.json`.

Flow: preflight (versions, SVN rollback point, target box) -> platform baseline (you update `comp_dependencies`, the agent verifies it, then `setup remove` + `setup`) -> assessment [approve] -> upgrade test cases [approve] -> build and deploy, capture conflicts -> resolve conflicts, re-deploy (max 3 rounds) -> verify and fix (max 3 iterations) -> independent review -> report. Nothing commits: you check in with SVN.

## Safety
- You are asked at preflight whether agents may run `setup remove` / `setup` on the dedicated upgrade box. Reloads, p2c, restarts and inbox drops always stay with you.
- Locked tests are never edited to pass.
- Platform lessons go in `~/.claude/upgrade/gotchas.md` (kept on reinstall). Keep customer names and hosts out of it.

## Contents
- `claude/commands/upgrade-project.md` - orchestrator
- `claude/agents/upgrade-assessor.md`, `upgrade-merger.md`, `upgrade-verifier.md`
- `claude/upgrade/gotchas.md`
