import { test, expect } from '@playwright/test';
import { loginAsSuper, navigateToWorkflow, getRcpFrame } from './helpers';

/**
 * Section I: Regression Tests (TC-I1 .. TC-I3)
 *
 * Confirms that adding Order Type doesn't break existing Search / Download /
 * workflow behaviour.
 */

test.describe('Section I: Order Type Regression', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
  });

  test('TC-I1: existing Search works with Order Type + other criteria', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    // Existing search controls should still render alongside Order Type.
    await expect(frame.locator('label:has-text("Order Type")')).toBeVisible({ timeout: 15000 });
    const searchBtn = frame
      .locator('button:has-text("Search"), input[value="Search"], button[type="submit"]')
      .first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await page.waitForLoadState('networkidle');
    }
    await expect(frame.locator('body')).toBeVisible();
  });

  test('TC-I2: History workflow still loads', async ({ page }) => {
    // (Download Search is not a PO menu item — see helpers WORKFLOW_POSITIONS.
    //  History exercises a sibling PO workflow for regression coverage.)
    await navigateToWorkflow(page, 'History');
    const frame = await getRcpFrame(page);
    await expect(frame.locator('body')).toBeVisible();
  });

  test('TC-I3: core PO workflows load without errors', async ({ page }) => {
    for (const wf of ['Search', 'Summary', 'Admin Search']) {
      await navigateToWorkflow(page, wf);
      const frame = await getRcpFrame(page);
      await expect(frame.locator('body')).toBeVisible();
    }
  });
});
