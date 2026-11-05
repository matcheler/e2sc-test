#!/usr/bin/env node
// Test-evidence report for Jira, built only from the gate's own artefacts (no agent writes the results).
// Run from the project root, after the final gate run (run-loop step 8) and the reviewer's verdict:
//   node ~/.claude/scripts/loop-evidence.js <KEY> [--verdict <V>]          writes .loop/<KEY>/evidence.jira.txt
//   node ~/.claude/scripts/loop-evidence.js <KEY> [--verdict <V>] --post   ...and posts it (edits the same comment on re-runs)
// Refuses (exit 1, nothing posted) unless the last gate run is GREEN, every approved case has a passed test,
// nothing failed/flaky/skipped, and the run is newer than ui.bound and every file in the ticket's change set.
// Exit: 0 OK, 1 refused, 2 usage, 3 Jira unreachable (JIRA_AUTH_EXPIRED etc.).
// LOOP_DIR=<dir> reads the artefacts from another folder (dry runs / negative tests); the change-set check is
// then skipped unless LOOP_ROOT is also set.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const KEY = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--verdict');
if (!KEY || !/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(KEY)) { console.error('usage: loop-evidence.js <KEY> [--verdict <V>] [--post]'); process.exit(2); }
const vi = args.indexOf('--verdict');
const verdict = vi >= 0 ? args[vi + 1] : null;
const post = args.includes('--post');

const root = process.env.LOOP_ROOT || process.cwd();
const loopDir = process.env.LOOP_DIR || path.join(root, '.loop', KEY);
const F = (n) => path.join(loopDir, n);
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ids = (s) => (s.match(/[A-Z]*TC\d+[a-z]?/g) || []);
const problems = [];

// ---- approved cases
const approved = read(F('cases.approved'));
if (!approved) { console.error(`REFUSED: no ${F('cases.approved')}`); process.exit(1); }
const allIds = ids((approved.match(/Approved case IDs?:\s*(.+)/i) || [])[1] || '');
const logicIds = ids((approved.match(/Logic case IDs?:\s*(.+)/i) || [])[1] || '');
if (!allIds.length) problems.push('cases.approved has no "Approved case IDs:" line');

// ---- gate summary and run time
const summary = read(F('last-verify-summary.txt')) || '';
if (!/^GREEN:/.test(summary)) problems.push(`last gate run is not GREEN (last-verify-summary.txt: "${summary.split('\n')[0].slice(0, 100)}")`);
const vlog = read(F('last-verify.log')) || '';
const runAt = (vlog.match(/^== loop-verify \S+ (\S+)/m) || [])[1] || 'unknown';

// ---- results per case: Logic from last-logic.out, UI from last-ui.json
const results = {}; // id -> {lane, title, status, duration}
const add = (id, r) => { if (results[id]) problems.push(`${id} has more than one test`); else results[id] = r; };
if (logicIds.length) {
  const lout = read(F('last-logic.out'));
  if (!lout) problems.push('no last-logic.out (Logic cases approved)');
  else for (const m of lout.matchAll(/^(PASS|FAIL) ([A-Z]*TC\d+[a-z]?)\b(.*)$/gm)) add(m[2], { lane: 'Logic', title: (m[2] + m[3]).trim(), status: m[1] === 'PASS' ? 'passed' : 'failed', duration: null });
}
const uiIds = allIds.filter((i) => !logicIds.includes(i));
let stats = null;
if (uiIds.length) {
  let j = null;
  try { j = JSON.parse(read(F('last-ui.json'))); } catch { problems.push('no readable last-ui.json (UI cases approved)'); }
  if (j) {
    stats = j.stats || {};
    const walk = (s) => {
      for (const sp of s.specs || []) for (const t of sp.tests || []) {
        const id = (sp.title.match(/^\s*([A-Z]*TC\d+[a-z]?)\b/) || [])[1];
        if (!id) { problems.push(`UI test title has no TC ID: "${sp.title.slice(0, 60)}"`); continue; }
        const last = (t.results || []).slice(-1)[0] || {};
        const status = t.status === 'expected' && last.status === 'passed' ? 'passed' : (last.status || t.status || 'unknown');
        add(id, { lane: 'UI', title: sp.title, status, duration: last.duration, file: s.file });
      }
      (s.suites || []).forEach(walk);
    };
    (j.suites || []).forEach(walk);
    if ((stats.unexpected || 0) || (stats.flaky || 0) || (stats.skipped || 0)) problems.push(`Playwright stats not clean: ${JSON.stringify(stats)}`);
  }
}
for (const id of allIds) {
  if (!results[id]) problems.push(`${id}: no test result in the last run`);
  else if (results[id].status !== 'passed') problems.push(`${id}: ${results[id].status}`);
}
for (const id of Object.keys(results)) if (!allIds.includes(id)) problems.push(`${id} ran but is not an approved case`);

// ---- freshness: the run must postdate the binding and every changed file of the ticket
const runFiles = [logicIds.length && F('last-logic.out'), uiIds.length && F('last-ui.json')].filter(Boolean);
const runTime = Math.min(...runFiles.map(mtime));
if (fs.existsSync(F('ui.bound')) && runTime < mtime(F('ui.bound'))) problems.push('the last run is older than ui.bound (re-run the gate)');
let changed = [];
if (!process.env.LOOP_DIR || process.env.LOOP_ROOT) {
  try {
    const st = execFileSync('svn', ['status', '-q'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 24 });
    const base = new Set((read(F('svn-baseline.txt')) || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
    changed = st.split(/\r?\n/).filter((l) => l.trim() && !base.has(l.trim()))
      .map((l) => l.slice(8).trim()).filter((p) => p && !p.replace(/\\/g, '/').startsWith('.loop/'));
    for (const p of changed) if (mtime(path.join(root, p)) > runTime) problems.push(`${p} changed after the last gate run (re-run the gate)`);
  } catch (e) { problems.push(`svn status failed: ${String(e.message).split('\n')[0]}`); }
}

if (problems.length) { console.error('REFUSED:\n' + problems.map((p) => '- ' + p).join('\n')); process.exit(1); }

// ---- the report
const lockInfo = (n) => {
  const p = F(n); if (!fs.existsSync(p)) return null;
  return { date: ((read(p).match(/^Locked:\s*(.+)$/m) || [])[1] || '?').trim(), sha: sha(p) };
};
const uiL = lockInfo('ui.locked'); const lgL = lockInfo('logic.locked');
const jiraCheck = ((read(F('ui-check-review.txt')) || '').match(/JIRA CHECK OK[^\n]*/g) || []).slice(-1)[0];
const crit = (title) => ((title.match(/^\s*[A-Z]*TC\d+[a-z]?\s*\(([^)]*)\)/) || [])[1] || '');
const desc = (title) => title.replace(/^\s*[A-Z]*TC\d+[a-z]?\s*(\([^)]*\))?\s*:?\s*/, '');
const cell = (s) => String(s).replace(/\|/g, '/').replace(/[\r\n]+/g, ' ');
const nLogic = allIds.filter((i) => logicIds.includes(i)).length;
const out = [];
out.push(`h3. ${KEY} test evidence: all ${allIds.length} approved cases passed (final gate run)`);
out.push('');
out.push(`Generated by loop-evidence.js from the gate's own output (no hand-written results). Final gate run: ${runAt}.`);
const totals = [nLogic && `Logic ${nLogic}/${nLogic} passed`, uiIds.length && `UI ${uiIds.length}/${uiIds.length} passed`].filter(Boolean).join(', ');
out.push(`*Result:* ${totals}. ${summary.split('\n')[0]}`);
const envs = [process.env.LOGIC_SSH && `Logic host ${process.env.LOGIC_SSH}`, process.env.E2_BASE_URL && `UI target ${process.env.E2_BASE_URL}`].filter(Boolean);
if (envs.length) out.push(`*Environment:* ${envs.join('; ')}.`);
out.push('');
out.push('||Case||Criterion||Lane||Test||Result||Duration||');
for (const id of allIds) {
  const r = results[id];
  out.push(`|${id}|${cell(crit(r.title) || '-')}|${r.lane}|${cell(desc(r.title))}|(/) PASS|${r.duration != null ? (r.duration / 1000).toFixed(1) + ' s' : '-'}|`);
}
out.push('');
out.push('*Written and locked before the build:*');
if (lgL) out.push(`* Logic harness (${logicIds.join(', ')}): locked ${lgL.date}, ran RED against the unchanged code first. logic.locked sha256 ${lgL.sha}`);
if (uiL) out.push(`* UI assertions (${uiIds.join(', ')}): locked ${uiL.date}, all UNBOUND before binding. UI lock sha256 ${uiL.sha}`);
// Never write the literal "ui.locked sha256" label: loop-ui-check.js --jira parses that label from the ticket's comments.
if (jiraCheck) out.push(`* Lock check against Jira: ${jiraCheck.replace(/ui\.locked sha256:?/g, 'UI lock sha256')}`);
if (verdict) out.push(`*Review verdict:* ${verdict}`);
if (changed.length) out.push(`*Change set:* ${changed.map((p) => '{{' + p.replace(/\\/g, '/') + '}}').join(', ')}`);
const text = out.join('\n') + '\n';
fs.writeFileSync(F('evidence.jira.txt'), text);
console.log(`EVIDENCE OK: ${totals}. Wrote ${F('evidence.jira.txt')}`);

// ---- post
if (post) {
  const jira = path.join(os.homedir(), '.claude', 'scripts', 'jira.js');
  const idsFile = F('jira-comments.txt');
  const existing = ((read(idsFile) || '').match(/^evidence:\s*(\d+)/m) || [])[1];
  let res;
  try {
    res = execFileSync(process.execPath, existing ? [jira, 'edit-comment', KEY, existing, F('evidence.jira.txt')] : [jira, 'comment', KEY, F('evidence.jira.txt')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // jira.js can crash on exit (libuv assertion on Windows) after printing its result: trust the result line.
    const all = String(e.stdout || '') + String(e.stderr || '');
    if (/Comment \d+ (added|on)/.test(all) && !/JIRA_AUTH_EXPIRED/.test(all)) res = all;
    else { console.error(`JIRA_UNREACHABLE: ${all.split('\n').find((l) => l.trim()) || e.message}`); process.exit(3); }
  }
  if (/JIRA_AUTH_EXPIRED/.test(res)) { console.error(res.trim()); process.exit(3); }
  if (!existing) {
    const id = (res.match(/Comment (\d+)/) || [])[1];
    if (id) fs.appendFileSync(idsFile, `evidence: ${id}\n`);
    console.log(`POSTED: evidence comment ${id || '(id not found in: ' + res.trim() + ')'} on ${KEY}`);
  } else console.log(`UPDATED: evidence comment ${existing} on ${KEY}`);
}
