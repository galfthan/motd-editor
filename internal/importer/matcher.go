package importer

import (
	"math/bits"

	"asciiart/internal/charset"
	"asciiart/internal/font"
)

// GlyphCandidate represents a character and its bitmap for matching.
type GlyphCandidate struct {
	Rune   rune
	Bitmap []byte // 16 bytes (8×16 bits)
}

// GlyphMatcher finds the best matching character for an image region.
type GlyphMatcher struct {
	candidates []GlyphCandidate
}

// NewGlyphMatcher creates a matcher with sextant characters,
// and optionally diagonal/triangle characters.
func NewGlyphMatcher(hexFont *font.HexFont, includeExtended bool) *GlyphMatcher {
	m := &GlyphMatcher{}

	// Add all 64 sextant patterns
	for pattern := uint8(0); pattern < 64; pattern++ {
		r := charset.SextantPatternToRune(pattern)
		bitmap := m.getSextantBitmap(hexFont, r, pattern)
		if bitmap != nil {
			m.candidates = append(m.candidates, GlyphCandidate{
				Rune:   r,
				Bitmap: bitmap,
			})
		}
	}

	// Add extended characters if requested
	if includeExtended && hexFont != nil {
		// Diagonals: U+1FB3C - U+1FB67
		for r := rune(0x1FB3C); r <= rune(0x1FB67); r++ {
			if bitmap := hexFont.GetGlyph(r); bitmap != nil && len(bitmap) == 16 {
				m.candidates = append(m.candidates, GlyphCandidate{
					Rune:   r,
					Bitmap: bitmap,
				})
			}
		}

		// Triangles: U+1FB68 - U+1FB6F
		for r := rune(0x1FB68); r <= rune(0x1FB6F); r++ {
			if bitmap := hexFont.GetGlyph(r); bitmap != nil && len(bitmap) == 16 {
				m.candidates = append(m.candidates, GlyphCandidate{
					Rune:   r,
					Bitmap: bitmap,
				})
			}
		}
	}

	return m
}

// getSextantBitmap gets or generates the bitmap for a sextant character.
func (m *GlyphMatcher) getSextantBitmap(hexFont *font.HexFont, r rune, pattern uint8) []byte {
	// Try to get from font first
	if hexFont != nil {
		if bitmap := hexFont.GetGlyph(r); bitmap != nil && len(bitmap) == 16 {
			return bitmap
		}
	}

	// Generate bitmap from pattern
	// Each sextant cell is approximately 4×5 pixels in 8×16
	// Layout: 2 columns (4px each), 3 rows (5,5,6 pixels)
	bitmap := make([]byte, 16)

	// Row heights: 5, 5, 6 pixels (total 16)
	rowHeights := []int{5, 5, 6}
	rowStart := 0

	for row := 0; row < 3; row++ {
		leftBit := (pattern >> (row * 2)) & 1
		rightBit := (pattern >> (row*2 + 1)) & 1

		var rowByte byte
		if leftBit != 0 {
			rowByte |= 0xF0 // Left 4 pixels on
		}
		if rightBit != 0 {
			rowByte |= 0x0F // Right 4 pixels on
		}

		for y := rowStart; y < rowStart+rowHeights[row]; y++ {
			bitmap[y] = rowByte
		}
		rowStart += rowHeights[row]
	}

	return bitmap
}

// FindBestMatch finds the character whose bitmap best matches the region.
// Returns the matching rune and the difference score (lower is better).
func (m *GlyphMatcher) FindBestMatch(region []byte) (rune, int) {
	if len(m.candidates) == 0 {
		return ' ', 128
	}

	bestRune := m.candidates[0].Rune
	bestDiff := bitmapDiff(region, m.candidates[0].Bitmap)

	for i := 1; i < len(m.candidates); i++ {
		diff := bitmapDiff(region, m.candidates[i].Bitmap)
		if diff < bestDiff {
			bestDiff = diff
			bestRune = m.candidates[i].Rune
		}
	}

	return bestRune, bestDiff
}

// bitmapDiff calculates Hamming distance between two 8×16 bitmaps.
// Returns count of differing bits (0-128).
func bitmapDiff(a, b []byte) int {
	diff := 0
	minLen := len(a)
	if len(b) < minLen {
		minLen = len(b)
	}

	for i := 0; i < minLen; i++ {
		diff += bits.OnesCount8(a[i] ^ b[i])
	}

	// Count remaining bytes as all different
	for i := minLen; i < len(a); i++ {
		diff += bits.OnesCount8(a[i])
	}
	for i := minLen; i < len(b); i++ {
		diff += bits.OnesCount8(b[i])
	}

	return diff
}

// CandidateCount returns the number of candidate glyphs.
func (m *GlyphMatcher) CandidateCount() int {
	return len(m.candidates)
}
