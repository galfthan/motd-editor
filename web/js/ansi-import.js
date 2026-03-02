// ANSI text import — ported from internal/canvas/serialization.go

const BASIC_COLORS = [
    { r: 0, g: 0, b: 0 },         // Black
    { r: 170, g: 0, b: 0 },       // Red
    { r: 0, g: 170, b: 0 },       // Green
    { r: 170, g: 85, b: 0 },      // Yellow
    { r: 0, g: 0, b: 170 },       // Blue
    { r: 170, g: 0, b: 170 },     // Magenta
    { r: 0, g: 170, b: 170 },     // Cyan
    { r: 170, g: 170, b: 170 },   // White
];

const BRIGHT_COLORS = [
    { r: 85, g: 85, b: 85 },      // Bright Black (Gray)
    { r: 255, g: 85, b: 85 },     // Bright Red
    { r: 85, g: 255, b: 85 },     // Bright Green
    { r: 255, g: 255, b: 85 },    // Bright Yellow
    { r: 85, g: 85, b: 255 },     // Bright Blue
    { r: 255, g: 85, b: 255 },    // Bright Magenta
    { r: 85, g: 255, b: 255 },    // Bright Cyan
    { r: 255, g: 255, b: 255 },   // Bright White
];

function color256ToRGB(index) {
    if (index < 8) return { ...BASIC_COLORS[index], default: false };
    if (index < 16) return { ...BRIGHT_COLORS[index - 8], default: false };
    if (index < 232) {
        const i = index - 16;
        return {
            r: Math.floor(i / 36) % 6 * 51,
            g: Math.floor(i / 6) % 6 * 51,
            b: i % 6 * 51,
            default: false
        };
    }
    const gray = (index - 232) * 10 + 8;
    return { r: gray, g: gray, b: gray, default: false };
}

function defaultFG() {
    return { r: 255, g: 255, b: 255, default: true };
}

function defaultBG() {
    return { r: 0, g: 0, b: 0, default: true };
}

const ansiRegex = /\x1b\[([0-9;]*)m/g;

function parseLine(line) {
    const cells = [];
    let fg = defaultFG();
    let bg = defaultBG();
    let lastIndex = 0;

    ansiRegex.lastIndex = 0;
    let match;
    while ((match = ansiRegex.exec(line)) !== null) {
        // Process text before this escape
        if (match.index > lastIndex) {
            const text = line.slice(lastIndex, match.index);
            for (const ch of text) {
                cells.push({ char: ch.codePointAt(0), fg: { ...fg }, bg: { ...bg } });
            }
        }

        // Parse the SGR codes
        const codes = match[1];
        const result = parseCodes(codes, fg, bg);
        fg = result.fg;
        bg = result.bg;

        lastIndex = ansiRegex.lastIndex;
    }

    // Process remaining text after last escape
    if (lastIndex < line.length) {
        const text = line.slice(lastIndex);
        for (const ch of text) {
            cells.push({ char: ch.codePointAt(0), fg: { ...fg }, bg: { ...bg } });
        }
    }

    return cells;
}

function parseCodes(codes, fg, bg) {
    fg = { ...fg };
    bg = { ...bg };

    if (codes === '' || codes === '0') {
        return { fg: defaultFG(), bg: defaultBG() };
    }

    const parts = codes.split(';');
    let i = 0;
    while (i < parts.length) {
        const code = parseInt(parts[i], 10);
        if (isNaN(code)) { i++; continue; }

        switch (code) {
            case 0:
                fg = defaultFG();
                bg = defaultBG();
                break;
            case 39:
                fg = defaultFG();
                break;
            case 49:
                bg = defaultBG();
                break;
            case 38: // Extended FG
                if (i + 1 < parts.length) {
                    const mode = parseInt(parts[i + 1], 10);
                    if (mode === 2 && i + 4 < parts.length) {
                        fg = {
                            r: parseInt(parts[i + 2], 10) || 0,
                            g: parseInt(parts[i + 3], 10) || 0,
                            b: parseInt(parts[i + 4], 10) || 0,
                            default: false
                        };
                        i += 4;
                    } else if (mode === 5 && i + 2 < parts.length) {
                        fg = color256ToRGB(parseInt(parts[i + 2], 10) || 0);
                        i += 2;
                    }
                }
                break;
            case 48: // Extended BG
                if (i + 1 < parts.length) {
                    const mode = parseInt(parts[i + 1], 10);
                    if (mode === 2 && i + 4 < parts.length) {
                        bg = {
                            r: parseInt(parts[i + 2], 10) || 0,
                            g: parseInt(parts[i + 3], 10) || 0,
                            b: parseInt(parts[i + 4], 10) || 0,
                            default: false
                        };
                        i += 4;
                    } else if (mode === 5 && i + 2 < parts.length) {
                        bg = color256ToRGB(parseInt(parts[i + 2], 10) || 0);
                        i += 2;
                    }
                }
                break;
            default:
                if (code >= 30 && code <= 37) {
                    fg = { ...BASIC_COLORS[code - 30], default: false };
                } else if (code >= 40 && code <= 47) {
                    bg = { ...BASIC_COLORS[code - 40], default: false };
                } else if (code >= 90 && code <= 97) {
                    fg = { ...BRIGHT_COLORS[code - 90], default: false };
                } else if (code >= 100 && code <= 107) {
                    bg = { ...BRIGHT_COLORS[code - 100], default: false };
                }
                break;
        }
        i++;
    }

    return { fg, bg };
}

function parseANSIText(text) {
    let lines = text.split('\n');

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }

    if (lines.length === 0) {
        return createCanvas(1, 1);
    }

    const parsedLines = lines.map(line => parseLine(line));
    const maxWidth = Math.max(1, ...parsedLines.map(l => l.length));

    const canvas = createCanvas(maxWidth, parsedLines.length);

    for (let y = 0; y < parsedLines.length; y++) {
        for (let x = 0; x < parsedLines[y].length; x++) {
            const pc = parsedLines[y][x];
            const cell = canvas.cells[y][x];

            cell.fg = pc.fg;
            cell.bg = pc.bg;

            const code = pc.char;
            const sextant = runeToSextantPattern(code);
            if (sextant.ok) {
                cell.type = 'sextant';
                cell.subpixels = patternToSubpixels(sextant.pattern);
                cell.charCode = 0;
            } else if (isDiagonalChar(code)) {
                cell.type = 'diagonal';
                cell.charCode = code;
            } else if (isTriangleChar(code)) {
                cell.type = 'triangle';
                cell.charCode = code;
            } else if (code !== 32) {
                cell.type = 'custom';
                cell.charCode = code;
            }
        }
    }

    return canvas;
}
