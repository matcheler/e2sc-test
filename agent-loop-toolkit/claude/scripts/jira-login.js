#!/usr/bin/env node
// Refresh ~/.jira-cookie by signing in through Entra SSO in a visible browser.
//
//   node ~/.claude/scripts/jira-login.js [--user you@e2open.onmicrosoft.com] [--playwright <dir containing node_modules/playwright>]
//
// - The password is prompted for (hidden) or read from JIRA_SSO_PASSWORD. It is never written to disk or printed.
// - Username: --user, then JIRA_SSO_USER, then the value cached in ~/.jira-sso-user (username only, no secret).
// - Entra asks for MFA (SMS/call): the script clicks "Text" and you type the code in the browser window.
// - The new cookie is tested against the Jira REST API before it replaces ~/.jira-cookie (old one kept as .bak).
const fs = require("fs"), os = require("os"), path = require("path");

const JIRA = process.env.JIRA_BASE || "https://jira.dev.e2open.com/jira"; // same variable as jira.js
const COOKIE_FILE = process.env.JIRA_COOKIE_FILE || path.join(os.homedir(), ".jira-cookie");
const USER_FILE = path.join(os.homedir(), ".jira-sso-user");
const MFA_TIMEOUT_MS = 4 * 60 * 1000;

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const die = (m) => { console.error(m); process.exit(1); };

function loadPlaywright() {
  const candidates = [arg("--playwright"), process.env.PLAYWRIGHT_ROOT, process.cwd(), path.join(process.cwd(), "e2sc-ui_tests")].filter(Boolean);
  for (const dir of candidates) {
    try { return require(require.resolve("playwright", { paths: [dir] })); } catch {}
  }
  return die("Cannot find the 'playwright' package. Run from a project containing e2sc-ui_tests/node_modules, or pass --playwright <dir>.");
}

function promptHidden(q) {
  return new Promise((resolve) => {
    process.stdout.write(q);
    const stdin = process.stdin;
    let s = "";
    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume(); stdin.setEncoding("utf8");
    const onData = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n" || c === "\u0004") { stdin.setRawMode && stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n"); return resolve(s); }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f" || c === "\b") s = s.slice(0, -1); else s += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function verify(cookie) {
  const r = await fetch(`${JIRA}/rest/api/2/myself`, { headers: { Cookie: cookie, Accept: "application/json" }, redirect: "manual" });
  if (r.status !== 200) return null;
  return (await r.json()).name;
}

(async () => {
  let user = arg("--user") || process.env.JIRA_SSO_USER;
  if (!user) { try { user = fs.readFileSync(USER_FILE, "utf8").trim(); } catch {} }
  if (!user) return die("No username. Pass --user you@e2open.onmicrosoft.com (it is cached in ~/.jira-sso-user afterwards).");
  const pass = process.env.JIRA_SSO_PASSWORD || (await promptHidden(`SSO password for ${user}: `));
  if (!pass) return die("No password given.");

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: false });
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const body = () => page.locator("body").innerText().catch(() => "");

    await page.goto(`${JIRA}/`, { waitUntil: "networkidle", timeout: 45000 });
    await page.fill("#i0116", user);
    await page.click("#idSIButton9");
    await page.waitForSelector("#i0118", { timeout: 20000 });
    await page.fill("#i0118", pass);
    await page.click("#idSIButton9");
    await page.waitForTimeout(4000);

    if (/verify your identity/i.test(await body())) {
      await page.getByText(/^Text \+/).first().click();
      console.log("SMS sent - enter the code in the browser window (waiting up to 4 min)...");
    } else if (/incorrect|doesn't match|couldn't find/i.test(await body())) {
      return die("Entra rejected the username or password. Stopped (no retry, to avoid lockout).");
    }

    const deadline = Date.now() + MFA_TIMEOUT_MS;
    while (Date.now() < deadline && !page.url().startsWith(new URL(JIRA).origin)) {
      if (await page.locator("#idSIButton9").count() && /stay signed in/i.test(await body())) await page.click("#idSIButton9");
      await page.waitForTimeout(1500);
    }
    if (!page.url().startsWith(new URL(JIRA).origin)) return die("Timed out before reaching Jira. Cookie not changed.");
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    const cookie = (await ctx.cookies()).filter((c) => c.domain.includes("e2open.com")).map((c) => `${c.name}=${c.value}`).join("; ");
    const who = await verify(cookie);
    if (!who) return die("Signed in, but the cookie failed the Jira REST check. Cookie not changed.");

    if (fs.existsSync(COOKIE_FILE)) fs.copyFileSync(COOKIE_FILE, COOKIE_FILE + ".bak");
    fs.writeFileSync(COOKIE_FILE, cookie);
    fs.writeFileSync(USER_FILE, user);
    console.log(`OK: ${COOKIE_FILE} updated; authenticated to Jira as '${who}'.`);
  } finally {
    await browser.close();
  }
})().catch((e) => die("ERR " + e.message.split("\n")[0]));
