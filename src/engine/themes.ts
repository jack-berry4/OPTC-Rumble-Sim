/**
 * Kit links and themes, for the team generator and the meta run (docs/META_PLAN.md).
 *
 * A unit's kit says which other units it works with: the groups its effects target ("[STR]", "Cerebral", "[Four
 * Emperors]", "[QCK] Free Spirit"), the crew it counts ("3 or more Shooter crew members") and the characters it needs
 * ("when Shanks is on your crew"). A team built around such a group only pays off once most of the team is in it, so
 * one-unit-at-a-time changes can't reach it from a mixed team (the meta run's league got stuck exactly there,
 * 2026-11-24). The generator uses these links for themed starting teams, for two-unit changes (a unit together with
 * a unit it buffs or needs) and for its kicks.
 */
import type { UnitRecord } from "../data/schema";
import { hasFamily, matchesToken } from "../sim/battle";
import { memberCost } from "./stats";
import { clashReason, TEAM_COST_LIMIT } from "./team";
import type { MemberConfig } from "./types";

type Db = { byId: Map<number, UnitRecord> };

const TYPES = ["STR", "DEX", "QCK", "PSY", "INT"];
const CLASSES = ["Fighter", "Slasher", "Shooter", "Striker", "Driven", "Free Spirit", "Cerebral", "Powerhouse"];
/** Tokens that name a side or everyone, not a group. */
const NOT_A_GROUP = /^(self|crew|crew members?|allies|all|enemies|enemy|characters?)$/i;

export const matchesGroup = (rec: UnitRecord, tok: string): boolean => {
  try { return matchesToken({ rec } as Parameters<typeof matchesToken>[0], tok); } catch { return false; }
};

export interface KitLinks {
  /** Groups the kit targets or counts on the crew. */
  tokens: string[];
  /** Characters the kit needs on the crew. */
  families: string[];
}

const LINKS = new WeakMap<UnitRecord, KitLinks>();

/** What a unit's kits (abilities, specials, LLB kit) target and count on: see the module docs. */
export function kitLinks(rec: UnitRecord): KitLinks {
  const had = LINKS.get(rec);
  if (had) return had;
  const tokens = new Set<string>(), families = new Set<string>();
  const walk = (x: unknown) => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    const t = (o.targeting as { targets?: unknown } | undefined)?.targets;
    if (Array.isArray(t)) for (const s of t) if (typeof s === "string" && !NOT_A_GROUP.test(s.trim())) tokens.add(s.trim());
    // conditions: "3 or more Shooter crew members" (crew + targets), "when Shanks is on your crew" (character + families)
    if (o.type === "crew" && Array.isArray(o.targets)) for (const s of o.targets) if (typeof s === "string" && !NOT_A_GROUP.test(s.trim())) tokens.add(s.trim());
    if (o.type === "character" && o.team !== "enemy" && Array.isArray(o.families)) for (const s of o.families) if (typeof s === "string") families.add(s);
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  walk(rec.kit);
  walk((rec as UnitRecord & { llbKit?: unknown }).llbKit);
  const out = { tokens: [...tokens], families: [...families] };
  LINKS.set(rec, out);
  return out;
}

/** Does `a`'s kit target, count on or need `b`? */
export function links(a: UnitRecord, b: UnitRecord): boolean {
  if (a.id === b.id) return false;
  const l = kitLinks(a);
  return (l.families.length > 0 && hasFamily(b, l.families)) || l.tokens.some((t) => matchesGroup(b, t));
}

export interface ThemeGroup { token: string; units: Set<number> }

/**
 * The groups these units' kits buff or count on, plus every type, class and type + class pair, with the units in
 * each (at least `minUnits` of them; the same units under two names count once).
 */
export function themeGroups(recs: UnitRecord[], minUnits = 6): ThemeGroup[] {
  const tokens = new Set<string>();
  for (const r of recs) for (const t of kitLinks(r).tokens) tokens.add(t);
  for (const ty of TYPES) { tokens.add(`[${ty}]`); for (const c of CLASSES) tokens.add(`[${ty}] ${c}`); }
  for (const c of CLASSES) tokens.add(c);
  const out: ThemeGroup[] = [];
  const seen = new Set<string>();
  for (const tok of [...tokens].sort()) {
    const units = recs.filter((r) => matchesGroup(r, tok)).map((r) => r.id);
    if (new Set(units.map(Math.floor)).size < minUnits) continue;
    const sig = [...units].sort((a, b) => a - b).join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ token: tok, units: new Set(units) });
  }
  return out;
}

/**
 * A team around a group: the group's members by score (one per unit, keeping the cost and family rules), filled up
 * with the best others. A member only goes in if the places left can still be filled with the cheapest members (else
 * the cost limit leaves the team at 6). `keep`: members already placed (their places stay).
 */
export function themeTeam(db: Db, members: MemberConfig[], units: Set<number>, score: (m: MemberConfig) => number, keep: (MemberConfig | null)[] = []): (MemberConfig | null)[] {
  const cost = (m: MemberConfig) => memberCost(db.byId.get(m.unitId), m);
  const sorted = [...members].sort((a, b) => score(b) - score(a));
  const cheapest = members.map(cost).sort((a, b) => a - b);
  const reserve = (slots: number) => cheapest.slice(0, slots).reduce((a, b) => a + b, 0);
  const team: (MemberConfig | null)[] = Array.from({ length: 8 }, (_, i) => keep[i] ?? null);
  let total = team.reduce((a, m) => a + (m ? cost(m) : 0), 0);
  const add = (m: MemberConfig) => {
    const free = team.indexOf(null);
    if (free < 0) return;
    const filled = team.filter(Boolean).length;
    if (total + cost(m) + reserve(7 - filled) > TEAM_COST_LIMIT) return;
    if (team.some((t) => t && (t.unitId === m.unitId || clashReason(db, t, m)))) return;
    team[free] = m; total += cost(m);
  };
  for (const m of sorted) if (units.has(m.unitId)) add(m);
  for (const m of sorted) add(m);
  return team;
}
