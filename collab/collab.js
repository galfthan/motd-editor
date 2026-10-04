// Collaborative AI mode. Only loaded when the editor is served by the local
// motd-editor server (main.go), never on the static site.
//
// Runs the operations an AI agent sends over MCP against the live editor,
// using the editor's own code, and posts the results back. Operations take
// the same arguments as the MCP tools (tools.go).

(() => {

const STYLES = { none: 0, light: 1, heavy: 2, double: 3, subpixel: SUBPIXEL_STYLE };
const FILLS = { none: 0, fill: 1, recolor: 2 };

// Operations that aren't an undo step of their own
const NO_STEP = new Set(['get_state', 'view_canvas', 'read_region', 'export', 'set_display', 'undo', 'redo']);

let r;          // the editor's CanvasRenderer
let panel;      // activity panel elements
let flashRects = [];

// --- Helpers ---

function lookup(table, key, what) {
    if (!(key in table)) throw new Error(`unknown ${what} "${key}": use ${Object.keys(table).join(', ')}`);
    return table[key];
}

function parseColor(value, fallback) {
    if (value === undefined || value === 'default') return fallback();
    if (value === 'keep') return { ...fallback(), keep: true };
    const m = /^#([0-9a-f]{6})$/i.exec(value);
    if (!m) throw new Error(`bad colour "${value}": use #rrggbb, default or keep`);
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, default: false };
}

function colorName(c) {
    if (c.keep) return 'keep';
    return c.default ? 'default' : '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Run fn with some renderer fields temporarily replaced, so editor methods
// written around the human's tool state (colours, drag, clipboard,
// selection) can be reused as they are without disturbing that state
function withState(state, fn) {
    const saved = {};
    for (const k in state) {
        saved[k] = r[k];
        r[k] = state[k];
    }
    try {
        return fn();
    } finally {
        Object.assign(r, saved);
    }
}

// The colours and text style an operation draws with
function colorState(a) {
    return { fgColor: parseColor(a.fg, defaultFG), bgColor: parseColor(a.bg, defaultBG), bold: !!a.bold, inverse: !!a.inverse };
}

// x, y, width, height (all optional) clipped to the canvas
function regionRect(a) {
    const x = a.x ?? 0, y = a.y ?? 0;
    const rect = r.clipRect({
        x1: x, y1: y,
        x2: a.width ? x + a.width - 1 : r.canvas.width - 1,
        y2: a.height ? y + a.height - 1 : r.canvas.height - 1
    });
    if (!rect) throw new Error('region is outside the canvas');
    return rect;
}

// x1, y1, x2, y2 normalised and clipped to the canvas (in cells or subpixels)
function argRect(a, subpixel = false) {
    const rect = r.clipRect(normRect({ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }), subpixel);
    if (!rect) throw new Error('rectangle is outside the canvas');
    return rect;
}

function checkCell(x, y) {
    if (!(x >= 0 && x < r.canvas.width && y >= 0 && y < r.canvas.height)) {
        throw new Error(`cell (${x}, ${y}) is outside the ${r.canvas.width}x${r.canvas.height} canvas`);
    }
}

function checkSubpixel(sx, sy) {
    if (!(sx >= 0 && sx < r.canvas.width * 2 && sy >= 0 && sy < r.canvas.height * 3)) {
        throw new Error(`subpixel (${sx}, ${sy}) is outside the ${r.canvas.width * 2}x${r.canvas.height * 3} subpixel canvas`);
    }
}

function subpixelToCells(s) {
    return { x1: Math.floor(s.x1 / 2), y1: Math.floor(s.y1 / 3), x2: Math.floor(s.x2 / 2), y2: Math.floor(s.y2 / 3) };
}

// Highlight cells the agent changed, briefly
function flash(rect) {
    const c = rect && r.clipRect(rect);
    if (c) flashRects.push(c);
}

// Shown as elements in the editor's overlay layer (which a re-render
// replaces, taking them along)
function showFlash() {
    if (flashRects.length === 0) return;
    const els = flashRects.map(c => {
        const el = document.createElement('div');
        el.className = 'ai-flash';
        el.style.cssText = `left:${c.x1 * CELL_W}px;top:${c.y1 * CELL_H}px;` +
            `width:${(c.x2 - c.x1 + 1) * CELL_W}px;height:${(c.y2 - c.y1 + 1) * CELL_H}px`;
        r.overlayLayer.appendChild(el);
        return el;
    });
    flashRects = [];
    setTimeout(() => els.forEach(el => el.remove()), 800);
}

// Set or clear subpixels ({ x, y, filled } in subpixel coords, off-canvas
// ones skipped), repainting each touched cell once
function paintSubpixels(points) {
    const changed = new Map();
    for (const p of points) {
        if (!r.subpixelAt(p.x, p.y)) continue;
        const sp = r.paintSubpixel(p.x, p.y, p.filled);
        if (sp) changed.set(`${sp.cellX},${sp.cellY}`, sp);
    }
    for (const { cellX, cellY } of changed.values()) {
        r.updateCell(cellX, cellY);
        flash({ x1: cellX, y1: cellY, x2: cellX, y2: cellY });
    }
}

function checkAspect(aspect) {
    if (!isCellAspect(aspect)) throw new Error(`cell_aspect must be ${CELL_ASPECT_RANGE.join('-')} (cell width / height)`);
    return aspect;
}

function displayState() {
    return {
        grid: r.showGrid,
        light_terminal: r.lightTerminal,
        cell_aspect: +r.cellAspect.toFixed(4),
        cell_px: { width: +CELL_W.toFixed(2), height: CELL_H }
    };
}

function setSize(a) {
    if (!(a.width >= 1 && a.width <= 500 && a.height >= 1 && a.height <= 200)) {
        throw new Error('size must be 1-500 x 1-200 cells');
    }
}

// --- Rendering for view_canvas ---

// A PNG (base64) of the cells in `rect`, drawn by the editor's own code
// with the grid and terminal colours asked for, `scale` image px per CSS px,
// with optional rulers and a line every 10th cell
function renderPNG(rect, scale, rulers, grid, light) {
    const cells = [];
    for (let y = rect.y1; y <= rect.y2; y++) {
        const row = r.canvas.cells[y];
        for (let x = rect.x1; x <= rect.x2; x++) {
            // A wide char is drawn from its head, also when only its tail is in view
            if (row[x].type === 'wide-tail') {
                if (x === rect.x1 && x > 0) cells.push({ x: x - 1, y, cell: row[x - 1] });
                continue;
            }
            cells.push({ x, y, cell: row[x] });
        }
    }
    // The terminal colours come from the canvas's CSS class (see
    // CanvasRenderer.setLightTerminal); switch it just while drawing
    const shown = { showGrid: r.showGrid, light: r.lightTerminal };
    r.showGrid = grid;
    r.container.classList.toggle('light-terminal', light);
    r.readTheme();
    let src;
    try {
        // At the output's scale, not the editor's zoom
        src = withState({ _scaleX: scale, _scaleY: scale }, () => r.drawCellsImage(cells, rect, undefined, true).image);
    } finally {
        r.showGrid = shown.showGrid;
        r.container.classList.toggle('light-terminal', shown.light);
        r.readTheme();
    }

    const x0 = rect.x1 * CELL_W, y0 = rect.y1 * CELL_H;
    const w = (rect.x2 - rect.x1 + 1) * CELL_W, h = (rect.y2 - rect.y1 + 1) * CELL_H;
    const ml = rulers ? 24 : 0, mt = rulers ? 14 : 0;
    const out = document.createElement('canvas');
    out.width = ml + Math.round(w * scale);
    out.height = mt + Math.round(h * scale);
    const g = out.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, ml, mt);

    if (rulers) {
        g.font = '10px monospace';
        g.textBaseline = 'top';
        for (let x = rect.x1; x <= rect.x2; x++) {
            if (x % 10) continue;
            const px = ml + Math.round((x * CELL_W - x0) * scale);
            g.fillStyle = '#999';
            g.fillText(x, px + 1, 2);
            g.fillStyle = 'rgba(74,158,255,0.6)';
            g.fillRect(px, mt, 1, out.height - mt);
        }
        for (let y = rect.y1; y <= rect.y2; y++) {
            if (y % 10) continue;
            const py = mt + Math.round((y * CELL_H - y0) * scale);
            g.fillStyle = '#999';
            g.fillText(y, 1, py + 1);
            g.fillStyle = 'rgba(74,158,255,0.6)';
            g.fillRect(ml, py, out.width - ml, 1);
        }
    }
    return out.toDataURL('image/png').split(',')[1];
}

// --- Operations (one per MCP tool, see tools.go) ---

const OPS = {
    get_state() {
        return {
            width: r.canvas.width,
            height: r.canvas.height,
            subpixel_width: r.canvas.width * 2,
            subpixel_height: r.canvas.height * 3,
            user: {
                tool: r.tool,
                fg: colorName(r.fgColor),
                bg: colorName(r.bgColor),
                bold: r.bold,
                inverse: r.inverse,
                selection: r.selection,
                subpixel_selection: r.subpixelSelection,
                text_cursor: r.textCursor,
                note: panel.note.value
            },
            display: displayState()
        };
    },

    // Through the toolbar, so its controls show it; not remembered, so the
    // user's own saved choices stay as they were
    set_display(a) {
        // Absent or null: leave as is
        if (a.cell_aspect != null) toolbar.setCellAspect(checkAspect(a.cell_aspect), false);
        if (a.grid != null && a.grid !== r.showGrid) toolbar.toggleGrid(false);
        if (a.light_terminal != null && a.light_terminal !== r.lightTerminal) toolbar.toggleLightTerminal(false);
        return displayState();
    },

    view_canvas(a) {
        const rect = regionRect(a);
        const rulers = !a.no_rulers;
        const grid = a.grid ?? r.showGrid;
        const light = a.light_terminal ?? r.lightTerminal;
        const aspect = a.cell_aspect == null ? r.cellAspect : checkAspect(a.cell_aspect);
        // A one-off aspect only while drawing (the editor's cells keep theirs)
        setCellWidthForAspect(aspect);
        try {
            const w = (rect.x2 - rect.x1 + 1) * CELL_W, h = (rect.y2 - rect.y1 + 1) * CELL_H;
            // Keep the image within about 1600px on its longer side
            const scale = Math.min((a.cell_px || CELL_W) / CELL_W, 1600 / Math.max(w, h));
            return {
                image: renderPNG(rect, scale, rulers, grid, light),
                info: `Cells x ${rect.x1}-${rect.x2}, y ${rect.y1}-${rect.y2}, ` +
                    `${(CELL_W * scale).toFixed(1)}x${(CELL_H * scale).toFixed(1)} px each (aspect ${aspect.toFixed(3)}), ` +
                    `${light ? 'light' : 'dark'} terminal${grid ? ', with cell grid' : ''}.` +
                    (rulers ? ' Rulers and blue lines mark every 10th cell.' : '')
            };
        } finally {
            setCellWidthForAspect(r.cellAspect);
        }
    },

    read_region(a) {
        const { x1, y1, x2, y2 } = regionRect(a);
        const rows = r.canvas.cells.slice(y1, y2 + 1).map(row => row.slice(x1, x2 + 1));
        switch (a.format || 'text') {
            case 'text': {
                // Trailing spaces dropped, as in the export
                const text = rows.map(row => row.map(cellToChar).join('').trimEnd()).join('\n');
                return text.trim() ? text : `(${rows.length} blank rows)`;
            }
            case 'subpixels':
                return rows.flatMap(row => [0, 1, 2].map(sr => row.map(cell =>
                    cell.type === 'sextant' ? cell.subpixels[sr].map(on => on ? '#' : '.').join('') : '++'
                ).join(''))).join('\n');
            case 'cells': {
                const out = [];
                rows.forEach((row, dy) => row.forEach((cell, dx) => {
                    const char = cellToChar(cell);
                    if (char === '' || (char === ' ' && cell.bg.default && !cell.inverse)) return;
                    const item = { x: x1 + dx, y: y1 + dy, char, fg: colorName(cell.fg), bg: colorName(cell.bg) };
                    if (cell.bold) item.bold = true;
                    if (cell.inverse) item.inverse = true;
                    out.push(item);
                }));
                return out;
            }
        }
        throw new Error(`unknown format "${a.format}": use text, subpixels or cells`);
    },

    draw_bitmap(a) {
        const points = [];
        a.rows.forEach((line, dy) => [...line].forEach((c, dx) => {
            if (c !== ' ') points.push({ x: a.sx + dx, y: a.sy + dy, filled: c !== '.' });
        }));
        withState(colorState(a), () => paintSubpixels(points));
    },

    draw_strokes(a) {
        const points = [];
        for (const stroke of a.strokes) {
            stroke.forEach(([x, y], i) => {
                const path = i ? linePoints(stroke[i - 1][0], stroke[i - 1][1], x, y).slice(1) : [{ x, y }];
                for (const p of path) points.push({ ...p, filled: !a.erase });
            });
        }
        withState(colorState(a), () => paintSubpixels(points));
    },

    place_symbols(a) {
        withState(colorState(a), () => {
            for (const { x, y, char } of a.items) {
                checkCell(x, y);
                // One character; zero-width ones after it (a variation
                // selector) have no cell and are dropped
                const [code, ...rest] = [...char].map(c => c.codePointAt(0));
                if (code === undefined || rest.some(c => charWidth(c) !== 0)) {
                    throw new Error(`char must be one character, not "${char}"`);
                }
                if (charWidth(code) === 2 && x === r.canvas.width - 1) {
                    throw new Error(`"${char}" is two cells wide and doesn't fit at x ${x}, the last column`);
                }
                r.setTextCell(x, y, code);
                flash({ x1: x, y1: y, x2: x + 1, y2: y });
            }
        });
    },

    write_text(a) {
        withState(colorState(a), () => {
            a.text.normalize('NFC').split('\n').forEach((line, dy) => {
                const y = a.y + dy;
                if (y < 0 || y >= r.canvas.height) return;
                let x = a.x;
                for (const ch of line) {
                    const code = ch.codePointAt(0);
                    const w = charWidth(code);
                    if (w === 0) continue;
                    if (x + w > r.canvas.width) break;
                    if (x >= 0) r.setTextCell(x, y, code);
                    x += w;
                }
                flash({ x1: a.x, y1: y, x2: x - 1, y2: y });
            });
        });
    },

    draw_box(a) {
        // Not clipped: the parts past the edges are left out. With the
        // subpixel style the coordinates are subpixels.
        const subpixel = a.style === 'subpixel';
        const rect = normRect({ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 });
        if (!r.clipRect(rect, subpixel)) throw new Error('rectangle is outside the canvas');
        withState({
            ...colorState(a),
            dragStart: { x: rect.x1, y: rect.y1 },
            dragEnd: { x: rect.x2, y: rect.y2 },
            boxLineStyle: lookup(STYLES, a.style || 'light', 'style'),
            boxFillMode: lookup(FILLS, a.fill || 'none', 'fill')
        }, () => r.commitBox());
        flash(subpixel ? subpixelToCells(rect) : rect);
    },

    draw_line(a) {
        if (a.style === 'none') throw new Error('a line needs a style: light, heavy, double or subpixel');
        const subpixel = a.style === 'subpixel';
        for (const [x, y] of [[a.x1, a.y1], [a.x2, a.y2]]) {
            if (subpixel) checkSubpixel(x, y);
            else checkCell(x, y);
        }
        withState({
            ...colorState(a),
            dragStart: { x: a.x1, y: a.y1 },
            dragEnd: { x: a.x2, y: a.y2 },
            boxLineStyle: lookup(STYLES, a.style || 'light', 'style')
        }, () => r.commitLine());
        const rect = normRect({ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 });
        flash(subpixel ? subpixelToCells(rect) : rect);
    },

    fill(a) {
        checkSubpixel(a.sx, a.sy);
        const mode = a.mode || 'ink';
        if (!['ink', 'paper', 'both'].includes(mode)) throw new Error(`unknown mode "${mode}": use ink, paper or both`);
        const { count, rect } = withState(colorState(a), () => r.fillAt(a.sx, a.sy, mode));
        if (!count) return `nothing was filled: (${a.sx}, ${a.sy}) is in a character cell, or the colour it would use is keep`;
        flash(rect);
        return `filled ${count} subpixels`;
    },

    copy_region(a) {
        const src = argRect(a, a.subpixel);
        const dest = {
            x1: a.to_x, y1: a.to_y,
            x2: a.to_x + src.x2 - src.x1, y2: a.to_y + src.y2 - src.y1
        };
        if (a.subpixel) {
            withState({ subpixelSelection: src, subpixelSelectionStart: null, subpixelClipboard: null, pasteMode: false }, () => {
                if (a.move) r.cutSelectionSubpixel();
                else r.copySelectionSubpixel();
                r.pasteAtSubpixel(a.to_x, a.to_y);
            });
            flash(subpixelToCells(src));
            flash(subpixelToCells(dest));
            return;
        }
        const clipboard = r.canvas.cells.slice(src.y1, src.y2 + 1)
            .map(row => structuredClone(row.slice(src.x1, src.x2 + 1)));
        if (a.move) {
            r.beforeChange(src.x1, src.y1, src.x2, src.y2);
            for (let y = src.y1; y <= src.y2; y++) {
                for (let x = src.x1; x <= src.x2; x++) {
                    detachWide(r.canvas.cells, x, y);
                    r.canvas.cells[y][x] = createCell();
                }
            }
            r.updateCellRect(src.x1, src.y1, src.x2, src.y2);
        }
        withState({ clipboard, pasteMode: false }, () => r.pasteAt(a.to_x, a.to_y));
        flash(src);
        flash(dest);
    },

    import_ansi(a) {
        const parsed = parseANSIText(a.text);
        if (a.replace) {
            r.setCanvas(parsed);
            return `canvas is now ${parsed.width}x${parsed.height}`;
        }
        const x = a.x ?? 0, y = a.y ?? 0;
        withState({ clipboard: parsed.cells, pasteMode: false }, () => r.pasteAt(x, y));
        flash({ x1: x, y1: y, x2: x + parsed.width - 1, y2: y + parsed.height - 1 });
    },

    // a.image: decoded from a.data (see prepare)
    import_image(a) {
        const { image } = a;
        const x = a.x ?? 0, y = a.y ?? 0;
        checkCell(x, y);
        if (a.width < 0 || a.height < 0) throw new Error('width and height must be positive');
        if (!Object.hasOwn(IMAGE_DITHERS, a.dither || 'floyd-steinberg')) {
            throw new Error(`unknown dither "${a.dither}": use ${Object.keys(IMAGE_DITHERS).join(', ')}`);
        }
        let cols = a.width, rows = a.height;
        if (!cols && !rows) cols = fitImageCols(image, r.cellAspect, r.canvas.width - x, r.canvas.height - y);
        cols ||= Math.max(1, Math.round(rows * image.width / (image.height * r.cellAspect)));
        rows ||= imageRows(image, cols, r.cellAspect);
        if (cols > 500 || rows > 200) throw new Error('the image can be at most 500x200 cells');
        const tone = {};
        for (const name of ['brightness', 'contrast', 'midtones']) {
            const v = a[name] ?? 0;
            if (!(v >= -100 && v <= 100)) throw new Error(`${name} must be -100 to 100`);
            tone[name] = v;
        }
        const strength = a.dither_strength ?? 100;
        if (!(strength >= 0 && strength <= 100)) throw new Error('dither_strength must be 0-100');
        const cells = imageToCells(image, cols, rows, {
            mono: a.mono, fg: parseColor(a.fg, defaultFG), bg: parseColor(a.bg, defaultBG), dither: a.dither || 'floyd-steinberg',
            strength: strength / 100, invert: !!a.invert, ...tone
        });
        withState({ clipboard: cells, pasteMode: false }, () => r.pasteAt(x, y));
        flash({ x1: x, y1: y, x2: x + cols - 1, y2: y + rows - 1 });
        return `placed the image as ${cols}x${rows} cells at (${x}, ${y})`;
    },

    export(a) {
        const format = a.format || 'ansi';
        if (format === 'ansi') return canvasToANSI(r.canvas);
        if (format === 'plain') return canvasToPlain(r.canvas);
        throw new Error(`unknown format "${format}": use ansi or plain`);
    },

    resize_canvas(a) {
        setSize(a);
        r.resize(a.width, a.height);
    },

    new_canvas(a) {
        setSize(a);
        r.createNew(a.width, a.height);
    },

    undo() {
        if (!r.history.canUndo()) throw new Error('nothing to undo');
        r.undo();
    },

    redo() {
        if (!r.history.canRedo()) throw new Error('nothing to redo');
        r.redo();
    },

    batch(a) {
        const results = [];
        if (!Array.isArray(a.ops)) throw new Error('ops must be a list of {op, args}');
        // Every op is checked before any runs
        for (const [i, { op }] of a.ops.entries()) {
            if (!Object.hasOwn(OPS, op)) throw new Error(`ops[${i}]: unknown operation "${op}"; nothing was changed`);
            if (['batch', 'view_canvas', 'undo', 'redo', 'import_image'].includes(op)) {
                throw new Error(`ops[${i}]: "${op}" can't be used in a batch; nothing was changed`);
            }
        }
        for (const [i, { op, args }] of a.ops.entries()) {
            try {
                results.push(OPS[op](args || {}) ?? 'ok');
            } catch (e) {
                throw new Error(`ops[${i}] (${op}): ${e.message}. Operations before it were applied.`);
            }
        }
        return results.every(res => res === 'ok') ? `ok (${results.length} ops)` : results;
    }
};

// Operations' asynchronous preparation, done before they run
async function prepare(op, args) {
    if (op !== 'import_image') return args;
    const blob = await (await fetch(args.data)).blob();
    try {
        return { ...args, image: await createImageBitmap(blob) };
    } catch (e) {
        throw new Error(`can't decode the image (${blob.type}): ${e.message}`);
    }
}

// Run one operation; each one that edits is one undo step. Operations are
// synchronous, so the user's own edits can't end up inside the step.
function run(op, args) {
    if (!Object.hasOwn(OPS, op)) throw new Error(`unknown operation "${op}"`);
    if (NO_STEP.has(op)) return OPS[op](args);
    return r.recordEdit(`AI ${op}`, () => OPS[op](args));
}

// --- Connection and activity panel ---

function log(op, args, reply, ms) {
    const li = document.createElement('li');
    const summary = JSON.stringify({ ...args, data: undefined });
    li.textContent = `${new Date().toLocaleTimeString()} ${op} ${summary.length > 90 ? summary.slice(0, 90) + '…' : summary} · ${ms.toFixed(0)} ms` +
        (reply.error ? ` · ${reply.error}` : '');
    li.classList.toggle('error', !!reply.error);
    panel.log.prepend(li);
    while (panel.log.children.length > 200) panel.log.lastChild.remove();
}

let queue = Promise.resolve();

async function handle(event) {
    const { id, op, args } = JSON.parse(event.data);
    const t0 = performance.now();
    let reply, a;
    try {
        a = await prepare(op, args || {});
        // An edit made while the user drags (mouse button down) would end up
        // in the user's undo step: wait for the button to come up
        while (!NO_STEP.has(op) && r.isDrawing) await new Promise(res => setTimeout(res, 50));
        reply = { id, result: run(op, a) ?? 'ok' };
    } catch (e) {
        reply = { id, error: e.message };
    } finally {
        if (a && a.image) a.image.close();
    }
    // Operations borrow the selection state, so redraw the user's overlays
    r.updateSelectionDisplay();
    r.updateSubpixelSelectionDisplay();
    showFlash();
    log(op, args, reply, performance.now() - t0);
    await fetch('result', { method: 'POST', body: JSON.stringify(reply) });
}

function setStatus(text, state) {
    panel.status.textContent = text;
    panel.status.dataset.state = state;
}

// The AI link goes to the tab that connected last. A tab that lost it to
// another takes it back when the user comes back to it (or clicks the
// status), also if that other tab has been closed meanwhile.
let replaced = false;

function connect() {
    replaced = false;
    const events = new EventSource('events');
    events.onopen = () => setStatus('AI link', 'on');
    events.onerror = () => setStatus('AI link: server offline', 'off');
    // One at a time, in order (replies are posted asynchronously); a failed
    // reply (e.g. the server just exited) mustn't stop the queue
    events.onmessage = (event) => { queue = queue.then(() => handle(event)).catch(() => {}); };
    events.addEventListener('replaced', () => {
        events.close();
        replaced = true;
        setStatus('AI link: in another tab (click to take over)', 'off');
    });
}

function createPanel() {
    const status = document.createElement('button');
    status.className = 'ai-status';
    document.querySelector('.menu-bar-right').prepend(status);

    const box = document.createElement('aside');
    box.className = 'ai-panel';
    box.innerHTML = `
        <textarea placeholder="Note to the AI (it can read this)"></textarea>
        <ol class="ai-log"></ol>`;
    document.body.appendChild(box);

    status.addEventListener('click', () => {
        if (replaced) connect();
        else box.classList.toggle('open');
    });
    window.addEventListener('focus', () => { if (replaced) connect(); });
    return { status, box, note: box.querySelector('textarea'), log: box.querySelector('ol') };
}

// After app.js, whose DOMContentLoaded handler creates the editor
document.addEventListener('DOMContentLoaded', () => {
    r = canvasRenderer;
    panel = createPanel();
    setStatus('AI link: connecting', 'off');
    connect();
});

})();
