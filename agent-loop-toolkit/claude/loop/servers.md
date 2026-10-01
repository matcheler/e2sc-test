# Loop servers and shared-server rules

The config skills (e2na-config, e2sc-*) show hosts as `<e2sc-host>` and `<e2na-host>`, and some examples name a host.
**Always take the target host from this table for the project you are in**, and substitute it into
every ssh/scp/reload command a skill shows. Never run a deploy or reload against another project's host.

`/setup-project` adds a row here for each project you set up. If a project isn't in the table, run
`/setup-project` in it first. Don't guess a host.

## Projects
| Project folder | Stack | e2sc (UI) | e2na | SSH | Test login | Jira keys · start transition | Harness |
|---|---|---|---|---|---|---|---|

## Finding a project's hosts
Look for `*.properties`, `selenium` configs or `hosts` files in the repo before asking the user, and confirm what you find with them.

## Shared-server rules
Every dev server is shared with other people. A broken server blocks the whole team.

1. **Server actions need a human.** Only the user may authorise populate
   (`rcp_populate_broker_org_incr.sh`), `reload_pcmm.sh`, `reload_allbundles.sh`, `reload_oc_metamodel.sh`
   (OCMM), `reload_classes.sh` (Java classes), e2na `p2c.sh` and any e2sc/Tomcat restart. The
   `~/.claude/hooks/loop-ssh-guard.js` hook enforces this for the named scripts it knows about; any of
   these commands prompts the user, whichever agent runs it. Other ssh/scp to the hosts in the Projects
   table is allowed without a prompt for the loop agents (ticket-intake, test-author, implementer,
   reviewer); only the implementer may scp outside the inbox.
   - When one is needed, stop and hand over the exact commands: deploy, reloads, restart, health checks
     and rollback.
   - **Resuming a previously-STUCK/NEEDS_SERVER_ACTION run is not authorisation.** A prior handover
     saying a reload is needed doesn't mean the user has now said to run it — ask again, in this
     conversation, before running it, even if SSH has started working again or a lot of analysis has
     already gone into the plan.
   - Don't try to get around a denial.
   - Deploying files and dropping test files into an inbox are allowed only when the run instructions
     say so.
2. **Order for e2sc config:**
   1. Deploy the files.
   2. Run the **PCMM reload first**.
   3. Only after a clean PCMM reload, run populate and the other reloads.
   - A populate followed by a failed PCMM reload once broke PIT Detail for everyone until e2sc was
     restarted.
   - Changes to the PIT schema or new PIT attributes need populate plus an e2sc restart.
3. **Check health after any reload**, before running tests.
   - The key page still loads (HTTP 200).
   - No new errors in e2sc.log (NPE, `SuperCompException`, `Undefined Base DataMeasure`).
   - If it's broken: restore the backups, reload, report STUCK, and say clearly that the server needs a human.
4. **Back up before overwriting.** Copy each server file to `*.bak.<KEY>` first.
   - Deploy with plain `cp` then `touch`, not `cp -p`, or p2c won't pick the file up.
   - Keep deploy and revert scripts in `/tmp/<KEY>/`.
5. **Look out for existing errors.** Check the log for errors that were already there before your
   first reload.
6. **Logs:** an archive `.ack` only means "processed". Success is the effect you can see in the UI.
7. **Inbox drops:** a plain `scp` straight into an inbox dir can be picked up by the scanner mid-write
   and read as 0 bytes (silently processes nothing). Stage the file in the parent shared dir first,
   then `mv` it into the inbox once the copy is complete.
