import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { loadNodeDb } from "../sim/nodeDb";
import { DEFAULT_PRESETS } from "../engine/stats";
import { inferBuild } from "./infer";
import { keyLook, voteKey } from "./keyIcon";

/** An 8-bit RGB / RGBA, non-interlaced PNG (what ffmpeg writes) -> RGBA pixels. */
function decodePng(buf: Buffer): { w: number; h: number; rgba: Uint8ClampedArray } {
  let o = 8, w = 0, h = 0, ch = 3;
  const idat: Buffer[] = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ch = data[9] === 6 ? 4 : 3; }
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!, line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[y * stride + x - ch]! : 0, b = y ? px[(y - 1) * stride + x]! : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch]! : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      px[y * stride + x] = (line[x]! + pred) & 255;
    }
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = px[i * ch]!; rgba[i * 4 + 1] = px[i * ch + 1]!; rgba[i * 4 + 2] = px[i * ch + 2]!; rgba[i * 4 + 3] = 255; }
  return { w, h, rgba };
}

/** A canvas holding one crop (pixels outside it read as transparent black, as a canvas does). */
function cropCanvas(atlas: ReturnType<typeof decodePng>, [cx, cy, cw, ch]: number[]): HTMLCanvasElement {
  const getImageData = (x: number, y: number, w: number, h: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const sx = x + i, sy = y + j;
      if (sx < 0 || sy < 0 || sx >= cw! || sy >= ch!) continue;
      const s = ((cy! + sy) * atlas.w + cx! + sx) * 4, d = (j * w + i) * 4;
      for (let k = 0; k < 4; k++) data[d + k] = atlas.rgba[s + k]!;
    }
    return { data, width: w, height: h };
  };
  return { getContext: () => ({ getImageData }) } as unknown as HTMLCanvasElement;
}

// Crops around the key icon of tiles from the user's screenshots and box videos (Samples/ and the user's 49.webp of
// 2026-11-25; each case's name says which), in game-frame pixels as the importer sees them (toGameCanvas, then the
// box rows / fixed places), with the tile's place relative to the crop. Made once with a node script (not kept).
const atlas = decodePng(readFileSync(new URL("./fixtures/key-icons.png", import.meta.url)));
const cases = JSON.parse(readFileSync(new URL("./fixtures/key-icons.json", import.meta.url), "utf8")) as { name: string; want: string; crop: number[]; tile: number[] }[];

describe("Rumble key icon", () => {
  it.each(cases)("$name: $want", ({ want, crop, tile }) => {
    const k = keyLook(cropCanvas(atlas, crop), { x: tile[0]!, y: tile[1]!, size: tile[2]! });
    expect(want.split("|")).toContain(k.state);
  });
  /** The place moved by fractions of the tile (2-3 px on a 112 px tile). */
  const moved = (tile: number[], fx: number, fy: number) => ({ x: tile[0]! + Math.round(fx * tile[2]!), y: tile[1]! + Math.round(fy * tile[2]!), size: tile[2]! });
  const MOVES = [[-0.02, -0.02], [0.02, 0.02], [0, 0.025], [0.025, -0.01]] as const;
  it("no key read where none is shown, a little off its place or not", () => {
    for (const c of cases.filter((c) => c.want === "none")) {
      for (const [fx, fy] of MOVES) expect(keyLook(cropCanvas(atlas, c.crop), moved(c.tile, fx, fy)).state, c.name).toBe("none");
    }
  });
  it("keys are still found with the place a few pixels off (video frames, screenshots of other phones)", () => {
    for (const c of cases.filter((c) => c.want === "on" || c.want === "possible")) {
      for (const [fx, fy] of MOVES) expect(keyLook(cropCanvas(atlas, c.crop), moved(c.tile, fx, fy)).state, c.name).toBe(c.want);
    }
  });
  it("a box video's frames vote", () => {
    expect(voteKey(["on", "none", "on", "possible"])).toBe("on");
    expect(voteKey(["none", "none", "possible", "none", "none"])).toBe("none"); // one stray frame
    expect(voteKey(["none", "possible", "possible", "none"])).toBe("possible"); // mid-scroll frames miss it
    expect(voteKey(["locked", "locked", "none"])).toBe("locked");
    expect(voteKey(["on", "possible"])).toBeUndefined();
    expect(voteKey([])).toBeUndefined();
  });
});

describe("Rumble key from the icon", () => {
  const db = loadNodeDb();
  const MAX = DEFAULT_PRESETS.find((p) => p.label === "MAX")!;
  const fact = (r: ReturnType<typeof inferBuild>) => r.facts.find((f) => f.what === "Rumble key");
  const rec = db.byId.get(4202)!; // Jinbe: key from level 120 (6*)
  it("on / possible at the key's level", () => {
    expect(inferBuild(rec, { level: 130, maxLevel: 130, key: "on" }, MAX).member.rumbleKey).toBe(true);
    const off = inferBuild(rec, { level: 130, maxLevel: 130, key: "possible" }, MAX);
    expect(off.member.rumbleKey).toBe(false);
    expect(fact(off)?.how).toBe("read");
  });
  it("no icon where the game always shows one (the key's level): not read, the default build decides", () => {
    const r = inferBuild(rec, { level: 130, maxLevel: 130, key: "none" }, MAX);
    expect(fact(r)?.how).toBe("unknown");
    expect(r.member.rumbleKey).toBe(MAX.rumbleKey);
  });
  it("below the key's level: no key, whatever the icon read", () => {
    for (const key of ["on", "possible", "locked", "none"] as const) {
      const r = inferBuild(rec, { level: 110, key }, MAX);
      expect(r.member.rumbleKey).toBe(false);
      expect(fact(r)?.value).toBe("no (not possible yet)");
    }
  });
});
