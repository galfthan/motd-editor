// Geometric shapes for grid-shaped characters: block elements, the legacy
// computing blocks/diagonals/triangles, and box drawing. The grid canvas draws
// these itself (CanvasRenderer.drawShape) instead of using font glyphs, so they
// fill their cells exactly and join seamlessly with neighbouring cells in any
// browser, font and zoom level, the way terminals render them.
//
// Block and polygon shapes are in unit coordinates of a cell's inside: x from
// 0 (left) to 1 (right), y from 0 (top) to 1 (bottom). Thirds line up with the
// sextant subpixel rows.

// Rectangles: code → list of [x0, y0, x1, y1] or [x0, y0, x1, y1, alpha]
// (alpha < 1 for the shades: the foreground blended over the background)
const BLOCK_SHAPES = new Map();

(() => {
    const add = (code, ...rects) => BLOCK_SHAPES.set(code, rects);
    const UL = [0, 0, 1 / 2, 1 / 2], UR = [1 / 2, 0, 1, 1 / 2];
    const LL = [0, 1 / 2, 1 / 2, 1], LR = [1 / 2, 1 / 2, 1, 1];

    // Block Elements, U+2580-259F
    add(0x2580, [0, 0, 1, 1 / 2]);                                   // ▀ upper half
    for (let n = 1; n <= 7; n++) add(0x2580 + n, [0, 1 - n / 8, 1, 1]); // ▁..▇ lower n/8
    add(0x2588, [0, 0, 1, 1]);                                       // █ full
    for (let n = 7; n >= 1; n--) add(0x2590 - n, [0, 0, n / 8, 1]);  // ▉..▏ left n/8
    add(0x2590, [1 / 2, 0, 1, 1]);                                   // ▐ right half
    add(0x2591, [0, 0, 1, 1, 0.25]);                                 // ░ light shade
    add(0x2592, [0, 0, 1, 1, 0.5]);                                  // ▒ medium shade
    add(0x2593, [0, 0, 1, 1, 0.75]);                                 // ▓ dark shade
    add(0x2594, [0, 0, 1, 1 / 8]);                                   // ▔ upper 1/8
    add(0x2595, [7 / 8, 0, 1, 1]);                                   // ▕ right 1/8
    add(0x2596, LL); add(0x2597, LR); add(0x2598, UL);               // quadrants
    add(0x2599, UL, LL, LR); add(0x259A, UL, LR); add(0x259B, UL, UR, LL);
    add(0x259C, UL, UR, LR); add(0x259D, UR); add(0x259E, UR, LL); add(0x259F, UR, LL, LR);

    // Symbols for Legacy Computing
    for (let n = 2; n <= 7; n++) {
        add(0x1FB70 + n - 2, [(n - 1) / 8, 0, n / 8, 1]);            // vertical 1/8 block-n
        add(0x1FB76 + n - 2, [0, (n - 1) / 8, 1, n / 8]);            // horizontal 1/8 block-n
    }
    const L8 = [0, 0, 1 / 8, 1], R8 = [7 / 8, 0, 1, 1], U8 = [0, 0, 1, 1 / 8], D8 = [0, 7 / 8, 1, 1];
    add(0x1FB7C, L8, D8); add(0x1FB7D, L8, U8); add(0x1FB7E, R8, U8); add(0x1FB7F, R8, D8);
    add(0x1FB80, U8, D8);
    add(0x1FB81, U8, [0, 2 / 8, 1, 3 / 8], [0, 4 / 8, 1, 5 / 8], D8); // horizontal 1/8 block-1358
    [2 / 8, 3 / 8, 5 / 8, 6 / 8, 7 / 8].forEach((f, i) => {
        add(0x1FB82 + i, [0, 0, 1, f]);                              // upper 1/4 .. 7/8
        add(0x1FB87 + i, [1 - f, 0, 1, 1]);                          // right 1/4 .. 7/8
    });
    add(0x1FB8C, [0, 0, 1 / 2, 1, 0.5]); add(0x1FB8D, [1 / 2, 0, 1, 1, 0.5]); // half medium shades
    add(0x1FB8E, [0, 0, 1, 1 / 2, 0.5]); add(0x1FB8F, [0, 1 / 2, 1, 1, 0.5]);
    add(0x1FB90, [0, 0, 1, 1, 0.5]);                                 // inverse medium shade
    add(0x1FB91, [0, 0, 1, 1 / 2], [0, 1 / 2, 1, 1, 0.5]);           // upper half block + lower half shade
    add(0x1FB92, [0, 0, 1, 1 / 2, 0.5], [0, 1 / 2, 1, 1]);           // upper half shade + lower half block
    add(0x1FB94, [0, 0, 1 / 2, 1, 0.5], [1 / 2, 0, 1, 1]);           // left half shade + right half block
    // Checker board fills: 4x4 squares, the inverse starting with a gap
    const checker = (phase) => {
        const squares = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if ((i + j) % 2 === phase) squares.push([i / 4, j / 4, (i + 1) / 4, (j + 1) / 4]);
            }
        }
        return squares;
    };
    add(0x1FB95, ...checker(0));
    add(0x1FB96, ...checker(1));
    add(0x1FB97, [0, 1 / 8, 1, 3 / 8], [0, 5 / 8, 1, 7 / 8]);        // heavy horizontal fill (tiles vertically)
    add(0x1FBCE, [0, 0, 2 / 3, 1]);                                  // left 2/3 block
    add(0x1FBCF, [0, 0, 1 / 3, 1]);                                  // left 1/3 block
    add(0x1FBE4, [1 / 4, 0, 3 / 4, 1 / 2]); add(0x1FBE5, [1 / 4, 1 / 2, 3 / 4, 1]); // centred 1/4 blocks
    add(0x1FBE6, [0, 1 / 4, 1 / 2, 3 / 4]); add(0x1FBE7, [1 / 2, 1 / 4, 1, 3 / 4]);
})();

// Diagonal and triangle blocks, generated from the Unicode character names:
// code → [alpha, polygon, ...]. "X BLOCK DIAGONAL P TO Q" is the part of the
// cell on corner X's side of the line PQ; triangles meet at the centre.
const LEGACY_POLYGONS = new Map([
    [0x1FB3C, [1, [[1/2, 1], [0, 1], [0, 2/3]]]], // lower left block diagonal lower middle left to lower centre
    [0x1FB3D, [1, [[1, 1], [0, 1], [0, 2/3]]]], // lower left block diagonal lower middle left to lower right
    [0x1FB3E, [1, [[1/2, 1], [0, 1], [0, 1/3]]]], // lower left block diagonal upper middle left to lower centre
    [0x1FB3F, [1, [[1, 1], [0, 1], [0, 1/3]]]], // lower left block diagonal upper middle left to lower right
    [0x1FB40, [1, [[0, 0], [1/2, 1], [0, 1]]]], // lower left block diagonal upper left to lower centre
    [0x1FB41, [1, [[1/2, 0], [1, 0], [1, 1], [0, 1], [0, 1/3]]]], // lower right block diagonal upper middle left to upper centre
    [0x1FB42, [1, [[1, 0], [1, 1], [0, 1], [0, 1/3]]]], // lower right block diagonal upper middle left to upper right
    [0x1FB43, [1, [[1/2, 0], [1, 0], [1, 1], [0, 1], [0, 2/3]]]], // lower right block diagonal lower middle left to upper centre
    [0x1FB44, [1, [[1, 0], [1, 1], [0, 1], [0, 2/3]]]], // lower right block diagonal lower middle left to upper right
    [0x1FB45, [1, [[1/2, 0], [1, 0], [1, 1], [0, 1]]]], // lower right block diagonal lower left to upper centre
    [0x1FB46, [1, [[1, 1/3], [1, 1], [0, 1], [0, 2/3]]]], // lower right block diagonal lower middle left to upper middle right
    [0x1FB47, [1, [[1, 2/3], [1, 1], [1/2, 1]]]], // lower right block diagonal lower centre to lower middle right
    [0x1FB48, [1, [[1, 2/3], [1, 1], [0, 1]]]], // lower right block diagonal lower left to lower middle right
    [0x1FB49, [1, [[1, 1/3], [1, 1], [1/2, 1]]]], // lower right block diagonal lower centre to upper middle right
    [0x1FB4A, [1, [[1, 1/3], [1, 1], [0, 1]]]], // lower right block diagonal lower left to upper middle right
    [0x1FB4B, [1, [[1, 0], [1, 1], [1/2, 1]]]], // lower right block diagonal lower centre to upper right
    [0x1FB4C, [1, [[0, 0], [1/2, 0], [1, 1/3], [1, 1], [0, 1]]]], // lower left block diagonal upper centre to upper middle right
    [0x1FB4D, [1, [[0, 0], [1, 1/3], [1, 1], [0, 1]]]], // lower left block diagonal upper left to upper middle right
    [0x1FB4E, [1, [[0, 0], [1/2, 0], [1, 2/3], [1, 1], [0, 1]]]], // lower left block diagonal upper centre to lower middle right
    [0x1FB4F, [1, [[0, 0], [1, 2/3], [1, 1], [0, 1]]]], // lower left block diagonal upper left to lower middle right
    [0x1FB50, [1, [[0, 0], [1/2, 0], [1, 1], [0, 1]]]], // lower left block diagonal upper centre to lower right
    [0x1FB51, [1, [[1, 2/3], [1, 1], [0, 1], [0, 1/3]]]], // lower left block diagonal upper middle left to lower middle right
    [0x1FB52, [1, [[0, 0], [1, 0], [1, 1], [1/2, 1], [0, 2/3]]]], // upper right block diagonal lower middle left to lower centre
    [0x1FB53, [1, [[0, 0], [1, 0], [1, 1], [0, 2/3]]]], // upper right block diagonal lower middle left to lower right
    [0x1FB54, [1, [[0, 0], [1, 0], [1, 1], [1/2, 1], [0, 1/3]]]], // upper right block diagonal upper middle left to lower centre
    [0x1FB55, [1, [[0, 0], [1, 0], [1, 1], [0, 1/3]]]], // upper right block diagonal upper middle left to lower right
    [0x1FB56, [1, [[0, 0], [1, 0], [1, 1], [1/2, 1]]]], // upper right block diagonal upper left to lower centre
    [0x1FB57, [1, [[0, 0], [1/2, 0], [0, 1/3]]]], // upper left block diagonal upper middle left to upper centre
    [0x1FB58, [1, [[0, 0], [1, 0], [0, 1/3]]]], // upper left block diagonal upper middle left to upper right
    [0x1FB59, [1, [[0, 0], [1/2, 0], [0, 2/3]]]], // upper left block diagonal lower middle left to upper centre
    [0x1FB5A, [1, [[0, 0], [1, 0], [0, 2/3]]]], // upper left block diagonal lower middle left to upper right
    [0x1FB5B, [1, [[0, 0], [1/2, 0], [0, 1]]]], // upper left block diagonal lower left to upper centre
    [0x1FB5C, [1, [[0, 0], [1, 0], [1, 1/3], [0, 2/3]]]], // upper left block diagonal lower middle left to upper middle right
    [0x1FB5D, [1, [[0, 0], [1, 0], [1, 2/3], [1/2, 1], [0, 1]]]], // upper left block diagonal lower centre to lower middle right
    [0x1FB5E, [1, [[0, 0], [1, 0], [1, 2/3], [0, 1]]]], // upper left block diagonal lower left to lower middle right
    [0x1FB5F, [1, [[0, 0], [1, 0], [1, 1/3], [1/2, 1], [0, 1]]]], // upper left block diagonal lower centre to upper middle right
    [0x1FB60, [1, [[0, 0], [1, 0], [1, 1/3], [0, 1]]]], // upper left block diagonal lower left to upper middle right
    [0x1FB61, [1, [[0, 0], [1, 0], [1/2, 1], [0, 1]]]], // upper left block diagonal lower centre to upper right
    [0x1FB62, [1, [[1/2, 0], [1, 0], [1, 1/3]]]], // upper right block diagonal upper centre to upper middle right
    [0x1FB63, [1, [[0, 0], [1, 0], [1, 1/3]]]], // upper right block diagonal upper left to upper middle right
    [0x1FB64, [1, [[1/2, 0], [1, 0], [1, 2/3]]]], // upper right block diagonal upper centre to lower middle right
    [0x1FB65, [1, [[0, 0], [1, 0], [1, 2/3]]]], // upper right block diagonal upper left to lower middle right
    [0x1FB66, [1, [[1/2, 0], [1, 0], [1, 1]]]], // upper right block diagonal upper centre to lower right
    [0x1FB67, [1, [[0, 0], [1, 0], [1, 2/3], [0, 1/3]]]], // upper right block diagonal upper middle left to lower middle right
    [0x1FB68, [1, [[0, 0], [1, 0], [1, 1], [0, 1], [1/2, 1/2]]]], // upper and right and lower triangular three quarters block
    [0x1FB69, [1, [[1, 0], [1, 1], [0, 1], [0, 0], [1/2, 1/2]]]], // left and lower and right triangular three quarters block
    [0x1FB6A, [1, [[1, 1], [0, 1], [0, 0], [1, 0], [1/2, 1/2]]]], // upper and left and lower triangular three quarters block
    [0x1FB6B, [1, [[0, 1], [0, 0], [1, 0], [1, 1], [1/2, 1/2]]]], // left and upper and right triangular three quarters block
    [0x1FB6C, [1, [[0, 0], [1/2, 1/2], [0, 1]]]], // left triangular one quarter block
    [0x1FB6D, [1, [[0, 0], [1, 0], [1/2, 1/2]]]], // upper triangular one quarter block
    [0x1FB6E, [1, [[1, 0], [1, 1], [1/2, 1/2]]]], // right triangular one quarter block
    [0x1FB6F, [1, [[0, 1], [1, 1], [1/2, 1/2]]]], // lower triangular one quarter block
    [0x1FB9A, [1, [[0, 0], [1, 0], [1/2, 1/2]], [[0, 1], [1, 1], [1/2, 1/2]]]], // upper and lower triangular half block
    [0x1FB9B, [1, [[0, 0], [1/2, 1/2], [0, 1]], [[1, 0], [1, 1], [1/2, 1/2]]]], // left and right triangular half block
    [0x1FB9C, [0.5, [[0, 0], [1, 0], [0, 1]]]], // upper left triangular medium shade
    [0x1FB9D, [0.5, [[0, 0], [1, 0], [1, 1]]]], // upper right triangular medium shade
    [0x1FB9E, [0.5, [[1, 0], [1, 1], [0, 1]]]], // lower right triangular medium shade
    [0x1FB9F, [0.5, [[0, 0], [1, 1], [0, 1]]]], // lower left triangular medium shade
]);

// Diagonal stripe fills, drawn in canvas-wide coordinates so the stripes run
// on seamlessly from cell to cell: code → direction (+1 "\\", -1 "/")
const LEGACY_STRIPES = new Map([[0x1FB98, 1], [0x1FB99, -1]]);

// Light diagonal lines between a cell's corners (U/L = upper/lower, L/R =
// left/right), edge midpoints (UC, LC, ML, MR) and centre (MC), from the
// Unicode names "BOX DRAWINGS LIGHT DIAGONAL P TO Q [TO R...] [AND ...]":
// code → list of polylines
const LEGACY_LINES = (() => {
    const P = {
        UL: [0, 0], UC: [1 / 2, 0], UR: [1, 0], ML: [0, 1 / 2], MC: [1 / 2, 1 / 2],
        MR: [1, 1 / 2], LL: [0, 1], LC: [1 / 2, 1], LR: [1, 1]
    };
    const paths = {
        0x1FBA0: 'UC ML', 0x1FBA1: 'UC MR', 0x1FBA2: 'ML LC', 0x1FBA3: 'MR LC',
        0x1FBA4: 'UC ML LC', 0x1FBA5: 'UC MR LC', 0x1FBA6: 'ML LC MR', 0x1FBA7: 'ML UC MR',
        0x1FBA8: 'UC ML, MR LC', 0x1FBA9: 'UC MR, ML LC', 0x1FBAA: 'UC MR LC ML', 0x1FBAB: 'UC ML LC MR',
        0x1FBAC: 'ML UC MR LC', 0x1FBAD: 'MR UC ML LC', 0x1FBAE: 'UC MR LC ML UC', // diamond
        0x1FBAF: 'ML MR', // horizontal with vertical stroke (stroke added in drawShape)
        // Unicode 16
        0x1FBD0: 'MR LL', 0x1FBD1: 'UR ML', 0x1FBD2: 'UL MR', 0x1FBD3: 'ML LR',
        0x1FBD4: 'UL LC', 0x1FBD5: 'UC LR', 0x1FBD6: 'UR LC', 0x1FBD7: 'UC LL',
        0x1FBD8: 'UL MC UR', 0x1FBD9: 'UR MC LR', 0x1FBDA: 'LL MC LR', 0x1FBDB: 'UL MC LL',
        0x1FBDC: 'UL LC UR', 0x1FBDD: 'UR ML LR', 0x1FBDE: 'LL UC LR', 0x1FBDF: 'UL MR LL'
    };
    return new Map(Object.entries(paths).map(([code, path]) => [
        Number(code), path.split(', ').map(line => line.split(' ').map(name => P[name]))
    ]));
})();

// Box drawing, U+2500-257F. Most chars are described by their arms (styles
// per direction: 0 none, 1 light, 2 heavy, 3 double), from the box tool's own
// BoxDrawLookup table plus the half-line chars it doesn't use.
const BOX_STUB_ARMS = new Map([
    [0x2574, { left: 1 }], [0x2575, { up: 1 }], [0x2576, { right: 1 }], [0x2577, { down: 1 }],
    [0x2578, { left: 2 }], [0x2579, { up: 2 }], [0x257A, { right: 2 }], [0x257B, { down: 2 }],
    [0x257C, { left: 1, right: 2 }], [0x257D, { up: 1, down: 2 }],
    [0x257E, { left: 2, right: 1 }], [0x257F, { up: 2, down: 1 }]
]);

// Dashed lines: code → [horizontal?, dash count, style]
const BOX_DASHES = new Map([
    [0x2504, [true, 3, 1]], [0x2505, [true, 3, 2]], [0x2506, [false, 3, 1]], [0x2507, [false, 3, 2]],
    [0x2508, [true, 4, 1]], [0x2509, [true, 4, 2]], [0x250A, [false, 4, 1]], [0x250B, [false, 4, 2]],
    [0x254C, [true, 2, 1]], [0x254D, [true, 2, 2]], [0x254E, [false, 2, 1]], [0x254F, [false, 2, 2]]
]);

// Rounded corners: code → the two arms they connect
const BOX_ARCS = new Map([
    [0x256D, ['down', 'right']], [0x256E, ['down', 'left']],
    [0x256F, ['up', 'left']], [0x2570, ['up', 'right']]
]);

// Arms of a box-drawing char, or null if it isn't drawn from arms
function boxArms(code) {
    if (code < 0x2500 || code > 0x257F) return null;
    const stub = BOX_STUB_ARMS.get(code);
    if (stub) return { up: 0, down: 0, left: 0, right: 0, ...stub };
    return boxDrawLookup.getConnections(code);
}

// Whether the grid canvas draws this char itself rather than with a font
function hasGlyphShape(code) {
    return BLOCK_SHAPES.has(code) || LEGACY_POLYGONS.has(code) ||
        LEGACY_STRIPES.has(code) || LEGACY_LINES.has(code) ||
        (code >= 0x2500 && code <= 0x257F &&
         (boxArms(code) !== null || BOX_DASHES.has(code) || BOX_ARCS.has(code) ||
          code === 0x2571 || code === 0x2572 || code === 0x2573));
}
