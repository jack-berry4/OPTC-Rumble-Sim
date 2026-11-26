import { createContext, useContext } from "react";

/**
 * The game's status icons (public/game-ui/status/, cleaned from the game dumps; the ones added 2026-11-25 are the English
 * client's pirates_arena_effect_icon_*.png as they are) for the replay's "Status icons" option. Stat levels have an up and
 * a down icon (arrow on the icon); special statuses have one; what an Evade or an immunity covers has the game's blue
 * shield version where there is one (`evade_*`: the game's "avoid" icons). Anything not listed keeps its text badge.
 */

const DIR = "game-ui/status/";

/** Stat (simulator buff name) -> icon base name; the file is `<base>_up.png` / `<base>_down.png`. */
export const STAT_ICON: Record<string, string> = {
  ATK: "atk", DEF: "def", SPD: "spd", HP: "hp", RCV: "rcv", "Critical Hit": "crit", Guard: "guard", Accuracy: "acc",
  "Blow Away": "blow", "Special CT": "ct",
};

/** Status (simulator attr, also an Evade's "what") -> icon file name (no extension). */
export const STATUS_ICON: Record<string, string> = {
  "Action Bind": "action_bind", "Special Bind": "special_bind", Paralysis: "paralysis", Confusion: "confusion",
  "Forced Out": "forced_out", "Damage Over Time": "dot", Provoke: "provoke", Counter: "counter", HoT: "hot",
  Regen: "hot", Shield: "shield",
  // 2026-11-25 (user): the game's own icons for these (ability_cancel, half_status, reflect, cure_waste, delay_ct, debuff)
  "Ability Bind": "ability_bind", "RCV Bind": "rcv_bind", "Damage Reflect": "reflect", "Special CT Delay": "ct_delay",
  "Stats Down": "stats_down",
  "Half Stats": "half_stats", "Half ATK": "half_stats", "Half DEF": "half_stats", "Half SPD": "half_stats", "Half RCV": "half_stats",
};

/** What an Evade / immunity covers -> the game's shield icon for it (no extension); the rest use the plain icon. */
export const EVADE_ICON: Record<string, string> = {
  "Action Bind": "evade_action_bind", Confusion: "evade_confusion", "Damage Over Time": "evade_dot", "RCV Bind": "evade_rcv_bind",
  "Stats Down": "evade_stats_down", "Special CT Delay": "evade_ct_delay", "Forced Out": "evade_forced_out",
  "Fixed Damage": "evade_fixed_damage", "Half Stats": "evade_half_stats", Paralysis: "evade_paralysis",
  "Damage Ignoring DEF": "evade_ignore_def", "Percentage Damage": "evade_percent_damage", "Special Bind": "evade_special_bind",
};

/** Every icon file the mapping uses (for the test). */
export function iconFiles(): string[] {
  const stat = Object.values(STAT_ICON).flatMap((b) => [`${b}_up.png`, `${b}_down.png`]);
  return [...new Set([...stat, ...[...Object.values(STATUS_ICON), ...Object.values(EVADE_ICON)].map((f) => `${f}.png`)])];
}

/** The icon for a stat level (positive: up, negative: down), or undefined. */
export function statIcon(stat: string, level: number): string | undefined {
  const b = STAT_ICON[stat];
  return b && level ? `${DIR}${b}_${level > 0 ? "up" : "down"}.png` : undefined;
}

/** The icon for a status (attr name, "Immune: X" gives X's icon), or undefined. */
export function statusIcon(attr: string): string | undefined {
  const a = attr.startsWith("Immune: ") ? attr.slice(8) : attr;
  const f = STATUS_ICON[a];
  return f ? `${DIR}${f}.png` : undefined;
}

/** The shield icon for something an Evade or an immunity covers, if the game has one. */
export function evadeIcon(what: string): string | undefined {
  const f = EVADE_ICON[what];
  return f ? `${DIR}${f}.png` : undefined;
}

/** The "Status icons" view option: on, badges and chips show the game's icon in place of the word. */
export const StatusIconsContext = createContext(false);
export const useStatusIcons = () => useContext(StatusIconsContext);
