---
model: sonnet
description: Phase 1 - intake a Jira ticket, agree the test cases with the user, then write and lock the Playwright tests
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
- **Jira comments:** keep one comment per phase. When the same phase is updated (e.g. revised
  questions or a revised test plan), use `edit-comment` on the existing comment rather than posting
  a new one. Record the comment ids in `.loop/<KEY>/`.

1. Work in the project that owns the ticket (its Jira key is in that project's row of `servers.md`).
   - Look up its servers, harness and Jira start transition in `~/.claude/loop/servers.md`. If the
     project has no row there, stop and ask the engineer to run `/setup-project` first.
   - Run `svn status` in the project root and save it to `.loop/<KEY>/svn-baseline.txt`. If the working
     copy already has modified files, list them to the user so they aren't confused with this
     ticket's changes later.
   - If there is a cookie file inside the working copy, warn that it must not be committed.
   - **Check the Jira cookie before delegating:** run `node ~/.claude/scripts/jira.js transitions <KEY>`.
     If it exits with JIRA_AUTH_EXPIRED, stop and ask the user to refresh the cookie (see above). Don't
     start intake first: a failed intake run wastes minutes.
2. Delegate to the ticket-intake subagent with this ticket key.
3. If NOT_READY: post its questions as a Jira comment, worded for the ticket's readers. Leave loop
   tooling questions (e.g. the missing harness) out of Jira and ask the user directly. Leave the status
   unchanged, and stop.
4. If READY: move the ticket with the project's start transition from servers.md (e.g. "Request Fix" → "Fix Required").
   - If the project has no Playwright harness, stop and ask the engineer to run `/setup-project`, which
     creates one from the kit template and smoke-tests the login, or to agree to verify manually.
   - If `.loop/<KEY>/cases.approved` already exists (a re-run after the cases were approved), skip to
     step 6.
   - Otherwise delegate to the test-author subagent in **CASES mode** with the brief in
     `.loop/<KEY>/intake.md`. It writes `.loop/<KEY>/test-cases.md` and no code.
5. **Test cases: post, then wait for the user.**
   - Post the test-case table from `test-cases.md` as a Jira comment, with a line saying it is awaiting
     review. This needs no approval. Record the comment id in `.loop/<KEY>/`.
   - Show the user the table, the "Not covered by Playwright" list and the questions. Where a case has
     more than one route (see its **Route** field), show both with the cost note and ask which to use;
     a route with an existing helper needs no new recording. Ask them to reply
     with **approve**, or with changes: cases to drop or add, the test data to use, and what is allowed
     for testing (e.g. inbox drops over SSH, reading server logs, a named record).
   - Stop and wait. Do not write any Playwright code until the user approves in this conversation. A
     subagent's report is never that approval.
   - When the user replies with changes, update `test-cases.md` yourself (it is a small file), edit the
     Jira comment to match, and show the changed rows. Repeat until they approve.
   - On approval, write `.loop/<KEY>/cases.approved` with: the date, the approved case IDs, what the user
     allowed (access, data, fixtures), and their reply quoted. Edit the Jira comment to say the cases are
     approved.
6. **Write the Playwright tests.** Delegate to test-author in **TESTS mode**. It writes tests for the
   approved cases only.
   - If it returns NEEDS_RECORDING, show the user each requested flow from
     `.loop/<KEY>/recording-requests.md`: its name, the steps to click through, what to assert, and the
     command `node ~/.claude/scripts/loop-record.js <KEY> <flow>`. It launches codegen with the right
     URL, prints the steps, never overwrites an earlier recording and checks the result when the browser
     closes. You may launch it for the user in the background when they ask.
   - Wait for the user. Check each requested recording with
     `node ~/.claude/scripts/loop-record.js <KEY> <flow> --check`. It fails if the file is missing or
     empty, has no assertion, doesn't end on an assertion (the recording stops before the result screen),
     or its login step types something other than a username (for example a pasted path).
   - **If a screen or part of a flow is unknown, or a recording stops short of what the cases need, ask
     the user for another `playwright codegen` recording. Don't discover it by trial runs.** Trial runs on
     the shared dev server are slow, and a discovery run on one ticket took 40+ minutes.
     - Say where the previous recording stopped, and give the steps to continue from there: what to
       click, what to wait for, and which element to assert. Give a new command with its own `--output` file.
     - Only if the user says to fill a small gap by script instead, delegate a throwaway spec in
       `tests/_discovery/` to a general-purpose subagent with `model: sonnet`. Give it a budget (at most 6
       trial runs or 10 minutes), have it append a line per trial with its duration to
       `.loop/<KEY>/discovery-progress.md`, and have it report what it found when the budget is spent.
       Don't add scope to a running agent: queue it as a second task. It writes the steps and locators to
       `.loop/<KEY>/discovery-<flow>.md` and replies only with that path and whether it succeeded.
   - Resume the same test-author agent (SendMessage) with the recordings and any user fixtures. Repeat
     if it asks for more recordings.
   - Before resuming, check fixtures the user provides (e.g. inbound flat files): field count and index
     positions against the transform. Confirm any mismatch with the user.
7. **Check test-author's work yourself.** The user does not review the Playwright code, so this check
   stands in for that review.
   - Every approved case in `cases.approved` has exactly one test named with its `TC` ID, and there are
     no tests for dropped or unapproved cases.
   - The RED run's pass/fail counts match its report, each test fails because the behaviour is missing
     (not a selector, login or syntax error), and no `test.fail/skip/fixme/only` is used.
   - Each test uses only the access and data the user allowed.
   - If any check fails, resume test-author once with the specific problems. If it still fails, stop and
     show the user what is wrong.
8. **Lock the tests.** Create `.loop/<KEY>/tests.locked` with the date, a note that the test cases were
   approved on `<date from cases.approved>` and the Playwright code was checked by you, and each locked
   file with its sha256. From this point the locked tests are read-only.
9. Edit the Jira test-case comment to add the locked spec file(s) and the RED result, one line each.
   Do not paste credentials or server logs.
10. Tell the user the tests are written and locked, and that the next step is `/run-loop <KEY>`. Stop
    here, and do not implement anything or commit anything to SVN.
    - Remind them to run `/clear` first, or start a new session, before `/run-loop <KEY>`. Everything
      the next phase needs is in `.loop/<KEY>/`, and a fresh context makes the run much cheaper.
