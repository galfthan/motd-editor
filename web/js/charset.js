// Character palette data and sextant/glyph helpers

const DIAGONAL_CHARS = [
    { code: 0x1FB3C, name: 'LOWER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER CENTRE' },
    { code: 0x1FB3D, name: 'LOWER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER RIGHT' },
    { code: 0x1FB3E, name: 'LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER CENTRE' },
    { code: 0x1FB3F, name: 'LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER RIGHT' },
    { code: 0x1FB40, name: 'LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO LOWER CENTRE' },
    { code: 0x1FB41, name: 'LOWER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER CENTRE' },
    { code: 0x1FB42, name: 'LOWER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER RIGHT' },
    { code: 0x1FB43, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER CENTRE' },
    { code: 0x1FB44, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER RIGHT' },
    { code: 0x1FB45, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO UPPER CENTRE' },
    { code: 0x1FB46, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB47, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB48, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB49, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB4A, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB4B, name: 'LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO UPPER RIGHT' },
    { code: 0x1FB4C, name: 'LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB4D, name: 'LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB4E, name: 'LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB4F, name: 'LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB50, name: 'LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO LOWER RIGHT' },
    { code: 0x1FB51, name: 'LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB52, name: 'UPPER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER CENTRE' },
    { code: 0x1FB53, name: 'UPPER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER RIGHT' },
    { code: 0x1FB54, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER CENTRE' },
    { code: 0x1FB55, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER RIGHT' },
    { code: 0x1FB56, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO LOWER CENTRE' },
    { code: 0x1FB57, name: 'UPPER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER CENTRE' },
    { code: 0x1FB58, name: 'UPPER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER RIGHT' },
    { code: 0x1FB59, name: 'UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER CENTRE' },
    { code: 0x1FB5A, name: 'UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER RIGHT' },
    { code: 0x1FB5B, name: 'UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO UPPER CENTRE' },
    { code: 0x1FB5C, name: 'UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB5D, name: 'UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB5E, name: 'UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB5F, name: 'UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB60, name: 'UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB61, name: 'UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO UPPER RIGHT' },
    { code: 0x1FB62, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB63, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO UPPER MIDDLE RIGHT' },
    { code: 0x1FB64, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB65, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO LOWER MIDDLE RIGHT' },
    { code: 0x1FB66, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO LOWER RIGHT' },
    { code: 0x1FB67, name: 'UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER MIDDLE RIGHT' },
];

const TRIANGLE_CHARS = [
    { code: 0x1FB68, name: 'UPPER LEFT LOWER RIGHT DIAGONAL HALF FILL' },
    { code: 0x1FB69, name: 'UPPER RIGHT LOWER LEFT DIAGONAL HALF FILL' },
    { code: 0x1FB6A, name: 'UPPER LEFT LOWER RIGHT DIAGONAL HALF FILL' },
    { code: 0x1FB6B, name: 'UPPER RIGHT LOWER LEFT DIAGONAL HALF FILL' },
    { code: 0x1FB6C, name: 'LEFT TRIANGULAR ONE QUARTER BLOCK' },
    { code: 0x1FB6D, name: 'LOWER TRIANGULAR ONE QUARTER BLOCK' },
    { code: 0x1FB6E, name: 'RIGHT TRIANGULAR ONE QUARTER BLOCK' },
    { code: 0x1FB6F, name: 'UPPER TRIANGULAR ONE QUARTER BLOCK' },
];

// Sextant patterns are 6 bits, one per subpixel in reading order:
// bit (row * 2 + col) for the 2x3 grid, so 1 = top-left ... 32 = bottom-right.

// Convert a subpixels array ([row][col]) to its 6-bit pattern
function subpixelsToPattern(subpixels) {
    let pattern = 0;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
            if (subpixels[row][col]) pattern |= 1 << (row * 2 + col);
        }
    }
    return pattern;
}

// Convert a 6-bit pattern to its subpixels array
function patternToSubpixels(pattern) {
    return [
        [!!(pattern & 1), !!(pattern & 2)],
        [!!(pattern & 4), !!(pattern & 8)],
        [!!(pattern & 16), !!(pattern & 32)]
    ];
}

// Convert a 6-bit pattern to its Unicode character. The sextant block
// U+1FB00-1FB3B omits the patterns that already exist as block elements.
function sextantPatternToChar(pattern) {
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

// Reverse lookup: Unicode char → sextant 6-bit pattern
function runeToSextantPattern(code) {
    if (code === 32) return { pattern: 0, ok: true };        // Space
    if (code === 0x2588) return { pattern: 63, ok: true };   // Full block
    if (code === 0x258C) return { pattern: 21, ok: true };   // Left half
    if (code === 0x2590) return { pattern: 42, ok: true };   // Right half

    if (code < 0x1FB00 || code > 0x1FB3B) return { pattern: 0, ok: false };

    let pattern = (code - 0x1FB00) + 1;
    if (pattern >= 21) pattern++;
    if (pattern >= 42) pattern++;
    return { pattern, ok: true };
}

// CSS class with the font styles for a glyph (see .glyph-* in style.css).
// Legacy-computing "tiling" chars (sextants, diagonals, lines) are drawn from a
// half-height font and stretched to fill the cell.
function glyphClass(code) {
    const isLegacyTiling = (code >= 0x1FB00 && code <= 0x1FBAF)
        || (code >= 0x1FBCE && code <= 0x1FBDF);
    if (isLegacyTiling) return 'glyph-tiling';
    if (code >= 0x1FB00) return 'glyph-legacy';
    if (code >= 0x2500 && code <= 0x259F) return 'glyph-box';
    return 'glyph-text';
}

// --- Character width (terminal columns) ---

// Code point ranges a terminal draws two columns wide: East Asian Width W and F
// (CJK, Hangul, fullwidth forms, most emoji), from Unicode 15.0.
const WIDE_RANGES = [
    [0x1100, 0x115F], [0x231A, 0x231B], [0x2329, 0x232A], [0x23E9, 0x23EC], [0x23F0, 0x23F0],
    [0x23F3, 0x23F3], [0x25FD, 0x25FE], [0x2614, 0x2615], [0x2648, 0x2653], [0x267F, 0x267F],
    [0x2693, 0x2693], [0x26A1, 0x26A1], [0x26AA, 0x26AB], [0x26BD, 0x26BE], [0x26C4, 0x26C5],
    [0x26CE, 0x26CE], [0x26D4, 0x26D4], [0x26EA, 0x26EA], [0x26F2, 0x26F3], [0x26F5, 0x26F5],
    [0x26FA, 0x26FA], [0x26FD, 0x26FD], [0x2705, 0x2705], [0x270A, 0x270B], [0x2728, 0x2728],
    [0x274C, 0x274C], [0x274E, 0x274E], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
    [0x27B0, 0x27B0], [0x27BF, 0x27BF], [0x2B1B, 0x2B1C], [0x2B50, 0x2B50], [0x2B55, 0x2B55],
    [0x2E80, 0x2E99], [0x2E9B, 0x2EF3], [0x2F00, 0x2FD5], [0x2FF0, 0x2FFB], [0x3000, 0x3029],
    [0x302E, 0x303E], [0x3041, 0x3096], [0x309B, 0x30FF], [0x3105, 0x312F], [0x3131, 0x318E],
    [0x3190, 0x31E3], [0x31F0, 0x321E], [0x3220, 0x3247], [0x3250, 0x4DBF], [0x4E00, 0xA48C],
    [0xA490, 0xA4C6], [0xA960, 0xA97C], [0xAC00, 0xD7A3], [0xF900, 0xFAFF], [0xFE10, 0xFE19],
    [0xFE30, 0xFE52], [0xFE54, 0xFE66], [0xFE68, 0xFE6B], [0xFF01, 0xFF60], [0xFFE0, 0xFFE6],
    [0x16FE0, 0x16FE3], [0x16FF0, 0x16FF1], [0x17000, 0x187F7], [0x18800, 0x18CD5],
    [0x18D00, 0x18D08], [0x1AFF0, 0x1AFF3], [0x1AFF5, 0x1AFFB], [0x1AFFD, 0x1AFFE],
    [0x1B000, 0x1B122], [0x1B132, 0x1B132], [0x1B150, 0x1B152], [0x1B155, 0x1B155],
    [0x1B164, 0x1B167], [0x1B170, 0x1B2FB], [0x1F004, 0x1F004], [0x1F0CF, 0x1F0CF],
    [0x1F18E, 0x1F18E], [0x1F191, 0x1F19A], [0x1F200, 0x1F202], [0x1F210, 0x1F23B],
    [0x1F240, 0x1F248], [0x1F250, 0x1F251], [0x1F260, 0x1F265], [0x1F300, 0x1F320],
    [0x1F32D, 0x1F335], [0x1F337, 0x1F37C], [0x1F37E, 0x1F393], [0x1F3A0, 0x1F3CA],
    [0x1F3CF, 0x1F3D3], [0x1F3E0, 0x1F3F0], [0x1F3F4, 0x1F3F4], [0x1F3F8, 0x1F43E],
    [0x1F440, 0x1F440], [0x1F442, 0x1F4FC], [0x1F4FF, 0x1F53D], [0x1F54B, 0x1F54E],
    [0x1F550, 0x1F567], [0x1F57A, 0x1F57A], [0x1F595, 0x1F596], [0x1F5A4, 0x1F5A4],
    [0x1F5FB, 0x1F64F], [0x1F680, 0x1F6C5], [0x1F6CC, 0x1F6CC], [0x1F6D0, 0x1F6D2],
    [0x1F6D5, 0x1F6D7], [0x1F6DC, 0x1F6DF], [0x1F6EB, 0x1F6EC], [0x1F6F4, 0x1F6FC],
    [0x1F7E0, 0x1F7EB], [0x1F7F0, 0x1F7F0], [0x1F90C, 0x1F93A], [0x1F93C, 0x1F945],
    [0x1F947, 0x1F9FF], [0x1FA70, 0x1FA7C], [0x1FA80, 0x1FA88], [0x1FA90, 0x1FABD],
    [0x1FABF, 0x1FAC5], [0x1FACE, 0x1FADB], [0x1FAE0, 0x1FAE8], [0x1FAF0, 0x1FAF8],
    [0x20000, 0x3FFFD]
];

const ZERO_WIDTH_RE = /[\p{Mn}\p{Me}\p{Cf}]/u;

// Terminal columns a code point takes: 0 for combining marks, format chars
// and emoji skin-tone modifiers (they attach to the preceding char), 2 for
// wide chars, otherwise 1. Ambiguous-width chars count as 1.
function charWidth(code) {
    if (code < 0x300) return 1; // fast path: ASCII / Latin-1
    if (code >= 0x1F3FB && code <= 0x1F3FF) return 0;
    if (ZERO_WIDTH_RE.test(String.fromCodePoint(code))) return 0;
    let lo = 0, hi = WIDE_RANGES.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (code < WIDE_RANGES[mid][0]) hi = mid - 1;
        else if (code > WIDE_RANGES[mid][1]) lo = mid + 1;
        else return 2;
    }
    return 1;
}
