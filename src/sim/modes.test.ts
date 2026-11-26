import { describe, expect, it } from "vitest";
import { assaultScore, DEFAULT_ASSAULT } from "../engine/assault";
import { bossFromUnit, bossMember, BOSS_ID_MIN, registerBosses } from "../engine/boss";
import { NYDATO_CEREBRAL, NYDATO_STR } from "../engine/defaultTeams";
import { burstNeed, DEFAULT_GP_BOOST, gpCondition, leaderBoosted } from "../engine/gp";
import { GRID_ORIGIN, TILE } from "../engine/grid";
import type { Pattern } from "../data/schema";
import type { TeamConfig } from "../engine/types";
import { Battle, simulateBattle } from "./battle";
import { loadNodeDb } from "./nodeDb";

const db = loadNodeDb();
const pad = (t: TeamConfig): TeamConfig => ({ ...t, members: Array.from({ length: 8 }, (_, i) => t.members[i] ?? null) });

/** A boss team: one boss copied from Kaido-like heavy hitters is not needed; Shanks 4560 with a lot of HP will do. */
function bossTeam(hp: number, n = 1): TeamConfig {
  const members = Array.from({ length: n }, (_, i) => {
    const b = bossFromUnit(db.byId.get(4560)!, BOSS_ID_MIN + 1 + i);
    b.stats.hp = hp;
    return bossMember(b);
  });
  const t = pad({ members });
  registerBosses(db, [t]);
  return t;
}

describe("Assault Rumble (user, 2026-11-22)", () => {
  it("a boss at 0 HP stays on the field, keeps acting, takes more damage, and all damage counts", () => {
    const bosses = bossTeam(20_000, 3);
    const r = simulateBattle(db, NYDATO_CEREBRAL, bosses, { seed: 3, mode: "assault", recordEvents: true });
    const boss = r.units.filter((u) => u.side === "def").sort((a, b) => (a.zeroAt ?? 999) - (b.zeroAt ?? 999))[0]!;
    expect(boss.zeroAt).toBeDefined();
    expect(boss.alive).toBe(true);
    expect(boss.hp).toBe(0);
    // damage past 0 HP counts: far more than its 20,000 HP
    expect(r.assault!.damage).toBeGreaterThan(20_000);
    expect(r.assault!.damage).toBe(r.units.filter((u) => u.side === "def").reduce((s, u) => s + u.damageTaken, 0));
    expect(r.assault!.defeated).toBe(true);
    // the boss still acted after 0 HP
    const acts = r.events.filter((e) => e.kind === "action" && e.actor?.startsWith("D") && e.t > boss.zeroAt!);
    expect(acts.length).toBeGreaterThan(0);
    // the battle runs its full length (the bosses can't be wiped out) unless your team is
    expect(r.reason === "timeout" || r.winner === "def").toBe(true);
  });
  it("below the max Assault Lv bosses go down like any unit", () => {
    const r = simulateBattle(db, NYDATO_CEREBRAL, bossTeam(20_000, 3), { seed: 3, mode: "assault", assault: { immortal: false }, recordEvents: false });
    const bosses = r.units.filter((u) => u.side === "def");
    expect(bosses.every((u) => !u.alive && u.zeroAt === undefined)).toBe(true);
    expect(r.assault!.defeated).toBe(true);
    expect(r.winner).toBe("atk");
  });
  it("the score multiplies the modifiers that apply", () => {
    const o = { damage: 1000, life: 500, defeated: true };
    expect(Math.abs(assaultScore(o, DEFAULT_ASSAULT) - 1500 * 2.5 * 1.9 * 1.4)).toBeLessThanOrEqual(1);
    expect(Math.abs(assaultScore({ ...o, defeated: false }, DEFAULT_ASSAULT) - 1500 * 2.5 * 1.4)).toBeLessThanOrEqual(1);
    // the user's Akainu result (2026-11-22): (132,828 + 110,736) x 1.625 x 2.00 x 1.4 = 1,108,216.2 vs 1,108,217 shown
    // (the shown multipliers are rounded)
    const akainu = { ...DEFAULT_ASSAULT, modifiers: DEFAULT_ASSAULT.modifiers.map((m) => (m.id === "defeat" ? { ...m, mult: 2 } : m.id === "level" ? { ...m, mult: 1.625 } : m)) };
    expect(Math.abs(assaultScore({ damage: 132_828, life: 110_736, defeated: true }, akainu) / 1_108_217 - 1)).toBeLessThan(0.00001);
  });
  it("life score: field units' HP, bench units at full, KO'd units 0", () => {
    const b = new Battle(db, NYDATO_CEREBRAL, bossTeam(5_000_000, 3), { seed: 1, mode: "assault", recordEvents: false });
    const r = b.run();
    const mine = b.units.filter((u) => u.side === "atk");
    expect(mine.some((u) => u.where === "dead") || mine.some((u) => u.where === "bench")).toBe(true);
    const want = mine.reduce((s, u) => s + (u.where === "dead" ? 0 : u.where === "bench" ? b.maxHp(u) : Math.floor(u.hp)), 0);
    expect(r.assault!.life).toBeCloseTo(want, 6);
  });
  it("effects for Assault Rumble only work in that mode", () => {
    const b = new Battle(db, pad({ members: [{ unitId: 4444 }] }), NYDATO_STR, { seed: 1, mode: "assault" });
    expect(b.cond(b.units[0]!, { type: "mode", mode: "Assault Rumble" })).toBe(true);
    const r = new Battle(db, pad({ members: [{ unitId: 4444 }] }), NYDATO_STR, { seed: 1 });
    expect(r.cond(r.units[0]!, { type: "mode", mode: "Assault Rumble" })).toBe(false);
  });
});

describe("Grand Party (user, 2026-11-22)", () => {
  const wb = db.byId.get(4293)!; // Whitebeard & Ace: burst when 6 crew members are defeated
  it("a boosted leader needs 40% less, rounded up (6 -> 4), and gets one more use", () => {
    expect(burstNeed(gpCondition(wb), false)).toBe(6);
    expect(burstNeed(gpCondition(wb), true, DEFAULT_GP_BOOST)).toBe(4);
    expect(leaderBoosted(db.byId.get(4442)!, DEFAULT_GP_BOOST)).toBe(true); // Nusjuro: Slasher
  });
  it("the leader's GP ability buffs its team, wherever the leader is", () => {
    const atk = { ...NYDATO_CEREBRAL, leader: { member: { unitId: 4560 } } }; // Shanks: [STR] / Four Emperors HP, SPD up 6 ...
    const b = new Battle(db, atk, NYDATO_STR, { seed: 1, mode: "gp", frameInterval: 1 });
    b.init();
    const shanksOnTeam = b.units.find((u) => u.side === "atk" && u.rec.id === 4560)!;
    expect(shanksOnTeam.aura.HP ?? 0).toBeGreaterThanOrEqual(6);
    const plain = new Battle(db, NYDATO_CEREBRAL, NYDATO_STR, { seed: 1 });
    plain.init();
    expect(plain.units.find((u) => u.side === "atk" && u.rec.id === 4560)!.aura.HP ?? 0).toBeLessThan(shanksOnTeam.aura.HP!);
  });
  it("the burst goes off when its gauge is full, or at set times; the start charge counts", () => {
    const atk = { ...NYDATO_CEREBRAL, leader: { member: { unitId: 4560 } } }; // Shanks: when the crew uses specials 4 times
    const r = simulateBattle(db, atk, NYDATO_STR, { seed: 2, mode: "gp", recordEvents: true });
    const g = r.gp!.atk!;
    expect(g.need).toBe(4);
    expect(g.launches.length).toBeGreaterThan(0);
    expect(g.launches[0]!.full).toBe(true);
    expect(r.events.some((e) => e.kind === "burst")).toBe(true);
    // started at 3 of 4: ready after the first special
    const r2 = simulateBattle(db, atk, NYDATO_STR, { seed: 2, mode: "gp", recordEvents: false, gp: { atk: { startCharge: 3 } } });
    expect(r2.gp!.atk!.launches[0]!.t).toBeLessThan(g.launches[0]!.t);
    // at set times, full or not, and no more than the uses left
    const r3 = simulateBattle(db, atk, NYDATO_STR, { seed: 2, mode: "gp", recordEvents: false, gp: { atk: { usesLeft: 1, launch: { mode: "times", times: [5, 50] } } } });
    expect(r3.gp!.atk!.launches.map((l) => l.t)).toEqual([5]);
    expect(r3.gp!.atk!.launches[0]!.full).toBe(false);
  });
  it("leader-based burst damage uses the leader's ATK", () => {
    const atk = { ...NYDATO_CEREBRAL, leader: { member: { unitId: 4442 } } }; // Nusjuro: ATK x4.5 vs 3 high-ATK enemies (leader)
    const r = simulateBattle(db, atk, NYDATO_STR, { seed: 4, mode: "gp", recordEvents: true, gp: { atk: { launch: { mode: "times", times: [1] } } } });
    const burst = r.events.findIndex((e) => e.kind === "burst");
    expect(burst).toBeGreaterThanOrEqual(0);
    const hits = r.events.slice(burst + 1).filter((e) => e.kind === "hit" && e.actor === "AL");
    expect(hits.length).toBeGreaterThan(0);
  });
});

/** A one-boss team whose boss is the main boss with `places` NEXT places (and optionally its own pattern). */
function mainBossTeam(places: number, pattern?: Pattern[], hp = 5_000_000): TeamConfig {
  const b = bossFromUnit(db.byId.get(4560)!, BOSS_ID_MIN + 50 + places);
  b.stats.hp = hp;
  b.places = places;
  if (pattern) b.pattern = pattern;
  b.special = undefined;
  const t = pad({ members: [bossMember(b)] });
  registerBosses(db, [t]);
  return t;
}

describe("Assault Rumble main boss (videos, 2026-11-24)", () => {
  it("has 1 + the additional behavior count places in the NEXT queue, and acts more but one turn at a time", () => {
    const b = new Battle(db, NYDATO_CEREBRAL, mainBossTeam(4), { seed: 1, mode: "assault", recordEvents: true });
    b.init();
    const boss = b.units.find((u) => u.side === "def")!;
    expect(b.nextColumn().filter((u) => u === boss)).toHaveLength(4);
    const r = b.run();
    const r1 = simulateBattle(db, NYDATO_CEREBRAL, mainBossTeam(1), { seed: 1, mode: "assault", recordEvents: false });
    const acts = (x: typeof r) => x.units.find((u) => u.side === "def")!.actions;
    expect(acts(r)).toBeGreaterThan(acts(r1) * 1.3);
    // never a new turn while the last one is still going: a turn starts only once the boss is back and free
    const starts = r.events.filter((e) => e.kind === "action" && e.actor === boss.uid).map((e) => e.t);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThan(1.0);
  });
  it("several of the other team can attack the main boss at once (a regular unit: one at a time)", () => {
    const b = new Battle(db, NYDATO_CEREBRAL, mainBossTeam(3), { seed: 1, mode: "assault", recordEvents: false });
    b.init();
    const bb = b as any, boss = b.units.find((u) => u.side === "def")!;
    const [a1, a2] = b.units.filter((u) => u.side === "atk" && u.where === "field");
    for (const u of [a1!, a2!]) { u.charge = 0; u.pattern = [{ action: "attack", type: "Normal" }]; }
    expect(bb.startAction(a1)).toBe(true);
    expect(bb.startAction(a2)).toBe(true);
    expect([a1!.act?.target, a2!.act?.target]).toEqual([boss, boss]);
    expect(boss.attackedBy).toBe(2);
    boss.mainBoss = false;
    const a3 = b.units.filter((u) => u.side === "atk" && u.where === "field")[2]!;
    a3.charge = 0;
    expect(bb.chooseTarget(a3)).toBeUndefined();
  });
  it("Damage over Time stops at Lv 10, for bosses and every other unit (videos; user 2026-11-24)", () => {
    const b = new Battle(db, NYDATO_CEREBRAL, mainBossTeam(1), { seed: 1, mode: "assault", recordEvents: false });
    b.init();
    const boss = b.units.find((u) => u.side === "def")!, mine = b.units.find((u) => u.side === "atk")!;
    for (const u of [boss, mine]) for (let i = 0; i < 4; i++) u.statuses.push({ name: "Damage Over Time", end: Infinity, level: 3 });
    expect(b.dotLevel(boss)).toBe(10);
    expect(b.dotLevel(mine)).toBe(10);
  });
  it("a range attack walks up like an attack, hits every enemy in range with no Damage over Time / Paralysis check, walks back", () => {
    const b = new Battle(db, NYDATO_CEREBRAL, mainBossTeam(1, [{ action: "attack", type: "Power", range: "Medium" }]), { seed: 1, mode: "assault", recordEvents: true });
    b.init();
    const bb = b as any, boss = b.units.find((u) => u.side === "def")!;
    const mine = b.units.filter((u) => u.side === "atk" && u.where === "field");
    const put = (u: (typeof mine)[number], x: number, y: number) => { u.pos = { x, y }; u.to = { x, y }; u.home = { x, y }; };
    // the closest one on a tile a few tiles off; the rest far away (one is moved next to where the boss stops)
    put(mine[0]!, GRID_ORIGIN.x, GRID_ORIGIN.y);
    for (const u of mine.slice(1)) put(u, -1400, u.pos.y);
    boss.statuses.push({ name: "Damage Over Time", end: Infinity, level: 3 }, { name: "Paralysis", end: Infinity, level: 1 });
    boss.charge = 0;
    const at = { ...boss.pos }, hp = boss.hp;
    expect(bb.startAction(boss)).toBe(true);
    const act = boss.act!;
    expect(act.range).toBeGreaterThan(0);
    expect(act.target).toBe(mine[0]);
    expect(act.dotAt).toBeUndefined();
    expect(act.arrive).toBeGreaterThan(bb.t); // walks up
    put(mine[1]!, act.tile.x - TILE, act.tile.y + 40);
    bb.t = act.hitAt + 1e-6;
    bb.advanceActions();
    expect(boss.pos).not.toEqual(at);
    expect(boss.hp).toBe(hp); // no tick
    const hit = new Set(bb.events.filter((e: { kind: string }) => e.kind === "hit" || e.kind === "miss").map((e: { target: string }) => e.target));
    expect(hit).toEqual(new Set([mine[0]!.uid, mine[1]!.uid]));
    bb.t = act.leaveAt + 1e-6;
    bb.advanceActions();
    expect(boss.phase).toBe("back");
    expect(mine[0]!.attackedBy).toBe(0);
  });
});
