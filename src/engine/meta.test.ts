import { describe, expect, it } from "vitest";
import { loadNodeDb } from "../sim/nodeDb";
import { adaptTemplate } from "./generator";
import { META, META_SINCE, metaScore, metaTemplates, metaUnit, metaUnits, newerThanMeta } from "./meta";
import { applyPreset, DEFAULT_PRESETS } from "./stats";
import type { MemberConfig } from "./types";

const db = loadNodeDb();

describe("the meta run's data (docs/META_PLAN.md)", () => {
  it("has relevant units per side, all 5★ and up and in the database", () => {
    for (const side of ["atk", "def"] as const) {
      const ids = metaUnits(side);
      expect(ids.size).toBeGreaterThan(100);
      for (const id of ids) expect(["5", "5+", "6", "6+"]).toContain(String(db.byId.get(id)?.stars));
    }
    expect(metaUnits("atk").has(4560)).toBe(true); // Shanks: the top attack item through stage 1
  });

  it("units released after the run's newest unit count as newer; older ones don't", () => {
    expect(META_SINCE > META.dataUpTo).toBe(true);
    const rec = db.byId.get(4560)!;
    expect(newerThanMeta({ ...rec, released: META.dataUpTo })).toBe(false);
    expect(newerThanMeta({ ...rec, released: META_SINCE })).toBe(true);
  });

  it("comps are 8 places of known items, with subs per place for the league's", () => {
    for (const side of ["atk", "def"] as const) {
      const comps = META.comps[side];
      expect(comps.length).toBeGreaterThan(0);
      for (const c of comps) {
        expect(c.units).toHaveLength(8);
        for (const k of c.units) if (k) expect(db.byId.get(metaUnit(k))).toBeDefined();
        if (c.subs) expect(c.subs).toHaveLength(8);
      }
      expect(comps.some((c) => c.origin === "league" && c.subs)).toBe(true);
    }
    // at most 40 templates; with the units a player has, the comps they can field fully come first
    expect(metaTemplates("atk")).toHaveLength(Math.min(40, META.comps.atk.length));
    const noImu = new Set(Object.keys(META.units.atk).map(Number).filter((id) => id !== 4571));
    const first = metaTemplates("atk", noImu)[0]!;
    expect(first.units).not.toContain(4571);
    expect(first.title).not.toMatch(/missing/);
  });

  it("unit scores for the shortlist", () => {
    expect(metaScore("atk", 4560)).toBeGreaterThan(0);
    expect(metaScore("atk", 1)).toBeUndefined();
  });

  it("a comp missing a unit gets its sub for that place first", () => {
    const tpl = metaTemplates("atk").find((x) => x.subs?.some((p) => p && p.length))!;
    const pos = tpl.subs!.findIndex((p) => p && p.length);
    const sub = tpl.subs![pos]![0]!;
    // a pool with every unit of the comp but the one in that place, plus its first sub
    const ids = [...tpl.units.filter((u, i): u is number => u != null && i !== pos), sub];
    const pool = new Map<number, MemberConfig>(ids.map((id) => [id, applyPreset(db.byId.get(id)!, { unitId: id }, DEFAULT_PRESETS[3]!)]));
    const { team, missing } = adaptTemplate(db, pool, tpl);
    expect(missing).toBe(1);
    expect(team.members[pos]?.unitId).toBe(sub);
  });
});
