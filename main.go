package main

import (
	"embed"
	"flag"
	"fmt"
	"os"

	"asciiart/internal/server"
)

//go:embed all:web
var webFS embed.FS

func main() {
	addr := flag.String("addr", "localhost:8080", "Server address")
	fontPath := flag.String("font", "plane01.hex", "Path to HEX font file for extended characters (GNU Unifont)")
	flag.Parse()

	srv := server.NewServer(*addr, webFS, *fontPath)

	fmt.Printf("Unicode ASCII Art Editor\n")
	fmt.Printf("Open your browser at: http://%s\n", *addr)
	fmt.Printf("Press Ctrl+C to stop the server\n\n")

	if err := srv.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}
