/**
 * Pirate Rumble battle simulator, rebuilt from docs/SIMULATOR_HANDOFF.md (2026-11-11). Section numbers in comments refer
 * to that document. Fixed 1/30 s ticks; movement is worked out from start/end points rather than stepped, and nothing
 * is allocated per tick, so a battle takes well under a millisecond-per-second of battle time.
 */
import type { Condition, Effect, Pattern, Resilience, SuperCondition, UnitRecord } from "../data/schema";
import type { BuffSource, MemberConfig, TeamConfig } from "../engine/types";
import { GAME_RULES, ruleActive, ruleBuffs, ruleMatches, type GlobalRule } from "../engine/rules";
import { keyBonusFor, kitFor, rumbleDefSpd, rumbleStats, type KeyBonus } from "../engine/stats";
import { cellPos, cellsNear, inField, nearestCell, RADIAL_TILES, TILE, type Cell, type Vec } from "../engine/grid";
import { shortName } from "../engine/team";
import { Dice, streamSeeds, unitKey } from "./rand";
import { FULL_EXTRA, timingFor, type Timing, type TimingInfo } from "./timing";
import { sideOf } from "./spec";
import { effectLines } from "../data/rumbleText";
import type { BattleEvent, CutIn, Frame, GpSideResult, Side, SimOptions, SimResult, UnitSnapshot } from "./types";
import { burstNeed, burstProgressKey, burstUses, gpAbility, gpBurst, gpCondition, leaderBoosted, newTally, type GpLaunch, type GpTally } from "../engine/gp";

// ---------------------------------------------------------------------------------------------------------------
// Constants (tags: [C] confirmed, [M] measured, [L] likely, [A] assumed)
// ---------------------------------------------------------------------------------------------------------------
export const BATTLE_LENGTH = 100; // [C]
export const TICK = 1 / 30; // [M]
const BEAT = 1.526; // [M]
const AURA_REFRESH = 0.5;
const RETURN_ROWS = 2; // return tile two rows back, 1-3 tiles behind [M]
const TILE_TAKEN = 30; // px
const START_TILES: Record<Side, readonly Cell[]> = {
  atk: [{ i: 1, j: -1 }, { i: 2, j: -1 }, { i: 3, j: -1 }, { i: 2, j: 0 }, { i: 0, j: 0 }],
  def: [{ i: 3, j: -1 }, { i: 2, j: -1 }, { i: 1, j: -1 }, { i: 0, j: 0 }, { i: 2, j: 0 }],
};
const PER_LEVEL = { HP: 250, ATK: 75, RCV: 50, DEF: 25, SPD: 5 } as const;
const SPD_CAP = 250; // [L]
/**
 * Queue rules (2026-11-11). rateCap: the SPD above which the gauge stops growing faster (Infinity = no cap). pick:
 * "projList" [L user, runs 1 videos 4/5, 9: run 9's five skips, run 1 at 21.4 s] = the NEXT order drawn right after a
 * beat is locked, each gauge projected `horizon` ahead from its current state (a gauge stopped now, under attack or still
 * busy, doesn't move forward); at the next beat its top acts, or if that unit can't (under attack, knocked back) the
 * next one in that list, and so on. "gauge" (scripts/sensitivity.ts) = the free unit with the highest gauge at the beat.
 * (The other rules tried on 2026-11-11 are in docs/HISTORY.md.)
 */
export const QUEUE = {
  rateCap: Infinity as number, // no cap (2026-11-11: run 9 needs SPD above 250; run 6 fits without it given Kizaru's long action)
  pick: "projList" as "gauge" | "projList", // [L] user, 2026-11-11
  /** A guarded hit can still blow its target away (user, run 1 video 1 at 19.4 s: Cabaji, likely guarded). */
  guardedBlowAway: true, // [L] user, run 1 video 1 at 19.4 s
  /** Seconds of the NEXT forecast's look-ahead [M 1.0]. */
  horizon: 1.0,
  /** Distance a special fires from (px; 0 = the unit's attack reach). */
  specialReach: 0,
};
const TYPE_MULT = { Normal: 0.6, Power: 0.9, Full: 1.5 } as const; // [C]
/** Pattern heal amount = this x the healer's RCV, by heal level: 0.3 / 0.6 [C data 2026-11-13: effect type 6,
 *  coefficient 0.3 (Lv.1) / 0.6 (Lv.2)], 1.0 for level 3 [C wiki, not in the file]. */
const HEAL_MULT = [0.3, 0.6, 1.0];
const DEF_K = 50000; // [C]
const SUPERS_PER_TEAM = 3; // [C]
const CUT = { normal: { bench: 2.03, start: 4.7, ability: 1.5, intro: 2.07, part: 1.23, outro: 0.72 }, fast: { bench: 1.53, start: 3.0, ability: 1.0, intro: 1.57, part: 0.83, outro: 0.4 } };

const HINDERANCES = new Set([
  "Paralysis", "Special Bind", "Action Bind", "Ability Bind", "RCV Bind", "Confusion", "Forced Out",
  "Half Stats", "Half ATK", "Half DEF", "Half SPD", "Half RCV", "Damage Over Time", "Special CT",
]);
const LEVEL_ATTRS = new Set(["HP", "ATK", "RCV", "DEF", "SPD", "Critical Hit", "Guard", "Accuracy", "Blow Away", "Special CT"]);

const dist = (a: Vec, b: Vec) => { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); };
const lc = (s: string | undefined) => (s ?? "").toLowerCase();
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Values that are assumed or only roughly measured, in one place so they can be varied (scripts/sensitivity.ts).
 * Tags: [M] measured, [L] likely, [A] assumed, [C] confirmed.
 */
export const TUNE = {
  walkOut: 950, // px/s [M] 900-1,000
  walkBack: 1100, // [M]
  homeSettle: 0.2, // free 0.2 s after arriving home [M]
  healAnim: 0.8, // [A]
  healBehind: 70, // px behind the healed teammate [A]
  /** Pattern heal areas, px, around the healed teammate. Small = 1.0 tile [C data 2026-11-13: heal Lv.1 is range_type 1,
   *  range 1.0, team ALLY]; Medium 1.6 and Large 2.78 tiles are the old 150 / 260 px in tiles [A]. */
  healRadius: { Small: 1.0 * TILE, Medium: 1.6 * TILE, Large: 2.78 * TILE } as Record<string, number>,
  knockStun: 0.5, // a knocked-back unit can't act or fill its gauge while it flies back [L, user 2026-11-11]
  knockOneTile: 5 / 13, // [M] one tile back : return-type tile = 5 : 8
  benchDelay: 1.8, // [M]
  base: { guard: 0.05, miss: 0.09, crit: 0.05, blow: 0.05 }, // [M]/[C]
  missPerLevel: 0.025, // [C]
  chancePerLevel: 0.05, // [C]
  ctPerLevel: 0.03, // charge speed per Special CT level [C value, A shape]
  dotPerLevel: 0.05, // [C]
  /** The summed Damage over Time level is capped here [C user 2026-11-24; M]: the tick never goes past Lv 10 in the
   *  Assault videos (Blackbeard 70,950 = Lv 10 after Caesar's 4th special, 12 summed; Akainu 42,978 = Lv 10 before
   *  and after Caesar's 4th, with Caesar x3 + Reiju already past 10). Was 20 (user 2026-11-13). */
  dotMaxLevel: 10,
  /** A unit with Damage over Time waits this long before a regular action (attack, heal, Confused attack), taking the
   *  tick in the middle of the wait; the action then plays as usual, all of it this much later [M user 2026-11-13: 49
   *  frames at 59.94 fps]. */
  dotWait: 49 / 59.94,
  shieldPerLevel: 600, // [C data 2026-11-13: a level-5 Shield is 3,000]
  /** Radial special ranges, px = tiles x TILE (src/engine/grid.ts): small 1.2, medium 2.3 [C data], large 3.6 [L]. */
  radial: { small: RADIAL_TILES.small * TILE, medium: RADIAL_TILES.medium * TILE, large: RADIAL_TILES.large * TILE } as Record<string, number>,
  /** Forward / sideways specials, px [A]. The game's battle data (2026-11-13) has, not yet applied: forward large =
   *  range_type 2, range 6; another range_type 2 with range 4; sideways small = range_type 3, range 1 (tiles?). */
  lineLen: { small: 150, medium: 300, large: 500 } as Record<string, number>, // [A]
  lineW: 80, // [A]
  nonDamageRange: 0.9, // buff / debuff parts reach this share of the damage range [A]
  fullExtra: FULL_EXTRA, // a Full attack waits this long before setting off, s [M few: label -> number; C user: the shape]
  halfStatsHp: false, // Half Stats also halves max HP: no [C user 2026-11-12]
  reviveDefault: 50, // % HP when a Revive gives no amount [A]
  /** Assault Rumble boss range attacks, px around the boss: the radial special sizes [A]. */
  bossRange: { Small: RADIAL_TILES.small * TILE, Medium: RADIAL_TILES.medium * TILE } as Record<string, number>,
  /** Seconds added to the stay of units with no measured animation (all high-end units) [A]. */
  unmeasuredStayAdd: 0,
};

// ---------------------------------------------------------------------------------------------------------------
// Unit state
// ---------------------------------------------------------------------------------------------------------------
/** "leader": a Grand Party leader, never on the field (its GP ability and burst work from outside). */
type Where = "bench" | "field" | "dead" | "out" | "leader";
/** HP an Assault Rumble boss keeps at "0 HP": it counts as on the field and acting, shown as 0. */
const ZERO_HP = 1e-9;
type Phase = "idle" | "toAttack" | "attack" | "back" | "heal" | "settle";

/** A timed level. owner: an ability's, dropped when its unit leaves; by / via: who gave it and how (buffSources). */
interface Mod { attr: string; level: number; end: number; owner?: U; by?: U; via?: "special" | "super" | "ability" | "trigger" }
/** One part of an aura level (abilities and rules), kept only while frames are recorded (snapshot buffSources). */
interface AuraSrc { attr: string; level: number; kind: "ability" | "rule"; from?: U; label: string }
interface Status { name: string; end: number; chance?: number; amount?: number; level?: number; pct?: number; attrs?: string[]; owner?: U }
interface AbilityEffect { e: Effect; idx: number; fired: number; on: boolean; holds: boolean; aura: boolean }
interface Action {
  kind: "attack" | "special" | "heal" | "confused";
  target: U;
  type: "Normal" | "Power" | "Full";
  heal?: Extract<Pattern, { action: "heal" }>;
  arrive: number;
  hitAt: number;
  leaveAt: number;
  hit: boolean;
  tile: Vec;
  cell?: Cell;
  cellSide: Side;
  n: number;
  /** The target was let go early (knocked back). */
  released?: boolean;
  /** Damage over Time: the tick's time (middle of the wait) and the wait's end; undefined when there is no wait. */
  dotAt?: number;
  dotEnd?: number;
  /** A death special (On Death): fires on arrival like any special, then the unit dies or its team wins. */
  death?: boolean;
  /** An Assault Rumble boss's range attack: hits its target and every enemy within this many px of the boss. */
  range?: number;
}
/** A place in the NEXT queue: a unit's own gauge (k 0), or one of a main boss's extra places (k 1+: U.extra). */
interface QE { u: U; k: number }

export interface U {
  uid: string;
  /** The unit's build as set up (levels, LLB): the viewer shows its special and ability text from it. */
  member: MemberConfig;
  side: Side;
  /** Crew position (0-7), fixed: tie order and the A/D number. */
  slot: number;
  /** Place in the bench line while on the bench: the lowest comes in next ("1st sub character"). */
  benchAt: number;
  key: number;
  rec: UnitRecord;
  name: string;
  base: { hp: number; atk: number; rcv: number; def: number; spd: number };
  keyB?: KeyBonus;
  abilities: AbilityEffect[];
  special?: { cooldown: number; effects: Effect[] };
  superSp?: { condition: SuperCondition; effects: Effect[] };
  pattern: Pattern[];
  resil: Resilience[];
  targetRule: { criteria: string; comparator?: string };
  timing: Timing & TimingInfo;
  // state
  where: Where;
  tile: number; // start-tile index (field slot it occupies)
  hp: number;
  pos: Vec;
  home: Vec;
  homeCell?: Cell;
  from: Vec; to: Vec; t0: number; t1: number;
  phase: Phase;
  freeAt: number;
  act?: Action;
  attackedBy: number;
  gauge: number;
  charge: number;
  patIdx: number;
  mods: Mod[];
  aura: Record<string, number>;
  /** Where each `aura` level comes from (only while frames are recorded). */
  auraSrc?: AuraSrc[];
  statuses: Status[];
  shield: number;
  haste: boolean;
  outUntil: number;
  knockUntil: number;
  lastStand: boolean;
  /** Paralysis: picked for a regular attack, it stands still until then instead (paralyzedTurn). */
  paralyzedUntil?: number;
  /** Action Bound at the last beat: off the NEXT queue until a beat finds it free of the bind (queueHidden). */
  boundAtBeat?: boolean;
  revives: number;
  onDeath: number;
  superUsed: boolean;
  lastAttacker?: U;
  lastTarget?: U;
  actions: number;
  specials: number;
  // super special counters
  cnt: { specialReceived: number; dmgReceived: number; dmgTaken: number; healed: number; dbfReceived: Record<string, number> };
  // summary
  dealt: number; taken: number; healing: number; kos: number;
  regenNext: number;
  /** Assault Rumble boss: at 0 HP since this time (stays on the field, takes more damage, can't be healed). */
  zeroAt?: number;
  /** Assault Rumble boss: damage that counts for the score (all of it at the max level; else only down to 0 HP). */
  scoreDmg?: number;
  /** Assault Rumble main boss: the gauges of its extra NEXT places (BossDef.places - 1 of them). */
  extra?: number[];
  /** Assault Rumble main boss: several of the other team can attack it at once. */
  mainBoss?: boolean;
  /** Its NEXT places (the own gauge first, then the extra ones). */
  qe: QE[];
}

/** What doesn't change during a battle, worked out once per team (stats from the team-building code). */
interface Template {
  uid: string; side: Side; slot: number; key: number; rec: UnitRecord; name: string; member: MemberConfig;
  base: U["base"]; keyB?: KeyBonus; abilities: Effect[]; special?: U["special"]; superSp?: U["superSp"];
  pattern: Pattern[]; resil: Resilience[]; targetRule: U["targetRule"];
}
const TEMPLATE_CACHE = new WeakMap<TeamConfig, { db: unknown; side: Side; list: Template[] }>();
function templates(db: { byId: Map<number, UnitRecord> }, team: TeamConfig, side: Side): Template[] {
  const hit = TEMPLATE_CACHE.get(team);
  if (hit && hit.db === db && hit.side === side) return hit.list;
  const list: Template[] = [];
  team.members.forEach((m, slot) => {
    if (!m) return;
    const rec = db.byId.get(m.unitId);
    if (!rec) return;
    const kit = kitFor(rec, m);
    const st = rumbleStats(rec, m, team.maxCc);
    const ds = rumbleDefSpd(rec, m);
    const spLv = Math.min(Math.max(1, m.specialLevel ?? 10), kit.specials.length);
    const abLv = Math.min(Math.max(1, m.abilityLevel ?? 5), kit.abilities.length);
    list.push({
      uid: `${side === "atk" ? "A" : "D"}${slot + 1}`, side, slot, key: unitKey(side, slot), rec, name: shortName(rec.name), member: m,
      base: { hp: st.hp, atk: st.atk, rcv: st.rcv, def: ds.def, spd: ds.spd },
      keyB: keyBonusFor(rec, m),
      abilities: kit.abilities[abLv - 1] ?? [],
      special: kit.specials[spLv - 1],
      superSp: kit.superSpecial,
      pattern: kit.pattern.length ? kit.pattern : [{ action: "attack", type: "Normal" }],
      resil: kit.resilience,
      targetRule: kit.target ?? { criteria: "near" },
    });
  });
  TEMPLATE_CACHE.set(team, { db, side, list });
  return list;
}

/** A Grand Party leader's template: the leader's build, its GP ability as its abilities, no special. */
function leaderTemplate(db: { byId: Map<number, UnitRecord> }, team: TeamConfig, side: Side): (Template & { burst?: { uses: number; effects: Effect[] } }) | undefined {
  const l = team.leader;
  const rec = l && db.byId.get(l.member.unitId);
  if (!l || !rec) return undefined;
  const st = rumbleStats(rec, l.member, team.maxCc);
  const ds = rumbleDefSpd(rec, l.member);
  return {
    uid: `${side === "atk" ? "A" : "D"}L`, side, slot: 8, key: unitKey(side, 8), rec, name: shortName(rec.name), member: l.member,
    base: { hp: st.hp, atk: st.atk, rcv: st.rcv, def: ds.def, spd: ds.spd },
    abilities: gpAbility(rec, l), burst: gpBurst(rec, l),
    pattern: [{ action: "attack", type: "Normal" }], resil: [], targetRule: { criteria: "near" },
  };
}

// ---------------------------------------------------------------------------------------------------------------
/** "1st sub character" -> 0, "2nd ..." -> 1, "3rd ..." -> 2 (the place in the bench line; see Battle.switchOut). */
export function subIndex(sw: string): number {
  const n = parseInt(sw, 10);
  return Number.isFinite(n) && n >= 1 ? n - 1 : 0;
}

export class Battle {
  t = 0;
  readonly units: U[] = [];
  readonly sides: Record<Side, U[]> = { atk: [], def: [] };
  private readonly dice: Dice;
  private readonly rules: GlobalRule[];
  /** Rules that apply to each unit (they depend on the unit and its side only). */
  private readonly ruleHits: Map<U, GlobalRule[]>;
  private rulesOf(u: U): GlobalRule[] {
    let r = this.ruleHits.get(u);
    if (!r) { r = this.rules.filter((x) => ruleMatches(x, u.rec, u.side)); this.ruleHits.set(u, r); }
    return r;
  }
  private readonly events: BattleEvent[] = [];
  private readonly frames: Frame[] = [];
  private readonly cutIns: CutIn[] = [];
  /** How many units the last applyEffect aimed at (0: nobody it applies to, so the effect doesn't go off). */
  private lastTargetCount = 0;
  private readonly unsupported: Record<string, number> = {};
  private readonly logOn: boolean;
  private wall = 0;
  private nextBeat = 0;
  private nextAura = 0;
  private nextFrame = 0;
  private lastSecond = 0;
  private supersUsed: Record<Side, number> = { atk: 0, def: 0 };
  private teamSpecials: Record<Side, number> = { atk: 0, def: 0 };
  private teamKos: Record<Side, number> = { atk: 0, def: 0 };
  private pendingBench: { t: number; side: Side; tile: number; charge: number; gauge: number }[] = [];
  private attackN = 0;
  private beats = 0;
  private readonly tieSpd = new Map<U, number>();
  private auraDirty = true;
  private koSinceCheck = false;
  /** A super special's effects are being applied (labels its timed levels in buffSources). */
  private firingSuper = false;

  constructor(db: { byId: Map<number, UnitRecord> }, atk: TeamConfig, def: TeamConfig, private readonly o: SimOptions) {
    this.dice = new Dice(streamSeeds(o.seed, o.seeds), o.recordDraws ?? o.recordEvents ?? true, o.force);
    this.mode = o.mode ?? "rumble";
    this.zeroMult = 1 + (o.assault?.zeroTakenPct ?? 50) / 100;
    const team = (side: Side) => (side === "atk" ? atk : def);
    const extraRules: GlobalRule[] = [];
    if (this.mode === "gp") {
      for (const side of ["atk", "def"] as const) {
        const tp = leaderTemplate(db, team(side), side);
        if (!tp) continue;
        const L = this.makeUnit(tp);
        L.where = "leader";
        L.pos = { x: side === "atk" ? -200 : 1280, y: 400 };
        L.hp = L.base.hp;
        this.leaders[side] = L;
        const boost = o.gp?.boost;
        const boosted = leaderBoosted(tp.rec, boost);
        const so = o.gp?.[side];
        const c = gpCondition(tp.rec);
        const need = burstNeed(c, boosted, boost);
        const uses = Math.max(0, Math.min(burstUses(tp.rec, team(side).leader!, boosted, boost), so?.usesLeft ?? Infinity));
        const launch: GpLaunch = so?.launch ?? { mode: "ready" };
        this.gp[side] = {
          L, burst: tp.burst, cond: c, need, uses, boosted, base: Math.max(0, so?.startCharge ?? 0), mark: 0, launch,
          times: launch.mode === "times" ? [...launch.times].filter((x) => x >= 0).sort((a, b) => a - b) : [],
          res: { leaderUid: L.uid, name: L.name, unitId: tp.rec.id, boosted, need, uses, launches: [], readyAt: [], trace: [] },
        };
        // the season's stat boosts for a boosted leader's team (the rule's own side setting is replaced)
        if (boosted && boost) for (const r of boost.rules) if (r.enabled) extraRules.push({ ...r, side });
      }
    }
    this.rules = [...(o.rules ?? []), ...extraRules].filter((r) => r.enabled);
    this.ruleHits = new Map();
    this.logOn = o.recordEvents ?? true;
    for (const side of ["atk", "def"] as const) {
      for (const tp of templates(db, side === "atk" ? atk : def, side)) {
        const u = this.makeUnit(tp);
        const places = this.mainBossPlaces(u);
        if (places > 0) { u.mainBoss = true; u.extra = new Array<number>(places - 1).fill(0); }
        u.qe = Array.from({ length: Math.max(1, places) }, (_, k) => ({ u, k }));
        this.units.push(u);
        this.sides[side].push(u);
        for (const a of u.abilities) if (isGroupRevive(a.e)) this.revivePools.push({ owner: u, e: a.e, uses: a.e.repeat ?? 1 });
      }
    }
    for (const L of Object.values(this.leaders)) for (const a of L!.abilities) if (isGroupRevive(a.e)) this.revivePools.push({ owner: L!, e: a.e, uses: a.e.repeat ?? 1 });
  }
  private readonly mode: "rumble" | "gp" | "assault";
  /** Assault Rumble: damage taken by a boss at 0 HP is multiplied by this. */
  private readonly zeroMult: number;
  /** Grand Party leaders (not on the field; not in `units`). */
  private readonly leaders: Partial<Record<Side, U>> = {};
  /** Grand Party: each side's burst state. `base` = progress carried in (start charge), `mark` = the tally when the
   *  gauge last emptied (a launch). */
  private readonly gp: Partial<Record<Side, {
    L: U; burst?: { uses: number; effects: Effect[] }; cond?: Condition; need: number; uses: number; boosted: boolean;
    base: number; mark: number; launch: GpLaunch; times: number[]; readyNoted?: boolean; res: GpSideResult;
  }>> = {};
  /** Grand Party tallies per side (burst gauges). */
  private readonly tally: Record<Side, Record<GpTally, number>> = { atk: newTally(), def: newTally() };
  private count(side: Side, k: GpTally, n = 1) { this.tally[side][k] += n; }
  /** Assault Rumble: the defending team is the bosses. */
  private boss(u: U) { return this.mode === "assault" && u.side === "def" && this.o.assault?.immortal !== false; }
  /** Units whose abilities work: the field units and the Grand Party leaders. */
  private abilityUnits(): U[] { const L = this.leaders; return L.atk || L.def ? [...this.units, ...(L.atk ? [L.atk] : []), ...(L.def ? [L.def] : [])] : this.units; }
  /**
   * A passive ability's Revive for a group of crew members (user, 2026-11-17): `repeat` uses in total for the whole
   * game, shared by every matching unit (the owner included when it matches); see revive().
   */
  private readonly revivePools: { owner: U; e: Effect & Record<string, any>; uses: number }[] = [];

  private makeUnit(tp: Template): U {
    const { side, slot, key } = tp;
    const pos = slot < 5 ? cellPos(side, START_TILES[side][slot]!) : { x: side === "atk" ? -100 : 1180, y: 700 };
    return {
      uid: tp.uid, member: tp.member, side, slot, key, rec: tp.rec, name: tp.name, keyB: tp.keyB, special: tp.special, superSp: tp.superSp,
      pattern: tp.pattern, resil: tp.resil, targetRule: tp.targetRule,
      base: { ...tp.base },
      abilities: tp.abilities.map((e, idx) => {
        const trig = e.condition?.type === "trigger" || !!(e as Ef).onArrival;
        const lvOnly = (e.attributes ?? []).every((x) => LEVEL_ATTRS.has(x));
        const aura = !trig && !e.attributes?.includes("Shield") && (e.effect === "buff" || e.effect === "debuff" || (e.effect === "penalty" && lvOnly));
        if (aura && (e.targeting?.priority || e.targeting?.count || (e.targeting as Record<string, unknown> | undefined)?.status)) this.dynamicAuras = true;
        return { e, idx, fired: 0, on: false, holds: false, aura };
      }),
      timing: (() => { const t = timingFor(tp.rec.id, this.dice, key, tp.rec.game?.attack?.firstHit, tp.rec.game?.attack?.frames); if (t.stayFrom === "borrowed") t.stay += TUNE.unmeasuredStayAdd; return t; })(),
      where: slot < 5 ? "field" : "bench",
      benchAt: slot,
      tile: slot < 5 ? slot : -1,
      hp: 0, pos, home: { ...pos }, homeCell: slot < 5 ? START_TILES[side][slot] : undefined,
      from: pos, to: pos, t0: 0, t1: 0,
      phase: "idle", freeAt: 0, attackedBy: 0, gauge: 0, charge: 0, patIdx: 0,
      mods: [], aura: {}, statuses: [], shield: 0, haste: false, outUntil: 0, knockUntil: 0, lastStand: false,
      revives: 0, onDeath: 0, superUsed: false, actions: 0, specials: 0,
      cnt: { specialReceived: 0, dmgReceived: 0, dmgTaken: 0, healed: 0, dbfReceived: {} },
      dealt: 0, taken: 0, healing: 0, kos: 0, regenNext: 0, qe: [],
    };
  }

  /**
   * Assault Rumble main boss (docs/ASSAULT_RUNS.md, measured 2026-11-24): BossDef.places places in the NEXT queue
   * (Blackbeard 4, Akainu 3), 0 for any other unit. A boss saved before `places` existed: the first unit of a game
   * boss team gets 1 + the deck's additional behavior count.
   */
  private mainBossPlaces(u: U): number {
    if (this.mode !== "assault" || u.side !== "def") return 0;
    const b = u.member.boss;
    if (!b) return 0;
    if (b.places !== undefined) return Math.max(0, Math.floor(b.places));
    return u.slot === 0 && b.game ? 1 + (b.game.additionalBehaviors ?? 0) : 0;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------------------------------------------
  lv(u: U, attr: string): number {
    let l = u.aura[attr] ?? 0;
    for (const m of u.mods) if (m.attr === attr && m.end > this.t) l += m.level;
    return l;
  }
  has(u: U, name: string): boolean {
    for (const s of u.statuses) if (s.name === name && s.end > this.t) return true;
    // "crew members with Stats Down Evasion" / "enemies with Confusion Evasion": an Evade that covers it
    if (name.endsWith(" Evasion")) {
      const what = name.slice(0, -" Evasion".length);
      for (const s of u.statuses) if (s.name === "Evade" && s.end > this.t && evadeCovers(s.attrs, what)) return true;
    }
    return false;
  }
  status(u: U, name: string): Status | undefined {
    for (const s of u.statuses) if (s.name === name && s.end > this.t) return s;
    return undefined;
  }
  private half(u: U, which: string) {
    return this.has(u, "Half Stats") || this.has(u, `Half ${which}`) ? 0.5 : 1;
  }
  /**
   * HP never goes over max HP [user 2026-11-18]. A higher HP level raises the max but not the HP (no free heal; heals
   * can now go up to it); a lower one (a buff ending, an HP down, Half Stats) brings the max down and the HP with it if
   * it was over. Run at every step of the battle (a buff ending is an event) and before each replay frame. The HP up
   * abilities at the start and a unit's first time in from the bench are not affected: they join at their full max.
   */
  capHp() {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const m = this.maxHp(u);
      if (u.hp > m) u.hp = m;
    }
  }
  maxHp(u: U) { return Math.max(1, (u.base.hp + PER_LEVEL.HP * this.lv(u, "HP")) * (TUNE.halfStatsHp && this.has(u, "Half Stats") ? 0.5 : 1)); }
  atk(u: U) { return Math.max(0, (u.base.atk + PER_LEVEL.ATK * this.lv(u, "ATK")) * this.half(u, "ATK")); }
  def(u: U) { return Math.max(0, (u.base.def + PER_LEVEL.DEF * this.lv(u, "DEF")) * this.half(u, "DEF")); }
  rcv(u: U) { return Math.max(0, (u.base.rcv + PER_LEVEL.RCV * this.lv(u, "RCV")) * this.half(u, "RCV")); }
  spd(u: U) { return Math.min(SPD_CAP, this.spdFull(u)); }
  /** SPD with buffs, before the 250 cap: orders units tied at the cap [user 2026-11-11]. */
  spdFull(u: U) { return Math.max(0, (u.base.spd + PER_LEVEL.SPD * this.lv(u, "SPD")) * this.half(u, "SPD")); }
  private chargeNeed(u: U) { return (u.special?.cooldown ?? Infinity) * (1 - (u.keyB?.ct ?? 0)); }
  private ready(u: U) { return !!u.special && u.charge >= this.chargeNeed(u) - 1e-9; }

  // -------------------------------------------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------------------------------------------
  /** Set up the battle start (abilities on, HP full, on-arrival effects); run() calls it. */
  init() {
    if (this.inited) return;
    this.inited = true;
    if (this.o.gameTime) this.cutIn("ability", undefined, "RUMBLE ABILITY ACTIVATED!", CUT[this.speed].start);
    for (const u of this.units) if (u.where === "field") { this.enterInit(u); u.hp = this.maxHp(u); }
    this.refreshAuras();
    for (const u of this.units) if (u.where === "field") { u.hp = this.maxHp(u); this.onArrival(u); }
    this.refreshAuras();
    for (const u of this.units) if (u.where === "field") u.hp = this.maxHp(u);
  }
  /** For the test: a side's burst progress now. */
  burstProgress(side: Side) { return this.gp[side] ? this.gpProgress(side) : undefined; }
  private inited = false;

  run(): SimResult {
    this.init();
    let winner: Side = "def";
    let reason: "wipe" | "timeout" = "timeout";
    // Event-driven on the 1/30 s grid: jump to the next tick where anything can change; gauges grow linearly between.
    let step = 0;
    const last = Math.round(BATTLE_LENGTH / TICK);
    for (;;) {
      this.t = step * TICK;
      if (this.t >= this.nextAura - 1e-9 || this.auraDirty) { this.refreshAuras(); this.nextAura = Math.floor(this.t / AURA_REFRESH + 1e-9) * AURA_REFRESH + AURA_REFRESH; }
      this.capHp();
      const sec = Math.floor(this.t + 1e-9);
      if (sec > this.lastSecond) { this.lastSecond = sec; this.onSecond(); }
      this.benchArrivals();
      this.returnsFromOut();
      this.advanceActions();
      if (this.t >= this.nextBeat - 1e-9) { this.beat(); this.nextBeat += BEAT; }
      if (this.mode === "gp") this.gpStep();
      if (this.koSinceCheck) this.rumbleOuts(); // before the frame, so no frame shows a team with nobody on the field
      if (this.o.frameInterval && this.t >= this.nextFrame - 1e-9) { this.capHp(); this.snapshot(); this.nextFrame += this.o.frameInterval; }
      const w = this.koSinceCheck ? this.wiped() : undefined;
      this.koSinceCheck = false;
      if (w) { winner = w === "def" ? "atk" : "def"; reason = "wipe"; break; }
      if (step >= last) break;
      const next = Math.min(last, Math.max(step + 1, Math.ceil(this.nextEvent() / TICK - 1e-6)));
      this.growGauges((next - step) * TICK);
      step = next;
    }
    // the replay's last frame is the battle's last moment (the final KOs show)
    if (this.o.frameInterval && (this.frames.at(-1)?.t ?? -1) < this.t - 1e-9) this.snapshot();
    this.logOn && this.log("end", `${winner === "atk" ? "Your team" : "The opponent"} wins (${reason === "wipe" ? "all enemies defeated" : "time out"}) at ${this.t.toFixed(1)}s`);
    return {
      winner, reason, time: Math.min(this.t, BATTLE_LENGTH), gameTime: !!this.o.gameTime, realTime: this.t + this.wall,
      cutIns: this.cutIns, events: this.events, frames: this.frames, decisions: this.dice.log ?? [],
      unsupported: this.unsupported,
      timings: Object.fromEntries(this.units.map((u) => [u.uid, { ...u.timing }])),
      units: this.units.map((u) => ({
        uid: u.uid, unitId: u.rec.id, member: u.member, name: u.name, side: u.side, slot: Number(u.uid.slice(1)), hp: u.zeroAt !== undefined ? 0 : Math.max(0, u.hp), maxHp: this.maxHp(u),
        alive: u.where !== "dead" && u.hp > 0, damageDealt: u.dealt, damageTaken: u.taken, healingDone: u.healing,
        actions: u.actions, specials: u.specials, kos: u.kos, ...(u.zeroAt !== undefined ? { zeroAt: u.zeroAt } : {}), ...(u.mainBoss ? { mainBoss: true } : {}),
      })),
      mode: this.mode,
      ...(this.mode === "assault" ? { assault: this.assaultOutcome() } : {}),
      ...(this.mode === "gp" ? { gp: Object.fromEntries(Object.entries(this.gp).map(([s, g]) => [s, { ...g!.res, trace: this.gpTraceEnd(g!) }])) } : {}),
    };
  }

  /** Assault Rumble: the score's parts (src/engine/assault.ts). */
  private assaultOutcome() {
    const bosses = this.sides.def;
    let life = 0;
    for (const u of this.sides.atk) life += u.where === "dead" ? 0 : u.where === "bench" ? this.maxHp(u) : Math.max(0, Math.floor(u.hp));
    return {
      // all damage at the max level; below it only down to 0 HP (user's Lv 4 Blackbeard: 46,065 for 42,658 HP + heals)
      damage: bosses.reduce((s, u) => s + (u.scoreDmg ?? 0), 0),
      life,
      defeated: bosses.length > 0 && bosses.every((u) => u.zeroAt !== undefined || u.where === "dead"),
    };
  }

  // -------------------------------------------------------------------------------------------------------------
  // Grand Party bursts
  // -------------------------------------------------------------------------------------------------------------
  /** The tally a side's burst gauge reads now (the battle clock for time conditions). */
  private gpValue(side: Side): number {
    const g = this.gp[side]!;
    const k = burstProgressKey(g.cond, side);
    if (!k) return 0;
    if (k === "time") return this.t;
    return this.tally[k.side][k.key];
  }
  /** Progress toward the next burst: carried-in charge + what happened since the gauge last emptied. */
  private gpProgress(side: Side): number {
    const g = this.gp[side]!;
    return g.base + this.gpValue(side) - g.mark;
  }
  private gpTraceEnd(g: NonNullable<Battle["gp"]["atk"]>): [number, number][] {
    const tr = [...g.res.trace];
    const side = g.L.side;
    const p = Math.min(this.gpProgress(side), g.need);
    if (!tr.length || tr[tr.length - 1]![0] < this.t) tr.push([this.t, p]);
    return tr;
  }

  /** Each step: note the gauges, launch bursts that are due (full, or at their set times). */
  private gpStep() {
    for (const side of ["atk", "def"] as const) {
      const g = this.gp[side];
      if (!g) continue;
      const p = this.gpProgress(side);
      const shown = Math.min(p, g.need);
      const tr = g.res.trace;
      const last = tr[tr.length - 1];
      if (!last || Math.abs(last[1] - shown) > 1e-9 && (g.cond?.type !== "time" || this.t - last[0] >= 1 - 1e-9 || shown >= g.need)) tr.push([this.t, shown]);
      const full = p >= g.need - 1e-9;
      if (full && !g.readyNoted && g.uses > 0) {
        g.readyNoted = true;
        g.res.readyAt.push(this.t);
        this.logOn && this.log("effect", `${side === "atk" ? "Your" : "The opponent's"} GP burst is ready (${g.L.name})`, g.L);
      }
      if (g.uses <= 0 || !g.burst) continue;
      if (g.launch.mode === "ready" ? full : g.launch.mode === "times" ? !!g.times.length && g.times[0]! <= this.t + 1e-9 : false) {
        if (g.launch.mode === "times") g.times.shift();
        this.fireBurst(side, full);
      }
    }
  }

  /** A GP burst goes off: the leader's burst effects, aimed like a special's (no range); the gauge empties. */
  private fireBurst(side: Side, full: boolean) {
    const g = this.gp[side]!;
    const L = g.L;
    g.uses--;
    g.res.launches.push({ t: this.t, full });
    g.mark = this.gpValue(side);
    g.base = 0;
    g.readyNoted = false;
    g.res.trace.push([this.t, 0]);
    const use = g.res.launches.length;
    const effects = g.burst!.effects;
    const ev = this.logOn ? this.log("burst", `${side === "atk" ? "Your" : "The opponent's"} leader ${L.name} launches the GP burst${full ? "" : " (gauge not full)"}`, L) : undefined;
    if (this.o.gameTime) {
      const c = CUT[this.speed];
      this.cutIn("burst", L.uid, `${L.name}: GP burst`, c.intro + Math.max(1, effects.length) * c.part + c.outro);
    }
    this.fireParts(L, effects, use, undefined, ev, false);
  }

  private get speed() { return this.o.gameSpeed ?? "normal"; }

  private wiped(): Side | undefined {
    // a team loses when nobody is left on the field or bench (Forced Out units are rumbled out first: rumbleOuts)
    for (const s of ["def", "atk"] as const) if (!this.sides[s].some((u) => u.where === "field" || u.where === "bench")) return s;
    return undefined;
  }

  /**
   * The game's emergency rule (user, 2026-11-13): when a team has no unit on the field and at least one Forced Out,
   * all its Forced Out units are KO'd at once ("rumbled out"); the bench then comes in for each vacated tile as after
   * any KO, and a team with no bench has lost. "No unit on the field" counts a KO'd unit whose bench replacement is
   * still on its way as not on the field [interpretation]. Nobody is credited with these KOs [A].
   */
  private rumbleOuts() {
    for (const s of ["atk", "def"] as const) {
      const team = this.sides[s];
      if (team.some((u) => u.where === "field") || !team.some((u) => u.where === "out")) continue;
      const outs = team.filter((u) => u.where === "out");
      this.logOn && this.log("effect", `${s === "atk" ? "Your team" : "The opponent"} has no unit left on the field: ${outs.map((u) => u.uid).join(", ")} (Forced Out) ${outs.length > 1 ? "are" : "is"} rumbled out`);
      for (const u of outs) this.ko(u);
    }
  }

  /** Whole seconds of battle time: special charge steps, regeneration, heal over time (section 10). */
  private onSecond() {
    for (const u of this.units) {
      if (u.where !== "field" || !u.special) continue;
      const rate = Math.max(0.1, 1 + TUNE.ctPerLevel * this.lv(u, "Special CT"));
      u.charge = Math.min(this.chargeNeed(u), u.charge + rate);
    }
    for (const u of this.units) {
      if (u.where !== "field" || u.hp <= 0) continue;
      for (const r of u.resil) if (r.type === "healing" && this.t >= u.regenNext && (!r.condition || this.cond(u, r.condition))) {
        this.heal(u, u, r.amount, "regeneration");
        u.regenNext = this.t + Math.max(1, r.interval || 1) - 1e-9;
      }
      for (const s of u.statuses) if (s.name === "HoT" && s.end > this.t && (s.level ?? 0) <= this.t) {
        this.heal(s.owner ?? u, u, s.amount ?? 0, "heal over time");
        s.level = this.t + (s.pct ?? 1) - 1e-9;
      }
    }
    // tidy expired entries now and then
    if (this.lastSecond % 5 === 0) for (const u of this.units) {
      u.mods = u.mods.filter((m) => m.end > this.t);
      u.statuses = u.statuses.filter((s) => s.end > this.t);
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Turn order (section 4)
  // -------------------------------------------------------------------------------------------------------------
  free(u: U): boolean {
    return u.where === "field" && u.hp > 0 && u.phase === "idle" && this.t >= u.freeAt - 1e-9 && u.attackedBy === 0
      && !this.has(u, "Action Bind") && this.t >= u.knockUntil - 1e-9 && !u.lastStand;
  }
  private rate(u: U) {
    const s = this.spdFull(u);
    return Math.max(0, 100 + 0.86 * (Math.min(QUEUE.rateCap, s) - 100));
  }

  private growGauges(dt: number) {
    for (const u of this.units) {
      if (u.extra ? !this.placesGrow(u) : !this.free(u)) continue;
      const g = this.rate(u) * dt;
      u.gauge += g;
      if (u.extra) for (let k = 0; k < u.extra.length; k++) u.extra[k]! += g;
    }
  }
  /**
   * A main boss's places keep filling while it acts or is under attack: in the videos its places stay in the NEXT
   * column (often on top) while it attacks, and it starts a turn at about every beat it is free [M 2026-11-24]. They
   * stop like any gauge while it is Action Bound, flying back from a knock-back, or waiting on a death special.
   */
  private placesGrow(u: U) {
    return u.where === "field" && u.hp > 0 && !u.lastStand && !this.has(u, "Action Bind") && this.t >= u.knockUntil - 1e-9;
  }
  private gaugeOf(e: QE) { return e.k === 0 ? e.u.gauge : e.u.extra![e.k - 1]!; }
  /** Every NEXT place of the units. */
  private places(units: U[]): QE[] { const out: QE[] = []; for (const u of units) for (const e of u.qe) out.push(e); return out; }

  /** Earliest time after now at which anything can change: phases, statuses, buffs, beats, seconds, entries. */
  private nextEvent(): number {
    const t = this.t + 1e-9;
    let n = Math.min(this.nextBeat, this.nextAura, this.lastSecond + 1);
    if (this.o.frameInterval) n = Math.min(n, this.nextFrame);
    for (const p of this.pendingBench) if (p.t < n) n = p.t;
    const at = (x: number) => { if (x > t && x < n) n = x; };
    for (const g of Object.values(this.gp)) { if (g!.times.length && g!.uses > 0) at(g!.times[0]!); if (g!.cond?.type === "time") at(g!.mark + g!.need - g!.base); }
    for (const u of this.units) {
      if (u.where === "out") { at(u.outUntil); continue; }
      if (u.where !== "field") continue;
      at(u.t1); at(u.freeAt); at(u.knockUntil);
      const a = u.act;
      if (a) { if (a.dotAt !== undefined) at(a.dotAt); at(a.arrive); if (!a.hit) at(a.hitAt); at(a.leaveAt); }
      for (const m of u.mods) at(m.end);
      for (const st of u.statuses) at(st.end);
    }
    return n;
  }

  private order = (a: U, b: U) => (a.side === b.side ? a.slot - b.slot : a.side === "atk" ? -1 : 1);
  /** The queue's tie rule: the battle's first pick by raw SPD (key included, no buffs), later by SPD over the cap read
   *  at the previous beat; then your team first, lower slot. */
  private tied = (a: U, b: U) => this.tieOf(b) - this.tieOf(a) || this.order(a, b);
  private tieOf(u: U) { return this.beats === 0 ? u.base.spd : this.tieSpd.get(u) ?? this.spdFull(u); }
  /** Units waiting on their death special that haven't set off yet, in the queue's tie order (first = next to go). */
  private waiting(): U[] { return this.units.filter((u) => u.lastStand && u.where === "field" && !u.act).sort(this.tied); }

  private beat() {
    // Action Bind: a bound unit is off the NEXT queue until the first beat where it is no longer bound [user 2026-11-18]
    for (const u of this.units) u.boundAtBeat = this.has(u, "Action Bind");
    // a team already has no unit left (field, bench or Forced Out): the battle ends at this tick's wipe check, no turn
    if (this.koSinceCheck && (["atk", "def"] as const).some((s) => !this.sides[s].some((u) => u.where === "field" || u.where === "bench" || u.where === "out"))) return;
    // Ties (equal gauges): the very first pick by raw SPD (key included, no buffs); later by SPD over the cap
    // [user 2026-11-11]; then your team first, lower slot.
    // The tie SPD is read at the previous beat [LIKELY, run 9: Shanks goes 2nd although Imu's bind at 0 s has
    // lowered his SPD]: the order for the next beat is settled before the effects of this beat's action land.
    const tied = this.tied;
    // 1. units waiting on their death special (On Death): locked at the top, tied there, so in the queue's tie order
    //    [user 2026-11-17]. The first one goes; if it has no enemy to aim at, EVERYONE waits: no other pick this beat,
    //    neither the next waiting unit nor the regular queue [user 2026-11-17]. (Units already acting finish as usual,
    //    so an enemy frees up, or deathTarget's last resort applies once nothing on the field can change.)
    const stands = this.waiting();
    if (stands.length) { this.deathTurn(stands[0]!); return; }
    const free = this.places(this.units.filter((u) => this.free(u)));
    // 2. Haste, 3. the gauge, then the tie rule (a main boss's places: in their order)
    free.sort((a, b) => (a.u.haste !== b.u.haste ? (a.u.haste ? -1 : 1)
      : Math.abs(this.gaugeOf(b) - this.gaugeOf(a)) > 1e-6 ? this.gaugeOf(b) - this.gaugeOf(a) : a.u === b.u ? a.k - b.k : tied(a.u, b.u)));
    this.beats++;
    for (const u of this.units) this.tieSpd.set(u, this.spdFull(u));
    if (QUEUE.pick === "projList") {
      const listed = this.lockedList.filter((x) => free.includes(x));
      free.splice(0, free.length, ...listed, ...free.filter((x) => !listed.includes(x)));
    }
    const failed = new Set<U>();
    for (const e of free) {
      if (failed.has(e.u)) continue;
      const own = e.u.gauge;
      if (this.startAction(e.u)) {
        // one of a main boss's extra places: that place starts over, the others keep their gauge
        if (e.k > 0) { e.u.extra![e.k - 1] = 0; e.u.gauge = own; }
        break;
      }
      failed.add(e.u);
    }
    if (QUEUE.pick !== "projList") return;
    this.lockedList = this.projectedOrder();
    const next = this.nextColumn().find((x) => this.free(x));
    if (next) this.logOn && this.log("wait", `next up: ${next.uid} (NEXT: ${this.nextColumn().slice(0, 5).map((x) => `${x.uid} ${Math.round(x.gauge + this.rate(x))}`).join(", ")})`);
  }
  private lockedList: QE[] = [];

  /** In the NEXT column: on the field, not acting (a main boss: its places stay there while it acts), not bound. */
  private inColumn(u: U) {
    return u.where === "field" && u.hp > 0 && !u.lastStand && (!!u.mainBoss || (!u.act && u.phase === "idle")) && !this.queueHidden(u);
  }
  /** The places in order of gauge + `horizon` s of growth (only for gauges that `grow`). */
  private columnOrder(grow: (u: U) => boolean): QE[] {
    const proj = (e: QE) => this.gaugeOf(e) + (grow(e.u) ? this.rate(e.u) * QUEUE.horizon : 0);
    return this.places(this.units.filter((u) => this.inColumn(u)))
      .sort((a, b) => (a.u.haste !== b.u.haste ? (a.u.haste ? -1 : 1) : proj(b) - proj(a) || (a.u === b.u ? a.k - b.k : this.order(a.u, b.u))));
  }
  private projectedOrder(): QE[] {
    // (an Action Bound unit keeps its gauge: it stops growing while bound, free() is false; it is off the list until a
    // beat finds it unbound, then back in its place [user 2026-11-18])
    return this.columnOrder((u) => (u.extra ? this.placesGrow(u) : this.free(u)));
  }
  /** Off the NEXT queue: Action Bound now, or bound at the last beat (it shows again from the first beat it's free). */
  private queueHidden(u: U): boolean { return !!u.boundAtBeat || this.has(u, "Action Bind"); }
  /** The NEXT column: units waiting on their death special first (until they set off), in the queue's tie order [user
   *  2026-11-17]; then units on the field not acting (being attacked included), by gauge + 1 s of own growth [M]. */
  nextColumn(): U[] {
    return [...this.waiting(), ...this.columnOrder(() => true).map((e) => e.u)];
  }

  /** `death`: a death special's target (deathTurn): the unit goes up to it and fires, as for any special. */
  private startAction(u: U, death?: U): boolean {
    const confused = !death && this.has(u, "Confusion");
    const step = u.pattern[u.patIdx % u.pattern.length]!;
    let kind: Action["kind"] = "attack";
    let type: Action["type"] = "Normal";
    let target: U | undefined;
    let heal: Action["heal"];
    let range: number | undefined;
    if (death) {
      kind = "special";
      target = death;
    } else if (confused) {
      target = this.closestMate(u);
      // full bar, or no teammate to hit: no attack; one tile back toward its own side and the bar is emptied [user 2026-11-13]
      // (under Special Bind a full bar can't fire, so it counts as not full: the unit attacks and keeps the bar [user])
      if ((this.ready(u) && !this.has(u, "Special Bind")) || !target) { this.confusedKnockBack(u); return true; }
      kind = "confused";
      type = step.action === "attack" ? step.type : "Normal";
    } else if (this.ready(u) && !this.has(u, "Special Bind")) {
      kind = "special";
      target = this.chooseTarget(u);
      if (!target) return false;
    } else if (step.action === "heal") {
      if (step.area === "Self" && u.hp >= this.maxHp(u) - 1e-9) {
        target = this.chooseTarget(u); // a self-heal at full HP becomes a Normal attack [L]
        if (!target) return false;
      } else {
        kind = "heal";
        heal = step;
        target = step.area === "Self" ? u : this.side(u.side).filter((m) => m !== u && this.free(m))
          .sort((a, b) => a.hp / this.maxHp(a) - b.hp / this.maxHp(b) || this.order(a, b))[0] ?? u;
      }
    } else {
      type = step.type;
      // An Assault Rumble boss's range attack [C user 2026-11-24, Akainu]: it picks a target and walks up to it like a
      // normal attack, then the hit lands on every enemy within range of it, with no Damage over Time or Paralysis
      // check, and it walks back; same timings as a normal attack.
      if (step.range) range = TUNE.bossRange[step.range];
      target = this.chooseTarget(u);
      if (!target) return false;
    }
    // Paralysis: picked for a regular attack, it stays where it is (no move, no hit) [user 2026-11-18]. A full special,
    // a Confused attack on a teammate, a heal and a boss's range attack still go ahead.
    if (kind === "attack" && range === undefined && this.has(u, "Paralysis")) return this.paralyzedTurn(u);
    // Where to stand
    let tile: Vec;
    let cell: Cell | undefined;
    let cellSide: Side = u.side;
    if (kind === "heal") {
      const back = u.side === "atk" ? -1 : 1;
      tile = target === u ? u.pos : { x: target.pos.x + back * TUNE.healBehind, y: target.pos.y };
    } else {
      cellSide = kind === "confused" ? other(u.side) : u.side;
      const spot = this.attackSpot(u, target, cellSide);
      // (a death special aimed at an enemy that is itself waiting, deathTarget's last resort, has no such check: with
      // no free tile in front of it the special goes off from where the unit stands [interpretation])
      if (!spot && !death) return false;
      tile = spot ? spot.pos : { ...u.pos };
      cell = spot?.cell;
      if (kind === "special" && QUEUE.specialReach > 0) {
        // a special goes off on coming within ~100-130 px of its target, wherever that is [M, Luffy 2087]
        const dx = target.pos.x - u.pos.x, dy = target.pos.y - u.pos.y, d0 = Math.hypot(dx, dy);
        const go = Math.max(0, d0 - QUEUE.specialReach);
        tile = d0 > 0 ? { x: u.pos.x + (dx / d0) * go, y: u.pos.y + (dy / d0) * go } : { ...u.pos };
        cell = undefined;
      }
    }
    u.gauge = 0;
    u.haste = false;
    u.actions++;
    const n = ++this.attackN;
    const d = dist(u.pos, tile);
    // The action has started at the pick: the unit is busy, its target already locked (attackedBy) [interpretation].
    // Full attack: TUNE.fullExtra standing still while the game shows its "Full Attack" graphic, then it sets off; the
    // attack itself (wind-up, stay) is a Normal one [C user 2026-11-17].
    // Damage over Time (regular actions, not a special): the unit walks up as usual, takes the tick on arriving and is
    // stunned there for TUNE.dotWait, then attacks / heals; a special charged during the stun waits for its next turn
    // [user 2026-11-18].
    const wait = kind !== "special" && range === undefined && this.dotLevel(u) > 0 ? TUNE.dotWait : 0;
    const full = type === "Full" && kind !== "special" && kind !== "heal" ? TUNE.fullExtra : 0;
    const start = this.t + full;
    const arrive = start + (d > 1 ? d / TUNE.walkOut : 0);
    const go = arrive + wait; // the action proper starts after the stun
    const act: Action = {
      kind, target, type, heal, tile, cell, cellSide, n, hit: false, arrive,
      hitAt: kind === "special" ? arrive : kind === "heal" ? go + TUNE.healAnim / 2 : go + u.timing.windup,
      leaveAt: kind === "special" ? arrive : kind === "heal" ? go + TUNE.healAnim : go + u.timing.stay,
      ...(wait > 0 ? { dotAt: arrive, dotEnd: go } : {}),
      ...(death ? { death: true } : {}),
      ...(range !== undefined ? { range } : {}),
    };
    u.act = act;
    u.phase = "toAttack";
    this.moveTo(u, tile, start, arrive);
    if (kind !== "heal") { target.attackedBy++; u.lastTarget = target; }
    if (kind !== "special" && kind !== "heal") u.patIdx++;
    else if (kind === "heal") u.patIdx++;
    this.logOn && this.log("action", `${u.uid} ${u.name}: ${death ? "death special" : kind === "special" ? "special" : kind === "heal" ? `heal (${heal!.area} lv${heal!.level})` : `${range !== undefined && step.action === "attack" ? `${step.range} Range ` : ""}${type} attack${kind === "confused" ? " (Confused)" : ""}`} -> ${target.uid} ${target.name}`, u, target);
    return true;
  }

  /** Enemies on the field within `r` px of the unit, nearest first. */
  private enemiesWithin(u: U, r: number): U[] {
    return this.sides[other(u.side)].filter((e) => this.onField(e) && dist(u.pos, e.pos) <= r)
      .sort((a, b) => dist(u.pos, a.pos) - dist(u.pos, b.pos) || this.order(a, b));
  }

  private moveTo(u: U, to: Vec, t0: number, t1: number) {
    u.from = { ...u.pos };
    u.to = { ...to };
    u.t0 = t0;
    u.t1 = Math.max(t0, t1);
  }
  private updatePos(u: U) {
    if (u.t1 <= u.t0 || this.t >= u.t1) { u.pos.x = u.to.x; u.pos.y = u.to.y; return; }
    if (this.t <= u.t0) return;
    const f = (this.t - u.t0) / (u.t1 - u.t0);
    u.pos.x = u.from.x + (u.to.x - u.from.x) * f;
    u.pos.y = u.from.y + (u.to.y - u.from.y) * f;
  }

  private advanceActions() {
    for (const u of this.units) {
      if (u.where !== "field") continue;
      this.updatePos(u);
      const a = u.act;
      if (!a) {
        if (u.phase === "back" && this.t >= u.t1) { u.phase = "idle"; u.freeAt = this.t + TUNE.homeSettle; }
        continue;
      }
      if (a.kind === "special") {
        if (this.t >= a.arrive) {
          this.release(u);
          if (a.death) { this.deathFires(u, a.target); continue; }
          const isSuper = this.superReady(u);
          this.fireSpecial(u, a.target, isSuper);
          this.goHome(u, u.from); // heads straight back to where it set out from [M]
        }
        continue;
      }
      if (a.dotAt !== undefined && this.t >= a.dotAt - 1e-9) {
        a.dotAt = undefined;
        this.tickDot(u);
        if (u.where !== "field" || u.act !== a) continue; // KO'd (or a last stand): the action never happens
      }
      if (!a.hit && this.t >= a.hitAt) {
        a.hit = true;
        if (a.kind === "heal") this.doHeal(u, a);
        else if (a.range !== undefined) {
          // the unit it walked up to, and every other enemy within range of the boss (the attack spot is the boss's
          // reach in front of the target, which can be a little more than the range) [A]
          const hit = this.enemiesWithin(u, a.range);
          if (this.onField(a.target) && !hit.includes(a.target)) hit.unshift(a.target);
          for (const e of hit) { if (u.where !== "field") break; this.doHit(u, { ...a, target: e }, `@${e.uid}`); }
        }
        else this.doHit(u, a);
        if (u.where !== "field") continue;
      }
      if (this.t >= a.leaveAt) {
        this.release(u);
        if (a.kind === "heal") { u.home = { ...u.pos }; u.phase = "idle"; u.freeAt = this.t + TUNE.homeSettle; }
        else this.goHome(u, this.returnTile(u, a));
      }
    }
  }

  /** The attacker heads back: its target is free again. */
  private release(u: U) {
    const a = u.act;
    if (!a) return;
    if (a.kind !== "heal" && !a.released) a.target.attackedBy = Math.max(0, a.target.attackedBy - 1);
    u.act = undefined;
  }
  private goHome(u: U, to: Vec) {
    const d = dist(u.pos, to);
    if (d < 1) { u.phase = "idle"; u.freeAt = this.t; return; } // never moved (special on the spot)
    u.phase = "back";
    this.moveTo(u, to, this.t, this.t + d / TUNE.walkBack);
    u.home = { ...to };
    u.homeCell = nearestCell(u.side, to);
  }

  /**
   * Return tile: two rows back, 1-3 tiles behind the attack tile, at random among the free ones (dice stream). "Back"
   * is the unit's own way even after a Confused attack made from the enemy side of its teammate: it steps back as if
   * it had just attacked an enemy from that tile [user 2026-11-18].
   */
  private returnTile(u: U, a: Action): Vec {
    const side = a.kind === "confused" ? u.side : a.cellSide;
    const c = side === a.cellSide && a.cell ? a.cell : nearestCell(side, a.tile);
    const opts: Vec[] = [];
    for (const k of [1, 2, 3]) {
      const p = cellPos(side, { i: c.i - k, j: c.j + RETURN_ROWS });
      if (inField(p) && !this.tileTaken(p, u)) opts.push(p);
    }
    if (!opts.length) {
      for (const cc of cellsNear(side, cellPos(side, { i: c.i - 2, j: c.j + RETURN_ROWS }), 3)) {
        const p = cellPos(side, cc);
        if (!this.tileTaken(p, u)) return p;
      }
      return u.home;
    }
    return opts[this.dice.choose("dice", u.key, u.uid, "return", opts.length, u.actions)]!;
  }

  /** Free tile of `side`'s grid nearest the point (2 tiles around), or undefined. */
  private nearestFreeTile(side: Side, p: Vec, self: U): { pos: Vec; cell: Cell } | undefined {
    const c0 = nearestCell(side, p);
    const cand = this.tileBuf;
    cand.length = 0;
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
      const cell = { i: c0.i + di, j: c0.j + dj };
      const q = cellPos(side, cell);
      if (inField(q)) cand.push({ pos: q, cell, d: dist(q, p) });
    }
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand) if (!this.tileTaken(c.pos, self)) return c;
    return undefined;
  }
  private readonly tileBuf: { pos: Vec; cell: Cell; d: number }[] = [];

  private tileTaken(p: Vec, self?: U): boolean {
    for (const o of this.units) {
      if (o === self || o.where !== "field") continue;
      if (dist(o.to, p) < TILE_TAKEN || dist(o.pos, p) < TILE_TAKEN) return true;
    }
    return false;
  }

  /** Free tile nearest the point `reach` in front of the target (section 5, 9). */
  private attackSpot(u: U, target: U, cellSide: Side): { pos: Vec; cell: Cell } | undefined {
    // the free tile nearest the point `reach` in front of the target AT ITS HEIGHT, on the attacker's side: attacker and
    // target end up roughly level ("parallel"), as in the game (handoff section 5; appendix D "Attack tile")
    const dir = cellSide === "atk" ? -1 : 1;
    const p = { x: target.pos.x + dir * u.timing.reach, y: target.pos.y };
    return this.nearestFreeTile(cellSide, p, u);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Targets (section 5)
  // -------------------------------------------------------------------------------------------------------------
  side(s: Side) { return this.sides[s]; }
  private onField(u: U) { return u.where === "field" && u.hp > 0 && !u.lastStand; }

  /** `anyTile`: a death special's last resort (deathTarget): the first in the order even with no free tile in front. */
  private chooseTarget(u: U, anyTile = false): U | undefined {
    const enemies = this.sides[other(u.side)];
    const provokers = enemies.filter((e) => this.onField(e) && this.has(e, "Provoke"));
    // (an Assault Rumble main boss can be attacked by several at once [M 2026-11-24], still only while it is idle)
    const pool = (provokers.length ? provokers : enemies).filter((e) => this.onField(e) && e.phase === "idle" && this.t >= e.freeAt - 1e-9 ? e.attackedBy === 0 || !!e.mainBoss : false);
    if (!pool.length) return undefined;
    const crit = u.targetRule.criteria;
    let order: U[];
    if (crit === "near" || !crit) {
      order = pool.sort((a, b) => dist(u.pos, a.pos) - dist(u.pos, b.pos));
      // [L] first the enemy that last attacked it, else the one it attacked last
      if (u.lastTarget && pool.includes(u.lastTarget)) order = [u.lastTarget, ...order];
      if (u.lastAttacker && pool.includes(u.lastAttacker)) order = [u.lastAttacker, ...order];
    } else {
      const sign = u.targetRule.comparator === "lowest" ? 1 : -1;
      order = pool.sort((a, b) => sign * (this.statOf(a, crit) - this.statOf(b, crit)) || dist(u.pos, a.pos) - dist(u.pos, b.pos));
    }
    // an enemy whose front tile is off the field (or taken) can't be targeted
    for (const e of order) if (this.attackSpot(u, e, u.side)) return e;
    return anyTile ? order[0] : undefined;
  }

  /** Closest teammate free to be attacked, by the same rule an enemy attacker needs (idle, settled, not already under
   *  attack, a free attack tile in front of it on the enemy side) [user 2026-11-13]. */
  private closestMate(u: U): U | undefined {
    const pool = this.sides[u.side].filter((m) => m !== u && this.onField(m) && m.phase === "idle" && this.t >= m.freeAt - 1e-9 && m.attackedBy === 0)
      .sort((a, b) => dist(u.pos, a.pos) - dist(u.pos, b.pos));
    for (const m of pool) if (this.attackSpot(u, m, other(u.side))) return m;
    return undefined;
  }

  statOf(u: U, stat: string): number {
    switch (stat) {
      case "HP": return u.hp;
      case "ATK": return this.atk(u);
      case "DEF": return this.def(u);
      case "SPD": return this.spd(u);
      case "RCV": return this.rcv(u);
      case "Special CT": return u.special ? u.charge / this.chargeNeed(u) : 0;
      default: return 0;
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Regular hits (sections 6, 7)
  // -------------------------------------------------------------------------------------------------------------
  /** `tag`: a range attack's target (its own guard / miss / crit / blow rolls). */
  private doHit(u: U, a: Action, tag = "") {
    const tgt = a.target;
    const n = u.actions;
    const guard = this.dice.chance("dice", u.key, u.uid, "guard" + tag, clamp01(TUNE.base.guard + TUNE.chancePerLevel * this.lv(tgt, "Guard")), n);
    const miss = !guard && this.dice.chance("dice", u.key, u.uid, "miss" + tag, clamp01(TUNE.base.miss - TUNE.missPerLevel * this.lv(u, "Accuracy")), n);
    if (miss) { this.logOn && this.log("miss", `${u.uid} misses ${tgt.uid}`, u, tgt); return; }
    if (this.mode === "gp") {
      this.count(u.side, "attacks");
      this.count(u.side, a.type === "Full" ? "attacksFull" : a.type === "Power" ? "attacksPower" : "attacksNormal");
    }
    const crit = this.dice.chance("dice", u.key, u.uid, "crit" + tag, clamp01(TUNE.base.crit + TUNE.chancePerLevel * this.lv(u, "Critical Hit")), n);
    const alive = tgt.where === "field" && tgt.hp > 0;
    if (crit) this.trigger(u, "Critical Hit");
    if (guard) this.trigger(tgt, "Guard");
    if (this.mode === "gp") { if (crit) this.count(u.side, "crits"); if (guard) this.count(tgt.side, "guards"); }
    this.trigger(u, "hit");
    if (!alive) { this.logOn && this.log("hit", `${u.uid}'s attack lands on the fallen ${tgt.uid}`, u, tgt); return; }
    const { raw, dmg } = this.regularDamage(u, tgt, a.type, crit, guard);
    this.logOn && this.log("hit", `${u.uid} ${a.type}${crit ? " CRIT" : ""}${guard ? " (guarded)" : ""} -> ${tgt.uid}: ${fmt(dmg)}${tgt.shield > 0 ? " (into Shield)" : ""}`, u, tgt, dmg);
    this.damage(u, tgt, dmg, { regular: true, raw, ignoresDef: false });
    // Blow Away (not on a guarded hit [A])
    if ((!guard || QUEUE.guardedBlowAway) && tgt.where === "field" && tgt.hp > 0 && !tgt.lastStand &&
        this.dice.chance("dice", u.key, u.uid, "blow" + tag, clamp01(TUNE.base.blow + TUNE.chancePerLevel * this.lv(u, "Blow Away")), n)) {
      this.knockBack(u, tgt, n);
      this.trigger(u, "Blow Away");
      if (this.mode === "gp") this.count(u.side, "blowAways");
    }
  }

  /** A regular hit's damage before Shield / Reflect (section 7). Public for the formula checks. */
  regularDamage(u: U, tgt: U, type: keyof typeof TYPE_MULT, crit: boolean, guard: boolean) {
    const raw = Math.floor(this.atk(u) * TYPE_MULT[type] * (crit ? 1.5 : 1));
    const dmg = this.factors(u, tgt, Math.floor(raw / (1 + (this.def(tgt) * (guard ? 2 : 1)) ** 2 / DEF_K)));
    return { raw, dmg };
  }
  /** ATK-based special damage (section 7): floor(ATK x amount) / DEF curve, then the same factors. */
  specialDamage(u: U, tgt: U, amount: number, defbypass = false) {
    const raw = Math.floor(this.atk(u) * amount);
    return this.factors(u, tgt, defbypass ? raw : Math.floor(raw / (1 + this.def(tgt) ** 2 / DEF_K)));
  }
  unit(uid: string) { return this.units.find((u) => u.uid === uid)!; }
  /** Test hook: add buff levels / statuses as if an effect had landed. */
  addMod(u: U, attr: string, level: number, dur = Infinity) { u.mods.push({ attr, level, end: this.t + dur }); }
  addStatusFor(u: U, name: string, dur = Infinity) { u.statuses.push({ name, end: this.t + dur }); if (name === "Ability Bind") { this.dropOwned(u); this.refreshAuras(); } }

  /** Percentage factors after the DEF step, flooring after each (section 7). */
  private factors(src: U, tgt: U, d: number): number {
    for (const r of this.rules) {
      if (r.effect.kind === "buff" || !ruleActive(r, this.t, BATTLE_LENGTH)) continue;
      if (r.effect.kind === "damage" && this.rulesOf(src).includes(r)) d = Math.floor(d * (1 + r.effect.percent / 100));
      else if (r.effect.kind === "taken" && this.rulesOf(tgt).includes(r)) d = Math.floor(d * (1 + r.effect.percent / 100));
      else if (r.effect.kind === "both") {
        if (this.rulesOf(src).includes(r)) d = Math.floor(d * (1 + r.effect.percent / 100));
        if (this.rulesOf(tgt).includes(r)) d = Math.floor(d * (1 - r.effect.percent / 100));
      }
    }
    let resist = 1;
    for (const r of tgt.resil) if (r.type === "damage" && matchesAttr(src, r.attribute)) resist *= 1 - r.percentage / 100;
    // Rumble key: damage taken from (and dealt to) the color / class pair of the game's key ability [C data]; units
    // without the game's data: against what their damage resilience names. Multiplies with the resilience [L].
    if (tgt.keyB?.taken && (tgt.keyB.vs ? tgt.keyB.vs.some((a) => matchesAttr(src, a)) : resist !== 1)) resist *= 1 - tgt.keyB.taken;
    if (resist !== 1) d = Math.floor(d * resist);
    for (const r of src.resil) if (r.type === "dmgboost" && matchesAttr(tgt, r.attribute)) d = Math.floor(d * r.amount);
    if (src.keyB?.dealt && keyVs(src, tgt)) d = Math.floor(d * (1 + src.keyB.dealt));
    return d;
  }

  /**
   * Paralysis [user 2026-11-18]: picked for a regular attack, the unit doesn't move or hit; it stands where it is for
   * as long as a Damage over Time stun (TUNE.dotWait) and its place in the queue starts over (gauge 0). With Damage
   * over Time on too, the tick lands now; the turn uses up its step of the attack pattern, so a heal every few hits
   * still comes when due [user 2026-11-18].
   */
  private paralyzedTurn(u: U): boolean {
    u.gauge = 0;
    u.haste = false;
    u.actions++;
    u.patIdx++;
    u.paralyzedUntil = this.t + TUNE.dotWait;
    u.freeAt = Math.max(u.freeAt, u.paralyzedUntil);
    this.logOn && this.log("paralyzed", `${u.uid} ${u.name} is paralyzed: stays in place`, u);
    this.tickDot(u);
    return true;
  }

  /** Summed Damage over Time level, capped at TUNE.dotMaxLevel. */
  dotLevel(u: U): number {
    let level = 0;
    for (const s of u.statuses) if (s.name === "Damage Over Time" && s.end > this.t) level += s.level ?? 1;
    return Math.min(TUNE.dotMaxLevel, level);
  }
  /** The Damage over Time tick, taken in the wait before a regular action (startAction / advanceActions). */
  private tickDot(u: U) {
    const level = this.dotLevel(u);
    if (level <= 0) return;
    const dmg = Math.floor(this.maxHp(u) * TUNE.dotPerLevel * level);
    this.logOn && this.log("effect", `${u.uid} takes ${fmt(dmg)} Damage over Time`, u, u, dmg);
    this.damage(undefined, u, dmg, { regular: false, raw: dmg, ignoresDef: true, kind: "Damage Over Time" });
  }

  private knockBack(src: U, tgt: U, n: number) {
    const c = nearestCell(tgt.side, tgt.home);
    const one = this.dice.chance("dice", src.key, src.uid, "knockOne", TUNE.knockOneTile, n);
    const cands = one ? [{ i: c.i - 1, j: c.j }] : [{ i: c.i - 2, j: c.j + RETURN_ROWS }, { i: c.i - 1, j: c.j + RETURN_ROWS }, { i: c.i - 3, j: c.j + RETURN_ROWS }];
    let dest = tgt.pos;
    for (const cc of cands) { const p = cellPos(tgt.side, cc); if (inField(p)) { dest = p; break; } }
    this.knockTo(tgt, dest);
    // a knock-back frees the target from the attack: it no longer counts as under attack (run 3: Buggy goes while the
    // Pacifista that blew him away is still in its stay) [L]
    if (src.act && src.act.target === tgt && !src.act.released) { src.act.released = true; tgt.attackedBy = Math.max(0, tgt.attackedBy - 1); }
    this.logOn && this.log("effect", `${tgt.uid} is blown away`, src, tgt);
  }
  /** The knock-back move: 0.2 s slide, new home, then the usual stop (TUNE.knockStun). */
  private knockTo(tgt: U, dest: Vec) {
    this.moveTo(tgt, dest, this.t, this.t + 0.2);
    tgt.home = { ...dest };
    tgt.knockUntil = this.t + TUNE.knockStun;
  }
  /** A Confused unit with a full bar, or with no teammate on the field, does not attack: it is knocked back one tile
   *  toward its own side (no dice) and its special charge is emptied; its turn is used up [user 2026-11-13]. No tile
   *  free there: it stays put (still stopped for TUNE.knockStun), still losing the charge and the turn [interpretation].
   *  No Damage over Time wait or tick: that only comes with a regular action. */
  private confusedKnockBack(u: U) {
    u.gauge = 0;
    u.haste = false;
    u.charge = 0;
    const c = nearestCell(u.side, u.home);
    const p = cellPos(u.side, { i: c.i - 1, j: c.j });
    const moved = inField(p) && !this.tileTaken(p, u);
    this.knockTo(u, moved ? p : { ...u.pos });
    this.logOn && this.log("effect", `${u.uid} is Confused: ${moved ? "knocked back" : "no free tile behind, stays put"}, special charge lost`, u, u);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Damage, KO, healing
  // -------------------------------------------------------------------------------------------------------------
  private damage(src: U | undefined, tgt: U, dmg: number, o: { regular: boolean; raw: number; ignoresDef: boolean; kind?: string; special?: boolean }) {
    if (tgt.where !== "field" || tgt.hp <= 0 || dmg <= 0) return;
    // Damage Reflect: takes less, sends a multiple back (not for DEF-ignoring damage) [C]
    const refl = !o.ignoresDef ? this.status(tgt, "Damage Reflect") : undefined;
    if (refl) dmg = Math.floor(dmg * (1 - (refl.pct ?? 0) / 100));
    if (!o.ignoresDef && tgt.shield > 0) {
      if (dmg >= tgt.shield) { tgt.shield = 0; this.logOn && this.log("effect", `${tgt.uid}'s Shield breaks`, tgt); }
      else tgt.shield -= dmg;
      dmg = 0;
    }
    if (dmg > 0 && tgt.zeroAt !== undefined) dmg = Math.floor(dmg * this.zeroMult); // Assault Rumble: a boss at 0 HP takes more
    if (dmg > 0) {
      // a unit waiting on its death special can't fall below 1 HP (user, 2026-11-14)
      const lost = tgt.lastStand ? Math.min(dmg, Math.max(0, tgt.hp - 1)) : dmg;
      if (this.mode === "assault" && tgt.side === "def") tgt.scoreDmg = (tgt.scoreDmg ?? 0) + (this.boss(tgt) ? lost : Math.min(lost, Math.max(0, tgt.hp)));
      tgt.hp -= lost;
      tgt.taken += lost;
      if (src) src.dealt += lost;
      if (this.mode === "gp") {
        this.count(tgt.side, "dmgReceived", lost);
        if (src && src.side !== tgt.side) { this.count(tgt.side, "hitsReceived"); this.count(src.side, "dmgDealt", lost); this.count(src.side, "hitsDealt"); }
      }
      tgt.cnt.dmgReceived++;
      tgt.cnt.dmgTaken += lost;
      if (src) tgt.lastAttacker = src.side !== tgt.side ? src : tgt.lastAttacker;
      this.trigger(tgt, "takes damage");
    }
    if (src && src !== tgt && src.side !== tgt.side) {
      const back = (mult: number) => {
        if (src.where !== "field" || src.hp <= 0) return;
        const d = Math.floor(Math.floor(o.raw * mult) / (1 + this.def(src) ** 2 / DEF_K));
        this.logOn && this.log("effect", `${tgt.uid} sends ${fmt(d)} back to ${src.uid}`, tgt, src, d);
        this.damage(undefined, src, d, { regular: false, raw: d, ignoresDef: true });
      };
      if (refl && (refl.amount ?? 0) > 0) back(refl.amount!);
      const ctr = o.regular ? this.status(tgt, "Counter") : undefined;
      if (ctr) back(ctr.amount ?? 1);
    }
    if (tgt.hp <= 0 && this.boss(tgt)) {
      // Assault Rumble (max assault level): a boss at 0 HP stays on the field and keeps acting; all damage still counts
      tgt.hp = ZERO_HP;
      if (tgt.zeroAt === undefined) {
        tgt.zeroAt = this.t;
        this.auraDirty = true;
        this.logOn && this.log("effect", `${tgt.uid} ${tgt.name} is at 0 HP: it stays in the battle and now takes ${Math.round((this.zeroMult - 1) * 100)}% more damage`, src, tgt);
      }
      return;
    }
    if (tgt.hp <= 0 && !tgt.lastStand) this.zeroHp(tgt, src);
  }

  /**
   * On Death (user, 2026-11-14): a unit with a death special that would be KO'd stays at exactly 1 HP, waiting. It is
   * not attackable, its HP can't fall below 1, it counts as alive, and it is first in the queue from then on: at the
   * next beat with an enemy to aim at it sets off for it like any special (deathTurn) [user 2026-11-17]. Revive comes
   * after the death special (kept from before).
   */
  private zeroHp(u: U, by?: U) {
    if (u.onDeath > 0 && !u.lastStand) {
      u.onDeath--;
      u.hp = 1;
      u.lastStand = true;
      u.charge = this.chargeNeed(u);
      this.release(u);
      u.act = undefined;
      if (u.phase === "toAttack") this.goHome(u, u.home); // an action it had started is dropped
      this.auraDirty = true; // HP-conditioned abilities
      this.logOn && this.log("effect", `${u.uid} is waiting at 1 HP to use its death special`, u);
      return;
    }
    if (this.revive(u)) return;
    this.ko(u, by);
  }
  private revivePct = new Map<U, number>();

  /**
   * A unit that would be KO'd (after its death special, if any) is revived (HP only) by, in this order [interpretation
   * of the order]: its own Revive (an unconditional self-only ability Revive, or one given by a special), else the first
   * of its team's group Revive pools (revivePools, by unit order) that works [user 2026-11-17]: the owner's ability is
   * on (abilityOn: on the field, no Ability Bind; the owner may be this very unit), its condition holds, the unit
   * matches the targets, and a use is left. An owner KO'd for good never revives anyone again; an owner Forced Out or
   * on the bench is not on the field, so its pool doesn't work while it is away [interpretation]. Returns true when revived.
   */
  private revive(u: U): boolean {
    if (u.revives > 0) {
      u.revives--;
      u.hp = Math.max(1, Math.floor(this.maxHp(u) * (this.revivePct.get(u) ?? TUNE.reviveDefault) / 100));
      this.auraDirty = true;
      this.logOn && this.log("effect", `${u.uid} revives with ${fmt(u.hp)} HP`, u);
      return true;
    }
    for (const p of this.revivePools) {
      const o = p.owner;
      if (p.uses <= 0 || o.side !== u.side || !this.abilityOn(o)) continue;
      if (p.e.condition && !this.cond(o, p.e.condition)) continue;
      if (!this.named(o, p.e).includes(u) || this.excluded(o, p.e, u)) continue;
      p.uses--;
      u.hp = Math.max(1, Math.floor(this.maxHp(u) * (p.e.amount ?? TUNE.reviveDefault) / 100));
      this.auraDirty = true;
      this.logOn && this.log("effect", `${o.uid} ${o.name}'s ability revives ${u.uid} ${u.name} with ${fmt(u.hp)} HP`, o, u);
      return true;
    }
    return false;
  }

  /**
   * A waiting unit's turn (user, 2026-11-14 / 2026-11-17). It aims like any special (deathTarget); with no enemy to
   * aim at it keeps waiting (returns false; everyone waits with it, see beat()). Confusion, Action Bind or Special Bind at
   * its turn (a target found): the attempt fails and it dies without the special. Otherwise it sets off for the
   * target as for any special (startAction), HP still 1 and still not attackable, and fires on arrival (deathFires).
   * No special at all (can't happen with the game's data): the attempt fails at once, so it never waits for ever.
   */
  private deathTurn(u: U): boolean {
    const target = u.special ? this.deathTarget(u) : undefined;
    if (u.special && !target) return false;
    const stop = !u.special ? "no special" : ["Confusion", "Action Bind", "Special Bind"].find((s) => this.has(u, s));
    if (stop) {
      this.logOn && this.log("effect", `${u.uid} can't use its death special (${stop})`, u);
      this.deathEnds(u, false);
      return true;
    }
    return this.startAction(u, target);
  }

  /**
   * A death special's target: the usual special target (chooseTarget: an available enemy). Last resort, so the battle
   * can't stall on a waiting unit (everyone waits for it, user 2026-11-17) [interpretation]:
   * - no enemy outside its own wait is on the field, Forced Out or coming in from the bench: the nearest enemy that is
   *   itself waiting (it stays at 1 HP; allowed, user 2026-11-17: it is mainly about where the special goes off);
   * - or nothing on the field can change any more (stillGoing false: no unit acting, walking, settling, knocked back,
   *   Forced Out or coming in), yet no enemy can be targeted (Provoke on one with no free tile in front, tiles taken or
   *   off the field): the first enemy by the usual target order, tile or not (an enemy outside its wait first).
   * With no free tile in front of that target the special goes off from where the unit stands (startAction).
   */
  private deathTarget(u: U): U | undefined {
    const t = this.chooseTarget(u);
    if (t) return t;
    const foe = other(u.side), foes = this.sides[foe];
    const coming = foes.some((e) => (e.where === "field" && !e.lastStand) || e.where === "out")
      || (this.pendingBench.some((p) => p.side === foe) && foes.some((e) => e.where === "bench"));
    if (!coming) return foes.filter((e) => e.where === "field" && e.lastStand)
      .sort((a, b) => a.attackedBy - b.attackedBy || dist(u.pos, a.pos) - dist(u.pos, b.pos) || this.order(a, b))[0];
    if (this.stillGoing()) return undefined;
    return this.chooseTarget(u, true) ?? foes.filter((e) => e.where === "field" && e.lastStand)
      .sort((a, b) => a.attackedBy - b.attackedBy || dist(u.pos, a.pos) - dist(u.pos, b.pos) || this.order(a, b))[0];
  }

  /** Something on the field can still change with no new pick: a unit acting, walking, settling or knocked back, one
   *  Forced Out, or a bench unit about to come in. */
  private stillGoing(): boolean {
    const t = this.t + 1e-9;
    for (const u of this.units) {
      if (u.where === "out") return true;
      if (u.where !== "field") continue;
      if (u.act || u.phase !== "idle" || t < u.freeAt || t < u.knockUntil || t < u.t1) return true;
    }
    return this.pendingBench.some((p) => this.sides[p.side].some((b) => b.where === "bench"));
  }

  /** The death special goes off on arrival, at 1 HP ("HP 1% or lower" conditions hold); then deathEnds. */
  private deathFires(u: U, target: U) {
    if (this.auraDirty) this.refreshAuras(); // abilities "when HP is below 1%" are on at 1 HP
    this.fireSpecial(u, target, this.superReady(u));
    if (this.deathEnds(u, true)) this.goHome(u, u.from); // revived: back like any special
  }

  /**
   * After the death special (fired) or a failed attempt: if the enemy has nobody left on the field or bench (an enemy
   * waiting on its own death special is on the field), its team wins with it still alive (the wipe check ends the
   * battle); else it dies, or a Revive it has left brings it back. Returns true when it lives on after a Revive.
   */
  private deathEnds(u: U, fired: boolean): boolean {
    u.lastStand = false;
    if (fired && !this.sides[other(u.side)].some((e) => e.where === "field" || e.where === "bench")) {
      this.koSinceCheck = true;
      return false;
    }
    if (u.where !== "field") return false;
    if (this.revive(u)) return true;
    this.ko(u);
    return false;
  }

  private ko(u: U, by?: U) {
    u.hp = 0;
    u.where = "dead";
    u.lastStand = false;
    this.release(u);
    u.act = undefined;
    if (by && by.side !== u.side) { by.kos++; this.teamKos[by.side]++; this.trigger(by, "defeated"); }
    if (this.mode === "gp") { this.count(u.side, "kos"); const L = this.leaders[other(u.side)]; if (L) this.trigger(L, "defeated"); }
    this.dropOwned(u);
    this.logOn && this.log("ko", `${u.uid} ${u.name} is defeated`, by, u);
    if (u.tile >= 0) this.pendingBench.push({ t: this.t + TUNE.benchDelay, side: u.side, tile: u.tile, charge: u.charge, gauge: u.gauge });
    u.tile = -1;
    this.auraDirty = true;
    this.koSinceCheck = true;
  }

  /** A unit leaving takes its ability's buffs with it at once (section 8). */
  private dropOwned(u: U) {
    for (const o of this.units) {
      if (o.mods.some((m) => m.owner === u)) o.mods = o.mods.filter((m) => m.owner !== u);
    }
  }

  private heal(src: U, tgt: U, amount: number, what: string) {
    if (tgt.where !== "field" || tgt.hp <= 0 || amount <= 0) return;
    if (tgt.lastStand) return; // waiting on its death special: stays at exactly 1 HP [interpretation, user 2026-11-14]
    if (tgt.zeroAt !== undefined) return; // an Assault Rumble boss at 0 HP never goes back up (user, 2026-11-22)
    if (this.has(tgt, "RCV Bind")) return; // recovers no HP at all [C]
    const before = tgt.hp;
    tgt.hp = Math.min(this.maxHp(tgt), tgt.hp + Math.floor(amount));
    const got = tgt.hp - before;
    src.healing += got;
    tgt.cnt.healed++;
    if (this.logOn && got > 0) this.log("heal", `${tgt.uid} +${fmt(got)} HP (${what})`, src, tgt, got);
    this.trigger(tgt, "receives healing");
  }

  private doHeal(u: U, a: Action) {
    if (u.where !== "field") return;
    const h = a.heal!;
    const amt = Math.floor(HEAL_MULT[Math.min(3, Math.max(1, h.level)) - 1]! * this.rcv(u));
    const radius = h.area === "Self" ? 0 : TUNE.healRadius[h.area] ?? 150;
    const who = h.area === "Self" ? [u] : this.sides[u.side].filter((m) => this.onField(m) && dist(m.pos, a.target.pos) <= radius);
    for (const m of who) this.heal(u, m, amt, `heal lv${h.level}`);
    this.trigger(u, "heal");
    if (this.mode === "gp") this.count(u.side, "heals");
  }

  // -------------------------------------------------------------------------------------------------------------
  // Bench, Forced Out, Switch (sections 11, 12)
  // -------------------------------------------------------------------------------------------------------------
  private benchArrivals() {
    if (!this.pendingBench.length) return;
    const due = this.pendingBench.filter((p) => p.t <= this.t + 1e-9);
    if (!due.length) return;
    this.pendingBench = this.pendingBench.filter((p) => p.t > this.t + 1e-9);
    let any = false;
    for (const p of due) {
      const next = this.benchLine(p.side)[0];
      if (!next) continue;
      this.placeOnTile(next, p.tile);
      next.charge = Math.min(p.charge, this.chargeNeed(next));
      next.gauge = p.gauge; // [L]
      this.enterInit(next);
      any = true;
      this.logOn && this.log("enter", `${next.uid} ${next.name} comes in from the bench`, next);
    }
    if (any) {
      if (this.o.gameTime) this.cutIn("bench", undefined, "RUMBLE IN!", CUT[this.speed].bench);
      this.refreshAuras();
      for (const p of due) {
        const u = this.sides[p.side].find((x) => x.tile === p.tile && x.where === "field");
        if (u && u.hp === 0) { u.hp = this.maxHp(u); this.onArrival(u); this.giveTimeBoons(u); }
      }
    }
  }

  private placeOnTile(u: U, tile: number) {
    const c = START_TILES[u.side][tile]!;
    const p = cellPos(u.side, c);
    u.where = "field";
    u.tile = tile;
    u.pos = { ...p }; u.home = { ...p }; u.from = { ...p }; u.to = { ...p }; u.t0 = u.t1 = this.t;
    u.homeCell = c;
    u.phase = "idle";
    u.freeAt = this.t;
  }

  private enterInit(u: U) {
    for (const a of u.abilities) { a.on = false; }
    for (const e of u.abilities) {
      const ef = e.e;
      if (ef.effect === "boon" && ef.attributes?.includes("Revive") && !ef.condition && targetsSelf(ef)) { u.revives = ef.repeat ?? 1; this.revivePct.set(u, ef.amount ?? 50); }
      if (ef.effect === "boon" && (ef.attributes as string[] | undefined)?.includes("On Death") && (!ef.condition || this.cond(u, ef.condition))) u.onDeath = ef.repeat ?? 1;
    }
  }

  private returnsFromOut() {
    for (const u of this.units) {
      if (u.where !== "out" || this.t < u.outUntil) continue;
      u.where = "field";
      u.pos = { ...u.home }; u.to = { ...u.home }; u.t1 = this.t;
      u.phase = "idle"; u.freeAt = this.t;
      this.auraDirty = true;
      this.logOn && this.log("enter", `${u.uid} returns to the field`, u);
      this.giveTimeBoons(u);
    }
  }

  private forceOut(u: U, dur: number) {
    if (u.lastStand) return; // waiting on its death special: stays on the field [interpretation]
    this.release(u);
    for (const o of this.units) if (o.act?.target === u && !this.keepsGoing(o)) { this.release(o); o.phase = "back"; this.goHome(o, o.home); }
    u.act = undefined;
    u.where = "out";
    u.outUntil = this.t + dur;
    this.dropOwned(u);
    this.auraDirty = true;
    this.koSinceCheck = true; // a team with only Forced Out units left loses
  }

  /**
   * A death special walking up to a target that is Forced Out or switched out keeps going to the spot it was walking
   * to and goes off there anyway, aimed where the target stood (its position is kept while it is off the field); the
   * target is released [user 2026-11-17]. Any other action turns back. Returns true when `o` keeps going.
   */
  private keepsGoing(o: U): boolean {
    const a = o.act;
    if (!a?.death) return false;
    if (!a.released) { a.released = true; a.target.attackedBy = Math.max(0, a.target.attackedBy - 1); }
    return true;
  }

  /** A side's bench units still waiting, in the order they come in: [0] is A/D6 on the HUD, [1] A/D7, [2] A/D8. */
  private benchLine(side: Side): U[] {
    return this.sides[side].filter((b) => b.where === "bench").sort((a, b) => a.benchAt - b.benchAt);
  }

  /**
   * Switch with the `which`-th sub character (0 = "1st"): the bench unit in that place of the bench line, i.e. the next
   * one to come in for "1st" (bench place 6), the one after it for "2nd" (place 7) [user 2026-11-18]. No unit waiting in
   * that place: no switch [interpretation]. The two swap places: the outgoing unit takes the incoming one's place in
   * the bench line, not the back of it [user 2026-11-18].
   */
  private switchOut(u: U, which: number) {
    if (u.where !== "field" || u.lastStand) return;
    const inc = this.benchLine(u.side)[which];
    if (!inc) {
      this.logOn && this.log("effect", `${u.uid} ${u.name} has no ${["1st", "2nd", "3rd"][which] ?? `${which + 1}th`} sub character waiting: no switch`, u);
      return;
    }
    const tile = u.tile;
    this.release(u);
    for (const o of this.units) if (o.act?.target === u && !this.keepsGoing(o)) { this.release(o); this.goHome(o, o.home); }
    u.act = undefined;
    u.where = "bench";
    u.tile = -1;
    u.benchAt = inc.benchAt; // takes the incoming unit's place in the bench line
    this.dropOwned(u);
    inc.where = "field";
    inc.tile = tile;
    inc.pos = { ...u.pos }; inc.home = { ...u.home }; inc.to = { ...u.home }; inc.t1 = this.t;
    inc.phase = "idle"; inc.freeAt = this.t;
    inc.charge = Math.min(u.charge, this.chargeNeed(inc));
    if (inc.hp === 0) { this.enterInit(inc); this.auraDirty = true; this.refreshAuras(); inc.hp = this.maxHp(inc); this.onArrival(inc); }
    this.auraDirty = true;
    this.logOn && this.log("enter", `${u.uid} switches with ${inc.uid} ${inc.name}`, u, inc);
    if (this.o.gameTime) this.cutIn("bench", undefined, "RUMBLE IN!", CUT[this.speed].bench); // the switched-in unit rumbles in
  }

  // -------------------------------------------------------------------------------------------------------------
  // Abilities (sections 8, 11)
  // -------------------------------------------------------------------------------------------------------------
  private abilityOn(u: U) { return u.where === "leader" || (u.where === "field" && !this.has(u, "Ability Bind")); }

  /** Ability auras and rules -> level maps; edge-triggered ability effects. */
  private refreshAuras() {
    this.auraDirty = false;
    // Which conditions hold, and who is on the field: the aura levels only change when this signature does.
    let sig = "";
    for (const u of this.abilityUnits()) {
      const on = this.abilityOn(u);
      sig += u.where !== "field" ? "0" : on ? "2" : "1";
      if (!on) continue;
      for (const a of u.abilities) {
        const e = a.e;
        if (e.condition?.type === "trigger" || (e as Ef).onArrival) continue;
        a.holds = !e.condition || this.cond(u, e.condition);
        sig += a.holds ? "1" : "0";
      }
    }
    for (const r of this.rules) sig += ruleActive(r, this.t, BATTLE_LENGTH) ? "1" : "0";
    if (sig !== this.auraSig || this.dynamicAuras) {
      this.auraSig = sig;
      const src = !!this.o.frameInterval; // where each level comes from: only for the replay, never in win-rate runs
      for (const u of this.units) { u.aura = {}; if (src) u.auraSrc = []; }
      for (const u of this.units) {
        if (u.where !== "field") continue;
        for (const r of this.rulesOf(u)) if (ruleActive(r, this.t, BATTLE_LENGTH)) {
          for (const b of ruleBuffs(r)) {
            addLv(u.aura, b.attr, b.level);
            if (src) u.auraSrc!.push({ attr: b.attr, level: b.level, kind: "rule", label: ruleLabel(r, b) });
          }
        }
      }
      for (const u of this.abilityUnits()) {
        if (!this.abilityOn(u)) continue;
        for (const a of u.abilities) {
          if (!a.aura || !a.holds) continue;
          const e = a.e;
          const sign = e.effect === "buff" ? 1 : -1;
          const label = src ? `${u.uid} ${u.name}: ${u.where === "leader" ? "leader's GP ability" : "ability"}${e.condition ? ` (${shortCond(e.condition)})` : ""}` : "";
          // an ability's debuff is never evaded (Evade covers specials only, user 2026-11-13)
          for (const t of this.targetsOf(u, e, undefined, undefined)) for (const at of e.attributes ?? []) if (LEVEL_ATTRS.has(at)) {
            addLv(t.aura, at, sign * (e.level ?? 1));
            if (src) t.auraSrc!.push({ attr: at, level: sign * (e.level ?? 1), kind: "ability", from: u, label });
          }
        }
      }
    }
    // anything else: given once, when the condition turns true [C for time boons]
    for (const u of this.abilityUnits()) {
      if (!this.abilityOn(u)) continue;
      for (const a of u.abilities) {
        const e = a.e;
        if (a.aura || e.condition?.type === "trigger" || (e as Ef).onArrival) continue;
        if (a.holds && !a.on) { a.on = true; this.applyEffect(u, e, a.idx, -1, undefined, "ability"); }
        else if (!a.holds) a.on = false;
      }
    }
  }
  private auraSig = "";
  /** Some aura targets depend on stats or statuses (highest ATK, ...): those are rebuilt every time. */
  private dynamicAuras = false;

  private onArrival(u: U) {
    if (!this.abilityOn(u)) return;
    for (const a of u.abilities) if ((a.e as Ef).onArrival && (!a.e.condition || this.cond(u, a.e.condition))) this.applyEffect(u, a.e, a.idx, -1, undefined, "ability");
  }

  /** A unit coming onto the field gets the time-conditioned boons already given to its team [C]. */
  private giveTimeBoons(newcomer: U) {
    for (const u of this.abilityUnits()) {
      if (!this.abilityOn(u) || u === newcomer) continue;
      for (const a of u.abilities) if (a.on && a.e.effect === "boon" && this.targetsOf(u, a.e, undefined, undefined).includes(newcomer)) this.applyEffect(u, a.e, a.idx, -1, undefined, "ability", newcomer);
    }
  }

  /** Ability triggers: each event fires the effect until it has fired `count` times [C]. */
  private trigger(u: U, event: string) {
    if (!this.abilityOn(u)) return;
    for (const a of u.abilities) {
      const c = a.e.condition;
      if (c?.type !== "trigger" || lc(c.stat as string) !== lc(event)) continue;
      if (c.count !== undefined && a.fired >= c.count) continue;
      a.fired++;
      this.applyEffect(u, a.e, a.idx, a.fired, undefined, "trigger");
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Conditions
  // -------------------------------------------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cond(u: U, c: any): boolean {
    const cmp = lc(c.comparator);
    const n = c.count ?? 0;
    switch (c.type as string) {
      case "time":
        if (cmp === "first") return this.t < n;
        if (cmp === "remaining") return BATTLE_LENGTH - this.t <= n + 1e-9;
        if (cmp === "after") return this.t >= n;
        return false;
      case "stat": {
        const pct = (u.hp / this.maxHp(u)) * 100;
        return cmp === "above" ? pct > n : cmp === "below" ? pct < n : Math.abs(pct - n) < 0.5;
      }
      case "crew": case "enemies": {
        // composition ("N or more [Navy] crew members"): the whole team of 8, bench and KO'd included. Otherwise
        // ("N or more crew members remaining"): every unit not KO'd, bench included; the data's counts of 6-8
        // ("7 or more crew members remaining", 876) can't be met by the 5 field places alone [C from the data]
        const mine = c.type === "crew" ? u.side : other(u.side);
        const count = (s: Side) => this.sides[s].filter((x) => (c.composition || x.where !== "dead") && (!c.targets?.length || c.targets.some((g: string) => matchesToken(x, g)))).length;
        let v = count(mine);
        if (c.relative) v -= count(other(mine));
        if (cmp === "remaining") return this.sides[mine].filter((x) => x.where !== "dead").length <= n;
        // "more crew members remaining than enemies" has no count: strictly more, i.e. at least 1 more
        const need = c.relative && c.count === undefined && cmp === "more" ? 1 : n;
        return cmp === "more" ? v >= need : cmp === "less" ? v <= need : v === need;
      }
      case "character": {
        // "When Shanks is on your crew": anywhere on that team, field, bench, Forced Out or KO'd (user, 2026-11-13)
        const s = lc(c.team).startsWith("enem") ? other(u.side) : u.side; // the data has "enemies" and "enemy"
        return this.sides[s].some((x) => x !== u && hasFamily(x.rec, c.families ?? []));
      }
      case "defeat": return this.teamKos[u.side] >= n;
      case "debuff": return this.has(u, c.stat ?? c.attribute ?? "");
      case "multi": {
        const subs = (c.conditions ?? []) as Condition[];
        return lc(c.conjunction) === "or" ? subs.some((s) => this.cond(u, s)) : subs.every((s) => this.cond(u, s));
      }
      // "During Assault Rumble ..." (328 effect parts): only in that mode
      case "mode": return (this.mode === "assault" && lc(c.mode) === "assault rumble") || (this.mode === "gp" && lc(c.mode) === "grand party");
      case "trigger": return true;
      default:
        this.skip(`condition ${c.type}`);
        return false;
    }
  }

  private superReady(u: U): boolean {
    if (!u.superSp || u.superUsed || this.supersUsed[u.side] >= SUPERS_PER_TEAM) return false;
    const c = u.superSp.condition;
    const n = c.count ?? 0;
    switch (c.type) {
      case "specialreceived": return u.cnt.specialReceived >= n;
      case "dmgreceived": return u.cnt.dmgReceived >= n;
      case "dmgtaken": return u.cnt.dmgTaken >= n;
      case "heal": return u.cnt.healed >= n;
      case "special": return this.teamSpecials[lc(c.team).startsWith("enem") ? other(u.side) : u.side] >= n;
      case "time": return BATTLE_LENGTH - this.t <= n;
      case "dbfreceived": return (u.cnt.dbfReceived[c.attribute ?? ""] ?? 0) >= n;
      case "stat": return lc(c.comparator) === "above" ? (u.hp / this.maxHp(u)) * 100 > n : (u.hp / this.maxHp(u)) * 100 < n;
      default: return false;
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // Specials (section 10)
  // -------------------------------------------------------------------------------------------------------------
  private fireSpecial(u: U, target: U, isSuper: boolean) {
    const sp = isSuper ? u.superSp! : u.special!;
    u.charge = 0;
    u.specials++;
    this.teamSpecials[u.side]++;
    if (this.mode === "gp") this.count(u.side, "specials");
    if (isSuper) { u.superUsed = true; this.supersUsed[u.side]++; }
    const use = u.specials;
    const ev = this.logOn ? this.log("special", `${u.uid} ${u.name} uses its ${isSuper ? "SUPER special" : "special"} (#${use})`, u, target) : undefined;
    if (this.o.gameTime) {
      const s = CUT[this.speed];
      this.cutIn(isSuper ? "superSpecial" : "special", u.uid, `${u.name}: ${isSuper ? "super special" : "special"}`, s.intro + Math.max(1, sp.effects.length) * s.part + s.outro);
    }
    this.fireParts(u, sp.effects, use, target, ev, isSuper);
  }

  /** The effects of a special (or a GP burst) one after another, noting what each did for the replay's captions. */
  private fireParts(u: U, effects: Effect[], use: number, target: U | undefined, ev: BattleEvent | undefined, isSuper: boolean) {
    const hitBy = new Set<U>();
    const went: Effect[] = []; // effects that went off: condition met and someone to apply to
    const partKos: string[][] = []; // who each of those KO'd
    const partHp: Record<string, number>[] = []; // HP each of those changed (uid -> HP after it)
    const partTargets: string[][] = []; // who each of those landed on
    const partKinds: ("up" | "down" | "hit")[] = []; // what each did to them: helped, hindered, or damaged
    const everyone = [...this.sides.atk, ...this.sides.def];
    const hpBefore = new Map(everyone.map((x) => [x, x.hp]));
    const shieldBefore = new Map(everyone.map((x) => [x, x.shield]));
    const partShield: Record<string, number>[] = []; // shield each part changed (uid -> shield after it)
    const partShieldHit: Record<string, number>[] = []; // damage each part sent into a shield (uid -> damage)
    const partOut: string[][] = []; // who each part Forced Out
    const wasOut = new Set(everyone.filter((x) => x.where === "out"));
    this.firingSuper = isSuper;
    effects.forEach((e, idx) => {
      if (e.condition && e.condition.type !== "trigger" && !this.cond(u, e.condition)) return;
      const logged = this.events.length;
      const landed = this.applyEffect(u, e, idx, use, target, "special");
      for (const t of landed) hitBy.add(t);
      const changed: Record<string, number> = {};
      for (const x of everyone) if (x.hp !== hpBefore.get(x)) { changed[x.uid] = x.hp; hpBefore.set(x, x.hp); }
      const shieldChanged: Record<string, number> = {};
      for (const x of everyone) if (x.shield !== shieldBefore.get(x)) { shieldChanged[x.uid] = x.shield; shieldBefore.set(x, x.shield); }
      const intoShield: Record<string, number> = {};
      for (const x of this.events.slice(logged)) if (x.kind === "hit" && x.target && x.amount && /\(into Shield\)/.test(x.text)) intoShield[x.target] = (intoShield[x.target] ?? 0) + x.amount;
      const nowOut = everyone.filter((x) => x.where === "out" && !wasOut.has(x));
      for (const x of nowOut) wasOut.add(x);
      if (this.lastTargetCount > 0) {
        went.push(e);
        partShieldHit.push(intoShield);
        partOut.push(nowOut.map((x) => x.uid));
        partKos.push(this.events.slice(logged).filter((x) => x.kind === "ko" && x.target).map((x) => x.target!));
        partHp.push(changed);
        partShield.push(shieldChanged);
        partTargets.push(landed.map((x) => x.uid));
        partKinds.push(e.effect === "damage" && e.type !== "time" ? "hit" : e.effect === "debuff" || e.effect === "hinderance" || e.effect === "penalty" || e.effect === "damage" ? "down" : "up");
      } else if (partHp.length) { Object.assign(partHp[partHp.length - 1]!, changed); Object.assign(partShield[partShield.length - 1]!, shieldChanged); Object.assign(partShieldHit[partShieldHit.length - 1]!, intoShield); partOut[partOut.length - 1]!.push(...nowOut.map((x) => x.uid)); }
    });
    this.firingSuper = false;
    if (ev) { ev.parts = effectLines(went); ev.partKos = partKos; ev.partHp = partHp; ev.partTargets = partTargets; ev.partKinds = partKinds; ev.partShield = partShield; ev.partShieldHit = partShieldHit; ev.partOut = partOut; } // one caption per effect that goes off
    for (const t of hitBy) if (t.side !== u.side) t.cnt.specialReceived++;
  }

  /** Resolve targets of an effect (section 10 "Targets", 12b "Targeting"). */
  targetsOf(u: U, e: Effect & Record<string, any>, aim: U | undefined, address: [number, number] | undefined): U[] {
    const tg = (e.targeting ?? { targets: [] }) as Effect["targeting"] & Record<string, any>;
    let pool = this.named(u, e).filter((x) => x.where === "field" && (x.hp > 0 || x.lastStand));
    if (tg.excludes?.length) pool = pool.filter((x) => !this.excluded(u, e, x));
    // "enemies with Paralysis and Damage Over Time": the data lists the statuses; a unit with any of them counts [A]
    if (tg.status) { const sts = ([] as unknown[]).concat(tg.status).map(String); pool = pool.filter((x) => sts.some((st) => this.has(x, st))); }
    return this.targetsRest(u, e, pool, aim, address);
  }

  /** Everyone an effect names (its side, tokens, families, self), wherever they are and whatever their HP. */
  private named(u: U, e: Effect & Record<string, any>): U[] {
    const tg = (e.targeting ?? { targets: [] }) as Effect["targeting"] & Record<string, any>;
    const toks = (tg.targets ?? []).map(String).filter((x) => x.trim());
    const wantsEnemy = sideOf(e) === "enemies"; // one reading of sides for the simulator and the effect check (spec.ts)
    // a "family" written like a tag ("[Vegapunk]", 4544) is a tag
    const fams = ((tg.families ?? []) as string[]).filter((f) => !f.startsWith("["));
    const groups = [...toks.filter((x) => x !== "self" && x !== "crew" && x !== "enemies"), ...((tg.families ?? []) as string[]).filter((f) => f.startsWith("["))];
    let pool: U[];
    if (!toks.length && !tg.families?.length) pool = e.effect === "boon" || e.effect === "penalty" ? [u] : this.sides[wantsEnemy ? other(u.side) : u.side];
    else if (toks.length === 1 && toks[0] === "self" && !tg.families?.length) pool = [u];
    else {
      const side = this.sides[wantsEnemy ? other(u.side) : u.side];
      // "crew" / "enemies" next to named characters only names the side ("Broggy crew member", 32 effects): the whole
      // side only when nothing narrower is named
      const whole = !groups.length && !fams.length && (toks.includes("crew") || toks.includes("enemies"));
      pool = groups.length ? side.filter((x) => groups.some((g) => matchesToken(x, g))) : whole ? [...side] : [];
      if (fams.length) for (const x of side) if (!pool.includes(x) && hasFamily(x.rec, fams)) pool.push(x);
      if (toks.includes("self") && !pool.includes(u)) pool.push(u);
    }
    return pool;
  }

  /** `x` is left out by the effect's "excludes". */
  private excluded(u: U, e: Effect, x: U): boolean {
    return !!e.targeting?.excludes?.some((g) => (g === "self" ? x === u : matchesToken(x, String(g))));
  }

  /** Range, stat priority and count (targetsOf). */
  private targetsRest(u: U, e: Effect & Record<string, any>, pool: U[], aim: U | undefined, address: [number, number] | undefined): U[] {
    const tg = (e.targeting ?? { targets: [] }) as Effect["targeting"] & Record<string, any>;
    // range around the special's target
    if (e.range && aim) {
      const f = e.effect === "damage" ? 1 : TUNE.nonDamageRange;
      pool = pool.filter((x) => inRange(u.pos, aim.pos, x.pos, e.range!.direction, e.range!.size, f));
    }
    const pr = tg.priority as string | undefined;
    const stat = tg.stat as string | undefined;
    if (pr && stat && (pr === "above" || pr === "below" || pr === "exactly")) {
      const v = (x: U) => (tg.percentage !== undefined ? (stat === "HP" ? (x.hp / this.maxHp(x)) * 100 : this.statOf(x, stat) * (stat === "Special CT" ? 100 : 1)) : this.statOf(x, stat));
      const lim = tg.percentage ?? tg.amount ?? 0;
      pool = pool.filter((x) => (pr === "above" ? v(x) > lim : pr === "below" ? v(x) < lim : Math.abs(v(x) - lim) < 1e-6 || (stat === "Special CT" && v(x) >= lim)));
    }
    const count = tg.count as number | undefined;
    // random rank over all units by fixed slot (section 1 rule 2): same picks whatever is alive
    const rank = (x: U) => (address ? this.dice.u("special", u.key, "rank", address[0], address[1], x.key) : x.key / 64);
    if (pr && stat && (pr === "highest" || pr === "lowest")) {
      const s = pr === "lowest" ? 1 : -1;
      pool.sort((a, b) => s * (this.statOf(a, stat) - this.statOf(b, stat)) || rank(a) - rank(b));
      if (count) pool = pool.slice(0, count);
    } else if (count && pool.length > count) {
      pool.sort((a, b) => rank(a) - rank(b));
      pool = pool.slice(0, count);
      if (address && this.dice.log) this.dice.log.push({ stream: "special", unit: u.uid, what: `special#${address[0]}.${address[1]} random targets`, options: pool.length, value: 0 });
    }
    return pool;
  }

  /**
   * Apply one effect. `use` = which use of the special (1, 2, ...) or trigger firing; addresses the special stream.
   * Returns the units it landed on.
   */
  private applyEffect(u: U, e: Effect & Record<string, any>, idx: number, use: number, aim: U | undefined, via: "special" | "ability" | "trigger", only?: U): U[] {
    const special = via === "special";
    const addr: [number, number] | undefined = [special ? use : 1000 + use, (via === "special" ? 0 : 100) + idx];
    let targets = this.targetsOf(u, e, aim ?? (special ? undefined : undefined), addr);
    if (only) targets = targets.filter((x) => x === only);
    this.lastTargetCount = targets.length;
    const attrs = (e.attributes ?? []) as string[];
    const dur = e.duration ? e.duration : via === "special" ? Infinity : Infinity;
    const end = this.t + dur;
    const landed: U[] = [];
    const chance = (t: U, what: string, p: number) => p >= 100 || this.dice.chance("special", u.key, u.uid, `${via}:${what}`, p / 100, addr[0], addr[1], t.key);
    switch (e.effect) {
      case "buff": case "debuff": {
        const sign = e.effect === "debuff" ? -1 : 1;
        for (const t of targets) {
          if (e.chance !== undefined && !chance(t, "buff", e.chance)) continue;
          if (sign < 0 && special && this.evades(t, "Stats Down", u, addr)) continue; // Evade: specials only
          for (const at of attrs) {
            if (at === "Shield") { t.shield += TUNE.shieldPerLevel * (e.level ?? 1); continue; }
            if (LEVEL_ATTRS.has(at)) t.mods.push({ attr: at, level: sign * (e.level ?? 1), end, owner: via === "special" ? undefined : u, by: u, via: special && this.firingSuper ? "super" : via });
          }
          if (sign < 0) for (const at of attrs) t.cnt.dbfReceived[at] = (t.cnt.dbfReceived[at] ?? 0) + 1;
          if (sign < 0 && this.mode === "gp" && t.side !== u.side) { this.count(u.side, "statusesApplied"); this.count(t.side, "statusesReceived"); }
          landed.push(t);
        }
        if (this.logOn && targets.length) this.log("effect", `${u.uid}: ${e.effect} ${attrs.join("/")} ${e.level ?? ""} -> ${targets.map((x) => x.uid).join(", ")}`, u);
        break;
      }
      case "damage": {
        const per = e.spread && targets.length ? 1 / targets.length : 1;
        for (const t of targets) {
          if (e.chance !== undefined && !chance(t, "damage", e.chance)) continue;
          if (e.type === "time") {
            if (this.blocked(t, "Damage Over Time", u, addr, special)) continue;
            t.statuses.push({ name: "Damage Over Time", end, level: e.level ?? 1 });
            landed.push(t);
            continue;
          }
          // "Randomly deals between 100-2,100 fixed damage" (type random): fixed damage, evaded as such (site text)
          const fixed = e.type === "fixed" || e.type === "random";
          const kind = fixed ? "Fixed Damage" : e.type === "cut" ? "Percentage Damage" : e.defbypass ? "Damage Ignoring DEF" : undefined;
          let raw: number;
          let d: number;
          if (e.type === "fixed") { raw = (e.amount ?? 0) * per; d = Math.floor(raw); }
          else if (e.type === "cut") { raw = Math.floor(t.hp * (e.amount ?? 0) / 100); d = raw; }
          else if (e.type === "random") {
            const [lo, hi] = e.amountrange ?? [e.amount ?? 0, e.amount ?? 0];
            raw = Math.floor((lo + (hi - lo) * this.dice.u("special", u.key, "randomDmg", addr[0], addr[1], t.key)) * per);
            d = raw;
          } else {
            raw = Math.floor(this.atk(u) * (e.amount ?? 0) * per);
            d = e.defbypass ? raw : Math.floor(raw / (1 + this.def(t) ** 2 / DEF_K));
          }
          d = this.factors(u, t, d);
          void 0;
          for (const r of t.resil as any[]) if (r.type === "dmgtype" && kind && r.attribute === kind) d = Math.floor(d * (1 - r.percentage / 100));
          // Evade "Fixed Damage" / "Percentage Damage" / "Damage Ignoring DEF": the hit does 0 instead; its chance is
          // rolled for every hit; specials only (user, 2026-11-13)
          const evaded = (k: number) => special && !!kind && this.evades(t, kind, u, addr, k);
          const ev0 = evaded(0);
          this.logOn && this.log("hit", `${u.uid} special -> ${t.uid}: ${ev0 ? `0 (evades ${kind})` : fmt(d)}${!ev0 && t.shield > 0 && !fixed && !e.defbypass ? " (into Shield)" : ""}`, u, t, ev0 ? 0 : d);
          // special damage during an attack animation cancels it; the unit stays where it is [WIKI]
          if (t.act && !t.act.hit && t.act.kind !== "special" && t.phase === "toAttack" && this.t >= t.act.arrive) {
            this.release(t); t.home = { ...t.pos }; t.phase = "idle"; t.freeAt = this.t;
          }
          // "... N times" (repeat): the same hit N times; a percentage cut is worked out again on the HP left
          const times = Math.max(1, e.repeat ?? 1);
          for (let k = 0; k < times && t.where === "field" && t.hp > 0; k++) {
            if (k === 0 ? ev0 : evaded(k)) continue;
            const dk = k > 0 && e.type === "cut" ? this.factors(u, t, Math.floor(t.hp * (e.amount ?? 0) / 100)) : d;
            this.damage(u, t, dk, { regular: false, raw, ignoresDef: fixed || !!e.defbypass, kind, special: true });
          }
          landed.push(t);
        }
        break;
      }
      case "recharge": {
        for (const t of targets) {
          if (e.chance !== undefined && !chance(t, "recharge", e.chance)) continue;
          const a = e.amount ?? 0;
          if (e.type === "Special CT") { if (t.special) t.charge = Math.min(this.chargeNeed(t), t.charge + this.chargeNeed(t) * a / 100); }
          else {
            const amt = e.type === "RCV" ? a * this.rcv(u) : e.type === "percentage" ? (this.maxHp(t) * a) / 100 : a;
            const iv = e.interval ?? e["interva"];
            if (iv && e.duration) t.statuses.push({ name: "HoT", end, amount: amt, pct: iv, level: this.t + iv, owner: u });
            else this.heal(u, t, amt, via === "special" ? "special" : "ability");
          }
          landed.push(t);
        }
        break;
      }
      case "hinderance": case "penalty": {
        for (const t of targets) {
          // a special's own-side stat penalty is a stat debuff too: Evade "Stats Down" stops it (user, 2026-11-13)
          const statPenalty = e.effect === "penalty" && attrs.some((at) => LEVEL_ATTRS.has(at) && at !== "Special CT");
          const penaltyEvaded = statPenalty && special && this.evades(t, "Stats Down", u, addr);
          for (const at of attrs) {
            if (e.effect === "penalty" && LEVEL_ATTRS.has(at) && at !== "Special CT") { if (penaltyEvaded) continue; t.mods.push({ attr: at, level: -(e.level ?? 1), end, by: u, via: special && this.firingSuper ? "super" : via }); continue; }
            if (e.effect === "penalty" && at === "HP") { if (t.zeroAt === undefined) t.hp = Math.max(1, t.hp - Math.floor(t.hp * (e.amount ?? 0) / 100)); continue; }
            if (at === "Special CT") { // delay: a percentage of the bar
              // the one Evade that also works against abilities (e.g. Imu's passive rewind) (user, 2026-11-13)
              if (e.effect === "hinderance" && this.evades(t, "Special CT Delay", u, addr)) continue;
              if (e.effect === "hinderance" && e.chance !== undefined && !chance(t, at, e.chance)) continue;
              if (t.special) t.charge = Math.max(0, t.charge - this.chargeNeed(t) * (e.amount ?? 0) / 100);
              continue;
            }
            if (!HINDERANCES.has(at)) { this.skip(`${e.effect} ${at}`); continue; }
            const p = e.chance ?? 100; // the chance to land it (Paralysis included)
            if (e.effect === "hinderance") {
              if (!chance(t, at, p)) continue;
              if (this.blocked(t, at, u, addr, special)) continue;
            }
            this.addStatus(t, at, end, e, u);
            t.cnt.dbfReceived[at] = (t.cnt.dbfReceived[at] ?? 0) + 1;
            if (this.mode === "gp" && t.side !== u.side) { this.count(u.side, "statusesApplied"); this.count(t.side, "statusesReceived"); }
            this.trigger(t, `receives ${at}`);
          }
          landed.push(t);
        }
        if (this.logOn && targets.length) this.log("effect", `${u.uid}: ${attrs.join("/")} -> ${targets.map((x) => x.uid).join(", ")}`, u);
        break;
      }
      case "boon": {
        for (const t of targets) {
          if (e.chance !== undefined && !chance(t, "boon", e.chance)) continue;
          for (const at of attrs) this.boon(u, t, at, e, end);
          landed.push(t);
        }
        break;
      }
      case "cleanse": {
        for (const t of targets) {
          if (e.chance !== undefined && !chance(t, "cleanse", e.chance)) continue;
          const all = attrs.includes("all");
          t.mods = t.mods.filter((m) => !(m.level < 0 && (all || attrs.includes(m.attr))));
          if (all) t.statuses = t.statuses.filter((s) => !HINDERANCES.has(s.name));
          else t.statuses = t.statuses.filter((s) => !attrs.includes(s.name));
          landed.push(t);
        }
        break;
      }
      case "evade": {
        for (const t of targets) { t.statuses.push({ name: "Evade", end, chance: e.chance ?? 100, attrs }); landed.push(t); }
        break;
      }
      default:
        this.skip(`effect ${e.effect}`);
    }
    return landed;
  }

  private addStatus(t: U, at: string, end: number, e: Effect & Record<string, any>, u: U) {
    switch (at) {
      case "Forced Out": this.forceOut(t, e.duration ?? 5); return;
      case "Damage Over Time": t.statuses.push({ name: at, end, level: e.level ?? 1 }); return;
      case "Ability Bind": this.dropOwned(t); t.statuses.push({ name: at, end }); this.auraDirty = true; return;
      case "Action Bind": case "Special Bind": {
        // a second bind adds its duration to the one still running: 5 s left + a 10 s bind = 15 s (user 2026-11-25)
        const on = t.statuses.find((s) => s.name === at && s.end > this.t);
        if (on) { on.end += end - this.t; return; }
        t.statuses.push({ name: at, end, owner: u });
        return;
      }
      default: t.statuses.push({ name: at, end, owner: u });
    }
  }

  private boon(u: U, t: U, at: string, e: Effect & Record<string, any>, end: number) {
    switch (at) {
      case "Haste": t.haste = true; return;
      case "Provoke": t.statuses.push({ name: "Provoke", end }); return;
      case "Counter": t.statuses.push({ name: "Counter", end, amount: e.amount ?? 1 }); return;
      case "Damage Reflect": t.statuses.push({ name: "Damage Reflect", end, pct: e.percentage ?? 0, amount: e.amount ?? 0 }); return;
      case "Revive": // a group Revive ability is a shared pool (revivePools), not one revive per target
        if (u.abilities.some((a) => a.e === e) && isGroupRevive(e)) return;
        t.revives = Math.max(t.revives, e.repeat ?? 1); this.revivePct.set(t, e.amount ?? 50); return;
      case "On Death": t.onDeath = Math.max(t.onDeath, e.repeat ?? 1); return;
      case "Shield": t.shield += TUNE.shieldPerLevel * (e.level ?? 1); return;
      case "Switch": {
        const sw = String((e.targeting as Record<string, unknown> | undefined)?.["switch"] ?? "1st");
        this.switchOut(t, subIndex(sw));
        return;
      }
      default:
        if (HINDERANCES.has(at) || at === "Silence") { t.statuses.push({ name: `Immune: ${at}`, end }); return; } // [C]
        this.skip(`boon ${at}`);
    }
  }

  /** A hinderance is stopped by debuff resilience, an immunity or (from a special only) an Evade (section 10). */
  private blocked(t: U, at: string, u: U, addr: [number, number], evadable: boolean): boolean {
    if (this.has(t, `Immune: ${at}`)) return true;
    for (const r of t.resil) if (r.type === "debuff" && r.attribute === at && this.dice.chance("special", u.key, u.uid, `resist:${at}`, r.chance / 100, addr[0], addr[1], t.key)) return true;
    return evadable && this.evades(t, at, u, addr);
  }
  /**
   * Evade (user, 2026-11-13): while it lasts, each time `what` tries to land on `t` the Evade's chance is rolled; on
   * success it doesn't land ("Stats Down": no new stat debuff, the ones already on stay; a hinderance isn't applied;
   * "Fixed Damage" / "Percentage Damage" / "Damage Ignoring DEF": the hit does 0). `hit` numbers the repeats of one hit.
   */
  private evades(t: U, what: string, u: U, addr: [number, number], hit = 0): boolean {
    for (const s of t.statuses) {
      if (s.name !== "Evade" || s.end <= this.t || !evadeCovers(s.attrs, what)) continue;
      if (this.dice.chance("special", u.key, u.uid, hit ? `evade:${what}#${hit}` : `evade:${what}`, (s.chance ?? 100) / 100, addr[0], addr[1], t.key)) {
        this.logOn && this.log("effect", `${t.uid} evades ${what} from ${u.uid}`, u, t);
        return true;
      }
    }
    return false;
  }

  private skip(what: string) { this.unsupported[what] = (this.unsupported[what] ?? 0) + 1; }

  // -------------------------------------------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------------------------------------------
  private cutIn(kind: CutIn["kind"], actor: string | undefined, text: string, length: number) {
    this.cutIns.push({ kind, t: this.t, wall: this.t + this.wall, length, actor, text });
    this.wall += length;
  }

  private log(kind: BattleEvent["kind"], text: string, actor?: U, target?: U, amount?: number): BattleEvent | undefined {
    if (!this.logOn) return undefined;
    const ev: BattleEvent = { t: this.t, wall: this.o.gameTime ? this.t + this.wall : undefined, kind, text, actor: actor?.uid, target: target?.uid, amount };
    this.events.push(ev);
    return ev;
  }

  /**
   * Where a stat's net level comes from, for the replay's breakdown: aura parts (abilities, rules; refreshAuras) and
   * the timed levels, one entry per source (same source and end merged). The levels sum to `net`; anything left over
   * shows as "Other" (nothing should be: lv() has no cap).
   */
  private sourcesOf(u: U, at: string, net: number): BuffSource[] {
    const out: BuffSource[] = [];
    const add = (s: BuffSource) => {
      const same = out.find((x) => x.label === s.label && x.kind === s.kind && (x.remaining === undefined ? s.remaining === undefined : s.remaining !== undefined && Math.abs(x.remaining - s.remaining) < 1e-6));
      if (same) same.level += s.level; else out.push(s);
    };
    for (const a of u.auraSrc ?? []) if (a.attr === at) add({ level: a.level, kind: a.kind, from: a.from?.uid, label: a.label });
    for (const m of u.mods) {
      if (m.attr !== at || m.end <= this.t) continue;
      const how = m.via === "super" ? "super special" : m.via === "special" ? "special" : m.via === "trigger" ? "ability (triggered)" : "ability";
      add({
        level: m.level, kind: !m.by ? "other" : m.via === "special" || m.via === "super" ? "special" : "ability", from: m.by?.uid,
        label: m.by ? `${m.by.uid} ${m.by.name}: ${how}` : "Other", remaining: Number.isFinite(m.end) ? m.end - this.t : undefined,
      });
    }
    let sum = 0;
    for (const s of out) sum += s.level;
    if (Math.abs(net - sum) > 1e-9) out.push({ level: net - sum, kind: "other", label: "Other" });
    return out.filter((s) => s.level !== 0);
  }

  private snapshot() {
    const units: UnitSnapshot[] = this.units.map((u) => {
      const buffs: Record<string, number> = {};
      const buffEnds: Record<string, number> = {};
      const buffSources: Record<string, BuffSource[]> = {};
      for (const at of LEVEL_ATTRS) {
        const l = this.lv(u, at);
        if (!l) continue;
        buffs[at] = l;
        // seconds until the soonest timed part of it ends (abilities and rules have none)
        let soon = Infinity;
        for (const m of u.mods) if (m.attr === at && m.end > this.t && Number.isFinite(m.end)) soon = Math.min(soon, m.end - this.t);
        if (Number.isFinite(soon)) buffEnds[at] = soon;
        buffSources[at] = this.sourcesOf(u, at, l);
      }
      return {
        uid: u.uid, x: u.pos.x, y: u.pos.y, hp: u.zeroAt !== undefined ? 0 : Math.max(0, u.hp), maxHp: this.maxHp(u),
        ct: u.special ? Math.min(u.charge, this.chargeNeed(u)) : 0, ctMax: u.special ? this.chargeNeed(u) : 0,
        state: u.where === "dead" ? "dead" : u.where === "bench" ? "bench" : u.where === "out" ? "forced" : u.act || u.phase !== "idle" ? "acting" : "idle",
        targetUid: u.act && u.act.kind !== "heal" ? u.act.target.uid : undefined,
        // in position: from 0.2 s after arriving until it leaves (the game's attack strip shows then [M])
        engaged: !!u.act && (u.act.kind === "attack" || u.act.kind === "confused") && this.t >= u.act.arrive - 1e-9 && this.t < u.act.leaveAt,
        shield: u.shield, gauge: u.gauge, superReady: this.superReady(u),
        activity: u.lastStand && u.where === "field" ? (u.act ? `Death special ${u.act.target.uid}` : "Waiting to use its death special")
          : u.act && u.act.dotEnd !== undefined && this.t >= u.act.arrive - 1e-9 && this.t < u.act.dotEnd - 1e-9 ? `Damage over Time (then ${u.act.kind === "heal" ? "healing" : "attacking"} ${u.act.target.uid})`
          : !u.act && u.paralyzedUntil !== undefined && this.t < u.paralyzedUntil - 1e-9 ? "Paralyzed"
          : !u.act && this.has(u, "Action Bind") ? "Action Bound"
          : u.act ? `${u.act.kind === "special" ? "Special" : u.act.kind === "heal" ? "Healing" : "Attacking"} ${u.act.target.uid}` : u.attackedBy ? "Being attacked" : u.phase === "back" ? "Returning" : "",
        occupied: !this.free(u),
        buffs,
        buffEnds,
        buffSources,
        outFor: u.where === "out" ? Math.max(0, u.outUntil - this.t) : undefined,
        stats: { atk: this.atk(u), def: this.def(u), spd: this.spd(u), rcv: this.rcv(u) },
        // an Evade lists what it covers by the site's names ("Stats Down", "Half Stats", "Damage Ignoring DEF" ...)
        statuses: u.statuses.filter((s) => s.end > this.t).map((s) => ({ attr: s.name, remaining: Number.isFinite(s.end) ? s.end - this.t : 999, level: s.level, chance: s.chance !== undefined ? s.chance / 100 : undefined, ...(s.name === "Evade" ? { evades: [...(s.attrs ?? [])] } : {}) })),
      };
    });
    const queue = this.nextColumn().slice(0, 5).map((u) => u.uid);
    const supersLeft = { atk: SUPERS_PER_TEAM - this.supersUsed.atk, def: SUPERS_PER_TEAM - this.supersUsed.def };
    const gp = this.mode === "gp" ? Object.fromEntries(Object.entries(this.gp).map(([s, g]) => [s, { progress: Math.min(this.gpProgress(s as Side), g!.need), need: g!.need, uses: g!.uses }])) : undefined;
    // Assault Rumble: the Damage Score so far (the game shows it during the battle), as the outcome counts it
    const score = this.mode === "assault" ? this.units.reduce((s, u) => s + (u.side === "def" ? u.scoreDmg ?? 0 : 0), 0) : undefined;
    this.frames.push({ t: this.o.gameTime ? this.t + this.wall : this.t, clock: this.t, units, queue, supersLeft, ...(gp ? { gp } : {}), ...(score !== undefined ? { score } : {}) });
  }
}

// ---------------------------------------------------------------------------------------------------------------
type Ef = Effect & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function other(s: Side): Side { return s === "atk" ? "def" : "atk"; }
function clamp01(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function addLv(m: Record<string, number>, at: string, l: number) { m[at] = (m[at] ?? 0) + l; }
/** "Rule: ATK +4 for QCK (last 30 s)": a battle rule's buff, for buffSources. */
function ruleLabel(r: GlobalRule, b: { attr: string; level: number }): string {
  if (r.effect.kind === "game") return `Rule: ${b.attr} ${b.level >= 0 ? "+" : ""}${b.level} (${GAME_RULES[r.effect.id]?.text ?? "game rule"})`;
  const v = r.target.value;
  const who = r.target.by === "all" ? "everyone" : r.target.by === "style" ? `${v}-Style` : r.target.by === "tag" ? `[${v.replace(/ \/ Devil Fruit User$/, "").replace(/^Former \/ /, "")}]` : v;
  return `Rule: ${b.attr} ${b.level >= 0 ? "+" : ""}${b.level} for ${who}${r.lastSeconds !== undefined ? ` (last ${r.lastSeconds} s)` : ""}`;
}
/** A condition in a few words ("HP below 50%", "first 40 s", "5+ [Navy] on the team"), for buffSources labels. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function shortCond(c: any): string {
  const n = c.count;
  const cmp = lc(c.comparator);
  const tg = c.targets?.length ? ` ${c.targets.map(String).map((x: string) => x.trim()).join("/")}` : "";
  switch (c.type as string) {
    case "time": return cmp === "first" ? `first ${n} s` : cmp === "remaining" ? `last ${n} s` : `after ${n} s`;
    case "stat": return `HP ${cmp === "above" ? "above" : cmp === "below" ? "below" : "at"} ${n}%`;
    case "crew": case "enemies": {
      const who = c.type === "crew" ? "crew" : "enemies";
      if (cmp === "remaining") return `${n} or fewer ${who} left`;
      if (c.relative) return n === undefined ? (cmp === "exactly" ? "even numbers left" : `more ${who} left`) : `${n}+ more ${who} left`;
      const k = cmp === "more" ? `${n}+` : cmp === "less" ? `${n} or fewer` : `exactly ${n}`;
      return c.composition ? `${k}${tg} ${who === "crew" ? "on the team" : "enemies on their team"}` : `${k}${tg} ${who} left`;
    }
    case "character": return `with ${(c.families ?? []).join(" or ")}${lc(c.team).startsWith("enem") ? " as an enemy" : ""}`;
    case "defeat": return `after ${n} KOs`;
    case "debuff": return `while it has ${c.stat ?? c.attribute ?? "?"}`;
    case "multi": return ((c.conditions ?? []) as unknown[]).map(shortCond).join(lc(c.conjunction) === "or" ? " or " : " and ");
    default: return "conditional";
  }
}
/**
 * The Evade kinds whose Evade "Half Stats" also covers: the data has no separate Evade kind for them, so Half Stats
 * evades them all (user, 2026-11-13; scripts/check-effects.ts reports it if such an Evade kind ever appears).
 */
export const HALF_ONE_STAT = ["Half ATK", "Half DEF", "Half SPD", "Half RCV"];
/** An Evade status with these kinds covers `what`. */
function evadeCovers(attrs: string[] | undefined, what: string): boolean {
  if (!attrs) return false;
  return attrs.includes(what) || (HALF_ONE_STAT.includes(what) && attrs.includes("Half Stats"));
}
function targetsSelf(e: Effect) { const t = e.targeting?.targets ?? []; return !t.length || (t.length === 1 && t[0] === "self"); }
/** An ability's Revive for others / a group (a team pool, revivePools); trigger and on-arrival ones stay as before. */
function isGroupRevive(e: Effect): boolean {
  const tg = e.targeting as (Effect["targeting"] & Record<string, any>) | undefined;
  return e.effect === "boon" && !!e.attributes?.includes("Revive") && e.condition?.type !== "trigger" && !(e as Ef).onArrival
    && (!targetsSelf(e) || !!tg?.families?.length);
}

/** Resilience attribute (color / class / all) matches a unit. Dual units have no color. */
/** `owner`'s Rumble key damage bonus applies against `other` (its key pair; without one, its damage resilience). */
function keyVs(owner: U, other: U): boolean {
  const vs = owner.keyB?.vs;
  return vs ? vs.some((a) => matchesAttr(other, a)) : owner.resil.some((r) => r.type === "damage" && matchesAttr(other, r.attribute));
}
function matchesAttr(u: U, attr: string | undefined): boolean {
  if (!attr || attr === "all") return true;
  return u.rec.color === attr || (u.rec.classes as string[]).includes(attr);
}

/** Token matches never change during a battle: cached per unit record. */
const TOKEN_CACHE = new WeakMap<UnitRecord, Map<string, boolean>>();
export function matchesToken(u: U, tok: string): boolean {
  let m = TOKEN_CACHE.get(u.rec);
  if (!m) { m = new Map(); TOKEN_CACHE.set(u.rec, m); }
  let v = m.get(tok);
  if (v === undefined) { v = matchesTokenRaw(u, tok); m.set(tok, v); }
  return v;
}

/**
 * A target / condition token (docs/TAGS.md). Every form found in the data (2026-11-13):
 * - one name: color "[STR]", class "Slasher" (also "[Free Spirit]"), style "ATK-Style", tag "[Straw Hat Pirates]" / "Giant";
 * - several names in one token are ALL required (the site: "to [PSY] [Straw Hat Pirates] crew members"): "[PSY] Powerhouse",
 *   "DEF-Style [Straw Hat Pirates]", "[QCK] [Logia-type]"; "/" is either-or in one place: "Cerebral/Free Spirit [Straw Hat Pirates]";
 * - a comma list is either-or (the site's "[Elbaph Arc], [Straw Hat Pirates] crew members", "5 or more Powerhouse, Fighter crew members");
 * - the words "enemies" / "crew" only name the side ("Cerebral enemies", "[INT] enemies"); a missing "]" is tolerated.
 */
function matchesTokenRaw(u: U, tok: string): boolean {
  return tok.split(",").map((x) => x.trim()).filter(Boolean).some((term) => matchesTerm(u, term));
}
const SIDE_WORDS = new Set(["enemies", "enemy", "crew", "members", "member", "characters", "character"]);
function matchesTerm(u: U, term: string): boolean {
  if (matchesName(u, term)) return true; // a whole name, brackets or not
  const need: string[][] = []; // each entry: alternatives, one of which must match
  const rest = term.replace(/\[([^\]]*)\]?/g, (_, n: string) => { need.push([n]); return " "; });
  for (const w of rest.replace(/Free Spirit/g, "Free_Spirit").split(/\s+/)) {
    if (!w || SIDE_WORDS.has(w.toLowerCase())) continue;
    need.push(w.split("/").filter(Boolean).map((x) => x.replace(/_/g, " ")));
  }
  return need.length > 0 && need.every((alts) => alts.some((n) => matchesName(u, n)));
}
const CLASS_NAMES = new Set(["Fighter", "Slasher", "Shooter", "Striker", "Driven", "Free Spirit", "Cerebral", "Powerhouse"]);
/** One name: color, class, style or tag. */
function matchesName(u: U, raw: string): boolean {
  const n = raw.replace(/^\[|\]$/g, "").trim();
  if (!n) return false;
  if (/^(STR|DEX|QCK|PSY|INT)$/.test(n)) return u.rec.color === `[${n}]`; // dual units have no color
  if (n.endsWith("-Style")) return u.rec.style === n.slice(0, -6);
  if (CLASS_NAMES.has(n)) return (u.rec.classes as string[]).includes(n);
  return hasTag(u.rec, n);
}
/**
 * A named character ("Broggy crew member", "When Shanks is on your crew"). The kits spell some names differently from
 * the database's families: "Edward Newgate (Whitebeard)" (family "Edward Newgate"), "Senor Pink" ("Señor Pink"),
 * "Lao G." ("Lao G"), "Kuween" (family "Kyuin", unit name "Kuween"), "Don Krieg" ("Krieg"). So: either part of
 * "X (Y)", accents and dots ignored, against the unit's families or its short name. A VS form has only its chosen
 * half's names (`ownFamilies`): 4529.2 Nusjuro is not "Roronoa Zoro" here, although both names count for team
 * legality (user, 2026-11-13).
 */
const normName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim().toLowerCase();
const FAMILY_CACHE = new WeakMap<UnitRecord, Set<string>>();
export function hasFamily(rec: UnitRecord, names: readonly string[]): boolean {
  let own = FAMILY_CACHE.get(rec);
  if (!own) { own = new Set([...(rec.ownFamilies ?? rec.families), shortName(rec.name)].map(normName)); FAMILY_CACHE.set(rec, own); }
  for (const n of names) {
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(n);
    for (const x of m ? [m[1]!, m[2]!] : [n]) if (x && own.has(normName(x))) return true;
  }
  return false;
}

/**
 * A tag by the name the game's text uses. The database merges some tags with a qualifier: "[Navy]" is stored as
 * "Former / Navy", "[Royalty]" as "Former / Royalty", "[Logia-type]" as "Logia-type / Devil Fruit User"; so a name
 * matches a stored tag that equals it or has it as one of its " / " parts. Exact parts only: "[Giant]" is not
 * "Ancient Giant" or "Giant Pirate Crew" (user), "[Zoan-type]" is not "Mythical Zoan-type", "[Navy]" is not "Navy Admiral".
 */
export function hasTag(rec: UnitRecord, name: string): boolean {
  const k = name.trim().toLowerCase();
  for (const t of rec.tags) {
    const l = t.toLowerCase();
    if (l === k) return true;
    if (l.includes(" / ") && l.split(" / ").some((p) => p.trim() === k)) return true;
  }
  return false;
}

export function inRange(caster: Vec, aim: Vec, p: Vec, dir: string, size: "small" | "medium" | "large", f: number): boolean {
  if (dir === "radial") return dist(aim, p) <= TUNE.radial[size]! * f;
  const dx = aim.x - caster.x, dy = aim.y - caster.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const rx = p.x - caster.x, ry = p.y - caster.y;
  const along = rx * ux + ry * uy;
  const across = Math.abs(-rx * uy + ry * ux);
  if (dir === "forward") return along >= 0 && along <= Math.max(len, TUNE.lineLen[size]! * f) && across <= TUNE.lineW / 2;
  // sideways: a band across the caster -> target line, centred on the target
  const ax = p.x - aim.x, ay = p.y - aim.y;
  const along2 = Math.abs(ax * ux + ay * uy);
  const across2 = Math.abs(-ax * uy + ay * ux);
  return along2 <= TUNE.lineW / 2 && across2 <= (TUNE.lineLen[size]! * f) / 2;
}

/** Run one battle. */
export function simulateBattle(db: { byId: Map<number, UnitRecord> }, atk: TeamConfig, def: TeamConfig, o: SimOptions): SimResult {
  return new Battle(db, atk, def, o).run();
}
