/**
 * Sensitivity of win rates to every assumed or unmeasured value (TUNE and QUEUE in src/sim/battle.ts).
 * Each setting is run on the same battle seeds as the baseline, so the change in win rate is measured battle by
 * battle (paired): its standard error is far smaller than the win rate's own.
 *
 *   npx tsx scripts/sensitivity.ts [battles] [--shard i/n] [--out file.json]   # one shard of the settings
 *   npx tsx scripts/sensitivity.ts --merge a.json b.json ...                    # table from shard files
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadNodeDb } from "../src/sim/nodeDb";
import { QUEUE, TUNE, simulateBattle } from "../src/sim/battle";
import { seedsFor } from "../src/sim/simulate";
import { RUN9_RULES } from "../src/sim/fixtures/run9";
import { decodeTeam } from "../src/engine/teamCode";
import { DEFAULT_RULES, type GlobalRule } from "../src/engine/rules";
import { defaultTeams } from "../src/engine/defaultTeams";
import type { TeamConfig } from "../src/engine/types";

type Row = { name: string; value: string; per: Record<string, { wr: number; delta: number; se: number }> };

if (process.argv.includes("--merge")) {
  const files = process.argv.slice(process.argv.indexOf("--merge") + 1);
  const rows: Row[] = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")) as Row[]);
  const keys = Object.keys(rows[0]!.per);
  const base = rows.find((r) => r.name === "baseline")!;
  const score = (r: Row) => Math.max(...keys.map((k) => Math.abs(r.per[k]!.delta)));
  const sorted = rows.filter((r) => r.name !== "baseline").sort((a, b) => score(b) - score(a));
  const pct = (x: number) => `${(x * 100).toFixed(1)}`;
  console.log(`baseline win rate: ${keys.map((k) => `${k} ${pct(base.per[k]!.wr)}%`).join(", ")}\n`);
  console.log(["setting".padEnd(42), ...keys.map((k) => `${k} change (± se)`.padEnd(20))].join(" | "));
  for (const r of sorted) console.log([`${r.name} = ${r.value}`.padEnd(42), ...keys.map((k) => `${r.per[k]!.delta >= 0 ? "+" : ""}${pct(r.per[k]!.delta)} (± ${pct(r.per[k]!.se)})`.padEnd(20))].join(" | "));
  process.exit(0);
}

const N = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 1500);
const shardArg = process.argv.indexOf("--shard");
const [shard, shards] = shardArg >= 0 ? process.argv[shardArg + 1]!.split("/").map(Number) as [number, number] : [0, 1];
const outArg = process.argv.indexOf("--out");
const db = loadNodeDb();
const codes = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").split(/\s+/).filter((x) => x.startsWith("RS1.")).map((c) => decodeTeam(c, db).team);
const run9 = codes("src/sim/fixtures/run9-teams.txt");
let run8: TeamConfig[] = [];
try { run8 = codes("Test Run 8 Videos/rumble teams.txt"); } catch { /* not on this machine */ }
const [r1a, r1d] = defaultTeams();
const MATCHUPS: Record<string, [TeamConfig, TeamConfig, GlobalRule[]]> = {
  run9: [run9[1]!, run9[0]!, RUN9_RULES],
  ...(run8.length === 2 ? { run8: [run8[0]!, run8[1]!, RUN9_RULES] as [TeamConfig, TeamConfig, GlobalRule[]] } : {}),
  run1: [r1a, r1d, DEFAULT_RULES],
};

const T = TUNE as unknown as Record<string, unknown>;
const Q = QUEUE as unknown as Record<string, unknown>;
const scaled = (o: Record<string, number>, k: number) => Object.fromEntries(Object.entries(o).map(([a, v]) => [a, v * k]));
/** name, value label, apply (returns an undo). */
const SETTINGS: [string, string, () => () => void][] = [["baseline", "-", () => () => {}]];
const set = (obj: Record<string, unknown>, key: string, v: unknown) => () => { const old = obj[key]; obj[key] = v; return () => { obj[key] = old; }; };
const add = (name: string, lo: unknown, hi: unknown, obj: Record<string, unknown>, key: string, label = (v: unknown) => JSON.stringify(v)) => {
  SETTINGS.push([name, label(lo), set(obj, key, lo)]);
  if (hi !== undefined) SETTINGS.push([name, label(hi), set(obj, key, hi)]);
};
add("special radial ranges", scaled(TUNE.radial, 0.5), scaled(TUNE.radial, 1.5), T, "radial", (v) => `x${(v as Record<string, number>).medium! / TUNE.radial.medium!}`);
add("special line lengths", scaled(TUNE.lineLen, 0.5), scaled(TUNE.lineLen, 1.5), T, "lineLen", (v) => `x${(v as Record<string, number>).medium! / 300}`);
add("special line width", 50, 120, T, "lineW");
add("buff part of a ranged special reaches", 0.75, 1.0, T, "nonDamageRange");
add("heal areas", scaled(TUNE.healRadius, 0.5), scaled(TUNE.healRadius, 1.5), T, "healRadius", (v) => `x${(v as Record<string, number>).Medium! / TUNE.healRadius.Medium!}`);
add("knock-back stop (s)", 0, 2, T, "knockStun");
add("knock-back one tile vs two rows", 0.2, 0.6, T, "knockOneTile");
add("bench entry delay (s)", 1.5, 2.1, T, "benchDelay");
add("base miss chance", { ...TUNE.base, miss: 0.06 }, { ...TUNE.base, miss: 0.13 }, T, "base", (v) => `${(v as Record<string, number>).miss}`);
add("base guard chance", { ...TUNE.base, guard: 0.03 }, { ...TUNE.base, guard: 0.08 }, T, "base", (v) => `guard ${(v as Record<string, number>).guard}`);
add("Special CT speed per level", 0.02, 0.04, T, "ctPerLevel");
add("Full attack extra time (s)", 0, 1.5, T, "fullExtra");
add("Half Stats halves max HP", true, undefined, T, "halfStatsHp");
add("walk-out speed (px/s)", 800, 1100, T, "walkOut");
add("settle after home (s)", 0, 0.4, T, "homeSettle");
add("heal animation (s)", 0.4, 1.2, T, "healAnim");
add("Damage over Time wait (s)", 0, undefined, T, "dotWait");
add("unmeasured units' stay (+s)", -0.5, 0.7, T, "unmeasuredStayAdd");
add("queue look-ahead (s)", 0.5, 1.526, Q, "horizon");
add("queue SPD cap", 250, undefined, Q, "rateCap");
add("queue pick rule", "gauge", undefined, Q, "pick");
add("guarded hits can knock back", false, undefined, Q, "guardedBlowAway");
add("special fires from (px)", 115, undefined, Q, "specialReach");

const mine = SETTINGS.filter((_, i) => i === 0 || i % shards === shard);
const out: Row[] = [];
const baseWins: Record<string, Uint8Array> = {};
for (const [name, value, apply] of mine) {
  const undo = apply();
  const per: Row["per"] = {};
  for (const [key, [a, d, rules]] of Object.entries(MATCHUPS)) {
    const wins = new Uint8Array(N);
    for (let i = 0; i < N; i++) wins[i] = simulateBattle(db, a, d, { ...seedsFor(7, i, "all"), rules, recordEvents: false, recordDraws: false }).winner === "atk" ? 1 : 0;
    if (name === "baseline") baseWins[key] = wins;
    const b = baseWins[key]!;
    let sum = 0, sum2 = 0, w = 0;
    for (let i = 0; i < N; i++) { const dlt = wins[i]! - b[i]!; sum += dlt; sum2 += dlt * dlt; w += wins[i]!; }
    const mean = sum / N;
    per[key] = { wr: w / N, delta: mean, se: Math.sqrt(Math.max(0, sum2 / N - mean * mean) / N) };
  }
  undo();
  out.push({ name, value, per });
  process.stderr.write(`${name} ${value} done\n`);
}
const result = shard === 0 ? out : out.filter((r) => r.name !== "baseline");
if (outArg >= 0) writeFileSync(process.argv[outArg + 1]!, JSON.stringify(result));
else console.log(JSON.stringify(result, null, 1));
