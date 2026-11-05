#!/usr/bin/env node
// Attach one file to an existing Jira issue (Server/DC behind E2open SSO), for the SSP upgrade kit.
// Auth: the same browser session cookie as jira.js, in %USERPROFILE%\.jira-cookie (override with JIRA_COOKIE_FILE).
// It only adds an attachment. It never creates, edits, transitions or deletes anything.
//
// Usage:
//   node jira-attach.js <KEY> <file> [name]   upload <file> to <KEY>, optionally under another file name; prints the attachment id
// Exit codes: 0 ok, 1 error, 3 JIRA_AUTH_EXPIRED (refresh ~/.jira-cookie)
const fs = require("fs");
const path = require("path");
const os = require("os");

const BASE = process.env.JIRA_BASE || "https://jira.dev.e2open.com/jira";
const COOKIE_FILE = process.env.JIRA_COOKIE_FILE || path.join(os.homedir(), ".jira-cookie");

function die(msg, code = 1) { process.stderr.write(msg + "\n"); process.exit(code); }

const [key, file, name] = process.argv.slice(2);
if (!key || !file) die("usage: jira-attach.js <KEY> <file> [name]");
if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) die(`Not a Jira key: ${key}`);
if (!fs.existsSync(file) || !fs.statSync(file).isFile()) die(`No such file: ${file}`);

let cookie;
try { cookie = fs.readFileSync(COOKIE_FILE, "utf8").trim(); } catch { die(`No Jira cookie at ${COOKIE_FILE}. Run \`node ~/.claude/scripts/jira-login.js\`, or copy the Cookie request header from DevTools into that file.`); }

const MIME = { ".html": "text/html", ".htm": "text/html", ".md": "text/markdown", ".txt": "text/plain", ".json": "application/json", ".png": "image/png", ".pdf": "application/pdf" };

(async () => {
  const fileName = name || path.basename(file);
  const type = MIME[path.extname(fileName).toLowerCase()] || "application/octet-stream";
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(file)], { type }), fileName);
  const res = await fetch(`${BASE}/rest/api/2/issue/${key}/attachments`, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: cookie, Accept: "application/json", "X-Atlassian-Token": "no-check" },
    body: form,
  });
  if (res.status === 302 || res.status === 401 || (res.headers.get("content-type") || "").includes("text/html")) {
    die("JIRA_AUTH_EXPIRED: the SSO session cookie is no longer valid. Ask the user to refresh ~/.jira-cookie: run `node ~/.claude/scripts/jira-login.js`, or copy the Cookie header from DevTools.", 3);
  }
  if (!res.ok) die(`Jira attach to ${key} failed: HTTP ${res.status}\n${(await res.text()).slice(0, 1000)}`);
  const list = await res.json();
  for (const a of list) console.log(`Attachment ${a.id} (${a.filename}, ${a.size} bytes) added to ${key}`);
})().catch((e) => die(`Jira attach failed: ${e.message}`));
