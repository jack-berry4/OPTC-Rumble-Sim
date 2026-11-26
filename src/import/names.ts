/**
 * The Rumble status page shows no portrait: its unit is found by the subtitle and name read off the page (and its
 * cost when read), compared with OPTC-DB's "Name - Subtitle".
 */
import type { UnitRecord } from "../data/schema";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9& ]/g, "").replace(/\s+/g, " ").trim();
function grams(s: string): Map<string, number> {
  const t = ` ${norm(s)} `;
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); }
  return m;
}
/** Dice similarity of letter pairs (0-1): forgiving of a few misread letters. */
export function similarity(a: string, b: string): number {
  const A = grams(a), B = grams(b);
  let both = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [g, v] of A) both += Math.min(v, B.get(g) ?? 0);
  return na + nb ? (2 * both) / (na + nb) : 0;
}

/** Units whose name and subtitle best fit what was read, best first. */
export function matchByName(all: UnitRecord[], read: { name?: string; subtitle?: string; cost?: number }, n = 8): { id: number; score: number }[] {
  if (!read.name && !read.subtitle) return [];
  const out: { id: number; score: number }[] = [];
  for (const r of all) {
    const [nm, ...rest] = r.name.split(" - ");
    const sub = rest.join(" - ");
    let s = read.name ? similarity(read.name, nm ?? "") : 0;
    if (read.subtitle) s = read.name ? (s + similarity(read.subtitle, sub || r.name)) / 2 : similarity(read.subtitle, sub);
    if (read.cost != null && r.cost !== read.cost) s *= 0.85;
    if (r.kit && !r.kit.specials.length && !r.kit.abilities.length) s *= 0.97; // most screens are of Rumble units
    out.push({ id: r.id, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
