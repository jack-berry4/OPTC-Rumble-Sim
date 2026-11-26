import type { UnitRecord } from "../data/schema";
import type { GlobalRule } from "../engine/rules";
import type { TeamConfig } from "../engine/types";
import { assaultScore, type AssaultSettings } from "../engine/assault";
import { simulateBattle } from "./battle";
import { mix, type Purpose, type StreamSeeds } from "./rand";
import type { SimOptions } from "./types";

/** Mode settings a win-rate run passes to every battle (and, for Assault Rumble, how to score). */
export interface RunModeOptions {
  mode?: SimOptions["mode"];
  assault?: SimOptions["assault"];
  gp?: SimOptions["gp"];
  /** Assault Rumble: the score settings (modifiers); with these the summary has `score`. */
  scoring?: AssaultSettings;
}

/** Assault Rumble score over a run: mergeable sums, extremes and the best / worst seeds. */
export interface ScoreStats {
  n: number;
  sum: number;
  sumSq: number;
  min: number;
  max: number;
  /** Battles where every boss was at 0 HP at the end. */
  defeated: number;
  damageSum: number;
  lifeSum: number;
  /** Highest / lowest scores with their seeds (SEED_TOP each). */
  best: { seed: number; score: number }[];
  worst: { seed: number; score: number }[];
  /** The scores themselves (up to SCORE_SAMPLE_MAX), for the histogram. */
  sample: number[];
}
export const SEED_TOP = 50;
export const SCORE_SAMPLE_MAX = 20_000;

function addScore(st: ScoreStats | undefined, seed: number, score: number, damage: number, life: number, defeated: boolean): ScoreStats {
  const x = st ?? { n: 0, sum: 0, sumSq: 0, min: Infinity, max: -Infinity, defeated: 0, damageSum: 0, lifeSum: 0, best: [], worst: [], sample: [] };
  x.n++; x.sum += score; x.sumSq += score * score; x.min = Math.min(x.min, score); x.max = Math.max(x.max, score);
  if (defeated) x.defeated++;
  x.damageSum += damage; x.lifeSum += life;
  x.best = topSeeds([...x.best, { seed, score }], -1);
  x.worst = topSeeds([...x.worst, { seed, score }], 1);
  if (x.sample.length < SCORE_SAMPLE_MAX) x.sample.push(score);
  return x;
}
const topSeeds = (list: { seed: number; score: number }[], dir: 1 | -1) => list.sort((a, b) => dir * (a.score - b.score) || a.seed - b.seed).slice(0, SEED_TOP);

export function mergeScores(a: ScoreStats | undefined, b: ScoreStats | undefined): ScoreStats | undefined {
  if (!a || !b) return a ?? b;
  return {
    n: a.n + b.n, sum: a.sum + b.sum, sumSq: a.sumSq + b.sumSq, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max),
    defeated: a.defeated + b.defeated, damageSum: a.damageSum + b.damageSum, lifeSum: a.lifeSum + b.lifeSum,
    best: topSeeds([...a.best, ...b.best], -1), worst: topSeeds([...a.worst, ...b.worst], 1),
    sample: a.sample.length + b.sample.length <= SCORE_SAMPLE_MAX ? [...a.sample, ...b.sample] : [...a.sample, ...b.sample].slice(0, SCORE_SAMPLE_MAX),
  };
}

/**
 * Win-rate runs (handoff section 1, rule 4). `vary` picks which random streams change from battle to battle; the
 * others are held at the base seed's values:
 * - "all": the plain win rate;
 * - "special": same animation lengths and attack dice, different special outcomes;
 * - "timing": same special outcomes (targets and chances of each unit's 1st, 2nd, 3rd special), different timings;
 * - "dice": only the regular-attack dice change.
 */
/** "game" = the game's own randomness (specials + attack dice) with the guessed values held fixed. */
export type Vary = "all" | "game" | Purpose;

export interface WinRateSummary {
  battles: number;
  attackerWins: number;
  winRate: number;
  /** Standard error of winRate. */
  se: number;
  /** 95% confidence half-width (1.96 x se). */
  margin: number;
  avgTime: number;
  timeouts: number;
  avgAttackersLeft: number;
  avgDefendersLeft: number;
  unsupported: Record<string, number>;
  vary: Vary;
  /** Milliseconds of simulation (for the speed readout). */
  ms: number;
  /**
   * The seeds of the battles won, lost before the time ran out, and lost on time (the attackers never win on time):
   * the lowest SEED_LIST_MAX of each. With vary "all" each one is a seed for the One battle box.
   */
  seedLists: SeedLists;
  /** Assault Rumble: the score over the battles. */
  score?: ScoreStats;
}

export interface SeedLists { win: number[]; loss: number[]; timeout: number[] }
/** How many seeds each list keeps (the lowest ones). */
export const SEED_LIST_MAX = 1000;
const noSeeds = (): SeedLists => ({ win: [], loss: [], timeout: [] });

/** Two seed lists merged: each kept sorted, the lowest SEED_LIST_MAX. */
export function mergeSeedLists(a: SeedLists, b: SeedLists): SeedLists {
  const m = (x: number[], y: number[]) => (y.length ? [...x, ...y].sort((p, q) => p - q).slice(0, SEED_LIST_MAX) : x);
  return { win: m(a.win, b.win), loss: m(a.loss, b.loss), timeout: m(a.timeout, b.timeout) };
}

/**
 * Battle `i` of a run from `baseSeed`. vary "all": seed baseSeed + i, so a win rate from seed S plays the same battles
 * as the One battle box with seeds S, S + 1, S + 2, ... [user 2026-11-18: copy winning seeds out of a win rate].
 */
export function seedsFor(baseSeed: number, i: number, vary: Vary): { seed: number; seeds?: Partial<StreamSeeds> } {
  if (vary === "all") return { seed: baseSeed + i };
  const s = mix(baseSeed, i + 1);
  const held = (p: Purpose) => mix(mix(baseSeed, 0x51ab1e), p === "special" ? 1 : p === "timing" ? 2 : 3);
  const seeds: Partial<StreamSeeds> = { special: held("special"), timing: held("timing"), dice: held("dice") };
  const varied: Purpose[] = vary === "game" ? ["special", "dice"] : [vary];
  for (const p of varied) seeds[p] = mix(s, p === "special" ? 11 : p === "timing" ? 12 : 13);
  return { seed: s, seeds };
}

export function simulateMany(
  db: { byId: Map<number, UnitRecord> },
  attackers: TeamConfig,
  defenders: TeamConfig,
  battles: number,
  startIndex = 0,
  rules: GlobalRule[] = [],
  baseSeed = 1,
  vary: Vary = "all",
  modeOpts: RunModeOptions = {},
): WinRateSummary {
  const t0 = performance.now();
  let score: ScoreStats | undefined;
  const { scoring, ...simMode } = modeOpts;
  let wins = 0, time = 0, timeouts = 0, atkLeft = 0, defLeft = 0;
  const unsupported: Record<string, number> = {};
  const lists = noSeeds();
  for (let i = 0; i < battles; i++) {
    const s = seedsFor(baseSeed, startIndex + i, vary);
    const r = simulateBattle(db, attackers, defenders, { ...s, rules, recordEvents: false, recordDraws: false, ...simMode });
    if (r.assault && scoring) score = addScore(score, s.seed, assaultScore(r.assault, scoring), r.assault.damage, r.assault.life, r.assault.defeated);
    if (r.winner === "atk") wins++;
    if (r.reason === "timeout") timeouts++;
    const list = r.winner === "atk" ? lists.win : r.reason === "timeout" ? lists.timeout : lists.loss;
    if (list.length < SEED_LIST_MAX) list.push(s.seed);
    time += r.time;
    for (const u of r.units) if (u.alive) { if (u.side === "atk") atkLeft++; else defLeft++; }
    for (const [k, v] of Object.entries(r.unsupported)) unsupported[k] = Math.max(unsupported[k] ?? 0, v);
  }
  const sum = summarize(battles, wins, time, timeouts, atkLeft, defLeft, unsupported, vary, performance.now() - t0, lists);
  return score ? { ...sum, score } : sum;
}

export function summarize(n: number, wins: number, time: number, timeouts: number, atkLeft: number, defLeft: number, unsupported: Record<string, number>, vary: Vary, ms: number, seedLists: SeedLists = noSeeds()): WinRateSummary {
  const p = n ? wins / n : 0;
  const se = n ? Math.sqrt((p * (1 - p)) / n) : 0;
  return {
    battles: n, attackerWins: wins, winRate: p, se, margin: 1.96 * se,
    avgTime: n ? time / n : 0, timeouts, avgAttackersLeft: n ? atkLeft / n : 0, avgDefendersLeft: n ? defLeft / n : 0,
    unsupported, vary, ms, seedLists,
  };
}

export function mergeSummaries(a: WinRateSummary, b: WinRateSummary): WinRateSummary {
  const n = a.battles + b.battles;
  const unsupported = { ...a.unsupported };
  for (const [k, v] of Object.entries(b.unsupported)) unsupported[k] = Math.max(unsupported[k] ?? 0, v);
  const m = summarize(
    n, a.attackerWins + b.attackerWins, a.avgTime * a.battles + b.avgTime * b.battles, a.timeouts + b.timeouts,
    a.avgAttackersLeft * a.battles + b.avgAttackersLeft * b.battles, a.avgDefendersLeft * a.battles + b.avgDefendersLeft * b.battles,
    unsupported, a.vary, a.ms + b.ms, mergeSeedLists(a.seedLists, b.seedLists),
  );
  const score = mergeScores(a.score, b.score);
  return score ? { ...m, score } : m;
}
