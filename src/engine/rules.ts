import type { UnitRecord } from "../data/schema";

/**
 * Global rules ("Special rule activated" at the start of a Rumble battle): boosts for units matching a
 * color, class, Rumble style or crew tag, for one side or both, for the whole battle or only its last N seconds.
 */
export interface GlobalRule {
  enabled: boolean;
  side: "both" | "atk" | "def";
  /**
   * Which units: everyone, or by color ("QCK"), class ("Driven"), Rumble style ("ATK") or crew tag. Crew tags can list
   * more tags in `also`: a unit with any of them counts.
   */
  target: { by: "all" | "color" | "class" | "style" | "tag"; value: string; also?: string[] };
  /**
   * A buff/debuff level on a stat (as in specials and abilities), a % change to damage dealt, or a % change to damage
   * taken (negative = takes less).
   */
  effect:
    | { kind: "buff"; attr: string; level: number }
    | { kind: "damage"; percent: number }
    | { kind: "taken"; percent: number }
    /** The game's usual pairing: deal `percent`% more damage and take `percent`% less (negative: the other way). */
    | { kind: "both"; percent: number }
    /** A rule copied from the game's battle data: fixed text and fixed levels (GAME_RULES), not editable. */
    | { kind: "game"; id: GameRuleId };
  /** Only in the last N seconds of the battle. Undefined = the whole battle. */
  lastSeconds?: number;
  /** Where the rule came from when the app added it (e.g. "assault:22:64": an Assault Rumble season's boss team). */
  source?: string;
}

export type GameRuleId = "last30";
/**
 * Rules as the game's battle data gives them (rumble.json, 2026-11-13), with the game's own text. "last30" is
 * RuleEffect::SkillSpeed value 30 (+30% special charge speed = Special CT level 10 at 3% per level) and
 * RuleEffect::Defense value -150 (= DEF level -6 at 25 per level), for everyone, when 30 s or less are left.
 */
export const GAME_RULES: Record<GameRuleId, { text: string; short: string; buffs: { attr: string; level: number }[]; lastSeconds: number }> = {
  last30: {
    text: "During the last 30 s of battle, Special CT Speed Up & Damage Up!",
    short: "Last 30 s rule",
    buffs: [{ attr: "Special CT", level: 10 }, { attr: "DEF", level: -6 }],
    lastSeconds: 30,
  },
};

/** A game rule ready to add: everyone, both teams, its fixed window. */
export function gameRule(id: GameRuleId): GlobalRule {
  return { enabled: true, side: "both", target: { by: "all", value: "" }, effect: { kind: "game", id }, lastSeconds: GAME_RULES[id].lastSeconds };
}

/** The buff levels a rule gives (a plain buff rule: its one level; a game rule: its fixed levels; otherwise none). */
export function ruleBuffs(r: GlobalRule): { attr: string; level: number }[] {
  if (r.effect.kind === "buff") return [{ attr: r.effect.attr, level: r.effect.level }];
  if (r.effect.kind === "game") return GAME_RULES[r.effect.id]?.buffs ?? [];
  return [];
}

/** Stats a rule can buff (levels: HP +250, ATK +75, RCV +50, DEF +25, SPD +5, Special CT 2% ... per level). */
export const RULE_ATTRS = ["HP", "ATK", "RCV", "DEF", "SPD", "Special CT", "Critical Hit", "Guard", "Accuracy", "Blow Away"] as const;

/** The app's rules on a first visit: only the game's own last-30-s rule (user, 2026-11-17). */
export const APP_DEFAULT_RULES: GlobalRule[] = [gameRule("last30")];

/** The rules active in the user's recorded test battles (2026-11-05). Last 30 s: damage +5% MEASURED; Special CT level unknown. */
export const DEFAULT_RULES: GlobalRule[] = [
  { enabled: true, side: "both", target: { by: "color", value: "QCK" }, effect: { kind: "buff", attr: "RCV", level: 4 } },
  { enabled: true, side: "both", target: { by: "class", value: "Driven" }, effect: { kind: "buff", attr: "ATK", level: 4 } },
  { enabled: true, side: "both", target: { by: "class", value: "Striker" }, effect: { kind: "buff", attr: "HP", level: 4 } },
  // the game's own last-30-s rule (battle data 2026-11-13): charge speed +30%, DEF -150 for everyone. It replaces the
  // earlier reading (Special CT +5 levels, damage +5%): the measured Pacifista 571 -> 600 is DEF 50 going to 0.
  gameRule("last30"),
];

export function ruleMatches(rule: GlobalRule, rec: UnitRecord, side: "atk" | "def"): boolean {
  if (!rule.enabled || (rule.side !== "both" && rule.side !== side)) return false;
  const v = rule.target.value;
  switch (rule.target.by) {
    case "all": return true;
    case "color": return rec.color === `[${v}]`;
    case "class": return (rec.classes as string[]).includes(v);
    case "style": return rec.style === v;
    case "tag": {
      const want = [v, ...(rule.target.also ?? [])].map((x) => x.toLowerCase()).filter(Boolean);
      return rec.tags.some((t) => want.includes(t.toLowerCase()));
    }
  }
}

/** Whether a rule is in effect at battle time `t` (seconds elapsed) in a battle of `length` seconds. */
export const ruleActive = (rule: GlobalRule, t: number, length: number) =>
  rule.lastSeconds === undefined || length - t <= rule.lastSeconds + 1e-9;

export function describeRule(r: GlobalRule): string {
  if (r.effect.kind === "game") return GAME_RULES[r.effect.id]?.text ?? "Game rule";
  const tags = [r.target.value, ...(r.target.also ?? [])].filter(Boolean).map((t) => `[${t}]`).join(" / ");
  const who = r.target.by === "all" ? "All units" : r.target.by === "tag" ? `${tags || "?"} units`
    : `${r.target.value || "?"} ${r.target.by === "color" ? "units" : r.target.by === "class" ? "class" : "style"}`;
  const pct = (p: number) => `${p >= 0 ? "+" : ""}${p}%`;
  const both = (p: number) => `deal ${Math.abs(p)}% ${p >= 0 ? "more" : "less"} damage and take ${Math.abs(p)}% ${p >= 0 ? "less" : "more"} damage`;
  const what = r.effect.kind === "buff" ? `${r.effect.attr} ${r.effect.level >= 0 ? "up" : "down"} lv ${Math.abs(r.effect.level)}`
    : r.effect.kind === "both" ? both(r.effect.percent)
    : r.effect.kind === "damage" ? `damage dealt ${pct(r.effect.percent)}` : `damage taken ${pct(r.effect.percent)}`;
  const side = r.side === "both" ? "" : r.side === "atk" ? " (your team)" : " (opponent)";
  return `${who}: ${what}${r.lastSeconds !== undefined ? ` in the last ${r.lastSeconds}s` : ""}${side}`;
}

/**
 * The rules in test run 2 (videos 21-25, 2026-11-06), CONFIRMED by the user: QCK DEF up 5, QCK ATK up 5, Powerhouse
 * class HP up 5, Driven class Special CT speed up 3. The recordings agree:
 * - QCK ATK up 5 (+375): PX-3 hits for 785 (ATK 1,376), the Blue crew for 334 (ATK 585);
 * - QCK DEF up 5 (+125): Alvida's 779 hits PX-3 for 483 (DEF 175), the Pacifistas' 601 hit the Blue crew for 372;
 * - Powerhouse HP up 5 (+1,250): the Pacifistas' HP cards drop ~11% per 375-433 hit (max HP ~3,500 = 2,001 + 250 Team
 *   HP up + 1,250).
 * - Driven Special CT up 3: Buggy, Mohji & Richie and Cabaji are Driven but have no special, so it changes nothing here.
 * Last 30 s damage +5% still applies (Luffy's Full attack 2,035 -> 2,136).
 */
export const RUN2_RULES: GlobalRule[] = [
  { enabled: true, side: "both", target: { by: "color", value: "QCK" }, effect: { kind: "buff", attr: "ATK", level: 5 } },
  { enabled: true, side: "both", target: { by: "color", value: "QCK" }, effect: { kind: "buff", attr: "DEF", level: 5 } },
  { enabled: true, side: "both", target: { by: "class", value: "Powerhouse" }, effect: { kind: "buff", attr: "HP", level: 5 } },
  { enabled: true, side: "both", target: { by: "class", value: "Driven" }, effect: { kind: "buff", attr: "Special CT", level: 3 } },
  ...DEFAULT_RULES.filter((r) => r.lastSeconds !== undefined),
];

/**
 * The rules in test run 4 (videos 41-44, 2026-11-06): run 2's, plus Paramythia-type and Giant units dealing 30% more
 * damage and taking 30% less (user; Nico Robin 4375 is the only unit with any of these tags in runs 1-4). Giant is the
 * exact tag only (CONFIRMED by the user): "Giant Pirate Crew", "New Giant Pirate Crew" and "Ancient Giant" don't count. MEASURED: Robin's Normal hit is
 * 2,263 vs DEF 50 (= ATK 3,049 x 0.6 / 1.05 x 1.3), her Power / crit 3,396, guarded 2,971, last 30 s 2,376.
 */
export const RUN4_RULES: GlobalRule[] = [
  ...RUN2_RULES,
  ...["Paramythia-type / Devil Fruit User", "Giant"].flatMap((tag): GlobalRule[] => [
    { enabled: true, side: "both", target: { by: "tag", value: tag }, effect: { kind: "damage", percent: 30 } },
    { enabled: true, side: "both", target: { by: "tag", value: tag }, effect: { kind: "taken", percent: -30 } },
  ]),
];

/**
 * The rules in test runs 6-7 (videos 61-64, 71-74, 2026-11-09, "Block A" from the user's screenshot): QCK ATK up 4,
 * Driven class SPD up 4 (Buggy, Mohji & Richie and Cabaji are Driven: SPD 100 -> 120), Striker class DEF up 4, and
 * the last-30-s Special CT / damage up, and [Elbaph Arc] / [Land of Wano Arc] / [Logia-type] units dealing 20% more
 * and taking 20% less. The rule text says that last part "will only affect the Combat Power", but it does apply in
 * battle (MEASURED: Usohachi [Land of Wano Arc] hits for 1,335 = 1,113 x 1.2 in all four run-7 videos; Kizaru
 * [Logia-type] 3,093 = 2,578 x 1.2).
 */
export const RUN6_RULES: GlobalRule[] = [
  { enabled: true, side: "both", target: { by: "color", value: "QCK" }, effect: { kind: "buff", attr: "ATK", level: 4 } },
  { enabled: true, side: "both", target: { by: "class", value: "Driven" }, effect: { kind: "buff", attr: "SPD", level: 4 } },
  { enabled: true, side: "both", target: { by: "class", value: "Striker" }, effect: { kind: "buff", attr: "DEF", level: 4 } },
  ...["Elbaph Arc", "Land of Wano Arc", "Logia-type / Devil Fruit User"].flatMap((tag): GlobalRule[] => [
    { enabled: true, side: "both", target: { by: "tag", value: tag }, effect: { kind: "damage", percent: 20 } },
    { enabled: true, side: "both", target: { by: "tag", value: tag }, effect: { kind: "taken", percent: -20 } },
  ]),
  ...DEFAULT_RULES.filter((r) => r.lastSeconds !== undefined),
];

