package canvas

import (
	"asciiart/internal/ansi"
	"strings"
)

// Canvas represents the entire drawing canvas.
type Canvas struct {
	Width  int      `json:"width"`  // Width in character cells
	Height int      `json:"height"` // Height in character cells
	Cells  [][]Cell `json:"cells"`  // 2D array of cells [row][col]
	Mode   string   `json:"mode"`   // "sextant" (future: "quadrant")
}

// NewCanvas creates a new canvas with the specified dimensions.
func NewCanvas(width, height int, mode string) *Canvas {
	if width < 1 {
		width = 1
	}
	if height < 1 {
		height = 1
	}
	if mode == "" {
		mode = "sextant"
	}

	cells := make([][]Cell, height)
	for y := 0; y < height; y++ {
		cells[y] = make([]Cell, width)
		for x := 0; x < width; x++ {
			cells[y][x] = NewCell()
		}
	}

	return &Canvas{
		Width:  width,
		Height: height,
		Cells:  cells,
		Mode:   mode,
	}
}

// GetCell returns a pointer to the cell at (x, y).
// Returns nil if coordinates are out of bounds.
func (c *Canvas) GetCell(x, y int) *Cell {
	if x < 0 || x >= c.Width || y < 0 || y >= c.Height {
		return nil
	}
	return &c.Cells[y][x]
}

// SetCell sets the cell at (x, y).
func (c *Canvas) SetCell(x, y int, cell Cell) bool {
	if x < 0 || x >= c.Width || y < 0 || y >= c.Height {
		return false
	}
	c.Cells[y][x] = cell
	return true
}

// SetSubpixel sets a specific subpixel within a cell.
// cellX, cellY: cell coordinates
// subRow: 0-2, subCol: 0-1
func (c *Canvas) SetSubpixel(cellX, cellY, subRow, subCol int, filled bool) bool {
	cell := c.GetCell(cellX, cellY)
	if cell == nil {
		return false
	}
	// Ensure cell is in sextant mode
	if cell.Type != CellTypeSextant {
		cell.ConvertToSextant()
	}
	cell.SetSubpixel(subRow, subCol, filled)
	return true
}

// ToggleSubpixel toggles a specific subpixel within a cell.
func (c *Canvas) ToggleSubpixel(cellX, cellY, subRow, subCol int) (bool, bool) {
	cell := c.GetCell(cellX, cellY)
	if cell == nil {
		return false, false
	}
	// Ensure cell is in sextant mode
	if cell.Type != CellTypeSextant {
		cell.ConvertToSextant()
	}
	newValue := cell.ToggleSubpixel(subRow, subCol)
	return true, newValue
}

// SetExtendedChar sets an extended character at the specified cell.
func (c *Canvas) SetExtendedChar(cellX, cellY int, charCode rune) bool {
	cell := c.GetCell(cellX, cellY)
	if cell == nil {
		return false
	}
	cell.SetExtendedChar(charCode)
	return true
}

// SetCellColors sets the foreground and background colors for a cell.
func (c *Canvas) SetCellColors(cellX, cellY int, fg, bg ansi.Color) bool {
	cell := c.GetCell(cellX, cellY)
	if cell == nil {
		return false
	}
	cell.FG = fg
	cell.BG = bg
	return true
}

// Resize changes the canvas dimensions, preserving existing content.
func (c *Canvas) Resize(newWidth, newHeight int) {
	if newWidth < 1 {
		newWidth = 1
	}
	if newHeight < 1 {
		newHeight = 1
	}

	newCells := make([][]Cell, newHeight)
	for y := 0; y < newHeight; y++ {
		newCells[y] = make([]Cell, newWidth)
		for x := 0; x < newWidth; x++ {
			if y < c.Height && x < c.Width {
				newCells[y][x] = c.Cells[y][x]
			} else {
				newCells[y][x] = NewCell()
			}
		}
	}

	c.Width = newWidth
	c.Height = newHeight
	c.Cells = newCells
}

// Clear resets all cells to empty state.
func (c *Canvas) Clear() {
	for y := 0; y < c.Height; y++ {
		for x := 0; x < c.Width; x++ {
			c.Cells[y][x].Clear()
		}
	}
}

// ToANSIText exports the canvas as text with ANSI escape codes.
func (c *Canvas) ToANSIText() string {
	var buf strings.Builder
	var lastFG, lastBG *ansi.Color

	for y := 0; y < c.Height; y++ {
		for x := 0; x < c.Width; x++ {
			cell := &c.Cells[y][x]

			// Emit color codes if changed
			if lastFG == nil || !cell.FG.Equal(*lastFG) {
				buf.WriteString(cell.FG.FGCode())
				fg := cell.FG
				lastFG = &fg
			}
			if lastBG == nil || !cell.BG.Equal(*lastBG) {
				buf.WriteString(cell.BG.BGCode())
				bg := cell.BG
				lastBG = &bg
			}

			// Emit character
			buf.WriteRune(cell.ToRune())
		}
		// Reset at end of line and add newline
		buf.WriteString(ansi.Reset)
		buf.WriteString("\n")
		lastFG, lastBG = nil, nil
	}

	return buf.String()
}

// ToPlainText exports the canvas as plain text without ANSI codes.
func (c *Canvas) ToPlainText() string {
	var buf strings.Builder

	for y := 0; y < c.Height; y++ {
		for x := 0; x < c.Width; x++ {
			buf.WriteRune(c.Cells[y][x].ToRune())
		}
		buf.WriteString("\n")
	}

	return buf.String()
}

// SubpixelDimensions returns the dimensions in subpixels.
func (c *Canvas) SubpixelDimensions() (width, height int) {
	switch c.Mode {
	case "sextant":
		return c.Width * 2, c.Height * 3
	case "quadrant":
		return c.Width * 2, c.Height * 2
	default:
		return c.Width * 2, c.Height * 3
	}
}
