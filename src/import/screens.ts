/**
 * Reading the game's screens (docs/PLAN_MODES.md section 4). The game draws a 2:3 frame (640 x 960 at its own scale)
 * scaled to the screen's width on phones (taller phones add space above and below) or to its height on wider screens,
 * so every layout below is in that 640 x 960 frame, whatever the phone. Which screen a screenshot is comes from its
 * title banner (src/import/screenRefs.json, scripts/portraits/screen_refs.py).
 */
import refs from "./screenRefs.json";
import { matchTile, rank, regionFeatures, type Match, type PortraitIndex } from "./portraits";

export type ScreenKind = "attackEdit" | "vs" | "vsAssault" | "gpTeam" | "gpOpponent" | "box" | "details" | "rumbleDetails";
export const SCREEN_NAMES: Record<ScreenKind, string> = {
  attackEdit: "Team edit (Attack / Defense / Assault Edit)",
  vs: "Confirm Opponent (VS)",
  vsAssault: "Confirm Assault Rumble Battle (VS)",
  gpTeam: "GP Team (your 3 teams)",
  gpOpponent: "GP Opponent Info (their 3 teams)",
  box: "Select Character (your box)",
  details: "Character Details (general status)",
  rumbleDetails: "Character Details (Rumble status)",
};
/** Grand Party screens: read only when that mode is released (src/features.ts); until then they count as unknown. */
export const GP_KINDS: ScreenKind[] = ["gpTeam", "gpOpponent"];
/** Screens with whole teams (fixed unit places). */
export const TEAM_KINDS: ScreenKind[] = ["attackEdit", "vs", "vsAssault", "gpTeam", "gpOpponent"];
/** Unit places that belong to the opponent (no cotton candy, LLB circle or key shown there). */
export const theirs = (kind: ScreenKind | "unknown", group: string) => group === "opponent" || kind === "gpOpponent";

export const GAME_W = 640, GAME_H = 960;

/** The game's frame inside a screenshot of w x h. */
export function gameRect(w: number, h: number) {
  if (w / h < 2 / 3) { const gh = w * 1.5; return { x: 0, y: (h - gh) / 2, w, h: gh }; }
  const gw = h * (2 / 3);
  return { x: (w - gw) / 2, y: 0, w: gw, h };
}

/** A screenshot (or video frame) redrawn as the game's 640 x 960 frame. */
export function toGameCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const r = gameRect(w, h);
  const c = document.createElement("canvas");
  c.width = GAME_W; c.height = GAME_H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, GAME_W, GAME_H);
  return c;
}

type Ref = { box: number[]; w: number; h: number; fp: number[] };
const SCREEN_REFS = (refs as { screens: Record<ScreenKind, Ref[]> }).screens;

/** Grayscale fingerprint of a box, normalized (as screen_refs.py fp()). */
function fingerprint(c: HTMLCanvasElement, box: number[], w: number, h: number): Float32Array {
  const t = document.createElement("canvas");
  t.width = w; t.height = h;
  const ctx = t.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, box[0]!, box[1]!, box[2]! - box[0]!, box[3]! - box[1]!, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = 0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!;
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let sd = 0;
  for (const v of a) sd += (v - m) ** 2;
  sd = Math.sqrt(sd / a.length) + 1e-6;
  for (let i = 0; i < a.length; i++) a[i] = (a[i]! - m) / sd;
  return a;
}

/** Which screen this is (best match and its score; under ~0.7 it is probably none of them). */
export function classify(c: HTMLCanvasElement): { kind: ScreenKind; score: number; scores: Record<ScreenKind, number> } {
  const scores = {} as Record<ScreenKind, number>;
  for (const [kind, parts] of Object.entries(SCREEN_REFS) as [ScreenKind, Ref[]][]) {
    let s = 0;
    for (const p of parts) {
      const f = fingerprint(c, p.box, p.w, p.h);
      let d = 0;
      for (let i = 0; i < f.length; i++) d += f[i]! * p.fp[i]!;
      s += d / f.length;
    }
    scores[kind] = s / parts.length;
  }
  const kind = (Object.keys(scores) as ScreenKind[]).reduce((a, b) => (scores[b] > scores[a] ? b : a));
  return { kind, score: scores[kind], scores };
}

/** A unit place on a screen: where its portrait is, and what it is (team / position). */
export interface Place { x: number; y: number; size: number; group: string; index: number }

const ROW8 = [26, 98, 170, 242, 314, 402, 474, 546];
/** Unit places of the fixed-layout screens (measured on 1080 x 2400 and 900 x 2000 screenshots, 2026-11-22 / 23). */
export function places(kind: ScreenKind): Place[] {
  switch (kind) {
    case "attackEdit": return [
      ...[28, 146, 264, 382, 500].map((x, i) => ({ x, y: 345, size: 112, group: "team", index: i })),
      ...[28, 146, 264].map((x, i) => ({ x, y: 619, size: 112, group: "team", index: 5 + i })),
    ];
    case "vs": return [
      ...ROW8.map((x, i) => ({ x, y: 353, size: 68, group: "opponent", index: i })),
      ...ROW8.map((x, i) => ({ x, y: 705, size: 68, group: "team", index: i })),
    ];
    // Assault Rumble: 4 boss places (right of the boss picture), your 8 below
    case "vsAssault": return [
      ...[316, 404, 476, 548].map((x, i) => ({ x, y: 350, size: 70, group: "opponent", index: i })),
      ...ROW8.map((x, i) => ({ x, y: 720, size: 68, group: "team", index: i })),
    ];
    case "gpTeam": return [452, 613, 773].flatMap((y, t) => ROW8.map((x, i) => ({ x, y, size: 68, group: `team${t + 1}`, index: i })));
    case "gpOpponent": return [414, 574, 734].flatMap((y, t) => ROW8.map((x, i) => ({ x, y, size: 68, group: `team${t + 1}`, index: i })));
    case "details": return [{ x: 12, y: 662, size: 88, group: "unit", index: 0 }];
    default: return [];
  }
}

/**
 * Screens whose title isn't one of the known banners (Defense / Assault Edit, Opponent Info, the Assault VS marquee):
 * the team layout whose places hold the best-matching portraits.
 */
export function classifyByLayout(idx: PortraitIndex, c: HTMLCanvasElement): { kind: ScreenKind; score: number } | undefined {
  let best: { kind: ScreenKind; score: number } | undefined;
  for (const kind of TEAM_KINDS) {
    const ss = places(kind).map((p) => rank(idx, regionFeatures(c, p.x, p.y, p.size, p.size, idx), 1)[0]![1]).sort((a, b) => b - a);
    const top = ss.slice(0, 4);
    const score = top.reduce((a, b) => a + b, 0) / top.length;
    if (!best || score > best.score) best = { kind, score };
  }
  return best && best.score >= 0.7 ? best : undefined;
}

/** Box screen: the grid's columns (5, always) and rows; the rows scroll, so their offset is found per screenshot. */
const BOX = { x0: 24, pitch: 112, size: 112, top: 186, bottom: 812 };

/**
 * The box grid's row offset in this frame: the separators between tiles are darker than the tiles, so the offset
 * whose separator lines are darkest is the grid's.
 */
export function boxRows(c: HTMLCanvasElement): number[] {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const x0 = BOX.x0, x1 = BOX.x0 + 5 * BOX.pitch;
  const img = ctx.getImageData(x0, 0, x1 - x0, GAME_H).data;
  const lum = new Float32Array(GAME_H);
  const w = x1 - x0;
  for (let y = 0; y < GAME_H; y++) {
    let s = 0;
    for (let x = 0; x < w; x += 2) { const o = (y * w + x) * 4; s += img[o]! + img[o + 1]! + img[o + 2]!; }
    lum[y] = s / (w / 2);
  }
  let best = 0, bestV = Infinity;
  for (let p = 0; p < BOX.pitch; p++) {
    let v = 0, n = 0;
    for (let y = p + BOX.top; y < BOX.bottom; y += BOX.pitch) { v += lum[y]! + lum[Math.min(GAME_H - 1, y + 1)]!; n += 2; }
    if (n && v / n < bestV) { bestV = v / n; best = p; }
  }
  // the darkest line is ~5 px above a tile's top (measured on the box video, 2026-11-22)
  const rows: number[] = [];
  for (let y = best + BOX.top + 5; y + BOX.size <= BOX.bottom; y += BOX.pitch) rows.push(y);
  return rows;
}

/**
 * The rows' exact offset: a portrait 4 px off already matches much worse (0.97 -> 0.6), so the row found from the
 * separators is moved by up to +-6 px to where one row's five portraits match best.
 */
export function alignBoxRows(idx: PortraitIndex, c: HTMLCanvasElement, rows: number[]): number[] {
  if (!rows.length) return rows;
  const y0 = rows[Math.floor(rows.length / 2)]!;
  let best = 0, bestS = -Infinity;
  for (let dy = -6; dy <= 6; dy += 2) {
    let s = 0;
    for (let col = 0; col < 5; col++) s += rank(idx, regionFeatures(c, BOX.x0 + col * BOX.pitch, y0 + dy, BOX.size, BOX.size, idx), 1)[0]![1];
    if (s > bestS) { bestS = s; best = dy; }
  }
  return rows.map((y) => y + best).filter((y) => y >= BOX.top && y + BOX.size <= BOX.bottom);
}

export function boxPlaces(c: HTMLCanvasElement, idx?: PortraitIndex): Place[] {
  const rows = idx ? alignBoxRows(idx, c, boxRows(c)) : boxRows(c);
  return rows.flatMap((y, r) => [0, 1, 2, 3, 4].map((col) => ({ x: BOX.x0 + col * BOX.pitch, y, size: BOX.size, group: `row${r}`, index: col })));
}

export interface TileRead extends Place { match: Match }

/** Read every unit place of a screen. */
export function readPlaces(idx: PortraitIndex, c: HTMLCanvasElement, ps: Place[], fast = false): TileRead[] {
  const opts = fast ? { reach: 2, sizes: [0] } : ps[0] && ps[0].size < 80 ? { reach: 4, sizes: [-2, 0, 2, 4] } : {};
  return ps.map((p) => ({ ...p, match: matchTile(idx, c, p.x, p.y, p.size, opts) }));
}

/** A match good enough to take without a look; below it the review shows it as unsure (or empty). */
export const SURE = 0.8;
/** Below this it is most likely not a unit (an empty place, a covered tile). */
export const EMPTY = 0.5;
