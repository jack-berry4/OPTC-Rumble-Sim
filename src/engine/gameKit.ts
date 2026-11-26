/**
 * Game data -> simulator data, for Assault Rumble bosses read from the game's master database
 * (public/game/assault-seasons.json, scripts/db/assault.py). The bosses have their own kits (not the playable units'):
 * - abilities: structured game JSON (ArenaEffect::Health value 6500 = HP Up Lv.26: the game's per-level amounts);
 * - resistances: structured game JSON (ArenaAbility::Resist::*, DamagePercentReduction ...);
 * - specials: only the game's text ("Targets 1 enemy for ATK x 3 damage; after 40 s of battle, ..."), parsed here
 *   clause by clause; a clause it can't read is kept as a note on the boss (shown in the boss editor) to add by hand;
 * - stats: the deck's values x the Rumble potential / socket bonus (as for any unit) x the Assault Lv multipliers.
 */
import type { Attribute, Condition, Effect, Pattern, Resilience, RumbleType, TargetingPriority, UnitClass } from "../data/schema";
import { gameRule, type GlobalRule } from "./rules";
import { BOSS_TEAM_MAX, type BossDef } from "./boss";

// ---------------------------------------------------------------------------------------------------------------
// The exported file
// ---------------------------------------------------------------------------------------------------------------
export interface GameBossUnit {
  name: string; subName: string; serverId: number; group: number; baseId: number | null;
  color: string | null; classes: string[]; style: string; tags: string[];
  level: number; skillLevel: number; potentialsAndSockets: number;
  /** Max level of the unit's main-game special (absent in older exports: taken as `skillLevel`). */
  specialMax?: number | null;
  stats: { hp: number; atk: number; rcv: number; def: number; spd: number };
  plus: { hp: number; atk: number; rcv: number };
  special: { name: string; level: number; ct: number; text: string } | null;
  ability: { level: number; text: string; data: { data: GameEffect[] } | null } | null;
  resist: { text: string; data: { data: GameEffect[] } | null } | null;
  pattern: number[];
  target: number;
}
export interface GameDeck { additionalBehaviors: number; units: GameBossUnit[] }
export interface GameBossTeam { boss: number; name: string; group: number | null; levels: { level: number; deck: number; hp: number; atk: number; rcv: number }[] }
export interface GameSeason { id: number; start: number; end: number; rulesText: string; rules: GameEffect[]; teams: GameBossTeam[]; trusty: { unitId: number | null; name: string; coef: number }[] }
export interface AssaultSeasons { seasons: GameSeason[]; decks: Record<string, GameDeck> }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GameEffect = Record<string, any>;

let cache: Promise<AssaultSeasons> | undefined;
export const loadAssaultSeasons = (): Promise<AssaultSeasons> =>
  (cache ??= fetch("game/assault-seasons.json").then((r) => { if (!r.ok) throw new Error(`assault-seasons.json: ${r.status}`); return r.json() as Promise<AssaultSeasons>; }));

const COLOR_IDS: Record<number, string> = { 1: "STR", 2: "DEX", 3: "QCK", 4: "PSY", 5: "INT" };
const CLASS_IDS: Record<number, UnitClass> = { 1: "Fighter", 2: "Slasher", 3: "Striker", 4: "Shooter", 5: "Free Spirit", 6: "Driven", 7: "Cerebral", 8: "Powerhouse" };
/** Character tag ids used in the season rules (MstCharacterTag_). */
const TAG_IDS: Record<number, string> = { 1001: "Straw Hat Pirates", 3003: "Giant" };

// ---------------------------------------------------------------------------------------------------------------
// Abilities (game JSON)
// ---------------------------------------------------------------------------------------------------------------
/** ArenaEffect name -> simulator stat and the game's amount per level (docs/MECHANICS.md "Buffs and debuffs"). */
const STAT_EFFECTS: Record<string, [Attribute, number]> = {
  Health: ["HP", 250], Attack: ["ATK", 75], Defense: ["DEF", 25], Speed: ["SPD", 5], Healing: ["RCV", 50], Recovery: ["RCV", 50],
  SkillSpeed: ["Special CT", 3], Critical: ["Critical Hit", 1], CriticalRate: ["Critical Hit", 1], Guard: ["Guard", 1], Accuracy: ["Accuracy", 1], BlowAway: ["Blow Away", 1],
};

function targetFrom(t: GameEffect | undefined): Effect["targeting"] {
  if (!t || t.target_self) return { targets: ["self"] };
  const side = t.team === "ENEMY" ? "enemies" : "crew";
  const tokens = [
    ...((t.trademarks as number[] | undefined) ?? []).map((x) => `[${COLOR_IDS[x]}]`),
    ...((t.character_types as number[] | undefined) ?? []).map((x) => CLASS_IDS[x]),
  ].filter((x): x is string => !!x);
  return { targets: (tokens.length ? tokens : [side]) as NonNullable<Effect["targeting"]>["targets"] };
}
function triggerCondition(tr: GameEffect | undefined): Condition | undefined {
  if (!tr || !tr.type) return undefined;
  if (tr.type === 3 && tr.value_greater_than_or_equal_to != null) return { type: "time", comparator: "after", count: tr.value_greater_than_or_equal_to };
  if (tr.type === 3 && tr.value_less_than != null) return { type: "time", comparator: "first", count: tr.value_less_than };
  if (tr.type === 2 && tr.value_less_than_or_equal_to != null) return { type: "time", comparator: "remaining", count: tr.value_less_than_or_equal_to };
  return undefined;
}

/** A boss ability (game JSON) as effects; what it can't read goes to `notes`. */
export function abilityEffects(data: { data: GameEffect[] } | null | undefined, text = ""): { effects: Effect[]; notes: string[] } {
  const effects: Effect[] = [], notes: string[] = [];
  for (const d of data?.data ?? []) {
    const name = String(d.effect?.name ?? "").replace("ArenaEffect::", "");
    const stat = STAT_EFFECTS[name];
    const cond = triggerCondition(d.trigger);
    if (!stat || (d.trigger?.type && !cond)) { notes.push(`ability part not read: ${name || JSON.stringify(d.effect)}${d.trigger?.type && !cond ? ` (trigger ${JSON.stringify(d.trigger)})` : ""}`); continue; }
    const v = Number(d.effect.value ?? 0);
    const level = Math.round(Math.abs(v) / stat[1]);
    const enemy = d.target?.team === "ENEMY";
    effects.push({ effect: v < 0 || enemy ? "debuff" : "buff", attributes: [stat[0]], level, targeting: targetFrom(d.target), ...(cond ? { condition: cond } : {}) });
  }
  if (!data && text) notes.push(`ability (text only): ${text}`);
  return { effects, notes };
}

// ---------------------------------------------------------------------------------------------------------------
// Resistances (game JSON)
// ---------------------------------------------------------------------------------------------------------------
const RESISTS: Record<string, string> = {
  ForcedExit: "Forced Out", ActiveSkillBind: "Special Bind", ActBind: "Action Bind", Paralyze: "Paralysis", Confusion: "Confusion",
  HealingBind: "RCV Bind", SkillGaugeDischarge: "Special CT Delay", Poison: "Damage Over Time", DamageOverTime: "Damage Over Time",
  HalfStatus: "Half Stats", StatusHalf: "Half Stats", Provocation: "Provoke",
};
export function resistances(data: { data: GameEffect[] } | null | undefined, text = ""): { resilience: Resilience[]; notes: string[] } {
  const out: Resilience[] = [], notes: string[] = [];
  for (const d of data?.data ?? []) {
    const name = String(d.effect?.name ?? "").replace("ArenaAbility::", "");
    const e = d.effect ?? {};
    if (name.startsWith("Resist::")) {
      const a = RESISTS[name.slice(8)];
      if (a) out.push({ type: "debuff", attribute: a as Attribute, chance: Math.round((e.rate ?? 1) * 100) });
      else notes.push(`resistance not read: ${name}`);
    } else if (name === "DamagePercentReduction") {
      out.push({ type: "dmgtype", attribute: "Percentage Damage", percentage: Math.round((e.coefficient ?? 0) * 100) } as unknown as Resilience);
    } else if (name === "DamageReduction") {
      const vs = [...((e.trademarks as number[] | undefined) ?? []).map((x) => `[${COLOR_IDS[x]}]`), ...((e.character_types as number[] | undefined) ?? []).map((x) => CLASS_IDS[x])];
      for (const a of vs.length ? vs : ["all"]) out.push({ type: "damage", attribute: a as Resilience extends { attribute?: infer A } ? A : never, percentage: Math.round((e.coefficient ?? 0) * 100) } as Resilience);
    } else notes.push(`resistance not read: ${name}`);
  }
  if (!data && text) notes.push(`resistances (text only): ${text}`);
  return { resilience: out, notes };
}

// ---------------------------------------------------------------------------------------------------------------
// Behavior and targeting
// ---------------------------------------------------------------------------------------------------------------
/**
 * MstPiratesBehavior_ ids: 10001-10003 Normal / Power / Full attack; 10004-10009 the same in a small / medium range
 * (range attacks: the game's label is "Range Attack" / "Range Medium Attack" / "Range Power Attack"); 20xyz heals: 200 lv 1, 201 lv 2, 202 lv 3, then
 * 1 self, 2 small, 3 medium, 4 large, 5 team (read as large).
 */
export function patternOf(ids: number[]): { pattern: Pattern[]; notes: string[] } {
  const pattern: Pattern[] = [], notes: string[] = [];
  const types = ["Normal", "Power", "Full"] as const;
  for (const id of ids) {
    if (id >= 10001 && id <= 10009) {
      const type = types[(id - 10001) % 3]!;
      pattern.push(id >= 10004 ? { action: "attack", type, range: id <= 10006 ? "Small" : "Medium" } : { action: "attack", type });
    } else if (id >= 20001 && id <= 20205) {
      const level = Math.floor((id - 20001) / 100) + 1;
      const area = (["Self", "Small", "Medium", "Large", "Large"] as const)[(id % 100) - 1] ?? "Self";
      pattern.push({ action: "heal", area, level });
      if (id % 100 === 5) notes.push(`heal ${level}: heals the whole team (simulated as a large-range heal)`);
    } else notes.push(`behavior ${id} not known`);
  }
  return { pattern: pattern.length ? pattern : [{ action: "attack", type: "Normal" }], notes };
}
/** MstPiratesActionTarget_: 1 low HP, 2 high HP, 3 closest, 4 high ATK, 5 high DEF, 6 high SPD. */
export function targetRule(t: number): { criteria: Attribute; comparator?: TargetingPriority } {
  switch (t) {
    case 1: return { criteria: "HP", comparator: "lowest" };
    case 2: return { criteria: "HP", comparator: "highest" };
    case 4: return { criteria: "ATK", comparator: "highest" };
    case 5: return { criteria: "DEF", comparator: "highest" };
    case 6: return { criteria: "SPD", comparator: "highest" };
    default: return { criteria: "near" };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Specials (game text)
// ---------------------------------------------------------------------------------------------------------------
const STATUS: Record<string, string> = {
  "halve def": "Half DEF", "halve atk": "Half ATK", "halve spd": "Half SPD", "halve rcv": "Half RCV", "halve stats": "Half Stats",
  "action bind": "Action Bind", "special bind": "Special Bind", paralysis: "Paralysis", confusion: "Confusion", "forced out": "Forced Out",
  "rcv bind": "RCV Bind", "healing bind": "RCV Bind", "ability bind": "Ability Bind", provoke: "Provoke",
};
const STATS: Record<string, Attribute> = {
  atk: "ATK", def: "DEF", spd: "SPD", hp: "HP", rcv: "RCV", "special ct speed": "Special CT", "special ct": "Special CT",
  "critical hit": "Critical Hit", "critical hit rate": "Critical Hit", "critical %": "Critical Hit", critical: "Critical Hit", guard: "Guard", accuracy: "Accuracy", "blow away": "Blow Away",
};
const num = (s: string) => Number(s.replace(/,/g, ""));

/** "after 40 s of battle, ..." and the like: the condition and the rest of the clause. */
function clauseCondition(c: string): { cond?: Condition | Record<string, unknown>; rest: string } {
  let m: RegExpMatchArray | null;
  if ((m = c.match(/^after (\d+) s of battle,\s*/i))) return { cond: { type: "time", comparator: "after", count: num(m[1]!) }, rest: c.slice(m[0].length) };
  if ((m = c.match(/^(?:for the )?first (\d+) s of battle,\s*/i))) return { cond: { type: "time", comparator: "first", count: num(m[1]!) }, rest: c.slice(m[0].length) };
  if ((m = c.match(/^when (?:the )?remaining time is (\d+) s or less,\s*/i))) return { cond: { type: "time", comparator: "remaining", count: num(m[1]!) }, rest: c.slice(m[0].length) };
  if ((m = c.match(/^when (?:the )?remaining time is (?:less than|under|below) (\d+) s,\s*/i))) return { cond: { type: "time", comparator: "remaining", count: num(m[1]!) }, rest: c.slice(m[0].length) };
  if ((m = c.match(/^when (?:the )?remaining time is (?:more than|over|above) (\d+) s,\s*/i))) return { cond: { type: "time", comparator: "first", count: 100 - num(m[1]!) }, rest: c.slice(m[0].length) };
  if ((m = c.match(/^(?:during the last|when there (?:is|are)) (\d+) s (?:of battle )?(?:or less )?(?:left|remaining)?,\s*/i))) return { cond: { type: "time", comparator: "remaining", count: num(m[1]!) }, rest: c.slice(m[0].length) };
  if ((m = c.match(/^when (?:remaining )?HP is (?:at )?(\d+)% or (below|less|above|more),\s*/i))) {
    const below = /below|less/i.test(m[2]!);
    return { cond: { type: "stat", stat: "HP", comparator: below ? "below" : "above", count: below ? num(m[1]!) + 0.01 : num(m[1]!) - 0.01 }, rest: c.slice(m[0].length) };
  }
  if ((m = c.match(/^when (?:remaining )?HP is (?:below|under) (\d+)%,\s*/i))) return { cond: { type: "stat", stat: "HP", comparator: "below", count: num(m[1]!) }, rest: c.slice(m[0].length) };
  if ((m = c.match(/^when (?:remaining )?HP is (?:above|over) (\d+)%,\s*/i))) return { cond: { type: "stat", stat: "HP", comparator: "above", count: num(m[1]!) }, rest: c.slice(m[0].length) };
  return { rest: c };
}

/** "3 enemies with high current HP", "enemies within large range", "QCK-type enemies" ... -> targeting and range. */
function who(w: string): Pick<Effect, "targeting" | "range"> | undefined {
  w = w.trim().toLowerCase();
  if (w === "team" || w === "crew" || w === "all allies" || w === "team members" || w === "all teammates") return { targeting: { targets: ["crew"] } };
  // "1 teammate with high Special CT", "2 teammates with low current HP"
  let t: RegExpMatchArray | null;
  if ((t = w.match(/^(\d+) teammates? with (high|low) (?:current )?(hp|atk|def|spd|rcv|special ct)$/))) {
    return { targeting: { targets: ["crew"], count: num(t[1]!), priority: t[2] === "high" ? "highest" : "lowest", stat: STATS[t[3]!] ?? (t[3]!.toUpperCase() as Attribute) } };
  }
  if ((t = w.match(/^(\d+) teammates?$/))) return { targeting: { targets: ["crew"], count: num(t[1]!) } };
  // '"Monkey D. Luffy" teammates'
  if ((t = w.match(/^"(.+)" teammates?$/))) return { targeting: { targets: ["crew"], families: [t[1]!] } as NonNullable<Effect["targeting"]> };
  // "enemies with Paralysis", "2 enemies with Paralysis"
  if ((t = w.match(/^(?:(\d+) )?enem(?:y|ies) with (paralysis|action bind|special bind|confusion|damage over time|provoke|half stats)$/)) && !/^(\d+ )?enem(?:y|ies) with (high|low)/.test(w)) {
    const st = STATUS[t[2]!] ?? t[2]!.replace(/\w/g, (ch) => ch.toUpperCase());
    return { targeting: { targets: ["enemies"], ...(t[1] ? { count: num(t[1]) } : {}), status: [st] } as NonNullable<Effect["targeting"]> };
  }
  if (w === "self") return { targeting: { targets: ["self"] } };
  if (w === "all enemies" || w === "enemies") return { targeting: { targets: ["enemies"] } };
  let m: RegExpMatchArray | null;
  if ((m = w.match(/^enemies within (small|medium|large) range(?: \((front|forward|sideways|horizontal|radial)\))?$/))) {
    const dir = m[2] === "front" || m[2] === "forward" ? "forward" : m[2] === "sideways" || m[2] === "horizontal" ? "sideways" : "radial";
    return { targeting: { targets: ["enemies"] }, range: { direction: dir, size: m[1] as "small" | "medium" | "large" } };
  }
  const countOf = (s: string | undefined) => (s ? num(s) : undefined);
  // "2 enemies with high current HP", "1 enemy with low current Special CT"
  if ((m = w.match(/^(\d+) enem(?:y|ies) with (high|low|the highest|the lowest) (?:current )?(hp|atk|def|spd|rcv|special ct)$/))) {
    return { targeting: { targets: ["enemies"], count: countOf(m[1]), priority: /high/.test(m[2]!) ? "highest" : "lowest", stat: STATS[m[3]!] ?? (m[3]!.toUpperCase() as Attribute) } };
  }
  // "2 high ATK enemies", "1 high DEF enemy"
  if ((m = w.match(/^(\d+) (high|low) (?:current )?(hp|atk|def|spd|rcv|special ct) enem(?:y|ies)$/))) {
    return { targeting: { targets: ["enemies"], count: countOf(m[1]), priority: m[2] === "high" ? "highest" : "lowest", stat: STATS[m[3]!] ?? (m[3]!.toUpperCase() as Attribute) } };
  }
  if ((m = w.match(/^(\d+) enem(?:y|ies)$/))) return { targeting: { targets: ["enemies"], count: countOf(m[1]) } };
  // "QCK-type enemies", "1 STR/DEX/QCK-type enemy", "Shooter class enemies", "SPT Style enemies"
  if ((m = w.match(/^(?:(\d+) )?((?:str|dex|qck|psy|int)(?:\/(?:str|dex|qck|psy|int))*)-type enem(?:y|ies)$/))) {
    return { targeting: { targets: m[2]!.split("/").map((x) => `[${x.toUpperCase()}]`) as never, count: countOf(m[1]) } };
  }
  // "2 Free Spirit enemies": a class without the word "class"
  if ((m = w.match(/^(?:(\d+) )?(fighter|slasher|shooter|striker|driven|free spirit|cerebral|powerhouse) enem(?:y|ies)$/))) {
    return { targeting: { targets: [m[2]!.replace(/\w/g, (ch) => ch.toUpperCase())] as never, count: countOf(m[1]) } };
  }
  if ((m = w.match(/^(?:(\d+) )?([a-z ]+?(?:\/[a-z ]+?)*) class enem(?:y|ies)$/))) {
    const cls = m[2]!.split("/").map((x) => x.trim().replace(/\b\w/g, (ch) => ch.toUpperCase()));
    return { targeting: { targets: cls as never, count: countOf(m[1]) } };
  }
  if ((m = w.match(/^(?:(\d+) )?(atk|def|spt|dbf|rcv|bal)(?:\/(atk|def|spt|dbf|rcv|bal))* style enem(?:y|ies)$/))) {
    const styles = w.replace(/ style enem(?:y|ies)$/, "").replace(/^\d+ /, "").split("/").map((x) => `${x.toUpperCase()}-Style`);
    return { targeting: { targets: styles as never, count: countOf(m[1]) } };
  }
  return undefined;
}

/** "ATK x 3 damage", "60% chance of Halve DEF (16 s)", "SPD Down Lv.10 (20 s), ATK x 1.4 damage" -> effects. */
function what(x: string, defbypass: boolean): Effect[] | undefined {
  const one = whatOne(x.trim(), defbypass);
  if (one) return one;
  // several effects in one clause: each piece on its own (each with its own duration)
  const pieces = x.split(/,\s*(?![^()]*\))|\s+and\s+/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length < 2) return undefined;
  const out: Effect[] = [];
  for (const p of pieces) { const e = whatOne(p, defbypass); if (!e) return undefined; out.push(...e); }
  return out;
}
function whatOne(x: string, defbypass: boolean): Effect[] | undefined {
  let m: RegExpMatchArray | null;
  if ((m = x.match(/^ATK x ([\d.]+) spread damage(?: \(.*\))?$/i))) return [{ effect: "damage", type: "atk", amount: num(m[1]!), spread: true, ...(defbypass ? { defbypass: true } : {}) } as Effect];
  if ((m = x.match(/^ATK x ([\d.]+) damage$/i))) return [{ effect: "damage", type: "atk", amount: num(m[1]!), ...(defbypass ? { defbypass: true } : {}) }];
  if ((m = x.match(/^([\d,]+) (?:fixed )?damage$/i))) return [{ effect: "damage", type: "fixed", amount: num(m[1]!), ...(defbypass ? { defbypass: true } : {}) }];
  if ((m = x.match(/^HP ([\d.]+)% reduction$/i))) return [{ effect: "damage", type: "cut", amount: num(m[1]!) }];
  if ((m = x.match(/^Special CT ([\d.]+)% delay$/i))) return [{ effect: "hinderance", attributes: ["Special CT"], amount: num(m[1]!) }];
  if ((m = x.match(/^Special CT ([\d.]+)% (?:reduction|boost|charge|up)$/i))) return [{ effect: "recharge", type: "Special CT", amount: num(m[1]!) }];
  if ((m = x.match(/^Damage Over Time Lv\.?(\d+) \((\d+) s\)$/i))) return [{ effect: "damage", type: "time", level: num(m[1]!), duration: num(m[2]!) }];
  if ((m = x.match(/^(\d+)% chance (?:of|to inflict) (.+?)(?: \((\d+) s\))?$/i)) && STATUS[m[2]!.toLowerCase()]) {
    return [{ effect: "hinderance", attributes: [STATUS[m[2]!.toLowerCase()] as Attribute], chance: num(m[1]!), ...(m[3] ? { duration: num(m[3]) } : {}) }];
  }
  if ((m = x.match(/^(\d+)% chance to remove (.+)$/i))) {
    const what2 = m[2]!.replace(/ debuffs?$/i, "").split(/\/| and |, /).map((s) => s.trim().replace(/ Down$/i, "")).map((s) => STATS[s.toLowerCase()] ?? s);
    return [{ effect: "cleanse", attributes: what2 as Attribute[], chance: num(m[1]!) }];
  }
  if ((m = x.match(/^(?:HP )?(?:recovery|recovers?) (?:of )?([\d.]+)% (?:of )?(?:max )?HP$/i)) || (m = x.match(/^HP ([\d.]+)% recovery$/i))) return [{ effect: "recharge", type: "percentage", amount: num(m[1]!) }];
  if ((m = x.match(/^ATK x ([\d.]+) Counter(?: stance)?(?: \((\d+) s\))?$/i))) return [{ effect: "boon", attributes: ["Counter"], amount: num(m[1]!), ...(m[2] ? { duration: num(m[2]) } : {}) }];
  if ((m = x.match(/^(\d+)% chance (?:of|to grant) Haste$/i))) return [{ effect: "boon", attributes: ["Haste"], chance: num(m[1]!) }];
  if ((m = x.match(/^HP ([\d.]+)% healing$/i))) return [{ effect: "recharge", type: "percentage", amount: num(m[1]!) }];
  if ((m = x.match(/^Shield Lv\.?(\d+)(?: \((\d+) s\))?$/i))) return [{ effect: "buff", attributes: ["Shield"], level: num(m[1]!), ...(m[2] ? { duration: num(m[2]) } : {}) }];
  // "ATK Up Lv.3, DEF Up Lv.2 (20 s)", "Special CT Speed Up Lv.3 (20 s)", "DEF Down Lv.5 (20 s)"
  const dur = x.match(/ \((\d+) s\)$/);
  const parts = x.replace(/ \((\d+) s\)$/, "").split(/,\s*|\s+and\s+/);
  const out: Effect[] = [];
  for (const p of parts) {
    const q = p.match(/^(.+?) (Up|Down) Lv\.?(\d+)$/i);
    const stat = q && STATS[q[1]!.toLowerCase()];
    if (!q || !stat) return undefined;
    out.push({ effect: /up/i.test(q[2]!) ? "buff" : "debuff", attributes: [stat], level: num(q[3]!), ...(dur ? { duration: num(dur[1]!) } : {}) });
  }
  return out.length ? out : undefined;
}

/** A special's text as effects; clauses it can't read come back in `notes`. */
export function specialEffects(text: string): { effects: Effect[]; notes: string[] } {
  const effects: Effect[] = [], notes: string[] = [];
  for (const raw of text.replace(/<col=\d+>/g, "").split(/;\s*|:\s+(?=ta(?:r)?gets )/i)) {
    const clause = raw.trim().replace(/\.$/, "");
    if (!clause) continue;
    const { cond, rest } = clauseCondition(clause);
    const withCond = (e: Effect) => (cond ? { ...e, condition: cond as Condition } : e);
    let m: RegExpMatchArray | null;
    // "Activates Provoke on self (20 s)"
    if ((m = rest.match(/^activates (.+?) on self(?: \((\d+) s\))?$/i))) {
      effects.push(withCond({ effect: "boon", attributes: [(STATUS[m[1]!.toLowerCase()] ?? m[1]) as Attribute], targeting: { targets: ["self"] }, ...(m[2] ? { duration: num(m[2]) } : {}) }));
      continue;
    }
    // "Targets <who> [ignoring DEF] for <what>"
    if ((m = rest.match(/^ta(?:r)?gets (.+?)( ignoring DEF)? for (.+)$/i))) {
      const w = who(m[1]!);
      const ws = what(m[3]!, !!m[2]);
      if (w && ws) { for (const e of ws) effects.push(withCond({ ...e, ...w })); continue; }
    }
    notes.push(clause);
  }
  return { effects, notes };
}

// ---------------------------------------------------------------------------------------------------------------
// Bosses, rules, score
// ---------------------------------------------------------------------------------------------------------------
/**
 * A boss's stats at an Assault Lv: the deck's x the potential / socket bonus of any unit (HP 1.5%, ATK 0.75%, RCV 0.25%
 * per level, scaled by main special level / max; MECHANICS "Stats") x the level's multipliers. The deck's "plus" values
 * do not count [C 2026-11-24]: the Lv 10 screens (Akainu 78,456 / 6,235 / 1,272, Kizaru 49,840 / 5,873 / 1,273,
 * Fujitora 45,878 / 5,291 / 1,295, Blackbeard ATK 6,012 / RCV 1,029) match without the +600, and so do the Damage over
 * Time ticks in the videos (Blackbeard 141,900 / Akainu 85,956 max HP with HP Up Lv 30). Also matches the Lv 1 / Lv 4
 * screens (Blackbeard, event 22): HP 19,759 / ATK 2,201 / RCV 228 and 36,157 / 2,485 / 235 (all within 1).
 */
export function bossStats(u: GameBossUnit, lv: { hp: number; atk: number; rcv: number }) {
  // Potentials + sockets scale with main special level / max, as for player units (rumbleBaseStats): Fujitora (special
  // Lv 6 of 8) shows 3/4 of the 40 on his Lv 10 screen (45,878 HP = 9,040 x 1.45 x 3.5; user, 2026-11-24).
  const max = u.specialMax || u.skillLevel || 1;
  const f = (u.potentialsAndSockets * Math.min(u.skillLevel || max, max)) / max;
  return {
    hp: Math.round(u.stats.hp * (1 + 0.015 * f) * lv.hp),
    atk: Math.round(u.stats.atk * (1 + 0.0075 * f) * lv.atk),
    rcv: Math.round(u.stats.rcv * (1 + 0.0025 * f) * lv.rcv),
    def: u.stats.def,
    spd: u.stats.spd,
  };
}

/** A game boss as an editor boss (`notes`: what couldn't be read, to add by hand). */
export function gameBoss(u: GameBossUnit, lv: { hp: number; atk: number; rcv: number }, id: number, extra: { additionalBehaviors: number }): BossDef {
  const ab = abilityEffects(u.ability?.data, u.ability?.text);
  const rs = resistances(u.resist?.data, u.resist?.text);
  const sp = u.special ? specialEffects(u.special.text) : { effects: [], notes: [] };
  const pt = patternOf(u.pattern);
  return {
    id, baseId: u.baseId ?? 1, name: u.name,
    color: u.color ? (`[${u.color}]` as BossDef["color"]) : null, classes: u.classes as UnitClass[], tags: u.tags, families: [u.name],
    style: u.style as RumbleType,
    stats: bossStats(u, lv),
    abilities: ab.effects,
    special: u.special ? { cooldown: u.special.ct, effects: sp.effects } : undefined,
    pattern: pt.pattern, resilience: rs.resilience, target: targetRule(u.target),
    game: {
      subName: u.subName, specialName: u.special?.name, specialLevel: u.special?.level, specialText: u.special?.text,
      abilityLevel: u.ability?.level, abilityText: u.ability?.text, resistText: u.resist?.text, additionalBehaviors: extra.additionalBehaviors,
      notes: [...ab.notes, ...rs.notes, ...pt.notes, ...sp.notes.map((n) => `special part not read: ${n}`)],
    },
  };
}

/** A season's boss team at an Assault Lv: its bosses (as editor bosses). */
export function gameBossTeam(data: AssaultSeasons, season: GameSeason, team: GameBossTeam, level: number, newId: () => number): BossDef[] {
  const lv = team.levels.find((l) => l.level === level) ?? team.levels[0]!;
  const deck = data.decks[String(lv.deck)];
  // the deck's first unit is the main boss: 1 + additionalBehaviorCount_ places in the NEXT queue (measured 2026-11-24)
  return (deck?.units ?? []).slice(0, BOSS_TEAM_MAX).map((u, i) => {
    const b = gameBoss(u, lv, newId(), { additionalBehaviors: deck!.additionalBehaviors });
    return i === 0 ? { ...b, places: 1 + deck!.additionalBehaviors } : b;
  });
}

/**
 * A season's rules for one boss team, as global rules for your side (a boss team "takes 30% more damage from STR" =
 * your STR units deal 30% more to it). The rule lists boss teams by their leader's character group.
 */
export function seasonRules(season: GameSeason, team: GameBossTeam): GlobalRule[] {
  const out: GlobalRule[] = [];
  let last30 = false;
  for (const d of season.rules) {
    if (d.trigger?.type === 2 && d.trigger.value_less_than_or_equal_to === 30) { last30 = true; continue; } // the built-in rule
    if (d.trigger?.type !== 39) continue;
    if (team.group != null && !(d.trigger.group_ids as number[] | undefined)?.includes(team.group)) continue;
    const e = d.ability?.data_json?.data?.[0]?.effect ?? d.effect;
    const name = String(e?.name ?? "");
    const pct = name.endsWith("DamageReceivedEnhancement") ? Math.round((Number(e.coefficient) - 1) * 100) : name.endsWith("DamageReduction") ? -Math.round(Number(e.coefficient) * 100) : 0;
    if (!pct) continue;
    for (const c of (e.trademarks as number[] | undefined) ?? []) out.push({ enabled: true, side: "atk", target: { by: "color", value: COLOR_IDS[c]! }, effect: { kind: "damage", percent: pct } });
    for (const c of (e.character_types as number[] | undefined) ?? []) out.push({ enabled: true, side: "atk", target: { by: "class", value: CLASS_IDS[c]! }, effect: { kind: "damage", percent: pct } });
    for (const t of (e.character_tags as number[] | undefined) ?? []) if (TAG_IDS[t]) out.push({ enabled: true, side: "atk", target: { by: "tag", value: TAG_IDS[t] }, effect: { kind: "damage", percent: pct } });
  }
  if (last30) out.push(gameRule("last30"));
  return out;
}

/**
 * Assault Lv score multiplier (user's results, 2026-11-22: fought at Lv 4 / 5 / 6 -> x1.375 / x1.5 / x1.625, shown
 * rounded down as 1.37 / 1.50 / 1.62; the exact scores fit these to the point). 1 + 0.125 per level above 1; Lv 10 (max)
 * is x2.5 (user). Lv 7-9 follow the same step (assumed).
 */
export const assaultLevelMult = (level: number) => (level >= 10 ? 2.5 : 1 + 0.125 * (Math.max(1, level) - 1));
