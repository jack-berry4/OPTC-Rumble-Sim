/**
 * Themes for the meta run (docs/META_PLAN.md): the shared kit-group code (src/engine/themes.ts) on the run's items.
 *
 * Why (2026-11-24): the league's search changes one unit at a time. Its first teams (stage 1's best random teams) were
 * all mixed types, and a mono-type team's buffs only pay off once most of the team shares the type, so it never got
 * there: Nydato's OP STR comp, tried as a check, won 59% where the league's attack mix won 28.5%. Stage 1 also ranks
 * synergy units low (it measured them in mixed teams: Beckman & Yasopp #452 of 600), so they never made the
 * generator's shortlist. Picking a group's units by stage-1 score (8% for [STR]) or at random (0-8%) wasn't enough
 * either: the league climbs from each theme's team with the group's own units as the shortlist (stage2.ts).
 */
import type { UnitRecord } from "../../src/data/schema";
import { themeGroups as groupsOf, themeTeam as teamOf, type ThemeGroup } from "../../src/engine/themes";
import type { Db, Item } from "./common";

export type { ThemeGroup };

/** The groups the items' units' kits buff (and every type, class and type + class pair) with at least `minUnits` units. */
export function themeGroups(db: Db, items: Item[], minUnits = 6): ThemeGroup[] {
  const recs = new Map<number, UnitRecord>();
  for (const it of items) { const r = db.byId.get(it.unitId); if (r) recs.set(it.unitId, r); }
  return groupsOf([...recs.values()], minUnits);
}

/** A group's starting team (item keys): see `themeTeam` in src/engine/themes.ts. */
export function themeTeam(db: Db, items: Item[], units: Set<number>, score: (it: Item) => number): string[] {
  const byM = new Map(items.map((it) => [it.m, it]));
  return teamOf(db, items.map((it) => it.m), units, (m) => score(byM.get(m)!))
    .filter((m): m is NonNullable<typeof m> => !!m).map((m) => byM.get(m)!.key);
}
