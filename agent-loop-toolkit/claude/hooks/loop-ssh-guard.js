// PreToolUse hook for Bash: SSH/SCP access to the loop's dev servers.
// - Server actions (reloads, populate, p2c, restarts) always ask the user, whichever agent runs them.
// - The loop subagents may run other ssh/scp commands against the loop hosts without a prompt.
//   The implementer may scp files anywhere (deploys); the others may upload into the inbox only.
// - The main session and any other agent get no decision here, so the normal permission flow applies.
const LOOP_AGENTS = ["ticket-intake", "test-author", "implementer", "reviewer"];
// The hosts are the ones in the Projects table of ~/.claude/loop/servers.md (short and full names).
const fs = require("fs");
const path = require("path");
function loopHosts() {
  let md = "";
  try { md = fs.readFileSync(path.join(require("os").homedir(), ".claude", "loop", "servers.md"), "utf8"); } catch { return []; }
  const start = md.indexOf("## Projects");
  if (start < 0) return [];
  const next = md.indexOf("\n## ", start + 1);
  const table = md.slice(start, next < 0 ? undefined : next);
  const short = new Set((table.match(/\b[a-z][a-z0-9-]*\d+(?=[.\s`'"),:|]|$)/gi) || []).filter((h) => /^dev\d+$/i.test(h)));
  const hosts = [];
  for (const h of short) hosts.push(h, `${h}.dev.e2open.com`);
  return hosts;
}
const HOSTS = loopHosts();
const SERVER_ACTION = /(reload_[a-z_]*\.sh|rcp_populate|p2c\.sh|\/e2open\/bin\/restart|\brestart\s+e2(sc|na)\b)/i;
const INBOX = "/e2open/var/shared/ssp/co/inbox/";

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  if (input.tool_name !== "Bash") process.exit(0);
  const cmd = String((input.tool_input || {}).command || "").trim();
  if (!/\b(ssh|scp)\b/.test(cmd) || HOSTS.length === 0) process.exit(0);

  // Host tokens: bare alias, user@host, "DOMAIN\\user@host", or host:path for scp.
  const hostRe = new RegExp(`(^|[\\s@"'])(${HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|")})(?=$|[\\s:"'])`);
  if (!hostRe.test(cmd)) process.exit(0);

  if (SERVER_ACTION.test(cmd)) {
    decide("ask", "Server action on a shared dev server (reload, populate, p2c or restart): the user must approve it.");
  }

  if (!LOOP_AGENTS.includes(input.agent_type)) process.exit(0);

  // Only a single ssh/scp invocation. Outside the quoted remote command, the only local extras allowed
  // are stderr redirects and pipes into plain text filters (e.g. to strip the login banner).
  if (!/^(ssh|scp)\s/.test(cmd)) process.exit(0);
  const unquoted = cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "Q");
  if (/["']/.test(unquoted)) process.exit(0); // unbalanced quotes
  const [main, ...filters] = unquoted.replace(/\s2>(&1|\/dev\/null)/g, "").split("|");
  if (/[;&`$<>]/.test(main)) process.exit(0);
  if (!filters.every((f) => /^\s*(grep|head|tail|sort|uniq|wc|cut)(\s[^;&`$<>]*)?$/.test(f))) process.exit(0);

  if (cmd.startsWith("scp ") && input.agent_type !== "implementer") {
    // Only the implementer deploys files. For the other agents, uploads must target the inbox;
    // downloads (remote source, local destination) are fine.
    const args = cmd.split(/\s+/);
    const dest = args[args.length - 1];
    const remoteDest = hostRe.test(" " + dest.replace(/:.*/, ""));
    if (remoteDest && !dest.includes(INBOX)) process.exit(0);
  }

  decide("allow", `${input.agent_type}: ssh/scp to a loop dev server.`);
});
