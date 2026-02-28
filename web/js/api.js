// API client for communicating with the Go backend

const API = {
    // Get current canvas state
    async getCanvas() {
        const response = await fetch('/api/canvas');
        if (!response.ok) throw new Error('Failed to get canvas');
        return response.json();
    },

    // Create new canvas
    async createCanvas(width, height, mode = 'sextant') {
        const response = await fetch('/api/canvas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ width, height, mode })
        });
        if (!response.ok) throw new Error('Failed to create canvas');
        return response.json();
    },

    // Toggle/set a subpixel
    async setSubpixel(cellX, cellY, subRow, subCol, filled = null, fg = null, bg = null) {
        const body = { cellX, cellY, subRow, subCol };
        if (filled !== null) {
            body.filled = filled;
        }
        if (fg !== null) {
            body.fg = fg;
        }
        if (bg !== null) {
            body.bg = bg;
        }
        const response = await fetch('/api/canvas/subpixel', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('Failed to set subpixel');
        return response.json();
    },

    // Set extended character
    async setCell(x, y, charCode, fg = null, bg = null) {
        const body = { x, y, charCode };
        if (fg) body.fg = fg;
        if (bg) body.bg = bg;
        const response = await fetch('/api/canvas/cell', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('Failed to set cell');
        return response.json();
    },

    // Set cell colors
    async setColors(x, y, fg, bg) {
        const response = await fetch('/api/canvas/colors', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y, fg, bg })
        });
        if (!response.ok) throw new Error('Failed to set colors');
        return response.json();
    },

    // Resize canvas
    async resize(width, height) {
        const response = await fetch('/api/canvas/resize', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ width, height })
        });
        if (!response.ok) throw new Error('Failed to resize canvas');
        return response.json();
    },

    // Clear canvas
    async clear() {
        const response = await fetch('/api/canvas/clear', {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to clear canvas');
        return response.json();
    },

    // Export as ANSI text (for preview)
    async exportTxt() {
        const response = await fetch('/api/export/txt');
        if (!response.ok) throw new Error('Failed to export');
        return response.text();
    },

    // Export as plain text (for preview)
    async exportPlain() {
        const response = await fetch('/api/export/plain');
        if (!response.ok) throw new Error('Failed to export');
        return response.text();
    },

    // Download ANSI text as file
    async downloadTxt() {
        const response = await fetch('/api/export/txt?download=1');
        if (!response.ok) throw new Error('Failed to export');
        return response.text();
    },

    // Download plain text as file
    async downloadPlain() {
        const response = await fetch('/api/export/plain?download=1');
        if (!response.ok) throw new Error('Failed to export');
        return response.text();
    },

    // Import text file
    async importTxt(file) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/import/txt', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Failed to import');
        return response.json();
    },

    // Import PNG file
    async importPNG(file, options = {}) {
        const formData = new FormData();
        formData.append('file', file);
        if (options.width) formData.append('width', options.width);
        if (options.threshold !== undefined) formData.append('threshold', options.threshold);
        if (options.invert) formData.append('invert', 'true');
        if (options.color) formData.append('color', 'true');
        if (options.bitmap) formData.append('bitmap', 'true');
        if (options.extended) formData.append('extended', 'true');

        const response = await fetch('/api/import/png', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Failed to import PNG');
        return response.json();
    },

    // Get diagonal characters
    async getDiagonalChars() {
        const response = await fetch('/api/charset/diagonal');
        if (!response.ok) throw new Error('Failed to get diagonal chars');
        return response.json();
    },

    // Get triangle characters
    async getTriangleChars() {
        const response = await fetch('/api/charset/triangle');
        if (!response.ok) throw new Error('Failed to get triangle chars');
        return response.json();
    },

    // Get bitmap glyph data for extended characters (diagonals, triangles)
    async getGlyphs() {
        const response = await fetch('/api/glyphs');
        if (!response.ok) throw new Error('Failed to get glyph bitmaps');
        return response.json();
    },

    // Batch paste cells at position
    async paste(x, y, cells) {
        const response = await fetch('/api/canvas/paste', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y, cells })
        });
        if (!response.ok) throw new Error('Failed to paste cells');
        return response.json();
    },

    // Batch paste subpixels at position (replaces subpixels, converts extended to sextant)
    async pasteSubpixel(x, y, subpixelData) {
        const response = await fetch('/api/canvas/paste-subpixel', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y, subpixelData })
        });
        if (!response.ok) throw new Error('Failed to paste subpixels');
        return response.json();
    },

    // Batch set multiple cells (for box drawing, etc.)
    async setCellBatch(cells) {
        const response = await fetch('/api/canvas/cell-batch', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cells })
        });
        if (!response.ok) throw new Error('Failed to set cells');
        return response.json();
    },

    // Batch set individual subpixels by subpixel coordinates
    // Each update can include: {sx, sy, filled, fg, bg}
    async setSubpixelBatch(updates) {
        const response = await fetch('/api/canvas/subpixel-batch', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        if (!response.ok) throw new Error('Failed to set subpixels');
        return response.json();
    }
};
