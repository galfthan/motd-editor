// Undo/redo history — pure JS, no DOM (see CanvasRenderer.undo/redo for the UI side)
//
// A step records "before" copies of only the cells it changes, taken lazily
// on first touch, so a stroke costs memory in proportion to what it touched.
// Operations that replace or reshape the whole canvas (new, open, resize,
// clear) record a whole-canvas snapshot instead.
//
// Public API (for the toolbar, and for scripts driving the editor):
//
//   history.begin(label, group?)  Start a step. Nested begin/end pairs
//   history.end()                 collapse into the outermost step, which
//                                 keeps the outer label.
//   history.record(label, fn, group?)
//                                 begin(label); fn(); end() — returns fn's
//                                 result, and ends the step even if fn throws.
//   history.undo() / redo()       Restore the canvas; returns the change made
//                                 ({ label, wholeCanvas, cells: [{ x, y }],
//                                 cursor: the text cursor at that point })
//                                 or null when there is nothing to do (or a
//                                 step is still open).
//   history.canUndo() / canRedo(), undoLabel() / redoLabel()
//   history.onChange              Called after any change to the stacks.
//
// Code that mutates cells must call touchRect() (via
// CanvasRenderer.beforeChange) for the cells it is about to write, or
// snapshot() before replacing or reshaping the canvas. A touch outside any
// step opens one that ends when the current task does, so a forgotten
// begin/end still yields one undo step per synchronous operation.
//
// Steps that turn out to change nothing are dropped. Steps begun with the
// same `group` (e.g. text typing) merge into one undo step until
// breakGroup() is called or another step is recorded.

const HISTORY_MAX_STEPS = 200;
// Upper bound on cells kept across all undo steps (a 500x200 snapshot is
// 100k cells at most; blank cells aren't stored)
const HISTORY_MAX_CELLS = 1000000;

// --- Packed cell records ---
//
// Recorded cells are kept as RECORD_SIZE numbers each in one flat array per
// step (x, y, type and subpixels, charCode, fg, bg) rather than as cell
// objects: a large step then costs one array instead of ~100k small objects.

const RECORD_SIZE = 6;
const CELL_TYPES = ['sextant', 'diagonal', 'triangle', 'custom', 'wide-tail'];

function packColor(c) {
    return (c.default ? 1 << 24 : 0) | (c.r << 16) | (c.g << 8) | c.b;
}

function unpackColor(v) {
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, default: (v & (1 << 24)) !== 0 };
}

// Cell type in the low 3 bits, subpixels (row-major) above them
function packTypeAndSubpixels(cell) {
    let v = CELL_TYPES.indexOf(cell.type);
    for (let r = 0; r < 3; r++) {
        if (cell.subpixels[r][0]) v |= 8 << (r * 2);
        if (cell.subpixels[r][1]) v |= 16 << (r * 2);
    }
    return v;
}

function pushRecord(out, x, y, cell) {
    out.push(x, y, packTypeAndSubpixels(cell), cell.charCode, packColor(cell.fg), packColor(cell.bg));
}

// Does record i of `recs` hold exactly `cell`?
function recordMatches(recs, i, cell) {
    return recs[i + 2] === packTypeAndSubpixels(cell) && recs[i + 3] === cell.charCode &&
        recs[i + 4] === packColor(cell.fg) && recs[i + 5] === packColor(cell.bg);
}

function cellFromRecord(recs, i) {
    const v = recs[i + 2];
    const bit = (r, c) => (v & ((8 << c) << (r * 2))) !== 0;
    return {
        type: CELL_TYPES[v & 7],
        fg: unpackColor(recs[i + 4]),
        bg: unpackColor(recs[i + 5]),
        subpixels: [[bit(0, 0), bit(0, 1)], [bit(1, 0), bit(1, 1)], [bit(2, 0), bit(2, 1)]],
        charCode: recs[i + 3]
    };
}

// Whole-canvas copy that stores only the non-blank cells (row-major)
function snapshotCanvas(canvas) {
    const blank = [];
    pushRecord(blank, 0, 0, createCell());
    const cells = [];
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const cell = canvas.cells[y][x];
            if (!recordMatches(blank, 0, cell)) pushRecord(cells, x, y, cell);
        }
    }
    return { width: canvas.width, height: canvas.height, mode: canvas.mode, cells, blank };
}

function canvasFromSnapshot(snap) {
    const recs = snap.cells;
    const cells = [];
    let i = 0;
    for (let y = 0; y < snap.height; y++) {
        const row = [];
        for (let x = 0; x < snap.width; x++) {
            if (i < recs.length && recs[i] === x && recs[i + 1] === y) {
                row.push(cellFromRecord(recs, i));
                i += RECORD_SIZE;
            } else {
                row.push(createCell());
            }
        }
        cells.push(row);
    }
    return { width: snap.width, height: snap.height, cells, mode: snap.mode };
}

function canvasMatchesSnapshot(canvas, snap) {
    if (canvas.width !== snap.width || canvas.height !== snap.height || canvas.mode !== snap.mode) {
        return false;
    }
    const recs = snap.cells;
    let i = 0;
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const stored = i < recs.length && recs[i] === x && recs[i + 1] === y;
            const matches = stored ? recordMatches(recs, i, canvas.cells[y][x])
                                   : recordMatches(snap.blank, 0, canvas.cells[y][x]);
            if (!matches) return false;
            if (stored) i += RECORD_SIZE;
        }
    }
    return true;
}

// Number of cells a step keeps
function stepSize(step) {
    return (step.cells.length + (step.snapshot ? step.snapshot.cells.length : 0)) / RECORD_SIZE;
}

class EditHistory {
    // `target.canvas` is the canvas being edited; undo/redo may replace it
    constructor(target) {
        this.target = target;
        this.undoStack = [];
        this.redoStack = [];
        this.step = null;       // Step being recorded
        this.depth = 0;         // begin/end nesting
        this.groupOpen = false; // Next step of the same group merges into the top one
        this.onChange = null;
    }

    // A step: `cells` holds packed "before" records of touched cells; `keys`
    // (while recording) the cells already recorded; `cursor` the text cursor
    // before and after it, so undo/redo can put the cursor back
    newStep(label, group) {
        return { label, group, cells: [], keys: new Set(), snapshot: null, cursor: { before: null, after: null } };
    }

    textCursor() {
        const c = this.target.textCursor;
        return c ? { x: c.x, y: c.y } : null;
    }

    begin(label = 'Edit', group = null) {
        if (this.depth++ === 0) {
            this.step = this.newStep(label, group);
            this.step.cursor.before = this.textCursor();
        }
    }

    end() {
        if (this.depth === 0) return;
        if (--this.depth > 0) return;
        const step = this.step;
        this.step = null;
        step.cursor.after = this.textCursor();
        this.commit(step);
    }

    record(label, fn, group = null) {
        this.begin(label, group);
        try {
            return fn();
        } finally {
            this.end();
        }
    }

    // Open a step for a touch made outside one; it ends with the current task
    ensureStep() {
        if (this.depth > 0) return;
        this.begin();
        queueMicrotask(() => this.end());
    }

    // Record the cells in a rect (clipped to the canvas) before they change.
    // Writing a cell can blank the other half of a wide char, so the rect is
    // widened to whole wide chars. Placing a wide char writes its tail too:
    // include the tail's column in the rect.
    touchRect(x1, y1, x2, y2) {
        const canvas = this.target.canvas;
        this.ensureStep();
        const step = this.step;
        if (step.snapshot) return; // Already covers everything
        x1 = Math.max(0, x1);
        y1 = Math.max(0, y1);
        x2 = Math.min(canvas.width - 1, x2);
        y2 = Math.min(canvas.height - 1, y2);
        for (let y = y1; y <= y2; y++) {
            const row = canvas.cells[y];
            let left = x1, right = x2;
            if (left > 0 && row[left].type === 'wide-tail') left--;
            if (right + 1 < canvas.width && isWideHead(row[right])) right++;
            for (let x = left; x <= right; x++) {
                const key = y * 65536 + x;
                if (step.keys.has(key)) continue;
                step.keys.add(key);
                pushRecord(step.cells, x, y, row[x]);
            }
        }
    }

    // Record the whole canvas before it is replaced, resized or cleared
    snapshot() {
        this.ensureStep();
        if (!this.step.snapshot) this.step.snapshot = snapshotCanvas(this.target.canvas);
    }

    // Keep a finished step on the undo stack if it changed anything
    commit(step) {
        const canvas = this.target.canvas;
        step.keys = null;
        if (step.snapshot) {
            if (step.cells.length === 0 && canvasMatchesSnapshot(canvas, step.snapshot)) return;
        } else {
            // Drop the records of cells that ended up unchanged
            const kept = [];
            for (let i = 0; i < step.cells.length; i += RECORD_SIZE) {
                const x = step.cells[i], y = step.cells[i + 1];
                if (!recordMatches(step.cells, i, canvas.cells[y][x])) {
                    for (let k = 0; k < RECORD_SIZE; k++) kept.push(step.cells[i + k]);
                }
            }
            if (kept.length === 0) return;
            step.cells = kept;
        }

        this.redoStack = [];
        const top = this.undoStack[this.undoStack.length - 1];
        if (step.group && this.groupOpen && top && top.group === step.group && !top.snapshot) {
            this.mergeInto(top, step);
        } else {
            this.undoStack.push(step);
        }
        this.groupOpen = !!step.group;
        this.trim();
        this.changed();
    }

    // Add a step's records to an earlier one, keeping the earlier "before"
    // copy of cells both touched
    mergeInto(top, step) {
        top.cursor.after = step.cursor.after;
        const keys = new Set();
        for (let i = 0; i < top.cells.length; i += RECORD_SIZE) {
            keys.add(top.cells[i + 1] * 65536 + top.cells[i]);
        }
        for (let i = 0; i < step.cells.length; i += RECORD_SIZE) {
            if (keys.has(step.cells[i + 1] * 65536 + step.cells[i])) continue;
            for (let k = 0; k < RECORD_SIZE; k++) top.cells.push(step.cells[i + k]);
        }
    }

    breakGroup() {
        this.groupOpen = false;
    }

    // Drop the oldest steps beyond the step and cell limits (keeping the newest)
    trim() {
        let total = this.undoStack.reduce((n, s) => n + stepSize(s), 0);
        while (this.undoStack.length > 1 &&
               (this.undoStack.length > HISTORY_MAX_STEPS || total > HISTORY_MAX_CELLS)) {
            total -= stepSize(this.undoStack.shift());
        }
    }

    canUndo() {
        return this.depth === 0 && this.undoStack.length > 0;
    }

    canRedo() {
        return this.depth === 0 && this.redoStack.length > 0;
    }

    undoLabel() {
        const s = this.undoStack[this.undoStack.length - 1];
        return s ? s.label : null;
    }

    redoLabel() {
        const s = this.redoStack[this.redoStack.length - 1];
        return s ? s.label : null;
    }

    undo() {
        if (!this.canUndo()) return null;
        return this.move(this.undoStack, this.redoStack);
    }

    redo() {
        if (!this.canRedo()) return null;
        return this.move(this.redoStack, this.undoStack);
    }

    // Apply the top step of `from` and push its inverse onto `to`
    move(from, to) {
        const step = from.pop();
        const inverse = this.newStep(step.label, step.group);
        inverse.keys = null;
        inverse.cursor = { before: step.cursor.after, after: step.cursor.before };
        const change = { label: step.label, wholeCanvas: !!step.snapshot, cells: [], cursor: step.cursor.before };

        if (step.snapshot) {
            inverse.snapshot = snapshotCanvas(this.target.canvas);
            this.target.canvas = canvasFromSnapshot(step.snapshot);
        }
        // Cells touched before any snapshot was taken, in its coordinates
        const canvas = this.target.canvas;
        const recs = step.cells;
        for (let i = 0; i < recs.length; i += RECORD_SIZE) {
            const x = recs[i], y = recs[i + 1];
            if (x >= canvas.width || y >= canvas.height) continue;
            if (!step.snapshot) pushRecord(inverse.cells, x, y, canvas.cells[y][x]);
            canvas.cells[y][x] = cellFromRecord(recs, i);
            change.cells.push({ x, y });
        }

        to.push(inverse);
        this.trim();
        this.groupOpen = false;
        this.changed();
        return change;
    }

    changed() {
        if (this.onChange) this.onChange();
    }
}
