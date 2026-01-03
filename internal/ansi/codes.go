package ansi

import "fmt"

// ANSI escape code constants
const (
	Reset     = "\x1b[0m"
	DefaultFG = "\x1b[39m"
	DefaultBG = "\x1b[49m"
)

// FGColor generates an ANSI 24-bit foreground color code.
func FGColor(r, g, b uint8) string {
	return fmt.Sprintf("\x1b[38;2;%d;%d;%dm", r, g, b)
}

// BGColor generates an ANSI 24-bit background color code.
func BGColor(r, g, b uint8) string {
	return fmt.Sprintf("\x1b[48;2;%d;%d;%dm", r, g, b)
}

// Color represents an RGB color with optional "default" flag.
type Color struct {
	R       uint8 `json:"r"`
	G       uint8 `json:"g"`
	B       uint8 `json:"b"`
	Default bool  `json:"default"` // Use terminal default color
}

// NewColor creates a new RGB color.
func NewColor(r, g, b uint8) Color {
	return Color{R: r, G: g, B: b, Default: false}
}

// NewDefaultColor creates a color that uses terminal default.
func NewDefaultColor() Color {
	return Color{Default: true}
}

// White returns white color.
func White() Color {
	return NewColor(255, 255, 255)
}

// Black returns black color.
func Black() Color {
	return NewColor(0, 0, 0)
}

// FGCode returns the ANSI foreground code for this color.
func (c Color) FGCode() string {
	if c.Default {
		return DefaultFG
	}
	return FGColor(c.R, c.G, c.B)
}

// BGCode returns the ANSI background code for this color.
func (c Color) BGCode() string {
	if c.Default {
		return DefaultBG
	}
	return BGColor(c.R, c.G, c.B)
}

// Equal checks if two colors are equal.
func (c Color) Equal(other Color) bool {
	if c.Default != other.Default {
		return false
	}
	if c.Default {
		return true
	}
	return c.R == other.R && c.G == other.G && c.B == other.B
}

// ToHex returns the color as a hex string (e.g., "#ff0000").
func (c Color) ToHex() string {
	if c.Default {
		return "default"
	}
	return fmt.Sprintf("#%02x%02x%02x", c.R, c.G, c.B)
}

// FromHex parses a hex color string (e.g., "#ff0000" or "ff0000").
func FromHex(hex string) (Color, error) {
	if hex == "default" {
		return NewDefaultColor(), nil
	}
	// Strip leading #
	if len(hex) > 0 && hex[0] == '#' {
		hex = hex[1:]
	}
	if len(hex) != 6 {
		return Color{}, fmt.Errorf("invalid hex color: %s", hex)
	}
	var r, g, b uint8
	_, err := fmt.Sscanf(hex, "%02x%02x%02x", &r, &g, &b)
	if err != nil {
		return Color{}, fmt.Errorf("invalid hex color: %s", hex)
	}
	return NewColor(r, g, b), nil
}
