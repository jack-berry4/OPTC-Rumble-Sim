/**
 * Stage 3 of the meta run (docs/META_PLAN.md): subs for each position of each comp.
 *
 * For a comp (a team the league's mix plays, or the best team against an Assault boss team) and one position: every
 * item that can stand there (keeps the cost / family rules with the rest of the team) is measured in that position
 * against the same opponents, by successive halving (all on a few battles, the better third on 3x as many, ...).
 * The comp itself is measured on the same battles at every step. A sub = a candidate within `maxLoss` of the comp
 * (win rate: percentage points; Assault: share of the score). The other builds of the position's own unit are always
 * reported, whatever they lose ("the Lv 99 version loses 4%").
 */
import { join } from "node:path";
import { legalTeam } from "../../src/engine/generator";
import type { AssaultSettings } from "../../src/engine/assault";
import type { TeamConfig } from "../../src/engine/types";
import { readJson, writeJson, type Db, type Item, type Status } from "./common";
import { mixEvaluate, type Pool } from "./pool";

export interface SubsConfig { step: number; keep: number; maxLoss: number; maxSubs: number }
export const SUBS_DEFAULTS: SubsConfig = { step: 48, keep: 16, maxLoss: 0.03, maxSubs: 12 };

export interface Sub { key: string; fit: number; n: number; loss: number }
export interface PositionSubs { pos: number; key: string; base: number; n: number; subs: Sub[]; ownBuilds: Sub[]; tried: number }

/**
 * Subs for every filled position of a team. Each position's result is saved in `file(pos)` as it finishes (a stop
 * keeps the positions done).
 */
export async function subsForTeam(o: {
  db: Db; pool: Pool; items: Item[]; keys: string[]; side: "atk" | "def"; opps: TeamConfig[]; weights: number[]; seed: number;
  assault?: AssaultSettings; cfg: SubsConfig; status: Status; stop: () => boolean; file: (pos: number) => string; label: string;
}): Promise<PositionSubs[] | undefined> {
  const { db, cfg } = o;
  const byKey = new Map(o.items.map((it) => [it.key, it]));
  const team = (keys: string[]): TeamConfig => ({ members: Array.from({ length: 8 }, (_, i) => (keys[i] ? byKey.get(keys[i]!)?.m ?? null : null)) });
  const evaluate = mixEvaluate(o.pool, o.side, o.opps, o.weights, o.seed, (k) => o.status.add(k), o.assault);
  const out: PositionSubs[] = [];
  for (let pos = 0; pos < 8; pos++) {
    const own = o.keys[pos];
    if (!own) continue;
    const saved = readJson<PositionSubs>(o.file(pos));
    if (saved) { out.push(saved); continue; }
    if (o.stop()) return undefined;
    const ownUnit = byKey.get(own)?.unitId;
    // candidates: items that keep the rules in this place (other builds of the same unit included)
    const cands = o.items.filter((it) => it.key !== own && legalTeam(db, team(o.keys.map((k, i) => (i === pos ? it.key : k)))));
    o.status.set({ phase: `subs: ${o.label}, place ${pos + 1}`, total: cands.length, done: 0, perItem: cfg.step });
    const sums = new Map<string, { fit: number; sq: number; n: number }>();
    const measureTo = async (keys: string[], n: number) => {
      const need = keys.filter((k) => (sums.get(k)?.n ?? 0) < n);
      // group by how far each is, so a call measures the same battles for all in it
      const byFrom = new Map<number, string[]>();
      for (const k of need) { const f = sums.get(k)?.n ?? 0; (byFrom.get(f) ?? byFrom.set(f, []).get(f)!).push(k); }
      for (const [from, ks] of byFrom) {
        const teams = ks.map((k) => team(o.keys.map((x, i) => (i === pos ? k : x))));
        const res = await evaluate(teams, from, n - from);
        ks.forEach((k, i) => { const s = sums.get(k) ?? { fit: 0, sq: 0, n: 0 }; s.fit += res[i]!.fit; s.sq += res[i]!.sq; s.n = n; sums.set(k, s); });
      }
    };
    const mean = (k: string) => { const s = sums.get(k)!; return o.assault ? s.fit / s.n : s.sq / s.n; };
    let alive = cands.map((c) => c.key);
    let n = cfg.step;
    for (;;) {
      await measureTo([own, ...alive], n);
      if (o.stop()) return undefined;
      alive.sort((a, b) => mean(b) - mean(a));
      if (alive.length <= cfg.keep) break;
      alive = alive.slice(0, Math.max(cfg.keep, Math.ceil(alive.length / 3)));
      n *= 3;
    }
    // the own unit's other builds, on the same battles as the comp
    const ownBuilds = cands.filter((c) => c.unitId === ownUnit).map((c) => c.key);
    await measureTo([own, ...ownBuilds], n);
    if (o.stop()) return undefined;
    const base = mean(own);
    const loss = (k: string) => (o.assault ? (base - mean(k)) / Math.max(1, base) : base - mean(k));
    const row = (k: string): Sub => ({ key: k, fit: mean(k), n: sums.get(k)!.n, loss: loss(k) });
    const res: PositionSubs = {
      pos, key: own, base, n,
      subs: alive.filter((k) => loss(k) <= cfg.maxLoss && byKey.get(k)!.unitId !== ownUnit).slice(0, cfg.maxSubs).map(row),
      ownBuilds: ownBuilds.map(row),
      tried: cands.length,
    };
    writeJson(o.file(pos), res);
    const diff = (x: Sub) => { const v = Math.abs(x.loss * 100).toFixed(1) + (o.assault ? "%" : " pts"); return x.loss < 0 ? `${v} BETTER than the comp` : `${v} less`; };
    o.status.log(`subs ${o.label} place ${pos + 1} (${own}, ${o.assault ? Math.round(base) : (base * 100).toFixed(1) + "%"}): ${res.subs.length} subs of ${cands.length} tried${res.subs[0] ? `, best ${res.subs[0].key} (${diff(res.subs[0])})` : ""}`);
    out.push(res);
  }
  return out;
}

/** Stage 3 for the league: every comp the final mix plays at least `minWeight`, both sides. */
export async function stage3(o: {
  db: Db; pool: Pool; items: Item[]; alive: Record<"atk" | "def", string[]>; league: { teams: Record<"atk" | "def", string[][]> }; weights: Record<"atk" | "def", number[]>;
  out: string; status: Status; cfg: SubsConfig; minWeight: number; stop: () => boolean;
}): Promise<boolean> {
  const byKey = new Map(o.items.map((it) => [it.key, it]));
  const teamOf = (keys: string[]): TeamConfig => ({ members: Array.from({ length: 8 }, (_, i) => (keys[i] ? byKey.get(keys[i]!)!.m : null)) });
  for (const side of ["atk", "def"] as const) {
    const other = side === "atk" ? "def" : "atk";
    const oppIdx = o.weights[other].map((w, i) => ({ w, i })).filter((e) => e.w > 0.002);
    const opps = oppIdx.map((e) => teamOf(o.league.teams[other][e.i]!));
    const oppW = oppIdx.map((e) => e.w);
    const comps = o.weights[side].map((w, i) => ({ w, i })).filter((e) => e.w >= o.minWeight).sort((a, b) => b.w - a.w);
    const sideItems = o.alive[side].map((k) => byKey.get(k)).filter((x): x is Item => !!x);
    for (const c of comps) {
      const keys = o.league.teams[side][c.i]!;
      // the comp's own units count as candidates too (whatever stage 1 said)
      const items = [...new Map([...sideItems, ...keys.filter(Boolean).map((k) => byKey.get(k)!)].map((it) => [it.key, it])).values()];
      const r = await subsForTeam({
        db: o.db, pool: o.pool, items, keys, side, opps, weights: oppW, seed: 7_000_001 + c.i, cfg: o.cfg, status: o.status, stop: o.stop,
        file: (pos) => join(o.out, "stage3", `${side}-${c.i}-p${pos + 1}.json`), label: `${side} #${c.i} (${(c.w * 100).toFixed(0)}%)`,
      });
      if (!r) return false;
    }
  }
  return true;
}
