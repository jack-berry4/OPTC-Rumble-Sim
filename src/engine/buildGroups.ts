/**
 * A unit's build in parts ("stats" to the user): which parts are confirmed (read from the game, worked out from what
 * was read, or set by hand) and changing one part on many units at once (My Boxes: "set all sockets to max, for the
 * units where it isn't confirmed"; user, 2026-11-23).
 */
import type { UnitRecord } from "../data/schema";
import { canLimitBreak, keyAllowedAt, lbMaxNodes, LLB_EXTRA_LEVELS, MAX_CC, maxLevelFor, POTENTIAL_MAX_LEVEL, SOCKET_MAX_LEVEL, socketSlots, withDefaults } from "./stats";
import type { MemberConfig } from "./types";

export type StatGroup = "level" | "llb" | "lb" | "rumbleKey" | "cc" | "potentials" | "sockets" | "special" | "ability" | "mainSpecial";
export const STAT_GROUPS: StatGroup[] = ["level", "llb", "lb", "rumbleKey", "cc", "potentials", "sockets", "special", "ability", "mainSpecial"];
export const GROUP_NAMES: Record<StatGroup, string> = {
  level: "Level", llb: "LLB", lb: "Limit Break", rumbleKey: "Rumble key", cc: "Cotton candy", potentials: "Potentials",
  sockets: "Sockets", special: "Rumble special", ability: "Rumble ability", mainSpecial: "Main special",
};
/** The member fields each part is stored in. */
const GROUP_KEYS: Record<StatGroup, (keyof MemberConfig)[]> = {
  level: ["level"], llb: ["llbLevel", "llb"], lb: ["lbNodes", "lbKey", "limitBreak"], rumbleKey: ["rumbleKey"], cc: ["ccMode", "cc"],
  potentials: ["potentialLevels", "potentials"], sockets: ["sockets"], special: ["specialLevel"], ability: ["abilityLevel"], mainSpecial: ["mainSpecialLevel"],
};
/** The import's fact names -> parts. */
export const FACT_GROUPS: Record<string, StatGroup[]> = {
  "Level": ["level"], "LLB": ["llb"], "Limit Break": ["lb"], "Rumble key": ["rumbleKey"], "Cotton candy": ["cc"],
  "Potentials": ["potentials"], "Socket levels": ["sockets"], "Potential + socket levels": ["potentials", "sockets"],
  "Rumble special": ["special"], "Rumble ability": ["ability"], "Main special": ["mainSpecial"],
};

export const isKnown = (m: MemberConfig, g: StatGroup) => !!m.known?.includes(g);
/** The parts that differ between two builds of a unit. */
export function changedGroups(a: MemberConfig, b: MemberConfig): StatGroup[] {
  return STAT_GROUPS.filter((g) => GROUP_KEYS[g].some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])));
}
/** The build with these parts confirmed. */
export function withKnown(m: MemberConfig, groups: StatGroup[]): MemberConfig {
  if (!groups.length) return m;
  return { ...m, known: [...new Set([...(m.known ?? []), ...groups])].sort((x, y) => STAT_GROUPS.indexOf(x as StatGroup) - STAT_GROUPS.indexOf(y as StatGroup)) };
}

/** What a part can be set to on many units. */
export type BulkValue =
  | { group: "level"; to: number | "max" }
  | { group: "llb"; to: number }
  | { group: "lb"; to: "none" | "usual" | "all" }
  | { group: "rumbleKey"; to: boolean }
  | { group: "cc"; to: "none" | "account" | "full" }
  | { group: "potentials"; to: number }
  | { group: "sockets"; to: number }
  | { group: "special" | "ability" | "mainSpecial"; to: "min" | "max" };

/** The choices offered for each part (label, value). */
export const BULK_CHOICES: Record<StatGroup, [string, BulkValue["to"]][]> = {
  level: [["1", 1], ["99", 99], ["105", 105], ["110", 110], ["120", 120], ["130", 130], ["150", 150], ["max for its LLB", "max"]],
  llb: [0, 1, 2, 3, 4, 5].map((n) => [String(n), n]),
  lb: [["none (0 nodes)", "none"], ["usual max (no LB key)", "usual"], ["everything (with the LB key)", "all"]],
  rumbleKey: [["yes (where possible)", true], ["no", false]],
  cc: [["none", "none"], ["account max", "account"], ["200 each", "full"]],
  potentials: [1, 2, 3, 4, 5].map((n) => [`${n} each`, n]),
  sockets: [0, 1, 2, 3, 4, 5].map((n) => [`${n} each`, n]),
  special: [["1", "min"], ["max", "max"]],
  ability: [["1", "min"], ["max", "max"]],
  mainSpecial: [["1", "min"], ["max", "max"]],
};

/**
 * Set one part of a unit's build. `scope` "unconfirmed" leaves it alone where it's confirmed. The part set by hand
 * here isn't marked confirmed (it's a guess for many units at once).
 */
export function applyBulk(rec: UnitRecord, m: MemberConfig, v: BulkValue, scope: "unconfirmed" | "all"): MemberConfig {
  if (scope === "unconfirmed" && isKnown(m, v.group)) return m;
  const d = withDefaults(rec, m);
  const lbOk = canLimitBreak(rec);
  switch (v.group) {
    case "level": {
      if (v.to === "max") return { ...m, level: d.maxLevel };
      const to = v.to;
      // a level past what the LLB allows raises the LLB (unless the LLB is confirmed: then it stops at its max)
      const need = LLB_EXTRA_LEVELS.findIndex((x) => rec.maxLevel + x >= to);
      if (!lbOk) return { ...m, level: Math.min(to, rec.maxLevel) };
      if (need > d.llbLevel && !isKnown(m, "llb")) return { ...m, level: to, llbLevel: Math.max(0, need) };
      return { ...m, level: Math.min(to, maxLevelFor(rec, d.llbLevel)) };
    }
    case "llb": {
      if (!lbOk) return m;
      const max = maxLevelFor(rec, v.to);
      return { ...m, llbLevel: v.to, ...(d.level > max ? { level: max } : {}) };
    }
    case "lb": {
      if (!lbOk || !rec.lb) return m;
      const n = v.to === "none" ? 0 : lbMaxNodes(rec, v.to === "all");
      return { ...m, lbNodes: n, lbKey: v.to === "all" && n > lbMaxNodes(rec, false), limitBreak: undefined };
    }
    case "rumbleKey": return { ...m, rumbleKey: v.to && keyAllowedAt(rec, d.level) };
    case "cc": return v.to === "none" ? { ...m, ccMode: "none", cc: undefined } : v.to === "account" ? { ...m, ccMode: "max", cc: undefined } : { ...m, ccMode: "custom", cc: { hp: MAX_CC, atk: MAX_CC, rcv: MAX_CC } };
    case "potentials": return { ...m, potentialLevels: (rec.lb?.potentials ?? []).map(() => Math.min(POTENTIAL_MAX_LEVEL, Math.max(1, v.to))), potentials: undefined };
    case "sockets": return { ...m, sockets: Math.min(SOCKET_MAX_LEVEL, v.to) * socketSlots(rec, d.lbNodes) };
    case "special": return { ...m, specialLevel: v.to === "max" ? Math.max(1, rec.kit.specials.length) : 1 };
    case "ability": return { ...m, abilityLevel: v.to === "max" ? Math.max(1, rec.kit.abilities.length) : 1 };
    case "mainSpecial": return { ...m, mainSpecialLevel: v.to === "max" ? Math.max(1, rec.specialLevels ?? 1) : 1 };
  }
}

/** A build as compared: its set fields in key order, without which parts are confirmed. */
const canon = (m: MemberConfig) => JSON.stringify(Object.keys(m).filter((k) => k !== "known" && m[k as keyof MemberConfig] !== undefined).sort().map((k) => [k, m[k as keyof MemberConfig]]));
/** The same build of the same unit (key order, unset fields and confirmed parts don't matter). */
export const sameBuild = (a: MemberConfig, b: MemberConfig) => canon(a) === canon(b);
/**
 * A box unit changed to a new build (a team copy of it edited): the box's confirmed parts plus the parts that changed
 * (set by hand: user, 2026-11-25).
 */
export const boxEdit = (boxed: MemberConfig, next: MemberConfig): MemberConfig => {
  const { known: _k, ...rest } = next;
  void _k;
  return withKnown({ ...rest, ...(boxed.known ? { known: boxed.known } : {}) }, changedGroups(boxed, next));
};
