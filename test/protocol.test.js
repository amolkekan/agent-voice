const { spawn } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "agent-voice.js");

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

test("initialize and tools/list over newline JSON-RPC", async () => {
  const proc = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
  try {
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
    const init = await readLine(proc);
    assert.equal(init.id, 1);
    assert.equal(init.result.serverInfo.name, "agent-voice");
    assert.ok(!String(JSON.stringify(init)).includes("Content-Length"));

    send(proc, { jsonrpc: "2.0", method: "notifications/initialized" });
    send(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listed = await readLine(proc);
    const names = listed.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["list_voices", "speak"]);
  } finally {
    proc.kill();
  }
});
