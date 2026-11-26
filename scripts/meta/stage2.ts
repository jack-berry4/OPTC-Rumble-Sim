/**
 * Stage 2 of the meta run (docs/META_PLAN.md): the league. Attack teams against defense teams, until neither side can
 * find a team that does clearly better against the other side's mix.
 *
 * Each iteration:
 * 1. Payoff matrix: every attack team against every defense team, `pairN` battles on the same seeds (only new pairs;
 *    kept in out/stage2/matrix.jsonl).
 * 2. The matrix as a two-player game (attacker wants wins, defender wants losses): its equilibrium (regret matching)
 *    gives how much each team is played, the mix, and the game's value v (the attack mix's win rate).
 * 3. Best response per side: the team generator (src/engine/generator.ts) against the other side's mix, from the
 *    side's most-played teams, with the units that survived stage 1 (each unit's best build in the pool, the other
 *    builds of the top units as variants), shortlisted by their stage-1 scores.
 * 4. The best responses join the populations. Done when neither beats the mix by more than `eps` (attack: win rate
 *    <= v + eps; defense: holds >= 1 - v - eps... i.e. the attack mix wins >= v - eps against it).
 * The first populations are stage 1's best random teams of each side (no outside comps).
 */
import { join } from "node:path";
import { generate, type Measured } from "../../src/engine/generator";
import type { MemberConfig, TeamConfig } from "../../src/engine/types";
import { appendLines, hash, readJson, readLines, writeJson, type Db, type Item, type Status } from "./common";
import { mixEvaluate, type Pool, type PairsJob } from "./pool";
import type { ItemScore, Stage1State } from "./stage1";
import { themeGroups, themeTeam } from "./themes";

type Side = "atk" | "def";
const SIDES: Side[] = ["atk", "def"];

export interface Stage2Config {
  /** Battles per matrix cell. */
  pairN: number;
  /** Generator: battles per measuring step, final check, starting points kept, units shortlisted. */
  step: number;
  final: number;
  beam: number;
  shortlist: number;
  /** Units whose other builds are tried too (the top ones by stage-1 score). */
  variantsOf: number;
  /** Own side's most-played teams the generator starts from. */
  startTeams: number;
  /** Done when no best response beats the mix by more than this. */
  eps: number;
  maxIters: number;
  /**
   * Themes (once, before the iterations go on): each group's team measured on `themeN` battles against the current
   * mix; the best `themes` per side are climbed by the generator (shortlist: the group's units, then the best
   * others, `themeShortlist` in all) and join the populations. See themes.ts for why.
   */
  themes: number;
  themeN: number;
  themeShortlist: number;
  themeStep: number;
  themeFinal: number;
}

export const STAGE2_DEFAULTS: Stage2Config = {
  pairN: 100, step: 24, final: 200, beam: 3, shortlist: 60, variantsOf: 20, startTeams: 5, eps: 0.02, maxIters: 30,
  themes: 30, themeN: 48, themeShortlist: 50, themeStep: 16, themeFinal: 100,
};

interface Stage2State {
  iter: number;
  teams: Record<Side, string[][]>;
  origin: Record<Side, string[]>;
  done: boolean;
  /** The themes were climbed and added (once). */
  themed?: boolean;
  history: { iter: number; value: number; br: Record<Side, { fit: number; n: number; keys: string[]; isNew: boolean }> }[];
}

/** Equilibrium of a zero-sum matrix game (rows maximize, columns minimize) by regret matching+, averaged strategies. */
export function solveGame(m: number[][], iters = 20000): { x: number[]; y: number[]; v: number } {
  const nA = m.length, nD = m[0]?.length ?? 0;
  const rA = new Float64Array(nA), rD = new Float64Array(nD), sx = new Float64Array(nA), sy = new Float64Array(nD);
  const norm = (r: Float64Array) => { const s = r.reduce((a, b) => a + Math.max(0, b), 0); return [...r].map((v) => (s > 0 ? Math.max(0, v) / s : 1 / r.length)); };
  for (let t = 1; t <= iters; t++) {
    const x = norm(rA), y = norm(rD);
    const uA = m.map((row) => row.reduce((a, v, j) => a + v * y[j]!, 0));
    const vA = uA.reduce((a, u, i) => a + u * x[i]!, 0);
    const uD = Array.from({ length: nD }, (_, j) => -m.reduce((a, row, i) => a + row[j]! * x[i]!, 0));
    const vD = uD.reduce((a, u, j) => a + u * y[j]!, 0);
    for (let i = 0; i < nA; i++) { rA[i] = Math.max(0, rA[i]! + uA[i]! - vA); sx[i]! += t * x[i]!; }
    for (let j = 0; j < nD; j++) { rD[j] = Math.max(0, rD[j]! + uD[j]! - vD); sy[j]! += t * y[j]!; }
  }
  const tot = (s: Float64Array) => s.reduce((a, b) => a + b, 0);
  const x = [...sx].map((v) => v / tot(sx)), y = [...sy].map((v) => v / tot(sy));
  const v = m.reduce((a, row, i) => a + row.reduce((b, c, j) => b + c * y[j]!, 0) * x[i]!, 0);
  return { x, y, v };
}

const sig = (keys: string[]) => keys.join(",");

export async function stage2(o: { db: Db; items: Item[]; s1: Stage1State; s1Dir: string; pool: Pool; out: string; status: Status; cfg: Stage2Config; stop: () => boolean }): Promise<Stage2State | undefined> {
  const { db, pool, status, cfg } = o;
  const dir = join(o.out, "stage2");
  const byKey = new Map(o.items.map((it) => [it.key, it]));
  const bySig = new Map(o.items.map((it) => [JSON.stringify(it.m), it]));
  const teamOfKeys = (keys: string[]): TeamConfig => ({ members: Array.from({ length: 8 }, (_, i) => (keys[i] ? byKey.get(keys[i]!)!.m : null)) });
  const keysOfTeam = (t: TeamConfig) => t.members.map((m) => (m ? bySig.get(JSON.stringify(m))?.key ?? "" : ""));

  // stage 1's last scores per side (the shortlist order) and its best random teams (the first populations)
  const lastRound = readJson<{ sides: Record<Side, { scores: ItemScore[]; nextOpps: string[][]; best?: string[][] }> }>(join(o.s1Dir, `r${o.s1.round - 1}.json`))!;
  const score: Record<Side, Map<string, number>> = { atk: new Map(), def: new Map() };
  for (const s of SIDES) for (const sc of lastRound.sides[s].scores) score[s].set(sc.key, sc.eff);

  const statePath = join(dir, "state.json");
  let state = readJson<Stage2State>(statePath) ?? {
    iter: 0,
    teams: { atk: lastRound.sides.atk.best ?? lastRound.sides.atk.nextOpps, def: lastRound.sides.def.best ?? lastRound.sides.def.nextOpps },
    origin: { atk: (lastRound.sides.atk.best ?? lastRound.sides.atk.nextOpps).map(() => "stage 1"), def: (lastRound.sides.def.best ?? lastRound.sides.def.nextOpps).map(() => "stage 1") },
    done: false,
    history: [],
  };
  writeJson(statePath, state);

  const matrixFile = join(dir, "matrix.jsonl");
  const cells = new Map(readLines<{ key: string; atkWins: number; n: number }>(matrixFile).map((c) => [c.key, c]));

  /** The matrix for the current populations (new cells measured first), or undefined when stopped. */
  const matrix = async (label: string): Promise<number[][] | undefined> => {
    const todo: PairsJob["pairs"] = [];
    for (const a of state.teams.atk) for (const d of state.teams.def) {
      const key = `${sig(a)}|${sig(d)}`;
      if (!cells.has(key)) todo.push({ a: teamOfKeys(a), d: teamOfKeys(d), key });
    }
    status.set({ stage: 2, phase: "matrix", total: todo.length, done: 0, perItem: cfg.pairN, note: `Stage 2, ${label}: ${todo.length} new matrix cells × ${cfg.pairN} battles` });
    status.log(`stage 2 ${label}: ${state.teams.atk.length} attack × ${state.teams.def.length} defense teams, ${todo.length} new cells`);
    let doneCells = 0;
    await Promise.all(Array.from({ length: Math.ceil(todo.length / 2) }, (_, i) => todo.slice(i * 2, i * 2 + 2)).map(async (pairs) => {
      if (o.stop()) return;
      const res = await pool.run({ kind: "pairs", pairs, n: cfg.pairN, seed: hash("s2pair") & 0x7fffffff });
      appendLines(matrixFile, res);
      for (const r of res) cells.set(r.key, r);
      doneCells += res.length;
      status.add(res.length * cfg.pairN, doneCells);
    }));
    if (o.stop()) return undefined;
    return state.teams.atk.map((a) => state.teams.def.map((d) => { const c = cells.get(`${sig(a)}|${sig(d)}`)!; return c.atkWins / c.n; }));
  };

  // themes (once): climb from each strong theme's team against the current mix; the results join the populations
  if (!state.themed && !o.stop()) {
    const m0 = await matrix("before themes");
    if (!m0) return undefined;
    const g0 = solveGame(m0);
    const w0: Record<Side, number[]> = { atk: g0.x, def: g0.y };
    const added: Record<Side, string[][]> = { atk: [], def: [] };
    const addedFrom: Record<Side, string[]> = { atk: [], def: [] };
    for (const side of SIDES) {
      const otherSide: Side = side === "atk" ? "def" : "atk";
      const oppIdx = w0[otherSide].map((w, i) => ({ w, i })).filter((e) => e.w > 0.002);
      const opps = oppIdx.map((e) => teamOfKeys(state.teams[otherSide][e.i]!));
      const oppW = oppIdx.map((e) => e.w);
      const alive = o.s1.alive[side].map((k) => byKey.get(k)).filter((x): x is Item => !!x);
      const scoreOf = (it: Item) => score[side].get(it.key) ?? -1;
      const groups = themeGroups(db, alive);
      const themed = groups.map((g) => ({ g, keys: themeTeam(db, alive, g.units, scoreOf) })).filter((t) => t.keys.length >= 5);
      const evaluate = mixEvaluate(pool, side, opps, oppW, hash("s2themes", side) & 0x7fffffff, (k) => status.add(k));
      status.set({ stage: 2, phase: `themes ${side}`, note: `Stage 2: ${themed.length} ${side === "atk" ? "attack" : "defense"} themes, measured against the current mix` }, true);
      const quick = await evaluate(themed.map((t) => teamOfKeys(t.keys)), 0, cfg.themeN);
      if (o.stop()) return undefined;
      const order = themed.map((t, i) => ({ t, fit: quick[i]!.sq / cfg.themeN })).sort((a, b) => b.fit - a.fit).slice(0, cfg.themes);
      status.log(`stage 2 themes ${side}: ${themed.length} groups; best themed teams as built: ${order.slice(0, 8).map((e) => `${e.t.g.token} ${(e.fit * 100).toFixed(0)}%`).join(", ")}`);
      for (const [n, e] of order.entries()) {
        const file = join(dir, `theme-${side}-${n}.json`);
        let res = readJson<{ token: string; keys: string[]; start: number; fit: number; n: number }>(file);
        if (!res) {
          // the pool: the group's units first, then the best others, one build each (the best by stage 1)
          const inGroup = (it: Item) => e.t.g.units.has(it.unitId);
          const rankOf = (it: Item) => scoreOf(it) + (inGroup(it) ? 10 : 0);
          const bestBuild = new Map<number, Item>();
          for (const it of alive) { const b = bestBuild.get(it.unitId); if (!b || rankOf(it) > rankOf(b)) bestBuild.set(it.unitId, it); }
          for (const k of e.t.keys) { const it = byKey.get(k)!; bestBuild.set(it.unitId, it); }
          const rankBySig = new Map([...bestBuild.values()].map((it) => [JSON.stringify(it.m), rankOf(it)]));
          status.set({ phase: `theme ${side} ${n + 1}/${order.length}: ${e.t.g.token}`, note: `Stage 2: climbing the ${e.t.g.token} ${side === "atk" ? "attack" : "defense"} team (${(e.fit * 100).toFixed(0)}% as built)` }, true);
          const signal = { stopped: false };
          const timer = setInterval(() => { if (o.stop()) signal.stopped = true; }, 500);
          let found: Measured[];
          try {
            found = await generate({
              db, pool: [...bestBuild.values()].map((i) => i.m), variants: [], templates: [], templateSource: "meta",
              teams: [{ title: `theme ${e.t.g.token}`, team: teamOfKeys(e.t.keys) }], evaluate, winRate: true,
              step: cfg.themeStep, final: cfg.themeFinal, beam: 1, shortlist: cfg.themeShortlist,
              rank: (mm: MemberConfig) => rankBySig.get(JSON.stringify(mm)) ?? -1, signal,
              onProgress: (p) => status.set({ genNote: p.note, genBest: p.best[0] ? Math.round((p.best[0].sq ?? 0) / Math.max(1, p.best[0].n) * 1000) / 1000 : undefined, genTried: p.tried }),
            });
          } finally {
            clearInterval(timer);
          }
          if (o.stop() || signal.stopped) return undefined;
          const top = found[0]!;
          res = { token: e.t.g.token, keys: keysOfTeam(top.team), start: e.fit, fit: (top.sq ?? 0) / top.n, n: top.n };
          writeJson(file, res);
          status.log(`stage 2 theme ${side} ${e.t.g.token}: ${(e.fit * 100).toFixed(0)}% as built -> ${(res.fit * 100).toFixed(1)}% (${res.n} battles): ${res.keys.join(" ")}`);
        }
        if (!state.teams[side].some((t) => sig(t) === sig(res!.keys)) && !added[side].some((t) => sig(t) === sig(res!.keys))) {
          added[side].push(res.keys);
          addedFrom[side].push(`theme ${res.token}`);
        }
      }
    }
    state = {
      ...state,
      teams: { atk: [...state.teams.atk, ...added.atk], def: [...state.teams.def, ...added.def] },
      origin: { atk: [...state.origin.atk, ...addedFrom.atk], def: [...state.origin.def, ...addedFrom.def] },
      done: false,
      themed: true,
    };
    writeJson(statePath, state);
    status.log(`stage 2 themes: ${added.atk.length} attack and ${added.def.length} defense themed teams join the league`);
  }

  while (!state.done && !o.stop() && state.iter < cfg.maxIters) {
    const it = state.iter;
    status.set({ iter: it });
    // 1. the matrix (new pairs only)
    const m = await matrix(`iteration ${it}`);
    if (!m) return undefined;

    // 2. the mix
    const { x, y, v } = solveGame(m);
    const weights: Record<Side, number[]> = { atk: x, def: y };
    const show = (s: Side) => weights[s].map((w, i) => ({ w, i })).filter((e) => e.w > 0.01).sort((a, b) => b.w - a.w).slice(0, 5).map((e) => `#${e.i} ${(e.w * 100).toFixed(0)}%`).join(", ");
    status.log(`stage 2 iteration ${it}: value ${v.toFixed(3)} (the attack mix's win rate); attack mix ${show("atk")}; defense mix ${show("def")}`);

    // 3. best responses
    const br = {} as Stage2State["history"][number]["br"];
    for (const side of SIDES) {
      const otherSide: Side = side === "atk" ? "def" : "atk";
      const oppIdx = weights[otherSide].map((w, i) => ({ w, i })).filter((e) => e.w > 0.002);
      const opps = oppIdx.map((e) => teamOfKeys(state.teams[otherSide][e.i]!));
      const oppW = oppIdx.map((e) => e.w);
      // the pool: each unit's best build for this side; the other builds of the top units as variants
      const alive = o.s1.alive[side].map((k) => byKey.get(k)).filter((x): x is Item => !!x);
      const used = new Set(state.teams[side].filter((_, i) => weights[side][i]! > 0.002).flat().map((k) => byKey.get(k)?.unitId));
      const rankOf = (itm: Item) => (score[side].get(itm.key) ?? -1) + (used.has(itm.unitId) ? 1 : 0);
      const best = new Map<number, Item>();
      for (const itm of alive) { const b = best.get(itm.unitId); if (!b || rankOf(itm) > rankOf(b)) best.set(itm.unitId, itm); }
      const topUnits = new Set([...best.values()].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, cfg.variantsOf).map((i) => i.unitId));
      const variants = alive.filter((itm) => topUnits.has(itm.unitId) && best.get(itm.unitId) !== itm).map((i) => i.m);
      const rankBySig = new Map(alive.map((itm) => [JSON.stringify(itm.m), rankOf(itm)]));
      const starts = weights[side].map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w).slice(0, cfg.startTeams)
        .map((e) => ({ title: `${side} #${e.i}`, team: teamOfKeys(state.teams[side][e.i]!) }));
      const seed = hash("s2mix", it, side) & 0x7fffffff;
      const evaluate = mixEvaluate(pool, side, opps, oppW, seed, (k) => status.add(k));
      status.set({ phase: `best ${side === "atk" ? "attack" : "defense"} team`, total: undefined, done: undefined, perItem: undefined, note: `Stage 2, iteration ${it}: generator for the best ${side === "atk" ? "attack" : "defense"} team against the ${otherSide === "atk" ? "attack" : "defense"} mix (${opps.length} teams)` });
      const signal = { stopped: false };
      const timer = setInterval(() => { if (o.stop()) signal.stopped = true; }, 500);
      let res: Measured[];
      try {
        res = await generate({
          db, pool: [...best.values()].map((i) => i.m), variants, templates: [], templateSource: "meta", teams: starts,
          evaluate, winRate: true, step: cfg.step, final: cfg.final, beam: cfg.beam, shortlist: cfg.shortlist,
          rank: (mm: MemberConfig) => rankBySig.get(JSON.stringify(mm)) ?? -1, signal,
          onProgress: (p) => status.set({ genNote: p.note, genBest: p.best[0] ? Math.round((p.best[0].sq ?? 0) / Math.max(1, p.best[0].n) * 1000) / 1000 : undefined, genTried: p.tried }),
        });
      } finally {
        clearInterval(timer);
      }
      if (o.stop() || signal.stopped) return undefined;
      const top = res[0]!;
      const keys = keysOfTeam(top.team);
      const isNew = !state.teams[side].some((t) => sig(t) === sig(keys));
      br[side] = { fit: (top.sq ?? 0) / top.n, n: top.n, keys, isNew };
      status.log(`stage 2 iteration ${it}: best ${side} team wins ${(br[side].fit * 100).toFixed(1)}% of ${top.n} vs the mix${isNew ? "" : " (already in)"}: ${keys.join(" ")}`);
    }

    // 4. add, check
    const atkGain = br.atk.fit - v, defGain = br.def.fit - (1 - v);
    const next: Stage2State = {
      iter: it + 1,
      teams: { atk: [...state.teams.atk], def: [...state.teams.def] },
      origin: { atk: [...state.origin.atk], def: [...state.origin.def] },
      done: false,
      history: [...state.history, { iter: it, value: v, br }],
    };
    for (const side of SIDES) if (br[side].isNew) { next.teams[side].push(br[side].keys); next.origin[side].push(`iteration ${it}`); }
    next.done = (atkGain <= cfg.eps && defGain <= cfg.eps) || (!br.atk.isNew && !br.def.isNew);
    writeJson(join(dir, `iter${it}.json`), { iter: it, value: v, x, y, teams: state.teams, origin: state.origin, br, atkGain, defGain });
    status.log(`stage 2 iteration ${it}: attack gains ${atkGain.toFixed(3)}, defense gains ${defGain.toFixed(3)} over the mix${next.done ? ": done" : ""}`);
    state = next;
    writeJson(statePath, state);
  }
  if (o.stop()) return undefined;
  // the final populations (with the last best responses) and their mix: stage 3's comps
  const m = await matrix("final");
  if (!m) return undefined;
  const { x, y, v } = solveGame(m);
  writeJson(join(dir, "final.json"), { iter: state.iter, done: state.done, value: v, teams: state.teams, origin: state.origin, x, y, matrix: m });
  status.log(`stage 2 final: value ${v.toFixed(3)}; ${x.filter((w) => w > 0.01).length} attack and ${y.filter((w) => w > 0.01).length} defense teams played at least 1%`);
  return state;
}

export interface LeagueFinal { iter: number; done: boolean; value: number; teams: Record<"atk" | "def", string[][]>; origin: Record<"atk" | "def", string[]>; x: number[]; y: number[]; matrix: number[][] }
