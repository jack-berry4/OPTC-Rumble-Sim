/**
 * Assault Rumble in the meta run (docs/META_PLAN.md): the best teams against every boss team of every season (user,
 * 2026-11-24: all seasons), at Assault Lv 10, no season rules, ranked by the average score.
 *
 * 1. Screen (like stage 1, but against bosses): random teams from all items, each against every boss team in turn
 *    (battle j meets boss team j mod 66), scored by Assault points relative to the boss team's average, so a hard
 *    boss team doesn't count more than an easy one. Additive model per item, the weaker half dropped each round,
 *    down to `stopAt` items. (The Rumble screen can't be used: a unit strong against bosses may be weak against teams.)
 * 2. Per boss team: the team generator against it, from the screen's best random teams, the league's attack comps
 *    and the 5 best themed teams (themes.ts, measured quickly against this boss team), with the screen's items (each
 *    unit's best build in the pool, the top units' other builds as variants; the top 3 themes' units shortlisted).
 * 3. Subs for each position of each boss team's best team (stage 3's `subsForTeam`, by score).
 * The score settings: Lv 10 (x2.5), defeat x1.9; no trusty bonus (no season rules).
 */
import { join } from "node:path";
import { DEFAULT_ASSAULT, type AssaultSettings } from "../../src/engine/assault";
import { BOSS_ID_MIN, bossMember, registerBosses } from "../../src/engine/boss";
import { gameBossTeam, type AssaultSeasons } from "../../src/engine/gameKit";
import { generate, type Measured } from "../../src/engine/generator";
import type { MemberConfig, TeamConfig } from "../../src/engine/types";
import { appendLines, hash, randomTeam, readJson, readLines, rng, teamOf, writeJson, type Db, type Item, type Status } from "./common";
import { mixEvaluate, mixOpponent, type Pool } from "./pool";
import { fitEffects, type ItemScore } from "./stage1";
import { subsForTeam, type SubsConfig } from "./stage3";
import { themeGroups, themeTeam } from "./themes";

/** Lv 10 and the defeat bonus; no trusty bonus (no season rules: user, 2026-11-24). */
export const META_ASSAULT: AssaultSettings = {
  ...DEFAULT_ASSAULT,
  modifiers: DEFAULT_ASSAULT.modifiers.map((m) => (m.id === "trusty" || m.id === "owned" ? { ...m, enabled: false } : m)),
};

export interface AssaultConfig {
  /** Screen: appearances per item per round, battles per random team, share kept, items left. */
  appear: number; per: number; keep: number; stopAt: number; lambda: number;
  /** Generator per boss team. */
  step: number; final: number; beam: number; shortlist: number; variantsOf: number;
  /** Themes per boss team: battles for the quick measure, themed teams kept as starts, top themes on the shortlist. */
  themeN: number; themeStarts: number; themeShortlist: number;
  subs: SubsConfig;
}
export const ASSAULT_DEFAULTS: AssaultConfig = {
  appear: 48, per: 22, keep: 0.5, stopAt: 600, lambda: 4,
  step: 24, final: 200, beam: 3, shortlist: 60, variantsOf: 20,
  themeN: 24, themeStarts: 5, themeShortlist: 3,
  subs: { step: 24, keep: 16, maxLoss: 0.03, maxSubs: 12 },
};

export interface BossTeamRef { season: number; idx: number; name: string; team: TeamConfig }

/** Every season's boss teams at Assault Lv 10 (boss ids from BOSS_ID_MIN up, the same on every run). */
export function bossTeams(data: AssaultSeasons): BossTeamRef[] {
  let next = BOSS_ID_MIN;
  const out: BossTeamRef[] = [];
  for (const s of data.seasons) s.teams.forEach((t, idx) => {
    const bosses = gameBossTeam(data, s, t, 10, () => next++);
    out.push({ season: s.id, idx, name: t.name, team: { members: bosses.map(bossMember) } });
  });
  return out;
}

interface ScreenState { round: number; alive: string[]; done: boolean }

export async function assaultStage(o: {
  db: Db; pool: Pool; items: Item[]; seasons: AssaultSeasons; leagueAtk: string[][]; out: string; status: Status; cfg: AssaultConfig; stop: () => boolean;
}): Promise<boolean> {
  const { db, pool, status, cfg } = o;
  const dir = join(o.out, "assault");
  const byKey = new Map(o.items.map((it) => [it.key, it]));
  const bySig = new Map(o.items.map((it) => [JSON.stringify(it.m), it]));
  const teamFromKeys = (keys: string[]): TeamConfig => ({ members: Array.from({ length: 8 }, (_, i) => (keys[i] ? byKey.get(keys[i]!)?.m ?? null : null)) });
  const bosses = bossTeams(o.seasons);
  registerBosses(db, bosses.map((b) => b.team));
  const bossOpps = bosses.map((b) => b.team);
  const bossW = bossOpps.map(() => 1);
  status.log(`assault: ${bosses.length} boss teams from ${o.seasons.seasons.length} seasons`);

  // 1. the screen
  const statePath = join(dir, "screen.json");
  let st = readJson<ScreenState>(statePath) ?? { round: 0, alive: o.items.map((i) => i.key), done: false };
  let lastScores: ItemScore[] = [];
  let lastBest: string[][] = [];
  while (!o.stop()) {
    const k = st.round;
    const alive = st.alive.map((key) => byKey.get(key)).filter((x): x is Item => !!x);
    const nTeams = Math.ceil((alive.length * cfg.appear) / 8);
    const r = rng(hash("assault-screen", k));
    const teams = Array.from({ length: nTeams }, () => randomTeam(db, alive, r));
    const file = join(dir, `screen-r${k}.jsonl`);
    // per battle the score; a team's battles meet the boss teams in turn, starting at a different one per team
    type Row = { t: number; keys: string[]; scores: number[] };
    const have = new Map(readLines<Row>(file).map((x) => [x.t, x]));
    const todo = teams.map((tm, t) => t).filter((t) => !have.has(t));
    status.set({ stage: "assault", phase: `screen round ${k}`, items: alive.length, total: nTeams, done: have.size, perItem: cfg.per, note: `Assault screen, round ${k}: ${nTeams} random teams × ${cfg.per} battles against the boss teams` });
    status.log(`assault screen round ${k}: ${alive.length} items, ${nTeams} teams (${have.size} already measured), ${cfg.per} battles each`);
    // one job per few teams: each team's battles are battles [t * per, t * per + per) of a uniform mix of the boss teams
    const batch = 4;
    const inFlight = new Set<Promise<void>>();
    let next = 0;
    while (next < todo.length || inFlight.size) {
      while (!o.stop() && next < todo.length && inFlight.size < pool.size * 2) {
        const ts = todo.slice(next, next + batch);
        next += batch;
        // one job per team (its battles [t * per, t * per + per) of the even mix of boss teams), per-battle scores back;
        // the workers keep the boss teams (sent once)
        const p: Promise<void> = Promise.all(ts.map(async (t) => {
          const [x] = await pool.run({
            kind: "mix", side: "atk", teams: [teamOf(teams[t]!)], opps: bossOpps, weights: bossW, from: t * cfg.per, n: cfg.per,
            seed: hash("assault-screen-seed", k) & 0x7fffffff, assault: META_ASSAULT, oppsKey: "bosses", perBattle: true,
          });
          return { t, keys: teams[t]!.map((it) => it.key), scores: x!.scores! };
        })).then((rows) => {
          inFlight.delete(p);
          appendLines(file, rows);
          for (const row of rows) have.set(row.t, row);
          status.add(rows.length * cfg.per, have.size);
        });
        inFlight.add(p);
      }
      if (!inFlight.size) break;
      await Promise.race(inFlight);
    }
    if (o.stop()) return false;

    // scores relative to each boss team's average (battle t*per+b met boss team mixOpponent(..)); then the model
    const rows = [...have.values()].sort((a, b) => a.t - b.t);
    const w = bossW;
    const sum = new Float64Array(bossOpps.length), cnt = new Float64Array(bossOpps.length);
    for (const row of rows) row.scores.forEach((sc, b) => { const bi = mixOpponent(w, row.t * cfg.per + b); sum[bi]! += sc; cnt[bi]! += 1; });
    const avg = [...sum].map((s, i) => (cnt[i] ? s / cnt[i]! : 1) || 1);
    const ys = rows.map((row) => row.scores.reduce((a, sc, b) => a + sc / avg[mixOpponent(w, row.t * cfg.per + b)]!, 0) / row.scores.length);
    const idx = new Map(alive.map((it, i) => [it.key, i]));
    const fit = fitEffects(rows.map((row, i) => ({ params: row.keys.map((key) => idx.get(key)!), y: ys[i]!, w: 1 })), alive.length, cfg.lambda);
    const scores: ItemScore[] = alive.map((it, i) => ({ key: it.key, eff: fit.eff[i]!, se: fit.se[i]!, n: fit.n[i]! })).sort((a, b) => b.eff - a.eff);
    const want = Math.max(cfg.stopAt, Math.ceil(alive.length * cfg.keep));
    const cutoff = scores[Math.min(scores.length - 1, want - 1)]!.eff;
    const room = want === cfg.stopAt ? 0 : Math.min(Math.ceil(want * 0.3), alive.length - 1 - want);
    const extra = scores.slice(want).filter((s) => s.eff + 1.5 * s.se >= cutoff).slice(0, Math.max(0, room));
    const kept = alive.length <= cfg.stopAt ? alive.map((it) => it.key) : [...scores.slice(0, want), ...extra].map((s) => s.key);
    const best = rows.map((row, i) => ({ keys: row.keys, y: ys[i]! })).sort((a, b) => b.y - a.y).slice(0, 6).map((x) => x.keys);
    writeJson(join(dir, `screen-r${k}.json`), { round: k, items: alive.length, scores, kept, best, bossAvg: avg });
    status.log(`assault screen round ${k}: kept ${kept.length} of ${alive.length}; top items ${scores.slice(0, 5).map((s) => `${s.key} ${s.eff.toFixed(3)}`).join(", ")}`);
    lastScores = scores; lastBest = best;
    const done = kept.length <= cfg.stopAt;
    st = { round: k + 1, alive: kept, done };
    writeJson(statePath, st);
    if (done) break;
  }
  if (o.stop()) return false;
  if (!lastScores.length) {
    // resumed after the screen: its last round's file has the scores
    const last = readJson<{ scores: ItemScore[]; best: string[][] }>(join(dir, `screen-r${st.round - 1}.json`))!;
    lastScores = last.scores; lastBest = last.best;
  }

  // 2 + 3. per boss team: the generator, then subs
  const score = new Map(lastScores.map((s) => [s.key, s.eff]));
  const alive = st.alive.map((k) => byKey.get(k)).filter((x): x is Item => !!x);
  const rankOf = (it: Item) => score.get(it.key) ?? -1;
  const best = new Map<number, Item>();
  for (const it of alive) { const b = best.get(it.unitId); if (!b || rankOf(it) > rankOf(b)) best.set(it.unitId, it); }
  const topUnits = new Set([...best.values()].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, cfg.variantsOf).map((i) => i.unitId));
  const variants = alive.filter((it) => topUnits.has(it.unitId) && best.get(it.unitId) !== it).map((i) => i.m);
  const baseStarts = [...lastBest, ...o.leagueAtk].map((keys, i) => ({ title: i < lastBest.length ? `screen #${i}` : `league attack #${i - lastBest.length}`, team: teamFromKeys(keys) }));
  // themes (see themes.ts): per boss team, every group's team is measured quickly; the best few are extra starts and
  // their groups' units go on the shortlist (the screen, like stage 1, ranks synergy units low)
  const groups = themeGroups(db, alive);
  const themed = groups.map((g) => ({ g, keys: themeTeam(db, alive, g.units, rankOf) })).filter((t) => t.keys.length >= 5);
  for (const b of bosses) {
    if (o.stop()) return false;
    const resFile = join(dir, `s${b.season}-b${b.idx + 1}.json`);
    let res = readJson<{ keys: string[]; mean: number; se: number; n: number; others: { keys: string[]; mean: number; n: number }[] }>(resFile);
    const label = `season ${b.season} boss team ${b.idx + 1} (${b.name})`;
    if (!res) {
      const evaluate = mixEvaluate(pool, "atk", [b.team], [1], hash("assault", b.season, b.idx) & 0x7fffffff, (k) => status.add(k), META_ASSAULT, `boss ${b.season}-${b.idx}`);
      status.set({ phase: `themes: ${label}`, note: `Assault: ${themed.length} themed teams against ${label}` }, true);
      const quick = await evaluate(themed.map((t) => teamFromKeys(t.keys)), 0, cfg.themeN);
      if (o.stop()) return false;
      const topThemes = themed.map((t, i) => ({ t, fit: quick[i]!.fit / cfg.themeN })).sort((a, c) => c.fit - a.fit).slice(0, cfg.themeStarts);
      const themeUnits = new Set(topThemes.slice(0, cfg.themeShortlist).flatMap((e) => [...e.t.g.units]));
      const rankBySig = new Map(alive.map((it) => [JSON.stringify(it.m), rankOf(it) + (themeUnits.has(it.unitId) ? 1 : 0)]));
      const starts = [...topThemes.map((e) => ({ title: `theme ${e.t.g.token}`, team: teamFromKeys(e.t.keys) })), ...baseStarts];
      status.log(`assault ${label}: best themes as built ${topThemes.map((e) => `${e.t.g.token} ${Math.round(e.fit)}`).join(", ")}`);
      status.set({ phase: `best team: ${label}`, total: undefined, done: undefined, perItem: undefined, note: `Assault: the best team against ${label}` });
      const signal = { stopped: false };
      const timer = setInterval(() => { if (o.stop()) signal.stopped = true; }, 500);
      let found: Measured[];
      try {
        found = await generate({
          db, pool: [...best.values()].map((i) => i.m), variants, templates: [], templateSource: "meta", teams: starts,
          evaluate,
          step: cfg.step, final: cfg.final, beam: cfg.beam, shortlist: cfg.shortlist,
          rank: (m: MemberConfig) => rankBySig.get(JSON.stringify(m)) ?? -1, signal,
          onProgress: (p) => status.set({ genNote: p.note, genBest: p.best[0] ? Math.round(p.best[0].mean ?? p.best[0].fit) : undefined, genTried: p.tried }),
        });
      } finally {
        clearInterval(timer);
      }
      if (o.stop() || signal.stopped) return false;
      const keysOf = (t: TeamConfig) => t.members.map((m) => (m ? bySig.get(JSON.stringify(m))?.key ?? "" : ""));
      const top = found[0]!;
      res = { keys: keysOf(top.team), mean: top.mean ?? top.fit, se: top.se, n: top.n, others: found.slice(1, 5).map((m) => ({ keys: keysOf(m.team), mean: m.mean ?? m.fit, n: m.n })) };
      writeJson(resFile, res);
      status.log(`assault ${label}: best team averages ${Math.round(res.mean)} (± ${Math.round(res.se)}, ${res.n} battles): ${res.keys.join(" ")}`);
    }
    const items = [...new Map([...alive, ...res.keys.filter(Boolean).map((k) => byKey.get(k)!)].map((it) => [it.key, it])).values()];
    const subs = await subsForTeam({
      db, pool, items, keys: res.keys, side: "atk", opps: [b.team], weights: [1], seed: hash("assault-subs", b.season, b.idx) & 0x7fffffff,
      assault: META_ASSAULT, cfg: cfg.subs, status, stop: o.stop, file: (pos) => join(dir, `s${b.season}-b${b.idx + 1}-p${pos + 1}.json`), label,
    });
    if (!subs) return false;
  }
  return true;
}
