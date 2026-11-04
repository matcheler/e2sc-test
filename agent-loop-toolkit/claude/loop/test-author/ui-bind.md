# test-author: UI-BIND mode (Phase B)

Read by test-author in UI-BIND mode only. The shared rules (lanes, tool use) are in `~/.claude/agents/test-author.md`.

The UI tests were written before the build by the **ui-assert** agent, from `cases.approved` alone, and locked in `.loop/<TICKET>/ui.locked`:
- `e2sc-ui_tests/tests/locked/<TICKET>/specs/*.spec.ts`: complete tests with every expected value. **Read-only for you and everyone.**
- `e2sc-ui_tests/tests/locked/<TICKET>/pages/*.ts`: page-object classes whose methods are named after the case steps and checks, with bodies that throw `UNBOUND`.

Your job is to **bind** that interface to the built UI: fill in page-object method bodies with locators, clicks, navigation and waits. Nothing else. Start only when `ui.locked` and `.loop/<TICKET>/first-pass.md` exist. **Never read `first-pass.md` (only check it exists), `svn diff` or the files the implementer changed.**

## Inputs
- the built UI, through recordings (below)
- `e2sc-ui_tests/recordings/INDEX.md` and the recordings it lists
- the locked page-object interface (`pages/`), and the specs (read them to see how each method is used; never edit them)
- `cases.approved` (the contract: model IDs, workflow names, `Navigation labels:`)
- `~/.claude/skills/e2sc-playwright/locked-tests.md` for the harness patterns (`rcp_content` iframe, `loginAsSuper`, `startWorkflow` from `tests/loop-helpers.ts`, field controls, downloads). Do NOT load the whole e2sc-playwright skill; grep `guide.md` only for a control the cheat sheet doesn't cover. Where the skill disagrees with this file, this file wins.

## You may
- Replace a method's `unbound(...)` body with code that does that step or returns that value: locators, clicks, fills, navigation (`startWorkflow`), waits on a concrete condition (`locator.waitFor()`, `expect.poll` is not allowed here, see below).
- Import shared helpers into a page file (`../../../helpers`, `../../../loop-helpers`, `../../../excel`, `../../../upload-fixtures`).
- Add `private` helper methods to a class (excluded from the signature lock, same lint as the rest).

## You must not (loop-ui-check.js and the hook fail the run on these)
- Edit anything under `specs/`, or any file outside `pages/` (including the shared `tests/*.ts` helpers).
- Change, add or remove a public method or its signature (name, parameters, return type), or the constructor. Add no new classes or files.
- Put `expect(` in `pages/`. A page method does or returns; the spec judges.
- Hard-code an expected value from a spec assertion in `pages/` (a label, status, message the spec checks). **Locate by model ID** from the contract (`[id="PoHeader.CustomerName__Autocomplete"]`, `[name="..."]`, workflow names). Labels on the contract's `Navigation labels:` list may be used to locate (tabs, headings, menu entries); nothing else.
- Hide a missing step: no "click if present", `isVisible()`/`isHidden()`, `locator.or(...)` fallbacks, `.catch(`, `try {`, `timeout: 0`, `if (await ...)`, ternaries on awaited values, fixed delays (`waitForTimeout`, `setTimeout`).
- Fake the app: no `page.route`, `routeFromHAR`, `addInitScript`, `exposeFunction`; `evaluate` only to read (text, attributes, element order), never to set values, dispatch events or call app functions (the only exception is `startWorkflow` calling `startWF`).
- Return a value a query method computes to look right (a constant, a value that ignores the page). Query methods return what the screen shows.

## Steps
0. **Recordings first.** Base locators and navigation on flows a human recorded with codegen, not on guesses.
   - Recordings live in `e2sc-ui_tests/recordings/<TICKET>/<flow>.ts`. Check `INDEX.md` first and reuse listed flows; add or update a row when you reuse or add one.
   - **Don't explore a screen yourself** with trial specs. If a step's screen or element isn't covered by a recording, discovery file or helper, write `.loop/<TICKET>/recording-requests.md` and reply `NEEDS_RECORDING`, then stop. Per flow: a short name, the cases and page methods it supports, the exact steps (which record, where to stop: on the result screen, with an "Assert visibility"/"Assert text"), and the command `node ~/.claude/scripts/loop-record.js <TICKET> <flow>`.
   - Recordings are reference material: never import or run them from locked tests.
1. **Bind** every public method of every page class. Wrap recorded locators in the harness helpers (`loginAsSuper`, `startWorkflow`, `getRcpFrame`/`rcp`). Don't click through the menu: start screens with `startWorkflow`. Type-aheads only filter once an option is picked.
2. **A step can't be bound → `CONTRACT_MISMATCH`.** If the built UI has a step the case doesn't (an extra confirmation), lacks one the case names, needs them in another order, or puts an asserted element somewhere other than the contract says (different screen, model ID, control type), don't resolve it by rebinding a method to something else, merging steps, or adding hidden steps. Write each difference to `.loop/<TICKET>/contract-mismatch.md` (case, step/method, what the contract says, what the UI does, the recording that shows it) and reply `CONTRACT_MISMATCH`. The user decides.
3. Run the gate once: `bash ~/.claude/scripts/loop-verify.sh <TICKET>`. It runs `loop-ui-check.js` first (exit 4 `CHECK:` = you broke a rule above: undo it), then the tests, and appends a classification of each failure to `.loop/<TICKET>/last-verify-summary.txt`:
   - `UNBOUND`: a method you haven't bound. Bind it.
   - `BINDING` (the failure is inside a page-object method: a locator that doesn't resolve, a click that times out): a binding problem. Fix it from the recording and re-run.
   - `ASSERTION` (a spec `expect` failed on a bound value): **a defect for the implementer.** Leave it. Don't touch the method that feeds it to make it pass.
   - `OTHER`: read `last-verify.log`; login or navigation before the first step is infrastructure (report it).
4. Update `.loop/<TICKET>/test-plan.md` (written by ui-assert): set **Result now** for each case, and add **What the implementer must fix** for each ASSERTION failure, in terms of the approved case. Don't change the Discriminating check column.

Reply only with `TESTS_READY` (all methods bound; the pass/fail counts; how many failures are ASSERTION), `NEEDS_RECORDING` (flow names) or `CONTRACT_MISMATCH` (the cases). Detail goes in `test-plan.md`, `recording-requests.md` and `contract-mismatch.md`.

## Healing after the binding is recorded (`ui.bound`)
Once the main session has recorded the binding (`ui.bound`), you may be resumed to **heal** a locator that broke later. Same rules as above, plus:
- Only for a `BINDING` failure: one inside a page-object method, listed in `.loop/<TICKET>/heal-request.json`. Never for an `ASSERTION`.
- **Re-bind by the contract model ID** named in the method's doc comment (`[id="<model ID>"]`, `[name=...]`). `--heal` refuses a healed method that doesn't. If that model ID is not in the built UI at all, don't heal: reply `CONTRACT_MISMATCH` (the contract element is missing; it is a defect for the implementer or a contract change, for the user to decide).
- Change only the failing method(s) and private helpers of the same class. Don't run the gate: reply `HEALED` with the methods you changed; the main session runs `loop-ui-check.js --heal`, which logs it and stops for the user if the same method was healed before or more than 3 members changed.
- Anything that would change what is asserted, or needs a signature change, stops: reply `CONTRACT_MISMATCH`.

## Upload cases (UI Excel upload, B2B drop)
- **Excel upload through the UI:** a step method drives the file input with `setInputFiles` inside the `rcp_content` frame. Record the upload screen flow once (`NEEDS_RECORDING`).
- **Build the file at run time** inside the step method with `tests/upload-fixtures.ts` (`buildXlsxFromTemplate`, `fillTemplateText`, `uniqueValue()`, `relativeDate()` with a future offset). Templates in `fixtures/<TICKET>/`, output to `fixtures/<TICKET>/generated/`. If the harness has no `tests/upload-fixtures.ts`, report it and stop.
- **B2B drop** only when `cases.approved` allows it: reuse the drop-and-log helper; upload under a `.part` name then `mv`; read `e2na.log` from a byte offset. An `.att` saying "Rejected 0" proves nothing: the query method returns what the effect shows (PIT Detail, download), and error lines.

## Harness lessons
- **Navigation:** menu items call `rcptop.getWFM().startWF('<workflow>')`; a click before the workflow manager is ready leaves `rcp_content` on `Status.jsp?wf=brokerServices`. Use `startWorkflow` (waits for `getWFM()`, then calls `startWF`). Loading the screen URL into the frame does NOT work (type-aheads and downloads never complete). The workflow name is in the menu item's `javascript:` href or the `wf=` parameter.
- **One fresh page per test:** the spec creates fresh contexts where the case needs them; don't cache state across calls in a page object.
- **Locators:** model IDs first (`[id="<Obj>.<Attr>"]`, `[name=...]`), then roles with Navigation labels. No XPath, positional CSS (`nth-child`, `nth-of-type`) or styling-class chains; `.nth()` only for a duplicate you document in a comment. Never anchor on `eto<N>` ids.
- **Waits:** `locator.waitFor()` or a web-first helper; `expect.poll` is an assertion and belongs in specs, so in a page wait on the element the step needs.
- **Downloads:** register `page.waitForEvent('download')` before the click, `saveDownload` before the context closes; queued jobs via `waitForDownloadJobLink`. Parse with `tests/excel.ts` (`findHeaderRow`, never `getRow(1)`).
