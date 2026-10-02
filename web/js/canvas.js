// Canvas rendering and interaction

// Cell is 16x32 + 2px border = 18x34 total (2x scale of 8x16 Unifont), holding
// 2x3 subpixels. style.css hardcodes the same sizes for cells and overlays.
const CELL_W = 18;
const CELL_H = 34;

// Subpixel edges within a cell, in CSS px from its top-left corner: the
// cell's 16x32 inside (within the 1px border) split into 2x3 equal parts.
// Drawing, hit-testing and the subpixel selection overlay all use these.
const SUB_X_EDGES = [0, CELL_W / 2, CELL_W];
const SUB_Y_EDGES = [0, 1 + (CELL_H - 2) / 3, 1 + 2 * (CELL_H - 2) / 3, CELL_H];

// Left / top edge (CSS px) of subpixel column sx / row sy
function subpixelEdgeX(sx) { return Math.floor(sx / 2) * CELL_W + SUB_X_EDGES[sx % 2]; }
function subpixelEdgeY(sy) { return Math.floor(sy / 3) * CELL_H + SUB_Y_EDGES[sy % 3]; }

// Cap on the grid canvas's backing store, in device pixels (see render)
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;

// Grid points on the straight line from (x0, y0) to (x1, y1), both ends
// included, stepping one point at a time (Bresenham)
function linePoints(x0, y0, x1, y1) {
    const points = [];
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const stepX = x0 < x1 ? 1 : -1, stepY = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
        points.push({ x: x0, y: y0 });
        if (x0 === x1 && y0 === y1) return points;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += stepX; }
        if (e2 <= dx) { err += dx; y0 += stepY; }
    }
}

// Normalised rect { x1, y1, x2, y2 } spanning two points
function normRect(a, b) {
    return {
        x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y),
        x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y)
    };
}

class CanvasRenderer {
    constructor(containerEl) {
        this.container = containerEl;
        this.canvas = null;
        this.tool = 'draw'; // draw, erase, char, text, box, line, select, select-subpixel, pick
        this.selectedChar = null;
        this.fgColor = defaultFG();
        this.bgColor = defaultBG();
        this.isDrawing = false;
        this.lastPoint = null;     // Previous point of a draw/erase/symbol stroke
        this.toolbar = null; // Set by app.js

        // Selection state (cell-level for 'select' tool)
        this.selection = null;      // { x1, y1, x2, y2 } normalized (x1 <= x2, y1 <= y2)
        this.selectionStart = null; // { x, y } start point during drag
        this.clipboard = null;      // 2D array of cells (char-level)
        this.pasteMode = false;     // Waiting for click to place paste

        // Subpixel selection state (subpixel-level for 'select-subpixel' tool),
        // same shapes as above but in subpixel coords
        this.subpixelSelection = null;
        this.subpixelSelectionStart = null;
        this.subpixelClipboard = null;      // 2D array of {filled, fg, bg} objects

        // Text tool state
        this.textCursor = null; // { x, y } cell coordinates, or null

        // Box/line tool state
        this.dragStart = null;      // { x, y } cell where the drag began
        this.dragEnd = null;        // { x, y } current cell
        this.boxLineStyle = 1;      // 0=none, 1=light, 2=heavy, 3=double
        this.boxFillMode = 0;       // 0=no fill, 1=fill & clear, 2=recolor only

        // Draw/erase tool state
        this.brushCell = false;     // Paint whole cells instead of subpixels

        // Grid canvas drawing state (see render / drawCell)
        this.ctx = null;                // 2D context of the grid canvas
        this._onPixelRatioChange = () => this.render();
        this._glyphStyles = new Map();  // .glyph-* class → { font, transform, baseline }
        this._shadePatterns = new Map(); // shade + colour → CanvasPattern (see fillShape)
        this._requestedFonts = new Set();

        // Overlay divs per decoration kind (see setOverlay)
        this._overlays = {};
        this._pastePreviewKey = null; // Last previewed paste position

        // Undo/redo (see history.js). strokeOpen: a mouse stroke's step is open.
        this.history = new EditHistory(this);
        this.strokeOpen = false;

        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    setupEventListeners() {
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));

        // Moves and releases are handled at window level, so a drag keeps
        // going when the pointer leaves the canvas: select, box and line drags
        // track it clamped to the canvas edges, draw/erase/symbol strokes pause
        // until it comes back, and the drag finishes wherever the button is
        // released. Paste preview also tracks the pointer outside the canvas.
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => {
            if (this.isDrawing) this.handleMouseUp();
        });

        // Canvas text doesn't redraw by itself like DOM text: redraw when web
        // fonts finish loading (see also watchPixelRatio)
        if (document.fonts) {
            document.fonts.addEventListener('loadingdone', () => {
                this._glyphStyles.clear(); // font metrics may have changed
                this.drawAll();
            });
        }

        // Prevent context menu on right-click
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setTool(tool) {
        if (tool !== this.tool) {
            this.cancelDrag();
        }
        this.tool = tool;
        if (tool !== 'char') {
            this.selectedChar = null;
        }
        if (tool !== 'select') {
            this.clearSelection();
        }
        if (tool !== 'select-subpixel') {
            this.clearSubpixelSelection();
        }
        if (tool !== 'select' && tool !== 'select-subpixel') {
            this.pasteMode = false;
            this.clearPastePreview();
        }
        if (tool !== 'text') {
            this.clearTextCursor();
        }
        this.history.breakGroup();
    }

    isSelectTool() {
        return this.tool === 'select' || this.tool === 'select-subpixel';
    }

    isSubpixelMode() {
        return this.tool === 'select-subpixel';
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;

            // Ctrl+Z - undo, Ctrl+Shift+Z / Ctrl+Y - redo (checked before the
            // text tool, so they also work while typing)
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
                e.preventDefault();
                if (key === 'z' && !e.shiftKey) this.undo();
                else this.redo();
                return;
            }

            // Text tool input handling (non-modifier keys only)
            if (this.tool === 'text' && this.textCursor && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (e.key === 'Escape') {
                    this.clearTextCursor();
                    e.preventDefault();
                    return;
                }
                e.preventDefault();
                // Consecutive typing is one undo step; moving the cursor with
                // the arrow keys starts a new one
                if (e.key.startsWith('Arrow')) this.history.breakGroup();
                this.history.record('Typing', () => this.handleTextInput(e.key), 'text');
                return;
            }

            // Escape - cancel a box/line drag, clear selection
            if (e.key === 'Escape') {
                this.cancelDrag();
                this.clearSelection();
                this.clearSubpixelSelection();
                this.pasteMode = false;
                this.clearPastePreview();
                return;
            }

            // Ctrl on Windows/Linux, Cmd on macOS
            const mod = e.ctrlKey || e.metaKey;

            // Ctrl+C - copy (leave the native copy alone when nothing is selected)
            if (mod && e.key === 'c') {
                if (this.isSubpixelMode() && this.subpixelSelection) {
                    e.preventDefault();
                    this.copySelectionSubpixel();
                } else if (this.selection) {
                    e.preventDefault();
                    this.copySelection();
                }
                return;
            }

            // Ctrl+X - cut
            if (mod && e.key === 'x') {
                if (this.isSubpixelMode() && this.subpixelSelection) {
                    e.preventDefault();
                    this.recordEdit('Cut', () => this.cutSelectionSubpixel());
                } else if (this.selection) {
                    e.preventDefault();
                    this.recordEdit('Cut', () => this.cutSelection());
                }
                return;
            }

            // Ctrl+V - paste
            if (mod && e.key === 'v') {
                e.preventDefault();
                // Subpixel paste stays internal-only
                if (this.isSubpixelMode()) {
                    if (this.subpixelClipboard) {
                        this.pasteMode = true;
                    }
                } else {
                    this.handlePaste();
                }
                return;
            }
        });
    }

    // Called from the character palette, which is only shown for the char tool
    setSelectedChar(charCode) {
        this.selectedChar = charCode;
    }

    setFgColor(color) {
        this.fgColor = color;
    }

    setBgColor(color) {
        this.bgColor = color;
    }

    // --- Undo / redo ---
    //
    // Every write to canvas cells must be preceded by beforeChange() for the
    // cells it writes (or snapshotCanvas() when the whole canvas changes), so
    // the open undo step keeps their "before" copies.
    //
    // Collaboration API: wrap any sequence of editor operations in
    // recordEdit(label, fn), or history.begin(label) ... history.end(), to make
    // it one undo step named `label` (nested steps collapse into the outer one).
    // undo() / redo() apply and repaint; history.undoLabel() names the step.

    recordEdit(label, fn) {
        return this.history.record(label, fn);
    }

    // Record the cells in a rect (cell coords, clipped) before writing them;
    // see EditHistory.touchRect
    beforeChange(x1, y1, x2, y2) {
        this.history.touchRect(x1, y1, x2, y2);
    }

    // Record the whole canvas before replacing, resizing or clearing it
    snapshotCanvas() {
        this.history.snapshot();
    }

    // A mouse stroke (mousedown to mouseup) is one undo step
    beginStroke(label) {
        if (this.strokeOpen) return;
        this.strokeOpen = true;
        this.history.begin(label);
    }

    endStroke() {
        if (!this.strokeOpen) return;
        this.strokeOpen = false;
        this.history.end();
    }

    undo() {
        this.applyHistoryChange(() => this.history.undo());
    }

    redo() {
        this.applyHistoryChange(() => this.history.redo());
    }

    // Run an undo/redo and repaint what it changed. Drags and selections are
    // dropped first (which also commits an open stroke, so it can be undone).
    applyHistoryChange(apply) {
        this.resetInteractionState();
        const change = apply();
        if (!change) return;
        if (change.wholeCanvas) {
            this.render();
            this.updateStatus();
        } else {
            for (const { x, y } of change.cells) this.updateCell(x, y);
        }
        // Put the text cursor back where it was at that point (e.g. where
        // undone typing started), in bounds and off wide chars' tails
        const cursor = change.cursor || this.textCursor;
        if (cursor && this.tool === 'text') this.setTextCursor(cursor.x, cursor.y);
    }

    // Give a cell the currently picked colours
    applyCurrentColors(cell) {
        cell.fg = { ...this.fgColor };
        cell.bg = { ...this.bgColor };
    }

    loadCanvas() {
        this.canvas = createCanvas(80, 60);
        this.render();
        this.updateStatus();
    }

    render() {
        if (!this.canvas) return;

        const width = this.canvas.width * CELL_W;
        const height = this.canvas.height * CELL_H;
        this.container.innerHTML = '';
        this.container.style.width = width + 'px';
        this.container.style.height = height + 'px';

        // Reset caches (innerHTML = '' removed the overlay divs too)
        this._overlays = {};
        this._pastePreviewKey = null;

        // The grid is drawn on one <canvas>, sharp on high-DPI screens. The
        // backing store is capped: browsers limit canvas area (iOS Safari to
        // 16.7M pixels), so very large grids get a lower resolution instead.
        this._dpr = window.devicePixelRatio || 1;
        this.watchPixelRatio();
        const scale = Math.min(this._dpr, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
        const gridCanvas = document.createElement('canvas');
        gridCanvas.className = 'grid-canvas';
        gridCanvas.width = Math.round(width * scale);
        gridCanvas.height = Math.round(height * scale);
        gridCanvas.style.width = width + 'px';
        gridCanvas.style.height = height + 'px';
        // After a GPU reset the browser restores a blank canvas
        gridCanvas.addEventListener('contextrestored', () => this.drawAll());
        this.container.appendChild(gridCanvas);
        // Opaque (every pixel is drawn), which also lets the browser use
        // subpixel antialiasing for text, like the DOM did
        this.ctx = gridCanvas.getContext('2d', { alpha: false });
        this._shadePatterns.clear(); // patterns belong to the old context
        // CSS px → device px (drawCell snaps rects to whole device pixels)
        this._scaleX = gridCanvas.width / width;
        this._scaleY = gridCanvas.height / height;

        // Selections, previews and the text cursor are HTML overlays on top,
        // in their own size-contained layer
        this.overlayLayer = document.createElement('div');
        this.overlayLayer.className = 'overlay-layer';
        this.overlayLayer.style.width = width + 'px';
        this.overlayLayer.style.height = height + 'px';
        this.container.appendChild(this.overlayLayer);

        this.drawAll();

        // Restore selection highlights after re-render (state outlives the DOM)
        this.updateSelectionDisplay();
        this.updateSubpixelSelectionDisplay();

        // Restore text cursor display after re-render
        if (this.textCursor) {
            this.textCursor.x = Math.min(this.textCursor.x, this.canvas.width - 1);
            this.textCursor.y = Math.min(this.textCursor.y, this.canvas.height - 1);
            this.updateTextCursorDisplay();
        }
    }

    // Re-render at the new resolution when the device pixel ratio changes
    // (browser zoom, moving the window to a screen with another density)
    watchPixelRatio() {
        if (!window.matchMedia) return;
        if (this._pixelRatioQuery) {
            this._pixelRatioQuery.removeEventListener('change', this._onPixelRatioChange);
        }
        this._pixelRatioQuery = window.matchMedia(`(resolution: ${this._dpr}dppx)`);
        this._pixelRatioQuery.addEventListener('change', this._onPixelRatioChange);
    }

    // Colours the grid is drawn with, from the page's CSS. Read on full
    // redraws only; the CSS variables are static (no theme switching).
    readTheme() {
        const style = getComputedStyle(this.container);
        this.theme = {
            border: style.getPropertyValue('--border').trim(),
            cellBg: style.getPropertyValue('--cell-bg').trim(),
            fg: style.color
        };
    }

    drawAll() {
        if (!this.ctx) return;
        this.readTheme();
        for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
                // A wide char's tail is drawn along with its head
                if (this.canvas.cells[y][x].type !== 'wide-tail') this.drawCell(x, y);
            }
        }
    }

    // Font, transform and vertical text offset for a .glyph-* class. These are
    // read from the CSS (via a hidden probe element) so style.css stays the
    // one place they are defined; the symbol palette uses the same classes.
    glyphStyle(cls) {
        let style = this._glyphStyles.get(cls);
        if (style) return style;

        const probe = document.createElement('span');
        probe.className = cls;
        probe.style.cssText = 'position:absolute;visibility:hidden;display:block';
        document.body.appendChild(probe);
        const cs = getComputedStyle(probe);
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const transform = cs.transform === 'none' ? new DOMMatrix() : new DOMMatrix(cs.transform);
        const lineHeightCss = cs.lineHeight;
        probe.remove();

        // Place the baseline as CSS layout does: the line box is centred in
        // the cell, and the leading (line height minus the primary font's
        // ascent + descent, often negative here) is split with the floor of
        // half of it above the text
        this.ctx.font = font;
        const m = this.ctx.measureText('M');
        const ascent = m.fontBoundingBoxAscent;
        const descent = m.fontBoundingBoxDescent;
        const lineHeight = lineHeightCss === 'normal' ? ascent + descent
            : lineHeightCss.endsWith('px') ? parseFloat(lineHeightCss)
            : parseFloat(lineHeightCss) * parseFloat(cs.fontSize); // bare multiplier
        const baseline = -lineHeight / 2 + ascent + Math.floor((lineHeight - ascent - descent) / 2);
        style = { font, transform, baseline };
        this._glyphStyles.set(cls, style);
        return style;
    }

    // Draw one cell on the grid canvas: a 1px border, the background inside
    // it, and the content clipped to the inside. Sextants, block elements,
    // legacy diagonals/triangles and box drawing are drawn as shapes (see
    // glyph-shapes.js); everything else is a font glyph. A wide char is drawn
    // two cells wide from its head; drawing its tail draws the head.
    drawCell(x, y) {
        const row = this.canvas.cells[y];
        let cell = row[x];
        if (cell.type === 'wide-tail') {
            if (x > 0 && isWideHead(row[x - 1])) {
                cell = row[--x];
            } else {
                cell = createCell(); // orphan tail (shouldn't happen): draw blank
            }
        }
        const ctx = this.ctx;
        const g = this.cellGeometry(x, y, isWideHead(cell) ? 2 * CELL_W : CELL_W);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.theme.border;
        ctx.fillRect(g.X(0), g.Y(0), g.X(g.w) - g.X(0), g.Y(CELL_H) - g.Y(0));
        ctx.fillStyle = cell.bg.default ? this.theme.cellBg : `rgb(${cell.bg.r},${cell.bg.g},${cell.bg.b})`;
        ctx.fillRect(...g.inner);

        const fg = cell.fg.default ? this.theme.fg : `rgb(${cell.fg.r},${cell.fg.g},${cell.fg.b})`;
        const char = cellToChar(cell);
        if (char === ' ') return;
        const code = char.codePointAt(0);

        ctx.save();
        ctx.beginPath();
        ctx.rect(...g.inner);
        ctx.clip();
        ctx.fillStyle = fg;
        ctx.strokeStyle = fg;
        if (cell.type === 'sextant') {
            this.drawSextant(cell, g);
        } else if (hasGlyphShape(code)) {
            this.drawShape(code, g);
        } else {
            this.drawGlyph(char, g);
        }
        ctx.restore();
    }

    // Where a cell (w CSS px wide) is on the canvas. X / Y map a position in
    // CSS px from the cell's top-left corner to whole device pixels: every
    // edge goes through them, so edges shared between cells and shapes line
    // up exactly and stay sharp at fractional pixel ratios. `inner` is the
    // inside (within the 1px border) as a device-pixel rect.
    cellGeometry(x, y, w) {
        const kx = this._scaleX;
        const ky = this._scaleY;
        const left = x * CELL_W;
        const top = y * CELL_H;
        const X = (px) => Math.round((left + px) * kx);
        const Y = (py) => Math.round((top + py) * ky);
        const bx = Math.max(1, Math.floor(kx)); // the 1 CSS px border
        const by = Math.max(1, Math.floor(ky));
        const inner = [X(0) + bx, Y(0) + by, X(w) - X(0) - 2 * bx, Y(CELL_H) - Y(0) - 2 * by];
        return { left, top, w, kx, ky, X, Y, inner };
    }

    // Font glyph, styled by its .glyph-* class and centred like the old DOM cells
    drawGlyph(char, g) {
        const ctx = this.ctx;
        const style = this.glyphStyle(glyphClass(char.codePointAt(0)));
        this.ensureFontLoaded(style.font, char);
        // The glyph is laid out in CSS px; CSS transforms apply around its
        // centre (transform-origin)
        ctx.setTransform(g.kx, 0, 0, g.ky, 0, 0);
        ctx.translate(g.left + g.w / 2, g.top + CELL_H / 2);
        const t = style.transform;
        ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
        ctx.font = style.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(char, 0, style.baseline);
    }

    // Sextant cells (incl. the block chars they cover: █ ▌ ▐): the 2x3
    // subpixels as rectangles on the shared subpixel edges, so they exactly
    // fill the inside and line up with hit-testing and the selection overlay
    drawSextant(cell, g) {
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 2; col++) {
                if (!cell.subpixels[row][col]) continue;
                const x0 = g.X(SUB_X_EDGES[col]), y0 = g.Y(SUB_Y_EDGES[row]);
                this.ctx.fillRect(x0, y0, g.X(SUB_X_EDGES[col + 1]) - x0, g.Y(SUB_Y_EDGES[row + 1]) - y0);
            }
        }
    }

    // Block elements, legacy blocks/diagonals/triangles and box drawing
    drawShape(code, g) {
        const ctx = this.ctx;
        // Unit coords of the inside → CSS px in the cell. 0 and 1 map to the
        // cell's outer edges (the clip trims the border off), so shapes reach
        // the inside's edges exactly; interior thirds match the sextant rows.
        const ux = (u) => u <= 0 ? 0 : u >= 1 ? g.w : 1 + u * (g.w - 2);
        const uy = (v) => v <= 0 ? 0 : v >= 1 ? CELL_H : 1 + v * (CELL_H - 2);

        const rects = BLOCK_SHAPES.get(code);
        if (rects) {
            for (const [x0, y0, x1, y1, shade] of rects) {
                const l = g.X(ux(x0)), t = g.Y(uy(y0));
                ctx.beginPath();
                ctx.rect(l, t, g.X(ux(x1)) - l, g.Y(uy(y1)) - t);
                this.fillShape(shade, g);
            }
            return;
        }

        const polygons = LEGACY_POLYGONS.get(code);
        if (polygons) {
            const [shade, ...polys] = polygons;
            ctx.beginPath();
            for (const poly of polys) {
                poly.forEach(([u, v], i) => {
                    const px = g.X(ux(u)), py = g.Y(uy(v));
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                ctx.closePath();
            }
            this.fillShape(shade, g);
            return;
        }

        const stripes = LEGACY_STRIPES.get(code);
        if (stripes) {
            // Parallelogram stripes 2 CSS px wide every 4 px across, slanted
            // to the cell's 1:2 aspect, in canvas coordinates (CSS px)
            const PERIOD = 4, WIDTH = 2;
            const y0 = g.top, y1 = g.top + CELL_H;
            const shift = (y) => stripes * y / 2; // x offset of a stripe at height y
            ctx.setTransform(g.kx, 0, 0, g.ky, 0, 0);
            ctx.beginPath();
            const kMin = Math.floor((g.left - Math.max(shift(y0), shift(y1))) / PERIOD) - 1;
            const kMax = Math.ceil((g.left + g.w - Math.min(shift(y0), shift(y1))) / PERIOD) + 1;
            for (let k = kMin; k <= kMax; k++) {
                const x = k * PERIOD;
                ctx.moveTo(x + shift(y0), y0);
                ctx.lineTo(x + WIDTH + shift(y0), y0);
                ctx.lineTo(x + WIDTH + shift(y1), y1);
                ctx.lineTo(x + shift(y1), y1);
                ctx.closePath();
            }
            ctx.fill();
            return;
        }

        const lines = LEGACY_LINES.get(code);
        if (lines) {
            ctx.lineWidth = Math.max(1, Math.round(2 * Math.min(g.kx, g.ky)));
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            for (const line of lines) {
                line.forEach(([u, v], i) => {
                    const px = g.X(ux(u)), py = g.Y(uy(v));
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
            }
            if (code === 0x1FBAF) { // the vertical stroke across the middle
                ctx.moveTo(g.X(ux(1 / 2)), g.Y(uy(1 / 3)));
                ctx.lineTo(g.X(ux(1 / 2)), g.Y(uy(2 / 3)));
            }
            if (code === 0x1FBAE) ctx.closePath();
            ctx.stroke();
            return;
        }

        this.drawBoxChar(code, g);
    }

    // Fill the current path solid, or with a shade's dot pattern (see
    // SHADE_PATTERNS) in the foreground colour. The pattern is anchored to
    // the canvas origin and scaled from CSS px without smoothing, so dots
    // stay crisp and line up across cells.
    fillShape(shade, g) {
        const ctx = this.ctx;
        if (!shade) {
            ctx.fill();
            return;
        }
        const key = shade + '|' + ctx.fillStyle;
        let pattern = this._shadePatterns.get(key);
        if (!pattern) {
            const tile = document.createElement('canvas');
            tile.width = tile.height = 4;
            const tileCtx = tile.getContext('2d');
            tileCtx.fillStyle = ctx.fillStyle;
            for (let y = 0; y < 4; y++) {
                for (let x = 0; x < 4; x++) {
                    if (SHADE_PATTERNS[shade](x, y)) tileCtx.fillRect(x, y, 1, 1);
                }
            }
            pattern = ctx.createPattern(tile, 'repeat');
            this._shadePatterns.set(key, pattern);
        }
        ctx.save();
        ctx.clip();
        ctx.setTransform(g.kx, 0, 0, g.ky, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = pattern;
        ctx.fillRect(g.left, g.top, g.w, CELL_H);
        ctx.restore();
    }

    // Box drawing (U+2500-257F): lines run from the cell centre to the edges
    // of the inside, so they join seamlessly with the next cell's lines.
    // Light lines are 2 CSS px, heavy 4, double two light lines 3 px either
    // side of the centre.
    drawBoxChar(code, g) {
        const ctx = this.ctx;
        const LIGHT = 2, HEAVY = 4, GAP = 3;
        const cx = g.w / 2, cy = CELL_H / 2;
        const thickness = (style) => style === 2 ? HEAVY : LIGHT;

        // Line from a to b along its axis, centred on c across it (CSS px in
        // the cell); the thickness is a whole number of device pixels so
        // parallel lines look the same in every cell
        const hLine = (a, b, c, t) => {
            const td = Math.max(1, Math.round(t * g.ky));
            const y0 = Math.round((g.top + c) * g.ky - td / 2);
            const x0 = g.X(Math.min(a, b));
            ctx.fillRect(x0, y0, g.X(Math.max(a, b)) - x0, td);
            return y0 + td / 2; // device y of the line's centre
        };
        const vLine = (a, b, c, t) => {
            const td = Math.max(1, Math.round(t * g.kx));
            const x0 = Math.round((g.left + c) * g.kx - td / 2);
            const y0 = g.Y(Math.min(a, b));
            ctx.fillRect(x0, y0, td, g.Y(Math.max(a, b)) - y0);
            return x0 + td / 2;
        };

        const arms = boxArms(code);
        if (arms) {
            const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
            const half = (style) => style === 2 ? HEAVY / 2 : style === 1 ? LIGHT / 2 : 0;
            const outer = (style) => style === 3 ? GAP + LIGHT / 2 : half(style);
            for (const dir of ['up', 'down', 'left', 'right']) {
                const style = arms[dir];
                if (!style) continue;
                const horiz = dir === 'left' || dir === 'right';
                const sign = dir === 'right' || dir === 'down' ? 1 : -1;
                const along = horiz ? cx : cy;
                const across = horiz ? cy : cx;
                const edge = sign > 0 ? (horiz ? g.w : CELL_H) : 0;
                const sideA = horiz ? arms.up : arms.left;    // perpendicular arm on the - side
                const sideB = horiz ? arms.down : arms.right;  // and on the + side
                const opposite = arms[OPPOSITE[dir]];
                // Segment from `start` px past the centre (negative: reaching
                // back beyond it) out to the edge, `offset` px off-centre
                const segment = (start, offset, t) => horiz
                    ? hLine(along + sign * start, edge, across + offset, t)
                    : vLine(along + sign * start, edge, across + offset, t);

                if (style !== 3) {
                    let start = 0; // straight through, or a stub to the centre
                    if (!opposite) {
                        if (sideA === 3 && sideB === 3) start = GAP;          // stop at a double crossbar's near line
                        else if (sideA === 3 || sideB === 3) start = -outer(3); // double corner: reach its far line
                        else start = -Math.max(half(sideA), half(sideB));      // cover the joint
                    }
                    segment(start, 0, thickness(style));
                } else {
                    // Each of the two lines stops where it meets a perpendicular
                    // arm on its own side, or else wraps round the outer corner
                    for (const [side, other, offset] of [[sideA, sideB, -GAP], [sideB, sideA, GAP]]) {
                        let start = 0;
                        if (side) start = side === 3 ? GAP : half(side);
                        else if (other) start = -outer(other);
                        segment(start, offset, LIGHT);
                    }
                }
            }
            return;
        }

        const dash = BOX_DASHES.get(code);
        if (dash) {
            const [horiz, count, style] = dash;
            const len = horiz ? g.w : CELL_H;
            const gap = len / count * 0.35;
            for (let i = 0; i < count; i++) {
                const a = i * len / count + gap / 2, b = (i + 1) * len / count - gap / 2;
                if (horiz) hLine(a, b, cy, thickness(style)); else vLine(a, b, cx, thickness(style));
            }
            return;
        }

        ctx.lineWidth = Math.max(1, Math.round(LIGHT * Math.min(g.kx, g.ky)));
        const arc = BOX_ARCS.get(code);
        if (arc) {
            // Straight light lines that turn the corner along a quarter circle
            const [vDir, hDir] = arc;
            const td = Math.max(1, Math.round(LIGHT * g.ky));
            const hc = Math.round((g.top + cy) * g.ky - td / 2) + td / 2;
            const tdx = Math.max(1, Math.round(LIGHT * g.kx));
            const vc = Math.round((g.left + cx) * g.kx - tdx / 2) + tdx / 2;
            const hEnd = hDir === 'right' ? g.X(g.w) : g.X(0);
            const vEnd = vDir === 'down' ? g.Y(CELL_H) : g.Y(0);
            const r = 6 * Math.min(g.kx, g.ky);
            ctx.beginPath();
            ctx.moveTo(hEnd, hc);
            ctx.arcTo(vc, hc, vc, vEnd, r);
            ctx.lineTo(vc, vEnd);
            ctx.stroke();
            return;
        }

        // ╱ ╲ ╳: diagonals corner to corner
        ctx.beginPath();
        if (code === 0x2571 || code === 0x2573) {
            ctx.moveTo(g.X(0), g.Y(CELL_H));
            ctx.lineTo(g.X(g.w), g.Y(0));
        }
        if (code === 0x2572 || code === 0x2573) {
            ctx.moveTo(g.X(0), g.Y(0));
            ctx.lineTo(g.X(g.w), g.Y(CELL_H));
        }
        ctx.stroke();
    }

    // Unlike DOM text, canvas text doesn't make the browser fetch a web font
    // (or the unicode-range subset holding a char), so ask for it; the
    // 'loadingdone' listener in setupEventListeners redraws once it arrives.
    ensureFontLoaded(font, char) {
        const key = font + char;
        if (this._requestedFonts.has(key) || !document.fonts) return;
        this._requestedFonts.add(key);
        document.fonts.load(font, char).catch(() => {});
    }

    updateCell(x, y) {
        this.updateCellRect(x, y, x, y);
    }

    // Redraw the cells in a rectangle (clipped to the canvas). An edit can
    // also change cells just outside it, by claiming or blanking the other
    // half of a wide char: one cell to the left, two to the right.
    updateCellRect(x1, y1, x2, y2) {
        if (!this.ctx) return;
        x1 = Math.max(0, x1 - 1);
        y1 = Math.max(0, y1);
        x2 = Math.min(this.canvas.width - 1, x2 + 2);
        y2 = Math.min(this.canvas.height - 1, y2);
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) this.drawCell(x, y);
        }
        // The edit may have turned the char under the text cursor wide or narrow
        if (this.textCursor) this.updateTextCursorDisplay();
    }

    // Repaint the cells covering a rectangle given in subpixel coords
    updateSubpixelRect(r) {
        this.updateCellRect(Math.floor(r.x1 / 2), Math.floor(r.y1 / 3), Math.floor(r.x2 / 2), Math.floor(r.y2 / 3));
    }

    // beforeChange() for the cells covering a rectangle in subpixel coords
    beforeSubpixelChange(r) {
        this.beforeChange(Math.floor(r.x1 / 2), Math.floor(r.y1 / 3), Math.floor(r.x2 / 2), Math.floor(r.y2 / 3));
    }

    handleMouseDown(e) {
        // Paste mode takes priority over any tool
        if (this.pasteMode) {
            // Same hit-testing as showPastePreview, so paste lands where previewed
            if (this.isSubpixelMode() && this.subpixelClipboard) {
                const sp = this.subpixelCoordsFromEvent(e);
                if (sp) this.recordEdit('Paste', () => this.pasteAtSubpixel(sp.sx, sp.sy));
            } else if (this.clipboard) {
                const c = this.cellCoordsFromEvent(e);
                if (c) this.recordEdit('Paste', () => this.pasteAt(c.cellX, c.cellY));
            }
            return;
        }

        this.isDrawing = true;
        // Tools that change nothing (select, pick, text click) leave an empty
        // step, which is dropped
        this.beginStroke(this.tool.charAt(0).toUpperCase() + this.tool.slice(1));

        if (this.tool === 'pick') {
            this.handlePickTool(e);
        } else if (this.tool === 'text') {
            this.handleTextToolClick(e);
        } else if (this.tool === 'box' || this.tool === 'line') {
            this.handleShapeToolDown(e);
        } else if (this.isSelectTool()) {
            this.handleSelectToolDown(e);
        } else if (this.tool === 'char') {
            this.handleCharTool(e);
        } else {
            this.handleDrawTool(e);
        }
    }

    handleMouseMove(e) {
        if (this.pasteMode) {
            this.showPastePreview(e);
            return;
        }

        if (!this.isDrawing) return;

        // The button was released where we didn't see it (e.g. outside the
        // browser window): finish the drag now
        if (e.buttons === 0) {
            this.handleMouseUp();
            return;
        }

        if (this.isSelectTool()) {
            this.handleSelectToolMove(e);
        } else if (this.tool === 'box' || this.tool === 'line') {
            this.handleShapeToolMove(e);
        } else if (!this.container.contains(e.target)) {
            // Freehand tools only paint under the pointer: pause outside the
            // canvas (clamping would smear along the edge), and don't join the
            // exit and re-entry points
            this.lastPoint = null;
        } else if (this.tool === 'char') {
            this.handleCharTool(e);
        } else if (this.tool !== 'pick' && this.tool !== 'text') {
            this.handleDrawTool(e);
        }
    }

    handleMouseUp() {
        // Box/line: commit on release
        if (this.dragStart) {
            if (this.tool === 'box') this.commitBox();
            else this.commitLine();
            this.cancelDrag();
        }
        this.selectionStart = null;
        this.subpixelSelectionStart = null;
        this.isDrawing = false;
        this.lastPoint = null;
        this.endStroke();
    }

    handlePickTool(e) {
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        const row = this.canvas.cells[c.cellY];
        // A wide char's tail takes its colours from the head
        const cell = row[c.cellX].type === 'wide-tail' ? row[c.cellX - 1] : row[c.cellX];

        if (this.toolbar) {
            this.toolbar.setColors(cell.fg, cell.bg);
        }
    }

    // All pointer hit-testing uses container-relative coords: grid positions
    // follow directly from CELL_W / CELL_H, and they work for events outside
    // the canvas too.

    // Cell coords from a mouse event, clamped to canvas extents.
    // Works whether the pointer is inside the canvas or outside it.
    cellCoordsFromEvent(e) {
        if (!this.canvas) return null;
        const rect = this.container.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const cellX = Math.max(0, Math.min(this.canvas.width  - 1, Math.floor(relX / CELL_W)));
        const cellY = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(relY / CELL_H)));
        return { cellX, cellY };
    }

    // Subpixel coords from a mouse event, clamped to canvas extents.
    subpixelCoordsFromEvent(e) {
        if (!this.canvas) return null;
        const rect = this.container.getBoundingClientRect();
        const relX = Math.max(0, Math.min(this.canvas.width  * CELL_W - 0.01, e.clientX - rect.left));
        const relY = Math.max(0, Math.min(this.canvas.height * CELL_H - 0.01, e.clientY - rect.top));
        const cellX = Math.floor(relX / CELL_W);
        const cellY = Math.floor(relY / CELL_H);
        // Compare in device pixels against the same rounded edges drawCell
        // uses, so a click lands in exactly the subpixel drawn under it
        const g = this.cellGeometry(cellX, cellY, CELL_W);
        const devX = relX * g.kx;
        const devY = relY * g.ky;
        const col = devX < g.X(SUB_X_EDGES[1]) ? 0 : 1;
        const row = devY < g.Y(SUB_Y_EDGES[1]) ? 0 : devY < g.Y(SUB_Y_EDGES[2]) ? 1 : 2;
        return { sx: cellX * 2 + col, sy: cellY * 3 + row, cellX, cellY };
    }

    // The cell containing subpixel (sx, sy) and the subpixel's row/col within
    // it, or null when off-canvas
    subpixelAt(sx, sy) {
        const cellX = Math.floor(sx / 2);
        const cellY = Math.floor(sy / 3);
        if (cellX < 0 || cellX >= this.canvas.width || cellY < 0 || cellY >= this.canvas.height) {
            return null;
        }
        return { cell: this.canvas.cells[cellY][cellX], cellX, cellY, row: sy % 3, col: sx % 2 };
    }

    // --- Select tools ---

    // Point under the pointer in the active select tool's units (subpixels or cells)
    selectPointFromEvent(e) {
        if (this.isSubpixelMode()) {
            const sp = this.subpixelCoordsFromEvent(e);
            return sp && { x: sp.sx, y: sp.sy };
        }
        const c = this.cellCoordsFromEvent(e);
        return c && { x: c.cellX, y: c.cellY };
    }

    handleSelectToolDown(e) {
        const p = this.selectPointFromEvent(e);
        if (!p) return;
        if (this.isSubpixelMode()) {
            this.subpixelSelectionStart = p;
        } else {
            this.selectionStart = p;
        }
        this.handleSelectToolMove(e);
    }

    handleSelectToolMove(e) {
        const subpixel = this.isSubpixelMode();
        const start = subpixel ? this.subpixelSelectionStart : this.selectionStart;
        const p = start && this.selectPointFromEvent(e);
        if (!p) return;

        if (subpixel) {
            this.subpixelSelection = normRect(start, p);
            this.updateSubpixelSelectionDisplay();
        } else {
            this.selection = normRect(start, p);
            this.updateSelectionDisplay();
        }
    }

    // --- Overlays ---

    // Show `rects` (grid coordinates, inclusive) as overlay divs of the given
    // kind, reusing the kind's existing divs. An empty list hides the overlay.
    // With `subpixel`, coords are in subpixels (2x3 per cell) rather than cells.
    setOverlay(kind, rects, subpixel = false) {
        const els = this._overlays[kind] || (this._overlays[kind] = []);
        while (els.length > rects.length) els.pop().remove();

        const edgeX = subpixel ? subpixelEdgeX : (x) => x * CELL_W;
        const edgeY = subpixel ? subpixelEdgeY : (y) => y * CELL_H;
        rects.forEach((r, i) => {
            let el = els[i];
            if (!el) {
                el = document.createElement('div');
                el.className = `overlay overlay-${kind}` + (subpixel ? ' subpixel' : '');
                this.overlayLayer.appendChild(el);
                els.push(el);
            }
            const left = edgeX(r.x1);
            const top = edgeY(r.y1);
            // Keep the tiled outline pattern aligned to the cell grid when the
            // region starts mid-cell (subpixel coords)
            el.style.cssText =
                `left:${left}px;top:${top}px;` +
                `width:${edgeX(r.x2 + 1) - left}px;height:${edgeY(r.y2 + 1) - top}px;` +
                `background-position:${-(left % CELL_W)}px ${-(top % CELL_H)}px`;
        });
    }

    // Clip a rect to the canvas (in cells, or subpixels); null if nothing is left
    clipRect(r, subpixel = false) {
        const w = this.canvas.width * (subpixel ? 2 : 1);
        const h = this.canvas.height * (subpixel ? 3 : 1);
        const c = {
            x1: Math.max(0, r.x1), y1: Math.max(0, r.y1),
            x2: Math.min(w - 1, r.x2), y2: Math.min(h - 1, r.y2)
        };
        return c.x1 <= c.x2 && c.y1 <= c.y2 ? c : null;
    }

    updateSelectionDisplay() {
        this.setOverlay('selection', this.selection ? [this.selection] : []);
    }

    clearSelection() {
        this.selection = null;
        this.selectionStart = null;
        this.updateSelectionDisplay();
    }

    // Subpixel selection display - outlines individual subpixels
    updateSubpixelSelectionDisplay() {
        this.setOverlay('subpixel-selection', this.subpixelSelection ? [this.subpixelSelection] : [], true);
    }

    clearSubpixelSelection() {
        this.subpixelSelection = null;
        this.subpixelSelectionStart = null;
        this.updateSubpixelSelectionDisplay();
    }

    // --- Copy / cut / paste ---

    async copySelection() {
        if (!this.selection) return;

        const { x1, y1, x2, y2 } = this.selection;
        this.clipboard = this.canvas.cells.slice(y1, y2 + 1)
            .map(row => structuredClone(row.slice(x1, x2 + 1)));

        // Write text representation to system clipboard
        const text = this.cellsToText(this.clipboard);
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.warn('Failed to write to system clipboard:', err);
        }
    }

    cutSelection() {
        if (!this.selection) return;

        this.copySelection();

        const { x1, y1, x2, y2 } = this.selection;
        this.beforeChange(x1, y1, x2, y2);
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                detachWide(this.canvas.cells, x, y);
                this.canvas.cells[y][x] = createCell();
            }
        }

        this.updateCellRect(x1, y1, x2, y2);
        this.clearSelection();
    }

    pasteAt(x, y) {
        if (!this.clipboard || this.clipboard.length === 0) return;

        // One column extra for the tail of a wide char at the right edge
        const maxWidth = Math.max(...this.clipboard.map(row => row.length));
        this.beforeChange(x, y, x + maxWidth, y + this.clipboard.length - 1);
        this.clipboard.forEach((row, dy) => {
            row.forEach((cell, dx) => {
                // A wide char's tail was already placed along with its head
                if (cell.type === 'wide-tail' && dx > 0 && isWideHead(row[dx - 1])) return;
                const tx = x + dx;
                const ty = y + dy;
                if (tx >= 0 && tx < this.canvas.width && ty >= 0 && ty < this.canvas.height) {
                    placeCell(this.canvas.cells, tx, ty, cell);
                }
            });
        });
        this.updateCellRect(x, y, x + maxWidth - 1, y + this.clipboard.length - 1);

        this.pasteMode = false;
        this.clearPastePreview();
    }

    showPastePreview(e) {
        // Subpixel mode paste preview
        if (this.isSubpixelMode() && this.subpixelClipboard) {
            const sp = this.subpixelCoordsFromEvent(e);
            if (!sp) return;

            // Skip when the pointer hasn't moved to a new subpixel
            const key = `s${sp.sx},${sp.sy}`;
            if (key === this._pastePreviewKey) return;
            this._pastePreviewKey = key;

            const r = this.clipRect({
                x1: sp.sx, y1: sp.sy,
                x2: sp.sx + this.subpixelClipboard[0].length - 1,
                y2: sp.sy + this.subpixelClipboard.length - 1
            }, true);
            this.setOverlay('paste-subpixel', r ? [r] : [], true);
            return;
        }

        // Cell-level paste preview
        if (!this.clipboard || this.clipboard.length === 0) return;

        const c = this.cellCoordsFromEvent(e);
        if (!c) return;

        const key = `c${c.cellX},${c.cellY}`;
        if (key === this._pastePreviewKey) return;
        this._pastePreviewKey = key;

        // Rows can differ in length (pasted text), so match pasteAt row by row,
        // merging consecutive rows of equal length into one rect
        const rects = [];
        this.clipboard.forEach((row, dy) => {
            if (row.length === 0) return;
            const y = c.cellY + dy;
            const last = rects[rects.length - 1];
            if (last && last.y2 === y - 1 && last.len === row.length) {
                last.y2 = y;
            } else {
                rects.push({ x1: c.cellX, y1: y, x2: c.cellX + row.length - 1, y2: y, len: row.length });
            }
        });
        this.setOverlay('paste', rects.map(r => this.clipRect(r)).filter(Boolean));
    }

    clearPastePreview() {
        this._pastePreviewKey = null;
        this.setOverlay('paste', []);
        this.setOverlay('paste-subpixel', [], true);
    }

    // Convert a 2D cell array to a multiline text string
    cellsToText(cells) {
        const lines = cells.map(row => row.map(cellToChar).join('').replace(/\s+$/, ''));
        while (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }
        return lines.join('\n');
    }

    // Handle paste: read from system clipboard, fall back to internal clipboard
    async handlePaste() {
        let systemText = null;
        try {
            systemText = await navigator.clipboard.readText();
        } catch (err) {
            console.warn('Failed to read system clipboard:', err);
        }

        // If we have an internal clipboard, check if system clipboard matches it
        // (same copy session) — if so, use the rich internal clipboard to preserve colors
        if (systemText && this.clipboard) {
            const internalText = this.cellsToText(this.clipboard);
            if (systemText === internalText) {
                this.pasteMode = true;
                return;
            }
        }

        // System clipboard has different/new content — parse it into cells
        if (systemText && systemText.trim().length > 0) {
            const cells = parseTextToCells(systemText, this.fgColor, this.bgColor);
            if (cells.length > 0) {
                this.clipboard = cells;
                this.pasteMode = true;
                return;
            }
        }

        // Fall back to internal clipboard
        if (this.clipboard) {
            this.pasteMode = true;
        }
    }

    // Subpixel value and cell colours at subpixel coordinates
    getSubpixelDataAt(sx, sy) {
        const sp = this.subpixelAt(sx, sy);
        if (!sp) return { filled: false, fg: null, bg: null };
        const { cell, row, col } = sp;
        return {
            // Extended chars have no subpixels
            filled: cell.type === 'sextant' && cell.subpixels[row][col],
            fg: { ...cell.fg },
            bg: { ...cell.bg }
        };
    }

    // Subpixel-level copy: extracts raw subpixel values and colors from subpixel selection
    copySelectionSubpixel() {
        if (!this.subpixelSelection) return;

        const { x1, y1, x2, y2 } = this.subpixelSelection;
        this.subpixelClipboard = [];
        for (let sy = y1; sy <= y2; sy++) {
            const row = [];
            for (let sx = x1; sx <= x2; sx++) {
                row.push(this.getSubpixelDataAt(sx, sy));
            }
            this.subpixelClipboard.push(row);
        }
    }

    // Subpixel-level cut: copy subpixels then clear source
    cutSelectionSubpixel() {
        if (!this.subpixelSelection) return;

        this.copySelectionSubpixel();

        const r = this.subpixelSelection;
        this.beforeSubpixelChange(r);
        for (let sy = r.y1; sy <= r.y2; sy++) {
            for (let sx = r.x1; sx <= r.x2; sx++) {
                const sp = this.subpixelAt(sx, sy);
                if (!sp) continue;
                detachWide(this.canvas.cells, sp.cellX, sp.cellY);
                setCellSubpixel(sp.cell, sp.row, sp.col, false);
            }
        }
        this.updateSubpixelRect(r);
        this.clearSubpixelSelection();
    }

    // Subpixel-level paste at subpixel coordinates
    pasteAtSubpixel(sx, sy) {
        if (!this.subpixelClipboard || this.subpixelClipboard.length === 0) return;

        const r = {
            x1: sx, y1: sy,
            x2: sx + this.subpixelClipboard[0].length - 1,
            y2: sy + this.subpixelClipboard.length - 1
        };
        this.beforeSubpixelChange(r);
        this.subpixelClipboard.forEach((row, dy) => {
            row.forEach((data, dx) => {
                const sp = this.subpixelAt(sx + dx, sy + dy);
                if (!sp) return;
                detachWide(this.canvas.cells, sp.cellX, sp.cellY);
                setCellSubpixel(sp.cell, sp.row, sp.col, data.filled);
                if (data.fg) sp.cell.fg = { ...data.fg };
                if (data.bg) sp.cell.bg = { ...data.bg };
            });
        });

        this.updateSubpixelRect(r);
        this.pasteMode = false;
        this.clearPastePreview();
    }

    // --- Draw / erase / char tools ---

    // Freehand strokes: mouse events arrive at most about once per frame, so a
    // fast stroke jumps several subpixels (or cells) between two of them.
    // Fill in the straight line from the previous point so there are no gaps.
    strokeTo(x, y, paint) {
        const from = this.lastPoint;
        this.lastPoint = { x, y };
        if (from && from.x === x && from.y === y) return;
        const points = from ? linePoints(from.x, from.y, x, y).slice(1) : [{ x, y }];
        for (const p of points) paint(p.x, p.y);
    }

    handleDrawTool(e) {
        const p = this.subpixelCoordsFromEvent(e);
        if (!p) return;

        // Repaint each touched cell once, after all its subpixels are set
        const changed = new Map();
        const paint = (sx, sy) => {
            const sp = this.paintSubpixel(sx, sy, this.tool === 'draw');
            if (sp) changed.set(`${sp.cellX},${sp.cellY}`, sp);
        };
        if (this.brushCell) {
            // All six subpixels of each cell along the stroke
            this.strokeTo(p.cellX, p.cellY, (x, y) => {
                for (let sy = y * 3; sy < y * 3 + 3; sy++) {
                    for (let sx = x * 2; sx < x * 2 + 2; sx++) paint(sx, sy);
                }
            });
        } else {
            this.strokeTo(p.sx, p.sy, paint);
        }
        for (const { cellX, cellY } of changed.values()) this.updateCell(cellX, cellY);
    }

    // Set (draw) or clear (erase) one subpixel; returns its subpixelAt() info
    // if anything changed. Drawing gives the cell the current colours; erasing
    // gives it the current background (with "Def", the terminal's own) and
    // keeps the foreground of its remaining subpixels.
    paintSubpixel(sx, sy, filled) {
        const sp = this.subpixelAt(sx, sy);
        const { cell, cellX, cellY, row, col } = sp;

        // Nothing to do if the subpixel and the colours it sets already match
        if (cell.type === 'sextant' && cell.subpixels[row][col] === filled &&
            colorsEqual(cell.bg, this.bgColor) && (!filled || colorsEqual(cell.fg, this.fgColor))) {
            return null;
        }

        this.beforeChange(cellX, cellY, cellX, cellY);
        if (filled) this.applyCurrentColors(cell);
        else cell.bg = { ...this.bgColor };
        detachWide(this.canvas.cells, cellX, cellY);
        setCellSubpixel(cell, row, col, filled);
        return sp;
    }

    handleCharTool(e) {
        if (!this.selectedChar) return;

        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        this.strokeTo(c.cellX, c.cellY, (x, y) => this.placeSelectedChar(x, y));
    }

    placeSelectedChar(cellX, cellY) {
        // A wide char (emoji) needs two cells: skip the last column, where it
        // can't fit, and the tail of the copy just placed while dragging
        const row = this.canvas.cells[cellY];
        if (charWidth(this.selectedChar) === 2 &&
            (cellX === this.canvas.width - 1 ||
             (row[cellX].type === 'wide-tail' && row[cellX - 1].charCode === this.selectedChar))) {
            return;
        }

        this.beforeChange(cellX, cellY, cellX + 1, cellY);
        this.applyCurrentColors(row[cellX]);
        setGridChar(this.canvas.cells, cellX, cellY, this.selectedChar);
        this.updateCell(cellX, cellY);
    }

    // --- Box and line tools (drag from dragStart to dragEnd) ---

    handleShapeToolDown(e) {
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        this.dragStart = { x: c.cellX, y: c.cellY };
        this.handleShapeToolMove(e);
    }

    handleShapeToolMove(e) {
        if (!this.dragStart) return;
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        this.dragEnd = { x: c.cellX, y: c.cellY };

        if (this.tool === 'box') {
            this.showBoxPreview(normRect(this.dragStart, this.dragEnd));
        } else {
            this.showLinePreview();
        }
    }

    cancelDrag() {
        this.dragStart = null;
        this.dragEnd = null;
        this.setOverlay('box', []);
    }

    commitBox() {
        const { x1, y1, x2, y2 } = normRect(this.dragStart, this.dragEnd);

        // Fill: when there is a border, fill the interior only; otherwise fill the whole area
        if (this.boxFillMode > 0) {
            const inset = this.boxLineStyle > 0 ? 1 : 0;
            this.beforeChange(x1 + inset, y1 + inset, x2 - inset, y2 - inset);
            for (let y = y1 + inset; y <= y2 - inset; y++) {
                for (let x = x1 + inset; x <= x2 - inset; x++) {
                    const cell = this.canvas.cells[y][x];
                    if (this.boxFillMode === 1) {
                        detachWide(this.canvas.cells, x, y);
                        clearCell(cell);
                    }
                    this.applyCurrentColors(cell);
                }
            }
        }

        for (const c of computeBoxChars(x1, y1, x2, y2, this.boxLineStyle, this.canvas.cells, boxDrawLookup)) {
            this.beforeChange(c.x, c.y, c.x, c.y);
            this.applyCurrentColors(this.canvas.cells[c.y][c.x]);
            setGridChar(this.canvas.cells, c.x, c.y, c.charCode);
        }

        this.updateCellRect(x1, y1, x2, y2);
    }

    showBoxPreview({ x1, y1, x2, y2 }) {
        if (this.boxFillMode > 0) {
            this.setOverlay('box', [{ x1, y1, x2, y2 }]);
            return;
        }
        // Border cells only: top and bottom rows, then the sides between them
        const rects = [{ x1, y1, x2, y2: y1 }];
        if (y2 > y1) rects.push({ x1, y1: y2, x2, y2 });
        if (y2 - y1 > 1) {
            rects.push({ x1, y1: y1 + 1, x2: x1, y2: y2 - 1 });
            if (x2 > x1) rects.push({ x1: x2, y1: y1 + 1, x2, y2: y2 - 1 });
        }
        this.setOverlay('box', rects);
    }

    commitLine() {
        const chars = computeLineChars(
            this.dragStart.x, this.dragStart.y,
            this.dragEnd.x, this.dragEnd.y,
            this.boxLineStyle, this.canvas.cells, boxDrawLookup
        );
        for (const c of chars) {
            this.beforeChange(c.x, c.y, c.x, c.y);
            this.applyCurrentColors(this.canvas.cells[c.y][c.x]);
            setGridChar(this.canvas.cells, c.x, c.y, c.charCode);
            this.updateCell(c.x, c.y);
        }
    }

    showLinePreview() {
        const path = computeLinePath(
            this.dragStart.x, this.dragStart.y,
            this.dragEnd.x, this.dragEnd.y
        );
        // Merge the path's straight runs into one rect each
        const rects = [];
        for (const { x, y } of path) {
            const r = rects[rects.length - 1];
            const extendsRow = r && r.y1 === r.y2 && y === r.y1 && (x === r.x2 + 1 || x === r.x1 - 1);
            const extendsCol = r && r.x1 === r.x2 && x === r.x1 && (y === r.y2 + 1 || y === r.y1 - 1);
            if (extendsRow) {
                r.x1 = Math.min(r.x1, x);
                r.x2 = Math.max(r.x2, x);
            } else if (extendsCol) {
                r.y1 = Math.min(r.y1, y);
                r.y2 = Math.max(r.y2, y);
            } else {
                rects.push({ x1: x, y1: y, x2: x, y2: y });
            }
        }
        this.setOverlay('box', rects);
    }

    // --- Text tool methods ---

    handleTextToolClick(e) {
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        this.history.breakGroup(); // Typing at a new spot is a new undo step
        this.setTextCursor(c.cellX, c.cellY);
    }

    setTextCursor(x, y) {
        if (!this.canvas) return;
        x = Math.max(0, Math.min(x, this.canvas.width - 1));
        y = Math.max(0, Math.min(y, this.canvas.height - 1));
        // The cursor sits on a wide char's head, never its tail
        if (this.canvas.cells[y][x].type === 'wide-tail') x--;

        this.clearTextCursorDisplay();
        this.textCursor = { x, y };
        this.updateTextCursorDisplay();
    }

    clearTextCursor() {
        this.clearTextCursorDisplay();
        this.textCursor = null;
        this.history.breakGroup();
    }

    // The text cursor is a blinking overlay, two cells wide on a wide char
    updateTextCursorDisplay() {
        if (!this.textCursor) {
            this.clearTextCursorDisplay();
            return;
        }
        // Stay on a wide char's head if an edit put a tail under the cursor
        if (this.canvas.cells[this.textCursor.y][this.textCursor.x].type === 'wide-tail') {
            this.textCursor.x--;
        }
        const { x, y } = this.textCursor;
        const x2 = isWideHead(this.canvas.cells[y][x]) ? x + 1 : x;
        this.setOverlay('cursor', [{ x1: x, y1: y, x2, y2: y }]);
    }

    clearTextCursorDisplay() {
        this.setOverlay('cursor', []);
    }

    // Previous / next character position in reading order (wrapping across
    // rows, stepping over wide chars' tails), or null at the start / end of
    // the canvas
    prevTextPos(x, y) {
        let p = null;
        if (x > 0) p = { x: x - 1, y };
        else if (y > 0) p = { x: this.canvas.width - 1, y: y - 1 };
        if (p && this.canvas.cells[p.y][p.x].type === 'wide-tail') p.x--;
        return p;
    }

    nextTextPos(x, y) {
        const step = isWideHead(this.canvas.cells[y][x]) ? 2 : 1;
        if (x + step < this.canvas.width) return { x: x + step, y };
        if (y < this.canvas.height - 1) return { x: 0, y: y + 1 };
        return null;
    }

    handleTextInput(key) {
        if (!this.textCursor || !this.canvas) return;

        const { x, y } = this.textCursor;
        const moveTo = (p) => { if (p) this.setTextCursor(p.x, p.y); };

        switch (key) {
            case 'Backspace': {
                const p = this.prevTextPos(x, y);
                if (p) this.setTextCell(p.x, p.y, 32); // Clear with space
                moveTo(p);
                return;
            }
            case 'Delete':
                this.setTextCell(x, y, 32);
                return;
            case 'Enter':
                this.setTextCursor(0, y + 1);
                return;
            case 'ArrowLeft':
                moveTo(this.prevTextPos(x, y));
                return;
            case 'ArrowRight':
                moveTo(this.nextTextPos(x, y));
                return;
            case 'ArrowUp':
                this.setTextCursor(x, y - 1);
                return;
            case 'ArrowDown':
                this.setTextCursor(x, y + 1);
                return;
        }

        // Only accept single printable characters (count code points, not
        // UTF-16 units, so astral chars like emoji aren't rejected)
        if ([...key].length !== 1) return;
        const code = key.codePointAt(0);
        const width = charWidth(code);
        if (width === 0) return; // combining mark: nothing to put in a cell

        // A wide char needs two cells; in the last column, wrap to the next row
        let pos = { x, y };
        if (width === 2 && x === this.canvas.width - 1) {
            pos = this.nextTextPos(x, y);
            if (!pos) return;
        }
        this.setTextCell(pos.x, pos.y, code);
        moveTo(this.nextTextPos(pos.x, pos.y)); // stays put at the last cell
    }

    setTextCell(x, y, charCode) {
        this.beforeChange(x, y, x + 1, y);
        this.applyCurrentColors(this.canvas.cells[y][x]);
        setGridChar(this.canvas.cells, x, y, charCode);
        this.updateCell(x, y);
    }

    updateStatus() {
        const status = document.getElementById('status');
        if (status && this.canvas) {
            status.textContent = `${this.canvas.mode.charAt(0).toUpperCase() + this.canvas.mode.slice(1)} Mode | ${this.canvas.width}×${this.canvas.height} chars`;
        }
    }

    // Drop selections and in-progress drags; they refer to the old canvas extents.
    resetInteractionState() {
        this.clearSelection();
        this.clearSubpixelSelection();
        this.pasteMode = false;
        this.clearPastePreview();
        this.cancelDrag();
        this.isDrawing = false;
        this.lastPoint = null;
        this.endStroke();
    }

    resize(width, height) {
        this.resetInteractionState();
        this.recordEdit('Resize', () => {
            this.snapshotCanvas();
            resizeCanvas(this.canvas, width, height);
        });
        this.render();
        this.updateStatus();
    }

    clear() {
        this.recordEdit('Clear', () => {
            this.snapshotCanvas();
            clearCanvas(this.canvas);
        });
        this.drawAll();
    }

    createNew(width, height, mode) {
        this.resetInteractionState();
        this.recordEdit('New', () => {
            this.snapshotCanvas();
            this.canvas = createCanvas(width, height);
            this.canvas.mode = mode || 'sextant';
        });
        this.render();
        this.updateStatus();
    }

    setCanvas(canvasData) {
        this.resetInteractionState();
        this.recordEdit('Open', () => {
            this.snapshotCanvas();
            this.canvas = canvasData;
        });
        this.render();
        this.updateStatus();
    }
}
