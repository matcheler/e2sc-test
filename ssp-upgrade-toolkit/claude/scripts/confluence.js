#!/usr/bin/env node
// Minimal read-only Confluence (Server/DC behind E2open SSO) client for the SSP upgrade kit.
// Auth: browser session cookie in %USERPROFILE%\.confluence-cookie (override with CONFLUENCE_COOKIE_FILE).
// It only reads pages. It never creates, edits or deletes anything.
//
// Usage:
//   node confluence.js get <page>              print the page as text (tables as "cell | cell" rows)
//   node confluence.js details <page>          print the "Release details" style table as "Label: value" lines
//   node confluence.js children <page>         list the child pages (id, title, url)
//   node confluence.js find "<text>" [space]   find pages whose title contains the text (default space: RelMGMT)
//   <page> is a page id, a viewpage.action?pageId=... URL, a /display/SPACE/Title+With+Plus URL, or SPACE:Title
const fs = require("fs");
const path = require("path");
const os = require("os");

const BASE = (process.env.CONFLUENCE_BASE || "https://confluence.dev.e2open.com").replace(/\/$/, "");
const COOKIE_FILE = process.env.CONFLUENCE_COOKIE_FILE || path.join(os.homedir(), ".confluence-cookie");

function die(msg, code = 1) { process.stderr.write(msg + "\n"); process.exit(code); }

// ---- pure helpers (also used by the offline self-test) -------------------------------------------------
function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
}
function cellText(html) {
  let t = html.replace(/<time\b[^>]*\bdatetime="([^"]+)"[^>]*\/?>(\s*<\/time>)?/gi, " $1 ");
  t = t.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|li|div)>/gi, " ").replace(/<[^>]+>/g, " ");
  return decode(t).replace(/\s+/g, " ").trim();
}
function tableRows(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = [];
    const cRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = cRe.exec(m[1]))) cells.push(cellText(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}
function toText(html) {
  let t = html;
  t = t.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, row) => {
    const cells = [];
    const cRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while ((c = cRe.exec(row))) cells.push(cellText(c[1]));
    return "\n" + cells.join(" | ") + "\n";
  });
  t = t.replace(/<time\b[^>]*\bdatetime="([^"]+)"[^>]*\/?>(\s*<\/time>)?/gi, " $1 ");
  t = t.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, h) => "\n\n" + "#".repeat(+n) + " " + cellText(h) + "\n");
  t = t.replace(/<li\b[^>]*>/gi, "\n- ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|ul|ol)>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  return decode(t).replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function detailRows(html) {
  // key: value lines for two-or-more-cell rows whose first cell looks like a label
  return tableRows(html).filter((r) => r.length >= 2 && r[0]).map((r) => `${r[0].replace(/\s*\(Mandatory\)/i, " (Mandatory)")}: ${r.slice(1).join(" | ")}`);
}
module.exports = { toText, detailRows, tableRows, cellText };

if (require.main !== module) return;

// ---- network ---------------------------------------------------------------------------------------------
let cookie;
try { cookie = fs.readFileSync(COOKIE_FILE, "utf8").trim(); } catch { die(`No Confluence cookie at ${COOKIE_FILE}. Copy the Cookie request header from a signed-in browser session (DevTools, Network) into that file, or set CONFLUENCE_COOKIE_FILE.`); }

async function api(url) {
  const res = await fetch(url.startsWith("http") ? url : BASE + url, {
    method: "GET", redirect: "manual", headers: { Cookie: cookie, Accept: "application/json" },
  });
  if (res.status === 302 || res.status === 401 || (res.headers.get("content-type") || "").includes("text/html")) {
    die(`CONFLUENCE_AUTH_EXPIRED: the SSO session cookie is no longer valid. Ask the user to refresh ${COOKIE_FILE}.`);
  }
  if (!res.ok) die(`Confluence GET ${url} failed: HTTP ${res.status}\n${(await res.text()).slice(0, 500)}`);
  return res.json();
}

async function resolve(ref) {
  if (/^\d+$/.test(ref)) return ref;
  let m = ref.match(/pageId=(\d+)/);
  if (m) return m[1];
  let space, title;
  m = ref.match(/\/display\/([^/]+)\/([^?#]+)/);
  if (m) { space = decodeURIComponent(m[1]); title = decodeURIComponent(m[2].replace(/\+/g, " ")); }
  else if ((m = ref.match(/^([A-Za-z0-9_~-]+):(.+)$/))) { space = m[1]; title = m[2]; }
  else die(`Can't tell which page "${ref}" is. Use a page id, a pageId URL, a /display/SPACE/Title URL, or SPACE:Title.`);
  const r = await api(`/rest/api/content?spaceKey=${encodeURIComponent(space)}&title=${encodeURIComponent(title)}&limit=2`);
  if (!r.results || r.results.length === 0) die(`No page titled "${title}" in space ${space}.`);
  return r.results[0].id;
}
const link = (p) => `${BASE}${(p._links && p._links.webui) || "/pages/viewpage.action?pageId=" + p.id}`;
async function body(id) {
  return api(`/rest/api/content/${id}?expand=body.storage,version`);
}

(async () => {
  const [cmd, a1, a2] = process.argv.slice(2);
  if (!cmd || !a1) die('usage: confluence.js get|details|children <page>  |  find "<text>" [space]');
  if (cmd === "find") {
    const space = a2 || "RelMGMT";
    const cql = `type = page AND space = "${space}" AND title ~ "${a1.replace(/"/g, "")}"`;
    const r = await api(`/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=25`);
    if (!r.results || !r.results.length) { console.log("(no matching pages)"); return; }
    for (const p of r.results) console.log(`${p.id}\t${p.title}\t${link(p)}`);
  } else if (cmd === "children") {
    const id = await resolve(a1);
    const r = await api(`/rest/api/content/${id}/child/page?limit=100`);
    if (!r.results || !r.results.length) { console.log("(no child pages)"); return; }
    for (const p of r.results) console.log(`${p.id}\t${p.title}\t${link(p)}`);
  } else if (cmd === "get" || cmd === "details") {
    const id = await resolve(a1);
    const p = await body(id);
    const html = (p.body && p.body.storage && p.body.storage.value) || "";
    if (cmd === "get") {
      console.log(`TITLE: ${p.title}\nURL: ${link(p)}\nVERSION: ${p.version && p.version.number}\n\n${toText(html)}`);
    } else {
      console.log(`TITLE: ${p.title}\nURL: ${link(p)}\n`);
      const rows = detailRows(html);
      console.log(rows.length ? rows.join("\n") : "(no details table found)");
    }
  } else {
    die(`Unknown command "${cmd}". Use get, details, children or find.`);
  }
})().catch((e) => die(String(e && e.message || e)));
