import { describe, expect, it } from "vitest";
import { loadNodeDb as loadUnitDb } from "../sim/nodeDb";
import { defaultTeams } from "./defaultTeams";
import { decodeTeam, encodeTeam, teamLegality } from "./teamCode";

const db = loadUnitDb();

describe("team codes", () => {
  it("round-trips a team with title, authors, builds and empty positions", () => {
    const team = { members: [{ unitId: 4000, level: 120, rumbleKey: true }, null, { unitId: 39, illegal: true, cc: { hp: 400, atk: 0, rcv: 0 } }], maxCc: { hp: 150, atk: 200, rcv: 100 } };
    const code = encodeTeam({ title: "Test  team ", authors: ["Jack", " "], team });
    expect(code.startsWith("RS1.")).toBe(true);
    const back = decodeTeam(code, db);
    expect(back.title).toBe("Test team");
    expect(back.authors).toEqual(["Jack"]);
    expect(back.team.members).toHaveLength(8);
    expect(back.team.members[0]).toEqual(team.members[0]);
    expect(back.team.members[1]).toBeNull();
    expect(back.team.members[2]).toEqual(team.members[2]);
    expect(back.team.maxCc).toEqual(team.maxCc);
  });

  it("rejects bad codes with a readable message", () => {
    expect(() => decodeTeam("hello", db)).toThrow(/team code/);
    expect(() => decodeTeam("RS1.!!!", db)).toThrow(/damaged/);
    const unknown = encodeTeam({ title: "", authors: [], team: { members: [{ unitId: 999999 }] } });
    expect(() => decodeTeam(unknown, db)).toThrow(/999999/);
  });

  it("flags teams that aren't fully legal", () => {
    const [pacifistas, buggy] = defaultTeams();
    expect(teamLegality(db, pacifistas).legal).toBe(true); // a color-variant set: allowed together
    expect(teamLegality(db, buggy).legal).toBe(false); // admin units with cotton candy over the cap
    expect(teamLegality(db, { members: [{ unitId: 4000 }, { unitId: 39 }] }).legal).toBe(true);
  });
});
