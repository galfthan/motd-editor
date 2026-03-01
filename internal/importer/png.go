package importer

import (
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"

	"motdeditor/internal/ansi"
	"motdeditor/internal/canvas"
	"motdeditor/internal/charset"
	"motdeditor/internal/font"

	"golang.org/x/image/draw"
)

// PNGImportOptions configures the PNG import.
type PNGImportOptions struct {
	Width       int            // Target width in characters
	Mode        string         // "sextant" or "quadrant"
	Threshold   uint8          // B/W threshold (0-255, default 250)
	Invert      bool           // Invert black/white
	UseColor    bool           // Extract colors from image
	UseBitmap   bool           // Use bitmap matching (8×16 comparison)
	UseExtended bool           // Include diagonals/triangles in bitmap matching
	HexFont     *font.HexFont  // Font for bitmap matching (required if UseBitmap)
}

// ImportPNG imports a PNG image and converts it to a canvas.
func ImportPNG(reader io.Reader, opts PNGImportOptions) (*canvas.Canvas, error) {
	// Set defaults
	if opts.Width < 1 {
		opts.Width = 80
	}
	if opts.Width > 500 {
		opts.Width = 500
	}
	if opts.Mode == "" {
		opts.Mode = "sextant"
	}
	if opts.Threshold == 0 {
		opts.Threshold = 250
	}

	// Decode image
	img, _, err := image.Decode(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to decode image: %w", err)
	}

	// Convert to RGBA for easier processing
	bounds := img.Bounds()
	rgba := image.NewRGBA(bounds)
	draw.Draw(rgba, bounds, img, bounds.Min, draw.Src)

	// Handle transparency by compositing on white background
	rgbImg := compositeOnWhite(rgba)

	// Calculate dimensions
	charWidth := opts.Width
	aspectRatio := float64(bounds.Dy()) / float64(bounds.Dx())

	var charHeight int
	var pixelWidth, pixelHeight int

	// Terminal characters are approximately 1:2 aspect ratio (width:height)
	// For correct aspect in terminal output, divide by 2
	charHeight = int(float64(charWidth) * aspectRatio / 2)

	if opts.UseBitmap {
		// Bitmap mode: 8×16 pixels per character (native glyph resolution)
		pixelWidth = charWidth * 8
		pixelHeight = charHeight * 16
	} else {
		// Sextant mode: 2×3 subpixels per character
		cellW, cellH := getCellDimensions(opts.Mode)
		pixelWidth = charWidth * cellW
		pixelHeight = charHeight * cellH
	}

	if charHeight < 1 {
		charHeight = 1
	}
	if charHeight > 200 {
		charHeight = 200
	}

	// Resize image to target resolution
	resized := resize(rgbImg, pixelWidth, pixelHeight)

	// Create binary mask
	binary := createForegroundMask(resized, opts.Threshold)
	if opts.Invert {
		binary = invertMask(binary)
	}

	// Create canvas
	c := canvas.NewCanvas(charWidth, charHeight, opts.Mode)

	// Extract dominant colors if using color mode
	var palette []color.RGBA
	if opts.UseColor {
		palette = getDominantColors(rgbImg, 0.01)
	}

	if opts.UseBitmap {
		// Bitmap matching mode
		matcher := NewGlyphMatcher(opts.HexFont, opts.UseExtended)
		for cy := 0; cy < charHeight; cy++ {
			for cx := 0; cx < charWidth; cx++ {
				// Extract 8×16 region as bitmap
				region := extractBitmapRegion(binary, cx*8, cy*16, 8, 16)
				bestRune, _ := matcher.FindBestMatch(region)

				cell := c.GetCell(cx, cy)
				if cell != nil {
					cell.SetChar(bestRune)

					// Set colors if in color mode
					if opts.UseColor && len(palette) > 0 {
						fg := sampleCellColor(rgbImg, cx, cy, charWidth, charHeight, palette)
						cell.FG = fg
					}
				}
			}
		}
	} else {
		// Original sextant pattern mode
		for cy := 0; cy < charHeight; cy++ {
			for cx := 0; cx < charWidth; cx++ {
				pattern := getSextantPattern(binary, cx, cy)
				cell := c.GetCell(cx, cy)
				if cell != nil {
					cell.SetPattern(pattern)

					// Set colors if in color mode
					if opts.UseColor && len(palette) > 0 {
						fg := sampleCellColor(rgbImg, cx, cy, charWidth, charHeight, palette)
						cell.FG = fg
					}
				}
			}
		}
	}

	return c, nil
}

// extractBitmapRegion extracts a region from the binary mask as packed bytes.
// Each byte represents 8 horizontal pixels (MSB = leftmost).
func extractBitmapRegion(binary [][]bool, x, y, w, h int) []byte {
	result := make([]byte, h)
	height := len(binary)
	width := 0
	if height > 0 {
		width = len(binary[0])
	}

	for row := 0; row < h; row++ {
		py := y + row
		if py < 0 || py >= height {
			continue
		}

		var b byte
		for col := 0; col < w; col++ {
			px := x + col
			if px >= 0 && px < width && binary[py][px] {
				b |= (0x80 >> col) // MSB first
			}
		}
		result[row] = b
	}

	return result
}

// getCellDimensions returns (width, height) of a cell in subpixels.
func getCellDimensions(mode string) (int, int) {
	switch mode {
	case "quadrant":
		return 2, 2
	default: // sextant
		return 2, 3
	}
}

// compositeOnWhite creates an RGB image with transparent pixels as white.
func compositeOnWhite(img *image.RGBA) *image.RGBA {
	bounds := img.Bounds()
	result := image.NewRGBA(bounds)

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := img.RGBAAt(x, y)
			if c.A < 255 {
				// Blend with white based on alpha
				alpha := float64(c.A) / 255.0
				r := uint8(float64(c.R)*alpha + 255*(1-alpha))
				g := uint8(float64(c.G)*alpha + 255*(1-alpha))
				b := uint8(float64(c.B)*alpha + 255*(1-alpha))
				result.SetRGBA(x, y, color.RGBA{r, g, b, 255})
			} else {
				result.SetRGBA(x, y, c)
			}
		}
	}

	return result
}

// resize scales an image to the target dimensions.
func resize(img *image.RGBA, width, height int) *image.RGBA {
	bounds := img.Bounds()
	result := image.NewRGBA(image.Rect(0, 0, width, height))

	// Use nearest-neighbor scaling for crisp binary result
	draw.NearestNeighbor.Scale(result, result.Bounds(), img, bounds, draw.Src, nil)

	return result
}

// createForegroundMask creates a binary mask where true = foreground.
// Foreground is detected as pixels that differ significantly from white.
func createForegroundMask(img *image.RGBA, threshold uint8) [][]bool {
	bounds := img.Bounds()
	mask := make([][]bool, bounds.Dy())

	for y := 0; y < bounds.Dy(); y++ {
		mask[y] = make([]bool, bounds.Dx())
		for x := 0; x < bounds.Dx(); x++ {
			c := img.RGBAAt(x+bounds.Min.X, y+bounds.Min.Y)
			// Foreground = any channel significantly below white
			isForeground := c.R < threshold || c.G < threshold || c.B < threshold
			mask[y][x] = isForeground
		}
	}

	return mask
}

// invertMask inverts a binary mask.
func invertMask(mask [][]bool) [][]bool {
	for y := range mask {
		for x := range mask[y] {
			mask[y][x] = !mask[y][x]
		}
	}
	return mask
}

// getSextantPattern extracts the 6-bit pattern for a cell.
func getSextantPattern(binary [][]bool, cx, cy int) uint8 {
	px, py := cx*2, cy*3
	height := len(binary)
	width := 0
	if height > 0 {
		width = len(binary[0])
	}

	getBit := func(x, y int) bool {
		if x < 0 || x >= width || y < 0 || y >= height {
			return false
		}
		return binary[y][x]
	}

	var pattern uint8
	if getBit(px, py) {
		pattern |= 1
	}
	if getBit(px+1, py) {
		pattern |= 2
	}
	if getBit(px, py+1) {
		pattern |= 4
	}
	if getBit(px+1, py+1) {
		pattern |= 8
	}
	if getBit(px, py+2) {
		pattern |= 16
	}
	if getBit(px+1, py+2) {
		pattern |= 32
	}

	return pattern
}

// getDominantColors finds colors that represent at least minRatio of foreground.
func getDominantColors(img *image.RGBA, minRatio float64) []color.RGBA {
	bounds := img.Bounds()
	colorCounts := make(map[color.RGBA]int)
	total := 0

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := img.RGBAAt(x, y)
			// Skip near-white pixels (background)
			if c.R < 250 || c.G < 250 || c.B < 250 {
				colorCounts[c]++
				total++
			}
		}
	}

	if total == 0 {
		return nil
	}

	// Filter to colors above threshold
	minCount := int(float64(total) * minRatio)
	var dominant []color.RGBA
	for c, count := range colorCounts {
		if count >= minCount {
			dominant = append(dominant, c)
		}
	}

	return dominant
}

// sampleCellColor finds the dominant palette color for a cell.
func sampleCellColor(img *image.RGBA, cx, cy, charWidth, charHeight int, palette []color.RGBA) ansi.Color {
	if len(palette) == 0 {
		return ansi.White()
	}

	bounds := img.Bounds()
	origW := bounds.Dx()
	origH := bounds.Dy()

	// Map cell to original image region
	xStart := cx * origW / charWidth
	xEnd := (cx + 1) * origW / charWidth
	yStart := cy * origH / charHeight
	yEnd := (cy + 1) * origH / charHeight

	// Count palette colors in this region
	colorCounts := make(map[color.RGBA]int)
	for _, c := range palette {
		colorCounts[c] = 0
	}

	for y := yStart; y < yEnd; y++ {
		for x := xStart; x < xEnd; x++ {
			if x >= 0 && x < origW && y >= 0 && y < origH {
				c := img.RGBAAt(x+bounds.Min.X, y+bounds.Min.Y)
				// Find closest palette color
				closest := findClosestColor(c, palette)
				colorCounts[closest]++
			}
		}
	}

	// Find most common color
	var maxColor color.RGBA
	maxCount := 0
	for c, count := range colorCounts {
		if count > maxCount {
			maxCount = count
			maxColor = c
		}
	}

	if maxCount > 0 {
		return ansi.NewColor(maxColor.R, maxColor.G, maxColor.B)
	}
	return ansi.NewColor(palette[0].R, palette[0].G, palette[0].B)
}

// findClosestColor finds the closest palette color to the given color.
func findClosestColor(c color.RGBA, palette []color.RGBA) color.RGBA {
	minDist := int(^uint(0) >> 1) // Max int
	var closest color.RGBA

	for _, p := range palette {
		dr := int(c.R) - int(p.R)
		dg := int(c.G) - int(p.G)
		db := int(c.B) - int(p.B)
		dist := dr*dr + dg*dg + db*db
		if dist < minDist {
			minDist = dist
			closest = p
		}
	}

	return closest
}

// Verify pattern-to-char mapping is consistent
func init() {
	// Test a few key patterns
	_ = charset.SextantPatternToRune(0)  // Should be space
	_ = charset.SextantPatternToRune(63) // Should be full block
	_ = charset.SextantPatternToRune(21) // Should be left half
	_ = charset.SextantPatternToRune(42) // Should be right half
}
