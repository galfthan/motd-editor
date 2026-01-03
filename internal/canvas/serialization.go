package canvas

import (
	"asciiart/internal/ansi"
	"asciiart/internal/charset"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// ParseANSIText imports text with ANSI codes back to a canvas.
// Auto-detects canvas dimensions from the content.
func ParseANSIText(text string) (*Canvas, error) {
	// Split into lines
	lines := strings.Split(text, "\n")

	// Remove trailing empty lines
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}

	if len(lines) == 0 {
		return NewCanvas(1, 1, "sextant"), nil
	}

	// Parse each line to extract characters and colors
	var parsedLines [][]ParsedCell
	maxWidth := 0

	for _, line := range lines {
		cells := parseLine(line)
		parsedLines = append(parsedLines, cells)
		if len(cells) > maxWidth {
			maxWidth = len(cells)
		}
	}

	// Create canvas with detected dimensions
	canvas := NewCanvas(maxWidth, len(parsedLines), "sextant")

	// Fill canvas with parsed content
	for y, cells := range parsedLines {
		for x, pc := range cells {
			cell := canvas.GetCell(x, y)
			if cell == nil {
				continue
			}

			cell.FG = pc.FG
			cell.BG = pc.BG

			// Try to identify the character type
			if pattern, ok := charset.RuneToSextantPattern(pc.Char); ok {
				cell.Type = CellTypeSextant
				cell.SetPattern(pattern)
			} else if charset.IsDiagonalChar(pc.Char) {
				cell.Type = CellTypeDiagonal
				cell.CharCode = pc.Char
			} else if charset.IsTriangleChar(pc.Char) {
				cell.Type = CellTypeTriangle
				cell.CharCode = pc.Char
			} else {
				// Treat as custom character
				cell.Type = CellTypeCustom
				cell.CharCode = pc.Char
			}
		}
	}

	return canvas, nil
}

// ParsedCell represents a parsed character with its colors.
type ParsedCell struct {
	Char rune
	FG   ansi.Color
	BG   ansi.Color
}

// ANSI escape sequence regex
var ansiRegex = regexp.MustCompile(`\x1b\[([0-9;]*)m`)

// parseLine parses a single line of ANSI-encoded text.
func parseLine(line string) []ParsedCell {
	var cells []ParsedCell
	currentFG := ansi.White()
	currentBG := ansi.NewDefaultColor()

	pos := 0
	for pos < len(line) {
		// Check for ANSI escape sequence
		if line[pos] == '\x1b' {
			loc := ansiRegex.FindStringSubmatchIndex(line[pos:])
			if loc != nil && loc[0] == 0 {
				// Parse the escape sequence
				codes := line[pos+loc[2] : pos+loc[3]]
				parseCodes(codes, &currentFG, &currentBG)
				pos += loc[1]
				continue
			}
		}

		// Read a single rune
		r, size := utf8.DecodeRuneInString(line[pos:])
		if r != utf8.RuneError {
			cells = append(cells, ParsedCell{
				Char: r,
				FG:   currentFG,
				BG:   currentBG,
			})
		}
		pos += size
	}

	return cells
}

// parseCodes parses ANSI SGR codes and updates colors.
func parseCodes(codes string, fg, bg *ansi.Color) {
	if codes == "" || codes == "0" {
		// Reset
		*fg = ansi.White()
		*bg = ansi.NewDefaultColor()
		return
	}

	parts := strings.Split(codes, ";")
	i := 0
	for i < len(parts) {
		code, err := strconv.Atoi(parts[i])
		if err != nil {
			i++
			continue
		}

		switch code {
		case 0: // Reset
			*fg = ansi.White()
			*bg = ansi.NewDefaultColor()
		case 39: // Default FG
			*fg = ansi.NewDefaultColor()
		case 49: // Default BG
			*bg = ansi.NewDefaultColor()
		case 38: // Extended FG color
			if i+1 < len(parts) {
				mode, _ := strconv.Atoi(parts[i+1])
				if mode == 2 && i+4 < len(parts) {
					// 24-bit color
					r, _ := strconv.Atoi(parts[i+2])
					g, _ := strconv.Atoi(parts[i+3])
					b, _ := strconv.Atoi(parts[i+4])
					*fg = ansi.NewColor(uint8(r), uint8(g), uint8(b))
					i += 4
				} else if mode == 5 && i+2 < len(parts) {
					// 256-color (convert to approximate RGB)
					colorNum, _ := strconv.Atoi(parts[i+2])
					*fg = color256ToRGB(colorNum)
					i += 2
				}
			}
		case 48: // Extended BG color
			if i+1 < len(parts) {
				mode, _ := strconv.Atoi(parts[i+1])
				if mode == 2 && i+4 < len(parts) {
					// 24-bit color
					r, _ := strconv.Atoi(parts[i+2])
					g, _ := strconv.Atoi(parts[i+3])
					b, _ := strconv.Atoi(parts[i+4])
					*bg = ansi.NewColor(uint8(r), uint8(g), uint8(b))
					i += 4
				} else if mode == 5 && i+2 < len(parts) {
					// 256-color
					colorNum, _ := strconv.Atoi(parts[i+2])
					*bg = color256ToRGB(colorNum)
					i += 2
				}
			}
		default:
			// Handle basic 16-color codes
			if code >= 30 && code <= 37 {
				*fg = basicColor(code - 30)
			} else if code >= 40 && code <= 47 {
				*bg = basicColor(code - 40)
			} else if code >= 90 && code <= 97 {
				*fg = brightColor(code - 90)
			} else if code >= 100 && code <= 107 {
				*bg = brightColor(code - 100)
			}
		}
		i++
	}
}

// basicColor converts a basic color index (0-7) to RGB.
func basicColor(index int) ansi.Color {
	colors := []ansi.Color{
		ansi.NewColor(0, 0, 0),       // Black
		ansi.NewColor(170, 0, 0),     // Red
		ansi.NewColor(0, 170, 0),     // Green
		ansi.NewColor(170, 85, 0),    // Yellow
		ansi.NewColor(0, 0, 170),     // Blue
		ansi.NewColor(170, 0, 170),   // Magenta
		ansi.NewColor(0, 170, 170),   // Cyan
		ansi.NewColor(170, 170, 170), // White
	}
	if index >= 0 && index < len(colors) {
		return colors[index]
	}
	return ansi.White()
}

// brightColor converts a bright color index (0-7) to RGB.
func brightColor(index int) ansi.Color {
	colors := []ansi.Color{
		ansi.NewColor(85, 85, 85),    // Bright Black (Gray)
		ansi.NewColor(255, 85, 85),   // Bright Red
		ansi.NewColor(85, 255, 85),   // Bright Green
		ansi.NewColor(255, 255, 85),  // Bright Yellow
		ansi.NewColor(85, 85, 255),   // Bright Blue
		ansi.NewColor(255, 85, 255),  // Bright Magenta
		ansi.NewColor(85, 255, 255),  // Bright Cyan
		ansi.NewColor(255, 255, 255), // Bright White
	}
	if index >= 0 && index < len(colors) {
		return colors[index]
	}
	return ansi.White()
}

// color256ToRGB converts a 256-color index to RGB.
func color256ToRGB(index int) ansi.Color {
	if index < 16 {
		// Standard colors
		if index < 8 {
			return basicColor(index)
		}
		return brightColor(index - 8)
	} else if index < 232 {
		// Color cube (6x6x6)
		index -= 16
		r := (index / 36) % 6
		g := (index / 6) % 6
		b := index % 6
		return ansi.NewColor(
			uint8(r*51),
			uint8(g*51),
			uint8(b*51),
		)
	} else {
		// Grayscale
		gray := uint8((index-232)*10 + 8)
		return ansi.NewColor(gray, gray, gray)
	}
}

// ValidateTextImport checks if text can be imported.
func ValidateTextImport(text string) error {
	if len(text) == 0 {
		return fmt.Errorf("empty text")
	}
	if len(text) > 10*1024*1024 { // 10MB limit
		return fmt.Errorf("text too large (max 10MB)")
	}
	return nil
}
