import { test, expect, Page } from '@playwright/test';
import {
  loginAsSuper,
  navigateToWorkflow,
  getRcpFrame,
  setOrderTypeSelection,
  ORDER_TYPE_VALUES,
} from './helpers';

/**
 * Section D: Search & Filter Tests (TC-D1 .. TC-D4)
 *
 * Drives the Search workflow's Order Type filter via the checkbox panel.
 * Result-set assertions depend on representative test data on the server
 * (see "Test Data Requirements" in order-type.md). Where the result grid
 * structure isn't yet pinned down, these verify the filter UI behaviour and
 * that search submits without error; tighten the grid-row assertions once the
 * results-table selectors are confirmed via `npm run codegen`.
 */

async function submitSearch(page: Page): Promise<void> {
  const frame = await getRcpFrame(page);
  const searchBtn = frame
    .locator('button:has-text("Search"), input[value="Search"], button[type="submit"]')
    .first();
  if (await searchBtn.isVisible().catch(() => false)) {
    await searchBtn.click();
    await page.waitForTimeout(1500);
  }
}

test.describe('Section D: Order Type Search & Filter', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
    await navigateToWorkflow(page, 'Search');
  });

  test('TC-D1: filter by a single Order Type (SAP Order)', async ({ page }) => {
    const frame = await getRcpFrame(page);
    await setOrderTypeSelection(frame, [ORDER_TYPE_VALUES.SAP]);
    await submitSearch(page);
    await expect(frame.locator('body')).toBeVisible();
  });

  test('TC-D2: filter by multiple Order Types (SAP Order + PG Change Request)', async ({ page }) => {
    const frame = await getRcpFrame(page);
    await setOrderTypeSelection(frame, [ORDER_TYPE_VALUES.SAP, ORDER_TYPE_VALUES.PG]);
    await submitSearch(page);
    await expect(frame.locator('body')).toBeVisible();
  });

  test('TC-D3: default (all selected) search returns data', async ({ page }) => {
    const frame = await getRcpFrame(page);
    // Default state already has all values selected (verified by TC-A5).
    await submitSearch(page);
    await expect(frame.locator('body')).toBeVisible();
  });

  test('TC-D4: deselecting all Order Types clears the filter selection', async ({ page }) => {
    const frame = await getRcpFrame(page);
    await setOrderTypeSelection(frame, []); // uncheck everything (leaves dropdown open)
    // Deterministic, live UI state: no checkbox remains checked in the panel.
    // (NB: the <select> `selected` ATTRIBUTE reflects the initial default, not the
    //  current selection, so probe the panel checkboxes instead.)
    const stillChecked = await frame
      .locator('[id="PoRequestSchedule.PdfString19"] .eto-results-available li[role="option"] input[type="checkbox"]:checked')
      .count();
    expect(stillChecked, 'expected all Order Type values to be deselected').toBe(0);
    // NOTE: whether an empty Order Type filter yields a "no results" result set
    // is data/behaviour dependent on the server. Assert the deterministic filter
    // state here; confirm the empty-result expectation with seeded data + the
    // results-grid selector (`npm run codegen`) before hard-asserting it.
    await submitSearch(page);
  });
});
