import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultTeams } from "../engine/defaultTeams";
import { TILE } from "../engine/grid";
import { DEFAULT_RULES, describeRule, gameRule, ruleBuffs, type GlobalRule } from "../engine/rules";
import { decodeTeam } from "../engine/teamCode";
import type { TeamConfig } from "../engine/types";
import { Battle, hasFamily, inRange, matchesToken, simulateBattle, subIndex, TICK, TUNE } from "./battle";
import { RUN9_RULES } from "./fixtures/run9";
import { loadNodeDb } from "./nodeDb";
import { Dice, streamSeeds } from "./rand";
import { mergeSummaries, seedsFor, simulateMany } from "./simulate";
import { decodedWindup, timingFor } from "./timing";

const db = loadNodeDb();
const [run1Atk, run1Def] = defaultTeams();
const codes = readFileSync(new URL("./fixtures/run9-teams.txt", import.meta.url), "utf8").split(/\s+/).filter((x) => x.startsWith("RS1."));
const [run9Enemy, run9Mine] = codes.map((c) => decodeTeam(c, db).team) as [TeamConfig, TeamConfig];

describe("randomness (handoff section 1)", () => {
  it("draws depend on the address only, not on the order they are asked in", () => {
    const d = new Dice(streamSeeds(7), false);
    const a = d.u("special", 3, "rank", 1, 2, 4);
    d.u("dice", 3, "guard", 9);
    d.u("special", 5, "rank", 1, 2, 4);
    expect(d.u("special", 3, "rank", 1, 2, 4)).toBe(a);
  });
  it("varying the timing stream leaves special and dice seeds alone", () => {
    const a = seedsFor(1, 0, "timing").seeds!;
    const b = seedsFor(1, 1, "timing").seeds!;
    expect(a.special).toBe(b.special);
    expect(a.dice).toBe(b.dice);
    expect(a.timing).not.toBe(b.timing);
  });
  it("timings are drawn once per unit and only from the timing stream", () => {
    const r1 = simulateBattle(db, run9Mine, run9Enemy, { seed: 1, seeds: { timing: 5 }, rules: RUN9_RULES, recordEvents: false });
    const r2 = simulateBattle(db, run9Mine, run9Enemy, { seed: 2, seeds: { timing: 5 }, rules: RUN9_RULES, recordEvents: false });
    expect(r2.timings).toEqual(r1.timings);
    expect(r1.timings.A1!.measured).toBe(false); // high-end units borrow a measured profile
    // Pacifista: its own profile for reach; wind-up and stay from its decoded attack (first hit 32, 92 frames, at 40 fps)
    const pac = simulateBattle(db, run1Atk, run1Def, { seed: 3, recordEvents: false }).timings.A1!;
    expect(pac).toMatchObject({ profile: "Pacifista", measured: true, windupFrom: "data", stayFrom: "data", firstHit: 32, frames: 92, reach: 212 });
    expect(pac.windup).toBeCloseTo(32 / 40, 9);
    expect(pac.stay).toBeCloseTo(92 / 40, 9);
  });
  it("a unit with a decoded attack gets wind-up = first hit / 40 and stay = animation length / 40 (user labels 2026-11-17)", () => {
    const r = simulateBattle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES, recordEvents: false });
    const a1 = r.timings.A1!; // Shiryu 4600: no profile of its own, decoded first hit 32, 92 frames
    expect(a1).toMatchObject({ measured: false, windupFrom: "data", stayFrom: "data", firstHit: 32, frames: 92 });
    expect(a1.windup).toBeCloseTo(0.8, 9); // labeled 0.784 / 0.802 in run 9
    expect(a1.stay).toBeCloseTo(2.3, 9);
    expect(decodedWindup(15)).toBeCloseTo(0.375, 9); // Usopp & Lilith, Caesar, Buggy 4563 labeled 0.367-0.386
    expect(decodedWindup(33)).toBeCloseTo(0.825, 9); // Imu, Shanks labeled 0.816-0.840
    const d = new Dice(streamSeeds(3), false);
    const off = timingFor(4600, d, 7), on = timingFor(4600, d, 7, 32, 92);
    expect({ ...on, windup: 0, stay: 0, windupFrom: "", stayFrom: "", firstHit: 0, frames: 0 })
      .toEqual({ ...off, windup: 0, stay: 0, windupFrom: "", stayFrom: "", firstHit: 0, frames: 0 }); // only wind-up and stay change
    expect(off.windupFrom).toBe("borrowed");
    expect(timingFor(4600, d, 7, 32).stayFrom).toBe("borrowed"); // no length known: borrowed stay
  });
  it("a unit without decoded data keeps its borrowed profile", () => {
    const r = simulateBattle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES, recordEvents: false });
    expect(db.byId.get(4629)?.game?.attack).toBeUndefined(); // Loki 4629: only a placeholder attack file
    const a4 = r.timings.A4!;
    expect(a4).toMatchObject({ profile: "Pacifista", measured: false, windupFrom: "borrowed", windup: 0.87, stay: 2.33 });
    expect(a4.firstHit).toBeUndefined();
  });
  it("the last recorded frame is the battle's last moment", () => {
    const r = simulateBattle(db, run9Mine, run9Enemy, { seed: 4, rules: RUN9_RULES, frameInterval: 0.25 });
    expect(r.frames.at(-1)!.t).toBeCloseTo(r.time, 6);
  });
  it("is deterministic for a seed", () => {
    const a = simulateBattle(db, run9Mine, run9Enemy, { seed: 11, rules: RUN9_RULES });
    const b = simulateBattle(db, run9Mine, run9Enemy, { seed: 11, rules: RUN9_RULES });
    expect(b.events).toEqual(a.events);
  });
});

describe("test run 1 (low end)", () => {
  const r = simulateBattle(db, run1Atk, run1Def, { seed: 1, rules: DEFAULT_RULES });
  it("opens with your five units, then enemy slots 3, 4, 5 (section 14)", () => {
    const picks = r.events.filter((e) => e.kind === "action").slice(0, 8).map((e) => e.actor);
    expect(picks).toEqual(["A1", "A2", "A3", "A4", "A5", "D3", "D4", "D5"]);
  });
  it("hits for the measured numbers", () => {
    const hits = new Set(r.events.filter((e) => e.kind === "hit" && !/CRIT|guarded/.test(e.text)).map((e) => e.amount));
    for (const v of [571, 572, 573, 546, 604, 718, 260, 120]) expect(hits).toContain(v);
  });
});

describe("test run 9 (appendix A)", () => {
  const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES, recordEvents: false });
  b.init();
  it("opening stats and buff levels match the recording", () => {
    const want: Record<string, [number, number, number, string]> = {
      A1: [13253.4, 5617.6, 529.1, "7/17/16/13"], A2: [19018.7, 6293.2, 342, "0/0/6/11"], A3: [15136.7, 5556.4, 497.5, "0/14/9/17"],
      A4: [18295.2, 6365.7, 719, "7/17/23/7"], A5: [14166.2, 5285.4, 627.6, "7/17/20/13"], D1: [12191.6, 5940.3, 350, "-1/18/6/19"],
      D2: [7980.3, 4346, 363, "-1/18/6/19"], D3: [19295.1, 8211.3, 334, "-1/26/6/19"], D4: [16322.3, 6294, 339.6, "-1/18/6/19"],
      D5: [9332.2, 5546.2, 310, "-7/18/6/23"],
    };
    for (const [uid, [hp, atk, def, lv]] of Object.entries(want)) {
      const u = b.unit(uid);
      expect(b.maxHp(u), uid).toBeCloseTo(hp, 0);
      expect(b.atk(u), uid).toBeCloseTo(atk, 0);
      expect(b.def(u), uid).toBeCloseTo(def, 0);
      expect(["HP", "ATK", "DEF", "SPD"].map((a) => b.lv(u, a)).join("/"), uid).toBe(lv);
    }
  });
  it("opens with the recorded picks: Imu (special), Shanks, Lafitte, Shiryu (the queue rules of 2026-11-11)", () => {
    for (const seed of [1, 2, 3]) {
      const r = simulateBattle(db, run9Mine, run9Enemy, { seed, rules: RUN9_RULES });
      expect(r.events.filter((e) => e.kind === "action").slice(0, 4).map((e) => e.actor), `seed ${seed}`).toEqual(["A2", "D4", "A5", "A1"]);
    }
  });
  it("reproduces the damage check values (section 7)", () => {
    const U = (x: string) => b.unit(x);
    expect(b.regularDamage(U("A1"), U("D2"), "Normal", false, false).dmg).toBe(927); // Shiryu on Kuma
    expect(b.regularDamage(U("D2"), U("A1"), "Normal", false, false).dmg).toBeCloseTo(282, -1); // shown 282, formula 284
    const nus = U("D3");
    b.addMod(nus, "DEF", -100);
    expect(Math.abs(b.regularDamage(U("A1"), nus, "Power", false, false).dmg - 5056)).toBeLessThanOrEqual(3);
    const loki = U("A4");
    b.addMod(loki, "ATK", 24 - b.lv(loki, "ATK"));
    expect(Math.abs(b.specialDamage(loki, nus, 4) - 39690)).toBeLessThanOrEqual(3);
    b.addStatusFor(U("D2"), "Ability Bind"); // Kuma's passive off: Shanks' first hit
    expect(b.regularDamage(U("D4"), U("A3"), "Normal", false, false).dmg).toBe(476);
  });
});

describe("from the game's battle data (2026-11-13)", () => {
  it("radial ranges are 1.2 / 2.3 / 3.6 tiles of |GRID_U|", () => {
    expect(TILE).toBeCloseTo(Math.hypot(86, 37), 9);
    expect(TUNE.radial.small).toBeCloseTo(1.2 * TILE, 9);
    expect(TUNE.radial.medium).toBeCloseTo(2.3 * TILE, 9);
    expect(TUNE.radial.large).toBeCloseTo(3.6 * TILE, 9);
    const o = { x: 0, y: 0 };
    expect(inRange(o, o, { x: 1.19 * TILE, y: 0 }, "radial", "small", 1)).toBe(true);
    expect(inRange(o, o, { x: 1.21 * TILE, y: 0 }, "radial", "small", 1)).toBe(false);
  });
  it("a level-5 Shield is 3,000", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    const t = b.unit("A1");
    t.shield = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b as any).boon(t, t, "Shield", { effect: "boon", attributes: ["Shield"], level: 5 }, 100);
    expect(t.shield).toBe(3000);
  });
  it("pattern heals: Small = 1 tile around the healed teammate, 0.3 / 0.6 x the healer's RCV", () => {
    expect(TUNE.healRadius.Small).toBeCloseTo(TILE, 9);
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    const u = b.unit("A1"), near = b.unit("A2"), far = b.unit("A3");
    u.hp = near.hp = far.hp = 1;
    near.pos = { x: 500, y: 700 };
    far.pos = { x: 500 + 1.05 * TILE, y: 700 };
    u.pos = { x: 500 + 0.95 * TILE, y: 700 };
    bb.doHeal(u, { kind: "heal", target: near, heal: { action: "heal", area: "Small", level: 1 }, n: 0 });
    expect(near.hp).toBe(1 + Math.floor(0.3 * bb.rcv(u)));
    expect(u.hp).toBe(1 + Math.floor(0.3 * bb.rcv(u))); // 0.95 tile away: inside
    expect(far.hp).toBe(1); // 1.05 tiles away: outside
    const before = u.hp;
    bb.doHeal(u, { kind: "heal", target: u, heal: { action: "heal", area: "Self", level: 2 }, n: 0 });
    expect(u.hp).toBe(before + Math.floor(0.6 * bb.rcv(u)));
  });
  it("the last-30-s game rule: Special CT +10 and DEF -6 for everyone, only in the last 30 s, labelled with the game's text", () => {
    const r = gameRule("last30");
    expect(describeRule(r)).toBe("During the last 30 s of battle, Special CT Speed Up & Damage Up!");
    expect(ruleBuffs(r)).toEqual([{ attr: "Special CT", level: 10 }, { attr: "DEF", level: -6 }]);
    expect(10 * TUNE.ctPerLevel).toBeCloseTo(0.3, 9); // SkillSpeed 30 = +30% charge speed
    const at = (rules: GlobalRule[], t: number) => {
      const x = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules, frameInterval: 1 });
      x.init();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (x as any).t = t; (x as any).refreshAuras();
      return x;
    };
    const lv = (x: Battle, uid: string) => [x.lv(x.unit(uid), "Special CT"), x.lv(x.unit(uid), "DEF")];
    for (const uid of ["A1", "D1"]) {
      expect(lv(at([r], 69.5), uid), uid).toEqual(lv(at([], 69.5), uid)); // 30.5 s left: not yet
      const [ct, def] = lv(at([], 70.5), uid);
      expect(lv(at([r], 70.5), uid), uid).toEqual([ct! + 10, def! - 6]);
    }
    const b = at([r], 70.5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    const labels = (bb.sourcesOf(b.unit("D1"), "DEF", b.lv(b.unit("D1"), "DEF")) as { label: string }[]).map((s) => s.label);
    expect(labels).toContain("Rule: DEF -6 (During the last 30 s of battle, Special CT Speed Up & Damage Up!)");
    const off = simulateBattle(db, run9Mine, run9Enemy, { seed: 2, rules: [{ ...r, enabled: false }] });
    const none = simulateBattle(db, run9Mine, run9Enemy, { seed: 2, rules: [] });
    expect([off.winner, off.time, off.events.length]).toEqual([none.winner, none.time, none.events.length]); // off = no effect
  });
});

describe("shields (handoff section 7)", () => {
  it("a special's first damage part breaks the shield for no damage; its second part hits HP; the replay gets both", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    const caster = b.unit("A4"), tgt = b.unit("D1");
    tgt.shield = 500;
    const hp0 = tgt.hp;
    caster.special = {
      cooldown: 10,
      effects: [
        { effect: "damage", type: "atk", amount: 2, targeting: { targets: ["enemies"], count: 1, priority: "lowest", stat: "DEF" } },
        { effect: "damage", type: "atk", amount: 2, targeting: { targets: ["enemies"], count: 1, priority: "lowest", stat: "DEF" } },
      ],
    };
    // make D1 the lowest-DEF enemy so both parts land on it
    for (const e of ["D2", "D3", "D4", "D5"]) b.addMod(b.unit(e), "DEF", 50);
    bb.fireSpecial(caster, tgt, false);
    expect(tgt.shield).toBe(0);
    expect(tgt.hp).toBeLessThan(hp0);
    const ev = bb.events.find((e: { kind: string }) => e.kind === "special");
    expect(ev.partShield[0]).toEqual({ D1: 0 }); // part 1: shield gone, HP untouched
    expect(ev.partHp[0]).toEqual({});
    expect(ev.partShieldHit[0].D1).toBeGreaterThan(0); // its number shows in the shield's color
    expect(ev.partShieldHit[1]).toEqual({});
    expect(Object.keys(ev.partHp[1])).toEqual(["D1"]); // part 2: HP down
  });
});

describe("Forced Out (user, 2026-11-12 / 2026-11-13)", () => {
  type UU = { uid: string; where: string; hp: number; tile: number };
  it("turns the unit's passives off; while one unit is still on the field nobody is rumbled out", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    const field = (bb.sides.def as UU[]).filter((u) => u.where === "field");
    for (const u of field.slice(0, 4)) bb.forceOut(u, 5);
    expect(bb.abilityOn(field[0])).toBe(false);
    bb.rumbleOuts();
    expect(field.slice(0, 4).every((u) => u.where === "out")).toBe(true);
    expect(bb.wiped()).toBeUndefined();
  });
  it("a team of fewer than 5 with every unit Forced Out: all are KO'd and the team loses", () => {
    const small: TeamConfig = { ...run9Enemy, members: [...run9Enemy.members.slice(0, 3), null, null, null, null, null] };
    const b = new Battle(db, run9Mine, small, { seed: 1, rules: RUN9_RULES });
    b.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    for (const u of bb.sides.def as UU[]) bb.forceOut(u, 5);
    const r = b.run();
    expect(r.winner).toBe("atk");
    expect(r.reason).toBe("wipe");
    expect(r.time).toBe(0);
    const def = r.units.filter((u) => u.side === "def");
    expect(def).toHaveLength(3);
    expect(def.every((u) => !u.alive && u.hp === 0)).toBe(true);
    expect(r.events.filter((e) => e.kind === "ko").map((e) => e.target).sort()).toEqual(["D1", "D2", "D3"]);
    expect(r.events.some((e) => e.kind === "effect" && /rumbled out/.test(e.text))).toBe(true);
  });
  it("every field unit Forced Out with a bench: they are KO'd and the bench comes in", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    const def = bb.sides.def as UU[];
    const field = def.filter((u) => u.where === "field");
    const bench = def.filter((u) => u.where === "bench");
    expect(field).toHaveLength(5);
    expect(bench.length).toBeGreaterThan(0);
    // one is KO'd first; its replacement is still on the way when the other four are Forced Out: no unit on the field
    bb.ko(field[0]);
    for (const u of field.slice(1)) bb.forceOut(u, 30);
    bb.rumbleOuts();
    expect(field.every((u) => u.where === "dead" && u.hp === 0)).toBe(true);
    expect(bb.wiped()).toBeUndefined(); // the bench is still to come
    b.t += 1.8;
    bb.benchArrivals();
    expect(bench.every((u) => u.where === "field" && u.hp > 0)).toBe(true);
    expect(new Set(bench.map((u) => u.tile)).size).toBe(bench.length);
  });
});

describe("tags and target tokens (docs/TAGS.md)", () => {
  const recs = [...db.byId.values()];
  const withTag = (t: string) => recs.find((r) => r.tags.includes(t))!;
  const m = (r: (typeof recs)[number], tok: string) => matchesToken({ rec: r } as never, tok);
  it("the game's tag names find the database's merged tags, exact parts only", () => {
    expect(m(withTag("Former / Navy"), "[Navy]")).toBe(true);
    expect(m(withTag("Former / Royalty"), "[Royalty]")).toBe(true);
    expect(m(withTag("Logia-type / Devil Fruit User"), "[Logia-type]")).toBe(true);
    const fake = (tags: string[]) => ({ ...recs[0]!, tags });
    expect(m(fake(["Mythical Zoan-type / Devil Fruit User"]), "[Zoan-type]")).toBe(false);
    expect(m(fake(["Ancient Giant", "Giant Pirate Crew"]), "[Giant]")).toBe(false);
    expect(m(fake(["Navy Admiral"]), "[Navy]")).toBe(false);
    expect(m(withTag("Giant"), "[Giant]")).toBe(true);
  });
  it("names in one token are all required; a comma list and '/' are either-or; side words are ignored", () => {
    const shp = recs.filter((r) => r.tags.includes("Straw Hat Pirates"));
    const psyShp = shp.find((r) => r.color === "[PSY]")!, otherShp = shp.find((r) => r.color && r.color !== "[PSY]")!;
    expect(m(psyShp, "[PSY] [Straw Hat Pirates]")).toBe(true);
    expect(m(otherShp, "[PSY] [Straw Hat Pirates]")).toBe(false);
    const elbaph = withTag("Elbaph Arc");
    expect(m(otherShp, "[Elbaph Arc], [Straw Hat Pirates]") && m(elbaph, "[Elbaph Arc], [Straw Hat Pirates]")).toBe(true);
    const fighter = recs.find((r) => (r.classes as string[]).includes("Fighter") && !(r.classes as string[]).includes("Powerhouse"))!;
    const power = recs.find((r) => (r.classes as string[]).includes("Powerhouse") && !(r.classes as string[]).includes("Fighter"))!;
    expect(m(fighter, "Powerhouse, Fighter") && m(power, "Powerhouse, Fighter")).toBe(true);
    const int = recs.find((r) => r.color === "[INT]")!;
    expect(m(int, "[INT] enemies")).toBe(true);
    const fs = recs.find((r) => (r.classes as string[]).includes("Free Spirit"))!;
    expect(m(fs, "[Free Spirit]")).toBe(true);
    const cerShp = shp.find((r) => (r.classes as string[]).includes("Cerebral"))!;
    expect(m(cerShp, "Cerebral/Free Spirit [Straw Hat Pirates]")).toBe(true);
    expect(m(recs.find((r) => (r.classes as string[]).includes("Cerebral") && !r.tags.includes("Straw Hat Pirates"))!, "Cerebral/Free Spirit [Straw Hat Pirates]")).toBe(false);
    expect(m(withTag("Ancient Zoan-type / Devil Fruit User"), "[Ancient Zoan-type")).toBe(true);
  });
  it("named characters: the kits' spellings find the database's families", () => {
    const fam = (f: string) => recs.find((r) => r.families.includes(f))!;
    expect(hasFamily(fam("Edward Newgate"), ["Edward Newgate (Whitebeard)"])).toBe(true);
    expect(hasFamily(fam("Señor Pink"), ["Senor Pink"])).toBe(true);
    expect(hasFamily(fam("Lao G"), ["Lao G."])).toBe(true);
    expect(hasFamily(fam("Edward Newgate"), ["Marshall D. Teach (Blackbeard)"])).toBe(false);
  });
  it("'Broggy crew member': a named character next to 'crew' targets that character only", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    const a2 = b.unit("A2");
    const fam = a2.rec.families[0]!;
    const got = b.targetsOf(b.unit("A1"), { effect: "buff", attributes: ["ATK"], level: 1, targeting: { targets: ["crew"], families: [fam] } as never }, undefined, undefined);
    expect(got.map((x) => x.uid)).toEqual(b.side("atk").filter((x) => x.where === "field" && x.rec.families.includes(fam)).map((x) => x.uid));
  });
  it("crew counts: 'remaining' counts the bench; 'more ... than' with no count means strictly more; 'enemy' team", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    const u = b.unit("A1");
    const n = b.side("atk").length;
    expect(n).toBeGreaterThan(5);
    expect(b.cond(u, { type: "crew", comparator: "more", count: n })).toBe(true);
    expect(b.cond(u, { type: "crew", comparator: "more", count: n + 1 })).toBe(false);
    const diff = n - b.side("def").length;
    expect(b.cond(u, { type: "crew", relative: true, comparator: "more" })).toBe(diff > 0);
    expect(b.cond(u, { type: "crew", relative: true, comparator: "exactly" })).toBe(diff === 0);
    const fam = b.unit("D1").rec.families[0]!;
    expect(b.cond(u, { type: "character", team: "enemy", families: [fam] })).toBe(true);
  });
});

describe("buff sources (replay breakdown)", () => {
  it("in every frame of a recorded run 9 battle each stat's sources sum to its buff level", () => {
    const kinds = new Set<string>();
    for (const seed of [1, 2]) {
      const r = simulateBattle(db, run9Mine, run9Enemy, { seed, rules: RUN9_RULES, frameInterval: 0.25 });
      expect(r.frames.length).toBeGreaterThan(50);
      for (const f of r.frames) for (const u of f.units) {
        expect(Object.keys(u.buffSources ?? {}).sort(), `${f.t} ${u.uid}`).toEqual(Object.keys(u.buffs).sort());
        for (const [at, list] of Object.entries(u.buffSources ?? {})) {
          expect(list.reduce((s, x) => s + x.level, 0), `${f.t} ${u.uid} ${at}`).toBeCloseTo(u.buffs[at]!, 9);
          for (const x of list) { kinds.add(x.kind); expect(x.label).toBeTruthy(); expect(x.level).not.toBe(0); }
        }
      }
    }
    expect([...kinds].sort()).toEqual(expect.arrayContaining(["ability", "rule", "special"]));
    expect(kinds.has("other")).toBe(false);
  });
  it("labels name the unit and say what gave it", () => {
    const r = simulateBattle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES, frameInterval: 1 });
    const labels = new Set(r.frames.flatMap((f) => f.units.flatMap((u) => Object.values(u.buffSources ?? {}).flat().map((x) => x.label))));
    expect([...labels].some((l) => /^[AD]\d \S.*: ability/.test(l))).toBe(true);
    expect([...labels].some((l) => /^[AD]\d \S.*: special$/.test(l))).toBe(true);
    expect(labels.has("Rule: SPD +4 for Driven")).toBe(true);
  });
  it("is not worked out when no frames are recorded", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES, recordEvents: false });
    b.init();
    expect(b.units.every((u) => u.auraSrc === undefined)).toBe(true);
  });
});

describe("Forced Out by a special", () => {
  it("records who each part Forced Out, for the replay's run-off", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    const caster = b.unit("A4");
    caster.special = {
      cooldown: 10,
      effects: [
        { effect: "buff", attributes: ["ATK"], amount: 1, duration: 5, targeting: { targets: ["self"] } },
        { effect: "hinderance", attributes: ["Forced Out"] as never, chance: 100, duration: 5, targeting: { targets: ["enemies"], count: 1, priority: "lowest", stat: "DEF" } },
      ],
    };
    bb.fireSpecial(caster, b.unit("D1"), false);
    const ev = bb.events.find((e: { kind: string }) => e.kind === "special");
    expect(ev.partOut[0]).toEqual([]);
    expect(ev.partOut[1]).toHaveLength(1);
    expect(b.unit(ev.partOut[1][0]).where).toBe("out");
  });
});

describe("named characters and VS units (user, 2026-11-13)", () => {
  it("'When X is on your crew' / 'on the enemy team': anywhere on that team, bench and KO'd included", () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    const u = b.unit("A1");
    const bench = b.side("def").find((x) => x.where === "bench")!;
    const name = bench.rec.ownFamilies?.[0] ?? bench.rec.families[0]!;
    expect(b.cond(u, { type: "character", team: "enemy", families: [name] })).toBe(true);
    const d1 = b.unit("D1");
    const n1 = d1.rec.ownFamilies?.[0] ?? d1.rec.families[0]!;
    d1.where = "dead"; d1.hp = 0;
    expect(b.cond(u, { type: "character", team: "enemy", families: [n1] })).toBe(true);
    expect(b.cond(u, { type: "character", families: [n1] })).toBe(b.side("atk").some((x) => x !== u && hasFamily(x.rec, [n1])));
  });
  it("a VS form is only its chosen half for conditions and targets, but both names count for team legality", async () => {
    const { clashReason } = await import("../engine/team");
    const zoroVsNusjuro = db.byId.get(4529.2)!, zoroVsLucci = db.byId.get(4469.2)!, zoroForm = db.byId.get(4529.1)!;
    expect(hasFamily(zoroVsNusjuro, ["Roronoa Zoro"])).toBe(false);
    expect(hasFamily(zoroVsNusjuro, ["St. Ethanbaron V. Nusjuro"])).toBe(true);
    expect(hasFamily(zoroForm, ["Roronoa Zoro"])).toBe(true);
    expect(zoroVsNusjuro.families).toContain("Roronoa Zoro");
    expect(clashReason(db, { unitId: 4529.2 } as never, { unitId: 4469.2 } as never)).toMatch(/Roronoa Zoro/);
    expect(zoroVsLucci.ownFamilies).toEqual(["Rob Lucci"]);
    // the chosen half's color and classes too
    expect([zoroForm.color, zoroVsNusjuro.color]).toEqual(["[DEX]", "[STR]"]);
    expect(matchesToken({ rec: zoroVsNusjuro } as never, "Free Spirit")).toBe(false);
    expect(matchesToken({ rec: zoroForm } as never, "Free Spirit")).toBe(true);
  });
  it("4114 / 4115: '6 or remaining crew members remaining' is 6 or more remaining", () => {
    for (const id of [4114, 4115]) {
      const k = db.byId.get(id)!.kit;
      const conds = [...k.abilities.flat(), ...k.specials.flatMap((s) => s.effects)].map((e) => e.condition as { comparator?: string; count?: number } | undefined).filter((c) => c?.count === 6);
      expect(conds.length).toBeGreaterThan(0);
      expect(conds.every((c) => c!.comparator === "more")).toBe(true);
    }
  });
});

describe("Evade (user, 2026-11-13)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setup = (): [Battle, any] => { const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES }); b.init(); return [b, b as any]; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evade = (bb: any, uid: string, attrs: string[], chance = 100) => bb.applyEffect(bb.unit(uid), { effect: "evade", attributes: attrs, chance, duration: 30, targeting: { targets: ["self"] } }, 0, 1, undefined, "special");
  it("Stats Down: no new stat debuff lands; one already on stays", () => {
    const [b, bb] = setup();
    const d1 = b.unit("D1"), d2 = b.unit("D2");
    b.addMod(d1, "DEF", -1);
    const before = [b.lv(d1, "ATK"), b.lv(d1, "DEF"), b.lv(d2, "ATK")];
    evade(bb, "D1", ["Stats Down"]);
    const debuff = { effect: "debuff", attributes: ["ATK", "Special CT"], level: 2, duration: 10, targeting: { targets: ["enemies"] } };
    bb.applyEffect(b.unit("A1"), debuff, 0, 1, undefined, "special", d1);
    bb.applyEffect(b.unit("A1"), debuff, 0, 1, undefined, "special", d2);
    expect([b.lv(d1, "ATK"), b.lv(d1, "DEF"), b.lv(d2, "ATK")]).toEqual([before[0], before[1], before[2]! - 2]);
    // Half Stats is its own kind: a Stats Down Evade doesn't stop it
    bb.applyEffect(b.unit("A1"), { effect: "hinderance", attributes: ["Half Stats"], chance: 100, duration: 10, targeting: { targets: ["enemies"] } }, 1, 1, undefined, "special", d1);
    expect(b.has(d1, "Half Stats")).toBe(true);
  });
  it("only specials are evaded: an ability's debuff, hinderance or damage lands; its Special CT delay is evaded", () => {
    const [b, bb] = setup();
    const d1 = b.unit("D1"), a1 = b.unit("A1");
    evade(bb, "D1", ["Stats Down", "Paralysis", "Damage Ignoring DEF", "Special CT Delay"]);
    const atk0 = d1.aura.ATK ?? 0;
    a1.abilities.push({ e: { effect: "debuff", attributes: ["ATK"], level: 1, targeting: { targets: ["enemies"] } }, idx: 99, fired: 0, on: false, holds: false, aura: true });
    bb.refreshAuras();
    expect(d1.aura.ATK ?? 0).toBe(atk0 - 1); // ongoing ability debuff
    const lv = b.lv(d1, "DEF");
    bb.applyEffect(a1, { effect: "debuff", attributes: ["DEF"], level: 1, duration: 10, targeting: { targets: ["enemies"] } }, 0, 1, undefined, "trigger", d1);
    expect(b.lv(d1, "DEF")).toBe(lv - 1); // triggered ability debuff
    bb.applyEffect(a1, { effect: "hinderance", attributes: ["Paralysis"], chance: 100, duration: 10, targeting: { targets: ["enemies"] } }, 1, 1, undefined, "ability", d1);
    expect(b.has(d1, "Paralysis")).toBe(true);
    const hp = d1.hp;
    bb.applyEffect(a1, { effect: "damage", type: "atk", amount: 1, defbypass: true, targeting: { targets: ["enemies"] } }, 2, 1, undefined, "trigger", d1);
    expect(d1.hp).toBeLessThan(hp);
    d1.charge = 5;
    bb.applyEffect(a1, { effect: "hinderance", attributes: ["Special CT"], amount: 50, targeting: { targets: ["enemies"] } }, 3, 1, undefined, "ability", d1);
    expect(d1.charge).toBe(5); // e.g. Imu's passive rewind: evaded
  });
  it("Half Stats covers Half ATK / DEF / SPD / RCV too; Stats Down covers a special's own stat penalty", () => {
    const [b, bb] = setup();
    const d1 = b.unit("D1");
    evade(bb, "D1", ["Half Stats"]);
    for (const [i, h] of ["Half ATK", "Half DEF", "Half SPD", "Half RCV", "Half Stats"].entries()) {
      bb.applyEffect(b.unit("A1"), { effect: "hinderance", attributes: [h], chance: 100, duration: 10, targeting: { targets: ["enemies"] } }, i, 1, undefined, "special", d1);
      expect(b.has(d1, h), h).toBe(false);
    }
    const a2 = b.unit("A2");
    evade(bb, "A2", ["Stats Down"]);
    const def = b.lv(a2, "DEF");
    bb.applyEffect(a2, { effect: "penalty", attributes: ["DEF"], level: 2, duration: 10, targeting: { targets: ["self"] } }, 0, 1, undefined, "special");
    expect(b.lv(a2, "DEF")).toBe(def);
  });
  it("an evaded special hit still counts as a hit: 0 damage, 'special received' counted", () => {
    const [b, bb] = setup();
    const caster = b.unit("A4"), d1 = b.unit("D1");
    evade(bb, "D1", ["Damage Ignoring DEF"]);
    caster.special = { cooldown: 10, effects: [{ effect: "damage", type: "atk", amount: 2, defbypass: true, targeting: { targets: ["enemies"], count: 1, priority: "lowest", stat: "DEF" } }] };
    for (const e of ["D2", "D3", "D4", "D5"]) b.addMod(b.unit(e), "DEF", 50);
    const hp = d1.hp, n = d1.cnt.specialReceived;
    bb.fireSpecial(caster, d1, false);
    expect(d1.hp).toBe(hp);
    expect(d1.cnt.specialReceived).toBe(n + 1);
  });
  it("a hinderance it names can't be applied; others can", () => {
    const [b, bb] = setup();
    const d1 = b.unit("D1");
    evade(bb, "D1", ["Action Bind", "Forced Out", "Confusion"]);
    const hit = (at: string, i: number) => bb.applyEffect(b.unit("A1"), { effect: "hinderance", attributes: [at], chance: 100, duration: 10, targeting: { targets: ["enemies"] } }, i, 1, undefined, "special", d1);
    hit("Confusion", 0); hit("Action Bind", 1); hit("Forced Out", 2);
    expect(["Confusion", "Action Bind"].map((s) => b.has(d1, s))).toEqual([false, false]);
    expect(d1.where).toBe("field");
    hit("Paralysis", 3);
    expect(b.has(d1, "Paralysis")).toBe(true);
    // Damage over Time from a damage effect
    evade(bb, "D2", ["Damage Over Time"]);
    bb.applyEffect(b.unit("A1"), { effect: "damage", type: "time", level: 1, duration: 10, targeting: { targets: ["enemies"] } }, 4, 1, undefined, "special", b.unit("D2"));
    expect(b.has(b.unit("D2"), "Damage Over Time")).toBe(false);
    // Special CT delay
    const d3 = b.unit("D3");
    evade(bb, "D3", ["Special CT Delay"]);
    d3.charge = 5;
    bb.applyEffect(b.unit("A1"), { effect: "hinderance", attributes: ["Special CT"], amount: 50, targeting: { targets: ["enemies"] } }, 5, 1, undefined, "special", d3);
    expect(d3.charge).toBe(5);
  });
  it("its chance is the chance each attempt is evaded", () => {
    const [b, bb] = setup();
    const d1 = b.unit("D1");
    evade(bb, "D1", ["Paralysis"], 60);
    let landed = 0;
    for (let use = 1; use <= 600; use++) {
      bb.applyEffect(b.unit("A1"), { effect: "hinderance", attributes: ["Paralysis"], chance: 100, duration: 10, targeting: { targets: ["enemies"] } }, 0, use, undefined, "special", d1);
      if (b.has(d1, "Paralysis")) landed++;
      d1.statuses = d1.statuses.filter((s) => s.name !== "Paralysis");
    }
    expect(landed / 600).toBeGreaterThan(0.33);
    expect(landed / 600).toBeLessThan(0.47);
  });
  it("Damage Ignoring DEF, Fixed Damage (random damage included) and Percentage Damage do 0", () => {
    const [b, bb] = setup();
    const a1 = b.unit("A1"), d1 = b.unit("D1");
    evade(bb, "D1", ["Damage Ignoring DEF", "Fixed Damage", "Percentage Damage"]);
    const hp = d1.hp;
    const hit = (e: object, i: number) => bb.applyEffect(a1, { effect: "damage", targeting: { targets: ["enemies"] }, ...e }, i, 1, undefined, "special", d1);
    expect(hit({ type: "atk", amount: 2, defbypass: true }, 0)).toEqual([d1]); // hit, for 0
    hit({ type: "fixed", amount: 500 }, 1);
    hit({ type: "random", amountrange: [100, 2100], repeat: 2 }, 2);
    hit({ type: "cut", amount: 30 }, 3);
    expect(d1.hp).toBe(hp);
    hit({ type: "atk", amount: 2 }, 4); // ordinary special damage still hits
    expect(d1.hp).toBeLessThan(hp);
    // without the Evade, random damage is fixed damage: it goes past a Shield
    const d2 = b.unit("D2"); d2.shield = 100000; const hp2 = d2.hp;
    bb.applyEffect(a1, { effect: "damage", type: "random", amountrange: [100, 100], targeting: { targets: ["enemies"] } }, 5, 1, undefined, "special", d2);
    expect(d2.hp).toBeLessThan(hp2);
  });
  it("snapshots list what each Evade covers; 'with Stats Down Evasion' finds it", () => {
    const [b, bb] = setup();
    evade(bb, "D1", ["Half Stats", "Stats Down"], 70);
    bb.snapshot();
    const st = bb.frames.at(-1).units.find((u: { uid: string }) => u.uid === "D1").statuses.find((s: { attr: string }) => s.attr === "Evade");
    expect(st).toMatchObject({ evades: ["Half Stats", "Stats Down"], chance: 0.7 });
    expect(b.has(b.unit("D1"), "Stats Down Evasion")).toBe(true);
    expect(b.has(b.unit("D1"), "Confusion Evasion")).toBe(false);
  });
});

describe("Switch: which sub character (user 2026-11-18)", () => {
  const setup = () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES }); b.init();
    const bb = b as any;
    const line = () => bb.benchLine("atk").map((u: { uid: string }) => u.uid);
    const sw = (uid: string, which: string) =>
      bb.boon(b.unit(uid), b.unit(uid), "Switch", { attributes: ["Switch"], effect: "boon", targeting: { targets: ["self"], switch: which } }, 0);
    return { b, bb, line, sw };
  };
  it("reads the place in the bench line from the text", () => {
    expect(["1st sub character", "2nd sub character", "3rd sub character", ""].map(subIndex)).toEqual([0, 1, 2, 0]);
  });
  it("1st sub character = the next to come in (A6 at the start), 2nd = the one after it (A7); the two swap places", () => {
    const { b, line, sw } = setup();
    expect(line()).toEqual(["A6", "A7", "A8"]);
    sw("A1", "1st sub character");
    expect(b.unit("A6").where).toBe("field");
    expect(b.unit("A6").tile).toBe(0); // takes A1's field place
    expect(b.unit("A1").where).toBe("bench");
    expect(line()).toEqual(["A1", "A7", "A8"]); // A1 takes A6's bench place
    sw("A2", "2nd sub character");
    expect(b.unit("A7").where).toBe("field");
    expect(line()).toEqual(["A1", "A2", "A8"]);
  });
  it("after a switch the next KO brings in the unit now in the first bench place", () => {
    const { b, bb, sw } = setup();
    sw("A1", "1st sub character");
    bb.ko(b.unit("A2"), b.unit("D1"));
    bb.t += TUNE.benchDelay;
    bb.benchArrivals();
    expect(b.unit("A1").where).toBe("field");
    expect(b.unit("A1").tile).toBe(1); // in A2's place
  });
  it("after a bench unit has come in, the 1st sub character is the new front of the line", () => {
    const { b, bb, line, sw } = setup();
    bb.benchLine("atk")[0].where = "dead"; // A6 gone (as if it came in and was KO'd)
    expect(line()).toEqual(["A7", "A8"]);
    sw("A1", "1st sub character");
    expect(b.unit("A7").where).toBe("field");
    expect(line()).toEqual(["A1", "A8"]);
  });
  it("nobody waiting in that place: no switch", () => {
    const { b, bb, line, sw } = setup();
    b.unit("A7").where = "dead"; b.unit("A8").where = "dead";
    sw("A1", "2nd sub character");
    expect(b.unit("A1").where).toBe("field");
    expect(line()).toEqual(["A6"]);
    expect(bb.events.some((e: { text: string }) => /no 2nd sub character waiting/.test(e.text))).toBe(true);
  });
  it("crew position (tie order, A/D number) stays the same after a switch", () => {
    const { b, sw } = setup();
    sw("A1", "1st sub character");
    expect(b.unit("A1").slot).toBe(0);
  });
});

describe("HP never over max HP (user 2026-11-18)", () => {
  const setup = (): [Battle, any, any] => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES });
    b.init();
    const bb = b as any, a1 = bb.unit("A1");
    a1.aura = {}; a1.mods = []; // a clean start: no HP levels
    a1.hp = b.maxHp(a1);
    return [b, bb, a1];
  };
  it("an HP up raises the max, not the HP; a heal can then fill it", () => {
    const [b, bb, a1] = setup();
    const full = a1.hp;
    bb.addMod(a1, "HP", 2, 5);
    bb.capHp();
    expect(b.maxHp(a1)).toBe(full + 500);
    expect(a1.hp).toBe(full);
    bb.heal(a1, a1, 10000, "test");
    expect(a1.hp).toBe(full + 500);
  });
  it("the HP up ending brings the HP down to the old max", () => {
    const [b, bb, a1] = setup();
    const full = a1.hp;
    bb.addMod(a1, "HP", 2, 5);
    bb.heal(a1, a1, 10000, "test");
    bb.t += 5;
    bb.capHp();
    expect(b.maxHp(a1)).toBe(full);
    expect(a1.hp).toBe(full);
  });
  it("an HP down lowers the max and the HP if it was over; HP already under it stays", () => {
    const [b, bb, a1] = setup();
    const full = a1.hp;
    bb.addMod(a1, "HP", -2);
    bb.capHp();
    expect(a1.hp).toBe(full - 500);
    a1.hp = 100;
    bb.addMod(a1, "HP", -1);
    bb.capHp();
    expect(a1.hp).toBe(100);
  });
  it("holds in every frame of whole battles", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulateBattle(db, run9Mine, run9Enemy, { seed, rules: RUN9_RULES, frameInterval: 0.25 });
      for (const f of r.frames) for (const u of f.units) expect(u.hp).toBeLessThanOrEqual(u.maxHp + 1e-9);
    }
  });
});

describe("Paralysis and Action Bind (user 2026-11-18)", () => {
  const setup = (status: string) => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES }); b.init();
    const bb = b as any, a1 = b.unit("A1");
    a1.charge = 0;
    a1.pattern = [{ action: "attack", type: "Normal" }];
    a1.statuses.push({ name: status, end: Infinity });
    return { b, bb, a1 };
  };
  it("Paralysis: picked for an attack, the unit stays in place for the Damage over Time stun, its queue place starts over", () => {
    const { bb, a1 } = setup("Paralysis");
    a1.pattern = [{ action: "attack", type: "Normal" }, { action: "heal", area: "Small", level: 1 }];
    a1.patIdx = 0;
    a1.gauge = 120;
    const pos = { ...a1.pos };
    expect(bb.startAction(a1)).toBe(true);
    expect(a1.act).toBeUndefined();
    expect([a1.gauge, a1.pos]).toEqual([0, pos]);
    expect(a1.freeAt).toBeCloseTo(TUNE.dotWait, 9);
    expect(bb.free(a1)).toBe(false);
    expect(bb.events.filter((e: { kind: string }) => e.kind === "damage" || e.kind === "hit")).toHaveLength(0);
    expect(a1.patIdx).toBe(1); // the pattern moves on: the heal comes next
  });
  it("Paralysis with Damage over Time: the tick lands on the paralyzed turn", () => {
    const { bb, a1 } = setup("Paralysis");
    a1.statuses.push({ name: "Damage Over Time", end: Infinity, level: 2 });
    const hp = a1.hp;
    bb.startAction(a1);
    expect(hp - a1.hp).toBe(Math.floor(bb.maxHp(a1) * 0.1));
  });
  it("Paralysis: a full special still goes, and a Confused unit still attacks a teammate", () => {
    const { bb, a1 } = setup("Paralysis");
    a1.charge = bb.chargeNeed(a1);
    expect(bb.startAction(a1)).toBe(true);
    expect(a1.act?.kind).toBe("special");
    const c = setup("Paralysis");
    c.a1.statuses.push({ name: "Confusion", end: Infinity });
    expect(c.bb.startAction(c.a1)).toBe(true);
    expect([c.a1.act?.kind, c.a1.act?.target.side]).toEqual(["confused", "atk"]);
  });
  it("Action Bind: can't act and its gauge holds (no growth, no reset)", () => {
    const { bb, a1 } = setup("Action Bind");
    a1.gauge = 80;
    expect(bb.free(a1)).toBe(false);
    bb.growGauges(1);
    expect(a1.gauge).toBe(80);
  });
  for (const st of ["Action Bind", "Special Bind"]) it(`${st} on a unit already bound: the durations add up (user 2026-11-25)`, () => {
    const { bb, a1 } = setup(st);
    a1.statuses.at(-1)!.end = 5;
    bb.t = 0;
    bb.addStatus(a1, st, 10, {}, a1); // a 10 s bind with 5 s left -> 15 s
    expect(a1.statuses.filter((s: { name: string }) => s.name === st).map((s: { end: number }) => s.end)).toEqual([15]);
    bb.t = 20;
    bb.addStatus(a1, st, 23, {}, a1); // the first one is over: a fresh 3 s
    expect(a1.statuses.filter((s: { name: string; end: number }) => s.name === st && s.end > 20).map((s: { end: number }) => s.end)).toEqual([23]);
  });
  it("Action Bind: off the NEXT queue while bound, and until the first beat after the bind ends", () => {
    const { bb, a1 } = setup("Action Bind");
    a1.statuses.at(-1)!.end = 1;
    a1.gauge = 0; // (not picked at the beats below)
    expect(bb.nextColumn()).not.toContain(a1);
    bb.beat(); // t = 0: bound
    expect(bb.nextColumn()).not.toContain(a1);
    expect(bb.projectedOrder().map((e: { u: unknown }) => e.u)).not.toContain(a1);
    bb.t = 1.2; // bind over, no beat yet
    expect(bb.has(a1, "Action Bind")).toBe(false);
    expect(bb.nextColumn()).not.toContain(a1);
    bb.t = 1.5;
    bb.beat(); // the first beat free of it
    expect(bb.nextColumn()).toContain(a1);
    expect(bb.projectedOrder().map((e: { u: unknown }) => e.u)).toContain(a1);
  });
});

describe("Damage over Time (user 2026-11-13)", () => {
  const setup = (dot = 0): [Battle, any] => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES }); b.init();
    const bb = b as any, a1 = b.unit("A1");
    a1.charge = 0;
    a1.pattern = [{ action: "attack", type: "Normal" }];
    a1.revives = 0; a1.onDeath = 0;
    if (dot) a1.statuses.push({ name: "Damage Over Time", end: Infinity, level: dot });
    return [b, bb];
  };
  /** Drive the actions tick by tick from t = 0; returns when A1's hit landed. */
  const drive = (bb: any, until: number) => {
    const a1 = bb.unit("A1"), act = a1.act;
    let hitT: number | undefined;
    for (let s = 0; s * TICK <= until; s++) { bb.t = s * TICK; bb.advanceActions(); if (act.hit && hitT === undefined) hitT = bb.t; }
    return hitT;
  };
  const dotEvents = (bb: any) => bb.events.filter((e: { kind: string; text: string }) => e.kind === "effect" && /Damage over Time/.test(e.text));
  it("walks up as usual, takes the tick on arriving, is stunned 49 frames there, then attacks (user 2026-11-18)", () => {
    const [, b0] = setup(), [, b1] = setup(1);
    expect(b0.startAction(b0.unit("A1"))).toBe(true);
    expect(b1.startAction(b1.unit("A1"))).toBe(true);
    const a0 = b0.unit("A1").act, a1 = b1.unit("A1").act;
    expect(TUNE.dotWait).toBeCloseTo(0.8175, 4);
    expect(a1.arrive).toBeCloseTo(a0.arrive, 9); // no stun before moving
    expect(a1.hitAt - a0.hitAt).toBeCloseTo(TUNE.dotWait, 9);
    expect([a1.dotAt, a1.dotEnd]).toEqual([a1.arrive, a1.arrive + TUNE.dotWait]);
    expect(a1.target.uid).toBe(a0.target.uid);
    expect(a1.target.attackedBy).toBe(1); // locked from the pick
    const h0 = drive(b0, 6)!, h1 = drive(b1, 6)!;
    expect(h1 - h0).toBeGreaterThan(TUNE.dotWait - TICK - 1e-9);
    expect(h1 - h0).toBeLessThan(TUNE.dotWait + TICK + 1e-9);
    const ev = dotEvents(b1);
    expect(ev).toHaveLength(1); // once, not again at the hit
    expect(ev[0].t).toBeGreaterThanOrEqual(a1.arrive - 1e-9);
    expect(ev[0].t).toBeLessThan(a1.arrive + TICK);
    expect(ev[0].amount).toBe(Math.floor(b1.maxHp(b1.unit("A1")) * 0.05));
    expect(dotEvents(b0)).toHaveLength(0);
  });
  it("a tick that KOs the unit cancels the action and frees its target", () => {
    const [b, bb] = setup(1);
    const a1 = b.unit("A1");
    a1.hp = 1;
    bb.startAction(a1);
    const tgt = a1.act!.target;
    drive(bb, 4);
    expect(a1.where).toBe("dead");
    expect(tgt.attackedBy).toBe(0);
    expect(bb.events.some((e: { kind: string; actor?: string }) => (e.kind === "hit" || e.kind === "miss") && e.actor === "A1")).toBe(false);
  });
  it("the summed level is capped at 10 (user 2026-11-24; was 20)", () => {
    const [b, bb] = setup(15);
    const a1 = b.unit("A1");
    a1.statuses.push({ name: "Damage Over Time", end: Infinity, level: 10 });
    expect(bb.dotLevel(a1)).toBe(10);
    bb.tickDot(a1);
    expect(dotEvents(bb).at(-1).amount).toBe(Math.floor(bb.maxHp(a1) * 0.05 * 10));
  });
  it("no wait and no tick before a special", () => {
    const [b, bb] = setup(2);
    const a1 = b.unit("A1");
    a1.charge = bb.chargeNeed(a1);
    bb.startAction(a1);
    expect(a1.act!.kind).toBe("special");
    expect(a1.act!.dotAt).toBeUndefined();
    for (let s = 0; s * TICK <= 3; s++) { bb.t = s * TICK; bb.advanceActions(); }
    expect(dotEvents(bb)).toHaveLength(0);
  });
});

describe("Full attacks (user 2026-11-17)", () => {
  const start = (type: "Normal" | "Full", dot = 0) => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES }); b.init();
    const bb = b as any, a1 = b.unit("A1");
    a1.charge = 0;
    a1.pattern = [{ action: "attack", type }];
    if (dot) a1.statuses.push({ name: "Damage Over Time", end: Infinity, level: dot });
    expect(bb.startAction(a1)).toBe(true);
    return { b, bb, a1, act: a1.act! };
  };
  it("waits TUNE.fullExtra before setting off; wind-up and stay are a Normal attack's", () => {
    const n = start("Normal"), f = start("Full");
    expect(TUNE.fullExtra).toBe(0.75);
    expect(f.act.arrive - n.act.arrive).toBeCloseTo(TUNE.fullExtra, 9);
    expect(f.act.hitAt - f.act.arrive).toBeCloseTo(n.act.hitAt - n.act.arrive, 9);
    expect(f.act.leaveAt - f.act.arrive).toBeCloseTo(n.act.leaveAt - n.act.arrive, 9);
    // busy and its target locked while it waits; it stands still
    expect(f.act.target.attackedBy).toBe(1);
    expect(f.a1.phase).toBe("toAttack");
    const pos = { ...f.a1.pos };
    f.bb.t = TUNE.fullExtra - 0.05; f.bb.advanceActions();
    expect(f.a1.pos).toEqual(pos);
    f.bb.t = TUNE.fullExtra + 0.1; f.bb.advanceActions();
    expect(f.a1.pos).not.toEqual(pos);
  });
  it("comes before setting off; a Damage over Time stun comes after arriving", () => {
    const n = start("Normal", 1), f = start("Full", 1);
    expect(f.act.arrive - n.act.arrive).toBeCloseTo(TUNE.fullExtra, 9);
    expect(f.act.dotAt).toBeCloseTo(f.act.arrive, 9);
    expect(f.act.dotEnd).toBeCloseTo(f.act.arrive + TUNE.dotWait, 9);
  });
  it("damage stays x1.5 ATK (Normal x0.6)", () => {
    const f = start("Full");
    const atk = f.bb.atk(f.a1), tgt = f.act.target;
    expect(f.bb.regularDamage(f.a1, tgt, "Full", false, false).raw).toBe(Math.floor(atk * 1.5));
    expect(f.bb.regularDamage(f.a1, tgt, "Normal", false, false).raw).toBe(Math.floor(atk * 0.6));
  });
});

describe("Rumble key damage taken / dealt (game data, 2026-11-17)", () => {
  const setup = () => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: [] }); b.init();
    const bb = b as any, src = b.unit("A1"), tgt = b.unit("D1");
    src.resil = []; tgt.resil = []; src.keyB = undefined; tgt.keyB = undefined;
    const as = (u: any, color: string, classes: string[]) => { u.rec = { ...u.rec, color, classes }; };
    return { bb, src, tgt, as };
  };
  const key = (taken: number, dealt: number, vs?: string[]) => ({ hp: 0, atk: 0, rcv: 0, def: 0, spd: 0, ct: 0, taken, dealt, ...(vs ? { vs } : {}) });
  it("applies only against the color / class pair the game names", () => {
    const { bb, src, tgt, as } = setup();
    src.keyB = key(0.2, 0.2, ["[DEX]"]);
    as(tgt, "[DEX]", ["Fighter"]);
    expect(bb.factors(src, tgt, 10000)).toBe(12000);
    as(tgt, "[STR]", ["Fighter"]);
    expect(bb.factors(src, tgt, 10000)).toBe(10000);
    // a class pair: either class counts
    tgt.keyB = key(0.05, 0, ["Cerebral", "Powerhouse"]); src.keyB = undefined;
    as(src, "[QCK]", ["Slasher", "Powerhouse"]);
    expect(bb.factors(src, tgt, 10000)).toBe(9500);
    as(src, "[QCK]", ["Slasher", "Driven"]);
    expect(bb.factors(src, tgt, 10000)).toBe(10000);
  });
  it("not against what the unit's resilience names (that is only the fallback for units without game data)", () => {
    const { bb, src, tgt, as } = setup();
    as(tgt, "[PSY]", ["Fighter"]);
    src.resil = [{ type: "damage", attribute: "[PSY]", percentage: 0 }];
    src.keyB = key(0.15, 0.1, ["[DEX]"]);
    expect(bb.factors(src, tgt, 10000)).toBe(10000);
    src.keyB = key(0.15, 0.1); // no vs: the old rule
    expect(bb.factors(src, tgt, 10000)).toBe(11000);
  });
});

describe("Confusion (user 2026-11-13)", () => {
  const setup = (): [Battle, any, any] => {
    const b = new Battle(db, run9Mine, run9Enemy, { seed: 1, rules: RUN9_RULES }); b.init();
    const bb = b as any, a1 = b.unit("A1") as any;
    a1.charge = 0;
    a1.pattern = [{ action: "attack", type: "Normal" }];
    a1.statuses.push({ name: "Confusion", end: Infinity });
    a1.statuses.push({ name: "Damage Over Time", end: Infinity, level: 1 });
    return [b, bb, a1];
  };
  const run = (bb: any, until: number) => { for (let s = 0; s * TICK <= until; s++) { bb.t = s * TICK; bb.advanceActions(); } };
  const hits = (bb: any) => bb.events.filter((e: { kind: string; actor?: string }) => (e.kind === "hit" || e.kind === "miss") && e.actor === "A1");
  const checkKnockBack = (bb: any, a1: any) => {
    const x0 = a1.pos.x, hp0 = a1.hp;
    expect(bb.startAction(a1)).toBe(true);
    expect(a1.act).toBeUndefined(); // no attack
    expect(a1.charge).toBe(0);
    expect(a1.knockUntil).toBeCloseTo(TUNE.knockStun, 9);
    run(bb, 3);
    expect(hits(bb)).toHaveLength(0);
    expect(a1.hp).toBe(hp0); // no Damage over Time wait or tick
    expect(x0 - a1.pos.x).toBeGreaterThan(50); // one tile left (attacker's own side)
    expect(x0 - a1.pos.x).toBeLessThan(250);
    expect(bb.events.some((e: { kind: string; text: string }) => e.kind === "effect" && /A1 is Confused: knocked back, special charge lost/.test(e.text))).toBe(true);
  };
  it("full bar: no attack, one tile back toward its own side, charge emptied", () => {
    const [, bb, a1] = setup();
    a1.charge = bb.chargeNeed(a1);
    checkKnockBack(bb, a1);
  });
  it("no teammate on the field: the same", () => {
    const [, bb, a1] = setup();
    a1.charge = 1;
    for (const m of bb.sides.atk) if (m !== a1) m.where = "bench";
    checkKnockBack(bb, a1);
  });
  it("otherwise attacks the closest teammate from the enemy side with its normal timings", () => {
    const [, bb, a1] = setup();
    a1.statuses.pop(); // no Damage over Time here
    a1.charge = 1;
    const mates = bb.sides.atk.filter((m: any) => m !== a1 && m.where === "field");
    const d = (m: any) => Math.hypot(m.pos.x - a1.pos.x, m.pos.y - a1.pos.y);
    const closest = mates.sort((p: any, q: any) => d(p) - d(q))[0];
    expect(bb.startAction(a1)).toBe(true);
    const act = a1.act;
    expect(act.kind).toBe("confused");
    expect(act.target).toBe(closest);
    expect(act.cellSide).toBe("def");
    expect(act.tile.x).toBeGreaterThan(closest.pos.x); // stands where a defender would, to the right of the mate
    expect(act.hitAt - act.arrive).toBeCloseTo(a1.timing.windup, 9);
    expect(act.leaveAt - act.arrive).toBeCloseTo(a1.timing.stay, 9);
    expect(a1.charge).toBe(1);
    expect(closest.attackedBy).toBe(1); // busy: enemies can't target it now
    expect(bb.chooseTarget(bb.unit("D1"))).not.toBe(closest);
    run(bb, 6);
    expect(hits(bb).length).toBe(1);
  });
  it("steps back its own way afterwards (left for an attacker), not the enemy's (user 2026-11-18)", () => {
    const [, bb, a1] = setup();
    a1.statuses.pop();
    a1.charge = 1;
    expect(bb.startAction(a1)).toBe(true);
    const act = a1.act;
    expect(act.kind).toBe("confused");
    for (let i = 0; i < 400 && a1.phase !== "back"; i++) { bb.t += TICK; bb.advanceActions(); }
    expect(a1.phase).toBe("back");
    expect(a1.home.x).toBeLessThan(act.tile.x);
  });
  it("a teammate already under attack is busy: the closest free one is attacked", () => {
    const [, bb, a1] = setup();
    a1.statuses.pop();
    a1.charge = 1;
    const mates = bb.sides.atk.filter((m: any) => m !== a1 && m.where === "field");
    const d = (m: any) => Math.hypot(m.pos.x - a1.pos.x, m.pos.y - a1.pos.y);
    mates.sort((p: any, q: any) => d(p) - d(q));
    mates[0].attackedBy = 1;
    expect(bb.startAction(a1)).toBe(true);
    expect(a1.act.target).toBe(mates[1]);
  });
  it("every teammate busy: knocked back, charge emptied", () => {
    const [, bb, a1] = setup();
    a1.charge = 1;
    for (const m of bb.sides.atk) if (m !== a1) m.attackedBy = 1;
    checkKnockBack(bb, a1);
  });
  it("tile behind taken: stays still, still loses the charge and the turn", () => {
    const [, bb, a1] = setup();
    a1.charge = bb.chargeNeed(a1);
    const x0 = a1.pos.x, y0 = a1.pos.y;
    bb.tileTaken = () => true; // every tile taken
    expect(bb.startAction(a1)).toBe(true);
    run(bb, 1);
    expect(a1.act).toBeUndefined();
    expect(a1.charge).toBe(0);
    expect(a1.pos).toEqual({ x: x0, y: y0 });
    expect(bb.events.some((e: { kind: string; text: string }) => /A1 is Confused: no free tile behind/.test(e.text))).toBe(true);
  });
  it("Special Bind with a full bar: attacks a teammate and keeps the bar", () => {
    const [, bb, a1] = setup();
    a1.statuses.pop();
    a1.statuses.push({ name: "Special Bind", end: Infinity });
    const full = bb.chargeNeed(a1);
    a1.charge = full;
    expect(bb.startAction(a1)).toBe(true);
    expect(a1.act.kind).toBe("confused");
    expect(a1.charge).toBe(full);
  });
  it("Special Bind with a full bar and no free teammate: knocked back, charge emptied", () => {
    const [, bb, a1] = setup();
    a1.statuses.push({ name: "Special Bind", end: Infinity });
    a1.charge = bb.chargeNeed(a1);
    for (const m of bb.sides.atk) if (m !== a1) m.where = "bench";
    checkKnockBack(bb, a1);
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("On Death: death specials (user 2026-11-14)", () => {
  // (account cotton candy max 200, the default when these battles were picked)
  const team = (ids: number[]): TeamConfig => ({ maxCc: { hp: 200, atk: 200, rcv: 200 }, members: ids.map((unitId) => ({ unitId, illegal: true, rumbleKey: true, llbLevel: 5 })) });
  const atk = team([4387, 4562, 4483, 4583, 4209]), def = team([4557, 4212, 4276, 3848, 4170]);
  /** A2 (Blackbeard 4562, a death special) about to be KO'd: it waits at 1 HP. */
  const setup = (): [Battle, any, any] => {
    const b = new Battle(db, atk, def, { seed: 15, rules: DEFAULT_RULES }); b.init();
    const bb = b as any, a2 = b.unit("A2") as any;
    expect(a2.onDeath).toBeGreaterThan(0);
    a2.revives = 0;
    bb.damage(b.unit("D1"), a2, a2.hp + a2.shield + 1, { regular: false, raw: 0, ignoresDef: true });
    return [b, bb, a2];
  };
  const specials = (bb: any, uid: string) => bb.events.filter((e: any) => e.kind === "special" && e.actor === uid);
  /** Leave the enemy one unit (D2) at 1 HP; the others KO'd. */
  const lastEnemy = (bb: any, onDeath: number) => {
    for (const d of bb.sides.def) if (d.uid !== "D2") bb.ko(d);
    const d2 = bb.unit("D2");
    Object.assign(d2, { hp: 1, shield: 0, onDeath, revives: 0, statuses: [] });
    bb.koSinceCheck = false;
    return d2;
  };
  it("a unit that would be KO'd waits at exactly 1 HP; hits leave it at 1 HP; heals don't raise it", () => {
    const [b, bb, a2] = setup();
    expect(a2).toMatchObject({ hp: 1, lastStand: true, where: "field" });
    bb.damage(b.unit("D1"), a2, 50000, { regular: true, raw: 50000, ignoresDef: true });
    bb.damage(undefined, a2, 50000, { regular: false, raw: 50000, ignoresDef: true });
    expect(a2.hp).toBe(1);
    expect(a2.where).toBe("field");
    bb.heal(a2, a2, 5000, "test");
    expect(a2.hp).toBe(1);
  });
  it("it can't be attacked (enemy targeting, Confusion), is at the top of NEXT, stays on the field and alive in every count", () => {
    const [b, bb, a2] = setup();
    for (const d of bb.sides.def) { d.lastAttacker = a2; d.lastTarget = a2; expect(bb.chooseTarget(d)).not.toBe(a2); }
    for (const m of bb.sides.atk) if (m !== a2) expect(bb.closestMate(m)).not.toBe(a2);
    expect(bb.nextColumn()[0]).toBe(a2); // [user 2026-11-17]
    expect(bb.nextColumn().filter((x: any) => x === a2)).toHaveLength(1);
    expect(bb.free(a2)).toBe(false);
    bb.forceOut(a2, 5);
    expect(a2.where).toBe("field");
    for (const m of bb.sides.atk) if (m !== a2) bb.ko(m);
    bb.rumbleOuts();
    expect(bb.wiped()).toBeUndefined(); // one unit left: the waiting one
    bb.snapshot();
    const s = bb.frames.at(-1).units.find((x: any) => x.uid === "A2");
    expect(s).toMatchObject({ hp: 1, activity: "Waiting to use its death special" });
    expect(s.state).not.toBe("dead");
    void b;
  });
  /** Plays the actions forward (no beats) until `done` or `max` seconds. */
  const play = (bb: any, done: () => boolean, max = 10) => {
    const end = bb.t + max;
    while (!done() && bb.t < end) { bb.t += TICK; bb.advanceActions(); }
  };
  const deathActions = (bb: any) => bb.events.filter((e: any) => e.kind === "action" && /death special/.test(e.text));
  it("its turn is the next beat ahead of everyone: it walks up to its target like any special, fires on arrival, then dies (2026-11-17)", () => {
    const [, bb, a2] = setup();
    for (const d of bb.sides.def) d.gauge = 1e6;
    const t0 = bb.t, from = { ...a2.pos };
    bb.beat();
    expect(bb.events.filter((e: any) => e.kind === "action").map((e: any) => e.actor)).toEqual(["A2"]); // the beat was its own
    expect(specials(bb, "A2")).toHaveLength(0); // not yet: it walks first
    const act = a2.act;
    expect(act).toMatchObject({ kind: "special", death: true });
    expect(act.target.side).toBe("def");
    expect(act.target.attackedBy).toBe(1); // locked as "being attacked", like any special's target
    const walk = Math.hypot(act.tile.x - from.x, act.tile.y - from.y) / TUNE.walkOut;
    expect(walk).toBeGreaterThan(0.1);
    expect(act.arrive).toBeCloseTo(t0 + walk, 6);
    bb.snapshot();
    expect(bb.frames.at(-1).units.find((x: any) => x.uid === "A2").activity).toBe(`Death special ${act.target.uid}`);
    play(bb, () => bb.t > t0 + walk / 2);
    expect(a2).toMatchObject({ hp: 1, lastStand: true, where: "field" }); // still 1 HP, still waiting while it walks
    expect(Math.hypot(a2.pos.x - from.x, a2.pos.y - from.y)).toBeGreaterThan(10); // on its way
    expect(bb.chooseTarget(act.target)).not.toBe(a2); // and still not attackable
    play(bb, () => specials(bb, "A2").length > 0);
    expect(specials(bb, "A2")[0].t).toBeGreaterThanOrEqual(t0 + walk - 1e-9);
    expect(specials(bb, "A2")[0].t).toBeLessThan(t0 + walk + TICK + 1e-9);
    expect(act.target.attackedBy).toBe(0);
    expect(a2.where).toBe("dead");
    expect(a2.lastStand).toBe(false);
  });
  it("no enemy available: it keeps waiting (first in the queue), EVERYONE waits with it, and it goes as soon as one is", () => {
    const [, bb, a2] = setup();
    for (const d of bb.sides.def) d.attackedBy = 1; // every enemy busy: none can be targeted
    for (const u of bb.units) u.gauge = 1e6; // the enemies could attack A2's teammates: they don't [user 2026-11-17]
    for (let i = 0; i < 3; i++) bb.beat();
    expect(bb.events.filter((e: any) => e.kind === "action")).toEqual([]);
    expect(a2.act).toBeUndefined();
    expect(deathActions(bb)).toHaveLength(0);
    expect(a2).toMatchObject({ hp: 1, lastStand: true, where: "field" });
    bb.snapshot();
    expect(bb.frames.at(-1).units.find((x: any) => x.uid === "A2").activity).toBe("Waiting to use its death special");
    const d3 = bb.unit("D3");
    d3.attackedBy = 0;
    for (const d of bb.sides.def) d.gauge = 1e6;
    bb.beat();
    expect(deathActions(bb).map((e: any) => [e.actor, e.target])).toEqual([["A2", "D3"]]);
    expect(a2.act.target).toBe(d3);
  });
  it("the first waiting unit has no target: the next waiting unit doesn't go either; NEXT shows them first, in tie order", () => {
    const [b, bb, a2] = setup();
    const d1 = b.unit("D1") as any;
    d1.revives = 0;
    bb.damage(b.unit("A1"), d1, d1.hp + d1.shield + 1, { regular: false, raw: 0, ignoresDef: true });
    expect(d1.lastStand).toBe(true);
    bb.beats = 5;
    for (const u of bb.units) { bb.tieSpd.set(u, 100); u.gauge = 1e6; }
    bb.tieSpd.set(a2, 200); // A2 first in the tie order
    expect(bb.nextColumn().slice(0, 2)).toEqual([a2, d1]);
    for (const d of bb.sides.def) if (d !== d1) d.attackedBy = 1; // A2 has nobody to aim at; D1 would have
    bb.stillGoing = () => true; // (their attackers are on their way: not the last resort)
    bb.beat();
    bb.beat();
    expect(bb.events.filter((e: any) => e.kind === "action")).toEqual([]); // D1 and the regular queue wait too
    expect(bb.nextColumn().slice(0, 2)).toEqual([a2, d1]);
    bb.snapshot();
    expect(bb.frames.at(-1).queue.slice(0, 2)).toEqual(["A2", "D1"]); // the replay's NEXT column
    bb.unit("D3").attackedBy = 0;
    bb.beat();
    expect(deathActions(bb).map((e: any) => e.actor)).toEqual(["A2"]);
    expect(bb.nextColumn()[0]).toBe(d1); // A2 has set off: off the list
    expect(bb.nextColumn()).not.toContain(a2);
    bb.beat();
    expect(deathActions(bb).map((e: any) => e.actor)).toEqual(["A2", "D1"]);
  });
  for (const how of ["Forced Out", "switched out"]) it(`its target ${how} while it walks up: it keeps going and goes off at that spot anyway`, () => {
    const [b, bb, a2] = setup();
    const d5 = b.unit("D5") as any;
    if (how === "switched out") { d5.where = "bench"; d5.tile = -1; } // someone on the bench to switch with
    bb.beat();
    const act = a2.act, target = act.target, tile = { ...act.tile };
    expect(act.death).toBe(true);
    play(bb, () => bb.t > act.arrive - 0.05);
    expect(specials(bb, "A2")).toHaveLength(0);
    const spot = { ...target.pos };
    if (how === "Forced Out") bb.forceOut(target, 5); else bb.switchOut(target, 0);
    expect(target.where).toBe(how === "Forced Out" ? "out" : "bench");
    expect(a2.act).toBe(act); // didn't turn back
    expect(a2.phase).toBe("toAttack");
    expect(a2.to).toEqual(tile);
    expect(target.attackedBy).toBe(0); // released
    play(bb, () => specials(bb, "A2").length > 0);
    expect(specials(bb, "A2")).toHaveLength(1);
    expect(a2.pos).toEqual(tile); // went off where it was walking to
    expect(target.pos).toEqual(spot); // aimed where the target stood
    expect(target.attackedBy).toBe(0);
    expect(a2.where).toBe("dead");
  });
  it("last resort: nothing on the field can change any more and no enemy can be targeted: it aims anyway and goes off where it stands", () => {
    const [, bb, a2] = setup();
    bb.attackSpot = () => undefined; // no free tile in front of any enemy
    for (const u of bb.units) if (u.where === "field") { u.phase = "idle"; u.freeAt = 0; u.knockUntil = 0; u.t1 = 0; }
    const d1 = bb.unit("D1");
    d1.phase = "back"; // something still going: it waits
    bb.beat();
    expect(a2.act).toBeUndefined();
    d1.phase = "idle";
    const from = { ...a2.pos }, first = bb.chooseTarget(a2, true);
    expect(first).toBeDefined();
    bb.beat();
    expect(a2.act).toMatchObject({ death: true });
    expect(a2.act.target).toBe(first);
    expect(a2.act.target.lastStand).toBe(false); // an enemy outside its wait
    expect(a2.act.tile).toEqual(from);
    play(bb, () => specials(bb, "A2").length > 0);
    expect(specials(bb, "A2")).toHaveLength(1);
  });
  it("several waiting: they tie at the top and go in the queue's tie order (SPD, then your team, then slot), not side first", () => {
    for (const aFirst of [false, true]) {
      const [b, bb, a2] = setup();
      const d1 = b.unit("D1") as any;
      d1.revives = 0;
      bb.damage(b.unit("A1"), d1, d1.hp + d1.shield + 1, { regular: false, raw: 0, ignoresDef: true });
      expect(d1.lastStand).toBe(true);
      bb.beats = 5; // not the battle's first pick (that one goes by raw SPD)
      for (const u of bb.units) bb.tieSpd.set(u, 100);
      bb.tieSpd.set(aFirst ? a2 : d1, 200);
      bb.beat();
      expect(deathActions(bb).map((e: any) => e.actor)).toEqual([aFirst ? "A2" : "D1"]);
      bb.beat();
      expect(deathActions(bb).map((e: any) => e.actor)).toEqual(aFirst ? ["A2", "D1"] : ["D1", "A2"]);
    }
    // equal SPD: your team first
    const [, bb] = setup();
    const d1 = bb.unit("D1");
    d1.revives = 0;
    bb.damage(bb.unit("A1"), d1, d1.hp + d1.shield + 1, { regular: false, raw: 0, ignoresDef: true });
    bb.beats = 5;
    for (const u of bb.units) bb.tieSpd.set(u, 100);
    bb.beat();
    expect(deathActions(bb).map((e: any) => e.actor)).toEqual(["A2"]);
  });
  for (const st of ["Confusion", "Action Bind", "Special Bind"]) it(`${st} at that beat: the attempt fails and it dies without the special`, () => {
    const [, bb, a2] = setup();
    a2.statuses.push({ name: st, end: Infinity });
    bb.beat();
    expect(specials(bb, "A2")).toHaveLength(0);
    expect(a2.where).toBe("dead");
  });
  it("an 'HP below 1%' condition holds at the waiting unit's 1 HP, and for any unit that low", () => {
    const [b, bb, a2] = setup();
    const c = { type: "stat", stat: "HP", comparator: "Below", count: 1 };
    expect(bb.maxHp(a2)).toBeGreaterThan(100);
    expect(b.cond(a2, c)).toBe(true);
    const a1 = b.unit("A1") as any;
    expect(b.cond(a1, c)).toBe(false);
    a1.hp = 1;
    expect(b.cond(a1, c)).toBe(true);
    // Luffy 4557 (D1): ATK +10 "when HP is below 1%" (ability) is on when its death special goes
    const d1 = b.unit("D1") as any;
    expect(d1.abilities.some((a: any) => a.e.condition?.type === "stat" && lc(a.e.condition.comparator) === "below" && a.e.condition.count === 1)).toBe(true);
    const hpAb = d1.abilities.find((a: any) => a.e.condition?.type === "stat");
    expect(hpAb.holds).toBe(false);
    d1.revives = 0;
    bb.damage(a1, d1, d1.hp + d1.shield + 1, { regular: false, raw: 0, ignoresDef: true });
    expect(d1).toMatchObject({ hp: 1, lastStand: true });
    a2.statuses.push({ name: "Action Bind", end: Infinity }); // A2 goes first and fails: next beat is D1's
    bb.beat();
    let heldAtFire = false;
    const fire = bb.fireSpecial.bind(bb);
    bb.fireSpecial = (u: any, ...rest: any[]) => { if (u === d1) heldAtFire = hpAb.holds; return fire(u, ...rest); };
    bb.beat();
    play(bb, () => specials(bb, "D1").length > 0); // (2026-11-17: it walks up first)
    expect(specials(bb, "D1")).toHaveLength(1);
    expect(heldAtFire).toBe(true);
    expect(d1.where).toBe("dead");
  });
  it("the enemy reaching 0 units while it waits: its team wins at once, it never fires and is alive", () => {
    const [b, bb, a2] = setup();
    for (const d of bb.sides.def) bb.ko(d);
    const r = b.run();
    expect(r).toMatchObject({ winner: "atk", reason: "wipe" });
    expect(specials(bb, "A2")).toHaveLength(0);
    expect(r.units.find((u) => u.uid === "A2")).toMatchObject({ alive: true, hp: 1 });
  });
  it("its special KOs the last enemy: its team wins with it still alive", () => {
    const [, bb, a2] = setup();
    const d2 = lastEnemy(bb, 0);
    bb.beat();
    play(bb, () => specials(bb, "A2").length > 0);
    expect(specials(bb, "A2")).toHaveLength(1);
    expect(d2.where).toBe("dead");
    expect(a2).toMatchObject({ where: "field", hp: 1, lastStand: false });
    expect(bb.wiped()).toBe("def");
  });
  it("the last enemy waits on its own death special: it counts, so the launcher dies and, as its team's last, loses", () => {
    const [, bb, a2] = setup();
    for (const m of bb.sides.atk) if (m !== a2) bb.ko(m);
    const d2 = lastEnemy(bb, 1);
    bb.zeroHp(d2); // D2 waits too
    bb.beats = 5;
    for (const u of bb.units) bb.tieSpd.set(u, 100); // equal SPD: A2 goes first (your team first)
    // nobody but waiting units on either side: each aims at a waiting enemy (it stays at 1 HP), so they can't wait
    // on each other for ever
    bb.beat();
    expect(a2.act?.target).toBe(d2);
    play(bb, () => specials(bb, "A2").length > 0);
    expect(specials(bb, "A2")).toHaveLength(1);
    expect(d2).toMatchObject({ where: "field", hp: 1, lastStand: true });
    expect(a2.where).toBe("dead");
    expect(bb.wiped()).toBe("atk");
  });
  it("Revive after the death special: it fires, then revives instead of dying and walks back", () => {
    const [b, bb, a2] = setup();
    a2.revives = 1;
    bb.beat();
    play(bb, () => specials(bb, "A2").length > 0);
    expect(specials(bb, "A2")).toHaveLength(1);
    expect(a2.where).toBe("field");
    expect(a2.hp).toBeGreaterThan(1);
    expect(a2.lastStand).toBe(false);
    expect(a2.phase).toBe("back");
    void b;
  });
  it("seed 58: three enemies waiting at once go one per beat, each walking to its target; no deadlock", () => {
    // (the user's battle, seed 15, was played with the timings and key tiers from before 2026-11-17; with today's rules
    // seed 15 is another battle, and seed 58 has the same shape: D2, D1, D3 go on three beats in a row, Blackbeard is
    // behind them in the tie order and the opponent is gone first; seed 44 until the 2026-11-18 status rules)
    const r = simulateBattle(db, structuredClone(atk), structuredClone(def), { seed: 58, rules: DEFAULT_RULES });
    const deaths = r.events.filter((e) => e.kind === "action" && /death special/.test(e.text)).map((e) => [e.actor, Number(e.t.toFixed(2))]);
    expect(deaths).toEqual([["D2", 58], ["D1", 59.53], ["D3", 61.07]]);
    for (const d of ["D1", "D2", "D3"]) {
      const go = r.events.find((e) => e.kind === "action" && e.actor === d)!, fired = r.events.find((e) => e.kind === "special" && e.actor === d && e.t >= go.t)!;
      expect(fired.t).toBeGreaterThan(go.t); // walked up first
    }
    expect(r).toMatchObject({ winner: "atk", reason: "wipe" });
    expect(r.units.find((u) => u.uid === "A2")).toMatchObject({ alive: true, hp: 1 });
    for (const u of r.units) expect(u.alive).toBe(u.hp > 0);
  });
  // Test run 8 (QCK Giants: Dorry 4664 / Broggy 4665 have death specials). Before 104f5ea a unit KO'd while walking
  // to attack lost its action but kept phase "toAttack": never free, never targetable, it outlived the 100 s and its
  // team "won" on time (all 18 giant wins in 60 seeds; attackers 70 %). Now it walks home and plays on (~96-99 %).
  const run8 = readFileSync(new URL("./fixtures/run8-teams.txt", import.meta.url), "utf8").split(/\s+/).filter((x) => x.startsWith("RS1."))
    .map((c) => decodeTeam(c, db).team) as [TeamConfig, TeamConfig];
  const frozen = (bb: any) => bb.units.filter((u: any) => u.where === "field" && u.hp > 0 && !u.act && u.phase === "toAttack");
  // (seed 3 until the 2026-11-17 timing changes; seed 1 since)
  it("run 8: a death-special unit going into its wait while walking to attack drops the action and acts again later", () => {
    // the first seed where it happens (timings change it; seeds are fixed, so this is deterministic)
    let b: Battle | undefined, bb: any, caught: { u: any; t: number }[] = [], r: any;
    for (let i = 0; i < 60 && !caught.length; i++) {
      b = new Battle(db, run8[0], run8[1], { ...seedsFor(7, i, "all"), rules: RUN9_RULES });
      bb = b as any;
      caught = [];
      const zero = bb.zeroHp.bind(bb);
      bb.zeroHp = (u: any, by?: any) => {
        const walking = u.onDeath > 0 && !u.lastStand && u.phase === "toAttack";
        zero(u, by);
        if (walking) { caught.push({ u, t: bb.t }); expect(u.phase).not.toBe("toAttack"); }
      };
      r = b.run();
    }
    expect(caught.length).toBeGreaterThan(0);
    for (const { u, t } of caught) {
      const later = r.events.some((e: { kind: string; actor?: string; t: number }) => e.kind === "action" && e.actor === u.uid && e.t > t);
      expect(later || u.where === "dead").toBe(true);
    }
    expect(frozen(bb)).toEqual([]);
  });
  it("run 8 over 100 seeds: no battle ends with a unit frozen mid-action, and no time-out is won by one", () => {
    let atk = 0;
    for (let i = 0; i < 100; i++) {
      const b = new Battle(db, run8[0], run8[1], { ...seedsFor(7, i, "all"), rules: RUN9_RULES, recordEvents: false });
      // 2026-11-17: a unit waiting on its death special waits only until an enemy is free to aim at: none is still
      // waiting long at the end
      const bb = b as any, since = new Map<any, number>(), zero = bb.zeroHp.bind(bb);
      bb.zeroHp = (u: any, by?: any) => { const was = u.lastStand; zero(u, by); if (u.lastStand && !was) since.set(u, bb.t); };
      const r = b.run();
      if (r.winner === "atk") atk++;
      expect(frozen(bb)).toEqual([]);
      for (const u of bb.units) if (u.lastStand && !u.act) expect(bb.t - since.get(u)!).toBeLessThan(5);
    }
    expect(atk).toBeGreaterThan(80); // the old, frozen-unit code gave ~70; deterministic seeds (not a flaky bound)
  }, 20000);
});
const lc =(s: unknown) => String(s ?? "").toLowerCase();
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("group Revive abilities: one shared pool per owner (user 2026-11-17)", () => {
  // (account cotton candy max 200, the default when these battles were picked)
  const team = (ids: number[]): TeamConfig => ({ maxCc: { hp: 200, atk: 200, rcv: 200 }, members: ids.map((unitId) => ({ unitId, illegal: true, rumbleKey: true, llbLevel: 5 })) });
  const foes = team([4557, 4212, 4276, 3848, 4170]);
  // Grus 4528: Revive (50% with LLB) once for [SWORD] when 5+ [Navy] (or 6+ Fighter/Powerhouse); Kujaku, Hibari, Helmeppo are
  // [SWORD], Kizaru is Navy but not [SWORD]
  const sword = team([4528, 4512, 4523, 4524, 4366]);
  const start = (t: TeamConfig) => { const b = new Battle(db, t, foes, { seed: 1, rules: DEFAULT_RULES }); b.init(); return b as any; };
  /** Hit `u` for more than it has left (no death special, no own revive). */
  const kill = (bb: any, u: any) => {
    Object.assign(u, { onDeath: 0, revives: 0, shield: 0 });
    bb.damage(bb.unit("D1"), u, u.hp + 1, { regular: false, raw: 0, ignoresDef: true });
    return u;
  };
  const revLog = (bb: any) => bb.events.filter((e: any) => /'s ability revives/.test(e.text)).map((e: any) => e.text);

  it("the first matching KO uses the one shared use; the second isn't revived; no target gets a revive of its own", () => {
    const bb = start(sword);
    for (const u of bb.sides.atk) expect(u.revives).toBe(0);
    const kujaku = kill(bb, bb.unit("A2"));
    expect(kujaku.where).toBe("field");
    expect(bb.revivePools[0].e.amount).toBe(50); // LLB ability: 50% (base 30%)
    expect(kujaku.hp).toBe(Math.floor(bb.maxHp(kujaku) * 50 / 100));
    expect(revLog(bb)).toEqual([`A1 Prince Grus's ability revives A2 ${kujaku.name} with ${kujaku.hp.toLocaleString("en-US")} HP`]);
    expect(kill(bb, bb.unit("A3")).where).toBe("dead");
  });
  it("the owner revives himself when he is the first matching unit KO'd", () => {
    const bb = start(sword);
    const grus = kill(bb, bb.unit("A1"));
    expect(grus.where).toBe("field");
    expect(grus.hp).toBeGreaterThan(0);
    expect(kill(bb, bb.unit("A2")).where).toBe("dead");
  });
  it("owner KO'd for good, or Forced Out: no revive", () => {
    let bb = start(sword);
    bb.ko(bb.unit("A1"));
    expect(kill(bb, bb.unit("A2")).where).toBe("dead");
    bb = start(sword);
    bb.forceOut(bb.unit("A1"), 10);
    expect(kill(bb, bb.unit("A2")).where).toBe("dead");
  });
  it("a unit that doesn't match isn't revived and doesn't use it up", () => {
    const bb = start(sword);
    expect(kill(bb, bb.unit("A5")).where).toBe("dead"); // Kizaru: not [SWORD]
    expect(kill(bb, bb.unit("A2")).where).toBe("field");
  });
  it("condition false: nothing", () => {
    const bb = start(team([4528, 4512, 4560, 4547, 4482])); // 2 [Navy], 3 Fighter/Powerhouse
    expect(kill(bb, bb.unit("A2")).where).toBe("dead");
    expect(revLog(bb)).toEqual([]);
  });
  it("a death special comes first, then the pool revives (Garp & Coby 4521)", () => {
    const bb = start(team([4528, 4521, 4512, 4523, 4524]));
    const gc = bb.unit("A2");
    expect(gc.onDeath).toBeGreaterThan(0);
    gc.revives = 0;
    bb.damage(bb.unit("D1"), gc, gc.hp + gc.shield + 1, { regular: false, raw: 0, ignoresDef: true });
    expect(gc).toMatchObject({ hp: 1, lastStand: true });
    expect(bb.deathEnds(gc, true)).toBe(true);
    expect(gc.where).toBe("field");
    expect(kill(bb, bb.unit("A3")).where).toBe("dead");
  });
  it("another unit works the same: Brook 4197, Free Spirit, unconditional", () => {
    const bb = start(team([4197, 4560, 4512, 4523, 4524])); // Shanks 4560 is Free Spirit
    const shanks = kill(bb, bb.unit("A2"));
    expect(shanks.where).toBe("field");
    expect(shanks.hp).toBe(Math.floor(bb.maxHp(shanks) * bb.revivePools[0].e.amount / 100));
    expect(kill(bb, bb.unit("A1")).where).toBe("dead"); // Brook himself: the use is gone
  });
});

describe("robustness and speed", () => {
  it("runs random 8v8 teams from every unit with a Rumble kit without errors", () => {
    const ids = [...db.byId.values()].filter((u) => u.kit.specials.length).map((u) => u.id);
    let s = 99;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const team = (): TeamConfig => ({ members: Array.from({ length: 8 }, () => ({ unitId: ids[Math.floor(rnd() * ids.length)]!, illegal: true, rumbleKey: rnd() < 0.5, llbLevel: Math.floor(rnd() * 6) })) });
    for (let i = 0; i < 150; i++) expect(() => simulateBattle(db, team(), team(), { seed: i, rules: RUN9_RULES, frameInterval: i % 30 ? 0 : 0.5 })).not.toThrow();
  }, 20000); // 150 full 8v8 battles: about 4-5 s, over the default limit when the whole suite runs
  it("win-rate runs report a standard error", () => {
    const r = simulateMany(db, run9Mine, run9Enemy, 40, 0, RUN9_RULES);
    expect(r.battles).toBe(40);
    expect(r.se).toBeCloseTo(Math.sqrt((r.winRate * (1 - r.winRate)) / 40), 9);
  });
  it("win-rate runs list the seeds won, lost and lost on time; each plays the same as One battle with that seed (user 2026-11-18)", () => {
    const r = simulateMany(db, run9Mine, run9Enemy, 30, 0, RUN9_RULES, 5);
    const { win, loss, timeout } = r.seedLists;
    expect([...win, ...loss, ...timeout].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => 5 + i));
    expect([win.length, timeout.length, loss.length]).toEqual([r.attackerWins, r.timeouts, 30 - r.attackerWins - r.timeouts]);
    for (const [list, w, why] of [[win, "atk", undefined], [loss, "def", "wipe"], [timeout, "def", "timeout"]] as const)
      for (const seed of list.slice(0, 2)) {
        const one = simulateBattle(db, run9Mine, run9Enemy, { seed, frameInterval: 0.1, rules: RUN9_RULES });
        expect(one.winner).toBe(w);
        if (why) expect(one.reason).toBe(why);
      }
    // split over workers and merged: the same lists
    const parts = [0, 1, 2].map((k) => Array.from({ length: 10 }, (_, j) => simulateMany(db, run9Mine, run9Enemy, 1, k + 3 * j, RUN9_RULES, 5)).reduce(mergeSummaries));
    expect(parts.reduce(mergeSummaries).seedLists).toEqual(r.seedLists);
  });
});

describe("super specials left (the HUD's flames)", () => {
  it("start at 3 a team, only go down, never below 0, and match the super specials fired", () => {
    let fired = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = simulateBattle(db, run9Mine, run9Enemy, { seed, rules: RUN9_RULES, frameInterval: 0.5 });
      expect(r.frames[0]!.supersLeft).toEqual({ atk: 3, def: 3 });
      for (const side of ["atk", "def"] as const) {
        const left = r.frames.map((f) => f.supersLeft![side]);
        for (let i = 1; i < left.length; i++) expect(left[i]).toBeLessThanOrEqual(left[i - 1]!);
        expect(Math.min(...left)).toBeGreaterThanOrEqual(0);
        const supers = r.events.filter((e) => e.kind === "special" && /SUPER special/.test(e.text) && e.actor?.startsWith(side === "atk" ? "A" : "D")).length;
        expect(3 - left.at(-1)!).toBe(Math.min(3, supers));
        expect(supers).toBeLessThanOrEqual(3);
        fired += supers;
      }
    }
    expect(fired).toBeGreaterThan(0);
  });
});
