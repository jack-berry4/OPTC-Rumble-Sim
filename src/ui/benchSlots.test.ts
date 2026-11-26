import { describe, expect, it } from "vitest";
import { benchSlotsAt, lineupAt } from "./GameHud";

const unit = (uid: string, bench = false) => ({ uid, side: "atk" as const, bench });
const ko = (t: number, uid: string) => ({ t, kind: "ko", text: `${uid} is defeated`, target: uid });
const enter = (t: number, uid: string) => ({ t, kind: "enter", text: `${uid} comes in from the bench`, actor: uid });

describe("bench slots: waiting units, then KO'd units in KO order, no gaps", () => {
  // Jack's example: abcde fg0 -> b dies, f comes in -> afcde g(b)0 -> d dies, g comes in -> afcge (b)(d)0
  const start = [unit("a"), unit("b"), unit("c"), unit("d"), unit("e"), unit("f", true), unit("g", true)];
  const ev = [ko(1, "b"), enter(1.5, "f"), ko(3, "d"), enter(3.5, "g")];
  it("follows Jack's example", () => {
    expect(benchSlotsAt(ev, start, 0).atk).toEqual([{ uid: "f", ko: false }, { uid: "g", ko: false }, null]);
    expect(benchSlotsAt(ev, start, 1.2).atk).toEqual([{ uid: "f", ko: false }, { uid: "g", ko: false }, { uid: "b", ko: true }]);
    expect(benchSlotsAt(ev, start, 2).atk).toEqual([{ uid: "g", ko: false }, { uid: "b", ko: true }, null]);
    expect(benchSlotsAt(ev, start, 4).atk).toEqual([{ uid: "b", ko: true }, { uid: "d", ko: true }, null]);
  });
  it("shows the first 3 when there are more", () => {
    const s = [unit("a"), unit("b"), unit("f", true), unit("g", true), unit("h", true)];
    expect(benchSlotsAt([ko(1, "a")], s, 2).atk).toEqual([{ uid: "f", ko: false }, { uid: "g", ko: false }, { uid: "h", ko: false }]);
    expect(benchSlotsAt([ko(1, "a"), enter(2, "f"), ko(3, "b"), ko(4, "f")], s, 5).atk)
      .toEqual([{ uid: "g", ko: false }, { uid: "h", ko: false }, { uid: "a", ko: true }]);
  });
  it("a switch puts the field unit in the bench place of the unit it switched with (user 2026-11-18)", () => {
    const sw = { t: 1, kind: "enter", text: "a switches with f F", actor: "a", target: "f" };
    expect(benchSlotsAt([sw], start, 2).atk).toEqual([{ uid: "a", ko: false }, { uid: "g", ko: false }, null]);
    const sw2 = { t: 1, kind: "enter", text: "b switches with g G", actor: "b", target: "g" };
    expect(benchSlotsAt([sw2], start, 2).atk).toEqual([{ uid: "f", ko: false }, { uid: "b", ko: false }, null]);
  });
});

describe("lineup under the field", () => {
  const start = [unit("a"), unit("b"), unit("c"), unit("d"), unit("e"), unit("f", true), unit("g", true)];
  it("greys a KO'd place until a bench unit comes in for it (in KO order)", () => {
    const ev = [ko(1, "d"), ko(1.2, "b"), enter(1.5, "f")];
    const at = (t: number) => lineupAt(ev, start, t).atk.map((p) => `${p.uid}${p.ko ? "x" : ""}`).join(" ");
    expect(at(0)).toBe("a b c d e");
    expect(at(1.3)).toBe("a bx c dx e");
    expect(at(2)).toBe("a bx c f e");
  });
});
