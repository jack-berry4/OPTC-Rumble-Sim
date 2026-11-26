import { describe, expect, it } from "vitest";
import { loadNodeDb as loadUnitDb } from "../sim/nodeDb";
import { defaultTeams } from "./defaultTeams";
import { advancedFrom, advancedPotential, applyPreset, atLeastPreset, ccMonumentLevel, DEFAULT_PRESETS, isPremiumPotential, snapAccountCc, kitFor, legalize, legalizeChanges, llbTiersOf, KEY_BONUS, keyBonusFor, keyTierOf, rumbleBaseStats, rumbleDefSpd, rumbleStats, statsAtLevel, statUp, withDefaults } from "./stats";

/**
 * In-game Rumble status screens (user screenshots, 2026-11-05): unit, level (0 = max), cotton candy,
 * and the HP / ATK / RCV the game shows. None of these units has a Rumble special.
 */
const IN_GAME: [number, number, [number, number, number], [number, number, number]][] = [
  [971, 19, [0, 0, 0], [2002, 1004, 0]], // Pacifista PX-4 (OPTC-DB RCV is negative at this level; game shows 0)
  [969, 7, [0, 0, 0], [2000, 1000, 0]],
  [968, 14, [0, 0, 0], [2001, 1002, 0]],
  [972, 10, [0, 0, 0], [2001, 1002, 0]],
  [970, 8, [0, 0, 0], [2001, 1001, 0]],
  [39, 0, [400, 100, 0], [3666, 957, 135]], // Buggy: matches with 400 HP cotton candy (over the 200 cap: unexplained)
  [36, 0, [300, 100, 0], [2572, 759, 55]],
  [37, 0, [300, 100, 0], [2324, 658, 130]],
  [161, 0, [150, 150, 0], [1049, 455, 198]],
  [158, 0, [0, 50, 0], [299, 210, 203]],
  [159, 0, [150, 50, 0], [1031, 213, 205]],
  [160, 0, [150, 50, 0], [977, 198, 219]],
  [30, 0, [300, 150, 0], [3168, 1299, 369]],
];

describe("Rumble stats vs the game", () => {
  const db = loadUnitDb();
  it.each(IN_GAME)("unit %i matches its in-game status screen", (id, level, [hp, atk, rcv], expected) => {
    const rec = db.byId.get(id)!;
    // Illegal (admin) unit: Buggy's 400 HP cotton candy is over the normal 200 cap.
    const s = rumbleStats(rec, { unitId: id, illegal: true, level: level || undefined, cc: { hp, atk, rcv }, lbNodes: 0 });
    expect([statUp(s.hp), statUp(s.atk), statUp(s.rcv)]).toEqual(expected);
  });
});

describe("default teams", () => {
  const db = loadUnitDb();
  it("legal default units compute exactly their in-game stats", () => {
    const [atk, def] = defaultTeams();
    const want = new Map(IN_GAME.map(([id, , , st]) => [id, st]));
    for (const m of [...atk.members, ...def.members]) {
      if (!m || m.illegal) continue;
      const rec = db.byId.get(m.unitId)!;
      const s = rumbleStats(rec, m, def.maxCc);
      expect([m.unitId, statUp(s.hp), statUp(s.atk), statUp(s.rcv)]).toEqual([m.unitId, ...want.get(m.unitId)!]);
      expect(rumbleDefSpd(rec, m)).toEqual({ def: 50, spd: 100 });
    }
  });
});

describe("investment rules", () => {
  const db = loadUnitDb();
  const tesoro = db.byId.get(4000)!; // regular legend, 40 Limit Break entries with the key lock at 30

  it("caps cotton candy at 200 per stat unless custom; account max 100-200, default 180", () => {
    expect(withDefaults(tesoro, { unitId: 4000, cc: { hp: 400, atk: 0, rcv: 0 } }).cc.hp).toBe(200);
    expect(withDefaults(tesoro, { unitId: 4000, illegal: true, cc: { hp: 400, atk: 0, rcv: 0 } }).cc.hp).toBe(400);
    // Custom amounts may go over the account max (up to 200); "max" follows it.
    expect(withDefaults(tesoro, { unitId: 4000, ccMode: "custom", cc: { hp: 150, atk: 0, rcv: 0 } }, { hp: 100, atk: 100, rcv: 100 }).cc.hp).toBe(150);
    expect(withDefaults(tesoro, { unitId: 4000 }, { hp: 130, atk: 151, rcv: 200 }).cc).toEqual({ hp: 130, atk: 151, rcv: 200 });
    // An account max is a monument value per stat (100-200; others round up); unset = 180 each.
    expect(withDefaults(tesoro, { unitId: 4000 }, { hp: 120, atk: 80, rcv: 260 }).cc).toEqual({ hp: 130, atk: 100, rcv: 200 });
    expect([snapAccountCc(102), snapAccountCc(119), snapAccountCc(199), ccMonumentLevel(100), ccMonumentLevel(180), ccMonumentLevel(200)]).toEqual([103, 130, 200, 0, 25, 35]);
    expect(withDefaults(tesoro, { unitId: 4000 }).cc).toEqual({ hp: 180, atk: 180, rcv: 180 });
  });

  it("stops Limit Break at the key lock without a Limit Break key", () => {
    expect(withDefaults(tesoro, { unitId: 4000, lbKey: false }).lbNodes).toBe(30);
    expect(withDefaults(tesoro, { unitId: 4000 }).lbNodes).toBe(40);
  });

  it("only lets max-level-99 units Limit Break or LLB (unless illegal)", () => {
    const buggy = db.byId.get(39)!; // max level 70
    expect(withDefaults(buggy, { unitId: 39, llbLevel: 5, level: 150 }).level).toBe(70);
    expect(withDefaults(buggy, { unitId: 39, illegal: true, llbLevel: 5, level: 150 }).level).toBe(150);
  });

  it("presets: 120 gives a keyed level 120 unit, MAX a level 150 expanded one", () => {
    const p120 = withDefaults(tesoro, applyPreset(tesoro, { unitId: 4000 }, DEFAULT_PRESETS[2]!));
    expect([p120.level, p120.rumbleKey, p120.lbNodes]).toEqual([120, true, 30]);
    const pmax = withDefaults(tesoro, applyPreset(tesoro, { unitId: 4000 }, DEFAULT_PRESETS[3]!));
    expect([pmax.level, pmax.rumbleKey, pmax.lbNodes, pmax.llbLevel]).toEqual([150, true, 40, 5]);
  });

  it("presets: premium potentials stay at level 1 unless the build ticks them (Lv 120 no, MAX yes)", () => {
    const unit = db.all.find((u) => {
      const pots = u.lb?.potentials ?? [];
      return pots.length === 3 && pots.some((p) => isPremiumPotential(p.name)) && pots.some((p) => !isPremiumPotential(p.name));
    })!;
    const prem = unit.lb!.potentials.map((p) => isPremiumPotential(p.name));
    expect(applyPreset(unit, { unitId: unit.id }, DEFAULT_PRESETS[2]!).potentialLevels).toEqual(prem.map((x) => (x ? 1 : 5)));
    expect(applyPreset(unit, { unitId: unit.id }, DEFAULT_PRESETS[3]!).potentialLevels).toEqual([5, 5, 5]);
    expect(["Super Tandem/Last Tap", "Rush", "Damage Limit Break: Type"].every(isPremiumPotential)).toBe(true);
    expect(["Critical Hit", "Super Tandem/Critical Hit"].some(isPremiumPotential)).toBe(false);
  });

  it("advanced presets: start out doing what the simple preset does (user 2026-11-18)", () => {
    for (const p of DEFAULT_PRESETS) {
      const simple = applyPreset(tesoro, { unitId: 4000 }, p);
      const adv = applyPreset(tesoro, { unitId: 4000 }, { ...p, useAdvanced: true, advanced: advancedFrom(p) });
      expect(adv).toEqual(simple);
    }
    // unticked: the simple settings again, the advanced ones kept
    const off = { ...DEFAULT_PRESETS[3]!, useAdvanced: false, advanced: { ...advancedFrom(DEFAULT_PRESETS[3]!), level: 1 } };
    expect(applyPreset(tesoro, { unitId: 4000 }, off).level).toBe(150);
  });

  it("advanced presets: skill levels, Limit Break nodes, each potential and custom cotton candy", () => {
    const unit = db.all.find((u) => (u.lb?.potentials ?? []).length === 3 && u.kit.specials.length >= 10 && (u.specialLevels ?? 1) > 1)!;
    const a = {
      ...advancedFrom(DEFAULT_PRESETS[3]!), specialLevel: 7, abilityLevel: 2, mainSpecialLevel: 1, lbNodes: 999,
      potentialDefault: 3, potentials: { [unit.lb!.potentials[0]!.name.split("/")[0]!.trim()]: 5 },
      cc: "custom" as const, ccCustom: { hp: 150, atk: 120, rcv: 300 },
    };
    const m = applyPreset(unit, { unitId: unit.id }, { ...DEFAULT_PRESETS[0]!, useAdvanced: true, advanced: a });
    expect([m.level, m.specialLevel, m.abilityLevel, m.mainSpecialLevel]).toEqual([150, 7, 2, 1]);
    expect(m.lbNodes).toBe(applyPreset(unit, { unitId: unit.id }, DEFAULT_PRESETS[3]!).lbNodes); // capped at what the unit has
    expect(m.potentialLevels).toEqual(unit.lb!.potentials.map((p) => advancedPotential(a, p.name)));
    expect(m.potentialLevels![0]).toBe(unit.lb!.potentials[0]!.name.includes("/") ? m.potentialLevels![0] : 5);
    expect([m.ccMode, m.cc]).toEqual(["custom", { hp: 150, atk: 120, rcv: 200 }]);
    const few = applyPreset(unit, { unitId: unit.id }, { ...DEFAULT_PRESETS[0]!, useAdvanced: true, advanced: { ...a, lbNodes: 3, specialLevel: undefined } });
    expect([few.lbNodes, few.specialLevel]).toEqual([3, unit.kit.specials.length]);
    // a combined potential takes the lowest of its parts
    expect(advancedPotential({ ...a, potentialDefault: 4, premiumDefault: 4, potentials: { "Super Tandem": 1 } }, "Super Tandem/Last Tap")).toBe(1);
    expect(advancedPotential({ ...a, potentialDefault: 4, potentials: {} }, "Critical Hit")).toBe(4);
    // premium and regular potentials have their own "every" level
    const split = { ...a, potentialDefault: 5, premiumDefault: 2, potentials: { Rush: 4 } };
    expect(["Critical Hit", "Last Tap", "Rush", "Super Tandem/Last Tap"].map((n) => advancedPotential(split, n))).toEqual([5, 2, 4, 2]);
    expect(advancedPotential({ ...split, premiumDefault: undefined }, "Last Tap")).toBe(5); // older saves
  });

  it("cotton candy: none is 0; presets set none (Lv 1, Lv 99), account max (Lv 120, MAX) or keep", () => {
    expect(withDefaults(tesoro, { unitId: 4000, ccMode: "none" }).cc).toEqual({ hp: 0, atk: 0, rcv: 0 });
    const mine = { unitId: 4000, ccMode: "custom" as const, cc: { hp: 50, atk: 20, rcv: 10 } };
    expect(DEFAULT_PRESETS.map((p) => withDefaults(tesoro, applyPreset(tesoro, mine, p)).cc.hp)).toEqual([0, 0, 180, 180]);
    expect(withDefaults(tesoro, applyPreset(tesoro, mine, { ...DEFAULT_PRESETS[3]!, cc: "keep" })).cc).toEqual(mine.cc);
    // max possible: custom 200/200/200, even with a lower account max
    const mp = applyPreset(tesoro, mine, { ...DEFAULT_PRESETS[3]!, cc: "maxPossible" });
    expect([mp.ccMode, withDefaults(tesoro, mp).cc]).toEqual(["custom", { hp: 200, atk: 200, rcv: 200 }]);
    expect(withDefaults(tesoro, mp, { hp: 100, atk: 100, rcv: 100 }).cc.hp).toBe(200);
  });

  it("unlocks potentials along the Limit Break (each at least level 1 once unlocked)", () => {
    // Tesoro's potentials unlock at nodes 4, 15 and 30.
    const at10 = withDefaults(tesoro, { unitId: 4000, lbNodes: 10, potentialLevels: [0, 5, 5] });
    expect(at10.potentialLevels).toEqual([1, 0, 0]);
    // locked ones keep their chosen level (shown with a *) but add 0
    expect(at10.potentialChosen).toEqual([1, 5, 5]);
    expect(withDefaults(tesoro, { unitId: 4000, lbNodes: 0 }).potentials).toBe(0);
    const p99 = withDefaults(tesoro, applyPreset(tesoro, { unitId: 4000 }, DEFAULT_PRESETS[1]!));
    expect([p99.level, p99.potentials, p99.sockets]).toEqual([99, 3, 25]);
  });

  it("legal units: potentials and extra socket slots count only once the Limit Break reaches them (Kizaru 3704)", () => {
    const kiz = db.byId.get(3704)!;
    // Barrier Penetration unlocks at Limit Break 20: at 19 it adds 0 (shown with a *)
    const at19 = withDefaults(kiz, { unitId: 3704, lbNodes: 19, lbKey: true, potentialLevels: [5, 5, 5] });
    expect([at19.potentialsOpen, at19.potentialLevels, at19.potentials]).toEqual([[true, true, false], [5, 5, 0], 10]);
    expect(withDefaults(kiz, { unitId: 3704, lbNodes: 20, lbKey: true, potentialLevels: [5, 5, 5] }).potentials).toBe(15);
    // 4 socket slots, a 5th at Limit Break 9
    const at8 = withDefaults(kiz, { unitId: 3704, lbNodes: 8, sockets: 25 });
    expect([at8.socketSlots, at8.socketSlotsMax, at8.sockets, at8.lockedSocketNodes.map((n) => n.at + 1)]).toEqual([4, 5, 20, [9]]);
    // illegal units have everything unlocked
    const ill = withDefaults(kiz, { unitId: 3704, illegal: true, lbNodes: 0, potentialLevels: [5, 5, 5], sockets: 25 });
    expect([ill.potentials, ill.sockets]).toEqual([15, 25]);
  });

  it("lists what marking an illegal unit legal would change (Legal checkbox hover)", () => {
    const m = { unitId: 4000, illegal: true, ccMode: "custom" as const, cc: { hp: 400, atk: 0, rcv: 0 }, level: 150, llbLevel: 5 };
    const c = legalizeChanges(tesoro, m);
    expect(c).toContain("Cotton candy: 400/0/0 → 200/0/0");
    expect(c.some((x) => x.startsWith("HP: "))).toBe(true);
    expect(legalizeChanges(tesoro, { ...m, illegal: false })).toEqual([]);
  });

  it("applies the Rumble key only from level 120 (unless custom)", () => {
    const keyed = { unitId: 4000, rumbleKey: true, llbLevel: 5 };
    expect(keyBonusFor(tesoro, { ...keyed, level: 119 })).toBeUndefined();
    expect(keyBonusFor(tesoro, { ...keyed, illegal: true, level: 119 })).toBeDefined();
    const plain = rumbleStats(tesoro, { ...keyed, rumbleKey: false });
    const withKey = rumbleStats(tesoro, keyed);
    // unrounded in calculations (shown rounded up)
    expect(withKey.hp).toBeCloseTo(plain.hp * (1 + KEY_BONUS[tesoro.keyGroup].hp), 9);
    expect(rumbleDefSpd(tesoro, keyed).spd).toBeCloseTo(tesoro.stats.spd * (1 + KEY_BONUS[tesoro.keyGroup].spd), 9);
    expect(statUp(withKey.hp)).toBe(Math.ceil(withKey.hp));
  });

  describe("Rumble key tiers from the game's data (2026-11-17)", () => {
    const keyed = (id: number, extra: object = {}) => ({ unitId: id, rumbleKey: true, level: 150, llbLevel: 5, ...extra });
    it("Oden 3175 is in the game's top tier (owner: HP +50%, ATK +30%, RCV +30%, DEF +20%, SPD +30%, Special CT -10%)", () => {
      const oden = db.byId.get(3175)!;
      expect(oden.keyGroup).toBe("legend"); // flags.js said regular legend
      const k = keyBonusFor(oden, keyed(3175))!;
      for (const [f, v] of Object.entries({ hp: 0.5, atk: 0.3, rcv: 0.3, def: 0.2, spd: 0.3, ct: 0.1, taken: 0.2, dealt: 0.2 })) expect(k[f as "hp"]).toBeCloseTo(v, 12);
      expect(k.vs).toEqual(["[DEX]"]);
      expect(keyTierOf(oden)).toMatchObject({ from: "game", minLevel: 120 });
      const plain = rumbleStats(oden, keyed(3175, { rumbleKey: false }));
      expect(rumbleStats(oden, keyed(3175)).hp).toBeCloseTo(plain.hp * 1.5, 6);
      expect(rumbleDefSpd(oden, keyed(3175)).spd).toBeCloseTo(oden.stats.spd * 1.3, 9);
      expect(keyBonusFor(db.byId.get(3177)!, keyed(3177))).toMatchObject({ hp: 0.5, vs: ["[INT]"] }); // Roger 3177
    });
    it("a tier the flags got wrong: 3365 (flags tmKizuna) is the game's tier 100000: rr stats, -5% taken, level 99", () => {
      const u = db.byId.get(3365)!;
      expect(u.keyGroup).toBe("tmKizuna");
      const k = keyBonusFor(u, keyed(3365))!;
      expect([k.hp, k.atk, k.def, k.ct, k.taken, k.dealt]).toEqual([0.2, 0.15, 0.05, 0, 0.05, 0]);
      expect(k.taken).not.toBe(KEY_BONUS.tmKizuna.taken);
      expect(keyBonusFor(u, keyed(3365, { level: 99, llbLevel: 0 }))).toBeDefined(); // needs 99, not 120
      expect(keyBonusFor(u, keyed(3365, { level: 98, llbLevel: 0 }))).toBeUndefined();
    });
    it("a unit the game gives no key: none for legal units (editor, presets, legalize), an illegal unit may force one", () => {
      const u = db.byId.get(3333)!; // Luffy before 3334
      expect(u.game && u.game.key).toBeNull();
      expect(keyTierOf(u)).toBeNull();
      expect(keyBonusFor(u, keyed(3333))).toBeUndefined();
      expect(withDefaults(u, keyed(3333)).rumbleKey).toBe(false);
      expect(applyPreset(u, { unitId: 3333 }, DEFAULT_PRESETS.at(-1)!).rumbleKey).toBe(false);
      expect(keyBonusFor(u, keyed(3333, { illegal: true }))).toEqual(KEY_BONUS[u.keyGroup]);
      expect(legalize(u, keyed(3333, { illegal: true })).rumbleKey).toBe(false);
    });
    it("a unit not in the game's data keeps its flags.js tier (level 120, against its resilience)", () => {
      const u = db.byId.get(519)!;
      expect(u.game).toBeUndefined();
      expect(keyTierOf(u)).toEqual({ bonus: KEY_BONUS[u.keyGroup], minLevel: 120, label: expect.any(String), from: "flags" });
      expect(keyTierOf(u)!.bonus.vs).toBeUndefined();
    });
  });

  it("the Rumble stat bonus uses the main-game special level, not the Rumble special (user's status screens)", () => {
    // Luffy 2087: displayed HP 2,322, Rumble special 1/10, 7 socket levels -> 2,566 in the game
    const luffy = rumbleStats(db.byId.get(2087)!, { unitId: 2087, specialLevel: 1, displayed: { hp: 2322, atk: 1290, rcv: 127 }, lbNodesAndSockets: 7 });
    expect(Math.round(luffy.hp)).toBe(2566);
    // Usohachi 2806: displayed HP 2,995, Rumble special 3/10, potentials 5+5+3 and sockets 1+2+1+1+2 -> 3,894
    const uso = rumbleStats(db.byId.get(2806)!, { unitId: 2806, specialLevel: 3, displayed: { hp: 2995, atk: 1694, rcv: 479 }, lbNodesAndSockets: 20 });
    expect(Math.round(uso.hp)).toBe(3894);
    // a main special below max scales it down (Luffy has 6 levels: cooldown 17 -> 12)
    expect(db.byId.get(2087)!.specialLevels).toBe(6);
    const low = rumbleStats(db.byId.get(2087)!, { unitId: 2087, displayed: { hp: 2322, atk: 1290, rcv: 127 }, lbNodesAndSockets: 7, mainSpecialLevel: 3 });
    expect(Math.round(low.hp)).toBe(Math.round(2322 * (1 + 0.015 * 7 * 3 / 6)));
    // a unit whose special has a single level (Kizaru 3704, cooldown 8 -> 8) always counts as 1/1
    expect(db.byId.get(3704)!.specialLevels).toBe(1);
  });

  it("Kizaru at LLB 4 uses his LLB ability and special (user: Shooters ATK 6 / SPD 6 / HP 5, himself ATK 5)", () => {
    const rec = db.byId.get(3704)!;
    const kit = kitFor(rec, { unitId: 3704, llbLevel: 4, abilityLevel: 5, specialLevel: 10 });
    const lv5 = kit.abilities[4]!;
    const lvl = (attr: string, target: string) =>
      lv5.find((e) => e.effect === "buff" && (e.attributes as string[] | undefined)?.includes(attr) && (e.targeting?.targets as string[] | undefined)?.includes(target))?.level;
    expect([lvl("ATK", "Shooter"), lvl("SPD", "Shooter"), lvl("HP", "Shooter"), lvl("ATK", "self")]).toEqual([6, 6, 5, 5]);
    expect(kit.specials[9]!.cooldown).toBe(24); // LLB special (27 without LLB)
    // without LLB there is no HP up
    expect(kitFor(rec, { unitId: 3704, abilityLevel: 5 }).abilities[4]!.some((e) => e.attributes?.includes("HP"))).toBe(false);
    // his LLB upgrade levels come from OPTC-DB: ability 2, special 4, resistances 5
    expect(llbTiersOf(rec)).toEqual({ ability: 2, special: 4, resilience: 5, superSpecial: Infinity });
    expect(kitFor(rec, { unitId: 3704, llbLevel: 3, specialLevel: 10 }).specials[9]!.cooldown).toBe(27);
  });
});

describe("rumbleBaseStats", () => {
  it("matches the PF calculator's base-stat example", () => {
    // Base Stat Calculator tab: HP 7433, ATK 3533, RCV 722, special 6/6, 15 LB nodes + 25 sockets
    const s = rumbleBaseStats({ hp: 7433, atk: 3533, rcv: 722 }, 40, 6, 6);
    expect(s.hp).toBeCloseTo(11892.8, 1);
    expect(s.atk).toBeCloseTo(4592.9, 1);
    expect(s.rcv).toBeCloseTo(794.2, 1);
  });
});

describe("per-stat growth curves (OPTC-DB gives a few units one curve per stat)", () => {
  it("Lao G. (880, growth [1.5, 0.7, 1.5]) has real stats at every level, not NaN (found by the meta run, 2026-11-24)", () => {
    const db = loadUnitDb();
    const rec = db.byId.get(880)!;
    for (const level of [1, 50, 99]) {
      const s = rumbleStats(rec, { unitId: 880, level, ccMode: "none" });
      expect([s.hp, s.atk, s.rcv].every(Number.isFinite)).toBe(true);
    }
    // level 1 = the level-1 stats; max level = the max stats, whatever the curves
    expect(statsAtLevel(rec, 1)).toEqual({ hp: 968, atk: 721, rcv: 143 });
    expect(statsAtLevel(rec, 99)).toEqual({ hp: 2021, atk: 1420, rcv: 293 });
    // the middle follows each stat's own curve: HP (1.5) grows slower early than ATK (0.7)
    const mid = statsAtLevel(rec, 50);
    expect((mid.hp - 968) / (2021 - 968)).toBeLessThan((mid.atk - 721) / (1420 - 721));
  });
});

describe("atLeastPreset (generator: every unit at least a quick build, user 2026-11-24)", () => {
  const db = loadUnitDb();
  const rec = db.byId.get(4560)!;
  const lv99 = DEFAULT_PRESETS.find((p) => p.label === "Lv 99")!, lv1 = DEFAULT_PRESETS.find((p) => p.label === "Lv 1")!;
  it("raises a low build part by part", () => {
    const low = applyPreset(rec, { unitId: rec.id }, lv1);
    const up = withDefaults(rec, atLeastPreset(rec, low, lv99));
    expect(up.level).toBeGreaterThanOrEqual(99);
    expect(up.lbNodes).toBe(withDefaults(rec, applyPreset(rec, { unitId: rec.id }, lv99)).lbNodes);
    expect(up.specialLevel).toBe(rec.kit.specials.length);
    expect(up.sockets).toBeGreaterThan(0);
  });
  it("never lowers anything", () => {
    const max = applyPreset(rec, { unitId: rec.id }, DEFAULT_PRESETS.find((p) => p.label === "MAX")!);
    const a = withDefaults(rec, max), b = withDefaults(rec, atLeastPreset(rec, max, lv99));
    expect([b.level, b.llbLevel, b.lbNodes, b.sockets, b.specialLevel, b.rumbleKey, b.cc]).toEqual([a.level, a.llbLevel, a.lbNodes, a.sockets, a.specialLevel, a.rumbleKey, a.cc]);
    expect(b.potentialChosen).toEqual(a.potentialChosen);
  });
});

describe("free-to-play units (OPTC-DB flags.js; user 2026-11-25: Co-op / PKA units get their own 5★-and-below build)", () => {
  const db = loadUnitDb();
  it("farmed units are marked, recruited ones aren't", () => {
    expect(db.byId.get(3506)?.farmable).toBe(true); // Hyogoro the Flower (5★, farmed)
    expect(db.byId.get(4560)?.farmable).toBeFalsy(); // Shanks (rare recruit)
    const f5 = db.all.filter((u) => u.farmable && ["5", "5+"].includes(String(u.stars)));
    expect(f5.length).toBeGreaterThan(300);
  });
  it("a maxed box unit stays maxed under a lower 5★-and-below build (only worse parts are raised)", () => {
    const rec = db.byId.get(3506)!;
    const max = applyPreset(rec, { unitId: rec.id }, DEFAULT_PRESETS.find((p) => p.label === "MAX")!);
    const lv1 = DEFAULT_PRESETS.find((p) => p.label === "Lv 1")!;
    const a = withDefaults(rec, max), b = withDefaults(rec, atLeastPreset(rec, max, lv1));
    expect([b.level, b.llbLevel, b.lbNodes, b.sockets, b.specialLevel, b.abilityLevel, b.cc]).toEqual([a.level, a.llbLevel, a.lbNodes, a.sockets, a.specialLevel, a.abilityLevel, a.cc]);
  });
});
