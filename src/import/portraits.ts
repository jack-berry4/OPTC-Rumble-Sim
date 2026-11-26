/**
 * Portrait matching for the screenshot import: a crop of a unit's portrait against the precomputed features of every
 * OPTC-DB thumbnail (public/import/portraits.bin, built by scripts/portraits/thumbs.py --features). The features are the
 * portrait's middle (BOX), averaged down to GRID x GRID, RGB, each channel normalized; compared by correlation.
 */

export interface PortraitIndex {
  n: number;
  grid: number;
  box: [number, number, number, number];
  ids: Float64Array;
  feats: Int8Array;
  norms: Float32Array;
}

let cached: Promise<PortraitIndex> | undefined;

export function loadPortraits(base = ""): Promise<PortraitIndex> {
  return (cached ??= (async () => {
    const [meta, bin] = await Promise.all([
      fetch(`${base}import/portraits.json`).then((r) => { if (!r.ok) throw new Error(`portraits.json: ${r.status}`); return r.json() as Promise<{ count: number; grid: number; box: [number, number, number, number] }>; }),
      fetch(`${base}import/portraits.bin`).then((r) => { if (!r.ok) throw new Error(`portraits.bin: ${r.status}`); return r.arrayBuffer(); }),
    ]);
    const head = new DataView(bin, 0, 12);
    const n = head.getUint32(0, true), grid = head.getUint32(4, true), ch = head.getUint32(8, true);
    // stored as float32: 4529.1 comes back as 4529.1000977, so round to the one decimal VS forms use
    const ids = Float64Array.from(new Float32Array(bin.slice(12, 12 + 4 * n)), (v) => Math.round(v * 10) / 10);
    const dim = grid * grid * ch;
    const feats = new Int8Array(bin, 12 + 4 * n, n * dim);
    const norms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = i * dim, e = k + dim; k < e; k++) s += feats[k]! * feats[k]!;
      norms[i] = Math.sqrt(s) || 1;
    }
    return { n, grid, box: meta.box, ids, feats, norms };
  })());
}

const scratch = typeof document !== "undefined" ? document.createElement("canvas") : undefined;

/**
 * Features of a square region (x, y, size) of a source image, like scripts/portraits/thumbs.py features(): the BOX part
 * of the square, resized to 4*GRID by the browser, then averaged in 4 x 4 blocks; per-channel normalized.
 */
export function regionFeatures(src: CanvasImageSource, x: number, y: number, w: number, h: number, idx: Pick<PortraitIndex, "grid" | "box">): Float32Array {
  const g = idx.grid, S = g * 4;
  const c = scratch!;
  c.width = S; c.height = S;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  const [l, t, r, b] = idx.box;
  ctx.drawImage(src, x + w * l, y + h * t, w * (r - l), h * (b - t), 0, 0, S, S);
  const px = ctx.getImageData(0, 0, S, S).data;
  const out = new Float32Array(g * g * 3);
  for (let gy = 0; gy < g; gy++) for (let gx = 0; gx < g; gx++) {
    let rr = 0, gg = 0, bb = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const o = ((gy * 4 + dy) * S + gx * 4 + dx) * 4;
      rr += px[o]!; gg += px[o + 1]!; bb += px[o + 2]!;
    }
    const k = (gy * g + gx) * 3;
    out[k] = rr / 16; out[k + 1] = gg / 16; out[k + 2] = bb / 16;
  }
  for (let ch = 0; ch < 3; ch++) {
    let m = 0;
    for (let k = ch; k < out.length; k += 3) m += out[k]!;
    m /= g * g;
    let v = 0;
    for (let k = ch; k < out.length; k += 3) v += (out[k]! - m) ** 2;
    const sd = Math.sqrt(v / (g * g)) + 1e-6;
    for (let k = ch; k < out.length; k += 3) out[k] = (out[k]! - m) / sd;
  }
  return out;
}

const normOf = (f: Float32Array) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i]! * f[i]!; return Math.sqrt(s) || 1; };

/** Correlation of features with every unit (or only `among`, by row index); top `k` as [row, score]. */
export function rank(idx: PortraitIndex, f: Float32Array, k: number, among?: number[]): [number, number][] {
  const dim = f.length, fn = normOf(f);
  const top: [number, number][] = [];
  const consider = (i: number) => {
    let s = 0;
    for (let d = 0, o = i * dim; d < dim; d++) s += idx.feats[o + d]! * f[d]!;
    s /= idx.norms[i]! * fn;
    if (top.length < k || s > top[top.length - 1]![1]) {
      top.push([i, s]);
      top.sort((a, b) => b[1] - a[1]);
      if (top.length > k) top.pop();
    }
  };
  if (among) for (const i of among) consider(i);
  else for (let i = 0; i < idx.n; i++) consider(i);
  return top;
}

export interface Match {
  /** Best unit id and its score (correlation, 1 = identical). */
  id: number;
  score: number;
  /** The next best, for a pick list. */
  alternatives: { id: number; score: number }[];
  /** Where the portrait was found (after the small search around the expected place). */
  x: number; y: number; size: number;
}

/**
 * Match a portrait expected at (x, y, size): rank everything at that spot, then search a little around it (position
 * and size; screenshots are a few pixels off) among the best few, and keep the best spot.
 */
export function matchTile(idx: PortraitIndex, src: CanvasImageSource, x: number, y: number, size: number, opts: { reach?: number; step?: number; sizes?: number[]; shortlist?: number } = {}): Match {
  const first = rank(idx, regionFeatures(src, x, y, size, size, idx), opts.shortlist ?? 30);
  const among = first.map(([i]) => i);
  let best = { scores: first, x, y, size };
  const reach = opts.reach ?? 6, step = opts.step ?? 2;
  for (const ds of opts.sizes ?? [-4, 0, 4]) {
    for (let dy = -reach; dy <= reach; dy += step) for (let dx = -reach; dx <= reach; dx += step) {
      if (!dx && !dy && !ds) continue;
      const s = size + ds;
      const r = rank(idx, regionFeatures(src, x + dx - ds / 2, y + dy - ds / 2, s, s, idx), 6, among);
      if (r[0]![1] > best.scores[0]![1]) best = { scores: r, x: x + dx - ds / 2, y: y + dy - ds / 2, size: s };
    }
  }
  const sc = best.scores;
  // a unit drawn with several arts has a row per art: list each unit once
  const seen = new Set<number>([idx.ids[sc[0]![0]]!]);
  const alternatives = sc.slice(1).filter(([i]) => !seen.has(idx.ids[i]!) && (seen.add(idx.ids[i]!), true)).slice(0, 5);
  return {
    id: idx.ids[sc[0]![0]]!, score: sc[0]![1],
    alternatives: alternatives.map(([i, s]) => ({ id: idx.ids[i]!, score: s })),
    x: best.x, y: best.y, size: best.size,
  };
}
