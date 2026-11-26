import { describe, expect, it } from "vitest";
import { loadNodeDb } from "../sim/nodeDb";
import { applyBulk, boxEdit, changedGroups, sameBuild, withKnown } from "./buildGroups";
import type { MemberConfig } from "./types";
import { lbMaxNodes, withDefaults } from "./stats";

const db = loadNodeDb();
const rec = db.byId.get(4202)!; // Jinbe: 40 Limit Break nodes, 30 before the key

describe("bulk changes by stat", () => {
  it("leaves confirmed stats alone unless asked for all", () => {
    const m = withKnown({ unitId: 4202, sockets: 10 }, ["sockets"]);
    expect(applyBulk(rec, m, { group: "sockets", to: 5 }, "unconfirmed")).toBe(m);
    expect(applyBulk(rec, m, { group: "sockets", to: 5 }, "all").sockets).toBe(25);
  });
  it("sets the Limit Break to none / the usual max / everything", () => {
    const m = { unitId: 4202 };
    expect(applyBulk(rec, m, { group: "lb", to: "none" }, "all").lbNodes).toBe(0);
    expect(applyBulk(rec, m, { group: "lb", to: "usual" }, "all").lbNodes).toBe(lbMaxNodes(rec, false));
    const all = applyBulk(rec, m, { group: "lb", to: "all" }, "all");
    expect(all.lbNodes).toBe(lbMaxNodes(rec, true));
    expect(all.lbKey).toBe(true);
  });
  it("a level past the LLB raises the LLB, unless the LLB is confirmed", () => {
    const m = { unitId: 4202, level: 99, llbLevel: 0 };
    expect(withDefaults(rec, applyBulk(rec, m, { group: "level", to: 130 }, "all")).level).toBe(130);
    const known = withKnown(m, ["llb"]);
    expect(withDefaults(rec, applyBulk(rec, known, { group: "level", to: 130 }, "all")).level).toBe(99);
  });
  it("finds the parts a hand edit changed", () => {
    expect(changedGroups({ unitId: 1, level: 99 }, { unitId: 1, level: 110, rumbleKey: true })).toEqual(["level", "rumbleKey"]);
  });
});

describe("box units edited on a team (user, 2026-11-25)", () => {
  it("sameBuild ignores key order, unset fields and confirmed parts", () => {
    const a: MemberConfig = { unitId: 4560, level: 120, llbLevel: 3, known: ["level"] };
    const b = { llbLevel: 3, unitId: 4560, level: 120, rumbleKey: undefined } as MemberConfig;
    expect(sameBuild(a, b)).toBe(true);
    expect(sameBuild(a, { ...b, rumbleKey: true })).toBe(false);
  });
  it("boxEdit keeps the box's confirmed parts and confirms what changed", () => {
    const boxed: MemberConfig = { unitId: 4560, level: 120, rumbleKey: false, known: ["level"] };
    const e = boxEdit(boxed, { ...boxed, rumbleKey: true, known: ["sockets"] });
    expect(e.rumbleKey).toBe(true);
    expect(e.known).toEqual(["level", "rumbleKey"]);
  });
});
