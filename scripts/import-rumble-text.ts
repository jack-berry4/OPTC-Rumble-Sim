/**
 * Copies the OPTC-DB website's own Rumble text (2Shankz/optc-db.github.io common/data/rumble.js: festAbility,
 * festSpecial, festResistance, festSuperSpecial, festAttackPattern, festAttackTarget) into
 * src/data/generated/rumble-text.json, word for word, per ability / special level and for LLB.
 *
 *   npx tsx scripts/import-rumble-text.ts            (downloads rumble.js)
 *   npx tsx scripts/import-rumble-text.ts <file>     (uses a local copy)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const URL_ = "https://raw.githubusercontent.com/2Shankz/optc-db.github.io/master/common/data/rumble.js";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "generated", "rumble-text.json");

/** One unit's text, as the site shows it. Arrays are indexed by level - 1; `l*` fields are the LLB versions. */
export interface UnitText {
  /** Ability lines per ability level. */
  a?: string[][];
  la?: string[][];
  /** Special lines per special level. */
  s?: string[][];
  ls?: string[][];
  /** Resistance lines. */
  r?: string[];
  lr?: string[];
  /** Super special: unlock condition and lines. */
  ss?: { condition: string; lines: string[] };
  lss?: { condition: string; lines: string[] };
  /** Attack pattern and target, HTML stripped. */
  p?: string[];
  t?: string;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").trim();
const strs = (x: unknown): string[] | undefined => (Array.isArray(x) ? x.map((v) => strip(String(v))) : undefined);
const levels = (x: unknown): string[][] | undefined => (Array.isArray(x) ? x.map((l) => strs(l) ?? []) : undefined);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const sup = (x: Any) => (x ? { condition: strip(String(x.condition ?? "")), lines: strs(x.description) ?? [] } : undefined);

function convert(u: Any): UnitText {
  const o: UnitText = {
    a: levels(u.festAbility?.base), la: levels(u.festAbility?.llbbase),
    s: levels(u.festSpecial?.base?.descriptions), ls: levels(u.festSpecial?.llbbase?.descriptions),
    r: strs(u.festResistance?.base), lr: strs(u.festResistance?.llbbase),
    ss: sup(u.festSuperSpecial?.base), lss: sup(u.festSuperSpecial?.llbbase),
    p: strs(u.festAttackPattern), t: u.festAttackTarget ? strip(String(u.festAttackTarget)) : undefined,
  };
  for (const k of Object.keys(o) as (keyof UnitText)[]) if (o[k] === undefined) delete o[k];
  return o;
}

async function main() {
  const src = process.argv[2] ? readFileSync(process.argv[2], "utf8") : await (await fetch(URL_)).text();
  const ctx: { window: { rumble?: Record<string, Any> } } = { window: {} };
  vm.runInNewContext(src, ctx);
  const rumble = ctx.window.rumble ?? {};
  const out: Record<string, UnitText> = {};
  for (const [id, u] of Object.entries(rumble)) {
    if (u.character1 || u.character2) {
      // VS units: one entry per side, stored as <id>.1 / <id>.2 like the unit database
      if (u.character1) out[`${id}.1`] = convert(u.character1);
      if (u.character2) out[`${id}.2`] = convert(u.character2);
    }
    out[id] = convert(u);
  }
  writeFileSync(OUT, JSON.stringify({ source: URL_, importedAt: new Date().toISOString(), units: out }));
  console.log(`${Object.keys(out).length} units -> ${OUT}`);
}

main();
