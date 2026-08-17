import { test, expect } from '@playwright/test';
import {
  loginAsSuper,
  navigateToWorkflow,
  getRcpFrame,
  setOrderTypeSelection,
  waitForOrderType,
  ORDER_TYPE_VALUES,
} from './helpers';

/**
 * Section G: Edge Cases & Negative Tests (TC-G1 .. TC-G4)
 */

test.describe('Section G: Order Type Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
  });

  // TC-G1: missing Order Type value — needs a PO with NULL Order Type seeded.
  test.fixme('TC-G1: PO with missing Order Type displays gracefully (needs NULL-value test data)', async () => {
    // Requires a seeded PO whose Order Type is NULL. Load it in List/Details and
    // assert no error + blank/N-A rendering once such data is available.
  });

  // TC-G2: invalid Order Type value — needs DB-level injection of a bad value.
  test.fixme('TC-G2: PO with invalid Order Type handled (needs DB-injected invalid value)', async () => {
    // Requires inserting an out-of-range Order Type directly in the DB, which is
    // outside Playwright's scope. Verify graceful display once seeded.
  });

  // TC-G3: concurrent edits — needs two authenticated sessions/contexts + editable PO.
  test.fixme('TC-G3: concurrent edits to the same PO resolve without corruption', async () => {
    // Implement with two browser contexts editing the same PO once an editable
    // Order Type surface (and write permissions) are confirmed.
  });

  // FINDING (verified live): the Order Type filter is NOT persisted across
  // navigation — returning to Search resets it to the default (all values
  // selected) rather than the user's narrowed selection. The test plan (TC-G4)
  // expects persistence, so this is kept as test.fail to document the gap; flip
  // to test() if/when filter-state persistence is implemented.
  test.fail('TC-G4: Order Type filter persists across navigation (FINDING — not persisted)', async ({ page }) => {
    await navigateToWorkflow(page, 'Search');
    let frame = await getRcpFrame(page);

    // Narrow to a single value.
    await setOrderTypeSelection(frame, [ORDER_TYPE_VALUES.SAP]);

    // Navigate away then back.
    await navigateToWorkflow(page, 'Admin Search');
    await navigateToWorkflow(page, 'Search');

    frame = await getRcpFrame(page);
    await waitForOrderType(frame);
    // Read the live selection from the panel checkboxes (the <select> `selected`
    // attribute only reflects the initial default, not the current state).
    const selected = await frame
      .locator('[id="PoRequestSchedule.PdfString19"] .eto-results-available li[role="option"] input[type="checkbox"]:checked')
      .count();
    // Persistence would mean exactly one value (SAP Order) remains selected.
    expect(selected).toBe(1);
  });
});
