import { describe, expect, it } from "vitest";
import type { BattleEvent } from "../engine/types";
import { buildHolds } from "./CutIns";

describe("rumble-ins", () => {
  it("a unit coming back from Forced Out rumbles in like one from the bench", () => {
    const ev = [
      { t: 3, kind: "enter", text: "D6 Buggy comes in from the bench", actor: "D6" },
      { t: 9, kind: "enter", text: "A2 returns to the field", actor: "A2" },
    ] as BattleEvent[];
    expect(buildHolds(ev).map((h) => [h.kind, h.t, h.uids])).toEqual([["enter", 3, ["D6"]], ["enter", 9, ["A2"]]]);
  });
  it("a unit switched in for a teammate rumbles in too (user 2026-11-18)", () => {
    const ev = [
      { t: 5, kind: "special", text: "A1 Kuzan: special", actor: "A1", parts: [] },
      { t: 5, kind: "enter", text: "A1 switches with A6 Kuzan", actor: "A1", target: "A6" },
      { t: 6, kind: "effect", text: "A2 Nami has no 2nd sub character waiting: no switch", actor: "A2" },
    ] as unknown as BattleEvent[];
    expect(buildHolds(ev).map((h) => [h.kind, h.t, h.uids])).toEqual([["special", 5, ["A1"]], ["enter", 5, ["A6"]]]);
  });
});

describe("the timeline with pauses", () => {
  it("maps playback time to battle time and back", async () => {
    const { pauseClock } = await import("./CutIns");
    const holds = [{ kind: "enter" as const, t: 2, dur: 1, uids: [] }, { kind: "end" as const, t: 10, dur: 3, uids: [] }];
    const c = pauseClock(holds);
    expect(c.total(10)).toBe(14);
    expect(c.toBattle(1.5)).toEqual({ t: 1.5, hold: null, next: 0 });
    expect(c.toBattle(2.5)).toEqual({ t: 2, hold: { i: 0, el: 0.5 }, next: 1 });
    expect(c.toBattle(4)).toEqual({ t: 3, hold: null, next: 1 });
    expect(c.toBattle(12)).toEqual({ t: 10, hold: { i: 1, el: 1 }, next: 2 });
    expect(c.toBattle(14)).toEqual({ t: 10, hold: null, next: 2 });
    expect(c.now(3, 1, 0)).toBe(4);
  });
});
