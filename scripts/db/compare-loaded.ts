/**
 * Proves what the simulator sees: loads two unit files through the app's loader (buildUnitDb) and compares every
 * UnitRecord, leaving out the database additions (`game`, `known`). Works with the old src/data/generated
 * optcdb-units.json format too, e.g. to compare with the last committed version:
 *
 *   git show HEAD:data/units.json > .cache/old-units.json
 *   npx tsx scripts/db/compare-loaded.ts .cache/old-units.json data/units.json
 *
 * Exit code 0 = identical, 2 = differences (listed).
 */
import { readFileSync } from "node:fs";
import { buildUnitDb } from "../../src/data/buildDb";
import type { UnitRecord } from "../../src/data/schema";
import { stable } from "./diff";

const [a, b] = process.argv.slice(2);
if (!a || !b) throw new Error("usage: tsx scripts/db/compare-loaded.ts <old units file> <new units file>");
const load = (p: string) => buildUnitDb((JSON.parse(readFileSync(p, "utf8")) as { units: never[] }).units, []).all;
const strip = ({ game: _g, known: _k, ...rest }: UnitRecord) => rest;
const A = new Map(load(a).map((r) => [r.id, r]));
const B = new Map(load(b).map((r) => [r.id, r]));
let diff = 0;
const byField = new Map<string, number>();
for (const id of new Set([...A.keys(), ...B.keys()])) {
  const x = A.get(id), y = B.get(id);
  if (!x || !y) { diff++; console.log(`${id}: only in ${x ? a : b}`); continue; }
  const sx = strip(x) as Record<string, unknown>, sy = strip(y) as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(sx), ...Object.keys(sy)])].filter((k) => stable(sx[k]) !== stable(sy[k]));
  if (fields.length) {
    diff++;
    for (const f of fields) byField.set(f, (byField.get(f) ?? 0) + 1);
    if (diff <= 20) console.log(`${id} ${y.name}: ${fields.join(", ")}`);
  }
}
const added = (m: Map<number, UnitRecord>) => [...m.values()].filter((r) => r.game).length + "/" + [...m.values()].filter((r) => r.known).length;
console.log(`Records: ${A.size} vs ${B.size}; with game/known data: ${added(A)} vs ${added(B)}`);
console.log(diff ? `DIFFERENT: ${diff} units (${[...byField].map(([f, n]) => `${f} ${n}`).join(", ")})` : "Identical (leaving out game / known).");
process.exit(diff ? 2 : 0);
