#!/usr/bin/env node
// Agent Voice: MCP server that speaks short chat summaries via macOS `say`.
// Works with any MCP-compatible host. Audio stays local.
// stdout is newline-delimited JSON-RPC; logs go to stderr.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_VOICE = process.env.SAY_VOICE || "";
const DEFAULT_RATE = process.env.SAY_RATE || "198";
const DRY_RUN = process.env.AGENT_VOICE_DRY_RUN === "1";

let voiceOn = false;

function loadInstructions() {
  try {
    return fs.readFileSync(path.join(__dirname, "VOICE.md"), "utf8").trim();
  } catch {
    return "Voice is off by default. Call set_voice with on=true after the user says voice on. Call speak only while voice is on.";
  }
}

const TOOLS = [
  {
    name: "speak",
    description:
      "Speak a short spoken summary aloud through the macOS voice. Keep it to 1-2 sentences. Never pass code, diffs, logs, or tables.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The text to speak. 1-2 sentences, plain prose.",
        },
        voice: {
          type: "string",
          description:
            "Optional macOS voice name. Defaults to SAY_VOICE, or the system voice if unset.",
        },
        rate: {
          type: "number",
          description: `Optional words per minute. Defaults to ${DEFAULT_RATE}.`,
        },
        wait: {
          type: "boolean",
          description:
            "Block until playback finishes. Defaults to false so the reply is not delayed.",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "list_voices",
    description: "List the macOS voices installed on this machine.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "set_voice",
    description:
      "Turn spoken replies on or off for this MCP process (all chats that share it). Default is off. Call this when the user says voice on, voice off, mute, or similar.",
    inputSchema: {
      type: "object",
      properties: {
        on: {
          type: "boolean",
          description: "true to enable speak, false to mute.",
        },
      },
      required: ["on"],
      additionalProperties: false,
    },
  },
];

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => resolve({ code: 1, out, err: e.message }));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function buildSayArgs(text, voice, rate) {
  const args = ["-r", String(rate), text];
  if (voice) args.unshift("-v", voice);
  return args;
}

async function callTool(name, args) {
  if (name === "set_voice") {
    voiceOn = Boolean(args?.on);
    return {
      ok: true,
      text: voiceOn
        ? "Voice on (process-wide until set_voice off or the MCP restarts)."
        : "Voice off. speak will stay silent.",
    };
  }

  if (name === "speak") {
    const text = String(args?.text ?? "").trim();
    if (!text) return { ok: false, text: "No text supplied to speak." };
    if (!voiceOn) {
      return {
        ok: true,
        text: "Voice is muted (off). Call set_voice with on=true after the user opts in.",
      };
    }
    if (DRY_RUN) {
      return { ok: true, text: `Speaking: ${text}` };
    }
    const voice = String(args?.voice || DEFAULT_VOICE);
    const rate = String(args?.rate || DEFAULT_RATE);
    const sayArgs = buildSayArgs(text, voice, rate);

    await run("/usr/bin/killall", ["say"]).catch(() => {});

    if (args?.wait === true) {
      const r = await run("say", sayArgs);
      return r.code === 0
        ? { ok: true, text: `Spoke: ${text}` }
        : { ok: false, text: `say failed (exit ${r.code}): ${r.err.trim()}` };
    }

    const child = spawn("say", sayArgs, { detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true, text: `Speaking: ${text}` };
  }

  if (name === "list_voices") {
    const r = await run("say", ["-v", "?"]);
    return { ok: r.code === 0, text: r.out || r.err };
  }

  return { ok: false, text: `Unknown tool: ${name}` };
}

// MCP stdio framing is newline-delimited JSON, not LSP Content-Length.
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;
  if (!method) return;

  const reply = (result) => send({ jsonrpc: "2.0", id, result });

  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "agent-voice", version: "1.0.0" },
        instructions: loadInstructions(),
      });
    case "notifications/initialized":
    case "initialized":
      return;
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const r = await callTool(params?.name, params?.arguments || {});
      return reply({
        content: [{ type: "text", text: r.text }],
        isError: !r.ok,
      });
    }
    case "ping":
      return reply({});
    default:
      if (id !== undefined) {
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
  }
}

let buf = Buffer.alloc(0);

function consume() {
  while (true) {
    const headerEnd = buf.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const header = buf.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buf = buf.slice(headerEnd + 4);
        continue;
      }
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (buf.length < start + len) return;
      const json = buf.slice(start, start + len).toString("utf8");
      buf = buf.slice(start + len);
      try {
        handle(JSON.parse(json)).catch((e) =>
          process.stderr.write(`handler error: ${e}\n`)
        );
      } catch (e) {
        process.stderr.write(`parse error: ${e}\n`);
      }
      continue;
    }

    const nl = buf.indexOf("\n");
    if (nl === -1) return;
    const line = buf.slice(0, nl).toString("utf8").trim();
    buf = buf.slice(nl + 1);
    if (!line || line.startsWith("Content-Length:")) continue;
    try {
      handle(JSON.parse(line)).catch((e) =>
        process.stderr.write(`handler error: ${e}\n`)
      );
    } catch {
      // incomplete / binary header fragment
    }
  }
}

if (process.platform !== "darwin") {
  process.stderr.write(
    "Agent Voice requires macOS (the say command). Other systems are not supported.\n"
  );
}

process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, Buffer.from(chunk)]);
  consume();
});
process.stdin.on("end", () => process.exit(0));
