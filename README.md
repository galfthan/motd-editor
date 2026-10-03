# MOTD Editor

A web-based editor for creating MOTD banners using Unicode sextant characters (2x3 subpixel blocks) and extended diagonal/triangle characters.

## Usage

Open `web/index.html` in your browser, or serve with any static file server:

```bash
# Python
python -m http.server -d web

# Node
npx serve web
```

## Features

- Sextant character editing (2x3 subpixel grid per cell)
- Extended diagonal and triangle characters (U+1FB3C-1FB6F)
- Box and line drawing tools with light/heavy/double styles
- Foreground/background color support
- Import/export ANSI text files
- Copy/paste with system clipboard integration
- Text tool for typing characters directly
- Color picker tool
- Preview for dark or light terminals and for the cell shape (width ÷ height)
  of the terminal the art is for (Canvas menu)

## Working with an AI agent (optional)

`motd-editor` is a small local server that serves the editor and lets an AI
agent (Claude Code or any other MCP client) edit the same canvas you are
working on. You see every change as it happens and can keep drawing yourself;
each AI operation is one undo step. The hosted static editor is unaffected.

Build it with Go 1.25+ (the editor files are compiled in): `go build` for
this machine, or `make` for Linux, Windows and macOS binaries in `dist/`.

```bash
./motd-editor                                   # then open http://localhost:8765/
claude mcp add --transport http motd http://localhost:8765/mcp
```

For Claude Desktop, which starts local MCP servers itself, add it to
`claude_desktop_config.json` (Settings > Developer > Edit Config) and
restart Claude Desktop; the editor is then at http://localhost:8765/ while
Claude Desktop runs:

```json
{
  "mcpServers": {
    "motd": { "command": "C:\\path\\to\\motd-editor-windows-amd64.exe", "args": ["-stdio"] }
  }
}
```

Then ask Claude to draw something. The **AI link** button in the menu bar
opens a log of the agent's operations and a note box the agent can read; it
can also see your current selection, so you can select an area and say
"put a logo here".

The agent gets tools mirroring the editor's: `draw_bitmap` and
`draw_strokes` (subpixels), `place_symbols`, `write_text`, `draw_box`,
`draw_line`, `copy_region`, `import_ansi`/`export`, `resize_canvas`,
`new_canvas`, `undo`/`redo` and `batch`, plus `get_state`, `read_region`
(text, subpixel bitmap or per-cell colours), `view_canvas` (a PNG, in dark
or light terminal colours and any cell aspect) and `set_display` (Show Grid,
Light Terminal, cell aspect).

How it works: the browser tab holds the canvas. The server relays each tool
call to the tab over Server-Sent Events, the tab runs it with the editor's own
code (`collab/collab.js`), and posts the result back. Use `-dev` to serve
`web/` and `collab/` from disk while developing, and `-addr` to change the
port.
