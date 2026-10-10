// Cell manipulation utilities — pure JS, no server dependency

// Terminal-default colours (the r/g/b values are only what the editor shows)
function defaultFG() {
    return { r: 255, g: 255, b: 255, default: true };
}

function defaultBG() {
    return { r: 0, g: 0, b: 0, default: true };
}

// A cell: what it shows (subpixels, or a character), its colours, and its
// text style: bold, and inverse (fg and bg swapped as the terminal shows it,
// which follows the terminal's own colours where they are "default")
function createCell() {
    return {
        type: 'block',
        fg: defaultFG(),
        bg: defaultBG(),
        subpixels: patternToSubpixels(0),
        charCode: 0,
        bold: false,
        inverse: false
    };
}

// An empty block cell, `rows` subpixels high
function clearCell(cell, rows = 3) {
    cell.type = 'block';
    cell.subpixels = patternToSubpixels(0, rows);
    cell.charCode = 0;
}

function isDiagonalChar(code) {
    return code >= 0x1FB3C && code <= 0x1FB67;
}

function isTriangleChar(code) {
    return code >= 0x1FB68 && code <= 0x1FB6F;
}

// Set or clear subpixel (row, col) of a block cell `rows` subpixels high:
// another resolution is converted first (best effort) unless that subpixel
// already is so, a character cell becomes an empty block cell
function setCellSubpixel(cell, row, col, filled, rows = 3) {
    if (cell.type !== 'block') {
        clearCell(cell, rows);
    } else if (cellSubpixelAt(cell, row, col, rows) === filled) {
        return;
    } else if (cell.subpixels.length !== rows) {
        cell.subpixels = resampleSubpixels(cell.subpixels, rows);
    }
    cell.subpixels[row][col] = filled;
}

// Whether a block cell's area at subpixel (row, col) of a `rows`-high grid
// is set (read at that resolution, best effort, if the cell has another)
function cellSubpixelAt(cell, row, col, rows = 3) {
    if (cell.type !== 'block') return false;
    return cell.subpixels.length === rows ? cell.subpixels[row][col] : resampleSubpixels(cell.subpixels, rows)[row][col];
}

// Set a cell from a character. Block chars (quadrants, sextants, octants and
// space) become block cells, so they stay editable with the draw tools.
function setCellChar(cell, charCode) {
    const block = charToBlock(charCode || 32);
    if (block) {
        clearCell(cell);
        cell.subpixels = block;
        return;
    }
    if (isDiagonalChar(charCode)) {
        cell.type = 'diagonal';
    } else if (isTriangleChar(charCode)) {
        cell.type = 'triangle';
    } else {
        cell.type = 'custom';
    }
    cell.charCode = charCode;
    cell.subpixels = patternToSubpixels(0);
}

// --- Wide characters ---
//
// A wide char (charWidth 2: CJK, most emoji) takes two terminal columns, so it
// occupies two cells: its own ("head", a normal 'custom' cell) and the cell to
// its right, a 'wide-tail' continuation that displays and exports nothing.
// Invariant: every wide head is directly followed by its tail and every tail
// directly follows its head. Writes that could break this go through the
// grid helpers below instead of setCellChar.

function isWideHead(cell) {
    return cell.type === 'custom' && charWidth(cell.charCode) === 2;
}

function makeWideTail(cell) {
    clearCell(cell);
    cell.type = 'wide-tail';
}

// If (x, y) is half of a wide char, blank the other half. Call before
// overwriting a cell in any way.
function detachWide(cells, x, y) {
    const row = cells[y];
    if (row[x].type === 'wide-tail') {
        if (x > 0) clearCell(row[x - 1]);
    } else if (isWideHead(row[x]) && x + 1 < row.length) {
        clearCell(row[x + 1]);
    }
}

// Give the wide head just written at (x, y) its tail. A wide char in the last
// column doesn't fit and becomes a blank cell instead.
function claimWideTail(cells, x, y) {
    const row = cells[y];
    if (x + 1 >= row.length) {
        clearCell(row[x]);
        return;
    }
    detachWide(cells, x + 1, y);
    const tail = row[x + 1];
    makeWideTail(tail);
    tail.fg = { ...row[x].fg };
    tail.bg = { ...row[x].bg };
    tail.bold = !!row[x].bold;
    tail.inverse = !!row[x].inverse;
}

// Set cell (x, y) to a character, keeping wide chars consistent
function setGridChar(cells, x, y, charCode) {
    detachWide(cells, x, y);
    const cell = cells[y][x];
    setCellChar(cell, charCode);
    if (isWideHead(cell)) claimWideTail(cells, x, y);
}

// Write a copy of `src` into (x, y), keeping wide chars consistent. A tail
// whose head wasn't copied along with it becomes a blank cell.
function placeCell(cells, x, y, src) {
    // Colours marked `keep` (an image's edge cells, text pasted with keep
    // colours) are the ones there
    const fg = src.fg.keep ? { ...cells[y][x].fg } : null;
    const bg = src.bg.keep ? { ...cells[y][x].bg } : null;
    detachWide(cells, x, y);
    const cell = structuredClone(src);
    if (fg) cell.fg = fg;
    if (bg) cell.bg = bg;
    if (cell.type === 'wide-tail') clearCell(cell);
    cells[y][x] = cell;
    if (isWideHead(cell)) claimWideTail(cells, x, y);
}

// Build a row of cells from { code, fg, bg } chars: a cell per char plus a
// tail after each wide char. Zero-width chars (combining marks left over after
// NFC normalisation, variation selectors, ZWJ) have no cell and are dropped.
function charsToRow(chars) {
    const row = [];
    for (const { code, fg, bg, bold, inverse } of chars) {
        if (charWidth(code) === 0) continue;
        const cell = createCell();
        cell.fg = { ...fg };
        cell.bg = { ...bg };
        cell.bold = !!bold;
        cell.inverse = !!inverse;
        setCellChar(cell, code);
        row.push(cell);
        if (isWideHead(cell)) {
            const tail = structuredClone(cell);
            makeWideTail(tail);
            row.push(tail);
        }
    }
    return row;
}

function createCanvas(width, height) {
    const cells = [];
    for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
            row.push(createCell());
        }
        cells.push(row);
    }
    return { width, height, cells };
}

function resizeCanvas(canvas, newWidth, newHeight) {
    const cells = [];
    for (let y = 0; y < newHeight; y++) {
        const row = [];
        for (let x = 0; x < newWidth; x++) {
            if (y < canvas.height && x < canvas.width) {
                row.push(canvas.cells[y][x]);
            } else {
                row.push(createCell());
            }
        }
        // A wide char cut off at the new right edge no longer fits
        if (isWideHead(row[newWidth - 1])) clearCell(row[newWidth - 1]);
        cells.push(row);
    }
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.cells = cells;
}

// Empty every cell, back to the default colours (an empty cell's background
// would otherwise still show)
function clearCanvas(canvas) {
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            canvas.cells[y][x] = createCell();
        }
    }
}

// A colour that leaves the cell's own: "keep" ink or paper (r, g, b as the
// terminal's own, for code that needs some colour, e.g. a mono image)
function keepColor(which) {
    return { ...(which === 'fg' ? defaultFG() : defaultBG()), keep: true };
}

// Whether giving a cell `color` would leave its `own` colour as it is
function colorKeeps(own, color) {
    return color.keep || colorsEqual(own, color);
}

function colorsEqual(a, b) {
    if (a.default !== b.default) return false;
    if (a.default) return true;
    return a.r === b.r && a.g === b.g && a.b === b.b;
}

// The character a cell displays ('' for a wide char's tail: the head's
// character already covers both columns)
function cellToChar(cell) {
    if (cell.type === 'wide-tail') return '';
    if (cell.type === 'block') {
        return blockToChar(cell.subpixels);
    }
    return cell.charCode ? String.fromCodePoint(cell.charCode) : ' ';
}

// SGR escape that sets the foreground (or background) to `color`
// The SGR parameters for a colour as fg or bg
function sgrColorParams(color, isBg) {
    if (color.default) return isBg ? '49' : '39';
    return `${isBg ? 48 : 38};2;${color.r};${color.g};${color.b}`;
}

// Cells in a row up to its last one that isn't an all-default blank:
// trailing ones are left out of exports (opening the file gives them back),
// so lines don't wrap in terminals narrower than the canvas
function visibleLength(row) {
    const blank = (c) => cellToChar(c) === ' ' && c.fg.default && c.bg.default && !c.bold && !c.inverse;
    let n = row.length;
    while (n > 0 && blank(row[n - 1])) n--;
    return n;
}

const SGR_DEFAULT = { fg: defaultFG(), bg: defaultBG(), bold: false, inverse: false };

// The shortest SGR sequence ('' if none) that takes the terminal from
// `state` to a cell's colours and style: the changes, or a reset and what
// isn't the default
function sgrTo(state, cell) {
    const params = (from) => {
        const p = [];
        if (cell.bold !== from.bold) p.push(cell.bold ? '1' : '22');
        if (cell.inverse !== from.inverse) p.push(cell.inverse ? '7' : '27');
        if (!colorsEqual(cell.fg, from.fg)) p.push(sgrColorParams(cell.fg, false));
        if (!colorsEqual(cell.bg, from.bg)) p.push(sgrColorParams(cell.bg, true));
        return p;
    };
    const change = params(state);
    if (!change.length) return '';
    // A plain reset is ESC[m
    const reset = params(SGR_DEFAULT), viaReset = reset.length ? ['0', ...reset] : [''];
    return `\x1b[${(viaReset.join(';').length < change.join(';').length ? viaReset : change).join(';')}m`;
}

// The canvas as ANSI text, keeping every cell's colours and style exactly
// (opening it gives the same cells back), as short as that allows: SGR
// only where they change, combined into one sequence, and a reset at the
// end of a line only when it doesn't end in the defaults
function canvasToANSI(canvas) {
    const lines = [];
    for (let y = 0; y < canvas.height; y++) {
        const row = canvas.cells[y], length = visibleLength(row);
        let line = '', state = SGR_DEFAULT;
        for (let x = 0; x < length; x++) {
            const cell = row[x];
            if (cell.type === 'wide-tail') continue;
            const now = { fg: cell.fg, bg: cell.bg, bold: !!cell.bold, inverse: !!cell.inverse };
            line += sgrTo(state, now) + cellToChar(cell);
            state = now;
        }
        const plain = !state.bold && !state.inverse && state.fg.default && state.bg.default;
        lines.push(plain ? line : line + '\x1b[m');
    }
    return lines.join('\n') + '\n';
}

function canvasToPlain(canvas) {
    return canvas.cells.map(row => row.map(cellToChar).join('').trimEnd()).join('\n') + '\n';
}

function parseTextToCells(text, fgColor, bgColor, bold = false, inverse = false) {
    // NFC composes e.g. e + U+0301 into é, which fits in one cell
    text = text.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let lines = text.split('\n');

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    return lines.map(line => charsToRow(
        Array.from(line, ch => ({ code: ch.codePointAt(0), fg: fgColor, bg: bgColor, bold, inverse }))
    ));
}
