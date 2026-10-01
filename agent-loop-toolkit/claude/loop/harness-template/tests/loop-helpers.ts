/**
 * Generic helpers for loop (locked) tests.
 *
 * - Menu clicks are flaky right after login or a server restart. Menu items call
 *   rcptop.getWFM().startWF('<workflow>'), and a click made before the workflow manager is ready
 *   leaves rcp_content on Status.jsp?wf=brokerServices.
 * - Loading a screen URL straight into rcp_content does NOT work: the form renders, but type-aheads
 *   and downloads never complete without the workflow context.
 * - Find a screen's workflow name in its menu item's javascript: href, or in the wf= parameter of the
 *   screen URL (e.g. search.do?wf=<workflowName>).
 */
import { Page, FrameLocator } from '@playwright/test';

/** Wait until the workflow manager exists (a readiness condition, not a delay), then start `wf`. */
export async function startWorkflow(page: Page, wf: string | null): Promise<void> {
  await page.waitForURL(/home\.do/);
  await page.waitForFunction(
    () => {
      const t: any = (window as any).rcptop || window;
      try {
        return !!t.getWFM && !!t.getWFM();
      } catch {
        return false;
      }
    },
    null,
    { timeout: 30000 },
  );
  if (wf) {
    await page.evaluate((w) => {
      const t: any = (window as any).rcptop || window;
      t.getWFM().startWF(w);
    }, wf);
  }
}

/** The rcp_content iframe as a FrameLocator. */
export function rcp(page: Page): FrameLocator {
  return page.locator('iframe[name="rcp_content"]').contentFrame();
}

/**
 * Type-ahead fields (e.g. Supplier Item ID) only filter once an option is picked from the list;
 * typing alone searches everything. Types the last characters and clicks the exact option.
 */
export async function pickTypeahead(page: Page, label: string, value: string, typeChars = 6): Promise<void> {
  const frame = rcp(page);
  const box = frame.getByRole('textbox', { name: label });
  await box.click();
  await box.fill('');
  await box.pressSequentially(value.slice(-typeChars));
  await frame.getByText(value, { exact: true }).first().click();
  await page.keyboard.press('Escape').catch(() => {});
}
