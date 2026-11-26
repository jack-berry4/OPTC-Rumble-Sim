/**
 * The game's own master data (sakura.db, decrypted by the OPTC Decomp master_db_tool) and its motion manifest:
 * joins each OPTC-DB Rumble unit to its MstCharacter_ row and extracts what the database adds per unit.
 *
 * Join (verified on every unit, docs/DATABASE.md):
 *   - OPTC-DB unit id = MstCharacter_.logbookId_ (the in-game Character Log number), NOT id_ (internal row id) and
 *     NOT serverId_ (the asset / server id: motion files, battle captures). E.g. Pacifista PX-4: OPTC-DB 971 =
 *     logbookId_ 971, id_ 1094, serverId_ 1199. Accepted only when the name or the max HP/ATK/RCV agree.
 *   - Units Global numbered differently (logbookId_ 5009-5068, e.g. OPTC-DB 1923 Rayleigh = logbook 5009): matched by
 *     exact name and max stats. OPTC-DB will reuse ids 5009+ for later units, so the logbook match is always verified.
 *   - VS forms (rumble.json 3134.1 / 3134.2): the parent row's versusChildCharacterIds_ (serverIds, in form order).
 *   - Dual units (one Rumble unit): the parent row holds the Rumble data; its childCharacterIds_ are the two characters.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameKeyTier, GameUnitData, RumbleType } from "../../src/data/schema";
import type { DbUnitRow, ImportedUnit } from "./optcdb";

type Row = Record<string, unknown>;
interface Db { prepare(sql: string): { all(...p: unknown[]): Row[]; get(...p: unknown[]): Row | undefined } ; close(): void }

/** node:sqlite (Node 22.13+) without its "experimental" warning. */
export async function openDb(path: string): Promise<Db> {
  const emit = process.emitWarning;
  process.emitWarning = ((w: string | Error, ...rest: unknown[]) => {
    if (!String(w).includes("SQLite")) (emit as (...a: unknown[]) => void).call(process, w, ...rest);
  }) as typeof process.emitWarning;
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(path, { readOnly: true }) as unknown as Db;
}

export const STYLES: RumbleType[] = ["BAL", "ATK", "DEF", "RCV", "SPT", "DBF"]; // piratesStyle_ 0..5

/**
 * MstPiratesLimitBreak_ (Rumble key tiers). Units point at it through MstCharacter_.piratesLimitBreakAbilityId_ ->
 * MstPiratesLimitBreakAbility_ (serverId_ -> piratesLimitBreakId_, piratesAbilityId_). Same-numbered tiers are
 * listed with the KeyGroup(s) of src/engine/stats.ts KEY_BONUS that have the same numbers.
 */
export function keyGroupsWithSameBonus(t: Omit<GameKeyTier, "groups">): string[] {
  const pct = (x: number) => Math.round(Math.abs(x - 1) * 100);
  const sig = [pct(t.hp), pct(t.atk), pct(t.rcv), pct(t.def), pct(t.spd), pct(t.ct), t.taken, t.dealt].join("/");
  const table: Record<string, string[]> = {
    "50/30/30/20/30/10/20/20": ["super"],
    "40/25/25/15/25/10/20/15": ["anni", "rumbleLegend"],
    "30/20/20/10/20/5/15/10": ["legend"],
    "30/20/20/10/20/5/10/5": ["tmKizuna", "rumbleRR"],
    "20/15/15/5/15/0/10/0": ["rr"],
  };
  return table[sig] ?? [];
}

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
/** A source file's identity. `path` is relative to the repo, "/"-separated: no local folder names in the public data. */
export interface FileStamp { path: string; size: number; mtime: string; sha256: string }
export function stampFile(path: string): FileStamp {
  const st = statSync(path);
  return { path: relative(REPO_ROOT, path).replaceAll("\\", "/"), size: st.size, mtime: st.mtime.toISOString(), sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
}

/** Minimal CSV (quoted fields with "" escapes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** serverId -> .ssd file names from motion_manifest.csv (attack motion and special/skill motion files). */
export function readMotionManifest(path: string): Map<number, { motion: string[]; skill: string[] }> {
  const out = new Map<number, { motion: string[]; skill: string[] }>();
  if (!existsSync(path)) return out;
  const [head, ...rows] = parseCsv(readFileSync(path, "utf8"));
  const iSid = head!.indexOf("serverId"), iFile = head!.indexOf("ssdFile");
  for (const r of rows) {
    const sid = Number(r[iSid]), file = r[iFile];
    if (!file || !Number.isFinite(sid)) continue;
    const e = out.get(sid) ?? { motion: [], skill: [] };
    (/_skill\.ssd$/.test(file) ? e.skill : e.motion).push(file);
    out.set(sid, e);
  }
  return out;
}

/**
 * Per-level texts that differ only in some numbers, stored once: `text` with "{}" where a number changes by level and
 * `values[level - 1]` the numbers for those places (expandLevelText gives the texts back). Texts that differ in more
 * than numbers stay a plain list.
 */
export type LevelText = string[] | { text: string; values: number[][] };
const NUM = /\d+(?:\.\d+)?/g;
export function templateLevelText(levels: string[]): LevelText {
  if (levels.length < 2) return levels;
  const skel = levels.map((s) => s.replace(NUM, "\u0000"));
  if (!skel.every((s) => s === skel[0])) return levels;
  const nums = levels.map((s) => s.match(NUM) ?? []);
  const parts = skel[0]!.split("\u0000");
  const varies = nums[0]!.map((_, j) => nums.some((n) => n[j] !== nums[0]![j]));
  let text = parts[0]!;
  nums[0]!.forEach((n, j) => { text += (varies[j] ? "{}" : n) + parts[j + 1]; });
  const t = { text, values: nums.map((n) => n.filter((_, j) => varies[j]).map(Number)) };
  return expandLevelText(t).every((s, i) => s === levels[i]) ? t : levels;
}
export function expandLevelText(t: LevelText): string[] {
  if (Array.isArray(t)) return t;
  return t.values.map((v) => { let i = 0; return t.text.replace(/\{\}/g, () => String(v[i++])); });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const fullName = (c: Row) => String(c.name_) + (c.subName_ ? ` - ${c.subName_}` : "");
const statKey = (hp: unknown, atk: unknown, rcv: unknown) => `${Number(hp)}/${Number(atk)}/${Number(rcv)}`;

export interface MappingResult {
  /** OPTC-DB Rumble unit id -> game data. */
  game: Map<number, GameUnitData>;
  /** OPTC-DB Rumble unit id -> special / super special text from the game. */
  text: Map<number, { special?: LevelText; superSpecial?: { effect: string; condition: string } }>;
  /** Rumble units with no game row, with the reason. */
  unmatched: { id: number; name: string; reason: string }[];
  /** Game rows with Rumble data (an active skill) that no OPTC-DB Rumble unit maps to. */
  gameOnly: { charId: number; serverId: number; logbookId: number; name: string }[];
  /** serverId -> OPTC-DB Rumble unit id (for known values keyed by serverId, e.g. battle captures). */
  bySid: Map<number, number>;
  dataTimestamp: string;
  characters: number;
}

export async function readGame(dbPath: string, manifestPath: string, units: ImportedUnit[], unitRows: Record<string, DbUnitRow>): Promise<MappingResult> {
  const db = await openDb(dbPath);
  const chars = db.prepare("SELECT * FROM MstCharacter_").all();
  const bySid = new Map(chars.map((c) => [Number(c.serverId_), c]));
  const byLogbook = new Map<number, Row>();
  const byNameStats = new Map<string, Row[]>();
  for (const c of chars) {
    if (Number(c.logbookId_) > 0) byLogbook.set(Number(c.logbookId_), c);
    const k = norm(fullName(c)) + "|" + statKey(c.maxHealth_, c.maxAttackDamage_, c.maxRestoration_);
    byNameStats.set(k, [...(byNameStats.get(k) ?? []), c]);
  }
  const statOnly = new Map<string, Row[]>();
  for (const c of chars) {
    const k = statKey(c.maxHealth_, c.maxAttackDamage_, c.maxRestoration_);
    statOnly.set(k, [...(statOnly.get(k) ?? []), c]);
  }

  // Rumble key tiers
  const lbTier = new Map<number, Row>(db.prepare("SELECT * FROM MstPiratesLimitBreak_").all().map((r) => [Number(r.serverId_), r]));
  const lbAbility = new Map<number, Row>(db.prepare("SELECT * FROM MstPiratesLimitBreakAbility_").all().map((r) => [Number(r.serverId_), r]));
  const abilities = new Map<number, Row>(db.prepare("SELECT serverId_, description_, dataJson_ FROM MstPiratesAbility_").all().map((r) => [Number(r.serverId_), r]));
  const keyTierOf = (c: Row): GameKeyTier | undefined => {
    const la = lbAbility.get(Number(c.piratesLimitBreakAbilityId_));
    const t = la && lbTier.get(Number(la.piratesLimitBreakId_));
    if (!la || !t) return undefined;
    const ab = abilities.get(Number(la.piratesAbilityId_));
    let taken = 0, dealt = 0;
    try {
      for (const d of (JSON.parse(String(ab?.dataJson_ ?? "{}")).data ?? []) as { effect?: { name?: string; coefficient?: number } }[]) {
        if (d.effect?.name === "ArenaAbility::DamageReduction") taken = Math.round((d.effect.coefficient ?? 0) * 100);
        if (d.effect?.name === "ArenaAbility::DamageEnhancement") dealt = Math.round(((d.effect.coefficient ?? 1) - 1) * 100);
      }
    } catch { /* keep 0 */ }
    const base = {
      tier: Number(t.serverId_), hp: Number(t.staminaCoefficient_), atk: Number(t.attackCoefficient_), rcv: Number(t.healingCoefficient_),
      def: Number(t.defenseCoefficient_), spd: Number(t.speedCoefficient_), ct: Number(t.chargeIntervalTimeCoefficient_),
      taken, dealt, vs: /from (.+?) by/.exec(String(ab?.description_ ?? "").replace(/<col=\d+>/g, ""))?.[1] ?? "", minLevel: Number(t.requireCharacterLevel_),
    };
    return { ...base, groups: keyGroupsWithSameBonus(base) };
  };

  // Specials: per-level cooldown + text; super specials
  const activeName = new Map<number, string>(db.prepare("SELECT serverId_, name_ FROM MstPiratesActiveSkill_").all().map((r) => [Number(r.serverId_), String(r.name_)]));
  const activeLevels = new Map<number, Row[]>();
  for (const r of db.prepare("SELECT piratesActiveSkillId_, level_, description_, chargeIntervalTime_, limit_ FROM MstPiratesActiveSkillEffect_ ORDER BY piratesActiveSkillId_, level_").all()) {
    const k = Number(r.piratesActiveSkillId_);
    activeLevels.set(k, [...(activeLevels.get(k) ?? []), r]);
  }
  const supers = new Map<number, Row>(db.prepare("SELECT * FROM MstPiratesSuperActiveSkill_").all().map((r) => [Number(r.serverId_), r]));
  const motion = readMotionManifest(manifestPath);
  const dataTimestamp = new Date(1000 * Number(db.prepare("SELECT max(max(insertTimestamp_), max(updateTimestamp_)) t FROM MstCharacter_").get()!.t)).toISOString();
  db.close();

  const res: MappingResult = { game: new Map(), text: new Map(), unmatched: [], gameOnly: [], bySid: new Map(), dataTimestamp, characters: chars.length };
  const claimed = new Map<number, number>(); // charId -> OPTC-DB id (base units)

  // 1) base units: verified logbook match, else exact name + stats
  const baseRow = new Map<number, { row: Row; match: GameUnitData["match"] }>();
  const baseIds = [...new Set(units.map((u) => Math.floor(u.id)))];
  for (const id of baseIds) {
    const u = unitRows[String(id)];
    const c = byLogbook.get(id);
    if (u && c && (norm(fullName(c)) === norm(u.name) || statKey(c.maxHealth_, c.maxAttackDamage_, c.maxRestoration_) === statKey(u.maxHP, u.maxATK, u.maxRCV))) {
      baseRow.set(id, { row: c, match: "logbook" });
      claimed.set(Number(c.id_), id);
    }
  }
  for (const id of baseIds) {
    if (baseRow.has(id)) continue;
    const u = unitRows[String(id)];
    if (!u) continue;
    const hits = (byNameStats.get(norm(u.name) + "|" + statKey(u.maxHP, u.maxATK, u.maxRCV)) ?? []).filter((c) => !claimed.has(Number(c.id_)));
    if (hits.length === 1) {
      baseRow.set(id, { row: hits[0]!, match: "name+stats" });
      claimed.set(Number(hits[0]!.id_), id);
    }
  }

  for (const u of units) {
    const pid = Math.floor(u.id);
    const base = baseRow.get(pid);
    if (!base) {
      const row = unitRows[String(pid)];
      const twin = row && (statOnly.get(statKey(row.maxHP, row.maxATK, row.maxRCV)) ?? []).find((c) => claimed.has(Number(c.id_)));
      const reason = twin
        ? `not in the Global game data; same stats as OPTC-DB ${claimed.get(Number(twin.id_))} (${fullName(twin)}), its Global version`
        : "not in the Global game data (JP-only or not released in Global yet)";
      res.unmatched.push({ id: u.id, name: u.name, reason });
      continue;
    }
    let c = base.row;
    let match = base.match;
    if (!Number.isInteger(u.id)) {
      const form = Number(String(u.id).split(".")[1]);
      const kids = JSON.parse(String(c.versusChildCharacterIds_ || c.childCharacterIds_ || "[]")) as number[];
      const kid = bySid.get(kids[form - 1]!);
      if (!kid) { res.unmatched.push({ id: u.id, name: u.name, reason: `VS form ${form}: parent ${fullName(c)} has no child #${form}` }); continue; }
      c = kid;
      match = "vs-form";
    }
    const keySrc = Number(c.piratesLimitBreakAbilityId_) ? c : base.row;
    const sp = Number(c.piratesActiveSkillId_);
    const levels = activeLevels.get(sp) ?? [];
    const sup = supers.get(Number(c.piratesSuperActiveSkillId_));
    const mo = motion.get(Number(c.serverId_));
    // release date: publishTimestamp_ (Global, 03:00 UTC the day after the JP-time release); old rows carry a 1999
    // placeholder there, so the row's insert time stands in. VS halves take their parent's.
    const dateOf = (r: Row) => {
      const p = Number(r.publishTimestamp_), i = Number(r.insertTimestamp_);
      const t = p > 1_262_304_000 ? p : i; // 2010-01-01
      return t > 0 ? new Date(1000 * t).toISOString().slice(0, 10) : undefined;
    };
    const released = dateOf(match === "vs-form" ? base.row : c);
    const g: GameUnitData = {
      charId: Number(c.id_),
      serverId: Number(c.serverId_),
      logbookId: Number(c.logbookId_),
      match,
      name: fullName(c),
      rarity: Number(c.rarity_),
      ...(released ? { released } : {}),
      stats: { hp: Number(c.maxHealth_), atk: Number(c.maxAttackDamage_), rcv: Number(c.maxRestoration_) },
      unitSize: Number(c.unitSize_),
      comboNum: Number(c.comboNum_),
      movementSpeed: Number(c.movementSpeed_),
      motionType: Number(c.motionType_),
      hasRumble: sp > 0,
      style: STYLES[Number(c.piratesStyle_)] ?? null,
      def: Number(c.piratesDefense_),
      spd: Number(c.piratesSpeed_),
      cost: Number(c.piratesDeckCost_),
      ...(sp > 0 ? { special: { id: sp, name: activeName.get(sp) ?? "", cooldowns: levels.map((l) => Number(l.chargeIntervalTime_)), limit: Number(levels[0]?.limit_ ?? 0) } } : {}),
      ...(sup ? { superSpecialId: Number(sup.serverId_) } : {}),
      key: keyTierOf(keySrc) ?? null,
      motionSsd: mo?.motion ?? [],
      skillSsd: mo?.skill ?? [],
    };
    res.game.set(u.id, g);
    res.bySid.set(g.serverId, u.id);
    const t: { special?: LevelText; superSpecial?: { effect: string; condition: string } } = {};
    if (levels.length) t.special = templateLevelText(levels.map((l) => String(l.description_)));
    if (sup) t.superSpecial = { effect: String(sup.effectDescription_), condition: String(sup.conditionDescription_) };
    if (t.special || t.superSpecial) res.text.set(u.id, t);
  }

  const mappedChar = new Set([...claimed.keys(), ...[...res.game.values()].map((g) => g.charId)]);
  for (const c of chars) {
    if (Number(c.piratesActiveSkillId_) > 0 && Number(c.logbookId_) > 0 && !mappedChar.has(Number(c.id_)) && !/manual/i.test(String(c.name_))) {
      res.gameOnly.push({ charId: Number(c.id_), serverId: Number(c.serverId_), logbookId: Number(c.logbookId_), name: fullName(c) });
    }
  }
  return res;
}
