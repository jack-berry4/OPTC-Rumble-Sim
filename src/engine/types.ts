
import type { BossDef } from "./boss";

/** The game mode being simulated: regular Pirate Rumble, Grand Party, or Assault Rumble (docs/PLAN_MODES.md). */
export type GameMode = "rumble" | "gp" | "assault";

/** One unit on a team, with its investment levels. */
export interface MemberConfig {
  unitId: number;
  /** Rumble special level 1-10. Default 10. */
  specialLevel?: number;
  /** Rumble ability level 1-5. Default 5. */
  abilityLevel?: number;
  /**
   * The unit's main-game (story / treasure map) special level, which scales the Rumble stat bonus from potentials and
   * sockets: stat x (1 + k x (potential + socket levels) x level / max). Max is UnitRecord.specialLevels (1 for units
   * without a main special). Default: maxed.
   */
  mainSpecialLevel?: number;
  /** Level Limit Break level 0-5 (raises max level to 105/110/120/130/150). Default 0. */
  llbLevel?: number;
  /** @deprecated use llbLevel. true = LLB 5. */
  llb?: boolean;
  /** Unit level. Default: max level. */
  level?: number;
  /** @deprecated use lbNodes / lbKey. */
  limitBreak?: "none" | "rainbow" | "expansion";
  /** Limit Break nodes unlocked (0 to the unit's node count). Default: all reachable nodes. */
  lbNodes?: number;
  /** Limit Break key used: unlocks the nodes after "LOCKED WITH KEY" (Limit Break expansion). Default true. */
  lbKey?: boolean;
  /** Rumble key given (needs level 120+): boosts stats, special charge, damage dealt and taken by key tier. */
  rumbleKey?: boolean;
  /**
   * Not obtainable in the game (admin / test unit): no limits on level, Limit Break, cotton candy or the Rumble key,
   * exact stats allowed, costs 0, and ignores the duplicate and family rules.
   */
  illegal?: boolean;
  /** Cotton candy: "max" follows the team's account maximum (default), "none" is 0 in every stat, "custom" uses `cc`. */
  ccMode?: "none" | "max" | "custom";
  /** Custom cotton candy per stat (+5 HP / +2 ATK / +1 RCV each; legal units up to 200 each, over the account max too). */
  cc?: { hp: number; atk: number; rcv: number };
  /** Total potential ability levels (0-15). Default 15. */
  potentials?: number;
  /**
   * Level of each potential ability, in Limit Break order (1-5 once unlocked by its Limit Break node; locked ones
   * count 0). Replaces `potentials` when set.
   */
  potentialLevels?: number[];
  /** Total socket levels (0-25). Default 25. */
  sockets?: number;
  /**
   * Override: the stats shown on the character screen (already including LB and cotton candy).
   * If set, level / limitBreak / cc are ignored.
   */
  displayed?: { hp: number; atk: number; rcv: number };
  /** Override for potentials + sockets combined. */
  lbNodesAndSockets?: number;
  /**
   * Exact Rumble stats copied from the game's Rumble status screen. Used as-is, in custom mode only
   * (level, LLB, Limit Break, cotton candy, potentials, sockets and Rumble key stat boosts are ignored).
   */
  exact?: { hp: number; atk: number; rcv: number; def?: number; spd?: number };
  /**
   * Assault Rumble boss: a made-up unit (src/engine/boss.ts). `unitId` is its generated id (bossId), the unit record
   * is built from this definition, and the stats are `boss.stats` as typed in (no level, Limit Break or cotton candy).
   */
  boss?: BossDef;
  /**
   * The parts of the build that are confirmed: read from the game (screenshots, box video), worked out from what was
   * read, or set by hand (src/engine/buildGroups.ts StatGroup names). The rest are a default build's guesses.
   */
  known?: string[];
}

/** Grand Party: the team's leader, a 9th unit (may be the same as one on the team) whose GP ability and burst apply. */
export interface GpLeaderConfig {
  /** The leader's build (its stats: leader-based burst damage uses its ATK). */
  member: MemberConfig;
  /** GP ability level 1-5 (default 5). */
  abilityLevel?: number;
  /** GP burst level 1-5 (default 5). */
  burstLevel?: number;
}

/**
 * 8 positions: indices 0-4 are field slots 1-5, 5-7 the bench. Any position may be empty (null): an empty field slot
 * just has no unit, and bench units come in from the leftmost filled bench position.
 */
export interface TeamConfig {
  name?: string;
  /** The account's cotton candy maximum (each stat up to 200); units on "max" follow it. Default 200/200/200. */
  maxCc?: { hp: number; atk: number; rcv: number };
  members: (MemberConfig | null)[];
  /** Title and authors of the saved / shared team this came from (authors can only be added to). */
  meta?: { title: string; authors: string[] };
  /** Grand Party only: the leader. */
  leader?: GpLeaderConfig;
}

export type Side = "atk" | "def";

export interface BattleEvent {
  /** Battle time (the in-game timer). */
  t: number;
  /** Full game time mode: time on the real-time timeline (battle time plus every cut-in so far). */
  wall?: number;
  kind:
    | "action" | "special" | "hit" | "miss" | "heal" | "effect" | "ko" | "enter" | "paralyzed"
    | "wait" | "interrupt" | "unsupported" | "end" | "roll" | "burst";
  /** uid of the unit the event is about. */
  actor?: string;
  target?: string;
  amount?: number;
  text: string;
  /** Specials: one caption per effect that went off, in the order the game shows them. */
  parts?: string[];
  /** Specials: the units each of those parts KO'd (uids), same order as `parts`. */
  partKos?: string[][];
  /** Specials: HP each of those parts changed (uid -> HP after it), same order as `parts`. */
  partHp?: Record<string, number>[];
  /** Specials: the units each of those parts landed on (uids), same order as `parts`. */
  partTargets?: string[][];
  /** Specials: Shield each of those parts changed (uid -> shield after it), same order as `parts`. */
  partShield?: Record<string, number>[];
  /** Specials: damage each of those parts sent into a Shield (uid -> damage), same order as `parts`. */
  partShieldHit?: Record<string, number>[];
  /** Specials: who each of those parts Forced Out, same order as `parts`. */
  partOut?: string[][];
  /** Specials: what each of those parts did to its targets (helped, hindered, damaged), same order as `parts`. */
  partKinds?: ("up" | "down" | "hit")[];
  /** Detailed-log line (rolls and probabilities, damage maths, queue and targeting reasons). */
  detail?: boolean;
}

export interface StatusSnapshot {
  /** Evade only: what this Evade protects against, by the names the game uses (e.g. "Stats Down", "Confusion", "Damage Ignoring DEF", "Fixed Damage"). */
  evades?: string[];
  /** e.g. "Paralysis", "Provoke", "Damage Over Time", "Evade: Action Bind". */
  attr: string;
  /** Seconds left. */
  remaining: number;
  level?: number;
  /** 0-1 for Paralysis / Evade chances. */
  chance?: number;
}

/** One part of a unit's buff / debuff level on a stat, for the "where does this come from" breakdown. */
export interface BuffSource {
  /** Levels this part adds (negative = debuff). */
  level: number;
  /** What kind of thing gave it. */
  kind: "special" | "ability" | "rule" | "other";
  /** The unit it came from (uid, e.g. "A4"), when a unit gave it. */
  from?: string;
  /** Short plain description, e.g. "A4 Loki: special", "D1 Imu: ability (while HP above 50%)", "Rule: ATK +2 for Slashers". */
  label: string;
  /** Seconds left; missing = lasts while its condition holds (abilities, rules). */
  remaining?: number;
}

export interface UnitSnapshot {
  uid: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ct: number;
  ctMax: number;
  state: "bench" | "idle" | "acting" | "dead" | "forced";
  /** Unit this one is currently attacking (moving in / lining up / swinging), for the attack lane. */
  targetUid?: string;
  /** In attack position (from 0.2 s after arriving until it leaves): the game shows the attack strip only then. */
  engaged?: boolean;
  /** Remaining Shield points. */
  shield: number;
  /** Queue gauge: grows by SPD per second, reset to 0 when the unit is picked to act. */
  gauge: number;
  /** Super special condition met and the team still has super specials left. */
  superReady: boolean;
  /** Human-readable current activity, e.g. "Attacking D2", "Being attacked", "Special", "Returning". */
  activity: string;
  /** Acting, about to act, or being attacked: can't be picked to act or be targeted. */
  occupied: boolean;
  /** Net buff/debuff levels per stat (abilities + specials), non-zero only. */
  buffs: Record<string, number>;
  /** Forced Out: seconds until it comes back. */
  outFor?: number;
  /** Seconds until the soonest timed part of each stat's buff / debuff ends (missing = only untimed sources). */
  buffEnds?: Record<string, number>;
  /** Where each stat's net level in `buffs` comes from: every part, by stat (simulator v3; sums to `buffs[stat]`). */
  buffSources?: Record<string, BuffSource[]>;
  /** Current stats with every buff, debuff and half-stat status applied (simulator v3). */
  stats?: { atk: number; def: number; spd: number; rcv: number };
  /** Timed statuses (hinderances, boons). */
  statuses: StatusSnapshot[];
}

/** A cut-in that stops the battle (bench entry, special, ability); lengths: `CUT` in src/sim/battle.ts. */
export interface CutIn {
  kind: "bench" | "special" | "superSpecial" | "ability" | "burst";
  /** Battle time it happened at, and its start on the real-time timeline (= t when full game time is off). */
  t: number;
  wall: number;
  length: number;
  actor?: string;
  text: string;
}

export interface Frame {
  /** Timeline time: battle time, or real time (battle time plus cut-ins) in full game time mode. */
  t: number;
  /** Battle time (the in-game timer; stands still during a cut-in). */
  clock: number;
  /** The cut-in playing (full game time mode). */
  cutIn?: CutIn;
  units: UnitSnapshot[];
  /** The NEXT list: units on the field not already acting, in queue order (top 5). */
  queue: string[];
  /** Super specials each team can still launch (3 per team per battle; the game's flames by the unit counts). */
  supersLeft?: Record<Side, number>;
  /** Grand Party: each side's burst gauge (progress toward the next burst, its requirement, uses left). */
  gp?: Partial<Record<Side, { progress: number; need: number; uses: number }>>;
  /** Assault Rumble: the Damage Score so far (all damage dealt to the bosses, past 0 HP too), as the game shows it. */
  score?: number;
}

export interface UnitSummary {
  uid: string;
  unitId: number;
  /** The unit's build (levels, LLB), for its special / ability text. */
  member?: MemberConfig;
  name: string;
  side: Side;
  slot: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  actions: number;
  specials: number;
  kos: number;
  /** Assault Rumble: the boss reached 0 HP (it stays on the field), and when. */
  zeroAt?: number;
  /** Assault Rumble: the boss team's main boss (several NEXT places; the long HP gauge and BOSS label). */
  mainBoss?: boolean;
}
