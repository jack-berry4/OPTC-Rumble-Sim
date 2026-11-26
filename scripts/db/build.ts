/**
 * Builds the unit database (data/units.json, the file the app loads) from 2Shankz's OPTC-DB fork at one commit plus
 * the game's own master data, then writes the reports. docs/DATABASE.md has the whole update procedure.
 *
 *   npx tsx scripts/db/build.ts                 # newest OPTC-DB commit + sakura.db
 *   npx tsx scripts/db/build.ts --pinned        # the OPTC-DB commit of the last build (e.g. only sakura.db changed)
 *   npx tsx scripts/db/build.ts --ref <sha>     # a given OPTC-DB commit
 *   npx tsx scripts/db/build.ts --no-game       # without sakura.db: keep the last build's game data
 *   npx tsx scripts/db/build.ts --out <dir>     # preview: write everything to <dir> instead of data/
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildUnitDb } from "../../src/data/buildDb";
import type { GameUnitData, KnownUnitData } from "../../src/data/schema";
import { readAttackTimings } from "./attack";
import type { KnownFile } from "./capture";
import { DATA, GAME_TEXT_FILE, isMain, KNOWN_DIR, MOTION_MANIFEST, OPTCDB_BRANCH, OPTCDB_REPO, REPORTS, SAKURA_DB, SOURCES_FILE, SSD_TIMINGS, UNITS_FILE } from "./config";
import { diffMarkdown, diffUnits } from "./diff";
import { type FileStamp, type MappingResult, readGame, stampFile } from "./game";
import { type CommitInfo, fetchSnapshot, type ImportedUnit, latestCommit, parseOptcdb } from "./optcdb";
import { crosscheckMarkdown, mappingMarkdown } from "./reports";

export type DbUnit = ImportedUnit & { game?: GameUnitData; known?: KnownUnitData };

export interface Sources {
  builtAt: string;
  optcdb: CommitInfo & { repo: string; files: Record<string, string> };
  /** null when built with --no-game before any game data existed. */
  game: { sakuraDb: FileStamp; dataTimestamp: string; characters: number; motionManifest: FileStamp | null } | null;
  /** tools/ssd/out/ssd_timings.csv the `game.attack` values came from (kept from the last build when the CSV is missing). */
  attackTimings?: FileStamp | null;
  /** data/known/ files (name -> what they are). */
  known: Record<string, string>;
  counts: { units: number; withGame: number; withKnown: number; withAttack?: number };
}

export interface DbFile { meta: Sources; units: DbUnit[] }

/** One unit per line: small git diffs, still plain JSON. */
function writeLines(path: string, head: Record<string, unknown>, key: string, rows: unknown[]) {
  const top = JSON.stringify(head).slice(0, -1);
  writeFileSync(path, `${top}${top.length > 1 ? "," : ""}"${key}":[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]}\n`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const pinned = process.argv.includes("--pinned");
  const noGame = process.argv.includes("--no-game");
  const outDir = arg("--out") ?? DATA;
  const reportsDir = outDir === DATA ? REPORTS : join(outDir, "reports");
  mkdirSync(reportsDir, { recursive: true });

  const prev: DbFile | undefined = existsSync(UNITS_FILE) ? JSON.parse(readFileSync(UNITS_FILE, "utf8")) : undefined;
  const prevSources = prev?.meta;

  // 1. OPTC-DB snapshot
  let commit: CommitInfo;
  if (pinned) {
    if (!prevSources) throw new Error("--pinned needs a previous build (data/sources.json)");
    commit = { sha: prevSources.optcdb.sha, date: prevSources.optcdb.date, message: prevSources.optcdb.message };
  } else commit = await latestCommit(arg("--ref") ?? OPTCDB_BRANCH);
  console.log(`OPTC-DB ${OPTCDB_REPO}@${commit.sha.slice(0, 10)} (${commit.date}) ${commit.message}`);
  const { files, hashes } = await fetchSnapshot(commit.sha);
  const parsed = parseOptcdb(files);
  if (parsed.missing.length) console.warn(`Skipped ${parsed.missing.length} Rumble entries with no base unit row: ${parsed.missing.join(", ")}`);

  // 2. game data
  let mapping: MappingResult | undefined;
  let gameSrc: Sources["game"] = prevSources?.game ?? null;
  let gameText: Record<string, unknown> = {};
  const prevGame = new Map((prev?.units ?? []).map((u) => [u.id, u.game]));
  if (!noGame) {
    if (!existsSync(SAKURA_DB)) throw new Error(`sakura.db not found at ${SAKURA_DB} (set OPTC_GAME_DIR, or build with --no-game)`);
    mapping = await readGame(SAKURA_DB, MOTION_MANIFEST, parsed.units, parsed.unitRows);
    gameSrc = {
      sakuraDb: stampFile(SAKURA_DB), dataTimestamp: mapping.dataTimestamp, characters: mapping.characters,
      motionManifest: existsSync(MOTION_MANIFEST) ? stampFile(MOTION_MANIFEST) : null,
    };
    gameText = Object.fromEntries([...mapping.text].map(([id, t]) => [String(id), t]));
  } else if (existsSync(GAME_TEXT_FILE)) gameText = JSON.parse(readFileSync(GAME_TEXT_FILE, "utf8")).units ?? {};
  const gameOf = (id: number) => (mapping ? mapping.game.get(id) : prevGame.get(id));

  // 2b. decoded attack timings (tools/ssd/out/ssd_timings.csv, by serverId); without the CSV keep the last build's
  const attacks = readAttackTimings(SSD_TIMINGS);
  const attackSrc = attacks ? stampFile(SSD_TIMINGS) : prevSources?.attackTimings ?? null;
  if (!attacks) console.warn(`No ${SSD_TIMINGS}: keeping the last build's decoded attack timings`);
  const withAttack = (id: number, g: GameUnitData): GameUnitData => {
    const { attack: _old, ...rest } = g;
    const a = attacks ? attacks.get(g.serverId) : prevGame.get(id)?.attack;
    return a ? { ...rest, attack: a } : rest;
  };

  // 3. known values (data/known/*.json, keyed by serverId)
  const bySid = new Map<number, number>();
  for (const u of parsed.units) { const g = gameOf(u.id); if (g) bySid.set(g.serverId, u.id); }
  const known = new Map<number, KnownUnitData>();
  const knownFiles = existsSync(KNOWN_DIR) ? readdirSync(KNOWN_DIR).filter((f) => f.endsWith(".json")).sort() : [];
  const captureNotes: string[] = [];
  const knownSources: Record<string, string> = {};
  for (const f of knownFiles) {
    const kf = JSON.parse(readFileSync(join(KNOWN_DIR, f), "utf8")) as KnownFile;
    const src = f.replace(/\.json$/, "");
    knownSources[src] = kf.source;
    for (const c of kf.units) {
      const id = bySid.get(c.serverId);
      if (id === undefined) { captureNotes.push(`- ${f}: serverId ${c.serverId} (${c.name}) is not a unit in the database`); continue; }
      const g = gameOf(id)!;
      for (const [k, gv] of [["unit_size", g.unitSize], ["combo", g.comboNum], ["movement_speed", g.movementSpeed]] as const)
        if (c[k] !== gv) captureNotes.push(`- ${f}: ${id} ${k} ${c[k]} in the capture, ${gv} in the game data`);
      known.set(id, {
        attackDestination: { value: c.attack_destination, source: src },
        attackDestinationOffset: { value: c.attack_destination_offset, source: src },
        tapDifficulty: { value: c.tap_difficulty, source: src },
        hitEffect: { value: { ssd: c.hit_effect_ssd, texture: c.hit_effect_texture }, source: src },
      });
    }
  }

  // 4. assemble
  const units: DbUnit[] = parsed.units.map((u) => {
    const g0 = gameOf(u.id);
    const g = g0 && withAttack(u.id, g0);
    const k = known.get(u.id);
    return { ...u, ...(g ? { game: g } : {}), ...(k ? { known: k } : {}) };
  });
  const sources: Sources = {
    builtAt: new Date().toISOString(),
    optcdb: { repo: OPTCDB_REPO, ...commit, files: hashes },
    game: gameSrc,
    attackTimings: attackSrc,
    known: knownSources,
    counts: { units: units.length, withGame: units.filter((u) => u.game).length, withKnown: known.size, withAttack: units.filter((u) => u.game?.attack).length },
  };

  // 5. write
  mkdirSync(outDir, { recursive: true });
  writeLines(join(outDir, "units.json"), { meta: sources }, "units", units);
  const textRows = Object.entries(gameText).map(([id, t]) => ({ id: Number(id), ...(t as object) }));
  writeLines(join(outDir, "game-text.json"), { note: "Game text per OPTC-DB unit id: Rumble special per level, super special. From sakura.db." }, "units", textRows);
  writeFileSync(outDir === DATA ? SOURCES_FILE : join(outDir, "sources.json"), JSON.stringify(sources, null, 2) + "\n");

  // 6. reports
  const head = [
    `OPTC-DB: ${OPTCDB_REPO}@${commit.sha} (${commit.date}, "${commit.message}")`,
    gameSrc ? `Game: sakura.db sha256 ${gameSrc.sakuraDb.sha256.slice(0, 16)}..., ${gameSrc.characters} characters, newest row ${gameSrc.dataTimestamp}` : "Game: none",
    `Built: ${sources.builtAt}`,
  ];
  if (mapping) writeFileSync(join(reportsDir, "mapping.md"), mappingMarkdown(mapping, units.length, head));
  const recs = buildUnitDb(units as never, []).all;
  const cc = crosscheckMarkdown(recs, parsed.unitRows, [...head, ...(captureNotes.length ? ["", "Battle captures vs game data:", ...captureNotes] : [])]);
  writeFileSync(join(reportsDir, "crosscheck.md"), cc.md);
  if (prev) {
    const d = diffUnits(prev.units, units);
    // a second build on the same day and commit gets -2, -3 ... (never overwrites an earlier report)
    const stem = `update-${sources.builtAt.slice(0, 10)}-${commit.sha.slice(0, 7)}`;
    let name = `${stem}.md`;
    for (let i = 2; existsSync(join(reportsDir, name)); i++) name = `${stem}-${i}.md`;
    const from = `${prev.meta.optcdb.sha.slice(0, 10)} (${prev.meta.optcdb.date})`;
    const gameFrom = prev.meta.game ? prev.meta.game.sakuraDb.sha256.slice(0, 16) : "none";
    writeFileSync(join(reportsDir, name), diffMarkdown(d, "Unit database update", [
      `OPTC-DB: ${from} -> ${commit.sha.slice(0, 10)} (${commit.date})`,
      `sakura.db: ${gameFrom}... -> ${gameSrc ? gameSrc.sakuraDb.sha256.slice(0, 16) : "none"}...`,
      `Built: ${sources.builtAt}`,
    ]));
    console.log(`Update: +${d.added.length} new, -${d.removed.length} removed, ${d.changed.length} changed -> ${join(reportsDir, name)}`);
  }
  console.log(`Wrote ${units.length} units (${sources.counts.withGame} with game data, ${sources.counts.withAttack} with a decoded attack, ${known.size} with known values) to ${join(outDir, "units.json")}`);
  if (mapping) console.log(`Not joined to the game: ${mapping.unmatched.length}; game-only Rumble units: ${mapping.gameOnly.length}`);
  console.log(`Cross-check: ${Object.entries(cc.counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
}

if (isMain(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
