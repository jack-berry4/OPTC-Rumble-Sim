/**
 * Which items the simulator can't judge yet (docs/META_PLAN.md, "Checks"): an item whose kit has effects or
 * conditions the simulator skips (`SimResult.unsupported`) would score too low, so it must never be dropped.
 *
 * The simulator says what it skipped, not whose effect it was, so each item is put in a fixed team whose units skip
 * nothing, against a fixed team that skips nothing, and plays a few battles as attacker and as defender: whatever is
 * skipped then is the item's.
 */
import { simulateMany } from "../../src/sim/simulate";
import { clashReason } from "../../src/engine/team";
import type { TeamConfig } from "../../src/engine/types";
import { hash, randomTeam, rng, teamOf, type Db, type Item } from "./common";

const skipped = (db: Db, a: TeamConfig, b: TeamConfig, n: number, seed: number) => {
  const keys = new Set<string>();
  for (const [x, y] of [[a, b], [b, a]] as const) for (const k of Object.keys(simulateMany(db, x, y, n, 0, [], seed).unsupported)) keys.add(k);
  return keys;
};

/** Item key -> the effects / conditions the simulator skipped for it (only items with any). */
export function unsupportedItems(db: Db, items: Item[], battles = 3, log: (s: string) => void = () => {}, check: Item[] = items): Record<string, string[]> {
  // a filler team and an opponent that skip nothing between them (random 6★ MAX teams until a clean pair turns up)
  const strong = items.filter((it) => it.build.includes("MAX") && ["6", "6+"].includes(String(db.byId.get(it.unitId)?.stars)));
  const r = rng(hash("unsupported"));
  let filler: Item[] | undefined, opp: Item[] | undefined;
  for (let i = 0; i < 200 && !filler; i++) {
    const a = randomTeam(db, strong, r), b = randomTeam(db, strong, r);
    if (a.length >= 5 && b.length >= 5 && skipped(db, teamOf(a), teamOf(b), 10, 1).size === 0) { filler = a; opp = b; }
  }
  if (!filler || !opp) { log("WARNING unsupported check: no clean filler / opponent teams found; check skipped"); return {}; }
  log(`unsupported check: filler ${filler.map((i) => i.key).join(" ")}; opponent ${opp.map((i) => i.key).join(" ")}`);
  const oppTeam = teamOf(opp);
  const out: Record<string, string[]> = {};
  check.forEach((it, n) => {
    // the item in place 1, then the fillers that can be on a team with it
    const team = teamOf([it, ...filler!.filter((f) => f.unitId !== it.unitId && !clashReason(db, f.m, it.m))].slice(0, 8));
    const keys = skipped(db, team, oppTeam, battles, 1 + (n % 7));
    if (keys.size) out[it.key] = [...keys].sort();
    if (n % 1000 === 999) log(`unsupported check: ${n + 1} of ${check.length}, ${Object.keys(out).length} with skipped effects`);
  });
  return out;
}
