package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	"motdeditor/internal/ansi"
	"motdeditor/internal/canvas"
	"motdeditor/internal/charset"
	"motdeditor/internal/font"
	"motdeditor/internal/importer"
)

// Handlers contains the HTTP handlers and shared state.
type Handlers struct {
	canvas *canvas.Canvas
	font   *font.HexFont
	mu     sync.RWMutex
}

// NewHandlers creates a new Handlers instance.
func NewHandlers(c *canvas.Canvas, f *font.HexFont) *Handlers {
	return &Handlers{
		canvas: c,
		font:   f,
	}
}

// GetCanvas returns the current canvas (thread-safe).
func (h *Handlers) GetCanvas() *canvas.Canvas {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.canvas
}

// SetCanvas replaces the current canvas (thread-safe).
func (h *Handlers) SetCanvas(c *canvas.Canvas) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.canvas = c
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

// HandleCanvas handles GET (get canvas) and POST (create new canvas).
func (h *Handlers) HandleCanvas(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.mu.RLock()
		defer h.mu.RUnlock()
		writeJSON(w, http.StatusOK, h.canvas)

	case http.MethodPost:
		var req struct {
			Width  int    `json:"width"`
			Height int    `json:"height"`
			Mode   string `json:"mode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid JSON")
			return
		}
		if req.Width < 1 || req.Width > 500 {
			writeError(w, http.StatusBadRequest, "Width must be 1-500")
			return
		}
		if req.Height < 1 || req.Height > 200 {
			writeError(w, http.StatusBadRequest, "Height must be 1-200")
			return
		}
		if req.Mode == "" {
			req.Mode = "sextant"
		}

		h.mu.Lock()
		h.canvas = canvas.NewCanvas(req.Width, req.Height, req.Mode)
		h.mu.Unlock()

		h.mu.RLock()
		defer h.mu.RUnlock()
		writeJSON(w, http.StatusOK, h.canvas)

	default:
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// HandleSubpixel handles PUT to toggle/set a subpixel.
func (h *Handlers) HandleSubpixel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		CellX  int         `json:"cellX"`
		CellY  int         `json:"cellY"`
		SubRow int         `json:"subRow"` // 0-2
		SubCol int         `json:"subCol"` // 0-1
		Filled *bool       `json:"filled"` // nil = toggle, true/false = set
		FG     *ansi.Color `json:"fg,omitempty"`
		BG     *ansi.Color `json:"bg,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	h.mu.Lock()
	cell := h.canvas.GetCell(req.CellX, req.CellY)
	if cell == nil {
		h.mu.Unlock()
		writeError(w, http.StatusBadRequest, "Cell coordinates out of bounds")
		return
	}

	// Ensure cell is in sextant mode (converts from extended char if needed)
	if cell.Type != canvas.CellTypeSextant {
		cell.ConvertToSextant()
	}

	// Apply colors if provided
	if req.FG != nil {
		cell.FG = *req.FG
	}
	if req.BG != nil {
		cell.BG = *req.BG
	}

	if req.Filled != nil {
		cell.SetSubpixel(req.SubRow, req.SubCol, *req.Filled)
	} else {
		cell.ToggleSubpixel(req.SubRow, req.SubCol)
	}

	// Make a copy of the cell for response
	cellCopy := *cell
	h.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cell":    cellCopy,
		"char":    string(cellCopy.ToRune()),
		"pattern": cellCopy.GetPattern(),
	})
}

// HandleCell handles PUT to set an extended character.
func (h *Handlers) HandleCell(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		X        int    `json:"x"`
		Y        int    `json:"y"`
		CharCode int    `json:"charCode"`
		FG       *ansi.Color `json:"fg,omitempty"`
		BG       *ansi.Color `json:"bg,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	h.mu.Lock()
	cell := h.canvas.GetCell(req.X, req.Y)
	if cell == nil {
		h.mu.Unlock()
		writeError(w, http.StatusBadRequest, "Cell coordinates out of bounds")
		return
	}

	if req.CharCode == ' ' {
		// Space means clear to empty sextant cell
		cell.Clear()
	} else if req.CharCode != 0 {
		cell.SetExtendedChar(rune(req.CharCode))
	}
	if req.FG != nil {
		cell.FG = *req.FG
	}
	if req.BG != nil {
		cell.BG = *req.BG
	}

	cellCopy := *cell
	h.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cell": cellCopy,
		"char": string(cellCopy.ToRune()),
	})
}

// HandleColors handles PUT to set cell colors.
func (h *Handlers) HandleColors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		X  int        `json:"x"`
		Y  int        `json:"y"`
		FG ansi.Color `json:"fg"`
		BG ansi.Color `json:"bg"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	h.mu.Lock()
	ok := h.canvas.SetCellColors(req.X, req.Y, req.FG, req.BG)
	if !ok {
		h.mu.Unlock()
		writeError(w, http.StatusBadRequest, "Cell coordinates out of bounds")
		return
	}

	cell := h.canvas.GetCell(req.X, req.Y)
	cellCopy := *cell
	h.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cell": cellCopy,
	})
}

// HandleResize handles PUT to resize the canvas.
func (h *Handlers) HandleResize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	if req.Width < 1 || req.Width > 500 {
		writeError(w, http.StatusBadRequest, "Width must be 1-500")
		return
	}
	if req.Height < 1 || req.Height > 200 {
		writeError(w, http.StatusBadRequest, "Height must be 1-200")
		return
	}

	h.mu.Lock()
	h.canvas.Resize(req.Width, req.Height)
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
}

// HandleClear handles POST to clear the canvas.
func (h *Handlers) HandleClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	h.mu.Lock()
	h.canvas.Clear()
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
}

// HandleExportTxt handles GET to export canvas as ANSI text.
// Query param ?download=1 triggers file download, otherwise returns text for preview.
func (h *Handlers) HandleExportTxt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	h.mu.RLock()
	text := h.canvas.ToANSIText()
	h.mu.RUnlock()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", "attachment; filename=motd.txt")
	}
	w.Write([]byte(text))
}

// HandleExportPlain handles GET to export canvas as plain text.
// Query param ?download=1 triggers file download, otherwise returns text for preview.
func (h *Handlers) HandleExportPlain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	h.mu.RLock()
	text := h.canvas.ToPlainText()
	h.mu.RUnlock()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", "attachment; filename=motd.txt")
	}
	w.Write([]byte(text))
}

// HandleImportTxt handles POST to import text file.
func (h *Handlers) HandleImportTxt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Parse multipart form
	if err := r.ParseMultipartForm(10 << 20); err != nil { // 10MB limit
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

	h.mu.Lock()
	h.canvas = newCanvas
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
}

// HandleImportPNG handles POST to import PNG file.
func (h *Handlers) HandleImportPNG(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Parse multipart form
	if err := r.ParseMultipartForm(50 << 20); err != nil { // 50MB limit
		writeError(w, http.StatusBadRequest, "Failed to parse form")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	// Get options
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

	h.mu.Lock()
	h.canvas = newCanvas
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
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

// HandlePaste handles PUT to paste multiple cells at once.
func (h *Handlers) HandlePaste(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		X     int           `json:"x"`     // Target X position
		Y     int           `json:"y"`     // Target Y position
		Cells [][]canvas.Cell `json:"cells"` // 2D array of cells to paste
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	if len(req.Cells) == 0 {
		writeError(w, http.StatusBadRequest, "No cells to paste")
		return
	}

	h.mu.Lock()
	for dy, row := range req.Cells {
		for dx, cell := range row {
			targetX := req.X + dx
			targetY := req.Y + dy

			// Skip out of bounds
			if targetX < 0 || targetX >= h.canvas.Width || targetY < 0 || targetY >= h.canvas.Height {
				continue
			}

			// Copy cell data to canvas
			target := h.canvas.GetCell(targetX, targetY)
			if target != nil {
				*target = cell
			}
		}
	}
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
}

// HandleSubpixelBatch handles PUT to set multiple subpixels by subpixel coordinates.
// Each update can optionally include its own fg/bg colors.
func (h *Handlers) HandleSubpixelBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Updates []struct {
			SX     int        `json:"sx"`     // Subpixel X coordinate
			SY     int        `json:"sy"`     // Subpixel Y coordinate
			Filled bool       `json:"filled"` // Whether to fill or clear
			FG     *ansi.Color `json:"fg"`    // Optional per-subpixel foreground color
			BG     *ansi.Color `json:"bg"`    // Optional per-subpixel background color
		} `json:"updates"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	if len(req.Updates) == 0 {
		writeError(w, http.StatusBadRequest, "No updates provided")
		return
	}

	h.mu.Lock()
	for _, update := range req.Updates {
		// Convert subpixel coords to cell coords
		cellX := update.SX / 2
		cellY := update.SY / 3
		subCol := update.SX % 2
		subRow := update.SY % 3

		if cellX < 0 || cellX >= h.canvas.Width || cellY < 0 || cellY >= h.canvas.Height {
			continue
		}

		cell := h.canvas.GetCell(cellX, cellY)
		if cell == nil {
			continue
		}

		// Convert extended cells to sextant
		if cell.Type != canvas.CellTypeSextant {
			cell.ConvertToSextant()
		}

		cell.Subpixels[subRow][subCol] = update.Filled

		// Apply per-subpixel colors if provided
		if update.FG != nil {
			cell.FG = *update.FG
		}
		if update.BG != nil {
			cell.BG = *update.BG
		}
	}
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
}

// HandlePasteSubpixel handles PUT to paste subpixel data at a position.
// Converts extended cells to sextant and replaces subpixel patterns.
func (h *Handlers) HandlePasteSubpixel(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		X            int `json:"x"`
		Y            int `json:"y"`
		SubpixelData [][]struct {
			Subpixels [3][2]bool `json:"subpixels"`
			FG        ansi.Color `json:"fg"`
			BG        ansi.Color `json:"bg"`
		} `json:"subpixelData"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error())
		return
	}

	if len(req.SubpixelData) == 0 {
		writeError(w, http.StatusBadRequest, "No subpixel data to paste")
		return
	}

	h.mu.Lock()
	for dy, row := range req.SubpixelData {
		for dx, data := range row {
			targetX := req.X + dx
			targetY := req.Y + dy

			if targetX < 0 || targetX >= h.canvas.Width || targetY < 0 || targetY >= h.canvas.Height {
				continue
			}

			target := h.canvas.GetCell(targetX, targetY)
			if target != nil {
				// Convert to sextant if needed and replace subpixels
				target.ConvertToSextant()
				target.Subpixels = data.Subpixels
				target.FG = data.FG
				target.BG = data.BG
			}
		}
	}
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
}

// HandleSetCellBatch handles PUT to set multiple cells at once.
func (h *Handlers) HandleSetCellBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Cells []struct {
			X        int         `json:"x"`
			Y        int         `json:"y"`
			CharCode int         `json:"charCode"`
			FG       *ansi.Color `json:"fg,omitempty"`
			BG       *ansi.Color `json:"bg,omitempty"`
		} `json:"cells"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	if len(req.Cells) == 0 {
		writeError(w, http.StatusBadRequest, "No cells provided")
		return
	}

	h.mu.Lock()
	for _, c := range req.Cells {
		cell := h.canvas.GetCell(c.X, c.Y)
		if cell == nil {
			continue
		}
		if c.CharCode == ' ' {
			cell.Clear()
		} else if c.CharCode != 0 {
			cell.SetExtendedChar(rune(c.CharCode))
		}
		if c.FG != nil {
			cell.FG = *c.FG
		}
		if c.BG != nil {
			cell.BG = *c.BG
		}
	}
	h.mu.Unlock()

	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, h.canvas)
}

// HandleGlyphs returns bitmap data for extended characters (diagonals and triangles).
// The bitmap data is from the unscii-16 HEX font (8x16 pixels per glyph).
func (h *Handlers) HandleGlyphs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if h.font == nil {
		writeError(w, http.StatusInternalServerError, "Font not loaded")
		return
	}

	// Get extended glyphs (diagonals U+1FB3C-1FB67, triangles U+1FB68-1FB6F)
	glyphs := h.font.GetExtendedGlyphs()

	// Convert []byte to []int for JSON serialization
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

// HandleParseText converts plain text into a 2D array of cells.
// Used by the frontend to parse system clipboard text for pasting.
func (h *Handlers) HandleParseText(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid JSON")
		return
	}

	if len(req.Text) > 1*1024*1024 {
		writeError(w, http.StatusBadRequest, "Text too large (max 1MB)")
		return
	}

	// Normalize line endings
	text := strings.ReplaceAll(req.Text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")

	lines := strings.Split(text, "\n")

	// Remove trailing empty lines
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}

	if len(lines) == 0 {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"cells": [][]canvas.Cell{},
		})
		return
	}

	defaultFG := ansi.NewDefaultColor()
	defaultBG := ansi.NewDefaultColor()

	cells := make([][]canvas.Cell, len(lines))
	for i, line := range lines {
		runes := []rune(line)
		row := make([]canvas.Cell, len(runes))
		for j, r := range runes {
			c := canvas.NewCell()
			c.FG = defaultFG
			c.BG = defaultBG
			c.SetChar(r)
			row[j] = c
		}
		cells[i] = row
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cells": cells,
	})
}
