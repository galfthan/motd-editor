package main

import "github.com/modelcontextprotocol/go-sdk/mcp"

// Tool arguments. These types only define the schema the agent sees; the
// operations themselves are in collab/collab.js.

type colors struct {
	FG string `json:"fg,omitempty" jsonschema:"foreground colour: #rrggbb or default (the default)"`
	BG string `json:"bg,omitempty" jsonschema:"background colour: #rrggbb or default (the default)"`
}

type region struct {
	X      int `json:"x,omitempty" jsonschema:"left cell (default 0)"`
	Y      int `json:"y,omitempty" jsonschema:"top cell (default 0)"`
	Width  int `json:"width,omitempty" jsonschema:"cells (default: to the right edge)"`
	Height int `json:"height,omitempty" jsonschema:"cells (default: to the bottom edge)"`
}

type rect struct {
	X1 int `json:"x1"`
	Y1 int `json:"y1"`
	X2 int `json:"x2"`
	Y2 int `json:"y2"`
}

type viewArgs struct {
	region
	CellPx   int  `json:"cell_px,omitempty" jsonschema:"cell width in image pixels (default: the editor's cell width, see get_state's display.cell_px; reduced to keep the image within 1600 px)"`
	NoRulers bool `json:"no_rulers,omitempty" jsonschema:"leave out the coordinate rulers and the lines every 10 cells"`
	display
}

type display struct {
	Grid          *bool    `json:"grid,omitempty" jsonschema:"thin lines around every cell (default: as the editor shows it)"`
	LightTerminal *bool    `json:"light_terminal,omitempty" jsonschema:"the colours of a light-background terminal instead of a dark one (default: as the editor shows it)"`
	CellAspect    *float64 `json:"cell_aspect,omitempty" jsonschema:"cell width / height, 0.3-0.8, as in the terminal the art is for, e.g. 0.47 for Windows Terminal's 9x19 px cells (default: as the editor shows it; the editor's own default is 0.5)"`
}

type readArgs struct {
	region
	Format string `json:"format,omitempty" jsonschema:"text (the default): one line per row; subpixels: 3 lines per row, 2 chars per cell, # set, . clear, + a cell holding a character; cells: JSON for every non-blank cell with its char and colours"`
}

type bitmapArgs struct {
	SX   int      `json:"sx" jsonschema:"subpixel column of the bitmap's left edge"`
	SY   int      `json:"sy" jsonschema:"subpixel row of the bitmap's top edge"`
	Rows []string `json:"rows" jsonschema:"one string per subpixel row: # sets a subpixel (giving its cell fg and bg), . clears it (giving its cell bg), a space leaves it unchanged"`
	colors
}

type strokesArgs struct {
	Strokes [][][]int `json:"strokes" jsonschema:"polylines of [sx, sy] subpixel points; consecutive points are joined by straight lines, a single point paints one subpixel"`
	Erase   bool      `json:"erase,omitempty" jsonschema:"clear subpixels instead of setting them; the cells get bg as background, so erasing with the default bg removes a background colour"`
	colors
}

type symbolsArgs struct {
	Items []struct {
		X    int    `json:"x"`
		Y    int    `json:"y"`
		Char string `json:"char" jsonschema:"one character; wide ones (emoji, CJK) take this cell and the next"`
	} `json:"items"`
	colors
}

type textArgs struct {
	X    int    `json:"x"`
	Y    int    `json:"y"`
	Text string `json:"text" jsonschema:"text to write from (x, y); each line starts again at x on the next row; text past the right edge is dropped"`
	colors
}

type boxArgs struct {
	rect
	Style string `json:"style,omitempty" jsonschema:"border: light (the default), heavy, double or none"`
	Fill  string `json:"fill,omitempty" jsonschema:"none (the default); fill: clear the inside and give it the colours; recolor: only give the inside the colours"`
	colors
}

type lineArgs struct {
	rect
	Style string `json:"style,omitempty" jsonschema:"light (the default), heavy or double"`
	colors
}

type copyArgs struct {
	rect
	ToX      int  `json:"to_x" jsonschema:"where the copy's top-left goes"`
	ToY      int  `json:"to_y"`
	Move     bool `json:"move,omitempty" jsonschema:"clear the source (cut and paste)"`
	Subpixel bool `json:"subpixel,omitempty" jsonschema:"all coordinates are subpixels and only subpixels and colours are copied"`
}

type importArgs struct {
	Text    string `json:"text" jsonschema:"ANSI text, as in a MOTD file"`
	X       int    `json:"x,omitempty" jsonschema:"where to paste it (default 0)"`
	Y       int    `json:"y,omitempty"`
	Replace bool   `json:"replace,omitempty" jsonschema:"replace the whole canvas, sized to the text, like File > Open"`
}

type exportArgs struct {
	Format string `json:"format,omitempty" jsonschema:"ansi (the default) or plain"`
}

type sizeArgs struct {
	Width  int `json:"width" jsonschema:"cells, 1-500"`
	Height int `json:"height" jsonschema:"cells, 1-200"`
}

type batchArgs struct {
	Ops []struct {
		Op   string         `json:"op" jsonschema:"name of any other tool except batch, view_canvas, undo and redo"`
		Args map[string]any `json:"args,omitempty"`
	} `json:"ops"`
}

func addTools(s *mcp.Server, l *link) {
	relay[struct{}](s, l, "get_state",
		"Canvas size in cells and subpixels; what the user is doing: current tool and colours, cell or subpixel selection, text cursor, and the note they left for you; and the editor's display settings.")
	relay[viewArgs](s, l, "view_canvas",
		"The canvas, or a region of it, as a PNG image drawn by the editor. MOTDs show in both dark and light terminals: check both with light_terminal.")
	relay[display](s, l, "set_display",
		"Change how the editor shows the canvas to the user (the Canvas menu's Show Grid, Light Terminal and cell aspect). Doesn't change the art or the export.")
	relay[readArgs](s, l, "read_region",
		"Read the exact content of the canvas or a region as text, a subpixel bitmap, or per-cell JSON with colours.")
	relay[bitmapArgs](s, l, "draw_bitmap",
		"Paint a pattern of subpixels, given as rows of text. The best way to draw shapes, letters and pixel art.")
	relay[strokesArgs](s, l, "draw_strokes",
		"Draw or erase freehand strokes through subpixel points, like the Draw and Erase tools. Drawing gives the touched cells fg and bg; erasing gives them bg.")
	relay[symbolsArgs](s, l, "place_symbols",
		"Put characters in cells, like the Symbol tool: diagonals, triangles, blocks, shades, emoji or any other character.")
	relay[textArgs](s, l, "write_text",
		"Type text into cells, like the Text tool.")
	relay[boxArgs](s, l, "draw_box",
		"Draw a box with box-drawing characters from (x1, y1) to (x2, y2), cells inclusive, like the Box tool. Borders join with lines and boxes already there.")
	relay[lineArgs](s, l, "draw_line",
		"Draw a line of box-drawing characters from (x1, y1) to (x2, y2), going horizontally then vertically, like the Line tool.")
	relay[copyArgs](s, l, "copy_region",
		"Copy or move the rectangle (x1, y1)-(x2, y2), inclusive, to (to_x, to_y), like Select with copy/cut and paste.")
	relay[importArgs](s, l, "import_ansi",
		"Paste ANSI text, or load it as the whole canvas.")
	relay[exportArgs](s, l, "export",
		"The canvas as a MOTD file: ANSI text with colours, or plain text.")
	relay[sizeArgs](s, l, "resize_canvas",
		"Change the canvas size, keeping the content.")
	relay[sizeArgs](s, l, "new_canvas",
		"Start over with an empty canvas of this size.")
	relay[struct{}](s, l, "undo", "Undo the last step, the user's or yours.")
	relay[struct{}](s, l, "redo", "Redo the last undone step.")
	relay[batchArgs](s, l, "batch",
		"Run several operations in order as one undo step, e.g. [{op: \"draw_box\", args: {...}}, {op: \"write_text\", args: {...}}]. Stops at the first failing one; the ones before it stay applied.")
}
