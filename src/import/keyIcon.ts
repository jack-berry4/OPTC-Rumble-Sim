/**
 * The Rumble key icon on a unit tile (under the Limit Break badge, top right). Pixels only, no text reading, so it is
 * cheap enough for every frame of a box video. See keyLook below for what the icon looks like.
 *
 * Game facts (user, 2026-11-25):
 * - The icon itself doesn't animate. Effects nearby do and can spill over it, which is the outline's side turning
 *   orange in some video frames. So one red side is enough, and a video votes over all of a unit's frames.
 * - A 6★ at gold "Lv.MAX" is level 99 and can't have a key. Only 5★ units have keys at 99 (infer.ts drops a key read
 *   below the unit's key level).
 * - The grey "not yet" icon is slightly see-through. Over bright art it can read as no icon, which gives the same
 *   build (no key).
 */
import type { KeyState } from "./infer";

/** A tile: its top-left corner and size (game frame pixels). */
export interface TileBox { x: number; y: number; size: number }

type Frac = readonly [number, number, number, number];
/**
 * Parts of the icon as fractions of the tile, where the importer's places put it (a box screen's rows found from the
 * separators and aligned by portrait, team screens' fixed places).
 */
const ICON = {
  /** The red outline's bottom edge (red all along in both on and possible icons). */
  bottom: [0.80, 0.375, 0.97, 0.405],
  /** Its left and right sides (lower half: the top of the outline is gold). */
  left: [0.77, 0.25, 0.825, 0.365],
  right: [0.925, 0.285, 0.98, 0.365],
  /** The swords' middle: gold = key on, dark grey = possible. */
  inner: [0.83, 0.255, 0.92, 0.365],
  /** The outline's top: a yellow arc (on and possible). */
  top: [0.80, 0.225, 0.95, 0.265],
  /** The whole icon. */
  all: [0.775, 0.22, 0.98, 0.405],
} as const satisfies Record<string, Frac>;
/** How far the icon is looked for around its place (fractions of the tile): placement drift between frames. */
const REACH = { x: [-0.05, 0.05], y: [-0.04, 0.08] } as const;

/** The outline's red (pinkish on the left; not skin pink, not the star's orange-yellow). */
const isRed = (r: number, g: number, b: number) => r > 110 && r - g > 60 && g < 0.6 * r && b < 0.5 * r;
const isYellow = (r: number, g: number, b: number) => r > 160 && g > 0.72 * r && b < 0.6 * g;
/** The swords when the key is on: gold / yellow (light, warm, little blue). */
const isGold = (r: number, g: number, b: number) => r > 140 && g > 95 && r - b > 70 && g - b > 40;
/** The swords when not keyed: dark, little color. */
const isDark = (r: number, g: number, b: number) => Math.max(r, g, b) < 125 && Math.max(r, g, b) - Math.min(r, g, b) < 45;
/** The grey icon (no key yet): grey, little color. */
const isGrey = (r: number, g: number, b: number) => Math.max(r, g, b) < 170 && Math.max(r, g, b) - Math.min(r, g, b) < 40;
const TESTS = [isRed, isYellow, isGold, isDark, isGrey];
const [RED, YELLOW, GOLD, DARK, GREY] = [0, 1, 2, 3, 4];

export interface KeyLook {
  state: KeyState;
  /** Where the icon was found (offset from its place, in tile fractions). */
  dx: number; dy: number;
  /** Shares: red at the outline's bottom / left / right and in the swords' middle; yellow at the outline's top; gold /
   *  dark in the swords' middle; grey: the least grey share of the whole icon, its bottom and middle (best spot). */
  bottom: number; left: number; right: number; innerRed: number; top: number; gold: number; dark: number; grey: number;
}

/** Shares of pixels passing each test in a part of the tile (moved by dx, dy): summed-area tables, read once. */
function sampler(c: HTMLCanvasElement, p: TileBox) {
  const x0 = Math.floor(p.x + (ICON.all[0] - 0.01 + REACH.x[0]) * p.size), y0 = Math.floor(p.y + (ICON.all[1] - 0.01 + REACH.y[0]) * p.size);
  const x1 = Math.ceil(p.x + (ICON.all[2] + 0.01 + REACH.x[1]) * p.size), y1 = Math.ceil(p.y + (ICON.all[3] + 0.01 + REACH.y[1]) * p.size);
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), W = w + 1;
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(x0, y0, w, h).data;
  const sums = TESTS.map(() => new Int32Array(W * (h + 1)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, r = d[o]!, g = d[o + 1]!, b = d[o + 2]!;
      const k = (y + 1) * W + x + 1;
      for (let t = 0; t < TESTS.length; t++) {
        const s = sums[t]!;
        s[k] = (TESTS[t]!(r, g, b) ? 1 : 0) + s[k - 1]! + s[k - W]! - s[k - W - 1]!;
      }
    }
  }
  return (t: number, f: Frac, dx: number, dy: number) => {
    const clampX = (v: number) => Math.max(0, Math.min(w, Math.round(p.x + v * p.size) - x0));
    const clampY = (v: number) => Math.max(0, Math.min(h, Math.round(p.y + v * p.size) - y0));
    const ax = clampX(f[0] + dx), ex = Math.max(ax + 1, clampX(f[2] + dx)), by = clampY(f[1] + dy), zy = Math.max(by + 1, clampY(f[3] + dy));
    const s = sums[t]!;
    return (s[zy * W + ex]! - s[by * W + ex]! - s[zy * W + ax]! + s[by * W + ax]!) / ((ex - ax) * (zy - by));
  };
}

/**
 * The Rumble key icon (user, 2026-11-24; measured 2026-11-25): a crossed-swords badge under the Limit Break badge.
 * - key on: gold swords inside an outline that is a yellow arc at the top and red down the sides and along the bottom;
 * - a key possible but not added: the same outline, dark grey swords;
 * - no key yet (below the key's level: 6*: 120, 5*: 99; infer.ts checks the level): the whole icon grey, no red
 *   ("locked");
 * - units with no key: no icon ("none"; also when the icon isn't found).
 * The icon is looked for around its place: the place drifts a few pixels between screenshots and video frames (and the
 * first measurement, 2026-11-24, was taken against a place ~6 px higher than the one the importer uses: most keys then
 * missed the red bottom edge). Measured shares: see the note above keyState in tileRead.ts.
 */
export function keyLook(c: HTMLCanvasElement, p: TileBox): KeyLook {
  const share = sampler(c, p);
  const step = 1 / p.size;
  let best: KeyLook | undefined, bestScore = -Infinity;
  for (let dy = REACH.y[0]; dy <= REACH.y[1] + 1e-9; dy += step) {
    for (let dx = REACH.x[0]; dx <= REACH.x[1] + 1e-9; dx += step) {
      const bottom = share(RED, ICON.bottom, dx, dy), left = share(RED, ICON.left, dx, dy), right = share(RED, ICON.right, dx, dy);
      const innerRed = share(RED, ICON.inner, dx, dy), top = share(YELLOW, ICON.top, dx, dy);
      const gold = share(GOLD, ICON.inner, dx, dy), dark = share(DARK, ICON.inner, dx, dy);
      // an outline around swords: red bottom and sides (one side can be lit up by the icon's shine), a yellow top, and
      // a gold or dark middle that isn't red
      const score = Math.min(bottom, Math.max(left, right)) + 0.25 * (bottom + left + right) + 0.5 * Math.min(top, 0.6) + 0.5 * Math.min(gold + dark, 0.6) - Math.max(0, innerRed - 0.3);
      if (score > bestScore) {
        bestScore = score;
        best = { state: "none", dx, dy, bottom, left, right, innerRed, top, gold, dark, grey: 0 };
      }
    }
  }
  const k = best!;
  // the grey icon: grey all over (bottom edge and middle too), looked for near where the icons sit
  for (let dy = -0.01; dy <= 0.03 + 1e-9; dy += step) {
    for (let dx = 0; dx <= 0.02 + 1e-9; dx += step) {
      k.grey = Math.max(k.grey, Math.min(share(GREY, ICON.all, dx, dy), share(GREY, ICON.bottom, dx, dy), share(GREY, ICON.inner, dx, dy)));
    }
  }
  const ring = k.bottom >= 0.5 && Math.max(k.left, k.right) >= 0.45 && k.top >= 0.3 && k.gold + k.dark >= 0.45 && k.innerRed < 0.4;
  k.state = ring ? (k.gold > k.dark && k.gold >= 0.2 ? "on" : "possible") : k.grey >= 0.7 ? "locked" : "none";
  return k;
}

export function keyState(c: HTMLCanvasElement, p: TileBox): KeyState {
  return keyLook(c, p).state;
}

/**
 * One reading from the key icons a box video showed of a tile on its frames: the red outline (on / possible) when at
 * least a third of the frames show it (a frame mid-scroll or under the screen's top bar can miss it), on vs possible
 * by majority; else the grey icon on a third; else none. Undefined when on and possible tie (the caller keeps its own
 * reading) or nothing was seen.
 */
export function voteKey(seen: readonly KeyState[]): KeyState | undefined {
  if (!seen.length) return undefined;
  const n = (s: KeyState) => seen.filter((x) => x === s).length;
  const on = n("on"), possible = n("possible");
  if (3 * (on + possible) >= seen.length) return on > possible ? "on" : possible > on ? "possible" : undefined;
  return 3 * n("locked") >= seen.length ? "locked" : "none";
}
