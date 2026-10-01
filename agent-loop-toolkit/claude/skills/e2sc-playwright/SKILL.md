---
name: e2sc-playwright
description: 'Write, run, and debug Playwright UI tests that drive the live remote E2open SCPM/SSP dev server (the project''s e2sc-ui_tests harness). Use for: "add a Playwright test", "write a UI test", "test a field / dropdown / text field / column / button / workflow", "run the playwright tests", "codegen a selector", "why is this UI test failing", iframe/rcp_content selector problems, menu navigation, login helper. Also use to UI-verify any config change made via the e2sc-*/alert-config/e2na-config skills: "test a state transition / action button", "verify a download button / configurator", "check a field label", "test an alert filter / subscription", "verify a new column / data measure". Also covers DOWNLOADED-FILE assertions: "download a shipment/PO into Excel", "check the .xlsx columns", "validate the download template / spreadsheet contents", "assert the produced file" — Playwright captures the download, exceljs reads the workbook. Knows the iframe (rcp_content) pattern, the rcp_content_modal layer where generated files are offered, login flow, startWF-based navigation, the per-project menu map (MENU_MAP + navigateToMenuItem), the shared helpers module, the field-control patterns (text / native select / complex-combobox), the by-domain config→UI testing map, and how to encode verified gaps (RED known-defect tests + test.fail / test.fixme markers).'
---

# E2open SCPM Playwright UI Testing (e2sc-playwright)

Author and maintain end-to-end Playwright tests that drive a **live, remote** E2open SCPM/SSP dev server to verify configuration behaviour through the real UI.

## The harness

Each project has **one** standalone Playwright package, **`e2sc-ui_tests/`**, created by `/setup-project` from the kit's `claude/loop/harness-template/`. Its base URL is in `playwright.config.ts` (overridable with `E2_BASE_URL`), and the host is recorded in your `~/.claude/loop/servers.md`. All new tests go in that project's harness.

Its *structure* is the template for testing **any** field or workflow: a **shared `tests/helpers.ts` module** (plus `tests/loop-helpers.ts` and `tests/excel.ts`), categorised specs with TC-IDs, runs **serially**, and encodes control internals + verified findings.

### What the template ships

| Path | Purpose |
|---|---|
| `tests/_smoke/login.spec.ts` | 2 tests run by `/setup-project`: the test user reaches an authenticated shell, and `getWFM()` exists for navigation |
| `tests/helpers.ts` | generic login, menu navigation (empty `MENU_MAP` you fill in), iframe + modal iframe, download capture, Job Status helpers, generic field-control helpers |
| `tests/loop-helpers.ts` | `startWorkflow` (reliable navigation via `startWF`), `rcp` (FrameLocator), `pickTypeahead` |
| `tests/excel.ts` | exceljs workbook reading (no `Page`/`Frame`) |
| `tests/locked/<KEY>/` | each ticket's locked definition of done (a hook stops agents editing it once `.loop/<KEY>/tests.locked` exists) |
| `recordings/<KEY>/` | codegen recordings (reference only) |
| `fixtures/<KEY>/` | upload files |

Anything else (field-specific helpers, discovery specs, a menu dump) is added per project as needed.

## Testing any field or element — this skill is generic

The patterns apply to **any** field, control, column, button, or workflow. To test a new element you reuse the same building blocks — login, navigation, the `rcp_content` iframe, and a control-appropriate read (see the guide's *"Reading a field by control type"* and *"Testing config changes by domain"* sections). For a field the generic helpers don't yet cover, add a small field-specific helper to `helpers.ts` (e.g. `<field>OptionTexts`, `set<Field>Selection`, built on `complexComboboxContainer` / `complexComboboxOptionTexts`) rather than scraping body text.

This skill is also the UI-verification counterpart to every config skill. After a change made via `e2sc-ocmm`, `e2sc-pcmm`, `e2sc-rcp`, `e2sc-io`, `e2sc-cfg`, `alert-config`, or `e2na-config` is reloaded onto the live server, use this skill to assert it actually renders — the guide's by-domain map says *what to open and what to assert* for each.

Two rules that make any such test reliable:
- **Reload first, then verify.** A newly added field/button/column/alert only appears after the config is reloaded onto the remote server (`reload_ocmm_script.sh`, PCMM/IoDocTypeDef reloads, `eoadmin`). A "missing element" is usually a not-reloaded config, not a test bug — confirm the reload (via the relevant `e2sc-*` skill) before editing the test.
- **AllBundles is the visible text.** Assert on the label `e2sc-cfg` maps a model ID to (`USER_ACTION_202` → `Update Date`), not the raw ID. And remember role-gated visibility: the harness only sees the view of the user it logs in as (usually `e2open_super_user`).

Do **not** invent selectors for elements the harness has never driven — discover them with `npm run codegen`.

## Asserting the contents of a downloaded file (Excel)

Two halves: **Playwright captures the download, `exceljs` reads the workbook** — Playwright itself cannot read a spreadsheet. `exceljs` is a devDependency of the harness and the parsing helpers live in **`tests/excel.ts`**, deliberately separate from `helpers.ts` because they take no `Page`/`Frame` (so they also serve to *build* an .xlsx for an upload flow).

Non-obvious mechanics:
- **The generated file is offered inside a second iframe, `rcp_content_modal`** — a locator scoped to `rcp_content` will never see it. Use `getRcpModalFrame(page)`.
- **Save before the context closes.** Playwright deletes downloads on context close, so anything to be parsed must go through `saveDownload(download, prefix)` → `test-results/downloads/`. Prefix it: the suite is serial on one account and several flows can emit the same filename.
- **Row 1 is not reliably the header row** — E2open workbooks can carry title/parameter rows above the grid. Use `findHeaderRow(ws, { mustContain })`, never `getRow(1)`.
- **Normalise cells before comparing.** Values arrive as rich text, formula results, hyperlinks, dates or numbers depending on spec formatting; `cellText` / `rowTexts` reduce all of those to the string a human sees.
- **The download is a queued JOB.** Clicking **Next** issues a job and opens a **Job Status → Job List** modal; the File Name is plain text until the job completes, then becomes a link. A codegen recording *looks* direct only because the job finished while the human was clicking. Poll with `waitForDownloadJobLink`, and **raise the test timeout** — Playwright's 30s default is shorter than the job (`test.setTimeout(300000)`).
- **A job can end `Completed With Errors`** — no link ever appears. The helper aborts on that status and `captureJobErrorFile` saves the row's "Click to download the error file" attachment into the thrown error. That is a server-side failure to chase with `e2sc-logging` / `e2sc-io`, never a test to soften.
- **Check the extension** from `download.suggestedFilename()` (`.xlsx` vs `.csv` vs `.zip`) rather than assuming exceljs applies.

**Never invent the expected column labels.** Run the download once, record the real header list (e.g. attach `header.headers` as JSON to the test report), seed the constant, then turn the strict test on. guide.md § *Downloading a file and asserting its contents* has the full pattern.

## Reference Documentation
**Primary Source:** `skills/e2sc-playwright/guide.md` — read this first for the iframe pattern, login helper, navigation, selector conventions, the combobox internals, and run commands.

## Behavior

- Read `guide.md` first, then scan `e2sc-ui_tests/tests/` for the closest existing test and mirror its patterns (helpers, iframe access, waits).
- **Import** the shared helpers from `e2sc-ui_tests/tests/helpers.ts` and `tests/loop-helpers.ts` (`loginAsSuper`, `startWorkflow`, `navigateToMenuItem`, `getRcpFrame`, `complexComboboxOptionTexts`, …) — do not copy or reinvent the generic ones. For a new field, add a field-specific helper to `helpers.ts`.
- Almost all app content lives inside the `rcp_content` iframe. Always locate within the frame returned by `getRcpFrame(page)` (or the `rcp(page)` FrameLocator); top-level `page` locators silently miss iframe content.
- **Read a field by its control type, not by scraping body text.** A plain field is an `<input>`/`<textarea>`; a simple dropdown is a native `<select>`; a multi-select dropdown is an `eto-complex-combobox` over a **hidden native `<select multiple>`** — read values/selection from the underlying control (present without opening the panel) and change selection via the checkbox panel. See the guide's control-type table.
- Tests hit a remote server (`baseURL` in `playwright.config.ts`, overridable with `E2_BASE_URL`); there is no local `webServer`. Confirm the server is reachable and the login works (password set, if the server needs one) before assuming a failure is a test bug.
- The harness runs **serially** (`workers: 1`, `fullyParallel: false`) because of single-account session contention — keep it that way.
- Ask only essential questions (which workflow, what field/value to assert). Don't ask which files to touch — tests go in `e2sc-ui_tests/tests/` (locked loop tests in `tests/locked/<KEY>/`).

## Critical: the suite is NOT expected to be all-green — don't "fix" the red tests

**General rule (any field or feature):** when a test asserts correct behaviour but the live config doesn't provide it yet, that failure is the deliverable. **Never** edit selectors, adjust timeouts, invert assertions, or delete/soften a marker to force green. The remedy is always a config change on the server (via the `e2sc-*` skills), not a test change.

A project's suite can use **three different conventions** for this — know which one you're looking at before touching anything:

**1. RED known-defect tests (the house style).** A plain `test()` that genuinely **FAILS**, preceded by a `KNOWN DEFECT — SHOULD FAIL (RED)` comment explaining the config remedy. A full run therefore reports **real failures by design**. Example:

```ts
// KNOWN DEFECT — SHOULD FAIL (RED): <Field Label> is not on the <Workflow> search form.
// Remedy: add <Object>.<PdfField> to the <PSD/form> definition (e2sc-pcmm), then reload.
test('TC-X1: <Field Label> visible in <Workflow>', async ({ page }) => { ... });
```

Download jobs that end `Completed With Errors` are a typical RED case: the remedy is server-side (the job's error file / `e2sc.log`, then the IoDocTypeDef via `e2sc-io`).

**2. `test.fail` markers.** Playwright reports a fail-as-expected as **passed**, so the run stays green. Flip to plain `test()` only once the behaviour is actually implemented.

**3. `test.fixme`.** Scenarios needing backend/DB/EDI access, seeded data, two concurrent sessions, or an unconfirmed menu path — reported as skipped, intentionally not faked green.

These markers belong in the project's own (non-locked) suites. **Locked loop tests** in `tests/locked/<KEY>/` are the ticket's definition of done and must go green by fixing the config, never by adding markers.

When you add a new verified gap, **match the neighbouring spec's convention** (RED + a `KNOWN DEFECT` comment is the house style; `test.fail` if you want the run to stay green) and say in the comment what config change fixes it. Never delete an assertion.

A related failure mode: a test can fail because a config change has not been reloaded yet (e.g. a new data measure only appears after `reload_workflows.sh` runs on the live server). That is a **not-yet-reloaded config** signal, not a bug — note it in the spec header if it applies.

## Weak-test anti-patterns — don't copy them

When you find a spec written like this, don't mirror it; prefer improving it when working in that file:
- It defines **its own local nav helpers** instead of using `startWorkflow` / `navigateToMenuItem`, often duplicating something already in `helpers.ts`.
- It hand-writes menu text locators that don't match the live labels exactly (spacing around `/`, capitalisation), so it fails at navigation rather than at the assertion.
- It leans on `page.waitForTimeout(500)` rather than explicit waits.
- It only asserts a label is visible and describes the real steps in comments, or wraps the real assertion in `if (isSelect) { … }` / `if (hasFilter) { … }` so it **passes vacuously** when the control isn't what's expected.

The fix: move the nav into `helpers.ts` (or use `startWorkflow` / `navigateToMenuItem`), add a field helper once codegen confirms the control type, and make the assertions unconditional.

---

## Agent Workflow

### Step 1: Read the Guide
Always load `skills/e2sc-playwright/guide.md` before starting.

### Step 2: Scan for an existing pattern
Find the most similar existing spec in `e2sc-ui_tests/tests/` and reuse its structure: mirror the `import { … } from './helpers'`, the `test.describe('Section X …')` grouping, and `test.beforeEach(loginAsSuper)`. In a fresh harness the only spec is `tests/_smoke/login.spec.ts`.

### Step 3: Ask only essential questions
```
✅ "Which workflow / menu path? (or its startWF workflow name)" (if not clear)
✅ "Which field/element, and what should the test assert?" (if not clear)
✅ "What control type is it? (text input / native select / complex-combobox / button / column)" (if it affects how to read it)
✅ "Positive test, a known-gap marker (RED test / test.fail), or a test.fixme (needs backend/data)?" (only if it touches a known gap)

❌ DON'T ask: "Which file should the test go in?" — a *.spec.ts under <harness>/tests/
❌ DON'T ask: "Should I reuse the helpers?" — yes, always
```

### Step 4: Write the test using the shared patterns
- Login in `beforeEach` via `loginAsSuper(page)`.
- Navigate with `startWorkflow(page, '<workflow>')` (most reliable — see below), or `navigateToMenuItem(page, '<Group>', '<Section heading>', '<Item>')` once the project's `MENU_MAP` has been filled in.
- Get the iframe with `const frame = await getRcpFrame(page)` and locate **inside** `frame`.
- Read the field according to its **control type** (input / native `<select>` / complex-combobox / column header / button) — see the guide. For a multi-select use `complexComboboxOptionTexts(frame, '<Object>.<PdfField>')`; for anything more, add a field helper rather than scraping body text.
- For a verified gap use the neighbouring spec's convention (RED `test()` + a `KNOWN DEFECT` comment, or `test.fail`); use `test.fixme` for backend/data-blocked cases — never fake them green.
- Prefer explicit `expect(...).toBeVisible({ timeout })` over arbitrary `waitForTimeout`.
- **No conditional assertions.** `if (await x.isVisible().catch(() => false)) { expect(…) }` passes vacuously exactly when the thing you're testing is broken. Find the real control with codegen instead of branching on it.
- Don't define navigation helpers inside a spec — put them in `helpers.ts` or use `startWorkflow` / `navigateToMenuItem`.
- **Menu clicks are flaky right after login or a server restart.**
  - Menu items run `rcptop.getWFM().startWF('<workflow>')`. If the workflow manager isn't ready,
    `rcp_content` gets stuck on `Status.jsp?wf=brokerServices`, and the test fails at random before any
    assertion.
  - For gate or locked tests, wait for `getWFM()` to exist (with `page.waitForFunction`, a readiness
    condition, not a delay), then call `startWF('<workflow>')` directly. `startWorkflow` in
    `loop-helpers.ts` does exactly this.
  - Get the workflow name from the menu item's `javascript:` href, or from the `wf=` parameter of the
    screen URL.
  - **Don't** load the screen URL straight into the frame: the form renders, but type-aheads and
    downloads never complete without the workflow context.
- **Type-ahead filters** (e.g. Supplier Item ID) only apply once an option is picked from the list.
  Typing alone searches everything. Use `pickTypeahead` from `loop-helpers.ts`.
- **Other projects:** each project has its own harness and host — see `~/.claude/loop/servers.md`.
  Some servers log in with the username only. The template's login, iframe and download helpers work
  everywhere; the menu map and any field helpers are per project.

### Step 5: Run the test and report honestly
```
cd e2sc-ui_tests
npx playwright test <file>.spec.ts        # or -g "TC-X1" / "<title>" for one test
```
Report pass/fail with the actual output, and **interpret it against the three conventions**: RED known-defect tests are *supposed* to appear as failures; `test.fail` fails-as-expected and is reported **passed**; `test.fixme` is skipped. So "N failed" is not automatically a problem — check whether the failing titles are documented defects before reporting a regression, and never "fix" a documented-gap test.

### Step 6: For new selectors, use codegen
When you don't know a selector, generate it rather than guessing:
```
npm run codegen        # opens recorder against the logon page
```

## Quick Reference

### File locations
```
e2sc-ui_tests/tests/*.spec.ts                # project specs
e2sc-ui_tests/tests/_smoke/login.spec.ts     # harness smoke check (run by /setup-project)
e2sc-ui_tests/tests/locked/<KEY>/            # locked loop tests for a ticket
e2sc-ui_tests/tests/helpers.ts               # shared login / navigation (MENU_MAP + navigateToMenuItem) / iframe + modal iframe / download capture / job status / generic field controls
e2sc-ui_tests/tests/loop-helpers.ts          # startWorkflow, rcp, pickTypeahead
e2sc-ui_tests/tests/excel.ts                 # exceljs workbook reading: openWorkbook, findHeaderRow, columnValues, cellText (no Page/Frame — also usable to BUILD an upload .xlsx)
e2sc-ui_tests/test-results/downloads/        # where saveDownload() persists captured files (Playwright deletes them otherwise)
e2sc-ui_tests/recordings/<KEY>/              # codegen recordings kept as selector references (not specs)
e2sc-ui_tests/fixtures/<KEY>/                # upload files
e2sc-ui_tests/playwright.config.ts           # serial (workers:1), E2_BASE_URL override, retries:0
e2sc-ui_tests/README.md                      # per-project notes (base URL, user, password file)
```

### Run commands (from `e2sc-ui_tests/`)
```
npm install                                  # first time
npx playwright install                       # first time: download chromium
$env:SUPER_USER_PASSWORD = "<pwd>"           # PowerShell; export … on bash (or the ~/.e2sc-password-<stack> file)
npx playwright test --project=chromium       # run all (chromium configured; serial)
npx playwright test tests/_smoke             # harness check
npx playwright test tests/locked/<KEY>       # one ticket's locked tests
npx playwright test <file>.spec.ts           # single file
npx playwright test -g "TC-X1"               # single test by id or title substring
npm run test:headed | test:debug | test:ui   # headed / inspector / UI mode
npm run report                               # open last HTML report
npm run codegen                              # record selectors / discover menu positions
npm run test:chrome                          # = playwright test --project=chromium
```
Override the target with `E2_BASE_URL` (defaults to the base URL in `playwright.config.ts`).

### Auth
- Username from `E2_USERNAME`, defaulting to the user `/setup-project` wrote into `helpers.ts` (usually `e2open_super_user`).
- Password from env var `SUPER_USER_PASSWORD`, or the `~/.e2sc-password-<stack>` file read by `playwright.config.ts` (login helper degrades gracefully if unset; some servers need no password).

### Shared helpers — `e2sc-ui_tests/tests/helpers.ts` (import; don't copy)
Generic helpers (reuse for any field):
```ts
loginAsSuper(page)                              // logs in via /e2sc/logon.do
navigateToMenuItem(page, group, heading, item)  // reaches any menu item listed in MENU_MAP
openMenuGroup(page, group)                      // Menu → <top-level group>
getRcpFrame(page)                               // returns the rcp_content iframe frame
getRcpModalFrame(page, timeout?)                // returns the rcp_content_modal frame — the MODAL layer (generated-file links live here)
frameBodyText(frame)                            // whole-frame text — includes hidden DOM, use sparingly

// loop-helpers.ts
startWorkflow(page, wf)                         // wait for getWFM(), then startWF(wf) — most reliable navigation
rcp(page)                                       // rcp_content as a FrameLocator
pickTypeahead(page, label, value, typeChars?)   // type-ahead that actually commits an option
```
Download capture + workbook assertions:
```ts
// helpers.ts — Playwright side
saveDownload(download, prefix?)                 // persist to test-results/downloads/ and return the path (MUST do this before context close)
DOWNLOAD_DIR                                    // save location
jobStatusRows(modal)                            // read the Job Status → Job List table
waitForDownloadJobLink(page, fileLink?, timeout?) // poll until the job's file link appears; aborts on error statuses
captureJobErrorFile(page, prefix?, attempts?)   // save a failed job's error file
JOB_ERROR_FILE_LINK, JOB_ERROR_FILE_HREF        // error-file link text / href selector

// excel.ts — exceljs side (no Page/Frame)
openWorkbook(file), sheet(wb, name?), sheetNames(wb)
findHeaderRow(ws, { mustContain?, searchRows? })  // survives title/parameter rows above the grid
dataRows(ws, header), columnValues(ws, header, label), rowRecord(header, row)
cellText(value), rowTexts(row), columnIndexOf(header, label)
```
Constants: `SUPER_USER_USERNAME`, `LOGIN_URL`, `MENU_MAP` (+ the `MenuSection` interface).
`MENU_MAP` ships **empty**: each project fills it in from its own live menu (codegen, or a small discovery spec that dumps `.eto-header__menu-column` contents). `navigateToMenuItem` is positional and throws a "Menu drift" error if the link text at a mapped position doesn't match, and an "Unknown group/section/item" error listing valid names. Copy exact labels from the live menu rather than hand-writing them (watch spacing around `/`, capitalisation, and sections with duplicate headings, which need a disambiguated key such as `Shipment (2)`). Until the map is filled in, use `startWorkflow`.
Generic field-control helpers:
```ts
// Autocomplete fields (eto-complex-autocomplete)
autocompleteInput(frame, fieldName)             // visible input for typing
autocompleteValue(frame, fieldName)             // read committed value
fillAutocomplete(frame, fieldName, value)       // type into the field

// Complex-combobox fields (any eto-complex-combobox by field id)
complexComboboxContainer(frame, fieldId)        // container div
complexComboboxOptionTexts(frame, fieldId)      // all available options (from the hidden <select multiple>)

// Date-range fields (eto-datepicker-range)
dateRangeContainer(frame, fieldId)              // container div
fillDateRange(frame, fieldId, from, to)         // fill both ends (MM/DD/YYYY hh:mm:ss)
dateRangeValue(frame, fieldId)                  // committed value (hidden input)
formatDate(d)                                   // MM/DD/YYYY
```
`eto<N>` ids (`eto9`, `eto13`, …) are **auto-generated per render and unstable** — never anchor on them; use the model-derived `name` / container `id` (`<Object>.<Attribute>`). A combobox can legitimately render with **zero options** when no values are configured — check the config before calling it a test bug.

### Reading a field by control type
Locate the field by stable `id` (`[id="<Object>.<Attr>"]`) or by `label:has-text("<Label>")`, then read it per control type:
- **Text input / textarea** → `frame.locator('#<id>').inputValue()`; assert visible via the label.
- **Native single-select** → read `<select>` value / options directly.
- **Complex-combobox (multi-select)** → `<div id="<Object>.<PdfField>" class="eto-complex-combobox">` wraps a **hidden native** `<select multiple>` (source of truth for values, present without opening the panel) plus a checkbox panel behind the `expand_more` button. The `<select>`'s `selected` attribute is only the **initial default**; for the live selection read the panel checkboxes (`.eto-results-available li[role="option"] input:checked`).
- **Column / data measure** → assert the header text; **button/action** → assert the button label (from AllBundles).

Prefer a field-specific helper over scraping `frame.locator('body').textContent()`.

### Iframe rule
The app renders inside `iframe[name="rcp_content"]` — **plus a second frame, `iframe[name="rcp_content_modal"]`, for modal dialogs** (where a generated download is offered as a link). Use `getRcpFrame` / `getRcpModalFrame` respectively; a `rcp_content`-scoped locator never sees modal content. Use:
```ts
const frame = await getRcpFrame(page);
await expect(frame.locator('label:has-text("<Field Label>")')).toBeVisible({ timeout: 15000 });
```
Locating on `page` directly (outside the frame) will miss the content.
