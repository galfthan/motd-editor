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
        // xterm's 6x6x6 colour cube
        const level = (n) => n === 0 ? 0 : 55 + n * 40;
        const i = index - 16;
        return {
            r: level(Math.floor(i / 36) % 6),
            g: level(Math.floor(i / 6) % 6),
            b: level(i % 6),
            default: false
        };
    }
    const gray = (index - 232) * 10 + 8;
    return { r: gray, g: gray, b: gray, default: false };
}

// Any CSI sequence (params, intermediates, final byte). Only SGR ('m') is
// interpreted; cursor moves, erase-line, mode switches etc. are dropped.
const ansiRegex = /\x1b\[([0-?]*)([ -\/]*)([@-~])/g;

// SGR state: the colours and style text gets
function initialSGR() {
    return { fg: defaultFG(), bg: defaultBG(), bold: false, inverse: false };
}

function parseLine(line) {
    const cells = [];
    let state = initialSGR();
    let lastIndex = 0;
    const addText = (text) => {
        for (const ch of text) cells.push({ code: ch.codePointAt(0), ...state });
    };

    ansiRegex.lastIndex = 0;
    let match;
    while ((match = ansiRegex.exec(line)) !== null) {
        // Process text before this escape
        if (match.index > lastIndex) addText(line.slice(lastIndex, match.index));

        // Parse the SGR codes
        if (match[3] === 'm' && match[2] === '') state = parseCodes(match[1], state);

        lastIndex = ansiRegex.lastIndex;
    }

    // Process remaining text after last escape
    if (lastIndex < line.length) addText(line.slice(lastIndex));

    return cells;
}

// Parse the arguments of an extended colour code at parts[i] (38 or 48):
// "2;r;g;b" (truecolor) or "5;n" (256-colour). Returns the colour and how
// many extra parts it consumed, or null if malformed.
function parseExtendedColor(parts, i) {
    const mode = parseInt(parts[i + 1], 10);
    if (mode === 2 && i + 4 < parts.length) {
        return {
            color: {
                r: parseInt(parts[i + 2], 10) || 0,
                g: parseInt(parts[i + 3], 10) || 0,
                b: parseInt(parts[i + 4], 10) || 0,
                default: false
            },
            skip: 4
        };
    }
    if (mode === 5 && i + 2 < parts.length) {
        return { color: color256ToRGB(parseInt(parts[i + 2], 10) || 0), skip: 2 };
    }
    return null;
}

function parseCodes(codes, state) {
    let { fg, bg, bold, inverse } = state;

    if (codes === '' || codes === '0') return initialSGR();

    const parts = codes.split(';');
    let i = 0;
    while (i < parts.length) {
        const code = parseInt(parts[i], 10);
        if (isNaN(code)) { i++; continue; }

        switch (code) {
            case 0:
                ({ fg, bg, bold, inverse } = initialSGR());
                break;
            case 1:
                bold = true;
                break;
            case 22:
                bold = false;
                break;
            case 7:
                inverse = true;
                break;
            case 27:
                inverse = false;
                break;
            case 39:
                fg = defaultFG();
                break;
            case 49:
                bg = defaultBG();
                break;
            case 38: // Extended FG
            case 48: { // Extended BG
                const ext = parseExtendedColor(parts, i);
                if (ext) {
                    if (code === 38) fg = ext.color;
                    else bg = ext.color;
                    i += ext.skip;
                }
                break;
            }
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

    return { fg, bg, bold, inverse };
}

// ANSI text as rows of cells, each as long as its line (wide chars take two
// cells, so a row's width is its width in columns)
function ansiTextToRows(text) {
    // NFC composes e.g. e + U+0301 into é, which fits in one cell
    text = text.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');

    // Drop only the empty piece after the final newline; blank rows are content
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines.map(line => charsToRow(parseLine(line)));
}

function parseANSIText(text) {
    const rows = ansiTextToRows(text);
    if (rows.length === 0) {
        return createCanvas(1, 1);
    }
    const canvas = createCanvas(Math.max(1, ...rows.map(row => row.length)), rows.length);
    rows.forEach((row, y) => row.forEach((cell, x) => { canvas.cells[y][x] = cell; }));

    return canvas;
}
