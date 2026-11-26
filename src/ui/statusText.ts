import type { StatusSnapshot } from "../engine/types";

/**
 * Names for statuses in the replay (Buffs table, popup, field badges). Evade is one status per thing it protects
 * against; the simulator gives the list in `evades` (older recordings: attr "Evade: X").
 */

export const isEvade = (attr: string) => attr === "Evade" || attr.startsWith("Evade:");

/** What an Evade status protects against ([] when not an Evade, or when the recording doesn't say). */
export function evadeList(s: StatusSnapshot): string[] {
  if (!isEvade(s.attr)) return [];
  if (s.evades?.length) return s.evades;
  const rest = s.attr.startsWith("Evade:") ? s.attr.slice(6).trim() : "";
  return rest ? rest.split(/\s*[,/]\s*/).filter(Boolean) : [];
}

/** Short labels for the field badges (about 6 characters). */
const EVADE_SHORT: Record<string, string> = {
  "Damage Ignoring DEF": "IgnDEF", "Fixed Damage": "Fixed", "Percentage Damage": "% Dmg", "Action Bind": "Bind",
  "Special CT Delay": "CT Dly", "Stats Down": "StatDn", "Half Stats": "½ Stat", "Forced Out": "Out", Paralysis: "Para",
  "Damage Over Time": "DoT", "Special Bind": "SpBind", "RCV Bind": "RcvBnd", "Ability Bind": "AbBind", Confusion: "Conf",
  Provoke: "Taunt", "Damage Reflect": "Reflct",
};
export const evadeShort = (what: string) => EVADE_SHORT[what] ?? what.slice(0, 6);

/** The status's full name: "Evade Fixed Damage, Action Bind" for an Evade, "Heal over time" for HoT, else attr. */
export function statusName(s: StatusSnapshot): string {
  if (isEvade(s.attr)) {
    const list = evadeList(s);
    return list.length ? `Evade ${list.join(", ")}` : "Evade";
  }
  return s.attr === "HoT" ? "Heal over time" : s.attr;
}

/** "70%" for a chance (0-1); always shown for Evade (the chance the evasion works), else only below 100%. */
export function chanceText(s: StatusSnapshot): string {
  if (s.chance === undefined) return "";
  if (!isEvade(s.attr) && s.chance >= 1) return "";
  return `${Math.round(s.chance * 100)}%`;
}

/** One thing a unit evades: how long the longest-lasting Evade covering it has left, and its best chance. */
export interface EvadeEntry { what: string; remaining: number; chance?: number }

/** Every thing the unit evades, in the order first seen; an Evade without a list counts as "Evade" (unknown). */
export function evadeEntries(statuses: StatusSnapshot[]): EvadeEntry[] {
  const out = new Map<string, EvadeEntry>();
  for (const s of statuses) {
    if (!isEvade(s.attr)) continue;
    const list = evadeList(s);
    for (const what of list.length ? list : ["?"]) {
      const prev = out.get(what);
      if (!prev) out.set(what, { what, remaining: s.remaining, chance: s.chance });
      else {
        prev.remaining = Math.max(prev.remaining, s.remaining);
        if (s.chance !== undefined) prev.chance = Math.max(prev.chance ?? 0, s.chance);
      }
    }
  }
  return [...out.values()];
}

/**
 * The status panel's cells: the main badges, then (on a new row) the Evade section, at most `max` cells. When it
 * doesn't all fit, the last cell is "more" and `more` holds what didn't fit (the row gap is given up first; a section
 * header is never left alone in the last shown cell).
 */
export function layoutCells<T>(main: T[], section: T[], max = 12): { cells: (T | null)[]; more: T[] } {
  const gap = section.length && main.length % 2 ? 1 : 0;
  if (main.length + gap + section.length <= max) return { cells: [...main, ...(gap ? [null] : []), ...section], more: [] };
  const all = [...main, ...section];
  let cut = max - 1;
  // the header would end the shown cells with its items hidden: hide it too
  if (section.length > 1 && cut === main.length + 1) cut = main.length;
  const cells: (T | null)[] = all.slice(0, cut);
  while (cells.length < max - 1) cells.push(null);
  return { cells, more: all.slice(cut) };
}
