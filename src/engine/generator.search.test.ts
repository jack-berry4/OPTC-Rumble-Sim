/**
 * The generator's search beyond one change at a time (user, 2026-11-25: "could the generator find a team with 2+
 * changes that needed to be made, when each single change makes the team worse?").
 */
import { describe, expect, it } from "vitest";
import { loadNodeDb } from "../sim/nodeDb";
import { compoundMoves, generate, legalTeam, neighbours, type Evaluate, type GenOptions, type Measured } from "./generator";
import { applyPreset, DEFAULT_PRESETS } from "./stats";
import { clashReason } from "./team";
import { kitLinks, links, themeGroups, themeTeam } from "./themes";
import type { MemberConfig, TeamConfig } from "./types";

const db = loadNodeDb();
const MAX = DEFAULT_PRESETS[3]!;
const build = (id: number): MemberConfig => applyPreset(db.byId.get(id)!, { unitId: id }, MAX);
const SHANKS = 4560, BECKMAN = 4547; // Beckman & Yasopp: [Red-Haired Pirates], which Shanks's kit targets

/** Cheap units that neither Shanks nor Beckman & Yasopp work with, and that can all be on one team. */
function fillers(n: number): MemberConfig[] {
  const out: MemberConfig[] = [];
  const s = db.byId.get(SHANKS)!, b = db.byId.get(BECKMAN)!;
  for (const r of [...db.all].sort((x, y) => y.id - x.id)) {
    if (out.length >= n) break;
    if (r.cost !== 20 || !["6", "6+"].includes(String(r.stars)) || r.id === SHANKS || r.id === BECKMAN) continue;
    if (links(s, r) || links(r, s) || links(b, r) || links(r, b)) continue;
    const m = build(r.id);
    if (out.some((o) => clashReason(db, o, m)) || clashReason(db, m, build(SHANKS)) || clashReason(db, m, build(BECKMAN))) continue;
    out.push(m);
  }
  return out;
}

/** A made-up fitness: 0.5; one of the two alone 0.45 (worse); both 0.8. No noise: what the search can reach. */
const pairOnly: Evaluate = async (teams, _from, n) => teams.map((t) => {
  const ids = t.members.map((m) => m?.unitId);
  const a = ids.includes(SHANKS), b = ids.includes(BECKMAN);
  const f = a && b ? 0.8 : a || b ? 0.45 : 0.5;
  return { fit: f * n, sq: f * f * n };
});

describe("generator: changes of two units at once", () => {
  it("the kit links: Shanks's kit works with Beckman & Yasopp", () => {
    expect(kitLinks(db.byId.get(SHANKS)!).tokens.length).toBeGreaterThan(0);
    expect(links(db.byId.get(SHANKS)!, db.byId.get(BECKMAN)!)).toBe(true);
  });

  const base = fillers(14);
  const start: TeamConfig = { members: base.slice(0, 8) };
  const pool = [...base, build(SHANKS), build(BECKMAN)];
  const rank = (m: MemberConfig) => (m.unitId === SHANKS ? 10 : m.unitId === BECKMAN ? 9 : 0);
  const run = (compounds: boolean) => generate({
    db, pool, templates: [], teams: [{ title: "start", team: start }], evaluate: pairOnly, step: 6, final: 12, beam: 1,
    shortlist: 30, rank, compounds, themes: false, kicks: 0,
  });

  it("one change at a time can't get there (each of the two alone makes the team worse)", async () => {
    expect(legalTeam(db, start)).toBe(true);
    const [best] = await run(false);
    const ids = best!.team.members.map((m) => m?.unitId);
    expect(ids.includes(SHANKS) && ids.includes(BECKMAN)).toBe(false);
  });

  it("with two-unit changes it finds the team that needs both", async () => {
    const [best] = await run(true);
    const ids = best!.team.members.map((m) => m?.unitId);
    expect(ids).toContain(SHANKS);
    expect(ids).toContain(BECKMAN);
    expect(best!.fit).toBeCloseTo(0.8, 5);
  });

  it("two-unit changes are legal teams that change exactly two places", () => {
    const singles: Measured[] = neighbours(db, start, pool).map((c, i) => ({ ...c, fit: 1 - i * 1e-3, n: 6, se: 0 }));
    const comps = compoundMoves(db, start, singles, pool.slice().sort((a, b) => rank(b) - rank(a)));
    expect(comps.length).toBeGreaterThan(0);
    for (const c of comps) {
      expect(legalTeam(db, c.team)).toBe(true);
      expect(c.team.members.filter((m, i) => m !== start.members[i]).length).toBe(2);
    }
  });
});

describe("generator: themed starting teams", () => {
  it("a group's team takes the group's units first and keeps the cost limit", () => {
    const ids = [...db.all].filter((r) => ["6", "6+"].includes(String(r.stars)) && r.id > 4400).map((r) => r.id);
    const members = ids.map(build);
    const groups = themeGroups(ids.map((id) => db.byId.get(id)!), 6);
    const str = groups.find((g) => g.token === "[STR]")!;
    expect(str).toBeDefined();
    const team = themeTeam(db, members, str.units, () => 0);
    expect(team.filter(Boolean).length).toBe(8);
    expect(legalTeam(db, { members: team })).toBe(true);
    expect(team.filter((m) => m && str.units.has(m.unitId)).length).toBeGreaterThanOrEqual(5);
  });

  it("kicks: a longer search never ends worse than the first result", async () => {
    const base = fillers(14);
    const pool = [...base, build(SHANKS), build(BECKMAN)];
    const opts: GenOptions = { db, pool, templates: [], teams: [{ title: "start", team: { members: base.slice(0, 8) } }], evaluate: pairOnly, step: 6, final: 12, beam: 1, shortlist: 30, compounds: false, themes: false };
    const [quick] = await generate({ ...opts, kicks: 0 });
    const [long] = await generate({ ...opts, kicks: 6 });
    expect(long!.fit).toBeGreaterThanOrEqual(quick!.fit);
  });
});
