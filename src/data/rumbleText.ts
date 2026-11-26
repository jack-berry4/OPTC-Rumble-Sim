/**
 * Rumble ability / special / resistance text, worded exactly as the OPTC-DB website shows it: a port of the filters in
 * 2Shankz/optc-db.github.io `characters/js/directives.js` (patternToString, resilienceToString, abilityToString,
 * conditionToString, rangeToString, targetToString), fetched 2026-11-11. The site builds HTML; here each effect is one
 * line of plain text, with Power / Full attacks and heals marked the same way the site styles them (no HTML).
 *
 * Where the site has no case and would print "UNKNOWN ..." (multi and mode conditions, Evade effects, most super
 * special conditions), the lines are marked ADDED below and use our own wording.
 */
import type { Effect, Pattern, Resilience, SuperCondition } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const num = (n: number) => new Intl.NumberFormat("en-US").format(n);
const arrayToString = (array: unknown[] | undefined) => new Intl.ListFormat("en").format((array ?? []).map(String));
const arrayToStringOr = (array: unknown[] | undefined) => new Intl.ListFormat("en", { type: "disjunction" }).format((array ?? []).map(String));

export function patternToString(input: Pattern | undefined): string {
  if (!input) return "N/A";
  if (input.action === "attack") return input.range ? `${input.range} Range ${input.type} Attack` : `${input.type} Attack`;
  if (input.action === "heal") {
    const area = input.area[0]!.toUpperCase() + input.area.slice(1);
    return `Level ${input.level} ${area === "Self" ? area : area + " Range"} Heal`;
  }
  return "UNKNOWN";
}

export function resilienceToString(input: Resilience | undefined): string {
  if (!input) return "N/A";
  const r = input as Any;
  switch (r.type) {
    case "dmgboost": return `${conditionToString(r.condition)}${r.amount}x boost to ${r.attribute} enemies.`;
    case "healing": return `${conditionToString(r.condition)}Heals ${r.amount} HP every ${r.interval} seconds.`;
    case "damage": return `${conditionToString(r.condition)}${r.percentage}% reduction to ${r.attribute} damage.`;
    case "debuff": return `${conditionToString(r.condition)}${r.chance}% to resist ${r.attribute}.`;
    // ADDED: the site has no case for damage-type resistances
    case "dmgtype": return `${conditionToString(r.condition)}${r.percentage}% reduction to ${r.attribute}.`;
    default: return "";
  }
}

export function conditionToString(condition: Any): string {
  if (!condition) return "";
  switch (condition.type) {
    case "stat":
      return `When ${condition.stat} is ${condition.comparator} ${condition.count}%, `;
    case "time":
      switch (condition.comparator) {
        case "first": return `For the first ${condition.count} seconds, `;
        case "after": return `After the first ${condition.count} seconds, `;
        case "remaining": return `When there are ${condition.count} seconds or less remaining, `;
        default: return `UNKNOWN TIME CONDITION ${JSON.stringify(condition)}`;
      }
    case "crew":
    case "enemies":
      return `When there is ${
        condition.comparator == "exactly"
          ? `${condition.comparator} ${condition.count} ${condition.type}`
          : `${condition.count} or ${condition.comparator} ${condition.type}`
      } ${condition.targets ? arrayToString(condition.targets) + " characters" : ""} ${
        condition.relative ? (condition.type == "crew" ? " than the enemy team" : " than your crew") : ""
      } ${condition.composition ? "" : " remaining"}, `;
    case "trigger":
      return `The first ${condition.count} times ${
        condition.stat.includes("defeated")
          ? condition.team
            ? condition.team + (condition.targets ? arrayToString(condition.targets) : "") + " characters are "
            : ""
          : "this character "
      }${
        condition.stat == "takes damage" || condition.stat.includes("receives") || condition.stat.includes("defeated")
          ? condition.stat
          : "lands a " + condition.stat
      }, `;
    case "debuff":
      return `If this character has ${condition.stat}, `;
    case "defeat":
      return `When ${condition.count} characters ${
        condition.team == "enemies" ? "on the enemy team " : condition.team == "crew" ? "on your crew " : ""
      }are defeated, `;
    case "character":
      return `When ${arrayToStringOr(condition.families)} ${condition.families.length > 1 ? "are" : "is"} ${
        condition.team == "enemies" ? "on the enemy team" : condition.team == "crew" ? "on your crew" : ""
      }, `;
    // ADDED: the site prints "UNKNOWN CONDITION" for these
    case "multi": {
      const parts = (condition.conditions ?? []).map((c: Any) => conditionToString(c).replace(/, $/, ""));
      const joined = parts.map((p: string, i: number) => (i ? p[0]!.toLowerCase() + p.slice(1) : p)).join(String(condition.conjunction).toLowerCase() === "or" ? ", or " : ", and ");
      return `${joined}, `;
    }
    case "mode":
      return `In ${condition.mode ?? "another mode"}, `;
    default:
      return `UNKNOWN CONDITION ${JSON.stringify(condition)}`;
  }
}

function rangeToString(range: Any): string {
  if (!range) return "";
  return ` in a ${range.size}, ${range.direction} range`;
}

function targetToString(target: Any): string {
  if (!target) return "";
  let targetStr = arrayToString(target.targets);
  const excludeStr = arrayToString(target.excludes);
  if (targetStr == "crew") targetStr = "crew member(s)";
  if (targetStr == "enemies") {
    if (!target.count) targetStr = "all enemies";
    else if (target.count == 1) targetStr = "enemy";
  }
  const targets: string[] = target.targets ?? [];
  let retVal = ` to ${target.count ? target.count + " " : ""}${targetStr}${target.families ? " " + arrayToStringOr(target.families) : ""}${
    targets.includes("self") || targets.includes("crew") || targets.includes("enemies") ? "" : target.count == 1 ? " character" : " characters"
  }`;
  retVal += `${target.excludes ? ", excluding " : ""}${target.excludes ? excludeStr : ""}${
    target.excludes
      ? target.excludes.includes("self") || target.excludes.includes("crew") || target.excludes.includes("enemies")
        ? ""
        : target.count == 1 ? " character" : " characters"
      : ""
  }`;
  retVal += `${
    target.stat
      ? " with " +
        (target.percentage
          ? (target.priority == "above" || target.priority == "below" || target.priority == "exactly" ? target.priority + " " : "a ") + target.percentage + "%"
          : "the " + target.priority) +
        " " + target.stat
      : ""
  }`;
  return retVal;
}

/** One line per effect, as the site's abilityToString / specialToString write them. */
export function effectLines(input: Effect[] | undefined): string[] {
  if (!input) return ["N/A"];
  return input.map((effect: Any) => {
    let e = conditionToString(effect.condition);
    switch (effect.effect) {
      case "buff":
        e += `Applies Lv.${effect.level} ${arrayToString(effect.attributes)} up buff`;
        break;
      case "debuff":
        e += `Inflicts Lv.${effect.level} ${arrayToString(effect.attributes)} down debuff`;
        break;
      case "damage":
        switch (effect.type) {
          case "time": e += `Deals Lv.${effect.level} Damage Over Time`; break;
          case "atk": e += `Deals ${num(effect.amount)}x ${effect.leader ? "Leader's " : ""}ATK in damage`; break;
          case "atkbase": e += `Deals ${num(effect.amount)}x ${effect.leader ? "Leader's " : ""}base ATK in damage`; break;
          case "fixed": e += `Deals ${num(effect.amount)} fixed damage`; break;
          case "random": e += `Randomly deals between ${num(effect.amountrange[0])}-${num(effect.amountrange[1])} fixed damage`; break;
          case "cut": e += `${num(effect.amount)}% health cut`; break;
          default: e += "TODO:  " + JSON.stringify(effect);
        }
        e += effect.defbypass ? ` that will ignore DEF` : ``;
        break;
      case "recharge":
        switch (effect.type) {
          case "RCV": e += `Restores ${num(effect.amount)}x RCV of HP`; break;
          case "percentage": e += `Restores ${num(effect.amount)}% of HP`; break;
          case "fixed": e += `Restores ${num(effect.amount)} fixed HP`; break;
          case "Special CT": e += `Reduces ${num(effect.amount)}% of ${effect.type}`; break;
          default: e += "TODO:  " + JSON.stringify(effect);
        }
        if (effect.interval) e += ` every ${effect.interval} ${effect.interval == 1 ? "second" : "seconds"}`;
        break;
      case "hinderance":
        e += effect.amount
          ? `Removes ${num(effect.amount)}% of ${arrayToString(effect.attributes)}`
          : `${effect.chance}% chance to inflict ${effect.level ? "Lv." + effect.level + " " : ""}${arrayToString(effect.attributes)}`;
        break;
      case "boon": {
        e += `${effect.chance ? effect.chance + "% chance to " : ""}`;
        const attrStr = arrayToString(effect.attributes);
        switch (attrStr) {
          case "Provoke": e += "Provoke enemies"; break;
          case "Haste": e += `${effect.chance ? "g" : "G"}rant Haste`; break;
          case "Counter": e += `${effect.chance ? "g" : "G"}rant ${effect.amount}x Counter`; break;
          case "Revive": e += `${effect.chance ? "r" : "R"}evive to ${effect.amount}% HP after death`; break;
          case "On Death": e += `On Death launches rumble special`; break;
          default: e += `${"Reduce " + attrStr}`; break;
        }
        break;
      }
      case "penalty": {
        const tmpStr = arrayToString(effect.attributes);
        if (tmpStr == "HP" && effect.amount) e += `${num(effect.amount)}% health cut`;
        else if (effect.level) e += `Inflicts Lv.${num(effect.level)} ${arrayToString(effect.attributes)} down penalty`;
        else e += `${effect.chance || 100}% chance to ${arrayToString(effect.attributes)}`;
        break;
      }
      case "cleanse":
        e += `${effect.chance}% chance to cleanse ${arrayToString(effect.attributes)} debuffs`;
        break;
      // ADDED: the site prints "UNKNOWN EFFECT" for Evade
      case "evade":
        e += `${effect.chance ?? 100}% chance to evade ${arrayToString(effect.attributes)}`;
        break;
      default:
        e = "UNKNOWN EFFECT " + JSON.stringify(effect);
        break;
    }
    return (
      e +
      `${targetToString(effect.targeting)}${rangeToString(effect.range)}${effect.duration ? " for " + effect.duration + " seconds" : ""}` +
      (effect.repeat ? ` ${num(effect.repeat)} times` : ``) +
      `.`
    );
  });
}

/** Super special unlock condition (the site's superspecialconditionToString; other types ADDED in the same style). */
export function superConditionToString(input: SuperCondition): string {
  const c = input as Any;
  switch (c.type) {
    case "special": return `After this character receives enemy's rumble special ${c.count} times`;
    // ADDED: the site's code has only the case above
    case "specialreceived": return `After this character receives ${c.team === "crew" ? "crew" : "enemy"}'s rumble special ${c.count} times`;
    case "dmgreceived": return `After this character receives damage ${c.count} times`;
    case "dmgtaken": return `After this character receives ${num(c.count ?? 0)} damage`;
    case "heal": return `After this character is healed ${c.count} times`;
    case "dbfreceived": return `After this character receives ${c.attribute ?? "debuffs"} ${c.count} times`;
    case "time": return `When there are ${c.count} seconds or less remaining`;
    case "stat": return `When ${c.stat} is ${c.comparator} ${c.count}%`;
    default: return `UNKNOWN CONDITION ${JSON.stringify(input)}`;
  }
}
