// PreToolUse hook for the agent loop: protects locked tests, lock markers and the UI contract.
// Exit code 2 blocks the tool call and feeds stderr back to Claude. agent_type in the hook input names the
// subagent making the call (absent for the main session).
//
// Markers per ticket in <project>/.loop/<TICKET>/:
//   tests.locked  older single-phase Playwright lock (whole tests/locked/<T>/ read-only)
//   logic.locked  Groovy harness lock (tests/logic/<T>/ read-only)
//   ui.locked     two-phase UI lock (Phase A): specs/ read-only for everyone, pages/ writable by test-author only
//   ui.bound / healing.log / heal-request.json   written by loop-ui-check.js only
// Rules (mechanical; Bash/PowerShell matching is best-effort, loop-ui-check.js is the real enforcement):
//   - No subagent writes any marker or cases.approved. Nobody hand-writes ui.locked/ui.bound/healing.log/heal-request.json.
//   - implementer: never writes under e2sc-ui_tests/tests/.
//   - ui-assert: reads only cases.approved, test-plan.md and tests/locked/<T>/ of an unlocked ticket, plus the page
//     template; writes only tests/locked/<T>/ (before ui.locked) and .loop/<T>/test-plan.md; no other tools.
//   - Subagents never write the shared harness helpers e2sc-ui_tests/tests/*.ts.
//   - Only the main session runs loop-ui-check.js --lock/--bound/--heal.
const fs = require("fs");
const path = require("path");
const os = require("os");

let raw = "";
process.stdin.on("data", (d) => (raw += d)).on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const tool = input.tool_name || "";
  // --ui-assert = called from the ui-assert agent's own frontmatter hook (agent-scoped), so the caller is ui-assert.
  // The frontmatter hook did not fire in the 2026-11-04 test, so the global hook (matcher includes Read) stays the
  // enforcement. Reads only matter for ui-assert: every other Read exits here, before anything else is done.
  const scoped = process.argv.includes("--ui-assert");
  if (tool === "Read" && !scoped && input.agent_type !== "ui-assert") process.exit(0);
  const cwd = input.cwd || process.cwd();
  const ti = input.tool_input || {};
  const agent = scoped ? "ui-assert" : String(input.agent_type || "");
  const isSub = agent !== "";
  const norm = (p) => String(p).replace(/\\/g, "/");
  const KEY = "[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+";
  const has = (ticket, f) => fs.existsSync(path.join(cwd, ".loop", ticket, f));
  const block = (msg) => { process.stderr.write(msg + "\n"); process.exit(2); };
  const SCRIPT_ONLY = ["ui.locked", "ui.bound", "healing.log", "heal-request.json"];
  const MARKERS = ["tests.locked", "logic.locked", ...SCRIPT_ONLY];
  const unlockedTicket = (t) => has(t, "cases.approved") && !has(t, "ui.locked");
  const TEMPLATE = norm(path.join(os.homedir(), ".claude", "loop", "harness-template", "tests", "locked", "_page-template.ts")).toLowerCase();

  const target = ti.file_path || ti.notebook_path || ti.path;
  const isShell = tool === "Bash" || tool === "PowerShell";

  // ---------- ui-assert: a sandbox of Read + Write on its own inputs and outputs ----------
  if (agent === "ui-assert") {
    if (tool === "Read" || tool === "Write") {
      if (!target) block("BLOCKED (ui-assert): no file path.");
      const abs = path.resolve(cwd, target);
      const r = norm(path.relative(cwd, abs));
      if (tool === "Read" && norm(abs).toLowerCase() === TEMPLATE) process.exit(0);
      let m = r.match(new RegExp(`^\\.loop/(${KEY})/(cases\\.approved|test-plan\\.md)$`));
      if (m && unlockedTicket(m[1]) && (tool === "Read" || m[2] === "test-plan.md")) process.exit(0);
      m = r.match(new RegExp(`^e2sc-ui_tests/tests/locked/(${KEY})/`));
      if (m && unlockedTicket(m[1])) process.exit(0);
      block(`BLOCKED (ui-assert): ${tool} of ${target} is outside Phase A's inputs. You may read only .loop/<KEY>/cases.approved, the page template and e2sc-ui_tests/tests/locked/<KEY>/, and write only e2sc-ui_tests/tests/locked/<KEY>/ and .loop/<KEY>/test-plan.md, for a ticket that is not yet locked. Work from cases.approved alone.`);
    }
    block(`BLOCKED (ui-assert): the ${tool} tool is not available in Phase A (Read and Write only; the main session runs the specs).`);
  }

  // ---------- file tools ----------
  if (target && !isShell && tool !== "Read") {
    const abs = path.resolve(cwd, target);
    const r = norm(path.relative(cwd, abs));
    const p = norm(abs);
    const mk = p.match(new RegExp(`/\\.loop/(${KEY})/([^/]+)$`));
    if (mk && MARKERS.includes(mk[2])) {
      if (isSub) block(`BLOCKED: subagents never write lock markers (${mk[2]}).`);
      if (SCRIPT_ONLY.includes(mk[2])) block(`BLOCKED: ${mk[2]} is written by loop-ui-check.js only.`);
      if (fs.existsSync(abs)) block("BLOCKED: the lock marker cannot be modified. The user removes it.");
    }
    if (mk && mk[2] === "cases.approved" && isSub) block("BLOCKED: subagents never write cases.approved; the main session writes it at approval.");
    if (agent === "implementer" && /^e2sc-ui_tests\/tests\//.test(r)) block(`BLOCKED (implementer): ${target} is test code. The implementer never writes under e2sc-ui_tests/tests/. If you believe a test is wrong, stop and report STUCK.`);
    if (isSub && /^e2sc-ui_tests\/tests\/[^/]+\.ts$/.test(r)) block(`BLOCKED: ${target} is a shared harness helper; subagents don't change it. Put ticket code in tests/locked/<KEY>/pages/.`);
    const lt = r.match(new RegExp(`^e2sc-ui_tests/tests/locked/(${KEY})/(.*)$`));
    if (lt) {
      const [, t, sub] = lt;
      if (has(t, "ui.locked")) {
        if (sub.startsWith("specs/")) block(`BLOCKED: ${target} is a locked spec for ${t} (ui.locked). Nobody edits specs after Phase A; a contract change goes back to case approval.`);
        if (!sub.startsWith("pages/")) block(`BLOCKED: after ui.locked only pages/ may change under tests/locked/${t}/.`);
        if (agent !== "test-author") block(`BLOCKED: pages/ for ${t} are bound by test-author (UI-BIND) only.`);
      } else if (has(t, "tests.locked")) {
        block(`BLOCKED: ${target} is a locked test for ${t}. Fix the implementation, not the test. If you believe the test is wrong, stop and report STUCK.`);
      } else if (isSub && agent !== "test-author") {
        block(`BLOCKED: only ui-assert (Phase A) and test-author write tests/locked/${t}/.`);
      }
    }
    const lm = r.match(new RegExp(`^e2sc-ui_tests/tests/logic/(${KEY})/`));
    if (lm && has(lm[1], "logic.locked")) block(`BLOCKED: ${target} is a locked logic test for ${lm[1]}. Fix the implementation, not the test. If you believe the test is wrong, stop and report STUCK.`);
    process.exit(0);
  }

  // ---------- shell tools (best-effort) ----------
  if (isShell && ti.command) {
    const cmd = norm(ti.command);
    if (isSub && /loop-ui-check\.js\b[^|;&\n]*--(lock|bound|heal)\b/.test(cmd)) block("BLOCKED: only the main session runs loop-ui-check.js --lock/--bound/--heal.");
    const segs = cmd.split(/\|\||&&|[|;\n]/);
    // Script-only markers, for every caller (main session too): a command segment that names one must be a plain read.
    // Catches node/python/sed/cp/mv/rm/Set-Content on ui.locked etc. A script that hard-codes the path is not visible
    // here; loop-ui-check.js --jira (the sha256 posted to Jira) is the backstop.
    const READ_ONLY = /^\s*(cat|head|tail|grep|egrep|rg|wc|ls|stat|file|sha256sum|md5sum|diff|cmp|less|more|type|sed\s+-n|Get-Content|gc|Select-String|Get-FileHash|Get-Item|Test-Path|certutil\s+-hashfile)\b/i;
    for (const seg of segs) {
      if (!/\b(ui\.locked|ui\.bound|healing\.log|heal-request\.json)\b/.test(seg)) continue;
      if (!READ_ONLY.test(seg) || /(^|[^0-9&])>{1,2}|\btee\b/.test(seg)) block("BLOCKED: this command names a lock file (ui.locked, ui.bound, healing.log, heal-request.json) and is not a plain read. Those files are written by loop-ui-check.js only, and removed by the user.");
    }
    // Deleting or moving a .loop folder that holds ui.locked removes the lock: blocked for every caller.
    const DEL = /\b(rm|rmdir|del|rd|unlink|Remove-Item|ri|mv|move|Move-Item|Rename-Item|rimraf|rmSync|unlinkSync|renameSync)\b/i;
    for (const seg of segs) {
      if (!DEL.test(seg)) continue;
      for (const m of seg.matchAll(new RegExp(`(?:^|[\\s'"=])(?:\\./)?\\.loop(?:/(${KEY}))?/?(\\*)?(?=$|[\\s'"])`, "g"))) {
        const tickets = m[1] ? [m[1]] : (() => { try { return fs.readdirSync(path.join(cwd, ".loop")); } catch { return []; } })();
        const hit = tickets.find((t) => has(t, "ui.locked"));
        if (hit) block(`BLOCKED: this command would delete or move .loop/${hit}/, which holds ui.locked. The user removes a lock.`);
      }
    }
    const writes = /(^|[^0-9&])>{1,2}|\btee\b|\bsed\s+-i|\bperl\s+-p?i|\b(rm|mv|cp|truncate|touch|chmod|dd|unlink|rmdir|install|rsync)\b|\bsvn\s+(revert|delete|rm|move|mv)\b|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item|Clear-Content|writeFile|appendFile|unlinkSync|rmSync|renameSync|copyFile/i;
    // Judge each pipeline/command segment on its own, so "run tests | tee log" is allowed.
    for (const seg of cmd.split(/\|\||&&|[|;\n]/)) {
      if (!writes.test(seg)) continue;
      for (const m of seg.matchAll(new RegExp(`\\.loop/(${KEY})/([A-Za-z.-]+)`, "g"))) {
        if (MARKERS.includes(m[2]) && (isSub || SCRIPT_ONLY.includes(m[2]) || has(m[1], m[2]))) block("BLOCKED: this command appears to modify a lock marker.");
        if (m[2] === "cases.approved" && isSub) block("BLOCKED: subagents never write cases.approved.");
      }
      if (agent === "implementer" && /e2sc-ui_tests\/tests|tests\/(locked|logic)\//.test(seg)) block("BLOCKED (implementer): this command appears to modify test code. The implementer never writes under e2sc-ui_tests/tests/.");
      for (const m of seg.matchAll(new RegExp(`locked/(${KEY})(/[^\\s'"]*)?`, "g"))) {
        const t = m[1], sub = (m[2] || "/").slice(1);
        if (has(t, "ui.locked") && !(sub.startsWith("pages/") && agent === "test-author")) block(`BLOCKED: this command appears to modify locked UI tests for ${t} (only test-author may change pages/).`);
        if (!has(t, "ui.locked") && has(t, "tests.locked")) block(`BLOCKED: this command appears to modify locked tests for ${t}. Reading and running them is fine; changing them is not. If you believe a test is wrong, stop and report STUCK.`);
      }
      const lhit = [...seg.matchAll(new RegExp(`tests/logic/(${KEY})`, "g"))].map((m) => m[1]).find((t) => has(t, "logic.locked"));
      if (lhit) block(`BLOCKED: this command appears to modify locked logic tests for ${lhit}. If you believe a test is wrong, stop and report STUCK.`);
    }
  }
  process.exit(0);
});
