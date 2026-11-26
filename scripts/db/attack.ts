/**
 * Per-unit attack hit timing from the game's attack animations: reads tools/ssd/out/ssd_timings.csv (written by
 * `python -I tools/ssd/batch.py`, one row per .ssd file) and picks each serverId's own attack file.
 *
 * File choice (docs/DATABASE.md):
 *   - only the unit's own serverId; never special cut-ins (any name with "_skil" or the typo "sikll", whatever
 *     batch.py's variant column says);
 *   - the base motion before alternate motions (`_blow`, `_pile`, `_shot`, `_slash`, `_toy` of multi-attack units,
 *     `_nsize`);
 *   - variant `sd` (the unit's attack) before `evolved` (the evolved form's attack);
 *   - files with hit events or hit sounds before files with neither;
 *   - then the shortest name, then alphabetical.
 * Some of the newest units (34 files, e.g. 4218 / 4469 VS halves, 3888 Sanji, 4612 Gunko) have only a 54-frame
 * placeholder attack file with no hit events or sounds (`20:UDAT:[stop]`): no data for them.
 * First hit: the first `hit` event; sound-only files of a known template take the template's hits (hit sounds
 * 35/36/44/52 = hits 32/41/47/51 as validated on Pacifista and Luffy 2087; 35/36/42/48 = 33/39/44/47 (1,100 of 1,101 files
 * that have both); 35/36/46/56 = 36/48/54/59 (11 of 11)); other sound-only files use the first hit sound (on the frame-15 family the sounds
 * and hits share frames in every file that has both). No events at all: no data.
 */
import { existsSync, readFileSync } from "node:fs";
import type { GameAttackMotion } from "../../src/data/schema";
import { decodedWindup } from "../../src/sim/timing";
import { parseCsv } from "./game";

/** Sound-only templates: hit-sound frames -> hit frames (from the files that have both). */
const TEMPLATES: Record<string, number[]> = {
  "35;36;44;52": [32, 41, 47, 51],
  "35;36;42;48": [33, 39, 44, 47],
  "35;36;46;56": [36, 48, 54, 59],
};

/** Alternate motions of multi-attack units (and `_nsize` files without events): used only when nothing else is there. */
const ALT = /_(blow|pile|shot|slash|toy|nsize)(?=[_.-])/i;

const frames = (s: string | undefined) => (s ? s.split(";").filter(Boolean).map(Number) : []);

export function readAttackTimings(csvPath: string): Map<number, GameAttackMotion> | undefined {
  if (!existsSync(csvPath)) return undefined;
  const [head, ...rows] = parseCsv(readFileSync(csvPath, "utf8"));
  const col = (r: string[], k: string) => r[head!.indexOf(k)];
  type Cand = { file: string; variant: "sd" | "evolved"; fps: number; frames: number; hits: number[]; se: number[] };
  const bySid = new Map<number, Cand[]>();
  for (const r of rows) {
    const sid = Number(col(r, "serverId")), file = col(r, "file") ?? "", variant = col(r, "variant");
    if (!col(r, "serverId") || !Number.isFinite(sid) || col(r, "error")) continue;
    if ((variant !== "sd" && variant !== "evolved") || /_skil|sikll/i.test(file)) continue;
    bySid.set(sid, [...(bySid.get(sid) ?? []), {
      file, variant, fps: Number(col(r, "fps")), frames: Number(col(r, "frames")), hits: frames(col(r, "hits")), se: frames(col(r, "se_frames")),
    }]);
  }
  const out = new Map<number, GameAttackMotion>();
  for (const [sid, cands] of bySid) {
    const rank = (c: Cand) => [ALT.test(c.file) ? 1 : 0, c.variant === "sd" ? 0 : 1, c.hits.length || c.se.length ? 0 : 1, c.file.length] as const;
    cands.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
      return a.file < b.file ? -1 : 1;
    });
    const c = cands[0]!;
    let hits: number[], hitsFrom: GameAttackMotion["hitsFrom"];
    if (c.hits.length) { hits = c.hits; hitsFrom = "hit"; }
    else if (TEMPLATES[c.se.join(";")]) { hits = TEMPLATES[c.se.join(";")]!; hitsFrom = "template"; }
    else if (c.se.length) { hits = c.se; hitsFrom = "sound"; }
    else continue;
    const firstHit = hits[0]!;
    out.set(sid, {
      file: c.file, variant: c.variant, fps: c.fps, frames: c.frames, hits, hitsFrom, firstHit,
      windup: Math.round(decodedWindup(firstHit) * 1000) / 1000,
    });
  }
  return out;
}
