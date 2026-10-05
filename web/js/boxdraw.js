// Box-drawing character lookup tables and box computation logic

class BoxDrawLookup {
    constructor() {
        this.charToConn = new Map();   // charCode -> {up, down, left, right}
        this.connToChar = new Map();   // encoded key -> charCode
        this._buildTables();
    }

    // Encode 4 direction styles into a single key (2 bits each, 8-bit total)
    encode(up, down, left, right) {
        return up | (down << 2) | (left << 4) | (right << 6);
    }

    getConnections(code) {
        return this.charToConn.get(code) || null;
    }

    lookupChar(up, down, left, right) {
        return this.connToChar.get(this.encode(up, down, left, right)) || null;
    }

    _buildTables() {
        // [charCodePoint, up, down, left, right]
        // Styles: 0=none, 1=light, 2=heavy, 3=double
        const entries = [
            // Light
            [0x2500, 0, 0, 1, 1], // ─
            [0x2502, 1, 1, 0, 0], // │
            [0x250C, 0, 1, 0, 1], // ┌
            [0x2510, 0, 1, 1, 0], // ┐
            [0x2514, 1, 0, 0, 1], // └
            [0x2518, 1, 0, 1, 0], // ┘
            [0x251C, 1, 1, 0, 1], // ├
            [0x2524, 1, 1, 1, 0], // ┤
            [0x252C, 0, 1, 1, 1], // ┬
            [0x2534, 1, 0, 1, 1], // ┴
            [0x253C, 1, 1, 1, 1], // ┼

            // Heavy
            [0x2501, 0, 0, 2, 2], // ━
            [0x2503, 2, 2, 0, 0], // ┃
            [0x250F, 0, 2, 0, 2], // ┏
            [0x2513, 0, 2, 2, 0], // ┓
            [0x2517, 2, 0, 0, 2], // ┗
            [0x251B, 2, 0, 2, 0], // ┛
            [0x2523, 2, 2, 0, 2], // ┣
            [0x252B, 2, 2, 2, 0], // ┫
            [0x2533, 0, 2, 2, 2], // ┳
            [0x253B, 2, 0, 2, 2], // ┻
            [0x254B, 2, 2, 2, 2], // ╋

            // Double
            [0x2550, 0, 0, 3, 3], // ═
            [0x2551, 3, 3, 0, 0], // ║
            [0x2554, 0, 3, 0, 3], // ╔
            [0x2557, 0, 3, 3, 0], // ╗
            [0x255A, 3, 0, 0, 3], // ╚
            [0x255D, 3, 0, 3, 0], // ╝
            [0x2560, 3, 3, 0, 3], // ╠
            [0x2563, 3, 3, 3, 0], // ╣
            [0x2566, 0, 3, 3, 3], // ╦
            [0x2569, 3, 0, 3, 3], // ╩
            [0x256C, 3, 3, 3, 3], // ╬

            // Mixed light+heavy corners
            [0x250D, 0, 1, 0, 2], // ┍
            [0x250E, 0, 2, 0, 1], // ┎
            [0x2511, 0, 1, 2, 0], // ┑
            [0x2512, 0, 2, 1, 0], // ┒
            [0x2515, 1, 0, 0, 2], // ┕
            [0x2516, 2, 0, 0, 1], // ┖
            [0x2519, 1, 0, 2, 0], // ┙
            [0x251A, 2, 0, 1, 0], // ┚

            // Mixed light+heavy T-junctions (├ variants)
            [0x251D, 1, 1, 0, 2], // ┝
            [0x251E, 2, 1, 0, 1], // ┞
            [0x251F, 1, 2, 0, 1], // ┟
            [0x2520, 2, 2, 0, 1], // ┠
            [0x2521, 2, 1, 0, 2], // ┡
            [0x2522, 1, 2, 0, 2], // ┢

            // Mixed light+heavy T-junctions (┤ variants)
            [0x2525, 1, 1, 2, 0], // ┥
            [0x2526, 2, 1, 1, 0], // ┦
            [0x2527, 1, 2, 1, 0], // ┧
            [0x2528, 2, 2, 1, 0], // ┨
            [0x2529, 2, 1, 2, 0], // ┩
            [0x252A, 1, 2, 2, 0], // ┪

            // Mixed light+heavy T-junctions (┬ variants)
            [0x252D, 0, 1, 2, 1], // ┭
            [0x252E, 0, 1, 1, 2], // ┮
            [0x252F, 0, 1, 2, 2], // ┯
            [0x2530, 0, 2, 1, 1], // ┰
            [0x2531, 0, 2, 2, 1], // ┱
            [0x2532, 0, 2, 1, 2], // ┲

            // Mixed light+heavy T-junctions (┴ variants)
            [0x2535, 1, 0, 2, 1], // ┵
            [0x2536, 1, 0, 1, 2], // ┶
            [0x2537, 1, 0, 2, 2], // ┷
            [0x2538, 2, 0, 1, 1], // ┸
            [0x2539, 2, 0, 2, 1], // ┹
            [0x253A, 2, 0, 1, 2], // ┺

            // Mixed light+heavy crosses (┼ variants)
            [0x253D, 1, 1, 2, 1], // ┽
            [0x253E, 1, 1, 1, 2], // ┾
            [0x253F, 1, 1, 2, 2], // ┿
            [0x2540, 2, 1, 1, 1], // ╀
            [0x2541, 1, 2, 1, 1], // ╁
            [0x2542, 2, 2, 1, 1], // ╂
            [0x2543, 2, 1, 2, 1], // ╃
            [0x2544, 2, 1, 1, 2], // ╄
            [0x2545, 1, 2, 2, 1], // ╅
            [0x2546, 1, 2, 1, 2], // ╆
            [0x2547, 2, 1, 2, 2], // ╇
            [0x2548, 1, 2, 2, 2], // ╈
            [0x2549, 2, 2, 2, 1], // ╉
            [0x254A, 2, 2, 1, 2], // ╊

            // Mixed single+double corners
            [0x2552, 0, 1, 0, 3], // ╒
            [0x2553, 0, 3, 0, 1], // ╓
            [0x2555, 0, 1, 3, 0], // ╕
            [0x2556, 0, 3, 1, 0], // ╖
            [0x2558, 1, 0, 0, 3], // ╘
            [0x2559, 3, 0, 0, 1], // ╙
            [0x255B, 1, 0, 3, 0], // ╛
            [0x255C, 3, 0, 1, 0], // ╜

            // Mixed single+double T-junctions
            [0x255E, 1, 1, 0, 3], // ╞
            [0x255F, 3, 3, 0, 1], // ╟
            [0x2561, 1, 1, 3, 0], // ╡
            [0x2562, 3, 3, 1, 0], // ╢
            [0x2564, 0, 1, 3, 3], // ╤
            [0x2565, 0, 3, 1, 1], // ╥
            [0x2567, 1, 0, 3, 3], // ╧
            [0x2568, 3, 0, 1, 1], // ╨

            // Mixed single+double crosses
            [0x256A, 1, 1, 3, 3], // ╪
            [0x256B, 3, 3, 1, 1], // ╫
        ];

        for (const [code, up, down, left, right] of entries) {
            this.charToConn.set(code, { up, down, left, right });
            this.connToChar.set(this.encode(up, down, left, right), code);
        }
        // Rounded corners join like light ones (lookups give the square
        // ones; see roundCorners)
        for (const [arc, square] of ROUNDED_CORNERS) this.charToConn.set(arc, this.charToConn.get(square));
    }
}

// Rounded corners ╭ ╮ ╯ ╰ and the light square corners they stand for
const ROUNDED_CORNERS = [[0x256D, 0x250C], [0x256E, 0x2510], [0x256F, 0x2518], [0x2570, 0x2514]];

// The rounded border style: drawn as light lines, with light corners made
// round (T-junctions and crosses stay square: Unicode has no rounded ones)
const ROUNDED_STYLE = 5;

function roundCorners(chars) {
    const round = new Map(ROUNDED_CORNERS.map(([arc, square]) => [square, arc]));
    return chars.map(c => round.has(c.charCode) ? { ...c, charCode: round.get(c.charCode) } : c);
}

// Compute what connections a new box wants at position (x,y)
function getNewBoxConnections(x, y, x1, y1, x2, y2, style) {
    const conn = { up: 0, down: 0, left: 0, right: 0 };

    // Degenerate: vertical/horizontal line. Every cell, ends included, gets a
    // full segment (no half-line chars exist in the lookup table).
    if (x1 === x2) {
        conn.up = conn.down = style;
        return conn;
    }
    if (y1 === y2) {
        conn.left = conn.right = style;
        return conn;
    }

    // Normal rectangle
    if (y === y1 || y === y2) {
        if (x > x1) conn.left = style;
        if (x < x2) conn.right = style;
    }
    if (x === x1 || x === x2) {
        if (y > y1) conn.up = style;
        if (y < y2) conn.down = style;
    }

    return conn;
}

// Merge the new stroke's connections with an existing box-draw char and return
// the resulting char code (or null). Unicode has no char for some style mixes
// (e.g. heavy+double); then the existing arms are redrawn in the new style, and
// failing that the new stroke is drawn on its own.
function mergeWithExisting(conn, existingCell, style, lookup) {
    const ec = existingCell && existingCell.type !== 'block'
        ? lookup.getConnections(existingCell.charCode)
        : null;
    if (ec) {
        const dirs = ['up', 'down', 'left', 'right'];
        const merged = dirs.map(d => Math.max(conn[d], ec[d]));
        const restyled = dirs.map(d => conn[d] || (ec[d] ? style : 0));
        for (const c of [merged, restyled]) {
            const code = lookup.lookupChar(...c);
            if (code !== null) return code;
        }
    }
    return lookup.lookupChar(conn.up, conn.down, conn.left, conn.right);
}

// Compute all box-drawing characters for a rectangle, merging with existing box chars
function computeBoxChars(x1, y1, x2, y2, style, canvasCells, lookup) {
    const result = [];

    // Style 0 = no line: caller may still want fill, but no border chars
    if (style === 0) return result;

    // Single cell - no valid box char
    if (x1 === x2 && y1 === y2) return result;

    // The border cells (top and bottom rows, then the sides between them)
    // that are on the canvas: a box may reach past its edges
    const w = canvasCells[0].length, h = canvasCells.length;
    const border = [];
    for (let x = Math.max(x1, 0); x <= Math.min(x2, w - 1); x++) {
        border.push([x, y1]);
        if (y2 > y1) border.push([x, y2]);
    }
    for (let y = Math.max(y1 + 1, 0); y <= Math.min(y2 - 1, h - 1); y++) {
        border.push([x1, y]);
        if (x2 > x1) border.push([x2, y]);
    }
    for (const [x, y] of border) {
        const existingCell = canvasCells[y] && canvasCells[y][x];
        if (!existingCell) continue;
        const conn = getNewBoxConnections(x, y, x1, y1, x2, y2, style);
        const charCode = mergeWithExisting(conn, existingCell, style, lookup);
        if (charCode !== null) {
            result.push({ x, y, charCode });
        }
    }

    return result;
}

// Compute the cell path for a line from (x1,y1) to (x2,y2).
// Straight for H/V, S-shaped for diagonal: H-V-H when at least as wide as
// tall, else V-H-V, with the middle leg at the midpoint.
function computeLinePath(x1, y1, x2, y2) {
    let corners;
    if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
        const midX = Math.round((x1 + x2) / 2);
        corners = [[x1, y1], [midX, y1], [midX, y2], [x2, y2]];
    } else {
        const midY = Math.round((y1 + y2) / 2);
        corners = [[x1, y1], [x1, midY], [x2, midY], [x2, y2]];
    }

    // Walk each (axis-aligned) leg one cell at a time
    const path = [{ x: x1, y: y1 }];
    for (let i = 1; i < corners.length; i++) {
        let [x, y] = corners[i - 1];
        const [tx, ty] = corners[i];
        while (x !== tx || y !== ty) {
            x += Math.sign(tx - x);
            y += Math.sign(ty - y);
            path.push({ x, y });
        }
    }
    return path;
}

// Compute box-drawing characters along a line path, merging with existing chars
function computeLineChars(x1, y1, x2, y2, style, canvasCells, lookup) {
    if (style === 0) return [];
    const path = computeLinePath(x1, y1, x2, y2);
    if (path.length < 2) return [];

    const result = [];

    for (let i = 0; i < path.length; i++) {
        const { x, y } = path[i];
        const conn = { up: 0, down: 0, left: 0, right: 0 };

        // Connection from previous cell in path
        if (i > 0) {
            const prev = path[i - 1];
            if (prev.x < x) conn.left = style;
            else if (prev.x > x) conn.right = style;
            if (prev.y < y) conn.up = style;
            else if (prev.y > y) conn.down = style;
        }

        // Connection from next cell in path
        if (i < path.length - 1) {
            const next = path[i + 1];
            if (next.x > x) conn.right = style;
            else if (next.x < x) conn.left = style;
            if (next.y > y) conn.down = style;
            else if (next.y < y) conn.up = style;
        }

        const existingCell = canvasCells[y] && canvasCells[y][x];
        let charCode = null;

        // Endpoints: joined to a line already there (a T: ╠, ┯), or else
        // extended to a full segment (no half-line chars exist)
        const end = i === 0 ? path[1] : i === path.length - 1 ? path[i - 1] : null;
        if (end) {
            const joins = existingCell && existingCell.type !== 'block' && lookup.getConnections(existingCell.charCode);
            if (joins) charCode = mergeWithExisting(conn, existingCell, style, lookup);
            if (end.x !== x) { conn.left = style; conn.right = style; }
            if (end.y !== y) { conn.up = style; conn.down = style; }
        }
        if (charCode === null) charCode = mergeWithExisting(conn, existingCell, style, lookup);
        if (charCode !== null) {
            result.push({ x, y, charCode });
        }
    }

    return result;
}
