import { Page, Frame, Download } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generic E2SC (E2open SCPM) helpers shared by every test in this harness.
 *
 * The E2open app renders almost all content
 * inside an iframe named `rcp_content`, so locate INSIDE the frame returned by
 * getRcpFrame(). Top-level `page` locators silently miss in-app content.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPER_USER_USERNAME = process.env.E2_USERNAME || '__USERNAME__';
export const LOGIN_URL = '/e2sc/logon.do';

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

/**
 * Login to E2open as the super user.
 * Password comes from SUPER_USER_PASSWORD; if unset the helper still submits
 * the username and degrades gracefully (useful for selector exploration, but
 * assertions needing an authenticated session will fail).
 */
export async function loginAsSuper(page: Page): Promise<void> {
  await page.goto(LOGIN_URL);

  const usernameField = page.locator(
    'input[name="username"], input[id*="user"], input[placeholder*="Username"], input[type="text"]'
  );
  await usernameField.first().waitFor({ state: 'visible', timeout: 10000 });
  await usernameField.first().click();
  await usernameField.first().fill(SUPER_USER_USERNAME);

  const password = process.env.SUPER_USER_PASSWORD;
  if (password) {
    const passwordField = page.locator(
      'input[name="password"], input[id*="pass"], input[placeholder*="Password"], input[type="password"]'
    );
    await passwordField.first().fill(password);
    await passwordField.first().press('Enter');
  } else {
    await usernameField.first().press('Enter');
  }

  const loginButton = page.locator(
    'button:has-text("Log In"), input[value="Log In"], button[type="submit"]'
  );
  if (await loginButton.isVisible().catch(() => false)) {
    await loginButton.first().click();
  }
}

// ---------------------------------------------------------------------------
// Menu map — top-level group / section / item, addressed by position
//
// Each top-level group renders one or two `.eto-header__menu-column` divs; each
// column holds `<ul>` sections with a heading and
// `.eto-menu__group > li > .eto-menu__link` items addressed by nth-child
// position. Menus differ per client and per role, so MENU_MAP starts empty.
// ---------------------------------------------------------------------------

export interface MenuSection {
  /** 1-based `.eto-header__menu-column` index within the open group. */
  column: number;
  /** 1-based `<ul>` index (nth-of-type) within the column. */
  ul: number;
  heading: string;
  /** Visible link text → 1-based li position within the section. */
  items: Record<string, number>;
}

/**
 * Empty on purpose: each project fills this from its own application menu
 * (e.g. `'Downloads': [{ column: 1, ul: 1, heading: 'Download Status', items: { Status: 1 } }]`).
 * Locked tests should start screens with loop-helpers' `startWorkflow` rather
 * than clicking menus; the menu helpers below are for exploration and codegen.
 */
export const MENU_MAP: Record<string, MenuSection[]> = {};

/** Open Menu → <top-level group> (any group in MENU_MAP). */
export async function openMenuGroup(page: Page, group: string): Promise<void> {
  if (!MENU_MAP[group]) {
    throw new Error(`Unknown menu group "${group}". Valid: ${Object.keys(MENU_MAP).join(', ')}`);
  }
  await page.getByRole('button', { name: 'menu Menu' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: group, exact: true }).first().click();
  await page.waitForTimeout(500);
}

/**
 * Navigate to ANY menu item: Menu → <group> → <section heading> → <item>.
 * Positional (column / ul / li) per MENU_MAP, with a link-text sanity check so
 * menu drift throws instead of silently clicking the wrong workflow.
 *
 * e.g. navigateToMenuItem(page, 'Downloads', 'Download Status', 'Status')
 */
export async function navigateToMenuItem(page: Page, group: string, heading: string, item: string): Promise<void> {
  const sections = MENU_MAP[group];
  if (!sections) {
    throw new Error(`Unknown menu group "${group}". Valid: ${Object.keys(MENU_MAP).join(', ')}`);
  }
  const section = sections.find((s) => s.heading === heading);
  if (!section) {
    throw new Error(`Unknown section "${heading}" in "${group}". Valid: ${sections.map((s) => s.heading).join(', ')}`);
  }
  const position = section.items[item];
  if (!position) {
    throw new Error(`Unknown item "${item}" under "${group} > ${heading}". Valid: ${Object.keys(section.items).join(', ')}`);
  }

  await openMenuGroup(page, group);

  const link = page
    .locator('.eto-header__menu-column:visible')
    .nth(section.column - 1)
    .locator(`:scope > ul:nth-of-type(${section.ul}) > li > .eto-menu__group > li:nth-child(${position}) > .eto-menu__link`);
  const actualText = (await link.textContent())?.trim();
  if (actualText && actualText !== item) {
    throw new Error(
      `Menu drift at "${group} > ${heading}" position ${position}: expected "${item}" but found "${actualText}". ` +
        `Update MENU_MAP from the current application menu.`
    );
  }
  await link.click();
}

// ---------------------------------------------------------------------------
// iframe access
// ---------------------------------------------------------------------------

/** Return the content frame of the rcp_content iframe. */
export async function getRcpFrame(page: Page): Promise<Frame> {
  const iframe = page.locator('iframe[name="rcp_content"]');
  await iframe.waitFor({ state: 'visible', timeout: 15000 });
  const frame = await iframe.contentFrame();
  if (!frame) throw new Error('rcp_content frame not found');
  return frame;
}

/**
 * Return the content frame of the `rcp_content_modal` iframe — the app's MODAL
 * layer, a second iframe distinct from `rcp_content`.
 *
 * Download flows offer the produced file as a link inside this modal, so a
 * locator scoped to `rcp_content` will never see it.
 *
 * The default timeout is generous because the modal only appears once the
 * server has finished generating the file.
 */
export async function getRcpModalFrame(page: Page, timeout = 60000): Promise<Frame> {
  const iframe = page.locator('iframe[name="rcp_content_modal"]');
  await iframe.waitFor({ state: 'visible', timeout });
  const frame = await iframe.contentFrame();
  if (!frame) throw new Error('rcp_content_modal frame not found');
  return frame;
}

// ---------------------------------------------------------------------------
// Download capture
//
// Playwright deletes downloaded files when the browser context closes, so a
// download that will be parsed MUST be saved out first (saveDownload). The
// produced file is then read with the exceljs helpers in ./excel.ts.
// ---------------------------------------------------------------------------

/** Where saved downloads land (git/svn-ignorable, alongside Playwright's own output). */
export const DOWNLOAD_DIR = path.join(__dirname, '..', 'test-results', 'downloads');

/**
 * Persist a download to DOWNLOAD_DIR and return its absolute path.
 *
 * `prefix` disambiguates files across tests — the suite runs serially against
 * one account, and several flows can produce identically-named files, so an
 * un-prefixed save would have tests overwrite each other.
 */
export async function saveDownload(download: Download, prefix = ''): Promise<string> {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const suggested = download.suggestedFilename();
  const file = path.join(DOWNLOAD_DIR, prefix ? `${prefix}-${suggested}` : suggested);
  await download.saveAs(file);
  return file;
}

// ---------------------------------------------------------------------------
// Job Status modal — how E2open delivers a generated download
//
// Clicking Next on a download flow does NOT return a file. It issues a job
// ("Acknowledgment - Request successfully issued. Page will automatically
// refresh in 5 seconds.") and opens a modal titled **Job Status** holding a
// **Job List** table:
//
//   | Document Type            | File Name        | Status     | Creation Time | ... |
//   | <DocType>ExcelDownload   | <name>.xlsx      | In Process | MM/DD/YY:...  |     |
//
// While Status is "In Process" the File Name is PLAIN TEXT. It becomes a LINK
// only once the job completes; clicking that link fires the browser download.
// The panel self-refreshes every ~5s and also has a `refresh` button.
//
// (A codegen recording of such a flow looks like a direct download only because
// the job had already completed by the time the link was clicked.) Consequence:
// any download test must POLL, and must raise its own test timeout above
// Playwright's 30s default.
// ---------------------------------------------------------------------------

/** One row of the Job Status → Job List table. */
export interface JobStatusRow {
  documentType: string;
  fileName: string;
  status: string;
  creationTime: string;
}

/** Read the Job List rows currently rendered in the Job Status modal. */
export async function jobStatusRows(modal: Frame): Promise<JobStatusRow[]> {
  const rows = modal.locator('table tbody tr');
  const out: JobStatusRow[] = [];
  for (let i = 0; i < (await rows.count()); i++) {
    const cells = await rows.nth(i).locator('td').allTextContents();
    if (cells.length < 4) continue; // the layout/spacer table above the grid
    out.push({
      documentType: cells[0].trim(),
      fileName: cells[1].trim(),
      status: cells[2].trim(),
      creationTime: cells[3].trim(),
    });
  }
  return out;
}

/**
 * Job statuses that mean the job is finished and will NEVER produce a file.
 * Polling past one of these just burns the test timeout, so they abort at once.
 *
 * "Completed With Errors" additionally renders a **"Click to download the error
 * file"** link (`ioInbox.do?ACTION=DOWNLOAD&RequestId=…&IsErrorFile=1`) —
 * captureJobErrorFile fetches it so the reason lands in the test output.
 */
const TERMINAL_JOB_ERROR = /completed with errors|failed|error/i;

/** Text of the "Click to download the error file" link, when a job errors. */
export const JOB_ERROR_FILE_LINK = 'Click to download the error file';

/**
 * The error-file link's href, e.g.
 * `ioInbox.do?ACTION=DOWNLOAD&RequestId=68234780&IsErrorFile=1`.
 *
 * Anchoring on the href — not the accessible name — is deliberate: the Job List
 * panel re-navigates its own iframe every ~5s, which kills any
 * `waitFor({ state: 'visible' })` that straddles a refresh (verified: three
 * live runs never captured the link that way, though the aria snapshot showed
 * it present). A single `getAttribute` read wins the race, and the file is then
 * fetched over HTTP with the session's cookies instead of clicked.
 */
export const JOB_ERROR_FILE_HREF = 'a[href*="IsErrorFile=1"]';

/**
 * Download the error file a failed job offers, and return its path plus a text
 * preview (empty preview for binary formats). Best-effort: never throws, since
 * it only ever runs while reporting another failure.
 */
export async function captureJobErrorFile(
  page: Page,
  prefix = 'job-error',
  attempts = 3
): Promise<{ file: string; preview: string } | null> {
  // Retries with a fresh frame each time: the panel self-refreshes every ~5s,
  // detaching the frame mid-operation. Each attempt is one quick href read.
  for (let i = 0; i < attempts; i++) {
    try {
      const modal = await getRcpModalFrame(page, 15000);
      const href = await modal.locator(JOB_ERROR_FILE_HREF).first().getAttribute('href', { timeout: 5000 });
      if (!href) throw new Error('no href');

      // Fetch over HTTP rather than clicking — page.request carries the
      // session cookies and is immune to the panel reloading underneath us.
      const response = await page.request.get(new URL(href, page.url()).toString());
      const body = await response.body();

      const disposition = response.headers()['content-disposition'] ?? '';
      const named = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
      const ext = named ? path.extname(named) || '.txt' : '.txt';

      fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
      const file = path.join(DOWNLOAD_DIR, `${prefix}${named ? `-${named}` : ext}`);
      fs.writeFileSync(file, body);

      const preview = /\.(txt|csv|log|xml|html?)$/i.test(file) ? body.toString('utf8').slice(0, 2000) : '';
      return { file, preview };
    } catch {
      await page.waitForTimeout(2000);
    }
  }
  return null;
}

/**
 * Wait for a queued download job to finish and return the locator of its file
 * link in the Job Status modal.
 *
 * Re-acquires the modal frame on every poll because the panel reloads itself.
 * Aborts immediately on a terminal error status (capturing the job's error
 * file), and otherwise throws with the last-seen Job List state — a job stuck
 * at "In Process", or ending "Completed With Errors", is a **server-side**
 * problem, not a test bug.
 */
export async function waitForDownloadJobLink(
  page: Page,
  fileLink: RegExp | string = /\.xlsx$/i,
  timeout = 180000
) {
  const deadline = Date.now() + timeout;
  let lastSeen: JobStatusRow[] = [];

  while (Date.now() < deadline) {
    const modal = await getRcpModalFrame(page, 30000);
    const link = modal.getByRole('link', { name: fileLink });
    if (await link.first().isVisible().catch(() => false)) return link.first();

    lastSeen = await jobStatusRows(modal).catch(() => lastSeen);

    const failed = lastSeen.find((r) => TERMINAL_JOB_ERROR.test(r.status));
    if (failed) {
      const errorFile = await captureJobErrorFile(page);
      throw new Error(
        `Download job ended "${failed.status}" — the server did not produce ${failed.fileName}. ` +
          `Job row: ${JSON.stringify(failed)}. ` +
          (errorFile
            ? `Error file saved to ${errorFile.file}${errorFile.preview ? `:\n${errorFile.preview}` : ' (binary — open it)'}`
            : `No error file was offered.`) +
          `\nThis is a server-side failure, not a test bug — check /e2open/var/log/e2sc/e2sc.log (e2sc-logging skill) ` +
          `and the IoDocTypeDef for this document type (e2sc-io skill).`
      );
    }

    // Nudge the panel rather than waiting out its own ~5s cycle.
    const refresh = modal.getByRole('button', { name: 'refresh' });
    if (await refresh.isVisible().catch(() => false)) {
      await refresh.click().catch(() => {});
    }
    await page.waitForTimeout(3000);
  }

  throw new Error(
    `Download job did not produce a file link matching ${fileLink} within ${timeout}ms. ` +
      `Last Job List state: ${JSON.stringify(lastSeen)}`
  );
}

// ---------------------------------------------------------------------------
// Generic control helpers (any workflow) — parameterized by the stable
// `<Object>.<Attribute>` field name.
//
// IMPORTANT: `eto<N>` ids (eto9, eto13, …) are auto-generated per render and
// UNSTABLE — never anchor on them. The stable anchors are the model-derived
// `name` / container `id` values (`<Object>.<Attribute>`):
//   - eto-complex-autocomplete: visible input name=`<field>__Autocomplete`,
//     invisible input name=`<field>` holds the committed value.
//   - eto-complex-combobox: container id=`<field>`, hidden
//     <select multiple name=`<field>`> is the source of truth for values and
//     selection, present without opening the dropdown.
//   - eto-datepicker-range: container id=`<field>`, two eto-date-input__field
//     text inputs, hidden input name=`<field>`.
// ---------------------------------------------------------------------------

/** Visible typing input of an eto-complex-autocomplete field. */
export function autocompleteInput(frame: Frame, fieldName: string) {
  return frame.locator(`input[name="${fieldName}__Autocomplete"]`);
}

/** Committed value of an autocomplete field (kept in the invisible input name=`<field>`). */
export async function autocompleteValue(frame: Frame, fieldName: string): Promise<string> {
  return frame.locator(`input[name="${fieldName}"]`).inputValue();
}

/** Type into an autocomplete field (fills the visible __Autocomplete input). */
export async function fillAutocomplete(frame: Frame, fieldName: string, value: string): Promise<void> {
  const input = autocompleteInput(frame, fieldName);
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.fill(value);
}

/** Container div of any eto-complex-combobox by its stable field id. */
export function complexComboboxContainer(frame: Frame, fieldId: string) {
  return frame.locator(`[id="${fieldId}"]`);
}

/** Available option texts of any eto-complex-combobox (from the hidden <select multiple>). */
export async function complexComboboxOptionTexts(frame: Frame, fieldId: string): Promise<string[]> {
  const select = frame.locator(`select[name="${fieldId}"]`);
  await select.waitFor({ state: 'attached', timeout: 15000 });
  return (await select.locator('option').allTextContents()).map((t) => t.trim());
}

/** Container div of an eto-datepicker-range by its stable field id. */
export function dateRangeContainer(frame: Frame, fieldId: string) {
  return frame.locator(`[id="${fieldId}"]`);
}

/**
 * Fill both ends of an eto-datepicker-range.
 *
 * The two visible text inputs carry UNSTABLE `eto<N>` ids, so they are located
 * positionally inside the container (`.eto-date-input__field`, first = from,
 * second = to). Their placeholder is `MM/DD/YYYY hh:mm:ss` — pass values in
 * that format. Each value is committed with Tab; the committed range lands in
 * the hidden `input[name="<fieldId>"]`, which `dateRangeValue` reads back.
 */
export async function fillDateRange(frame: Frame, fieldId: string, from: string, to: string): Promise<void> {
  const inputs = dateRangeContainer(frame, fieldId).locator('.eto-date-input__field');
  await inputs.first().waitFor({ state: 'visible', timeout: 15000 });
  await inputs.nth(0).fill(from);
  await inputs.nth(0).press('Tab');
  await inputs.nth(1).fill(to);
  await inputs.nth(1).press('Tab');
}

/** Committed value of a date-range field (the hidden input the form actually submits). */
export async function dateRangeValue(frame: Frame, fieldId: string): Promise<string> {
  return frame.locator(`input[name="${fieldId}"]`).inputValue();
}

/** `MM/DD/YYYY` for a Date — the format the eto date inputs expect. */
export function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

/** Read all text inside the frame body (broad, includes hidden DOM — use sparingly). */
export async function frameBodyText(frame: Frame): Promise<string> {
  return (await frame.locator('body').textContent()) ?? '';
}
