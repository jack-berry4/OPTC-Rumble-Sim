/**
 * The import's reading step: screenshots and box videos -> what's on them (screen kind; each unit place with its
 * best matches, a crop for the review and the numbers read off it; GP leader and hidden teams; the unit of a
 * Character Details page). Everything runs in the browser; nothing is uploaded. docs/IMPORT_PLAN.md.
 */
import type { UnitDb } from "../data/unitDb";
import type { KeyState, Seen } from "./infer";
import { keyState, voteKey } from "./keyIcon";
import { matchByName } from "./names";
import { FEATURES } from "../features";
import { loadPortraits, type PortraitIndex } from "./portraits";
import {
  boxPlaces, classify, classifyByLayout, EMPTY, GP_KINDS, places, readPlaces, SCREEN_NAMES, theirs, toGameCanvas,
  type Place, type ScreenKind, type TileRead,
} from "./screens";
import { lbBadge, lbBadgeLook, leaderScore, readEditPanel, readPage, readTile, type PageUnit } from "./tileRead";

export interface ReadTile extends TileRead {
  /** The portrait as found, for the review (data URL). */
  crop: string;
  /** The numbers read off the tile (and the panel under it on team edit). */
  seen?: Seen;
  /** Team edit: the cost under the tile (checks the unit). */
  cost?: number;
  /** GP: the leader pin is on this place. */
  leader?: boolean;
  /** GP Opponent Info: a hidden ("?") place. */
  hidden?: boolean;
  /** No unit here (an empty place: its frame matches some portrait a little). */
  empty?: boolean;
}

export interface ReadShot {
  name: string;
  /** The game frame (kept to read it again as another screen). */
  canvas?: HTMLCanvasElement;
  kind: ScreenKind | "unknown";
  /** How sure the screen kind is (title banner or layout match). */
  kindScore: number;
  tiles: ReadTile[];
  /** A small picture of the whole screen, for the review. */
  preview: string;
  /** Character Details pages: what the page says about which unit it is. */
  page?: PageUnit;
  /** Groups (teams) that are hidden (GP Opponent Info). */
  hiddenGroups?: string[];
}

/**
 * Let the page draw (progress) between steps. A message, not a timer: browsers slow timers in a tab that isn't in
 * front to one a second, which made a box read crawl while the user looked at another tab.
 */
function yieldToPage(): Promise<void> {
  return new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
}

function cropUrl(c: HTMLCanvasElement, t: { x: number; y: number; size: number }, px = 64): string {
  const o = document.createElement("canvas");
  o.width = px; o.height = px;
  o.getContext("2d")!.drawImage(c, t.x, t.y, t.size, t.size, 0, 0, px, px);
  return o.toDataURL("image/jpeg", 0.8);
}
function previewUrl(c: HTMLCanvasElement): string {
  const o = document.createElement("canvas");
  o.width = 160; o.height = 240;
  o.getContext("2d")!.drawImage(c, 0, 0, 160, 240);
  return o.toDataURL("image/jpeg", 0.7);
}

async function decodeImage(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  if ("createImageBitmap" in window) {
    const b = await createImageBitmap(file);
    return { src: b, w: b.width, h: b.height };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Which screen a frame is: its title banner, else the team layout that fits its portraits. */
export function screenOf(idx: PortraitIndex, c: HTMLCanvasElement): { kind: ScreenKind | "unknown"; score: number } {
  const found = screenFound(idx, c);
  // Grand Party isn't released yet (src/features.ts): its screens are still recognized (so they aren't mistaken for
  // another screen) but read as "not a screen this can read"
  return !FEATURES.grandParty && found.kind !== "unknown" && GP_KINDS.includes(found.kind) ? { kind: "unknown", score: found.score } : found;
}

function screenFound(idx: PortraitIndex, c: HTMLCanvasElement): { kind: ScreenKind | "unknown"; score: number } {
  const cl = classify(c);
  if (cl.score >= 0.7) return cl;
  const lay = classifyByLayout(idx, c);
  if (lay) return lay;
  return cl.score >= 0.55 ? cl : { kind: "unknown", score: cl.score };
}

/** Box screens: tiles under the Auto Power Up button (bottom left, when shown) are skipped. */
const POWER_UP = { x0: 0, y0: 735, x1: 205, y1: 812 };
function powerUpShown(c: HTMLCanvasElement): boolean {
  const d = c.getContext("2d", { willReadFrequently: true })!.getImageData(20, 752, 160, 36).data;
  let red = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i]! > 150 && d[i]! - d[i + 2]! > 80 && d[i + 1]! < 120) red++;
  return red / (d.length / 4) > 0.35;
}
const underPowerUp = (p: Place) => p.x < POWER_UP.x1 && p.y + p.size > POWER_UP.y0;

/** Read one game frame as a given screen (or its detected one), numbers included. */
export async function readCanvas(idx: PortraitIndex, db: UnitDb | undefined, c: HTMLCanvasElement, name: string, force?: ScreenKind): Promise<ReadShot> {
  const sc = force ? { kind: force, score: 1 } : screenOf(idx, c);
  const kind = sc.kind;
  const shot: ReadShot = { name, kind, kindScore: sc.score, tiles: [], preview: previewUrl(c), canvas: c };
  if (kind === "unknown") return shot;
  if (kind === "rumbleDetails" || kind === "details") {
    const page = await readPage(c, kind);
    shot.page = page.unit;
    let tile: ReadTile;
    if (kind === "details") {
      const [p] = places("details");
      const t = readPlaces(idx, c, [p!])[0]!;
      // the page's "No." is the unit's id: better than the small portrait when it's a known unit
      const no = page.unit.no;
      const byNo = no != null && db?.byId.has(no) ? no : undefined;
      tile = { ...t, crop: cropUrl(c, t.match), seen: page.seen, match: byNo != null ? { ...t.match, id: byNo, score: 1, alternatives: [{ id: t.match.id, score: t.match.score }, ...t.match.alternatives].filter((a) => a.id !== byNo) } : t.match };
    } else {
      const alts = db ? matchByName(db.all, page.unit) : [];
      const best = alts[0] ?? { id: 0, score: 0 };
      // the unit's art (left), as the review's picture
      const art = { x: 20, y: 160, size: 300 };
      tile = { x: art.x, y: art.y, size: art.size, group: "unit", index: 0, crop: cropUrl(c, art), seen: page.seen, match: { id: best.id, score: best.score, alternatives: alts.slice(1), ...art } };
    }
    shot.tiles = [tile];
    return shot;
  }
  let ps = kind === "box" ? boxPlaces(c, idx) : places(kind);
  if (kind === "box" && powerUpShown(c)) ps = ps.filter((p) => !underPowerUp(p));
  const tiles: ReadTile[] = readPlaces(idx, c, ps).map((t) => ({ ...t, crop: cropUrl(c, t.match) }));
  // Empty and hidden places all look alike: the same "unit" matched weakly at two or more places is a placeholder
  // (a team never has the same unit twice)
  const weak = new Map<number, number>();
  for (const t of tiles) if (t.match.score < 0.75) weak.set(t.match.id, (weak.get(t.match.id) ?? 0) + 1);
  for (const t of tiles) if (t.match.score < EMPTY || (t.match.score < 0.75 && (weak.get(t.match.id) ?? 0) >= 2)) t.empty = true;
  // GP: the leader pin, and hidden teams ("?" places)
  if (kind === "gpTeam" || kind === "gpOpponent") {
    const scores = tiles.map((t) => leaderScore(c, t));
    const k = scores.indexOf(Math.max(...scores));
    if (scores[k]! >= 1) tiles[k]!.leader = true;
    const hidden: string[] = [];
    for (const g of new Set(tiles.map((t) => t.group))) {
      const gt = tiles.filter((t) => t.group === g);
      if (kind === "gpOpponent" && gt.filter((t) => t.empty).length >= 6) { hidden.push(g); gt.forEach((t) => { t.hidden = true; t.empty = true; }); }
    }
    if (hidden.length) shot.hiddenGroups = hidden;
  }
  // Assault bosses show no level: only a good match counts
  for (const t of tiles) if (kind === "vsAssault" && t.group === "opponent" && t.match.score < 0.75) t.empty = true;
  for (const t of tiles) {
    if (t.empty) continue;
    const mine = !theirs(kind, t.group);
    t.seen = await readTile(c, t, { kind, mine });
    if (kind === "attackEdit") {
      const panel = await readEditPanel(c, t);
      t.seen = { ...t.seen, ...panel.seen, rumble: { ...t.seen.rumble, ...panel.seen.rumble } };
      if (panel.cost != null) t.cost = panel.cost;
    }
    // a unit tile always shows its level (bosses excepted): a weak match without one is an empty place
    const boss = kind === "vsAssault" && t.group === "opponent";
    if (!boss && t.match.score < 0.8 && t.seen.level == null) t.empty = true;
  }
  shot.tiles = tiles;
  return shot;
}

/** Read screenshots. */
export async function readImages(files: File[], db: UnitDb | undefined, onProgress?: (done: number, total: number) => void): Promise<ReadShot[]> {
  const idx = await loadPortraits();
  const out: ReadShot[] = [];
  for (const [i, f] of files.entries()) {
    const { src, w, h } = await decodeImage(f);
    out.push(await readCanvas(idx, db, toGameCanvas(src, w, h), f.name));
    onProgress?.(i + 1, files.length);
    await yieldToPage(); // let the page draw the progress
  }
  return out;
}

/**
 * Read a screen recording of the box scrolling by: frames every `step` seconds, each read as a box screen; every unit
 * is kept once, from the frame where it matched best, and its numbers are read from that frame afterwards. A unit
 * can be a stricter match than on a still (0.8): frames can be mid-scroll.
 */
export async function readVideo(file: File, opts: { step?: number; onProgress?: (text: string) => void; signal?: { stopped: boolean } } = {}): Promise<ReadShot> {
  const idx = await loadPortraits();
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("This video can't be read by the browser.")); });
    // a tile stays on screen ~2 s even at a quick scroll (the user's 80 s box video: ~280 px/s): every 0.2 s sees it
    // ~10 times, and the sharpest look is kept
    const step = opts.step ?? 0.2;
    const total = Math.max(1, Math.floor(v.duration / step));
    /** Per unit: its best place and a copy of that tile (with a margin) for reading the numbers later. */
    const best = new Map<number, { t: ReadTile; tile: HTMLCanvasElement }>();
    /**
     * Per unit: the Limit Break badge's color on every frame it was seen (a favorite star fades in and out over the
     * badge, user 2026-11-24), and a copy of the tile where each color was clearest, for reading MAX / the number.
     * `bare`: frames where most tiles showed their badge (the star fades on every tile at once) but this one showed
     * none; `from` / `to`: when it was on screen. Either a few bare frames or more than a whole star cycle on screen
     * without a badge: a unit with no Limit Break badge (empty).
     */
    const badges = new Map<number, { white: number; gold: number; star: number; bare: number; from: number; to: number; clearest: Partial<Record<"white" | "gold", { v: number; tile: HTMLCanvasElement }>> }>();
    /**
     * Per unit: the Rumble key icon read on every frame it was seen, with its column (a box can hold two copies of a
     * unit, at different places with different keys: only the readings in the kept copy's column vote).
     */
    const keys = new Map<number, { x: number; key: KeyState }[]>();
    /** The favorite star's fade cycle (~2.75 s star, ~1.25 s badge; measured 2026-11-24) with a margin. */
    const STAR_CYCLE = 4.5;
    const copyTile = (c: HTMLCanvasElement, m: { x: number; y: number; size: number }) => {
      const tile = document.createElement("canvas");
      tile.width = m.size; tile.height = m.size;
      tile.getContext("2d")!.drawImage(c, m.x, m.y, m.size, m.size, 0, 0, m.size, m.size);
      return tile;
    };
    let preview = "";
    for (let k = 0; k <= total; k++) {
      if (opts.signal?.stopped) break;
      v.currentTime = Math.min(v.duration - 0.01, k * step);
      await new Promise<void>((res) => { v.onseeked = () => res(); });
      const c = toGameCanvas(v, v.videoWidth, v.videoHeight);
      if (!preview) preview = previewUrl(c);
      const ps = boxPlaces(c, idx).filter((p) => !underPowerUp(p));
      const tiles = readPlaces(idx, c, ps, true).filter((t) => t.match.score >= 0.6);
      const looks = tiles.map((t) => lbBadgeLook(c, { ...t.match, group: "box", index: 0 }));
      // badges show on this frame (the stars are faded out): a tile with none here has none. Most tiles must show one:
      // a unit that isn't a favorite shows its badge all the time, while the others' stars are still up
      const shown = looks.filter((l) => l && l.color !== "star").length, starred = looks.filter((l) => l?.color === "star").length;
      const badgeFrame = shown >= 2 && shown > starred;
      for (const [j, t] of tiles.entries()) {
        const old = best.get(t.match.id);
        if (!old || t.match.score > old.t.match.score) best.set(t.match.id, { t: { ...t, crop: cropUrl(c, t.match) }, tile: copyTile(c, t.match) });
        const kl = keys.get(t.match.id) ?? [];
        kl.push({ x: t.match.x, key: keyState(c, t.match) });
        keys.set(t.match.id, kl);
        const look = looks[j];
        const b = badges.get(t.match.id) ?? { white: 0, gold: 0, star: 0, bare: 0, from: v.currentTime, to: v.currentTime, clearest: {} };
        b.to = v.currentTime;
        if (badgeFrame && (!look || look.color === "star")) b.bare++;
        if (look) {
          b[look.color]++;
          if (look.color !== "star") {
            // clearest: the darkest disc (the star furthest out of the way)
            const v = look.dark;
            if (!b.clearest[look.color] || v > b.clearest[look.color]!.v) b.clearest[look.color] = { v, tile: copyTile(c, t.match) };
          }
        }
        badges.set(t.match.id, b);
      }
      opts.onProgress?.(`Reading the video… ${Math.round(((k + 1) / (total + 1)) * 100)}% · ${best.size} units found`);
      await yieldToPage();
    }
    const list = [...best.values()].sort((a, b) => b.t.match.id - a.t.match.id);
    const tiles: ReadTile[] = [];
    for (const [i, { t, tile }] of list.entries()) {
      if (opts.signal?.stopped) break;
      const seen = await readTile(tile, { x: 0, y: 0, size: tile.width, group: "box", index: i }, { kind: "box", mine: true, fast: true });
      // the badge from all the frames: a gold badge never looks white, so white seen twice wins (a fading star can
      // tint white letters gold); else gold seen twice; else a single sighting
      delete seen.lb; delete seen.lbNumber;
      // the key icon from all the frames (the kept frame's own reading on a tie)
      const key = voteKey((keys.get(t.match.id) ?? []).filter((r) => Math.abs(r.x - t.match.x) <= 8).map((r) => r.key));
      if (key) seen.key = key;
      const b = badges.get(t.match.id);
      const color = !b ? undefined : b.white >= 2 ? "white" : b.gold >= 2 ? "gold" : b.white ? "white" : b.gold ? "gold" : undefined;
      const clear = color && b!.clearest[color];
      if (clear) {
        const lb = await lbBadge(clear.tile, { x: 0, y: 0, size: clear.tile.width, group: "box", index: i }, color);
        if (lb) { seen.lb = lb.lb; if (lb.n != null) seen.lbNumber = lb.n; }
      } else if (b && (b.bare >= 3 || b.to - b.from >= STAR_CYCLE)) seen.lb = "empty";
      tiles.push({ ...t, group: "box", index: i, seen });
      if (i % 5 === 4 || i === list.length - 1) { opts.onProgress?.(`Reading levels and cotton candy… ${i + 1}/${list.length}`); await yieldToPage(); }
    }
    return { name: file.name, kind: "box", kindScore: 1, tiles, preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { SCREEN_NAMES };
