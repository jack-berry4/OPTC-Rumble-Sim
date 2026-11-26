/**
 * Assault Rumble (docs/PLAN_MODES.md section 2; user, 2026-11-22). Always at the max assault level: a boss at 0 HP
 * stays on the field and keeps acting as before, can't be healed above 0 again, and takes more damage
 * (`zeroTakenPct`, default +50%). All damage dealt to the bosses counts, past 0 HP too. The battle runs its 100 s
 * unless your team is wiped out (you still get a score then).
 *
 * Score = (damage score + life score) x every modifier that applies, multiplied together. Damage score: all damage
 * dealt to the bosses. Life score: HP left on your units, a bench unit that never came in at its full HP, a KO'd unit 0.
 */

export interface AssaultModifier {
  id: string;
  label: string;
  mult: number;
  enabled: boolean;
  /** "defeat": only when every boss is at 0 HP at the end; "always": whenever it's on. */
  when: "defeat" | "always";
}

export interface AssaultSettings {
  /** Max Assault Lv (10): bosses stay at 0 HP (below it they go down like any unit). */
  immortal: boolean;
  /** Extra damage a boss at 0 HP takes, in % (50 = x1.5). */
  zeroTakenPct: number;
  modifiers: AssaultModifier[];
}

/**
 * Defaults from the user's results screens of the 2026-11 season (event 22: Blackbeard / Whitebeard / Akainu):
 * score = (damage + life) x Assault Lv x Defeat x Trusty x the owned-trusty bonus. The results show "Trusty x1.00" yet
 * all three scores are (damage + life) x Lv x Defeat x 1.40 (1.404, 1.400, 1.405): the "1.4 x bonus for owning it!"
 * of the season's trusty characters, applied once. The Assault Lv multiplier is the fought level's (the results show the next level): fought at 4 / 5 / 6 = x1.375 / 1.5 /
 * 1.625 (shown rounded down), so 1 + 0.125 per level above 1, and x2.5 at Lv 10 (user); see gameKit assaultLevelMult.
 * Defeat x1.85-2.00 (maybe from the time the last boss went down: user).
 */
export const DEFAULT_ASSAULT: AssaultSettings = {
  immortal: true,
  zeroTakenPct: 50,
  modifiers: [
    { id: "level", label: "Assault Lv 10 (max)", mult: 2.5, enabled: true, when: "always" },
    { id: "defeat", label: "Defeat the boss team (seen x1.85-2.00)", mult: 1.9, enabled: true, when: "defeat" },
    { id: "trusty", label: "Trusty characters on the team", mult: 1, enabled: true, when: "always" },
    { id: "owned", label: "Owning a trusty character (best one)", mult: 1.4, enabled: true, when: "always" },
  ],
};

/** Settings saved by an older version: the first defaults (before the user's results) become the current ones. */
export function migrateAssault(s: AssaultSettings | undefined): AssaultSettings {
  if (!s) return DEFAULT_ASSAULT;
  const ids = s.modifiers.map((m) => m.id);
  // the first defaults, and the Lv 6 default before max became the default (2026-11-22)
  const modifiers = !ids.includes("level") ? DEFAULT_ASSAULT.modifiers
    : s.modifiers.map((m) => (m.id === "level" && m.label.startsWith("Assault Lv 6 (x1 + 0.125") ? DEFAULT_ASSAULT.modifiers[0]! : m));
  return { ...DEFAULT_ASSAULT, ...s, immortal: s.immortal ?? true, modifiers };
}

/** What a battle gives toward the score (SimResult.assault). */
export interface AssaultOutcome {
  /** All damage dealt to the bosses (past 0 HP too). */
  damage: number;
  /** HP left on your units (bench at full, KO'd 0). */
  life: number;
  /** Every boss is at 0 HP (max level) or KO'd. */
  defeated: boolean;
}

/** The modifiers that apply to an outcome, multiplied together. */
export function assaultMultiplier(o: AssaultOutcome, s: AssaultSettings): number {
  let m = 1;
  for (const x of s.modifiers) if (x.enabled && (x.when === "always" || o.defeated) && Number.isFinite(x.mult) && x.mult > 0) m *= x.mult;
  return m;
}

export function assaultScore(o: AssaultOutcome, s: AssaultSettings): number {
  return Math.floor((o.damage + o.life) * assaultMultiplier(o, s));
}
