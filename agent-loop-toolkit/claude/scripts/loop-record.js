#!/usr/bin/env node
// Record a UI flow with Playwright codegen for the agent loop, then check the recording.
//
// Usage (from the project root, or from its e2sc-ui_tests folder):
//   node ~/.claude/scripts/loop-record.js <KEY> <flow>            launch codegen, then check the recording
//   node ~/.claude/scripts/loop-record.js <KEY> <flow> --check    only check an existing recording
//   node ~/.claude/scripts/loop-record.js <KEY> <flow> --dry-run  print the command and the steps, launch nothing
//
// It takes the base URL from E2_BASE_URL or from playwright.config.ts, never overwrites an existing
// recording (a follow-up is written to <flow>-2.ts, -3.ts ...), prints the steps test-author asked for
// from .loop/<KEY>/recording-requests.md, and exits non-zero if the recording looks unusable.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [KEY, FLOW] = args.filter((a) => !a.startsWith('--'));
if (!KEY || !FLOW || !/^[\w.-]+$/.test(KEY) || !/^[\w.-]+$/.test(FLOW)) {
  console.error('usage: node loop-record.js <KEY> <flow> [--check|--dry-run]   (KEY and flow: letters, digits, . _ -)');
  process.exit(2);
}

// The harness folder: ./e2sc-ui_tests, or the current folder when it is the harness.
const harness = [path.join(process.cwd(), 'e2sc-ui_tests'), process.cwd()].find((d) =>
  fs.existsSync(path.join(d, 'playwright.config.ts')),
);
if (!harness) {
  console.error('No playwright.config.ts found in ./e2sc-ui_tests or the current folder. Run this from the project root.');
  process.exit(2);
}
const projectRoot = path.basename(harness) === 'e2sc-ui_tests' ? path.dirname(harness) : harness;

function baseUrl() {
  if (process.env.E2_BASE_URL) return process.env.E2_BASE_URL.replace(/\/+$/, '');
  const cfg = fs.readFileSync(path.join(harness, 'playwright.config.ts'), 'utf8');
  const m = cfg.match(/baseURL:\s*[^,\n]*?['"](https?:\/\/[^'"]+)['"]/);
  if (!m) {
    console.error('Could not read baseURL from playwright.config.ts; set E2_BASE_URL.');
    process.exit(2);
  }
  return m[1].replace(/\/+$/, '');
}

function printRequestedSteps() {
  const file = path.join(projectRoot, '.loop', KEY, 'recording-requests.md');
  if (!fs.existsSync(file)) {
    console.log(`(no ${path.relative(projectRoot, file)}; follow the steps you were given)`);
    return;
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.toLowerCase().includes(FLOW.toLowerCase()));
  if (start === -1) {
    console.log(`(no section for "${FLOW}" in recording-requests.md; the file is at ${file})`);
    return;
  }
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+)\s/);
    if (h && h[1].length <= level) { end = i; break; }
  }
  console.log('--- Steps requested for this recording ---');
  console.log(lines.slice(start, end).join('\n').trimEnd());
  console.log('--- end of steps ---');
}

// Returns a list of problems; empty means the recording is usable.
function checkRecording(file) {
  const problems = [];
  if (!fs.existsSync(file)) return [`${file} does not exist`];
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return [`${file} is empty`];
  const body = text.split(/\r?\n/).filter((l) => /^\s*await\s/.test(l));
  if (body.length === 0) problems.push('the recording has no actions');

  // The login step must type a username, not something else (for example a pasted path).
  for (const l of body) {
    const m = l.match(/(?:j_username|username)[^\n]*\.fill\(\s*(['"`])(.*?)\1\s*\)/i);
    if (m) {
      const v = m[2];
      if (/[\\/]|^[A-Za-z]:/.test(v) || v.length > 40 || /\s/.test(v)) {
        problems.push(`the login step types "${v.slice(0, 60)}" as the username; it looks like something was pasted into the wrong window`);
      }
    }
  }

  const asserts = body.filter((l) => /\bexpect\(/.test(l));
  if (asserts.length === 0) problems.push('no assertion: use the codegen toolbar (Assert visibility / Assert text) on the element the test will check');
  const last = body[body.length - 1];
  if (last && !/\bexpect\(/.test(last)) {
    problems.push(`the last step is not an assertion, so the recording may stop before the result: ${last.trim().slice(0, 100)}`);
  }
  return problems;
}

const recDir = path.join(harness, 'recordings', KEY);
let out = path.join(recDir, `${FLOW}.ts`);

if (flags.has('--check')) {
  const problems = checkRecording(out);
  if (problems.length) {
    console.log(`PROBLEM with ${path.relative(harness, out)}:`);
    problems.forEach((p) => console.log(`  - ${p}`));
    console.log('Ask for another recording that continues from where this one stopped.');
    process.exit(3);
  }
  console.log(`OK: ${path.relative(harness, out)} has actions and an assertion, and the login step looks right.`);
  process.exit(0);
}

// Never overwrite: a follow-up recording gets the next free name.
if (fs.existsSync(out)) {
  for (let n = 2; ; n++) {
    const next = path.join(recDir, `${FLOW}-${n}.ts`);
    if (!fs.existsSync(next)) { out = next; break; }
  }
  console.log(`${FLOW}.ts already exists, so this recording goes to ${path.basename(out)}.`);
}
const url = `${baseUrl()}/e2sc/logon.do`;
const rel = path.relative(harness, out).replace(/\\/g, '/');
printRequestedSteps();
console.log(`\nRecording to ${rel}`);
console.log(`Log in as the test user (username only unless the server asks for a password), do the steps above,`);
console.log(`stop on the RESULT screen, add an assertion with the toolbar, then close the browser window.\n`);

if (flags.has('--dry-run')) {
  console.log(`[dry run] npx playwright codegen --output ${rel} ${url}`);
  process.exit(0);
}

fs.mkdirSync(recDir, { recursive: true });
const r = spawnSync('npx', ['playwright', 'codegen', '--output', rel, url], { cwd: harness, stdio: 'inherit', shell: true });
if (r.status !== 0) {
  console.error(`codegen exited with status ${r.status}`);
  process.exit(r.status || 1);
}
const problems = checkRecording(out);
if (problems.length) {
  console.log(`\nPROBLEM with ${rel}:`);
  problems.forEach((p) => console.log(`  - ${p}`));
  console.log('Run this again to record a follow-up that continues from where this one stopped.');
  process.exit(3);
}
console.log(`\nOK: ${rel} has actions and an assertion, and the login step looks right.`);
