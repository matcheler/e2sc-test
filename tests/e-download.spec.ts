import { test, expect } from '@playwright/test';
import {
  loginAsSuper,
  navigateToDownloadPurchaseOrder,
  getRcpFrame,
  orderTypeOptionTexts,
  expectOrderTypeFieldVisible,
  ORDER_TYPE_VALUES,
} from './helpers';

/**
 * Section E: Download & Export Tests (TC-E1, TC-E2)
 *
 * The PO download workflow is reached via Menu → Downloads → "Download Purchase
 * Order", which renders a "Search Purchase Orders" form that includes the Order
 * Type filter (verified live: combobox present, values SAP Order + PG Change
 * Request). TC-E1 asserts Order Type is part of the download workflow's
 * criteria. Verifying the column inside the *produced file* (and the
 * column-customization via the table editor for TC-E2) still needs the export
 * to be triggered + parsed, so TC-E2 stays fixme with the path noted.
 */

test.describe('Section E: Order Type Download & Export', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
    await navigateToDownloadPurchaseOrder(page);
  });

  test('TC-E1: Download Purchase Order workflow exposes the Order Type filter with configured values', async ({ page }) => {
    const frame = await getRcpFrame(page);
    await expectOrderTypeFieldVisible(frame);
    const joined = (await orderTypeOptionTexts(frame)).join(' | ');
    expect(joined).toContain(ORDER_TYPE_VALUES.SAP);
    expect(joined).toContain(ORDER_TYPE_VALUES.PG);
    // FOLLOW-UP: trigger the export (page.waitForEvent('download')) and assert the
    // produced CSV/XLSX actually contains an "Order Type" column.
  });

  test.fixme('TC-E2: Customizable Download offers Order Type as a column (table-editor path TBD)', async () => {
    // The column set for the download is customized via the "settings" / Open
    // Table Editor control on the Download Purchase Order workflow. Confirm that
    // path with `npm run codegen`, then assert "Order Type" is offered among the
    // selectable columns.
  });
});
