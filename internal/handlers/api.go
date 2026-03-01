package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"motdeditor/internal/canvas"
	"motdeditor/internal/charset"
	"motdeditor/internal/font"
	"motdeditor/internal/importer"
)

// Handlers contains the HTTP handlers and shared state.
type Handlers struct {
	font *font.HexFont
}

// NewHandlers creates a new Handlers instance.
func NewHandlers(f *font.HexFont) *Handlers {
	return &Handlers{
		font: f,
	}
}

// writeJSON writes a JSON response.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// HandleImportTxt handles POST to import text file.
func (h *Handlers) HandleImportTxt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "Failed to parse form")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to read file")
		return
	}

	text := string(content)
	if err := canvas.ValidateTextImport(text); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	newCanvas, err := canvas.ParseANSIText(text)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Failed to parse text: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, newCanvas)
}

// HandleImportPNG handles POST to import PNG file.
func (h *Handlers) HandleImportPNG(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if err := r.ParseMultipartForm(50 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "Failed to parse form")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	width := 80
	if w := r.FormValue("width"); w != "" {
		fmt.Sscanf(w, "%d", &width)
	}
	threshold := 250
	if t := r.FormValue("threshold"); t != "" {
		fmt.Sscanf(t, "%d", &threshold)
	}
	invert := r.FormValue("invert") == "true"
	useColor := r.FormValue("color") == "true"
	useBitmap := r.FormValue("bitmap") == "true"
	useExtended := r.FormValue("extended") == "true"

	opts := importer.PNGImportOptions{
		Width:       width,
		Mode:        "sextant",
		Threshold:   uint8(threshold),
		Invert:      invert,
		UseColor:    useColor,
		UseBitmap:   useBitmap,
		UseExtended: useExtended,
		HexFont:     h.font,
	}

	newCanvas, err := importer.ImportPNG(file, opts)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("Failed to import PNG: %v", err))
		return
	}

	writeJSON(w, http.StatusOK, newCanvas)
}

// HandleCharsetSextant returns all sextant characters for the palette.
func (h *Handlers) HandleCharsetSextant(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	chars := charset.AllSextantChars()
	result := make([]map[string]interface{}, len(chars))
	for i, c := range chars {
		result[i] = map[string]interface{}{
			"pattern": i,
			"char":    string(c),
			"code":    int(c),
		}
	}
	writeJSON(w, http.StatusOK, result)
}

// HandleCharsetDiagonal returns all diagonal characters for the palette.
func (h *Handlers) HandleCharsetDiagonal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	chars := charset.AllDiagonalChars
	result := make([]map[string]interface{}, len(chars))
	for i, dc := range chars {
		result[i] = map[string]interface{}{
			"char":      string(dc.Rune),
			"code":      int(dc.Rune),
			"direction": dc.Direction,
			"fill":      dc.Fill,
			"angle":     dc.Angle,
			"name":      dc.Name,
		}
	}
	writeJSON(w, http.StatusOK, result)
}

// HandleCharsetTriangle returns all triangle characters for the palette.
func (h *Handlers) HandleCharsetTriangle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	chars := charset.AllTriangleChars
	result := make([]map[string]interface{}, len(chars))
	for i, tc := range chars {
		result[i] = map[string]interface{}{
			"char":     string(tc.Rune),
			"code":     int(tc.Rune),
			"corner":   tc.Corner,
			"inverted": tc.Inverted,
			"name":     tc.Name,
		}
	}
	writeJSON(w, http.StatusOK, result)
}

// HandleGlyphs returns bitmap data for extended characters (diagonals and triangles).
func (h *Handlers) HandleGlyphs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if h.font == nil {
		writeError(w, http.StatusInternalServerError, "Font not loaded")
		return
	}

	glyphs := h.font.GetExtendedGlyphs()

	result := make(map[string][]int)
	for code, bitmap := range glyphs {
		intBitmap := make([]int, len(bitmap))
		for i, b := range bitmap {
			intBitmap[i] = int(b)
		}
		result[fmt.Sprintf("%d", code)] = intBitmap
	}

	writeJSON(w, http.StatusOK, result)
}
