import { Page, Frame, expect } from '@playwright/test';

/**
 * Shared helpers for the Order Type test suite.
 *
 * The E2open app renders almost all content
 * inside an iframe named `rcp_content`, so locate INSIDE the frame returned by
 * getRcpFrame(). Top-level `page` locators silently miss in-app content.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPER_USER_USERNAME = 'e2open_super_user';
export const LOGIN_URL = '/e2sc/logon.do';

/** The Order Type search field/control id used across PO workflows. */
export const ORDER_TYPE_FIELD_ID = 'PoRequestSchedule.PdfString19';

/** Expected Order Type dropdown values per the test plan. */
export const ORDER_TYPE_VALUES = {
  SAP: 'SAP Order',
  PLANNER: 'Planner Change Request',
  PG: 'PG Change Request',
} as const;

/** Legacy field that should NO LONGER be present in Search / Summary. */
export const LEGACY_PG_FIELD_LABEL = 'PG Change Request Type';

/**
 * Purchase Order menu positions (Order Management → Purchase Order), nth-child based.
 * VERIFIED against the live server — the Purchase Order submenu contains exactly
 * these five items and nothing else.
 *
 * NOTE: the other "workflows" named in the test plan are NOT Purchase Order menu
 * items and cannot be reached with navigateToWorkflow — use navigateToMenuItem
 * (all menu locations confirmed live 2026-07-06, see MENU_MAP below):
 *   - "List" / "Details"            → result views reached by running a Search/Summary
 *                                      and drilling into the results grid, not a menu link.
 *   - "Download Status"             → ('Downloads', 'Download Status', 'Status').
 *   - "PO Customizable Download"    → ('Downloads', 'Purchase Order', 'Purchase Order Customizable Download').
 *   - "Problem Summary" (PO exceptions)
 *                                   → ('Exceptions', 'Order Execution', 'Purchase Order').
 */
export const WORKFLOW_POSITIONS: Record<string, number> = {
  Summary: 1,
  Search: 2,
  History: 3,
  'Admin Search': 4,
  'Create Shipment': 5,
};

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
// Navigation
// ---------------------------------------------------------------------------

/** Open Menu -> Order Management. */
export async function openOrderManagementMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'menu Menu' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Order Management' }).click();
  await page.waitForTimeout(500);
}

/**
 * Navigate to a Purchase Order workflow by name.
 * Uses the verified nth-child position when known, otherwise falls back to
 * clicking a menu link by its visible text.
 */
export async function navigateToWorkflow(page: Page, workflowName: string): Promise<void> {
  await openOrderManagementMenu(page);

  const position = WORKFLOW_POSITIONS[workflowName];
  if (!position) {
    throw new Error(
      `"${workflowName}" is not a Purchase Order menu item. Valid: ${Object.keys(WORKFLOW_POSITIONS).join(', ')}. ` +
        `See the note on WORKFLOW_POSITIONS for where List/Details/Download Search/Problem*/Customizable Download actually live.`
    );
  }

  await page
    .locator(
      `.eto-header__menu-column > ul:nth-child(3) > li > .eto-menu__group > li:nth-child(${position}) > .eto-menu__link`
    )
    .first()
    .click();
}

/** Open Menu → Downloads → Download Purchase Order. */
export async function navigateToDownloadPurchaseOrder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'menu Menu' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Downloads' }).click();
  await page.waitForTimeout(500);
  await page.locator('section').getByTitle('Download Purchase Order').click();
}

/**
 * Open Menu → Downloads → "Download ASN for SMI Suppliers"
 * (workflow ioProcShipmentforSMISupplierDnload).
 *
 * Verified nav path via codegen: the menu text appears more than once, so the
 * second occurrence (`.nth(1)`) is the actual launch link.
 */
export async function navigateToDownloadAsnForSmiSupplier(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'menu Menu' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Downloads' }).click();
  await page.waitForTimeout(500);
  await page.getByText('Download ASN for SMI Suppliers').nth(1).click();
}

/** Open Menu → Exceptions → Purchase Order (PO exceptions / problem workflow). */
export async function navigateToPurchaseOrderExceptions(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'menu Menu' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Exceptions' }).click();
  await page.waitForTimeout(500);
  await page.locator('section').getByText('Purchase Order', { exact: true }).click();
}

// ---------------------------------------------------------------------------
// Full menu map — every top-level group / section / item (verified live)
//
// Discovered 2026-07-06 by tests/_menu-discovery.spec.ts (raw dump in
// ../menu-map.json). Each top-level group renders one or two
// `.eto-header__menu-column` divs; each column holds `<ul>` sections with a
// heading and `.eto-menu__group > li > .eto-menu__link` items addressed by
// nth-child position. Re-run the discovery spec (MENU_DISCOVERY=1) if the
// menu drifts.
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

export const MENU_MAP: Record<string, MenuSection[]> = {
  Exceptions: [
    { column: 1, ul: 1, heading: 'Forecast/Inventory (Buy Item)', items: { 'Forecast / Commit': 1, Inventory: 2 } },
    { column: 1, ul: 2, heading: 'Order Execution', items: { 'Scheduling Agreement': 1, 'Purchase Order': 2, Shipment: 3, 'Booking Request': 4 } },
  ],
  'Forecast / Inventory': [
    { column: 1, ul: 1, heading: 'Forecast / Inventory', items: { 'Search Forecast/Inventory': 1, 'Search Long-Term Forecast': 2, 'Create Shipment From Collab': 3 } },
  ],
  'Order Management': [
    { column: 1, ul: 1, heading: 'Order Collaboration (MCV)', items: { 'Search Order Acknowledgement': 1 } },
    { column: 1, ul: 2, heading: 'SA Collaboration (MCV)', items: { 'Search SA Order Acknowledgement': 1 } },
    { column: 1, ul: 3, heading: 'Purchase Order', items: { Summary: 1, Search: 2, History: 3, 'Admin Search': 4, 'Create Shipment': 5 } },
    { column: 1, ul: 4, heading: 'Booking Request', items: { Summary: 1, Search: 2, 'Admin Search': 3, History: 4, 'Create Booking Request': 5 } },
    // Column 2 has TWO sections both headed "Shipment" (ul 1 and ul 3) with
    // identical items — disambiguated here as "Shipment" / "Shipment (2)".
    { column: 2, ul: 1, heading: 'Shipment', items: { Summary: 1, Search: 2, History: 3 } },
    { column: 2, ul: 2, heading: 'Scheduling Agreement', items: { Summary: 1, Search: 2, 'Admin Search': 3, History: 4, 'Create Shipment': 5 } },
    { column: 2, ul: 3, heading: 'Shipment (2)', items: { Summary: 1, Search: 2, History: 3 } },
    { column: 2, ul: 4, heading: 'Receipt', items: { Summary: 1, Search: 2, History: 3 } },
  ],
  'Master Data': [
    { column: 1, ul: 1, heading: 'Edit Static Attributes', items: {
      'Collab Attributes': 1, 'SA Collab Attributes': 2, 'Cust Attributes': 3, 'Supp Attributes': 4,
      'Customer/Site Attributes': 5, 'Customer/Item Attributes': 6, 'Supplier/Item Attributes': 7,
      'Customer/Supplier Attributes': 8, 'Customer/Supplier/Cust-Item Attributes': 9,
      'Booking Request Items Attribute': 10,
    } },
    { column: 1, ul: 2, heading: 'Activate/Deactivate Collabs', items: { 'Sold Item': 1, 'Buy Item': 2, 'Scheduling Agreement - Plan': 3 } },
    // "Long Tail Partner Initialization" (column 1, ul 3) is a heading with no link items.
    { column: 2, ul: 1, heading: 'Edit Master Data Attributes (Buy/Sell)', items: {
      'Collab Attributes': 1, 'Customer Attributes': 2, 'Supplier Attributes': 3,
      'Customer/Site Attributes': 4, 'Customer/Item Attributes': 5, 'Supplier/Item Attributes': 6,
      'Customer/Supplier Attributes': 7, 'Customer/Supplier/Cust-Item Attributes': 8,
      'Customer/Supplier/Supp-Item Attributes': 9, 'Cust/Supp/Cust-Site/Cust-Item/Supp-Item Attributes': 10,
    } },
    // "Download Schedules Initialization" (column 2, ul 2) is a heading with no link items.
  ],
  Uploads: [
    { column: 1, ul: 1, heading: 'Upload Status', items: { Status: 1 } },
    { column: 1, ul: 2, heading: 'Master Data Admin', items: { 'Master Data Upload': 1 } },
    { column: 1, ul: 3, heading: 'Long Tail Partner Management', items: { 'Long Tail Partner Initialization': 1 } },
    { column: 1, ul: 4, heading: 'Forecast/Inventory (Buy Item)', items: { 'Forecast / Supply Plan Upload': 1 } },
    { column: 1, ul: 5, heading: 'Supplier Inventory Levels', items: { 'Supplier Inventory': 1 } },
    { column: 1, ul: 6, heading: 'Order Execution', items: {
      'Scheduling Agreement Collaboration Upload': 1, 'Purchase Order Upload': 2,
      'Purchase Order Collaboration Upload': 3, 'Shipment Upload': 4, 'Receipt Upload': 5,
      'Booking Request Upload': 6,
    } },
  ],
  Downloads: [
    { column: 1, ul: 1, heading: 'Download Status', items: { Status: 1 } },
    { column: 1, ul: 2, heading: 'Forecast/Inventory (Buy Item)', items: { 'Forecast/Supply Plan': 1, Inventory: 2, 'Order Forecast': 3 } },
    { column: 1, ul: 3, heading: 'Supplier Inventory Levels', items: { 'Supplier Inventory': 1 } },
    { column: 1, ul: 4, heading: 'Purchase Order', items: {
      'Purchase Order': 1, 'Purchase Order Operational Download': 2,
      'Purchase Order Collaboration Download': 3, 'Purchase Order Customizable Download': 4,
      'Download ASN firm PO template': 5,
    } },
    { column: 2, ul: 1, heading: 'Scheduling Agreement', items: {
      'Scheduling Agreement': 1, 'Scheduling Agreement Operational Download': 2,
      'Scheduling Agreement Collaboration Download': 3, 'Scheduling Agreement Customizable Download': 4,
      'Download ASN firm SA template': 5,
    } },
    { column: 2, ul: 2, heading: 'Shipment', items: { Shipment: 1, 'Download ASN for SMI Suppliers': 2 } },
    { column: 2, ul: 3, heading: 'Receipt', items: { Receipt: 1 } },
    { column: 2, ul: 4, heading: 'Booking Request', items: { 'Booking Request': 1 } },
  ],
  'My Profile': [
    { column: 1, ul: 1, heading: 'Preference', items: { 'Collab Preferences': 1 } },
    { column: 1, ul: 2, heading: 'Email Alert Subscription', items: { 'Email Alert Subscription': 1 } },
  ],
  Administration: [
    { column: 1, ul: 1, heading: 'Broadcast Message Management', items: { 'Edit broadcast message': 1 } },
    { column: 1, ul: 2, heading: 'Company Hierarchy Management', items: { 'Parent Company Management': 1 } },
    { column: 1, ul: 3, heading: 'Email Alert Delegation', items: { 'Email Alert Delegation': 1 } },
    { column: 1, ul: 4, heading: 'User/Role Management', items: { 'Assign Users to Role': 1, 'Assign Roles to User': 2 } },
  ],
  'System Admin Process/Status': [
    { column: 1, ul: 1, heading: 'Admin', items: { 'Job Admin': 1, 'Loading Status (All)': 2 } },
    { column: 1, ul: 2, heading: 'System Process Trigger', items: { 'SuperComp Triggers': 1 } },
  ],
};

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
 * e.g. navigateToMenuItem(page, 'Downloads', 'Purchase Order', 'Purchase Order Customizable Download')
 *      navigateToMenuItem(page, 'Order Management', 'Shipment', 'Search')
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
        `Re-run tests/_menu-discovery.spec.ts (MENU_DISCOVERY=1) and update MENU_MAP.`
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

// ---------------------------------------------------------------------------
// Order Type field utilities
//
// On the live server the Order Type control is an `eto-complex-combobox`:
//   <div id="PoRequestSchedule.PdfString19" class="eto-complex-combobox">
//     <label>Order Type</label>
//     ... chips / text field / expand_more button ...
//     <select name="PoRequestSchedule.PdfString19" multiple aria-label="Order Type">
//       <option value="SAP Order" selected> SAP Order</option>
//       <option value="PG Change Request" selected> PG Change Request</option>
//     </select>
//     <div class="eto-results" style="display:none"> ...checkbox panel... </div>
//   </div>
//
// The hidden native <select> is the source of truth for values + selection and
// is present WITHOUT opening the dropdown. Open the dropdown (expand_more) only
// to change the selection via the checkbox panel.
// ---------------------------------------------------------------------------

/** Container div for the Order Type combobox. */
export function orderTypeContainer(frame: Frame) {
  return frame.locator(`[id="${ORDER_TYPE_FIELD_ID}"]`);
}

/** The hidden native multi-select backing the Order Type combobox. */
export function orderTypeSelect(frame: Frame) {
  return frame.locator(`select[name="${ORDER_TYPE_FIELD_ID}"]`);
}

/** All Order Type <option> elements (values + selection state). */
export function orderTypeOptions(frame: Frame) {
  return orderTypeSelect(frame).locator('option');
}

/** Wait until the Order Type control and its options have rendered. */
export async function waitForOrderType(frame: Frame, timeout = 15000): Promise<void> {
  await orderTypeOptions(frame).first().waitFor({ state: 'attached', timeout });
}

/** Trimmed text of each Order Type option, e.g. ["SAP Order", "PG Change Request"]. */
export async function orderTypeOptionTexts(frame: Frame): Promise<string[]> {
  await waitForOrderType(frame);
  return (await orderTypeOptions(frame).allTextContents()).map((t) => t.trim());
}

/** Open the Order Type dropdown (expand_more) to reveal the checkbox panel. */
export async function openOrderTypeDropdown(frame: Frame): Promise<void> {
  const button = orderTypeContainer(frame).locator('.eto-complex-combobox__btn button').first();
  await button.waitFor({ state: 'visible', timeout: 15000 });
  await button.click();
}

/**
 * Set the Order Type selection to exactly `values` via the checkbox panel.
 * Opens the dropdown, then checks/unchecks each option by its data-value.
 */
export async function setOrderTypeSelection(frame: Frame, values: string[]): Promise<void> {
  await openOrderTypeDropdown(frame);
  const options = orderTypeContainer(frame).locator('.eto-results-available li[role="option"]');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const li = options.nth(i);
    const dataValue = (await li.getAttribute('data-value')) ?? '';
    const checkbox = li.locator('input[type="checkbox"]');
    const want = values.includes(dataValue);
    const checked = await checkbox.isChecked().catch(() => false);
    if (want !== checked) {
      // Click the label rather than the (often visually-hidden) input.
      await li.locator('.eto-checkbox__label, .eto-checkbox__box').first().click();
    }
  }
}

// ---------------------------------------------------------------------------
// Download ASN — data-measure control
//
// On the "Select Data Measure" step of the Download ASN for SMI Suppliers flow
// the control is the same eto-complex-combobox widget as Order Type, rendered
// with container id="dataMeasure". Its hidden native multi-<select> is the
// source of truth for the available measures AND their default selection, and
// is present without opening the dropdown (the expand button is `#dataMeasure
// button`, per codegen).
//
// Config (Workflow.properties, filter ioProcShipmentforSMISupplierDnloadDmTimeline
// Filter): &dataMeasure=Forecast,Commit,PrevCommit and DefaultDMs are the same
// three. Labels resolve via pc.web.common.<DM> in AllBundles:
//   Forecast → Forecast, Commit → Draft Supply Plan, PrevCommit → Committed Supply Plan
// ---------------------------------------------------------------------------

/** Expected data measures on the Download ASN for SMI Suppliers flow (post-config). */
export const ASN_SMI_DATA_MEASURES = {
  FORECAST: 'Forecast',
  DRAFT: 'Draft Supply Plan',
  COMMITTED: 'Committed Supply Plan',
} as const;

/** Container div for the data-measure combobox. */
export function dataMeasureContainer(frame: Frame) {
  return frame.locator('#dataMeasure');
}

/** Hidden native multi-select backing the data-measure combobox. */
export function dataMeasureSelect(frame: Frame) {
  return dataMeasureContainer(frame).locator('select');
}

/** Wait until the data-measure options have rendered. */
export async function waitForDataMeasure(frame: Frame, timeout = 15000): Promise<void> {
  await dataMeasureSelect(frame).locator('option').first().waitFor({ state: 'attached', timeout });
}

/** Trimmed label of every available data measure, e.g. ["Forecast", "Draft Supply Plan"]. */
export async function dataMeasureOptionTexts(frame: Frame): Promise<string[]> {
  await waitForDataMeasure(frame);
  return (await dataMeasureSelect(frame).locator('option').allTextContents()).map((t) => t.trim());
}

/** Trimmed label of the data measures selected by default (the pre-checked set). */
export async function dataMeasureSelectedTexts(frame: Frame): Promise<string[]> {
  await waitForDataMeasure(frame);
  return dataMeasureSelect(frame).evaluate((el: HTMLSelectElement) =>
    Array.from(el.selectedOptions).map((o) => (o.textContent ?? '').trim())
  );
}

// ---------------------------------------------------------------------------
// Purchase Order Search form map (dumped live 2026-07-07 by
// tests/_form-discovery.spec.ts — raw dump in ../form-map-po-search.json).
//
// URL: /e2sc/modelSearch.do?wf=procDiscreteOrderSearch&wff=procDiscreteOrderSearchSearch
// Hidden form state: PSDSelector=DOBuySide, ModelSubType=DiscreteOrder.
//
// IMPORTANT: `eto<N>` ids (eto9, eto13, …) are auto-generated per render and
// UNSTABLE — never anchor on them. The stable anchors are the model-derived
// `name` / container `id` values below (`<Object>.<Attribute>`).
// ---------------------------------------------------------------------------

/** PO Search fields by control type, label → stable model field name. */
export const PO_SEARCH_FIELDS = {
  /** eto-complex-autocomplete: visible input name=`<field>__Autocomplete`, invisible input name=`<field>` holds the committed value. */
  autocomplete: {
    'Purchase Order No.': 'PoHeader.PoNumber',
    'Supplier ID': 'PoHeader.SupplierName',
    'Customer Item No.': 'PoLineItem.CustomerItemName',
    'Customer Item Description': 'PoLineItem.CustomerItemDesc',
    'Customer Site': 'PoRequestSchedule.CustomerSiteName',
    'Customer Site Description': 'PoRequestSchedule.PdfString10',
  },
  /** eto-complex-combobox: container id=`<field>`, hidden <select multiple name=`<field>`>. */
  combobox: {
    'Schedule State': 'PoRequestSchedule.State',
    'Commit Flag': 'PoRequestSchedule.PdfString48', // VERIFIED 2026-07-07: renders with ZERO options (no values configured)
    'Order Type': ORDER_TYPE_FIELD_ID,
  },
  /** eto-datepicker-range: container id=`<field>`, two eto-date-input__field text inputs (unstable eto ids), hidden input name=`<field>`. */
  dateRange: {
    'PO Creation Date': 'PoHeader.PoCreationDate',
    'Request Date': 'PoRequestSchedule.RequestDate',
  },
  /** Native single <select name="Filters"> (Saved Searches) + form buttons by stable id. */
  other: {
    savedSearches: 'Filters', // <select> — options include None / Last Search / user-saved names
    searchButton: '#search',
    resetButton: '#reset_bt',
    saveSearchButton: '#saveSearchNormalBt',
    editSavedSearchButton: '#editSaveFilterBt',
  },
} as const;

/** Schedule State options verified live on PO Search (2026-07-07). */
export const PO_SCHEDULE_STATES = [
  'New', 'Open', 'Accepted', 'Accepted with Changes', 'Supplier Rejected',
  'Partially Shipped', 'Shipped', 'Cancelled', 'Closed', 'Changed',
] as const;

// ---------------------------------------------------------------------------
// Generic control helpers (any workflow) — parameterized by the stable
// `<Object>.<Attribute>` field name. The Order Type / dataMeasure helpers
// above are the field-specific instances of the combobox pattern.
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

/** Read all text inside the frame body (broad, includes hidden DOM — use sparingly). */
export async function frameBodyText(frame: Frame): Promise<string> {
  return (await frame.locator('body').textContent()) ?? '';
}

/** Assert that the Order Type combobox is present and visible in the current frame. */
export async function expectOrderTypeFieldVisible(frame: Frame, timeout = 15000): Promise<void> {
  await expect(orderTypeContainer(frame)).toBeVisible({ timeout });
}
