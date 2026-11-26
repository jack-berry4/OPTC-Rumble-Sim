/**
 * The in-between effect format: every effect of a unit's Rumble kit with its meaning spelled out, the way the
 * simulator reads it (who, when, what, how long, how copies stack). Built from rumble.json; checked against the
 * OPTC-DB site's text by scripts/check-effects.ts. Part 2 will make the simulator run on this directly.
 */
import type { Effect } from "../data/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type Source = "ability" | "special" | "superSpecial";
export type Side = "allies" | "enemies" | "self";

export interface Spec {
  /** Position in the kit's effect list (the site lists them in the same order). */
  index: number;
  source: Source;
  kind: Effect["effect"];
  when: {
    /** always: an ability, held while its condition holds; appearance: once each time the unit comes onto the field;
     * trigger: on each of the first N events; use: when the special fires. */
    on: "always" | "appearance" | "trigger" | "use" | "edge";
    condition?: Any;
    trigger?: { event: string; times?: number; team?: string };
  };
  who: {
    side: Side;
    /** Colors, classes, styles, crew tags (any of them). Empty = the whole side. */
    groups: string[];
    families?: string[];
    excludes?: string[];
    includesSelf?: boolean;
    /** Only units under this status ("enemies with Ability Bind"). */
    status?: string;
    count?: number;
    /** How `count` units are chosen. */
    pick?: "random" | "highest" | "lowest";
    /** Threshold filter: stat above / below / exactly a value. */
    threshold?: { stat: string; cmp: string; value: number; unit: "%" | "flat" };
    by?: string;
    range?: { direction: string; size: string };
    /** Switch: which bench unit. */
    switchWith?: string;
  };
  what: {
    op:
      | "stat levels" | "shield" | "damage" | "damage over time" | "heal" | "heal over time" | "charge" | "charge delay"
      | "status" | "immunity" | "haste" | "provoke" | "counter" | "reflect" | "revive" | "on death" | "switch"
      | "cleanse" | "evade" | "lose HP" | "unknown";
    attrs: string[];
    /** Signed buff level (debuffs / penalties negative). */
    level?: number;
    amount?: number;
    /** What `amount` means. */
    unit?: string;
    chance?: number;
    repeat?: number;
    interval?: number;
    ignoresDef?: boolean;
    spread?: boolean;
    percentage?: number;
  };
  /** Seconds, or undefined. */
  duration?: number;
  /** How long it lasts, in words. */
  lasts: string;
  /** How copies combine. */
  stacking?: string;
  /** Simulator interpretations and assumptions that apply to this effect. */
  notes: string[];
}

const HELPFUL = new Set(["buff", "recharge", "boon", "cleanse", "evade"]);
const LEVEL_ATTRS = new Set(["HP", "ATK", "RCV", "DEF", "SPD", "Critical Hit", "Guard", "Accuracy", "Blow Away", "Special CT"]);
export const HINDERANCE_NAMES = new Set([
  "Paralysis", "Special Bind", "Action Bind", "Ability Bind", "RCV Bind", "Confusion", "Forced Out",
  "Half Stats", "Half ATK", "Half DEF", "Half SPD", "Half RCV", "Damage Over Time", "Special CT", "Silence",
]);

/** Which side an effect lands on (the same reading as the simulator's targetsOf). */
export function sideOf(e: Effect): Side {
  const toks = (e.targeting?.targets ?? []).map(String).filter((x) => x.trim());
  if (toks.length === 1 && toks[0] === "self" && !(e.targeting as Any)?.families?.length) return "self";
  if (!toks.length && !(e.targeting as Any)?.families?.length && (e.effect === "boon" || e.effect === "penalty")) return "self";
  const helpful = HELPFUL.has(e.effect) || e.effect === "penalty";
  if (toks.includes("enemies") || toks.some((x) => /\benem(y|ies)\b/.test(x))) return "enemies"; // also "[INT] enemies"
  // An explicit side in the data wins (targeting.team, e.g. Shiryu 4600's Provoke on 1 ATK / DBF-Style enemy)
  const team = String((e.targeting as Any)?.team ?? "").toLowerCase();
  if (team.startsWith("enem")) return "enemies";
  if (team === "crew") return "allies";
  if (toks.includes("crew") || toks.includes("self")) return "allies";
  return helpful ? "allies" : "enemies";
}

export function compileEffect(e0: Effect, index: number, source: Source): Spec {
  const e = e0 as Any;
  const tg = (e.targeting ?? {}) as Any;
  const toks: string[] = (tg.targets ?? []).map(String).filter((x: string) => x.trim());
  const attrs: string[] = (e.attributes ?? []).map(String);
  const side = sideOf(e0);
  const notes: string[] = [];
  const c = e.condition;
  const trig = c?.type === "trigger";
  const when: Spec["when"] =
    source !== "ability" ? { on: "use", condition: c }
    : trig ? { on: "trigger", trigger: { event: String(c.stat), times: c.count, team: c.team }, condition: undefined }
    : e.onArrival ? { on: "appearance", condition: c }
    : { on: "always", condition: c };
  const pr = tg.priority as string | undefined;
  const who: Spec["who"] = {
    side,
    groups: toks.filter((x) => x !== "self" && x !== "crew" && x !== "enemies"),
    families: tg.families,
    excludes: tg.excludes?.map(String),
    includesSelf: side !== "self" && toks.includes("self") ? true : undefined,
    status: tg.status === undefined ? undefined : ([] as unknown[]).concat(tg.status).map(String).join(" or "),
    count: tg.count,
    pick: tg.count && (pr === "highest" || pr === "lowest") ? pr : tg.count ? "random" : undefined,
    by: pr === "highest" || pr === "lowest" ? tg.stat : undefined,
    threshold: pr === "above" || pr === "below" || pr === "exactly"
      ? { stat: String(tg.stat), cmp: pr, value: tg.percentage ?? tg.amount ?? 0, unit: tg.percentage !== undefined ? "%" : "flat" } : undefined,
    range: e.range,
    switchWith: tg.switch,
  };
  if (who.pick === "random") notes.push("count without a rule: picked at random among those that qualify (special stream) [C]");
  const what: Spec["what"] = { op: "unknown", attrs, chance: e.chance, repeat: e.repeat, interval: e.interval ?? e["interva"] };
  const ability = source === "ability";
  let lasts = e.duration ? `${e.duration} s` : ability ? "while the owner is on the field" : "the rest of the battle";
  let stacking: string | undefined;
  switch (e.effect) {
    case "buff": case "debuff": case "penalty": {
      const sign = e.effect === "buff" ? 1 : -1;
      if (attrs.includes("Shield")) {
        what.op = "shield"; what.amount = 500 * (e.level ?? 1); what.unit = "HP soaked (500 per level)";
        stacking = "adds while copies overlap [L]";
        if (ability) { lasts = e.duration ? `${e.duration} s` : "until broken"; notes.push("an ability Shield is given once, when its condition first holds [C]"); }
        break;
      }
      if (e.effect === "penalty" && attrs.length === 1 && attrs[0] === "HP" && e.amount) { what.op = "lose HP"; what.amount = e.amount; what.unit = "% of current HP"; break; }
      if (attrs.every((a) => LEVEL_ATTRS.has(a))) {
        what.op = "stat levels"; what.level = sign * (e.level ?? 1); what.unit = "levels";
        if (ability && when.on === "always") { lasts = c ? "while the condition holds and the owner is on the field (and not Ability-Bound)" : "while the owner is on the field (and not Ability-Bound)"; stacking = "adds to every other source"; }
        else if (when.on === "trigger") { lasts = e.duration ? `${e.duration} s` : "the rest of the battle, while the owner is on the field"; stacking = "one more copy per firing [C]"; }
        else stacking = "a copy landing while one runs adds its levels while they overlap; each ends on its own time [C]";
        break;
      }
      // penalties naming hinderances (Special Bind, Paralysis, Half Stats, RCV Bind ...)
      what.op = "status"; notes.push("a penalty: the special's own cost, on its own side [C]");
      break;
    }
    case "damage":
      if (e.type === "time") { what.op = "damage over time"; what.level = e.level; what.unit = "5% of max HP per level, each regular attack it makes [C]"; stacking = "levels add [C]"; break; }
      what.op = "damage";
      what.amount = e.type === "random" ? undefined : e.amount;
      what.unit = e.type === "atk" ? "x ATK (with buffs), then the DEF curve" : e.type === "atkbase" ? "x base ATK (GP only)" : e.type === "fixed" ? "fixed HP, ignores DEF, Shield and Reflect" : e.type === "cut" ? "% of current HP" : e.type === "random" ? `fixed ${e.amountrange?.[0]}-${e.amountrange?.[1]}` : String(e.type);
      what.ignoresDef = !!e.defbypass || e.type === "fixed";
      what.spread = !!e.spread;
      if (e.defbypass) notes.push("ignores DEF, so also Shields and Damage Reflect [C]");
      if (e.spread) notes.push("spread: the amount is split evenly over everyone hit");
      break;
    case "recharge":
      if (e.type === "Special CT") { what.op = "charge"; what.amount = e.amount; what.unit = "% of the special bar [C]"; }
      else {
        what.op = what.interval ? "heal over time" : "heal";
        what.amount = e.amount;
        what.unit = e.type === "RCV" ? "x the giver's RCV" : e.type === "percentage" ? "% of max HP" : "HP";
        if (what.interval) notes.push(`every ${what.interval} s while it lasts [A]`);
        notes.push("RCV Bind on the target stops it [C]");
      }
      break;
    case "hinderance":
      if (attrs.includes("Special CT") && e.amount) { what.op = "charge delay"; what.amount = e.amount; what.unit = "% of the special bar removed [C]"; break; }
      what.op = "status";
      notes.push("rolls its chance per target, then the target's resistance, immunity and Evade can stop it");
      if (attrs.includes("Paralysis")) notes.push("Paralysis: while it lasts every regular action plays out but does nothing (no hit, no dice) [user]");
      stacking = "a new copy runs alongside the old one";
      break;
    case "boon": {
      const a = attrs[0] ?? "";
      const map: Record<string, Spec["what"]["op"]> = { Haste: "haste", Provoke: "provoke", Counter: "counter", "Damage Reflect": "reflect", Revive: "revive", "On Death": "on death", Switch: "switch", Shield: "shield" };
      what.op = map[a] ?? (attrs.every((x) => HINDERANCE_NAMES.has(x)) ? "immunity" : "unknown");
      if (what.op === "counter") { what.amount = e.amount ?? 1; what.unit = "x the incoming hit (before the target's DEF), then the attacker's DEF [C]"; }
      if (what.op === "reflect") { what.percentage = e.percentage; what.amount = e.amount; what.unit = `${e.percentage ?? 0}% less damage taken, ${e.amount ?? 0}x sent back [C]`; }
      if (what.op === "revive") { what.amount = e.amount; what.unit = "% of max HP, on the first KO"; }
      if (what.op === "haste") lasts = "until its next pick";
      if (what.op === "immunity") notes.push("immune to the named hinderances for the duration [C]");
      if (what.op === "revive" || what.op === "on death") lasts = `${e.repeat ?? 1} time(s)`;
      if (ability && when.on === "always" && c?.type === "time") { when.on = "edge"; notes.push("a time-conditioned boon is given once when the condition turns true, and again to units appearing while it holds [C]"); }
      break;
    }
    case "cleanse": what.op = "cleanse"; lasts = "once"; break;
    case "evade": what.op = "evade"; what.unit = "chance to shrug off the named effects"; break;
  }
  if (["damage", "heal", "charge", "charge delay", "lose HP", "cleanse", "switch"].includes(what.op)) { lasts = "instant"; stacking = undefined; }
  if (ability && when.on === "always" && what.op !== "stat levels" && what.op !== "unknown") {
    when.on = "edge";
    if (!notes.some((n) => n.startsWith("a time-conditioned"))) notes.push("not a stat level: applied once each time its condition turns true [A]");
  }
  if (source === "special" && e.condition) notes.push("the condition is checked when the special fires");
  return { index, source, kind: e.effect, when, who, what, duration: e.duration, lasts, stacking, notes };
}

export const compileEffects = (effects: Effect[], source: Source): Spec[] => effects.map((e, i) => compileEffect(e, i, source));

// ---------------------------------------------------------------------------------------------------------------
// Plain text of the simulator's reading (shown next to the site's text)

const cmpWord = (c: string) => ({ more: "or more", less: "or fewer", exactly: "exactly", above: "above", below: "below" } as Record<string, string>)[String(c).toLowerCase()] ?? c;

export function conditionText(c: Any): string {
  if (!c) return "";
  const n = c.count;
  switch (c.type) {
    case "time": return c.comparator === "first" ? `in the first ${n} s` : c.comparator === "remaining" ? `with ${n} s or less left` : `after ${n} s`;
    case "stat": return `while its ${c.stat} is ${cmpWord(c.comparator)} ${n}%`;
    case "crew": case "enemies": {
      const who = c.type === "crew" ? "crew" : "enemy";
      const tg = c.targets?.length ? ` ${c.targets.join("/")}` : "";
      const scope = c.composition ? " on the team (all 8, bench and KO'd included)" : " remaining (not KO'd, bench included)";
      if (String(c.comparator).toLowerCase() === "remaining") return `while ${n} or fewer ${who} units remain`;
      const rel = n === undefined ? (String(c.comparator).toLowerCase() === "exactly" ? "as many" : "at least 1 more") : `${n} ${cmpWord(c.comparator)} more`;
      return `with ${c.relative ? rel : `${n} ${cmpWord(c.comparator)}`}${tg} ${who} units${c.relative ? " remaining than the other side" : scope}`;
    }
    case "character": return `with ${(c.families ?? []).join(" or ")} on the ${String(c.team ?? "").toLowerCase().startsWith("enem") ? "enemy team" : "crew"} (anywhere on the team, KO'd included)`;
    case "debuff": return `while it has ${c.stat}`;
    case "defeat": return `after ${n} defeats`;
    case "multi": return (c.conditions ?? []).map(conditionText).join(String(c.conjunction).toLowerCase() === "or" ? " OR " : " AND ");
    case "mode": return `in ${c.mode} (never in Pirate Rumble)`;
    default: return JSON.stringify(c);
  }
}

export function specText(s: Spec): string {
  const w = s.when;
  const whenTxt =
    w.on === "trigger" ? `On each of the first ${w.trigger?.times ?? "∞"} times it ${w.trigger?.event}`
    : w.on === "appearance" ? "On appearance"
    : w.on === "edge" ? "Once, when it starts to hold"
    : w.on === "use" ? "On use"
    : "Always";
  const cond = w.condition ? ` (${conditionText(w.condition)})` : "";
  const h = s.who;
  const whoTxt = h.side === "self" ? "self"
    : `${h.count ? `${h.count} ` : ""}${h.groups.length ? h.groups.join("/") + " " : ""}${h.side}${h.families?.length ? ` + ${h.families.join("/")}` : ""}${h.includesSelf ? " incl. self" : ""}`
      + (h.pick && h.pick !== "random" ? ` (${h.pick} ${h.by})` : h.pick === "random" ? " (random)" : "")
      + (h.threshold ? ` with ${h.threshold.stat} ${h.threshold.cmp} ${h.threshold.value}${h.threshold.unit === "%" ? "%" : ""}` : "")
      + (h.status ? ` with ${h.status}` : "")
      + (h.excludes?.length ? ` except ${h.excludes.join("/")}` : "")
      + (h.range ? ` in a ${h.range.size} ${h.range.direction} range` : "");
  const x = s.what;
  const val =
    x.op === "stat levels" ? `${x.attrs.join("/")} ${x.level! >= 0 ? "+" : ""}${x.level} levels`
    : x.op === "status" || x.op === "immunity" || x.op === "evade" || x.op === "cleanse" ? `${x.op} ${x.attrs.join("/")}`
    : x.op === "damage over time" ? `Damage over Time lv ${x.level}`
    : `${x.op}${x.amount !== undefined ? ` ${x.amount}` : ""}${x.unit ? ` (${x.unit})` : ""}`;
  const extra = [x.chance !== undefined && x.chance < 100 ? `${x.chance}% chance` : "", x.repeat && x.repeat > 1 ? `${x.repeat} times` : "", x.spread ? "spread" : ""].filter(Boolean).join(", ");
  return `${whenTxt}${cond} → ${whoTxt}: ${val}${extra ? `, ${extra}` : ""}${s.lasts === "instant" ? "" : `; lasts ${s.lasts}`}${s.stacking ? `; ${s.stacking}` : ""}.`;
}
