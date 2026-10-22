#!/usr/bin/env node
// Mechanical checks for /run-loop step 5 (check and lock).
// Usage (from the project root): node ~/.claude/scripts/loop-check.js <KEY> [--lock]
//   Checks: approved case IDs vs TC IDs in the specs (one test each, none extra or missing), no
//   test.fail/skip/fixme/only, no waitForTimeout, no visibility-conditional assertions; prints the counts
//   from last-verify-summary.txt. GREEN is fine (tests are written after the first pass).
//   --lock: also needs test-plan.md to list every approved case with a discriminating check; writes
//   tests.locked with the sha256 of each locked file, and never overwrites an existing one.
// Exit 0 = all pass, 1 = problems. It can't judge whether a failure is a behaviour assertion or a
// discriminating check is any good: read last-verify-summary.txt and test-plan.md for that.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const key = process.argv[2];
const lock = process.argv.includes('--lock');
// --logic checks/locks the Groovy harness (tests/logic/<KEY>/*.logic.groovy, written before the build) instead of
// the Playwright specs. cases.approved lists the harness cases on a "Logic case IDs:" line; every other approved
// case is a UI case. Each phase locks on its own marker (logic.locked / tests.locked).
const logic = process.argv.includes('--logic');
if (!key) { console.error('usage: loop-check.js <KEY> [--logic] [--lock]'); process.exit(2); }

const root = process.cwd();
const loopDir = path.join(root, '.loop', key);
const testDir = path.join(root, 'e2sc-ui_tests', 'tests', logic ? 'logic' : 'locked', key);
const testRel = 'e2sc-ui_tests/tests/' + (logic ? 'logic' : 'locked') + '/' + key;
const marker = logic ? 'logic.locked' : 'tests.locked';
const problems = [];
const notes = [];

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

const approved = read(path.join(loopDir, 'cases.approved'));
if (approved === null) problems.push('missing .loop/' + key + '/cases.approved');
let allIds = [];
let logicIds = [];
if (approved) {
  const m = approved.match(/Approved case IDs?:\s*(.+)/i);
  if (!m) problems.push('cases.approved has no "Approved case IDs:" line');
  else allIds = [...new Set(m[1].match(/\b[A-Z]*TC\d+[a-z]?\b/g) || [])];
  if (m && allIds.length === 0) problems.push('no TC IDs found on the "Approved case IDs" line');
  const lg = approved.match(/Logic case IDs?:\s*(.+)/i);
  if (lg) logicIds = [...new Set(lg[1].match(/\b[A-Z]*TC\d+[a-z]?\b/g) || [])];
  for (const id of logicIds) if (!allIds.includes(id)) problems.push(`Logic case ${id} is not on the "Approved case IDs" line`);
}
// This phase's cases: the Logic IDs for --logic, every other approved ID for the Playwright phase.
const approvedIds = logic ? logicIds : allIds.filter((id) => !logicIds.includes(id));
if (logic && approved && logicIds.length === 0) problems.push('cases.approved has no "Logic case IDs:" line');

let specs = [];
const specExt = logic ? '.logic.groovy' : '.spec.ts';
try { specs = fs.readdirSync(testDir).filter(f => f.endsWith(specExt)).map(f => path.join(testDir, f)); } catch {}
if (specs.length === 0) problems.push('no *' + specExt + ' in ' + testRel);

const found = {};
for (const f of specs) {
  const src = read(f);
  const rel = path.relative(root, f).replace(/\\/g, '/');
  if (logic) {
    // Harness cases are declared tc('TC1 (AC1): ...') { ... } (see ~/.claude/loop/harness-template/tests/logic).
    src.split(/\r?\n/).forEach((line, i) => {
      const t = line.match(/^\s*tc\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/);
      if (t) {
        const id = t[2].match(/^\s*([A-Z]*TC\d+[a-z]?)\b/);
        if (!id) problems.push(`${rel}:${i + 1} case title doesn't start with a TC ID: "${t[2].slice(0, 60)}"`);
        else (found[id[1]] = found[id[1]] || []).push(`${rel}:${i + 1}`);
      }
      if (/@Ignore|System\.exit\(0\)/.test(line)) problems.push(`${rel}:${i + 1} forbidden: ${line.trim()}`);
      if (/Thread\.sleep|\bsleep\(/.test(line)) problems.push(`${rel}:${i + 1} sleep/delay in a logic test`);
    });
    continue;
  }
  // Join `test(` followed by a title on the next line, so multi-line declarations are still found.
  const lines = src.replace(/(\btest\s*\()\s*\r?\n\s*(['"`])/g, '$1$2').split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.match(/^\s*test(?:\.describe)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/);
    if (t && !/test\.describe/.test(line)) {
      const id = t[2].match(/^\s*([A-Z]*TC\d+[a-z]?)\b/);
      if (!id) problems.push(`${rel}:${i + 1} test title doesn't start with a TC ID: "${t[2].slice(0, 60)}"`);
      else (found[id[1]] = found[id[1]] || []).push(`${rel}:${i + 1}`);
    }
    if (/test\.(fail|skip|fixme|only)\b/.test(line)) problems.push(`${rel}:${i + 1} forbidden marker: ${line.trim()}`);
    if (/waitForTimeout\s*\(/.test(line)) problems.push(`${rel}:${i + 1} fixed delay (waitForTimeout)`);
    if (/if\s*\(\s*await\s+[^)]*\.(isVisible|count)\s*\(/.test(line)) problems.push(`${rel}:${i + 1} conditional on visibility/count (can pass vacuously): ${line.trim().slice(0, 80)}`);
  });
}
for (const id of approvedIds) {
  if (!found[id]) problems.push(`approved case ${id} has no test`);
  else if (found[id].length > 1) problems.push(`approved case ${id} has ${found[id].length} tests: ${found[id].join(', ')}`);
}
for (const id of Object.keys(found)) if (!approvedIds.includes(id)) problems.push(`test for unapproved/dropped case ${id}: ${found[id].join(', ')}`);

const summary = read(path.join(loopDir, 'last-verify-summary.txt'));
if (summary === null) problems.push('no last-verify-summary.txt (run loop-verify.sh first)');
else {
  const failed = (summary.match(/^\s*(\d+) failed/m) || [])[1];
  const passed = (summary.match(/^\s*(\d+) passed/m) || summary.match(/\((\d+) passed\)/) || [])[1];
  notes.push(`last run: ${failed || 0} failed, ${passed || 0} passed (approved cases: ${approvedIds.length})`);
  // Tests are written after the first pass, so GREEN at lock is allowed. What stops a test proving nothing is its
  // discriminating check, recorded in test-plan.md.
  if (/^GREEN/m.test(summary)) notes.push('all tests pass at this point: each must carry a discriminating check (see test-plan.md), or it proves nothing');
}
if (lock) {
  const plan = read(path.join(loopDir, 'test-plan.md'));
  if (plan === null) problems.push('no test-plan.md (test-author writes it: each case, its test, its discriminating check, its result)');
  else {
    // One row per approved case, with a real value in the "Discriminating check" column.
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const rows = plan.split(/\r?\n/).filter((l) => l.trim().startsWith('|')).map(cells);
    const header = rows.find((r) => r.some((c) => /discriminating/i.test(c)));
    if (!header) problems.push('test-plan.md has no table with a "Discriminating check" column');
    else {
      const col = header.findIndex((c) => /discriminating/i.test(c));
      for (const id of approvedIds) {
        const row = rows.find((r) => r !== header && r.some((c) => new RegExp('\\b' + id + '\\b').test(c)));
        if (!row) problems.push(`test-plan.md has no row for approved case ${id}`);
        else if (!row[col] || /^(n\/?a|none|nil|tbd|todo|-+|\?)$/i.test(row[col]))
          problems.push(`test-plan.md: ${id} has no discriminating check (found "${row[col] || ''}")`);
      }
    }
  }
}

if (problems.length) {
  console.log('CHECK FAILED:\n' + problems.map(p => '- ' + p).join('\n'));
  process.exit(1);
}
console.log('CHECK OK: ' + approvedIds.length + ' approved case(s), each with one test; no forbidden markers or fixed delays.');
notes.forEach(n => console.log(n));

if (lock) {
  if (fs.existsSync(path.join(loopDir, marker))) {
    console.error('REFUSING to lock: .loop/' + key + '/' + marker + ' already exists. A lock marker is never overwritten.');
    process.exit(1);
  }
  const files = fs.readdirSync(testDir).filter(f => fs.statSync(path.join(testDir, f)).isFile()).sort();
  const date = new Date().toISOString().slice(0, 10);
  const when = logic
    ? 'Logic tests were written before the build, from the approved cases, and run RED first.'
    : 'Tests were written after the implementer\'s first pass, from the approved cases.';
  const out = [
    'Locked: ' + date,
    'Test cases approved (see cases.approved: ' + approvedIds.join(', ') + '). ' + when + ' Mechanical checks passed via loop-check.js; the orchestrator confirmed from last-verify-summary.txt that remaining failures are behaviour assertions, and from test-plan.md that each test has a discriminating check. The user does not review the code.',
    'Locked files (sha256):',
    ...files.map(f => crypto.createHash('sha256').update(fs.readFileSync(path.join(testDir, f))).digest('hex') + ' *' + testRel + '/' + f),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(loopDir, marker), out);
  console.log('Wrote .loop/' + key + '/' + marker + ' (' + files.length + ' files). Append any related fixture hashes by hand.');
}
