// UI contract runtime for the agent loop's two-phase UI tests.
// Phase A (ui-assert agent) writes page objects whose methods only call unbound(); Phase B (test-author UI-BIND)
// replaces those bodies with locators, clicks, navigation and waits. A spec that reaches an unbound method fails
// with "UNBOUND: <Class>.<method> (<case step>)", which loop-ui-check.js reads to prove Phase A went red for the
// right reason. Do not edit: loop-ui-check.js hashes this file into ui.locked.

export class UnboundStep extends Error {
  constructor(method: string, caseStep: string) {
    super(`UNBOUND: ${method} (${caseStep}) has no binding yet`);
    this.name = 'UnboundStep';
  }
}

/** Body of every page-object method written in Phase A. Throws, so its return type is never. */
export function unbound(method: string, caseStep: string): never {
  throw new UnboundStep(method, caseStep);
}
