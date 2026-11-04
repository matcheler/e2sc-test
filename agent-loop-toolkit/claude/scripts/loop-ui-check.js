#!/usr/bin/env node
// Mechanical enforcement for the two-phase UI tests (Phase A = ui-assert, Phase B = test-author UI-BIND).
// Run from the project root:
//   node ~/.claude/scripts/loop-ui-check.js <KEY>             integrity + lint check against ui.locked (default)
//   node ~/.claude/scripts/loop-ui-check.js <KEY> --lock      after Phase A's UNBOUND run: checks, then writes ui.locked
//   node ~/.claude/scripts/loop-ui-check.js <KEY> --classify  sorts the last UI run's failures: UNBOUND/BINDING/ASSERTION/OTHER
//   node ~/.claude/scripts/loop-ui-check.js <KEY> --bound     after Phase B is bound: snapshot of every page-method body (ui.bound)
//   node ~/.claude/scripts/loop-ui-check.js <KEY> --heal      after a healing edit: checks the healing rules, updates ui.bound
//   node ~/.claude/scripts/loop-ui-check.js <KEY> --jira      compares ui.locked's sha256 with the last "ui.locked sha256: <hex>" posted
//                                                             on the ticket (jira.js get). Exit 3 = Jira unreachable, not verified.
//                                                             LOOP_JIRA_DUMP=<file> reads that text from a file instead (dry runs).
// Exit: 0 OK, 1 problems, 2 usage, 5 STOP_ASK (healing needs the user).
// loop-verify.sh runs the default check before every gate run once ui.locked exists, and --classify after each UI run.
// Layout: e2sc-ui_tests/tests/locked/<KEY>/specs/*.spec.ts and .../pages/*.ts; runtime e2sc-ui_tests/tests/ui-contract.ts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const key = process.argv[2];
const mode = (process.argv.find((a) => /^--(lock|classify|bound|heal|jira)$/.test(a)) || '--check').slice(2);
if (!key || key.startsWith('--')) { console.error('usage: loop-ui-check.js <KEY> [--lock|--classify|--bound|--heal]'); process.exit(2); }

const root = process.cwd();
const loopDir = path.join(root, '.loop', key);
const ticketRel = 'e2sc-ui_tests/tests/locked/' + key;
const ticketDir = path.join(root, ticketRel);
const specsDir = path.join(ticketDir, 'specs');
const pagesDir = path.join(ticketDir, 'pages');
const F = (n) => path.join(loopDir, n);
const MARK = F('ui.locked');
const problems = [];
const notes = [];

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const shaFile = (p) => sha(fs.readFileSync(p));
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const listFiles = (dir, filter = () => true) => {
  const out = [];
  const walk = (d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (filter(p)) out.push(p); } };
  walk(dir); return out.sort();
};

// ---------- tokenizer: masks comments, strings and regex literals so structure can be read safely ----------
function scan(src) {
  let out = ''; const strings = []; let i = 0; const n = src.length;
  const lastSig = () => { const t = out.replace(/\s+$/, ''); return t; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let e = src.indexOf('\n', i); if (e < 0) e = n; out += ' '.repeat(e - i); i = e; continue; }
    if (c === '/' && d === '*') { let e = src.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; out += src.slice(i, e).replace(/[^\n]/g, ' '); i = e; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, val = '';
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') { val += src[j + 1] || ''; j += 2; continue; }
        if (c !== '`' && src[j] === '\n') break;
        val += src[j]; j++;
      }
      const e = Math.min(j + 1, n);
      strings.push({ value: val, start: i, end: e });
      const seg = src.slice(i, e).replace(/[^\n]/g, '_');
      out += c + seg.slice(1, -1) + (e - i > 1 ? c : ''); i = e; continue;
    }
    if (c === '/') {
      const t = lastSig();
      if (t === '' || /[(,=:\[!&|?{};]$/.test(t) || /\b(return|typeof|case)$/.test(t)) {
        let j = i + 1, cls = false;
        while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
        j++; while (j < n && /[a-z]/i.test(src[j])) j++;
        out += '/' + '_'.repeat(Math.max(0, j - i - 2)) + '/'; i = j; continue;
      }
    }
    out += c; i++;
  }
  return { masked: out, strings };
}
const matchClose = (m, openIdx) => { // index of the bracket matching m[openIdx]
  const pairs = { '(': ')', '[': ']', '{': '}' }; const stack = [];
  for (let i = openIdx; i < m.length; i++) {
    const c = m[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === ')' || c === ']' || c === '}') { if (stack.pop() !== c) return -1; if (!stack.length) return i; }
  }
  return -1;
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// ---------- cases.approved ----------
const approvedSrc = read(F('cases.approved'));
let allIds = [], logicIds = [], navLabels = [];
if (approvedSrc === null) problems.push('missing .loop/' + key + '/cases.approved');
else {
  const ids = (s) => [...new Set((s.match(/\b[A-Z]*TC\d+[a-z]?\b/g) || []))];
  const m = approvedSrc.match(/Approved case IDs?:\s*(.+)/i); if (m) allIds = ids(m[1]); else problems.push('cases.approved has no "Approved case IDs:" line');
  const lg = approvedSrc.match(/Logic case IDs?:\s*(.+)/i); if (lg) logicIds = ids(lg[1]);
  for (const l of approvedSrc.split(/\r?\n/)) {
    const nm = l.match(/^\s*[-*]?\s*\**Navigation labels\**:\s*(.+)$/i);
    if (nm) navLabels.push(...[...nm[1].matchAll(/["“]([^"”]+)["”]/g)].map((x) => x[1]));
  }
}
const uiIds = allIds.filter((id) => !logicIds.includes(id));

// ---------- page files ----------
const RET_OK = /^(Promise<\s*(void|Locator|string|string\[\]|number|number\[\])\s*>|Locator|string|string\[\]|number|number\[\]|void)$/;
function parsePage(file) {
  const src = read(file); const r = rel(file); const { masked: m, strings } = scan(src);
  const classes = []; const probs = [];
  let i = 0;
  while (i < m.length) {
    if (/\s/.test(m[i])) { i++; continue; }
    const rest = m.slice(i);
    if (/^import\b/.test(rest)) { const e = m.indexOf(';', i); i = e < 0 ? m.length : e + 1; continue; }
    const cm = rest.match(/^export\s+class\s+(\w+)\s*\{/);
    if (cm) {
      const open = i + cm[0].length - 1; const close = matchClose(m, open);
      if (close < 0) { probs.push(`${r}: unbalanced braces in class ${cm[1]}`); break; }
      classes.push(parseClass(cm[1], src, m, open + 1, close, r, probs)); i = close + 1; continue;
    }
    const e = m.indexOf('\n', i); const stmt = m.slice(i, e < 0 ? m.length : e).trim();
    probs.push(`${r}:${lineOf(src, i)} top-level code is not allowed in a page file (use a private method): ${stmt.slice(0, 70)}`);
    i = e < 0 ? m.length : e + 1;
  }
  if (classes.length !== 1) probs.push(`${r}: must declare exactly one "export class" (found ${classes.length})`);
  return { file, rel: r, src, masked: m, strings, classes, probs };
}
function parseClass(name, src, m, from, to, r, probs) {
  const members = []; let i = from; let prevEnd = from;
  while (i < to) {
    if (/\s/.test(m[i])) { i++; continue; }
    const doc = src.slice(prevEnd, i); // the doc comment above the member (comments are masked to spaces in m)
    let j = i, depth = 0;
    while (j < to) { const c = m[j]; if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--; else if (depth === 0 && (c === '{' || c === ';')) break; j++; }
    const headerM = m.slice(i, j), header = norm(src.slice(i, j)), line = lineOf(src, i);
    if (m[j] === ';' || j >= to) {
      if (!/^private\b/.test(norm(headerM))) probs.push(`${r}:${line} public property "${header.slice(0, 60)}": only methods form the interface`);
      members.push({ name: header, kind: 'prop', visibility: 'private', header, line, start: i, end: j, modelIds: [] });
      i = j + 1; prevEnd = i; continue;
    }
    const bodyClose = matchClose(m, j);
    if (bodyClose < 0) { probs.push(`${r}:${line} unbalanced braces`); break; }
    const body = src.slice(j + 1, bodyClose);
    // Contract model IDs named in the doc comment (Phase A writes them there), e.g. PoHeader.CustomerName__Autocomplete.
    const modelIds = [...new Set((doc.match(/\b[A-Z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9_]*\b/g) || []))];
    const mem = { header, line, start: i, end: bodyClose, endLine: lineOf(src, bodyClose), body, bodyMasked: m.slice(j + 1, bodyClose), modelIds };
    const h = norm(headerM);
    if (/^constructor\s*\(/.test(h)) {
      Object.assign(mem, { name: 'constructor', kind: 'ctor', visibility: 'public' });
      if (header !== 'constructor(private readonly page: Page)') probs.push(`${r}:${line} constructor must be exactly "constructor(private readonly page: Page) {}"`);
      if (body.trim()) probs.push(`${r}:${line} constructor body must be empty`);
    } else if (/=>|=/.test(h.replace(/\([^)]*\)/g, ''))) {
      probs.push(`${r}:${line} arrow-function/property members are not allowed; write a method: ${header.slice(0, 60)}`);
      Object.assign(mem, { name: header, kind: 'bad', visibility: 'public' });
    } else if (/^(get|set)\s+\w+\s*\(/.test(h) || /^(static\s+)?(get|set)\s/.test(h)) {
      probs.push(`${r}:${line} getters/setters are not allowed: ${header.slice(0, 60)}`);
      Object.assign(mem, { name: header, kind: 'bad', visibility: 'public' });
    } else {
      const mm = h.match(/^(public\s+|private\s+|protected\s+|#)?(static\s+)?(async\s+)?(#?\w+)\s*\(/);
      if (!mm) { probs.push(`${r}:${line} unrecognised member: ${header.slice(0, 60)}`); Object.assign(mem, { name: header, kind: 'bad', visibility: 'public' }); }
      else {
        const vis = mm[1] && /private|#/.test(mm[1]) || mm[4].startsWith('#') ? 'private' : (mm[1] && /protected/.test(mm[1]) ? 'protected' : 'public');
        Object.assign(mem, { name: mm[4], kind: 'method', visibility: vis });
        if (vis === 'protected') probs.push(`${r}:${line} protected members are not allowed: use public (interface) or private (helper)`);
        if (vis === 'public') {
          if (/\n/.test(src.slice(i, j).trim())) probs.push(`${r}:${line} public method signature must be on one line: ${mem.name}`);
          const close = matchClose(headerM, headerM.indexOf('('));
          const ret = close > 0 ? norm(headerM.slice(close + 1)).replace(/^:\s*/, '') : '';
          if (!ret) probs.push(`${r}:${line} ${name}.${mem.name} must declare its return type`);
          else if (/boolean/.test(ret)) probs.push(`${r}:${line} ${name}.${mem.name} returns ${ret}: query methods return raw values, never booleans that judge correctness`);
          else if (!RET_OK.test(ret)) probs.push(`${r}:${line} ${name}.${mem.name} returns ${ret}: allowed are Locator, string, string[], number, number[], void (or a Promise of one)`);
        }
      }
    }
    members.push(mem); i = bodyClose + 1; prevEnd = i;
  }
  return { name, members };
}
// Lint shared by public and private page code.
const PAGE_BANS = [
  [/\bexpect\s*[.(]/, 'expect( in pages/: assertions belong in specs/'],
  [/\.(isVisible|isHidden)\s*\(/, 'isVisible()/isHidden() in pages/: a step must not depend on whether something is present'],
  [/\.or\s*\(/, 'locator.or( in pages/: a fallback locator hides a missing or different element'],
  [/\.catch\s*\(/, '.catch( in pages/: swallowing a failure hides a missing step'],
  [/\btry\s*\{/, 'try { in pages/: swallowing a failure hides a missing step'],
  [/\btimeout\s*:\s*0\b/, 'timeout: 0 in pages/: an instant check is a hidden presence test'],
  [/\b(waitForTimeout|setTimeout|setInterval)\s*\(/, 'fixed delay in pages/: wait on a concrete condition'],
  [/\bif\s*\([^)]*\bawait\b/, 'if (await ...) in pages/: conditional step (e.g. "click if present")'],
  [/\bawait\b[^;{}]*\?[^;{}]*:/, 'ternary on an awaited value in pages/: conditional step'],
  [/\b(route|routeFromHAR|unroute|addInitScript|exposeFunction|exposeBinding)\s*\(/, 'faking the app in pages/ (route/addInitScript/expose*)'],
];
function lintPage(pg) {
  for (const [re, msg] of PAGE_BANS) {
    const g = new RegExp(re.source, 'g'); let x;
    while ((x = g.exec(pg.masked))) pg.probs.push(`${pg.rel}:${lineOf(pg.src, x.index)} ${msg}`);
  }
}
const publicSigs = (pages) => {
  const sigs = {};
  for (const pg of pages) for (const c of pg.classes) sigs[c.name] = c.members.filter((x) => x.visibility === 'public' && x.kind !== 'prop').map((x) => x.header.replace(/^public\s+/, ''));
  return sigs;
};
const sigSha = (sigs) => sha(JSON.stringify(Object.keys(sigs).sort().map((k) => [k, sigs[k]])));
const findMember = (pages, qname) => {
  for (const pg of pages) for (const c of pg.classes) for (const x of c.members) if (`${c.name}.${x.name}` === qname) return x;
  return null;
};
const methodBodies = (pages) => {
  const out = {};
  for (const pg of pages) for (const c of pg.classes) for (const x of c.members) if (x.kind === 'method' || x.kind === 'prop') out[`${c.name}.${x.name}`] = sha(x.kind === 'prop' ? x.header : norm(x.header) + '\n' + x.body);
  return out;
};

// ---------- spec files ----------
const SPEC_BANS = [
  [/\btest\s*\.\s*(skip|only|fixme|fail)\b/, 'forbidden marker test.skip/only/fixme/fail'],
  [/\b(describe)\s*\.\s*(skip|only|fixme|serial)\b|describe\s*\.\s*configure/, 'forbidden describe modifier/configure'],
  [/\btest\s*\.\s*(beforeEach|beforeAll|afterEach|afterAll)\b/, 'hooks are not allowed in specs: sign-in is a page-object step'],
  [/\.(locator|getByRole|getByText|getByLabel|getByTitle|getByPlaceholder|getByTestId|getByAltText|goto|click|dblclick|fill|press|type|check|uncheck|selectOption|setInputFiles|evaluate|evaluateHandle|waitForSelector|frameLocator|frame|dispatchEvent|hover|tap|route)\s*\(/, 'direct UI interaction in a spec: go through a page-object method'],
  [/\b(waitForTimeout|setTimeout)\s*\(/, 'fixed delay in a spec'],
  [/\bif\s*\(|\btry\s*\{|\.catch\s*\(/, 'conditional/try/catch in a spec: specs are linear'],
];
function parseSpec(file) {
  const src = read(file); const r = rel(file); const { masked: m, strings } = scan(src); const probs = [];
  for (const [re, msg] of SPEC_BANS) { const g = new RegExp(re.source, 'g'); let x; while ((x = g.exec(m))) probs.push(`${r}:${lineOf(src, x.index)} ${msg}`); }
  // imports
  const srcImports = [...src.matchAll(/\bimport\b[^;]*?from\s*(['"])([^'"]*)\1/g)].map((x) => x[2]);
  for (const p of srcImports) if (p !== '@playwright/test' && !p.startsWith('../pages/')) probs.push(`${r}: import from "${p}": specs import only '@playwright/test' and '../pages/*'`);
  // tests
  const tests = []; const tg = /\btest\s*\(\s*['"`]/g; let t;
  while ((t = tg.exec(m))) { const s = strings.find((x) => x.start === t.index + t[0].length - 1); tests.push({ title: s ? s.value : '?', start: t.index, line: lineOf(src, t.index) }); }
  tests.forEach((x, k) => { x.end = k + 1 < tests.length ? tests[k + 1].start : m.length; });
  // expect statements and their literals
  const exps = []; const eg = /\bexpect\b/g; let e;
  while ((e = eg.exec(m))) {
    let j = e.index, depth = 0;
    for (; j < m.length; j++) { const c = m[j]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) { depth--; if (depth < 0) break; } else if (c === ';' && depth === 0) break; }
    exps.push({ start: e.index, end: j, line: lineOf(src, e.index) }); eg.lastIndex = j;
  }
  // Which page-object query each expect reads: `const po = new XPage(page)` ... expect(po.customerIdControl()).
  const vars = Object.fromEntries([...src.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*new\s+(\w+)\s*\(/g)].map((x) => [x[1], x[2]]));
  for (const x of exps) for (const c of m.slice(x.start, x.end).matchAll(/\b(\w+)\s*\.\s*(\w+)\s*\(/g)) if (vars[c[1]]) { x.method = `${vars[c[1]]}.${c[2]}`; break; }
  const callRe = /\bexpect\s*(?:\.\s*(?:soft|poll))?\s*\(/g;
  const count = (a, b) => (m.slice(a, b).match(callRe) || []).length;
  const literals = new Map();
  for (const x of exps) for (const s of strings) if (s.start >= x.start && s.end <= x.end && s.value.trim()) {
    if (!literals.has(s.value)) literals.set(s.value, `${r}:${lineOf(src, s.start)}`);
  }
  return { file, rel: r, src, masked: m, probs, tests, exps, literals, expectTotal: count(0, m.length), expectPerTest: Object.fromEntries(tests.map((x) => [x.title, count(x.start, x.end)])) };
}
const expectAt = (spec, line) => spec.exps.find((x) => line >= x.line && line <= lineOf(spec.src, x.end));

// ---------- snapshot of everything outside pages/, and the shared helpers the ticket imports ----------
// Ticket files outside pages/, plus every shared helper e2sc-ui_tests/tests/*.ts (hashed at lock). The check compares
// the ticket files and those shared helpers the ticket's files import now (pages/ may start importing a helper in Phase B).
const sharedDir = path.join(root, 'e2sc-ui_tests', 'tests');
function snapshot() {
  const snap = {};
  for (const f of listFiles(ticketDir, (p) => !rel(p).startsWith(ticketRel + '/pages/'))) snap[rel(f)] = shaFile(f);
  let shared = []; try { shared = fs.readdirSync(sharedDir).filter((f) => f.endsWith('.ts')).map((f) => path.join(sharedDir, f)); } catch {}
  for (const f of shared) snap[rel(f)] = shaFile(f);
  return snap;
}
function importedShared() {
  const out = new Set();
  for (const f of listFiles(ticketDir, (p) => /\.ts$/.test(p))) {
    for (const x of (read(f) || '').matchAll(/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      let t = path.resolve(path.dirname(f), x[1]); if (!/\.ts$/.test(t)) t += '.ts';
      if (!rel(t).startsWith(ticketRel + '/')) out.add(rel(t));
    }
  }
  return out;
}

// ---------- last UI run (Playwright JSON report written by loop-verify.sh) ----------
function lastRun() {
  const p = F('last-ui.json'); const raw = read(p); if (raw === null) return null;
  let j; try { j = JSON.parse(raw); } catch { return { error: 'last-ui.json is not valid JSON' }; }
  const tests = [];
  const walk = (suite, file) => {
    for (const s of suite.specs || []) for (const t of s.tests || []) {
      const res = (t.results || [])[t.results.length - 1] || {};
      tests.push({ title: s.title, file: s.file || file, status: res.status || t.status, errors: res.errors || (res.error ? [res.error] : []) });
    }
    for (const c of suite.suites || []) walk(c, c.file || file);
  };
  for (const s of j.suites || []) walk(s, s.file);
  return { tests, mtime: fs.statSync(p).mtimeMs };
}
function classify(run, pages, specs) {
  const out = [];
  for (const t of run.tests) {
    if (t.status === 'passed' || t.status === 'skipped') { out.push({ test: t.title, kind: t.status === 'passed' ? 'PASSED' : 'SKIPPED' }); continue; }
    let verdict = null;
    for (const er of t.errors) {
      const msg = (er.message || '').replace(/\u001b\[[0-9;]*m/g, '');
      const um = msg.match(/UNBOUND: (\S+) \(([^)]*)\)/);
      if (um) { verdict = { kind: 'UNBOUND', method: um[1], where: um[2] }; break; }
      const frames = [];
      if (er.location && er.location.file) frames.push({ file: er.location.file, line: er.location.line });
      for (const fm of (er.stack || '').matchAll(/([A-Za-z]:[\\/][^\s():]+|\/[^\s():]+|[^\s():]+\.ts):(\d+):\d+/g)) frames.push({ file: fm[1], line: Number(fm[2]) });
      // A locator that resolved to nothing (element(s) not found, or a timeout while waiting for the locator) is a
      // binding question, whether it surfaced in a page method or in a spec expect on a query method. It is a defect
      // instead when the failing locator already targets the contract model ID: the element the contract names is
      // not in the DOM. A value that was found but differs is an assertion failure.
      const notFound = /element\(s\) not found/.test(msg) || (/waiting for\s+(locator|getBy|frameLocator)/.test(msg) && /Timeout/i.test(msg) && !/Received(?: string| value)?:\s*(?!<element\(s\) not found>)\S/.test(msg));
      const locStr = ((msg.match(/Locator:\s*(.+)/) || msg.match(/waiting for\s+(.+)/) || [])[1] || '').trim();
      const first = msg.split('\n').find((l) => l.trim()) || '';
      const judge = (method, where) => {
        const mem = findMember(pages, method);
        const ids = mem ? mem.modelIds : [];
        if (notFound && ids.length && ids.some((id) => locStr.includes(id)))
          return { kind: 'ASSERTION', method, where, message: `contract model ID ${ids.join('/')} is not in the DOM (${locStr.slice(0, 90)}): a defect for the implementer, not a heal` };
        if (notFound) return { kind: 'BINDING', method, where, message: `locator not found (${locStr.slice(0, 90)}); re-bind by the contract model ID${ids.length ? ' ' + ids.join('/') : ''}` };
        return null;
      };
      const pf = frames.find((f) => /[\\/]pages[\\/][^\\/]+\.ts$/.test(f.file) && f.file.replace(/\\/g, '/').includes('/locked/' + key + '/'));
      if (pf) {
        const pg = pages.find((p) => path.resolve(p.file) === path.resolve(pf.file) || p.file.replace(/\\/g, '/').endsWith(pf.file.replace(/\\/g, '/').split('/locked/')[1] || '\u0000'));
        let method = '?';
        if (pg) for (const c of pg.classes) for (const x of c.members) if (x.line <= pf.line && pf.line <= (x.endLine || x.line)) method = `${c.name}.${x.name}`;
        const where = `${pg ? pg.rel : pf.file}:${pf.line}`;
        verdict = judge(method, where) || { kind: 'BINDING', method, where, message: first.slice(0, 160) }; break;
      }
      const sf = frames.find((f) => /\.spec\.ts$/.test(f.file));
      if (sf && !verdict) {
        const sp = specs.find((s) => path.resolve(s.file) === path.resolve(sf.file) || s.file.replace(/\\/g, '/').endsWith(path.basename(sf.file)));
        const ex = sp && expectAt(sp, sf.line);
        const where = `${sp ? sp.rel : sf.file}:${sf.line}`;
        if (ex) verdict = (ex.method && judge(ex.method, where)) || { kind: 'ASSERTION', method: ex.method, where, message: first.slice(0, 160) };
        else verdict = { kind: 'OTHER', where, message: first.slice(0, 160) };
      }
    }
    out.push({ test: t.title, ...(verdict || { kind: 'OTHER', message: ((t.errors[0] || {}).message || t.status || '').split('\n')[0].slice(0, 160) }) });
  }
  return out;
}

// ---------- gather ----------
const specFiles = listFiles(specsDir, (p) => p.endsWith('.spec.ts'));
const pageFiles = listFiles(pagesDir, (p) => p.endsWith('.ts'));
const strays = listFiles(ticketDir, (p) => !rel(p).startsWith(ticketRel + '/specs/') && !rel(p).startsWith(ticketRel + '/pages/'));
if (!specFiles.length) problems.push(`no specs in ${ticketRel}/specs/*.spec.ts`);
if (!pageFiles.length) problems.push(`no page objects in ${ticketRel}/pages/*.ts`);
for (const s of strays) problems.push(`${rel(s)}: only specs/ and pages/ are allowed under ${ticketRel}`);
const specs = specFiles.map(parseSpec);
const pages = pageFiles.map(parsePage);
pages.forEach(lintPage);
for (const s of specs) problems.push(...s.probs);
for (const p of pages) problems.push(...p.probs);

// case <-> test mapping
const found = {};
for (const s of specs) for (const t of s.tests) {
  const id = (t.title.match(/^\s*([A-Z]*TC\d+[a-z]?)\b/) || [])[1];
  if (!id) problems.push(`${s.rel}:${t.line} test title doesn't start with a TC ID: "${t.title.slice(0, 60)}"`);
  else (found[id] = found[id] || []).push(`${s.rel}:${t.line}`);
}
for (const id of uiIds) { if (!found[id]) problems.push(`approved UI case ${id} has no test`); else if (found[id].length > 1) problems.push(`approved UI case ${id} has ${found[id].length} tests: ${found[id].join(', ')}`); }
for (const id of Object.keys(found)) if (!uiIds.includes(id)) problems.push(`test for a case that is not an approved UI case: ${id} (${found[id].join(', ')})`);

// expected-value literals: asserted literals must not appear in pages/; navigation labels must not be asserted
const asserted = new Map(); for (const s of specs) for (const [v, w] of s.literals) if (!asserted.has(v)) asserted.set(v, w);
for (const lab of navLabels) if (asserted.has(lab)) problems.push(`navigation label "${lab}" is asserted at ${asserted.get(lab)}: navigation labels may be used to locate, never asserted`);
const locatorText = /has-text\(|:text\(|text=|>>\s*text/;
for (const pg of pages) for (const s of pg.strings) {
  if (/^import\b/.test(pg.src.slice(pg.src.lastIndexOf('\n', s.start) + 1, s.start).trim())) continue;
  const before = pg.src.slice(Math.max(0, s.start - 40), s.start);
  if (/\bunbound\s*\(\s*$/.test(before) || /\bunbound\s*\(\s*(['"`])[^'"`]*\1\s*,\s*$/.test(before)) continue;
  if (asserted.has(s.value)) problems.push(`${pg.rel}:${lineOf(pg.src, s.start)} expected value "${s.value}" (asserted at ${asserted.get(s.value)}) is hard-coded in pages/: locate by model ID, or list it as a Navigation label in the contract if it is only navigation`);
  else if (locatorText.test(s.value)) for (const v of asserted.keys()) if (v.length >= 4 && s.value.includes(v)) problems.push(`${pg.rel}:${lineOf(pg.src, s.start)} text locator "${s.value.slice(0, 60)}" contains the asserted value "${v}" (${asserted.get(v)})`);
}

const sigs = publicSigs(pages);
const run = lastRun();
const cls = run && !run.error ? classify(run, pages, specs) : null;

function report(extra = []) {
  const all = problems.concat(extra);
  if (all.length) { console.log('UI CHECK FAILED:\n' + all.map((p) => '- ' + p).join('\n')); return false; }
  return true;
}
const printClass = () => {
  if (!cls) { console.log(run && run.error ? run.error : 'no last-ui.json yet (loop-verify.sh writes it)'); return; }
  console.log('Last UI run:');
  for (const c of cls) console.log(`  ${c.kind.padEnd(9)} ${c.test}${c.method ? '  [' + c.method + ']' : ''}${c.where ? '  @ ' + c.where : ''}${c.message ? '  :: ' + c.message : ''}`);
};

// ================= modes =================
if (mode === 'classify') {
  printClass();
  if (cls) {
    fs.writeFileSync(F('last-classify.json'), JSON.stringify({ date: new Date().toISOString(), results: cls }, null, 2));
    const binding = cls.filter((c) => c.kind === 'BINDING');
    if (binding.length && fs.existsSync(F('ui.bound')) && !fs.existsSync(F('heal-request.json'))) {
      fs.writeFileSync(F('heal-request.json'), JSON.stringify({ date: new Date().toISOString(), methods: [...new Set(binding.map((b) => b.method))], tests: binding.map((b) => b.test) }, null, 2));
      console.log('Wrote heal-request.json: a BINDING failure after ui.bound. Healing follows the Phase B rules (run-loop.md "Healing after lock").');
    }
  }
  process.exit(0);
}

if (mode === 'lock') {
  if (fs.existsSync(MARK)) { console.log('REFUSING to lock: .loop/' + key + '/ui.locked already exists. A lock marker is never overwritten.'); process.exit(1); }
  const extra = [];
  // Phase A shape: every public method body is exactly one unbound('<Class>.<method>', '<case step>') call; no private helpers yet.
  for (const pg of pages) for (const c of pg.classes) for (const x of c.members) {
    if (x.kind !== 'method') continue;
    if (x.visibility !== 'public') { extra.push(`${pg.rel}:${x.line} private method ${c.name}.${x.name} at lock time: Phase A writes the interface only`); continue; }
    const b = x.body.match(/^\s*(return\s+)?unbound\(\s*(['"`])([^'"`]*)\2\s*,\s*(['"`])([^'"`]*)\4\s*\)\s*;?\s*$/);
    if (!b) extra.push(`${pg.rel}:${x.line} ${c.name}.${x.name}: Phase A body must be exactly unbound('${c.name}.${x.name}', '<TCn step>')`);
    else if (b[3] !== `${c.name}.${x.name}`) extra.push(`${pg.rel}:${x.line} unbound() names "${b[3]}", expected "${c.name}.${x.name}"`);
    else if (!/\b[A-Z]*TC\d+/.test(b[5])) extra.push(`${pg.rel}:${x.line} unbound() case step "${b[5]}" has no TC ID (traceability)`);
  }
  // The UNBOUND run: every UI test ran after the last file change and failed with UNBOUND.
  if (!run) extra.push('no .loop/' + key + '/last-ui.json: run `bash ~/.claude/scripts/loop-verify.sh ' + key + ' --ui-only` first');
  else if (run.error) extra.push(run.error);
  else {
    const newest = Math.max(...listFiles(ticketDir).map((f) => fs.statSync(f).mtimeMs), fs.statSync(F('cases.approved')).mtimeMs);
    if (run.mtime < newest) extra.push('last-ui.json is older than the files under ' + ticketRel + ' or cases.approved: re-run loop-verify.sh --ui-only');
    if (run.tests.length !== uiIds.length) extra.push(`UNBOUND run had ${run.tests.length} test(s); approved UI cases: ${uiIds.length}`);
    for (const c of cls) if (c.kind !== 'UNBOUND') extra.push(`UNBOUND run: "${c.test}" is ${c.kind}${c.message ? ' (' + c.message + ')' : ''}: every test must fail with UNBOUND before the lock`);
  }
  // test-plan.md: one row per UI case with a discriminating check
  const plan = read(F('test-plan.md'));
  if (plan === null) extra.push('no .loop/' + key + '/test-plan.md (ui-assert writes it)');
  else {
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const rows = plan.split(/\r?\n/).filter((l) => l.trim().startsWith('|')).map(cells);
    const header = rows.find((r) => r.some((c) => /discriminating/i.test(c)));
    if (!header) extra.push('test-plan.md has no table with a "Discriminating check" column');
    else { const col = header.findIndex((c) => /discriminating/i.test(c));
      for (const id of uiIds) { const row = rows.find((r) => r !== header && r.some((c) => new RegExp('\\b' + id + '\\b').test(c)));
        if (!row) extra.push(`test-plan.md has no row for UI case ${id}`);
        else if (!row[col] || /^(n\/?a|none|nil|tbd|todo|-+|\?)$/i.test(row[col])) extra.push(`test-plan.md: ${id} has no discriminating check`); } }
  }
  if (!report(extra)) process.exit(1);
  const machine = {
    ticket: key, date: new Date().toISOString(), uiCases: uiIds, casesApprovedSha: shaFile(F('cases.approved')),
    specs: Object.fromEntries(specs.map((s) => [s.rel, shaFile(s.file)])),
    signatureSha: sigSha(sigs), signatures: sigs,
    expectCounts: Object.fromEntries(specs.map((s) => [s.rel, { total: s.expectTotal, tests: s.expectPerTest }])),
    navigationLabels: navLabels, snapshot: snapshot(),
    unboundRun: { tests: run.tests.length, unbound: cls.filter((c) => c.kind === 'UNBOUND').length, passed: 0 },
  };
  const human = [
    `Locked: ${machine.date.slice(0, 10)} (UI contract, Phase A)`,
    `UI cases: ${uiIds.join(', ')}. Specs and page-object interface written by ui-assert from cases.approved only, before the build.`,
    `UNBOUND run: ${machine.unboundRun.tests} test(s), all failed with UNBOUND, 0 passed.`,
    `cases.approved sha256: ${machine.casesApprovedSha}`,
    'Specs (sha256):', ...Object.entries(machine.specs).map(([f, h]) => `${h} *${f}`),
    `Page-object public signatures (sha256): ${machine.signatureSha}`,
    ...Object.entries(sigs).map(([c, l]) => `  ${c}: ${l.join(' | ')}`),
    'expect() calls at lock:', ...specs.map((s) => `  ${s.rel}: ${s.expectTotal} (${Object.entries(s.expectPerTest).map(([t, n]) => `${t.split(' ')[0]}=${n}`).join(', ')})`),
    `Navigation labels: ${navLabels.length ? navLabels.map((l) => '"' + l + '"').join(', ') : '(none)'}`,
    'Snapshot outside pages/ and shared helpers (sha256):', ...Object.entries(machine.snapshot).map(([f, h]) => `${h} *${f}`),
    '', '--- machine (loop-ui-check.js; do not edit) ---', JSON.stringify(machine), '',
  ].join('\n');
  fs.writeFileSync(MARK, human);
  console.log(`UI CHECK OK. Wrote .loop/${key}/ui.locked (${specs.length} spec file(s), ${Object.keys(sigs).length} page class(es)).`);
  console.log(`ui.locked sha256: ${shaFile(MARK)}`);
  process.exit(0);
}

// ---------- every other mode needs the lock ----------
const markSrc = read(MARK);
if (markSrc === null) { report(['no .loop/' + key + '/ui.locked: Phase A is not locked yet']); process.exit(1); }
if (mode === 'jira') {
  let text;
  if (process.env.LOOP_JIRA_DUMP) text = read(process.env.LOOP_JIRA_DUMP) || '';
  else {
    const r = require('child_process').spawnSync('node', [path.join(os.homedir(), '.claude', 'scripts', 'jira.js'), 'get', key], { encoding: 'utf8' });
    if (r.status !== 0) { console.log('JIRA_UNVERIFIED: could not read ' + key + ' from Jira: ' + ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-1)[0]); process.exit(3); }
    text = r.stdout;
  }
  const posted = [...text.matchAll(/ui\.locked sha256:\s*([0-9a-f]{64})/g)].map((x) => x[1]);
  const local = shaFile(MARK);
  if (!posted.length) { console.log('JIRA CHECK FAILED: no "ui.locked sha256: <hex>" comment on ' + key + ' (step 2b posts it at lock time). Local: ' + local); process.exit(1); }
  if (posted[posted.length - 1] !== local) { console.log('JIRA CHECK FAILED: ui.locked sha256 ' + local + ' does not match the hash posted to Jira (' + posted[posted.length - 1] + '). The lock file was replaced or edited.'); process.exit(1); }
  console.log('JIRA CHECK OK: ui.locked sha256 ' + local + ' matches the hash posted to ' + key + '.');
  process.exit(0);
}
let L; try { L = JSON.parse(markSrc.split('--- machine (loop-ui-check.js; do not edit) ---')[1]); } catch { report(['ui.locked has no readable machine block']); process.exit(1); }
const extra = [];
if (shaFile(F('cases.approved')) !== L.casesApprovedSha) extra.push('cases.approved changed since ui.locked: a contract change goes back to approval, Phase A and a new lock');
const nowSpecs = Object.fromEntries(specs.map((s) => [s.rel, shaFile(s.file)]));
for (const f of new Set([...Object.keys(L.specs), ...Object.keys(nowSpecs)])) if (L.specs[f] !== nowSpecs[f]) extra.push(`spec ${f} ${!nowSpecs[f] ? 'was removed' : !L.specs[f] ? 'was added' : 'changed'} since ui.locked`);
if (sigSha(sigs) !== L.signatureSha) {
  extra.push('page-object public signatures differ from ui.locked');
  for (const c of new Set([...Object.keys(L.signatures), ...Object.keys(sigs)])) {
    const a = L.signatures[c] || [], b = sigs[c] || [];
    for (const s of b) if (!a.includes(s)) extra.push(`  + ${c}: ${s}`);
    for (const s of a) if (!b.includes(s)) extra.push(`  - ${c}: ${s}`);
  }
}
for (const s of specs) { const was = (L.expectCounts[s.rel] || {}); if (was.total !== undefined && s.expectTotal < was.total) extra.push(`${s.rel} has ${s.expectTotal} expect() calls, ${was.total} at lock`);
  for (const [t, n] of Object.entries(was.tests || {})) if ((s.expectPerTest[t] || 0) < n) extra.push(`${s.rel} "${t}" has ${s.expectPerTest[t] || 0} expect() calls, ${n} at lock`); }
const snap = snapshot();
const imp = importedShared();
const isShared = (f) => !f.startsWith(ticketRel + '/');
for (const f of imp) if (!(f in L.snapshot)) extra.push(`pages/ or specs import ${f}, which did not exist at ui.locked: Phase B may import existing shared helpers only`);
for (const f of new Set([...Object.keys(L.snapshot), ...Object.keys(snap)])) {
  if (isShared(f) && !imp.has(f)) continue;
  if (L.snapshot[f] !== snap[f]) extra.push(`outside pages/: ${f} ${!snap[f] ? 'was removed' : !L.snapshot[f] ? 'was added' : 'changed'} since ui.locked (Phase B may change pages/ only)`);
}

const boundSrc = read(F('ui.bound'));
const bodies = methodBodies(pages);
const changedVsBound = () => { const B = JSON.parse(boundSrc).methods; return [...new Set([...Object.keys(B), ...Object.keys(bodies)])].filter((k) => B[k] !== bodies[k]); };
if (boundSrc && mode === 'check') { const ch = changedVsBound(); if (ch.length) extra.push(`pages/ changed since ui.bound without an accepted heal (--heal): ${ch.join(', ')}`); }

if (mode === 'check') {
  const ok = report(extra);
  if (ok) console.log(`UI CHECK OK: specs, page signatures, expect counts and files outside pages/ match ui.locked (${L.date.slice(0, 10)}); pages/ lint clean.${boundSrc ? ' pages/ match ui.bound.' : ''}`);
  if (cls) printClass();
  process.exit(ok ? 0 : 1);
}

if (mode === 'bound') {
  if (boundSrc) extra.push('ui.bound already exists: later page changes go through --heal');
  for (const pg of pages) if (/\bunbound\s*\(/.test(pg.masked)) extra.push(`${pg.rel} still calls unbound(): bind every method first`);
  if (!cls) extra.push('no last UI run to confirm the binding');
  else { if (cls.length !== uiIds.length) extra.push(`last UI run had ${cls.length} test(s); UI cases: ${uiIds.length}`);
    for (const c of cls) if (['UNBOUND', 'BINDING', 'OTHER', 'SKIPPED'].includes(c.kind)) extra.push(`last run: "${c.test}" is ${c.kind}: a bound test either passes or fails on a spec assertion`); }
  if (!report(extra)) process.exit(1);
  fs.writeFileSync(F('ui.bound'), JSON.stringify({ date: new Date().toISOString(), methods: bodies, run: cls.map((c) => [c.test, c.kind]) }, null, 2));
  console.log(`UI CHECK OK. Wrote .loop/${key}/ui.bound (${Object.keys(bodies).length} page members). Later pages/ changes need --heal.`);
  process.exit(0);
}

if (mode === 'heal') {
  if (!boundSrc) { report(['no ui.bound: before the binding is recorded, pages/ changes are ordinary Phase B work']); process.exit(1); }
  if (!report(extra)) process.exit(1);
  const req = read(F('heal-request.json'));
  if (!req) { report(['no heal-request.json: healing is only allowed for a BINDING failure (inside a page-object method) recorded by --classify']); process.exit(1); }
  const R = JSON.parse(req); const changed = changedVsBound();
  const log = (read(F('healing.log')) || '').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t')[1]);
  if (!changed.length) { console.log('nothing changed in pages/ since ui.bound'); process.exit(1); }
  const stop = [];
  if (changed.length > 3) stop.push(`${changed.length} page members changed (${changed.join(', ')}); more than 3 needs the user`);
  for (const c of changed) if (log.includes(c)) stop.push(`${c} was healed before; a second healing of the same method needs the user`);
  if (stop.length) { console.log('STOP_ASK:\n' + stop.map((s) => '- ' + s).join('\n')); process.exit(5); }
  const reqClasses = new Set(R.methods.map((m) => m.split('.')[0]));
  const publicNames = new Set(Object.entries(sigs).flatMap(([c, l]) => l.map((s) => `${c}.${(s.match(/(?:async\s+)?(#?\w+)\s*\(/) || [])[1]}`)));
  const bad = changed.filter((c) => publicNames.has(c) ? !R.methods.includes(c) : !reqClasses.has(c.split('.')[0]));
  if (bad.length) { report([`healing changed members not covered by the BINDING failure (${R.methods.join(', ')}): ${bad.join(', ')}`]); process.exit(1); }
  // A heal re-binds by the contract model ID named in the method's doc comment; anything else is a guess.
  const noId = changed.filter((c) => { const x = findMember(pages, c); return x && x.visibility === 'public' && x.modelIds.length && !x.modelIds.some((id) => x.body.includes(id)); });
  if (noId.length) { report(noId.map((c) => `healed ${c} does not locate by its contract model ID (${findMember(pages, c).modelIds.join('/')}): re-bind by the model ID; if that ID is not in the DOM, it is a defect for the implementer, not a heal`)); process.exit(1); }
  const d = new Date().toISOString();
  fs.appendFileSync(F('healing.log'), changed.map((c) => `${d}\t${c}\t${R.tests.join('; ')}`).join('\n') + '\n');
  fs.appendFileSync(F('iterations.md'), `\n- healing ${d.slice(0, 16)}: test-author re-bound ${changed.join(', ')} for a BINDING failure in ${R.tests.join('; ')} (Phase B rules; specs and signatures unchanged, checked by loop-ui-check.js)\n`);
  const B = JSON.parse(boundSrc); B.methods = bodies; B.healed = (B.healed || []).concat([{ date: d, members: changed }]);
  fs.writeFileSync(F('ui.bound'), JSON.stringify(B, null, 2));
  fs.unlinkSync(F('heal-request.json'));
  console.log(`HEAL_OK: ${changed.join(', ')} logged to healing.log and iterations.md; ui.bound updated.`);
  process.exit(0);
}
