#!/usr/bin/env node
// Minimal Jira (Server/DC behind E2open SSO) client for the agent loop.
// Auth: browser session cookie in %USERPROFILE%\.jira-cookie. Refresh it with `node ~/.claude/scripts/jira-login.js`
// (Entra sign-in in a visible browser) or copy the Cookie request header from DevTools.
//
// Usage:
//   node jira.js get <KEY> [outDir]        print ticket (summary, description, comments, links); download attachments to outDir
//   node jira.js comment <KEY> <file|->    add a comment (wiki markup) from a file, or stdin with "-"
//   node jira.js edit-comment <KEY> <id> <file|->   replace the body of an existing comment
//   node jira.js transitions <KEY>         list the transitions available now
//   node jira.js transition <KEY> "<To Status>"   move the ticket to that status (e.g. "Fix Required", "Unit Test")
//   node jira.js meta <PROJECT>            list the project's issue types and their required fields (run before create)
//   node jira.js create <PROJECT> <spec.json|-> [--dry]   create an issue; prints its key. --dry (last argument) prints the payload and creates nothing.
//       spec: {"summary","description","issuetype"(default "Task"),"parent"(KEY, for sub-tasks),"priority","labels":[],"components":[],"fields":{raw extra fields, e.g. a custom Epic Link}}
//   node jira.js link <KEY> <OTHER-KEY> [type]   link two issues (default type "Relates"; KEY is the inward side, OTHER-KEY the outward)
const fs = require("fs");
const path = require("path");
const os = require("os");

const BASE = process.env.JIRA_BASE || "https://jira.dev.e2open.com/jira";
const COOKIE_FILE = process.env.JIRA_COOKIE_FILE || path.join(os.homedir(), ".jira-cookie");

function die(msg, code = 1) { process.stderr.write(msg + "\n"); process.exit(code); }

let cookie;
try { cookie = fs.readFileSync(COOKIE_FILE, "utf8").trim(); } catch { die(`No Jira cookie at ${COOKIE_FILE}. Run \`node ~/.claude/scripts/jira-login.js\` (password + SMS code in a browser window), or copy the Cookie request header from DevTools and run: Get-Clipboard | Set-Content -NoNewline "$HOME\\.jira-cookie"`); }

async function call(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : BASE + url, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookie,
      Accept: "application/json",
      "X-Atlassian-Token": "no-check",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 302 || res.status === 401 || (res.headers.get("content-type") || "").includes("text/html")) {
    die("JIRA_AUTH_EXPIRED: the SSO session cookie is no longer valid. Ask the user to refresh ~/.jira-cookie: run `node ~/.claude/scripts/jira-login.js` (password + SMS code in a browser window), or copy the Cookie header from DevTools.", 3);
  }
  if (!res.ok) die(`Jira ${method} ${url} failed: HTTP ${res.status}\n${(await res.text()).slice(0, 1000)}`);
  return res;
}
const json = async (m, u, b) => { const r = await call(m, u, b); return r.status === 204 ? null : r.json(); };
const n = (x) => (x && (x.displayName || x.name || x.value)) || "-";

const [cmd, key, arg] = process.argv.slice(2);
if (!cmd || !key) die("usage: jira.js get|comment|edit-comment|transitions|transition|meta|create|link <KEY|PROJECT> [arg]");

(async () => {
  if (cmd === "get") {
    const j = await json("GET", `/rest/api/2/issue/${key}?fields=summary,status,issuetype,priority,assignee,reporter,created,updated,description,comment,attachment,labels,components,fixVersions,issuelinks,subtasks,parent`);
    const f = j.fields;
    const out = [];
    out.push(`KEY: ${j.key}`, `SUMMARY: ${f.summary}`, `TYPE: ${n(f.issuetype)} | STATUS: ${n(f.status)} | PRIORITY: ${n(f.priority)}`);
    out.push(`ASSIGNEE: ${n(f.assignee)} | REPORTER: ${n(f.reporter)}`, `FIX VERSIONS: ${(f.fixVersions || []).map(n).join(", ")}`);
    if (f.parent) out.push(`PARENT: ${f.parent.key} ${f.parent.fields?.summary || ""}`);
    for (const l of f.issuelinks || []) { const o = l.outwardIssue || l.inwardIssue; out.push(`LINK: ${l.outwardIssue ? l.type.outward : l.type.inward} ${o.key} ${o.fields.summary} [${n(o.fields.status)}]`); }
    for (const t of f.subtasks || []) out.push(`SUBTASK: ${t.key} ${t.fields.summary} [${n(t.fields.status)}]`);
    out.push("", "--- DESCRIPTION ---", f.description || "(none)");
    const comments = f.comment?.comments || [];
    out.push("", `--- COMMENTS (${comments.length}) ---`);
    for (const c of comments) out.push("", `[${c.created}] ${n(c.author)}:`, c.body);
    const atts = f.attachment || [];
    if (atts.length) {
      out.push("", "--- ATTACHMENTS ---");
      const dir = arg || null;
      if (dir) fs.mkdirSync(dir, { recursive: true });
      for (const a of atts) {
        let where = a.content;
        if (dir) {
          const r = await call("GET", a.content);
          where = path.join(dir, a.filename);
          fs.writeFileSync(where, Buffer.from(await r.arrayBuffer()));
        }
        out.push(`${a.filename} (${a.size} bytes) -> ${where}`);
      }
    }
    console.log(out.join("\n"));
  } else if (cmd === "comment") {
    if (!arg) die("usage: jira.js comment <KEY> <file|->");
    const body = arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(arg, "utf8");
    const r = await json("POST", `/rest/api/2/issue/${key}/comment`, { body });
    console.log(`Comment ${r.id} added to ${key}`);
  } else if (cmd === "edit-comment") {
    const [, , , , id, file] = process.argv;
    if (!id || !file) die("usage: jira.js edit-comment <KEY> <commentId> <file|->");
    const body = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8");
    const r = await json("PUT", `/rest/api/2/issue/${key}/comment/${id}`, { body });
    console.log(`Comment ${r.id} on ${key} updated`);
  } else if (cmd === "transitions") {
    const r = await json("GET", `/rest/api/2/issue/${key}/transitions`);
    for (const t of r.transitions) console.log(`${t.name} -> ${t.to.name}`);
  } else if (cmd === "transition") {
    if (!arg) die('usage: jira.js transition <KEY> "<To Status>"');
    const r = await json("GET", `/rest/api/2/issue/${key}/transitions`);
    const want = arg.toLowerCase();
    const t = r.transitions.find((x) => x.to.name.toLowerCase() === want || x.name.toLowerCase() === want);
    if (!t) die(`No transition to "${arg}" from the current status. Available: ${r.transitions.map((x) => `${x.name} -> ${x.to.name}`).join("; ")}`);
    await json("POST", `/rest/api/2/issue/${key}/transitions`, { transition: { id: t.id } });
    console.log(`${key}: ${t.name} -> ${t.to.name}`);
  } else if (cmd === "meta") {
    const r = await json("GET", `/rest/api/2/issue/createmeta?projectKeys=${encodeURIComponent(key)}&expand=projects.issuetypes.fields`);
    const p = (r.projects || [])[0];
    if (!p) die(`No create access to project ${key}, or it does not exist.`);
    for (const t of p.issuetypes) {
      const req = Object.entries(t.fields || {}).filter(([, v]) => v.required).map(([k, v]) => `${k} (${v.name})`);
      console.log(`${t.name}${t.subtask ? " [sub-task]" : ""}: required = ${req.join(", ") || "-"}`);
    }
  } else if (cmd === "create") {
    if (!arg) die("usage: jira.js create <PROJECT> <spec.json|-> [--dry]");
    const spec = JSON.parse(arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(arg, "utf8"));
    if (!spec.summary) die("spec needs a summary");
    const fields = { project: { key }, summary: spec.summary, issuetype: { name: spec.issuetype || "Task" } };
    if (spec.description) fields.description = spec.description;
    if (spec.priority) fields.priority = { name: spec.priority };
    if (spec.labels) fields.labels = spec.labels;
    if (spec.components) fields.components = spec.components.map((name) => ({ name }));
    if (spec.parent) fields.parent = { key: spec.parent };
    Object.assign(fields, spec.fields || {});
    if (process.argv.includes("--dry")) { console.log(JSON.stringify({ fields }, null, 2)); return; }
    const r = await json("POST", "/rest/api/2/issue", { fields });
    console.log(r.key);
  } else if (cmd === "link") {
    const other = process.argv[4], type = process.argv[5] || "Relates";
    if (!other) die("usage: jira.js link <KEY> <OTHER-KEY> [type]");
    await json("POST", "/rest/api/2/issueLink", { type: { name: type }, inwardIssue: { key }, outwardIssue: { key: other } });
    console.log(`${key} ${type} ${other}`);
  } else die(`unknown command ${cmd}`);
})().catch((e) => die(String(e)));
