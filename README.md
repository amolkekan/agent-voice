# Agent Voice (macOS only)

An MCP server that speaks a **short summary** of an agent reply. Playback uses the **built-in macOS `say` command** (the same voices as System Settings). The full answer stays in the chat. No cloud, no API key.

**Requires macOS.** Windows and Linux are not supported.

Works with any MCP-compatible host on a Mac. The server is the same; only the config file path changes.

## How this idea started

Dictation ([Wispr Flow](https://wisprflow.ai/) and similar) already made it easy to *talk into* Cursor, Claude, Teams, and other chat windows. Replies still came back as a wall of text.

The missing piece was a spoken answer that stays **short**: not a read-aloud of the whole thread, just the pinpoint (what happened, and the next step) while logs and detail stay on screen.

There are paid and open-source options (for example [ElevenLabs](https://elevenlabs.io) and [TalkToCursor](https://talktocursor.com)). They often need an account, a cloud key, a connector, or another process. macOS already has `say`. Agent Voice is a small MCP wrapper around that, so any MCP host can talk back with no cloud key.

## Setup

**Fast path:** paste the prompt below into Cursor, Claude Code, Codex, or another agent on this Mac. Point it at this folder (or `git clone` first).

```
Install Agent Voice from this folder as an MCP server on my Mac.

This repo is macOS-only. It speaks short chat summaries with the built-in `say` command. Do not send audio to the cloud.

Do this:
1. Resolve the absolute path of agent-voice.js in this folder (run pwd if needed).
2. Add an MCP server named agent-voice:
   command: node
   args: [<absolute-path>/agent-voice.js]
   Do not replace my whole MCP config. Merge this one server. Do not commit mcp.json.
3. Optional: add the contents of VOICE.md to this host’s always-on instructions (Cursor rules, CLAUDE.md, AGENTS.md, or equivalent) so voice stays off until I say "voice on".
4. Tell me to restart the app, then type: voice on

If I already have agent-voice configured, update the path instead of duplicating it.
```

**Manual path:**

1. In this folder, run `pwd` and copy the path.
2. Add this server to your MCP config (do not replace the whole file):

```json
"agent-voice": {
  "command": "node",
  "args": ["/ABSOLUTE/PATH/TO/agent-voice/agent-voice.js"]
}
```

3. Restart the app. In a chat, type **`voice on`**.

Type **`voice off`** for chat only.

Config file examples:

| Host | Typical config |
| --- | --- |
| Cursor | `~/.cursor/mcp.json` |
| Claude Code | `.mcp.json` in the project, or the host’s MCP settings |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Codex | the host’s MCP settings (same JSON shape) |

If the UI has **Add MCP server**: name `agent-voice`, command `node`, args `<pwd>/agent-voice.js`.

## Choose a macOS voice

Agent Voice does not ship its own voices. It calls `say`, so whatever you hear is a **macOS system voice**.

**Unset `SAY_VOICE`** (the default in this repo): uses the Mac’s current system voice.

**Pick a named voice** in the MCP env:

```json
"agent-voice": {
  "command": "node",
  "args": ["/ABSOLUTE/PATH/TO/agent-voice/agent-voice.js"],
  "env": {
    "SAY_VOICE": "Samantha",
    "SAY_RATE": "198"
  }
}
```

List names on your Mac:

```bash
say -v '?'
```

Preview one:

```bash
say -v Samantha "This is Samantha."
```

English compact voices you may already have include Samantha, Daniel, and Rishi. **Premium / Enhanced** voices (Ava, Zoe, and others) sound better but must be downloaded first:

**System Settings → Accessibility → Spoken Content → System Voice → Manage Voices…**

Skip Siri voices: `say` cannot use them.

To change the system default (used when `SAY_VOICE` is unset): same Spoken Content pane, pick **System Voice**.

Restart the MCP host after changing `mcp.json` env.

## How long the spoken reply is

The server only plays the text the agent sends to `speak`. **Short vs detailed is not a `say` setting** — it is host instructions (or what you say in chat).

This repo’s default ([`VOICE.md`](VOICE.md)) is a **1–2 sentence pinpoint**. To speak more:

- In that chat: `voice on, detailed` or `read a fuller spoken recap` (still skip code and logs).
- Or paste a longer instruction instead of `VOICE.md` into `AGENTS.md` / `CLAUDE.md` / Cursor rules.

`SAY_VOICE` and `SAY_RATE` only change how it sounds, not how much is spoken.

## Optional

- **Stay silent until `voice on`:** paste [`VOICE.md`](VOICE.md) into the host’s instruction file (`AGENTS.md`, `CLAUDE.md`, or equivalent).
- **Mute everywhere:** disable the `agent-voice` MCP in the host.

## License

MIT. That lets anyone use, copy, and change this. A GitHub repo with **no** license is all rights reserved by default, so others could not legally use it even though the repo is public.
