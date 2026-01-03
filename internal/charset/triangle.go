package charset

// Triangle characters (U+1FB68-1FB6F) for corner triangular shapes.
// 8 characters: 4 filled corners + 4 inverse (empty corners).

// TriangleChar represents a triangle character with its properties.
type TriangleChar struct {
	Rune     rune
	Corner   string // "lower-left", "lower-right", "upper-right", "upper-left"
	Inverted bool   // If true, the corner is empty instead of filled
	Name     string
}

// CornerTriangles maps corner names to their filled versions.
var CornerTriangles = map[string]rune{
	"lower-left":  0x1FB6C, // Fill: lower-left corner
	"lower-right": 0x1FB6D, // Fill: lower-right corner
	"upper-right": 0x1FB6E, // Fill: upper-right corner
	"upper-left":  0x1FB6F, // Fill: upper-left corner
}

// InverseCornerTriangles maps corner names to their inverse (empty corner) versions.
var InverseCornerTriangles = map[string]rune{
	"lower-left":  0x1FB68, // Empty: lower-left corner (fill others)
	"lower-right": 0x1FB69, // Empty: lower-right corner
	"upper-right": 0x1FB6A, // Empty: upper-right corner
	"upper-left":  0x1FB6B, // Empty: upper-left corner
}

// AllTriangleChars contains all 8 triangle characters.
var AllTriangleChars = []TriangleChar{
	// Inverse triangles (empty corner, rest filled)
	{0x1FB68, "lower-left", true, "UPPER LEFT LOWER RIGHT DIAGONAL HALF FILL"},
	{0x1FB69, "lower-right", true, "UPPER RIGHT LOWER LEFT DIAGONAL HALF FILL"},
	{0x1FB6A, "upper-right", true, "UPPER LEFT LOWER RIGHT DIAGONAL HALF FILL"},
	{0x1FB6B, "upper-left", true, "UPPER RIGHT LOWER LEFT DIAGONAL HALF FILL"},

	// Filled triangles (corner filled, rest empty)
	{0x1FB6C, "lower-left", false, "LEFT TRIANGULAR ONE QUARTER BLOCK"},
	{0x1FB6D, "lower-right", false, "LOWER TRIANGULAR ONE QUARTER BLOCK"},
	{0x1FB6E, "upper-right", false, "RIGHT TRIANGULAR ONE QUARTER BLOCK"},
	{0x1FB6F, "upper-left", false, "UPPER TRIANGULAR ONE QUARTER BLOCK"},
}

// GetTriangleChar returns the rune for a corner triangle.
// If inverted is true, returns the version where the corner is empty.
func GetTriangleChar(corner string, inverted bool) rune {
	if inverted {
		if r, ok := InverseCornerTriangles[corner]; ok {
			return r
		}
	} else {
		if r, ok := CornerTriangles[corner]; ok {
			return r
		}
	}
	return 0
}

// IsTriangleChar checks if a rune is a triangle character.
func IsTriangleChar(r rune) bool {
	return r >= 0x1FB68 && r <= 0x1FB6F
}

// GetAllTriangleRunes returns just the rune values for UI palette display.
func GetAllTriangleRunes() []rune {
	return []rune{
		0x1FB68, 0x1FB69, 0x1FB6A, 0x1FB6B, // Inverse
		0x1FB6C, 0x1FB6D, 0x1FB6E, 0x1FB6F, // Filled
	}
}
