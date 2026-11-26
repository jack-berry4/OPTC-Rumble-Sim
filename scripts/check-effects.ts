/**
 * Cross-check: the simulator's reading of every Rumble effect (src/sim/spec.ts) against the OPTC-DB site's own text
 * (src/data/generated/rumble-text.json), for every unit, ability / special level and LLB version.
 *
 *   npx tsx scripts/check-effects.ts      -> docs/EFFECT_CHECK.md (summary) + .cache/effect-check.json (all)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Effect, ResolvedRumbleKit, UnitRecord } from "../src/data/schema";
import { loadNodeDb } from "../src/sim/nodeDb";
import { compileEffect, specText, type Source, type Spec } from "../src/sim/spec";
import { HALF_ONE_STAT, hasFamily, matchesToken } from "../src/sim/battle";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const text: Record<string, { a?: string[][]; la?: string[][]; s?: string[][]; ls?: string[][]; ss?: { lines: string[] }; lss?: { lines: string[] } }> =
  JSON.parse(readFileSync(join(ROOT, "src/data/generated/rumble-text.json"), "utf8")).units;
const db = loadNodeDb();

interface Finding { check: string; unit: number; name: string; part: string; level: number; index: number; site: string; ours: string; detail: string; shape: string }
const findings: Finding[] = [];
let pairs = 0, lineCountMismatch = 0, linesCompared = 0;

const nums = (s: string) => (s.replace(/(\d),(\d)/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const siteSide = (s: string): "enemies" | "allies" | "self" | undefined => {
  if (/switches self/.test(s)) return "self";
  const i = s.lastIndexOf(" to ");
  if (i < 0) return undefined; // no target phrase ("on death launches rumble special")
  const tail = s.slice(i + 4);
  if (/^self\b/.test(tail)) return "self";
  if (/\benem(y|ies)\b/.test(tail)) return "enemies";
  if (/\bcrew members?\b/.test(tail) || /\bcharacters?\b/.test(tail)) return "allies";
  return undefined;
};

function compare(rec: UnitRecord, part: string, level: number, effects: Effect[], lines: string[], source: Source) {
  pairs++;
  if (effects.length !== lines.length) {
    lineCountMismatch++;
    findings.push({ check: "line count", unit: rec.id, name: rec.name, part, level, index: -1, site: `${lines.length} lines`, ours: `${effects.length} effects`, detail: "", shape: "line count" });
    return;
  }
  effects.forEach((e0, i) => {
    const e = e0 as Effect & Record<string, unknown>;
    const s: Spec = compileEffect(e0, i, source);
    const site = lines[i]!;
    linesCompared++;
    const add = (check: string, detail: string) =>
      findings.push({ check, unit: rec.id, name: rec.name, part, level, index: i, site, ours: specText(s), detail, shape: `${check} | ${e.effect}:${(e.attributes ?? []).join("/")}${e.type ? `:${e.type}` : ""}` });
    // side
    const ss = siteSide(site);
    if (ss && ss !== s.who.side && !(ss === "allies" && s.who.side === "self" && /crew members?/.test(site) === false)) add("side", `site: ${ss}, ours: ${s.who.side}`);
    // numbers
    const have = new Set(nums(site));
    const tg = (e.targeting ?? {}) as Record<string, unknown>;
    const c = e.condition as Record<string, unknown> | undefined;
    const want: [string, unknown][] = [
      ["level", e.level], ["amount", e.type === "random" ? undefined : e.amount], ["duration", e.duration], ["chance", e.chance],
      ["target count", tg.count], ["repeat", e.repeat], ["interval", e.interval],
      ["condition count", c?.type === "multi" || c?.type === "character" || c?.type === "debuff" ? undefined : c?.count],
      ["threshold", tg.percentage ?? (tg.priority === "above" || tg.priority === "below" ? tg.amount : undefined)],
    ];
    for (const [k, v] of want) if (typeof v === "number" && !have.has(Math.abs(v))) add(`number: ${k}`, `ours ${v}, site numbers ${[...have].join(" ") || "none"}`);
    // upon appearance
    const app = /upon appearance/i.test(site);
    if (app !== !!e.onArrival && source === "ability") add("appearance", `site ${app ? "says" : "doesn't say"} "upon appearance", data onArrival ${!!e.onArrival}`);
    // status filter
    if (tg.status && !([] as unknown[]).concat(tg.status).every((st) => site.includes(String(st)))) add("status filter", `ours: only units with ${String(tg.status)}`);
    if (!tg.status && / enemies with (Paralysis|Special Bind|Action Bind|Ability Bind|RCV Bind|Confusion|Provoke|Damage Over Time|Half|Shield)/.test(site)) add("status filter", "site names a status filter we don't have");
    // charge boost vs delay
    if (s.what.op === "charge delay" && !/Delay|Removes/i.test(site)) add("charge", "ours: delay (removes charge); site doesn't say Delay");
    if (s.what.op === "charge" && /Delay/.test(site)) add("charge", "ours: boost (adds charge); site says Delay");
    checkGroups(rec, e, site, add);
  });
}

// ---- tags, colors, classes, styles (docs/TAGS.md)
const CLASSES = ["Fighter", "Slasher", "Shooter", "Striker", "Driven", "Free Spirit", "Cerebral", "Powerhouse"];
const STYLES = ["ATK", "DEF", "SPT", "DBF", "RCV", "BAL"].map((s) => `${s}-Style`);
/** The names in a phrase: "[X]" (colors and tags), classes and styles. Brackets dropped. */
function namesIn(phrase: string): Set<string> {
  const out = new Set<string>();
  // a missing "]" (site and data both have "[Ancient Zoan-type crew members") ends at the side word
  for (const m of phrase.matchAll(/\[([^\],]+?)(?:\]|(?= crew| enem| character)|$)/g)) out.add(m[1]!.trim());
  const bare = phrase.replace(/\[[^\],]*\]?/g, " ");
  for (const c of [...CLASSES, ...STYLES]) if (new RegExp(`\\b${c}\\b`).test(bare)) out.add(c);
  return out;
}
const allRecs = [...db.byId.values()];
const matchCount = new Map<string, number>();
/** How many units in the database a token matches (as the simulator reads it). */
function unitsMatching(tok: string): number {
  let n = matchCount.get(tok);
  if (n === undefined) { n = allRecs.filter((r) => matchesToken({ rec: r } as never, tok)).length; matchCount.set(tok, n); }
  return n;
}
const SIDE = new Set(["self", "crew", "enemies", ""]);
/** Characters named in a kit (Shanks 4011's crew list) that have no unit in the game yet: nothing to match. */
const NO_UNIT_YET = new Set(["Building Snake", "Howling Gabu"]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function condTargets(c: any): string[] { return !c ? [] : c.type === "multi" ? (c.conditions ?? []).flatMap(condTargets) : c.type === "crew" || c.type === "enemies" ? (c.targets ?? []).map(String) : []; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function condsOf(c: any): any[] { return !c ? [] : c.type === "multi" ? (c.conditions ?? []).flatMap(condsOf) : [c]; }

function checkGroups(rec: UnitRecord, e: Effect & Record<string, unknown>, site: string, add: (check: string, detail: string) => void) {
  const tg = (e.targeting ?? {}) as { targets?: string[]; excludes?: string[]; families?: string[] };
  const toks = [...(tg.targets ?? []), ...(tg.excludes ?? [])].map(String).filter((x) => !SIDE.has(x.trim()));
  const conds = condTargets(e.condition).filter((x) => !SIDE.has(x.trim()));
  // 1. every group the data names matches at least one unit in the database (else the effect can never land)
  for (const t of [...toks, ...conds]) if (!unitsMatching(t)) add("group matches nobody", `"${t}" matches no unit in the database`);
  const famNames = [...(tg.families ?? []), ...condsOf(e.condition).filter((c) => c.type === "character").flatMap((c) => c.families ?? [])].map(String).filter((f) => !f.startsWith("["));
  for (const f of famNames) if (!NO_UNIT_YET.has(f) && !allRecs.some((r) => hasFamily(r, [f]))) add("character matches nobody", `"${f}" is no unit's family or name`);
  // 2. every name in the data's target groups is in the site line, and every name in the site's target phrase is in
  //    the data (families included)
  const i = site.lastIndexOf(" to ");
  const cut = site.search(/, (?=[a-z0-9])/); // the condition ends at the first comma not inside a list of names
  const condPart = /^(When|If|While|During|After|For|The first|With)\b/.test(site) && cut > 0 ? site.slice(0, cut) : "";
  const tail = i >= 0 ? site.slice(i + 4) : "";
  const ours = new Set<string>();
  for (const t of toks) for (const n of namesIn(t)) ours.add(n);
  for (const f of tg.families ?? []) ours.add(String(f).replace(/^\[|\]$/g, ""));
  for (const n of ours) if (!site.includes(n)) add("group not in site text", `ours names ${n}`);
  for (const n of namesIn(tail)) if (!ours.has(n)) add("site group we don't have", `site names ${n} in "${tail.slice(0, 80)}"`);
  // 3. condition groups: the same both ways, against the condition part of the line
  if (condPart) {
    const oursC = new Set<string>();
    for (const t of conds) for (const n of namesIn(t)) oursC.add(n);
    for (const n of oursC) if (!condPart.includes(n)) add("condition group not in site text", `ours names ${n}`);
    if (/crew members|enem/.test(condPart) && /\bor more\b|\bor less\b|exactly/i.test(condPart)) for (const n of namesIn(condPart)) if (!oursC.has(n)) add("condition group we don't have", `site names ${n} in "${condPart}"`);
  }
  // 4. which units a crew count counts: "remaining" (not KO'd, bench included) vs the team as built (composition)
  for (const c of condsOf(e.condition)) {
    if (c.type !== "crew" && c.type !== "enemies") continue;
    if (String(c.comparator).toLowerCase() === "remaining" || c.relative) continue;
    const says = /remaining/.test(condPart || site);
    if (!!c.composition === says) add("crew count pool", `data composition ${!!c.composition}, site ${says ? "says" : "doesn't say"} "remaining"`);
  }
  // 5. a named character on the crew vs on the enemy team
  for (const c of condsOf(e.condition)) {
    if (c.type !== "character") continue;
    const enemy = String(c.team ?? "").toLowerCase().startsWith("enem");
    if (enemy !== /enemy team/.test(site)) add("character condition side", `data team ${c.team}, site: ${site.slice(0, 60)}`);
  }
}

function kitPairs(rec: UnitRecord, kit: ResolvedRumbleKit, t: (typeof text)[string], llb: boolean) {
  const ab = llb ? t.la : t.a;
  const sp = llb ? t.ls : t.s;
  if (ab) kit.abilities.forEach((effs, i) => ab[i] && compare(rec, llb ? "LLB ability" : "ability", i + 1, effs, ab[i]!, "ability"));
  if (sp) kit.specials.forEach((spc, i) => sp[i] && compare(rec, llb ? "LLB special" : "special", i + 1, spc.effects, sp[i]!, "special"));
  const sup = llb ? t.lss : t.ss;
  if (sup && kit.superSpecial) compare(rec, llb ? "LLB super special" : "super special", 1, kit.superSpecial.effects, sup.lines, "superSpecial");
}

for (const rec of db.byId.values()) {
  const t = text[String(rec.id)];
  if (!t) continue;
  kitPairs(rec, rec.kit, t, false);
  if (rec.llbKit) kitPairs(rec, rec.llbKit, t, true);
}

// Evade "Half Stats" covers Half ATK / DEF / SPD / RCV only because the data has no Evade kind of its own for them
// (user, 2026-11-13; HALF_ONE_STAT in battle.ts). If one ever appears, Half Stats should cover only Half Stats.
for (const rec of db.byId.values()) for (const kit of [rec.kit, rec.llbKit]) {
  if (!kit) continue;
  const all = [...kit.abilities.flat(), ...kit.specials.flatMap((s) => s.effects), ...(kit.superSpecial?.effects ?? []), ...(kit.gpAbilities ?? []).flat(), ...(kit.gpSpecials ?? []).flatMap((s) => s.effects)];
  for (const e of all) {
    const own = (e.attributes ?? []).map(String).filter((a) => e.effect === "evade" && HALF_ONE_STAT.includes(a));
    if (own.length) findings.push({ check: "Evade kind for one halved stat", unit: rec.id, name: rec.name, part: "any", level: 0, index: -1, site: "", ours: `evade ${own.join("/")}`, detail: "the data now has its own Evade kind for a single halved stat: make Evade Half Stats cover only Half Stats (evadeCovers in battle.ts)", shape: "evade Half <stat>" });
  }
}

// ---- report
const byCheck = new Map<string, Finding[]>();
for (const f of findings) (byCheck.get(f.check) ?? byCheck.set(f.check, []).get(f.check)!).push(f);
const byShape = new Map<string, Finding[]>();
for (const f of findings) (byShape.get(f.shape) ?? byShape.set(f.shape, []).get(f.shape)!).push(f);
const units = (fs: Finding[]) => new Set(fs.map((f) => f.unit)).size;

let md = `# Effect check: the simulator's reading vs the OPTC-DB site's text\n\nGenerated by \`scripts/check-effects.ts\` (${new Date().toISOString().slice(0, 10)}). `;
md += `${pairs.toLocaleString()} kit parts compared (every ability and special level, base and LLB), ${linesCompared.toLocaleString()} effect lines; `;
md += `${lineCountMismatch} parts where the site lists a different number of lines than the data has effects. All findings: \`.cache/effect-check.json\`.\n\n`;
md += `| Check | Findings | Units |\n|---|---|---|\n`;
for (const [k, fs] of [...byCheck].sort((a, b) => b[1].length - a[1].length)) md += `| ${k} | ${fs.length.toLocaleString()} | ${units(fs)} |\n`;
md += `\n## By kind of effect (most frequent first), with one example each\n\n`;
for (const [k, fs] of [...byShape].sort((a, b) => units(b[1]) - units(a[1])).slice(0, 60)) {
  const f = fs[0]!;
  md += `### ${k}: ${fs.length} lines, ${units(fs)} units\n- ${f.name} (${f.unit}), ${f.part} lv ${f.level}, effect ${f.index + 1}\n- Site: ${f.site}\n- Ours: ${f.ours}\n- ${f.detail}\n\n`;
}
writeFileSync(join(ROOT, "docs/EFFECT_CHECK.md"), md);
mkdirSync(join(ROOT, ".cache"), { recursive: true });
writeFileSync(join(ROOT, ".cache/effect-check.json"), JSON.stringify(findings, null, 1));
console.log(`${pairs} parts, ${linesCompared} lines, ${findings.length} findings`);
for (const [k, fs] of [...byCheck].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k}: ${fs.length} (${units(fs)} units)`);
