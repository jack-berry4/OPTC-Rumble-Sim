/**
 * Differences between two builds of data/units.json: new units, removed units and per-unit field changes.
 *
 *   npx tsx scripts/db/diff.ts <old units.json> <new units.json> [out.md]
 *
 * The build runs this against the previous build automatically (data/reports/update-*.md).
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { DbUnit } from "./build";
import { isMain } from "./config";

/** Stable JSON: object keys sorted, undefined dropped. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  ) ?? "undefined";
}

/** Field paths compared one by one (sub-objects split one level: rumble.special, game.key ...). */
function fields(u: DbUnit): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(u)) {
    if ((k === "rumble" || k === "game" || k === "known") && v && typeof v === "object") {
      for (const [k2, v2] of Object.entries(v)) if (k2 !== "id") out.set(`${k}.${k2}`, v2);
    } else out.set(k, v);
  }
  return out;
}

export interface UnitDiff {
  added: DbUnit[];
  removed: DbUnit[];
  changed: { id: number; name: string; fields: { path: string; old: string; new: string }[] }[];
  /** path -> number of units with that field changed. */
  byField: Map<string, number>;
}

export function diffUnits(oldUnits: DbUnit[], newUnits: DbUnit[]): UnitDiff {
  const om = new Map(oldUnits.map((u) => [u.id, u]));
  const nm = new Map(newUnits.map((u) => [u.id, u]));
  const d: UnitDiff = { added: [], removed: [], changed: [], byField: new Map() };
  for (const u of newUnits) if (!om.has(u.id)) d.added.push(u);
  for (const u of oldUnits) if (!nm.has(u.id)) d.removed.push(u);
  for (const n of newUnits) {
    const o = om.get(n.id);
    if (!o) continue;
    const of = fields(o), nf = fields(n);
    const ch: UnitDiff["changed"][number]["fields"] = [];
    for (const p of new Set([...of.keys(), ...nf.keys()])) {
      const a = stable(of.get(p)), b = stable(nf.get(p));
      if (a !== b) {
        ch.push({ path: p, old: a, new: b });
        d.byField.set(p, (d.byField.get(p) ?? 0) + 1);
      }
    }
    if (ch.length) d.changed.push({ id: n.id, name: n.name, fields: ch });
  }
  return d;
}

const short = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}... (${s.length} chars)` : s);
const cell = (s: string) => short(s).replace(/\|/g, "\\|");

export function diffMarkdown(d: UnitDiff, title: string, header: string[] = []): string {
  const L: string[] = [`# ${title}`, "", ...header, ""];
  L.push(`- New units: **${d.added.length}**`, `- Removed units: **${d.removed.length}**`, `- Changed units: **${d.changed.length}**`, "");
  if (d.byField.size) {
    L.push("## Changed fields (units)", "", "| Field | Units |", "|---|---|");
    for (const [p, n] of [...d.byField].sort((a, b) => b[1] - a[1])) L.push(`| ${p} | ${n} |`);
    L.push("");
  }
  if (d.added.length) {
    L.push("## New units", "");
    for (const u of d.added) L.push(`- ${u.id} ${u.name}${u.game ? ` (game serverId ${u.game.serverId})` : " (not in the game data)"}`);
    L.push("");
  }
  if (d.removed.length) {
    L.push("## Removed units", "");
    for (const u of d.removed) L.push(`- ${u.id} ${u.name}`);
    L.push("");
  }
  if (d.changed.length) {
    L.push("## Changes per unit", "");
    for (const c of d.changed) {
      L.push(`### ${c.id} ${c.name}`, "", "| Field | Old | New |", "|---|---|---|");
      for (const f of c.fields) L.push(`| ${f.path} | ${cell(f.old)} | ${cell(f.new)} |`);
      L.push("");
    }
  }
  return L.join("\n") + "\n";
}

if (isMain(import.meta.url)) {
  const [a, b, out] = process.argv.slice(2);
  if (!a || !b) throw new Error("usage: tsx scripts/db/diff.ts <old units.json> <new units.json> [out.md]");
  const load = (p: string) => (JSON.parse(readFileSync(p, "utf8")) as { units: DbUnit[] }).units;
  const md = diffMarkdown(diffUnits(load(a), load(b)), `Unit database diff`, [`Old: ${a}`, `New: ${b}`]);
  if (out) writeFileSync(out, md);
  else process.stdout.write(md);
}
