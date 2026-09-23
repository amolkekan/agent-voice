# Agent Voice (macOS only)

An MCP server that speaks a **short summary** of an agent reply. Playback uses the **built-in macOS `say` command** (the same voices as System Settings). The full answer stays in the chat. No cloud, no API key.

**Requires macOS.** Windows and Linux are not supported.

Works with any MCP-compatible host on a Mac. The server is the same; only the config file path changes.

## How this idea started

Dictation ([Wispr Flow](https://wisprflow.ai/) and similar) already made it easy to *talk into* Cursor, Claude, Teams, and other chat windows. Replies still came back as a wall of text.

The missing piece was a spoken answer that stays **short**: not a read-aloud of the whole thread, just the pinpoint (what happened, and the next step) while logs and detail stay on screen.

There are paid and open-source options (for example [ElevenLabs](https://elevenlabs.io) and [TalkToCursor](https://talktocursor.com)). They often need an account, a cloud key, a connector, or another process. macOS already has `say`. Agent Voice is a small MCP wrapper around that, so any MCP host can talk back with no cloud key.

## Setup

### Prompt

Paste into Cursor, Claude, Codex, or another agent on this Mac. Point it at this folder (or clone first).

```
Install Agent Voice from this folder as an MCP server on my Mac.

This repo is macOS-only. It speaks short chat summaries with the built-in `say` command. Do not send audio to the cloud.

Prefer the automatic path:
1. From this folder run: node setup.js
   (Optional first: node setup.js --dry-run)
2. setup.js detects Cursor, Claude Code, Claude Desktop, ChatGPT/Codex, Gemini CLI, VS Code/Copilot, and Windsurf. It must MERGE an MCP server named agent-voice (command: node, args: [<absolute-path>/agent-voice.js]). Do not replace my whole MCP config. Do not commit mcp.json.
3. If setup.js prints "setup.js failed, but you can try the manual route", follow the steps it printed. Typical files: ~/.cursor/mcp.json, ~/.claude.json, Claude Desktop claude_desktop_config.json, ~/.codex/config.toml (ChatGPT and Codex share this), ~/.gemini/settings.json, VS Code User/mcp.json (key is servers not mcpServers), Windsurf mcp JSON. Merge only. Update the path if agent-voice already exists; do not duplicate it.
4. Do not paste VOICE.md into CLAUDE.md / Cursor rules unless the host ignores MCP initialize instructions. Voice stays off until set_voice (say "voice on"). That mute is process-wide.
5. Tell me to restart each app that was updated, then type: voice on
```

### 1. Automatic (`setup.js`)

```bash
git clone https://github.com/amolkekan/agent-voice.git
cd agent-voice
node setup.js --dry-run
node setup.js
```

Restart the app. In chat:

```
voice on
```

```
voice off
```

If the log says `setup.js failed, but you can try the manual route`, use **2. Manual** (the script also prints those steps).

### 2. Manual

```bash
cd /path/to/agent-voice
pwd
```

Merge only this server (do not replace the whole file):

```json
"agent-voice": {
  "command": "node",
  "args": ["/ABSOLUTE/PATH/FROM/pwd/agent-voice.js"]
}
```

UI: **Add MCP server** → name `agent-voice`, command `node`, args `<pwd>/agent-voice.js`.

| Host | File |
| --- | --- |
| Cursor | `~/.cursor/mcp.json` |
| Claude Code | `~/.claude.json` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| ChatGPT / Codex | `~/.codex/config.toml` |
| Gemini CLI | `~/.gemini/settings.json` |
| VS Code / Copilot | `~/Library/Application Support/Code/User/mcp.json` (`servers` not `mcpServers`) |
| VS Code Insiders | `~/Library/Application Support/Code - Insiders/User/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` or `~/.windsurf/mcp.json` |

Restart the app, then `voice on`.

The server sends [`VOICE.md`](VOICE.md) as MCP `instructions`. Voice stays off until `set_voice`.

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

This repo’s default ([`VOICE.md`](VOICE.md), also sent as MCP `instructions`) is a **1–2 sentence pinpoint**. To speak more:

- In that chat: `voice on, detailed` or `read a fuller spoken recap` (still skip code and logs).
- Or paste a longer instruction instead of `VOICE.md` into `AGENTS.md` / `CLAUDE.md` / Cursor rules.

`SAY_VOICE` and `SAY_RATE` only change how it sounds, not how much is spoken.

## Optional

- **Stay silent until `voice on`:** default. The server mutes `speak` until `set_voice`. Paste [`VOICE.md`](VOICE.md) only if the host ignores initialize `instructions`.
- **Mute everywhere:** `set_voice` off, or disable the `agent-voice` MCP in the host.

## License

MIT. That lets anyone use, copy, and change this. A GitHub repo with **no** license is all rights reserved by default, so others could not legally use it even though the repo is public.
