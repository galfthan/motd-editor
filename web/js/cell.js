// Cell manipulation utilities — pure JS, no server dependency

function createCell() {
    return {
        type: 'sextant',
        fg: { r: 255, g: 255, b: 255, default: true },
        bg: { r: 0, g: 0, b: 0, default: true },
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

function setCellChar(cell, charCode) {
    if (charCode === 32 || charCode === 0) {
        clearCell(cell);
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

function canvasToANSI(canvas, cellToCharFn) {
    const lines = [];
    const defaultColor = { r: 0, g: 0, b: 0, default: true };

    for (let y = 0; y < canvas.height; y++) {
        let line = '';
        let lastFG = { ...defaultColor };
        let lastBG = { ...defaultColor };
        let lineHasColor = false;

        for (let x = 0; x < canvas.width; x++) {
            const cell = canvas.cells[y][x];
            const ch = cellToCharFn(cell);

            if (ch === ' ') {
                if (cell.bg.default) {
                    line += ' ';
                    continue;
                }
                if (!colorsEqual(cell.bg, lastBG)) {
                    line += `\x1b[48;2;${cell.bg.r};${cell.bg.g};${cell.bg.b}m`;
                    lastBG = cell.bg;
                    lineHasColor = true;
                }
                line += ' ';
                continue;
            }

            if (!colorsEqual(cell.fg, lastFG)) {
                if (cell.fg.default) {
                    line += '\x1b[39m';
                } else {
                    line += `\x1b[38;2;${cell.fg.r};${cell.fg.g};${cell.fg.b}m`;
                }
                lastFG = cell.fg;
                lineHasColor = true;
            }
            if (!colorsEqual(cell.bg, lastBG)) {
                if (cell.bg.default) {
                    line += '\x1b[49m';
                } else {
                    line += `\x1b[48;2;${cell.bg.r};${cell.bg.g};${cell.bg.b}m`;
                }
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

function canvasToPlain(canvas, cellToCharFn) {
    const lines = [];
    for (let y = 0; y < canvas.height; y++) {
        let line = '';
        for (let x = 0; x < canvas.width; x++) {
            line += cellToCharFn(canvas.cells[y][x]);
        }
        lines.push(line);
    }
    return lines.join('\n') + '\n';
}

function parseTextToCells(text, fgColor, bgColor) {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let lines = text.split('\n');

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }

    if (lines.length === 0) return [];

    const cells = [];
    for (const line of lines) {
        const runes = Array.from(line);
        const row = [];
        for (const ch of runes) {
            const cell = createCell();
            cell.fg = { ...fgColor };
            cell.bg = { ...bgColor };
            const code = ch.codePointAt(0);
            if (code === 32) {
                // already empty
            } else {
                setCellChar(cell, code);
            }
            row.push(cell);
        }
        cells.push(row);
    }
    return cells;
}
