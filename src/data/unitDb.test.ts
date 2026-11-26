import { describe, expect, it } from "vitest";
import { resolveLevels } from "./resolve";
import { loadNodeDb as loadUnitDb } from "../sim/nodeDb";

describe("resolveLevels", () => {
  it("applies per-level overrides to the effect as written out in full (level 1), as the OPTC-DB site does", () => {
    const levels = resolveLevels([
      { effects: [{ effect: "hinderance", attributes: ["Paralysis"], chance: 50, duration: 16 }, { effect: "damage", amount: 1.5, type: "atk" }] },
      { effects: [{ override: { chance: 53, duration: 17 } }, { override: { amount: 1.6 } }] },
      { effects: [{ override: { chance: 56 } }] },
    ]);
    expect(levels[1]![0]).toMatchObject({ effect: "hinderance", attributes: ["Paralysis"], chance: 53, duration: 17 });
    expect(levels[1]![1]).toMatchObject({ effect: "damage", amount: 1.6, type: "atk" });
    // level 3's override names only the chance: the duration is level 1's, not level 2's (Hyogoro 3506, Sabo 1492);
    // an effect missing from level 3's list carries over from level 2
    expect(levels[2]![0]).toMatchObject({ chance: 56, duration: 16 });
    expect(levels[2]![1]).toMatchObject({ amount: 1.6 });
  });
});

describe("unit database", () => {
  const db = loadUnitDb();

  it("loads OPTC-DB units with full stats", () => {
    expect(db.all.length).toBeGreaterThan(1000);
    for (const u of db.all) {
      expect(u.stats.hp, `${u.id} hp`).toBeGreaterThan(0);
      expect(u.stats.spd, `${u.id} spd`).toBeGreaterThan(0);
    }
  });

  it("resolves units to 10 special levels and 5 ability levels (or none, for kit-less units)", () => {
    const bad = db.all.filter(
      (u) => ![0, 10].includes(u.kit.specials.length) || ![0, 5].includes(u.kit.abilities.length),
    );
    expect(bad.map((u) => u.id)).toEqual([]);
  });

  it("resolves special levels for a known unit (5014 Kung Fu Luffy)", () => {
    const u = db.byId.get(5014)!;
    expect(u.style).toBe("ATK");
    expect(u.kit.specials[9]!.effects[0]).toMatchObject({ effect: "hinderance", chance: 80, duration: 25 });
    expect(u.kit.specials[9]!.effects[1]).toMatchObject({ effect: "damage", amount: 2.5 });
  });
});
