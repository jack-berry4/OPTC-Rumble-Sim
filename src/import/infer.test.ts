import { describe, expect, it } from "vitest";
import { loadNodeDb } from "../sim/nodeDb";
import { DEFAULT_PRESETS, displayedStats, rumbleStats, statUp } from "../engine/stats";
import { inferBuild, splitCc } from "./infer";

const db = loadNodeDb();
const MAX = DEFAULT_PRESETS.find((p) => p.label === "MAX")!;
const fact = (r: ReturnType<typeof inferBuild>, what: string) => r.facts.find((f) => f.what === what);

// Readings from the user's screenshots of 2026-11-23 (Samples/2026-11-23, docs/IMPORT_PLAN.md)
describe("build from screenshot readings", () => {
  it("general status: Limit Break and cotton candy from the main stats (Jinbe 4202, 18.webp)", () => {
    const r = inferBuild(db.byId.get(4202)!, { level: "max", maxLevel: 150, main: { hp: 8520, atk: 3407, rcv: 659 }, mainSpecialLevel: "max", potentialLevels: [5, 5, 5], sockets: 25 }, MAX);
    expect(r.misfit).toBeUndefined();
    expect(r.member.cc).toEqual({ hp: 190, atk: 194, rcv: 190 });
    expect(displayedStats(db.byId.get(4202)!, r.member)).toEqual({ hp: 8520, atk: 3407, rcv: 659 });
    // ... and its Rumble stats then match the Rumble status page (20.webp): 13,632 / 4,430 / 725
    const s = rumbleStats(db.byId.get(4202)!, { ...r.member, rumbleKey: false });
    expect([statUp(s.hp), statUp(s.atk), statUp(s.rcv)]).toEqual([13632, 4430, 725]);
  });
  it("Rumble status: the key from DEF / SPD, LLB from the max level (Nami & Usopp 4439, 33.webp)", () => {
    const r = inferBuild(db.byId.get(4439)!, { level: 99, maxLevel: 130, specialLevel: 5, abilityLevel: "max", rumble: { hp: 7368, atk: 2472, rcv: 535, def: 185, spd: 186 } }, MAX);
    expect(r.misfit).toBeUndefined();
    expect(r.member.llbLevel).toBe(4);
    expect(r.member.rumbleKey).toBe(false);
    expect(fact(r, "Rumble key")?.how).toBe("worked");
    expect(r.member.specialLevel).toBe(5);
  });
  it("team edit: the cotton candy total settles the split (Prince Grus 4528, 29.webp)", () => {
    const r = inferBuild(db.byId.get(4528)!, { level: 110, ccTotal: 574, key: "none", rumble: { hp: 9736, atk: 3210, rcv: 651 } }, MAX);
    expect(r.misfit).toBeUndefined();
    expect(r.member.cc).toEqual({ hp: 190, atk: 194, rcv: 190 });
  });
  it("a yellow Lv.MAX is the level cap before LLB (St. Peter & St. Warcury 4577: only 99 fits)", () => {
    const seen = { level: "max" as const, ccTotal: 574, key: "none" as const, rumble: { hp: 9931, atk: 3677, rcv: 671 } };
    expect(inferBuild(db.byId.get(4577)!, { ...seen, maxKind: "base" }, MAX).member.level).toBe(99);
    expect(inferBuild(db.byId.get(4577)!, { ...seen, maxKind: "base" }, MAX).misfit).toBeUndefined();
  });
  it("a gold level is below the max: the least LLB that keeps it there (box 2026-11-24)", () => {
    const rec = db.byId.get(4202)!; // Jinbe: max level 99
    expect(inferBuild(rec, { level: 110, belowMax: true }, MAX).member.llbLevel).toBe(3); // max 120
    expect(inferBuild(rec, { level: 99, belowMax: true }, MAX).member.llbLevel).toBe(1); // max 105
    expect(inferBuild(rec, { level: 110, maxLevel: 110 }, MAX).member.llbLevel).toBe(2); // red: at the max
  });
  it("a key icon on a unit below the key's level reads as no key", () => {
    const rec = db.byId.get(4202)!;
    const low = inferBuild(rec, { level: 7, key: "on" }, MAX);
    expect(low.member.rumbleKey).toBe(false);
    expect(fact(low, "Rumble key")?.value).toBe("no (not possible yet)");
    expect(inferBuild(rec, { level: 130, maxLevel: 130, key: "on" }, MAX).member.rumbleKey).toBe(true);
  });
  it("a level not read is found from the stats (Luffy & Zoro 4631 at 105)", () => {
    const r = inferBuild(db.byId.get(4631)!, { ccTotal: 574, key: "none", rumble: { hp: 9339, atk: 3263, rcv: 590 } }, MAX);
    expect(r.member.level).toBe(105);
    expect(fact(r, "Level")?.how).toBe("worked");
  }, 20_000);
  it("an OCR slip that fits no build is fixed by the reading that does (RCV 7139 for 739: Eneru 4579, 29.webp)", () => {
    const r = inferBuild(db.byId.get(4579)!, { level: 110, ccTotal: 574, key: "none", rumble: { hp: 9576, atk: 3458, rcv: 7139 } }, MAX);
    expect(r.misfit).toBeUndefined();
    expect(fact(r, "Cotton candy")?.note).toContain("RCV 7139 as 739");
  });
  it("what no screen shows comes from the default build", () => {
    const r = inferBuild(db.byId.get(4202)!, { level: 120 }, MAX);
    expect(fact(r, "Rumble special")?.how).toBe("unknown");
    expect(r.member.specialLevel).toBe(10);
    expect(fact(r, "LLB")?.value).toBe("5"); // at least 3 for level 120; the default build's 5
  });
  it("the Limit Break badge sets the nodes: white MAX = the usual max, gold MAX = all with the key (29.webp)", () => {
    const grus = inferBuild(db.byId.get(4528)!, { level: 110, ccTotal: 574, key: "none", lb: "max", socketsFilled: 5, rumble: { hp: 9736, atk: 3210, rcv: 651 } }, MAX);
    expect(grus.misfit).toBeUndefined();
    expect(grus.member.lbNodes).toBe(30);
    expect(grus.member.lbKey).toBe(false);
    const imu = inferBuild(db.byId.get(4571)!, { level: 120, ccTotal: 574, key: "on", lb: "keyMax", socketsFilled: 5, rumble: { hp: 19020, atk: 6294, rcv: 857 } }, MAX);
    expect(imu.misfit).toBeUndefined();
    expect(imu.member.lbNodes).toBe(40);
    expect(imu.member.lbKey).toBe(true);
  });
  it("Limit Break badge rules (user, 2026-11-24): none below 99, a sure number pins it, gold only with the key", () => {
    const lbUnits = db.all.filter((u) => u.lb && u.maxLevel >= 99 && u.lb.steps.length >= 30);
    const keyable = lbUnits.find((u) => u.lb!.keyAt !== null)!, plain = lbUnits.find((u) => u.lb!.keyAt === null)!;
    // below level 99 and no badge read: no Limit Break (not the default build's)
    const low = inferBuild(keyable, { level: 1 }, MAX);
    expect(low.member.lbNodes).toBe(0);
    expect(fact(low, "Limit Break")?.value).toBe("none");
    // a badge only shows from level 99: with one seen, a level read below 99 is a misreading, not "no Limit Break"
    const misread = inferBuild(keyable, { level: 1, lb: "max", rumble: undefined }, MAX);
    expect(misread.member.lbNodes).toBe(keyable.lb!.keyAt);
    expect(misread.member.level).not.toBe(1);
    // no badge in a box video while the other tiles showed theirs: no Limit Break yet
    expect(inferBuild(keyable, { level: 99, lb: "empty" }, MAX).member.lbNodes).toBe(0);
    // a white 17 (Usopp & Vegapunk in the user's box)
    const part = inferBuild(keyable, { level: 99, lb: "partial", lbNumber: 17 }, MAX);
    expect(part.member.lbNodes).toBe(17);
    expect(fact(part, "Limit Break")?.how).toBe("read");
    // a unit that can't take the Limit Break key never shows gold: a gold MAX there is its (only) max
    const all = plain.lb!.steps.length;
    expect(inferBuild(plain, { level: 99, lb: "keyMax" }, MAX).member.lbNodes).toBe(all);
    expect(inferBuild(plain, { level: 99, lb: "keyPartial", lbNumber: 12 }, MAX).member.lbNodes).toBe(12);
  });
  it("the filled-socket circle caps the socket levels (Whitebeard: 1 socket)", () => {
    const r = inferBuild(db.byId.get(1853)!, { level: 99, socketsFilled: 1 }, MAX);
    expect(r.member.sockets).toBe(5);
    expect(fact(r, "Sockets with levels")?.how).toBe("read");
  });
  it("a red main special MAX means the Limit Break key is used", () => {
    const r = inferBuild(db.byId.get(4202)!, { level: "max", maxLevel: 150, lbKeyUsed: true }, MAX);
    expect(r.member.lbNodes!).toBeGreaterThan(30);
    expect(r.member.lbKey).toBe(true);
  });
  it("splits a cotton candy total evenly, extra to ATK then HP", () => {
    expect(splitCc(574)).toEqual({ hp: 191, atk: 192, rcv: 191 });
    expect(splitCc(600)).toEqual({ hp: 200, atk: 200, rcv: 200 });
    expect(splitCc(1)).toEqual({ hp: 0, atk: 1, rcv: 0 });
  });
});
