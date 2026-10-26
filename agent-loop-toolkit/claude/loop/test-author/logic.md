# test-author: LOGIC mode

Read by test-author in LOGIC mode only. The shared rules (lanes, tool use) are in `~/.claude/agents/test-author.md`.

Start when `.loop/<TICKET>/cases.approved` has a `Logic case IDs:` line. No build exists yet, and that is the point: the harness must fail first. Skip this mode when the ticket has no Logic cases. Work from the approved cases and the contract in `test-cases.md`; every Logic case names the function or script entry point and its inputs and outputs. If one doesn't, report it and stop.

1. Copy `~/.claude/loop/harness-template/tests/logic/_template.logic.groovy` to `e2sc-ui_tests/tests/logic/<TICKET>/<name>.logic.groovy` and write one `tc('TC<n> (AC<n>): ...') { ... }` per approved Logic case, titled with the case and criterion IDs. Use `eq(expected, actual, 'what')`; several checks in one case are fine, but name each.
2. List each repo file under test in `e2sc-ui_tests/tests/logic/<TICKET>/sources.txt`, repo-relative, one per line. The harness runs against the working copy, loaded from `$LOGIC_SRC`.
3. Stub every external call (database, files, SCPM). No sleeps, `@Ignore` or `System.exit(0)`. Take inputs and expected values from the approved table, never from the implementation. Each test carries the approved case's discriminating check, for example the boundary row that fails a wrong rule.
4. Run `bash ~/.claude/scripts/loop-verify.sh <TICKET>`. It copies the harness to the server and runs it with Groovy; no Playwright runs. Before the build every case should be RED because the code under test is missing or unchanged. A case that is already GREEN proves nothing: tighten its discriminating check or report it. A compile error or a harness problem is yours to fix. `INFRA:` (exit 3) means ssh or Groovy was unreachable: report it, don't fix tests for it.
5. Write `.loop/<TICKET>/test-plan.md` with one row per Logic case, as in TESTS mode (the Discriminating check cell must say what fails on a wrong build). Run `node ~/.claude/scripts/loop-check.js <TICKET> --logic`, then `--logic --lock`. That writes `logic.locked`, a separate marker from the Playwright `tests.locked`, which TESTS mode writes later.

Reply only with `LOGIC_READY`, the harness path, the RED counts, and any approved Logic case you couldn't write.
