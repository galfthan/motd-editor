// Bitmap image import: an image converted to cells. Each cell gets the two
// colours that best fit its 2x3 subpixels, and the subpixels are dithered
// between them by error diffusion, in linear light.

const IMAGE_DITHERS = {
    'floyd-steinberg': { name: 'Floyd–Steinberg', kernel: [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]] },
    // Spreads only 3/4 of the error: crisper, with lighter shadows
    atkinson: { name: 'Atkinson', kernel: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]] },
    none: { name: 'No dither', kernel: [] }
};

// Colour distances weigh the channels by how bright they look
const LUMA = [0.299, 0.587, 0.114];

const SRGB_TO_LINEAR = Array.from({ length: 256 }, (_, i) => {
    const c = i / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

function linearToSrgb(v) {
    v = Math.min(1, Math.max(0, v));
    return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
}

// Rows for an image `cols` cells wide, keeping its proportions in cells of
// the given aspect (width / height)
function imageRows(image, cols, aspect) {
    return Math.max(1, Math.round(cols * aspect * image.height / image.width));
}

// Width in cells of the largest image that fits in maxCols x maxRows
function fitImageCols(image, aspect, maxCols, maxRows) {
    const cols = Math.min(maxCols, Math.floor(maxRows * image.width / (image.height * aspect)));
    return Math.max(1, cols);
}

// The image (anything drawImage takes) as a cols x rows array of cells, null
// where it is transparent (pasting leaves those cells alone). In cells along
// its edge, the transparent subpixels are cleared and the rest get one colour
// on the background already there (bg marked `keep`, see placeCell), so
// outlines keep subpixel detail.
// Options: mono (only the colours fg and bg), fg, bg and dither (a key of
// IMAGE_DITHERS).
function imageToCells(image, cols, rows, { mono = false, fg, bg, dither = 'floyd-steinberg' } = {}) {
    const W = cols * 2, H = rows * 3;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    // Linear colour per subpixel (r, g, b interleaved); err: the error
    // diffused into it so far
    const px = new Float32Array(W * H * 3), err = new Float32Array(W * H * 3);
    const opaque = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
        px[3 * i] = SRGB_TO_LINEAR[data[4 * i]];
        px[3 * i + 1] = SRGB_TO_LINEAR[data[4 * i + 1]];
        px[3 * i + 2] = SRGB_TO_LINEAR[data[4 * i + 2]];
        opaque[i] = data[4 * i + 3] >= 128 ? 1 : 0;
    }

    const toLinear = (col) => [col.r, col.g, col.b].map(v => SRGB_TO_LINEAR[v]);
    const monoPair = mono ? [toLinear(bg), toLinear(fg)] : null;
    // Mono dithers one value per subpixel: where it lies from bg (0) to fg
    // (1), as perceived. In colour, error the two colours can't pay off (a
    // yellow's blue, for grey ink) would pile up and darken everything.
    const level = mono ? monoLevels(px, W * H, ...monoPair) : null;
    const kernel = IMAGE_DITHERS[dither].kernel;
    const toColor = (v) => v ? { r: linearToSrgb(v[0]), g: linearToSrgb(v[1]), b: linearToSrgb(v[2]), default: false } : { ...defaultBG(), keep: true };
    const out = [];

    for (let cy = 0; cy < rows; cy++) {
        // Each cell's two colours, fitted to the image (with the diffused
        // error they would turn into a cell of the wrong colour, rather than
        // a pattern). An edge cell's (some subpixels transparent) are the
        // default background and its other subpixels' mean colour.
        const pairs = [], edge = [];
        for (let cx = 0; cx < cols; cx++) {
            const idx = [];
            for (let r = 0; r < 3; r++) idx.push((cy * 3 + r) * W + cx * 2, (cy * 3 + r) * W + cx * 2 + 1);
            const solid = idx.filter(i => opaque[i]);
            edge.push(solid.length < 6);
            pairs.push(solid.length === 0 ? null
                : monoPair || (solid.length < 6 ? [null, mean(px, solid)] : bestPair(px, idx)));
        }

        // Dither the band's three subpixel rows between them, serpentine
        const bits = new Uint8Array(cols * 6);
        for (let r = 0; r < 3; r++) {
            const sy = cy * 3 + r;
            const dir = sy % 2 ? -1 : 1;
            for (let n = 0; n < W; n++) {
                const sx = dir > 0 ? n : W - 1 - n;
                const pair = pairs[sx >> 1];
                const i = sy * W + sx;
                if (!pair || !opaque[i]) continue;
                if (level) {
                    const v = clamp(level[i] + err[3 * i]);
                    const on = v >= 0.5 ? 1 : 0;
                    bits[(sx >> 1) * 6 + r * 2 + (sx & 1)] = on;
                    for (let t = 0; t < kernel.length; t++) {
                        const x = sx + kernel[t][0] * dir, y = sy + kernel[t][1];
                        if (x >= 0 && x < W && y < H) err[3 * (y * W + x)] += (v - on) * kernel[t][2];
                    }
                    continue;
                }
                // Clamped, so error can't pile up where no colour can pay it off
                const v0 = clamp(px[3 * i] + err[3 * i]);
                const v1 = clamp(px[3 * i + 1] + err[3 * i + 1]);
                const v2 = clamp(px[3 * i + 2] + err[3 * i + 2]);
                const on = !pair[0] || dist(v0, v1, v2, pair[1]) < dist(v0, v1, v2, pair[0]) ? 1 : 0;
                bits[(sx >> 1) * 6 + r * 2 + (sx & 1)] = on;
                const q = pair[on], e0 = v0 - q[0], e1 = v1 - q[1], e2 = v2 - q[2];
                for (let t = 0; t < kernel.length; t++) {
                    const x = sx + kernel[t][0] * dir, y = sy + kernel[t][1], k = kernel[t][2];
                    if (x < 0 || x >= W || y >= H) continue;
                    const j = 3 * (y * W + x);
                    err[j] += e0 * k;
                    err[j + 1] += e1 * k;
                    err[j + 2] += e2 * k;
                }
            }
        }

        out.push(pairs.map((pair, cx) => {
            if (!pair) return null;
            const cell = createCell();
            const set = bits.subarray(cx * 6, cx * 6 + 6);
            cell.subpixels = [[!!set[0], !!set[1]], [!!set[2], !!set[3]], [!!set[4], !!set[5]]];
            if (mono) {
                cell.fg = { ...fg };
                cell.bg = { ...bg };
                return cell;
            }
            const b = toColor(pair[0]), f = toColor(pair[1]);
            // One colour only (not at the edge): an empty cell with that background
            const count = set[0] + set[1] + set[2] + set[3] + set[4] + set[5];
            const same = f.r === b.r && f.g === b.g && f.b === b.b;
            if (!edge[cx] && (count === 0 || count === 6 || same)) {
                cell.subpixels = [[false, false], [false, false], [false, false]];
                cell.bg = count === 6 ? f : b;
                return cell;
            }
            cell.fg = f;
            cell.bg = b;
            return cell;
        }));
    }
    return out;
}

// Each of n pixels' position from colour a (0) to b (1), projected onto the
// line between them with the channels weighted as in dist
function monoLevels(px, n, a, b) {
    const d = [0, 1, 2].map(c => b[c] - a[c]);
    const len = LUMA[0] * d[0] * d[0] + LUMA[1] * d[1] * d[1] + LUMA[2] * d[2] * d[2];
    const level = new Float32Array(n);
    if (len === 0) return level;
    for (let i = 0; i < n; i++) {
        let t = 0;
        for (let c = 0; c < 3; c++) t += LUMA[c] * (px[3 * i + c] - a[c]) * d[c];
        level[i] = clamp(t / len);
    }
    return level;
}

function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function dist(r, g, b, q) {
    return LUMA[0] * (r - q[0]) ** 2 + LUMA[1] * (g - q[1]) ** 2 + LUMA[2] * (b - q[2]) ** 2;
}

// Mean colour of the subpixels idx
function mean(px, idx) {
    let r = 0, g = 0, b = 0;
    for (const i of idx) {
        r += px[3 * i];
        g += px[3 * i + 1];
        b += px[3 * i + 2];
    }
    return [clamp(r / idx.length), clamp(g / idx.length), clamp(b / idx.length)];
}

// The two colours that best fit the six subpixels idx: the means of the best
// split of them into two groups, out of all 31 (subpixel 5 stays in group 0)
function bestPair(px, idx) {
    let tr = 0, tg = 0, tb = 0;
    for (const i of idx) {
        tr += px[3 * i];
        tg += px[3 * i + 1];
        tb += px[3 * i + 2];
    }
    // Least squared error = most of sum(S^2 / n) over the two groups, with S
    // a group's colour sum and n its size
    const fit = (r, g, b, n) => (LUMA[0] * r * r + LUMA[1] * g * g + LUMA[2] * b * b) / n;
    const single = fit(tr, tg, tb, 6);
    let best = single, bestMask = 0;
    for (let mask = 1; mask < 32; mask++) {
        let n = 0, r = 0, g = 0, b = 0;
        for (let k = 0; k < 5; k++) {
            if (!((mask >> k) & 1)) continue;
            const i = 3 * idx[k];
            n++;
            r += px[i];
            g += px[i + 1];
            b += px[i + 2];
        }
        const score = fit(r, g, b, n) + fit(tr - r, tg - g, tb - b, 6 - n);
        if (score > best + 1e-6) {
            best = score;
            bestMask = mask;
        }
    }
    if (!bestMask) {
        const one = mean(px, idx);
        return [one, one];
    }
    return [mean(px, idx.filter((_, k) => !((bestMask >> k) & 1))), mean(px, idx.filter((_, k) => (bestMask >> k) & 1))];
}
