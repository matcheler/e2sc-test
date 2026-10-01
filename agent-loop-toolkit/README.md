# Agent loop kit (E2open SCPM / SSP projects)

Four Claude Code subagents and three commands that take a Jira ticket from intake to a reviewed change
that you check in to SVN. It runs a code, test and fix loop with a locked definition of done.

## Install (once per machine)
1. You need Claude Code, Node.js (for `node` and `npx`), Git for Windows (Git Bash), Playwright and VPN access to the dev servers.
2. From this folder, run:
   ```powershell
   pwsh -File .\install.ps1
   ```
   - It copies `claude\` into `%USERPROFILE%\.claude`, keeping files you already have (`-Force`
     overwrites them).
   - It registers the lock hook and the SSH guard hook in `settings.json`, backing up the old file first.
   - It self-tests the lock hook.
3. Restart Claude Code.

## Set up a project (once per project)
Open the project's SVN working copy in Claude Code and run:
```
/setup-project
```
It works through these steps:
1. Checks the kit is installed.
2. Suggests dev servers it finds in the repo, then asks you for:
   - the stack
   - e2sc and e2na hosts
   - your SSH user and key
   - the test login
   - whether tests may drop files into the inbox
   - your Jira keys
3. Checks access, read-only. It never reloads or restarts anything.
4. Creates `e2sc-ui_tests/` from the template and runs a smoke login test.
5. Checks Jira access and asks which transition means "work started".
6. Registers the project in `~/.claude/loop/servers.md`.
7. Writes `.loop/SETUP.md`.


## Work a ticket
| Command | What it does |
|---|---|
| `/prepare-ticket <KEY>` | **ticket-intake** decides READY or NOT_READY (questions go to Jira). **test-author** drafts plain-language test cases, which are posted to Jira. You approve or change them in chat and say what access and data the tests may use. test-author then asks you to record the codegen flows those cases need and writes exactly the approved cases as Playwright tests. The coordinator checks one test per case and that each fails for the right reason, then locks them. You don't review the test code. |
| `/run-loop <KEY>` | Run `/clear` first. Checks the lock, then **implementer** changes config through the skills and runs the gate, up to 3 times. The coordinator re-verifies, **reviewer** checks the change against the ticket, and you get `checkin.md` plus a Jira summary. You approve server actions and commit. |

## What's in the kit
| Path under `claude\` | Purpose |
|---|---|
| `agents\` | `ticket-intake`, `test-author`, `implementer`, `reviewer` |
| `commands\` | `setup-project`, `prepare-ticket`, `run-loop` |
| `hooks\protect-locked-tests.js` | Blocks edits to `tests/locked/<KEY>/` once `.loop/<KEY>/tests.locked` exists |
| `hooks\loop-ssh-guard.js` | Lets the loop agents SSH to the hosts in your `servers.md` without a prompt (only the implementer may scp outside the inbox), and makes every reload, populate, p2c or restart ask you |
| `scripts\loop-verify.sh` | The gate: GREEN only if every locked test passes (no retries, no `test.fail`/`skip`/`only`). Prints a short failure digest, also saved as `last-verify-summary.txt` |
| `scripts\jira.js` | Reads, comments on, edits comments on and transitions Jira through the SSO browser cookie (`~/.jira-cookie`) |
| `loop\servers.md` | Per-project hosts and the shared-server rules (reloads, populate, restarts need a human) |
| `loop\always-human.md` | Areas the loop never changes without a Jira approval. **Review it for your client.** |
| `loop\harness-template\` | The Playwright harness `/setup-project` copies into a project |
| `skills\` | The e2sc/e2na config skills the implementer uses |

## Ground rules
- The loop never commits and never moves a ticket past the start transition. You do both.
- Every dev server is shared. Populate, PCMM/AllBundles reloads, p2c and restarts are yours to run or
  explicitly authorise.
- Don't commit `.loop/`, `node_modules/`, `test-results/`, `playwright-report/`, `recordings/`, or any
  cookie or password file.

## Updating the kit
Edit the files here, then have everyone run `install.ps1 -Force`. Your `servers.md` (your projects)
and `always-human.md` (your client rules) are never overwritten, even with `-Force`. To pick up new
shared rules in those two, compare them with the kit copies by hand.
