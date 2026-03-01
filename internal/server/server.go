package server

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"

	"motdeditor/internal/font"
	"motdeditor/internal/handlers"
)

// Server holds the application state and HTTP server.
type Server struct {
	Handlers *handlers.Handlers
	mux      *http.ServeMux
	addr     string
}

// NewServer creates a new server instance with the given address.
func NewServer(addr string, webFS embed.FS, fontPath string) *Server {
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
	h := handlers.NewHandlers(hexFont)

	// Create mux and register routes
	mux := http.NewServeMux()

	// API routes — import, charset, glyphs only
	mux.HandleFunc("/api/import/txt", h.HandleImportTxt)
	mux.HandleFunc("/api/import/png", h.HandleImportPNG)
	mux.HandleFunc("/api/charset/sextant", h.HandleCharsetSextant)
	mux.HandleFunc("/api/charset/diagonal", h.HandleCharsetDiagonal)
	mux.HandleFunc("/api/charset/triangle", h.HandleCharsetTriangle)
	mux.HandleFunc("/api/glyphs", h.HandleGlyphs)

	// Static files
	webContent, err := fs.Sub(webFS, "web")
	if err != nil {
		log.Fatalf("Failed to get web subdirectory: %v", err)
	}
	fileServer := http.FileServer(http.FS(webContent))
	mux.Handle("/", fileServer)

	return &Server{
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
