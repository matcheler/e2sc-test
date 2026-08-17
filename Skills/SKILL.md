---
name: e2sc-playwright
description: 'Write, run, and debug Playwright UI tests that drive the live remote E2open SCPM/SSP dev server (the e2sc-ui_tests harness). Use for: "add a Playwright test", "write a UI test", "test a field / dropdown / text field / column / button / workflow", "run the playwright tests", "codegen a selector", "why is this UI test failing", iframe/rcp_content selector problems, menu navigation, login helper. Also use to UI-verify any config change made via the e2sc-*/alert-config/e2na-config skills: "test a state transition / action button", "verify a download button / configurator", "check a field label", "test an alert filter / subscription", "verify a new column / data measure". Knows the iframe (rcp_content) pattern, login flow, the FULL application menu map (all 9 groups / ~90 items via navigateToMenuItem), the shared helpers module, the field-control patterns (text / native select / complex-combobox — with Order Type as the worked example), the by-domain config→UI testing map, and how the suite encodes verified gaps (RED known-defect tests + test.fail / test.fixme markers).'
---

# E2open SCPM Playwright UI Testing (e2sc-playwright)

Author and maintain end-to-end Playwright tests that drive a **live, remote** E2open SCPM/SSP dev server to verify configuration behaviour through the real UI.

## The harness

There is **one** standalone Playwright package in this repo, **`e2sc-ui_tests/`** (the older `playwright-demo/` was deleted 2026-07-01). It grew out of the Order Type test plan (specs `a-ui-display` … `i-regression`, TC-IDs) and now also covers download data measures and MRP-type filters. Its *structure* is the template for testing **any** field or workflow: a **shared `tests/helpers.ts` module**, categorised specs with TC-IDs, runs **serially**, and encodes control internals + verified findings. All new tests go here.

**The `order-type.md` test plan document no longer exists in the repo** (README, CLAUDE.md and older comments still reference it). Treat the specs themselves + `e2sc-ui_tests/README.md` as the surviving record of the TC-IDs and the seeded-data assumptions — don't go looking for the plan file or assume it can be re-read.

### Current suite inventory (verified 2026-08-14)

| Spec | Tests | Notes |
|---|---|---|
| `a-ui-display.spec.ts` | 11 | Order Type display/dropdown; **3 are RED known-defect tests** |
| `b-business-logic.spec.ts` | 4 | 1 live, 3 `test.fixme` (need inbound trigger / seeded data) |
| `c-data-migration.spec.ts` | 3 | all `test.fixme` — DB/script level, not UI-automatable |
| `d-search-filter.spec.ts` | 4 | filter drive via the checkbox panel; grid asserts loosened |
| `e-download.spec.ts` | 2 | TC-E1 live; TC-E2 `test.fixme` (table-editor path TBD) |
| `e2-download-asn-datameasure.spec.ts` | 2 | `#dataMeasure` combobox, asserts all **three** measures |
| `f-readonly-display.spec.ts` | 3 | TC-F3 is a **RED known-defect** test; F1/F2 `test.fixme` |
| `g-edge-cases.spec.ts` | 4 | TC-G4 is the suite's **only `test.fail`**; G1–G3 `test.fixme` |
| `h-performance.spec.ts` | 2 | advisory latency budgets (8s search / 3s dropdown) |
| `i-regression.spec.ts` | 3 | smoke |
| `z-mrp-type-filters.spec.ts` | 17 | MRP Type=ZS filters — **weakest spec, see the note below** |
| `_menu-discovery` / `_form-discovery` | 2 | maintenance tools, gated by `MENU_DISCOVERY` / `FORM_DISCOVERY` |

**55 tests + 2 gated maintenance tools.** Markers actually in the code: **1** `test.fail` (TC-G4), **12** `test.fixme`, **4** plain-but-expected-to-fail RED defect tests. `e2sc-ui_tests/README.md` still claims "23 passed, 13 skipped, 0 failed" and "five `test.fail` markers" — that is **stale**; trust the specs, not the README's counts.

## Testing any field or element — this skill is generic

Order Type is just the **worked example** this harness was first built around; the patterns apply to **any** field, control, column, button, or workflow. To test a new element you reuse the same building blocks — login, menu navigation, the `rcp_content` iframe, and a control-appropriate read (see the guide's *"Reading a field by control type"* and *"Testing config changes by domain"* sections). For a field the helpers don't yet cover, add a small field-specific helper following the existing `orderType*` pattern rather than scraping body text.

This skill is also the UI-verification counterpart to every config skill. After a change made via `e2sc-ocmm`, `e2sc-pcmm`, `e2sc-rcp`, `e2sc-io`, `e2sc-cfg`, `alert-config`, or `e2na-config` is reloaded onto the live server, use this skill to assert it actually renders — the guide's by-domain map says *what to open and what to assert* for each.

Two rules that make any such test reliable:
- **Reload first, then verify.** A newly added field/button/column/alert only appears after the config is reloaded onto the remote server (`reload_ocmm_script.sh`, PCMM/IoDocTypeDef reloads, `eoadmin`). A "missing element" is usually a not-reloaded config, not a test bug — confirm the reload (via the relevant `e2sc-*` skill) before editing the test.
- **AllBundles is the visible text.** Assert on the label `e2sc-cfg` maps a model ID to (`USER_ACTION_202` → `Update Date`), not the raw ID. And remember role-gated visibility: this harness only sees the `e2open_super_user` view.

Do **not** invent selectors for elements the harnesses have never driven — discover them with `npm run codegen`.

## Reference Documentation
**Primary Source:** `skills/e2sc-playwright/guide.md` — read this first for the iframe pattern, login helper, menu navigation map, selector conventions, the combobox internals, and run commands.

## Behavior

- Read `guide.md` first, then scan `e2sc-ui_tests/tests/` for the closest existing test and mirror its patterns (helpers, iframe access, waits).
- **Import** the shared helpers from `e2sc-ui_tests/tests/helpers.ts` (`loginAsSuper`, `navigateToMenuItem`, `getRcpFrame`, plus field-specific helpers like `orderTypeOptionTexts`, `setOrderTypeSelection`) — do not copy or reinvent the generic ones. For a new field, add an analogous field-specific helper.
- Almost all app content lives inside the `rcp_content` iframe. Always locate within the frame returned by `getRcpFrame(page)`; top-level `page` locators silently miss iframe content.
- **Read a field by its control type, not by scraping body text.** A plain field is an `<input>`/`<textarea>`; a simple dropdown is a native `<select>`; a multi-select dropdown (the Order Type example) is an `eto-complex-combobox` over a **hidden native `<select multiple>`** — read values/selection from the underlying control (present without opening the panel) and change selection via the checkbox panel. See the guide's control-type table.
- Tests hit a remote server (`baseURL` in `playwright.config.ts`, overridable with `E2_BASE_URL`); there is no local `webServer`. Confirm the server is reachable and `SUPER_USER_PASSWORD` is set before assuming a failure is a test bug.
- `e2sc-ui_tests/` runs **serially** (`workers: 1`, `fullyParallel: false`) because of single-account session contention — keep it that way.
- Ask only essential questions (which workflow, what field/value to assert). Don't ask which files to touch — tests go in `e2sc-ui_tests/tests/*.spec.ts`.

## Critical: the suite is NOT expected to be all-green — don't "fix" the red tests

**General rule (any field or feature):** when a test asserts correct behaviour but the live config doesn't provide it yet, that failure is the deliverable. **Never** edit selectors, adjust timeouts, invert assertions, or delete/soften a marker to force green. The remedy is always a config change on the server (via the `e2sc-*` skills), not a test change.

The suite uses **two different conventions** for this — know which one you're looking at before touching anything:

**1. RED known-defect tests (the dominant convention).** A plain `test()` that genuinely **FAILS**, preceded by a `KNOWN DEFECT — SHOULD FAIL (RED)` comment explaining the config remedy. A full run therefore reports **real failures by design**. The four in the code today:

| Test | Spec | Verified gap |
|---|---|---|
| `TC-A1: Order Type field visible in Summary` | `a-ui-display.spec.ts` | field absent from the Summary search form (`procDiscreteOrderSummary`) |
| `TC-A2: Search dropdown includes "Planner Change Request"` | `a-ui-display.spec.ts` | only `SAP Order` + `PG Change Request` are configured |
| `TC-A3: Summary dropdown shows Order Type values` | `a-ui-display.spec.ts` | same Summary-form gap as TC-A1 |
| `TC-F3: Order Type visible in Purchase Order Problem Summary (Exceptions)` | `f-readonly-display.spec.ts` | field absent from PO Problem Summary; plan requires it read-only |

**2. `test.fail` markers (one test only).** `TC-G4: Order Type filter persists across navigation` in `g-edge-cases.spec.ts` — Playwright reports a fail-as-expected as **passed**. Flip to plain `test()` only once persistence is actually implemented.

**3. `test.fixme` (12 tests).** Scenarios needing backend/DB/EDI access, seeded data, two concurrent sessions, or an unconfirmed menu path — reported as skipped, intentionally not faked green.

When you add a new verified gap, **match the neighbouring spec's convention** (RED + a `KNOWN DEFECT` comment is the house style; `test.fail` if you want the run to stay green) and say in the comment what config change fixes it. Never delete an assertion.

Related: `e2-download-asn-datameasure.spec.ts` documents a third failure mode in its header — the third data measure only appears after `reload_workflows.sh` runs on the live server, so a failure there is a **not-yet-reloaded config** signal, not a bug.

Also documented, and passing: Order Type IS present (with the 2 values) in the **Download Purchase Order** workflow, so TC-A1/A4 (Download) and TC-E1 pass. See `e2sc-ui_tests/README.md` and project memory `order-type-summary-history-gap`.

## `z-mrp-type-filters.spec.ts` — known-weak spec, don't copy it

Its 17 tests are the **counter-example** to this skill's conventions; do not mirror them when writing new tests, and prefer improving them when working in that file:
- It defines **its own local nav helpers** (`navigateToCreateShipmentFromColab`, `navigateToDownloadAsnForSmiSuppliers`) instead of using `navigateToMenuItem` — and its `…Suppliers` duplicates the shared `navigateToDownloadAsnForSmiSupplier` (singular) already in `helpers.ts`.
- Its Workflow-1 nav **contradicts the discovered menu map**, so TC-Z1..Z8 fail at navigation rather than at the assertion: it clicks `'Forecast/Inventory'` (live label: **`Forecast / Inventory`**, with spaces) and `'Create Shipment from Colab'` (live text: **`Create Shipment From Collab`**). Correct call: `navigateToMenuItem(page, 'Forecast / Inventory', 'Forecast / Inventory', 'Create Shipment From Collab')`.
- It leans on `page.waitForTimeout(500)` rather than explicit waits.
- Many tests only assert `label:has-text("MRP Type")` is visible and then describe the real steps in comments (TC-Z4/Z6/Z8/Z12/Z14/Z15), and several wrap the real assertion in `if (isSelect) { … }` / `if (hasSupplierFilter) { … }` so they **pass vacuously** when the control isn't what's expected.

The fix, when asked to work on MRP filters: move the nav into `helpers.ts` (or switch to `navigateToMenuItem`), add an `mrpType*` field helper once codegen confirms the control type, and make the assertions unconditional.

---

## Agent Workflow

### Step 1: Read the Guide
Always load `skills/e2sc-playwright/guide.md` before starting.

### Step 2: Scan for an existing pattern
Find the most similar existing spec in `e2sc-ui_tests/tests/*.spec.ts` and reuse its structure: mirror the `import { … } from './helpers'`, the `test.describe('Section X …')` grouping, and `test.beforeEach(loginAsSuper)`.

### Step 3: Ask only essential questions
```
✅ "Which workflow / menu path? (any of the 9 mapped groups — e.g. Order Management → Purchase Order → Search, Downloads → …, Master Data → …; see guide.md § Menu Navigation Map)" (if not clear)
✅ "Which field/element, and what should the test assert?" (if not clear)
✅ "What control type is it? (text input / native select / complex-combobox / button / column)" (if it affects how to read it)
✅ "Positive test, a known-gap marker (RED test / test.fail), or a test.fixme (needs backend/data)?" (only if it touches a known gap)

❌ DON'T ask: "Which file should the test go in?" — a *.spec.ts under <harness>/tests/
❌ DON'T ask: "Should I reuse the helpers?" — yes, always
```

### Step 4: Write the test using the shared patterns
- Login in `beforeEach` via `loginAsSuper(page)`.
- Navigate with `navigateToMenuItem(page, '<Group>', '<Section heading>', '<Item>')` — it reaches every menu item (see the guide's Menu Navigation Map). The legacy `navigateToWorkflow` / `navigateToDownloadPurchaseOrder` / `navigateToPurchaseOrderExceptions` helpers remain in existing specs.
- Get the iframe with `const frame = await getRcpFrame(page)` and locate **inside** `frame`.
- Read the field according to its **control type** (input / native `<select>` / complex-combobox / column header / button) — see the guide. For Order Type reuse `orderTypeOptionTexts` / `setOrderTypeSelection`; for a new field add an analogous helper rather than scraping body text.
- For a verified gap use the neighbouring spec's convention (RED `test()` + a `KNOWN DEFECT` comment, or `test.fail`); use `test.fixme` for backend/data-blocked cases — never fake them green.
- Prefer explicit `expect(...).toBeVisible({ timeout })` over arbitrary `waitForTimeout`.
- **No conditional assertions.** `if (await x.isVisible().catch(() => false)) { expect(…) }` passes vacuously exactly when the thing you're testing is broken. Find the real control with codegen instead of branching on it.
- Don't define navigation helpers inside a spec — put them in `helpers.ts` or use `navigateToMenuItem`.

### Step 5: Run the test and report honestly
```
cd e2sc-ui_tests
npx playwright test <file>.spec.ts        # or -g "TC-A2" / "<title>" for one test
```
Report pass/fail with the actual output, and **interpret it against the three conventions**: the 4 RED known-defect tests are *supposed* to appear as failures; `test.fail` (TC-G4) fails-as-expected and is reported **passed**; `test.fixme` is skipped. So "N failed" is not automatically a problem — check whether the failing titles are the documented defects before reporting a regression, and never "fix" a documented-gap test.

### Step 6: For new selectors, use codegen
When you don't know a selector, generate it rather than guessing:
```
npm run codegen        # opens recorder against the logon page
```

## Quick Reference

### File locations
```
e2sc-ui_tests/tests/*.spec.ts                # specs: a-ui-display … i-regression, e2-download-asn-datameasure, z-mrp-type-filters
e2sc-ui_tests/tests/helpers.ts               # shared login / navigation (MENU_MAP + navigateToMenuItem) / iframe / Order Type / data measures / autocomplete / PO Search
e2sc-ui_tests/menu-map.json                  # raw live dump of the full application menu (2026-07-06)
e2sc-ui_tests/form-map-po-search.json        # raw live dump of PO Search form fields (2026-07-07, by _form-discovery.spec.ts)
e2sc-ui_tests/recorded-menu-session.ts       # raw codegen recording kept as a selector reference (not a spec)
e2sc-ui_tests/tests/_menu-discovery.spec.ts  # regenerates menu-map.json (gated: MENU_DISCOVERY=1)
e2sc-ui_tests/tests/_form-discovery.spec.ts  # regenerates form-map-po-search.json (gated: FORM_DISCOVERY=1)
e2sc-ui_tests/playwright.config.ts           # serial (workers:1), E2_BASE_URL override, retries:1
e2sc-ui_tests/README.md                      # spec mapping + verified findings (NB: its pass/skip COUNTS are stale)
e2sc-ui_tests/evidence/                      # TC-E2-verification-report.html/.pdf — manual verification artefacts
```
`order-type.md` — **gone from the repo**, though README/CLAUDE.md/spec comments still cite it.

### Run commands (from `e2sc-ui_tests/`)
```
npm install                                  # first time
npx playwright install                        # first time (e2sc-ui_tests): download chromium
$env:SUPER_USER_PASSWORD = "<pwd>"           # PowerShell; export … on bash
npx playwright test --project=chromium       # run all (chromium configured; serial in e2sc-ui_tests)
npx playwright test a-ui-display.spec.ts     # single file
npx playwright test -g "TC-A2"               # single test by id (e2sc-ui_tests) or title substring
npm run test:headed | test:debug | test:ui   # headed / inspector / UI mode
npm run report                               # open last HTML report
npm run codegen                              # record selectors / discover menu positions
npm run test:chrome                          # = playwright test --project=chromium
```
Maintenance tools (only when the app menu / form structure changes):
```
$env:MENU_DISCOVERY="1"; npx playwright test _menu-discovery   # regenerate menu-map.json → update MENU_MAP + guide table
$env:FORM_DISCOVERY="1"; npx playwright test _form-discovery   # regenerate form-map-po-search.json → update PO_SEARCH_FIELDS
```
Override the target with `E2_BASE_URL` (defaults to `dev11759.dev.e2open.com:11080`).

### Auth
- Username hardcoded: `e2open_super_user`.
- Password from env var `SUPER_USER_PASSWORD` (login helper degrades gracefully if unset).

### Shared helpers — `e2sc-ui_tests/tests/helpers.ts` (import; don't copy)
Generic helpers (reuse for any field):
```ts
loginAsSuper(page)                              // logs in via /e2sc/logon.do
navigateToMenuItem(page, group, heading, item)  // PREFERRED — reaches EVERY menu item via MENU_MAP
                                                // e.g. ('Downloads', 'Purchase Order', 'Purchase Order Customizable Download')
openMenuGroup(page, group)                      // Menu → <top-level group> (all 9 groups)
openOrderManagementMenu(page)                   // legacy: Menu → Order Management
navigateToWorkflow(page, workflowName)          // legacy: Menu → Order Management → PO nth-child (5 items)
navigateToDownloadPurchaseOrder(page)           // legacy: Menu → Downloads → Download Purchase Order
navigateToDownloadAsnForSmiSupplier(page)       // legacy: Menu → Downloads → Download ASN for SMI Suppliers (.nth(1))
navigateToPurchaseOrderExceptions(page)         // legacy: Menu → Exceptions → Purchase Order (exact:true)
getRcpFrame(page)                               // returns the rcp_content iframe frame
frameBodyText(frame)                            // whole-frame text — includes hidden DOM, use sparingly
```
Constants: `SUPER_USER_USERNAME`, `LOGIN_URL`, `ORDER_TYPE_FIELD_ID`, `ORDER_TYPE_VALUES`, `LEGACY_PG_FIELD_LABEL`, `WORKFLOW_POSITIONS`, `MENU_MAP` (+ the `MenuSection` interface).
The **full application menu is mapped** (9 top-level groups, ~90 items — dumped live 2026-07-06 by `_menu-discovery.spec.ts`): `MENU_MAP` in `helpers.ts`, raw dump in `e2sc-ui_tests/menu-map.json`, full tree table in `guide.md` § Menu Navigation Map. **All three were re-verified as matching on 2026-08-14** — the guide's table is a faithful copy of the discovery output, so use it as the authority for exact labels instead of hand-writing text locators (traps: `Forecast / Inventory` with spaces, `Create Shipment From Collab`, and `Shipment (2)` for Order Management's duplicate section). `navigateToMenuItem` throws a "Menu drift" error if the menu changes; regenerate with `$env:MENU_DISCOVERY="1"; npx playwright test _menu-discovery` and update `MENU_MAP` **and** the guide's table together.
Field-specific helpers:
```ts
// Order Type combobox (worked example for any eto-complex-combobox)
orderTypeOptionTexts(frame)                     // all configured values
orderTypeContainer(frame), orderTypeSelect(frame), orderTypeOptions(frame)  // div / hidden <select> / <option>s
waitForOrderType(frame)                         // wait until options are attached
openOrderTypeDropdown(frame)                    // click expand_more to show checkbox panel
setOrderTypeSelection(frame, values)            // check/uncheck options in the panel
expectOrderTypeFieldVisible(frame)              // assert the combobox is present

// Download ASN data-measure control (another eto-complex-combobox instance)
dataMeasureContainer(frame), dataMeasureSelect(frame)   // #dataMeasure div + its hidden <select>
waitForDataMeasure(frame)                       // wait until options are attached
dataMeasureOptionTexts(frame)                   // available data measures (Forecast, Draft Supply Plan, etc.)
dataMeasureSelectedTexts(frame)                 // default-selected measures (via native selectedOptions)
ASN_SMI_DATA_MEASURES                           // constant: {FORECAST, DRAFT, COMMITTED}

// Generic autocomplete fields (eto-complex-autocomplete, PO Search)
autocompleteInput(frame, fieldName)             // visible input for typing
autocompleteValue(frame, fieldName)             // read committed value
fillAutocomplete(frame, fieldName, value)      // type into the field

// Generic complex-combobox fields (any eto-complex-combobox by field id)
complexComboboxContainer(frame, fieldId)        // container div
complexComboboxOptionTexts(frame, fieldId)      // all available options

// Generic date-range fields (eto-datepicker-range)
dateRangeContainer(frame, fieldId)              // container div

// PO Search form constants
PO_SEARCH_FIELDS                                // field map: autocomplete(6)/combobox(3)/dateRange(2)/other by label
PO_SCHEDULE_STATES                              // 10 verified Schedule State options
```
`eto<N>` ids (`eto9`, `eto13`, …) are **auto-generated per render and unstable** — never anchor on them; use the model-derived `name` / container `id` (`<Object>.<Attribute>`). Note `Commit Flag` (`PoRequestSchedule.PdfString48`) renders with **zero options** (no values configured) — verified, not a test bug.

### Reading a field by control type
Locate the field by stable `id` (`[id="<Object>.<Attr>"]`) or by `label:has-text("<Label>")`, then read it per control type:
- **Text input / textarea** → `frame.locator('#<id>').inputValue()`; assert visible via the label.
- **Native single-select** → read `<select>` value / options directly.
- **Complex-combobox (multi-select)** → the Order Type case: `<div id="…" class="eto-complex-combobox">` wraps a **hidden native** `<select multiple>` (source of truth for values, present without opening the panel) plus a checkbox panel behind the `expand_more` button. The `<select>`'s `selected` attribute is only the **initial default**; for the live selection read the panel checkboxes (`.eto-results-available li[role="option"] input:checked`).
- **Column / data measure** → assert the header text; **button/action** → assert the button label (from AllBundles).

Prefer a field-specific helper over scraping `frame.locator('body').textContent()`.

### Iframe rule
The app renders inside `iframe[name="rcp_content"]`. Use:
```ts
const frame = await getRcpFrame(page);
await expect(frame.locator('label:has-text("<Field Label>")')).toBeVisible({ timeout: 15000 });
```
Locating on `page` directly (outside the frame) will miss the content.
