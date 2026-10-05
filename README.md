# MOTD Editor

A web-based editor for creating MOTD banners using Unicode block characters (2x2 quadrant, 2x3 sextant or 2x4 octant subpixels) and extended diagonal/triangle characters.

## Usage

Open `web/index.html` in your browser, or serve with any static file server:

```bash
# Python
python -m http.server -d web

# Node
npx serve web
```

## Features

- Subpixel editing in quadrant (2x2), sextant (2x3) or octant (2x4) cells,
  chosen with Pixels in the subpixel tools' panels; cells drawn at another
  resolution are converted (best effort). Octants are Unicode 16, so older
  terminal fonts can't show them
- Extended diagonal and triangle characters (U+1FB3C-1FB6F), blocks, shades
  and emoji, searchable by name
- Box and line drawing with light/heavy/double/rounded borders, or with subpixels
  (straight lines, and boxes that blend with subpixel art)
- Fill: from the clicked subpixel to the touching ones that look the same;
  other colours and cells holding a character stop it. It follows the view:
  Ink lights the area in the ink colour (lines through it keep theirs),
  Paper floods the touching cells of the same paper, Both gives the area
  both colours, solid up to lines of other colours
- Ink (foreground) and paper (background) colours, the 16 terminal colours,
  the terminal's own, or keep (leave each cell's colour as it is); bold and
  inverse text
- Autosave: the canvas is kept in the browser and comes back when you reopen
  the editor (Export saves a file). Tabs of the same editor share it: the
  last one changed wins
- Import/export ANSI text files
- Copy/paste with system clipboard integration
- Image import: paste (Ctrl+V), drop or Import image a picture. It floats
  over the canvas until you place it (Enter): drag it to move it, its corner
  handle or the wheel to resize it, and set its size, full colour or two
  colours (ink and paper), dithering and tone (brightness, contrast,
  midtones, invert) in the panel on the right. Each cell gets the two
  colours that best fit its subpixels; transparent areas leave the canvas
  as it is.
- Preview for dark or light terminals and for the cell shape (width ÷ height)
  of the terminal the art is for (the cells button in the status bar)
- Zoom with + and −, Ctrl+wheel, or 0 to fit the window; move the view with
  the Hand tool, by holding Space and dragging, or with the middle button

The Ink / Paper / Both switch in the top bar chooses what you see and edit:
Ink shows only the lit subpixels and characters and changes only them (the
paper stays), Paper shows only each cell's background and changes only that
(the brush, box, line and fill then paint cells' paper), Both is everything.

Tools are in the dock at the bottom; the panel on the right has the current
tool's options and the colours. Shortcuts: B brush, E erase, F fill, G glyph, T text,
S box, L line, V select (Shift+V subpixels), H hand, I pick a colour (or Alt-click
with any tool), X swap colours. Ctrl+K (⌘K) finds any command or glyph.

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

Then ask Claude to draw something. The **AI link** button in the top bar
opens a log of the agent's operations and a note box the agent can read; it
can also see your current selection, so you can select an area and say
"put a logo here".

The agent gets tools mirroring the editor's: `draw_bitmap` and
`draw_strokes` (subpixels), `place_symbols`, `write_text`, `draw_box`,
`draw_line`, `copy_region`, `import_image` (a local file or URL),
`import_ansi`/`export`, `resize_canvas`,
`new_canvas`, `undo`/`redo` and `batch`, plus `get_state`, `read_region`
(text, subpixel bitmap or per-cell colours), `view_canvas` (a PNG, in dark
or light terminal colours and any cell aspect) and `set_display` (Show Grid,
Light Terminal, cell aspect). Subpixel tools take `pixels`: quadrant,
sextant or octant (by default the user's Pixels setting).

How it works: the browser tab holds the canvas. The server relays each tool
call to the tab over Server-Sent Events, the tab runs it with the editor's own
code (`collab/collab.js`), and posts the result back. Use `-dev` to serve
`web/` and `collab/` from disk while developing, and `-addr` to change the
port.
