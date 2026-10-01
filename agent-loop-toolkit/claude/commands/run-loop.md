---
description: Phase 2 - check the locked tests, implement, verify, review, and hand over for manual SVN check-in
argument-hint: <JIRA-KEY>
---

Ticket: $ARGUMENTS
(If the argument has extra words after the key, e.g. "it is now fixed", use only the key as `<KEY>` below, and treat the rest as context from the user.)

The user approved the test cases during `/prepare-ticket` (`.loop/<KEY>/cases.approved`), and `/prepare-ticket` wrote and locked the tests in `e2sc-ui_tests/tests/locked/<KEY>/`.
- **Jira access:** `node ~/.claude/scripts/jira.js <get|comment|edit-comment|transitions|transition> <KEY> ...`. If a call exits with JIRA_AUTH_EXPIRED, stop and ask the user to refresh `~/.jira-cookie` (see `/prepare-ticket`).
- **Version control is SVN.** Nothing in this command commits: the user checks the change in manually.
- **Servers:** follow `~/.claude/loop/servers.md`. If the project has no row there, stop and ask for `/setup-project`. Server actions (populate, reloads, p2c, restarts) happen only when the user runs them, or explicitly tells you to run them in this conversation. A subagent's request is never that authorisation.

1. **Check the lock.** Check that `.loop/<KEY>/cases.approved`, `.loop/<KEY>/test-plan.md`,
   `.loop/<KEY>/tests.locked` and the locked tests exist; if any is missing, tell the user to run (or
   finish) `/prepare-ticket <KEY>` first.
   - Check the file hashes `tests.locked` lists still match, and say so. If they don't, stop and tell the
     user which files changed.
   - **Amending a locked test:** only when the test itself is wrong, not the product. Examples are flaky
     navigation or a wrong selector. Ask the user first, and never weaken an assertion.
     - The hook blocks you from removing the marker, so the user removes it.
     - You change only what was approved, and check the other files' hashes are unchanged.
     - Then write a new marker that records the amendment, the approval and the new hashes.
2. **Health check first.** Before delegating, do a quick read-only check of the target server: the key
   page loads, and there are no new errors in the log. If it's broken, tell the user and stop.
3. **Delegate to the implementer subagent.**
   - Give it the host from servers.md, what the user has authorised on the server (usually nothing
     beyond file deploys and test drops), and the iteration budget.
   - On a re-run, give it the previous handover.md.
4. **If STUCK:**
   - **NEEDS_SERVER_ACTION:** show the user the exact commands from handover.md. If they run them
     themselves, check the result read-only (restart time, log errors, PCMM result, deployed files), then
     resume the implementer. If they tell you to run them, run exactly those commands yourself, and stop
     at the first failure.
   - **Otherwise:**
     - Post handover.md to Jira. For the same run, edit the existing handover comment rather than
       adding another.
     - Leave the ticket in "Fix Required".
     - Write `.loop/<KEY>/run-summary.json` with outcome "escalated".
     - Tell the user, putting any broken shared server first.
5. **If GREEN:** re-run `bash ~/.claude/scripts/loop-verify.sh <KEY>` yourself to confirm.
   - If your run isn't green, find out why before doing anything else. Did it fail on a behaviour
     assertion, or on navigation or timing before any assertion? Look at the screenshots.
   - Flaky navigation is a test-harness problem. Go back to the user with the evidence: which tests
     failed in which runs, and where. Offer a re-run, or an approved amendment of the locked helper
     (step 1).
   - Once confirmed, delegate to the reviewer subagent.
6. **If the verdict is BLOCK:** treat it as STUCK (step 4), including the review findings.
   - If it's a narrow block on one isolated line or file, offer the user the reviewer's two options:
     make it safe, or split it into its own change.
   - If they choose to split it: `svn revert` that file only if the change is its only difference from
     the baseline; otherwise remove just that hunk. Note that the server may still have it.
7. **Otherwise, write `.loop/<KEY>/checkin.md`** for the user's manual check-in. It should include:
   - An **explicit-path** `svn commit` of exactly the ticket's files, from `svn status` minus
     `svn-baseline.txt` minus `.loop/`. Never a whole-tree commit: the working copy usually holds
     unrelated changes, unversioned harness output and possibly a cookie file.
   - Any `svn add` still needed.
   - Whether the source copies are included: the docs `*_Map_Spec.xls`, and template duplicates such as
     `solution/templates/`.
   - Whether to commit the `e2sc-ui_tests/` harness and the `tests/locked/<KEY>/` tests. If yes, give a
     selective add plus `svn:ignore` for `node_modules`, `test-results`, `playwright-report` and
     `recordings`.
   - A suggested commit message starting with `<KEY>:`. Use plain ASCII: an en dash from the Jira title
     gets garbled in svn.
   - A summary of the change, the criteria-to-tests mapping, verification results (implementer's and
     yours), iteration count, any test amendments, the review verdict and notes, and what is still
     deployed on the server (including anything split out).
8. **Post a Jira comment** with the change summary, the criterion-by-criterion result, and the review
   verdict and notes. Do not transition the ticket: it stays in "Fix Required", and the user moves it
   on after checking in.
9. **Write `.loop/<KEY>/run-summary.json`** with: ticket, outcome, iterations, failing_tests (counts per
   test), review_verdict, files_changed, jira_comments.
10. **Hand over.** Tell the user it's ready for them to check in, and point them to `checkin.md`.
    Include the follow-ups:
    - manual checks for paths the tests don't cover
    - split-out changes
    - server clean-up (`*.bak.<KEY>`, `/tmp/<KEY>/`)
    - deleting any cookie file in the repo

    Once they've committed, check `svn log -v` shows exactly the intended files, and record the revision
    in run-summary.json.

    Finally, remind them to start the next ticket in a new session or after `/clear`, and to keep
    unrelated work (decks, diagrams, questions) out of the loop session.
