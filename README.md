# Unicode ASCII Art Editor

A web-based editor for creating ASCII art using Unicode sextant characters (2x3 subpixel blocks) and extended diagonal/triangle characters.

## Setup

### Font File (Required for Extended Characters)

Download GNU Unifont's plane01.hex for diagonal and triangle character support:

1. Download the latest unifont source from https://ftp.gnu.org/gnu/unifont/
2. Extract `font/plane01/plane01.hex` from the archive
3. Place `plane01.hex` in the project root directory

### Build and Run

```bash
go build -o ascii-art .
./ascii-art
```

Open http://localhost:8080 in your browser.

### Command Line Options

- `-addr` - Server address (default: `localhost:8080`)
- `-font` - Path to HEX font file (default: `plane01.hex`)

## Features

- Sextant character editing (2x3 subpixel grid per cell)
- Extended diagonal and triangle characters (U+1FB3C-1FB6F)
- Foreground/background color support
- Import PNG images
- Export as ANSI text or plain text
