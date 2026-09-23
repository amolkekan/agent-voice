const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  detectHosts,
  mergeJsonServers,
  upsertCodexToml,
  applySetup,
  manualRouteText,
} = require("../setup.js");

function tmpHome() {
  const root = path.join(__dirname, "..", ".tmp-home-tests");
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, "h-"));
}

function noApps(home) {
  const applications = path.join(home, "Applications");
  fs.mkdirSync(applications, { recursive: true });
  return applications;
}

test("detects only hosts that look installed", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".cursor"));
  const found = detectHosts(home, {
    pathEnv: "/no/such/bin",
    applications: noApps(home),
  });
  assert.deepEqual(found.map((h) => h.id).sort(), ["cursor"]);
});

test("detects Claude, ChatGPT/Codex, and Gemini from dirs", () => {
  const home = tmpHome();
  const applications = noApps(home);
  fs.writeFileSync(path.join(home, ".claude.json"), "{}");
  fs.mkdirSync(path.join(home, "Library", "Application Support", "Claude"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(home, "Library", "Application Support", "ChatGPT"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(home, ".gemini"));
  const found = detectHosts(home, { pathEnv: "/no/such/bin", applications });
  assert.deepEqual(found.map((h) => h.id).sort(), [
    "claude-code",
    "claude-desktop",
    "gemini",
    "openai",
  ]);
});

test("ChatGPT.app and Codex share one OpenAI config.toml", () => {
  const home = tmpHome();
  const applications = noApps(home);
  fs.mkdirSync(path.join(applications, "ChatGPT.app"));
  fs.mkdirSync(path.join(home, ".codex"));
  const found = detectHosts(home, { pathEnv: "/no/such/bin", applications });
  const openai = found.filter((h) => h.id === "openai");
  assert.equal(openai.length, 1);
  assert.match(openai[0].label, /ChatGPT/);
  assert.match(openai[0].label, /Codex/);
  assert.equal(openai[0].file, path.join(home, ".codex", "config.toml"));
});

test("mergeJsonServers updates agent-voice and keeps other servers", () => {
  const out = mergeJsonServers(
    { mcpServers: { jira: { command: "uvx" }, "agent-voice": { command: "old", env: { SAY_VOICE: "Rishi" } } } },
    "agent-voice",
    { command: "node", args: ["/repo/agent-voice.js"] }
  );
  assert.equal(out.mcpServers.jira.command, "uvx");
  assert.equal(out.mcpServers["agent-voice"].command, "node");
  assert.equal(out.mcpServers["agent-voice"].args[0], "/repo/agent-voice.js");
  assert.equal(out.mcpServers["agent-voice"].env.SAY_VOICE, "Rishi");
});

test("mergeJsonServers can use VS Code servers key", () => {
  const out = mergeJsonServers(
    { servers: { other: { command: "npx" } } },
    "agent-voice",
    { command: "node", args: ["/repo/agent-voice.js"] },
    "servers"
  );
  assert.equal(out.servers.other.command, "npx");
  assert.equal(out.servers["agent-voice"].command, "node");
  assert.ok(!out.mcpServers);
});

test("upsertCodexToml inserts and later updates the same table", () => {
  let toml = 'model = "gpt-5"\n';
  toml = upsertCodexToml(toml, "agent-voice", "node", ["/repo/agent-voice.js"]);
  assert.match(toml, /model = "gpt-5"/);
  assert.match(toml, /\[mcp_servers\.agent-voice\]/);
  toml = upsertCodexToml(toml, "agent-voice", "node", ["/other/agent-voice.js"]);
  assert.equal((toml.match(/\[mcp_servers\.agent-voice\]/g) || []).length, 1);
  assert.match(toml, /\/other\/agent-voice\.js/);
});

test("applySetup writes Cursor and Claude Code configs and is idempotent", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".cursor"));
  fs.writeFileSync(
    path.join(home, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { jira: { command: "uvx" } } })
  );
  fs.writeFileSync(
    path.join(home, ".claude.json"),
    JSON.stringify({ userID: "x", projects: {} })
  );
  const serverJs = path.join(home, "agent-voice.js");
  const r1 = applySetup({
    home,
    serverPath: serverJs,
    nodePath: "/usr/bin/node",
    pathEnv: "/no/such/bin",
    applications: noApps(home),
  });
  assert.ok(r1.updated.includes("cursor"));
  assert.ok(r1.updated.includes("claude-code"));
  const cursor = JSON.parse(
    fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8")
  );
  assert.equal(cursor.mcpServers.jira.command, "uvx");
  assert.equal(cursor.mcpServers["agent-voice"].args[0], serverJs);
  const claude = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
  assert.equal(claude.userID, "x");
  assert.equal(claude.mcpServers["agent-voice"].args[0], serverJs);
  assert.ok(fs.existsSync(path.join(home, ".cursor", "mcp.json.bak")));

  const r2 = applySetup({
    home,
    serverPath: serverJs,
    nodePath: "/usr/bin/node",
    pathEnv: "/no/such/bin",
    applications: noApps(home),
  });
  assert.ok(r2.updated.includes("cursor"));
  const cursor2 = JSON.parse(
    fs.readFileSync(path.join(home, ".cursor", "mcp.json"), "utf8")
  );
  assert.equal(Object.keys(cursor2.mcpServers).filter((k) => k === "agent-voice").length, 1);
});

test("applySetup keeps going if one host path cannot be written", () => {
  const home = tmpHome();
  const applications = noApps(home);
  fs.mkdirSync(path.join(home, ".cursor"));
  fs.mkdirSync(path.join(home, ".cursor", "mcp.json"));
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ userID: "x" }));
  const r = applySetup({
    home,
    serverPath: path.join(home, "agent-voice.js"),
    nodePath: "/usr/bin/node",
    pathEnv: "/no/such/bin",
    applications,
  });
  assert.ok(r.failed.some((f) => f.id === "cursor"));
  assert.ok(r.updated.includes("claude-code"));
});

test("manualRouteText tells the user to use the manual route", () => {
  const text = manualRouteText({
    serverPath: "/repo/agent-voice.js",
    nodePath: "/usr/bin/node",
    reason: "could not write ~/.cursor/mcp.json",
  });
  assert.match(text, /setup\.js failed, but you can try the manual route/);
  assert.match(text, /could not write/);
  assert.match(text, /pwd/);
  assert.match(text, /agent-voice/);
  assert.match(text, /voice on/);
});
