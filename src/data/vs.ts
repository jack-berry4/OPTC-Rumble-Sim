/**
 * VS units (e.g. 4529 "Zoro vs Nusjuro"): the database has each half as its own unit (4529.1, 4529.2), while the box
 * shows one combined portrait (OPTC-DB's 4529.png). Owning it means owning both halves; they share their level,
 * Limit Break, cotton candy and potentials (user, 2026-11-22; premium potentials combine).
 */
import type { UnitRecord } from "./schema";

type Db = { byId: Map<number, UnitRecord> };
const round1 = (x: number) => Math.round(x * 10) / 10;

/** The units an id stands for: itself, or a combined VS id's two halves. */
export function vsHalves(db: Db, id: number): number[] {
  if (db.byId.has(id) || !Number.isInteger(id)) return db.byId.has(id) ? [id] : [];
  return [round1(id + 0.1), round1(id + 0.2)].filter((x) => db.byId.has(x));
}

/** A combined VS id (not a unit itself, but both its halves are). */
export const isVsCombined = (db: Db, id: number) => !db.byId.has(id) && vsHalves(db, id).length === 2;

/** "Roronoa Zoro / St. Ethanbaron V. Nusjuro" for a combined VS id; the unit's short name otherwise. */
export function unitLabel(db: Db, id: number): string {
  const r = db.byId.get(id);
  if (r) return r.name.split(" - ")[0]!;
  const halves = vsHalves(db, id).map((h) => db.byId.get(h)!.name.split(" - ")[0]);
  return halves.length ? `${halves.join(" / ")} (VS)` : `#${id}`;
}
