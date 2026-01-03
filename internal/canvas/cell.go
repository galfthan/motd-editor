package canvas

import (
	"asciiart/internal/ansi"
	"asciiart/internal/charset"
)

// CellType distinguishes between sextant-based and extended characters.
type CellType string

const (
	CellTypeSextant  CellType = "sextant"  // 2x3 subpixel grid
	CellTypeDiagonal CellType = "diagonal" // Smooth diagonal character
	CellTypeTriangle CellType = "triangle" // Corner triangle character
	CellTypeCustom   CellType = "custom"   // Any other Unicode character
)

// Cell represents a single character cell on the canvas.
type Cell struct {
	Type CellType   `json:"type"`
	FG   ansi.Color `json:"fg"`
	BG   ansi.Color `json:"bg"`

	// For sextant mode: 6-bit pattern stored as bool array
	// Layout: [row][col] where row is 0-2, col is 0-1
	Subpixels [3][2]bool `json:"subpixels,omitempty"`

	// For extended chars (diagonal, triangle, custom):
	CharCode rune `json:"charCode,omitempty"`
}

// NewCell creates a new empty sextant cell with default colors.
func NewCell() Cell {
	return Cell{
		Type: CellTypeSextant,
		FG:   ansi.White(),
		BG:   ansi.NewDefaultColor(),
	}
}

// NewCellWithColors creates a new empty sextant cell with specified colors.
func NewCellWithColors(fg, bg ansi.Color) Cell {
	return Cell{
		Type: CellTypeSextant,
		FG:   fg,
		BG:   bg,
	}
}

// NewExtendedCell creates a cell with an extended character.
func NewExtendedCell(cellType CellType, charCode rune, fg, bg ansi.Color) Cell {
	return Cell{
		Type:     cellType,
		FG:       fg,
		BG:       bg,
		CharCode: charCode,
	}
}

// GetSubpixel returns the value of a specific subpixel.
// row: 0-2, col: 0-1
func (c *Cell) GetSubpixel(row, col int) bool {
	if row < 0 || row > 2 || col < 0 || col > 1 {
		return false
	}
	return c.Subpixels[row][col]
}

// SetSubpixel sets the value of a specific subpixel.
// row: 0-2, col: 0-1
func (c *Cell) SetSubpixel(row, col int, filled bool) {
	if row < 0 || row > 2 || col < 0 || col > 1 {
		return
	}
	c.Subpixels[row][col] = filled
}

// ToggleSubpixel toggles a specific subpixel.
func (c *Cell) ToggleSubpixel(row, col int) bool {
	if row < 0 || row > 2 || col < 0 || col > 1 {
		return false
	}
	c.Subpixels[row][col] = !c.Subpixels[row][col]
	return c.Subpixels[row][col]
}

// GetPattern returns the 6-bit sextant pattern for this cell.
func (c *Cell) GetPattern() uint8 {
	return charset.SubpixelToPattern(c.Subpixels)
}

// SetPattern sets the subpixels from a 6-bit pattern.
func (c *Cell) SetPattern(pattern uint8) {
	c.Subpixels = charset.PatternToSubpixel(pattern)
}

// ToRune returns the Unicode character for this cell.
func (c *Cell) ToRune() rune {
	switch c.Type {
	case CellTypeSextant:
		return charset.SextantPatternToRune(c.GetPattern())
	case CellTypeDiagonal, CellTypeTriangle, CellTypeCustom:
		if c.CharCode != 0 {
			return c.CharCode
		}
		return ' '
	default:
		return ' '
	}
}

// ToANSI returns the ANSI-encoded string for this cell (colors + character).
func (c *Cell) ToANSI(prevFG, prevBG *ansi.Color) string {
	var result string

	// Emit FG color if changed
	if prevFG == nil || !c.FG.Equal(*prevFG) {
		result += c.FG.FGCode()
	}

	// Emit BG color if changed
	if prevBG == nil || !c.BG.Equal(*prevBG) {
		result += c.BG.BGCode()
	}

	// Emit character
	result += string(c.ToRune())

	return result
}

// IsEmpty returns true if the cell has no filled subpixels (sextant mode)
// or no character (extended mode).
func (c *Cell) IsEmpty() bool {
	switch c.Type {
	case CellTypeSextant:
		return c.GetPattern() == 0
	default:
		return c.CharCode == 0 || c.CharCode == ' '
	}
}

// Clear resets the cell to empty state.
func (c *Cell) Clear() {
	c.Type = CellTypeSextant
	c.Subpixels = [3][2]bool{}
	c.CharCode = 0
}

// SetExtendedChar sets this cell to use an extended character.
func (c *Cell) SetExtendedChar(charCode rune) {
	if charset.IsDiagonalChar(charCode) {
		c.Type = CellTypeDiagonal
	} else if charset.IsTriangleChar(charCode) {
		c.Type = CellTypeTriangle
	} else {
		c.Type = CellTypeCustom
	}
	c.CharCode = charCode
	c.Subpixels = [3][2]bool{} // Clear subpixels
}

// ConvertToSextant converts this cell back to sextant mode.
func (c *Cell) ConvertToSextant() {
	c.Type = CellTypeSextant
	c.CharCode = 0
}

// SetChar sets this cell to display the given character.
// Automatically determines if it's a sextant pattern or extended character.
func (c *Cell) SetChar(r rune) {
	// Check if it's a sextant character
	if pattern, ok := charset.RuneToSextantPattern(r); ok {
		c.Type = CellTypeSextant
		c.SetPattern(pattern)
		c.CharCode = 0
		return
	}

	// Otherwise treat as extended character
	c.SetExtendedChar(r)
}
