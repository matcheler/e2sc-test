#!/usr/bin/env node
// Refresh ~/.jira-cookie by signing in through Entra SSO in a visible browser.
//
//   node ~/.claude/scripts/jira-login.js [--user you@e2open.onmicrosoft.com] [--playwright <dir containing node_modules/playwright>]
//
// - Only the username is needed: no password is asked for, read or stored. If Entra still shows a
//   password page, type it yourself in the browser window.
// - Username: --user, then JIRA_SSO_USER, then the value cached in ~/.jira-sso-user (username only, no secret).
// - If Entra asks for MFA (SMS/call) the script clicks "Text" and you type the code in the browser window;
//   an Authenticator push is approved on your phone.
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

async function verify(cookie) {
  const r = await fetch(`${JIRA}/rest/api/2/myself`, { headers: { Cookie: cookie, Accept: "application/json" }, redirect: "manual" });
  if (r.status !== 200) return null;
  return (await r.json()).name;
}

(async () => {
  let user = arg("--user") || process.env.JIRA_SSO_USER;
  if (!user) { try { user = fs.readFileSync(USER_FILE, "utf8").trim(); } catch {} }
  if (!user) return die("No username. Pass --user you@e2open.onmicrosoft.com (it is cached in ~/.jira-sso-user afterwards).");

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: false });
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const body = () => page.locator("body").innerText().catch(() => "");

    await page.goto(`${JIRA}/`, { waitUntil: "networkidle", timeout: 45000 });
    await page.fill("#i0116", user);
    await page.click("#idSIButton9");
    await page.waitForTimeout(4000);
    if (/couldn't find|doesn't exist/i.test(await body())) return die("Entra rejected the username. Stopped.");
    console.log("Finish any remaining sign-in step in the browser window (waiting up to 4 min)...");

    let smsClicked = false, pwNoted = false;
    const deadline = Date.now() + MFA_TIMEOUT_MS;
    while (Date.now() < deadline && !page.url().startsWith(new URL(JIRA).origin)) {
      const text = await body();
      if (!smsClicked && /verify your identity/i.test(text)) {
        const sms = page.getByText(/^Text \+/).first();
        if (await sms.count()) { await sms.click(); smsClicked = true; console.log("SMS sent - enter the code in the browser window."); }
      }
      if (!pwNoted && (await page.locator("#i0118").isVisible().catch(() => false))) {
        pwNoted = true; console.log("Entra is asking for a password - type it in the browser window.");
      }
      if (await page.locator("#idSIButton9").count() && /stay signed in/i.test(text)) await page.click("#idSIButton9");
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
