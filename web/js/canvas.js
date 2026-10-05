// Canvas rendering and interaction

// Cells are CELL_H tall and CELL_W wide, holding 2x3 subpixels. The width
// follows the cell aspect (width / height) the user previews, to match the
// terminal the art is for (see setCellAspect). By default it is a typical
// terminal's 0.5; the glyph styles in style.css are sized for 18x34 cells.
const CELL_H = 34;
const GLYPH_CELL_W = 18;
const DEFAULT_CELL_ASPECT = 0.5;
let CELL_W = DEFAULT_CELL_ASPECT * CELL_H;

// The cell aspects the editor accepts (terminals are around 0.45-0.55)
const CELL_ASPECT_RANGE = [0.3, 0.8];
function isCellAspect(aspect) {
    return aspect >= CELL_ASPECT_RANGE[0] && aspect <= CELL_ASPECT_RANGE[1];
}

// Subpixel edges within a cell, in CSS px from its top-left corner: the
// whole cell split into 2x3 equal parts, as a terminal draws sextants (the
// grid, when shown, is painted over the cell's outermost pixel). Drawing,
// hit-testing and the subpixel selection overlay all use these.
const SUB_X_EDGES = [0, CELL_W / 2, CELL_W];
const SUB_Y_EDGES = [0, CELL_H / 3, 2 * CELL_H / 3, CELL_H];

// Set the cell width for a cell aspect (width / height). Only how cells are
// drawn changes, never the art. Takes effect on the next render (or, for an
// offscreen drawing, at once: see collab.js).
function setCellWidthForAspect(aspect) {
    // In 1/64 px: binary fractions add up exactly, so a cell's right edge and
    // the next one's left edge round to the same device pixel (no gaps)
    CELL_W = Math.round(aspect * CELL_H * 64) / 64;
    SUB_X_EDGES[1] = CELL_W / 2;
    SUB_X_EDGES[2] = CELL_W;
}

// Overlays on the overlay canvas, bottom to top (see setOverlay)
const OVERLAY_ORDER = ['hover', 'hover-subpixel', 'paste', 'image-handle', 'paste-subpixel', 'box', 'box-subpixel', 'selection', 'subpixel-selection'];

// Box/line style drawn with subpixels instead of box-drawing characters
const SUBPIXEL_STYLE = 4;

// Left / top edge (CSS px) of subpixel column sx / row sy
function subpixelEdgeX(sx) { return Math.floor(sx / 2) * CELL_W + SUB_X_EDGES[sx % 2]; }
function subpixelEdgeY(sy) { return Math.floor(sy / 3) * CELL_H + SUB_Y_EDGES[sy % 3]; }

// Cap on the grid canvas's backing store, in device pixels (see render)
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;

// The cells covering a rect in subpixel coordinates
function subpixelToCellRect(r) {
    return { x1: Math.floor(r.x1 / 2), y1: Math.floor(r.y1 / 3), x2: Math.floor(r.x2 / 2), y2: Math.floor(r.y2 / 3) };
}

// Points ({ x, y }) as rects, consecutive ones on a row merged into one
function runsOf(points) {
    const rects = [];
    for (const { x, y } of points) {
        const r = rects[rects.length - 1];
        if (r && r.y1 === y && x === r.x2 + 1) r.x2 = x;
        else if (r && r.y1 === y && x === r.x1 - 1) r.x1 = x;
        else rects.push({ x1: x, y1: y, x2: x, y2: y });
    }
    return rects;
}

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

// Parts of rect a (inclusive grid coords) not in rect b: up to 4 rects
function rectMinus(a, b) {
    if (b.x1 > a.x2 || b.x2 < a.x1 || b.y1 > a.y2 || b.y2 < a.y1) return [a];
    const parts = [];
    if (a.y1 < b.y1) parts.push({ x1: a.x1, y1: a.y1, x2: a.x2, y2: b.y1 - 1 });
    if (a.y2 > b.y2) parts.push({ x1: a.x1, y1: b.y2 + 1, x2: a.x2, y2: a.y2 });
    const y1 = Math.max(a.y1, b.y1), y2 = Math.min(a.y2, b.y2);
    if (a.x1 < b.x1) parts.push({ x1: a.x1, y1, x2: b.x1 - 1, y2 });
    if (a.x2 > b.x2) parts.push({ x1: b.x2 + 1, y1, x2: a.x2, y2 });
    return parts;
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
        this.bold = false;          // text style drawn cells get (see applyCurrentColors)
        // What the user sees and edits: 'both', 'ink' (lit subpixels and
        // characters, in their ink; paper hidden and never changed) or
        // 'paper' (each cell's paper; art hidden and never changed). See
        // editView: the AI add-on edits everything whatever the view.
        this.view = 'both';
        this.editAll = false;
        this.inverse = false;
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

        // Image being placed (see startImagePaste): { image, cols, rows,
        // locked, x, y, options, cells }; onImagePaste(it, or null when it
        // ends) is called on every change (the toolbar's Image panel)
        this.imagePaste = null;
        this.onImagePaste = null;
        this._wheel = 0;            // wheel movement not yet turned into a resize step

        // Text tool state
        this.textCursor = null; // { x, y } cell coordinates, or null

        // Box/line tool state
        this.dragStart = null;      // { x, y } cell where the drag began
        this.dragEnd = null;        // { x, y } current cell
        this.boxLineStyle = 1;      // 0=none, 1=light, 2=heavy, 3=double, 4=subpixels (SUBPIXEL_STYLE)
        this.boxFillMode = 0;       // 0=no fill, 1=fill & clear, 2=recolor only

        // Draw/erase tool state
        this.brushCell = false;     // Paint whole cells instead of subpixels
        this.fillMode = 'ink';      // what the fill tool paints: ink, paper or both (see fillAt)

        // Grid canvas drawing state (see render / drawCell)
        this.ctx = null;                // 2D context of the grid canvas
        this.showGrid = false;          // 1px grid lines over the cells (see setShowGrid)
        this.lightTerminal = false;     // simulate a light terminal (see setLightTerminal)
        this.cellAspect = DEFAULT_CELL_ASPECT; // cell width / height (see setCellAspect)
        this.zoom = 1;                  // view scale (see setZoom)
        this.onRender = null;           // called after each render (the toolbar's rulers)
        this._onPixelRatioChange = () => this.render();
        this._glyphStyles = new Map();  // .glyph-* class → { font, transform, baseline }
        this._shadePatterns = new WeakMap(); // context → shade + colour → CanvasPattern (see fillShape)
        this._origin = [0, 0];          // device origin of the canvas being drawn on (see drawCellsImage)
        this._pasteImages = new Map();  // cached cell paste preview images (see pastePreviewImage)
        this._pasteImagesFor = null;    // ... for this clipboard
        this._requestedFonts = new Set();

        // Selection / preview outlines and the hover box (see setOverlay)
        this.overlayCtx = null;         // 2D context of the overlay canvas
        this._overlayRects = {};        // kind → { rects, subpixel }
        this._overlayDrawn = {};        // kind → device-pixel rects drawing it
        this._hover = null;             // hover box rect, or null
        this._hoverSub = null;          // hovered subpixel (subpixel tools), or null
        this._cursorEl = null;          // the text cursor's element
        this._pastePreviewKey = null; // Last previewed paste position

        // Undo/redo (see history.js). strokeOpen: a mouse stroke's step is open.
        this.history = new EditHistory(this);
        this.strokeOpen = false;

        this.setupEventListeners();
        this.setupKeyboardShortcuts();
    }

    setupEventListeners() {
        this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.container.addEventListener('mouseleave', () => {
            this.updateHover(null);
            this.updatePointerInfo(null);
        });

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

        // Image paste: the wheel over the canvas resizes it (Ctrl+wheel still
        // zooms the page)
        window.addEventListener('wheel', (e) => {
            const area = this.container.closest('.canvas-scroll') || this.container.parentElement;
            if (!this.isImagePaste() || e.ctrlKey || !area.contains(e.target)) return;
            e.preventDefault();
            // Shift+wheel scrolls sideways in some browsers
            this._wheel += (e.deltaY || e.deltaX) * (e.deltaMode ? 33 : 1);
            if (Math.abs(this._wheel) < 50) return;
            this.resizeImagePaste(this._wheel < 0 ? 1 : -1, e.shiftKey);
            this._wheel = 0;
        }, { passive: false });

        // Dropping an image file starts placing it (and dropping other files
        // doesn't open them in place of the editor)
        window.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        });
        window.addEventListener('drop', (e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
            if (file) this.startImagePaste(file, e);
        });

        // Ctrl+V: an image, text or the editor's own clipboard
        document.addEventListener('paste', (e) => {
            this._pasteEventSeen = true;
            if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
            e.preventDefault();
            const item = [...e.clipboardData.items].find(i => i.kind === 'file' && i.type.startsWith('image/'));
            if (item) this.startImagePaste(item.getAsFile());
            else this.handlePaste(e.clipboardData.getData('text/plain'));
        });

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
        // The hover box and readout depend on the tool (subpixel or not)
        if (this._hoverEvent) {
            this.updateHover(this._hoverEvent);
            this.updatePointerInfo(this._hoverEvent);
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
            if (e.target.closest && e.target.closest('input, textarea, dialog')) return;

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

            // Image paste: Enter places it, the arrows move it, +/- resize it
            // (by key position, so Shift is free to make the step fine), M
            // switches colour / mono, D the dithering
            if (this.isImagePaste() && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const p = this.imagePaste;
                const grow = e.code === 'Equal' || e.code === 'NumpadAdd';
                const shrink = e.code === 'Minus' || e.code === 'NumpadSubtract';
                const k = e.key.toLowerCase();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.placeImage();
                    return;
                }
                if (e.key.startsWith('Arrow')) {
                    // Nudge it a cell, or ten with Shift
                    e.preventDefault();
                    const n = e.shiftKey ? 10 : 1;
                    const d = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key];
                    this.moveImageTo({ x: p.x + d[0], y: p.y + d[1] });
                    this.showImagePreview();
                    if (this.onImagePaste) this.onImagePaste(p);
                    return;
                }
                if (grow || shrink || k === 'm' || k === 'd') {
                    e.preventDefault();
                    if (grow || shrink) {
                        this.resizeImagePaste(grow ? 1 : -1, e.shiftKey);
                        return;
                    }
                    if (k === 'm') {
                        p.mono = !p.mono;
                    } else {
                        const names = Object.keys(IMAGE_DITHERS);
                        p.dither = names[(names.indexOf(p.dither) + 1) % names.length];
                    }
                    this.updateImagePaste();
                    return;
                }
            }

            // Escape - cancel a box/line drag, clear selection
            if (e.key === 'Escape') {
                this.cancelDrag();
                this.clearSelection();
                this.clearSubpixelSelection();
                this.pasteMode = false;
                this.clearPastePreview();
                this.endImagePaste();
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

            // Ctrl+V - paste: handled by the paste event, which has the
            // clipboard's image or text. Browsers that send none (no editable
            // element focused) get the text through the clipboard API.
            if (mod && e.key === 'v') {
                this._pasteEventSeen = false;
                setTimeout(() => { if (!this._pasteEventSeen) this.handlePaste(); });
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
        // An image being placed stays: it isn't on the canvas yet
        this.resetInteractionState(true);
        const change = apply();
        if (!change) return;
        if (change.wholeCanvas) {
            if (this.imagePaste) this.moveImageTo(this.imagePaste);   // the canvas may be smaller
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

    // The view editing follows ('both' while the AI add-on edits)
    editView() {
        return this.editAll ? 'both' : this.view;
    }

    // The ink and paper drawing gives cells: keep for the one the view hides
    inkColor() {
        return this.editView() === 'paper' ? keepColor('fg') : this.fgColor;
    }

    paperColor() {
        return this.editView() === 'ink' ? keepColor('bg') : this.bgColor;
    }

    // Give a cell the currently picked colours (but not "keep" ones) and
    // text style (not in the paper view)
    applyCurrentColors(cell) {
        const ink = this.inkColor(), paper = this.paperColor();
        if (!ink.keep) cell.fg = { ...ink };
        if (!paper.keep) cell.bg = { ...paper };
        if (this.editView() !== 'paper') {
            cell.bold = this.bold;
            cell.inverse = this.inverse;
        }
    }

    // Show and edit only the ink, only the paper, or both (see this.view)
    setView(view) {
        this.view = view;
        this.cancelDrag();
        this.redrawEverything();
        if (this._hoverEvent) {
            this.updateHover(this._hoverEvent);
            this.updatePointerInfo(this._hoverEvent);
        }
    }

    // Give cells ({ x, y }, off-canvas ones skipped) the paper colour, or
    // with `clear` the terminal's own: the paper view's brush, box and line
    paintPaper(cells, clear = false) {
        const paper = clear ? defaultBG() : this.bgColor;
        if (paper.keep) return;
        for (const { x, y } of cells) {
            if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) continue;
            const cell = this.canvas.cells[y][x];
            if (colorsEqual(cell.bg, paper)) continue;
            this.beforeChange(x, y, x, y);
            cell.bg = { ...paper };
            this.updateCell(x, y);
        }
    }

    // Start with `canvas` (a restored autosave), or an empty 80x60 one
    loadCanvas(canvas = createCanvas(80, 60)) {
        this.canvas = canvas;
        this.render();
        this.updateStatus();
    }

    render() {
        if (!this.canvas) return;

        // Drawing is in unzoomed CSS px (width x height); the zoom only
        // changes how many device pixels they get
        const width = this.canvas.width * CELL_W;
        const height = this.canvas.height * CELL_H;
        const z = this.zoom;
        this.container.innerHTML = '';
        this.container.style.width = width * z + 'px';
        this.container.style.height = height * z + 'px';

        // Reset caches (innerHTML = '' removed the overlays too)
        this._overlayRects = {};
        this._overlayDrawn = {};
        this._hover = null;
        this._hoverSub = null;
        this._cursorEl = null;
        this._pastePreviewKey = null;

        // The grid is drawn on one <canvas>, sharp on high-DPI screens. The
        // backing store is capped: browsers limit canvas area (iOS Safari to
        // 16.7M pixels), so very large grids get a lower resolution instead.
        this._dpr = window.devicePixelRatio || 1;
        this.watchPixelRatio();
        const scale = Math.min(this._dpr * z, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)));
        const gridCanvas = document.createElement('canvas');
        gridCanvas.className = 'grid-canvas';
        gridCanvas.width = Math.round(width * scale);
        gridCanvas.height = Math.round(height * scale);
        gridCanvas.style.width = width * z + 'px';
        gridCanvas.style.height = height * z + 'px';
        // After a GPU reset the browser restores a blank canvas
        gridCanvas.addEventListener('contextrestored', () => this.drawAll());
        this.container.appendChild(gridCanvas);
        // Opaque (every pixel is drawn), which also lets the browser use
        // subpixel antialiasing for text, like the DOM did
        this.ctx = gridCanvas.getContext('2d', { alpha: false });
        this._pasteImages.clear();   // drawn at the old scale / with the old theme
        // CSS px → device px (drawCell snaps rects to whole device pixels)
        this._scaleX = gridCanvas.width / width;
        this._scaleY = gridCanvas.height / height;

        // Selection / preview outlines and the hover box go on a transparent
        // canvas on top, drawn the same way as the grid lines
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.className = 'overlay-canvas';
        overlayCanvas.width = gridCanvas.width;
        overlayCanvas.height = gridCanvas.height;
        overlayCanvas.style.width = width * z + 'px';
        overlayCanvas.style.height = height * z + 'px';
        this.container.appendChild(overlayCanvas);
        this.overlayCtx = overlayCanvas.getContext('2d');
        overlayCanvas.addEventListener('contextrestored', () => this.repaintOverlay());

        // The blinking text cursor is an HTML element in a layer above that
        this.overlayLayer = document.createElement('div');
        this.overlayLayer.className = 'overlay-layer';
        this.overlayLayer.style.width = width + 'px';
        this.overlayLayer.style.height = height + 'px';
        this.overlayLayer.style.transform = `scale(${z})`;
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
        if (this.onRender) this.onRender();
        this.showImagePreview();
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

    // Show or hide the grid. It is painted over the cells' outermost pixel,
    // so the content is laid out the same either way (as in a terminal) and
    // without it the cells run together as they will there.
    setShowGrid(show) {
        this.showGrid = show;
        this.redrawEverything();
    }

    // Show the canvas as in a terminal with a light or a dark background: the
    // terminal's default colours (cells with the "default" foreground or
    // background) come from .canvas or .canvas.light-terminal in style.css.
    setLightTerminal(light) {
        this.lightTerminal = light;
        this.container.classList.toggle('light-terminal', light);
        this.redrawEverything();
    }

    // Preview cells with another aspect (width / height), e.g. a terminal's
    setCellAspect(aspect) {
        this.cellAspect = aspect;
        setCellWidthForAspect(aspect);
        this.render();
        // An image being placed keeps its proportions in the new cells
        if (this.imagePaste && this.imagePaste.locked) this.setImageOptions({ cols: this.imagePaste.cols, locked: true });
    }

    // Show the canvas at `zoom` times its size, redrawn at that resolution
    setZoom(zoom) {
        this.zoom = zoom;
        this.render();
    }

    // Redraw the canvas, overlays and (on the next move) the paste preview,
    // e.g. after the grid or the theme changed
    redrawEverything() {
        this._pasteImages.clear();
        this._pastePreviewKey = null;
        this.drawAll();
        this.repaintOverlay();
        this.showImagePreview();
    }

    // Colours the grid is drawn with, from the page's CSS (they change with
    // the light / dark terminal setting). Read on full redraws.
    readTheme() {
        const style = getComputedStyle(this.container);
        this.theme = {
            border: style.getPropertyValue('--border').trim(),
            cellBg: style.getPropertyValue('--cell-bg').trim(),
            hiddenPaper: style.getPropertyValue('--hidden-paper').trim(),
            fg: style.color,
            overlay: {
                hover: { line: style.getPropertyValue('--overlay-hover').trim() },
                'hover-subpixel': { line: style.getPropertyValue('--overlay-hover').trim() },
                paste: { line: style.getPropertyValue('--overlay-paste').trim() },
                'image-handle': { line: style.getPropertyValue('--overlay-paste').trim(), fill: style.getPropertyValue('--overlay-handle').trim() },
                'paste-subpixel': { line: style.getPropertyValue('--overlay-paste').trim() },
                box: { line: style.getPropertyValue('--overlay-preview').trim() },
                'box-subpixel': { line: style.getPropertyValue('--overlay-preview').trim() },
                selection: { line: style.getPropertyValue('--overlay-selection').trim() },
                'subpixel-selection': { line: style.getPropertyValue('--overlay-selection').trim() }
            }
        };
    }

    drawAll() {
        if (!this.ctx) return;
        this.readTheme();
        const wide = [];
        for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
                const cell = this.canvas.cells[y][x];
                // A wide char's tail is drawn along with its head
                if (cell.type === 'wide-tail') continue;
                if (isWideHead(cell)) wide.push([x, y]);
                this.drawCell(x, y, false);
            }
        }
        if (this.gridLines().show) {
            this.drawGridLines();
            // A wide char has no grid line between its halves
            for (const [x, y] of wide) this.drawCell(x, y);
        }
    }

    // How the grid is drawn at this scale: a ring of bx x by device px over
    // each cell's outermost pixels where there are 2 or more device px per
    // CSS px, else (`thin`) one device px along each cell's top and left (and
    // the canvas's right and bottom edges), shared by neighbouring cells; not
    // at all (`show` false) once cells are too small for lines to help
    gridLines() {
        const kx = this._scaleX, ky = this._scaleY;
        return {
            show: this.showGrid && CELL_W * kx >= 4,
            thin: kx < 2 || ky < 2,
            bx: Math.max(1, Math.floor(kx)),
            by: Math.max(1, Math.floor(ky))
        };
    }

    // All the cells' grid lines at once, as one line per cell edge across the
    // whole canvas: the same pixels as drawCell's per-cell rings
    drawGridLines() {
        const ctx = this.ctx;
        const kx = this._scaleX, ky = this._scaleY;
        const { thin, bx, by } = this.gridLines();
        const cols = this.canvas.width, rows = this.canvas.height;
        const width = Math.round(cols * CELL_W * kx);
        const height = Math.round(rows * CELL_H * ky);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.theme.border;
        for (let x = 0; x <= cols; x++) {
            const dx = Math.round(x * CELL_W * kx);
            if (thin) {
                ctx.fillRect(x < cols ? dx : dx - 1, 0, 1, height);
                continue;
            }
            if (x > 0) ctx.fillRect(dx - bx, 0, bx, height);                // right edge of column x - 1
            if (x < cols) ctx.fillRect(dx, 0, bx, height);                  // left edge of column x
        }
        for (let y = 0; y <= rows; y++) {
            const dy = Math.round(y * CELL_H * ky);
            if (thin) {
                ctx.fillRect(0, y < rows ? dy : dy - 1, width, 1);
                continue;
            }
            if (y > 0) ctx.fillRect(0, dy - by, width, by);
            if (y < rows) ctx.fillRect(0, dy, width, by);
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
        // Read everything before removing the probe: a detached element's
        // computed style is empty
        const cs = getComputedStyle(probe);
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const boldFont = `${cs.fontStyle} bold ${cs.fontSize} ${cs.fontFamily}`;
        const fontSize = parseFloat(cs.fontSize);
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
            : parseFloat(lineHeightCss) * fontSize; // bare multiplier
        const baseline = -lineHeight / 2 + ascent + Math.floor((lineHeight - ascent - descent) / 2);
        style = { font, boldFont, transform, baseline };
        this._glyphStyles.set(cls, style);
        return style;
    }

    // Draw one cell on the grid canvas: the background and content over the
    // whole cell (laid out as in a terminal), then the grid lines on top. Sextants, block elements,
    // legacy diagonals/triangles and box drawing are drawn as shapes (see
    // glyph-shapes.js); everything else is a font glyph. A wide char is drawn
    // two cells wide from its head; drawing its tail draws the head.
    drawCell(x, y, gridRing = true) {
        const row = this.canvas.cells[y];
        let cell = row[x];
        if (cell.type === 'wide-tail') {
            if (x > 0 && isWideHead(row[x - 1])) {
                cell = row[--x];
            } else {
                cell = createCell(); // orphan tail (shouldn't happen): draw blank
            }
        }
        this.paintCell(cell, x, y, gridRing);
    }

    // Draw `cell` at grid position (x, y) on the current target (see
    // drawCellsImage), two cells wide if it is a wide char
    paintCell(cell, x, y, gridRing = true) {
        const ctx = this.ctx;
        const g = this.cellGeometry(x, y, isWideHead(cell) ? 2 * CELL_W : CELL_W);

        // Inverse swaps the colours as the terminal shows them. The ink view
        // hides the paper behind a neutral colour, the paper view the art;
        // they show the cell's own ink and paper, which they edit.
        let fg = cell.fg.default ? this.theme.fg : `rgb(${cell.fg.r},${cell.fg.g},${cell.fg.b})`;
        let bg = cell.bg.default ? this.theme.cellBg : `rgb(${cell.bg.r},${cell.bg.g},${cell.bg.b})`;
        if (cell.inverse && this.view === 'both') [fg, bg] = [bg, fg];
        if (this.view === 'ink') bg = this.theme.hiddenPaper;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bg;
        ctx.fillRect(...g.rect);

        const char = cellToChar(cell);
        if (char !== ' ' && this.view !== 'paper') {
            const code = char.codePointAt(0);
            ctx.save();
            ctx.beginPath();
            ctx.rect(...g.rect);
            ctx.clip();
            ctx.fillStyle = fg;
            ctx.strokeStyle = fg;
            if (cell.type === 'sextant') {
                this.drawSextant(cell, g);
            } else if (hasGlyphShape(code)) {
                this.drawShape(code, g);
            } else {
                this.drawGlyph(char, g, cell.bold);
            }
            ctx.restore();
        }

        // Grid lines painted over the cell's outermost pixels, as gridLines
        // says (drawAll draws them for all cells at once instead)
        const grid = this.gridLines();
        if (grid.show && gridRing) {
            const [x0, y0, w, h] = g.rect;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = this.theme.border;
            if (grid.thin) {
                ctx.fillRect(x0, y0, w, 1);
                ctx.fillRect(x0, y0, 1, h);
                if (x + (isWideHead(cell) ? 2 : 1) >= this.canvas.width) ctx.fillRect(x0 + w - 1, y0, 1, h);
                if (y + 1 >= this.canvas.height) ctx.fillRect(x0, y0 + h - 1, w, 1);
            } else {
                const { bx, by } = grid;
                ctx.fillRect(x0, y0, w, by);
                ctx.fillRect(x0, y0 + h - by, w, by);
                ctx.fillRect(x0, y0, bx, h);
                ctx.fillRect(x0 + w - bx, y0, bx, h);
            }
        }
    }

    // Draw cells ({ x, y, cell }, at grid positions) onto an offscreen canvas
    // covering the cell rect `bounds`, exactly as they would be drawn on the
    // grid canvas there (the same device-pixel rounding), for previews.
    // Returns { image, x, y }: the canvas and its device position. With
    // `opaque` (the cells cover all of `bounds`) text gets the same subpixel
    // antialiasing as on the opaque grid canvas; otherwise the gaps between
    // cells stay transparent.
    drawCellsImage(cells, bounds, image = document.createElement('canvas'), opaque = false) {
        const kx = this._scaleX, ky = this._scaleY;
        const x0 = Math.round(bounds.x1 * CELL_W * kx), y0 = Math.round(bounds.y1 * CELL_H * ky);
        image.width = Math.round((bounds.x2 + 1) * CELL_W * kx) - x0;
        image.height = Math.round((bounds.y2 + 1) * CELL_H * ky) - y0;
        const main = this.ctx, origin = this._origin;
        this.ctx = image.getContext('2d', { alpha: !opaque });
        this._origin = [x0, y0];
        try {
            for (const { x, y, cell } of cells) this.paintCell(cell, x, y);
        } finally {
            this.ctx = main;
            this._origin = origin;
        }
        return { image, x: x0, y: y0 };
    }

    // Where a cell (w CSS px wide) is on the canvas. X / Y map a position in
    // CSS px from the cell's top-left corner to whole device pixels: every
    // edge goes through them, so edges shared between cells and shapes line
    // up exactly and stay sharp at fractional pixel ratios. `rect` is the
    // whole cell as a device-pixel rect.
    cellGeometry(x, y, w) {
        const kx = this._scaleX;
        const ky = this._scaleY;
        const left = x * CELL_W;
        const top = y * CELL_H;
        // Device-pixel origin of the canvas being drawn on (see drawCellsImage)
        const [ox, oy] = this._origin;
        const X = (px) => Math.round((left + px) * kx) - ox;
        const Y = (py) => Math.round((top + py) * ky) - oy;
        const rect = [X(0), Y(0), X(w) - X(0), Y(CELL_H) - Y(0)];
        return { left, top, w, kx, ky, ox, oy, X, Y, rect };
    }

    // Font glyph, styled by its .glyph-* class and centred like the old DOM cells
    drawGlyph(char, g, bold = false) {
        const ctx = this.ctx;
        const style = this.glyphStyle(glyphClass(char.codePointAt(0)));
        this.ensureFontLoaded(bold ? style.boldFont : style.font, char);
        // The glyph is laid out in CSS px; CSS transforms apply around its
        // centre (transform-origin)
        ctx.setTransform(g.kx, 0, 0, g.ky, -g.ox, -g.oy);
        ctx.translate(g.left + g.w / 2, g.top + CELL_H / 2);
        // Narrower or wider cells: as a terminal font with that aspect
        ctx.scale(CELL_W / GLYPH_CELL_W, 1);
        const t = style.transform;
        ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);
        ctx.font = bold ? style.boldFont : style.font;
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
        const ux = (u) => u * g.w;
        const uy = (v) => v * CELL_H;

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
            ctx.setTransform(g.kx, 0, 0, g.ky, -g.ox, -g.oy);
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
        // Patterns are cached per context (the grid canvas, or a paste preview's)
        let patterns = this._shadePatterns.get(ctx);
        if (!patterns) this._shadePatterns.set(ctx, patterns = new Map());
        const key = shade + '|' + ctx.fillStyle;
        let pattern = patterns.get(key);
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
            patterns.set(key, pattern);
        }
        ctx.save();
        ctx.clip();
        ctx.setTransform(g.kx, 0, 0, g.ky, -g.ox, -g.oy);
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
            const y0 = Math.round((g.top + c) * g.ky - td / 2) - g.oy;
            const x0 = g.X(Math.min(a, b));
            ctx.fillRect(x0, y0, g.X(Math.max(a, b)) - x0, td);
            return y0 + td / 2; // device y of the line's centre
        };
        const vLine = (a, b, c, t) => {
            const td = Math.max(1, Math.round(t * g.kx));
            const x0 = Math.round((g.left + c) * g.kx - td / 2) - g.ox;
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
            const hc = Math.round((g.top + cy) * g.ky - td / 2) + td / 2 - g.oy;
            const tdx = Math.max(1, Math.round(LIGHT * g.kx));
            const vc = Math.round((g.left + cx) * g.kx - tdx / 2) + tdx / 2 - g.ox;
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
        // The edit may have turned the char under the text cursor or the
        // hover box wide or narrow
        if (this.textCursor) this.updateTextCursorDisplay();
        if (this._hoverEvent) this.updateHover(this._hoverEvent);
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
        // An image being placed takes priority over any tool
        if (this.imagePaste) {
            this.startImageDrag(e);
            return;
        }
        // Paste mode takes priority over any tool
        if (this.pasteMode) {
            // Same hit-testing as showPastePreview, so paste lands where previewed
            if (this.pastingSubpixels()) {
                const sp = this.subpixelCoordsFromEvent(e);
                if (sp) this.recordEdit('Paste', () => this.pasteAtSubpixel(sp.sx, sp.sy));
            } else if (this.clipboard) {
                const c = this.cellCoordsFromEvent(e);
                if (c) this.recordEdit('Paste', () => this.pasteAt(c.cellX, c.cellY));
            }
            return;
        }

        // Alt-click picks the colours under the pointer, with any tool
        if (e.altKey) {
            this.handlePickTool(e);
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
        } else if (this.tool === 'hand') {
            // Moving the view (the toolbar handles the drag)
        } else if (this.tool === 'fill') {
            this.handleFillTool(e);
        } else {
            this.handleDrawTool(e);
        }
        this._lastPointerEvent = e;
        this.updateDragLabel(e);
        this.updatePointerInfo(e);
    }

    handleMouseMove(e) {
        this._lastPointerEvent = e;
        this.updateHover(e);
        this.updatePointerInfo(e);
        if (this.imagePaste) {
            // The button came up where we didn't see it: the drag is over
            if (this._imageDrag && e.buttons === 0) {
                this.handleMouseUp();
                return;
            }
            if (this._imageDrag) this.updateImageDrag(e);
            else this.updateImageCursor(e);
            this.updateDragLabel(e);
            return;
        }
        if (this.pasteMode) {
            this.showPastePreview(e);
            this.updateDragLabel(e);
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
        } else if (this.tool === 'draw' || this.tool === 'erase') {
            this.handleDrawTool(e);
        }
        this.updateDragLabel(e);
    }

    handleMouseUp() {
        if (this._imageDrag) {
            this._imageDrag = null;
            this.isDrawing = false;
            this.updateDragLabel(null);
            return;
        }
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
        this.updateDragLabel(null);
        this.updatePointerInfo(this._lastPointerEvent);
    }

    handlePickTool(e) {
        const c = this.cellCoordsFromEvent(e);
        if (!c) return;
        const row = this.canvas.cells[c.cellY];
        // A wide char's tail takes its colours from the head
        const cell = row[c.cellX].type === 'wide-tail' ? row[c.cellX - 1] : row[c.cellX];

        if (this.toolbar) {
            // Only the colour the view shows
            const view = this.editView();
            if (view !== 'paper') this.toolbar.setStyle(!!cell.bold, !!cell.inverse);
            this.toolbar.setColors(view === 'paper' ? this.fgColor : cell.fg, view === 'ink' ? this.bgColor : cell.bg);
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
        const cellX = this.cellIndexAt((e.clientX - rect.left) / this.zoom, CELL_W, this._scaleX, this.canvas.width);
        const cellY = this.cellIndexAt((e.clientY - rect.top) / this.zoom, CELL_H, this._scaleY, this.canvas.height);
        return { cellX, cellY };
    }

    // The cell containing a position (CSS px from the canvas edge) along one
    // axis, clamped to the canvas. Decided in device pixels against the same
    // rounded cell edges drawCell uses, so the boundary pixels between cells
    // (visible when the grid is hidden) belong to the cell drawn there.
    cellIndexAt(rel, size, scale = 1, count) {
        let i = Math.floor(rel / size);
        const dev = rel * scale;
        if (dev < Math.round(i * size * scale)) i--;
        else if (dev >= Math.round((i + 1) * size * scale)) i++;
        return Math.max(0, Math.min(count - 1, i));
    }

    // Subpixel coords from a mouse event, clamped to canvas extents.
    subpixelCoordsFromEvent(e) {
        if (!this.canvas) return null;
        const rect = this.container.getBoundingClientRect();
        const relX = Math.max(0, Math.min(this.canvas.width  * CELL_W - 0.01, (e.clientX - rect.left) / this.zoom));
        const relY = Math.max(0, Math.min(this.canvas.height * CELL_H - 0.01, (e.clientY - rect.top) / this.zoom));
        const cellX = this.cellIndexAt(relX, CELL_W, this._scaleX, this.canvas.width);
        const cellY = this.cellIndexAt(relY, CELL_H, this._scaleY, this.canvas.height);
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

    // Show `rects` (grid coordinates, inclusive; in subpixels, 2x3 per cell,
    // with `subpixel`) as the given kind of overlay, in the kind's colour (see
    // OVERLAY_ORDER and the --overlay-* CSS variables): an outline as thick
    // as the grid lines, and hairlines between the cells or subpixels in it
    // while they are big enough. A rect with `whole` is one unit (a wide
    // char). An empty list hides the overlay.
    // `images` ({ image, x, y } at device positions, from drawCellsImage) are
    // drawn under the outlines (the paste preview's content).
    setOverlay(kind, rects, subpixel = false, images = []) {
        const entry = rects.length || images.length ? { rects, subpixel, images } : null;
        const old = this._overlayRects[kind] || null;
        if (!entry && !old) return;
        this._overlayRects[kind] = entry;
        if (!this.overlayCtx) return;
        const oldDrawn = this._overlayDrawn[kind] || [];
        const drawn = entry ? this.overlayDeviceRects(kind, entry) : [];
        this._overlayDrawn[kind] = drawn;
        const withImages = images.length || (old && old.images.length);
        this.repaintOverlay(withImages
            ? [...oldDrawn, ...drawn].map(item => item.image ? [item.x, item.y, item.image.width, item.image.height] : item)
            : this.overlayChangedAreas(old, entry));
    }

    // Where an overlay kind changed from `a` to `b`, as device-pixel rects.
    // For single rects (selections, the hover box, filled box previews) only
    // the units in one but not the other change, plus the rows and columns
    // along both outlines, e.g. the new row and the old bottom row when a
    // selection grows by one.
    overlayChangedAreas(a, b) {
        const subpixel = (a || b).subpixel;
        const single = (e) => e && e.rects.length === 1 && !e.rects[0].whole && !e.images.length;
        // The rows and columns along a rect's edges, where its outline is
        // thicker than the lines inside it
        const edges = (r) => [
            { ...r, y2: r.y1 }, { ...r, y1: r.y2 }, { ...r, x2: r.x1 }, { ...r, x1: r.x2 }
        ];
        const units = single(a) && single(b)
            ? [...rectMinus(a.rects[0], b.rects[0]), ...rectMinus(b.rects[0], a.rects[0]),
                ...edges(a.rects[0]), ...edges(b.rects[0])]
            : [...(a ? a.rects : []), ...(b ? b.rects : [])];
        const edgeX = subpixel ? subpixelEdgeX : (x) => x * CELL_W;
        const edgeY = subpixel ? subpixelEdgeY : (y) => y * CELL_H;
        return units.map(r => {
            const x = Math.round(edgeX(r.x1) * this._scaleX), y = Math.round(edgeY(r.y1) * this._scaleY);
            return [x, y, Math.round(edgeX(r.x2 + 1) * this._scaleX) - x, Math.round(edgeY(r.y2 + 1) * this._scaleY) - y];
        });
    }

    // Repaint the overlay canvas within each of `areas` (device-pixel rects),
    // or all of it (after a render or context loss: rebuilds every kind)
    repaintOverlay(areas = null) {
        const ctx = this.overlayCtx;
        if (!ctx) return;
        if (!areas) {
            for (const kind of OVERLAY_ORDER) {
                const entry = this._overlayRects[kind];
                this._overlayDrawn[kind] = entry ? this.overlayDeviceRects(kind, entry) : [];
            }
            areas = [[0, 0, ctx.canvas.width, ctx.canvas.height]];
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const [ax, ay, aw, ah] of areas) {
            if (aw <= 0 || ah <= 0) continue;
            ctx.save();
            ctx.beginPath();
            ctx.rect(ax, ay, aw, ah);
            ctx.clip();
            ctx.clearRect(ax, ay, aw, ah);
            for (const kind of OVERLAY_ORDER) {
                for (const item of this._overlayDrawn[kind] || []) {
                    if (item.image) {
                        ctx.drawImage(item.image, item.x, item.y);
                        continue;
                    }
                    const [x, y, w, h, colour] = item;
                    if (x >= ax + aw || y >= ay + ah || x + w <= ax || y + h <= ay) continue;
                    ctx.fillStyle = colour;
                    ctx.fillRect(x, y, w, h);
                }
            }
            ctx.restore();
        }
    }

    // The device-pixel rects [x, y, w, h, colour] that draw one overlay kind:
    // each cell's (or subpixel's) outermost device pixels, exactly as drawCell
    // draws the grid, as one line per unit edge so large selections stay
    // cheap; plus a fill under it for kinds that have one (paste)
    overlayDeviceRects(kind, { rects, subpixel, images = [] }) {
        const style = this.theme.overlay[kind];
        const kx = this._scaleX, ky = this._scaleY;
        const edgeX = subpixel ? subpixelEdgeX : (x) => x * CELL_W;
        const edgeY = subpixel ? subpixelEdgeY : (y) => y * CELL_H;
        const DX = (x) => Math.round(edgeX(x) * kx);
        const DY = (y) => Math.round(edgeY(y) * ky);
        const bx = Math.max(1, Math.floor(kx)), by = Math.max(1, Math.floor(ky)); // as the grid
        // Lines between the units inside a rect: one device px, and none
        // once the units are too small for them to help
        const unitW = (subpixel ? CELL_W / 2 : CELL_W) * kx, unitH = (subpixel ? CELL_H / 3 : CELL_H) * ky;
        const inner = unitW >= 8 && unitH >= 8;
        const out = [...images];
        for (const r of rects) {
            const left = DX(r.x1), right = DX(r.x2 + 1);
            const top = DY(r.y1), bottom = DY(r.y2 + 1);
            if (style.fill) out.push([left, top, right - left, bottom - top, style.fill]);
            out.push([left, top, bx, bottom - top, style.line]);
            out.push([right - bx, top, bx, bottom - top, style.line]);
            out.push([left, top, right - left, by, style.line]);
            out.push([left, bottom - by, right - left, by, style.line]);
            // `whole`: one outline around all of it (a wide char's hover box)
            if (r.whole || !inner) continue;
            for (let x = r.x1 + 1; x <= r.x2; x++) out.push([DX(x), top, 1, bottom - top, style.line]);
            for (let y = r.y1 + 1; y <= r.y2; y++) out.push([left, DY(y), right - left, 1, style.line]);
        }
        return out;
    }

    // Outline the cell under the pointer (both halves of a wide char) so it's
    // clear which cell a tool acts on, and with the subpixel tools also the
    // subpixel a click would select or paint; hidden off the canvas and while
    // placing a paste (the paste preview shows where it goes)
    updateHover(e) {
        let rect = null, sub = null;
        if (e && this.canvas && !this.pasteMode && !this.imagePaste && this.container.contains(e.target)) {
            const c = this.cellCoordsFromEvent(e);
            const row = this.canvas.cells[c.cellY];
            let x = c.cellX;
            if (row[x].type === 'wide-tail' && x > 0) x--;
            rect = { x1: x, y1: c.cellY, x2: isWideHead(row[x]) ? x + 1 : x, y2: c.cellY, whole: true };
            if (this.usesSubpixels()) {
                const sp = this.subpixelCoordsFromEvent(e);
                sub = { x1: sp.sx, y1: sp.sy, x2: sp.sx, y2: sp.sy };
            }
        }
        this._hoverEvent = rect ? e : null;
        const same = (a, b) => (!a && !b) || (a && b && a.x1 === b.x1 && a.x2 === b.x2 && a.y1 === b.y1);
        if (!same(rect, this._hover)) {
            this._hover = rect;
            this.setOverlay('hover', rect ? [rect] : []);
        }
        if (!same(sub, this._hoverSub)) {
            this._hoverSub = sub;
            this.setOverlay('hover-subpixel', sub ? [sub] : [], true);
        }
    }

    // --- Pointer position and selection size readouts ---

    // Whether the current tool works on subpixels rather than whole cells
    usesSubpixels() {
        if (this.view === 'paper') return this.tool === 'select-subpixel';
        return this.tool === 'select-subpixel' || this.tool === 'fill' || this.subpixelShape() ||
            ((this.tool === 'draw' || this.tool === 'erase') && !this.brushCell);
    }

    // Whether the box/line tool draws with subpixels (its points are then
    // subpixel coordinates)
    subpixelShape() {
        return (this.tool === 'box' || this.tool === 'line') && this.boxLineStyle === SUBPIXEL_STYLE &&
            this.editView() !== 'paper';
    }

    // Size of a rect as "W×H"
    rectSizeText(r, subpixel = false) {
        return `${r.x2 - r.x1 + 1}×${r.y2 - r.y1 + 1}` + (subpixel ? ' sub' : '');
    }

    // Menu bar readout: the cell under the pointer (and the subpixel, for the
    // subpixel tools), and the selection's size if there is one. Coordinates
    // start at 0 in the top-left corner.
    updatePointerInfo(e) {
        const el = document.getElementById('cursor-pos');
        if (!el) return;
        const parts = [];
        if (e && this.canvas && this.container.contains(e.target)) {
            const c = this.cellCoordsFromEvent(e);
            parts.push(`x ${c.cellX}, y ${c.cellY}`);
            if (this.usesSubpixels()) {
                const sp = this.subpixelCoordsFromEvent(e);
                parts.push(`sub ${sp.sx}, ${sp.sy}`);
            }
        }
        if (this.isSubpixelMode() && this.subpixelSelection) {
            parts.push('sel ' + this.rectSizeText(this.subpixelSelection, true));
        } else if (this.selection) {
            parts.push('sel ' + this.rectSizeText(this.selection));
        }
        const text = parts.join('  ·  ');
        if (el.textContent !== text) el.textContent = text;
    }

    // While dragging a selection or a box, a label next to the pointer with
    // its size (cells, or subpixels for the subpixel selection)
    updateDragLabel(e) {
        let text = '';
        if (e && this._imageDrag) {
            const p = this.imagePaste;
            text = this._imageDrag.mode === 'resize' ? `${p.cols}×${p.rows}` : `x ${p.x}, y ${p.y}`;
        } else if (e && this.isDrawing) {
            if (this.subpixelSelectionStart && this.subpixelSelection) {
                text = this.rectSizeText(this.subpixelSelection, true);
            } else if (this.selectionStart && this.selection) {
                text = this.rectSizeText(this.selection);
            } else if (this.tool === 'box' && this.dragStart && this.dragEnd) {
                text = this.rectSizeText(normRect(this.dragStart, this.dragEnd), this.subpixelShape());
            }
        }
        if (!text) {
            if (this._dragLabel) this._dragLabel.style.display = 'none';
            return;
        }
        if (!this._dragLabel) {
            this._dragLabel = document.createElement('div');
            this._dragLabel.className = 'drag-size';
            document.body.appendChild(this._dragLabel);
        }
        const label = this._dragLabel;
        label.textContent = text;
        label.style.display = 'block';
        // Above-right of the pointer, kept inside the window
        const x = Math.min(e.clientX + 14, window.innerWidth - label.offsetWidth - 4);
        const y = Math.max(4, e.clientY - label.offsetHeight - 10);
        label.style.left = x + 'px';
        label.style.top = y + 'px';
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
        this.updatePointerInfo(this._lastPointerEvent);
    }

    clearSelection() {
        this.selection = null;
        this.selectionStart = null;
        this.updateSelectionDisplay();
    }

    // Subpixel selection display - outlines individual subpixels
    updateSubpixelSelectionDisplay() {
        this.setOverlay('subpixel-selection', this.subpixelSelection ? [this.subpixelSelection] : [], true);
        this.updatePointerInfo(this._lastPointerEvent);
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
        const view = this.editView();
        this.beforeChange(x1, y1, x2, y2);
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                // The paper view clears only paper, the ink view all but it
                const bg = this.canvas.cells[y][x].bg;
                if (view === 'paper') {
                    this.canvas.cells[y][x].bg = defaultBG();
                    continue;
                }
                detachWide(this.canvas.cells, x, y);
                this.canvas.cells[y][x] = createCell();
                if (view === 'ink') this.canvas.cells[y][x].bg = bg;
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
        const view = this.editView();
        this.clipboard.forEach((row, dy) => {
            row.forEach((cell, dx) => {
                // Transparent (image paste), or a wide char's tail that was
                // already placed along with its head
                if (!cell || (cell.type === 'wide-tail' && dx > 0 && isWideHead(row[dx - 1]))) return;
                const tx = x + dx;
                const ty = y + dy;
                if (tx >= 0 && tx < this.canvas.width && ty >= 0 && ty < this.canvas.height) {
                    // The paper view pastes only paper, the ink view all but it
                    if (view === 'paper') {
                        if (!cell.bg.keep) this.canvas.cells[ty][tx].bg = { ...cell.bg };
                    }
                    else {
                        placeCell(this.canvas.cells, tx, ty, view === 'ink' ? { ...cell, bg: keepColor('bg') } : cell);
                    }
                }
            });
        });
        this.updateCellRect(x, y, x + maxWidth - 1, y + this.clipboard.length - 1);

        this.pasteMode = false;
        this.clearPastePreview();
    }

    // Paste preview: the content as it will look once pasted at the pointer,
    // with a box in the paste colour around it (and the grid inside it when
    // the grid is shown, as the cells are drawn just like on the canvas)
    showPastePreview(e) {
        // Subpixel mode paste preview
        if (this.pastingSubpixels()) {
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
            if (!r) {
                this.setOverlay('paste-subpixel', [], true);
                return;
            }
            this._subpixelPasteImage = this._subpixelPasteImage || document.createElement('canvas');
            const image = this.drawCellsImage(this.subpixelPasteResult(sp.sx, sp.sy, r), {
                x1: Math.floor(r.x1 / 2), y1: Math.floor(r.y1 / 3),
                x2: Math.floor(r.x2 / 2), y2: Math.floor(r.y2 / 3)
            }, this._subpixelPasteImage, true);
            this.setOverlay('paste-subpixel', [{ ...r, whole: true }], true, [image]);
            return;
        }

        // Cell-level paste preview
        if (!this.clipboard || this.clipboard.length === 0) return;

        const c = this.cellCoordsFromEvent(e);
        if (!c) return;

        const key = `c${c.cellX},${c.cellY}`;
        if (key === this._pastePreviewKey) return;
        this._pastePreviewKey = key;

        const width = Math.max(...this.clipboard.map(row => row.length));
        const box = this.clipRect({
            x1: c.cellX, y1: c.cellY,
            x2: c.cellX + width - 1, y2: c.cellY + this.clipboard.length - 1
        });
        this.setOverlay('paste', box ? [{ ...box, whole: true }] : [], false,
            box ? [this.pastePreviewImage(c.cellX, c.cellY)] : []);
    }

    // The clipboard drawn as it pastes at cell (x, y). Drawing depends only
    // on where (x, y) falls between device pixels, so images are cached per
    // rounding phase and moved by whole device pixels: moving a big paste
    // preview is just an image copy.
    pastePreviewImage(x, y, clipboard = this.clipboard) {
        if (this._pasteImagesFor !== clipboard) {
            this._pasteImages.clear();
            this._pasteImagesFor = clipboard;
            // Keep colours show the canvas's, which differ from place to place
            this._pasteKeeps = clipboard.some(row => row.some(c => c && (c.fg.keep || c.bg.keep)));
        }
        const fx = x * CELL_W * this._scaleX, fy = y * CELL_H * this._scaleY;
        const key = Math.round((fx - Math.floor(fx)) * 1000) + ',' + Math.round((fy - Math.floor(fy)) * 1000);
        let cached = this._pasteKeeps ? null : this._pasteImages.get(key);
        if (!cached) {
            // As pasteAt places them: a wide char's tail goes with its head,
            // a tail without its head becomes a blank cell, and keep colours
            // are the ones there
            const cells = [];
            clipboard.forEach((row, dy) => row.forEach((cell, dx) => {
                if (!cell || (cell.type === 'wide-tail' && dx > 0 && isWideHead(row[dx - 1]))) return;
                let placed = cell.type === 'wide-tail' ? { ...cell, type: 'sextant' } : cell;
                if (placed !== cell) clearCell(placed);
                const under = this.canvas.cells[y + dy] && this.canvas.cells[y + dy][x + dx];
                if (under && (cell.fg.keep || cell.bg.keep)) {
                    placed = { ...placed, fg: cell.fg.keep ? under.fg : cell.fg, bg: cell.bg.keep ? under.bg : cell.bg };
                }
                cells.push({ x: x + dx, y: y + dy, cell: placed });
            }));
            const width = Math.max(...clipboard.map(row => row.length));
            // Not ragged pasted text, nor an image with transparent cells
            const rectangular = clipboard.every(row => row.length === width && row.every(Boolean));
            cached = this.drawCellsImage(cells, { x1: x, y1: y, x2: x + width - 1, y2: y + clipboard.length - 1 },
                undefined, rectangular);
            if (!this._pasteKeeps) this._pasteImages.set(key, cached);
        }
        return { image: cached.image, x: Math.round(fx), y: Math.round(fy) };
    }

    // The cells covering subpixel rect r as they will look after pasting the
    // subpixel clipboard at (sx, sy): copies of the canvas cells with the
    // clipboard's subpixels and colours applied, as pasteAtSubpixel does
    subpixelPasteResult(sx, sy, r) {
        const cells = new Map();
        for (let py = r.y1; py <= r.y2; py++) {
            for (let px = r.x1; px <= r.x2; px++) {
                const sp = this.subpixelAt(px, py);
                if (!sp) continue;
                const key = sp.cellX + ',' + sp.cellY;
                let cell = cells.get(key);
                if (!cell) {
                    cell = structuredClone(sp.cell);
                    // Painting over half of a wide char blanks it
                    if (cell.type === 'wide-tail' || isWideHead(cell)) clearCell(cell);
                    cells.set(key, cell);
                }
                this.applySubpixelData(cell, sp.row, sp.col, this.subpixelClipboard[py - sy][px - sx]);
            }
        }
        return [...cells].map(([key, cell]) => {
            const [x, y] = key.split(',').map(Number);
            return { x, y, cell };
        });
    }

    clearPastePreview() {
        this._pastePreviewKey = null;
        this.updateDragLabel(null);
        this.setOverlay('paste', []);
        this.setOverlay('paste-subpixel', [], true);
        // An image being placed stays (an AI operation's paste ends here too)
        this.showImagePreview();
    }

    // Convert a 2D cell array to a multiline text string
    cellsToText(cells) {
        const lines = cells.map(row => row.map(cell => cell ? cellToChar(cell) : ' ').join('').replace(/\s+$/, ''));
        while (lines.length > 0 && lines[lines.length - 1] === '') {
            lines.pop();
        }
        return lines.join('\n');
    }

    // Handle paste of the system clipboard's text (read here if not given),
    // falling back to the internal clipboard
    async handlePaste(systemText) {
        this.endImagePaste();   // pasting something else ends placing an image
        // Subpixel paste stays internal-only
        if (this.isSubpixelMode()) {
            if (this.subpixelClipboard) this.pasteMode = true;
            return;
        }
        if (systemText === undefined) {
            try {
                systemText = await navigator.clipboard.readText();
            } catch (err) {
                console.warn('Failed to read system clipboard:', err);
            }
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

        // System clipboard has different/new content — parse it into cells:
        // ANSI art with its colours, plain text in the current ones
        if (systemText && systemText.trim().length > 0) {
            const cells = systemText.includes('\x1b[')
                ? ansiTextToRows(systemText)
                : parseTextToCells(systemText, this.fgColor, this.bgColor, this.bold, this.inverse);
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

    // --- Image paste ---
    //
    // A bitmap image (pasted, dropped or imported) floats over the canvas,
    // converted to cells (see image-import.js), until it is placed (Enter,
    // or Place in the inspector) as one undo step, or cancelled (Esc). Drag
    // to move it, the bottom-right cell's handle or the wheel to resize it,
    // and the inspector's Image panel (see onImagePaste) for its options;
    // every change converts it again.

    async startImagePaste(blob, at = null) {
        let image;
        try {
            image = await createImageBitmap(blob);
        } catch (err) {
            alert('Could not read the image: ' + err.message);
            return;
        }
        this.endImagePaste();
        this.clearTextCursor(); // its typing would take the image's keys
        this.pasteMode = false;
        this.clearPastePreview();
        // As large as fits the selection (and at it) or the canvas
        const area = this.selection || { x1: 0, y1: 0, x2: this.canvas.width - 1, y2: this.canvas.height - 1 };
        const cols = fitImageCols(image, this.cellAspect, area.x2 - area.x1 + 1, area.y2 - area.y1 + 1);
        const rows = imageRows(image, cols, this.cellAspect);
        this.imagePaste = {
            image, cols, rows, locked: true, x: 0, y: 0,
            mono: false, dither: 'floyd-steinberg', strength: 1,
            brightness: 0, contrast: 0, midtones: 0, invert: false
        };
        this.moveImageTo(this.selection ? { x: area.x1, y: area.y1 } : this.imageStartPosition(at, cols, rows));
        this._wheel = 0;
        this.updateImagePaste();
    }

    // Where a new image goes: its top-left at the drop point, or centred in
    // the part of the canvas in view
    imageStartPosition(at, cols, rows) {
        // All of it on the canvas where it fits
        const fit = (v, size, count) => Math.max(0, Math.min(v, count - size));
        if (at && this.container.contains(at.target)) {
            const c = this.cellCoordsFromEvent(at);
            return { x: fit(c.cellX, cols, this.canvas.width), y: fit(c.cellY, rows, this.canvas.height) };
        }
        const view = (this.container.closest('.canvas-scroll') || this.container).getBoundingClientRect();
        const box = this.container.getBoundingClientRect();
        const left = Math.max(view.left, box.left), right = Math.min(view.right, box.right);
        const top = Math.max(view.top, box.top), bottom = Math.min(view.bottom, box.bottom);
        const c = this.cellCoordsFromEvent({ clientX: (left + right) / 2, clientY: (top + bottom) / 2 });
        return {
            x: fit(c.cellX - Math.floor(cols / 2), cols, this.canvas.width),
            y: fit(c.cellY - Math.floor(rows / 2), rows, this.canvas.height)
        };
    }

    // Keep at least one cell of the image on the canvas
    moveImageTo({ x, y }) {
        const p = this.imagePaste;
        p.x = Math.min(this.canvas.width - 1, Math.max(1 - p.cols, x));
        p.y = Math.min(this.canvas.height - 1, Math.max(1 - p.rows, y));
    }

    // Free the image once it is placed or cancelled (placed, its cells stay
    // on the clipboard, to paste again as they are)
    endImagePaste() {
        if (!this.imagePaste) return;
        this.imagePaste.image.close();
        this.imagePaste = null;
        this._imageDrag = null;
        this.container.classList.remove('image-move', 'image-resize');
        this.setOverlay('paste', []);
        this.setOverlay('image-handle', []);
        if (this.onImagePaste) this.onImagePaste(null);
    }

    placeImage() {
        const p = this.imagePaste;
        if (!p) return;
        this.clipboard = p.cells;
        this.recordEdit('Paste image', () => this.pasteAt(p.x, p.y));
        this.endImagePaste();
    }

    // Whether an image is being placed
    isImagePaste() {
        return !!this.imagePaste;
    }

    // Whether a subpixel paste is being placed
    pastingSubpixels() {
        return this.isSubpixelMode() && !!this.subpixelClipboard && !this.isImagePaste();
    }

    imageRect() {
        const p = this.imagePaste;
        return { x1: p.x, y1: p.y, x2: p.x + p.cols - 1, y2: p.y + p.rows - 1 };
    }

    // Convert the image again (after a change of size or options) and show it
    updateImagePaste() {
        const p = this.imagePaste;
        p.cells = imageToCells(p.image, p.cols, p.rows, {
            mono: p.mono, fg: this.fgColor, bg: this.bgColor, dither: p.dither, strength: p.strength,
            brightness: p.brightness, contrast: p.contrast, midtones: p.midtones, invert: p.invert
        });
        this.showImagePreview();
        if (this.onImagePaste) this.onImagePaste(p);
    }

    // Convert on the next frame (many changes may come before it: a wheel
    // turn, a slider drag)
    scheduleImageUpdate() {
        if (this._imageFrame) return;
        this._imageFrame = requestAnimationFrame(() => {
            this._imageFrame = null;
            if (this.imagePaste) this.updateImagePaste();
        });
    }

    // The image as it will be placed, outlined, with a handle on its
    // bottom-right cell
    showImagePreview() {
        const p = this.imagePaste;
        if (!p || !p.cells) return;
        const r = this.imageRect();
        const box = this.clipRect(r);
        this.setOverlay('paste', box ? [{ ...box, whole: true }] : [], false,
            box ? [this.pastePreviewImage(p.x, p.y, p.cells)] : []);
        const h = this.imageHandle();
        const handle = h && this.clipRect({ x1: h.x, y1: h.y, x2: h.x, y2: h.y });
        this.setOverlay('image-handle', handle ? [{ ...handle, whole: true }] : []);
    }

    // Change image options ({ cols, rows, locked, mono, dither, strength,
    // brightness, contrast, midtones, invert }). Locked, a new width sets the
    // height to keep the image's proportions, and a new height the width.
    setImageOptions(changes) {
        const p = this.imagePaste;
        if (!p) return;
        const before = JSON.stringify({ ...p, image: 0, cells: 0 });
        Object.assign(p, changes);
        const clamp = (v, max) => Math.min(max, Math.max(1, Math.round(v)));
        if (p.locked) {
            // Width and height together, as large as asked within the limits
            const colsPerRow = p.image.width / (p.image.height * this.cellAspect);
            let cols = 'rows' in changes && !('cols' in changes) ? p.rows * colsPerRow : p.cols;
            cols = Math.min(cols, 500, 200 * colsPerRow);
            p.cols = clamp(cols, 500);
            p.rows = clamp(imageRows(p.image, p.cols, this.cellAspect), 200);
        } else {
            p.cols = clamp(p.cols, 500);
            p.rows = clamp(p.rows, 200);
        }
        if (JSON.stringify({ ...p, image: 0, cells: 0 }) !== before) this.scheduleImageUpdate();
        else if (this.onImagePaste) this.onImagePaste(p);   // fields the user typed past a limit show it again
    }

    // Grow (dir 1) or shrink (-1) the image by about a tenth, or by one
    // column when `fine`
    resizeImagePaste(dir, fine) {
        const p = this.imagePaste;
        const step = fine ? 1 : Math.max(1, Math.round(p.cols / 10));
        const cols = Math.min(500, Math.max(1, p.cols + dir * step));
        if (cols === p.cols) return;
        this.setImageOptions({ cols, ...(p.locked ? {} : { rows: Math.max(1, Math.round(p.rows * cols / p.cols)) }) });
    }

    // The resize handle: the image's bottom-right cell, or the cell nearest
    // it on the canvas when that corner is off it; none on a 1x1 image,
    // which is dragged to move it
    imageHandle() {
        const p = this.imagePaste, r = this.imageRect();
        if (p.cols === 1 && p.rows === 1) return null;
        return { x: Math.min(r.x2, this.canvas.width - 1), y: Math.min(r.y2, this.canvas.height - 1) };
    }

    onImageHandle(c) {
        const h = this.imageHandle();
        return !!h && c.cellX === h.x && c.cellY === h.y;
    }

    // Image dragging: from its handle resizes, from anywhere else moves it
    startImageDrag(e) {
        const p = this.imagePaste;
        const c = this.cellCoordsFromEvent(e);
        this._imageDrag = {
            mode: this.onImageHandle(c) ? 'resize' : 'move',
            from: c, x: p.x, y: p.y, cols: p.cols, rows: p.rows
        };
        this.isDrawing = true;
    }

    updateImageDrag(e) {
        const d = this._imageDrag, p = this.imagePaste;
        const c = this.cellCoordsFromEvent(e);
        const dx = c.cellX - d.from.cellX, dy = c.cellY - d.from.cellY;
        if (d.mode === 'move') {
            this.moveImageTo({ x: d.x + dx, y: d.y + dy });
            this.showImagePreview();
            if (this.onImagePaste) this.onImagePaste(p);
        } else {
            this.setImageOptions(p.locked ? { cols: d.cols + dx } : { cols: d.cols + dx, rows: d.rows + dy });
        }
    }

    // The pointer shows what a drag on the image does
    updateImageCursor(e) {
        const onHandle = this.onImageHandle(this.cellCoordsFromEvent(e)) && this.container.contains(e.target);
        this.container.classList.toggle('image-resize', onHandle);
        this.container.classList.toggle('image-move', !onHandle);
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
            bg: { ...cell.bg },
            bold: !!cell.bold,
            inverse: !!cell.inverse
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
                if (this.editView() === 'paper') {
                    sp.cell.bg = defaultBG();
                    continue;
                }
                detachWide(this.canvas.cells, sp.cellX, sp.cellY);
                setCellSubpixel(sp.cell, sp.row, sp.col, false);
            }
        }
        this.updateSubpixelRect(r);
        this.clearSubpixelSelection();
    }

    // Give a cell's subpixel (row, col) the subpixel clipboard's `data`: in
    // the paper view only its paper, in the ink view all but its paper
    applySubpixelData(cell, row, col, data) {
        const view = this.editView();
        if (view !== 'paper') {
            setCellSubpixel(cell, row, col, data.filled);
            if (data.fg) Object.assign(cell, { fg: { ...data.fg }, bold: data.bold, inverse: data.inverse });
        }
        if (view !== 'ink' && data.bg) cell.bg = { ...data.bg };
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
                // Painting over half of a wide char blanks it
                if (this.editView() !== 'paper') detachWide(this.canvas.cells, sp.cellX, sp.cellY);
                this.applySubpixelData(sp.cell, sp.row, sp.col, data);
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
        if (this.editView() === 'paper') {
            const c = this.cellCoordsFromEvent(e);
            if (c) this.strokeTo(c.cellX, c.cellY, (x, y) => this.paintPaper([{ x, y }], this.tool === 'erase'));
            return;
        }
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
        const paper = this.paperColor();
        if (cell.type === 'sextant' && cell.subpixels[row][col] === filled && colorKeeps(cell.bg, paper) &&
            (filled ? colorKeeps(cell.fg, this.inkColor()) && !!cell.bold === this.bold && !!cell.inverse === this.inverse
                : !cell.bold && !cell.inverse)) {
            return null;
        }

        this.beforeChange(cellX, cellY, cellX, cellY);
        if (filled) {
            this.applyCurrentColors(cell);
        } else {
            // Erased, the cell shows plainly (an inverse blank would be a block)
            if (!paper.keep) cell.bg = { ...paper };
            cell.bold = cell.inverse = false;
        }
        detachWide(this.canvas.cells, cellX, cellY);
        setCellSubpixel(cell, row, col, filled);
        return sp;
    }

    handleCharTool(e) {
        if (!this.selectedChar || this.editView() === 'paper') return;   // glyphs are ink

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

    // The point a shape drag is at: a cell, or a subpixel for the subpixel style
    shapePoint(e) {
        if (this.subpixelShape()) {
            const sp = this.subpixelCoordsFromEvent(e);
            return sp && { x: sp.sx, y: sp.sy };
        }
        const c = this.cellCoordsFromEvent(e);
        return c && { x: c.cellX, y: c.cellY };
    }

    handleShapeToolDown(e) {
        const p = this.shapePoint(e);
        if (!p) return;
        this.dragStart = p;
        this.handleShapeToolMove(e);
    }

    handleShapeToolMove(e) {
        if (!this.dragStart) return;
        const p = this.shapePoint(e);
        if (!p) return;
        this.dragEnd = p;

        if (this.subpixelShape()) {
            // Fill and Recolour change the inside too
            const rects = this.tool === 'line' ? runsOf(this.subpixelLinePoints())
                : this.boxFillMode > 0 ? [normRect(this.dragStart, this.dragEnd)] : this.subpixelBoxRects();
            this.setOverlay('box-subpixel', rects, true);
        } else if (this.tool === 'box') {
            const r = normRect(this.dragStart, this.dragEnd);
            if (this.editView() === 'paper') this.setOverlay('box', [r]);   // all of it gets the paper
            else this.showBoxPreview(r);
        } else {
            this.showLinePreview();
        }
    }

    cancelDrag() {
        this.dragStart = null;
        this.dragEnd = null;
        this.setOverlay('box', []);
        this.setOverlay('box-subpixel', [], true);
    }

    // --- Subpixel boxes and lines (SUBPIXEL_STYLE), dragStart to dragEnd in
    // subpixel coordinates ---

    // A straight line of subpixels
    subpixelLinePoints() {
        return linePoints(this.dragStart.x, this.dragStart.y, this.dragEnd.x, this.dragEnd.y);
    }

    // The box's subpixels as rects: all of it when filled, else its outline
    subpixelBoxRects() {
        const { x1, y1, x2, y2 } = normRect(this.dragStart, this.dragEnd);
        if (this.boxFillMode === 1 || x2 - x1 < 2 || y2 - y1 < 2) return [{ x1, y1, x2, y2 }];
        return [
            { x1, y1, x2, y2: y1 }, { x1, y1: y2, x2, y2 },
            { x1, y1: y1 + 1, x2: x1, y2: y2 - 1 }, { x1: x2, y1: y1 + 1, x2, y2: y2 - 1 }
        ];
    }

    // Set the subpixels in `rects` (clipped to the canvas) in the current
    // colours, repainting each touched cell once
    paintSubpixelRects(rects) {
        const changed = new Map();
        for (const r of rects) {
            const c = this.clipRect(r, true);
            if (!c) continue;
            for (let sy = c.y1; sy <= c.y2; sy++) {
                for (let sx = c.x1; sx <= c.x2; sx++) {
                    const sp = this.paintSubpixel(sx, sy, true);
                    if (sp) changed.set(`${sp.cellX},${sp.cellY}`, sp);
                }
            }
        }
        for (const { cellX, cellY } of changed.values()) this.updateCell(cellX, cellY);
    }

    // Draw the dragged 'box' or 'line' with subpixels
    commitSubpixelShape(shape) {
        if (shape === 'line') {
            this.paintSubpixelRects(this.subpixelLinePoints().map(p => ({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })));
            return;
        }
        const rects = this.subpixelBoxRects();
        // Recolour: the cells inside the outline get the colours too
        const r = normRect(this.dragStart, this.dragEnd);
        if (this.boxFillMode === 2 && rects.length === 4) {
            const inside = this.clipRect(subpixelToCellRect({ x1: r.x1 + 1, y1: r.y1 + 1, x2: r.x2 - 1, y2: r.y2 - 1 }));
            if (inside) {
                this.beforeChange(inside.x1, inside.y1, inside.x2, inside.y2);
                for (let y = inside.y1; y <= inside.y2; y++) {
                    for (let x = inside.x1; x <= inside.x2; x++) this.applyCurrentColors(this.canvas.cells[y][x]);
                }
                this.updateCellRect(inside.x1, inside.y1, inside.x2, inside.y2);
            }
        }
        this.paintSubpixelRects(rects);
    }

    // --- Fill tool ---

    handleFillTool(e) {
        if (this.editView() === 'paper') {
            const c = this.cellCoordsFromEvent(e);
            if (c) this.fillPaperAt(c.cellX, c.cellY);
            return;
        }
        const sp = this.subpixelCoordsFromEvent(e);
        if (sp) this.fillAt(sp.sx, sp.sy);
    }

    // The paper view's fill: the cells connected to (x, y) (up, down, left,
    // right) with the same paper get the paper colour; what they hold
    // doesn't matter. Returns the area's size in cells and how many changed.
    fillPaperAt(x0, y0) {
        const W = this.canvas.width, H = this.canvas.height;
        const paper = this.bgColor;
        if (paper.keep || !(x0 >= 0 && x0 < W && y0 >= 0 && y0 < H)) return { count: 0, changed: 0 };
        const target = this.canvas.cells[y0][x0].bg;
        if (colorsEqual(target, paper)) return { count: 0, changed: 0 };
        const seen = new Uint8Array(W * H);
        const stack = [y0 * W + x0];
        const area = [];
        seen[stack[0]] = 1;
        while (stack.length) {
            const i = stack.pop();
            const x = i % W, y = (i - x) / W;
            area.push({ x, y });
            for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                const j = ny * W + nx;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H || seen[j]) continue;
                seen[j] = 1;
                if (colorsEqual(this.canvas.cells[ny][nx].bg, target)) stack.push(j);
            }
        }
        this.paintPaper(area);
        return { count: area.length, changed: area.length };
    }

    // Fill: the area is the subpixels connected to (sx, sy) that look the
    // same as it: lit or unlit alike, showing the same colour; anything else,
    // and cells holding a character, stop it. An unlit area also takes in
    // the unlit subpixels of drawn cells (ones with lit subpixels) showing
    // the paper colour: the paper a shape drawn in these colours put around
    // it. Unlit areas connect up, down, left and right, lit ones also
    // diagonally (drawn lines often only touch at corners, and such a line
    // still bounds an unlit area). `mode` (default this.fillMode) says what
    // it does there:
    //   ink    lights the area in the ink colour. An unlit area leaves out
    //          cells where that would repaint other lit subpixels (a line
    //          through them).
    //   paper  gives every cell the area reaches the paper colour; lit
    //          subpixels keep their ink.
    //   both   paper, then ink.
    // Returns the area's size (0: (sx, sy) is in a character cell, or the
    // colours to use are keep), how many cells changed, and their rect.
    fillAt(sx, sy, mode = this.fillMode) {
        // The ink view fills ink, bounded by ink alone (see editView)
        const inkView = this.editView() === 'ink';
        if (inkView) mode = 'ink';
        const cols = this.canvas.width, W = cols * 2, H = this.canvas.height * 3;
        const ink = mode !== 'paper' && !this.fgColor.keep;
        const paper = mode !== 'ink' && !this.bgColor.keep;
        if ((!ink && !paper) || !(sx >= 0 && sx < W && sy >= 0 && sy < H)) return { count: 0, changed: 0 };
        const cellAt = (x, y) => this.canvas.cells[Math.floor(y / 3)][x >> 1];
        // A cell's colour slots: lit subpixels show `on`, unlit `off`
        // (inverse swaps them)
        const slots = (cell) => cell.inverse ? { on: 'bg', off: 'fg' } : { on: 'fg', off: 'bg' };
        const start = cellAt(sx, sy);
        if (start.type !== 'sextant') return { count: 0, changed: 0 };
        const startLit = start.subpixels[sy % 3][sx % 2];
        const colour = start[slots(start)[startLit ? 'on' : 'off']];
        const passPaper = !startLit && !this.bgColor.keep ? this.bgColor : null;
        // Whether (x, y) belongs in the area, worked out as the fill reaches it
        const fits = (x, y) => {
            const cell = cellAt(x, y);
            if (cell.type !== 'sextant' || cell.subpixels[y % 3][x % 2] !== startLit) return false;
            if (inkView && !startLit) return true;   // paper unseen: any unlit subpixel
            const c = cell[slots(cell)[startLit ? 'on' : 'off']];
            return colorsEqual(c, colour) ||
                (!!passPaper && colorsEqual(c, passPaper) && cell.subpixels.some(row => row[0] || row[1]));
        };
        const steps = startLit
            ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
            : [[-1, 0], [1, 0], [0, -1], [0, 1]];
        const seen = new Uint8Array(W * H);
        const area = [];
        const stack = [sy * W + sx];
        seen[stack[0]] = 1;
        while (stack.length) {
            const i = stack.pop();
            area.push(i);
            const x = i % W, y = (i - x) / W;
            for (const [dx, dy] of steps) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
                const j = ny * W + nx;
                if (seen[j]) continue;
                seen[j] = 1;
                if (fits(nx, ny)) stack.push(j);
            }
        }

        // The area's subpixels by cell
        const byCell = new Map();
        for (const i of area) {
            const x = i % W, y = (i - x) / W;
            const k = Math.floor(y / 3) * cols + (x >> 1);
            if (!byCell.has(k)) byCell.set(k, []);
            byCell.get(k).push([y % 3, x % 2]);
        }
        const box = { x1: cols, y1: this.canvas.height, x2: 0, y2: 0 };
        let changed = 0;
        for (const [k, subs] of byCell) {
            const x = k % cols, y = (k - x) / cols;
            const cell = this.canvas.cells[y][x];
            const before = JSON.stringify(cell);
            const slot = slots(cell);
            this.beforeChange(x, y, x, y);
            if (paper) cell[slot.off] = { ...this.bgColor };
            if (ink) {
                // An unlit area: other lit subpixels would take the new ink,
                // so leave the cell (a lit area has all the cell's lit ones'
                // colour, so recolouring them all is right)
                const inArea = new Set(subs.map(([r, c]) => r * 2 + c));
                const others = !startLit && cell.subpixels.flat().some((on, i) => on && !inArea.has(i));
                if (!others || colorsEqual(cell[slot.on], this.fgColor)) {
                    cell[slot.on] = { ...this.fgColor };
                    for (const [r, c] of subs) cell.subpixels[r][c] = true;
                }
            }
            if (JSON.stringify(cell) === before) continue;
            changed++;
            box.x1 = Math.min(box.x1, x); box.x2 = Math.max(box.x2, x);
            box.y1 = Math.min(box.y1, y); box.y2 = Math.max(box.y2, y);
        }
        if (changed) this.updateCellRect(box.x1, box.y1, box.x2, box.y2);
        return { count: area.length, changed, rect: changed ? box : null };
    }

    commitBox() {
        if (this.editView() === 'paper') {
            // The paper of every cell in it
            const { x1, y1, x2, y2 } = normRect(this.dragStart, this.dragEnd);
            const cells = [];
            for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) cells.push({ x, y });
            this.paintPaper(cells);
            return;
        }
        if (this.boxLineStyle === SUBPIXEL_STYLE) {
            this.commitSubpixelShape('box');
            return;
        }
        const { x1, y1, x2, y2 } = normRect(this.dragStart, this.dragEnd);

        // Fill: when there is a border, fill the interior only; otherwise fill
        // the whole area. The box may reach past the canvas (the collab add-on
        // draws boxes there): only cells on it change.
        const inset = this.boxLineStyle > 0 ? 1 : 0;
        const inside = this.clipRect({ x1: x1 + inset, y1: y1 + inset, x2: x2 - inset, y2: y2 - inset });
        if (this.boxFillMode > 0 && inside) {
            this.beforeChange(inside.x1, inside.y1, inside.x2, inside.y2);
            for (let y = inside.y1; y <= inside.y2; y++) {
                for (let x = inside.x1; x <= inside.x2; x++) {
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
        if (this.editView() === 'paper') {
            this.paintPaper(computeLinePath(this.dragStart.x, this.dragStart.y, this.dragEnd.x, this.dragEnd.y));
            return;
        }
        if (this.boxLineStyle === SUBPIXEL_STYLE) {
            this.commitSubpixelShape('line');
            return;
        }
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
        if (this.editView() === 'paper') return;   // text is ink
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
        if (!this._cursorEl) {
            this._cursorEl = document.createElement('div');
            this._cursorEl.className = 'text-cursor';
            this.overlayLayer.appendChild(this._cursorEl);
        }
        this._cursorEl.style.cssText = `left:${x * CELL_W}px;top:${y * CELL_H}px;` +
            `width:${(x2 - x + 1) * CELL_W}px;height:${CELL_H}px`;
    }

    clearTextCursorDisplay() {
        if (this._cursorEl) {
            this._cursorEl.remove();
            this._cursorEl = null;
        }
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
            status.textContent = `${this.canvas.width} × ${this.canvas.height}`;
        }
    }

    // Drop selections and in-progress drags; they refer to the old canvas extents.
    resetInteractionState(keepImage = false) {
        this.clearSelection();
        this.clearSubpixelSelection();
        this.pasteMode = false;
        this.clearPastePreview();
        if (!keepImage) this.endImagePaste();
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
