# e2sc-ui_tests (__STACK__)

Playwright UI tests that drive the live, shared E2open SCPM dev server **__STACK__**
(`__BASE_URL__`, override with `E2_BASE_URL`). Runs serially (`workers: 1`), as `__USERNAME__`
(override with `E2_USERNAME`). Created by `/setup-project` from the agent-loop kit template.

## Password
If the server needs one, set `SUPER_USER_PASSWORD`, or save it once, outside the repo:
```powershell
Read-Host -AsSecureString "__STACK__ password" | ConvertFrom-SecureString -AsPlainText | Set-Content -NoNewline "$HOME\.e2sc-password-__STACK__"
```

## Run
```bash
npx playwright test tests/_smoke             # harness check
npx playwright test tests/locked/<KEY>       # one ticket's locked tests
npm run codegen                              # record a flow for test-author
```

## Layout
- **`tests/helpers.ts`**: generic E2SC helpers: login, the `rcp_content` / `rcp_content_modal`
  iframes, download capture and Job Status polling, and field controls (autocomplete, complex
  combobox, date range). `MENU_MAP` starts empty; fill it from this project's menu if needed.
- **`tests/excel.ts`**: read (or build) .xlsx workbooks with exceljs.
- **`tests/loop-helpers.ts`**: `startWorkflow`, the reliable navigation, and `pickTypeahead`.
- **`tests/locked/<KEY>/`**: each ticket's definition of done. Once `.loop/<KEY>/tests.locked`
  exists, a hook stops agents editing it.
- **`recordings/<KEY>/`**: codegen recordings (reference only).
- **`fixtures/<KEY>/`**: upload files.

Don't commit `node_modules/`, `test-results/`, `playwright-report/` or `recordings/`.
