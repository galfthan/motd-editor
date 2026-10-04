package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Tool arguments. These types define the schema the agent sees; the
// operations themselves are in collab/collab.js (after a prepare step, for
// types that have one).

type colors struct {
	Bold    bool   `json:"bold,omitempty" jsonschema:"bold text (cells drawn on get it, or lose it when false)"`
	Inverse bool   `json:"inverse,omitempty" jsonschema:"fg and bg swapped as the terminal shows them, following the terminal's own colours where they are default (cells drawn on get it, or lose it when false)"`
	FG      string `json:"fg,omitempty" jsonschema:"foreground colour: #rrggbb, default (the default) or keep (each cell keeps its own)"`
	BG      string `json:"bg,omitempty" jsonschema:"background colour: #rrggbb, default (the default) or keep (each cell keeps its own). Cells drawn on get it even where they had a colour: use keep to leave a background as it is"`
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
	Format string `json:"format,omitempty" jsonschema:"text (the default): one line per row; subpixels: 3 lines per row, 2 chars per cell, # set, . clear, + a cell holding a character; cells: JSON for every non-blank cell with its char, colours, and bold / inverse when set"`
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
	Style string `json:"style,omitempty" jsonschema:"border: light (the default), heavy, double, subpixel (drawn with subpixels; x1-y2 are then subpixel coordinates) or none"`
	Fill  string `json:"fill,omitempty" jsonschema:"none (the default); fill: clear the inside and give it the colours (subpixel style: a solid rectangle of subpixels); recolor: only give the inside the colours. With style none they cover the whole rectangle, its edge cells included"`
	colors
}

type lineArgs struct {
	rect
	Style string `json:"style,omitempty" jsonschema:"light (the default), heavy, double, or subpixel: a straight line of subpixels, with x1-y2 subpixel coordinates"`
	colors
}

type fillArgs struct {
	SX   int    `json:"sx" jsonschema:"subpixel column where the fill starts"`
	SY   int    `json:"sy" jsonschema:"subpixel row"`
	Mode string `json:"mode,omitempty" jsonschema:"ink (the default): light the area in fg, leaving out cells where that would repaint other lit subpixels (a line through them); paper: give every cell the area reaches bg; both: paper, then ink"`
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

type imageArgs struct {
	Path           string `json:"path,omitempty" jsonschema:"absolute path of an image file on this computer: PNG, JPEG, GIF, WebP or BMP"`
	URL            string `json:"url,omitempty" jsonschema:"or the image's http(s) URL"`
	X              int    `json:"x,omitempty" jsonschema:"left cell (default 0)"`
	Y              int    `json:"y,omitempty" jsonschema:"top cell (default 0)"`
	Width          int    `json:"width,omitempty" jsonschema:"cells; with only one of width and height the other keeps the image's proportions at the editor's cell aspect (default: as large as fits the canvas from x, y)"`
	Height         int    `json:"height,omitempty" jsonschema:"cells"`
	Mono           bool   `json:"mono,omitempty" jsonschema:"use only the colours fg and bg (default: full colour, two colours per cell fitted to the image)"`
	Dither         string `json:"dither,omitempty" jsonschema:"floyd-steinberg (the default), atkinson (crisper) or none"`
	DitherStrength *int   `json:"dither_strength,omitempty" jsonschema:"0-100: how much of each subpixel's error is passed on (default 100); lower is less grainy"`
	Brightness     int    `json:"brightness,omitempty" jsonschema:"-100 to 100 (default 0): shifts every tone"`
	Contrast       int    `json:"contrast,omitempty" jsonschema:"-100 to 100 (default 0): spreads tones from the middle, or squeezes them to it"`
	Midtones       int    `json:"midtones,omitempty" jsonschema:"-100 to 100 (default 0): lightens or darkens the middle tones, black and white stay; mono images look dark at 0, which mixes light physically, so try 30-50 to lighten them"`
	Invert         bool   `json:"invert,omitempty" jsonschema:"use the image's negative"`
	FG             string `json:"fg,omitempty" jsonschema:"mono only: one of the two colours, #rrggbb or default (the default); each subpixel gets the nearer one"`
	BG             string `json:"bg,omitempty" jsonschema:"mono only: the other colour, #rrggbb or default (the default), also given to cells the image only partly covers. Full colour ignores fg and bg and keeps the canvas background where the image is transparent"`
}

const maxImage = 20 << 20

// prepare reads the image, which the tab gets as a data: URL
func (a imageArgs) prepare(ctx context.Context) (any, error) {
	var data []byte
	var err error
	switch {
	case a.Path != "":
		data, err = readFile(a.Path)
	case a.URL != "":
		data, err = download(ctx, a.URL)
	default:
		return nil, errors.New("give the image's path or url")
	}
	if err != nil {
		return nil, err
	}
	if len(data) > maxImage {
		return nil, fmt.Errorf("the image is over %d MB", maxImage>>20)
	}
	mime := http.DetectContentType(data)
	if !strings.HasPrefix(mime, "image/") {
		return nil, fmt.Errorf("not an image (%s)", mime)
	}
	return struct {
		imageArgs
		Data string `json:"data"`
	}{a, "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)}, nil
}

// readFile reads at most maxImage+1 bytes, enough to tell it is too big
func readFile(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, maxImage+1))
}

func download(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	// Some sites (Wikimedia) refuse requests that don't say who they are from
	req.Header.Set("User-Agent", "motd-editor (https://github.com/galfthan/motd-editor)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: %s", url, resp.Status)
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxImage+1))
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
		Op   string         `json:"op" jsonschema:"name of any other tool except batch, view_canvas, import_image, undo and redo"`
		Args map[string]any `json:"args,omitempty"`
	} `json:"ops"`
}

func addTools(s *mcp.Server, l *link) {
	relay[struct{}](s, l, "get_state",
		"Canvas size in cells and subpixels; what the user is doing: current tool and colours, cell or subpixel selection, text cursor, and the note they left for you; and the editor's display settings.")
	relay[viewArgs](s, l, "view_canvas",
		"The canvas, or a region of it, as a PNG image drawn by the editor. MOTDs show in both dark and light terminals: check both with light_terminal.")
	relay[display](s, l, "set_display",
		"Change how the editor shows the canvas to the user (its grid, dark or light terminal and cell shape controls) until they reload it; leave a setting out to keep it. Doesn't change the art or the export.")
	relay[readArgs](s, l, "read_region",
		"Read the exact content of the canvas or a region as text, a subpixel bitmap, or per-cell JSON with colours.")
	relay[bitmapArgs](s, l, "draw_bitmap",
		"Paint a pattern of subpixels, given as rows of text. The best way to draw shapes, letters and pixel art.")
	relay[strokesArgs](s, l, "draw_strokes",
		"Draw or erase freehand strokes through subpixel points, like the Brush tool's Paint and Erase. Drawing gives the touched cells fg and bg; erasing gives them bg.")
	relay[symbolsArgs](s, l, "place_symbols",
		"Put characters in cells, like the Glyph tool: diagonals, triangles, blocks, shades, emoji or any other character, one per item. Wide ones (emoji, CJK) need two cells, so not the last column.")
	relay[textArgs](s, l, "write_text",
		"Type text into cells, like the Text tool.")
	relay[boxArgs](s, l, "draw_box",
		"Draw a box with box-drawing characters from (x1, y1) to (x2, y2), cells inclusive, like the Box tool. Borders join with lines and boxes already there. Parts past the canvas edges are left out.")
	relay[lineArgs](s, l, "draw_line",
		"Draw a line of box-drawing characters from (x1, y1) to (x2, y2), like the Line tool: straight, or if both x and y differ a Z of three straight legs, the middle one halfway (horizontal-vertical-horizontal when at least as wide as tall, else vertical-horizontal-vertical). Ends on another line join it (╠, ┯). Both ends must be on the canvas. Style subpixel draws a straight line of subpixels between subpixel points instead.")
	relay[fillArgs](s, l, "fill",
		"Fill an area, like the Fill tool: from (sx, sy) it spreads up, down, left and right to the subpixels that look the same (lit or unlit alike, in cells with the same colours); other colours and cells holding a character stop it. mode says what it does there.")
	relay[copyArgs](s, l, "copy_region",
		"Copy or move the rectangle (x1, y1)-(x2, y2), inclusive, to (to_x, to_y), like Select with copy/cut and paste.")
	relay[importArgs](s, l, "import_ansi",
		"Paste ANSI text, or load it as the whole canvas. Understands SGR colours (the 16 basic ones, 256-colour in the xterm palette, 24-bit), bold and inverse; other escape sequences are dropped.")
	relay[imageArgs](s, l, "import_image",
		"Place a picture as cells, like pasting an image into the editor: scaled, each cell given the two colours that best fit its 2x3 subpixels, and dithered. Transparent areas leave the canvas as it is.")
	relay[exportArgs](s, l, "export",
		"The canvas as a MOTD file: ANSI text with colours, or plain text.")
	relay[sizeArgs](s, l, "resize_canvas",
		"Change the canvas size, keeping the content.")
	relay[sizeArgs](s, l, "new_canvas",
		"Start over with an empty canvas of this size.")
	relay[struct{}](s, l, "undo", "Undo the last step, the user's or yours.")
	relay[struct{}](s, l, "redo", "Redo the last undone step.")
	relay[batchArgs](s, l, "batch",
		"Run several operations in order as one undo step, e.g. [{op: \"draw_box\", args: {...}}, {op: \"write_text\", args: {...}}]. Op names are checked first: an unknown or disallowed op changes nothing. Otherwise stops at the first failing op; the ones before it stay applied.")
}
