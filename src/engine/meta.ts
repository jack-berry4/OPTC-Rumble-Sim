/**
 * The simulator's own meta (docs/META_PLAN.md): which units are relevant and which comps to start from, found by a
 * long simulation run (scripts/meta/, exported by scripts/meta/export.ts into rumble-meta.json). The team generator
 * uses it in place of Nydato's Rumble Sheet (user, 2026-11-24: become independent of the sheet for these two uses;
 * Nydato's comps stay as the default teams, with credit).
 *
 * Item keys are "unit@build" ("4560@MAX", "4482@Lv 1"); a unit id can have a decimal (VS halves, "4529.1").
 */
import type { UnitRecord } from "../data/schema";
import type { Template } from "./generator";
import metaFile from "./rumble-meta.json";

/** Rumble attack, Rumble defense, Assault Rumble. */
export type MetaSide = "atk" | "def" | "assault";

export interface MetaSub { key: string; loss: number }
export interface MetaComp {
  title: string;
  /** "league": a team the league found; "theme": a themed team climbed against the mix, then in the league. */
  origin: "league" | "theme";
  /** Its share of the league's final mix (absent: not played by it). */
  weight?: number;
  /** Its result against the other side's final mix (attack: win rate; defense: hold rate). */
  vsMix?: number;
  fit?: number;
  units: (string | null)[];
  /** Per position, the subs: items within 3 points (Assault: 3% of the score) of the comp, best first. */
  subs?: MetaSub[][];
}
export interface MetaAssault { season: number; boss: number; name: string; units: (string | null)[]; score: number; subs?: MetaSub[][] }
export interface MetaFile {
  source: string;
  generated: string;
  /** The newest release in the run's unit data; `since` is the day after: units from then on weren't in the run. */
  dataUpTo: string;
  since: string;
  battles?: number;
  league: { iterations: number; value: number };
  /** Relevant units per side: unit id -> the builds that stayed in. */
  units: { atk: Record<string, string[]>; def: Record<string, string[]>; assault?: Record<string, string[]> };
  /** Each relevant unit's screen score (its best build's): the generator's shortlist order. */
  scores?: { atk: Record<string, number>; def: Record<string, number>; assault?: Record<string, number> };
  comps: { atk: MetaComp[]; def: MetaComp[] };
  assault: MetaAssault[];
}

export const META = metaFile as MetaFile;
export const META_SINCE = META.since;

/** "4560@MAX" -> 4560. */
export const metaUnit = (key: string) => Number(key.split("@")[0]);

/** The relevant units of a side (Assault before its part of the run is in: the attack ones). */
export function metaUnits(side: MetaSide): Set<number> {
  const m = side === "assault" ? META.units.assault ?? META.units.atk : META.units[side];
  return new Set(Object.keys(m).map(Number));
}

/** Released on or after the day after the run's newest unit: the run can't have rated it. */
export function newerThanMeta(u: UnitRecord & { released?: string }): boolean {
  const r = u.released ?? u.game?.released;
  return r != null && r >= META_SINCE && u.style != null;
}

/** A unit's screen score for a side (undefined: not relevant there, or newer than the run). */
export function metaScore(side: MetaSide, id: number): number | undefined {
  const m = side === "assault" ? META.scores?.assault ?? META.scores?.atk : META.scores?.[side];
  return m?.[String(id)];
}

/**
 * The comps of a side as generator templates (units, and per position the subs' units). With `have` (the units the
 * player can use), the best comps they can field come first: the fewest missing units, then the best result against
 * the league's mix (a different comp often beats the best comp with subs: docs/META_PLAN.md); at most `limit`.
 */
export function metaTemplates(side: MetaSide, have?: Set<number>, limit = 40, bossNames: string[] = []): Template[] {
  if (side === "assault") {
    // the best teams against a boss team led by the same boss first (by name), then the fewest missing units; 15 at most
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const wanted = bossNames.map(norm).filter(Boolean);
    const same = (a: MetaAssault) => (wanted.some((w) => norm(a.name) === w || norm(a.name).includes(w) || w.includes(norm(a.name))) ? 0 : 1);
    const missing = (a: MetaAssault) => (have ? a.units.filter((k) => k && !have.has(metaUnit(k))).length : 0);
    return [...META.assault]
      .map((a) => ({ a, same: same(a), miss: missing(a) }))
      .sort((x, y) => x.same - y.same || x.miss - y.miss || y.a.season - x.a.season)
      .slice(0, Math.min(limit, 15))
      .map(({ a, miss }) => ({
        title: `Assault S${a.season} ${a.name || `boss team ${a.boss}`}${miss ? `, ${miss} missing` : ""}`,
        units: a.units.map((k) => (k ? metaUnit(k) : null)),
        subs: a.subs?.map((p) => p.map((s) => metaUnit(s.key))),
      }));
  }
  const missing = (c: MetaComp) => (have ? c.units.filter((k) => k && !have.has(metaUnit(k))).length : 0);
  return [...META.comps[side]]
    .map((c, i) => ({ c, i, miss: missing(c) }))
    .sort((a, b) => a.miss - b.miss || (b.c.vsMix ?? 0) - (a.c.vsMix ?? 0) || a.i - b.i)
    .slice(0, limit)
    .map(({ c, miss }) => ({
      title: `${c.title}${c.weight ? ` (${Math.round(c.weight * 100)}% of the mix)` : c.vsMix != null ? ` (${Math.round(c.vsMix * 100)}% vs the mix)` : ""}${miss ? `, ${miss} missing` : ""}`,
      units: c.units.map((k) => (k ? metaUnit(k) : null)),
      subs: c.subs?.map((p) => p.map((s) => metaUnit(s.key))),
    }));
}
