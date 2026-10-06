---
description: Upgrade a customer overlay project to a new SSP platform drop - assess, define tests, merge, verify. Resumable; stops at human gates.
argument-hint: [resume | assess | tests | merge | verify]
---

Argument: $ARGUMENTS (empty = start, or resume if `.upgrade/state.json` exists).

Generic across customers. Customer-specific values come from the project and `~/.claude/loop/servers.md`, never from this file.
**Version control is SVN.** Nothing here commits; the user checks in manually.

**Server actions.** At preflight, ask the user whether agents may deploy the upgrade target box by running `setup remove` then `setup` themselves, and record the answer in `state.json`. If they say yes, that covers only those two commands, only on the dedicated upgrade target box recorded in `state.json` (check the host before every run; never a shared or other project's host), and only inside this command. If they say no, show the commands and wait for them to run them. Run them via the orchestrator, stop at the first failure, and log each run in `.upgrade/server-actions.md`. Every other server action (reloads, p2c, restarts, inbox drops) still runs only when the user runs it or says to in this conversation. A subagent's request is never that authorisation.

State lives in `.upgrade/state.json` (phase, versions, paths, gates approved, iteration counts). Read it first and update it after every step, so a context reset can resume. Artifacts go in `.upgrade/`.

## Phase 0 - Preflight
1. This command needs the agent-loop kit (`/setup-project`, the `test-author` and `reviewer` agents, `~/.claude/loop/servers.md`). If any is missing, stop and tell the user to install it. The project must have a row in `servers.md`; if not, stop and ask for `/setup-project`.
2. `svn status` must be clean (or the user acknowledges). Record the `svn info` revision as the rollback point in state.
3. Ask the user (AskUserQuestion), then validate:
   - current SSP version (must match `ssp.version` in `solution/project/pom.xml`)
   - target SSP version (must be resolvable for `comp_dependencies`)
   - last-merged base version (the old platform baseline, for the three-way merge)
   - the exact **setup remove / setup** commands and the dedicated, not-in-use target box
   - the Jira project key (and optional epic/labels) for upgrade tickets, or "none" to skip ticket creation
4. Confirm that box is not shared with live work, and that SSH access works (read-only check).

## Phase 1 - First deployment of the target version (this is where conflicts first appear)
1. **The user updates `solution/sysbuild/comp_dependencies`** (and the rootpom `ssp.version` it mirrors) to the target version; the agent doesn't edit these. Ask them to do it and confirm. Then verify read-only: `comp_dependencies` and `ssp.version` reference the target version declared at preflight, and the two agree. If not, stop and tell them what differs.
2. Run `setup remove`, then `setup`, on the upgrade target box (authorised above). This deploys the **target SSP version and the ssp-ext overlay together**. Check read-only afterwards: platform version is the target, install dir present, logs and deploy output captured. If either step fails, stop and report. Conflicts are expected here; they are captured in Phase 4, not fixed now.
3. Copy the deployed platform tree from the box into `.upgrade/platform-new/` (the new platform files, separate from the overlay where the install layout allows; if they can't be separated, record that in state and ask the user how to compare). Obtain the old baseline into `.upgrade/platform-old/` (old dist, SVN tag, or the box before the upgrade). That gives old platform / new platform / customer for a three-way merge.

## Phase 2 - Assessment and Jira tickets -> GATE A
1. Delegate to the `upgrade-assessor` subagent. It writes `.upgrade/assessment.md` and drafts the tickets in `.upgrade/jiras.md`.
2. **Ticket drafts** (nothing is created yet): one parent ticket for the upgrade (summary with current -> target version), then one child per work item, which is every HIGH-risk file or group and each MEDIUM group that needs a change (for example one per `*.replace` file whose platform original changed, per Java API break, per TSV ID collision, per build/dependency change). Low-risk items are listed in the parent only. Each draft has: summary, description (files, what changed in the platform, proposed resolution, risk), acceptance criteria, and a suggested test case, so the Phase 3 test cases and Phase 6 verification trace back to a ticket.
3. Show the user the risk-ranked summary and the ticket list. Get approval before continuing; the user can drop, merge or edit drafts.
4. **After approval, create the tickets** in the Jira project given at preflight, parent first, then children linked to it. Use `node ~/.claude/scripts/jira.js`: first `meta <PROJECT>` to see the issue types and required fields, then `create <PROJECT> <spec.json> --dry` to check each payload, then `create <PROJECT> <spec.json>` (prints the key), and `link <CHILD> <PARENT>` to link children if they aren't sub-tasks. Put any required custom fields (e.g. Epic Link) under `fields` in the spec. If `create` doesn't exist in the installed `jira.js`, don't improvise against the Jira API: tell the user and leave `jiras.md` for them to create by hand. If a call exits with JIRA_AUTH_EXPIRED, stop and ask the user to refresh `~/.jira-cookie`.
5. Record each created key next to its draft in `jiras.md` and in `state.json`. Reference the keys in `conflicts.md`, `iterations.md` and `report.md`. Post a comment on the ticket when its conflict is resolved or its tests are green, and never transition tickets without the user saying so.

## Phase 3 - Test definition -> GATE B
1. Take the assessment's risk list and the project's existing locked tests.
2. Delegate to `test-author` in CASES mode, scoped to upgrade regression: build, config load, UI (Playwright), inbound/outbound file flows, plus a pre-upgrade baseline captured on the OLD version.
3. Intentional `test.fail` markers stay as they are. The user approves the cases; then TESTS mode writes and locks them.

## Phase 4 - Capture conflicts -> GATE C
The merge happens as part of deployment: conflicts only appear once the target platform and the overlay are deployed together (Phase 1, and again after each resolve round in Phase 5).
1. If the deployment also needs e2na p2c, e2sc reloads or a restart, show the user those exact commands and let them run or authorise them. Stop at the first failure and report; never push through, because a failed deploy can leave the server half-configured.
2. Capture the conflicts the deployment reported (deploy output, conflict/reject files, startup and reload errors in the logs; read-only) into `.upgrade/conflicts.md`, each tagged with its assessment risk. Show the user the list and get approval to start resolving.

## Phase 5 - Resolve conflicts
Delegate to the `upgrade-merger` subagent with `.upgrade/conflicts.md`. It resolves each conflict in the working copy using the old platform, new platform and customer versions. Then re-deploy with `setup remove` and `setup` (authorised above) and re-capture as in Phase 4. Repeat until no conflicts remain, max 3 rounds. Unresolved high-risk conflicts go to the user; don't continue past them.

## Phase 6 - Verify and fix (max 3 iterations)
Delegate to `upgrade-verifier`: it runs the locked tests, reads logs (e2sc-logging skill), fixes product/config issues and re-runs. It never edits locked tests to pass. Same stop rules as `/run-loop`. Then delegate to `reviewer`, with the assessment standing in for the ticket.

## Phase 7 - Report
Write `.upgrade/report.md`: versions, files changed by overlay type, auto-resolved vs human-resolved conflicts, test results vs baseline, open issues, server actions taken, rollback revision. Append new platform gotchas to `~/.claude/upgrade/gotchas.md`. Tell the user it is ready for manual SVN check-in.
