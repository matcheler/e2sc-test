# E2open SCPM Playwright UI Testing Guide

> **Purpose**: Help developers write, run, and debug Playwright end-to-end tests that drive the live remote E2open SCPM/SSP dev server, for **any** field, control, column, button, or workflow (the project's `e2sc-ui_tests/` harness).
>
> **Audience**: Developers verifying E2open configuration behaviour through the real UI.
>
> **How to Use**: Read this before writing or changing any test in `e2sc-ui_tests/tests/`.

## Table of Contents

1. [Harness Overview](#harness-overview)
2. [Project Layout](#project-layout)
3. [Running Tests](#running-tests)
4. [The Shared Helpers](#the-shared-helpers)
5. [The rcp_content iframe Pattern](#the-rcp_content-iframe-pattern)
6. [Menu Navigation](#menu-navigation)
7. [Selector Conventions](#selector-conventions)
8. [Writing a New Test](#writing-a-new-test)
9. [Known-Defect Tests — Do Not Fix](#known-defect-tests--do-not-fix)
10. [Weak-test anti-patterns](#weak-test-anti-patterns)
11. [Troubleshooting](#troubleshooting)

---

## Harness Overview

Each project has **one** standalone Playwright test harness, **`e2sc-ui_tests/`**, created by `/setup-project` from the kit's `claude/loop/harness-template/`. It is independent of the `solution/` build tree — it does **not** build or deploy anything. Its job is to drive a **live, remote** E2open dev server through a browser and assert that configuration behaves correctly end-to-end.

A fresh harness contains only the smoke spec (`tests/_smoke/login.spec.ts`) plus the shared modules; each project adds its own categorised specs (TC-IDs in the titles) and, for the agent loop, locked per-ticket tests under `tests/locked/<KEY>/`.

All specs are backed by a **shared `tests/helpers.ts` module** that provides login, menu navigation (via `MENU_MAP` + `navigateToMenuItem`, once the project fills in the map), iframe access, download capture, Job Status helpers and generic field-control helpers (autocomplete, complex-combobox, date range). `tests/loop-helpers.ts` adds `startWorkflow` (reliable `startWF` navigation) and `pickTypeahead`; `tests/excel.ts` reads workbooks. Runs **serially**, encodes real control internals, and encodes verified configuration gaps as **RED known-defect tests** plus `test.fail` / `test.fixme` markers (see *Known-Defect Tests* — a full run of a project suite is **not** necessarily expected to be all-green). Its structure is the pattern reference for **any** new test, whatever field it targets.

Key facts:
- **Remote target**: `baseURL` is set in `playwright.config.ts` (written by `/setup-project`, e.g. `http://<e2sc-host>:<port>`), overridable with an `E2_BASE_URL` env var. The host is also recorded in your `~/.claude/loop/servers.md`. There is **no** local app and **no** `webServer` block — the server must be reachable over the network.
- **Browser**: only the `chromium` project is configured.
- **Concurrency**: runs **serially** (`workers: 1`, `fullyParallel: false`) because the suite shares one account on the remote server and parallel workers cause session contention. Keep it serial.
- **Test data / config** under test lives on that remote server, configured via the `e2sc-*` / `alert-config` skills. A failing UI test often means the config isn't deployed/reloaded, not that the test is wrong.

Before treating a failure as a test bug, confirm:
1. The remote server is reachable.
2. The login works (`SUPER_USER_PASSWORD` or the password file is set, if the server needs a password).
3. The relevant config change has actually been reloaded onto that server.

## Project Layout

```
e2sc-ui_tests/
├── playwright.config.ts       # serial (workers:1, fullyParallel:false), retries:0, forbidOnly, E2_BASE_URL override
├── package.json               # npm scripts (test, test:headed, test:chrome, codegen, report, ...); @playwright/test + exceljs
├── README.md                  # per-project notes: base URL, user, password file, run commands
├── tests/
│   ├── helpers.ts             # SHARED login / navigation (MENU_MAP) / iframe + modal iframe / download capture / job status / generic field controls
│   ├── loop-helpers.ts        # SHARED startWorkflow, rcp, pickTypeahead
│   ├── excel.ts               # SHARED exceljs workbook reading (no Page/Frame — also usable to BUILD an upload .xlsx)
│   ├── _smoke/login.spec.ts   # harness check: authenticated shell + getWFM() available
│   ├── locked/<KEY>/          # each ticket's locked definition of done (hook-protected once locked)
│   └── *.spec.ts              # project specs, added as needed
├── recordings/<KEY>/          # codegen recordings kept as selector references (not specs)
├── fixtures/<KEY>/            # upload files
├── playwright-report/
└── test-results/
```

Don't commit `node_modules/`, `test-results/`, `playwright-report/` or `recordings/`.

`e2sc-ui_tests/playwright.config.ts` notable settings:
- `testDir: './tests'`, `fullyParallel: false`, `workers: 1` (serial — single shared account).
- `retries: 0` (a locked test that only passes on retry is not green), `forbidOnly: true`, `reporter: 'html'`.
- `baseURL: process.env.E2_BASE_URL || '<base URL written by /setup-project>'`.
- Password: `SUPER_USER_PASSWORD`, or, if unset, the file `~/.e2sc-password-<stack>` (kept outside the repo).
- `actionTimeout: 20000`, `navigationTimeout: 30000` (remote server is slow).
- `use`: `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.

## Running Tests

Always run from inside `e2sc-ui_tests/`:

```bash
cd e2sc-ui_tests
npm install                                  # first time only (brings @playwright/test + exceljs)
npx playwright install                       # first time: download chromium

$env:SUPER_USER_PASSWORD = "<pwd>"           # PowerShell — set before authenticated runs (or use the password file)
# export SUPER_USER_PASSWORD=<pwd>           # bash

npx playwright test --project=chromium       # run all (serial)
npx playwright test tests/_smoke             # harness check
npx playwright test tests/locked/<KEY>       # one ticket's locked tests
npx playwright test <file>.spec.ts           # single file
npx playwright test -g "TC-X1"               # single test by id (or title substring)

npm run test:headed                          # headed browser
npm run test:debug                           # Playwright inspector
npm run test:ui                              # UI mode
npm run report                               # open last HTML report
npm run codegen                              # record selectors against logon page
```

Override the target server with `E2_BASE_URL`. `npm run codegen` points at `…/e2sc/logon.do` — use it whenever you need a real selector or to discover a menu position instead of guessing.

**Optional maintenance tools.** A project may add gated discovery specs (e.g. a `_menu-discovery.spec.ts` behind `MENU_DISCOVERY=1`, or a form-discovery spec behind `FORM_DISCOVERY=1`) that dump the live menu / a form's fields to JSON so `MENU_MAP` or a field-map constant can be regenerated after drift. The template doesn't ship them.

## The Shared Helpers

The helpers live in `e2sc-ui_tests/tests/helpers.ts` and `tests/loop-helpers.ts` — **import** them, don't copy:

```ts
import {
  // Auth & navigation
  loginAsSuper, SUPER_USER_USERNAME, LOGIN_URL,
  navigateToMenuItem, openMenuGroup, MENU_MAP,           // generic — reaches any item listed in MENU_MAP

  // iframe access
  getRcpFrame, getRcpModalFrame,                         // rcp_content / rcp_content_modal

  // download capture + Job Status (see § Downloading a file and asserting its contents)
  saveDownload, DOWNLOAD_DIR,
  jobStatusRows, waitForDownloadJobLink, captureJobErrorFile,
  JOB_ERROR_FILE_LINK, JOB_ERROR_FILE_HREF,

  // Autocomplete fields (generic)
  autocompleteInput, autocompleteValue, fillAutocomplete,

  // Complex-combobox fields (generic, any eto-complex-combobox)
  complexComboboxContainer, complexComboboxOptionTexts,

  // Date range fields (generic)
  dateRangeContainer, fillDateRange, dateRangeValue, formatDate,

  // Utilities
  frameBodyText,
} from './helpers';

import { startWorkflow, rcp, pickTypeahead } from './loop-helpers';

// Workbook reading is a SEPARATE module (no Page/Frame in it):
import {
  openWorkbook, sheet, sheetNames,
  findHeaderRow, columnIndexOf,
  dataRows, columnValues, rowRecord,
  cellText, rowTexts,
} from './excel';
```

### Login — `loginAsSuper(page)`
Logs in at `/e2sc/logon.do`.
- Username: `SUPER_USER_USERNAME` = `E2_USERNAME`, defaulting to the user `/setup-project` wrote in (usually `e2open_super_user`).
- Password: `process.env.SUPER_USER_PASSWORD` (or the password file loaded by `playwright.config.ts`). If unset, the helper still submits the username and **degrades gracefully** — some dev servers log in with the username only; on others assertions needing an authenticated session will fail.
- Uses tolerant selectors for username/password/login-button to survive minor markup changes.

### Navigation — `startWorkflow(page, wf)` (most reliable)
Menu items run `rcptop.getWFM().startWF('<workflow>')`. `startWorkflow` waits for `home.do`, waits until `getWFM()` exists (a readiness condition, not a delay), then calls `startWF(wf)` directly. Pass `null` just to wait for readiness. Use it for gate and locked tests.
- Get the workflow name from the menu item's `javascript:` href, or the `wf=` parameter of the screen URL (e.g. `search.do?wf=<workflow>`).
- **Don't** load the screen URL straight into `rcp_content`: the form renders, but type-aheads and downloads never complete without the workflow context.

### Navigation — any menu item via `MENU_MAP`
`navigateToMenuItem(page, group, sectionHeading, itemText)` reaches any item in the project's `MENU_MAP` table in `helpers.ts` (see *Menu Navigation*). It validates the clicked link's text against the map and throws on drift or unknown names. `MENU_MAP` ships empty — fill it in for your project before using this.

Some screens (e.g. a List or Details view) are only reached by running a Search/Summary and drilling into the results grid — there is no menu link.

### iframe — `getRcpFrame(page)`
Returns the content frame of `iframe[name="rcp_content"]`:

```ts
async function getRcpFrame(page: Page) {
  const iframe = page.locator('iframe[name="rcp_content"]');
  await iframe.waitFor({ state: 'visible', timeout: 15000 });
  const frame = await iframe.contentFrame();
  if (!frame) throw new Error('rcp_content frame not found');
  return frame;
}
```

`rcp(page)` in `loop-helpers.ts` returns the same iframe as a `FrameLocator`.

### modal iframe — `getRcpModalFrame(page, timeout = 60000)`
There is a **second** app frame, `iframe[name="rcp_content_modal"]`, for modal dialogs. On download flows the generated file is offered as a link *inside the modal* — a `rcp_content`-scoped locator never sees it:

```ts
const modal = await getRcpModalFrame(page);
await modal.getByRole('link', { name: /\.xlsx$/i }).click();
```

The default timeout is 60s because the modal only appears once the server has finished generating the file. Whenever an action opens a dialog and your locator finds nothing, check whether the content moved into this frame.

### Generic field-control helpers

These are **templates** for any field, not a limit. For a field that needs more (e.g. changing a combobox selection), add a small helper alongside them following the same shape (same control pattern, different `id`).

#### Autocomplete fields
- `autocompleteInput(frame, fieldName)` → the visible input for typing (`input[name="<fieldName>__Autocomplete"]`).
- `autocompleteValue(frame, fieldName)` → read the committed value (from the hidden `input[name="<fieldName>"]`).
- `fillAutocomplete(frame, fieldName, value)` → type into the visible input.
- `pickTypeahead(page, label, value, typeChars?)` (loop-helpers) → type-ahead filters only apply once an option is **picked** from the list; typing alone searches everything. This types the last characters and clicks the exact option.

#### Complex-combobox (any eto-complex-combobox, parameterized)
- `complexComboboxContainer(frame, fieldId)` → the combobox div for a given field id.
- `complexComboboxOptionTexts(frame, fieldId)` → all option texts for that field (from the hidden `<select multiple>`).

#### Date-range fields
- `dateRangeContainer(frame, fieldId)` → the `eto-datepicker-range` container div. Its two visible text inputs carry **unstable `eto<N>` ids** — anchor on the container id / hidden `input[name="<field>"]` instead.
- `fillDateRange(frame, fieldId, from, to)` → fills both ends positionally (`.eto-date-input__field`, format `MM/DD/YYYY hh:mm:ss`), committing each with Tab.
- `dateRangeValue(frame, fieldId)` → the committed value (hidden input the form submits).
- `formatDate(d)` → `MM/DD/YYYY`.

#### Utilities
- `frameBodyText(frame)` → all text in the frame body. It includes **hidden DOM**, so use it only for "this legacy label must be absent" style checks; prefer a field-specific helper everywhere else.

A combobox can render with **zero options** when no values are configured — that is a config fact, not a test bug.

#### Data-measure steps on download flows
Many download flows have a **Next** step from the DocType step to a "Select Data Measure" step with a `#dataMeasure` `eto-complex-combobox`; it does not exist before you click the in-frame **Next** button (`frame.getByRole('button', { name: 'Next' })`). Read it with `complexComboboxOptionTexts(frame, 'dataMeasure')`, and read the default-selected measures from the hidden select's `selectedOptions` (see *Complex-combobox internals*). Some flows render the data-measure step as a checkbox list behind **Next** with an unstable `eto<N>` control instead — discover any per-flow quirk with codegen before asserting. Upload flows share a common "Or select file" affordance inside the `rcp_content` frame.

> The available/selected assertions map to the two config knobs: available list = `&dataMeasure=`, default-checked = `&DefaultDMs=` (see the `e2sc-rcp` guide). A measure present in the options but absent from the selected list means `&DefaultDMs=` wasn't updated (or didn't deploy) — not a test bug.

## Downloading a file and asserting its contents

Playwright captures the download; **`exceljs` reads the workbook** — Playwright has no spreadsheet support. `exceljs` is a devDependency of the harness; the parsing helpers are in `tests/excel.ts`, kept out of `helpers.ts` because they take no `Page`/`Frame` and therefore also serve to *build* an .xlsx for an upload flow.

### The download is a queued JOB, not a direct file

This is the thing that breaks naive download tests. Clicking **Next** on a download flow does not return a file — it issues a job (`Acknowledgment - Request successfully issued. Page will automatically refresh in 5 seconds.`) and opens a **Job Status** modal in the `rcp_content_modal` iframe containing a **Job List** table:

| Document Type | File Name | Status | Creation Time | Completion Time | Comments |
|---|---|---|---|---|---|
| `<DocType>` | `<file>.xlsx` | `In Process` | `MM/DD/YY:hh:mm:ss` | | |

While Status is `In Process` the **File Name is plain text**. It becomes a **link** only once the job completes, and clicking that link fires the browser download. The panel self-refreshes every ~5s and also carries a `refresh` button.

A codegen recording of this flow *looks* like a direct download (`waitForEvent('download')` right after clicking the file link) purely because the job had already completed while the human was recording. Automated, you must **poll**:

```ts
const link = await waitForDownloadJobLink(page, /\.xlsx$/i, 180000);  // re-acquires the modal each poll
```

`waitForDownloadJobLink` throws with the last-seen Job List state, so a stuck job reads as `Last Job List state: [{"status":"In Process",…}]` — that is a **server-side** problem, not a test bug. `jobStatusRows(modal)` reads the table if you want to assert the Document Type.

**Status can be terminal-but-failed.** A job may end **`Completed With Errors`**, in which case no file link ever appears and polling to the timeout is wasted. `waitForDownloadJobLink` aborts on `/completed with errors|failed|error/i` immediately, and the failed row offers a **"Click to download the error file"** link (`ioInbox.do?ACTION=DOWNLOAD&RequestId=…&IsErrorFile=1`) — `captureJobErrorFile(page)` fetches it and inlines a text preview into the thrown error, so the reason is in the test output instead of buried in a screenshot. When you see this, the remedy is server-side: check `/e2open/var/log/e2sc/e2sc.log` (`e2sc-logging`) and the IoDocTypeDef for the document type (`e2sc-io`).

> **The Job List panel re-navigates its own iframe every ~5s, and that breaks waiting.** A `getByRole('link', …).waitFor({ state: 'visible' })` can keep missing a link the aria snapshot shows as present, because every wait window straddles a refresh, which destroys the execution context. **Anything you do in this panel must be a single quick operation, not a wait.** `captureJobErrorFile` therefore reads the `href` (`a[href*="IsErrorFile=1"]` — an attribute read, not a name match) and fetches it with `page.request.get()`, which carries the session cookies and is immune to the frame reloading underneath. Apply the same tactic to any self-refreshing E2open panel.

**Raise the test timeout.** Playwright's default is **30s** per test and the job routinely outlives it, failing with the misleading message `waiting for … getByRole('link', …)`. Use `test.setTimeout(300000)` in any test that downloads.

### The two halves, end to end

```ts
test('downloads and validates the workbook', async ({ page }) => {
  test.setTimeout(300000);                       // queued job — NOT the 30s default
  await loginAsSuper(page);
  await startWorkflow(page, '<download workflow>');
  const frame = await getRcpFrame(page);
  // ... fill the criteria (e.g. fillAutocomplete / fillDateRange), then:
  await frame.getByRole('button', { name: 'Next' }).click();

  const link = await waitForDownloadJobLink(page, /\.xlsx$/i);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const file = await saveDownload(download, 'tc-x');   // before the context closes
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);

  const ws = sheet(await openWorkbook(file));
  const header = findHeaderRow(ws);               // NOT getRow(1) — see below
  expect(header.headers).toContain('<real column label>');
  expect(columnValues(ws, header, '<real column label>')).not.toHaveLength(0);
});
```

Rules that matter when parsing:
- **Save before the context closes.** Playwright deletes downloads on context close — `saveDownload(download, prefix)` persists to `test-results/downloads/`. Always prefix: the suite is serial on one account and flows can collide on filenames.
- **Row 1 is not reliably the header row** — workbooks can carry title/parameter rows above the grid. `findHeaderRow(ws, { mustContain })` scans for the first row with 2+ filled cells (and the named labels when given).
- **Normalise cells.** Values arrive as rich text, formula results, hyperlinks, dates or numbers depending on the spec's formatting; `cellText` / `rowTexts` reduce them to the string a human sees. Don't compare raw `cell.value`.
- **Check the extension** from `download.suggestedFilename()` before reaching for exceljs — a flow may emit `.csv` or a `.zip`, in which case parse with `fs` / an unzip step instead.
- **Never invent the expected column labels.** Run the download once, record the real header list (e.g. `testInfo.attach('columns.json', { body: JSON.stringify(header.headers) })`, then `npm run report`), seed the constant, *then* turn the strict assertion on. Keep the strict test as `test.fixme` until then.

### Upload templates — the same helpers, reversed
To test an upload spec, build a workbook with exceljs (`new ExcelJS.Workbook()` → `addRow` → `writeFile`), feed it with `setInputFiles()` inside the `rcp_content` frame ("Or select file" affordance), then assert the platform's validation messages. This is often the more valuable test when what you actually want to verify is a mapping spec. Keep the upload files under `fixtures/<KEY>/`. An offline spec that builds a workbook and parses it back with `excel.ts` (no server, no login) is a cheap way to prove the parsers still work.

## The rcp_content iframe Pattern

**This is the single most important rule.** The E2open app renders almost all of its content inside an iframe named `rcp_content`. A `page.locator(...)` at the top level will **silently** match nothing for in-app content.

Correct:
```ts
const frame = await getRcpFrame(page);
await expect(frame.locator('label:has-text("<Field Label>")')).toBeVisible({ timeout: 15000 });
```

Inline form — `contentFrame()` chained off the iframe locator (this is what `rcp(page)` returns):
```ts
const dropdownButton = page.locator('iframe[name="rcp_content"]')
  .contentFrame()
  .locator('[id="<Object>.<PdfField>"] button')
  .filter({ hasText: 'expand_more' });
```

When in doubt about where text lives, read `frame.locator('body').textContent()` and search it.

## Menu Navigation

**Prefer `startWorkflow(page, '<workflow>')`** for anything that must be reliable (gate and locked tests): menu clicks are flaky right after login or a server restart, because a click made before the workflow manager is ready leaves `rcp_content` stuck on `Status.jsp?wf=brokerServices`.

For menu-driven tests, `MENU_MAP` in `helpers.ts` describes the menu positionally, and **ships empty** — each project fills it in from its own live menu (codegen, or a gated discovery spec that dumps the open menu to JSON). The structure:

```ts
export interface MenuSection {
  column: number;                 // 1-based .eto-header__menu-column index within the open group
  ul: number;                     // 1-based <ul> index (nth-of-type) within the column
  heading: string;
  items: Record<string, number>;  // visible link text → 1-based li position within the section
}

export const MENU_MAP: Record<string, MenuSection[]> = {
  // '<Group>': [
  //   { column: 1, ul: 1, heading: '<Section heading>', items: { '<Item>': 1, '<Item 2>': 2 } },
  // ],
};
```

Then:

```ts
navigateToMenuItem(page, '<Group>', '<Section heading>', '<Item text>');
// e.g.
navigateToMenuItem(page, 'Order Management', 'Shipment', 'Search');
navigateToMenuItem(page, 'My Profile', 'Email Alert Subscription', 'Email Alert Subscription');
```

`openMenuGroup` clicks the **Menu** button and then the top-level group button (typical groups include `Exceptions`, `Order Management`, `Master Data`, `Uploads`, `Downloads`, `My Profile`, `Administration`; the actual set depends on the project and role). `navigateToMenuItem` is positional under the hood (column / ul / li from `MENU_MAP`) and **throws on menu drift** — if the link text at the mapped position doesn't match the requested item, you get an error telling you to regenerate the map, instead of a silent wrong-workflow click. It also throws with the list of valid names on an unknown group/section/item.

If you add a discovery dump, keep it, `MENU_MAP` and any notes in sync; update them together after drift.

Notes (generic E2open menu traps):
- **Exact-label traps** — copy labels from the live menu; hand-written text locators get them wrong. Labels differ subtly in spacing around `/` (`Forecast / Inventory` vs `Forecast/Inventory (Buy Item)`) and capitalisation, and short labels such as `Purchase Order` are prefixes of other items, so a text locator needs `{ exact: true }`.
- **Duplicate-text traps**: some item texts appear more than once in the open menu DOM, so codegen records `.nth(1)` locators (or `getByTitle(...)`, where a link's `title` differs from its text). `navigateToMenuItem` is positional so it is immune; if you hand-write a text locator instead, expect to need `.nth()`.
- **Duplicate section headings**: a column can hold two sections with the same heading; give the second a disambiguated key in `MENU_MAP` (e.g. `Shipment (2)`).
- Some headings have **no link items**.

## Selector Conventions

- **Any field**: locate by its stable `id`, which follows `<Object>.<Attribute>` (e.g. `[id="PoHeader.PoNumber"]`, `[id="<Object>.<PdfField>"]`), or by `label:has-text("<Field Label>")`. The field's `id`/`name` come from the config model; the label comes from AllBundles.
- **Section headers**: `h3.eto-expand__h3:has-text("<Section Title>")` (e.g. `"Purchase Order Summary"`, `"Search Transaction History"`).
- **Labels**: `label:has-text("<Field Label>")`.
- **Menu/expand buttons**: filtered by SVG icon class, e.g. `svg[class*="add_circle_outline"]`, `svg[class*="expand"]`.
- App CSS classes are prefixed `eto-` (e.g. `eto-header__menu-column`, `eto-menu__link`, `eto-expand__h3`).

Prefer stable `id` attributes and `has-text` over deep CSS chains where possible; fall back to nth-child only for menu positions.

### Reading a field by control type

Once you've located the field, read it according to its control type. Locate a new field's real control with `npm run codegen` rather than assuming.

| Control type | Rendered as | How to read / assert |
|---|---|---|
| Text input / textarea | `<input>` / `<textarea>` | `frame.locator('#<id>').inputValue()`; presence via the label. |
| Single-select dropdown | native `<select>` | read `<select>` value and `<option>` texts directly. |
| Multi-select dropdown | `eto-complex-combobox` (see below) | read the hidden `<select multiple>` for values; panel checkboxes for live selection. |
| Checkbox / toggle | `<input type="checkbox">` | `isChecked()`. |
| Column / data measure | grid header cell | assert the header text (= `TITLEDATAMEASURE` / AllBundles label). |
| Button / action | button element | assert the button label (= action label from AllBundles). |

### Complex-combobox internals

The multi-select dropdown control is an `eto-complex-combobox` wrapping a **hidden native multi-select** plus a checkbox panel:

```html
<div id="<Object>.<PdfField>" class="eto-complex-combobox">
  <label><Field Label></label>
  ... chips / text field / expand_more button ...
  <select name="<Object>.<PdfField>" multiple aria-label="<Field Label>">
    <option value="<Value A>" selected> <Value A></option>
    <option value="<Value B>" selected> <Value B></option>
  </select>
  <div class="eto-results" style="display:none"> ...checkbox panel... </div>
</div>
```

- The hidden `<select>` is the **source of truth** for available values and is present **without** opening the dropdown. `complexComboboxOptionTexts(frame, '<Object>.<PdfField>')` reads it.
- To assert the **default / initial selection** (e.g. which download data measures are pre-checked), read the native select's DOM `selectedOptions`: `frame.locator('select[name="<fieldId>"]').evaluate(el => Array.from((el as HTMLSelectElement).selectedOptions).map(o => o.textContent!.trim()))` — this reliably reflects the rendered default. (Don't rely on the static `selected` **attribute** in `allTextContents`-style scraping.)
- For the *live* selection **after a UI change** (checking/unchecking in the panel), read the panel checkboxes instead: `.eto-results-available li[role="option"] input:checked`.
- Open the panel (`expand_more`) only to *change* the selection. For a combobox you need to drive, write a small helper in `helpers.ts` (e.g. `open<Field>Dropdown`, `set<Field>Selection`) on top of `complexComboboxContainer`, rather than `body.textContent()` scraping (which matches hidden DOM and is fragile).

## Testing config changes by domain

Navigation reaches **every** workflow (via `startWorkflow`, or `navigateToMenuItem` once `MENU_MAP` is filled in), and every `e2sc-*` / `alert-config` / `e2na-config` skill produces a UI-visible change that *can* be verified through this harness. Use the map below to know **what to open and what to assert** after a given config domain is reloaded onto the live server.

> **Reload first, then verify.** A field/button/column/alert that a config skill added only appears once the change is reloaded onto the remote server (`reload_ocmm_script.sh`, PCMM/IoDocTypeDef reloads, `eoadmin`). A UI test that can't find the new element is *usually* a not-reloaded config, **not** a test bug — confirm the reload before touching the test. See the `e2sc-*` skills.

| Config skill | What changes in the UI | Where to look | How to assert it |
|---|---|---|---|
| `e2sc-ocmm` | State badges, action **buttons**, transitions, relationship link-cards, audit history | Order/PO detail view (drill in from Search/Summary) | Button text = the **action label** (from AllBundles); state badge = **user-state name** + icon class (`thumb_up-green`, `eject-red`, `local_shipping-blue`…). Clicking an action should move the badge to the next state. |
| `e2sc-pcmm` | New **fields/columns** in CollabList (MTIM/forecast/inventory) views + the column-picker | The relevant CollabList workflow | Field name → visible **column header**; `widget="AutoComplete"` fields render an autocomplete control (only on `Collab` ObjectName). |
| `e2sc-rcp` | New **MCV timeline columns**, totals/summary rows, decimal formatting, role-gated columns, **download-filter data measures** | MCV / timeline grid; the "Select Data Measure" step of a PIT/collab download | Column header = `TITLEDATAMEASURE`; left-to-right order = `DATAMEASUREINDEX`; totals row toggles with `ENABLETOTAL`; `double` DMs render with the configured decimal format. For a download filter: available measures = `&dataMeasure=`, pre-checked = `&DefaultDMs=` — assert with `complexComboboxOptionTexts(frame, 'dataMeasure')` and the `selectedOptions` read. |
| `e2sc-io` | **Download buttons**, the download-configurator dialog, `.xlsx` output | Workflow toolbar (the `BulkIoButtons` area); the Job Status modal for the produced file | Button presence via `DOWNLOAD_PSDSELECTOR` / `Download[DocTypes=…]`; configurator lists selectable columns; output file name = `<File type="output" fileName="…"/>` (matches the Job List **File Name**), Document Type = the IoDocTypeDef name. **The produced file's own columns are assertable** — see § *Downloading a file and asserting its contents*. |
| `e2sc-cfg` | **Field labels, button labels, state names, formatted numbers/dates, validation messages** | Everywhere text is rendered | This is the **Rosetta Stone** — see the subsection below. Assert the visible string equals the AllBundles value. |
| `alert-config` | Alert **filter UI** on search, **subscription checkboxes**, alert badges | Search page filter panel; **My Profile → Email Alert Subscription** | Filter PSD names (`OrderSearch_DOOrderAlertFilter_Buttons` / `_E2Admin`); subscription row label = `pc.web.alertSubscription.<NAME>.name`. |
| `e2na-config` | Route **alias** in integration lists; scheduled downloads (mostly backend) | Integration/route config lists | Limited UI surface — assert the route `alias` string appears. Most verification here is backend (logs / produced files), not UI. |
| `e2sc-logging` | *(none — backend logs)* | — | Not UI-testable. Use it to **diagnose** why an expected element is missing (config error on reload), not as an assertion target. |

### AllBundles is the source of visible text

Every other domain stores **model IDs** (`USER_ACTION_202`, `USER_STATE_18`, data-measure names, relationship names). What the user actually *sees* is the label `e2sc-cfg` maps that ID to in `AllBundles.properties`. So a robust test asserts on the **resolved label**, and the ID→label mapping lives in AllBundles:

- Action button → `exe.web.action.Order.DiscreteOrder.<ACTION_ID>` (e.g. `USER_ACTION_202` → `Update Date`)
- State badge → `exe.web.state.Order.DiscreteOrder.<StateSystemName>` (e.g. `PendingUpdateDate` → `Pending Update Date`)
- Field label → `exe.web.broker_domain.broker_org.default_cusu_group.<Object>.<SubType>.<Field>`
- Relationship link-card → `…Order.DiscreteOrder.Relationship.<RelName>`
- Alert subscription row → `pc.web.alertSubscription.<ALERTNAME>.name`

When a label assertion fails, check AllBundles for the expected string before assuming the element is absent.

### Role-gated visibility

Fields, columns, and alerts are gated per role via `role_tgview_info.txt` / `role_info.txt`. The **same** element can be present for one role and absent for another. The harness logs in as a single user (usually `e2open_super_user`), so it sees **that user's view** — a "missing" element may simply be gated to a different role. Cross-check the role config (via the `e2sc-*` skills) before recording a gap, and note the role limitation in the test.

### Verified vs. convention (don't invent selectors)

The generic patterns in this guide (iframe, modal frame, login, `startWF`, Job Status, the control-type reads) hold across E2open SCPM servers. Everything in the by-domain table above is a **convention derived from the config model, not a confirmed selector** for your project. Before writing an assertion for a domain your project's harness has never driven (OCMM action buttons, PCMM/RCP MCV columns, alert checkboxes), discover the real selector with `npm run codegen` — do not hardcode a guessed selector or fake a passing test. Keep the recording under `recordings/<KEY>/`.

Never anchor on `eto<N>` ids — they are regenerated per render.

## Writing a New Test

**Generic field skeleton** (preferred — locate by label/id, assert per control type):

```ts
import { test, expect } from '@playwright/test';
import { loginAsSuper, getRcpFrame } from './helpers';
import { startWorkflow } from './loop-helpers';

test.describe('Section X — <Field Name>', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
  });

  test('TC-X1: <Field> is visible in Search', async ({ page }) => {
    await startWorkflow(page, '<search workflow>');   // or navigateToMenuItem(...) once MENU_MAP is filled in
    const frame = await getRcpFrame(page);
    // presence — by label (or by stable id: frame.locator('[id="<Object>.<Attr>"]'))
    await expect(frame.locator('label:has-text("<Field Label>")')).toBeVisible({ timeout: 15000 });
    // value — read per control type, e.g. a text field:
    // expect(await frame.locator('[id="<Object>.<Attr>"]').inputValue()).toBe('<expected>');
  });
});
```

**Complex-combobox variant** (any multi-select field):

```ts
import { complexComboboxContainer, complexComboboxOptionTexts } from './helpers';
// ...
const FIELD = '<Object>.<PdfField>';
await expect(complexComboboxContainer(frame, FIELD)).toBeVisible({ timeout: 15000 });
const options = await complexComboboxOptionTexts(frame, FIELD);
expect(options).toContain('<Value A>');
// To change the selection, add a set<Field>Selection helper to helpers.ts that opens expand_more
// and checks/unchecks .eto-results-available li[role="option"] input — don't inline it in the spec.
```

**Data Measure variant** (download flow with a Next step):

```ts
await frame.getByRole('button', { name: 'Next' }).click();      // #dataMeasure only exists after Next
const available = await complexComboboxOptionTexts(frame, 'dataMeasure');
expect(available).toContain('<Measure A>');
const selected = await frame.locator('select[name="dataMeasure"]').evaluate(
  (el) => Array.from((el as HTMLSelectElement).selectedOptions).map((o) => o.textContent!.trim()),
);
expect(selected).toContain('<Measure A>');   // default-selected = &DefaultDMs=
```

Assert with `toContain` per measure (not `toEqual` on the whole array) so measure ordering isn't baked in.

**Autocomplete variant** (search fields such as Customer Item No., Supplier ID):

```ts
import { fillAutocomplete, autocompleteValue } from './helpers';
// ...
await fillAutocomplete(frame, 'PoLineItem.CustomerItemName', 'ITEM-123');
const value = await autocompleteValue(frame, 'PoLineItem.CustomerItemName');
expect(value).toBe('ITEM-123');
```

If the field is a type-ahead *filter*, commit an option with `pickTypeahead` — typing alone searches everything.

Guidance:
- Group related tests in a `test.describe` block; carry the TC-ID in the test title.
- Log in once per test via `beforeEach`.
- Assert with `expect(locator).toBeVisible({ timeout })` rather than sprinkling `waitForTimeout` — use generous explicit timeouts (10–15s) because the remote server can be slow.
- Read each field per its control type (see *Reading a field by control type*) via a helper. Avoid body-text scraping (it matches hidden DOM and is fragile).
- **Never write a conditional assertion.** `if (await x.isVisible().catch(() => false)) { expect(...) }` passes vacuously when the element is missing — which is exactly the case the test exists to catch. If you don't know the control type yet, run codegen and find out; don't branch on it.
- **Don't define navigation helpers inside a spec.** Shared navigation belongs in `helpers.ts`, or use `startWorkflow` / `navigateToMenuItem`.
- For a **verified live gap** in a project (non-locked) suite, follow the neighbouring spec's convention: a plain RED `test()` with a `KNOWN DEFECT` comment (house style), or `test.fail(...)` to keep the run green. Use `test.fixme(...)` when it needs backend/DB/EDI access, seeded data, or an unconfirmed menu path. Never fake any of them as a passing `test()`. See *Known-Defect Tests*.

## Known-Defect Tests — Do Not Fix

**Principle (any field or feature):** a test may encode a **verified gap in the live server today, not a test bug**. The correct remedy is a configuration change on the server — **never** edit selectors, adjust timeouts, invert assertions, or delete/soften a marker to force green.

**A full run of a project suite is not necessarily all-green.** There are three conventions for gaps, and you must recognise which you're looking at:

### Convention 1 — RED known-defect tests (the house style)

A plain `test()` that **genuinely fails**, preceded by a `KNOWN DEFECT — SHOULD FAIL (RED)` comment naming the config remedy. Say so in the spec header too ("a PLAIN test() that genuinely FAILS (RED) — a known-defect marker, **NOT** wrapped in `test.fail()`").

```ts
// KNOWN DEFECT — SHOULD FAIL (RED): <Field Label> (<Object>.<PdfField>) is absent from the
// <Workflow> search form. Remedy: add it to the form's PSD (e2sc-pcmm) and reload.
test('TC-X1: <Field Label> visible in <Workflow>', async ({ page }) => {
  await startWorkflow(page, '<workflow>');
  const frame = await getRcpFrame(page);
  await expect(complexComboboxContainer(frame, '<Object>.<PdfField>')).toBeVisible({ timeout: 15000 });
});
```

Typical RED cases: a field missing from a search/summary form, a dropdown missing one of its required values, a field missing from a read-only exceptions view, and a download job that ends **`Completed With Errors`** so no file is produced (remedy: read the job's error file / `/e2open/var/log/e2sc/e2sc.log` via `e2sc-logging`, then the IoDocTypeDef via `e2sc-io`).

### Convention 2 — `test.fail`

E.g. a filter that should persist across navigation but resets. Playwright reports a fail-as-expected as **passed**; flip to plain `test()` only once the behaviour is implemented.

### Convention 3 — `test.fixme`

Cases needing backend/DB/EDI access, seeded data, two concurrent sessions, or an unconfirmed menu path. Reported as skipped — intentionally not faked green.

### Locked loop tests are different

Tests under `tests/locked/<KEY>/` are a ticket's definition of done. They carry no gap markers: they go green by fixing the config, and a hook stops agents editing them once locked. Use the three conventions above only in the project's own suites.

### Adding a new gap

Match the neighbouring spec's convention — RED + a `KNOWN DEFECT` comment is the house style; use `test.fail` if you want the run to stay green. Either way, state in the comment **which config change fixes it**, and never delete the assertion. (Mixed conventions do mean a run's raw pass/fail counts need interpreting — record the expected failures in the project's `README.md`, and treat the specs, not the README's counts, as the authority.)

### Also expected to fail: a not-yet-reloaded config

A test can fail because a config change hasn't been reloaded yet (e.g. a new data measure only appears once `reload_workflows.sh` has run on the live server). That is a **reload-not-applied signal**, not a bug — document it in the spec header and confirm the reload (via `e2sc-rcp` or the relevant skill) before touching the test.

### When a documented gap starts passing

If a RED or `test.fail` test unexpectedly passes, investigate whether the form was reconfigured (and update the findings) rather than silently trusting either the test or the notes.

## Weak-test anti-patterns

Read such specs for intent; don't copy their mechanics:

1. **Local nav helpers instead of the shared ones** — defined and exported inside a spec, often duplicating a helper already in `helpers.ts`.
2. **Hand-written menu locators that contradict the live menu** — e.g. `getByRole('button', { name: 'Forecast/Inventory' })` when the live label is `Forecast / Inventory`, or an item text with the wrong capitalisation/spelling. The test then fails at navigation, not at the assertion. Use `startWorkflow` or `navigateToMenuItem`, which throws a clear drift error instead of a locator timeout.
3. **`page.waitForTimeout(500)` everywhere** instead of explicit waits.
4. **Placeholder tests** that assert only that a label is visible and describe the real steps ("In a real test, we would…") in comments.
5. **Conditional assertions that pass vacuously** — branching on `tagName`, or wrapping the real assertion in `if (isSelect)` / `if (hasFilter)`. When the control isn't what's expected, these report **green** — the opposite of the harness's honesty rule.
6. **No field helper** — re-deriving `label:has-text("<Label>")` → `.locator('..')` → `select, input, button` in every test, never pinning the actual control type or field id.

The fix: navigation via `startWorkflow` / `navigateToMenuItem` first, confirm the real control with `npm run codegen`, add a field helper (plus the stable `<Object>.<Attribute>` id) to `helpers.ts` on top of the generic complex-combobox / autocomplete helpers, then make each assertion unconditional — and if the feature genuinely isn't configured, encode it as a RED known-defect test rather than a passing conditional.

## Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| Everything times out at login | Remote server unreachable, or wrong `baseURL`/`E2_BASE_URL`. Check network / `playwright.config.ts` / `~/.claude/loop/servers.md`. |
| Authenticated assertions fail but login "works" | Password not set (`SUPER_USER_PASSWORD` or the `~/.e2sc-password-<stack>` file) — helper submitted username only. |
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install` in the harness (it has its own `node_modules`). |
| Search form intermittently fails to render | Session contention from parallel workers. Run serially — keep `workers: 1` / `fullyParallel: false`. |
| `rcp_content` stuck on `Status.jsp?wf=brokerServices` | Menu clicked before the workflow manager was ready. Use `startWorkflow(page, '<workflow>')`, which waits for `getWFM()`. |
| Form renders but type-aheads/downloads never complete | The screen URL was loaded straight into the frame. Start it via `startWF` (`startWorkflow`) so it has workflow context. |
| Type-ahead filter returns everything | No option was picked — typing alone doesn't filter. Use `pickTypeahead`. |
| Locator never matches in-app content | You located on `page` instead of inside the `rcp_content` frame. Use `getRcpFrame`. |
| Combobox values look wrong / empty | Don't scrape `body.textContent()`. Read the hidden `<select>` via `complexComboboxOptionTexts`; for live selection read the panel checkboxes (`input:checked`), not the `<option selected>` attribute (default only). Zero options can mean none are configured. |
| Download data measure is listed but **not checked by default** | Config gap, not a test bug: `&dataMeasure=` has the measure but `&DefaultDMs=` doesn't (or the `DefaultDMs` edit didn't deploy). `grep` both tokens on the server, fix `&DefaultDMs=`, reload workflows. See the `e2sc-rcp` guide. |
| Download test times out `waiting for … getByRole('link', /\.xlsx$/)` | Two causes, both non-obvious. (1) The download is a **queued job** — the File Name is plain text until Status leaves `In Process`; poll with `waitForDownloadJobLink`. (2) Playwright's **default 30s test timeout** is shorter than the job — add `test.setTimeout(300000)`. See § *Downloading a file and asserting its contents*. |
| A download link/dialog is never found | It's in the **`rcp_content_modal`** iframe, not `rcp_content`. Use `getRcpModalFrame(page)`. |
| Job List shows the job stuck at `In Process` | Server-side generation problem, not a test bug — `waitForDownloadJobLink` reports the last Job List state. Check `/e2open/var/log/e2sc/e2sc.log` via the `e2sc-logging` skill. |
| Job ends `Completed With Errors` | Server-side failure — read the error file `captureJobErrorFile` attached to the thrown error, then `e2sc.log` (`e2sc-logging`) and the IoDocTypeDef (`e2sc-io`). |
| Parsed workbook has garbage headers / `No header row found` | Row 1 isn't the header — title/parameter rows sit above the grid. Use `findHeaderRow(ws, { mustContain })`, and `cellText` to normalise rich-text/formula/date cells. |
| Saved download file is missing at parse time | Playwright deletes downloads when the context closes. Persist with `saveDownload(download, prefix)` first. |
| Menu click hits the wrong workflow | Menu markup changed. `navigateToMenuItem` throws a "Menu drift" error naming the expected vs. found text — regenerate the project's `MENU_MAP` from the live menu. |
| `navigateToMenuItem` throws Unknown group/section/item | The error lists valid names — check `MENU_MAP` (it ships empty; mind disambiguated headings like `Shipment (2)` and exact punctuation, e.g. `Forecast / Inventory` vs `Forecast/Inventory (Buy Item)`). |
| A field-visibility test fails | Verify the config is actually deployed/reloaded on the remote server (use the `e2sc-*` skills) before suspecting the test. It may be a documented RED known-defect test. |
| A run reports failures in a project suite | Check whether they are documented **RED known-defect tests** — plain `test()` by design, remedy is config. Don't "fix" them. See *Known-Defect Tests*. |
| Pass/fail counts don't match the project `README.md` | The README's counts may be stale. The specs are the authority. |
| A test passes but proves nothing | It probably wraps the real assertion in `if (…)` and passes vacuously. Make it unconditional — see *Weak-test anti-patterns*. |
| Need a selector you don't know | `npm run codegen` and record the interaction. |
| Failure with no clue | Open the HTML report (`npm run report`) — traces/screenshots/video are captured on failure. |
