// Canvas rendering and interaction

// Cell is 16x32 + 2px border = 18x34 total (2x scale of 8x16 Unifont), holding
// 2x3 subpixels. style.css hardcodes the same sizes for cells and overlays.
const CELL_W = 18;
const CELL_H = 34;
const SUB_W = CELL_W / 2;
const SUB_H = CELL_H / 3;

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

        // Grid canvas drawing state (see render / drawCell)
        this.ctx = null;                // 2D context of the grid canvas
        this._onPixelRatioChange = () => this.render();
        this._glyphStyles = new Map();  // .glyph-* class → { font, transform, baseline }
        this._requestedFonts = new Set();

        // Overlay divs per decoration kind (see setOverlay)
        this._overlays = {};
        this._pastePreviewKey = null; // Last previewed paste position

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

            // Text tool input handling (non-modifier keys only)
            if (this.tool === 'text' && this.textCursor && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (e.key === 'Escape') {
                    this.clearTextCursor();
                    e.preventDefault();
                    return;
                }
                e.preventDefault();
                this.handleTextInput(e.key);
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
                    this.cutSelectionSubpixel();
                } else if (this.selection) {
                    e.preventDefault();
                    this.cutSelection();
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

    // Draw one cell on the grid canvas, matching the old DOM cells: a 1px
    // border, the background inside it, and the glyph centred and clipped to
    // the inside. A wide char is drawn two cells wide from its head; drawing
    // its tail draws the head.
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
        const kx = this._scaleX;
        const ky = this._scaleY;
        const w = isWideHead(cell) ? 2 * CELL_W : CELL_W;
        const left = x * CELL_W;
        const top = y * CELL_H;

        // Border and background are drawn in device pixels, snapped to whole
        // pixels (like DOM borders), so they stay sharp at fractional pixel
        // ratios such as 125% display scaling
        const dx0 = Math.round(left * kx), dx1 = Math.round((left + w) * kx);
        const dy0 = Math.round(top * ky), dy1 = Math.round((top + CELL_H) * ky);
        const bx = Math.max(1, Math.floor(kx)), by = Math.max(1, Math.floor(ky)); // 1 CSS px
        const inner = [dx0 + bx, dy0 + by, dx1 - dx0 - 2 * bx, dy1 - dy0 - 2 * by];
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.theme.border;
        ctx.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
        ctx.fillStyle = cell.bg.default ? this.theme.cellBg : `rgb(${cell.bg.r},${cell.bg.g},${cell.bg.b})`;
        ctx.fillRect(...inner);

        const char = cellToChar(cell);
        if (char === ' ') return;

        const style = this.glyphStyle(glyphClass(char.codePointAt(0)));
        this.ensureFontLoaded(style.font, char);

        ctx.save();
        ctx.beginPath();
        ctx.rect(...inner);
        ctx.clip();
        // The glyph is laid out in CSS px; CSS transforms apply around its
        // centre (transform-origin)
        ctx.setTransform(kx, 0, 0, ky, 0, 0);
        ctx.translate(left + w / 2, top + CELL_H / 2);
        const t = style.transform;
        ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
        ctx.font = style.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = cell.fg.default ? this.theme.fg : `rgb(${cell.fg.r},${cell.fg.g},${cell.fg.b})`;
        ctx.fillText(char, 0, style.baseline);
        ctx.restore();
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

    handleMouseDown(e) {
        // Paste mode takes priority over any tool
        if (this.pasteMode) {
            // Same hit-testing as showPastePreview, so paste lands where previewed
            if (this.isSubpixelMode() && this.subpixelClipboard) {
                const sp = this.subpixelCoordsFromEvent(e);
                if (sp) this.pasteAtSubpixel(sp.sx, sp.sy);
            } else if (this.clipboard) {
                const c = this.cellCoordsFromEvent(e);
                if (c) this.pasteAt(c.cellX, c.cellY);
            }
            return;
        }

        this.isDrawing = true;

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
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const sx = Math.max(0, Math.min(this.canvas.width  * 2 - 1, Math.floor(relX / SUB_W)));
        const sy = Math.max(0, Math.min(this.canvas.height * 3 - 1, Math.floor(relY / SUB_H)));
        return { sx, sy, cellX: Math.floor(sx / 2), cellY: Math.floor(sy / 3) };
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

        const unitW = subpixel ? SUB_W : CELL_W;
        const unitH = subpixel ? SUB_H : CELL_H;
        rects.forEach((r, i) => {
            let el = els[i];
            if (!el) {
                el = document.createElement('div');
                el.className = `overlay overlay-${kind}` + (subpixel ? ' subpixel' : '');
                this.overlayLayer.appendChild(el);
                els.push(el);
            }
            const left = r.x1 * unitW;
            const top = r.y1 * unitH;
            // Keep the tiled outline pattern aligned to the cell grid when the
            // region starts mid-cell (subpixel coords)
            el.style.cssText =
                `left:${left}px;top:${top}px;` +
                `width:${(r.x2 - r.x1 + 1) * unitW}px;height:${(r.y2 - r.y1 + 1) * unitH}px;` +
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

        let maxWidth = 0;
        this.clipboard.forEach((row, dy) => {
            maxWidth = Math.max(maxWidth, row.length);
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

        this.updateSubpixelRect({
            x1: sx, y1: sy,
            x2: sx + this.subpixelClipboard[0].length - 1,
            y2: sy + this.subpixelClipboard.length - 1
        });
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
        this.strokeTo(p.sx, p.sy, (sx, sy) => {
            const sp = this.paintSubpixel(sx, sy, this.tool === 'draw');
            if (sp) changed.set(`${sp.cellX},${sp.cellY}`, sp);
        });
        for (const { cellX, cellY } of changed.values()) this.updateCell(cellX, cellY);
    }

    // Set (draw) or clear (erase) one subpixel; returns its subpixelAt() info
    // if anything changed
    paintSubpixel(sx, sy, filled) {
        const sp = this.subpixelAt(sx, sy);
        const { cell, cellX, cellY, row, col } = sp;

        // Nothing to do if the subpixel (and, when drawing, the colours) already match
        if (cell.type === 'sextant' && cell.subpixels[row][col] === filled &&
            (!filled || (colorsEqual(cell.fg, this.fgColor) && colorsEqual(cell.bg, this.bgColor)))) {
            return null;
        }

        // Erase keeps the cell's colours so the remaining subpixels are unchanged
        if (filled) this.applyCurrentColors(cell);
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
    }

    resize(width, height) {
        this.resetInteractionState();
        resizeCanvas(this.canvas, width, height);
        this.render();
        this.updateStatus();
    }

    clear() {
        clearCanvas(this.canvas);
        this.drawAll();
    }

    createNew(width, height, mode) {
        this.resetInteractionState();
        this.canvas = createCanvas(width, height);
        this.canvas.mode = mode || 'sextant';
        this.render();
        this.updateStatus();
    }

    setCanvas(canvasData) {
        this.resetInteractionState();
        this.canvas = canvasData;
        this.render();
        this.updateStatus();
    }
}
