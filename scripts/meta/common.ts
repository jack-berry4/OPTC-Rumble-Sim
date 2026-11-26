/**
 * Shared pieces of the meta run (docs/META_PLAN.md): the unit database from a folder, the items (unit + quick build),
 * random legal teams, a seeded random generator, the status file and the log.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { freemem, loadavg, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { buildUnitDb, type CustomUnitFile } from "../../src/data/buildDb";
import type { UnitRecord } from "../../src/data/schema";
import { applyPreset, DEFAULT_PRESETS, memberCost } from "../../src/engine/stats";
import { clashReason, TEAM_COST_LIMIT } from "../../src/engine/team";
import type { MemberConfig, TeamConfig } from "../../src/engine/types";

export type Db = ReturnType<typeof buildUnitDb>;

/** The unit database from `<dir>/units.json` and `<dir>/custom/*.json` (the repo: data/ and src/data/custom/). */
export function loadDb(dir: string, customDir = join(dir, "custom")): Db {
  const imported = JSON.parse(readFileSync(join(dir, "units.json"), "utf8"));
  const custom: CustomUnitFile[] = existsSync(customDir)
    ? readdirSync(customDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(customDir, f), "utf8")))
    : [];
  return buildUnitDb(imported.units, custom);
}

/** One choice in the search: a unit with one of the default quick builds. */
export interface Item {
  /** "4560@MAX" (builds that come out the same for a unit share one item: "4192@Lv 120/MAX"). */
  key: string;
  unitId: number;
  build: string;
  m: MemberConfig;
  cost: number;
}

/** 5★ and up (user, 2026-11-24: 4★ and below, 4+ included, are never relevant). */
export const RELEVANT_STARS = new Set(["5", "5+", "6", "6+"]);

/** The units the run looks at: real units (not "[...]" placeholders), as the app's generator, 5★ and up. */
export function metaUnits(db: Db): UnitRecord[] {
  return db.all.filter((u) => !u.name.startsWith("[") && u.id < 5013 && RELEVANT_STARS.has(String(u.stars)));
}

/** Every unit at every default quick build (Lv 1, Lv 99, Lv 120, MAX); identical builds of a unit are merged. */
export function makeItems(db: Db): Item[] {
  const out: Item[] = [];
  for (const rec of metaUnits(db)) {
    const seen = new Map<string, Item>();
    for (const p of DEFAULT_PRESETS) {
      let m = applyPreset(rec, { unitId: rec.id }, p);
      // Lv 1: Rumble special and abilities at max (user, 2026-11-24), like the app generator's level-1 builds: a unit
      // kept at level 1 is there for what its kit does when it goes down
      if (p.level === 1) m = { ...m, specialLevel: Math.max(1, rec.kit.specials.length), abilityLevel: Math.max(1, rec.kit.abilities.length) };
      const sig = JSON.stringify(m);
      const had = seen.get(sig);
      if (had) { had.build += `/${p.label}`; had.key = `${rec.id}@${had.build}`; continue; }
      const it: Item = { key: `${rec.id}@${p.label}`, unitId: rec.id, build: p.label, m, cost: memberCost(rec, m) };
      seen.set(sig, it);
      out.push(it);
    }
  }
  return out;
}

/** mulberry32: a small seeded random generator (so a resumed run rebuilds the same teams). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from strings / numbers (seeds per round, side, team). */
export function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * A random legal team: items drawn at random, each kept if it keeps the rules (not the same unit or family as one
 * already on, cost limit 300). Positions are the draw order, so a unit is as likely to start as to sit on the bench.
 * Stops at 8 or after `tries` draws (a team may come out smaller when the cost limit bites).
 */
export function randomTeam(db: Db, items: Item[], r: () => number, tries = 400): Item[] {
  const chosen: Item[] = [];
  let cost = 0;
  for (let i = 0; i < tries && chosen.length < 8; i++) {
    const it = items[Math.floor(r() * items.length)]!;
    if (cost + it.cost > TEAM_COST_LIMIT) continue;
    if (chosen.some((c) => c.unitId === it.unitId || clashReason(db, c.m, it.m))) continue;
    chosen.push(it);
    cost += it.cost;
  }
  return chosen;
}

export const teamOf = (items: Item[]): TeamConfig => ({ members: Array.from({ length: 8 }, (_, i) => items[i]?.m ?? null) });

/** Writes JSON atomically (a stopped run never leaves half a file). */
export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(data));
  // Windows can hold a file for a moment (virus scanner, indexer): try again a few times
  for (let i = 0; ; i++) {
    try { renameSync(`${path}.tmp`, path); return; } catch (e) {
      if (i >= 20) throw e;
      const until = Date.now() + 50 * (i + 1);
      while (Date.now() < until) { /* wait */ }
    }
  }
}

export const readJson = <T>(path: string): T | undefined => (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined);

/** Lines of a JSON-lines file (a line cut off by a stop is skipped). */
export function readLines<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as T); } catch { /* cut off */ }
  }
  return out;
}

export const appendLines = (path: string, rows: unknown[]) => {
  if (!rows.length) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
};

/** The run's log (out/meta.log) and status file (out/status.json, rewritten every few seconds). */
export class Status {
  private started = Date.now();
  private recent: { t: number; battles: number }[] = [];
  private last = 0;
  data: Record<string, unknown> = {};
  battles = 0;
  constructor(private readonly out: string, private readonly workers: number) {
    mkdirSync(out, { recursive: true });
    const prev = readJson<{ battlesTotal?: number }>(join(out, "status.json"));
    this.battlesBefore = prev?.battlesTotal ?? 0;
  }
  private battlesBefore: number;
  log(msg: string) {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    appendFileSync(join(this.out, "meta.log"), line + "\n");
  }
  /** Changes the status; written at once with `now`, else at most every 5 s. */
  set(p: Record<string, unknown>, now = false) { this.data = { ...this.data, ...p }; this.write(now); }
  add(battles: number, done?: number) {
    this.battles += battles;
    if (done !== undefined) this.data.done = done;
    this.write(false);
  }
  write(force: boolean) {
    const now = Date.now();
    if (!force && now - this.last < 5000) return;
    this.last = now;
    this.recent.push({ t: now, battles: this.battles });
    while (this.recent.length > 2 && now - this.recent[0]!.t > 120_000) this.recent.shift();
    const first = this.recent[0]!;
    const rate = now > first.t ? ((this.battles - first.battles) * 1000) / (now - first.t) : 0;
    const left = typeof this.data.total === "number" && typeof this.data.done === "number" && typeof this.data.perItem === "number"
      ? ((this.data.total as number) - (this.data.done as number)) * (this.data.perItem as number) : undefined;
    // the status file is for watching the run: failing to write it must never stop the run
    try { writeJson(join(this.out, "status.json"), {
      ...this.data,
      workers: this.workers,
      battlesThisStart: this.battles,
      battlesTotal: this.battlesBefore + this.battles,
      battlesPerSec: Math.round(rate),
      etaMin: left !== undefined && rate > 0 ? Math.round(left / rate / 60) : undefined,
      runningMin: Math.round((now - this.started) / 60000),
      rssMB: Math.round(process.memoryUsage().rss / 1e6),
      freeMemMB: Math.round(freemem() / 1e6),
      totalMemMB: Math.round(totalmem() / 1e6),
      load: loadavg().map((x) => Math.round(x * 10) / 10),
      updated: new Date(now).toISOString(),
    }); } catch { /* next time */ }
  }
}
