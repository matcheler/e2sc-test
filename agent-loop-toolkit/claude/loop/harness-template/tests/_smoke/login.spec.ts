import { test, expect } from '@playwright/test';
import { loginAsSuper } from '../helpers';
import { startWorkflow } from '../loop-helpers';

// /setup-project runs this to prove the harness reaches a real, authenticated app shell.
test('harness smoke: test user is logged in', async ({ page }) => {
  await loginAsSuper(page);
  await expect(page).toHaveURL(/home\.do/);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(text, 'still on the logon page: check the username/password').not.toMatch(/password/i);
  await expect(page.getByText(/menu|logout|log out|sign out/i).first()).toBeVisible({ timeout: 20000 });
});

test('harness smoke: the workflow manager is available for navigation', async ({ page }) => {
  await loginAsSuper(page);
  // Resolves only when rcptop.getWFM() exists; startWorkflow() in loop-helpers.ts depends on it.
  await startWorkflow(page, null);
});
