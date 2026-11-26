/**
 * Grand Party (docs/PLAN_MODES.md section 1). Each side has a leader: a 9th unit (it may also be on the team) whose GP
 * ability applies to its whole team for the whole battle, and whose GP burst can be launched when its condition has
 * been met (the burst gauge). Only the leader's GP ability and burst are used; the other units' GP kits are not
 * (user, 2026-11-22). One battle is simulated at a time; what earlier battles left behind (burst charge, uses left) is
 * set at the start.
 *
 * A boosted leader (one matching the season's list, e.g. "Driven or Slasher") needs 40% less to fill the burst gauge
 * (rounded up: Whitebeard's "6 teammates defeated" becomes 4, user 2026-11-22), gets one more burst use, and its team
 * gets the season's stat boosts.
 */
import type { Condition, Effect, UnitRecord } from "../data/schema";
import type { GlobalRule } from "./rules";
import type { GpLeaderConfig, Side } from "./types";

/** When a side launches its burst. */
export type GpLaunch =
  /** as soon as the gauge is full (each use) */
  | { mode: "ready" }
  /** at these battle times (seconds from the start), full or not */
  | { mode: "times"; times: number[] }
  | { mode: "never" };

/** One side's Grand Party state at the start of the battle (what earlier battles left behind) and its launch plan. */
export interface GpSideOptions {
  /** Burst gauge progress carried over (in the condition's own units: KOs, specials, damage, seconds ...). */
  startCharge?: number;
  /** Burst uses left (default: all of them). */
  usesLeft?: number;
  launch?: GpLaunch;
}

/** What makes a leader boosted, and what the boost gives. */
export interface GpBoost {
  enabled: boolean;
  /** Any of these (type / class / style / tag / name) makes a leader boosted. */
  leaders: GpLeaderMatch[];
  /** Burst requirement cut in % (game: 40). */
  reqCutPct: number;
  /** Extra burst uses (game: 1). */
  extraUses: number;
  /** Stat boosts for the boosted leader's team (rules; their side is ignored). */
  rules: GlobalRule[];
}
export interface GpLeaderMatch { by: "color" | "class" | "style" | "tag" | "name"; value: string }

export interface GpOptions {
  atk?: GpSideOptions;
  def?: GpSideOptions;
  boost?: GpBoost;
}

/**
 * The boost in the game's Grand Party season of 2026-11-01 (Nydato's Rumble Sheet, "GP rules and tips", user's picture
 * 2026-11-22): leaders that are Driven or Slasher; all characters HP, ATK, RCV, SPD, DEF and Special CT up Lv. 5 (the
 * sheet shows the game's stat icons).
 */
export const DEFAULT_GP_BOOST: GpBoost = {
  enabled: true,
  leaders: [{ by: "class", value: "Driven" }, { by: "class", value: "Slasher" }],
  reqCutPct: 40,
  extraUses: 1,
  rules: ["HP", "ATK", "RCV", "SPD", "DEF", "Special CT"].map((attr): GlobalRule => (
    { enabled: true, side: "both", target: { by: "all", value: "" }, effect: { kind: "buff", attr, level: 5 } })),
};

export const DEFAULT_GP_SIDE: Required<Pick<GpSideOptions, "launch">> = { launch: { mode: "ready" } };

const lc = (s: string | undefined) => (s ?? "").toLowerCase();

/** Whether a leader is boosted. */
export function leaderBoosted(rec: UnitRecord | undefined, boost: GpBoost | undefined): boolean {
  if (!rec || !boost?.enabled) return false;
  return boost.leaders.some((m) => {
    const v = lc(m.value.trim());
    if (!v) return false;
    switch (m.by) {
      case "color": return lc(rec.color ?? "") === `[${v}]` || lc(rec.color ?? "") === v;
      case "class": return rec.classes.some((c) => lc(c) === v);
      case "style": return lc(rec.style) === v;
      case "tag": return rec.tags.some((t) => lc(t) === v || lc(t).replace(/^\[|\]$/g, "") === v.replace(/^\[|\]$/g, ""));
      case "name": return lc(rec.name).includes(v) || rec.families.some((f) => lc(f).includes(v)) || (rec.aliases ?? []).some((a) => lc(a).includes(v));
    }
  });
}

/** The leader's GP ability effects at its level (default 5). */
export function gpAbility(rec: UnitRecord, leader: GpLeaderConfig): Effect[] {
  const list = rec.kit.gpAbilities ?? [];
  return list[Math.min(list.length, Math.max(1, leader.abilityLevel ?? 5)) - 1] ?? [];
}
/** The leader's GP burst at its level (default 5). */
export function gpBurst(rec: UnitRecord, leader: GpLeaderConfig): { uses: number; effects: Effect[] } | undefined {
  const list = rec.kit.gpSpecials ?? [];
  return list[Math.min(list.length, Math.max(1, leader.burstLevel ?? 5)) - 1];
}
export function gpCondition(rec: UnitRecord): Condition | undefined {
  return rec.kit.gpConditions?.[0];
}

/** What the burst gauge needs: the condition's count, 40% less (rounded up) for a boosted leader. */
export function burstNeed(c: Condition | undefined, boosted: boolean, boost?: GpBoost): number {
  const n = c?.count ?? 0;
  if (!boosted || !boost) return n;
  return Math.max(1, Math.ceil(n * (1 - boost.reqCutPct / 100) - 1e-9));
}
export function burstUses(rec: UnitRecord, leader: GpLeaderConfig, boosted: boolean, boost?: GpBoost): number {
  return (gpBurst(rec, leader)?.uses ?? 0) + (boosted && boost ? boost.extraUses : 0);
}

/**
 * Whether the gauge fills in whole steps (a count of KOs, specials, hits ...: the start charge can only be one of
 * those) or continuously (damage amounts, seconds). Returns the step, or 0 for continuous.
 */
export function burstStep(c: Condition | undefined): number {
  const t = lc(c?.type);
  return t === "dmgdealt" || t === "dmgreceived" || t === "time" ? 0 : 1;
}

/** The burst condition in words ("When 6 crew members are defeated"). */
export function burstConditionText(c: Condition | undefined, need?: number): string {
  if (!c) return "No burst condition";
  const x = c as Condition & Record<string, unknown>;
  const n = (need ?? c.count ?? 0).toLocaleString("en-US");
  switch (lc(c.type)) {
    case "defeat": return lc(c.team).startsWith("enem") ? `When ${n} enemies are defeated` : `When ${n} crew members are defeated`;
    case "special": return lc(c.team).startsWith("enem") ? `When the enemies use specials ${n} times` : `When the crew uses specials ${n} times`;
    case "dmgreceived": return `After the crew receives ${n} damage`;
    case "dmgdealt": return `After the crew deals ${n} damage`;
    case "damage": return `After the crew deals damage ${n} times`;
    case "hitreceived": return `After the crew receives damage ${n} times`;
    case "attack": return `After ${n} ${String(x.attack ?? "")} attacks`.replace("non-Special", "non-special").replace(/\s+/g, " ");
    case "action": return lc(String(x.action)) === "guard" ? `After guarding ${n} times` : lc(String(x.action)) === "heal" ? `After healing ${n} times` : `After ${String(x.action)} ${n} times`;
    case "debuff": {
      const a = String(x.attribute ?? "");
      return a === "Critical Hit" ? `After ${n} Critical Hits` : a === "Blow Away" ? `After ${n} Blow Aways` : `After applying status effects ${n} times`;
    }
    case "dbfreceived": return `After receiving status effects ${n} times`;
    case "time": return `After ${n} s of battle`;
    default: return `${c.type} ${n}`;
  }
}

/**
 * The counter a burst condition reads, from a side's tallies (Battle keeps them). For "time" the battle clock.
 */
export function burstProgressKey(c: Condition | undefined, side: Side): { key: GpTally; side: Side } | "time" | undefined {
  if (!c) return undefined;
  const x = c as Condition & Record<string, unknown>;
  const foe: Side = side === "atk" ? "def" : "atk";
  switch (lc(c.type)) {
    case "defeat": return lc(c.team).startsWith("enem") ? { key: "kos", side: foe } : { key: "kos", side };
    case "special": return lc(c.team).startsWith("enem") ? { key: "specials", side: foe } : { key: "specials", side };
    case "dmgreceived": return { key: "dmgReceived", side };
    case "dmgdealt": return { key: "dmgDealt", side };
    case "damage": return { key: "hitsDealt", side };
    case "hitreceived": return { key: "hitsReceived", side };
    case "attack": {
      const a = lc(String(x.attack ?? ""));
      return { key: a === "full" ? "attacksFull" : a === "power" ? "attacksPower" : a === "normal" ? "attacksNormal" : "attacks", side };
    }
    case "action": return { key: lc(String(x.action)) === "guard" ? "guards" : "heals", side };
    case "debuff": {
      const a = String(x.attribute ?? "");
      return { key: a === "Critical Hit" ? "crits" : a === "Blow Away" ? "blowAways" : "statusesApplied", side };
    }
    case "dbfreceived": return { key: "statusesReceived", side };
    case "time": return "time";
    default: return undefined;
  }
}

/**
 * Tallies per side for the burst gauges. kos: this side's units defeated; specials: specials this side used;
 * attacks*: regular attacks that landed; statusesApplied / statusesReceived: hinderances and stat downs landed.
 */
export type GpTally =
  | "kos" | "specials" | "dmgReceived" | "dmgDealt" | "hitsDealt" | "hitsReceived" | "attacks" | "attacksNormal" | "attacksPower"
  | "attacksFull" | "guards" | "heals" | "crits" | "blowAways" | "statusesApplied" | "statusesReceived";
export const newTally = (): Record<GpTally, number> => ({
  kos: 0, specials: 0, dmgReceived: 0, dmgDealt: 0, hitsDealt: 0, hitsReceived: 0, attacks: 0, attacksNormal: 0, attacksPower: 0,
  attacksFull: 0, guards: 0, heals: 0, crits: 0, blowAways: 0, statusesApplied: 0, statusesReceived: 0,
});
