---
name: e2na-config
description: 'Add or modify e2na EBL configuration: upload/download flows, routes, scenarios, messages, message groups, support file links, scheduler XML, spec generation (MSE). Use for: "add route", "add scenario", "add schedule", "reload p2c", "EBL config", "e2na", "generate spec", "excel to spec", "run MSE", "excel-spec-converter", "support-files-generator".'
---

# E2na EBL Configuration

Configure e2na EBL integration layers for e2open SSP projects — upload/download flows, routes, scenarios, messages, message groups, support file links, and spec generation.

## Reference Documentation

**Primary Source:** `guide.md` (alongside this file) — Read this before proceeding.

## The server

> **Hosts come from `~/.claude/loop/servers.md`.** The commands in this skill use the placeholders
> `<e2na-host>` and `<e2sc-host>`. Take both from the current project's row in the Projects table of
> that file — either an SSH alias or the full `<host>.dev.e2open.com` name (with your SSH user), exactly
> as the table gives it — and substitute it into every `ssh`/`scp`/`p2c` command here. e2na and e2sc
> may run on the same box or on separate ones; when they are separate, deploy and reload e2na config on
> `<e2na-host>` only. Never deploy one project's EBL to another project's server. Follow the
> shared-server rules in that file as well: p2c and reloads need the user, back up first, and deploy
> with `cp` then `touch`.

If the table gives an SSH alias, it is configured in `~/.ssh/config` (your own SSH user, key `~/.ssh/id_ed25519`), so `ssh <e2na-host>` works directly; otherwise use `ssh <your-ssh-user>@<host>.dev.e2open.com`.

```bash
ssh <e2na-host> 'hostname'       # confirms you reached the e2na box
```

The login banner writes to stderr on every connection. Append `2>/dev/null` to keep output clean.

| Path | Contents |
|------|----------|
| `/e2open/app/projects/ssp-ext/E2/e2na/ebl/` | **Deployment target** — server copy of the repo's EBL tree |
| `/e2open/app/projects/ssp/E2/e2na/ebl/` | Base layer (read-only reference — never edit) |
| `/e2open/app/projects/ssp-ext/E2/solution/groovy_handlers/` | GroovyHandler scripts (no p2c needed) |
| `/e2open/app/projects/ssp-ext/E2/specs/` | MSE tooling: `excel-spec-converter.sh`, `support-files-generator.sh` |
| `/e2open/app/projects/ssp-ext/E2/solution/docs/cdm/` | Source `.xls` mapping specs |
| `/e2open/var/log/e2na/` | `e2na.log`, `ebli.log`, `p2c.log`, `mse.log` |

Everything under `/e2open/app/projects/ssp-ext/` is mode `0777` (owner `eoadmin`) and the e2na logs are world-readable — **copy files and read logs as your own SSH user directly; no privilege escalation needed.** Only `p2c.sh` must run as `eoadmin`.

## Workflow: Add a New Upload or Download Flow

1. Read existing `messages.ebl`, `groups.ebl`, `scenarios.ebl`, `routes.ebl`, and `start.ebl` to understand current patterns.
2. **Ask the user:** Does this flow need custom data transformation, filtering, or DB lookup logic? If yes, a Groovy handler in `solution/groovy_handlers/` may be needed — clarify what it should do before proceeding.
3. Add the **message** definition to `messages.ebl`.
4. Add the **message group** to `groups.ebl`.
5. Create the **scenario specification XML** under `ebl/scenario/specification/`.
6. Add the **scenario** (with all required `supportFileLink` entries) to `scenarios.ebl`.
7. Register any **new support files** in `start.ebl` (`add supportFile`) and `projects.ebl` (`add supportFileLink`).
8. Add the **route** to `routes.ebl` with correct profile groups, message groups, and scenario reference.

## Workflow: Spec Generation from Excel (MSE)

**Run the generators on `<e2na-host>`, not locally** — they are Java/Ant tools and the local `java.exe` is blocked by app control. The full `specs/` tree is already deployed on the box.

1. scp the edited `.xls` up to `/e2open/app/projects/ssp-ext/E2/solution/docs/cdm/`.
2. Copy it into a temp dir on the box (`-fr` takes a directory, not a file) and convert:
   ```bash
   ssh <e2na-host> 'mkdir -p /tmp/mse_single && \
     cp /e2open/app/projects/ssp-ext/E2/solution/docs/cdm/MY_SPEC_Map_Spec.xls /tmp/mse_single/ && \
     cd /e2open/app/projects/ssp-ext/E2/specs && \
     ./excel-spec-converter.sh -fr /tmp/mse_single -to .' 2>/dev/null
   ```
3. Generate support files — always use `-fs` to target a single spec, or unrelated files get regenerated:
   ```bash
   ssh <e2na-host> 'cd /e2open/app/projects/ssp-ext/E2/specs && \
     ./support-files-generator.sh -fs MY_SPEC_Map_Spec.spec -all -udn -d -ow -exTplTp "*"' 2>/dev/null
   ```
   Check `/e2open/var/log/e2na/mse.log` if generation fails.
4. scp the generated `.spec` and `ebl/support_file/` files **back down** into the repo and review the diff with `svn diff`.
5. Do **not** commit `solution/resource/CPCExtResource.properties` — single-spec generation wipes the other specs' keys.
6. Commit the updated `.xls`, `.spec`, and changed `ebl/support_file/` files.
7. Reload with p2c (see *Deploying Changes to the Server*).

## Workflow: Add or Modify a Scheduled Download

1. Read the relevant scheduler XML (`support_file/schedules.xml`, `support_file/mtim-schedules.xml`, or `support_file/lts-schedules.xml`).
2. Add or reuse a **timing group** in the `<global>` section if needed.
3. Add the **schedule** entry in the appropriate `<group>` section.
4. For supplier-filtered schedules, update `support_file/DownloadFilters.prop` with the new `<scheduleName>.supplier=ID1^ID2^...` entry.
5. Deploy to `<e2na-host>` and reload p2c (see *Deploying Changes to the Server*).

## Constraints

- **4-space indentation** — no tabs.
- **One blank line** between `} //route` and `} //route scenario` blocks.
- **No stray comments** like `//PROJ-1234` left in files.
- Route IDs must be **unique** across `routes.ebl`.
- All new scenarios must list every required `supportFileLink`.
- Support file names must match exactly across `start.ebl`, `scenarios.ebl`, and `projects.ebl`.
- Timing group names must be **unique** within the scheduler XML `<global>` section.
- Scheduler files (`schedules.xml`, `mtim-schedules.xml`, `lts-schedules.xml`) are registered in `start.ebl` — do not add new ones without updating `start.ebl`.
- Follow existing naming conventions (e.g. `FooUploadScenario`, `FooManifestFile`, `FooUploadConfigFile1.0`).

## Deploying Changes to the Server

Two steps: **scp the changed files to `<e2na-host>`**, then **run p2c to recompile EBL into the cache**.

Paths mirror the repo's EBL root (`solution/project/ssp-ext/E2/e2na/ebl/`) onto the server's
(`/e2open/app/projects/ssp-ext/E2/e2na/ebl/`) — keep the relative path identical.

### Step 1 — Back up, then copy

Always back up the server copy first; there is no automatic backup.

```bash
EBL_LOCAL=solution/project/ssp-ext/E2/e2na/ebl
EBL_SRV=/e2open/app/projects/ssp-ext/E2/e2na/ebl

# Back up what you are about to overwrite
ssh <e2na-host> "cp $EBL_SRV/support_file/mtim-schedules.xml $EBL_SRV/support_file/mtim-schedules.xml.bak" 2>/dev/null

# EBL root files
scp $EBL_LOCAL/messages.ebl $EBL_LOCAL/scenarios.ebl <e2na-host>:$EBL_SRV/

# Support files
scp $EBL_LOCAL/support_file/mtim-schedules.xml <e2na-host>:$EBL_SRV/support_file/

# Scenario specification
scp $EBL_LOCAL/scenario/specification/myScenario.xml <e2na-host>:$EBL_SRV/scenario/specification/
```

### Step 2 — Reload EBL (p2c)

`p2c.sh` must run as `eoadmin`, and `eoadmin` is **not on your own SSH user's PATH** — use the full path.
`cd /tmp` first, or `find` inside the script floods stderr with
`Failed to restore initial working directory: /e2open/home/<your-user>: Permission denied`.

```bash
ssh <e2na-host> "/e2open/bin/eoadmin 'cd /tmp && /e2open/app/e2na/bin/admin/p2c.sh false'" 2>/dev/null
```

- Usage is `p2c.sh {true|false}` — the **only** argument is a verbosity flag (`false` drops the compiler's `-V` flag; it still prints plenty of `loadModules:` / `Include file` chatter). It does not reject anything else gracefully: `p2c.sh --help` **runs a full compile** rather than printing help. Don't probe it.
- A full compile takes roughly a minute, prints `Project to cache started : <date>` at the top, and exits `0` on success.
- Two lines are **benign noise on every run** — not failures:
  - `main ERROR DOM element is - not a <log4j:configuration> element.`
  - `find: Failed to restore initial working directory: /e2open/home/<your-user>: Permission denied` (only if you skip the `cd /tmp`).
- Real failures show as EBL parse/compile errors naming a file and line — grep for those in `p2c.log`.
- **No p2c needed** for changes under `solution/groovy_handlers/` or `solution/groovy/` — those are resolved from the filesystem at runtime. scp is enough.

### Step 3 — Check logs

Logs are world-readable — no `eoadmin` needed:

```bash
ssh <e2na-host> 'tail -100 /e2open/var/log/e2na/p2c.log'   2>/dev/null   # compile errors
ssh <e2na-host> 'tail -100 /e2open/var/log/e2na/ebli.log'  2>/dev/null   # EBL interpreter
ssh <e2na-host> 'tail -100 /e2open/var/log/e2na/e2na.log'  2>/dev/null   # runtime / scenario execution
```

**`p2c.log` is large (tens of MB) — never `cat` it.** Use `tail`, or `grep -i "error\|exception" | tail -50`.

## Output

After making changes, report:
- Which files were modified and what was added
- The route ID and scenario name used
- Any support files that still need to be created in `ebl/support_file/`
