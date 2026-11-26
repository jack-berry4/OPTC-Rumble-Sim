/**
 * Team generator (docs/PLAN_MODES.md section 3): the best team from a pool of units against one known enemy team (or
 * boss team), within the cost and family rules. Fitness is the win rate (Assault Rumble: the average score), measured
 * by simulation; every candidate plays the same battles (seeds), so differences come from the teams, not luck.
 *
 * Search:
 * 1. Starting points: the templates (the meta run's comps, src/engine/meta.ts) and the user's saved / current teams,
 *    adapted to the pool (a missing unit is replaced by that position's sub, else one of the comp's options, else a
 *    pool unit of the same type or class), and a team around each group the pool's kits buff (src/engine/themes.ts).
 *    Each is measured on a few battles; the best few are kept.
 * 2. Climbing from each kept start: every single change (one position replaced by a shortlisted unit, or two positions
 *    swapped, bench order included), narrowed down by successive halving (all on a few battles, the better third on
 *    3x as many, ...); the winner replaces the team when it beats it on the same battles. When no single change helps,
 *    two-unit changes: pairs of the best single changes, and a promising unit together with a unit it works with (its
 *    kit targets, counts on or needs it) in one of the weakest places, for teams that need two new units at once.
 * 3. The top teams get a final, longer measurement: the first result.
 * 4. Kicks (`kicks`, user 2026-11-25: a good team fairly quickly, then better ones the longer it runs): from the best
 *    team, bigger changes (the rest of the team rebuilt around a group most of it is in, the last round's best
 *    two-unit changes, three places rebuilt around a unit and units it works with); the best of them is climbed from
 *    even if it measures worse at first; a final check after each. The best team ever found stays on top.
 * The driver only asks for measurements (`evaluate`), so it runs the same with the browser's worker pool and in tests.
 */
import type { UnitRecord } from "../data/schema";
import { clashReason, teamCost, TEAM_COST_LIMIT, validateTeam } from "./team";
import { links, themeGroups, themeTeam } from "./themes";
import type { MemberConfig, TeamConfig } from "./types";

type Db = { byId: Map<number, UnitRecord> };

export interface Template {
  title: string;
  units: (number | null)[];
  /** Units that can stand in for any of its units (Nydato's "options and replacements"). */
  options?: number[];
  /** Per position, the units that can stand in for that one, best first (the meta run's subs: src/engine/meta.ts). */
  subs?: (number[] | null | undefined)[];
}

/** A unit put in a place. */
export interface Move { pos: number; m: MemberConfig }

export interface Candidate {
  team: TeamConfig;
  /** Where it came from ("meta: QCK ...", "your team", "swap A3 / A7" ...). */
  origin: string;
  key: string;
  /** The units put in (single and two-unit changes), for building two-unit changes from single ones. */
  moves?: Move[];
}

export interface Measured extends Candidate {
  /** Fitness (win rate 0-1, or average score). */
  fit: number;
  /** Battles measured (seeds 0..n-1 of the run). */
  n: number;
  /** Standard error of the fitness. */
  se: number;
  /** The second measure's sum (win rate: the battles won). */
  sq?: number;
  /** The plain average (Assault: the mean score), whatever `fit` ranks by. */
  mean?: number;
  /** Per-battle scores (Assault Rumble with an aim set): for showing the other aims of the same team. */
  samples?: number[];
}

/** A measurement of teams on battles [from, from + n) of the run (same seeds for all). Returns fitness sums. */
export type Evaluate = (teams: TeamConfig[], from: number, n: number) => Promise<{ fit: number; sq: number; samples?: number[] }[]>;

export interface GenOptions {
  db: Db;
  /** Units the generator may use, with their builds (one per unit id). */
  pool: MemberConfig[];
  /**
   * Other builds of pool units to try too (e.g. a death-special unit at level 1 with its Rumble special / ability
   * maxed, so it goes down early and sets its special off): tried in the improvement rounds, in place of the unit or
   * of another.
   */
  variants?: MemberConfig[];
  templates: Template[];
  /** Where the templates come from, for the teams' origin labels (default "Nydato"). */
  templateSource?: string;
  /** Teams to start from as they are (current team, saved teams), when their units are in the pool. */
  teams: { title: string; team: TeamConfig }[];
  maxCc?: TeamConfig["maxCc"];
  /** Battles per measurement step (default 24). */
  step?: number;
  /** Battles of the final measurement (default 400). */
  final?: number;
  /** Starting points kept after the first measurement (default 4). */
  beam?: number;
  /** Units per position tried in an improvement round (the shortlist, default 30). */
  shortlist?: number;
  /**
   * How the shortlist is chosen: the pool's units with the highest rank (the meta run: its unit scores, docs/
   * META_PLAN.md). Unset: units in the starting teams / templates first, then the newest.
   */
  rank?: (m: MemberConfig) => number;
  evaluate: Evaluate;
  /**
   * Assault Rumble: rank teams by the score the player reaches at least once in `tries` tries with chance `sure`
   * (user, 2026-11-24: tries cost in-game resources; some want a steady team, some a high ceiling). Unset: the
   * average. See `aimQuantile`.
   */
  aim?: Aim;
  /**
   * Win rate (not a score): a team that wins every battle can't get better, so once the best team has won all of them
   * for two rounds in a row (on at least 3 measuring steps), the search stops (user, 2026-11-24).
   */
  winRate?: boolean;
  /** Two-unit changes in every climbing round (default on). */
  compounds?: boolean;
  /** A starting team around each group the pool's kits buff (default on), from groups of at least `themeMinUnits` (4). */
  themes?: boolean;
  themeMinUnits?: number;
  /** Kicks after the first result (default 0; Infinity: until stopped). See the module docs. */
  kicks?: number;
  onProgress?: (p: GenProgress) => void;
  signal?: { stopped: boolean };
}

export interface GenProgress {
  stage: "start" | "improve" | "final" | "done";
  round: number;
  /** Battles simulated so far. */
  battles: number;
  /** Best teams so far, best first. */
  best: Measured[];
  note: string;
  /** Teams measured so far (starting teams and every change tried). */
  tried: number;
  /** A better team was just found (an improvement round's winner). */
  better?: boolean;
  /** In an improvement round: the best change measured so far, and the team it would replace. */
  challenger?: { fit: number; se: number; n: number };
  current?: { fit: number; se: number };
}

/**
 * A member's identity in the search: the unit and, for another build of it, that build's level (and key / cotton
 * candy / expanded Limit Break, which tell apart builds at the same level, e.g. Lv 99 and Lv 120 of a unit that stops
 * at 99: the meta run tries both).
 */
const memberKey = (m: MemberConfig) => `${m.unitId}${m.level !== undefined ? `@${m.level}` : ""}${m.rumbleKey ? "k" : ""}${m.ccMode === "max" ? "c" : ""}${m.lbKey ? "x" : ""}`;
const keyOf = (t: TeamConfig) => t.members.map((m) => (m ? memberKey(m) : "-")).join(",");
const memberOf = (pool: Map<number, MemberConfig>, id: number) => pool.get(id);

/** Whether a team keeps the rules (cost, duplicates / families, at least one unit on the field). */
export function legalTeam(db: Db, t: TeamConfig): boolean {
  return validateTeam(db, t).length === 0;
}

/** Can `m` go in position i of `members` (family / duplicate / cost)? */
function fits(db: Db, members: (MemberConfig | null)[], i: number, m: MemberConfig, maxCc?: TeamConfig["maxCc"]): boolean {
  for (let j = 0; j < members.length; j++) {
    const o = members[j];
    if (o && j !== i && clashReason(db, m, o)) return false;
  }
  const next = members.map((x, j) => (j === i ? m : x));
  return teamCost(db, { members: next, maxCc }) <= TEAM_COST_LIMIT;
}

/**
 * A template made from the pool's units: units the pool has keep their place; a missing one is replaced by one of the
 * position's subs, else one of the template's options, else by a pool unit sharing its type and a class (the first that
 * keeps the rules). Positions
 * that can't be filled stay empty.
 */
export function adaptTemplate(db: Db, pool: Map<number, MemberConfig>, tpl: Template, maxCc?: TeamConfig["maxCc"]): { team: TeamConfig; missing: number } {
  const members: (MemberConfig | null)[] = Array.from({ length: 8 }, () => null);
  let missing = 0;
  const wanted = tpl.units.slice(0, 8);
  // first the units the pool has
  wanted.forEach((id, i) => {
    const m = id != null ? memberOf(pool, id) : undefined;
    if (m && fits(db, members, i, m, maxCc)) members[i] = m;
  });
  // then replacements
  wanted.forEach((id, i) => {
    if (members[i] || id == null) return;
    missing++;
    const orig = db.byId.get(id);
    const opts = [...(tpl.subs?.[i] ?? []), ...(tpl.options ?? [])].map((o) => memberOf(pool, o)).filter((m): m is MemberConfig => !!m);
    const similar = orig ? [...pool.values()].filter((m) => {
      const r = db.byId.get(m.unitId);
      return r && r.color === orig.color && r.classes.some((c) => orig.classes.includes(c));
    }).sort((a, b) => b.unitId - a.unitId) : [];
    for (const m of [...opts, ...similar]) {
      if (members.some((x) => x?.unitId === m.unitId)) continue;
      if (fits(db, members, i, m, maxCc)) { members[i] = m; break; }
    }
  });
  return { team: { members, ...(maxCc ? { maxCc } : {}) }, missing };
}

/** Every single change of a team: a position replaced by a shortlisted unit, or two positions swapped. */
export function neighbours(db: Db, t: TeamConfig, shortlist: MemberConfig[], maxCc?: TeamConfig["maxCc"]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>([keyOf(t)]);
  const add = (members: (MemberConfig | null)[], origin: string, moves?: Move[]) => {
    const team = { ...t, members };
    const k = keyOf(team);
    if (seen.has(k)) return;
    seen.add(k);
    if (!legalTeam(db, team)) return;
    out.push({ team, origin, key: k, ...(moves ? { moves } : {}) });
  };
  for (let i = 0; i < 8; i++) {
    for (const m of shortlist) {
      // the unit elsewhere on the team: no (two copies); here, only as another build of it
      if (t.members.some((x, j) => j !== i && x?.unitId === m.unitId)) continue;
      if (t.members[i] && memberKey(t.members[i]!) === memberKey(m)) continue;
      if (!fits(db, t.members, i, m, maxCc)) continue;
      add(t.members.map((x, j) => (j === i ? m : x)), `${unitName(db, t.members[i])} → ${unitName(db, m)} (place ${i + 1})`, [{ pos: i, m }]);
    }
  }
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    if (!t.members[i] && !t.members[j]) continue;
    const members = [...t.members];
    [members[i], members[j]] = [members[j]!, members[i]!];
    add(members, `swap places ${i + 1} and ${j + 1}`);
  }
  return out;
}

const unitName = (db: Db, m: MemberConfig | null | undefined) => (m ? `${db.byId.get(m.unitId)?.name.split(" - ")[0] ?? `#${m.unitId}`}${m.level === 1 ? " (lv 1)" : ""}` : "empty");

/** A team with these moves made (undefined if it breaks the rules or puts a unit twice). */
function withMoves(db: Db, t: TeamConfig, moves: Move[]): TeamConfig | undefined {
  const members = [...t.members];
  for (const mv of moves) members[mv.pos] = mv.m;
  const ids = members.filter((m): m is MemberConfig => !!m).map((m) => m.unitId);
  if (new Set(ids).size !== ids.length) return undefined;
  const team = { ...t, members };
  return legalTeam(db, team) ? team : undefined;
}

/**
 * Two-unit changes, from a round's measured single changes (the generator can't reach a team that needs two new units
 * at once one unit at a time, when each alone makes the team worse):
 * - pairs of the `top` (8) best single changes (two places, two different units);
 * - synergy pairs: each of those units, and each of the `extraSeeds` highest shortlisted units not on the team (in
 *   its best place, even when that single change measured worse: a unit that only works with a partner does), together
 *   with up to `partners` (3) shortlisted units its kit targets, counts on or needs, or whose kit does that for it
 *   (src/engine/themes.ts), in one of the `weakPlaces` (2) places where a change helped most (the weakest).
 */
export function compoundMoves(db: Db, t: TeamConfig, singles: Measured[], shortlist: MemberConfig[], top = 8, partners = 3, extraSeeds = 6, weakPlaces = 2): Candidate[] {
  const ranked = singles.filter((s) => s.moves?.length === 1).sort((a, b) => b.fit - a.fit);
  const best = ranked.slice(0, top);
  const seedUnits = shortlist.filter((m) => !t.members.some((x) => x?.unitId === m.unitId)).slice(0, extraSeeds);
  const seeds = [...best];
  for (const m of seedUnits) {
    const s = ranked.find((x) => x.moves![0]!.m === m);
    if (s && !seeds.includes(s)) seeds.push(s);
  }
  const out: Candidate[] = [];
  const seen = new Set<string>([keyOf(t)]);
  const add = (moves: Move[], origin: string) => {
    const team = withMoves(db, t, moves);
    if (!team) return;
    const k = keyOf(team);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ team, origin, key: k, moves });
  };
  const label = (mv: Move) => `${unitName(db, t.members[mv.pos])} → ${unitName(db, mv.m)} (place ${mv.pos + 1})`;
  for (let a = 0; a < best.length; a++) for (let b = a + 1; b < best.length; b++) {
    const [x, y] = [best[a]!.moves![0]!, best[b]!.moves![0]!];
    if (x.pos === y.pos || x.m.unitId === y.m.unitId) continue;
    add([x, y], `${label(x)} + ${label(y)}`);
  }
  // the weakest places: where the best single change scored highest
  const atPos = new Map<number, number>();
  for (const s of ranked) { const p = s.moves![0]!.pos; atPos.set(p, Math.max(atPos.get(p) ?? -Infinity, s.fit)); }
  const weak = [...atPos.entries()].sort((a, b) => b[1] - a[1]).slice(0, weakPlaces).map(([p]) => p);
  for (const s of seeds) {
    const mv = s.moves![0]!;
    const ra = db.byId.get(mv.m.unitId);
    if (!ra) continue;
    const mates = shortlist.filter((m) => {
      if (m.unitId === mv.m.unitId || t.members.some((x) => x?.unitId === m.unitId)) return false;
      const rb = db.byId.get(m.unitId);
      return !!rb && (links(ra, rb) || links(rb, ra));
    }).slice(0, partners);
    for (const m of mates) for (const p of weak) if (p !== mv.pos) add([mv, { pos: p, m }], `${label(mv)} + ${label({ pos: p, m })} (they work together)`);
  }
  return out;
}

/** Fitness sums -> mean and standard error. */
function stats(sum: number, sq: number, n: number) {
  const fit = n ? sum / n : 0;
  const v = n > 1 ? Math.max(0, sq / n - fit * fit) : 0;
  return { fit, se: n ? Math.sqrt(v / n) : 0 };
}

/** How many tries the player has (keeping the best score) and how sure they want to be of reaching the score. */
export interface Aim { tries: number; sure: number }

/**
 * The per-battle score quantile an aim ranks by: the score x with P(best of N tries >= x) = sure, i.e.
 * 1 - F(x)^N = sure, so x is the (1 - sure)^(1/N) quantile. One try, 50% sure: the median; 90% sure: the score 9 runs
 * in 10 reach (steady); 20% sure over 10 tries: the 0.85 quantile (a high ceiling).
 */
export const aimQuantile = (a: Aim) => Math.pow(1 - Math.min(0.99, Math.max(0.01, a.sure)), 1 / Math.max(1, Math.round(a.tries)));

/** The q quantile of the samples, and its standard error (the order-statistic estimate from the nearby spread). */
export function quantileStats(xs: number[], q: number): { fit: number; se: number } {
  if (!xs.length) return { fit: 0, se: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => { const i = Math.min(s.length - 1, Math.max(0, p * (s.length - 1))); const lo = Math.floor(i); return s[lo]! + (s[Math.min(s.length - 1, lo + 1)]! - s[lo]!) * (i - lo); };
  const fit = at(q);
  const d = Math.min(0.05, q / 2, (1 - q) / 2) || 0.01;
  const density = (at(q + d) - at(q - d)) / (2 * d);
  return { fit, se: density * Math.sqrt((q * (1 - q)) / s.length) };
}

/** Measures candidates step by step, keeping their sums (so more battles add to what was measured). */
class Bench {
  private sums = new Map<string, { sum: number; sq: number; n: number; samples?: number[] }>();
  battles = 0;
  /** `q`: rank by this quantile of the per-battle samples instead of the average. */
  constructor(private readonly evaluate: Evaluate, private readonly q?: number) {}
  async to(cands: Candidate[], n: number): Promise<Measured[]> {
    // group by how far each already is, so a call measures the same battles for everyone in it
    const byFrom = new Map<number, Candidate[]>();
    for (const c of cands) {
      const s = this.sums.get(c.key);
      const from = s?.n ?? 0;
      if (from >= n) continue;
      (byFrom.get(from) ?? byFrom.set(from, []).get(from)!).push(c);
    }
    for (const [from, list] of byFrom) {
      const res = await this.evaluate(list.map((c) => c.team), from, n - from);
      this.battles += (n - from) * list.length;
      list.forEach((c, i) => {
        const s = this.sums.get(c.key) ?? { sum: 0, sq: 0, n: 0 };
        s.sum += res[i]!.fit; s.sq += res[i]!.sq; s.n = n;
        if (this.q != null) s.samples = [...(s.samples ?? []), ...(res[i]!.samples ?? [])];
        this.sums.set(c.key, s);
      });
    }
    return cands.map((c) => this.get(c));
  }
  get(c: Candidate): Measured {
    const s = this.sums.get(c.key) ?? { sum: 0, sq: 0, n: 0 };
    const st = this.q != null && s.samples?.length ? quantileStats(s.samples, this.q) : stats(s.sum, s.sq, s.n);
    return { ...c, ...st, n: s.n, sq: s.sq, mean: s.n ? s.sum / s.n : 0, ...(s.samples ? { samples: s.samples } : {}) };
  }
}

/** Successive halving: everyone on `step` battles, then the better third on 3x as many, ... down to `keep`. */
async function halve(bench: Bench, cands: Candidate[], step: number, keep: number, signal?: { stopped: boolean }, onStep?: (left: number, n: number, lead: Measured) => void): Promise<Measured[]> {
  let alive = cands;
  let n = step;
  let measured: Measured[] = [];
  for (;;) {
    measured = (await bench.to(alive, n)).sort((a, b) => b.fit - a.fit);
    onStep?.(measured.length, n, measured[0]!);
    if (measured.length <= keep || signal?.stopped) return measured;
    alive = measured.slice(0, Math.max(keep, Math.ceil(measured.length / 3)));
    n *= 3;
  }
}

/** A small seeded random generator (kicks: the same run makes the same choices). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The generator (see the module docs). Resolves with the best teams, best first. */
export async function generate(o: GenOptions): Promise<Measured[]> {
  const { db } = o;
  const step = o.step ?? 24;
  const finalN = o.final ?? 400;
  const pool = new Map(o.pool.map((m) => [m.unitId, m]));
  const bench = new Bench(o.evaluate, o.aim ? aimQuantile(o.aim) : undefined);
  const best = new Map<string, Measured>();
  const stopped = () => !!o.signal?.stopped;
  let tried = 0;
  const ranked = () => [...best.values()].map((m) => bench.get(m)).sort((a, b) => b.fit - a.fit);
  const report = (stage: GenProgress["stage"], round: number, note: string, better = false, duel?: { challenger: Measured; current: Measured }) => {
    o.onProgress?.({
      stage, round, battles: bench.battles, best: ranked().slice(0, 10), note, tried, ...(better ? { better } : {}),
      ...(duel ? { challenger: { fit: duel.challenger.fit, se: duel.challenger.se, n: duel.challenger.n }, current: { fit: duel.current.fit, se: duel.current.se } } : {}),
    });
  };
  const keepBest = (ms: Measured[]) => { for (const m of ms) best.set(m.key, m); };

  // the shortlist order (also the themed teams' order): the pool's units by rank; without one, the units in the
  // starting teams / templates first, then the newest
  const inTemplates = new Set<number>([...o.templates.flatMap((t) => [...t.units, ...(t.options ?? []), ...(t.subs ?? []).flatMap((p) => p ?? [])]), ...o.teams.flatMap((t) => t.team.members.map((m) => m?.unitId))].filter((x): x is number => x != null));
  const scoreOf = o.rank ?? ((m: MemberConfig) => (inTemplates.has(m.unitId) ? 1 : 0) + m.unitId * 1e-7);
  const shortlist = [
    ...[...pool.values()].sort((a, b) => scoreOf(b) - scoreOf(a) || b.unitId - a.unitId).slice(0, o.shortlist ?? 30),
    ...(o.variants ?? []),
  ];
  const groups = o.themes === false ? [] : themeGroups([...pool.keys()].map((id) => db.byId.get(id)).filter((r): r is UnitRecord => !!r), o.themeMinUnits ?? 4);

  // 1. starting points: your teams, the templates, and (unless turned off) a team around each kit group of the pool
  const starts: Candidate[] = [];
  const seen = new Set<string>();
  const push = (team: TeamConfig, origin: string) => {
    const k = keyOf(team);
    if (seen.has(k) || !legalTeam(db, team)) return;
    seen.add(k);
    starts.push({ team, origin, key: k });
  };
  for (const t of o.teams) {
    const tpl = { title: t.title, units: t.team.members.map((m) => m?.unitId ?? null) };
    push(adaptTemplate(db, pool, tpl, o.maxCc ?? t.team.maxCc).team, t.title);
  }
  for (const tpl of o.templates) {
    const a = adaptTemplate(db, pool, tpl, o.maxCc);
    push(a.team, `${o.templateSource ?? "Nydato"}: ${tpl.title}${a.missing ? ` (${a.missing} replaced)` : ""}`);
  }
  for (const g of groups) push({ members: themeTeam(db, [...pool.values()], g.units, scoreOf), ...(o.maxCc ? { maxCc: o.maxCc } : {}) }, `theme ${g.token}`);
  if (!starts.length) throw new Error("No legal team can be made from these units.");
  tried += starts.length;
  report("start", 0, `Measuring ${starts.length} starting teams…`);
  const first = await halve(bench, starts, step, o.beam ?? 4, o.signal, (left, n) => report("start", 0, `Starting teams: ${left} of ${starts.length} on ${n} battles each`));
  keepBest(first);
  report("start", 0, `Best start: ${first[0]!.origin}`);

  // 2. climbing: rounds of single and two-unit changes from a team, while something better turns up
  let round = 0;
  /** Rounds in a row whose best team won every battle. */
  let perfectRounds = 0;
  const perfect = (m: Measured) => !!o.winRate && m.n >= 3 * step && m.sq === m.n;
  let done = false;
  const climb = async (start: Measured): Promise<Measured[]> => {
    let cur = start;
    let lastCompounds: Measured[] = [];
    for (;;) {
      if (stopped() || done) break;
      round++;
      const ns = neighbours(db, cur.team, shortlist, o.maxCc ?? cur.team.maxCc).map((c) => ({ ...c, origin: `${cur.origin}; ${c.origin}` }));
      if (!ns.length) break;
      report("improve", round, `Round ${round}: trying ${ns.length} changes to ${cur.origin.split("; ")[0]}`);
      // single changes first, as before; only when none of them helps, two-unit changes built from them (escalating
      // only when stuck keeps the early rounds as quick as one-change rounds, and stops big early jumps from leading the
      // climb into a worse dead end: both measured, 2026-11-25)
      tried += ns.length;
      const tryAll = async (cands: Candidate[], label: string) => {
        const top = await halve(bench, cands, step, 3, o.signal, (left, n, lead) => report("improve", round, `Round ${round}: ${left} of ${cands.length} ${label} on ${n} battles each`, false, { challenger: lead, current: cur }));
        keepBest(top);
        const challenger = top[0]!;
        // the same battles for both: measure the current team as far as the challenger went
        const [c] = await bench.to([cur], challenger.n);
        cur = c!;
        keepBest([cur]);
        return { challenger, better: challenger.fit > cur.fit + Math.max(1e-9, 0.5 * Math.hypot(challenger.se, cur.se)) };
      };
      let { challenger, better } = await tryAll(ns, "changes");
      if (!better && !stopped() && o.compounds !== false) {
        const compounds = compoundMoves(db, cur.team, ns.map((c) => bench.get(c)), shortlist).map((c) => ({ ...c, origin: `${cur.origin}; ${c.origin}` }));
        if (compounds.length) {
          tried += compounds.length;
          report("improve", round, `Round ${round}: no single change helps; trying ${compounds.length} changes of two units`);
          ({ challenger, better } = await tryAll(compounds, "changes of two units"));
          lastCompounds = compounds.map((c) => bench.get(c)).sort((x, y) => y.fit - x.fit);
        }
      }
      if (better) cur = challenger;
      // a team that wins every battle, round after round: nothing left to improve
      perfectRounds = perfect(better ? challenger : cur) ? perfectRounds + 1 : 0;
      if (perfectRounds >= 2) {
        done = true;
        report("improve", round, `Wins every battle (${cur.n} of ${cur.n}) two rounds in a row: nothing left to improve`, better);
        break;
      }
      if (!better) break;
      report("improve", round, `Better: ${challenger.origin.split("; ").slice(-1)[0]}`, true);
    }
    return lastCompounds;
  };
  let lastCompounds: Measured[] = [];
  for (const startTeam of first.slice(0, o.beam ?? 4)) {
    lastCompounds = await climb(startTeam);
    if (stopped() || done) break;
  }

  // 3. the final check of the best few (more battles), after the first climbs and after every kick
  const finalCheck = async (label: string) => {
    const finalists = ranked().slice(0, 5);
    report("final", round, `Final check of the top ${finalists.length} on ${finalN} battles${label}…`);
    if (!stopped()) keepBest(await bench.to(finalists, finalN));
  };
  await finalCheck("");

  // 4. kicks: from the best team so far, a bigger change (a theme pivot, a two-unit change, three places rebuilt),
  // even if it measures worse at first, and a new climb from it; the best team ever found stays in the list
  const kicks = o.kicks ?? 0;
  const r = rng(7919);
  for (let k = 0; k < kicks && !stopped() && !done; k++) {
    const top = ranked().filter((m) => m.n >= finalN)[0] ?? ranked()[0]!;
    const cands: Candidate[] = [];
    const kseen = new Set<string>([top.key]);
    const add = (members: (MemberConfig | null)[], origin: string) => {
      const team = { ...top.team, members };
      const key = keyOf(team);
      if (kseen.has(key) || !legalTeam(db, team)) return;
      kseen.add(key);
      cands.push({ team, origin: `${top.origin.split("; ")[0]}; kick ${k + 1}: ${origin}`, key });
    };
    // theme pivots: the groups most of the team is already in, the rest of the team rebuilt from the group
    const inGroup = groups.map((g) => ({ g, n: top.team.members.filter((m) => m && g.units.has(m.unitId)).length }))
      .filter((x) => x.n >= 2 && x.n < 8).sort((a, b) => b.n - a.n || a.g.token.localeCompare(b.g.token));
    for (const x of [...inGroup.slice(k * 3, k * 3 + 3), ...inGroup.slice(0, 1)]) {
      add(themeTeam(db, [...pool.values()], x.g.units, scoreOf, top.team.members.map((m) => (m && x.g.units.has(m.unitId) ? m : null))), `around ${x.g.token}`);
    }
    // the best two-unit changes of the last round
    for (const c of lastCompounds.slice(k % 3, (k % 3) + 3)) if (c.moves) { const t = withMoves(db, top.team, c.moves); if (t) add(t.members, c.origin.split("; ").slice(-1)[0]!); }
    // three places rebuilt at random from the shortlist (a unit and units it works with first)
    for (let tries = 0; tries < 30 && cands.length < 12; tries++) {
      const places = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => r() - 0.5).slice(0, 3);
      const seed = shortlist[Math.floor(r() * Math.min(shortlist.length, 20))]!;
      const sr = db.byId.get(seed.unitId);
      const mates = shortlist.filter((m) => m.unitId !== seed.unitId && sr && db.byId.get(m.unitId) && (links(sr, db.byId.get(m.unitId)!) || links(db.byId.get(m.unitId)!, sr)));
      const fill = [seed, ...mates.sort(() => r() - 0.5), ...shortlist.slice().sort(() => r() - 0.5)];
      const members = top.team.members.map((m, i) => (places.includes(i) ? null : m));
      for (const p of places) {
        const m = fill.find((x) => !members.some((y) => y?.unitId === x.unitId) && fits(db, members, p, x, o.maxCc ?? top.team.maxCc));
        if (m) members[p] = m;
      }
      add(members, `places ${places.map((p) => p + 1).join(", ")} rebuilt around ${unitName(db, seed)}`);
    }
    if (!cands.length) break;
    tried += cands.length;
    report("improve", round, `Kick ${k + 1} of ${kicks === Infinity ? "∞" : kicks}: trying ${cands.length} bigger changes from the best team`);
    const kicked = await halve(bench, cands, step, 1, o.signal, (left, n) => report("improve", round, `Kick ${k + 1}: ${left} of ${cands.length} bigger changes on ${n} battles each`));
    keepBest(kicked);
    if (stopped()) break;
    lastCompounds = await climb(kicked[0]!);
    await finalCheck(` (after kick ${k + 1})`);
  }

  report("done", round, "Done");
  return ranked().sort((a, b) => (b.n >= finalN ? 1 : 0) - (a.n >= finalN ? 1 : 0) || b.fit - a.fit).slice(0, 10);
}
