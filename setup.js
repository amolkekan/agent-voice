#!/usr/bin/env node
// Detect installed MCP hosts and merge the agent-voice server into each config.
// Does not replace whole files. Backs up before write. Safe to run twice.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SERVER_NAME = "agent-voice";

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function onPath(bin, pathEnv) {
  const dirs = String(pathEnv || "").split(path.delimiter).filter(Boolean);
  return dirs.some((dir) => exists(path.join(dir, bin)));
}

function supportDir(home, app) {
  return path.join(home, "Library", "Application Support", app);
}

function appInstalled(applications, name) {
  return exists(path.join(applications, name));
}

function detectHosts(home, { pathEnv, applications = "/Applications" } = {}) {
  const found = [];
  if (exists(path.join(home, ".cursor")) || onPath("cursor", pathEnv)) {
    found.push({
      id: "cursor",
      label: "Cursor",
      kind: "json-mcpServers",
      file: path.join(home, ".cursor", "mcp.json"),
    });
  }
  if (
    exists(path.join(home, ".claude.json")) ||
    exists(path.join(home, ".claude")) ||
    onPath("claude", pathEnv)
  ) {
    found.push({
      id: "claude-code",
      label: "Claude Code",
      kind: "json-mcpServers",
      file: path.join(home, ".claude.json"),
    });
  }
  if (exists(supportDir(home, "Claude"))) {
    found.push({
      id: "claude-desktop",
      label: "Claude Desktop",
      kind: "json-mcpServers",
      file: path.join(supportDir(home, "Claude"), "claude_desktop_config.json"),
    });
  }

  const chatgpt =
    exists(supportDir(home, "ChatGPT")) ||
    appInstalled(applications, "ChatGPT.app");
  const codex = exists(path.join(home, ".codex")) || onPath("codex", pathEnv);
  if (chatgpt || codex) {
    const bits = [];
    if (chatgpt) bits.push("ChatGPT");
    if (codex) bits.push("Codex");
    found.push({
      id: "openai",
      label: bits.join(" / ") + " (OpenAI)",
      kind: "codex-toml",
      file: path.join(home, ".codex", "config.toml"),
    });
  }

  if (exists(path.join(home, ".gemini")) || onPath("gemini", pathEnv)) {
    found.push({
      id: "gemini",
      label: "Gemini CLI",
      kind: "json-mcpServers",
      file: path.join(home, ".gemini", "settings.json"),
    });
  }

  if (
    exists(supportDir(home, "Code")) ||
    appInstalled(applications, "Visual Studio Code.app") ||
    onPath("code", pathEnv)
  ) {
    found.push({
      id: "vscode",
      label: "VS Code / Copilot",
      kind: "json-servers",
      file: path.join(supportDir(home, "Code"), "User", "mcp.json"),
    });
  }
  if (
    exists(supportDir(home, "Code - Insiders")) ||
    appInstalled(applications, "Visual Studio Code - Insiders.app")
  ) {
    found.push({
      id: "vscode-insiders",
      label: "VS Code Insiders",
      kind: "json-servers",
      file: path.join(supportDir(home, "Code - Insiders"), "User", "mcp.json"),
    });
  }

  if (
    exists(path.join(home, ".codeium", "windsurf")) ||
    exists(path.join(home, ".windsurf")) ||
    appInstalled(applications, "Windsurf.app")
  ) {
    const windsurfFile = exists(path.join(home, ".windsurf"))
      ? path.join(home, ".windsurf", "mcp.json")
      : path.join(home, ".codeium", "windsurf", "mcp_config.json");
    found.push({
      id: "windsurf",
      label: "Windsurf",
      kind: "json-mcpServers",
      file: windsurfFile,
    });
  }

  return found;
}

function mergeJsonServers(doc, name, entry, serversKey = "mcpServers") {
  const out = doc && typeof doc === "object" ? { ...doc } : {};
  const servers =
    out[serversKey] && typeof out[serversKey] === "object"
      ? { ...out[serversKey] }
      : {};
  const prev = servers[name] && typeof servers[name] === "object" ? servers[name] : {};
  servers[name] = { ...prev, command: entry.command, args: entry.args };
  out[serversKey] = servers;
  return out;
}

function upsertCodexToml(text, name, command, args) {
  const src = text || "";
  const header = `[mcp_servers.${name}]`;
  const block = `${header}\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\n`;
  const re = new RegExp(
    `^\\[mcp_servers\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?(?=^\\[|\\s*$)`,
    "m"
  );
  if (re.test(src)) return src.replace(re, block).replace(/\n+$/, "\n");
  const trimmed = src.replace(/\s*$/, "");
  return (trimmed ? trimmed + "\n\n" : "") + block;
}

function backup(file) {
  if (!exists(file)) return;
  fs.copyFileSync(file, file + ".bak");
}

function readJson(file) {
  if (!exists(file)) return {};
  const raw = fs.readFileSync(file, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  backup(file);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

function applyHost(host, entry) {
  if (host.kind === "json-mcpServers" || host.kind === "json-servers") {
    const key = host.kind === "json-servers" ? "servers" : "mcpServers";
    const next = mergeJsonServers(readJson(host.file), SERVER_NAME, entry, key);
    writeJson(host.file, next);
    return;
  }
  if (host.kind === "codex-toml") {
    const prev = exists(host.file) ? fs.readFileSync(host.file, "utf8") : "";
    fs.mkdirSync(path.dirname(host.file), { recursive: true });
    backup(host.file);
    fs.writeFileSync(
      host.file,
      upsertCodexToml(prev, SERVER_NAME, entry.command, entry.args)
    );
  }
}

function applySetup({
  home,
  serverPath,
  nodePath,
  pathEnv = process.env.PATH,
  applications = "/Applications",
} = {}) {
  const hosts = detectHosts(home, { pathEnv, applications });
  const entry = { command: nodePath, args: [serverPath] };
  const updated = [];
  const failed = [];
  for (const host of hosts) {
    try {
      applyHost(host, entry);
      updated.push(host.id);
    } catch (e) {
      failed.push({
        id: host.id,
        label: host.label,
        file: host.file,
        error: e.message || String(e),
      });
    }
  }
  return { hosts, updated, failed, entry };
}

function manualRouteText({ serverPath, nodePath, reason }) {
  const lines = [
    "",
    "setup.js failed, but you can try the manual route.",
    reason ? `Reason: ${reason}` : "",
    "",
    "Manual steps:",
    "1. In Terminal, go to the Agent Voice folder and copy the path:",
    "     pwd",
    `   This install's server file is: ${serverPath}`,
    "2. Open your chat app's MCP / developer settings. Do not replace the whole config file.",
    "   Merge only this server (keep every other server you already have):",
    "",
    "     \"agent-voice\": {",
    `       \"command\": ${JSON.stringify(nodePath)},`,
    `       \"args\": [${JSON.stringify(serverPath)}]`,
    "     }",
    "",
    "   If the UI has Add MCP server: name agent-voice, command is node (or the path above),",
    "   args is the agent-voice.js path.",
    "3. Typical config files (yours may differ if the app was installed elsewhere):",
    "     Cursor              ~/.cursor/mcp.json",
    "     Claude Code         ~/.claude.json",
    "     Claude Desktop      ~/Library/Application Support/Claude/claude_desktop_config.json",
    "     ChatGPT / Codex     ~/.codex/config.toml   (TOML: [mcp_servers.agent-voice])",
    "     Gemini CLI          ~/.gemini/settings.json",
    "     VS Code / Copilot   ~/Library/Application Support/Code/User/mcp.json  (key is servers, not mcpServers)",
    "     Windsurf            ~/.codeium/windsurf/mcp_config.json  or  ~/.windsurf/mcp.json",
    "4. Restart the app. In a chat type: voice on",
    "   Type voice off for chat only.",
    "",
  ];
  return lines.filter((line, i) => line !== "" || i === 0 || lines[i - 1] !== "").join("\n");
}

function printManualRoute(opts) {
  console.error(manualRouteText(opts));
}

function main() {
  const dry = process.argv.includes("--dry-run");
  const home = os.homedir();
  const serverPath = path.join(__dirname, "agent-voice.js");
  const nodePath = process.execPath;
  const hosts = detectHosts(home, { pathEnv: process.env.PATH });

  console.log("Agent Voice setup");
  console.log("  server:", serverPath);
  console.log("  node:  ", nodePath);
  if (!hosts.length) {
    console.error(
      "No MCP hosts found (Cursor, Claude, ChatGPT/Codex, Gemini, VS Code, Windsurf)."
    );
    printManualRoute({
      serverPath,
      nodePath,
      reason: "setup.js could not detect an MCP host on this Mac.",
    });
    process.exit(1);
  }
  console.log("  found: ", hosts.map((h) => h.label).join(", "));
  if (dry) {
    for (const h of hosts) console.log("  would update", h.file);
    return;
  }
  const { updated, failed } = applySetup({
    home,
    serverPath,
    nodePath,
    pathEnv: process.env.PATH,
  });
  for (const id of updated) {
    const h = hosts.find((x) => x.id === id);
    console.log("  updated", h.label, "->", h.file, "(backup .bak if the file existed)");
  }
  if (failed.length) {
    for (const f of failed) {
      console.error(`  failed ${f.label} (${f.file}): ${f.error}`);
    }
    printManualRoute({
      serverPath,
      nodePath,
      reason: failed
        .map((f) => `${f.label}: could not write ${f.file}`)
        .join("; "),
    });
    process.exit(1);
  }
  console.log("Restart each host, then type: voice on");
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    const serverPath = path.join(__dirname, "agent-voice.js");
    printManualRoute({
      serverPath,
      nodePath: process.execPath,
      reason: e.message || String(e),
    });
    process.exit(1);
  }
}

module.exports = {
  detectHosts,
  mergeJsonServers,
  upsertCodexToml,
  applySetup,
  manualRouteText,
};
