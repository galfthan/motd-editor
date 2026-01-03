package charset

// Sextant characters use a 2x3 subpixel grid (6 bits) to represent 64 patterns.
// Grid layout:
//   +---+---+
//   | 0 | 1 |  bit0=pos0, bit1=pos1
//   +---+---+
//   | 2 | 3 |  bit2=pos2, bit3=pos3
//   +---+---+
//   | 4 | 5 |  bit4=pos4, bit5=pos5
//   +---+---+
//
// Pattern = bit0*1 + bit1*2 + bit2*4 + bit3*8 + bit4*16 + bit5*32

const (
	SextantEmpty     = 0  // All bits off -> space
	SextantFull      = 63 // All bits on -> full block
	SextantLeftHalf  = 21 // bits 0,2,4 = 1+4+16 -> left half
	SextantRightHalf = 42 // bits 1,3,5 = 2+8+32 -> right half
)

// SextantPatternToRune converts a 6-bit pattern to its Unicode character.
// Special cases use standard block characters for wider font support.
func SextantPatternToRune(pattern uint8) rune {
	switch pattern {
	case SextantEmpty:
		return ' ' // Empty cell
	case SextantFull:
		return '\u2588' // Full block
	case SextantLeftHalf:
		return '\u258C' // Left half block
	case SextantRightHalf:
		return '\u2590' // Right half block
	}

	// Calculate offset into U+1FB00 range
	// We need to skip the special patterns that map to standard chars
	offset := int(pattern)
	if pattern > 42 {
		offset -= 3 // Skip patterns 0, 21, 42 (63 is beyond the range)
	} else if pattern > 21 {
		offset -= 2 // Skip patterns 0, 21
	} else {
		offset -= 1 // Skip pattern 0
	}

	return rune(0x1FB00 + offset)
}

// RuneToSextantPattern converts a Unicode character back to its 6-bit pattern.
// Returns the pattern and true if valid, or 0 and false if not a sextant char.
func RuneToSextantPattern(r rune) (uint8, bool) {
	// Check standard block characters first
	switch r {
	case ' ':
		return SextantEmpty, true
	case '\u2588': // Full block
		return SextantFull, true
	case '\u258C': // Left half
		return SextantLeftHalf, true
	case '\u2590': // Right half
		return SextantRightHalf, true
	}

	// Check if in sextant range U+1FB00 to U+1FB3B (60 characters)
	if r < 0x1FB00 || r > 0x1FB3B {
		return 0, false
	}

	// Reverse the offset calculation
	offset := int(r - 0x1FB00)

	// Add back the skipped special patterns
	pattern := offset + 1 // Add 1 for pattern 0
	if pattern >= 21 {
		pattern++ // Add 1 for pattern 21
	}
	if pattern >= 42 {
		pattern++ // Add 1 for pattern 42
	}

	return uint8(pattern), true
}

// SubpixelToPattern converts a 2x3 grid of booleans to a 6-bit pattern.
// Input: subpixels[row][col] where row is 0-2, col is 0-1
func SubpixelToPattern(subpixels [3][2]bool) uint8 {
	var pattern uint8
	if subpixels[0][0] {
		pattern |= 1
	}
	if subpixels[0][1] {
		pattern |= 2
	}
	if subpixels[1][0] {
		pattern |= 4
	}
	if subpixels[1][1] {
		pattern |= 8
	}
	if subpixels[2][0] {
		pattern |= 16
	}
	if subpixels[2][1] {
		pattern |= 32
	}
	return pattern
}

// PatternToSubpixel converts a 6-bit pattern to a 2x3 grid of booleans.
func PatternToSubpixel(pattern uint8) [3][2]bool {
	return [3][2]bool{
		{pattern&1 != 0, pattern&2 != 0},
		{pattern&4 != 0, pattern&8 != 0},
		{pattern&16 != 0, pattern&32 != 0},
	}
}

// AllSextantChars returns all 64 sextant characters in pattern order.
func AllSextantChars() []rune {
	chars := make([]rune, 64)
	for i := 0; i < 64; i++ {
		chars[i] = SextantPatternToRune(uint8(i))
	}
	return chars
}
