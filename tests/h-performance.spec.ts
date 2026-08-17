import { test, expect } from '@playwright/test';
import { loginAsSuper, navigateToWorkflow, getRcpFrame, openOrderTypeDropdown } from './helpers';

/**
 * Section H: Performance & Load Tests (TC-H1, TC-H2)
 *
 * These measure client-observed latency against the test plan's targets.
 * They are environment-sensitive (network, server load, data volume), so the
 * thresholds are advisory — keep them loose enough to catch gross regressions
 * rather than micro-fluctuations. Meaningful TC-H1 numbers require the 10K+ PO
 * dataset described in order-type.md.
 */

test.describe('Section H: Order Type Performance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
  });

  test('TC-H1: search with Order Type filter completes within budget', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    const searchBtn = frame
      .locator('button:has-text("Search"), input[value="Search"], button[type="submit"]')
      .first();
    test.skip(!(await searchBtn.isVisible().catch(() => false)), 'Search button not found');

    const start = Date.now();
    await searchBtn.click();
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    console.log(`TC-H1 search latency: ${elapsed}ms`);
    // Plan target is < 2s; allow generous headroom for the shared remote dev server.
    expect(elapsed).toBeLessThan(8000);
  });

  test('TC-H2: Order Type dropdown opens quickly', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    const start = Date.now();
    await openOrderTypeDropdown(frame);
    const elapsed = Date.now() - start;
    console.log(`TC-H2 dropdown open latency: ${elapsed}ms`);
    // Plan target is < 500ms; allow headroom for remote round-trips.
    expect(elapsed).toBeLessThan(3000);
  });
});
