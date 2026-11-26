/**
 * The numbers on a unit tile and on the two Character Details pages (docs/IMPORT_PLAN.md). Tile parts are given as
 * fractions of the tile's size (the same tile is drawn at 68-112 px on the different screens); unit pages are fixed
 * places in the 640 x 960 game frame. Measured on the 2026-11-22 / 23 screenshots and box video.
 */
import type { Seen } from "./infer";
import { keyState } from "./keyIcon";
import { DIGITS, glyphs, numberIn, readBox, readText, textMask, type TextLook } from "./ocr";
import type { Place, ScreenKind } from "./screens";

type Frac = readonly [number, number, number, number];
const TILE = {
  /** "+574" (yellow). */
  cc: [0.25, 0.02, 0.79, 0.29],
  /** The circle at the bottom left: how many sockets have levels (white). */
  sockets: [0.01, 0.79, 0.18, 0.97],
  /** The Limit Break badge's text (top right; "MAX" or a number, white or gold). */
  lbBadge: [0.78, 0.05, 0.99, 0.23],
  /** The middle of the badge's letters (white vs gold, clear of the badge's gold ring and the portrait). */
  lbLetters: [0.80, 0.09, 0.95, 0.19],
  /** The whole "MAX" (its "M" sits left of lbBadge), for reading the text. */
  lbText: [0.70, 0.06, 0.97, 0.21],
  /** "Lv.130" / "Lv.MAX" (red or yellow, dark outline). */
  level: [0.39, 0.78, 0.93, 0.99],
  /** The level's digits / MAX alone (no "Lv."). */
  levelDigits: [0.44, 0.76, 0.98, 1.0],
  /** Leader pin above the tile (GP): peach face and white arc. */
  pinFace: [0.26, -0.09, 0.65, 0.06],
  pinArc: [0.24, -0.19, 0.68, -0.04],
} as const satisfies Record<string, Frac>;
/** Team edit: the panel under each tile. Row 1-4 are HP / ATK / RCV / CP, or SP / ABL / DEF / SPD. */
const EDIT = {
  cost: [0.55, 1.03, 0.97, 1.19],
  label: [0.0, 1.23, 0.33, 1.40],
  rows: [[0.36, 1.23, 0.99, 1.40], [0.36, 1.41, 0.99, 1.58], [0.36, 1.57, 0.99, 1.73], [0.25, 1.73, 0.99, 1.90]],
} as const;

const abs = (p: Pick<Place, "x" | "y" | "size">, f: Frac) => [p.x + f[0] * p.size, p.y + f[1] * p.size, p.x + f[2] * p.size, p.y + f[3] * p.size];

/** Pixels of a box (game frame). */
function pixels(c: HTMLCanvasElement, b: number[]) {
  const [x0, y0, x1, y1] = b.map(Math.round) as [number, number, number, number];
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  return { d: c.getContext("2d", { willReadFrequently: true })!.getImageData(x0, y0, w, h).data, n: w * h };
}

/**
 * The Rumble key icon (user, 2026-11-24): grey icon = the unit has a key but not at this level yet (6*: 120, 5*: 99);
 * red outline with dark swords = a key is possible but not added; red outline with gold swords = the key is on; no
 * icon = the unit has no key. Read in keyIcon.ts (keyLook / keyState). Measured 2026-11-25 (49.webp, box-keys.webp,
 * the 2026-11-22 / 23 / 24 box videos and team screens), in the importer's own places:
 * - the icon spans x 0.77-0.99, y 0.20-0.415 of the tile (red bottom edge 0.375-0.405). The first version (2026-11-24)
 *   measured it against a place ~6 px (0.06) higher than the importer's, so its box sat below the icon: on 49.webp
 *   (20 keys on) the red bottom-edge share came out 0.04-0.17 on 10 tiles (read "none", needs 0.3) and the swords'
 *   gold 0.11-0.14 on 9 more (read "possible", needs 0.15: the box took in the outline and the tile under the icon);
 *   1 read "on". The icon is now looked for within -0.04..+0.08 down and -0.05..+0.05 across (found within
 *   -0.01..+0.03 down and -0.04..+0.05 across on every sample: the GP screen's places sit furthest off);
 * - at the icon: red bottom edge 0.65-1.0 (elsewhere under 0.55); red sides: one 0.45+, often both (on a box video the
 *   right side's red comes and goes between frames of the same tile: an animation, maybe a shine); yellow top arc 0.34-0.78; swords' middle gold
 *   0.5-0.8 with dark 0 when on, dark 0.45-0.85 with gold under 0.2 when possible; a grey icon 0.8+ grey (0.55 over a
 *   bright portrait: then it reads as no icon, which means no key just the same);
 * - skin pink and the star's orange are not the outline's red (b < 0.5 r, g < 0.6 r);
 * - the same at 68 px tiles (VS / GP) and in 540 px-wide videos; a box video reads every frame and takes the majority.
 */
export { keyState };

/** How much the tile looks like it has the GP leader pin above it (0 = none; over ~1 = the pin). */
export function leaderScore(c: HTMLCanvasElement, p: Place): number {
  const face = pixels(c, abs(p, TILE.pinFace));
  let peach = 0;
  for (let i = 0; i < face.d.length; i += 4) {
    const r = face.d[i]!, g = face.d[i + 1]!, b = face.d[i + 2]!;
    if (r > 235 && g > 185 && g < 240 && b > 145 && b < 228 && r - b > 22) peach++;
  }
  const arc = pixels(c, abs(p, TILE.pinArc));
  let white = 0;
  for (let i = 0; i < arc.d.length; i += 4) if (arc.d[i]! > 220 && arc.d[i + 1]! > 220 && arc.d[i + 2]! > 220) white++;
  // measured at 68 px tiles: the pin 46-55 peach + 22-25 white; anything else at most 12 + 0
  const k = (68 / p.size) ** 2;
  return Math.min(peach * k / 30, 1) + Math.min(white * k / 12, 1);
}

export type InkColor = "red" | "gold" | "white";
/**
 * The color inside a text's letters (the mask's ink, within `gs` when given: not the icons next to it). Red: a level at
 * its max (MAX after LLB, or a number at its LLB's max); gold: below the max (MAX = the 99 cap before LLB); white:
 * Lv.1. Measured on a 190 px box screenshot, 2026-11-24.
 */
function inkColor(c: HTMLCanvasElement, b: number[], m: HTMLCanvasElement, gs?: Glyph[]): InkColor | undefined {
  const w = m.width - 24, h = m.height - 24;
  const md = m.getContext("2d", { willReadFrequently: true })!.getImageData(12, 12, w, h).data;
  const t = document.createElement("canvas");
  t.width = w; t.height = h;
  const tc = t.getContext("2d", { willReadFrequently: true })!;
  tc.imageSmoothingEnabled = true;
  tc.imageSmoothingQuality = "high";
  const [x0, y0, x1, y1] = b.map(Math.round) as [number, number, number, number];
  tc.drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
  const d = tc.getImageData(0, 0, w, h).data;
  let r = 0, g = 0, bl = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (md[i]! >= 128) continue;
      if (gs && !gs.some((q) => x + 12 >= q.x0 && x + 12 <= q.x1 && y + 12 >= q.y0 && y + 12 <= q.y1)) continue;
      r += d[i]!; g += d[i + 1]!; bl += d[i + 2]!; n++;
    }
  }
  if (n < 40 || !r) return undefined;
  if (bl / r > 0.8 && g / r > 0.85) return "white";
  // red letters have a pale highlight (blue near green): (green - blue) / red -0.02-0.13; gold 0.22-0.49
  return (g - bl) / r < 0.17 ? "red" : "gold";
}

/** Readings by how many tries agreed (ties: the longer one: a digit lost is more common than one made up). */
function ranked(texts: string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of texts) if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([t]) => t);
}

/** Read a box several ways and keep what most agree on (after `clean`; empty / invalid readings don't vote). */
async function readVoted(c: HTMLCanvasElement, b: number[], tries: readonly (readonly [TextLook, number])[], chars: string, clean: (t: string) => string | undefined) {
  return (await readRanked(c, b, tries, chars, clean))[0];
}
async function readRanked(c: HTMLCanvasElement, b: number[], tries: readonly (readonly [TextLook, number])[], chars: string, clean: (t: string) => string | undefined) {
  const out: string[] = [];
  for (const [look, scale] of tries) {
    const t = await readBox(c, b, look, { chars, scale });
    const v = clean(t.text.replace(/\s/g, ""));
    if (v) out.push(v);
  }
  return ranked(out);
}

const scaleFor = (p: Place) => (p.size < 80 ? 6 : 4);

type Glyph = ReturnType<typeof glyphs>[number];
/**
 * The letters of a line of text: shapes at least 0.7 as tall as the lowest of the tallest ones and on its baseline (drops the
 * icons beside a level, which sit higher, and the gaps closed in between two close digits, which are shorter).
 */
function textGlyphs(m: HTMLCanvasElement): Glyph[] {
  const all = glyphs(m);
  if (!all.length) return all;
  const maxH = Math.max(...all.map((g) => g.y1 - g.y0));
  const ref = all.filter((g) => g.y1 - g.y0 >= 0.8 * maxH).reduce((a, g) => (g.y1 > a.y1 ? g : a));
  const H = ref.y1 - ref.y0;
  return all.filter((g) => g.y1 - g.y0 >= 0.7 * H && Math.abs(g.y1 - ref.y1) <= 0.25 * H);
}

export interface LevelRead { level: number | "max"; color?: InkColor }
/**
 * A tile's level from the shapes of its letters (tesseract alone drops the thin "1" of this font): "MAX" has a wide
 * letter (M ~0.9, "AX" merged ~1.45 wide per height), a level of 100+ is three glyphs starting with a thin "1"
 * (~0.4), so only the last two digits are read. With the letters' color (see inkColor).
 */
async function readLevel(c: HTMLCanvasElement, p: Place): Promise<LevelRead | undefined> {
  // the digits are red, gold or white
  const box = abs(p, TILE.levelDigits);
  const { d } = pixels(c, box);
  let red = 0, yellow = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    if (r > 140 && r - g > 60 && r - b > 50) red++;
    if (r > 170 && g > 140 && b < 150 && r - b > 70) yellow++;
  }
  // the outline reading first (best on the samples); the ink color alone when it reads nothing
  const first = await readLevelWith(c, p, box, "outline");
  if (first) return first;
  const look: TextLook | undefined = red > 1.5 * yellow ? "red" : yellow > 1.5 * red ? "yellow" : undefined;
  // only a number from it: two thin digits can merge into one wide glyph there and pass for MAX
  const again = look ? await readLevelWith(c, p, box, look) : undefined;
  return again && typeof again.level === "number" ? again : undefined;
}
const ratio = (g: Glyph) => (g.x1 - g.x0) / Math.max(1, g.y1 - g.y0);
/**
 * Digits from a mask: this font's "1" is a thin glyph (0.32-0.42 wide per height, every other digit 0.55+), taken by
 * its shape (tesseract misses it); the others are read together (one at a time reads worse). Undefined when the
 * reading doesn't give one digit per glyph.
 */
async function readDigits(m: HTMLCanvasElement, gs: Glyph[]): Promise<string | undefined> {
  const wide = gs.filter((g) => ratio(g) >= 0.5);
  let t = "";
  if (wide.length) {
    const from = wide[0]!, to = wide.at(-1)!;
    // tesseract is touchy about the margin: a second try with more of it
    for (const pad of [6, 14]) {
      const sub = document.createElement("canvas");
      const sw = to.x1 - from.x0 + 2 * pad + 24, sh = m.height;
      sub.width = sw; sub.height = sh;
      const sc = sub.getContext("2d")!;
      sc.fillStyle = "#fff";
      sc.fillRect(0, 0, sw, sh);
      sc.drawImage(m, from.x0 - pad, 0, to.x1 - from.x0 + 2 * pad, sh, 12, 0, to.x1 - from.x0 + 2 * pad, sh);
      t = (await readText(sub, { chars: DIGITS })).text.replace(/\D/g, "");
      if (t.length === wide.length) break;
    }
    if (t.length !== wide.length) return undefined;
  }
  let k = 0;
  return gs.map((g) => (ratio(g) < 0.5 ? "1" : t[k++]!)).join("");
}
/** The max levels of LLB 1-4 (a red number is at one of them; LLB 5 shows a red MAX). */
const LLB_MAXES = [105, 110, 120, 130];
async function readLevelWith(c: HTMLCanvasElement, p: Place, box: number[], look: TextLook): Promise<LevelRead | undefined> {
  const m = textMask(c, box, look, scaleFor(p));
  const gs = textGlyphs(m);
  if (!gs.length || gs.length > 3) return undefined;
  const color = inkColor(c, box, m, gs);
  if (gs.some((g) => ratio(g) >= 1.1) || (gs.length === 3 && ratio(gs[0]!) >= 0.8)) return { level: "max", color };
  if (gs.length === 3 && ratio(gs[0]!) > 0.55) return undefined;
  let t = await readDigits(m, gs);
  if (!t && look === "outline" && (color === "red" || color === "gold")) {
    // the outline mask fills a 0's hole; the letters' own color keeps it
    const m2 = textMask(c, box, color === "red" ? "red" : "yellow", scaleFor(p));
    const gs2 = textGlyphs(m2);
    if (gs2.length === gs.length) t = await readDigits(m2, gs2);
  }
  if (!t) return undefined;
  if (t.length < 3) { const n = Number(t); return n >= 1 && n <= 99 ? { level: n, ...(color ? { color } : {}) } : undefined; }
  // 100-150: the tens digit is 0-5 (an 8 is a 0, a 6 a 5, as the font goes)
  const tens = ({ "8": "0", "6": "5", "9": "0" } as Record<string, string>)[t[1]!] ?? t[1]!;
  const n = Number(`1${tens}${t[2]}`);
  if (n < 100 || n > 150) return undefined;
  // a red number is an LLB's max: anything else is a misreading of the color or the digits
  return { level: n, ...(color && (color !== "red" || LLB_MAXES.includes(n)) ? { color } : {}) };
}
const num = (max: number, min = 0) => (t: string) => { const n = numberIn(t); return n != null && n <= max && n >= min ? String(n) : undefined; };

/** The Limit Break badge's look: white or gold letters, or a favorite star over it. */
export interface BadgeLook { color: "white" | "gold" | "star"; dark: number; letters: number; whiteMid: number }

/**
 * The Limit Break badge from pixel shares, no text reading (cheap: a box video checks it on every frame). Measured
 * 2026-11-24 on the 2026-11-23 box video (112 px tiles, 60+ badges) and the user's Shanks screenshot (~184 px):
 * - the badge's letters sit on a dark disc: dark pixels 0.20-0.43 of the badge box when it shows; a favorite star
 *   (it fades in and out over the badge on a ~4 s cycle, ~1.25 s of badge, all tiles together; user 2026-11-24)
 *   0.05-0.09, the fade 0-0.18;
 * - white vs gold: pure-white pixels in the middle of the letters 0.13-0.17 on white badges (also over a bright
 *   portrait), 0.00-0.01 on gold ones (the disc's gold ring and the portrait threw off a test over the whole badge).
 */
export function lbBadgeLook(c: HTMLCanvasElement, p: Place): BadgeLook | undefined {
  const { d, n } = pixels(c, abs(p, TILE.lbBadge));
  let dark = 0, letters = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, bl = d[i + 2]!;
    if (Math.max(r, g, bl) < 90) dark++;
    if (r > 150 && g > 0.7 * r) letters++;
  }
  const mid = pixels(c, abs(p, TILE.lbLetters));
  let white = 0;
  for (let i = 0; i < mid.d.length; i += 4) {
    const r = mid.d[i]!, g = mid.d[i + 1]!, bl = mid.d[i + 2]!;
    if (r > 170 && g > 0.8 * r && bl > 0.75 * r) white++;
  }
  const look = { dark: dark / n, letters: letters / n, whiteMid: white / mid.n };
  if (look.dark >= 0.2 && look.letters >= 0.1) return { color: look.whiteMid >= 0.07 ? "white" : "gold", ...look };
  if (look.dark < 0.12 && look.letters >= 0.3) return { color: "star", ...look };
  return undefined;
}

/**
 * The Limit Break badge: its color (lbBadgeLook, or the color a box video settled on over many frames), then "MAX" or a
 * number. The user (2026-11-24): MAX / gold MAX / partial / empty matter more than the exact number. Each mask (the
 * letters' color, outline) is read twice, letters only and digits only (one reading with both turned lone digits into
 * letters): any M / A / X = MAX; otherwise a number (below the max), kept when the reading is sure (number badges read
 * 90-95; a "34" read as "341" at 71). Measured on the user's box video sorted by Limit Break
 * (Samples/2026-11-24/box-lb-sorted.mp4): 44 MAX and 7 number badges.
 */
export async function lbBadge(c: HTMLCanvasElement, p: Place, color?: "white" | "gold"): Promise<{ lb: NonNullable<Seen["lb"]>; n?: number } | undefined> {
  const look = color ?? (() => { const l = lbBadgeLook(c, p)?.color; return l === "white" || l === "gold" ? l : undefined; })();
  if (!look) return undefined;
  const gold = look === "gold";
  // the text, enlarged 3x first (smoothed): read straight from a 112 px tile the badge's letters often came out empty
  const [x0, y0, x1, y1] = abs(p, TILE.lbText) as [number, number, number, number];
  const up = document.createElement("canvas");
  up.width = Math.max(1, Math.round((x1 - x0) * 3)); up.height = Math.max(1, Math.round((y1 - y0) * 3));
  const ctx = up.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, up.width, up.height);
  let number: number | undefined;
  const masks = [gold ? "yellow" : "white", "outline"] as const;
  // letters first, every way (enlarged, and straight from the tile): a lone digit never read as a letter in any of
  // them, while a MAX's letters sometimes show in only one
  const enlarged = masks.map((mask) => textMask(up, [0, 0, up.width, up.height], mask, 2));
  const ways = [...enlarged, ...masks.map((mask) => textMask(c, abs(p, TILE.lbText), mask, p.size < 150 ? 6 : 4))];
  for (const m of ways) if (/[MAX]/.test((await readText(m, { chars: "MAX" })).text)) return { lb: gold ? "keyMax" : "max" };
  for (const m of enlarged) {
    const t = await readText(m, { chars: DIGITS });
    const txt = t.text.replace(/\s/g, "");
    if (/^\d{1,2}$/.test(txt) && t.conf >= 85 && Number(txt) >= 1 && Number(txt) <= 50) { number = Number(txt); break; }
  }
  // no letter in any reading: a number ("4", "9", "18" sometimes read as nothing at all)
  return { lb: gold ? "keyPartial" : "partial", ...(number != null ? { n: number } : {}) };
}

/** Level, filled sockets, cotton candy, Limit Break badge and key of a unit tile (what the screen shows of it). `fast`: one reading each (box videos). */
export async function readTile(c: HTMLCanvasElement, p: Place, opts: { kind: ScreenKind | "unknown"; mine: boolean; fast?: boolean; badge?: "white" | "gold" }): Promise<Seen> {
  const seen: Seen = {};
  const sc = scaleFor(p);
  const small = p.size < 80;
  const lv = await readLevel(c, p);
  if (lv) {
    seen.level = lv.level;
    // red = at the max: MAX after LLB, or a number at its LLB's max (105 / 110 / 120 / 130); gold = below the max:
    // MAX = the 99 cap before LLB, a gold 99+ = an LLB max above it (user, 2026-11-24)
    if (lv.level === "max") { if (lv.color === "red") seen.maxKind = "llb"; else if (lv.color === "gold") seen.maxKind = "base"; }
    else if (lv.color === "red" && lv.level >= 100) seen.maxLevel = lv.level;
    else if (lv.color === "gold" && lv.level >= 99) seen.belowMax = true;
  }
  if (!opts.mine) return seen;
  const sockets = await readVoted(c, abs(p, TILE.sockets), small ? [["white", 6], ["white", 8]] : [["white", 4]], "012345", (t) => (/^[0-5]$/.test(t) ? t : undefined));
  if (sockets) seen.socketsFilled = Number(sockets);
  const lb = await lbBadge(c, p, opts.badge);
  if (lb) { seen.lb = lb.lb; if (lb.n != null) seen.lbNumber = lb.n; }
  const ccTries = opts.fast ? [["yellow", sc]] as const : small ? [["yellow", 5], ["yellow", 6], ["yellow", 8]] as const : [["yellow", 3], ["yellow", 4], ["yellow", 6]] as const;
  // "+574": yellow over a dark outline; the outline mask helps over light (yellow) hair. Fewer digits are a stray
  // yellow bit (the type badge's glow) or a digit lost.
  const ccTries2 = [...ccTries, ["outline", sc]] as const;
  const cc = await readVoted(c, abs(p, TILE.cc), ccTries2, "+0123456789", (t) => {
    const m = t.match(/^(\+?)(\d{1,3})$/);
    if (!m || Number(m[2]) > 600) return undefined;
    // three digits: a "+574" with a digit lost ("+74", "57") is worse than none (the defaults fill it in)
    return m[2]!.length === 3 ? String(Number(m[2])) : undefined;
  });
  if (cc) seen.ccTotal = Number(cc);
  seen.key = keyState(c, p);
  return seen;
}

/**
 * The text lines in a box (top to bottom): rows where bright (text) pixels gather. The bottom row's panels sit a few
 * pixels lower than the top row's, so the lines are found rather than placed.
 */
function textLines(c: HTMLCanvasElement, b: number[], want: number): [number, number][] {
  const [x0, y0, x1, y1] = b.map(Math.round) as [number, number, number, number];
  const w = x1 - x0, h = y1 - y0;
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(x0, y0, w, h).data;
  const count = Array.from({ length: h }, (_, y) => {
    let n = 0;
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if (0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]! > 170) n++; }
    return n;
  });
  const runs: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    const on = y < h && count[y]! >= 3;
    if (on && start < 0) start = y;
    if (!on && start >= 0) { if (y - start >= 4) runs.push([start, y]); start = -1; }
  }
  // the tallest lines are the text (frame lines are thin)
  return runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, want).sort((a, b) => a[0] - b[0]).map(([a, z]) => [y0 + a - 3, y0 + z + 3]);
}

/** Team edit: the panel under a tile (cost; HP / ATK / RCV / CP or SP / ABL / DEF / SPD). */
export async function readEditPanel(c: HTMLCanvasElement, p: Place): Promise<{ seen: Seen; cost?: number }> {
  const seen: Seen = {};
  const label = (await readBox(c, abs(p, EDIT.label), "white", { chars: "HPSATKRCVBL", scale: 4 })).text.toUpperCase();
  const sp = label.includes("S") && !label.includes("H");
  const tries = [["outline", 4], ["outline", 5], ["white", 4], ["white", 5]] as const;
  const costT = await readVoted(c, abs(p, EDIT.cost), [["outline", 4], ["white", 4]], DIGITS, num(99));
  const rows: (string | undefined)[] = [];
  const alts: string[][] = [];
  // the four lines: found in the panel (values only: right of the labels), else the measured places
  const panel = abs(p, [0.36, 1.2, 0.99, 1.95]);
  const lines = textLines(c, panel, 4);
  for (const [i, r] of EDIT.rows.entries()) {
    const ratio = sp && i < 2;
    const line = lines.length === 4 ? lines[i]! : undefined;
    const box = line ? [abs(p, r)[0]!, line[0], abs(p, r)[2]!, line[1]] : abs(p, r);
    const got = await readRanked(c, box, tries, ratio ? `${DIGITS}/` : DIGITS, ratio ? (t) => (/^\d{1,2}\/\d{1,2}$/.test(t) ? t : undefined) : num(99999, 10));
    rows.push(got[0]);
    alts.push(got);
  }
  const n = (t?: string) => (t == null ? undefined : Number(t));
  if (sp) {
    const lv = (t?: string) => { if (!t) return undefined; const [a, b] = t.split("/").map(Number); return a === b ? ("max" as const) : a; };
    seen.specialLevel = lv(rows[0]); seen.abilityLevel = lv(rows[1]);
    seen.rumble = { def: n(rows[2]), spd: n(rows[3]) };
  } else {
    seen.rumble = { hp: n(rows[0]), atk: n(rows[1]), rcv: n(rows[2]) };
    seen.alts = { hp: alts[0]!.map(Number), atk: alts[1]!.map(Number), rcv: alts[2]!.map(Number) };
    seen.cp = n(rows[3]);
  }
  return { seen, cost: n(costT) };
}

/** What a Character Details page says about which unit it is. */
export interface PageUnit { no?: number; subtitle?: string; name?: string; cost?: number }

const PAGE = {
  details: {
    no: [24, 560, 150, 590], lv: [140, 656, 212, 688], maxLv: [204, 656, 352, 688],
    hp: [150, 688, 252, 714], atk: [150, 718, 252, 744], rcv: [300, 688, 396, 714],
    special: [436, 772, 526, 802], potentials: [428, 466, 624, 494], sockets: [306, 546, 624, 576],
  },
  rumbleDetails: {
    subtitle: [16, 368, 520, 394], name: [16, 394, 420, 424], cost: [414, 126, 492, 158], lv: [344, 166, 452, 200],
    maxLv: [446, 166, 628, 200], hp: [388, 246, 472, 277], atk: [388, 280, 472, 311], rcv: [388, 313, 472, 344],
    def: [533, 246, 617, 277], spd: [533, 280, 617, 311], special: [424, 448, 526, 478], ability: [494, 540, 622, 571],
  },
} as const;

/** "Lv MAX" / "Lv. 99" and "(Max Lv 150)" -> level and max level. */
function parseLvRow(level: string, max: string): { level?: number | "max"; maxLevel?: number } {
  const u = level.toUpperCase().replace(/\s+/g, "");
  const lv = /MAX|MA|AX/.test(u) ? "max" as const : numberIn(u.replace(/^L?V\.?/, ""));
  const m = max.match(/(\d{2,3})/);
  const maxLevel = m ? Number(m[1]) : undefined;
  const out: { level?: number | "max"; maxLevel?: number } = {};
  if (lv != null && (lv === "max" || (lv >= 1 && lv <= 150))) out.level = lv;
  if (maxLevel && maxLevel >= 50 && maxLevel <= 150) out.maxLevel = maxLevel;
  return out;
}
/** The level part of a page: MAX (in a colored box: any look that reads its letters) or a number (most agreed on). */
async function pageLevel(c: HTMLCanvasElement, b: readonly number[]): Promise<string> {
  const nums: string[] = [];
  for (const look of ["outline", "white", "yellow", "dark"] as const) {
    const t = (await readBox(c, b, look, { chars: `LvMAX.${DIGITS}`, scale: 4 })).text.toUpperCase();
    if (/MAX|MA|AX/.test(t)) return "MAX";
    const n = t.replace(/^L?V\.?/, "").replace(/\D/g, "");
    if (n && Number(n) >= 1 && Number(n) <= 150) nums.push(n);
  }
  return ranked(nums)[0] ?? "";
}
/** "MAX" or "5/10" or "12" -> a level. */
function parseSkillLv(t: string): number | "max" | undefined {
  const u = t.toUpperCase().replace(/\s/g, "");
  if (/MAX|MA|AX/.test(u)) return "max";
  const m = u.match(/(\d{1,2})(?:\/(\d{1,2}))?/);
  if (!m) return undefined;
  return m[2] && m[1] === m[2] ? "max" : Number(m[1]);
}

/** Read a Character Details page (general or Rumble status). */
export async function readPage(c: HTMLCanvasElement, kind: "details" | "rumbleDetails"): Promise<{ seen: Seen; unit: PageUnit }> {
  const seen: Seen = {};
  const unit: PageUnit = {};
  const both = async (b: readonly number[], chars: string) => {
    const a = await readBox(c, b, "outline", { chars, scale: 4 });
    const w = await readBox(c, b, "white", { chars, scale: 4 });
    return a.conf >= w.conf ? a.text : w.text;
  };
  const alts: NonNullable<Seen["alts"]> = {};
  const statOf = async (b: readonly number[], key?: keyof NonNullable<Seen["alts"]>) => {
    const got = await readRanked(c, [...b], [["outline", 4], ["outline", 5], ["outline", 3], ["white", 4]], DIGITS, num(99999, 10));
    if (key) alts[key] = got.map(Number);
    return Number(got[0]) || undefined;
  };
  if (kind === "details") {
    const P = PAGE.details;
    const no = numberIn((await readBox(c, P.no, "outline", { chars: `No.${DIGITS}`, scale: 4 })).text);
    if (no) unit.no = no;
    Object.assign(seen, parseLvRow(await pageLevel(c, P.lv), await both(P.maxLv, `MaxLv()${DIGITS} `)));
    seen.main = { hp: await statOf(P.hp, "hp"), atk: await statOf(P.atk, "atk"), rcv: await statOf(P.rcv, "rcv") };
    seen.alts = alts;
    const sp = parseSkillLv(await both(P.special, `LvMAX ${DIGITS}`));
    if (sp != null) seen.mainSpecialLevel = sp;
    // a red MAX (not gold): the shortest charge, with the Limit Break key's extra reduction
    if (sp === "max") {
      const { d } = pixels(c, [...P.special]);
      let red = 0, gold = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
        if (r > 170 && g < 90 && b < 90) red++;
        if (r > 190 && g > 150 && b < 110) gold++;
      }
      if (red > 2 * gold && red > 20) seen.lbKeyUsed = true;
    }
    // the level under each potential / socket icon, one digit each (1-5)
    const digits = async (b: readonly number[]) => {
      const m = textMask(c, b, "white", 4);
      const out: number[] = [];
      for (const g of glyphs(m)) {
        const cut = document.createElement("canvas");
        cut.width = g.x1 - g.x0 + 40; cut.height = g.y1 - g.y0 + 40;
        const cc = cut.getContext("2d")!;
        cc.fillStyle = "#fff"; cc.fillRect(0, 0, cut.width, cut.height);
        cc.drawImage(m, g.x0 - 4, g.y0 - 4, g.x1 - g.x0 + 8, g.y1 - g.y0 + 8, 16, 16, g.x1 - g.x0 + 8, g.y1 - g.y0 + 8);
        const t = (await readText(cut, { chars: "12345", single: true })).text.replace(/\D/g, "");
        if (t.length === 1) out.push(Number(t));
      }
      return out;
    };
    const pots = await digits(P.potentials);
    if (pots.length && pots.length <= 3) seen.potentialLevels = pots;
    const sockets = await digits(P.sockets);
    if (sockets.length && sockets.length <= 6) seen.sockets = sockets.reduce((a, b) => a + b, 0);
  } else {
    const P = PAGE.rumbleDetails;
    unit.subtitle = (await readBox(c, P.subtitle, "white", { scale: 3 })).text.replace(/\n/g, " ").trim();
    unit.name = (await readBox(c, P.name, "white", { scale: 3 })).text.replace(/\n/g, " ").trim();
    const cost = numberIn(await both(P.cost, DIGITS));
    if (cost) unit.cost = cost;
    Object.assign(seen, parseLvRow(await pageLevel(c, P.lv), await both(P.maxLv, `MAXLv().${DIGITS} `)));
    seen.rumble = { hp: await statOf(P.hp, "hp"), atk: await statOf(P.atk, "atk"), rcv: await statOf(P.rcv, "rcv"), def: await statOf(P.def), spd: await statOf(P.spd) };
    seen.alts = alts;
    const sp = parseSkillLv(await both(P.special, `MAX/${DIGITS}`));
    if (sp != null) seen.specialLevel = sp;
    const ab = parseSkillLv(await both(P.ability, `MAX/${DIGITS}`));
    if (ab != null) seen.abilityLevel = ab;
  }
  return { seen, unit };
}
