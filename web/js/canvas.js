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
        this.fontMode = 'font'; // 'bitmap' or 'font'

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
        this.boxLineStyle = 1;      // 1=light, 2=heavy, 3=double

        // Line tool state
        this.lineStart = null;      // { x, y } drag start
        this.lineEnd = null;        // { x, y } drag end

        // DOM element cache for O(1) lookups
        this.cellElements = [];     // [y][x] → cell DOM element
        this.subpixelElements = []; // [y][x][row][col] → subpixel DOM element

        // Decoration tracking sets for O(1) clear operations
        this._selectedCells = new Set();
        this._selectedSubpixels = new Set();
        this._partialSelectedCells = new Set();
        this._pastePreviewCells = new Set();
        this._pastePreviewSubpixels = new Set();
        this._boxPreviewCells = new Set();
        this._textCursorCell = null;

        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    setupEventListeners() {
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.container.addEventListener('mouseup', () => this.handleMouseUp(false));
        this.container.addEventListener('mouseleave', () => this.handleMouseUp(true));

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

    getSubpixelElement(cellX, cellY, row, col) {
        return this.subpixelElements[cellY]?.[cellX]?.[row]?.[col] || null;
    }

    cacheSubpixels(x, y, cellEl, cell) {
        if (cell.type === 'sextant') {
            this.subpixelElements[y][x] = [];
            const subs = cellEl.querySelectorAll('.subpixel');
            for (let i = 0; i < subs.length; i++) {
                const r = Math.floor(i / 2), c = i % 2;
                if (!this.subpixelElements[y][x][r]) this.subpixelElements[y][x][r] = [];
                this.subpixelElements[y][x][r][c] = subs[i];
            }
        } else {
            this.subpixelElements[y][x] = null;
        }
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

            // Ctrl+C - copy
            if (e.ctrlKey && e.key === 'c') {
                e.preventDefault();
                if (this.isSubpixelMode() && this.subpixelSelection) {
                    this.copySelectionSubpixel();
                } else if (this.selection) {
                    this.copySelection();
                }
                return;
            }

            // Ctrl+X - cut
            if (e.ctrlKey && e.key === 'x') {
                e.preventDefault();
                if (this.isSubpixelMode() && this.subpixelSelection) {
                    this.cutSelectionSubpixel();
                } else if (this.selection) {
                    this.cutSelection();
                }
                return;
            }

            // Ctrl+V - paste
            if (e.ctrlKey && e.key === 'v') {
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

    async loadCanvas() {
        try {
            this.canvas = await API.getCanvas();
            this.render();
            this.updateStatus();
        } catch (error) {
            console.error('Failed to load canvas:', error);
        }
    }

    render() {
        if (!this.canvas) return;

        this.container.innerHTML = '';
        // Cell is 16x32 + 2px border = 18x34 total (2x scale of 8x16 Unifont)
        this.container.style.gridTemplateColumns = `repeat(${this.canvas.width}, 18px)`;
        this.container.style.gridTemplateRows = `repeat(${this.canvas.height}, 34px)`;

        // Reset caches
        this.cellElements = [];
        this.subpixelElements = [];
        this._selectedCells.clear();
        this._selectedSubpixels.clear();
        this._partialSelectedCells.clear();
        this._pastePreviewCells.clear();
        this._pastePreviewSubpixels.clear();
        this._boxPreviewCells.clear();
        this._textCursorCell = null;

        for (let y = 0; y < this.canvas.height; y++) {
            this.cellElements[y] = [];
            this.subpixelElements[y] = [];
            for (let x = 0; x < this.canvas.width; x++) {
                const cell = this.canvas.cells[y][x];
                const cellEl = this.createCellElement(x, y, cell);
                this.container.appendChild(cellEl);
                this.cellElements[y][x] = cellEl;
                this.cacheSubpixels(x, y, cellEl, cell);
            }
        }

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

        // Apply background color
        if (!cell.bg.default) {
            cellEl.style.backgroundColor = `rgb(${cell.bg.r}, ${cell.bg.g}, ${cell.bg.b})`;
        }

        if (cell.type === 'sextant') {
            // Create 6 subpixel elements
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 2; col++) {
                    const subEl = document.createElement('div');
                    subEl.className = 'subpixel';
                    subEl.dataset.row = row;
                    subEl.dataset.col = col;

                    if (cell.subpixels[row][col]) {
                        subEl.classList.add('filled');
                        if (!cell.fg.default) {
                            subEl.style.backgroundColor = `rgb(${cell.fg.r}, ${cell.fg.g}, ${cell.fg.b})`;
                        }
                    } else {
                        // Unfilled subpixels show the background color
                        if (!cell.bg.default) {
                            subEl.style.backgroundColor = `rgb(${cell.bg.r}, ${cell.bg.g}, ${cell.bg.b})`;
                        }
                    }

                    cellEl.appendChild(subEl);
                }
            }
        } else {
            // Extended character - render via bitmap renderer for exact dimensions
            cellEl.classList.add('extended');
            const charCode = cell.charCode || 32;

            const useBitmap = this.fontMode !== 'font'
                && bitmapRenderer && bitmapRenderer.ready
                && bitmapRenderer.hasGlyph(charCode);

            if (useBitmap) {
                const img = bitmapRenderer.createImage(charCode, cell.fg, cell.bg);
                if (img) {
                    cellEl.appendChild(img);
                }
            } else {
                // Fallback to text if bitmap not available
                const char = String.fromCodePoint(charCode);
                const isLegacyTiling = (charCode >= 0x1FB00 && charCode <= 0x1FBAF)
                    || (charCode >= 0x1FBCE && charCode <= 0x1FBDF);
                const isLegacyMisc = charCode >= 0x1FB00 && !isLegacyTiling;
                if (isLegacyTiling) {
                    // Legacy Computing tiling symbols — square glyphs need
                    // fontSize matching cell width + scaleY(2) to fill 1:2 cell
                    const span = document.createElement('span');
                    span.textContent = char;
                    span.style.fontFamily = "'Noto Sans Symbols 2', 'Cascadia Code', 'Consolas', monospace";
                    span.style.fontSize = '16px';
                    span.style.lineHeight = '1';
                    span.style.transform = 'scaleY(2) translateY(1px)';
                    if (!cell.fg.default) {
                        span.style.color = `rgb(${cell.fg.r}, ${cell.fg.g}, ${cell.fg.b})`;
                    }
                    cellEl.appendChild(span);
                } else if (isLegacyMisc) {
                    // Legacy Computing icons — square glyphs, no vertical stretch
                    const span = document.createElement('span');
                    span.textContent = char;
                    span.style.fontFamily = "'Noto Sans Symbols 2', 'Cascadia Code', 'Consolas', monospace";
                    span.style.fontSize = '16px';
                    span.style.lineHeight = '1';
                    if (!cell.fg.default) {
                        span.style.color = `rgb(${cell.fg.r}, ${cell.fg.g}, ${cell.fg.b})`;
                    }
                    cellEl.appendChild(span);
                } else if (charCode >= 0x2500 && charCode <= 0x259F) {
                    // Box-drawing and block elements — must fill cell edge-to-edge
                    // fontSize 32px fills height, scaleX compresses to 16px width
                    const span = document.createElement('span');
                    span.textContent = char;
                    span.style.fontFamily = "'Cascadia Code', 'Consolas', 'Courier New', monospace";
                    span.style.fontSize = '32px';
                    span.style.lineHeight = '1';
                    span.style.transform = 'scaleX(0.833)';
                    if (!cell.fg.default) {
                        span.style.color = `rgb(${cell.fg.r}, ${cell.fg.g}, ${cell.fg.b})`;
                    }
                    cellEl.appendChild(span);
                } else {
                    // Normal text — natural monospace sizing
                    cellEl.textContent = char;
                    cellEl.style.fontFamily = "'Cascadia Code', 'Consolas', 'Courier New', monospace";
                    cellEl.style.fontSize = '24px';
                    if (!cell.fg.default) {
                        cellEl.style.color = `rgb(${cell.fg.r}, ${cell.fg.g}, ${cell.fg.b})`;
                    }
                }
            }
        }

        return cellEl;
    }

    handleMouseDown(e) {
        // Paste mode takes priority over any tool
        if (this.pasteMode) {
            const cellEl = e.target.closest('.cell');
            if (!cellEl) return;
            const cellX = parseInt(cellEl.dataset.x);
            const cellY = parseInt(cellEl.dataset.y);

            if (this.isSubpixelMode() && this.subpixelClipboard) {
                const sp = this.getSubpixelFromEvent(e);
                if (sp) this.pasteAtSubpixel(sp.sx, sp.sy);
            } else if (this.clipboard) {
                this.pasteAt(cellX, cellY);
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
        if (this.isSelectTool() && this.selectionStart) {
            this.handleSelectToolUp();
        }
        this.isDrawing = false;
        this.lastCell = null;
    }

    handlePickTool(e) {
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;

        const cellX = parseInt(cellEl.dataset.x);
        const cellY = parseInt(cellEl.dataset.y);
        const cell = this.canvas.cells[cellY][cellX];

        if (this.toolbar) {
            this.toolbar.setColors(cell.fg, cell.bg);
        }
    }

    // Get subpixel coordinates from mouse event
    getSubpixelFromEvent(e) {
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return null;

        const cellX = parseInt(cellEl.dataset.x);
        const cellY = parseInt(cellEl.dataset.y);
        const rect = cellEl.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;

        // Each cell is 2 subpixels wide, 3 tall
        const subCol = relX < 0.5 ? 0 : 1;
        const subRow = Math.min(2, Math.floor(relY * 3));

        return {
            sx: cellX * 2 + subCol,
            sy: cellY * 3 + subRow,
            cellX,
            cellY
        };
    }

    handleSelectToolDown(e) {
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;

        const cellX = parseInt(cellEl.dataset.x);
        const cellY = parseInt(cellEl.dataset.y);

        // Subpixel mode handling
        if (this.isSubpixelMode()) {
            const sp = this.getSubpixelFromEvent(e);
            if (!sp) return;

            // Start new subpixel selection
            this.clearSubpixelSelection();
            this.subpixelSelectionStart = { sx: sp.sx, sy: sp.sy };
            this.subpixelSelection = { sx1: sp.sx, sy1: sp.sy, sx2: sp.sx, sy2: sp.sy };
            this.updateSubpixelSelectionDisplay();
            return;
        }

        this.clearSelection();
        this.selectionStart = { x: cellX, y: cellY };
        this.selection = { x1: cellX, y1: cellY, x2: cellX, y2: cellY };
        this.updateSelectionDisplay();
    }

    handleSelectToolMove(e) {
        // Subpixel mode
        if (this.isSubpixelMode()) {
            if (!this.subpixelSelectionStart) return;
            const sp = this.getSubpixelFromEvent(e);
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

        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;

        const cellX = parseInt(cellEl.dataset.x);
        const cellY = parseInt(cellEl.dataset.y);

        this.selection = {
            x1: Math.min(this.selectionStart.x, cellX),
            y1: Math.min(this.selectionStart.y, cellY),
            x2: Math.max(this.selectionStart.x, cellX),
            y2: Math.max(this.selectionStart.y, cellY)
        };
        this.updateSelectionDisplay();
    }

    handleSelectToolUp() {
        this.selectionStart = null;
        this.subpixelSelectionStart = null;
    }

    updateSelectionDisplay() {
        // Clear previous selection
        for (const el of this._selectedCells) el.classList.remove('selected');
        this._selectedCells.clear();

        if (!this.selection) return;

        // Add selection class to cells in range
        for (let y = this.selection.y1; y <= this.selection.y2; y++) {
            for (let x = this.selection.x1; x <= this.selection.x2; x++) {
                const cellEl = this.getCellElement(x, y);
                if (cellEl) {
                    cellEl.classList.add('selected');
                    this._selectedCells.add(cellEl);
                }
            }
        }
    }

    clearSelection() {
        this.selection = null;
        this.selectionStart = null;
        for (const el of this._selectedCells) el.classList.remove('selected');
        this._selectedCells.clear();
    }

    // Clear only the visual subpixel selection classes (not the state)
    clearSubpixelSelectionDisplay() {
        for (const el of this._selectedSubpixels) el.classList.remove('subpixel-selected');
        this._selectedSubpixels.clear();
        for (const el of this._partialSelectedCells) el.classList.remove('partial-selected');
        this._partialSelectedCells.clear();
    }

    // Subpixel selection display - highlights individual subpixels
    updateSubpixelSelectionDisplay() {
        this.clearSubpixelSelectionDisplay();
        if (!this.subpixelSelection) return;

        const { sx1, sy1, sx2, sy2 } = this.subpixelSelection;

        // Iterate through subpixel range
        for (let sy = sy1; sy <= sy2; sy++) {
            for (let sx = sx1; sx <= sx2; sx++) {
                const cellX = Math.floor(sx / 2);
                const cellY = Math.floor(sy / 3);
                const subCol = sx % 2;
                const subRow = sy % 3;

                const subpixelEl = this.getSubpixelElement(cellX, cellY, subRow, subCol);
                if (subpixelEl) {
                    subpixelEl.classList.add('subpixel-selected');
                    this._selectedSubpixels.add(subpixelEl);
                } else {
                    // For extended cells, mark the whole cell with partial selection indicator
                    const cellEl = this.getCellElement(cellX, cellY);
                    if (cellEl) {
                        cellEl.classList.add('partial-selected');
                        this._partialSelectedCells.add(cellEl);
                    }
                }
            }
        }
    }

    clearSubpixelSelection() {
        this.subpixelSelection = null;
        this.subpixelSelectionStart = null;
        for (const el of this._selectedSubpixels) el.classList.remove('subpixel-selected');
        this._selectedSubpixels.clear();
        for (const el of this._partialSelectedCells) el.classList.remove('partial-selected');
        this._partialSelectedCells.clear();
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

    async cutSelection() {
        if (!this.selection) return;

        this.copySelection();

        // Clear the selected cells
        const { x1, y1, x2, y2 } = this.selection;
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                // Clear cell to empty sextant
                try {
                    const result = await API.setCell(x, y, 32,
                        { r: 255, g: 255, b: 255, default: true },
                        { r: 0, g: 0, b: 0, default: true }
                    );
                    this.canvas.cells[y][x] = result.cell;
                } catch (error) {
                    console.error('Failed to clear cell:', error);
                }
            }
        }

        this.render();
        this.clearSelection();
    }

    async pasteAt(x, y) {
        if (!this.clipboard || this.clipboard.length === 0) return;

        try {
            // Use batch paste API for instant paste
            const updatedCanvas = await API.paste(x, y, this.clipboard);
            this.canvas = updatedCanvas;
            this.render();
        } catch (error) {
            console.error('Failed to paste:', error);
        }

        this.pasteMode = false;
        this.clearPastePreview();
    }

    showPastePreview(e) {
        this.clearPastePreview();

        // Subpixel mode paste preview
        if (this.isSubpixelMode() && this.subpixelClipboard) {
            const sp = this.getSubpixelFromEvent(e);
            if (!sp) return;

            const height = this.subpixelClipboard.length;
            const width = this.subpixelClipboard[0].length;

            for (let dy = 0; dy < height; dy++) {
                for (let dx = 0; dx < width; dx++) {
                    const targetSx = sp.sx + dx;
                    const targetSy = sp.sy + dy;
                    const cellX = Math.floor(targetSx / 2);
                    const cellY = Math.floor(targetSy / 3);
                    const subCol = targetSx % 2;
                    const subRow = targetSy % 3;

                    if (cellX >= this.canvas.width || cellY >= this.canvas.height) continue;

                    const subpixelEl = this.getSubpixelElement(cellX, cellY, subRow, subCol);
                    if (subpixelEl) {
                        subpixelEl.classList.add('paste-preview-subpixel');
                        this._pastePreviewSubpixels.add(subpixelEl);
                    } else {
                        const cellEl = this.getCellElement(cellX, cellY);
                        if (cellEl) {
                            cellEl.classList.add('paste-preview');
                            this._pastePreviewCells.add(cellEl);
                        }
                    }
                }
            }
            return;
        }

        // Cell-level paste preview
        if (!this.clipboard || this.clipboard.length === 0) return;

        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;

        const x = parseInt(cellEl.dataset.x);
        const y = parseInt(cellEl.dataset.y);

        const clipboardHeight = this.clipboard.length;
        const clipboardWidth = this.clipboard[0].length;

        for (let dy = 0; dy < clipboardHeight; dy++) {
            for (let dx = 0; dx < clipboardWidth; dx++) {
                const targetX = x + dx;
                const targetY = y + dy;

                if (targetX >= this.canvas.width || targetY >= this.canvas.height) continue;

                const targetEl = this.getCellElement(targetX, targetY);
                if (targetEl) {
                    targetEl.classList.add('paste-preview');
                    this._pastePreviewCells.add(targetEl);
                }
            }
        }
    }

    clearPastePreview() {
        for (const el of this._pastePreviewCells) el.classList.remove('paste-preview');
        this._pastePreviewCells.clear();
        for (const el of this._pastePreviewSubpixels) el.classList.remove('paste-preview-subpixel');
        this._pastePreviewSubpixels.clear();
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
            try {
                const result = await API.parseText(systemText);
                if (result.cells && result.cells.length > 0) {
                    // Apply current fg/bg colors to pasted text
                    for (const row of result.cells) {
                        for (const cell of row) {
                            cell.fg = { ...this.fgColor };
                            cell.bg = { ...this.bgColor };
                        }
                    }
                    this.clipboard = result.cells;
                    this.pasteMode = true;
                    return;
                }
            } catch (err) {
                console.error('Failed to parse clipboard text:', err);
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
    async cutSelectionSubpixel() {
        if (!this.subpixelSelection) return;

        this.copySelectionSubpixel();

        const { sx1, sy1, sx2, sy2 } = this.subpixelSelection;

        // Build list of subpixels to clear
        const updates = [];
        for (let sy = sy1; sy <= sy2; sy++) {
            for (let sx = sx1; sx <= sx2; sx++) {
                updates.push({ sx, sy, filled: false });
            }
        }

        try {
            const updatedCanvas = await API.setSubpixelBatch(updates);
            this.canvas = updatedCanvas;
            this.render();
        } catch (error) {
            console.error('Failed to cut subpixels:', error);
        }

        this.clearSubpixelSelection();
    }

    // Subpixel-level paste at subpixel coordinates
    async pasteAtSubpixel(sx, sy) {
        if (!this.subpixelClipboard || this.subpixelClipboard.length === 0) return;

        const height = this.subpixelClipboard.length;
        const width = this.subpixelClipboard[0].length;

        // Build list of subpixels to set with per-subpixel colors
        const updates = [];
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const targetSx = sx + dx;
                const targetSy = sy + dy;
                const cellX = Math.floor(targetSx / 2);
                const cellY = Math.floor(targetSy / 3);

                // Skip out of bounds
                if (cellX < 0 || cellX >= this.canvas.width || cellY < 0 || cellY >= this.canvas.height) {
                    continue;
                }

                const data = this.subpixelClipboard[dy][dx];
                updates.push({
                    sx: targetSx,
                    sy: targetSy,
                    filled: data.filled,
                    fg: data.fg,
                    bg: data.bg
                });
            }
        }

        try {
            const updatedCanvas = await API.setSubpixelBatch(updates);
            this.canvas = updatedCanvas;
            this.render();
        } catch (error) {
            console.error('Failed to paste subpixels:', error);
        }

        this.pasteMode = false;
        this.clearPastePreview();
    }

    async handleDrawTool(e) {
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;

        const cellX = parseInt(cellEl.dataset.x);
        const cellY = parseInt(cellEl.dataset.y);

        // Check if clicking on a subpixel or on an extended cell
        const subpixelEl = e.target.closest('.subpixel');
        let subRow = 0, subCol = 0;

        if (subpixelEl) {
            subRow = parseInt(subpixelEl.dataset.row);
            subCol = parseInt(subpixelEl.dataset.col);
        } else if (cellEl.classList.contains('extended')) {
            // Clicking on extended cell - calculate subpixel from click position
            const rect = cellEl.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width;
            const relY = (e.clientY - rect.top) / rect.height;
            subCol = relX < 0.5 ? 0 : 1;
            subRow = Math.floor(relY * 3);
            if (subRow > 2) subRow = 2;
        } else {
            return;
        }

        // Avoid re-processing same subpixel while dragging
        const key = `${cellX},${cellY},${subRow},${subCol}`;
        if (this.lastCell === key) return;
        this.lastCell = key;

        const filled = this.tool === 'draw';

        try {
            // Send colors with the request
            const result = await API.setSubpixel(
                cellX, cellY, subRow, subCol, filled,
                this.fgColor, this.bgColor
            );

            // Update local canvas state
            this.canvas.cells[cellY][cellX] = result.cell;

            // Re-render the entire cell (handles type conversion from extended to sextant)
            const newCellEl = this.createCellElement(cellX, cellY, result.cell);
            cellEl.replaceWith(newCellEl);
            this.cellElements[cellY][cellX] = newCellEl;
            this.cacheSubpixels(cellX, cellY, newCellEl, result.cell);
        } catch (error) {
            console.error('Failed to update subpixel:', error);
        }
    }

    async handleCharTool(e) {
        if (!this.selectedChar) return;

        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;

        const cellX = parseInt(cellEl.dataset.x);
        const cellY = parseInt(cellEl.dataset.y);

        // Avoid re-processing same cell while dragging
        const key = `${cellX},${cellY}`;
        if (this.lastCell === key) return;
        this.lastCell = key;

        try {
            const result = await API.setCell(cellX, cellY, this.selectedChar, this.fgColor, this.bgColor);

            // Update local canvas state
            this.canvas.cells[cellY][cellX] = result.cell;

            // Re-render this cell
            const newCellEl = this.createCellElement(cellX, cellY, result.cell);
            cellEl.replaceWith(newCellEl);
            this.cellElements[cellY][cellX] = newCellEl;
            this.cacheSubpixels(cellX, cellY, newCellEl, result.cell);
        } catch (error) {
            console.error('Failed to set character:', error);
        }
    }

    // --- Box tool methods ---

    handleBoxToolDown(e) {
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;
        const x = parseInt(cellEl.dataset.x);
        const y = parseInt(cellEl.dataset.y);
        this.boxStart = { x, y };
        this.boxEnd = { x, y };
        this.showBoxPreview(x, y, x, y);
    }

    handleBoxToolMove(e) {
        if (!this.boxStart) return;
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;
        this.boxEnd = { x: parseInt(cellEl.dataset.x), y: parseInt(cellEl.dataset.y) };

        const x1 = Math.min(this.boxStart.x, this.boxEnd.x);
        const y1 = Math.min(this.boxStart.y, this.boxEnd.y);
        const x2 = Math.max(this.boxStart.x, this.boxEnd.x);
        const y2 = Math.max(this.boxStart.y, this.boxEnd.y);
        this.showBoxPreview(x1, y1, x2, y2);
    }

    async handleBoxToolUp() {
        if (!this.boxStart || !this.boxEnd) return;

        const x1 = Math.min(this.boxStart.x, this.boxEnd.x);
        const y1 = Math.min(this.boxStart.y, this.boxEnd.y);
        const x2 = Math.max(this.boxStart.x, this.boxEnd.x);
        const y2 = Math.max(this.boxStart.y, this.boxEnd.y);

        const chars = computeBoxChars(x1, y1, x2, y2, this.boxLineStyle, this.canvas.cells, boxDrawLookup);

        if (chars.length > 0) {
            const cells = chars.map(c => ({
                x: c.x,
                y: c.y,
                charCode: c.charCode,
                fg: this.fgColor,
                bg: this.bgColor
            }));

            try {
                const updatedCanvas = await API.setCellBatch(cells);
                this.canvas = updatedCanvas;
                this.render();
            } catch (error) {
                console.error('Failed to draw box:', error);
            }
        }

        this.boxStart = null;
        this.boxEnd = null;
        this.clearBoxPreview();
    }

    showBoxPreview(x1, y1, x2, y2) {
        this.clearBoxPreview();
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                if (x === x1 || x === x2 || y === y1 || y === y2) {
                    const cellEl = this.getCellElement(x, y);
                    if (cellEl) {
                        cellEl.classList.add('box-preview');
                        this._boxPreviewCells.add(cellEl);
                    }
                }
            }
        }
    }

    clearBoxPreview() {
        for (const el of this._boxPreviewCells) el.classList.remove('box-preview');
        this._boxPreviewCells.clear();
    }

    // --- Line tool methods ---

    handleLineToolDown(e) {
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;
        const x = parseInt(cellEl.dataset.x);
        const y = parseInt(cellEl.dataset.y);
        this.lineStart = { x, y };
        this.lineEnd = { x, y };
    }

    handleLineToolMove(e) {
        if (!this.lineStart) return;
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;
        this.lineEnd = { x: parseInt(cellEl.dataset.x), y: parseInt(cellEl.dataset.y) };
        this.showLinePreview();
    }

    async handleLineToolUp() {
        if (!this.lineStart || !this.lineEnd) return;

        const chars = computeLineChars(
            this.lineStart.x, this.lineStart.y,
            this.lineEnd.x, this.lineEnd.y,
            this.boxLineStyle, this.canvas.cells, boxDrawLookup
        );

        if (chars.length > 0) {
            const cells = chars.map(c => ({
                x: c.x, y: c.y, charCode: c.charCode,
                fg: this.fgColor, bg: this.bgColor
            }));

            try {
                const updatedCanvas = await API.setCellBatch(cells);
                this.canvas = updatedCanvas;
                this.render();
            } catch (error) {
                console.error('Failed to draw line:', error);
            }
        }

        this.lineStart = null;
        this.lineEnd = null;
        this.clearBoxPreview();
    }

    showLinePreview() {
        this.clearBoxPreview();
        if (!this.lineStart || !this.lineEnd) return;
        const path = computeLinePath(
            this.lineStart.x, this.lineStart.y,
            this.lineEnd.x, this.lineEnd.y
        );
        for (const { x, y } of path) {
            const cellEl = this.getCellElement(x, y);
            if (cellEl) {
                cellEl.classList.add('box-preview');
                this._boxPreviewCells.add(cellEl);
            }
        }
    }

    // --- Text tool methods ---

    handleTextToolClick(e) {
        const cellEl = e.target.closest('.cell');
        if (!cellEl) return;

        const cellX = parseInt(cellEl.dataset.x);
        const cellY = parseInt(cellEl.dataset.y);
        this.setTextCursor(cellX, cellY);
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

    async handleTextInput(key) {
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
            await this.setTextCell(newX, newY, 32); // Clear with space
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
            await this.setTextCell(x, y, 32); // Clear with space
            this.updateTextCursorDisplay();
            return;
        }

        // Only accept single printable characters
        if (key.length !== 1) return;

        const charCode = key.codePointAt(0);
        await this.setTextCell(x, y, charCode);

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

    async setTextCell(x, y, charCode) {
        try {
            const result = await API.setCell(x, y, charCode, this.fgColor, this.bgColor);
            this.canvas.cells[y][x] = result.cell;

            const cellEl = this.getCellElement(x, y);
            if (cellEl) {
                const newCellEl = this.createCellElement(x, y, result.cell);
                cellEl.replaceWith(newCellEl);
                this.cellElements[y][x] = newCellEl;
                this.cacheSubpixels(x, y, newCellEl, result.cell);
            }
        } catch (error) {
            console.error('Failed to set text cell:', error);
        }
    }

    updateStatus() {
        const status = document.getElementById('status');
        if (status && this.canvas) {
            status.textContent = `${this.canvas.mode.charAt(0).toUpperCase() + this.canvas.mode.slice(1)} Mode | ${this.canvas.width}×${this.canvas.height} chars`;
        }
    }

    async resize(width, height) {
        try {
            this.canvas = await API.resize(width, height);
            this.render();
            this.updateStatus();
        } catch (error) {
            console.error('Failed to resize:', error);
        }
    }

    async clear() {
        try {
            this.canvas = await API.clear();
            this.render();
        } catch (error) {
            console.error('Failed to clear:', error);
        }
    }

    async createNew(width, height, mode) {
        try {
            this.canvas = await API.createCanvas(width, height, mode);
            this.render();
            this.updateStatus();
        } catch (error) {
            console.error('Failed to create canvas:', error);
        }
    }

    setCanvas(canvasData) {
        this.canvas = canvasData;
        this.render();
        this.updateStatus();
    }
}
