import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assaultLevelMult, bossStats, gameBossTeam, seasonRules, specialEffects, type AssaultSeasons } from "./gameKit";

const data = JSON.parse(readFileSync(new URL("../../public/game/assault-seasons.json", import.meta.url), "utf8")) as AssaultSeasons;
const season = data.seasons.find((s) => s.id === 22)!;
const bb = season.teams.find((t) => t.name === "Blackbeard")!;

describe("Assault Rumble bosses from the game data", () => {
  it("boss stats match the user's screens (Blackbeard, Lv 1 and Lv 4)", () => {
    const u = data.decks[String(bb.levels[0]!.deck)]!.units[0]!;
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    const l1 = bossStats(u, bb.levels[0]!), l4 = bossStats(u, bb.levels[3]!);
    near(l1.hp, 19_759); near(l1.atk, 2_201); near(l1.rcv, 228);
    near(l4.hp, 36_157); near(l4.atk, 2_485); near(l4.rcv, 235);
    expect([l1.def, l1.spd]).toEqual([192, 146]);
    // Lv 10 (videos, 2026-11-24): the Damage over Time ticks give 141,900 max HP with HP Up Lv 30 (+7,500)
    const l10 = bossStats(data.decks[String(bb.levels[9]!.deck)]!.units[0]!, bb.levels[9]!);
    expect(l10.hp + 30 * 250).toBe(141_900);
  });
  it("Lv 10 stats match the user's screens: no plus values, potentials/sockets scaled by special level / max", () => {
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    const screens: Record<string, [number | null, number, number]> = {
      Blackbeard: [null, 6_012, 1_029], // HP shown as ?????
      Akainu: [78_456, 6_235, 1_272], Kizaru: [49_840, 5_873, 1_273], Fujitora: [45_878, 5_291, 1_295], // Fujitora: special Lv 6 of 8
    };
    let n = 0;
    for (const t of season.teams.filter((x) => x.name === "Blackbeard" || x.name === "Akainu")) {
      const lv = t.levels[9]!;
      for (const u of data.decks[String(lv.deck)]!.units) {
        const s = bossStats(u, lv), [hp, atk, rcv] = screens[u.name]!;
        if (hp !== null) near(s.hp, hp);
        near(s.atk, atk); near(s.rcv, rcv);
        n++;
      }
    }
    expect(n).toBe(4);
  });
  it("reads the boss's kit: ability levels, resistances, pattern and special", () => {
    let n = 0;
    const [boss] = gameBossTeam(data, season, bb, 1, () => 9_000_001 + n++);
    expect(boss!.abilities.map((e) => `${e.attributes![0]} ${e.level}`)).toEqual(["HP 26", "ATK 21", "SPD 21", "DEF 11", "Special CT 6"]);
    expect(boss!.abilities[4]!.condition).toEqual({ type: "time", comparator: "after", count: 40 });
    expect(boss!.resilience.map((r) => (r as { attribute?: string }).attribute)).toEqual(["Forced Out", "Special Bind", "Action Bind", "Percentage Damage"]);
    expect(boss!.pattern.map((p) => (p.action === "attack" ? p.type : "heal"))).toEqual(["Normal", "Power", "Power", "Full"]);
    expect(boss!.special!.cooldown).toBe(28);
    expect(boss!.game!.notes).toEqual([]);
    // "...; targets QCK-type enemies ignoring DEF for ATK x 1 damage"
    expect(boss!.special!.effects.at(-1)).toMatchObject({ effect: "damage", type: "atk", amount: 1, defbypass: true, targeting: { targets: ["[QCK]"] } });
    expect(boss!.game!.additionalBehaviors).toBe(3);
    expect(boss!.places).toBe(4); // the main boss: 1 + the count NEXT places (video, 2026-11-24)
  });
  it("reads range attacks (Akainu's Medium Range steps) and marks only the first unit as the main boss", () => {
    let n = 0;
    const ak = season.teams.find((t) => t.name === "Akainu")!;
    const team = gameBossTeam(data, season, ak, 10, () => 9_000_101 + n++);
    expect(team[0]!.pattern).toEqual([
      { action: "attack", type: "Normal" }, { action: "attack", type: "Power", range: "Medium" },
      { action: "attack", type: "Power" }, { action: "attack", type: "Full", range: "Medium" },
    ]);
    expect(team.map((b) => b.places)).toEqual([3, undefined, undefined]);
  });
  it("turns the season's rules into rules for your side", () => {
    const r = seasonRules(season, bb);
    expect(r.map((x) => (x.effect.kind === "game" ? "last 30 s" : `${x.target.value} ${(x.effect as { percent: number }).percent}`))).toEqual(["STR 30", "Free Spirit 30", "QCK -30", "Giant 40", "Straw Hat Pirates 40", "last 30 s"]);
  });
  it("Assault Lv multipliers fit the user's results (Lv 4, 5, 6) and Lv 10", () => {
    expect([4, 5, 6, 10].map(assaultLevelMult)).toEqual([1.375, 1.5, 1.625, 2.5]);
  });
  it("reads most special clauses of every season", () => {
    const texts = [...new Set(Object.values(data.decks).flatMap((d) => d.units.map((u) => u.special?.text ?? "")))];
    let all = 0, bad = 0;
    const missed: string[] = [];
    for (const t of texts) {
      const r = specialEffects(t);
      all += r.effects.length + r.notes.length;
      bad += r.notes.length;
      missed.push(...r.notes);
    }
    console.log(`special clauses: ${all - bad}/${all} read; e.g. not read:\n${[...new Set(missed)].slice(0, 25).join("\n")}`);
    expect((all - bad) / all).toBeGreaterThan(0.8);
  });
});
