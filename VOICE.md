# Spoken replies

Voice is **off by default**. Stay silent unless the user turns it on.

- **voice on** / **speak** / **talk to me** / **voice mode** — call `set_voice` with `on: true`, then speak short summaries for the rest of this process.
- **voice off** / **mute** / **no voice** / **chat only** — call `set_voice` with `on: false`.
- **say that out loud** — if voice is off, speak that reply only (set_voice on, speak, set_voice off). If voice is already on, just `speak`.

`set_voice` is **process-wide** (every chat sharing this MCP until restart). `speak` does nothing while voice is off.

When voice is on:

- Call the **Agent Voice** `speak` tool (macOS `say`).
- Keep the full written answer in chat.
- Long replies: speak **1–2 sentences** (what happened, next step).
- Do not read code, diffs, logs, or tables out loud.
