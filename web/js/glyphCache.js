// Bitmap glyph rendering and caching
// Renders extended characters from unscii-16 bitmap font data

class BitmapRenderer {
    constructor(width, height) {
        this.width = width;      // Cell width in pixels (e.g., 18)
        this.height = height;    // Cell height in pixels (e.g., 36)
        this.glyphs = {};        // charCode -> [16 bytes] bitmap data
        this.cache = new Map();  // key -> dataURL
        this.canvas = null;
        this.ctx = null;
        this.ready = false;

        // Bitmap dimensions (8x16 from unscii-16)
        this.bitmapWidth = 8;
        this.bitmapHeight = 16;
    }

    async init() {
        // Create offscreen canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');

        // Load bitmap data from API
        try {
            this.glyphs = await API.getGlyphs();
            console.log(`Loaded ${Object.keys(this.glyphs).length} glyph bitmaps`);
            this.ready = true;
        } catch (error) {
            console.error('Failed to load glyph bitmaps:', error);
            this.ready = false;
        }
    }

    // Check if we have bitmap data for a character
    hasGlyph(charCode) {
        return this.glyphs.hasOwnProperty(String(charCode));
    }

    // Get or render a glyph with specific colors
    // Returns a data URL for use in <img> src
    getOrRender(charCode, fgColor, bgColor) {
        if (!this.ready) {
            console.warn('BitmapRenderer not initialized');
            return null;
        }

        // Build cache key from charCode and colors
        const fgHex = this.colorToHex(fgColor);
        const bgHex = this.colorToHex(bgColor);
        const key = `${charCode}_${fgHex}_${bgHex}`;

        // Return cached if available
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        // Get bitmap data
        const bitmap = this.glyphs[String(charCode)];
        if (!bitmap) {
            return null;
        }

        // Render the glyph
        const dataUrl = this.renderBitmap(bitmap, fgHex, bgHex);
        this.cache.set(key, dataUrl);
        return dataUrl;
    }

    renderBitmap(bitmap, fgHex, bgHex) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Scale factors from 8x16 bitmap to cell size
        const scaleX = w / this.bitmapWidth;
        const scaleY = h / this.bitmapHeight;

        // Fill background
        if (bgHex === 'default') {
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#252525'; // Default cell background
            ctx.fillRect(0, 0, w, h);
        } else {
            ctx.fillStyle = bgHex;
            ctx.fillRect(0, 0, w, h);
        }

        // Draw foreground pixels
        ctx.fillStyle = fgHex === 'default' ? '#ffffff' : fgHex;

        for (let row = 0; row < this.bitmapHeight; row++) {
            const byte = bitmap[row];
            for (let col = 0; col < this.bitmapWidth; col++) {
                // Check if bit is set (MSB = leftmost pixel)
                if (byte & (0x80 >> col)) {
                    ctx.fillRect(
                        Math.floor(col * scaleX),
                        Math.floor(row * scaleY),
                        Math.ceil(scaleX),
                        Math.ceil(scaleY)
                    );
                }
            }
        }

        return this.canvas.toDataURL('image/png');
    }

    colorToHex(color) {
        if (!color || color.default) {
            return 'default';
        }
        const r = color.r.toString(16).padStart(2, '0');
        const g = color.g.toString(16).padStart(2, '0');
        const b = color.b.toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    // Create an img element with the rendered glyph
    createImage(charCode, fgColor, bgColor) {
        const dataUrl = this.getOrRender(charCode, fgColor, bgColor);
        if (!dataUrl) return null;

        const img = document.createElement('img');
        img.src = dataUrl;
        img.draggable = false;
        return img;
    }

    // Clear the cache (useful if memory becomes an issue)
    clearCache() {
        this.cache.clear();
    }
}

// Global instance - initialized in app.js
let bitmapRenderer = null;
