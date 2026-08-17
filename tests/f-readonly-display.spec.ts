import { test } from '@playwright/test';
import {
  loginAsSuper,
  navigateToPurchaseOrderExceptions,
  getRcpFrame,
  expectOrderTypeFieldVisible,
} from './helpers';

/**
 * Section F: Read-Only Display Tests (TC-F1 .. TC-F3)
 *
 * Paths (verified):
 *   - "Problem Summary" → Menu → Exceptions → Purchase Order
 *     (heading "Purchase Order Problem Summary").
 *   - "List" (Available) / "Details" (Available) → reached by running a
 *     Search/Summary and drilling into the results grid, NOT a menu link;
 *     also need representative PO data. Kept fixme.
 *
 * KNOWN DEFECT (verified live): the Order Type field is NOT present in the
 * Purchase Order Problem Summary (Exceptions) workflow. The test plan (TC-F3)
 * requires it (read-only) in the Problem workflows, so TC-F3 is a plain test()
 * that genuinely FAILS (RED) as a defect marker. The remedy is a config change;
 * do not "fix" the test.
 */

test.describe('Section F: Order Type Read-Only Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
  });

  test.fixme('TC-F1: Order Type visible (read-only) in List (results drill-down — needs data)', async () => {
    // Run a Search/Summary, open the Available results list, assert the Order
    // Type column is shown and not editable. Implement once results-grid
    // selectors are confirmed via `npm run codegen` and data exists.
  });

  test.fixme('TC-F2: Order Type visible (read-only) in Details (results drill-down — needs data)', async () => {
    // From the results list, open a record's Details and assert Order Type is
    // shown and read-only.
  });

  // KNOWN DEFECT — SHOULD FAIL (RED): Order Type absent from PO Problem Summary.
  test('TC-F3: Order Type visible in Purchase Order Problem Summary (Exceptions)', async ({ page }) => {
    await navigateToPurchaseOrderExceptions(page);
    const frame = await getRcpFrame(page);
    await expectOrderTypeFieldVisible(frame, 8000);
  });
});
