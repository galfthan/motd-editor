// Hardcoded charset data — replaces server endpoints /api/charset/*

const DIAGONAL_CHARS = [
    { char: '\u{1FB3C}', code: 0x1FB3C, direction: 'down-right', fill: 'below', angle: 'shallow', name: 'LOWER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER CENTRE' },
    { char: '\u{1FB3D}', code: 0x1FB3D, direction: 'down-right', fill: 'below', angle: 'shallow', name: 'LOWER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER RIGHT' },
    { char: '\u{1FB3E}', code: 0x1FB3E, direction: 'down-right', fill: 'below', angle: 'mid', name: 'LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER CENTRE' },
    { char: '\u{1FB3F}', code: 0x1FB3F, direction: 'down-right', fill: 'below', angle: 'mid', name: 'LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER RIGHT' },
    { char: '\u{1FB40}', code: 0x1FB40, direction: 'down-right', fill: 'below', angle: 'steep', name: 'LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO LOWER CENTRE' },
    { char: '\u{1FB41}', code: 0x1FB41, direction: 'down-left', fill: 'below', angle: 'shallow', name: 'LOWER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER CENTRE' },
    { char: '\u{1FB42}', code: 0x1FB42, direction: 'down-left', fill: 'below', angle: 'shallow', name: 'LOWER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER RIGHT' },
    { char: '\u{1FB43}', code: 0x1FB43, direction: 'down-left', fill: 'below', angle: 'mid', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER CENTRE' },
    { char: '\u{1FB44}', code: 0x1FB44, direction: 'down-left', fill: 'below', angle: 'mid', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER RIGHT' },
    { char: '\u{1FB45}', code: 0x1FB45, direction: 'down-left', fill: 'below', angle: 'steep', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO UPPER CENTRE' },
    { char: '\u{1FB46}', code: 0x1FB46, direction: 'down-left', fill: 'below', angle: 'mid', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB47}', code: 0x1FB47, direction: 'down-left', fill: 'below', angle: 'shallow', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB48}', code: 0x1FB48, direction: 'down-left', fill: 'below', angle: 'shallow', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB49}', code: 0x1FB49, direction: 'down-left', fill: 'below', angle: 'mid', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB4A}', code: 0x1FB4A, direction: 'down-left', fill: 'below', angle: 'mid', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER LEFT TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB4B}', code: 0x1FB4B, direction: 'down-left', fill: 'below', angle: 'steep', name: 'LOWER RIGHT BLOCK DIAGONAL LOWER CENTRE TO UPPER RIGHT' },
    { char: '\u{1FB4C}', code: 0x1FB4C, direction: 'down-right', fill: 'below', angle: 'mid', name: 'LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB4D}', code: 0x1FB4D, direction: 'down-right', fill: 'below', angle: 'mid', name: 'LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB4E}', code: 0x1FB4E, direction: 'down-right', fill: 'below', angle: 'mid', name: 'LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB4F}', code: 0x1FB4F, direction: 'down-right', fill: 'below', angle: 'mid', name: 'LOWER LEFT BLOCK DIAGONAL UPPER LEFT TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB50}', code: 0x1FB50, direction: 'down-right', fill: 'below', angle: 'steep', name: 'LOWER LEFT BLOCK DIAGONAL UPPER CENTRE TO LOWER RIGHT' },
    { char: '\u{1FB51}', code: 0x1FB51, direction: 'down-right', fill: 'below', angle: 'mid', name: 'LOWER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB52}', code: 0x1FB52, direction: 'down-right', fill: 'above', angle: 'shallow', name: 'UPPER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER CENTRE' },
    { char: '\u{1FB53}', code: 0x1FB53, direction: 'down-right', fill: 'above', angle: 'shallow', name: 'UPPER RIGHT BLOCK DIAGONAL LOWER MIDDLE LEFT TO LOWER RIGHT' },
    { char: '\u{1FB54}', code: 0x1FB54, direction: 'down-right', fill: 'above', angle: 'mid', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER CENTRE' },
    { char: '\u{1FB55}', code: 0x1FB55, direction: 'down-right', fill: 'above', angle: 'mid', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER RIGHT' },
    { char: '\u{1FB56}', code: 0x1FB56, direction: 'down-right', fill: 'above', angle: 'steep', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO LOWER CENTRE' },
    { char: '\u{1FB57}', code: 0x1FB57, direction: 'down-left', fill: 'above', angle: 'shallow', name: 'UPPER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER CENTRE' },
    { char: '\u{1FB58}', code: 0x1FB58, direction: 'down-left', fill: 'above', angle: 'shallow', name: 'UPPER LEFT BLOCK DIAGONAL UPPER MIDDLE LEFT TO UPPER RIGHT' },
    { char: '\u{1FB59}', code: 0x1FB59, direction: 'down-left', fill: 'above', angle: 'mid', name: 'UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER CENTRE' },
    { char: '\u{1FB5A}', code: 0x1FB5A, direction: 'down-left', fill: 'above', angle: 'mid', name: 'UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER RIGHT' },
    { char: '\u{1FB5B}', code: 0x1FB5B, direction: 'down-left', fill: 'above', angle: 'steep', name: 'UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO UPPER CENTRE' },
    { char: '\u{1FB5C}', code: 0x1FB5C, direction: 'down-left', fill: 'above', angle: 'mid', name: 'UPPER LEFT BLOCK DIAGONAL LOWER MIDDLE LEFT TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB5D}', code: 0x1FB5D, direction: 'down-left', fill: 'above', angle: 'shallow', name: 'UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB5E}', code: 0x1FB5E, direction: 'down-left', fill: 'above', angle: 'shallow', name: 'UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB5F}', code: 0x1FB5F, direction: 'down-left', fill: 'above', angle: 'mid', name: 'UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB60}', code: 0x1FB60, direction: 'down-left', fill: 'above', angle: 'mid', name: 'UPPER LEFT BLOCK DIAGONAL LOWER LEFT TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB61}', code: 0x1FB61, direction: 'down-left', fill: 'above', angle: 'steep', name: 'UPPER LEFT BLOCK DIAGONAL LOWER CENTRE TO UPPER RIGHT' },
    { char: '\u{1FB62}', code: 0x1FB62, direction: 'down-right', fill: 'above', angle: 'mid', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB63}', code: 0x1FB63, direction: 'down-right', fill: 'above', angle: 'mid', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO UPPER MIDDLE RIGHT' },
    { char: '\u{1FB64}', code: 0x1FB64, direction: 'down-right', fill: 'above', angle: 'mid', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB65}', code: 0x1FB65, direction: 'down-right', fill: 'above', angle: 'mid', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER LEFT TO LOWER MIDDLE RIGHT' },
    { char: '\u{1FB66}', code: 0x1FB66, direction: 'down-right', fill: 'above', angle: 'steep', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER CENTRE TO LOWER RIGHT' },
    { char: '\u{1FB67}', code: 0x1FB67, direction: 'down-right', fill: 'above', angle: 'mid', name: 'UPPER RIGHT BLOCK DIAGONAL UPPER MIDDLE LEFT TO LOWER MIDDLE RIGHT' },
];

const TRIANGLE_CHARS = [
    { char: '\u{1FB68}', code: 0x1FB68, corner: 'lower-left', inverted: true, name: 'UPPER LEFT LOWER RIGHT DIAGONAL HALF FILL' },
    { char: '\u{1FB69}', code: 0x1FB69, corner: 'lower-right', inverted: true, name: 'UPPER RIGHT LOWER LEFT DIAGONAL HALF FILL' },
    { char: '\u{1FB6A}', code: 0x1FB6A, corner: 'upper-right', inverted: true, name: 'UPPER LEFT LOWER RIGHT DIAGONAL HALF FILL' },
    { char: '\u{1FB6B}', code: 0x1FB6B, corner: 'upper-left', inverted: true, name: 'UPPER RIGHT LOWER LEFT DIAGONAL HALF FILL' },
    { char: '\u{1FB6C}', code: 0x1FB6C, corner: 'lower-left', inverted: false, name: 'LEFT TRIANGULAR ONE QUARTER BLOCK' },
    { char: '\u{1FB6D}', code: 0x1FB6D, corner: 'lower-right', inverted: false, name: 'LOWER TRIANGULAR ONE QUARTER BLOCK' },
    { char: '\u{1FB6E}', code: 0x1FB6E, corner: 'upper-right', inverted: false, name: 'RIGHT TRIANGULAR ONE QUARTER BLOCK' },
    { char: '\u{1FB6F}', code: 0x1FB6F, corner: 'upper-left', inverted: false, name: 'UPPER TRIANGULAR ONE QUARTER BLOCK' },
];

// Reverse lookup: Unicode char → sextant 6-bit pattern
// Used by ANSI import to detect sextant characters
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

// Convert 6-bit pattern to subpixels array
function patternToSubpixels(pattern) {
    return [
        [!!(pattern & 1), !!(pattern & 2)],
        [!!(pattern & 4), !!(pattern & 8)],
        [!!(pattern & 16), !!(pattern & 32)]
    ];
}
