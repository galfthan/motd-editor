// Canvas rendering and interaction

class CanvasRenderer {
    constructor(containerEl) {
        this.container = containerEl;
        this.canvas = null;
        this.tool = 'draw'; // 'draw', 'erase', 'char', 'select', 'pick'
        this.selectedChar = null;
        this.fgColor = { r: 255, g: 255, b: 255, default: true };
        this.bgColor = { r: 0, g: 0, b: 0, default: true };
        this.isDrawing = false;
        this.lastCell = null;
        this.toolbar = null; // Set by app.js
        this.fontMode = 'font';

        // Selection state (cell-level for 'select' tool)
        this.selection = null;      // { x1, y1, x2, y2 } normalized (x1 <= x2, y1 <= y2)
        this.selectionStart = null; // Start point during drag
        this.clipboard = null;      // 2D array of cells (char-level)
        this.pasteMode = false;     // Waiting for click to place paste

        // Subpixel selection state (subpixel-level for 'select-subpixel' tool)
        this.subpixelSelection = null;      // { sx1, sy1, sx2, sy2 } in subpixel coords
        this.subpixelSelectionStart = null; // Start point during drag
        this.subpixelClipboard = null;      // 2D array of {filled, fg, bg} objects

        // Text tool state
        this.textCursor = null; // { x, y } cell coordinates, or null

        // Box tool state
        this.boxStart = null;       // { x, y } drag start
        this.boxEnd = null;         // { x, y } drag end
        this.boxLineStyle = 1;      // 0=none, 1=light, 2=heavy, 3=double
        this.boxFillMode = 0;       // 0=no fill, 1=fill & clear, 2=recolor only

        // Line tool state
        this.lineStart = null;      // { x, y } drag start
        this.lineEnd = null;        // { x, y } drag end

        // DOM element cache for O(1) lookups
        this.cellElements = [];     // [y][x] → cell DOM element

        // Overlay divs per decoration kind (see setOverlay)
        this._overlays = {};
        this._pastePreviewKey = null; // Last previewed paste position
        this._textCursorCell = null;

        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    setupEventListeners() {
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.container.addEventListener('mouseup', () => this.handleMouseUp(false));
        this.container.addEventListener('mouseleave', () => this.handleMouseUp(true));

        // Window-level handlers take over while the pointer is outside the canvas:
        // they let select drags and paste-preview keep tracking (clamped to canvas
        // edges) and let a select drag finalise on release outside the canvas.
        window.addEventListener('mousemove', (e) => {
            if (this.container.contains(e.target)) return;
            this.handleMouseMove(e);
        });
        window.addEventListener('mouseup', () => {
            if (this.isDrawing && this.isSelectTool()) {
                this.handleMouseUp(false);
            }
        });

        // Prevent context menu on right-click
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setTool(tool) {
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
        if (tool !== 'box') {
            this.boxStart = null;
            this.boxEnd = null;
        }
        if (tool !== 'line') {
            this.lineStart = null;
            this.lineEnd = null;
        }
        if (tool !== 'box' && tool !== 'line') {
            this.clearBoxPreview();
        }
    }

    isSelectTool() {
        return this.tool === 'select' || this.tool === 'select-subpixel';
    }

    isSubpixelMode() {
        return this.tool === 'select-subpixel';
    }

    getCellElement(x, y) {
        if (y >= 0 && y < this.cellElements.length && x >= 0 && x < this.cellElements[y].length)
            return this.cellElements[y][x];
        return null;
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

            // Escape - clear selection
            if (e.key === 'Escape') {
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

    setSelectedChar(charCode) {
        this.selectedChar = charCode;
        this.tool = 'char';
    }

    setFgColor(color) {
        this.fgColor = color;
    }

    setBgColor(color) {
        this.bgColor = color;
    }

    loadCanvas() {
        this.canvas = createCanvas(80, 60);
        this.render();
        this.updateStatus();
    }

    render() {
        if (!this.canvas) return;

        this.container.innerHTML = '';
        // Cell is 16x32 + 2px border = 18x34 total (2x scale of 8x16 Unifont)
        this.container.style.width = (this.canvas.width * 18) + 'px';
        this.container.style.height = (this.canvas.height * 34) + 'px';

        // Reset caches (innerHTML = '' removed the overlay divs too)
        this.cellElements = [];
        this._overlays = {};
        this._pastePreviewKey = null;
        this._textCursorCell = null;

        // Cells and overlays each live in their own size-contained layer. With
        // the cells as direct children of the container, any overlay update
        // made the browser walk every positioned cell during layout.
        const makeLayer = (className) => {
            const layer = document.createElement('div');
            layer.className = className;
            layer.style.width = this.container.style.width;
            layer.style.height = this.container.style.height;
            this.container.appendChild(layer);
            return layer;
        };
        const cellLayer = makeLayer('cell-layer');
        this.overlayLayer = makeLayer('overlay-layer');

        const fragment = document.createDocumentFragment();
        for (let y = 0; y < this.canvas.height; y++) {
            this.cellElements[y] = [];
            for (let x = 0; x < this.canvas.width; x++) {
                const cell = this.canvas.cells[y][x];
                const cellEl = this.createCellElement(x, y, cell);
                fragment.appendChild(cellEl);
                this.cellElements[y][x] = cellEl;
            }
        }
        cellLayer.appendChild(fragment);

        // Restore selection highlights after re-render (state outlives the DOM)
        this.updateSelectionDisplay();
        this.updateSubpixelSelectionDisplay();

        // Restore text cursor display after re-render
        if (this.textCursor) {
            if (this.textCursor.x >= this.canvas.width || this.textCursor.y >= this.canvas.height) {
                this.textCursor.x = Math.min(this.textCursor.x, this.canvas.width - 1);
                this.textCursor.y = Math.min(this.textCursor.y, this.canvas.height - 1);
            }
            this.updateTextCursorDisplay();
        }
    }

    createCellElement(x, y, cell) {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell';
        cellEl.dataset.x = x;
        cellEl.dataset.y = y;
        this.paintCellElement(cellEl, x, y, cell);
        return cellEl;
    }

    // (Re)paint a cell element in place from cell state. Updating the existing
    // element instead of replacing it keeps layout invalidation local to the
    // cell and preserves decoration classes such as the text cursor.
    paintCellElement(cellEl, x, y, cell) {
        let css = `left:${x * 18}px;top:${y * 34}px`;
        if (!cell.bg.default) {
            css += `;background-color:rgb(${cell.bg.r},${cell.bg.g},${cell.bg.b})`;
        }
        cellEl.style.cssText = css;

        const char = this.cellToChar(cell);
        if (char === ' ') {
            cellEl.textContent = '';
            return;
        }

        // Font styles per glyph range live in CSS (.glyph-*)
        const charCode = char.codePointAt(0);
        const isLegacyTiling = (charCode >= 0x1FB00 && charCode <= 0x1FBAF)
            || (charCode >= 0x1FBCE && charCode <= 0x1FBDF);
        let glyphClass;
        if (isLegacyTiling) glyphClass = 'glyph-tiling';
        else if (charCode >= 0x1FB00) glyphClass = 'glyph-legacy';
        else if (charCode >= 0x2500 && charCode <= 0x259F) glyphClass = 'glyph-box';
        else glyphClass = 'glyph-text';

        const span = document.createElement('span');
        span.className = glyphClass;
        span.textContent = char;
        if (!cell.fg.default) {
            span.style.color = `rgb(${cell.fg.r},${cell.fg.g},${cell.fg.b})`;
        }
        cellEl.replaceChildren(span);
    }

    updateCell(x, y) {
        const cellEl = this.getCellElement(x, y);
        if (cellEl) this.paintCellElement(cellEl, x, y, this.canvas.cells[y][x]);
    }

    // Repaint the cells in a rectangle (clipped to the canvas)
    updateCellRect(x1, y1, x2, y2) {
        x1 = Math.max(0, x1);
        y1 = Math.max(0, y1);
        x2 = Math.min(this.canvas.width - 1, x2);
        y2 = Math.min(this.canvas.height - 1, y2);
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) this.updateCell(x, y);
        }
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
        } else if (this.tool === 'box') {
            this.handleBoxToolDown(e);
        } else if (this.tool === 'line') {
            this.handleLineToolDown(e);
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

        if (this.isSelectTool()) {
            this.handleSelectToolMove(e);
        } else if (this.tool === 'box') {
            this.handleBoxToolMove(e);
        } else if (this.tool === 'line') {
            this.handleLineToolMove(e);
        } else if (this.tool === 'char') {
            this.handleCharTool(e);
        } else if (this.tool !== 'pick' && this.tool !== 'text') {
            this.handleDrawTool(e);
        }
    }

    handleMouseUp(isLeave = false) {
        if (this.tool === 'box' && this.boxStart) {
            if (isLeave) {
                this.boxStart = null;
                this.boxEnd = null;
                this.clearBoxPreview();
            } else {
                this.handleBoxToolUp();
            }
        }
        if (this.tool === 'line' && this.lineStart) {
            if (isLeave) {
                this.lineStart = null;
                this.lineEnd = null;
                this.clearBoxPreview();
            } else {
                this.handleLineToolUp();
            }
        }
        if (this.isSelectTool() && (this.selectionStart || this.subpixelSelectionStart)) {
            if (isLeave) {
                // Drag continues; window-level handlers in setupEventListeners
                // keep updating the clamped selection while the pointer is outside,
                // and finalise when the user releases the button anywhere.
                return;
            }
            this.handleSelectToolUp();
        }
        this.isDrawing = false;
        this.lastCell = null;
    }

    handlePickTool(e) {
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        const cell = this.canvas.cells[c.cellY][c.cellX];

        if (this.toolbar) {
            this.toolbar.setColors(cell.fg, cell.bg);
        }
    }

    // All pointer hit-testing uses container-relative coords. Using
    // e.target.closest('.cell') plus per-cell rects gave inconsistent results at
    // cell boundaries (the child <span> with scaleY(2) and the 1px cell borders
    // can flip e.target between adjacent cells before the position crosses).

    // Cell coords from a mouse event, clamped to canvas extents.
    // Works whether the pointer is inside the canvas or outside it.
    cellCoordsFromEvent(e) {
        if (!this.canvas) return null;
        const rect = this.container.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const cellX = Math.max(0, Math.min(this.canvas.width  - 1, Math.floor(relX / 18)));
        const cellY = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(relY / 34)));
        return { cellX, cellY };
    }

    // Subpixel coords from a mouse event, clamped to canvas extents.
    subpixelCoordsFromEvent(e) {
        if (!this.canvas) return null;
        const rect = this.container.getBoundingClientRect();
        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const sx = Math.max(0, Math.min(this.canvas.width  * 2 - 1, Math.floor(relX / 9)));
        const sy = Math.max(0, Math.min(this.canvas.height * 3 - 1, Math.floor(relY * 3 / 34)));
        return { sx, sy, cellX: Math.floor(sx / 2), cellY: Math.floor(sy / 3) };
    }

    handleSelectToolDown(e) {
        // Subpixel mode handling
        if (this.isSubpixelMode()) {
            const sp = this.subpixelCoordsFromEvent(e);
            if (!sp) return;

            // Start new subpixel selection
            this.clearSubpixelSelection();
            this.subpixelSelectionStart = { sx: sp.sx, sy: sp.sy };
            this.subpixelSelection = { sx1: sp.sx, sy1: sp.sy, sx2: sp.sx, sy2: sp.sy };
            this.updateSubpixelSelectionDisplay();
            return;
        }

        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        const { cellX, cellY } = c;

        this.clearSelection();
        this.selectionStart = { x: cellX, y: cellY };
        this.selection = { x1: cellX, y1: cellY, x2: cellX, y2: cellY };
        this.updateSelectionDisplay();
    }

    handleSelectToolMove(e) {
        // Subpixel mode
        if (this.isSubpixelMode()) {
            if (!this.subpixelSelectionStart) return;
            const sp = this.subpixelCoordsFromEvent(e);
            if (!sp) return;

            this.subpixelSelection = {
                sx1: Math.min(this.subpixelSelectionStart.sx, sp.sx),
                sy1: Math.min(this.subpixelSelectionStart.sy, sp.sy),
                sx2: Math.max(this.subpixelSelectionStart.sx, sp.sx),
                sy2: Math.max(this.subpixelSelectionStart.sy, sp.sy)
            };
            this.updateSubpixelSelectionDisplay();
            return;
        }

        // Cell-level mode
        if (!this.selectionStart) return;

        const c = this.cellCoordsFromEvent(e);
        if (!c) return;

        this.selection = {
            x1: Math.min(this.selectionStart.x, c.cellX),
            y1: Math.min(this.selectionStart.y, c.cellY),
            x2: Math.max(this.selectionStart.x, c.cellX),
            y2: Math.max(this.selectionStart.y, c.cellY)
        };
        this.updateSelectionDisplay();
    }

    handleSelectToolUp() {
        this.selectionStart = null;
        this.subpixelSelectionStart = null;
    }

    // --- Overlays ---

    // Show `rects` (grid coordinates, inclusive) as overlay divs of the given
    // kind, reusing the kind's existing divs. An empty list hides the overlay.
    // With `subpixel`, coords are in subpixels (2x3 per cell) rather than cells.
    setOverlay(kind, rects, subpixel = false) {
        const els = this._overlays[kind] || (this._overlays[kind] = []);
        while (els.length > rects.length) els.pop().remove();

        const unitW = subpixel ? 9 : 18;
        const unitH = subpixel ? 34 / 3 : 34;
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
                `background-position:${-(left % 18)}px ${-(top % 34)}px`;
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
        const s = this.subpixelSelection;
        const rects = s ? [{ x1: s.sx1, y1: s.sy1, x2: s.sx2, y2: s.sy2 }] : [];
        this.setOverlay('subpixel-selection', rects, true);
    }

    clearSubpixelSelection() {
        this.subpixelSelection = null;
        this.subpixelSelectionStart = null;
        this.updateSubpixelSelectionDisplay();
    }

    async copySelection() {
        if (!this.selection) return;

        const { x1, y1, x2, y2 } = this.selection;
        this.clipboard = [];

        for (let y = y1; y <= y2; y++) {
            const row = [];
            for (let x = x1; x <= x2; x++) {
                // Deep copy the cell
                row.push(JSON.parse(JSON.stringify(this.canvas.cells[y][x])));
            }
            this.clipboard.push(row);
        }

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
                clearCell(this.canvas.cells[y][x]);
                this.canvas.cells[y][x].fg = { r: 255, g: 255, b: 255, default: true };
                this.canvas.cells[y][x].bg = { r: 0, g: 0, b: 0, default: true };
            }
        }

        this.updateCellRect(x1, y1, x2, y2);
        this.clearSelection();
    }

    pasteAt(x, y) {
        if (!this.clipboard || this.clipboard.length === 0) return;

        let maxWidth = 0;
        for (let dy = 0; dy < this.clipboard.length; dy++) {
            maxWidth = Math.max(maxWidth, this.clipboard[dy].length);
            for (let dx = 0; dx < this.clipboard[dy].length; dx++) {
                const tx = x + dx;
                const ty = y + dy;
                if (tx >= 0 && tx < this.canvas.width && ty >= 0 && ty < this.canvas.height) {
                    this.canvas.cells[ty][tx] = JSON.parse(JSON.stringify(this.clipboard[dy][dx]));
                }
            }
        }
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

    // Convert a 2D subpixels array to a 6-bit sextant pattern
    subpixelsToPattern(subpixels) {
        let pattern = 0;
        if (subpixels[0][0]) pattern |= 1;
        if (subpixels[0][1]) pattern |= 2;
        if (subpixels[1][0]) pattern |= 4;
        if (subpixels[1][1]) pattern |= 8;
        if (subpixels[2][0]) pattern |= 16;
        if (subpixels[2][1]) pattern |= 32;
        return pattern;
    }

    // Convert a 6-bit sextant pattern to its Unicode character
    sextantPatternToChar(pattern) {
        if (pattern === 0)  return ' ';
        if (pattern === 63) return '\u2588';  // full block
        if (pattern === 21) return '\u258C';  // left half
        if (pattern === 42) return '\u2590';  // right half

        let offset = pattern;
        if (pattern > 42)      offset -= 3;
        else if (pattern > 21) offset -= 2;
        else                   offset -= 1;

        return String.fromCodePoint(0x1FB00 + offset);
    }

    // Convert a single cell to its Unicode character
    cellToChar(cell) {
        if (cell.type === 'sextant') {
            const pattern = this.subpixelsToPattern(cell.subpixels);
            return this.sextantPatternToChar(pattern);
        }
        if (cell.charCode && cell.charCode !== 0) {
            return String.fromCodePoint(cell.charCode);
        }
        return ' ';
    }

    // Convert a 2D cell array to a multiline text string
    cellsToText(cells) {
        const lines = [];
        for (const row of cells) {
            let line = '';
            for (const cell of row) {
                line += this.cellToChar(cell);
            }
            lines.push(line.replace(/\s+$/, ''));
        }
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

    // Get subpixel value at subpixel coordinates
    getSubpixelAt(sx, sy) {
        const cellX = Math.floor(sx / 2);
        const cellY = Math.floor(sy / 3);
        const subCol = sx % 2;
        const subRow = sy % 3;

        if (cellX < 0 || cellX >= this.canvas.width || cellY < 0 || cellY >= this.canvas.height) {
            return false;
        }

        const cell = this.canvas.cells[cellY][cellX];
        if (cell.type !== 'sextant') {
            return false; // Extended chars have no subpixels
        }
        return cell.subpixels[subRow][subCol];
    }

    // Get subpixel value and colors at subpixel coordinates
    getSubpixelDataAt(sx, sy) {
        const cellX = Math.floor(sx / 2);
        const cellY = Math.floor(sy / 3);
        const subCol = sx % 2;
        const subRow = sy % 3;

        if (cellX < 0 || cellX >= this.canvas.width || cellY < 0 || cellY >= this.canvas.height) {
            return { filled: false, fg: null, bg: null };
        }

        const cell = this.canvas.cells[cellY][cellX];
        if (cell.type !== 'sextant') {
            return { filled: false, fg: { ...cell.fg }, bg: { ...cell.bg } };
        }
        return {
            filled: cell.subpixels[subRow][subCol],
            fg: { ...cell.fg },
            bg: { ...cell.bg }
        };
    }

    // Subpixel-level copy: extracts raw subpixel values and colors from subpixel selection
    copySelectionSubpixel() {
        if (!this.subpixelSelection) return;

        const { sx1, sy1, sx2, sy2 } = this.subpixelSelection;
        const width = sx2 - sx1 + 1;
        const height = sy2 - sy1 + 1;

        // Create 2D array of {filled, fg, bg} objects
        this.subpixelClipboard = [];
        for (let dy = 0; dy < height; dy++) {
            const row = [];
            for (let dx = 0; dx < width; dx++) {
                row.push(this.getSubpixelDataAt(sx1 + dx, sy1 + dy));
            }
            this.subpixelClipboard.push(row);
        }
    }

    // Subpixel-level cut: copy subpixels then clear source
    cutSelectionSubpixel() {
        if (!this.subpixelSelection) return;

        this.copySelectionSubpixel();

        const { sx1, sy1, sx2, sy2 } = this.subpixelSelection;
        for (let sy = sy1; sy <= sy2; sy++) {
            for (let sx = sx1; sx <= sx2; sx++) {
                const cellX = Math.floor(sx / 2);
                const cellY = Math.floor(sy / 3);
                const subCol = sx % 2;
                const subRow = sy % 3;
                if (cellX >= 0 && cellX < this.canvas.width && cellY >= 0 && cellY < this.canvas.height) {
                    setCellSubpixel(this.canvas.cells[cellY][cellX], subRow, subCol, false);
                }
            }
        }
        this.updateCellRect(Math.floor(sx1 / 2), Math.floor(sy1 / 3), Math.floor(sx2 / 2), Math.floor(sy2 / 3));
        this.clearSubpixelSelection();
    }

    // Subpixel-level paste at subpixel coordinates
    pasteAtSubpixel(sx, sy) {
        if (!this.subpixelClipboard || this.subpixelClipboard.length === 0) return;

        const height = this.subpixelClipboard.length;
        const width = this.subpixelClipboard[0].length;

        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const targetSx = sx + dx;
                const targetSy = sy + dy;
                const cellX = Math.floor(targetSx / 2);
                const cellY = Math.floor(targetSy / 3);
                const subCol = targetSx % 2;
                const subRow = targetSy % 3;

                if (cellX < 0 || cellX >= this.canvas.width || cellY < 0 || cellY >= this.canvas.height) {
                    continue;
                }

                const data = this.subpixelClipboard[dy][dx];
                const cell = this.canvas.cells[cellY][cellX];
                setCellSubpixel(cell, subRow, subCol, data.filled);
                if (data.fg) cell.fg = { ...data.fg };
                if (data.bg) cell.bg = { ...data.bg };
            }
        }

        this.updateCellRect(
            Math.floor(sx / 2), Math.floor(sy / 3),
            Math.floor((sx + width - 1) / 2), Math.floor((sy + height - 1) / 3)
        );
        this.pasteMode = false;
        this.clearPastePreview();
    }

    handleDrawTool(e) {
        if (!this.canvas) return;
        const sp = this.subpixelCoordsFromEvent(e);
        if (!sp) return;

        const { cellX, cellY, sx, sy } = sp;
        const subCol = sx % 2;
        const subRow = sy % 3;

        // Avoid re-processing same subpixel while dragging
        const key = `${cellX},${cellY},${subRow},${subCol}`;
        if (this.lastCell === key) return;
        this.lastCell = key;

        const filled = this.tool === 'draw';
        const cell = this.canvas.cells[cellY][cellX];

        // Nothing to do if the subpixel (and, when drawing, the colours) already match
        if (cell.type === 'sextant' && cell.subpixels[subRow][subCol] === filled &&
            (!filled || (colorsEqual(cell.fg, this.fgColor) && colorsEqual(cell.bg, this.bgColor)))) {
            return;
        }

        // Erase keeps the cell's colours so the remaining subpixels are unchanged
        if (filled) {
            cell.fg = { ...this.fgColor };
            cell.bg = { ...this.bgColor };
        }
        setCellSubpixel(cell, subRow, subCol, filled);
        this.updateCell(cellX, cellY);
    }

    handleCharTool(e) {
        if (!this.selectedChar) return;

        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        const { cellX, cellY } = c;

        // Avoid re-processing same cell while dragging
        const key = `${cellX},${cellY}`;
        if (this.lastCell === key) return;
        this.lastCell = key;

        const cell = this.canvas.cells[cellY][cellX];
        cell.fg = { ...this.fgColor };
        cell.bg = { ...this.bgColor };
        setCellChar(cell, this.selectedChar);
        this.updateCell(cellX, cellY);
    }

    // --- Box tool methods ---

    handleBoxToolDown(e) {
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        const x = c.cellX;
        const y = c.cellY;
        this.boxStart = { x, y };
        this.boxEnd = { x, y };
        this.showBoxPreview(x, y, x, y);
    }

    handleBoxToolMove(e) {
        if (!this.boxStart) return;
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        this.boxEnd = { x: c.cellX, y: c.cellY };

        const x1 = Math.min(this.boxStart.x, this.boxEnd.x);
        const y1 = Math.min(this.boxStart.y, this.boxEnd.y);
        const x2 = Math.max(this.boxStart.x, this.boxEnd.x);
        const y2 = Math.max(this.boxStart.y, this.boxEnd.y);
        this.showBoxPreview(x1, y1, x2, y2);
    }

    handleBoxToolUp() {
        if (!this.boxStart || !this.boxEnd) return;

        const x1 = Math.min(this.boxStart.x, this.boxEnd.x);
        const y1 = Math.min(this.boxStart.y, this.boxEnd.y);
        const x2 = Math.max(this.boxStart.x, this.boxEnd.x);
        const y2 = Math.max(this.boxStart.y, this.boxEnd.y);

        let changed = false;

        // Fill: when there is a border, fill the interior only; otherwise fill the whole area
        if (this.boxFillMode > 0) {
            const hasBorder = this.boxLineStyle > 0;
            const fx1 = hasBorder ? x1 + 1 : x1;
            const fy1 = hasBorder ? y1 + 1 : y1;
            const fx2 = hasBorder ? x2 - 1 : x2;
            const fy2 = hasBorder ? y2 - 1 : y2;
            for (let y = fy1; y <= fy2; y++) {
                for (let x = fx1; x <= fx2; x++) {
                    const cell = this.canvas.cells[y][x];
                    if (this.boxFillMode === 1) {
                        clearCell(cell);
                    }
                    cell.fg = { ...this.fgColor };
                    cell.bg = { ...this.bgColor };
                    changed = true;
                }
            }
        }

        const chars = computeBoxChars(x1, y1, x2, y2, this.boxLineStyle, this.canvas.cells, boxDrawLookup);
        for (const c of chars) {
            const cell = this.canvas.cells[c.y][c.x];
            cell.fg = { ...this.fgColor };
            cell.bg = { ...this.bgColor };
            setCellChar(cell, c.charCode);
            changed = true;
        }

        if (changed) {
            this.updateCellRect(x1, y1, x2, y2);
        }

        this.boxStart = null;
        this.boxEnd = null;
        this.clearBoxPreview();
    }

    showBoxPreview(x1, y1, x2, y2) {
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

    clearBoxPreview() {
        this.setOverlay('box', []);
    }

    // --- Line tool methods ---

    handleLineToolDown(e) {
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        this.lineStart = { x: c.cellX, y: c.cellY };
        this.lineEnd = { x: c.cellX, y: c.cellY };
    }

    handleLineToolMove(e) {
        if (!this.lineStart) return;
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        this.lineEnd = { x: c.cellX, y: c.cellY };
        this.showLinePreview();
    }

    handleLineToolUp() {
        if (!this.lineStart || !this.lineEnd) return;

        const chars = computeLineChars(
            this.lineStart.x, this.lineStart.y,
            this.lineEnd.x, this.lineEnd.y,
            this.boxLineStyle, this.canvas.cells, boxDrawLookup
        );

        for (const c of chars) {
            const cell = this.canvas.cells[c.y][c.x];
            cell.fg = { ...this.fgColor };
            cell.bg = { ...this.bgColor };
            setCellChar(cell, c.charCode);
        }
        for (const c of chars) this.updateCell(c.x, c.y);

        this.lineStart = null;
        this.lineEnd = null;
        this.clearBoxPreview();
    }

    showLinePreview() {
        if (!this.lineStart || !this.lineEnd) {
            this.clearBoxPreview();
            return;
        }
        const path = computeLinePath(
            this.lineStart.x, this.lineStart.y,
            this.lineEnd.x, this.lineEnd.y
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

        this.clearTextCursorDisplay();
        this.textCursor = { x, y };
        this.updateTextCursorDisplay();
    }

    clearTextCursor() {
        this.clearTextCursorDisplay();
        this.textCursor = null;
    }

    updateTextCursorDisplay() {
        if (!this.textCursor) return;
        const { x, y } = this.textCursor;
        const cellEl = this.getCellElement(x, y);
        if (cellEl) {
            cellEl.classList.add('text-cursor');
            this._textCursorCell = cellEl;
        }
    }

    clearTextCursorDisplay() {
        if (this._textCursorCell) {
            this._textCursorCell.classList.remove('text-cursor');
            this._textCursorCell = null;
        }
    }

    handleTextInput(key) {
        if (!this.textCursor || !this.canvas) return;

        const { x, y } = this.textCursor;

        if (key === 'Backspace') {
            let newX = x - 1;
            let newY = y;
            if (newX < 0) {
                if (newY > 0) {
                    newY--;
                    newX = this.canvas.width - 1;
                } else {
                    return; // At top-left corner
                }
            }
            this.setTextCell(newX, newY, 32); // Clear with space
            this.setTextCursor(newX, newY);
            return;
        }

        if (key === 'Enter') {
            let newY = Math.min(y + 1, this.canvas.height - 1);
            this.setTextCursor(0, newY);
            return;
        }

        if (key === 'ArrowLeft') {
            let newX = x - 1, newY = y;
            if (newX < 0) {
                if (newY > 0) { newY--; newX = this.canvas.width - 1; }
                else { newX = 0; }
            }
            this.setTextCursor(newX, newY);
            return;
        }

        if (key === 'ArrowRight') {
            let newX = x + 1, newY = y;
            if (newX >= this.canvas.width) {
                if (newY < this.canvas.height - 1) { newY++; newX = 0; }
                else { newX = this.canvas.width - 1; }
            }
            this.setTextCursor(newX, newY);
            return;
        }

        if (key === 'ArrowUp') {
            if (y > 0) this.setTextCursor(x, y - 1);
            return;
        }

        if (key === 'ArrowDown') {
            if (y < this.canvas.height - 1) this.setTextCursor(x, y + 1);
            return;
        }

        if (key === 'Delete') {
            this.setTextCell(x, y, 32); // Clear with space
            this.updateTextCursorDisplay();
            return;
        }

        // Only accept single printable characters (count code points, not
        // UTF-16 units, so astral chars like emoji aren't rejected)
        if ([...key].length !== 1) return;

        const charCode = key.codePointAt(0);
        this.setTextCell(x, y, charCode);

        // Advance cursor right with wrapping
        let newX = x + 1, newY = y;
        if (newX >= this.canvas.width) {
            newX = 0;
            newY++;
            if (newY >= this.canvas.height) {
                newY = this.canvas.height - 1;
                newX = this.canvas.width - 1;
            }
        }
        this.setTextCursor(newX, newY);
    }

    setTextCell(x, y, charCode) {
        const cell = this.canvas.cells[y][x];
        cell.fg = { ...this.fgColor };
        cell.bg = { ...this.bgColor };
        setCellChar(cell, charCode);
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
        this.boxStart = null;
        this.boxEnd = null;
        this.lineStart = null;
        this.lineEnd = null;
        this.clearBoxPreview();
        this.isDrawing = false;
        this.lastCell = null;
    }

    resize(width, height) {
        this.resetInteractionState();
        resizeCanvas(this.canvas, width, height);
        this.render();
        this.updateStatus();
    }

    clear() {
        clearCanvas(this.canvas);
        this.render();
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
