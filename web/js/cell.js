// Cell manipulation utilities — pure JS, no server dependency

// Terminal-default colours (the r/g/b values are only what the editor shows)
function defaultFG() {
    return { r: 255, g: 255, b: 255, default: true };
}

function defaultBG() {
    return { r: 0, g: 0, b: 0, default: true };
}

function createCell() {
    return {
        type: 'sextant',
        fg: defaultFG(),
        bg: defaultBG(),
        subpixels: [[false, false], [false, false], [false, false]],
        charCode: 0
    };
}

function clearCell(cell) {
    cell.type = 'sextant';
    cell.subpixels = [[false, false], [false, false], [false, false]];
    cell.charCode = 0;
}

function isDiagonalChar(code) {
    return code >= 0x1FB3C && code <= 0x1FB67;
}

function isTriangleChar(code) {
    return code >= 0x1FB68 && code <= 0x1FB6F;
}

function setCellSubpixel(cell, row, col, filled) {
    if (cell.type !== 'sextant') {
        cell.type = 'sextant';
        cell.charCode = 0;
        cell.subpixels = [[false, false], [false, false], [false, false]];
    }
    cell.subpixels[row][col] = filled;
}

// Set a cell from a character. Sextant/block chars (and space) become sextant
// cells, so they stay editable with the draw tools.
function setCellChar(cell, charCode) {
    const sextant = runeToSextantPattern(charCode || 32);
    if (sextant.ok) {
        clearCell(cell);
        cell.subpixels = patternToSubpixels(sextant.pattern);
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
    cell.subpixels = [[false, false], [false, false], [false, false]];
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
    return { width, height, cells, mode: 'sextant' };
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
        cells.push(row);
    }
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.cells = cells;
}

function clearCanvas(canvas) {
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            clearCell(canvas.cells[y][x]);
        }
    }
}

function colorsEqual(a, b) {
    if (a.default !== b.default) return false;
    if (a.default) return true;
    return a.r === b.r && a.g === b.g && a.b === b.b;
}

// The character a cell displays
function cellToChar(cell) {
    if (cell.type === 'sextant') {
        return sextantPatternToChar(subpixelsToPattern(cell.subpixels));
    }
    return cell.charCode ? String.fromCodePoint(cell.charCode) : ' ';
}

// SGR escape that sets the foreground (or background) to `color`
function sgrColor(color, isBg) {
    if (color.default) return isBg ? '\x1b[49m' : '\x1b[39m';
    return `\x1b[${isBg ? 48 : 38};2;${color.r};${color.g};${color.b}m`;
}

function canvasToANSI(canvas) {
    const lines = [];

    for (let y = 0; y < canvas.height; y++) {
        let line = '';
        let lastFG = defaultFG();
        let lastBG = defaultBG();
        let lineHasColor = false;

        for (let x = 0; x < canvas.width; x++) {
            const cell = canvas.cells[y][x];
            const ch = cellToChar(cell);

            // A space shows only its background, so leave the foreground alone
            if (ch !== ' ' && !colorsEqual(cell.fg, lastFG)) {
                line += sgrColor(cell.fg, false);
                lastFG = cell.fg;
                lineHasColor = true;
            }
            if (!colorsEqual(cell.bg, lastBG)) {
                line += sgrColor(cell.bg, true);
                lastBG = cell.bg;
                lineHasColor = true;
            }
            line += ch;
        }
        if (lineHasColor) {
            line += '\x1b[0m';
        }
        lines.push(line);
    }

    return lines.join('\n') + '\n';
}

function canvasToPlain(canvas) {
    return canvas.cells.map(row => row.map(cellToChar).join('')).join('\n') + '\n';
}

function parseTextToCells(text, fgColor, bgColor) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let lines = text.split('\n');

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    return lines.map(line => Array.from(line, ch => {
        const cell = createCell();
        cell.fg = { ...fgColor };
        cell.bg = { ...bgColor };
        setCellChar(cell, ch.codePointAt(0));
        return cell;
    }));
}
