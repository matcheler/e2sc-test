// PreToolUse hook: blocks changes to locked test paths once a ticket's tests are locked.
// A ticket is locked when <project>/.loop/<TICKET>/tests.locked exists.
// Exit code 2 blocks the tool call and feeds stderr back to Claude.
const fs = require("fs");
const path = require("path");

let raw = "";
process.stdin.on("data", (d) => (raw += d)).on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const cwd = input.cwd || process.cwd();
  const tool = input.tool_name || "";
  const ti = input.tool_input || {};
  const norm = (p) => String(p).replace(/\\/g, "/");
  // Two locks per ticket: tests.locked covers the Playwright tests (tests/locked/<T>/, locked after the build);
  // logic.locked covers the Groovy harness (tests/logic/<T>/, locked before the build).
  const isLocked = (ticket, marker = "tests.locked") => fs.existsSync(path.join(cwd, ".loop", ticket, marker));
  const block = (msg) => { process.stderr.write(msg + "\n"); process.exit(2); };

  // File tools: check the target path.
  const target = ti.file_path || ti.notebook_path || ti.path;
  if (target && tool !== "Bash" && tool !== "PowerShell") {
    const p = norm(target);
    if (/\/(tests|logic)\.locked$/.test(p) && fs.existsSync(target)) block("BLOCKED: the lock marker cannot be modified.");
    const m = p.match(/\/locked\/([^/]+)\//);
    if (m && isLocked(m[1])) {
      block(`BLOCKED: ${target} is a locked test for ${m[1]}. Fix the implementation, not the test. If you believe the test is wrong, stop and report STUCK.`);
    }
    const lm = p.match(/\/tests\/logic\/([^/]+)\//);
    if (lm && isLocked(lm[1], "logic.locked")) {
      block(`BLOCKED: ${target} is a locked logic test for ${lm[1]}. Fix the implementation, not the test. If you believe the test is wrong, stop and report STUCK.`);
    }
    process.exit(0);
  }

  // Shell tools: block commands that reference a locked path AND look like they write/move/delete.
  if ((tool === "Bash" || tool === "PowerShell") && ti.command) {
    const cmd = norm(ti.command);
    const writes = /(^|[^0-9&])>{1,2}|\btee\b|\bsed\s+-i|\bperl\s+-p?i|\b(rm|mv|cp|truncate|touch|chmod|dd|unlink|rmdir)\b|\bsvn\s+(revert|delete|rm|move|mv)\b|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|Rename-Item|New-Item|Clear-Content|writeFile|appendFile|unlinkSync|rmSync/i;
    // Judge each pipeline/command segment on its own, so "run tests | tee log" is allowed.
    for (const seg of cmd.split(/\|\||&&|[|;\n]/)) {
      if (!writes.test(seg)) continue;
      if ([...seg.matchAll(/\.loop\/([A-Za-z]+-\d+)\/(tests|logic)\.locked/g)].some((m) => isLocked(m[1], m[2] + ".locked"))) {
        block("BLOCKED: the lock marker cannot be modified.");
      }
      const hit = [...seg.matchAll(/locked\/([A-Za-z]+-\d+)/g)].map((m) => m[1]).find((t) => isLocked(t));
      const lhit = [...seg.matchAll(/tests\/logic\/([A-Za-z]+-\d+)/g)].map((m) => m[1]).find((t) => isLocked(t, "logic.locked"));
      if (hit || lhit) {
        block(`BLOCKED: this command appears to modify locked tests for ${hit || lhit}. Reading and running them is fine; changing them is not. If you believe a test is wrong, stop and report STUCK.`);
      }
    }
  }
  process.exit(0);
});
