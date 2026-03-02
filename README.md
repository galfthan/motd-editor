# MOTD Editor

A web-based editor for creating MOTD banners using Unicode sextant characters (2x3 subpixel blocks) and extended diagonal/triangle characters.

## Usage

Open `web/index.html` in your browser, or serve with any static file server:

```bash
# Python
python -m http.server -d web

# Node
npx serve web
```

## Features

- Sextant character editing (2x3 subpixel grid per cell)
- Extended diagonal and triangle characters (U+1FB3C-1FB6F)
- Box and line drawing tools with light/heavy/double styles
- Foreground/background color support
- Import/export ANSI text files
- Copy/paste with system clipboard integration
- Text tool for typing characters directly
- Color picker tool
