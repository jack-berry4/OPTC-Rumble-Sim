/**
 * The meta run's results -> src/engine/rumble-meta.json, what the app's generator uses (src/engine/meta.ts).
 *
 *   npx tsx scripts/meta/export.ts --out .cache/meta-lab/out     # the run's out/ folder (copied from where it ran)
 *
 * Writes: the relevant units per side (attack, defense, Assault) with the builds that stayed in, and each unit's
 * screen score (the generator's shortlist order); the comps: the league's whole population (the final mix's teams
 * first, each with its share of the mix and its result against the other side's mix; the climbed themed teams are in
 * it), the mix's teams with their subs per position (stage 3); the best team per Assault boss team with its subs. Item keys are "unit@build" ("4560@MAX").
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDb, readJson } from "./common";
import type { LeagueFinal } from "./stage2";
import type { PositionSubs } from "./stage3";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const out = resolve(arg("out") ?? join(root, ".cache", "meta-lab", "out"));
const target = join(root, "src", "engine", "rumble-meta.json");

type Side = "atk" | "def";
interface MetaSub { key: string; loss: number }
interface MetaComp { title: string; origin: "league" | "theme"; weight?: number; vsMix?: number; fit?: number; units: (string | null)[]; subs?: MetaSub[][] }

const db = loadDb(join(root, "data"), join(root, "src", "data", "custom"));
const short = (key: string) => (db.byId.get(Number(key.split("@")[0]))?.name ?? key).split(" - ")[0]!.split(":")[0]!.trim();
const COLORS = ["STR", "DEX", "QCK", "PSY", "INT"];
/** A comp's name: its theme, or its main type (4+ units) and first three starters. */
function title(keys: (string | null)[], theme?: string): string {
  const names = keys.filter((k): k is string => !!k).slice(0, 3).map(short).join(" / ");
  if (theme) return `${theme.replace(/^\[|\]$/g, "").replace(/\] /, " ")}: ${names}`;
  const count = new Map<string, number>();
  for (const k of keys) if (k) { const c = String(db.byId.get(Number(k.split("@")[0]))?.color ?? "").replace(/[[\]]/g, ""); if (COLORS.includes(c)) count.set(c, (count.get(c) ?? 0) + 1); }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return `${top && top[1] >= 4 ? top[0] : "Mixed"}: ${names}`;
}
const subsOf = (files: string[]): MetaSub[][] | undefined => {
  if (!files.length) return undefined;
  const byPos: MetaSub[][] = Array.from({ length: 8 }, () => []);
  for (const f of files) {
    const p = readJson<PositionSubs>(f)!;
    byPos[p.pos] = p.subs.map((s) => ({ key: s.key, loss: Math.round(s.loss * 10000) / 10000 }));
  }
  return byPos;
};

// units per side (stage 1's last kept items; Assault: its screen's)
const s1 = readJson<{ alive: Record<Side, string[]> }>(join(out, "stage1", "state.json"))!;
const unitsOf = (keys: string[]) => {
  const m: Record<string, string[]> = {};
  for (const k of keys) { const [id, build] = k.split("@") as [string, string]; (m[id] ??= []).push(...build.split("/")); }
  return m;
};
const screen = readJson<{ alive: string[]; done: boolean }>(join(out, "assault", "screen.json"));

// the league's comps: its whole population (each team's result against the other side's final mix: what a player
// who can't field the mix's teams needs), the mix's teams first; the themed teams are in it (they joined the league)
const league = readJson<LeagueFinal>(join(out, "stage2", "final.json"))!;
const stage3 = existsSync(join(out, "stage3")) ? readdirSync(join(out, "stage3")) : [];
const comps: Record<Side, MetaComp[]> = { atk: [], def: [] };
for (const side of ["atk", "def"] as Side[]) {
  const w = side === "atk" ? league.x : league.y;
  const m = league.matrix;
  const vsMix = (i: number) => (side === "atk" ? m[i]!.reduce((a, v, j) => a + v * league.y[j]!, 0) : 1 - m.reduce((a, row, r) => a + row[i]! * league.x[r]!, 0));
  const sigs = new Set<string>();
  const order = w.map((x, i) => ({ x, i, v: vsMix(i) })).sort((a, b) => (b.x >= 0.01 ? 1 : 0) - (a.x >= 0.01 ? 1 : 0) || b.x - a.x || b.v - a.v);
  for (const e of order) {
    const units = Array.from({ length: 8 }, (_, p) => league.teams[side][e.i]![p] || null);
    if (sigs.has(units.join(","))) continue;
    sigs.add(units.join(","));
    const files = stage3.filter((f) => f.startsWith(`${side}-${e.i}-p`)).map((f) => join(out, "stage3", f));
    const theme = league.origin[side][e.i]!.startsWith("theme ") ? league.origin[side][e.i]!.slice(6) : undefined;
    comps[side].push({
      title: title(units, theme), origin: theme ? "theme" : "league", ...(e.x >= 0.001 ? { weight: Math.round(e.x * 1000) / 1000 } : {}),
      vsMix: Math.round(e.v * 1000) / 1000, units, ...(files.length ? { subs: subsOf(files) } : {}),
    });
  }
}

// each unit's stage-1 score per side (its best build's): the generator's shortlist order; Assault: its screen's
const s1Round = readJson<{ round: number }>(join(out, "stage1", "state.json"))!.round - 1;
const lastRound = readJson<{ sides: Record<Side, { scores: { key: string; eff: number }[] }> }>(join(out, "stage1", `r${s1Round}.json`))!;
const scoresOf = (list: { key: string; eff: number }[]) => {
  const m: Record<string, number> = {};
  for (const sc of list) { const id = sc.key.split("@")[0]!; m[id] = Math.max(m[id] ?? -Infinity, Math.round(sc.eff * 10000) / 10000); }
  return m;
};
const roundOf = (f: string) => Number(/\d+/.exec(f)![0]);
const screenRounds = existsSync(join(out, "assault")) ? readdirSync(join(out, "assault")).filter((f) => /^screen-r\d+\.json$/.test(f)).sort((a, b) => roundOf(a) - roundOf(b)) : [];
const assaultScores = screen?.done && screenRounds.length ? readJson<{ scores: { key: string; eff: number }[] }>(join(out, "assault", screenRounds.at(-1)!))!.scores : undefined;
const scores = { atk: scoresOf(lastRound.sides.atk.scores), def: scoresOf(lastRound.sides.def.scores), ...(assaultScores ? { assault: scoresOf(assaultScores) } : {}) };

// Assault: the best team per boss team, with its subs
const assault: { season: number; boss: number; name: string; units: (string | null)[]; score: number; subs?: MetaSub[][] }[] = [];
const adir = join(out, "assault");
if (existsSync(adir)) {
  const files = readdirSync(adir);
  for (const f of files.filter((x) => /^s\d+-b\d+\.json$/.test(x))) {
    const [, season, boss] = /^s(\d+)-b(\d+)\.json$/.exec(f)!;
    const r = readJson<{ keys: string[]; mean: number }>(join(adir, f))!;
    const subs = files.filter((x) => x.startsWith(`s${season}-b${boss}-p`)).map((x) => join(adir, x));
    const name = readJson<{ seasons: { id: number; teams: { name: string }[] }[] }>(join(root, "public", "game", "assault-seasons.json"))!
      .seasons.find((s) => s.id === Number(season))?.teams[Number(boss) - 1]?.name ?? "";
    assault.push({ season: Number(season), boss: Number(boss), name, units: r.keys.map((k) => k || null), score: Math.round(r.mean), ...(subs.length ? { subs: subsOf(subs) } : {}) });
  }
  assault.sort((a, b) => a.season - b.season || a.boss - b.boss);
}

// the newest release in the run's unit data: units released after it weren't in the run
const released = db.all.map((u) => u.game?.released).filter((d): d is string => !!d).sort();
const dataUpTo = released.at(-1)!;
const since = new Date(Date.parse(`${dataUpTo}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const status = readJson<{ battlesTotal?: number }>(join(out, "status.json"));

const file = {
  source: "This simulator's own meta run (docs/META_PLAN.md)",
  generated: new Date().toISOString().slice(0, 10),
  dataUpTo,
  since,
  ...(status?.battlesTotal ? { battles: status.battlesTotal } : {}),
  league: { iterations: league.iter, value: Math.round(league.value * 1000) / 1000 },
  units: { atk: unitsOf(s1.alive.atk), def: unitsOf(s1.alive.def), ...(screen?.done ? { assault: unitsOf(screen.alive) } : {}) },
  scores,
  comps,
  assault,
};
writeFileSync(target, JSON.stringify(file, null, 1) + "\n");
console.log(`Wrote ${target}: ${Object.keys(file.units.atk).length} attack / ${Object.keys(file.units.def).length} defense units${screen?.done ? ` / ${Object.keys(unitsOf(screen.alive)).length} Assault units` : ""}; ${comps.atk.length} attack and ${comps.def.length} defense comps; ${assault.length} Assault boss teams; since ${since}`);
