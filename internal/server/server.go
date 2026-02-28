package server

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"

	"asciiart/internal/canvas"
	"asciiart/internal/font"
	"asciiart/internal/handlers"
)

// Server holds the application state and HTTP server.
type Server struct {
	Canvas   *canvas.Canvas
	Handlers *handlers.Handlers
	mux      *http.ServeMux
	addr     string
}

// NewServer creates a new server instance with the given address.
func NewServer(addr string, webFS embed.FS, fontPath string) *Server {
	// Create initial canvas (40x20 characters)
	c := canvas.NewCanvas(40, 20, "sextant")

	// Load bitmap font for extended characters
	var hexFont *font.HexFont
	if fontPath != "" {
		var err error
		hexFont, err = font.LoadHexFont(fontPath)
		if err != nil {
			log.Printf("Warning: Failed to load font %s: %v", fontPath, err)
		} else {
			log.Printf("Loaded font with %d glyphs", len(hexFont.Glyphs))
		}
	}

	// Create handlers
	h := handlers.NewHandlers(c, hexFont)

	// Create mux and register routes
	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/canvas", h.HandleCanvas)
	mux.HandleFunc("/api/canvas/subpixel", h.HandleSubpixel)
	mux.HandleFunc("/api/canvas/cell", h.HandleCell)
	mux.HandleFunc("/api/canvas/colors", h.HandleColors)
	mux.HandleFunc("/api/canvas/resize", h.HandleResize)
	mux.HandleFunc("/api/canvas/clear", h.HandleClear)
	mux.HandleFunc("/api/canvas/paste", h.HandlePaste)
	mux.HandleFunc("/api/canvas/paste-subpixel", h.HandlePasteSubpixel)
	mux.HandleFunc("/api/canvas/subpixel-batch", h.HandleSubpixelBatch)
	mux.HandleFunc("/api/export/txt", h.HandleExportTxt)
	mux.HandleFunc("/api/export/plain", h.HandleExportPlain)
	mux.HandleFunc("/api/import/txt", h.HandleImportTxt)
	mux.HandleFunc("/api/import/png", h.HandleImportPNG)
	mux.HandleFunc("/api/charset/sextant", h.HandleCharsetSextant)
	mux.HandleFunc("/api/charset/diagonal", h.HandleCharsetDiagonal)
	mux.HandleFunc("/api/charset/triangle", h.HandleCharsetTriangle)
	mux.HandleFunc("/api/glyphs", h.HandleGlyphs)
	mux.HandleFunc("/api/canvas/cell-batch", h.HandleSetCellBatch)

	// Static files
	webContent, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatalf("Failed to get web subdirectory: %v", err)
	}
	fileServer := http.FileServer(http.FS(webContent))
	mux.Handle("/", fileServer)

	return &Server{
		Canvas:   c,
		Handlers: h,
		mux:      mux,
		addr:     addr,
	}
}

// Start begins listening for HTTP requests.
func (s *Server) Start() error {
	fmt.Printf("Starting server at http://%s\n", s.addr)
	return http.ListenAndServe(s.addr, s.mux)
}

// GetCanvas returns the current canvas reference.
func (s *Server) GetCanvas() *canvas.Canvas {
	return s.Canvas
}
