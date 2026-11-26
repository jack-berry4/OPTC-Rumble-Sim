/**
 * Stage 1 of the meta run (docs/META_PLAN.md): which units (with which builds) matter, without starting from anyone's
 * comps.
 *
 * Each round, per side (attack, defense):
 * 1. Random legal teams from the side's items still in, each playing `per` battles against each of the side's
 *    opponents (attack screen: the defense side's best teams so far, and the other way round).
 * 2. Each item's effect on the win rate, from an additive model over all the teams (each battle tells about 8 items
 *    at once), with its standard error. Also per role (starter / bench) for information.
 * 3. The best random teams are measured again on more battles; the best few (not too alike) become the OTHER side's
 *    opponents next round.
 * 4. The weaker part of the items is dropped (an item close to the cut-off by its error is kept), until a side has
 *    `stopAt` items or fewer.
 * Round 0 has no best teams yet: its opponents are random teams from all the items.
 *
 * Everything measured is appended to out/stage1/ as it comes in; a round's summary is written when it ends. A
 * stopped run picks up where it was (the random teams are rebuilt from the same seeds).
 */
import { join } from "node:path";
import { appendLines, hash, readJson, readLines, randomTeam, rng, teamOf, writeJson, type Db, type Item, type Status } from "./common";
import { measure, type Pool, type Task } from "./pool";

type Side = "atk" | "def";
const SIDES: Side[] = ["atk", "def"];
const other = (s: Side): Side => (s === "atk" ? "def" : "atk");

export interface Stage1Config {
  /** Random teams per round: enough for each item to be in about this many. */
  appear: number;
  /** Battles per opponent for a random team. */
  per: number;
  /** Opponents per side. */
  nOpp: number;
  /** Share of items kept each round. */
  keep: number;
  /** A side stops shrinking at this many items. */
  stopAt: number;
  /** Ridge strength of the effect model (in "teams"). */
  lambda: number;
  /** Teams measured again for the next opponents, and battles per opponent for that. */
  topTeams: number;
  topPer: number;
}

export const STAGE1_DEFAULTS: Stage1Config = { appear: 48, per: 4, nOpp: 6, keep: 0.5, stopAt: 600, lambda: 4, topTeams: 40, topPer: 16 };

interface Row { t: number; keys: string[]; wins: number; n: number }
export interface ItemScore { key: string; eff: number; se: number; n: number; starter?: number; bench?: number }
interface SideRound { items: number; teams: number; battles: number; mean: number; sd: number; flat: boolean; scores: ItemScore[]; kept: string[]; nextOpps: string[][]; best: string[][] }
interface RoundFile { round: number; sides: Record<Side, SideRound> }
export interface Stage1State { round: number; alive: Record<Side, string[]>; opps: Record<Side, string[][]>; done: boolean }

/** Additive model: fit_t = mu + sum of the team's parameters; Gauss-Seidel with a ridge pull to 0. */
export function fitEffects(rows: { params: number[]; y: number; w: number }[], nParams: number, lambda: number) {
  const eff = new Float64Array(nParams);
  const nP = new Float64Array(nParams);
  const byParam: number[][] = Array.from({ length: nParams }, () => []);
  let sw = 0, sy = 0;
  rows.forEach((r, t) => { sw += r.w; sy += r.w * r.y; for (const p of r.params) { byParam[p]!.push(t); nP[p]! += r.w; } });
  const mu = sw ? sy / sw : 0;
  const pred = rows.map(() => mu);
  for (let pass = 0; pass < 8; pass++) {
    for (let p = 0; p < nParams; p++) {
      const ts = byParam[p]!;
      if (!ts.length) continue;
      let r = 0;
      for (const t of ts) r += rows[t]!.w * (rows[t]!.y - pred[t]!);
      const next = (r + nP[p]! * eff[p]!) / (nP[p]! + lambda);
      const d = next - eff[p]!;
      if (d) for (const t of ts) pred[t]! += d;
      eff[p] = next;
    }
  }
  let ss = 0;
  rows.forEach((r, t) => { ss += r.w * (r.y - pred[t]!) ** 2; });
  const sd = Math.sqrt(ss / Math.max(1, sw));
  return { mu, eff, se: [...nP].map((n) => sd / Math.sqrt(n + lambda)), n: nP };
}

export async function stage1(o: { db: Db; items: Item[]; pool: Pool; out: string; status: Status; cfg: Stage1Config; stop: () => boolean }): Promise<Stage1State | undefined> {
  const { db, pool, status, cfg } = o;
  const dir = join(o.out, "stage1");
  const byKey = new Map(o.items.map((it) => [it.key, it]));
  const teamFromKeys = (keys: string[]) => teamOf(keys.map((k) => byKey.get(k)!));
  const statePath = join(dir, "state.json");
  let state = readJson<Stage1State>(statePath);
  if (!state) {
    // round 0's opponents: random teams from the same items, so the random teams win about half their battles (6★ MAX
    // opponents were tried first: the random teams won 0.7% of battles, too few to tell items apart)
    const r = rng(hash("stage1", "opps0"));
    const opps0 = (side: Side) => Array.from({ length: cfg.nOpp }, () => randomTeam(db, o.items, r).map((it) => it.key));
    const all = o.items.map((it) => it.key);
    state = { round: 0, alive: { atk: all, def: all }, opps: { atk: opps0("atk"), def: opps0("def") }, done: false };
    writeJson(statePath, state);
  }
  while (!state.done && !o.stop()) {
    const k: number = state.round;
    const sides = {} as Record<Side, SideRound>;
    for (const side of SIDES) {
      const alive = state.alive[side].map((key) => byKey.get(key)).filter((x): x is Item => !!x);
      const opps = state.opps[side].map(teamFromKeys);
      const nTeams = Math.ceil((alive.length * cfg.appear) / 8);
      const r = rng(hash("stage1", k, side));
      const teams = Array.from({ length: nTeams }, () => randomTeam(db, alive, r));
      // measure (what's already in the file is kept)
      const file = join(dir, `r${k}-${side}.jsonl`);
      const have = new Map(readLines<Row>(file).map((x) => [x.t, x]));
      const todo: Task[] = teams.map((tm, t) => ({ id: t, team: teamOf(tm), seed: hash("s1", k, side, t) & 0x7fffffff })).filter((x) => !have.has(x.id));
      const perTeam = cfg.per * opps.length;
      status.set({ stage: 1, round: k, side, phase: "random teams", items: alive.length, total: nTeams, done: have.size, perItem: perTeam, note: `Stage 1, round ${k}, ${side === "atk" ? "attack" : "defense"}: ${nTeams} random teams × ${perTeam} battles` });
      status.log(`stage 1 round ${k} ${side}: ${alive.length} items, ${nTeams} teams (${have.size} already measured), ${perTeam} battles each`);
      await measure(pool, side, opps, cfg.per, todo, (res) => {
        const rows = res.map((x) => ({ t: x.id, keys: teams[x.id]!.map((it) => it.key), wins: x.wins, n: x.n }));
        appendLines(file, rows);
        for (const row of rows) have.set(row.t, row);
        status.add(res.length * perTeam, have.size);
      }, o.stop);
      if (o.stop()) return undefined;

      // effects: per item (for the cut), and per item and role (starter = places 1-5, bench = 6-8)
      const idx = new Map(alive.map((it, i) => [it.key, i]));
      const rows = [...have.values()].sort((a, b) => a.t - b.t);
      const fitAll = fitEffects(rows.map((x) => ({ params: x.keys.map((key) => idx.get(key)!), y: x.wins / x.n, w: 1 })), alive.length, cfg.lambda);
      const fitRole = fitEffects(rows.map((x) => ({ params: x.keys.map((key, pos) => idx.get(key)! * 2 + (pos < 5 ? 0 : 1)), y: x.wins / x.n, w: 1 })), alive.length * 2, cfg.lambda);
      const scores: ItemScore[] = alive.map((it, i) => ({
        key: it.key, eff: fitAll.eff[i]!, se: fitAll.se[i]!, n: fitAll.n[i]!,
        starter: fitRole.eff[i * 2]!, bench: fitRole.eff[i * 2 + 1]!,
      })).sort((a, b) => b.eff - a.eff);

      // the cut: the best share, plus the ones within 1.5 errors of the cut-off (at most 1.3x the share); the last
      // cut (down to `stopAt`) is exact, or a side could hover just above it forever
      const want = Math.max(cfg.stopAt, Math.ceil(alive.length * cfg.keep));
      const cutoff = scores[Math.min(scores.length - 1, want - 1)]!.eff;
      const room = want === cfg.stopAt ? 0 : Math.min(Math.ceil(want * 0.3), alive.length - 1 - want);
      const extra = scores.slice(want).filter((s) => s.eff + 1.5 * s.se >= cutoff).slice(0, Math.max(0, room));
      // a round where (nearly) every team wins, or every team loses, says nothing about the items: no cut then
      const ys = rows.map((x) => x.wins / x.n);
      const mean = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
      const sd = Math.sqrt(ys.reduce((a, y) => a + (y - mean) ** 2, 0) / Math.max(1, ys.length));
      const flat = sd < 0.05 || mean < 0.03 || mean > 0.97;
      if (flat) {
        status.log(`WARNING stage 1 round ${k} ${side}: random teams' win rate ${mean.toFixed(3)} ± ${sd.toFixed(3)}: too even to rank items; no cut this round`);
        status.set({ warning: `round ${k} ${side}: win rates too even (${mean.toFixed(3)} ± ${sd.toFixed(3)}), no cut` });
      }
      const kept = flat || alive.length <= cfg.stopAt ? alive.map((it) => it.key) : [...scores.slice(0, want), ...extra].map((s) => s.key);

      // the other side's next opponents: teams spread over this round's top quarter (the very best down to the 25th
      // percentile), measured again: strong, but beatable, so the next round's win rates still tell items apart
      const byFit = [...rows].sort((a, b) => b.wins / b.n - a.wins / a.n || a.t - b.t);
      const top = [...new Set(Array.from({ length: cfg.topTeams }, (_, i) => byFit[Math.floor((byFit.length * 0.25 * i) / cfg.topTeams)]!))];
      const topFile = join(dir, `r${k}-${side}-top.jsonl`);
      const topHave = new Map(readLines<{ t: number; wins: number; n: number }>(topFile).map((x) => [x.t, x]));
      const topTodo: Task[] = top.filter((x) => !topHave.has(x.t)).map((x) => ({ id: x.t, team: teamFromKeys(x.keys), seed: hash("s1top", k, side, x.t) & 0x7fffffff }));
      status.set({ phase: "top teams", total: top.length, done: topHave.size, perItem: cfg.topPer * opps.length });
      await measure(pool, side, opps, cfg.topPer, topTodo, (res) => {
        appendLines(topFile, res.map((x) => ({ t: x.id, wins: x.wins, n: x.n })));
        for (const x of res) topHave.set(x.id, { t: x.id, wins: x.wins, n: x.n });
        status.add(res.length * cfg.topPer * opps.length, topHave.size);
      }, o.stop, 1);
      if (o.stop()) return undefined;
      const ranked = top.map((x) => ({ keys: x.keys, fit: (topHave.get(x.t)!.wins + x.wins) / (topHave.get(x.t)!.n + x.n) })).sort((a, b) => b.fit - a.fit);  // stable: ties keep team order
      // not too alike: at most 4 units in common with one already picked
      const alike = (list: string[][], keys: string[]) => { const units = new Set(keys.map((key) => byKey.get(key)!.unitId)); return list.some((p) => p.filter((key) => units.has(byKey.get(key)!.unitId)).length > 4); };
      // the opponents: evenly spread over the ranking (the nearest not-too-alike team at or below each spot)
      const nextOpps: string[][] = [];
      for (let j = 0; j < cfg.nOpp; j++) {
        const at = Math.round((j * (ranked.length - 1)) / Math.max(1, cfg.nOpp - 1));
        const cand = [...ranked.slice(at), ...ranked.slice(0, at)].find((c) => !nextOpps.includes(c.keys) && !alike(nextOpps, c.keys));
        if (cand) nextOpps.push(cand.keys);
      }
      // the very best few (stage 2's first teams)
      const best: string[][] = [];
      for (const c of ranked) if (best.length < cfg.nOpp && !alike(best, c.keys)) best.push(c.keys);
      sides[side] = { items: alive.length, teams: nTeams, mean, sd, flat, battles: nTeams * perTeam + top.length * cfg.topPer * opps.length, scores, kept, nextOpps, best };
      status.log(`stage 1 round ${k} ${side}: kept ${kept.length} of ${alive.length}; random teams ${mean.toFixed(3)} ± ${sd.toFixed(3)}; best team ${ranked[0]?.fit.toFixed(3)}; top items ${scores.slice(0, 5).map((s) => `${s.key} ${s.eff.toFixed(3)}`).join(", ")}`);
    }
    writeJson(join(dir, `r${k}.json`), { round: k, sides } satisfies RoundFile);
    const done = SIDES.every((s) => sides[s].kept.length <= cfg.stopAt);
    state = {
      round: k + 1,
      alive: { atk: sides.atk.kept, def: sides.def.kept },
      // attack teams are measured against the defense side's best teams, and the other way round
      opps: { atk: sides[other("atk")].nextOpps.length ? sides.def.nextOpps : state.opps.atk, def: sides.atk.nextOpps.length ? sides.atk.nextOpps : state.opps.def },
      done,
    };
    writeJson(statePath, state);
  }
  return state;
}
