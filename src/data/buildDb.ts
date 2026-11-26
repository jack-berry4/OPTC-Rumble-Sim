import { KIT_PATCHES } from "./patches";
import { expandReferences, resolveRumbleUnit } from "./resolve";
import type { Color, GameUnitData, KeyGroup, KnownUnitData, RawRumbleUnit, UnitClass, UnitRecord } from "./schema";

/**
 * A hand-written unit. Drop a JSON file matching this shape into src/data/custom/.
 * Custom units override imported units with the same id, so you can also use this
 * to fix or update a unit OPTC-DB has wrong or out of date.
 */
export interface CustomUnitFile {
  id: number;
  name: string;
  color: Color | null;
  classes: UnitClass[];
  stars?: string | number;
  families?: string[];
  /** VS forms: the chosen half's own families (UnitRecord.ownFamilies). */
  ownFamilies?: string[];
  /** Crew / race / arc tags, e.g. "Straw Hat Pirates". */
  tags?: string[];
  /** Other names to search by (OPTC-DB aliases.js), e.g. "Aokiji". */
  aliases?: string[];
  /** 5★ units: the 6★ unit this one evolves into (UnitRecord.sixStarForm). */
  sixStarForm?: number;
  hp: number;
  atk: number;
  rcv: number;
  /** Level-1 stats, max level and growth curve (for stats at a given level). */
  minStats?: { hp: number; atk: number; rcv: number };
  maxLevel?: number;
  growth?: number | null;
  /** Limit Break nodes. */
  lb?: UnitRecord["lb"];
  /** Socket slots before Limit Break. */
  sockets?: number;
  /** LLB level that gives each Rumble upgrade. */
  llbTiers?: UnitRecord["llbTiers"];
  /** Main-game special levels. Default 1. */
  specialLevels?: number;
  /** Rumble key tier. Default "rr" (or "legend" for 6★). */
  keyGroup?: KeyGroup;
  /** Free to play (farmed: Co-op, PKA, raids, story...). */
  farmable?: boolean;
  rumble: RawRumbleUnit;
  /** The game's own data and captured values (data/units.json; docs/DATABASE.md). */
  game?: GameUnitData;
  known?: KnownUnitData;
}


export interface ImportedFile {
  units: (Omit<CustomUnitFile, "color" | "classes"> & { color: string | null; classes: string[] })[];
}

export interface UnitDb {
  all: UnitRecord[];
  byId: Map<number, UnitRecord>;
  customCount: number;
}

export function buildUnitDb(importedUnits: ImportedFile["units"], customUnits: CustomUnitFile[]): UnitDb {
  const entries = new Map<number, { meta: ImportedFile["units"][number]; source: UnitRecord["source"] }>();
  for (const u of importedUnits) entries.set(u.id, { meta: u, source: "optc-db" });
  for (const u of customUnits) entries.set(u.id, { meta: u, source: "custom" });

  const raws = expandReferences([...entries.values()].map((e) => ({ ...e.meta.rumble, id: e.meta.id })));
  const all: UnitRecord[] = [];
  raws.forEach((raw) => {
    const { meta, source } = entries.get(raw.id)!;
    if (!raw.stats) return; // no Rumble data
    const { kit, llbKit } = resolveRumbleUnit(raw);
    // corrections from the game (src/data/patches.ts)
    KIT_PATCHES[raw.id]?.(kit);
    if (llbKit) KIT_PATCHES[raw.id]?.(llbKit);
    all.push({
      id: meta.id,
      name: meta.name,
      color: (meta.color || null) as Color | null,
      classes: meta.classes as UnitClass[],
      stars: meta.stars ?? "",
      families: meta.families ?? [],
      ...(meta.ownFamilies ? { ownFamilies: meta.ownFamilies } : {}),
      tags: meta.tags ?? [],
      ...(meta.aliases?.length ? { aliases: meta.aliases } : {}),
      ...(meta.sixStarForm ? { sixStarForm: meta.sixStarForm } : {}),
      minStats: meta.minStats ?? { hp: meta.hp, atk: meta.atk, rcv: meta.rcv },
      maxLevel: meta.maxLevel && meta.maxLevel > 0 ? meta.maxLevel : 1,
      growth: meta.growth ?? 1,
      lb: meta.lb ? { ...meta.lb, potentials: meta.lb.potentials ?? [], socketNodes: meta.lb.socketNodes ?? [] } : undefined,
      sockets: meta.sockets ?? 0,
      specialLevels: Math.max(1, meta.specialLevels ?? 1),
      keyGroup: meta.keyGroup ?? (parseFloat(String(meta.stars)) >= 6 ? "legend" : "rr"),
      ...(meta.farmable ? { farmable: true } : {}),
      style: raw.stats.rumbleType,
      stats: { hp: meta.hp, atk: meta.atk, rcv: meta.rcv, def: raw.stats.def, spd: raw.stats.spd },
      kit,
      llbKit,
      llbTiers: meta.llbTiers,
      source,
      cost: raw.cost ?? 0,
      ...(meta.game ? { game: meta.game } : {}),
      ...(meta.known ? { known: meta.known } : {}),
    });
  });
  all.sort((a, b) => a.id - b.id);
  markVariantSets(all);
  return { all, byId: new Map(all.map((u) => [u.id, u])), customCount: customUnits.length };
}

/**
 * Finds color-variant sets (see UnitRecord.variantSet): runs of 3+ consecutive unit IDs, all 4★ or lower, sharing a
 * family, each a different color (e.g. Pacifista PX-1 to PX-5, the Shooter Group crews).
 */
function markVariantSets(all: UnitRecord[]) {
  const byId = new Map(all.filter((u) => Number.isInteger(u.id)).map((u) => [u.id, u]));
  const low = (u: UnitRecord | undefined): u is UnitRecord => !!u && parseFloat(String(u.stars)) <= 4;
  for (const u of byId.values()) {
    if (!low(u)) continue;
    for (const fam of u.families) {
      const prev = byId.get(u.id - 1);
      if (low(prev) && prev.families.includes(fam)) continue; // not the start of a run
      const run = [u];
      for (let next = byId.get(u.id + 1); low(next) && next.families.includes(fam); next = byId.get(next.id + 1)) run.push(next);
      if (run.length >= 3 && new Set(run.map((x) => x.color)).size === run.length) {
        for (const x of run) x.variantSet = `${fam}#${u.id}`;
      }
    }
  }
}
