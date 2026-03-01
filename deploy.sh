#!/bin/bash
set -e

FONT_URL="$1"
if [ -z "$FONT_URL" ]; then
    echo "Usage: $0 <font-url>"
    echo "Example: $0 https://example.com/plane01.hex"
    exit 1
fi
FONT_FILE="plane01.hex"
BINARY="motdeditor"

# Fetch font if not already present
if [ ! -f "$FONT_FILE" ]; then
    echo "Downloading $FONT_FILE..."
    curl -fSL -o "$FONT_FILE" "$FONT_URL"
    echo "Downloaded $FONT_FILE"
else
    echo "$FONT_FILE already exists, skipping download"
fi

# Build
echo "Building $BINARY..."
go build -o "$BINARY" .
echo "Built $BINARY"
