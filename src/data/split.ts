/**
 * Shapes shared by the build-time splitter (scripts/db/split.ts) and the browser loader (src/data/unitDb.ts).
 *
 * The unit database is split into a lightweight search index (one LightUnit per unit, all shipped up front) and a
 * per-unit detail chunk (the heavy kit / stats / Limit-Break / game data, fetched on demand). A full UnitRecord is a
 * LightUnit with its UnitDetail merged in.
 */
import type { Color, KeyGroup, RumbleType, UnitClass, UnitRecord } from "./schema";

/**
 * Fields kept in the index for every unit: enough for search, the team-building rules (duplicate / family / cost),
 * list display and level badges, without any of the heavy kit / stats data. `source` and `maxLevel` are here because
 * `canLimitBreak` and legality checks read them on light records.
 */
export const LIGHT_FIELDS = [
  "id", "name", "color", "classes", "stars", "families", "ownFamilies", "tags", "aliases",
  "sixStarForm", "variantSet", "keyGroup", "farmable", "style", "cost", "maxLevel", "source",
] as const;

export type LightField = (typeof LIGHT_FIELDS)[number];

/** The lightweight per-unit record in units-index.json. */
export type LightUnit = Pick<UnitRecord, Extract<LightField, keyof UnitRecord>> & {
  /** MstCharacter_.serverId_: the sprite-animation asset id (Phase 2). Undefined for units with no game join. */
  serverId?: number;
  /** Hits per attack and sprite size class, from the game join (handy for the field without the full detail). */
  comboNum?: number;
  unitSize?: number;
  /** Global release date (YYYY-MM-DD) from the game join: the generator's "newer than Nydato's sheet" units. */
  released?: string;
};

/** The heavy per-unit fields in units/<id>.json: everything in UnitRecord that isn't a LightField. */
export type UnitDetail = Omit<UnitRecord, LightField>;

/**
 * The published data lives under data/<version>/ (scripts/db/split.ts: a hash of its contents), so every file keeps
 * one content per URL and is cached for a year (public/_headers). The build bakes the version in (vite.config.ts
 * `__DATA_VERSION__`); the dev server reads data/version.json instead, so a `npm run data:split` while it runs is
 * picked up on reload.
 */
export const dataPaths = (v: string) => ({
  index: `data/${v}/units-index.json`,
  detail: (id: number) => `data/${v}/units/${id}.json`,
});

export interface UnitIndexFile {
  customCount: number;
  potentialNames: string[];
  units: LightUnit[];
}

/** Re-exported for callers that build records. */
export type { RumbleType, Color, UnitClass, KeyGroup };
