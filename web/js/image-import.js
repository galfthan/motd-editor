// Bitmap image import: an image converted to cells. Each cell gets the two
// colours that best fit its 2xR subpixels (R = blockRows: 2 quadrants, 3
// sextants, 4 octants), and the subpixels are dithered
// between them by error diffusion, in linear light.

// Atkinson's error diffusion: spreads only 3/4 of the error, so it stays crisp
const DITHER_KERNEL = [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];

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

// Cells whose paper is the mean colour of the image's opaque subpixels
// there (null where most of the cell is transparent), snapped (see
// imagePalette)
function paperCells(px, opaque, cols, rows, R, snap) {
    const W = cols * 2;
    return Array.from({ length: rows }, (_, cy) => Array.from({ length: cols }, (_, cx) => {
        const idx = [];
        for (let r = 0; r < R; r++) {
            for (let c = 0; c < 2; c++) {
                const i = (cy * R + r) * W + cx * 2 + c;
                if (opaque[i]) idx.push(i);
            }
        }
        if (idx.length < R) return null;
        const v = snap(mean(px, idx));
        const cell = createCell();
        cell.bg = { r: linearToSrgb(v[0]), g: linearToSrgb(v[1]), b: linearToSrgb(v[2]), default: false };
        return cell;
    }));
}

// A table from an sRGB channel value (0-255) to linear light, after the tone
// adjustments, each -100 to 100 (0: none): brightness shifts every value,
// contrast spreads them from or squeezes them to the middle, and midtones
// lightens or darkens the middle while black and white stay; invert first
// turns the image into its negative
function toneToLinear({ brightness = 0, contrast = 0, midtones = 0, invert = false } = {}) {
    if (!brightness && !contrast && !midtones && !invert) return SRGB_TO_LINEAR;
    const spread = contrast >= 0 ? 1 + contrast / 50 : 1 + contrast / 100;
    const gamma = 2 ** (-midtones / 50);
    return SRGB_TO_LINEAR.map((_, i) => {
        let v = invert ? 1 - i / 255 : i / 255;
        v = Math.min(1, Math.max(0, (v - 0.5) * spread + 0.5 + brightness / 200)) ** gamma;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
}

// The image's pixels (RGBA), at most IMAGE_SOURCE_MAX on its longer side;
// kept for the next conversion of the same image (a resize)
const IMAGE_SOURCE_MAX = 1600;
const imageSources = new WeakMap();
function imagePixels(image) {
    if (!imageSources.has(image)) {
        const scale = Math.min(1, IMAGE_SOURCE_MAX / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        imageSources.set(image, ctx.getImageData(0, 0, canvas.width, canvas.height));
    }
    return imageSources.get(image);
}

// The main colours of a simple cut-out image, like a logo with a
// transparent background: when it has transparent pixels and at most 8
// colours (to 4 bits a channel) make up 97% of its opaque ones, their mean
// sRGB values, else null. Cell colours snap to them: its edges were blended
// (anti-aliased) with a background it no longer has, which would leave a
// fringe of that colour. (With a background of its own, the blends are
// smooth edges.)
const imagePalettes = new WeakMap();
function imagePalette(image) {
    if (!imagePalettes.has(image)) {
        const { data } = imagePixels(image);
        const buckets = new Map();
        let total = 0, cutOut = false;
        for (let j = 0; j < data.length; j += 4) {
            if (data[j + 3] < 128) {
                cutOut = true;
                continue;
            }
            const key = (data[j] >> 4) << 8 | (data[j + 1] >> 4) << 4 | data[j + 2] >> 4;
            const b = buckets.get(key) || buckets.set(key, [0, 0, 0, 0]).get(key);
            b[0]++; b[1] += data[j]; b[2] += data[j + 1]; b[3] += data[j + 2];
            total++;
        }
        const main = [...buckets.values()].sort((a, b) => b[0] - a[0]);
        let palette = [], covered = 0;
        for (const [n, r, g, b] of main) {
            if (covered >= 0.97 * total) break;
            if (palette.length === 8) { palette = null; break; }
            palette.push([r / n, g / n, b / n].map(Math.round));
            covered += n;
        }
        imagePalettes.set(image, cutOut && total ? palette : null);
    }
    return imagePalettes.get(image);
}

// All of an image (see imageToCells' crop)
const FULL_CROP = Object.freeze({ x1: 0, y1: 0, x2: 1, y2: 1 });

// An image's size in pixels with a crop: { width, height }, as imageRows
// and fitImageCols take it
function croppedSize(image, crop = FULL_CROP) {
    return { width: image.width * (crop.x2 - crop.x1), height: image.height * (crop.y2 - crop.y1) };
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
// Options: mono (only the colours fg and bg), paperOnly (each cell just its
// paper, the mean colour of the image there), fg, bg, strength (0-1: how
// much of the error is diffused; 0, none), crop (the part of the image to
// use, as fractions of it: { x1, y1, x2, y2 }),
// blockRows (subpixel rows per cell) and the tone (see toneToLinear).
function imageToCells(image, cols, rows, { mono = false, paperOnly = false, fg, bg, strength = 1, crop = FULL_CROP, blockRows: R = 3, ...tone } = {}) {
    const W = cols * 2, H = rows * R, N = 2 * R;
    // Linear colour per subpixel (r, g, b interleaved); err: the error
    // diffused into it so far
    const px = new Float32Array(W * H * 3), err = new Float32Array(W * H * 3);
    const opaque = new Uint8Array(W * H);
    const toLinearToned = toneToLinear(tone);
    // Each subpixel the mean of the image's pixels it covers, weighted by
    // their opacity (a browser's own scaling overshoots at sharp edges,
    // leaving light or dark fringes)
    const { data, width: sw, height: sh } = imagePixels(image);
    // The source pixels from `from` (a fraction of `size`) over `span` of
    // them, for unit i of n: [start, end)
    const bin = (i, n, from, span, size) => {
        const a = Math.min(size - 1, Math.floor(from * size + i * span * size / n));
        return [a, Math.min(size, Math.max(a + 1, Math.floor(from * size + (i + 1) * span * size / n)))];
    };
    for (let y = 0; y < H; y++) {
        const [y0, y1] = bin(y, H, crop.y1, crop.y2 - crop.y1, sh);
        for (let x = 0; x < W; x++) {
            const [x0, x1] = bin(x, W, crop.x1, crop.x2 - crop.x1, sw);
            let a = 0, r = 0, g = 0, b = 0;
            for (let v = y0; v < y1; v++) {
                for (let u = x0, j = 4 * (v * sw + x0); u < x1; u++, j += 4) {
                    const w = data[j + 3];
                    if (!w) continue;
                    a += w;
                    r += w * toLinearToned[data[j]];
                    g += w * toLinearToned[data[j + 1]];
                    b += w * toLinearToned[data[j + 2]];
                }
            }
            const i = y * W + x;
            if (a) {
                px[3 * i] = r / a;
                px[3 * i + 1] = g / a;
                px[3 * i + 2] = b / a;
            }
            opaque[i] = a >= 128 * (x1 - x0) * (y1 - y0) ? 1 : 0;
        }
    }

    // A simple image's colours (see imagePalette)
    const palette = imagePalette(image)?.map(c => c.map(v => toLinearToned[v]));
    const snap = (v) => !palette || !v ? v : palette.reduce((best, q) => dist(v[0], v[1], v[2], q) < dist(v[0], v[1], v[2], best) ? q : best);
    if (paperOnly) return paperCells(px, opaque, cols, rows, R, snap);
    const toLinear = (col) => [col.r, col.g, col.b].map(v => SRGB_TO_LINEAR[v]);
    const monoPair = mono ? [toLinear(bg), toLinear(fg)] : null;
    // Mono dithers one value per subpixel: where it lies from bg (0) to fg
    // (1), as perceived. In colour, error the two colours can't pay off (a
    // yellow's blue, for grey ink) would pile up and darken everything.
    const level = mono ? monoLevels(px, W * H, ...monoPair) : null;
    const kernel = strength ? DITHER_KERNEL.map(([dx, dy, k]) => [dx, dy, k * strength]) : [];
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
            for (let r = 0; r < R; r++) idx.push((cy * R + r) * W + cx * 2, (cy * R + r) * W + cx * 2 + 1);
            const solid = idx.filter(i => opaque[i]);
            edge.push(solid.length < N);
            pairs.push(solid.length === 0 ? null
                : monoPair || (solid.length < N ? [null, mean(px, solid)] : bestPair(px, idx)).map(snap));
        }

        // Dither the band's subpixel rows between them, serpentine
        const bits = new Uint8Array(cols * N);
        for (let r = 0; r < R; r++) {
            const sy = cy * R + r;
            const dir = sy % 2 ? -1 : 1;
            for (let n = 0; n < W; n++) {
                const sx = dir > 0 ? n : W - 1 - n;
                const pair = pairs[sx >> 1];
                const i = sy * W + sx;
                if (!pair || !opaque[i]) continue;
                if (level) {
                    const v = clamp(level[i] + err[3 * i]);
                    const on = v >= 0.5 ? 1 : 0;
                    bits[(sx >> 1) * N + r * 2 + (sx & 1)] = on;
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
                bits[(sx >> 1) * N + r * 2 + (sx & 1)] = on;
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

        const row = pairs.map((pair, cx) => {
            if (!pair) return null;
            const cell = createCell();
            const set = bits.subarray(cx * N, cx * N + N);
            cell.subpixels = Array.from({ length: R }, (_, r) => [!!set[2 * r], !!set[2 * r + 1]]);
            if (mono) {
                cell.fg = { ...fg };
                cell.bg = { ...bg };
                return cell;
            }
            const b = toColor(pair[0]), f = toColor(pair[1]);
            // One colour only (not at the edge): an empty cell with that
            // background (its ink is unseen: see below)
            const count = set.reduce((a, v) => a + v, 0);
            const same = f.r === b.r && f.g === b.g && f.b === b.b;
            if (!edge[cx] && (count === 0 || count === N || same)) {
                cell.subpixels = patternToSubpixels(0, R);
                cell.bg = count === N ? f : b;
                cell.blank = true;
                return cell;
            }
            cell.fg = f;
            cell.bg = b;
            return cell;
        });
        // An empty cell's ink doesn't show: it takes the one before it, so
        // the ANSI export (which keeps every colour) needn't switch for it
        let ink = null;
        for (const cell of row) {
            if (!cell) continue;
            if (cell.blank) {
                delete cell.blank;
                if (ink) cell.fg = { ...ink };
            } else {
                ink = cell.fg;
            }
        }
        out.push(row);
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

// The two colours that best fit the subpixels idx: the means of the best
// split of them into two groups, out of all (the last stays in group 0)
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
    const n0 = idx.length, single = fit(tr, tg, tb, n0);
    let best = single, bestMask = 0;
    for (let mask = 1; mask < 1 << (n0 - 1); mask++) {
        let n = 0, r = 0, g = 0, b = 0;
        for (let k = 0; k < n0 - 1; k++) {
            if (!((mask >> k) & 1)) continue;
            const i = 3 * idx[k];
            n++;
            r += px[i];
            g += px[i + 1];
            b += px[i + 2];
        }
        const score = fit(r, g, b, n) + fit(tr - r, tg - g, tb - b, n0 - n);
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
