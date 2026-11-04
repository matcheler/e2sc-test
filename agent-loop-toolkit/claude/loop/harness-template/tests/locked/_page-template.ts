// =====================================================================================================
// UI contract page-object template (agent loop, Phase A = ui-assert, Phase B = test-author UI-BIND).
// loop-ui-check.js parses pages/*.ts with the rules below. A page file that doesn't follow them fails.
//
// LAYOUT (per ticket)
//   e2sc-ui_tests/tests/locked/<KEY>/specs/<name>.spec.ts   complete tests, locked at ui.locked
//   e2sc-ui_tests/tests/locked/<KEY>/pages/<Name>Page.ts     one class per screen; bodies bound in Phase B
//
// PAGE FILE RULES
//   - Imports only. Then exactly one `export class <Name>Page { ... }` per file. No top-level functions,
//     const/let/var, getters, setters or arrow-function properties: helpers are `private` methods.
//   - Constructor: `constructor(private readonly page: Page) {}` (exactly this).
//   - One method per line of signature: `async name(args): Promise<T> {` or `name(args): T {`.
//   - Public methods are the locked interface (their signatures are hashed into ui.locked):
//       step methods   = one per named step in the approved case, return Promise<void>
//       query methods  = one per asserted element/value, return a RAW value only:
//                        Locator | string | string[] | number | number[] (or a Promise of one of these).
//                        Never boolean, never a value that judges correctness ("isCorrect", "hasRightLabel").
//   - `private` methods are allowed in Phase B and are excluded from the signature lock, but get the same lint.
//   - Phase A bodies: exactly one statement, `unbound('<Class>.<method>', '<TCn> <step or check>');`
//     (query methods: `return unbound(...)`).
//   - Never in pages/: expect( , an expected value from a spec's assertion, isVisible/isHidden, .or( ,
//     .catch( , try { , timeout: 0 , waitForTimeout/setTimeout, if (await ... count()) , page.route,
//     addInitScript, exposeFunction. Locate by model IDs from the contract ([id="Obj.Attr"], [name=...],
//     workflow names) and by the contract's "Navigation labels" only.
//
// SPEC FILE RULES (Phase A writes them; nobody edits them after ui.locked)
//   - Imports only from '@playwright/test' and '../pages/<Name>Page'.
//   - One test per approved UI case, titled 'TCn (ACn): <what>'. No describe.serial, beforeEach login,
//     test.skip/only/fixme/fail.
//   - Every interaction goes through a page-object method. No page.locator/getBy*/goto/click/fill/evaluate
//     in a spec. browser.newContext() / context.newPage() / context.close() are allowed for fresh-session
//     negatives.
//   - Every expected value, label, status, message comes from cases.approved, written literally inside
//     expect(...). Several checks per case: expect.soft(value, 'TCn check k: ...'). Preconditions: hard expect.
//   - Never assert on a Navigation label.
// =====================================================================================================

import type { Page, Locator } from '@playwright/test';
import { unbound } from '../../../ui-contract';

export class ExampleSummaryPage {
  constructor(private readonly page: Page) {}

  /** TC1 S1: sign in as the harness user */
  async signIn(): Promise<void> {
    unbound('ExampleSummaryPage.signIn', 'TC1 S1');
  }

  /** TC1 S2: open Purchase Order Summary, Header tab */
  async openHeaderTab(): Promise<void> {
    unbound('ExampleSummaryPage.openHeaderTab', 'TC1 S2');
  }

  /** TC1 S3: pick a Customer ID from the auto-complete */
  async pickCustomerId(value: string): Promise<void> {
    unbound('ExampleSummaryPage.pickCustomerId', 'TC1 S3');
  }

  /** TC1 check 1: the Customer ID control (model ID PoHeader.CustomerName) */
  customerIdControl(): Locator {
    return unbound('ExampleSummaryPage.customerIdControl', 'TC1 check 1');
  }

  /** TC1 check 3: labels of the filter form, in screen order */
  async filterLabelsInOrder(): Promise<string[]> {
    return unbound('ExampleSummaryPage.filterLabelsInOrder', 'TC1 check 3');
  }
}

// ----- matching spec (specs/example.spec.ts), for reference only --------------------------------------
// import { test, expect } from '@playwright/test';
// import { ExampleSummaryPage } from '../pages/ExampleSummaryPage';
//
// test('TC1 (AC1): Customer ID auto-complete on the Header filter', async ({ page }) => {
//   const po = new ExampleSummaryPage(page);
//   await po.signIn();                                   // TC1 S1
//   await po.openHeaderTab();                            // TC1 S2
//   await expect(po.customerIdControl(), 'TC1 check 1: Customer ID control is shown').toBeVisible();
//   await expect.soft(po.customerIdControl(), 'TC1 check 2: label').toContainText('Customer ID');
//   expect.soft(await po.filterLabelsInOrder(), 'TC1 check 3: exact order').toEqual(
//     ['Purchase Order No.', 'Customer ID', 'Supplier ID', 'Order Type']);
//   await po.pickCustomerId('CUST-001');                   // TC1 S3
// });
