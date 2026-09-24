const { spawn } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "agent-voice.js");

function startServer() {
  return spawn("node", [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, AGENT_VOICE_DRY_RUN: "1" },
  });
}

function send(proc, obj) {
  proc.stdin.write(JSON.stringify(obj) + "\n");
}

function readLine(proc) {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const line = chunk.toString("utf8").split("\n").find((l) => l.trim());
      if (!line) return;
      proc.stdout.off("data", onData);
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(e);
      }
    };
    proc.stdout.on("data", onData);
    setTimeout(() => reject(new Error("timeout waiting for MCP line")), 5000);
  });
}

async function initialize(proc) {
  send(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    },
  });
  return readLine(proc);
}

test("initialize and tools/list over newline JSON-RPC", async () => {
  const proc = startServer();
  try {
    const init = await initialize(proc);
    assert.equal(init.id, 1);
    assert.equal(init.result.serverInfo.name, "agent-voice");
    assert.ok(!String(JSON.stringify(init)).includes("Content-Length"));

    send(proc, { jsonrpc: "2.0", method: "notifications/initialized" });
    send(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listed = await readLine(proc);
    const names = listed.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["list_voices", "set_voice", "speak"]);
  } finally {
    proc.kill();
  }
});

test("initialize includes VOICE.md as instructions", async () => {
  const proc = startServer();
  try {
    const init = await initialize(proc);
    const instructions = init.result.instructions || "";
    assert.match(instructions, /off by default/i);
    assert.match(instructions, /voice on/i);
    assert.match(instructions, /set_voice/);
  } finally {
    proc.kill();
  }
});

test("speak is muted until set_voice turns voice on", async () => {
  const proc = startServer();
  try {
    await initialize(proc);
    send(proc, { jsonrpc: "2.0", method: "notifications/initialized" });

    send(proc, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "speak", arguments: { text: "Should stay silent." } },
    });
    const muted = await readLine(proc);
    assert.equal(muted.result.isError, false);
    assert.match(muted.result.content[0].text, /muted|off/i);

    send(proc, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "set_voice", arguments: { on: true } },
    });
    const enabled = await readLine(proc);
    assert.equal(enabled.result.isError, false);
    assert.match(enabled.result.content[0].text, /on/i);

    send(proc, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "speak", arguments: { text: "Hello from the test." } },
    });
    const spoken = await readLine(proc);
    assert.equal(spoken.result.isError, false);
    assert.match(spoken.result.content[0].text, /Speaking|Spoke/i);
  } finally {
    proc.kill();
  }
});
