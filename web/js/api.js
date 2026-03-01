// API client for communicating with the Go backend
// Only import/charset/glyph endpoints remain — all editing is local

const API = {
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
    }
};
