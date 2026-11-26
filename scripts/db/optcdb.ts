/**
 * 2Shankz OPTC-DB fork: download a snapshot (pinned to a commit) and turn it into the per-unit records the app uses.
 * The record shape and every rule here are the old scripts/import-data.ts, unchanged.
 *
 * Files (common/data/):
 *   rumble.json  - Rumble style, DEF, SPD, abilities, specials, GP, patterns, targeting, cost
 *   units.js     - name, color, classes, max HP / ATK / RCV
 *   families.js  - character families (used by some ability conditions)
 *   evolutions.js - which unit a unit evolves into (to hide 5★ forms that have a 6★ form in the unit search)
 *   aliases.js   - other names a unit is searched by (e.g. Aokiji for Kuzan); the English ones are kept
 *   tags.js      - crew / race / arc tags (e.g. "Straw Hat Pirates", used by crew-targeted effects)
 *   details.js   - Limit Break nodes (base HP/ATK/RCV boosts); which LLB level gives each Rumble upgrade
 *   flags.js     - where a unit comes from (rare recruit, legend, anniversary, Rumble, shop...): Rumble key tier
 *   cooldowns.js - main-game special cooldown [max, min]: number of special levels (for the Rumble stat bonus)
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import type { RawRumbleUnit } from "../../src/data/schema";
import { CACHE, OPTCDB_BRANCH, OPTCDB_FILES, OPTCDB_REPO, optcdbRawUrl } from "./config";

export interface CommitInfo { sha: string; date: string; message: string }

/** The newest commit on the fork's branch (GitHub API, one small request). */
export async function latestCommit(ref: string = OPTCDB_BRANCH): Promise<CommitInfo> {
  const res = await fetch(`https://api.github.com/repos/${OPTCDB_REPO}/commits/${ref}`, {
    headers: {
      Accept: "application/vnd.github+json", "User-Agent": "rumble-sim-db",
      // in GitHub Actions: the job's token (shared runners hit the 60-an-hour anonymous limit)
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${OPTCDB_REPO}@${ref}`);
  const c = (await res.json()) as { sha: string; commit: { committer: { date: string }; message: string } };
  return { sha: c.sha, date: c.commit.committer.date, message: c.commit.message.split("\n")[0]! };
}

export type OptcdbFiles = Record<(typeof OPTCDB_FILES)[number], string>;

/** Downloads the data files at a commit (cached in .cache/2shankz/<sha>/; a commit's files never change). */
export async function fetchSnapshot(sha: string): Promise<{ files: OptcdbFiles; hashes: Record<string, string> }> {
  const dir = join(CACHE, "2shankz", sha);
  mkdirSync(dir, { recursive: true });
  const files = {} as OptcdbFiles;
  const hashes: Record<string, string> = {};
  for (const name of OPTCDB_FILES) {
    const path = join(dir, name);
    let text: string;
    if (existsSync(path)) text = readFileSync(path, "utf8");
    else {
      const res = await fetch(optcdbRawUrl(sha, name));
      if (!res.ok) throw new Error(`Failed to download ${name}@${sha}: ${res.status}`);
      text = await res.text();
      writeFileSync(path, text);
    }
    files[name] = text;
    hashes[name] = createHash("sha256").update(text).digest("hex");
  }
  return { files, hashes };
}

/** units.js / families.js assign to window.*; run them in an empty sandbox to read the data. */
export function runDataScript(code: string, extraGlobals: Record<string, unknown> = {}): Record<string, unknown> {
  const window: Record<string, unknown> = {};
  vm.runInNewContext(code, { window, ...extraGlobals }, { timeout: 5000 });
  return window;
}

export interface ImportedUnit {
  id: number;
  name: string;
  color: string;
  classes: string[];
  stars: string | number;
  families: string[];
  /** VS forms: the chosen half's own families (see VS_FAMILY_SPLIT). */
  ownFamilies?: string[];
  /** Crew / race / arc tags. */
  tags: string[];
  /** Other names the unit is searched by on OPTC-DB (aliases.js, without the Japanese / French names). */
  aliases?: string[];
  /** 5★ units: the 6★ unit this one evolves into, when that one is in Rumble too (evolutions.js). */
  sixStarForm?: number;
  hp: number;
  atk: number;
  rcv: number;
  /** Level-1 stats; with maxLevel and growth these give stats at any level. */
  minStats: { hp: number; atk: number; rcv: number };
  maxLevel: number;
  growth: number | null;
  /** Limit Break nodes. */
  lb?: LimitBreakData;
  /** LLB level (1-5) that switches each part of the Rumble kit to its LLB version (details.js lLimit). */
  llbTiers?: LlbTiers;
  /** Socket slots before any Limit Break. */
  sockets: number;
  /** Main-game special levels (cooldown max - min + 1; 1 when the unit has none). */
  specialLevels: number;
  /** Rumble key tier, from where the unit is obtained (flags.js). */
  keyGroup: KeyGroup;
  /** Free to play: in flags.js with no recruit / shop / promo / special flag (Co-op, PKA, raid, story units...). */
  farmable?: boolean;
  rumble: RawRumbleUnit;
}

export interface LlbTiers { ability?: number; special?: number; resilience?: number; superSpecial?: number }

/** details.js lLimit: one entry per LLB level, flags rAbility / rSpecial / rResilience / rSuperSpecial. */
export function parseLlbTiers(lLimit: unknown): LlbTiers | undefined {
  if (!Array.isArray(lLimit)) return undefined;
  const out: LlbTiers = {};
  const keys = { rAbility: "ability", rSpecial: "special", rResilience: "resilience", rSuperSpecial: "superSpecial" } as const;
  lLimit.forEach((x, i) => {
    if (!x || typeof x !== "object") return;
    for (const [k, part] of Object.entries(keys)) if ((x as Record<string, unknown>)[k] && out[part] === undefined) out[part] = i + 1;
  });
  return Object.keys(out).length ? out : undefined;
}

export type KeyGroup = "anni" | "super" | "rumbleLegend" | "legend" | "tmKizuna" | "rumbleRR" | "rr";

export interface LimitBreakData {
  /** Cumulative [HP, ATK, RCV] boost after each node, in order. The key-lock node itself adds nothing. */
  steps: [number, number, number][];
  /** How many nodes come before the key lock (null if the unit has no key expansion). */
  keyAt: number | null;
  /** Potential abilities, in order, with the node index that unlocks each. */
  potentials: { name: string; at: number }[];
  /** Extra socket slots unlocked by Limit Break nodes (node index, slots). */
  socketNodes: { at: number; n: number }[];
}

/** Cumulative "Boosts base HP/ATK/RCV by N" totals per Limit Break node. */
function parseLimitBreak(limit: (string | { description?: string })[] | undefined): LimitBreakData | undefined {
  if (!Array.isArray(limit) || !limit.length) return undefined;
  const sum: [number, number, number] = [0, 0, 0];
  const steps: [number, number, number][] = [];
  let keyAt: number | null = null;
  const potentials: { name: string; at: number }[] = [];
  const socketNodes: { at: number; n: number }[] = [];
  limit.forEach((node, i) => {
    const text = typeof node === "string" ? node : node?.description ?? "";
    if (/LOCKED WITH KEY/i.test(text)) keyAt = i;
    const pot = /^Acquire potential \d+:\s*(.+)$/i.exec(text.trim());
    if (pot) potentials.push({ name: pot[1]!.trim(), at: i });
    const sock = /^Acquire (\d+) additional Socket (?:slot|orb)s?/i.exec(text.trim());
    if (sock) socketNodes.push({ at: i, n: Number(sock[1]) });
    const m = /^Boosts base (HP|ATK|RCV) by (\d+)$/.exec(text.trim());
    if (m) sum[["HP", "ATK", "RCV"].indexOf(m[1]!)]! += Number(m[2]);
    steps.push([...sum]);
  });
  return { steps, keyAt, potentials, socketNodes };
}

/**
 * Rumble key tier from OPTC-DB flags. Anniversary and shop (F2P) legends share a tier;
 * Rumble-banner units are legends or Rumble rare recruits depending on rarity.
 */
export function keyGroupOf(flags: Record<string, number> | undefined, stars: string | number): KeyGroup {
  const f = flags ?? {};
  const legend = parseFloat(String(stars)) >= 6;
  if (f.annilrr) return "anni";
  if (f.superlrr) return "super";
  if (f.pflrr) return legend ? "rumbleLegend" : "rumbleRR";
  if (f.tmlrr || f.kclrr) return "tmKizuna";
  if (f.shop && legend) return "anni";
  return legend ? "legend" : "rr";
}

/** Flags of units obtained from a recruit (rare recruit, limited, TM / Kizuna / PF / Super / Anniversary), the shop, a promo or special events. */
const PAID_FLAGS = ["rr", "rro", "lrr", "slrr", "tmlrr", "kclrr", "pflrr", "superlrr", "annilrr", "promo", "special", "shop", "tmshop"];

/**
 * Free to play (user, 2026-11-25: Co-op and PKA units): OPTC-DB lists the unit in flags.js but with none of the
 * recruit / shop / promo / special flags, so it is farmed (Co-op, Pirate King Adventures, raids, story...).
 */
export function farmableOf(flags: Record<string, number> | undefined): boolean {
  return !!flags && !PAID_FLAGS.some((f) => flags[f]);
}

/** Main-game special levels from a cooldowns.js entry [max, min]; units without one have a single level. */
export function specialLevelsOf(cd: unknown): number {
  if (!Array.isArray(cd) || cd.length < 2) return 1;
  const max = Number(cd[0]), min = Number(cd[1]);
  return Number.isFinite(max) && Number.isFinite(min) && max >= min ? max - min + 1 : 1;
}

/**
 * A unit's tags from tags.js. Dual and VS units store one list per character ([[...], [...]]): a VS form (rumble.json
 * id 3135.1 / 3135.2, a separate Rumble unit) gets its own character's list only (3135.1 Kaido is not [Big Mom
 * Pirates]); a dual unit (one Rumble unit, both characters) gets both lists together.
 */
export function tagsOf(entry: unknown, formNo?: string): string[] {
  const list = (entry ?? []) as unknown[];
  const perForm = list.some(Array.isArray);
  const pick = perForm && formNo && Array.isArray(list[Number(formNo) - 1]) ? (list[Number(formNo) - 1] as unknown[]) : list;
  return [...new Set(pick.flat(2).filter((x): x is string => typeof x === "string" && !!x))];
}

/**
 * VS units: how many of the parent's families.js names belong to form 1 (the rest are form 2's). families.js has one
 * list per unit, form 1's names first ("Edward Newgate", "Whitebeard", "WB", then "Shanks"), and no per-form lists, so
 * the split is written here. In Rumble you pick one half: character conditions and "to Zoro crew members" use only
 * that half's names (`ownFamilies`), while both names still count for the team's "same character twice" rule
 * (`families`; Zoro vs Lucci and Zoro vs Nusjuro can't share a team) (user, 2026-11-13).
 */
export const VS_FAMILY_SPLIT: Record<number, number> = {
  3134: 1, 3135: 1, // Kaido | Charlotte Linlin, Big Mom, BM
  3252: 1, 3253: 1, // Portgas D. Ace | Sakazuki, Akainu
  3354: 3, 3355: 3, // Edward Newgate, Whitebeard, WB | Shanks
  3787: 1, 3788: 1, // Kaido | Yamato
  3907: 3, 3908: 3, // Edward Newgate, Whitebeard, WB | Marshall D. Teach, Blackbeard, BB
  4210: 1, 4211: 1, // Monkey D. Luffy | Kaido
  4218: 3, 4219: 3, // Marshall D. Teach, Blackbeard, BB | Trafalgar D. Water Law, Trafalgar Law
  4230: 1, 4231: 1, // Shanks | Eustass Kid
  4469: 1, // Roronoa Zoro | Rob Lucci
  4529: 1, // Roronoa Zoro | Saint Ethanbaron V. Nusjuro, St. Ethanbaron V. Nusjuro
};

/**
 * aliases.js rows are [Japanese, French, ...other names]: keep the other names (trimmed, no blanks or repeats).
 * The site's search matches these too, so "aokiji" finds every Kuzan.
 */
function aliasesOf(row: string[] | null | undefined): { aliases?: string[] } {
  const names = [...new Set((row ?? []).slice(2).map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean))];
  return names.length ? { aliases: names } : {};
}

/** A VS form's own families (undefined for every other unit). Throws for a VS unit missing from VS_FAMILY_SPLIT. */
export function ownFamiliesOf(parentId: number, formNo: string | undefined, all: string[]): string[] | undefined {
  if (!formNo) return undefined;
  const k = VS_FAMILY_SPLIT[parentId];
  if (k === undefined) throw new Error(`VS unit ${parentId}: add its families split (${JSON.stringify(all)}) to VS_FAMILY_SPLIT`);
  return formNo === "1" ? all.slice(0, k) : all.slice(k);
}

/** One entry of window.units in units.js. Dual-unit forms are keyed "<id>-<form>". */
export interface DbUnitRow {
  id: string;
  name: string;
  type: string | null;
  class: string | string[] | string[][] | null;
  stars: string | number;
  cost: number;
  combo?: number;
  maxLevel: number | null;
  minHP: number; minATK: number; minRCV: number;
  sockets?: number;
  maxHP: number; maxATK: number; maxRCV: number;
  growth: number | null;
}

export interface ParsedOptcdb {
  units: ImportedUnit[];
  /** rumble.json entries with no units.js row (skipped). */
  missing: number[];
  /** All units.js rows (incl. units without Rumble data), for the game join. */
  unitRows: Record<string, DbUnitRow>;
  /** cooldowns.js (main-game special [max, min]). */
  cooldowns: Record<string, unknown>;
}

export function parseOptcdb(f: OptcdbFiles): ParsedOptcdb {
  const rumble = JSON.parse(f["rumble.json"]) as { units: RawRumbleUnit[] };
  const units = runDataScript(f["units.js"]).units as Record<string, DbUnitRow>;
  // families.js references a ghost-ID offset defined elsewhere in the site; ghost units aren't in Rumble.
  const families = runDataScript(f["families.js"], { calcGhostStartIDStart: 1e7 }).families as Record<string, string[] | null>;
  const tags = runDataScript(f["tags.js"]).tags as Record<string, string[] | null>;
  const details = runDataScript(f["details.js"]).details as Record<string, { limit?: (string | { description?: string })[]; lLimit?: unknown }>;
  const flags = runDataScript(f["flags.js"]).flags as Record<string, Record<string, number>>;
  const cooldowns = runDataScript(f["cooldowns.js"]).cooldowns as Record<string, unknown>;
  const aliases = runDataScript(f["aliases.js"]).aliases as Record<string, string[] | null>;
  const evolutions = runDataScript(f["evolutions.js"]).evolutions as Record<string, { evolution?: number | number[] } | undefined>;

  const out: ImportedUnit[] = [];
  const missing: number[] = [];
  for (const r of rumble.units) {
    // Dual / VS units list each form in rumble.json as e.g. 3134.1 / 3134.2;
    // units.js keys those forms "3134-1" / "3134-2". Fall back to the parent row.
    const parentId = Math.floor(r.id);
    const formNo = Number.isInteger(r.id) ? undefined : String(r.id).split(".")[1];
    const parent = units[String(parentId)];
    const row = (formNo && units[`${parentId}-${formNo}`]) || parent;
    if (!row || !parent) {
      missing.push(r.id);
      continue;
    }
    // Dual units (e.g. 1983 Smoker & Tashigi) have no color on the parent row. In Rumble they count
    // as neither color (PF wiki), so they get no color. VS forms (e.g. 3134.1) have their own color.
    const color = row.type ?? parent.type;
    const cls = row.class ?? parent.class;
    const classes = (Array.isArray(cls) ? cls.flat() : [cls]).filter((c): c is string => typeof c === "string");
    out.push({
      id: r.id,
      name: formNo && row === parent ? `${row.name} (form ${formNo})` : row.name,
      color: color ? `[${color}]` : "",
      classes: [...new Set(classes)],
      stars: row.stars ?? parent.stars,
      families: families[parentId] ?? [],
      ownFamilies: ownFamiliesOf(parentId, formNo, families[parentId] ?? []),
      tags: tagsOf(tags[String(parentId)], formNo),
      ...aliasesOf(aliases[String(parentId)]),
      lb: parseLimitBreak(details[String(parentId)]?.limit),
      llbTiers: parseLlbTiers(details[String(parentId)]?.lLimit),
      sockets: Number(row.sockets ?? parent.sockets ?? 0),
      specialLevels: specialLevelsOf(cooldowns[String(parentId)]),
      keyGroup: keyGroupOf(flags[String(parentId)], row.stars ?? parent.stars),
      ...(farmableOf(flags[String(parentId)]) ? { farmable: true } : {}),
      hp: Number(row.maxHP),
      atk: Number(row.maxATK),
      rcv: Number(row.maxRCV),
      minStats: { hp: Number(row.minHP), atk: Number(row.minATK), rcv: Number(row.minRCV) },
      maxLevel: Number(row.maxLevel ?? parent.maxLevel),
      growth: row.growth ?? parent.growth ?? null,
      rumble: r,
    });
  }
  // 5★ units that evolve into a 6★ unit (a dual / VS form into the same form of the 6★)
  const starsOf = new Map(out.map((u) => [u.id, String(u.stars)]));
  for (const u of out) {
    if (!String(u.stars).startsWith("5")) continue;
    const parentId = Math.floor(u.id);
    const form = Number.isInteger(u.id) ? "" : String(u.id).slice(String(parentId).length);
    const to = evolutions[String(parentId)]?.evolution;
    for (const t of Array.isArray(to) ? to : to !== undefined ? [to] : []) {
      const id = Number(`${t}${form}`);
      if (starsOf.get(id)?.startsWith("6")) { u.sixStarForm = id; break; }
    }
  }
  return { units: out, missing, unitRows: units, cooldowns };
}
