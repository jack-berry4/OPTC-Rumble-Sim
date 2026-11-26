import { describe, expect, it } from "vitest";
import { loadNodeDb } from "../sim/nodeDb";
import { simulateMany } from "../sim/simulate";
import { NYDATO_CEREBRAL, NYDATO_COMPS, NYDATO_SINCE, NYDATO_STR, newerThanSheet, releasedOf } from "./defaultTeams";
import { adaptTemplate, aimQuantile, generate, legalTeam, neighbours, quantileStats, type Evaluate } from "./generator";
import type { MemberConfig } from "./types";

const db = loadNodeDb();
const evaluate: Evaluate = async (teams, from, n) => teams.map((t) => {
  const s = simulateMany(db, t, NYDATO_STR, n, from, [], 1);
  return { fit: s.attackerWins, sq: s.attackerWins };
});

describe("team generator", () => {
  const pool = NYDATO_CEREBRAL.members.filter((m): m is MemberConfig => !!m);
  const extra: MemberConfig[] = [4492, 4629, 4375, 4556].map((unitId) => ({ unitId }));
  it("adapts a comp to the units at hand, using the comp's options first", () => {
    const qck = NYDATO_COMPS.find((c) => c.title === "QCK")!;
    const a = adaptTemplate(db, new Map([...pool, ...extra].map((m) => [m.unitId, m])), qck);
    expect(a.missing).toBeGreaterThan(0);
    expect(legalTeam(db, a.team)).toBe(true);
    expect(a.team.members.some((m) => m?.unitId === 4629)).toBe(true); // Loki is in the pool and in the comp
  });
  it("tries single replacements and swaps, all legal", () => {
    const ns = neighbours(db, NYDATO_CEREBRAL, extra);
    expect(ns.length).toBeGreaterThan(28);
    expect(ns.every((c) => legalTeam(db, c.team))).toBe(true);
    expect(ns.some((c) => c.origin.startsWith("swap"))).toBe(true);
  });
  it("tries another build of a unit in its own place (death-special units at level 1)", () => {
    const first = NYDATO_CEREBRAL.members[0]!;
    const low: MemberConfig = { unitId: first.unitId, level: 1, specialLevel: 10, abilityLevel: 5 };
    const ns = neighbours(db, NYDATO_CEREBRAL, [low]);
    expect(ns.some((c) => c.team.members[0]?.level === 1 && c.team.members[0]?.unitId === first.unitId)).toBe(true);
    // never a second copy of the unit elsewhere
    expect(ns.every((c) => c.team.members.filter((m) => m?.unitId === first.unitId).length === 1)).toBe(true);
  });
  it("finds a team at least as good as where it started", async () => {
    const res = await generate({
      db, pool: [...pool, ...extra], templates: [], teams: [{ title: "your team", team: NYDATO_CEREBRAL }],
      step: 6, final: 12, beam: 1, shortlist: 3, evaluate,
    });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => legalTeam(db, r.team))).toBe(true);
    const start = res.find((r) => r.origin === "your team");
    if (start && start.n === res[0]!.n) expect(res[0]!.fit).toBeGreaterThanOrEqual(start.fit);
  }, 120_000);
  it("an aim (tries, how sure) ranks by the score reached at least once in N tries with that chance", () => {
    const xs = Array.from({ length: 101 }, (_, i) => i); // 0..100
    expect(aimQuantile({ tries: 1, sure: 0.5 })).toBeCloseTo(0.5); // one try, even odds: the median
    expect(aimQuantile({ tries: 1, sure: 0.9 })).toBeCloseTo(0.1); // steady: 9 runs in 10 reach it
    // 3 tries, 90% sure: P(best of 3 >= x) = 1 - F(x)^3 = 0.9
    const q = aimQuantile({ tries: 3, sure: 0.9 });
    expect(1 - Math.pow(q, 3)).toBeCloseTo(0.9);
    // more tries or less certainty: a higher target
    expect(aimQuantile({ tries: 10, sure: 0.5 })).toBeGreaterThan(aimQuantile({ tries: 3, sure: 0.5 }));
    expect(aimQuantile({ tries: 3, sure: 0.2 })).toBeGreaterThan(aimQuantile({ tries: 3, sure: 0.9 }));
    expect(quantileStats(xs, 0.5).fit).toBeCloseTo(50);
    expect(quantileStats(xs, 0.9).se).toBeGreaterThan(0);
  });
});

describe("units newer than Nydato's sheet (user, 2026-11-24)", () => {
  it("the game data gives release dates, and units since the sheet's oldest tab update are added", () => {
    expect(releasedOf(db.byId.get(4680)!)).toBe("2026-11-20"); // Nico Robin, Global 2026-11-20
    expect(releasedOf(db.byId.get(1)!)! < "2018-01-01").toBe(true);
    expect(newerThanSheet(db.byId.get(4680)!, "2026-05-24")).toBe(true);
    expect(newerThanSheet(db.byId.get(4560)!, "2026-05-24")).toBe(false); // 2026-05-08
    expect(newerThanSheet(db.byId.get(4680)!, null)).toBe(false);
    expect(NYDATO_SINCE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
