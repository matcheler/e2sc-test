# E2open SCPM Playwright UI Testing Guide

> **Purpose**: Help developers write, run, and debug Playwright end-to-end tests that drive the live remote E2open SCPM/SSP dev server, for **any** field, control, column, button, or workflow (the `e2sc-ui_tests/` harness). Order Type is the worked example, not the limit.
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
6. [Menu Navigation Map](#menu-navigation-map)
7. [Selector Conventions](#selector-conventions)
8. [Writing a New Test](#writing-a-new-test)
9. [Known-Defect Tests — Do Not Fix](#known-defect-tests--do-not-fix)
10. [`z-mrp-type-filters.spec.ts` — known-weak spec](#z-mrp-type-filtersspects--known-weak-spec)
11. [Troubleshooting](#troubleshooting)

---

## Harness Overview

There is **one** standalone Playwright test harness in this repo, **`e2sc-ui_tests/`** (the older `playwright-demo/` was deleted 2026-07-01). It is independent of the `solution/` build tree — it does **not** build or deploy anything. Its job is to drive a **live, remote** E2open dev server through a browser and assert that configuration behaves correctly end-to-end.

It implements multiple test suites (**55 tests + 2 gated maintenance tools**, verified 2026-08-14):
- **Order Type suite** (11+4+3+4+2+3+4+2+3 tests): categorised specs `a-ui-display` … `i-regression`, each test carrying a TC-ID.
- **Data Measures** (Download ASN for SMI Suppliers): `e2-download-asn-datameasure.spec.ts` (2 tests).
- **MRP Type Filters**: `z-mrp-type-filters.spec.ts` (17 tests — **the weakest spec; see its section below before copying anything from it**).
- **Maintenance tools**: `_menu-discovery.spec.ts` (regenerates the full application menu map) and `_form-discovery.spec.ts` (regenerates PO Search form map).

> **The `order-type.md` test plan document no longer exists in the repo.** `README.md`, `CLAUDE.md`, and several spec header comments still reference it (its §4 "representative dataset" and TC definitions). The specs plus `README.md` are the surviving record — don't try to read the plan file, and don't treat those references as a pointer to something recoverable.

All specs are backed by a **shared `tests/helpers.ts` module** that provides login, menu navigation (via `MENU_MAP` + `navigateToMenuItem` — all 9 groups, ~90 items), iframe access, and field-specific helpers for Order Type, data measures, and autocomplete. Runs **serially**, encodes real control internals, and encodes verified configuration gaps as **RED known-defect tests** plus `test.fail` / `test.fixme` markers (see *Known-Defect Tests* — a full run is **not** expected to be all-green). Its structure is the pattern reference for **any** new test, whatever field it targets.

Key facts:
- **Remote target**: `baseURL` is set in `playwright.config.ts` (e.g. `http://dev11759.dev.e2open.com:11080`), overridable with an `E2_BASE_URL` env var. There is **no** local app and **no** `webServer` block — the server must be reachable over the network.
- **Browser**: only the `chromium` project is configured.
- **Concurrency**: runs **serially** (`workers: 1`, `fullyParallel: false`, `retries: 1`) because the suite shares one account on the remote server and parallel workers cause session contention. Keep it serial.
- **Test data / config** under test lives on that remote server, configured via the `e2sc-*` / `alert-config` skills. A failing UI test often means the config isn't deployed/reloaded, not that the test is wrong.

Before treating a failure as a test bug, confirm:
1. The remote server is reachable.
2. `SUPER_USER_PASSWORD` is set in the environment.
3. The relevant config change has actually been reloaded onto that server.

## Project Layout

```
e2sc-ui_tests/             # the only harness (Order Type suite + additional test suites)
├── playwright.config.ts       # serial (workers:1, fullyParallel:false), retries:1, E2_BASE_URL override
├── package.json               # npm scripts (test, test:headed, test:chrome, codegen, report, ...)
├── README.md                  # spec mapping + verified findings/gaps (NB: its pass/skip COUNTS are stale)
├── menu-map.json              # raw live dump of the FULL application menu (2026-07-06)
├── form-map-po-search.json    # raw live dump of PO Search form (2026-07-07, by _form-discovery.spec.ts)
├── recorded-menu-session.ts   # raw codegen recording kept as a selector reference (not a spec)
├── tests/
│   ├── helpers.ts                      # SHARED login / navigation / iframe / Order Type / data measures / autocomplete / PO Search
│   ├── _menu-discovery.spec.ts         # maintenance tool: regenerates menu-map.json (gated by MENU_DISCOVERY=1)
│   ├── _form-discovery.spec.ts         # maintenance tool: regenerates form-map-po-search.json (gated by FORM_DISCOVERY=1)
│   ├── a-ui-display.spec.ts            # Section A (TC-A1..A7, 11 tests) — Order Type field presence + dropdown values per workflow. 3 RED defects
│   ├── b-business-logic.spec.ts        # Section B (4) — action-based logic (InsertOrUpdate→SAP Order, MRPUpdate→PG Change Request). 3 fixme: needs inbound trigger
│   ├── c-data-migration.spec.ts        # Section C (3) — DB migration script (set existing POs, idempotency). ALL fixme: not UI-automatable
│   ├── d-search-filter.spec.ts         # Section D (4) — drive the Order Type filter via the checkbox panel + submit search
│   ├── e-download.spec.ts              # Section E (2) — Order Type in Download PO workflow. TC-E2 fixme (table-editor path)
│   ├── e2-download-asn-datameasure.spec.ts  # Section E2 (2) — #dataMeasure combobox: available + default-selected measures
│   ├── f-readonly-display.spec.ts      # Section F (3) — read-only display: PO Problem Summary (TC-F3, RED defect); List/Details fixme
│   ├── g-edge-cases.spec.ts            # Section G (4) — NULL/invalid values, concurrency (fixme) + TC-G4 filter persistence (the only test.fail)
│   ├── h-performance.spec.ts           # Section H (2) — client-observed latency, advisory budgets (8s search, 3s dropdown open)
│   ├── i-regression.spec.ts            # Section I (3) — smoke: core PO workflows still load
│   └── z-mrp-type-filters.spec.ts      # MRP Type=ZS filters (TC-Z1..Z17) — KNOWN-WEAK, see its own section
├── evidence/                  # TC-E2-verification-report.html/.pdf — manual verification artefacts
├── playwright-report/
└── test-results/
```

`e2sc-ui_tests/playwright.config.ts` notable settings:
- `testDir: './tests'`, `fullyParallel: false`, `workers: 1` (serial — single shared account).
- `retries: 1` (absorb remote-server hiccups), `reporter: 'html'`.
- `baseURL: process.env.E2_BASE_URL || 'http://dev11759.dev.e2open.com:11080'`.
- `actionTimeout: 20000`, `navigationTimeout: 30000` (remote server is slow).
- `use`: `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.

## Running Tests

Always run from inside `e2sc-ui_tests/`:

```bash
cd e2sc-ui_tests
npm install                                  # first time only
npx playwright install                        # first time (e2sc-ui_tests): download chromium

$env:SUPER_USER_PASSWORD = "<pwd>"           # PowerShell — set before authenticated runs
# export SUPER_USER_PASSWORD=<pwd>           # bash

npx playwright test --project=chromium       # run all (serial in e2sc-ui_tests)
npx playwright test a-ui-display.spec.ts     # single file
npx playwright test -g "TC-A2"               # single test by id (or title substring)

npm run test:headed                          # headed browser
npm run test:debug                           # Playwright inspector
npm run test:ui                              # UI mode
npm run report                               # open last HTML report
npm run codegen                              # record selectors against logon page
```

Override the target server with `E2_BASE_URL`. `npm run codegen` points at `…/e2sc/logon.do` — use it whenever you need a real selector or to discover a menu position instead of guessing.

**Maintenance tools** (only when the app UI or form structure changes):
```bash
$env:MENU_DISCOVERY=1; npx playwright test _menu-discovery   # regenerate menu-map.json
$env:FORM_DISCOVERY=1; npx playwright test _form-discovery   # regenerate form-map-po-search.json
```
These dump the live server's menu / form state to JSON and update the helpers' `MENU_MAP` / `PO_SEARCH_FIELDS` constants.

## The Shared Helpers

The helpers live in a single module, `e2sc-ui_tests/tests/helpers.ts` — **import** them, don't copy:

```ts
import {
  // Auth & navigation
  loginAsSuper,
  navigateToMenuItem, openMenuGroup, MENU_MAP,           // generic — reaches EVERY menu item
  navigateToWorkflow, navigateToDownloadPurchaseOrder, navigateToPurchaseOrderExceptions,
  navigateToDownloadAsnForSmiSupplier,                   // legacy helpers (remain for existing specs)
  
  // iframe access
  getRcpFrame,
  
  // Order Type combobox (worked example)
  orderTypeContainer, orderTypeSelect, orderTypeOptions, waitForOrderType,
  orderTypeOptionTexts, openOrderTypeDropdown, setOrderTypeSelection,
  expectOrderTypeFieldVisible, ORDER_TYPE_FIELD_ID, ORDER_TYPE_VALUES,
  
  // Data measures (Download ASN for SMI)
  dataMeasureContainer, dataMeasureSelect, waitForDataMeasure,
  dataMeasureOptionTexts, dataMeasureSelectedTexts, ASN_SMI_DATA_MEASURES,
  
  // Autocomplete fields (generic)
  autocompleteInput, autocompleteValue, fillAutocomplete,
  
  // Complex-combobox fields (generic, any eto-complex-combobox)
  complexComboboxContainer, complexComboboxOptionTexts,
  
  // Date range fields (generic)
  dateRangeContainer,
  
  // PO Search form (Purchase Order Search workflow)
  PO_SEARCH_FIELDS, PO_SCHEDULE_STATES,
  
  // Utilities
  frameBodyText,
} from './helpers';
```

### Login — `loginAsSuper(page)`
Logs in at `/e2sc/logon.do`.
- Username: `e2open_super_user` (hardcoded).
- Password: `process.env.SUPER_USER_PASSWORD`. If unset, the helper still submits the username and **degrades gracefully** — useful for selector exploration but assertions needing an authenticated session will fail.
- Uses tolerant selectors for username/password/login-button to survive minor markup changes.

### Navigation — any menu item (preferred)
`navigateToMenuItem(page, group, sectionHeading, itemText)` reaches **every** item in the application menu, driven by the `MENU_MAP` table in `helpers.ts` (see the *Menu Navigation Map* section for the full tree). It validates the clicked link's text against the map and throws on drift or unknown names. Use it for all new tests; the helpers below predate it and remain for the existing specs.

### Navigation — Purchase Order menu (legacy wrapper)
`navigateToWorkflow(page, workflowName)` opens **Menu → Order Management**, then clicks the Purchase Order workflow link by **nth-child position**. The Purchase Order submenu has exactly **five** items (verified live):

```ts
const WORKFLOW_POSITIONS: Record<string, number> = {
  Summary: 1, Search: 2, History: 3, 'Admin Search': 4, 'Create Shipment': 5,
};
// clicks: .eto-header__menu-column > ul:nth-child(3) > li > .eto-menu__group > li:nth-child(${position}) > .eto-menu__link
```

Throws on an unsupported `workflowName`. If the menu structure changes, the nth-child positions are what break first.

### Navigation — other menus (legacy wrappers)
Workflows that are **not** Purchase Order menu items are all reachable with `navigateToMenuItem` (preferred); these older dedicated helpers remain for the existing specs:
- `navigateToDownloadPurchaseOrder(page)` — Menu → Downloads → Download Purchase Order (= `navigateToMenuItem(page, 'Downloads', 'Purchase Order', 'Purchase Order')`).
- `navigateToPurchaseOrderExceptions(page)` — Menu → Exceptions → Purchase Order (= `navigateToMenuItem(page, 'Exceptions', 'Order Execution', 'Purchase Order')`).
- `List` / `Details` are reached by running a Search/Summary and drilling into the results grid (**no menu link exists** — confirmed by the full menu dump) — those tests are still `test.fixme`.

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

### Field-specific helpers (e2sc-ui_tests only)

The harness ships field helpers for several fields — they are **templates** for any other field, not a limit. For a new field, add a small helper alongside these following the same shape (same control pattern, different `id`).

#### Order Type combobox (worked example)
- `orderTypeContainer(frame)` → the combobox div (`[id="PoRequestSchedule.PdfString19"]`).
- `orderTypeSelect(frame)` → the hidden `<select multiple>` (source of truth).
- `orderTypeOptions(frame)` → all `<option>` elements.
- `waitForOrderType(frame)` → wait until options have rendered.
- `orderTypeOptionTexts(frame)` → `string[]` of configured values.
- `openOrderTypeDropdown(frame)` → click the expand button to show the checkbox panel.
- `setOrderTypeSelection(frame, values)` → change selection via checkboxes (values is `string[]` of option values).
- `expectOrderTypeFieldVisible(frame)` → assert the combobox is present.

#### Data measures (Download ASN for SMI Suppliers workflow)
Same `eto-complex-combobox` pattern as Order Type, but for a different field (`id="dataMeasure"`):
- `dataMeasureContainer(frame)` → the combobox div.
- `dataMeasureSelect(frame)` → the hidden multi-select.
- `waitForDataMeasure(frame)` → wait until options render.
- `dataMeasureOptionTexts(frame)` → available measures (Forecast, Draft Supply Plan, Committed Supply Plan).
- `dataMeasureSelectedTexts(frame)` → default-selected measures.
- `ASN_SMI_DATA_MEASURES` → constant enum: `{FORECAST, DRAFT, COMMITTED}`.

#### Autocomplete fields (PO Search and others)
- `autocompleteInput(frame, fieldName)` → the visible input for typing (`input[name="<fieldName>__Autocomplete"]`).
- `autocompleteValue(frame, fieldName)` → read the committed value (from the hidden `input[name="<fieldName>"]`).
- `fillAutocomplete(frame, fieldName, value)` → type into the visible input.

#### Generic complex-combobox (any eto-complex-combobox, parameterized)
- `complexComboboxContainer(frame, fieldId)` → the combobox div for a given field id.
- `complexComboboxOptionTexts(frame, fieldId)` → all option texts for that field.

#### Generic date-range fields
- `dateRangeContainer(frame, fieldId)` → the `eto-datepicker-range` container div. Its two visible text inputs carry **unstable `eto<N>` ids** — anchor on the container id / hidden `input[name="<field>"]` instead.

#### PO Search form constants
- `PO_SEARCH_FIELDS` → map of control type → field label → stable field name (model attribute). Covers autocomplete (6 fields), combobox (3 fields), dateRange (2 fields), Saved Searches (`<select name="Filters">`) and the form buttons (`#search`, `#reset_bt`, `#saveSearchNormalBt`, `#editSaveFilterBt`).
- `PO_SCHEDULE_STATES` → the 10 verified Schedule State values (New, Open, Accepted, Accepted with Changes, Supplier Rejected, Partially Shipped, Shipped, Cancelled, Closed, Changed).
- Verified quirk: `Commit Flag` (`PoRequestSchedule.PdfString48`) renders with **zero options** — no values configured, not a test bug.

#### Utilities
- `frameBodyText(frame)` → all text in the frame body. It includes **hidden DOM**, so use it only for "this legacy label must be absent" style checks (TC-A6/A7); prefer a field-specific helper everywhere else.

#### The data-measure flow (navigation + wizard step)
- `navigateToDownloadAsnForSmiSupplier(page)` — Menu → Downloads → "Download ASN for SMI Suppliers" (`.nth(1)` — the menu text appears twice).
- After navigating, click the in-frame **Next** button (`frame.getByRole('button', { name: 'Next' })`) to advance from the DocType step to the data-measure step; `#dataMeasure` does not exist before that.

> The available/selected assertions map to the two config knobs: available list = `&dataMeasure=`, default-checked = `&DefaultDMs=` (see the `e2sc-rcp` guide). A measure present in `dataMeasureOptionTexts` but absent from `dataMeasureSelectedTexts` means `&DefaultDMs=` wasn't updated (or didn't deploy) — not a test bug.

> **The `#dataMeasure` / Next-wizard pattern is not ASN-specific.** A live codegen session (2026-07-06) confirmed the same shape on other download flows: **Download Supplier Inventory** also has a `#dataMeasure` combobox behind a **Next** step, and **Forecast/Supply Plan** / **Inventory** downloads present a data-measure checkbox step (e.g. "Committed Projected Inventory") behind **Next** with a `#eto13` control. Upload flows share a common "Or select file" affordance inside the `rcp_content` frame. Reuse the `dataMeasure*` helpers for these; discover any per-flow quirk with codegen before asserting.

## The rcp_content iframe Pattern

**This is the single most important rule.** The E2open app renders almost all of its content inside an iframe named `rcp_content`. A `page.locator(...)` at the top level will **silently** match nothing for in-app content.

Correct:
```ts
const frame = await getRcpFrame(page);
await expect(frame.locator('label:has-text("Order Type")')).toBeVisible({ timeout: 15000 });
```

Inline form (used in some tests) — `contentFrame()` chained off the iframe locator:
```ts
const dropdownButton = page.locator('iframe[name="rcp_content"]')
  .contentFrame()
  .locator('[id="PoRequestSchedule.PdfString19"] button')
  .filter({ hasText: 'expand_more' });
```

When in doubt about where text lives, read `frame.locator('body').textContent()` and search it.

## Menu Navigation Map

**The complete menu tree is mapped** — dumped live on 2026-07-06 into `e2sc-ui_tests/menu-map.json` (raw) and encoded as `MENU_MAP` in `helpers.ts`. **The table below was re-checked against both on 2026-08-14 and matches exactly** (9 groups, every section heading, every item position) — it is a faithful copy of the discovery output, not a hand-maintained approximation. If you re-run discovery and the JSON changes, update `MENU_MAP` *and* this table together. Regenerate after menu drift with:

```powershell
$env:MENU_DISCOVERY = "1"; npx playwright test _menu-discovery --project=chromium
```

**Every menu item is reachable with the generic helper** — prefer this for all new tests:

```ts
navigateToMenuItem(page, '<Group>', '<Section heading>', '<Item text>');
// e.g.
navigateToMenuItem(page, 'Downloads', 'Purchase Order', 'Purchase Order Customizable Download');
navigateToMenuItem(page, 'Order Management', 'Shipment', 'Search');
navigateToMenuItem(page, 'My Profile', 'Email Alert Subscription', 'Email Alert Subscription');
```

It is positional under the hood (column / ul / li from `MENU_MAP`) and **throws on menu drift** — if the link text at the mapped position doesn't match the requested item, you get an error telling you to re-run the discovery spec, instead of a silent wrong-workflow click. It also throws with the list of valid names on an unknown group/section/item.

Top-level groups (buttons revealed by the **Menu** button): `Exceptions`, `Forecast / Inventory`, `Order Management`, `Master Data`, `Uploads`, `Downloads`, `My Profile`, `Administration`, `System Admin Process/Status`.

| Group | Section heading | Items (in position order) |
|---|---|---|
| Exceptions | Forecast/Inventory (Buy Item) | Forecast / Commit · Inventory |
| Exceptions | Order Execution | Scheduling Agreement · Purchase Order · Shipment · Booking Request |
| Forecast / Inventory | Forecast / Inventory | Search Forecast/Inventory · Search Long-Term Forecast · Create Shipment From Collab |
| Order Management | Order Collaboration (MCV) | Search Order Acknowledgement |
| Order Management | SA Collaboration (MCV) | Search SA Order Acknowledgement |
| Order Management | Purchase Order | Summary · Search · History · Admin Search · Create Shipment |
| Order Management | Booking Request | Summary · Search · Admin Search · History · Create Booking Request |
| Order Management | Shipment | Summary · Search · History |
| Order Management | Scheduling Agreement | Summary · Search · Admin Search · History · Create Shipment |
| Order Management | Shipment (2) | Summary · Search · History |
| Order Management | Receipt | Summary · Search · History |
| Master Data | Edit Static Attributes | Collab Attributes · SA Collab Attributes · Cust Attributes · Supp Attributes · Customer/Site Attributes · Customer/Item Attributes · Supplier/Item Attributes · Customer/Supplier Attributes · Customer/Supplier/Cust-Item Attributes · Booking Request Items Attribute |
| Master Data | Activate/Deactivate Collabs | Sold Item · Buy Item · Scheduling Agreement - Plan |
| Master Data | Edit Master Data Attributes (Buy/Sell) | Collab Attributes · Customer Attributes · Supplier Attributes · Customer/Site Attributes · Customer/Item Attributes · Supplier/Item Attributes · Customer/Supplier Attributes · Customer/Supplier/Cust-Item Attributes · Customer/Supplier/Supp-Item Attributes · Cust/Supp/Cust-Site/Cust-Item/Supp-Item Attributes |
| Uploads | Upload Status | Status |
| Uploads | Master Data Admin | Master Data Upload |
| Uploads | Long Tail Partner Management | Long Tail Partner Initialization |
| Uploads | Forecast/Inventory (Buy Item) | Forecast / Supply Plan Upload |
| Uploads | Supplier Inventory Levels | Supplier Inventory |
| Uploads | Order Execution | Scheduling Agreement Collaboration Upload · Purchase Order Upload · Purchase Order Collaboration Upload · Shipment Upload · Receipt Upload · Booking Request Upload |
| Downloads | Download Status | Status |
| Downloads | Forecast/Inventory (Buy Item) | Forecast/Supply Plan · Inventory · Order Forecast |
| Downloads | Supplier Inventory Levels | Supplier Inventory |
| Downloads | Purchase Order | Purchase Order · Purchase Order Operational Download · Purchase Order Collaboration Download · Purchase Order Customizable Download · Download ASN firm PO template |
| Downloads | Scheduling Agreement | Scheduling Agreement · Scheduling Agreement Operational Download · Scheduling Agreement Collaboration Download · Scheduling Agreement Customizable Download · Download ASN firm SA template |
| Downloads | Shipment | Shipment · Download ASN for SMI Suppliers |
| Downloads | Receipt | Receipt |
| Downloads | Booking Request | Booking Request |
| My Profile | Preference | Collab Preferences |
| My Profile | Email Alert Subscription | Email Alert Subscription |
| Administration | Broadcast Message Management | Edit broadcast message |
| Administration | Company Hierarchy Management | Parent Company Management |
| Administration | Email Alert Delegation | Email Alert Delegation |
| Administration | User/Role Management | Assign Users to Role · Assign Roles to User |
| System Admin Process/Status | Admin | Job Admin · Loading Status (All) |
| System Admin Process/Status | System Process Trigger | SuperComp Triggers |

Notes:
- **Exact-label traps** (the map is the authority — hand-written text locators get these wrong): the group is `Forecast / Inventory` **with** spaces, the item is `Create Shipment From Collab` (capital *F*, *Collab* not *Colab*), and Exceptions → Purchase Order needs `{ exact: true }` because `Purchase Order` is a prefix of other items. `z-mrp-type-filters.spec.ts` gets the first two wrong — see its section.
- **Duplicate-text traps**: some item texts appear more than once in the open menu DOM — codegen recorded `getByText('Master Data Upload').nth(1)` (Uploads) and `.nth(1)` for "Download ASN for SMI Suppliers" (Downloads). `navigateToMenuItem` is positional so it is immune; if you hand-write a text locator instead, expect to need `.nth()`.
- **Order Management column 2 has TWO sections both headed "Shipment"** (identical items); `MENU_MAP` disambiguates the second as `Shipment (2)`.
- **"Long Tail Partner Initialization"** and **"Download Schedules Initialization"** under Master Data are headings with **no link items**.
- The **"Purchase Order Customizable Download"** location (Downloads → Purchase Order, position 4) is now confirmed — previously an unconfirmed-path `test.fixme`.
- The legacy dedicated helpers (`navigateToWorkflow`, `navigateToDownloadPurchaseOrder`, `navigateToPurchaseOrderExceptions`, `navigateToDownloadAsnForSmiSupplier`) remain and are still used by existing specs; **new tests should prefer `navigateToMenuItem`**.
- Smoke-verified live (2026-07-06): PO Search, Shipment Search, PO Customizable Download, Assign Users to Role, PO Exceptions — all reachable via `navigateToMenuItem`.

## Selector Conventions

- **Any field**: locate by its stable `id`, which follows `<Object>.<Attribute>` (e.g. `[id="PoHeader.PoNumber"]`, `[id="PoRequestSchedule.PdfString19"]`), or by `label:has-text("<Field Label>")`. The field's `id`/`name` come from the config model; the label comes from AllBundles.
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

### Complex-combobox internals (Order Type worked example)

The multi-select dropdown control is an `eto-complex-combobox` wrapping a **hidden native multi-select** plus a checkbox panel. Order Type is the concrete example:

```html
<div id="PoRequestSchedule.PdfString19" class="eto-complex-combobox">
  <label>Order Type</label>
  ... chips / text field / expand_more button ...
  <select name="PoRequestSchedule.PdfString19" multiple aria-label="Order Type">
    <option value="SAP Order" selected> SAP Order</option>
    <option value="PG Change Request" selected> PG Change Request</option>
  </select>
  <div class="eto-results" style="display:none"> ...checkbox panel... </div>
</div>
```

- The hidden `<select>` is the **source of truth** for available values and is present **without** opening the dropdown.
- To assert the **default / initial selection** (e.g. which download data measures are pre-checked), read the native select's DOM `selectedOptions` via `.evaluate(el => Array.from(el.selectedOptions).map(o => o.textContent.trim()))` — this is exactly what `dataMeasureSelectedTexts` does and it reliably reflects the rendered default. (Don't rely on the static `selected` **attribute** in `allTextContents`-style scraping.)
- For the *live* selection **after a UI change** (checking/unchecking in the panel), read the panel checkboxes instead: `.eto-results-available li[role="option"] input:checked`.
- Open the panel (`expand_more`) only to *change* the selection. The `helpers.ts` utilities encapsulate this for Order Type (`PoRequestSchedule.PdfString19`) and the data-measure filter (`#dataMeasure`); for another combobox field, write an analogous helper (same structure, different `id`) rather than `body.textContent()` scraping (which matches hidden DOM and is fragile).

## Testing config changes by domain

The harness's field-level assertions today drive **Order Type** (`PoRequestSchedule.PdfString19`) and the **download data-measure filters**, but navigation now reaches **every** workflow (see the Menu Navigation Map), and every `e2sc-*` / `alert-config` / `e2na-config` skill produces a UI-visible change that *can* be verified through this harness. Use the map below to know **what to open and what to assert** after a given config domain is reloaded onto the live server.

> **Reload first, then verify.** A field/button/column/alert that a config skill added only appears once the change is reloaded onto the remote server (`reload_ocmm_script.sh`, PCMM/IoDocTypeDef reloads, `eoadmin`). A UI test that can't find the new element is *usually* a not-reloaded config, **not** a test bug — confirm the reload before touching the test. See the `e2sc-*` skills.

| Config skill | What changes in the UI | Where to look | How to assert it |
|---|---|---|---|
| `e2sc-ocmm` | State badges, action **buttons**, transitions, relationship link-cards, audit history | Order/PO detail view (drill in from Search/Summary) | Button text = the **action label** (from AllBundles); state badge = **user-state name** + icon class (`thumb_up-green`, `eject-red`, `local_shipping-blue`…). Clicking an action should move the badge to the next state. |
| `e2sc-pcmm` | New **fields/columns** in CollabList (MTIM/forecast/inventory) views + the column-picker | The relevant CollabList workflow | Field name → visible **column header**; `widget="AutoComplete"` fields render an autocomplete control (only on `Collab` ObjectName). |
| `e2sc-rcp` | New **MCV timeline columns**, totals/summary rows, decimal formatting, role-gated columns, **download-filter data measures** | MCV / timeline grid (e.g. `procFcstVMISearch`); the "Select Data Measure" step of a PIT/collab download | Column header = `TITLEDATAMEASURE`; left-to-right order = `DATAMEASUREINDEX`; totals row toggles with `ENABLETOTAL`; `double` DMs render with the configured decimal format. For a download filter: available measures = `&dataMeasure=`, pre-checked = `&DefaultDMs=` — assert with `dataMeasureOptionTexts` / `dataMeasureSelectedTexts` (**driven example:** Download ASN for SMI Suppliers). |
| `e2sc-io` | **Download buttons**, the download-configurator dialog, `.xlsx` output | Workflow toolbar (the `BulkIoButtons` area) | Button presence via `DOWNLOAD_PSDSELECTOR` / `Download[DocTypes=…]`; configurator lists selectable columns; output file name = `<File type="output" fileName="…"/>`. **Already partly covered** by the Download PO cases (TC-A1/A4, TC-E1). |
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

Fields, columns, and alerts are gated per role via `role_tgview_info.txt` / `role_info.txt`. The **same** element can be present for one role and absent for another. This harness logs in only as `e2open_super_user`, so it sees the **super-user view** — a "missing" element may simply be gated to a different role. Cross-check the role config (via the `e2sc-*` skills) before recording a gap, and note the role limitation in the test.

### Verified vs. convention (don't invent selectors)

Verified, actually-driven selectors so far:
- **Order Type** (`PoRequestSchedule.PdfString19`) combobox — Search / Admin Search / Download PO flows.
- **Download PO** flow (Menu → Downloads → Download Purchase Order).
- **Download ASN for SMI Suppliers** data-measure filter — `#dataMeasure` combobox reached via Menu → Downloads → "Download ASN for SMI Suppliers" `.nth(1)` → **Next** (see `e2-download-asn-datameasure.spec.ts` + the `dataMeasure*` helpers).
- **PO Search form** (`procDiscreteOrderSearch`, dumped 2026-07-07 into `form-map-po-search.json` / `PO_SEARCH_FIELDS`): 6 autocomplete fields, 3 comboboxes, 2 date ranges, the Saved Searches `<select name="Filters">`, and the button ids (`#search`, `#reset_bt`, `#saveSearchNormalBt`, `#editSaveFilterBt`), plus the 10 verified `PO_SCHEDULE_STATES`. Hidden form state: `PSDSelector=DOBuySide`, `ModelSubType=DiscreteOrder`.
- **Full application menu** — all 9 groups / ~90 items (`menu-map.json` / `MENU_MAP`, smoke-verified via `navigateToMenuItem`).

Verified-as-*absent* / empty (don't chase these as test bugs): `Commit Flag` (`PoRequestSchedule.PdfString48`) renders with **zero** configured options; the four RED known-defect gaps; and the `eto<N>` ids, which are regenerated per render and must never be used as anchors.

Everything else in the table above is a **convention derived from the config model, not a confirmed selector**. Before writing an assertion for a never-driven domain (OCMM action buttons, PCMM/RCP MCV columns, alert checkboxes), discover the real selector with `npm run codegen` — do not hardcode a guessed selector or fake a passing test.

## Writing a New Test

**Generic field skeleton** for **`e2sc-ui_tests/`** (preferred — locate by label/id, assert per control type):

```ts
import { test, expect } from '@playwright/test';
import { loginAsSuper, navigateToWorkflow, getRcpFrame } from './helpers';

test.describe('Section X — <Field Name>', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
  });

  test('TC-X1: <Field> is visible in Search', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    // presence — by label (or by stable id: frame.locator('[id="<Object>.<Attr>"]'))
    await expect(frame.locator('label:has-text("<Field Label>")')).toBeVisible({ timeout: 15000 });
    // value — read per control type, e.g. a text field:
    // expect(await frame.locator('[id="<Object>.<Attr>"]').inputValue()).toBe('<expected>');
  });
});
```

**Complex-combobox variant** (Order Type — reuse its helpers; use `complexComboboxOptionTexts` for a new combobox field):

```ts
import { orderTypeOptionTexts, setOrderTypeSelection, expectOrderTypeFieldVisible, ORDER_TYPE_VALUES } from './helpers';
// ...
await expectOrderTypeFieldVisible(frame);
const options = await orderTypeOptionTexts(frame);
expect(options).toContain(ORDER_TYPE_VALUES.SAP);
// Change selection
await setOrderTypeSelection(frame, [ORDER_TYPE_VALUES.SAP]);
```

**Data Measure variant** (Download ASN for SMI Suppliers):

```ts
import { dataMeasureOptionTexts, dataMeasureSelectedTexts, ASN_SMI_DATA_MEASURES } from './helpers';
// ...
const available = await dataMeasureOptionTexts(frame);
expect(available).toContain(ASN_SMI_DATA_MEASURES.FORECAST);
const selected = await dataMeasureSelectedTexts(frame);
expect(selected).toContain(ASN_SMI_DATA_MEASURES.COMMITTED);   // post-config: all THREE are default-selected
```

Note the real spec navigates with `navigateToDownloadAsnForSmiSupplier(page)` and then clicks the in-frame **Next** button before the `#dataMeasure` control exists, and asserts with `toContain` per measure (not `toEqual` on the whole array) so measure ordering isn't baked in.

**Autocomplete variant** (PO Search fields — Customer Item No., Supplier ID, etc.):

```ts
import { fillAutocomplete, autocompleteValue } from './helpers';
// ...
await fillAutocomplete(frame, 'PoLineItem.CustomerItemName', 'ITEM-123');
const value = await autocompleteValue(frame, 'PoLineItem.CustomerItemName');
expect(value).toBe('ITEM-123');
```

Guidance:
- Group related tests in a `test.describe` block; carry the TC-ID in the test title (e2sc-ui_tests).
- Log in once per test via `beforeEach`.
- Assert with `expect(locator).toBeVisible({ timeout })` rather than sprinkling `waitForTimeout` — the existing tests use generous explicit timeouts (10–15s) because the remote server can be slow.
- Read each field per its control type (see *Reading a field by control type*) via a field-specific helper. Avoid body-text scraping (it matches hidden DOM and is fragile).
- **Never write a conditional assertion.** `if (await x.isVisible().catch(() => false)) { expect(...) }` passes vacuously when the element is missing — which is exactly the case the test exists to catch. If you don't know the control type yet, run codegen and find out; don't branch on it. (`z-mrp-type-filters.spec.ts` violates this — see its section.)
- **Don't define navigation helpers inside a spec.** Shared navigation belongs in `helpers.ts`, or use `navigateToMenuItem` with the mapped names.
- For a **verified live gap**, follow the neighbouring spec's convention: a plain RED `test()` with a `KNOWN DEFECT` comment (house style), or `test.fail(...)` to keep the run green. Use `test.fixme(...)` when it needs backend/DB/EDI access, seeded data, or an unconfirmed menu path. Never fake any of them as a passing `test()`. See *Known-Defect Tests*.

## Known-Defect Tests — Do Not Fix

**Principle (any field or feature):** a test may encode a **verified gap in the live server today, not a test bug**. The correct remedy is a configuration change on the server — **never** edit selectors, adjust timeouts, invert assertions, or delete/soften a marker to force green.

**A full-suite run is NOT expected to be all-green.** The harness uses two different conventions for gaps, and you must recognise which you're looking at:

### Convention 1 — RED known-defect tests (the dominant one, 4 tests)

A plain `test()` that **genuinely fails**, preceded by a `KNOWN DEFECT — SHOULD FAIL (RED)` comment naming the config remedy. The spec header comments spell this out explicitly ("a PLAIN test() that genuinely FAILS (RED) — a known-defect marker, **NOT** wrapped in `test.fail()`").

| Test title | Spec | Verified gap |
|---|---|---|
| `TC-A1: Order Type field visible in Summary` | `a-ui-display.spec.ts` | field absent from the Summary search form (`procDiscreteOrderSummary`) — also absent from History |
| `TC-A2: Search dropdown includes "Planner Change Request"` | `a-ui-display.spec.ts` | only `SAP Order` + `PG Change Request` configured (2 of 3) |
| `TC-A3: Summary dropdown shows Order Type values` | `a-ui-display.spec.ts` | same Summary-form gap |
| `TC-F3: Order Type visible in Purchase Order Problem Summary (Exceptions)` | `f-readonly-display.spec.ts` | field absent from PO Problem Summary; required read-only |

### Convention 2 — `test.fail` (exactly 1 test)

`TC-G4: Order Type filter persists across navigation (FINDING — not persisted)` in `g-edge-cases.spec.ts` — narrowing Order Type, navigating away, and returning resets it to all-selected. Playwright reports a fail-as-expected as **passed**; flip to plain `test()` only once persistence is implemented.

### Convention 3 — `test.fixme` (12 tests)

Cases needing backend/DB/EDI access, seeded data, two concurrent sessions, or an unconfirmed menu path: `b` TC-B1/B2/B4, `c` TC-C1/C2/C3, `e` TC-E2, `f` TC-F1/F2, `g` TC-G1/G2/G3. Reported as skipped — intentionally not faked green.

### Adding a new gap

Match the neighbouring spec's convention — RED + a `KNOWN DEFECT` comment is the house style; use `test.fail` if you want the run to stay green. Either way, state in the comment **which config change fixes it**, and never delete the assertion. (The mixed conventions are deliberate but do mean a run's raw pass/fail counts need interpreting — see the README caveat below.)

### Also expected to fail: a not-yet-reloaded config

`e2-download-asn-datameasure.spec.ts` documents a distinct third failure mode in its header: "Committed Supply Plan" only appears once `reload_workflows.sh` has run on the live server, so a failure on the third-measure assertion is a **reload-not-applied signal**, not a bug. Confirm the reload (via `e2sc-rcp`) before touching the test.

### What passes

Order Type IS present (with the 2 values) in the **Download Purchase Order** workflow (Menu → Downloads → Download Purchase Order), so the Download cases (TC-A1/A4, TC-E1) are implemented and pass. See `e2sc-ui_tests/README.md` and project memory `order-type-summary-history-gap`.

> **`README.md` counts are stale.** It reports "23 passed, 13 skipped, 0 failed" and "five `test.fail` markers" — neither matches the code (1 `test.fail`, 12 `test.fixme`, 4 RED defects, 55 tests). The README's *findings* are still accurate; its *numbers* are not. Read the specs.

> **Note / open discrepancy:** the History case is documented as a gap, but it was once observed **passing** (in the now-deleted `playwright-demo` harness). If you see it pass in `e2sc-ui_tests`, investigate whether the History form was reconfigured (and update these findings) rather than silently trusting either source.

Separately, `test.fixme` tests mark cases needing backend/DB/EDI access, seeded data, or an unconfirmed menu path — they are intentionally not faked as passing.

## `z-mrp-type-filters.spec.ts` — known-weak spec

17 tests (TC-Z1..Z17) covering the **MRP Type=ZS** filter on two workflows: *Forecast/Inventory → Create Shipment from Colab* (Z1–Z8) and *Downloads → Download ASN for SMI Suppliers* (Z9–Z17). It is the **counter-example** to this guide's conventions — read it for intent, don't copy its mechanics.

What's wrong with it:

1. **Local nav helpers instead of the shared ones.** It defines and exports `navigateToCreateShipmentFromColab` and `navigateToDownloadAsnForSmiSuppliers` inside the spec. The latter **duplicates** `navigateToDownloadAsnForSmiSupplier` (singular) already in `helpers.ts`.
2. **Its Workflow-1 navigation contradicts the discovered menu map**, so TC-Z1..Z8 are expected to fail at navigation, not at the assertion:
   - it clicks `getByRole('button', { name: 'Forecast/Inventory' })` — the live group label is **`Forecast / Inventory`** (spaces around the slash);
   - it clicks `getByText('Create Shipment from Colab')` — the live item text is **`Create Shipment From Collab`** (capital *F*, and *Collab* not *Colab*).
   
   The correct call is `navigateToMenuItem(page, 'Forecast / Inventory', 'Forecast / Inventory', 'Create Shipment From Collab')`, which also throws a clear drift error instead of a locator timeout.
3. **`page.waitForTimeout(500)` everywhere** instead of explicit waits.
4. **Placeholder tests.** TC-Z4, Z6, Z8, Z12, Z14, Z15 assert only that the `MRP Type` label is visible and describe the real steps ("In a real test, we would…") in comments — six tests asserting one identical thing.
5. **Conditional assertions that pass vacuously.** TC-Z2 branches on `tagName` and falls through to a bare visibility check; TC-Z17 wraps the "ZS is an option" assertion in `if (isSelect)`; TC-Z13 wraps the supplier-filter assertion in `if (hasSupplierFilter)`. When the control isn't what's expected, these report **green** — the opposite of the harness's honesty rule.
6. **No `mrpType*` helper.** It re-derives `label:has-text("MRP Type")` → `.locator('..')` → `select, input, button` in nearly every test, and never pins the actual control type or field id.

When asked to work on MRP Type filters: fix navigation via `navigateToMenuItem` first, confirm the real control with `npm run codegen`, add an `mrpType*` field helper (plus the stable `<Object>.<Attribute>` id) to `helpers.ts` following the Order Type pattern, then make each assertion unconditional — and if the filter genuinely isn't configured, encode it as a RED known-defect test rather than a passing conditional.

## Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| Everything times out at login | Remote server unreachable, or wrong `baseURL`/`E2_BASE_URL`. Check network / `playwright.config.ts`. |
| Authenticated assertions fail but login "works" | `SUPER_USER_PASSWORD` not set — helper submitted username only. |
| `browserType.launch: Executable doesn't exist` | Run `npx playwright install` in that harness (e2sc-ui_tests has its own `node_modules`). |
| Search form intermittently fails to render | Session contention from parallel workers. Run serially — keep `e2sc-ui_tests` at `workers: 1` / `fullyParallel: false`. |
| Locator never matches in-app content | You located on `page` instead of inside the `rcp_content` frame. Use `getRcpFrame`. |
| Order Type values look wrong / empty | Don't scrape `body.textContent()`. Read the hidden `<select>` via `orderTypeOptionTexts`; for live selection read the panel checkboxes (`input:checked`), not the `<option selected>` attribute (default only). |
| Download data measure is listed but **not checked by default** | Config gap, not a test bug: `&dataMeasure=` has the measure but `&DefaultDMs=` doesn't (or the `DefaultDMs` edit didn't deploy). `grep` both tokens on the server, fix `&DefaultDMs=`, reload workflows. See the `e2sc-rcp` guide. |
| Menu click hits the wrong workflow | Menu markup changed. `navigateToMenuItem` throws a "Menu drift" error naming the expected vs. found text — re-run the discovery spec (`$env:MENU_DISCOVERY="1"; npx playwright test _menu-discovery`) and update `MENU_MAP` in `helpers.ts` (raw dump: `menu-map.json`). |
| `navigateToMenuItem` throws Unknown group/section/item | The error lists valid names — check the Menu Navigation Map table (mind the `Shipment (2)` disambiguation and exact punctuation, e.g. `Forecast / Inventory` vs `Forecast/Inventory (Buy Item)`). |
| A field-visibility test fails | Verify the config is actually deployed/reloaded on the remote server (use the `e2sc-*` skills) before suspecting the test. It may be one of the documented RED known-defect tests. |
| A run reports failures in `a-ui-display` / `f-readonly-display` | Expected. `TC-A1 Summary`, `TC-A2 Planner`, `TC-A3`, `TC-F3` are **RED known-defect tests** — plain `test()` by design, remedy is config. Don't "fix" them. See *Known-Defect Tests*. |
| Pass/fail counts don't match `README.md` | The README's counts are stale (it predates the RED-defect convention). The specs are the authority: 55 tests, 1 `test.fail`, 12 `test.fixme`, 4 RED defects. |
| `z-mrp` Workflow-1 tests time out on navigation | Its local helper uses the wrong menu labels (`Forecast/Inventory`, `Create Shipment from Colab`). Use `navigateToMenuItem(page, 'Forecast / Inventory', 'Forecast / Inventory', 'Create Shipment From Collab')`. |
| A `z-mrp` test passes but proves nothing | Several wrap the real assertion in `if (…)` and pass vacuously. Make it unconditional — see that spec's section. |
| Need a selector you don't know | `npm run codegen` and record the interaction. |
| Failure with no clue | Open the HTML report (`npm run report`) — traces/screenshots/video are captured on failure. |
