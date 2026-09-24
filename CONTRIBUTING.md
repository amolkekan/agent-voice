# Contributing

Changes to `main` go through a pull request. `@amolkekan` is a required reviewer; only the repo admin can merge.

Node 18+. Run `npm test` after changes. Keep MCP stdout as one JSON object per line (no `Content-Length` headers). Behaviour for agents belongs in `VOICE.md` (sent on initialize). Host install is `node setup.js` (detects Cursor, Claude, ChatGPT/Codex, Gemini, VS Code, Windsurf; merge only, never replace the whole config).
