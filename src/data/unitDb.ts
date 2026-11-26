// Browser loader for the unit database. The app no longer bundles the whole 10 MB data/units.json: it fetches a small
// search index up front (scripts/db/split.ts writes public/data/<version>/units-index.json) and pulls each unit's heavy detail
// (kit, stats, Limit Break, game data) on demand. Node scripts and tests build the full DB with loadNodeDb instead.
import type { UnitRecord } from "./schema";
import { dataPaths, type LightUnit, type UnitDetail, type UnitIndexFile } from "./split";

export type { UnitDb };

interface UnitDb {
  /** Every unit as a light record (search / lists). Heavy fields are filled in once `ensure` has loaded the detail. */
  all: UnitRecord[];
  byId: Map<number, UnitRecord>;
  customCount: number;
  /** Every potential ability name, precomputed at build time (the preset editor's list). */
  potentialNames: string[];
  /** Ids whose detail chunk has been merged in. */
  loaded: Set<number>;
  hasDetail(id: number): boolean;
  /** Fetch + merge the detail for these ids (idempotent, de-duped); resolves once all are present. `onProgress`: how
   *  many of them are in so far (already loaded ones count at once). */
  ensure(ids: Iterable<number>, onProgress?: (done: number, total: number) => void): Promise<void>;
}

/** A light index entry becomes a UnitRecord stub; the heavy fields are absent until the detail chunk is merged in. */
function stub(l: LightUnit): UnitRecord {
  return l as unknown as UnitRecord;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

let dbPromise: Promise<UnitDb> | undefined;

export function loadUnitDb(): Promise<UnitDb> {
  return (dbPromise ??= build());
}

/** Which data/<version>/ folder to read: baked into a build; the dev server asks, so a re-split needs no restart. */
async function dataVersion(): Promise<string> {
  if (!import.meta.env.DEV) return __DATA_VERSION__;
  const res = await fetch("data/version.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load data/version.json: ${res.status} (run npm run data:split)`);
  return ((await res.json()) as { v: string }).v;
}

async function build(): Promise<UnitDb> {
  const paths = dataPaths(await dataVersion());
  const index = await fetchJson<UnitIndexFile>(paths.index);
  const all = index.units.map(stub);
  const byId = new Map<number, UnitRecord>(all.map((u) => [u.id, u]));
  const loaded = new Set<number>();
  const inflight = new Map<number, Promise<void>>();

  async function one(id: number): Promise<void> {
    if (loaded.has(id)) return;
    let p = inflight.get(id);
    if (!p) {
      const rec = byId.get(id);
      if (!rec) return; // unknown id: nothing to load
      p = fetchJson<UnitDetail>(paths.detail(id))
        .then((detail) => {
          Object.assign(rec, detail);
          loaded.add(id);
        })
        .finally(() => inflight.delete(id));
      inflight.set(id, p);
    }
    return p;
  }

  const db: UnitDb = {
    all,
    byId,
    customCount: index.customCount,
    potentialNames: index.potentialNames,
    loaded,
    hasDetail: (id) => loaded.has(id),
    ensure: async (ids, onProgress) => {
      const list = [...new Set(ids)];
      let done = 0;
      const tick = () => onProgress?.(++done, list.length);
      // (a failed unit still counts as done: the others go on loading)
      await Promise.all(list.map((id) => one(id).finally(tick)));
    },
  };
  return db;
}
