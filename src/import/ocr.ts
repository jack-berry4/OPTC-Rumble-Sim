/**
 * Reading the numbers and names on game screens (docs/IMPORT_PLAN.md): tesseract.js in the browser, with the English
 * data served by the site (public/ocr), loaded only when a screenshot needs reading. Nothing is uploaded.
 *
 * The game's text comes in three looks, each turned into black text on white before reading:
 * - "white": white or light text on a dark panel (stats, names);
 * - "yellow": yellow / orange text (cotton candy "+574", combat power, a yellow "Lv.99");
 * - "red": red text (a level over 99: "Lv.130");
 * - "outline": colored digits with a dark outline over a busy picture (the "Lv. 130" under a portrait): the dark
 *   outline is found, everything dark-free reachable from the edge is the outside, and what's left is the inside of
 *   the letters.
 */
import type { Worker } from "tesseract.js";
import workerUrl from "tesseract.js/dist/worker.min.js?url";
import coreUrl from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";

export type TextLook = "white" | "yellow" | "red" | "outline" | "dark";

let workerP: Promise<Worker> | undefined;
/** One shared worker, made on first use. */
async function worker(): Promise<Worker> {
  return (workerP ??= (async () => {
    const T = await import("tesseract.js");
    return T.createWorker("eng", 1, {
      workerPath: new URL(workerUrl, document.baseURI).href,
      corePath: new URL(coreUrl, document.baseURI).href,
      langPath: new URL("ocr", document.baseURI).href,
      gzip: true, // public/ocr/eng.traineddata.gz: 3 MB sent instead of 5 (hosts don't compress the raw model)
      cacheMethod: "none",
    });
  })());
}

/** Free the worker (the import dialog closes). */
export async function stopOcr() {
  const w = workerP;
  workerP = undefined;
  if (w) await (await w).terminate();
}

const lumOf = (d: Uint8ClampedArray, o: number) => 0.299 * d[o]! + 0.587 * d[o + 1]! + 0.114 * d[o + 2]!;

/**
 * A box of the game frame as black-on-white text, scaled up `scale` times (small text reads much better bigger).
 * `box` is [x0, y0, x1, y1] in game pixels.
 */
export function textMask(c: HTMLCanvasElement, box: readonly number[], look: TextLook, scale = 4): HTMLCanvasElement {
  const [x0, y0, x1, y1] = box.map(Math.round) as [number, number, number, number];
  const w = Math.max(1, (x1 - x0) * scale), h = Math.max(1, (y1 - y0) * scale);
  const t = document.createElement("canvas");
  t.width = w; t.height = h;
  const ctx = t.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const ink = new Uint8Array(w * h);
  if (look === "outline") {
    const dark = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) dark[i] = lumOf(d, i * 4) < 70 ? 1 : 0;
    const outside = new Uint8Array(w * h);
    const q: number[] = [];
    const seed = (i: number) => { if (!dark[i] && !outside[i]) { outside[i] = 1; q.push(i); } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (q.length) {
      const i = q.pop()!;
      const x = i % w, y = (i - x) / w;
      if (x > 0) seed(i - 1);
      if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w);
      if (y < h - 1) seed(i + w);
    }
    for (let i = 0; i < w * h; i++) ink[i] = !dark[i] && !outside[i] ? 1 : 0;
  } else {
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const r = d[o]!, g = d[o + 1]!, b = d[o + 2]!;
      const l = lumOf(d, o);
      ink[i] =
        look === "white" ? (l > 165 && Math.max(r, g, b) - Math.min(r, g, b) < 90 ? 1 : 0)
        : look === "yellow" ? (r > 170 && g > 140 && b < 150 && r - b > 70 ? 1 : 0)
        : look === "red" ? (r > 110 && r - g > 40 && r - b > 35 ? 1 : 0)
        : (l < 90 ? 1 : 0);
    }
    // ink touching the box's edge is a neighbouring badge or frame, not the text (the boxes leave a margin)
    const q: number[] = [];
    const drop = (i: number) => { if (ink[i]) { ink[i] = 0; q.push(i); } };
    for (let x = 0; x < w; x++) { drop(x); drop((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { drop(y * w); drop(y * w + w - 1); }
    while (q.length) {
      const i = q.pop()!;
      const x = i % w, y = (i - x) / w;
      if (x > 0) drop(i - 1);
      if (x < w - 1) drop(i + 1);
      if (y > 0) drop(i - w);
      if (y < h - 1) drop(i + w);
    }
  }
  for (let i = 0; i < w * h; i++) {
    const v = ink[i] ? 0 : 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // a white margin: tesseract reads text touching the edge badly
  const m = document.createElement("canvas");
  m.width = w + 24; m.height = h + 24;
  const mc = m.getContext("2d")!;
  mc.fillStyle = "#fff";
  mc.fillRect(0, 0, m.width, m.height);
  mc.drawImage(t, 12, 12);
  return m;
}

/** Share of ink in a mask (an empty box has none: skip reading it). */
export function inkShare(m: HTMLCanvasElement): number {
  const d = m.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, m.width, m.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i]! < 128) n++;
  return n / (d.length / 4);
}

export interface OcrText { text: string; conf: number }

/** Read a mask. `chars` limits the characters; `block` reads several lines, `single` one character (else one line). */
export async function readText(m: HTMLCanvasElement, opts: { chars?: string; block?: boolean; single?: boolean } = {}): Promise<OcrText> {
  const w = await worker();
  await w.setParameters({
    tessedit_char_whitelist: opts.chars ?? "",
    tessedit_pageseg_mode: (opts.single ? "10" : opts.block ? "6" : "7") as never,
  });
  const r = await w.recognize(m);
  return { text: r.data.text.trim(), conf: r.data.confidence };
}

/** Read a box of the game frame. */
export async function readBox(c: HTMLCanvasElement, box: readonly number[], look: TextLook, opts: { chars?: string; block?: boolean; scale?: number } = {}): Promise<OcrText> {
  const m = textMask(c, box, look, opts.scale ?? 4);
  if (inkShare(m) < 0.004) return { text: "", conf: 0 };
  return readText(m, opts);
}

export const DIGITS = "0123456789";

/** Letter-sized blobs of ink in a mask (left to right): specks and the "." are left out. */
export function glyphs(m: HTMLCanvasElement): { x0: number; x1: number; y0: number; y1: number; area: number }[] {
  const w = m.width, h = m.height;
  const d = m.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const lab = new Int32Array(w * h).fill(-1);
  const out: { x0: number; x1: number; y0: number; y1: number; area: number }[] = [];
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4]! >= 128 || lab[i]! >= 0) continue;
    const g = { x0: w, x1: 0, y0: h, y1: 0, area: 0 };
    const q = [i];
    lab[i] = out.length;
    while (q.length) {
      const j = q.pop()!;
      const x = j % w, y = (j - x) / w;
      g.area++;
      if (x < g.x0) g.x0 = x;
      if (x > g.x1) g.x1 = x;
      if (y < g.y0) g.y0 = y;
      if (y > g.y1) g.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (lab[k]! < 0 && d[k * 4]! < 128) { lab[k] = out.length; q.push(k); }
      }
    }
    out.push(g);
  }
  const maxH = Math.max(0, ...out.map((g) => g.y1 - g.y0));
  const maxA = Math.max(0, ...out.map((g) => g.area));
  return out.filter((g) => g.y1 - g.y0 >= 0.55 * maxH && g.area >= 0.12 * maxA).sort((a, b) => a.x0 - b.x0);
}

/** A whole number in the text ("9,736" -> 9736), or undefined. */
export function numberIn(text: string): number | undefined {
  const m = text.replace(/[,.\s]/g, "").match(/\d+/);
  return m ? Number(m[0]) : undefined;
}

/**
 * A unit level as read under a portrait ("Lv.130", "Lv.MAX"): "max" when the text has the letters of MAX, else the
 * number. The outline reading mixes up a few shapes (M for 1, a stray A), so letters are cleaned before the number.
 */
export function parseLevel(text: string): number | "max" | undefined {
  const t = text.toUpperCase().replace(/^L?V\.?/, "").replace(/\s+/g, "");
  if (/MAX|MA|AX|M?A?X$/.test(t) && !/\d{2}/.test(t)) return "max";
  const cleaned = t.replace(/^A/, "").replace(/M/g, "1").replace(/[IL|]/g, "1").replace(/O/g, "0").replace(/[^0-9]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return n >= 1 && n <= 150 ? n : undefined;
}

/** "HP : 9736" style lines -> { hp: 9736, ... } (keys lowercased, letters only). */
export function parseStatLines(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of text.split(/\n/)) {
    const m = line.toUpperCase().replace(/\s/g, "").match(/^([A-Z]+)[:;.]*([\d,]+)/);
    if (m) out[m[1]!.toLowerCase()] = Number(m[2]!.replace(/,/g, ""));
  }
  return out;
}
