import { describe, expect, it } from "vitest";
import { loadNodeDb } from "../sim/nodeDb";
import { isVsCombined, unitLabel, vsHalves } from "./vs";
import { parseBox } from "../ui/BoxDialog";
import type { UnitDb } from "./unitDb";

const db = loadNodeDb();

describe("VS units in the box (user, 2026-11-22)", () => {
  it("a combined VS number stands for both halves", () => {
    expect(vsHalves(db, 4529)).toEqual([4529.1, 4529.2]);
    expect(isVsCombined(db, 4469)).toBe(true);
    expect(vsHalves(db, 4560)).toEqual([4560]);
    expect(unitLabel(db, 4529)).toBe("Roronoa Zoro / St. Ethanbaron V. Nusjuro (VS)");
  });
  it("a pasted box list adds both halves with the same build", () => {
    const r = parseBox('[{"number": 4529, "level": 120}, {"number": 4560}]', db as unknown as UnitDb);
    expect(r.units.map((m) => m.unitId)).toEqual([4529.1, 4529.2, 4560]);
    expect(r.skipped).toBe(0);
  });
});
