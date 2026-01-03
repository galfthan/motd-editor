package font

import (
	"bufio"
	"encoding/hex"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// HexFont represents a bitmap font loaded from Unifont HEX format
type HexFont struct {
	Glyphs map[rune][]byte // codepoint -> bitmap data (16 bytes for 8x16)
}

// LoadHexFont loads a font from a HEX file
// Format: CODEPOINT:HEXDATA (e.g., "0041:00000000001C0......")
func LoadHexFont(path string) (*HexFont, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open hex font: %w", err)
	}
	defer file.Close()

	font := &HexFont{
		Glyphs: make(map[rune][]byte),
	}

	scanner := bufio.NewScanner(file)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue // Skip malformed lines
		}

		// Parse codepoint (hex without 0x prefix)
		codepoint, err := strconv.ParseInt(parts[0], 16, 32)
		if err != nil {
			continue // Skip invalid codepoints
		}

		// Parse bitmap data
		bitmapHex := parts[1]
		bitmap, err := hex.DecodeString(bitmapHex)
		if err != nil {
			continue // Skip invalid bitmap data
		}

		font.Glyphs[rune(codepoint)] = bitmap
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading hex font: %w", err)
	}

	return font, nil
}

// GetGlyph returns the bitmap data for a character
// Returns nil if the glyph is not found
func (f *HexFont) GetGlyph(r rune) []byte {
	return f.Glyphs[r]
}

// GetGlyphsInRange returns all glyphs in the given Unicode range
func (f *HexFont) GetGlyphsInRange(start, end rune) map[rune][]byte {
	result := make(map[rune][]byte)
	for r := start; r <= end; r++ {
		if glyph, ok := f.Glyphs[r]; ok {
			result[r] = glyph
		}
	}
	return result
}

// GetExtendedGlyphs returns bitmap data for diagonal and triangle characters
// Diagonals: U+1FB3C - U+1FB67
// Triangles: U+1FB68 - U+1FB6F
func (f *HexFont) GetExtendedGlyphs() map[int][]byte {
	result := make(map[int][]byte)

	// Diagonals: U+1FB3C - U+1FB67
	for r := rune(0x1FB3C); r <= rune(0x1FB67); r++ {
		if glyph, ok := f.Glyphs[r]; ok {
			result[int(r)] = glyph
		}
	}

	// Triangles: U+1FB68 - U+1FB6F
	for r := rune(0x1FB68); r <= rune(0x1FB6F); r++ {
		if glyph, ok := f.Glyphs[r]; ok {
			result[int(r)] = glyph
		}
	}

	return result
}
