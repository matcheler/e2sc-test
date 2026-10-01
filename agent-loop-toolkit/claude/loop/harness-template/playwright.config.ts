import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Playwright config for __STACK__ (__BASE_URL__), created by /setup-project.
 *
 * Drives a LIVE, REMOTE, SHARED E2open SCPM dev server - there is no local webServer.
 * Login user: E2_USERNAME (default __USERNAME__). Password: SUPER_USER_PASSWORD, or, if that is
 * unset, the file %USERPROFILE%\.e2sc-password-__STACK__ (kept outside the repo, never committed).
 * Some dev servers log in with the username only; then no password is needed.
 */
if (!process.env.SUPER_USER_PASSWORD) {
  const pwFile = path.join(os.homedir(), '.e2sc-password-__STACK__');
  if (fs.existsSync(pwFile)) process.env.SUPER_USER_PASSWORD = fs.readFileSync(pwFile, 'utf8').trim();
}

export default defineConfig({
  testDir: './tests',
  /* Serial: one shared account on a shared server; parallel workers cause session contention. */
  fullyParallel: false,
  forbidOnly: true,
  /* No retries: a locked test that only passes on retry is not green. */
  retries: 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.E2_BASE_URL || '__BASE_URL__',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
