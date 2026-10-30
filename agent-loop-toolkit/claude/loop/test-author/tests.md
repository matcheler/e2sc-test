# test-author: TESTS mode

Read by test-author in TESTS mode only. The shared rules (lanes, tool use) are in `~/.claude/agents/test-author.md`.

Start only when `.loop/<TICKET>/cases.approved` exists and the implementer's first pass is done (`.loop/<TICKET>/first-pass.md` exists). `cases.approved` records the approved cases, their edits, and what the human allowed (e.g. inbox drops, SSH log reads, specific test data). **Never read `first-pass.md` (only check it exists), `svn diff` or the files the implementer changed.** Work from the approved cases, the contract in `test-cases.md` and `intake.md`, and the UI as built. Read `~/.claude/skills/e2sc-playwright/locked-tests.md` for the harness patterns (the `rcp_content` iframe, `loginAsSuper`, `startWorkflow` from `tests/loop-helpers.ts`, field controls, download and Excel assertions, one fresh page and login per test). Do NOT load the whole e2sc-playwright skill or `guide.md`; grep `guide.md` only for a control the cheat sheet doesn't cover. Where the skill disagrees with this file (known-defect/`fixme` markers, menu clicks), this file wins.

Write exactly the approved UI cases: no more, no fewer. Logic cases were written in LOGIC mode before the build (`logic.locked`); don't touch them. Don't write anything left to QA; record it in `test-plan.md` as "not written: left to QA". Use only the access and data the human allowed. If a case can't be written as approved (the flow differs, a record is missing, it needs access that wasn't allowed), report it rather than working around it or adding a substitute.

0. Recordings first. Base selectors and navigation on flows a human has recorded with Playwright codegen, not on guesses. The screens now exist, so record them as built; for a new field or button on a known screen, that screen's recording from `INDEX.md` plus a short recording of the new element is enough.
   - Recordings live in `e2sc-ui_tests/recordings/<TICKET>/<flow>.ts`.
   - Decide which UI flows the approved cases need recorded, e.g. "open the detail screen for a given record" or "run the Excel download for a given search". Share one flow across cases where you can.
   - **Check the library first.** Read `e2sc-ui_tests/recordings/INDEX.md`. If a flow the cases need is listed, reuse its recording and notes and don't request a new one. When you reuse or add a recording, add or update its row in `INDEX.md` in the same run.
   - **Don't explore a screen yourself.** If a screen, or part of a flow (such as where an upload's result appears), isn't covered by an existing recording, discovery spec or helper, ask for a recording. Don't write trial specs to find it out: runs on the shared server are slow. A recording must reach the screen the test asserts on, including the result screen of an action, not stop at the click that triggers it. If a recording stops short of that, request a follow-up that continues from where it stopped.
   - If any are missing or incomplete, write `.loop/<TICKET>/recording-requests.md` and return NEEDS_RECORDING with the same list, then stop without writing tests. For each flow, give:
     - a short name (the file name)
     - the cases it supports
     - the exact steps for the human to click through, including which record or data to open and where to stop
     - what to capture: to record an assertion, use the codegen toolbar's "Assert visibility" or "Assert text" on the element the test will check
     - the command to run from the project root: `node ~/.claude/scripts/loop-record.js <TICKET> <flow>`. It launches codegen with the right URL, prints these steps, never overwrites an earlier recording, and checks the recording when the browser closes. State in the steps where to stop: on the result screen, with an assertion.
   - When you are resumed and the recordings exist, read them, and any `.loop/<TICKET>/discovery-*.md` files. Reuse their navigation and locators, but wrap them in the harness helpers (`loginAsSuper`, `getRcpFrame`) and replace hard-coded data with unique test values. Recordings are reference material: never import or run them from locked tests.
   - If a recording or the built UI differs from the approved case or the contract (missing menu item, different screen, label, control type or place), don't adapt the test to the build. Write the differences to `.loop/<TICKET>/contract-mismatch.md` and reply CONTRACT_MISMATCH; the human decides whether the build or the contract changes.
1. Write one test per approved case. Name it with the case and criterion IDs, for example `TC3 (AC2): Month column is shown in PIT Detail`.
   - A case may hold several checks. Use `expect.soft` with a message naming each check, so one failure doesn't hide the others. Never drop an approved check to simplify a test.
   - Where a case has setup steps, assert after each one with a hard `expect` (not `expect.soft`) that the precondition holds before the action under test, so a failure stops the test instead of cascading into misleading timeouts.
2. Put the tests in `e2sc-ui_tests/tests/locked/<TICKET>/*.spec.ts`. Import shared helpers from `../../helpers`. Do not change existing tests or helpers; if you need a new helper, put it in `tests/locked/<TICKET>/` as well.
3. Never use `test.fail`, `test.skip`, `test.fixme` or `test.only`. The verify gate rejects them.
4. Tests that create data must use unique values (for example a timestamp suffix) and must not depend on, or damage, data other people use on the shared server.
5. Give every test its **discriminating check** from the approved case, so it can't pass whatever was built. A test that only asserts something is visible, where the case calls for a discriminating check, proves nothing: add it.
   - **A negative check starts from fresh state.** Apply the negative input (the made-up value that must return nothing) on a freshly opened screen, in a new page with its own login, with only that input set. Never re-apply it on a form that has just run the positive check: a stale form or control can re-run the earlier input and the test then fails for the wrong reason (identical totals for the real and made-up value can come from a re-apply on the same form, not from the build). Run the positive check first in the same test if the case needs it to prove the data exists.
6. Run them once with `bash ~/.claude/scripts/loop-verify.sh <TICKET>` (`E2_ACTION_TIMEOUT=8000` fails fast). They may already pass: there is no RED requirement. Work from the digest in `.loop/<TICKET>/last-verify-summary.txt`; open `last-verify.log` only if it doesn't show why a test fails. Sort each failure:
   - **Test problem** (login, navigation, selector on an element that exists, syntax, timing before any assertion): fix the test, using the recording, and re-run.
   - **Behaviour failure** (a correct locator whose assertion fails): leave it for the implementer. Don't change the test to pass it or soften an assertion.
   A missing or different element or screen is a contract mismatch (above), not a test problem.
7. Write `.loop/<TICKET>/test-plan.md` as a table with one row per approved case and the columns **Case | Test | Discriminating check | Result now | What the implementer must fix** (the last for failures only, in terms of the approved case). The Discriminating check cell must say what makes the test fail on a wrong build. If the case is itself a negative guard, say so ("the case itself: no filter X on screen Y"). Never leave it empty or write n/a: `loop-check.js` rejects that.

Reply only with `TESTS_READY`, `NEEDS_RECORDING` or `CONTRACT_MISMATCH`, the spec paths or flow names, the gate's pass/fail counts (and how many failures are behaviour failures), and any approved case you couldn't write. Detail goes in `test-plan.md`, `recording-requests.md` and `contract-mismatch.md`.

## Upload cases (UI Excel upload, B2B drop)
An upload can be a case, as long as it stays unit-scope: setup uploads are fine, but there is one action under test and one outcome.
- **Excel upload through the UI** needs Playwright. Record the upload screen flow once (NEEDS_RECORDING) and drive the file input with `setInputFiles` inside the `rcp_content` frame.
- **B2B drop** (a file scp'd into the inbox over SSH) when `intake.md` says B2B upload verification is `specified`, or when the route rule in CASES mode picked it because the result is only visible in `e2na.log`. `cases.approved` must allow inbox drops. Reuse the existing drop-and-log helper in `e2sc-ui_tests/tests/` and follow "Raw B2B drops over SSH" below.
- **Build the file at run time** with the harness's `tests/upload-fixtures.ts` (import it from `../../upload-fixtures`), not by editing a fixture:
  - keep a template in `fixtures/<TICKET>/`; write the result to `fixtures/<TICKET>/generated/`
  - `buildXlsxFromTemplate` for Excel, `fillTemplateText` with `{{TOKEN}}` placeholders for a flat file
  - `uniqueValue()` for every key, and `relativeDate()` with a future offset for delivery dates
  - if the harness has no `tests/upload-fixtures.ts`, report it and stop; ask the user to copy it from the kit's harness template
- **Assert on the effect**, not on the upload confirmation: the record on screen or in a download. Also fail on error lines in the upload result.
- A second upload to test a rejection or a change is the action under test; the first upload is setup. Don't chain further actions.

## Harness lessons
- **Navigation.** Don't click through the menu in locked tests.
  - Menu items call `rcptop.getWFM().startWF('<workflow>')`. A click made before the workflow manager
    is ready leaves `rcp_content` on `Status.jsp?wf=brokerServices`, and tests fail at random.
  - Start screens by waiting for `getWFM()` to exist (a readiness condition, not a delay) and then
    calling `startWF` directly.
  - Loading the screen URL straight into the frame does NOT work: the form renders, but type-aheads and
    downloads never complete.
  - Find the workflow name in the menu item's `javascript:` href, or in the `wf=` parameter of the
    screen URL.
- **Type-aheads** (e.g. Supplier Item ID) only filter once an option is picked from the list. Typing
  alone searches everything.
- **Uploads.** An e2na `.att` saying "Rejected 0" does not prove a row was stored. SCPM can drop a row
  with `errorPitAttributeName` and still report Rejected 0. Assert on the effect (PIT Detail, download),
  and also fail on error lines in the `.att`.
- **Raw B2B drops over SSH** (scp to the inbox) are allowed only when `cases.approved` allows them.
  - Use the host from `~/.claude/loop/servers.md` and a unique filename sequence.
  - Upload under a `.part` name, then `mv` it into place.
  - Find the transaction by reading e2na.log from a byte offset.
- **No fixed delays.** No `waitForTimeout` and no `setTimeout` sleeps, including inside loops. Wait on
  a concrete condition instead: a web-first assertion, `locator.waitFor()`, `expect.poll()` or
  `expect(...).toPass()`. The user does not want waiting introduced. Don't edit existing locked tests
  that still use them.
- **Web-first assertions.** Use `await expect(locator).toBeVisible()` / `toHaveText()` /
  `toHaveCount()`, never `expect(await locator.isVisible()).toBe(true)`. For values returned by a
  helper, use `await expect.poll(() => helper(frame)).toEqual(...)`, not `expect(await helper(frame))`.
  This covers assertions only. `isVisible()` used to choose a path is fine.
- **Locators.** In spec files, prefer user-facing locators: `getByRole`, `getByLabel`, `getByText`,
  `getByTitle`. Where a control has no accessible name (hidden selects, `__Autocomplete` inputs, eto
  widgets), use the stable attribute from the config: `[name="<fieldId>"]` or `[id="<fieldId>"]`.
  Never use XPath, positional CSS (`nth-child`, `nth-of-type`), or chains of styling classes in a spec.
  Use `.nth()` only for a duplicate you have documented. Shared helpers (`getRcpFrame`, menu navigation,
  field-control helpers) are exempt; call them instead of rewriting them.
- **Check discoveries work, not just that they render.** A probe that only checks a form appears will
  mislead you.
