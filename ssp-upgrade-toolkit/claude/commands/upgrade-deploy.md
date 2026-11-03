---
description: Step 2 of 3 of an SSP upgrade - deploy the target version onto the upgrade box, capture and resolve the conflicts, conflict report. Run after /upgrade-prepare; resumable; stops at human gates.
argument-hint: [resume]
---

Argument: $ARGUMENTS (empty or `resume`: continue from `.upgrade/state.json`).

This is the second of the three upgrade commands: `/upgrade-prepare`, then `/upgrade-deploy` (this one, Phases 3-5b), then `/upgrade-validate`. **Read `~/.claude/upgrade/rules.md` first**: the roles, the two boxes, the server-action rules, the subagent return contract, the `state.json` fields and the budgets are defined there and apply here. If it is missing, stop and tell the engineer to reinstall the kit. Ideally run it in a fresh session (`/clear` first): everything it needs is in `.upgrade/` and `.loop/`.

## Before you start
1. `.upgrade/state.json` must exist with Gates A and B recorded, the Phase 2 suite locked (`unitSuiteLocked` in state and `.loop/<TICKET>-unit/tests.locked`), the version files checked in (`versionFilesRevision`) and a green Bamboo build (`bamboo`). If not, stop and tell the engineer to continue with `/upgrade-prepare resume`. Exception: an upgrade started under the old numbering records Gate B as "skipped: upgrade predates Phase 2" (rules.md) and has no Phase 2 suite.
2. **Read the test id.** `<TICKET>` is `ticket` in `state.json`. If it is missing, stop and tell the engineer to continue with `/upgrade-prepare resume`, which records it. Never ask for one or invent one.
3. Read `authorisation` in state: it says whether the orchestrator may run `setup remove`, `setup` and the `setup migrate` commands on the target box. Check that the target box recorded there is the box you are about to use.
4. Read `~/.claude/upgrade/gotchas.md`. Only the orchestrator (this session) writes `state.json`: update it after every step. On `resume`, skip what is already done: a recorded deploy with a clean smoke check means Phase 4; Gate C recorded means Phase 5; no open conflicts and a clean smoke check after the last redeploy means Phase 5b; `conflict-report.html` written means this command is finished.

## Phase 3, steps 3-5 - Deploy the target version (this is where conflicts first appear)
Steps 1-2 (version files, check-in, Bamboo build) were done in `/upgrade-prepare`.
3. **Deploy and migrate** (as authorised at preflight; if not authorised, show each command and wait for the engineer to run it). The orchestrator runs each command in turn and logs it in `.upgrade/server-actions.md`: `setup remove`, then `setup`. During the setup, ask the engineer for the `setup migrate` commands: they give them as the setup reaches each point, and the orchestrator runs each exactly as given, one at a time, never inventing, editing or reordering one, and records each in state (`migrateCommands`). If they give none, say so and ask whether any are needed before going on. This deploys the **target SSP version and the ssp-ext overlay together**. After each step check read-only: the exit status and the output. At the end check that the platform version is the target, the install dir is present, and the logs and output are captured.
4. **STUCK: escalate if a step fails.** Stop at the first failure of `setup remove`, `setup` or any `setup migrate` command (a non-zero exit, an error in its output, or an install that doesn't reach the target version). Don't retry, don't run the later steps, and never run `setup remove` again to try again without the engineer's say, because it wipes the install. Mark the phase STUCK in state and write `.upgrade/stuck-deploy.md`: which command failed, its exit code and the last lines of its output, which migration step it was (if any), why it most likely failed (from the output and read-only log reads with the e2sc-logging skill), what you checked, and the options (fix and re-run that step, run a migrate command by hand, or restore). Show it to the engineer and wait.
5. Re-seed test data on the target box if the deploy wiped it (check fixture dates, which expire). Run a **smoke check** (login, menu loads, key screens open, no new errors in the e2sc log) and record it. Conflicts are expected here; they are captured in Phase 4, not fixed now.

## Phase 4 - Capture conflicts -> GATE C (engineer)
The merge happens as part of deployment: conflicts only appear once the target platform and the overlay are deployed together (Phase 3, and again after each resolve round in Phase 5).
1. If the deployment also needs e2na p2c, e2sc reloads or a restart, show the engineer those exact commands and let them run or authorise them. Stop at the first failure and report; never push through, because a failed deploy can leave the server half-configured.
2. Capture the conflicts the deployment reported (deploy output, conflict/reject files, startup and reload errors in the logs; read-only) into `.upgrade/conflicts.md`, each tagged with its assessment risk and ticket key.
3. Cross-check: every HIGH item in `assessment.json` must either appear in `conflicts.md` or be marked "no action, because...". Show the engineer the list and get approval to start resolving (Gate C).

## Phase 5 - Resolve conflicts
Delegate to the `upgrade-merger` subagent with `.upgrade/conflicts.md`. It resolves each conflict in the working copy using the old platform, new platform and customer versions. It fixes only what resolving the conflict needs: any other scenario it finds that should be fixed goes in `merge-log.md` as a **FIX-NEEDED** entry (file, scenario, likely cause: merge, platform or already broken before the upgrade, proposed fix), for triage at Gate D. Then redeploy with plain `setup` (as authorised; the install and seed data are kept) and re-capture as in Phase 4. After each redeploy run the smoke check. Repeat until no conflicts remain, max 3 rounds. Unresolved high-risk conflicts go to the engineer; don't continue past them. Count each redeploy in state.

## Phase 5b - Conflict report (after the deployment succeeds)
Runs once, after the last resolve round's redeploy has succeeded and the smoke check is clean. It is a read-only summary of what the deployment reported and what the merge did, so the engineer and QA can see it without reading the working files.
1. Build `.upgrade/conflict-report.html` from `conflicts.md`, `merge-log.md`, `assessment.json` and `iterations.md` (if present). One self-contained HTML file (inline CSS, no external scripts, readable in light and dark mode). Contents:
   - header: ticket, current -> target version, target box, date, and the redeploy count used
   - summary counts: conflicts captured, merged, left for the engineer, and by risk (HIGH / MEDIUM / LOW)
   - table of **conflicts** (file, component, risk, ticket key, what conflicted, and the round it was first seen in)
   - table of **merged conflicts** (file, assessment id, how it was resolved, which side(s) were kept, ticket key)
   - table of **FIX-NEEDED** items (file, scenario, likely cause, proposed fix), marked "for triage at Gate D"
   - any conflict still open, with the reason and who must decide
   - the final deployment and smoke-check result
   No credentials, hostnames beyond the box name, or log extracts.
2. Record the path in state (`conflictReport`); `/upgrade-validate` lists it in `report.md` (Phase 8).
3. Share it: give the engineer the path and, when the engineer says so, attach it to the parent ticket or send it to QA so they can plan their regression. Don't publish it anywhere yourself, and never transition tickets.

## Done
When no conflicts remain and the conflict report is written, record the phase in state and tell the engineer: run `/clear`, then `/upgrade-validate` (Phases 6-9: the cases the merge added, the first run on the target box, verify and fix, the report, and QA's regression).
