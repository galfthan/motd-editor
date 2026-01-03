package charset

// Diagonal characters (U+1FB3C-1FB67) for smooth diagonal lines.
// 44 characters organized by fill corner and line direction.

// DiagonalChar represents a diagonal character with its properties.
type DiagonalChar struct {
	Rune      rune
	Direction string // "down-right" (backslash) or "down-left" (slash)
	Fill      string // "above" or "below" the diagonal line
	Angle     string // "steep", "mid", or "shallow"
	Name      string // Unicode name
}

// DiagonalChars maps (direction, fill, angle) to Unicode codepoints.
// Key format: "direction-fill-angle"
var DiagonalCharMap = map[string]rune{
	// Down-right (backslash), fill below (lower-left block)
	"down-right-below-steep":   0x1FB40,
	"down-right-below-mid":     0x1FB3F,
	"down-right-below-shallow": 0x1FB3D,

	// Down-right (backslash), fill above (upper-right block)
	"down-right-above-steep":   0x1FB56,
	"down-right-above-mid":     0x1FB55,
	"down-right-above-shallow": 0x1FB53,

	// Down-left (slash), fill below (lower-right block)
	"down-left-below-steep":   0x1FB45,
	"down-left-below-mid":     0x1FB4A,
	"down-left-below-shallow": 0x1FB48,

	// Down-left (slash), fill above (upper-left block)
	"down-left-above-steep":   0x1FB5B,
	"down-left-above-mid":     0x1FB60,
	"down-left-above-shallow": 0x1FB5E,
}

// AllDiagonalChars contains all 44 diagonal characters from U+1FB3C to U+1FB67.
var AllDiagonalChars = []DiagonalChar{
	// Lower left block (U+1FB3C-1FB4B) - down-right, fill below
	{0x1FB3C, "down-right", "below", "shallow", "LOWER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER CENTRE"},
	{0x1FB3D, "down-right", "below", "shallow", "LOWER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER RIGHT"},
	{0x1FB3E, "down-right", "below", "mid", "LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER CENTRE"},
	{0x1FB3F, "down-right", "below", "mid", "LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER RIGHT"},
	{0x1FB40, "down-right", "below", "steep", "LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO LOWER CENTRE"},

	// Lower right block (U+1FB41-1FB4B) - down-left, fill below
	{0x1FB41, "down-left", "below", "shallow", "LOWER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER CENTRE"},
	{0x1FB42, "down-left", "below", "shallow", "LOWER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER RIGHT"},
	{0x1FB43, "down-left", "below", "mid", "LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER CENTRE"},
	{0x1FB44, "down-left", "below", "mid", "LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER RIGHT"},
	{0x1FB45, "down-left", "below", "steep", "LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO UPPER CENTRE"},
	{0x1FB46, "down-left", "below", "mid", "LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER MIDDLE RIGHT"},
	{0x1FB47, "down-left", "below", "shallow", "LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO LOWER MIDDLE RIGHT"},
	{0x1FB48, "down-left", "below", "shallow", "LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO LOWER MIDDLE RIGHT"},
	{0x1FB49, "down-left", "below", "mid", "LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO UPPER MIDDLE RIGHT"},
	{0x1FB4A, "down-left", "below", "mid", "LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO UPPER MIDDLE RIGHT"},
	{0x1FB4B, "down-left", "below", "steep", "LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO UPPER RIGHT"},

	// More lower-left continuation
	{0x1FB4C, "down-right", "below", "mid", "LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO UPPER MIDDLE RIGHT"},
	{0x1FB4D, "down-right", "below", "mid", "LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO UPPER MIDDLE RIGHT"},
	{0x1FB4E, "down-right", "below", "mid", "LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO LOWER MIDDLE RIGHT"},
	{0x1FB4F, "down-right", "below", "mid", "LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO LOWER MIDDLE RIGHT"},
	{0x1FB50, "down-right", "below", "steep", "LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO LOWER RIGHT"},
	{0x1FB51, "down-right", "below", "mid", "LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER MIDDLE RIGHT"},

	// Upper right block (U+1FB52-1FB5B) - down-right, fill above
	{0x1FB52, "down-right", "above", "shallow", "UPPER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER CENTRE"},
	{0x1FB53, "down-right", "above", "shallow", "UPPER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER RIGHT"},
	{0x1FB54, "down-right", "above", "mid", "UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER CENTRE"},
	{0x1FB55, "down-right", "above", "mid", "UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER RIGHT"},
	{0x1FB56, "down-right", "above", "steep", "UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO LOWER CENTRE"},

	// Upper left block (U+1FB57-1FB67) - down-left, fill above
	{0x1FB57, "down-left", "above", "shallow", "UPPER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER CENTRE"},
	{0x1FB58, "down-left", "above", "shallow", "UPPER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER RIGHT"},
	{0x1FB59, "down-left", "above", "mid", "UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER CENTRE"},
	{0x1FB5A, "down-left", "above", "mid", "UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER RIGHT"},
	{0x1FB5B, "down-left", "above", "steep", "UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO UPPER CENTRE"},
	{0x1FB5C, "down-left", "above", "mid", "UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER MIDDLE RIGHT"},
	{0x1FB5D, "down-left", "above", "shallow", "UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO LOWER MIDDLE RIGHT"},
	{0x1FB5E, "down-left", "above", "shallow", "UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO LOWER MIDDLE RIGHT"},
	{0x1FB5F, "down-left", "above", "mid", "UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO UPPER MIDDLE RIGHT"},
	{0x1FB60, "down-left", "above", "mid", "UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO UPPER MIDDLE RIGHT"},
	{0x1FB61, "down-left", "above", "steep", "UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO UPPER RIGHT"},

	// Upper right continuation
	{0x1FB62, "down-right", "above", "mid", "UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO UPPER MIDDLE RIGHT"},
	{0x1FB63, "down-right", "above", "mid", "UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO UPPER MIDDLE RIGHT"},
	{0x1FB64, "down-right", "above", "mid", "UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO LOWER MIDDLE RIGHT"},
	{0x1FB65, "down-right", "above", "mid", "UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO LOWER MIDDLE RIGHT"},
	{0x1FB66, "down-right", "above", "steep", "UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO LOWER RIGHT"},
	{0x1FB67, "down-right", "above", "mid", "UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER MIDDLE RIGHT"},
}

// GetDiagonalChar returns the rune for a given direction, fill, and angle.
func GetDiagonalChar(direction, fill, angle string) rune {
	key := direction + "-" + fill + "-" + angle
	if r, ok := DiagonalCharMap[key]; ok {
		return r
	}
	return 0
}

// IsDiagonalChar checks if a rune is a diagonal character.
func IsDiagonalChar(r rune) bool {
	return r >= 0x1FB3C && r <= 0x1FB67
}

// GetAllDiagonalRunes returns just the rune values for UI palette display.
func GetAllDiagonalRunes() []rune {
	runes := make([]rune, len(AllDiagonalChars))
	for i, dc := range AllDiagonalChars {
		runes[i] = dc.Rune
	}
	return runes
}
