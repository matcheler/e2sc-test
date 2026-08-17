import { test, expect } from '@playwright/test';
import {
  loginAsSuper,
  navigateToWorkflow,
  navigateToDownloadPurchaseOrder,
  getRcpFrame,
  orderTypeOptions,
  orderTypeOptionTexts,
  orderTypeSelect,
  waitForOrderType,
  frameBodyText,
  expectOrderTypeFieldVisible,
  ORDER_TYPE_VALUES,
  LEGACY_PG_FIELD_LABEL,
} from './helpers';

/**
 * Section A: UI Display & Dropdown Tests (TC-A1 .. TC-A7)
 *
 * VERIFIED against the live server. Where the Order Type field/value is NOT
 * shown but the plan requires it, the test is a PLAIN test() that genuinely
 * FAILS (RED) — a known-defect marker, NOT wrapped in test.fail(). The remedy is
 * a config change; do not "fix" these by editing selectors/timeouts/assertions.
 * Currently-RED defects in this section:
 *
 *  1. Order Type ABSENT from the Summary (procDiscreteOrderSummary) search form
 *     (and History) — TC-A1 Summary, TC-A3. See memory `order-type-summary-history-gap`.
 *  2. "Planner Change Request" Order Type value not configured (dropdown shows
 *     only "SAP Order" + "PG Change Request") — TC-A2 Planner.
 *
 * "Download Search" IS reachable via Menu → Downloads → Download Purchase Order
 * (navigateToDownloadPurchaseOrder); its TC-A1/TC-A4 cases are implemented.
 */

test.describe('Section A: Order Type UI Display & Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
  });

  // --- TC-A1: field display across workflows ---

  test('TC-A1: Order Type field visible in Search', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    await expectOrderTypeFieldVisible(frame);
  });

  // KNOWN DEFECT — this test SHOULD FAIL (RED) until Order Type is added to the
  // Summary search form. Do NOT "fix" it by editing selectors/timeouts; the fix
  // is a config change. See memory note `order-type-summary-history-gap`.
  test('TC-A1: Order Type field visible in Summary', async ({ page }) => {
    await navigateToWorkflow(page, 'Summary');
    const frame = await getRcpFrame(page);
    await expect(
      frame.locator('h3:has-text("Purchase Order Summary")')
    ).toBeVisible({ timeout: 15000 });
    await expectOrderTypeFieldVisible(frame, 5000);
  });

  test('TC-A1: Order Type field visible in Download (Download Purchase Order)', async ({ page }) => {
    // Reached via Menu → Downloads → Download Purchase Order (a "Search Purchase
    // Orders" form). Not a Purchase Order menu item.
    await navigateToDownloadPurchaseOrder(page);
    const frame = await getRcpFrame(page);
    await expectOrderTypeFieldVisible(frame);
  });

  test('TC-A1: Order Type field visible in Admin Search', async ({ page }) => {
    await navigateToWorkflow(page, 'Admin Search');
    const frame = await getRcpFrame(page);
    await expectOrderTypeFieldVisible(frame);
  });

  // --- TC-A2: dropdown values in Search ---

  test('TC-A2: Search dropdown exposes the configured Order Type values (SAP Order, PG Change Request)', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    const joined = (await orderTypeOptionTexts(frame)).join(' | ');
    expect(joined).toContain(ORDER_TYPE_VALUES.SAP);
    expect(joined).toContain(ORDER_TYPE_VALUES.PG);
  });

  // KNOWN DEFECT — this test SHOULD FAIL (RED) until "Planner Change Request" is
  // added as an Order Type value. The fix is a config change, not a test change.
  test('TC-A2: Search dropdown includes "Planner Change Request"', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    const joined = (await orderTypeOptionTexts(frame)).join(' | ');
    expect(joined).toContain(ORDER_TYPE_VALUES.PLANNER);
  });

  // --- TC-A3: dropdown values in Summary ---

  // KNOWN DEFECT — this test SHOULD FAIL (RED): the Order Type field/dropdown is
  // absent from the Summary search form. The fix is a config change.
  test('TC-A3: Summary dropdown shows Order Type values', async ({ page }) => {
    await navigateToWorkflow(page, 'Summary');
    const frame = await getRcpFrame(page);
    await orderTypeOptions(frame).first().waitFor({ state: 'attached', timeout: 5000 });
  });

  // --- TC-A4: dropdown values in Download (Download Purchase Order) ---

  test('TC-A4: Download workflow Order Type dropdown shows configured values', async ({ page }) => {
    await navigateToDownloadPurchaseOrder(page);
    const frame = await getRcpFrame(page);
    const joined = (await orderTypeOptionTexts(frame)).join(' | ');
    expect(joined).toContain(ORDER_TYPE_VALUES.SAP);
    expect(joined).toContain(ORDER_TYPE_VALUES.PG);
  });

  // --- TC-A5: all (configured) values selected by default ---

  test('TC-A5: Search has all Order Type values selected by default', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    await waitForOrderType(frame);
    const total = await orderTypeOptions(frame).count();
    expect(total, 'expected Order Type to expose selectable options').toBeGreaterThan(0);
    // All options carry the `selected` attribute at load (default = all selected).
    const selected = await orderTypeSelect(frame).locator('option[selected]').count();
    expect(selected).toBe(total);
  });

  // --- TC-A6 / TC-A7: legacy "PG Change Request Type" field removed ---

  test('TC-A6: legacy "PG Change Request Type" field removed from Search', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    const frame = await getRcpFrame(page);
    // Guard against substring match on the valid "PG Change Request" value:
    // the legacy field is the labelled control "PG Change Request Type".
    const text = await frameBodyText(frame);
    expect(text).not.toContain(LEGACY_PG_FIELD_LABEL);
  });

  test('TC-A7: legacy "PG Change Request Type" field removed from Summary', async ({ page }) => {
    await navigateToWorkflow(page, 'Summary');
    const frame = await getRcpFrame(page);
    const text = await frameBodyText(frame);
    expect(text).not.toContain(LEGACY_PG_FIELD_LABEL);
  });
});
