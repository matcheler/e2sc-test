import { test, expect } from '@playwright/test';
import {
  loginAsSuper,
  navigateToDownloadAsnForSmiSupplier,
  getRcpFrame,
  dataMeasureContainer,
  dataMeasureOptionTexts,
  dataMeasureSelectedTexts,
  ASN_SMI_DATA_MEASURES,
} from './helpers';

/**
 * Section E2: Download ASN for SMI Suppliers — data-measure selection.
 *
 * Config change under verification (Workflow.properties, filter
 * ioProcShipmentforSMISupplierDnloadDmTimelineFilter):
 *   &dataMeasure=Forecast,Commit,PrevCommit  and  DefaultDMs=Forecast,Commit,PrevCommit
 *
 * Adds "Committed Supply Plan" (internal DM PrevCommit) as a third selectable and
 * default-selected measure alongside Forecast and Draft Supply Plan (Commit).
 *
 * Nav path (codegen-verified): Menu → Downloads → "Download ASN for SMI
 * Suppliers" → Next (advances the DocType step to the Select Data Measure step).
 *
 * NOTE: "Committed Supply Plan" only appears after reload_workflows.sh is run on
 * the live server. Until then this test is expected to fail on the third-measure
 * assertion — that failure is the reload not-yet-applied signal, not a bug.
 */
test.describe('Section E2: Download ASN for SMI Suppliers data measures', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuper(page);
    await navigateToDownloadAsnForSmiSupplier(page);
  });

  test('TC-E2a: Select Data Measure step offers Forecast, Draft Supply Plan and Committed Supply Plan', async ({ page }) => {
    const frame = await getRcpFrame(page);
    // Advance from the DocType step to the "Select Data Measure" step.
    await frame.getByRole('button', { name: 'Next' }).click();
    await expect(dataMeasureContainer(frame)).toBeVisible();

    const options = await dataMeasureOptionTexts(frame);
    expect(options).toContain(ASN_SMI_DATA_MEASURES.FORECAST);
    expect(options).toContain(ASN_SMI_DATA_MEASURES.DRAFT);
    expect(options).toContain(ASN_SMI_DATA_MEASURES.COMMITTED);
  });

  test('TC-E2b: All three data measures are selected by default', async ({ page }) => {
    const frame = await getRcpFrame(page);
    await frame.getByRole('button', { name: 'Next' }).click();
    await expect(dataMeasureContainer(frame)).toBeVisible();

    const selected = await dataMeasureSelectedTexts(frame);
    expect(selected).toContain(ASN_SMI_DATA_MEASURES.FORECAST);
    expect(selected).toContain(ASN_SMI_DATA_MEASURES.DRAFT);
    expect(selected).toContain(ASN_SMI_DATA_MEASURES.COMMITTED);
  });
});
