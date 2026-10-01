---
description: One-off setup of the agent loop for this project - check the kit, collect dev server details, verify access, create the Playwright harness, register the project
argument-hint: [project folder, default = current]
---

Project: $ARGUMENTS (if empty, use the SVN working-copy root that contains the current directory)

You are setting up the agent loop (`/prepare-ticket`, `/run-loop`) for a project that hasn't used it
before. The engineer running this may be new to the kit. Explain each step in one line as you go.

Work read-only on every server. This command never deploys, reloads, populates, restarts, drops files
into an inbox, or commits.

## Secrets rule
- Never ask for, echo or store passwords, cookies or keys in the chat, the repo or any `.loop` file.
- When a secret is needed, give the engineer the command to save it to a file in their home folder
  and let them run it themselves:
  - Jira: `~/.jira-cookie`
  - test password: `~/.e2sc-password-<STACK>`

## 1. Check the kit is installed
Check each of these, and report ✓ or ✗ with the fix for each ✗:
- Agents `ticket-intake`, `test-author`, `implementer`, `reviewer` in `~/.claude/agents/`.
- Commands `prepare-ticket`, `run-loop` in `~/.claude/commands/`.
- `~/.claude/hooks/protect-locked-tests.js`.
- `~/.claude/scripts/jira.js` and `loop-verify.sh`.
- `~/.claude/loop/` files: `servers.md`, `always-human.md`, `harness-template/`.
- The e2sc/e2na config skills in `~/.claude/skills/`.
- `~/.claude/settings.json` is valid JSON, with a `PreToolUse` hook whose matcher covers
  `Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell` and runs `protect-locked-tests.js`. Test that
  hook once: pipe a fake Edit on `<tmp>/tests/locked/X-1/a.spec.ts` to it, with a
  `<tmp>/.loop/X-1/tests.locked` marker present. It must exit 2.
- Tools: `node`, `npx`, `curl`, `ssh`, `svn` (e.g. TortoiseSVN's command-line tools), and Git Bash
  (`CLAUDE_CODE_GIT_BASH_PATH`).

If kit files are missing, stop and tell them to run the kit installer, `install.ps1` in the
`agent-loop-toolkit` folder, then run `/setup-project` again.

## 2. Identify the project
- **Project root:** the folder containing `.svn`. If there is none, ask; the loop assumes SVN.
- **Existing entry:** read `~/.claude/loop/servers.md`. If the project already has a row, show it and
  ask whether to re-verify it or change it.
- **Layout:** read the project's `CLAUDE.md` if there is one. If there isn't, note that
  the loop works best with one that describes the ssp-ext layout, and offer to draft one later.
- **Baseline:** run `svn status`, list the pre-existing local changes, and warn about any credential
  file in the working copy (e.g. `jira-cookie.txt`).
- **Pre-fill:** find candidate servers to offer, so the engineer can pick rather than type.
  - Grep the repo for `dev[0-9]+\.dev\.e2open\.com`, `*.properties` with `scpm.url` / `stack.scpm` /
    `stack.b2b` / `hub.company.id` (for example the Selenium configs), and host names in EBL or
    scripts.
  - Also use the "Known stacks" section of `servers.md`.

## 3. Ask for the dev server details
Ask with AskUserQuestion. Put the candidates you found first, and use at most 4 questions per call,
so this takes 2 or 3 rounds. You need:
1. **Stack.** Which dev stack or server this project's tests and deploys should use (stack name +
   e2sc host). Say clearly that it is shared with other people.
2. **e2sc URL.** The base URL, normally `http://<host>.dev.e2open.com:11080`. Confirm the login page is
   `/e2sc/logon.do`.
3. **e2na host.** The same box as e2sc, or a separate one (some stacks run e2na on its own box). Give its host name.
4. **SSH.**
   - The engineer's SSH user on that box.
   - Their key file (default `~/.ssh/id_ed25519`).
   - Whether they have a `~/.ssh/config` alias. If not, use the full hostname; short names often
     don't resolve.
5. **Test login.**
   - The user the tests log in as (default `e2open_super_user`).
   - Whether the server needs a password. Some dev stacks log in with the username only.
6. **Inbox drops.** May locked tests drop B2B files into the e2na inbox over SSH? Default inbox:
   `/e2open/var/shared/ssp/co/inbox/`. If yes, the tests only run from machines with this SSH key.
7. **Jira.**
   - The project key or keys, e.g. `ABC`.
   - One existing ticket key, so the workflow can be checked in step 6.

## 4. Check access (read-only)
- **e2sc:** `curl -s -o /dev/null -w "%{http_code}"` on `<url>/e2sc/logon.do`. It must be 200. If you
  get 000 or a timeout, ask whether VPN is on. If it redirects to SSO, the harness can't log in directly.
- **SSH:** run `ssh -o BatchMode=yes -o ConnectTimeout=15 -i <key> <user>@<host> 'hostname; id -un'`.
  - If it fails with host-key verification, ask before retrying with
    `-o StrictHostKeyChecking=accept-new`.
  - Parse stdout only: the login banner goes to stderr.
- **On each box**, check these exist and whether they are readable, without changing anything:
  - `/e2open/var/log/e2na/e2na.log` and `/e2open/var/log/e2sc/e2sc.log`
  - the inbox and archive folders
  - `/e2open/app/projects/ssp-ext/E2/`
  - `/e2open/bin/eoadmin`
  - `/e2open/bin/restart`
  - the e2sc reload scripts: find them, e.g. `ls /e2open/app/e2sc/server/bin/reload_*.sh rcp_populate*`
  - the p2c script
  - Record the paths you find. **Do not run any of them.**
- **Existing log errors:** grep today's e2sc.log for `SuperCompException`, `Undefined Base DataMeasure`
  or NullPointerException. Record anything that was already there as a known problem.

## 5. Create or check the Playwright harness
- **If `<project>/e2sc-ui_tests/` exists,** read its `playwright.config.ts`. Check that the baseURL
  matches step 3, and ask before changing it.
- **Otherwise,** copy `~/.claude/loop/harness-template/` to `<project>/e2sc-ui_tests/`, then replace
  the placeholders in every file:
  - `__BASE_URL__`: the e2sc URL
  - `__STACK__`: the stack name, letters, digits and `-` only
  - `__USERNAME__`: the test login
- **Install:** in `e2sc-ui_tests/`, run `npm install`. Run `npx playwright install chromium` only if
  Chromium isn't already in the Playwright browser cache.
- **Password:** if one is needed, give the engineer the command from the harness README to save it to
  `~/.e2sc-password-<STACK>`, and wait for them to say it's done.
- **Smoke test:** `npx playwright test tests/_smoke --reporter=list`. Both tests must pass: the user
  logs in, and the workflow manager (`rcptop.getWFM()`) is available.
  - If login fails, show the screenshot path from `test-results/`, and ask about credentials or a
    different login page.
- **svn:ignore:** don't run it. Give the engineer these commands to use if they decide to commit the
  harness:
  ```
  svn add --depth=empty e2sc-ui_tests
  svn propset svn:ignore "node_modules
  test-results
  playwright-report
  recordings" e2sc-ui_tests
  ```

## 6. Check Jira access
- **Cookie:** if `~/.jira-cookie` is missing, or `node ~/.claude/scripts/jira.js transitions <ticket>`
  exits with JIRA_AUTH_EXPIRED, give the refresh steps:
  1. Log in to Jira in the browser.
  2. Press F12, open Network, and reload the ticket.
  3. Click the ticket request and copy the **Cookie** request header value.
  4. Run `Get-Clipboard | Set-Content -NoNewline "$HOME\.jira-cookie"`.
  Then retry.
- **Transition:** list the ticket's transitions and ask which one means "work started". It is the one
  `/prepare-ticket` uses after a READY intake. For example "Request Fix" → "Fix Required".
  Record it for this project.

## 7. Register the project
Add or update this project's row in the `## Projects` table of `~/.claude/loop/servers.md`:
- folder
- stack
- e2sc host and URL, plus "username-only login" if that applies
- e2na host
- the exact SSH command (`ssh -o BatchMode=yes -i <key> <user>@<host>`)
- the test login
- the Jira keys and the start transition
- the harness path

Under the table, add a `### <folder>` section with:
- the server paths you found in step 4
- whether inbox drops are allowed
- any known pre-existing errors

## 8. Write the summary
Write `<project>/.loop/SETUP.md` with:
- the date
- each check and its result (kit, access, harness smoke test, Jira)
- the servers.md row
- anything still to do: a missing password, a missing CLAUDE.md, the always-human list reviewed for
  this client, harness commit decisions

Don't include any secret.

Then tell the engineer, briefly:
- what passed and what's left
- that `.loop/` must never be committed
- how to start: `/prepare-ticket <KEY>` for a first, small ticket
- to review `~/.claude/loop/always-human.md`: add anything this client must never have changed
  without a Jira approval, such as EDI mappings, shared specs, keys or permissions
