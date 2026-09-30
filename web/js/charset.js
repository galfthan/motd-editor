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
