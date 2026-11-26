import { describe, expect, it } from "vitest";
import { chanceText, evadeEntries, evadeList, layoutCells, statusName } from "./statusText";

describe("Evade names", () => {
  it("uses evades, else the old 'Evade: X' form, else nothing", () => {
    expect(evadeList({ attr: "Evade", remaining: 5, evades: ["Fixed Damage", "Action Bind"] })).toEqual(["Fixed Damage", "Action Bind"]);
    expect(evadeList({ attr: "Evade: Action Bind", remaining: 5 })).toEqual(["Action Bind"]);
    expect(evadeList({ attr: "Evade", remaining: 5 })).toEqual([]);
    expect(evadeList({ attr: "Paralysis", remaining: 5, evades: ["x"] })).toEqual([]);
  });
  it("names the status and always shows an Evade's chance", () => {
    expect(statusName({ attr: "Evade", remaining: 5, evades: ["Fixed Damage"] })).toBe("Evade Fixed Damage");
    expect(statusName({ attr: "Evade", remaining: 5 })).toBe("Evade");
    expect(statusName({ attr: "HoT", remaining: 5 })).toBe("Heal over time");
    expect(chanceText({ attr: "Evade", remaining: 5, chance: 1 })).toBe("100%");
    expect(chanceText({ attr: "Paralysis", remaining: 5, chance: 1 })).toBe("");
    expect(chanceText({ attr: "Paralysis", remaining: 5, chance: 0.4 })).toBe("40%");
  });
  it("lists each thing evaded once, with the longest time and best chance", () => {
    const list = evadeEntries([
      { attr: "Evade", remaining: 5, chance: 0.5, evades: ["Fixed Damage", "Action Bind"] },
      { attr: "Confusion", remaining: 3 },
      { attr: "Evade", remaining: 9, chance: 0.3, evades: ["Fixed Damage"] },
      { attr: "Evade", remaining: 2 },
    ]);
    expect(list).toEqual([
      { what: "Fixed Damage", remaining: 9, chance: 0.5 },
      { what: "Action Bind", remaining: 5, chance: 0.5 },
      { what: "?", remaining: 2, chance: undefined },
    ]);
  });
});

describe("layoutCells", () => {
  it("starts the section on a new row when it fits", () => {
    expect(layoutCells([1, 2, 3], [10, 11], 12)).toEqual({ cells: [1, 2, 3, null, 10, 11], more: [] });
    expect(layoutCells([1, 2], [10], 12)).toEqual({ cells: [1, 2, 10], more: [] });
  });
  it("gives up the gap, then puts the rest behind the last cell", () => {
    expect(layoutCells([1, 2, 3, 4, 5, 6, 7, 8, 9], [10, 11, 12], 12)).toEqual({ cells: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], more: [12] });
    expect(layoutCells([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [20, 21, 22], 12)).toEqual({
      cells: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, null], more: [20, 21, 22],
    });
  });
  it("never leaves a section header alone in the last shown cell", () => {
    const r = layoutCells([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [20, 21, 22], 12);
    expect(r.cells.includes(20)).toBe(false);
  });
});
