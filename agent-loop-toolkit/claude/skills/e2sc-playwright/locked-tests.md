# Locked-test cheat sheet (agent loop)

Read this INSTEAD of `SKILL.md` / `guide.md` when writing tests under `e2sc-ui_tests/tests/locked/<TICKET>/`.
Open `guide.md` only for a control or screen not covered here (grep it, don't read it whole).

## Rules that differ from the rest of the suite
- No `test.fail`, `test.skip`, `test.fixme`, `test.only`. The gate rejects them. A test for missing behaviour is a plain `test()` that is RED until the config exists. Ignore any "known-defect" / `fixme` convention in `SKILL.md`.
- Don't click through the menu. Use `startWorkflow` (below).
- No `waitForTimeout`. Wait on a concrete condition.
- No conditional assertions (`if (await x.isVisible()) expect(...)`): they pass when the thing is broken.
- Don't edit `helpers.ts` or existing specs. New helpers go in `tests/locked/<TICKET>/`.

## Imports
```ts
import { test, expect } from '@playwright/test';
import { loginAsSuper, getRcpFrame, getRcpModalFrame, saveDownload, waitForDownloadJobLink } from '../../helpers';
import { startWorkflow, rcp, pickTypeahead } from '../../loop-helpers';
```
Check what `tests/helpers.ts` actually exports in this project before using a name; the harness is copied per project and may differ.
- `loginAsSuper(page)`: logs in, waits for `home.do`.
- `startWorkflow(page, '<wf>')`: waits for `rcptop.getWFM()`, then retries `startWF` until the home dashboard has mounted (on some boxes `startWF` throws "reading 'unmount'" until then). Get `<wf>` from the menu item's `javascript:` href, the `wf=` of the screen URL, or the recording. Never `page.goto` the screen URL.
- `getRcpFrame(page)` (Frame) / `rcp(page)` (FrameLocator): all app content is in `iframe[name="rcp_content"]`.
- `getRcpModalFrame(page)`: `rcp_content_modal`, where generated-file links and Job Status appear.
- `pickTypeahead(page, label, value)`: type-aheads only filter once an option is clicked.

## One fresh page and login per test (don't share a page between tests)
Use `test.beforeEach(({ page }) => loginAsSuper(page))` and `startWorkflow` in each test. Measured on a dev box:
- **Don't share one page across tests.** The `rcp_content` frame still holds the previous screen, so a second test's assertion can pass against stale content (a label was "visible" after 33 ms, before the next screen had loaded). That is a false GREEN. Always assert on an element specific to the screen under test.
- **Don't use `test.describe.configure({ mode: 'serial' })`**: it skips every test after the first failure and hides whether the other cases are RED for the right reason.
- **Reusing login cookies (`storageState`) saves nothing**: opening `home.do` is the slow part (about 11-16 s), not the login form.

## Reading controls
- Text input: `frame.locator('[id="<Obj>.<Attr>"]').inputValue()`. Label: `label:has-text("...")`.
- Native `<select>`: read options / value directly.
- `eto-complex-combobox` (multi-select): a hidden `<select multiple>` holds the options; the live selection is `.eto-results-available li[role="option"] input:checked` after opening the panel. `complexComboboxOptionTexts(frame, fieldId)` lists the options.
- Never anchor on `eto<N>` ids; use the model `id`/`name` (`<Object>.<Attribute>`).
- Column or button: assert the header/label text. The visible text is the AllBundles label, not the model ID.
- Don't scrape `body` text.

## Downloads and Excel
- Capture with `const p = page.waitForEvent('download')` registered BEFORE the click (or a harness helper), then `saveDownload(download, '<prefix>')` BEFORE the context closes.
- Downloads are queued jobs: `test.setTimeout(300000)`, poll with `waitForDownloadJobLink`; `Completed With Errors` means a server-side failure, never soften the test.
- Parse with `tests/excel.ts`: `openWorkbook`, `findHeaderRow(ws, { mustContain })` (never `getRow(1)`), `columnValues`, `cellText`.
- Scope a download by a key you control (an order or shipment number) so you read your own row.
- Never invent column labels: read the real header from a run or recording.

## Uploads
Build the file at run time with `tests/upload-fixtures.ts` (`buildXlsxFromTemplate`, `fillTemplateText`, `uniqueValue`, `relativeDate`). Drive the file input with `setInputFiles` in the `rcp_content` frame. Assert on the effect (record on screen or in a download), not the confirmation.

## Test shape
- Name: `TC3 (AC2): Month column is shown in PIT Detail`.
- Several checks in one case: `expect.soft(..., 'message naming the check')`. Setup steps: hard `expect` so a failed precondition stops the test.
- Unique values (timestamp suffix) for any data the test creates.

## Speed
- Run only what changed: `npx playwright test tests/locked/<TICKET> -g "TC3"` from `e2sc-ui_tests/`, or the gate for the full set.
- For the first RED confirmation set `E2_ACTION_TIMEOUT=8000` so tests that fail on missing behaviour don't wait the full 20 s per action.
- Use `loop-verify.sh`'s digest; open the full log only if the digest doesn't explain a failure.
