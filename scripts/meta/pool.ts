/**
 * Worker pool for the meta run: N worker threads, each with its own copy of the unit database, each running one job
 * at a time. The worker code is the same bundled file (scripts/meta/run.ts starts `workerMain` when it isn't the
 * main thread).
 *
 * Jobs:
 * - "teams" (stage 1): teams against each of a few opponents, `per` battles each.
 * - "pairs" (stage 2, payoff matrix): attacker / defender pairs, `n` battles each on the same seeds.
 * - "mix" (stage 2, generator): teams against a weighted mix of opponents; battle j's opponent is fixed by j, so every
 *   team measured on battles [from, from + n) meets the same opponents in the same battles.
 */
import { Worker } from "node:worker_threads";
import { simulateBattle } from "../../src/sim/battle";
import { seedsFor, simulateMany } from "../../src/sim/simulate";
import { assaultScore, type AssaultSettings } from "../../src/engine/assault";
import { registerBosses } from "../../src/engine/boss";
import type { Evaluate } from "../../src/engine/generator";
import type { TeamConfig } from "../../src/engine/types";
import type { Db } from "./common";

/** One team to measure: against each opponent, `per` battles, as attacker or defender. */
export interface Task { id: number; team: TeamConfig; seed: number }
export interface Batch { kind?: "teams"; side: "atk" | "def"; opps: TeamConfig[]; per: number; tasks: Task[] }
/** The team's wins (as defender: battles the attacker didn't win) out of n. */
export interface TaskResult { id: number; wins: number; n: number }

export interface PairsJob { kind: "pairs"; pairs: { a: TeamConfig; d: TeamConfig; key: string }[]; n: number; seed: number }
export interface PairResult { key: string; atkWins: number; n: number }

export interface MixJob {
  kind: "mix"; side: "atk" | "def"; teams: TeamConfig[]; opps: TeamConfig[]; weights: number[]; from: number; n: number; seed: number;
  /** Assault Rumble (the opponents are boss teams): fitness = the score, with these settings. */
  assault?: AssaultSettings;
  /**
   * The opponents' name: a worker keeps the opponents it was sent under this name, and the pool sends them to each
   * worker only once (66 boss teams with their kits are too much to copy for every job).
   */
  oppsKey?: string;
  /** Also return each battle's fitness (MixResult.scores). */
  perBattle?: boolean;
}
/**
 * Per team: fitness sum and second sum. Win rate: win + 0.001 × survivors' margin (so ties lean to the cleaner win),
 * and wins. Assault: score and score².
 */
export interface MixResult { fit: number; sq: number; scores?: number[] }

export type Job = Batch | PairsJob | MixJob;

/**
 * The opponent of battle j in a weighted mix: an even spread (golden-ratio steps through the cumulative weights),
 * so a few battles already meet each opponent about as often as its weight says.
 */
export function mixOpponent(weights: number[], j: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  const u = ((j * 0.6180339887498949 + 0.5) % 1) * total;
  let acc = 0;
  for (let k = 0; k < weights.length; k++) { acc += weights[k]!; if (u < acc) return k; }
  return weights.length - 1;
}

export function runBatch(db: Db, b: Batch): TaskResult[] {
  return b.tasks.map((t) => {
    let wins = 0, n = 0;
    b.opps.forEach((opp, k) => {
      const s = b.side === "atk"
        ? simulateMany(db, t.team, opp, b.per, 0, [], t.seed + k * 7919)
        : simulateMany(db, opp, t.team, b.per, 0, [], t.seed + k * 7919);
      wins += b.side === "atk" ? s.attackerWins : b.per - s.attackerWins;
      n += b.per;
    });
    return { id: t.id, wins, n };
  });
}

export function runPairs(db: Db, j: PairsJob): PairResult[] {
  return j.pairs.map((p) => ({ key: p.key, atkWins: simulateMany(db, p.a, p.d, j.n, 0, [], j.seed).attackerWins, n: j.n }));
}

/** Per worker: opponents sent once, by name. */
const oppsCache = new Map<string, TeamConfig[]>();

export function runMix(db: Db, j: MixJob): MixResult[] {
  let opps = j.opps;
  if (j.oppsKey) {
    if (opps.length) {
      oppsCache.set(j.oppsKey, opps);
      // boss teams carry their boss definitions: their unit records go in this worker's database (once)
      if (j.assault) registerBosses(db, opps);
    } else opps = oppsCache.get(j.oppsKey) ?? [];
  } else if (j.assault) registerBosses(db, opps);
  const mode = j.assault ? { mode: "assault" as const, assault: { immortal: j.assault.immortal, zeroTakenPct: j.assault.zeroTakenPct } } : {};
  return j.teams.map((team) => {
    let fit = 0, sq = 0;
    const scores: number[] | undefined = j.perBattle ? [] : undefined;
    for (let b = j.from; b < j.from + j.n; b++) {
      const opp = opps[mixOpponent(j.weights, b)]!;
      const [atk, def] = j.side === "atk" ? [team, opp] : [opp, team];
      const r = simulateBattle(db, atk, def, { ...seedsFor(j.seed, b, "all"), rules: [], recordEvents: false, recordDraws: false, ...mode });
      let f: number, s2: number;
      if (j.assault) {
        f = r.assault ? assaultScore(r.assault, j.assault) : 0;
        s2 = f * f;
      } else {
        const won = (r.winner === "atk") === (j.side === "atk");
        let mine = 0, theirs = 0;
        for (const u of r.units) if (u.alive) { if ((u.side === "atk") === (j.side === "atk")) mine++; else theirs++; }
        f = (won ? 1 : 0) + 0.001 * (mine - theirs);
        s2 = won ? 1 : 0;
      }
      fit += f; sq += s2;
      scores?.push(f);
    }
    return scores ? { fit, sq, scores } : { fit, sq };
  });
}

export function runJob(db: Db, j: Job): unknown {
  if (j.kind === "pairs") return runPairs(db, j);
  if (j.kind === "mix") return runMix(db, j);
  return runBatch(db, j);
}

export class Pool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  /** The opponent sets each worker already has (MixJob.oppsKey). */
  private has = new Map<Worker, Set<string>>();
  private queue: { job: Job; resolve: (r: unknown) => void; reject: (e: unknown) => void }[] = [];
  private ready: Promise<void>;
  constructor(file: string, n: number, workerData: unknown) {
    const starts: Promise<void>[] = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(file, { workerData });
      this.workers.push(w);
      starts.push(new Promise((res, rej) => {
        w.once("message", (m) => (m === "ready" ? res() : rej(new Error(`worker said ${String(m)}`))));
        w.once("error", rej);
      }));
    }
    this.ready = Promise.all(starts).then(() => { this.idle = [...this.workers]; });
  }
  get size() { return this.workers.length; }
  async start() { await this.ready; }
  run(b: Batch): Promise<TaskResult[]>;
  run(j: PairsJob): Promise<PairResult[]>;
  run(j: MixJob): Promise<MixResult[]>;
  run(job: Job): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ job, resolve, reject });
      this.pump();
    });
  }
  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const q = this.queue.shift()!;
      const onMsg = (r: unknown) => { w.off("error", onErr); this.idle.push(w); q.resolve(r); this.pump(); };
      const onErr = (e: unknown) => { w.off("message", onMsg); q.reject(e); };
      w.once("message", onMsg);
      w.once("error", onErr);
      let job = q.job;
      if (job.kind === "mix" && job.oppsKey) {
        const got = this.has.get(w) ?? this.has.set(w, new Set()).get(w)!;
        if (got.has(job.oppsKey)) job = { ...job, opps: [] };
        else got.add(job.oppsKey);
      }
      w.postMessage(job);
    }
  }
  async stop() { await Promise.all(this.workers.map((w) => w.terminate())); }
}

/**
 * The generator's measurement against a weighted mix of opponents, spread over the workers: about 3 jobs per worker
 * (many teams: several teams per job; few teams: their battles split up). `count` hears the battles done.
 */
export function mixEvaluate(pool: Pool, side: "atk" | "def", opps: TeamConfig[], weights: number[], seed: number, count: (battles: number) => void, assault?: AssaultSettings, oppsKey?: string): Evaluate {
  return async (teams, from, n) => {
    const target = pool.size * 3;
    const jobs: { tis: number[]; p: Promise<MixResult[]> }[] = [];
    const job = (tis: number[], b: number, k: number): MixJob => ({ kind: "mix", side, teams: tis.map((ti) => teams[ti]!), opps, weights, from: b, n: k, seed, ...(assault ? { assault } : {}), ...(oppsKey ? { oppsKey } : {}) });
    if (teams.length >= target) {
      const g = Math.ceil(teams.length / target);
      for (let i = 0; i < teams.length; i += g) {
        const tis = Array.from({ length: Math.min(g, teams.length - i) }, (_, k) => i + k);
        jobs.push({ tis, p: pool.run(job(tis, from, n)) });
      }
    } else {
      const chunk = Math.max(6, Math.ceil(n / Math.max(1, Math.round(target / teams.length))));
      teams.forEach((_, ti) => { for (let b = from; b < from + n; b += chunk) jobs.push({ tis: [ti], p: pool.run(job([ti], b, Math.min(chunk, from + n - b))) }); });
    }
    const out = teams.map(() => ({ fit: 0, sq: 0 }));
    for (const j of jobs) { const r = await j.p; j.tis.forEach((ti, k) => { out[ti]!.fit += r[k]!.fit; out[ti]!.sq += r[k]!.sq; }); }
    count(teams.length * n);
    return out;
  };
}

/**
 * Measures many tasks, keeping every worker busy (a few batches queued per worker), calling `done` with each batch's
 * results as they come in (the caller saves them, so a stop loses at most the batches in flight).
 */
export async function measure(pool: Pool, side: Batch["side"], opps: TeamConfig[], per: number, tasks: Task[], done: (r: TaskResult[]) => void, stop: () => boolean, batchSize = 8) {
  let next = 0;
  const inFlight = new Set<Promise<void>>();
  while (next < tasks.length || inFlight.size) {
    while (!stop() && next < tasks.length && inFlight.size < pool.size * 2) {
      const b: Batch = { side, opps, per, tasks: tasks.slice(next, next + batchSize) };
      next += batchSize;
      const p: Promise<void> = pool.run(b).then((r) => { inFlight.delete(p); done(r); });
      inFlight.add(p);
    }
    if (!inFlight.size) break;
    await Promise.race(inFlight);
  }
}
