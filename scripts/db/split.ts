/**
 * Split the unit database into a lightweight search index and per-unit detail chunks, so the app's first load is a
 * small index instead of the whole 10 MB data/units.json. The browser loads the index up front (src/data/unitDb.ts)
 * and fetches each unit's detail only when it is placed on a team / shown in Recent / simulated.
 *
 * Output (all under public/data/, git-ignored and regenerated before dev/build):
 *   - <v>/units-index.json : { customCount, potentialNames, units: LightUnit[] }
 *   - <v>/units/<id>.json  : UnitDetail (the heavy fields: kit, llbKit, stats, lb, game, …)
 *   - version.json         : { v } — which folder is current (vite.config.ts builds it into the app as __DATA_VERSION__)
 * <v> is a hash of the output, so the published files never change under one name and can be cached for a year
 * (public/_headers); a database update simply lands in a new folder. Older folders are removed.
 *
 * The light record has everything the search, team-building rules, cost and list display need; the detail has the
 * rest. A full UnitRecord is the light record with its detail merged in.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadNodeDb } from "../../src/sim/nodeDb";
import { potentialNames } from "../../src/engine/stats";
import type { UnitRecord } from "../../src/data/schema";
import { LIGHT_FIELDS, type LightUnit } from "../../src/data/split";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const outDir = join(repoRoot, "public", "data");
const versionPath = join(outDir, "version.json");
const sourcePath = join(repoRoot, "data", "units.json");

const mtime = (p: string) => statSync(p).mtimeMs;

/** Newest modification time of the files under a folder (recursively). */
function newestIn(dir: string): number {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newestIn(p) : mtime(p));
  }
  return t;
}

/**
 * Skip the (slow) rebuild when the index is already newer than everything it's built from: the database, this script,
 * the unit loader / resolver / patches / custom units (src/data/, all of it, since the detail chunks hold resolved
 * records) and the potential list (src/engine/stats.ts).
 */
function upToDate(): boolean {
  try {
    const { v } = JSON.parse(readFileSync(versionPath, "utf8")) as { v: string };
    const idx = mtime(join(outDir, v, "units-index.json"));
    const inputs = [mtime(sourcePath), mtime(join(here, "split.ts")), newestIn(join(repoRoot, "src", "data")), mtime(join(repoRoot, "src", "engine", "stats.ts"))];
    return inputs.every((t) => idx >= t);
  } catch {
    return false;
  }
}

function light(u: UnitRecord): LightUnit {
  const out: Record<string, unknown> = {};
  for (const k of LIGHT_FIELDS) {
    const v = (u as unknown as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  // The asset id for sprite animations (Phase 2) + combo/size hints, flattened from the game join.
  if (u.game) {
    out.serverId = u.game.serverId;
    if (u.game.comboNum) out.comboNum = u.game.comboNum;
    if (u.game.unitSize) out.unitSize = u.game.unitSize;
    if (u.game.released) out.released = u.game.released;
  }
  return out as unknown as LightUnit;
}

function detail(u: UnitRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(u)) {
    if (LIGHT_FIELDS.includes(k as (typeof LIGHT_FIELDS)[number])) continue;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function main() {
  if (!process.argv.includes("--force") && upToDate()) {
    console.log("data split up to date (public/data/<version>/units-index.json newer than data/units.json); skipping.");
    return;
  }
  const db = loadNodeDb();
  const units: LightUnit[] = [];
  const details: [number, string][] = [];
  for (const u of db.all) {
    units.push(light(u));
    details.push([u.id, JSON.stringify(detail(u))]);
  }
  const indexText = JSON.stringify({ customCount: db.customCount, potentialNames: potentialNames(db.all), units });

  // the folder name: a hash of everything written, so it changes exactly when a published file would
  const h = createHash("sha256").update(indexText);
  for (const [id, text] of details) h.update(`\n${id}\n`).update(text);
  const v = h.digest("hex").slice(0, 10);

  rmSync(outDir, { recursive: true, force: true });
  const unitsDir = join(outDir, v, "units");
  mkdirSync(unitsDir, { recursive: true });
  for (const [id, text] of details) writeFileSync(join(unitsDir, `${id}.json`), text);
  const indexPath = join(outDir, v, "units-index.json");
  writeFileSync(indexPath, indexText);
  writeFileSync(versionPath, JSON.stringify({ v }));

  console.log(`Wrote ${units.length} units (data version ${v}): index ${(indexText.length / 1024).toFixed(0)} KB (${indexPath}), ${units.length} detail chunks in ${unitsDir}`);
}

main();
