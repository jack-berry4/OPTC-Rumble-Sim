import { describe, expect, it } from "vitest";
import type { Frame, UnitSnapshot } from "../engine/types";
import { cutSegments, eventsNear, hpTracks, levelSeries, metricTracks, metricsIn, niceTicks, stepPath } from "./replaySeries";

const unit = (uid: string, over: Partial<UnitSnapshot>): UnitSnapshot => ({
  uid, x: 0, y: 0, hp: 100, maxHp: 100, ct: 0, ctMax: 10, state: "idle", shield: 0, gauge: 0, superReady: false,
  activity: "", occupied: false, buffs: {}, statuses: [], ...over,
});
const frame = (t: number, units: UnitSnapshot[]): Frame => ({ t, clock: t, units, queue: [] });

describe("hpTracks", () => {
  const frames = [
    frame(0, [unit("A1", {}), unit("A6", { state: "bench" })]),
    frame(1, [unit("A1", { hp: 100 }), unit("A6", { state: "bench" })]),
    frame(2, [unit("A1", { hp: 60 }), unit("A6", { state: "bench" })]),
    frame(3, [unit("A1", { hp: 0, state: "dead" }), unit("A6", { hp: 200, maxHp: 200 })]),
    frame(4, [unit("A1", { hp: 0, state: "dead" }), unit("A6", { hp: 150, maxHp: 200 })]),
  ];
  const tracks = hpTracks(frames, [{ t: 2.6, kind: "ko", target: "A1", text: "KO" }]);
  it("keeps only the change points, and drops to 0 at the KO", () => {
    const a1 = tracks.find((x) => x.uid === "A1")!;
    expect(a1.ko).toBe(2.6);
    expect(a1.segs).toEqual([{ points: [{ t: 0, v: 100 }, { t: 2, v: 60 }, { t: 2.6, v: 0 }], end: 2.6 }]);
  });
  it("starts a benched unit's line when it comes in, in % of max HP too", () => {
    const a6 = tracks.find((x) => x.uid === "A6")!;
    expect(a6.ko).toBeUndefined();
    expect(a6.segs).toEqual([{ points: [{ t: 3, v: 200 }, { t: 4, v: 150 }], end: 4 }]);
    expect(a6.pctSegs[0]!.points.map((p) => p.v)).toEqual([100, 75]);
  });
  it("is cut at the replay time", () => {
    const a1 = tracks.find((x) => x.uid === "A1")!;
    expect(cutSegments(a1.segs, 1.5)).toEqual([{ points: [{ t: 0, v: 100 }], end: 1.5 }]);
    expect(cutSegments(tracks.find((x) => x.uid === "A6")!.segs, 2)).toEqual([]);
  });
});

describe("metricTracks", () => {
  const stats = (atk: number) => ({ atk, def: 1, spd: 1, rcv: 1 });
  const frames = [
    frame(0, [unit("A1", { stats: stats(100), ct: 0 }), unit("A6", { state: "bench", stats: stats(50) })]),
    frame(1, [unit("A1", { stats: stats(150), ct: 5, shield: 20 }), unit("A6", { state: "bench", stats: stats(50) })]),
    frame(2, [unit("A1", { state: "dead", hp: 0, stats: stats(150) }), unit("A6", { stats: stats(50) })]),
  ];
  const hp = hpTracks(frames, []);
  it("follows a live stat while the unit is on the field", () => {
    const t = metricTracks(frames, hp, "atk");
    expect(t[0]!.segs).toEqual([{ points: [{ t: 0, v: 100 }, { t: 1, v: 150 }], end: 1 }]);
    expect(t[0]!.ko).toBe(2);
    expect(t[1]!.segs).toEqual([{ points: [{ t: 2, v: 50 }], end: 2 }]);
  });
  it("gives special charge in % and the Shield", () => {
    expect(metricTracks(frames, hp, "ct")[0]!.segs[0]!.points.map((p) => p.v)).toEqual([0, 50]);
    expect(metricTracks(frames, hp, "shield")[0]!.segs[0]!.points.map((p) => p.v)).toEqual([0, 20]);
  });
  it("offers the stats only when the frames carry them", () => {
    expect(metricsIn(frames)).toEqual(["hp", "atk", "def", "spd", "rcv", "ct", "shield"]);
    expect(metricsIn([frame(0, [unit("A1", {})])])).toEqual(["hp", "ct", "shield"]);
  });
});

describe("levelSeries", () => {
  it("is 0 without a buff and follows the level", () => {
    const frames = [
      frame(0, [unit("D1", {})]),
      frame(1, [unit("D1", { buffs: { ATK: 2 } })]),
      frame(2, [unit("D1", { buffs: { ATK: -1 } })]),
      frame(3, [unit("D1", {})]),
    ];
    expect(levelSeries(frames, "D1", "ATK")[0]!.points.map((p) => [p.t, p.v])).toEqual([[0, 0], [1, 2], [2, -1], [3, 0]]);
  });
});

describe("stepPath", () => {
  it("draws steps: across, then up or down", () => {
    const d = stepPath([{ points: [{ t: 0, v: 1 }, { t: 2, v: 3 }], end: 4 }], (t) => t * 10, (v) => v);
    expect(d).toBe("M0.0,1.0H20.0V3.0H40.0");
  });
});

describe("niceTicks", () => {
  it("steps by 1 / 2 / 5 x 10^k", () => {
    expect(niceTicks(100, 4)).toEqual([0, 50, 100]);
    expect(niceTicks(30000, 3)).toEqual([0, 10000, 20000, 30000]);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe("eventsNear", () => {
  it("finds the marks within the radius, in time order", () => {
    const list = [{ t: 5, id: "b" }, { t: 1, id: "x" }, { t: 4.5, id: "a" }, { t: 6.2, id: "y" }];
    expect(eventsNear(list, 5, 0.6).map((e) => e.id)).toEqual(["a", "b"]);
    expect(eventsNear(list, 10, 1)).toEqual([]);
  });
});
