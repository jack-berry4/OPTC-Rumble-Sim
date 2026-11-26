/**
 * Team generator panel (docs/PLAN_MODES.md section 3): pick which units it may use (your box, the relevant units of
 * this simulator's own meta run, your saved teams and Recent units), and it searches for the best team against the
 * current opponent / bosses (src/engine/generator.ts), measuring every candidate with the win-rate workers. It starts
 * from the meta run's comps (src/engine/meta.ts, docs/META_PLAN.md) and your saved teams; Nydato's Rumble Sheet is no
 * longer used here (user, 2026-11-24: its comps stay as the default teams, with credit).
 */
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { UnitDb } from "../data/unitDb";
import { META, META_SINCE, metaScore, metaTemplates, metaUnits, newerThanMeta } from "../engine/meta";
import { vsHalves } from "../data/vs";
import { aimQuantile, generate, quantileStats, type Aim, type GenProgress, type Measured } from "../engine/generator";
import type { GlobalRule } from "../engine/rules";
import { applyPreset, atLeastPreset, type PresetDef } from "../engine/stats";
import type { SavedTeam } from "../engine/teamCode";
import type { MemberConfig, TeamConfig } from "../engine/types";
import type { WorkerRequest, WorkerResponse } from "../sim.worker";
import type { RunModeOptions, WinRateSummary } from "../sim/simulate";
import { colorClass, DefaultBuild, FloatingPop, UnitSearch, UnitSettings, withDefaultBuild } from "./TeamEditor";
import { UnitThumb } from "./UnitThumb";

/** A pool of persistent workers measuring teams (one job = one team on a range of battles). */
class Pool {
  private workers: Worker[] = [];
  private free: Worker[] = [];
  private queue: { req: Omit<WorkerRequest, "id">; resolve: (s: WinRateSummary) => void; reject: (e: Error) => void }[] = [];
  private jobs = new Map<number, { resolve: (s: WinRateSummary) => void; reject: (e: Error) => void; w: Worker }>();
  private nextId = 1;
  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL("../sim.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const m = ev.data;
        const job = this.jobs.get(m.id);
        if (!job || m.type === "progress") return;
        this.jobs.delete(m.id);
        if (m.type === "error") job.reject(new Error(m.message)); else job.resolve(m.summary);
        this.free.push(w);
        this.pump();
      };
      this.workers.push(w);
      this.free.push(w);
    }
  }
  run(req: Omit<WorkerRequest, "id">): Promise<WinRateSummary> {
    return new Promise((resolve, reject) => { this.queue.push({ req, resolve, reject }); this.pump(); });
  }
  private pump() {
    while (this.free.length && this.queue.length) {
      const w = this.free.pop()!;
      const { req, resolve, reject } = this.queue.shift()!;
      const id = this.nextId++;
      this.jobs.set(id, { resolve, reject, w });
      w.postMessage({ ...req, id } satisfies WorkerRequest);
    }
  }
  stop() { for (const w of this.workers) w.terminate(); for (const j of this.jobs.values()) j.reject(new Error("stopped")); this.workers = []; this.free = []; this.queue = []; this.jobs.clear(); }
}

const GEN_KEY = "rumble-sim-generator-v2";
/**
 * available: every unit, or only My box; search: every available unit, or only the meta run's relevant ones; preset: the
 * quick build (by name) for units whose build isn't known ("" = the default build); lowDeath: also try units with a death special
 * at level 1 with their Rumble special / ability maxed (user, 2026-11-22).
 */
interface GenSettings {
  available: "all" | "box"; search: "all" | "meta"; preset: string; lowDeath: boolean; step: number; final: number;
  /** Units never used, even in the box or among the relevant ones (user, 2026-11-24). */
  exclude: number[];
  /** Units used whatever the filters say, with a build set here: instead of the unit's usual build, or as one more build to try. */
  include: { m: MemberConfig; mode: "replace" | "extra" }[];
  /** Assault Rumble: the matches the player will play against this boss team, keeping the best score (user, 2026-11-24). */
  tries: number;
  /** ...and how often (0.05-0.95) they want to reach the score at least once in those matches. */
  sure: number;
  /** Every unit at least this quick build ("" = no floor), part by part (user, 2026-11-24). */
  floor: string;
  /** 5★-and-below units (final forms: not a 5★ that evolves to 6★) use this quick build ("" = as usual). */
  lowStar: string;
  /**
   * Free-to-play 5★-and-below units (farmed: Co-op, Pirate King Adventures, raids, story...: `UnitRecord.farmable`)
   * use this quick build instead ("" = the same as `lowStar`) (user, 2026-11-25).
   */
  lowStarF2p: string;
  /**
   * After the first result: stop, a few kicks more, or kicks until stopped (user, 2026-11-25: a good team fairly
   * quickly, then better ones the longer it runs).
   */
  effort: "quick" | "more" | "until";
}
const DEFAULT_GEN: GenSettings = { available: "all", search: "meta", preset: "", lowDeath: true, step: 24, final: 400, exclude: [], include: [], tries: 1, sure: 0.5, floor: "", lowStar: "", lowStarF2p: "", effort: "more" };
/** Kicks after the first result per effort setting (src/engine/generator.ts). */
const KICKS: Record<GenSettings["effort"], number> = { quick: 0, more: 4, until: Infinity };
/** Suggested match counts (any number can be typed). */
const TRIES = [1, 2, 3, 5, 10];
/** Chances shown next to each result (the team's score at each, for the chosen match count). */
const SURE_SHOWN = [0.9, 0.5, 0.2];
const pctOf = (p: number) => `${Math.round(p * 100)}%`;
/** A 5★-and-below unit in its final form (a 5★ that evolves to 6★ doesn't count). */
const lowStarUnit = (r: { stars: string | number; sixStarForm?: number } | undefined) => !!r && parseInt(String(r.stars), 10) <= 5 && !r.sixStarForm;
const matches = (n: number) => `${n} ${n === 1 ? "match" : "matches"}`;
/** One line on what an aim ranks teams by. */
const aimText = (a: Aim) => `the score you reach at least once in ${matches(a.tries)}, ${pctOf(a.sure)} of the time`;
/** The same target as a single match's chance of beating it: 1 - (1 - sure)^(1/N). */
const oneMatch = (a: Aim) => 1 - aimQuantile(a);
/** Searching every unit: the relevant ones, the teams' and this many more (newest first), so the run stays practical. */
const ALL_UNITS_EXTRA = 200;
/** A box unit whose build is known (added from a team, Recent units or a build set in the box), not just its id. */
const BUILD_KEYS: (keyof MemberConfig)[] = ["level", "llbLevel", "llb", "lbNodes", "lbKey", "rumbleKey", "ccMode", "cc", "potentials", "potentialLevels", "sockets", "specialLevel", "abilityLevel", "mainSpecialLevel", "exact", "illegal"];
const knownBuild = (m: MemberConfig) => BUILD_KEYS.some((k) => m[k] !== undefined);
/** A unit's death-special build: level 1 everything (level, LLB, Limit Break, sockets, potentials, cotton candy), its
 *  Rumble special and ability maxed: it goes down early and sets its death special off. */
const lowBuild = (unitId: number): MemberConfig => ({
  unitId, level: 1, llbLevel: 0, lbNodes: 0, lbKey: false, rumbleKey: false, ccMode: "none", potentials: 0, potentialLevels: [],
  sockets: 0, mainSpecialLevel: 1, specialLevel: 10, abilityLevel: 5,
});
const hasDeathSpecial = (db: UnitDb, id: number) => {
  const r = db.byId.get(id);
  return !!r?.kit && [r.kit, r.llbKit].some((k) => k?.abilities.some((lv) => lv.some((e) => e.effect === "boon" && (e.attributes as string[] | undefined)?.includes("On Death"))));
};
const load = <T,>(k: string, d: T): T => { try { const r = localStorage.getItem(k); return r ? { ...d, ...JSON.parse(r) } as T : d; } catch { return d; } };
/** Saved settings from before the meta run: "only those on Nydato's sheet" is now "only the relevant ones". */
const loadGen = (): GenSettings => { const g = load(GEN_KEY, DEFAULT_GEN); return (g.search as string) === "sheet" ? { ...g, search: "meta" } : g; };

export function GeneratorPanel(props: {
  db: UnitDb;
  /** Your team (the generator replaces it), the opponent / bosses. */
  atk: TeamConfig;
  def: TeamConfig;
  rules: GlobalRule[];
  modeOpts: RunModeOptions;
  assault: boolean;
  seed: number;
  presets: PresetDef[];
  saved: SavedTeam[];
  recent: MemberConfig[];
  onUse: (t: TeamConfig, title: string) => void;
  onSave: (t: TeamConfig, title: string) => void;
  /** The box in use (My Boxes) and its name. */
  box: MemberConfig[];
  boxName: string;
  /** Open My Boxes. */
  onEditBox: () => void;
  /** The game mode: switching it stops a run (its teams were for the other mode's opponent). */
  mode: string;
  /** Whether it's running (the app warns before what would stop it). */
  onRunning?: (running: boolean) => void;
}) {
  const { db, box } = props;
  const [st, setStRaw] = useState<GenSettings>(loadGen);
  const setSt = (p: Partial<GenSettings>) => setStRaw((s) => { const n = { ...s, ...p }; try { localStorage.setItem(GEN_KEY, JSON.stringify(n)); } catch { /* storage unavailable */ } return n; });
  const [progress, setProgress] = useState<GenProgress>();
  /** The best team's measure over the run (one point per progress report): the progress chart. */
  const [history, setHistory] = useState<GenPoint[]>([]);
  const [prep, setPrep] = useState<string>();
  const [results, setResults] = useState<Measured[]>();
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const pool = useRef<Pool>();
  const signal = useRef({ stopped: false });
  useEffect(() => () => pool.current?.stop(), []);
  /** The run going on: a cancelled run's late results are dropped. */
  const runId = useRef(0);
  const { onRunning } = props;
  useEffect(() => onRunning?.(running), [running, onRunning]);
  // closing or reloading the page while it runs: the browser asks first (user, 2026-11-25)
  useEffect(() => {
    if (!running) return;
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [running]);
  // another game mode (the app asked first): the run stops and what it found goes (it was for the other opponent)
  const modeRef = useRef(props.mode);
  useEffect(() => {
    if (modeRef.current === props.mode) return;
    modeRef.current = props.mode;
    if (!running) return;
    runId.current++;
    signal.current.stopped = true;
    pool.current?.stop();
    pool.current = undefined;
    setRunning(false);
    setPrep(undefined);
    setProgress(undefined);
    setHistory([]);
    setResults(undefined);
  }, [props.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultBuild = useContext(DefaultBuild);
  const preset = props.presets.find((p) => p.label === st.preset) ?? defaultBuild ?? props.presets.at(-1);
  // the meta run's relevant units for this mode (a VS unit: both halves), and every unit released after the run's
  // newest unit (the run can't have rated those)
  const side = props.assault ? "assault" : "atk";
  const newer = useMemo(() => db.all.filter((u) => newerThanMeta(u)).map((u) => u.id), [db]);
  const listed = useMemo(() => new Set([...[...metaUnits(side)].flatMap((id) => vsHalves(db, id)), ...newer]), [db, newer, side]);
  const newerIds = useMemo(() => new Set(newer), [newer]);
  /** The units it may use (available, then the search filter), with how many the filter leaves out. */
  const { candidates: baseCandidates, left, capped } = useMemo(() => {
    const avail = st.available === "box"
      ? [...new Set(box.filter((m) => !m.boss).map((m) => m.unitId))]
      : db.all.filter((u) => !u.name.startsWith("[") && u.id < 5013).map((u) => u.id);
    const searched = st.search === "meta" ? avail.filter((id) => listed.has(id)) : avail;
    // every unit: the relevant ones and the teams' first, then the newest
    if (st.available === "all" && st.search === "all") {
      const first = new Set([...listed, ...props.saved.flatMap((s) => s.team.members.map((m) => m?.unitId)), ...props.atk.members.map((m) => m?.unitId)].filter((x): x is number => x != null));
      const rest = searched.filter((id) => !first.has(id)).sort((a, b) => b - a).slice(0, ALL_UNITS_EXTRA);
      return { candidates: [...searched.filter((id) => first.has(id)), ...rest], left: avail.length - searched.length, capped: searched.length - first.size - rest.length };
    }
    return { candidates: searched, left: avail.length - searched.length, capped: 0 };
  }, [st.available, st.search, box, db, listed, props.saved, props.atk]);
  // left out / also used units (whatever the filters above say)
  const excluded = useMemo(() => new Set(st.exclude ?? []), [st.exclude]);
  const included = st.include ?? [];
  const candidates = useMemo(() => [
    ...baseCandidates.filter((id) => !excluded.has(id)),
    ...included.filter((x) => x.mode === "replace" && !baseCandidates.includes(x.m.unitId) && !excluded.has(x.m.unitId)).map((x) => x.m.unitId),
  ], [baseCandidates, excluded, included]);
  const total = candidates.length;

  const aim: Aim = { tries: Math.max(1, Math.round(st.tries ?? 1)), sure: st.sure ?? 0.5 };
  const run = async () => {
    setError(undefined);
    setResults(undefined);
    setHistory([]);
    setProgress(undefined);
    setRunning(true);
    signal.current = { stopped: false };
    const id = ++runId.current;
    try {
      const ids = candidates;
      setPrep(`Loading ${ids.length} units' details…`);
      await db.ensure([...ids, ...props.def.members.filter((m) => m && !m.boss).map((m) => m!.unitId), ...(props.atk.leader ? [props.atk.leader.member.unitId] : []), ...(props.def.leader ? [props.def.leader.member.unitId] : [])]);
      // a box unit's known build is used; every other unit gets the chosen build
      if (id !== runId.current) return; // cancelled while the details loaded
      const boxBy = new Map(box.filter(knownBuild).map((m) => [m.unitId, m]));
      // a build set in "Also use" (instead of the usual one) wins over the box's and the chosen build
      const setBy = new Map(included.filter((x) => x.mode === "replace").map((x) => [x.m.unitId, x.m]));
      // 5★-and-below units (final forms) may get their own quick build: a box unit whose build is known is only raised
      // where it's below that build, part by part (a maxed box unit stays maxed: user, 2026-11-25); the others get it
      // as it is. Then every unit is raised to the floor, if set (a build set in "Also use" and the death-special
      // level-1 builds stay as they are)
      const floorP = st.floor ? props.presets.find((x) => x.label === st.floor) : undefined;
      const lowP = st.lowStar ? props.presets.find((x) => x.label === st.lowStar) : undefined;
      const lowF2pP = st.lowStarF2p ? props.presets.find((x) => x.label === st.lowStarF2p) : undefined;
      const members: MemberConfig[] = ids.map((id) => {
        const set = setBy.get(id);
        if (set) return set;
        const rec = db.byId.get(id)!;
        const known = boxBy.get(id);
        // free-to-play 5★-and-below units: their own build if set, else the 5★-and-below one
        const lp = lowStarUnit(rec) ? (rec.farmable && lowF2pP ? lowF2pP : lowP) : undefined;
        let m = lp
          ? (known ? atLeastPreset(rec, known, lp, props.atk.maxCc) : applyPreset(rec, { unitId: id }, lp))
          : known ?? (preset ? applyPreset(rec, { unitId: id }, preset) : { unitId: id });
        if (floorP) m = atLeastPreset(rec, m, floorP, props.atk.maxCc);
        return m;
      });
      const variants = [
        ...(st.lowDeath ? ids.filter((id) => hasDeathSpecial(db, id)).map(lowBuild) : []),
        ...included.filter((x) => x.mode === "extra" && !excluded.has(x.m.unitId)).map((x) => x.m),
      ];
      // the opponent's and both leaders' records go to every job; each team adds its own
      const fixedRecs = [...props.def.members.filter((m): m is MemberConfig => !!m).map((m) => m.unitId), ...(props.atk.leader ? [props.atk.leader.member.unitId] : []), ...(props.def.leader ? [props.def.leader.member.unitId] : [])]
        .map((id) => db.byId.get(id)).filter((r) => !!r);
      setPrep(undefined);
      const n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
      pool.current?.stop();
      pool.current = new Pool(n);
      const p = pool.current;
      const res = await generate({
        db,
        pool: members,
        variants,
        // the meta run's comps, the ones these units can field first; the shortlist by the meta's unit scores (units
        // newer than the run first: it couldn't rate them)
        templates: metaTemplates(side, new Set(members.map((m) => m.unitId)), 40, props.def.members.map((m) => m?.boss?.name ?? "")),
        templateSource: "meta",
        rank: (m: MemberConfig) => metaScore(side, m.unitId) ?? (newerIds.has(m.unitId) ? 1 : -1),
        kicks: KICKS[st.effort ?? "more"],
        teams: [{ title: "your team", team: props.atk }, ...props.saved.filter((s) => !s.team.members.some((m) => m?.boss)).slice(0, 30).map((s) => ({ title: s.title || "saved team", team: s.team }))],
        maxCc: props.atk.maxCc,
        step: st.step,
        final: st.final,
        signal: signal.current,
        winRate: !props.assault,
        ...(props.assault ? { aim } : {}),
        onProgress: (p) => {
          if (id !== runId.current) return;
          setProgress(p);
          const b = p.best[0];
          if (b) setHistory((h) => [...h, { battles: p.battles, fit: b.fit, se: b.se, stage: p.stage, round: p.round, better: !!p.better, tried: p.tried, ...(p.challenger ? { challenger: p.challenger.fit, current: p.current?.fit } : {}) }]);
        },
        evaluate: (teams, from, count) => Promise.all(teams.map(async (t) => {
          const team = props.atk.leader ? { ...t, leader: props.atk.leader } : t;
          const recs = [...fixedRecs, ...t.members.filter((m): m is MemberConfig => !!m).map((m) => db.byId.get(m.unitId)!)];
          const s = await p.run({ atk: team, def: props.def, battles: from + count, seed: props.seed, rules: props.rules, vary: "all", start: from, step: 1, units: recs, modeOpts: props.modeOpts });
          return s.score ? { fit: s.score.sum, sq: s.score.sumSq, samples: s.score.sample } : { fit: s.attackerWins + 0.001 * (s.avgAttackersLeft - s.avgDefendersLeft) * s.battles, sq: s.attackerWins };
        })),
      });
      if (id === runId.current) setResults(res);
    } catch (e) {
      if (id === runId.current && !signal.current.stopped) setError(String(e instanceof Error ? e.message : e));
    } finally {
      if (id === runId.current) {
        pool.current?.stop();
        pool.current = undefined;
        setPrep(undefined);
        setRunning(false);
      }
    }
  };
  const stop = () => { signal.current.stopped = true; };

  const list = results ?? progress?.best ?? [];
  // a win rate's 95% range never shows as 0 (at 0% or 100% the spread of so few battles is still ~1/n)
  const fmtFit = (m: Measured) => {
    if (props.assault) return `${Math.round(m.fit).toLocaleString()} ± ${Math.round(1.96 * m.se).toLocaleString()}`;
    const p = Math.min(1, Math.max(0, m.fit));
    return `${(p * 100).toFixed(1)}% ± ${(1.96 * Math.sqrt(Math.max(p * (1 - p), 1 / Math.max(1, m.n)) / Math.max(1, m.n)) * 100).toFixed(1)}%`;
  };
  const fmtVal = (v: number) => (props.assault ? Math.round(v).toLocaleString() : `${(v * 100).toFixed(1)}%`);
  /** Assault: the same team under the three aims (and its average), so the steadiness / ceiling trade is visible. */
  const aimsOf = (m: Measured) => {
    if (!props.assault || !m.samples?.length) return undefined;
    const shown = [...new Set([...SURE_SHOWN, aim.sure])].sort((a, b) => b - a);
    return shown.map((v) => ({ v, score: quantileStats(m.samples!, aimQuantile({ tries: aim.tries, sure: v })).fit }));
  };

  return (
    <details className="card generator" open={running || !!results}>
      <summary><h3>Team generator</h3><span className="muted small"> — the best team from your units against this {props.assault ? "boss team" : "opponent"}</span></summary>
      <div className="gen-sources">
        <div className="ed-row" title="Which units the team may have">
          <span>Available units</span>
          <div className="seg">
            <button className={st.available === "all" ? "on" : undefined} onClick={() => setSt({ available: "all" })}>All units</button>
            <button className={st.available === "box" ? "on" : undefined} onClick={() => setSt({ available: "box" })}>{props.boxName} ({box.length})</button>
          </div>
          <button className="link small" onClick={props.onEditBox} title="Open My Boxes: load your box from a video, change builds">Edit box…</button>
        </div>
        <div className="ed-row" title="Of the available units, which ones the search tries">
          <span>Search</span>
          <div className="seg">
            <button className={st.search === "all" ? "on" : undefined} onClick={() => setSt({ search: "all" })}>All available</button>
            <button className={st.search === "meta" ? "on" : undefined} onClick={() => setSt({ search: "meta" })} title={`The ${listed.size - newer.length} units this simulator's meta run found relevant for ${props.assault ? "Assault Rumble" : "Rumble attack"}, and the ${newer.length} released since ${META_SINCE} (after the run's data: it can't have rated them)`}>Only relevant ones, or newer</button>
          </div>
        </div>
      </div>
      <GenUnitLists
        db={db}
        maxCc={props.atk.maxCc}
        exclude={st.exclude ?? []}
        include={included}
        onExclude={(exclude) => setSt({ exclude })}
        onInclude={(include) => setSt({ include })}
        defaultBuild={defaultBuild}
        presets={props.presets}
      />
      <fieldset className="gen-group">
        <legend>Builds</legend>
        <label className="ed-row" title="The build every unit uses, except box units whose build is known (added from a team or Recent units, or set in the box)">
          <span>Build</span>
          <select value={preset?.label ?? ""} onChange={(e) => setSt({ preset: e.target.value })}>{props.presets.map((p, i) => <option key={i} value={p.label}>{p.label}</option>)}</select>
        </label>
        <label className="ed-row" title="Raise every unit to at least this quick build, part by part (level, LLB, Limit Break, Rumble key, special / ability levels, potentials, sockets, cotton candy): nothing goes down. Builds set under Also use and the level-1 death-special builds stay as they are.">
          <span>Every unit at least</span>
          <select value={st.floor ?? ""} onChange={(e) => setSt({ floor: e.target.value })}>
            <option value="">— as it is —</option>
            {props.presets.map((p, i) => <option key={i} value={p.label}>{p.label}</option>)}
          </select>
        </label>
        <label className="ed-row" title="Units of 5★ and below in their final form (a 5★ that evolves to 6★ doesn't count) use this quick build. A box unit whose build is known is only raised where it's below it, part by part: a maxed box unit stays maxed">
          <span>5★ and below</span>
          <select value={st.lowStar ?? ""} onChange={(e) => setSt({ lowStar: e.target.value })}>
            <option value="">— as usual —</option>
            {props.presets.map((p, i) => <option key={i} value={p.label}>{p.label}</option>)}
          </select>
        </label>
        <label className="ed-row" title="Free-to-play units of 5★ and below in their final form (farmed: Co-op, Pirate King Adventures, raids, story...) use this quick build instead of the one above. A box unit whose build is known is only raised where it's below it, part by part: a maxed box unit stays maxed">
          <span>Free-to-play 5★ and below</span>
          <select value={st.lowStarF2p ?? ""} onChange={(e) => setSt({ lowStarF2p: e.target.value })}>
            <option value="">— like 5★ and below —</option>
            {props.presets.map((p, i) => <option key={i} value={p.label}>{p.label}</option>)}
          </select>
        </label>
        <label className="check-row" title="Units with a death special are also tried at level 1 everything (level, LLB, Limit Break, sockets, potentials, cotton candy) with their Rumble special and ability maxed: they go down early and set the death special off">
          <input type="checkbox" checked={st.lowDeath} onChange={(e) => setSt({ lowDeath: e.target.checked })} />
          Also try death-special units at level 1 (special / ability max)
        </label>
      </fieldset>
      {props.assault && (
        <fieldset className="gen-group">
          <legend>What to aim for</legend>
          <div className="gen-aim-line">
            <span>Rank teams by the score I reach at least once in</span>
            <input type="number" className="num-input sm" min={1} max={100} value={st.tries ?? 1} title="The matches you'll play against this boss team, keeping your best score" onChange={(e) => setSt({ tries: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))) })} />
            <span>{aim.tries === 1 ? "match" : "matches"},</span>
            <input type="range" min={5} max={95} step={5} value={Math.round(aim.sure * 100)} title="How often: high = a steady team (rarely falls short), low = a high ceiling (can score more, often doesn't)" onChange={(e) => setSt({ sure: Number(e.target.value) / 100 })} />
            <b className="gen-aim-pct">{pctOf(aim.sure)}</b>
            <span>of the time.</span>
          </div>
          <div className="gen-aim-line muted small">
            <span>Matches:</span>
            {TRIES.map((t) => <button key={t} className={`small-btn ${aim.tries === t ? "on" : ""}`} onClick={() => setSt({ tries: t })}>{t}</button>)}
            <span className="gen-aim-sep">How often:</span>
            {[[0.9, "steady"], [0.5, "even odds"], [0.2, "high ceiling"]].map(([v, l]) => <button key={v} className={`small-btn ${aim.sure === v ? "on" : ""}`} onClick={() => setSt({ sure: v as number })}>{pctOf(v as number)} {l}</button>)}
          </div>
          <p className="muted small gen-aim">
            The same as the score a single match beats {pctOf(oneMatch(aim))} of the time: more matches or a lower % aim higher, a higher % picks a steadier team.
          </p>
        </fieldset>
      )}
      <fieldset className="gen-group">
        <legend>Search effort</legend>
        <label className="ed-row" title="Battles per measuring step: more is steadier, slower"><span>Battles per step</span><input type="number" className="num-input sm" min={6} step={6} value={st.step} onChange={(e) => setSt({ step: Math.max(6, Number(e.target.value) || 24) })} /></label>
        <label className="ed-row" title="Battles for the final check of the best teams"><span>Final check</span><input type="number" className="num-input sm" min={50} step={100} value={st.final} onChange={(e) => setSt({ final: Math.max(50, Number(e.target.value) || 400) })} /></label>
        <div className="ed-row" title="After the first result, the search can keep going: from the best team it tries bigger changes (the team rebuilt around a group most of it is in, two units at once, three places at once) and climbs again. Each time the list gets a full check; the best team found stays on top.">
          <span>Keep improving</span>
          <div className="seg">
            <button className={st.effort === "quick" ? "on" : undefined} onClick={() => setSt({ effort: "quick" })}>Stop at the first result</button>
            <button className={(st.effort ?? "more") === "more" ? "on" : undefined} onClick={() => setSt({ effort: "more" })}>A while longer</button>
            <button className={st.effort === "until" ? "on" : undefined} onClick={() => setSt({ effort: "until" })}>Until I stop</button>
          </div>
        </div>
      </fieldset>
      <div className="row-btns">
        {running ? <button className="danger-btn" onClick={stop}>Stop (keep what's found)</button> : <button className="primary" disabled={total < 1} onClick={run}>▶ Find the best team ({total} units)</button>}
        {prep && <span className="muted small">{prep}</span>}
      </div>
      {(st.search === "meta" && left > 0) || capped > 0 ? (
        <p className="muted small gen-pool-note">
          {st.search === "meta" && left > 0 && <span title={`Only the units the meta run found relevant, or released since ${META_SINCE}, are tried`}>{left.toLocaleString()} available unit{left === 1 ? " is" : "s are"} not relevant: left out. </span>}
          {capped > 0 && <span title="Searching every unit: the relevant ones and your teams' units first, then the newest ones">{capped.toLocaleString()} older units are not tried.</span>}
        </p>
      ) : null}
      {progress && <GenStatus progress={progress} history={history} running={running} stopped={signal.current.stopped} fmt={fmtVal} assault={props.assault} />}
      {history.length > 1 && <GenChart points={history} assault={props.assault} />}
      {error && <p className="error">{error}</p>}
      {list.length > 0 && (
        <ol className="gen-results">
          {list.map((m) => {
            const alts = aimsOf(m);
            return (
              <li key={m.key}>
                <span className="gen-fit" title={`${m.n} battles, 95% range. ${props.assault ? `Ranked by ${aimText(aim)}.` : "Win rate."}`}>{fmtFit(m)}<small className="muted"> · {m.n}</small></span>
                <span className="gen-units">
                  {m.team.members.map((x, i) => {
                    const r = x ? db.byId.get(x.unitId) : undefined;
                    return <span key={i} className={`gen-unit ${i === 5 ? "bench-start" : ""}`} title={r ? r.name : "empty"}>{r ? <UnitThumb id={r.id} size={30} colorClass={colorClass(r)} /> : <span className="thumb-missing" style={{ width: 30, height: 30, display: "inline-block" }} />}</span>;
                  })}
                </span>
                <span className="gen-origin muted small" title={m.origin}>{m.origin.split("; ").slice(-1)[0]}{m.origin.includes("; ") ? ` (from ${m.origin.split("; ")[0]})` : ""}</span>
                <button className="small-btn" onClick={() => props.onUse(m.team, `Generated: ${m.origin.split("; ")[0]}`)}>Use</button>
                <button className="small-btn" onClick={() => props.onSave(m.team, `Generated vs ${props.def.meta?.title ?? "opponent"}`)}>Save</button>
                {alts && (
                  <span className="gen-alts muted small" title={`The score this team reaches at least once in ${matches(aim.tries)}, at each chance, and its average for one match`}>
                    <span>In {matches(aim.tries)}:</span>
                    {alts.map((x) => <span key={x.v} className={x.v === aim.sure ? "on" : undefined}>{pctOf(x.v)} of the time ≥ {fmtVal(x.score)}</span>)}
                    <span>· one match on average {fmtVal(m.mean ?? 0)}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="muted small">
        Starts from the comps of this simulator's own meta run ({META.league.iterations} league rounds{META.battles ? `, ${(META.battles / 1e6).toFixed(0)} million battles` : ""}, {META.generated})
        (the ones your units can field first) and your saved teams, and a team around each group your units' abilities buff; a missing unit is replaced by its
        sub for that place first. Then it tries every single change (a unit swapped in, two places swapped) and two-unit changes (the best single changes
        together, a unit with a unit it works with), and, if you let it, bigger changes from the best team. Every team plays the same battles. Simulated
        results: not checked in the game.
      </p>
    </details>
  );
}

interface GenPoint { battles: number; fit: number; se: number; stage: GenProgress["stage"]; round: number; better: boolean; tried: number; challenger?: number; current?: number }

/** Compact numbers for the chart's axis (19.5M, 870K; win rates as %). */
const compact = (v: number, assault: boolean) => {
  if (!assault) return `${(v * 100).toFixed(0)}%`;
  const a = Math.abs(v);
  return a >= 1e6 ? `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M` : a >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v));
};

/**
 * Where the search stands, in three parts: what it's doing now (one line), the key figures (best team, gain since the
 * start, better teams found, teams and battles), and in an improvement round the change in the lead against the team
 * it would replace.
 */
function GenStatus(props: { progress: GenProgress; history: GenPoint[]; running: boolean; stopped: boolean; fmt: (v: number) => string; assault: boolean }) {
  const { progress: p, history: h, fmt } = props;
  const first = h[0], last = h.at(-1);
  const best = p.best[0];
  const gains = h.filter((x) => x.better);
  const lastGain = gains.at(-1);
  const d = (v: number) => (props.assault ? `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v)).toLocaleString()}` : `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)} pts`);
  const pct = first && best && props.assault && first.fit > 0 ? ` (${(((best.fit - first.fit) / first.fit) * 100).toFixed(1)}%)` : "";
  const phase = !props.running ? (props.stopped ? "Stopped (kept what was found)" : "Done")
    : props.stopped ? "Stopping after this step…" : p.stage === "start" ? "Starting teams" : p.stage === "improve" ? `Round ${p.round}` : "Final check";
  // the engine's note without its "Round N:" prefix (shown as the phase)
  const detail = p.note.replace(/^Round \d+:\s*/, "");
  const lead = props.running && p.stage === "improve" && p.challenger && p.current ? { ahead: p.challenger.fit - p.current.fit, challenger: p.challenger, current: p.current } : undefined;
  return (
    <div className="gen-status">
      <div className="gen-now"><b>{phase}</b>{props.running && detail && detail !== "Done" ? <span className="muted"> · {detail}</span> : null}</div>
      <div className="gen-tiles">
        {best && <div className="gen-tile" title={`${best.n} battles; 95% range ± ${fmt(1.96 * best.se)}`}><span>Best team</span><b>{fmt(best.fit)}</b></div>}
        {first && best && <div className="gen-tile" title={`From the best starting team's ${fmt(first.fit)}`}><span>Since the start</span><b>{d(best.fit - first.fit)}{pct}</b></div>}
        <div className="gen-tile" title={gains.map((g, i) => `Round ${g.round}: ${d(g.fit - (i ? gains[i - 1]!.fit : first?.fit ?? g.fit))}`).join("\n") || "None yet"}>
          <span>Better teams found</span><b>{gains.length}{lastGain ? <small className="muted"> · last in round {lastGain.round}</small> : null}</b>
        </div>
        <div className="gen-tile"><span>Teams tried</span><b>{p.tried.toLocaleString()}</b></div>
        <div className="gen-tile"><span>Battles</span><b>{p.battles.toLocaleString()}</b></div>
      </div>
      {lead && (
        <div className={`gen-lead ${lead.ahead > 0 ? "ahead" : "behind"}`}>
          Best change this round: <b>{fmt(lead.challenger.fit)}</b> against the current team's <b>{fmt(lead.current.fit)}</b> ({d(lead.ahead)}) after {lead.challenger.n} battles —{" "}
          {lead.ahead > 0 ? "it replaces the team if it stays ahead over more battles." : "no change beats the team so far; if none does, the search ends here."}
        </div>
      )}
      {!props.running && last && first && (
        <div className="muted small">From {fmt(first.fit)} to {fmt(last.fit)} over {last.battles.toLocaleString()} battles and {last.tried.toLocaleString()} teams{gains.length ? `; a better team in ${gains.length} round${gains.length === 1 ? "" : "s"}` : ""}.</div>
      )}
    </div>
  );
}

/**
 * The search at a glance: the best team's measure against the battles simulated, its 95% range as a band, the round's
 * leading change dashed, a dot where a better team turned up, and the phases along the bottom; a legend under it.
 */
function GenChart(props: { points: GenPoint[]; assault: boolean }) {
  const pts = props.points;
  const W = 600, H = 120, L = 40, R = 8, T = 8, B = 20;
  const maxX = Math.max(1, pts.at(-1)!.battles);
  const vals = pts.flatMap((p) => [p.fit - 1.96 * p.se, p.fit + 1.96 * p.se, ...(p.challenger != null ? [p.challenger] : [])]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || (props.assault ? 1 : 0.01);
  const y0 = props.assault ? lo - pad : Math.max(0, lo - pad), y1 = props.assault ? hi + pad : Math.min(1, hi + pad);
  const x = (b: number) => L + ((W - L - R) * b) / maxX;
  const y = (v: number) => T + (H - T - B) * (1 - (v - y0) / Math.max(1e-9, y1 - y0));
  const full = (v: number) => (props.assault ? Math.round(v).toLocaleString() : `${(v * 100).toFixed(1)}%`);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.battles).toFixed(1)},${y(p.fit).toFixed(1)}`).join(" ");
  const band = `${pts.map((p, i) => `${i ? "L" : "M"}${x(p.battles).toFixed(1)},${y(p.fit + 1.96 * p.se).toFixed(1)}`).join(" ")} ${pts.slice().reverse().map((p) => `L${x(p.battles).toFixed(1)},${y(p.fit - 1.96 * p.se).toFixed(1)}`).join(" ")} Z`;
  const firstRound = pts.find((p) => p.stage === "improve");
  const finalAt = pts.find((p) => p.stage === "final" || p.stage === "done");
  const chal = pts.filter((p) => p.challenger != null);
  return (
    <div className="gen-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The best team's measure over the search">
        <path d={band} className="gen-band" />
        <path d={line} className="gen-line" fill="none" />
        {chal.length > 1 && <path d={chal.map((p, i) => `${i ? "L" : "M"}${x(p.battles).toFixed(1)},${y(Math.max(y0, Math.min(y1, p.challenger!))).toFixed(1)}`).join(" ")} className="gen-chal" fill="none" />}
        {[y0, (y0 + y1) / 2, y1].map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="gen-grid" />
            <text x={L - 4} y={y(v) + 3} className="gen-axis" textAnchor="end"><title>{full(v)}</title>{compact(v, props.assault)}</text>
          </g>
        ))}
        {pts.filter((p) => p.better).map((p, i) => <circle key={i} cx={x(p.battles)} cy={y(p.fit)} r={3.5} className="gen-dot"><title>{`Round ${p.round}: a better team, ${full(p.fit)}`}</title></circle>)}
        <rect x={L} y={H - B + 6} width={(firstRound ? x(firstRound.battles) : x(maxX)) - L} height={5} className="gen-phase start" />
        {firstRound && <rect x={x(firstRound.battles)} y={H - B + 6} width={(finalAt ? x(finalAt.battles) : x(maxX)) - x(firstRound.battles)} height={5} className="gen-phase improve" />}
        {finalAt && <rect x={x(finalAt.battles)} y={H - B + 6} width={Math.max(2, x(maxX) - x(finalAt.battles))} height={5} className="gen-phase final" />}
        <text x={W - R} y={H - 1} className="gen-axis" textAnchor="end">{maxX.toLocaleString()} battles</text>
      </svg>
      <ul className="gen-legend small muted">
        <li><svg width="18" height="8"><line x1="0" x2="18" y1="4" y2="4" className="gen-line" /></svg>Best team</li>
        <li><svg width="18" height="8"><rect width="18" height="8" className="gen-band" /></svg>its 95% range</li>
        <li><svg width="18" height="8"><line x1="0" x2="18" y1="4" y2="4" className="gen-chal" /></svg>Best change being tested</li>
        <li><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" className="gen-dot" /></svg>Better team found</li>
        <li>Phases: <span className="gen-key start" /> starting teams <span className="gen-key improve" /> improvement rounds <span className="gen-key final" /> final check</li>
      </ul>
    </div>
  );
}

/**
 * Units to leave out of the search (never used, even in the box or among the relevant ones) and units to use whatever the filters
 * say, each with a build set here: instead of the unit's usual build, or as one more build of it to try.
 */
function GenUnitLists(props: {
  db: UnitDb; maxCc?: TeamConfig["maxCc"]; exclude: number[]; include: { m: MemberConfig; mode: "replace" | "extra" }[];
  onExclude: (x: number[]) => void; onInclude: (x: { m: MemberConfig; mode: "replace" | "extra" }[]) => void; defaultBuild?: PresetDef;
  presets: PresetDef[];
}) {
  const { db } = props;
  const [adding, setAdding] = useState<"exclude" | "include">();
  const [editing, setEditing] = useState<number>();
  const [, setLoaded] = useState(0);
  const exRef = useRef<HTMLButtonElement>(null);
  const inRef = useRef<HTMLButtonElement>(null);
  const thumb = (id: number) => { const r = db.byId.get(id); return r ? <UnitThumb id={r.id} size={28} colorClass={colorClass(r)} /> : null; };
  const ed = editing != null ? props.include[editing] : undefined;
  const edRec = ed ? db.byId.get(ed.m.unitId) : undefined;
  const setEd = (patch: Partial<{ m: MemberConfig; mode: "replace" | "extra" }>) => props.onInclude(props.include.map((x, i) => (i === editing ? { ...x, ...patch } : x)));
  return (
    <div className="gen-lists">
      <div className="ed-row" title="These units are never used, even when they're in the box or among the relevant ones">
        <span>Leave out</span>
        <span className="gen-chips">
          {props.exclude.map((id) => (
            <span key={id} className="gen-chip" title={db.byId.get(id)?.name}>{thumb(id)}<button className="slot-x" title="Use it again" onClick={() => props.onExclude(props.exclude.filter((x) => x !== id))}>×</button></span>
          ))}
          <button ref={exRef} className="small-btn" onClick={() => setAdding("exclude")}>+ Unit</button>
        </span>
      </div>
      <div className="ed-row" title="These units are used whatever the filters say, with the build set here (click one to change it)">
        <span>Also use</span>
        <span className="gen-chips">
          {props.include.map((x, i) => (
            <span key={`${x.m.unitId}-${i}`} className={`gen-chip ${editing === i ? "on" : ""}`} title={`${db.byId.get(x.m.unitId)?.name}: ${x.mode === "replace" ? "this build instead of its usual one" : "this build as one more to try"}. Click to change it.`}>
              <button className="gen-chip-btn" onClick={() => { setEditing(editing === i ? undefined : i); void db.ensure([x.m.unitId]).then(() => setLoaded((n) => n + 1)); }}>
                {thumb(x.m.unitId)}<small>{x.m.level != null ? `Lv ${x.m.level}` : ""}{x.mode === "extra" ? " +" : ""}</small>
              </button>
              <button className="slot-x" title="Remove" onClick={() => { props.onInclude(props.include.filter((_, j) => j !== i)); setEditing(undefined); }}>×</button>
            </span>
          ))}
          <button ref={inRef} className="small-btn" onClick={() => setAdding("include")}>+ Unit</button>
        </span>
      </div>
      {adding && (
        <FloatingPop anchor={adding === "exclude" ? exRef : inRef} offset={34}>
          <UnitSearch
            db={db}
            autoFocus
            onCancel={() => setAdding(undefined)}
            onPick={(u) => {
              if (adding === "exclude") { if (!props.exclude.includes(u.id)) props.onExclude([...props.exclude, u.id]); setAdding(undefined); return; }
              setAdding(undefined);
              void withDefaultBuild(db, u.id, props.defaultBuild).then((m) => { props.onInclude([...props.include, { m, mode: "replace" }]); setEditing(props.include.length); });
            }}
          />
        </FloatingPop>
      )}
      {ed && edRec && (
        <div className="gen-include-edit">
          <div className="row-btns small">
            <b>{edRec.name}</b>
            <label><input type="radio" checked={ed.mode === "replace"} onChange={() => setEd({ mode: "replace" })} /> use this build (instead of its usual one)</label>
            <label><input type="radio" checked={ed.mode === "extra"} onChange={() => setEd({ mode: "extra" })} /> also try this build</label>
            <label title="Set the whole build from a quick build preset, then change what you like below">
              Quick build{" "}
              <select value="" onChange={(e) => { const pr = props.presets.find((x) => x.label === e.target.value); if (pr) setEd({ m: applyPreset(edRec, { unitId: edRec.id }, pr) }); }}>
                <option value="">pick…</option>
                {props.presets.map((pr) => <option key={pr.label} value={pr.label}>{pr.label}</option>)}
              </select>
            </label>
            <button className="link small" onClick={() => setEditing(undefined)}>Done</button>
          </div>
          {db.hasDetail(edRec.id)
            ? <UnitSettings db={db} unit={edRec} member={ed.m} team={{ members: [], ...(props.maxCc ? { maxCc: props.maxCc } : {}) }} index={0} onChange={(m) => setEd({ m })} />
            : <p className="muted small">Loading…</p>}
        </div>
      )}
    </div>
  );
}
