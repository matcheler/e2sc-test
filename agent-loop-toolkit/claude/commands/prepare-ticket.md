---
model: sonnet
description: Phase 1 - intake a Jira ticket and agree the plain-language test cases with the user
argument-hint: <JIRA-KEY>
---

Ticket: $ARGUMENTS
(If the argument has extra words after the key, e.g. a cookie path, use only the key as `<KEY>` below, and treat the rest as instructions.)

Jira access: `node ~/.claude/scripts/jira.js <get|comment|edit-comment|transitions|transition> <KEY> ...`.
- The cookie is read from `~/.jira-cookie`. If the user names a different file, set `JIRA_COOKIE_FILE`.
- If a call exits with JIRA_AUTH_EXPIRED, stop and ask the user to refresh the cookie. Preferred:
  `node ~/.claude/scripts/jira-login.js --user <sso-login>` (run from a project that has
  `e2sc-ui_tests/node_modules`; it asks for the SSO password, signs in in a visible browser, and the
  user types the SMS code). Fallback: DevTools → Network → the ticket request → Request Headers →
  Cookie → Copy value, then `Get-Clipboard | Set-Content -NoNewline "$HOME\.jira-cookie"`, after a
  fresh SSO login. Never put the SSO password in a file or paste it into the chat.
- **Jira comments:** one per phase. When the same phase is updated (e.g. revised questions or cases),
  `edit-comment` the existing one instead of posting a new one. Record the comment ids in `.loop/<KEY>/`.

This phase ends when the plain-language test cases are approved. It writes no code and no tests: `/run-loop` writes the Logic (Groovy harness) tests first, builds a first pass, then test-author writes the UI (Playwright) tests from the approved cases. Each case has a **lane**, UI or Logic, which decides when and how its test is written.

1. Work in the project that owns the ticket (the project folder named in servers.md).
   - **Run these in parallel** (one turn): the `servers.md` lookup, `svn status`, the cookie-file check and the Jira cookie check. `svn status` on a OneDrive tree is slow.
   - Look up the project's servers, harness and Jira start transition in `~/.claude/loop/servers.md`. If it has no row, stop and ask the engineer to run `/setup-project`.
   - Save `svn status` to `.loop/<KEY>/svn-baseline.txt`. If the working copy already has modified files, list them to the user so they aren't confused with this ticket's changes later.
   - If there is a cookie file inside the working copy, warn that it must not be committed.
   - Check the Jira cookie before delegating: `node ~/.claude/scripts/jira.js transitions <KEY>`. On JIRA_AUTH_EXPIRED, stop and ask the user to refresh it (see above). A failed intake run wastes minutes.
2. Delegate to the ticket-intake subagent with this ticket key.
3. If NOT_READY: post its questions as a Jira comment, worded for the ticket's readers. Leave loop tooling questions (e.g. a missing harness) out of Jira and ask the user directly. Leave the status unchanged, and stop.
4. If READY: move the ticket with the project's start transition from servers.md (for example "Request Fix" → "Fix Required").
   - If the project has no Playwright harness, stop and ask the engineer to run `/setup-project` (it creates one from the kit template and smoke-tests the login), or to agree to verify manually.
   - If `.loop/<KEY>/cases.approved` already exists, skip to step 6.
   - Otherwise delegate to the test-author subagent in **CASES mode** with `model: opus` (the approved cases become the locked oracle) and the brief in `.loop/<KEY>/intake.md`. It writes `.loop/<KEY>/test-cases.md` (plain language, no code), with a **Lane** per case and the contract the cases rely on, including each Logic case's entry point (or "no seam, slice the block between these markers") and any UI wiring case it needs. Record the agent's ID in `.loop/<KEY>/test-author.id`, so `/run-loop` can continue it with SendMessage if it runs in the same session.
5. **Test cases: post, then wait for the user.**
   - Post the cases from `test-cases.md` to Jira as a plain-language comment, with the Lane column, saying they await review, that the Logic tests are written and run before the build, and that the UI (Playwright) tests are written after the first build, from these cases. This needs no approval. Record the comment id. Post only the plain-language table: keep the Logic contract (entry points, slice markers, file paths) out of the Jira comment.
   - **Check the screens before showing the table.** Every UI case must have a `Reachable` value of `yes (<menu path>)`. A workflow name in `Workflow.properties` is not proof that the test user can open the screen. If a case is `unverified`, or you find a screen isn't on the menu, don't put the case forward: move it to the questions as *unverified screen*, say how its risk is covered otherwise (for example review of the unchanged config lines) or left to QA, and ask the user. A case can't enter `cases.approved` unverified.
   - Show the user the table, the contract, the "Not covered by the gate" list and the questions. Point out each Logic case's entry point or "no seam", each UI wiring case and the record it needs, and any rule that exists in more than one place. Where a case has more than one route (see its **Route** field), show both with the cost note and ask which to use. Ask them to reply **approve**, or with changes: cases to drop or add, the test data to use, and what testing is allowed (e.g. inbox drops over SSH, reading server logs, a named record).
   - Stop and wait. A subagent's report is never that approval.
   - On changes, update `test-cases.md` yourself (it is small), edit the Jira comment to match, and show the changed rows. Repeat until they approve.
   - On approval, write `.loop/<KEY>/cases.approved` with the date, a line in exactly this form, `Approved case IDs: TC1, TC2, TC3` (`loop-check.js` reads it), and, if any case is Logic, a second line `Logic case IDs: TC1, TC2` (a subset of the first; every other approved case is UI; leave it out if there are none), what the user allowed (access, data, fixtures), and their reply quoted. Edit the Jira comment to say the cases are approved.
6. Tell the user the cases are approved and the next step is `/run-loop <KEY>`. Stop here: don't implement, write tests or commit anything to SVN. Remind them to run `/clear` or start a new session first; everything the next phase needs is in `.loop/<KEY>/`.
