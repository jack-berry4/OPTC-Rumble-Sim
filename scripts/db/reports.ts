/** Generated reports: the OPTC-DB <-> game join (mapping.md) and where the two sources disagree (crosscheck.md). */
import type { UnitRecord } from "../../src/data/schema";
import type { MappingResult } from "./game";
import type { DbUnitRow } from "./optcdb";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const esc = (s: unknown) => String(s).replace(/\|/g, "\\|");

export function mappingMarkdown(m: MappingResult, total: number, header: string[]): string {
  const byMatch = new Map<string, number>();
  for (const g of m.game.values()) byMatch.set(g.match, (byMatch.get(g.match) ?? 0) + 1);
  const L = ["# OPTC-DB <-> game data join", "", ...header, ""];
  L.push(`Rumble units in OPTC-DB: **${total}**; joined to a game row: **${m.game.size}**; not joined: **${m.unmatched.length}**.`, "");
  L.push("| How | Units |", "|---|---|");
  const how: Record<string, string> = {
    logbook: "MstCharacter_.logbookId_ = OPTC-DB id (name or max stats verified)",
    "name+stats": "same name and max HP/ATK/RCV (Global numbers these differently, logbookId_ 5009+)",
    "vs-form": "VS form x.1 / x.2 = the parent's versusChildCharacterIds_ in order",
  };
  for (const [k, n] of byMatch) L.push(`| ${how[k] ?? k} | ${n} |`);
  L.push("", "IDs: OPTC-DB id = `logbookId_` (Character Log no.), not `id_` (internal row) and not `serverId_` (assets,",
    "battle captures). Example: Pacifista PX-4 = OPTC-DB 971 = logbookId_ 971, id_ 1094, serverId_ 1199.", "");
  const ren = [...m.game.entries()].filter(([, g]) => g.match === "name+stats");
  if (ren.length) {
    L.push("## Joined by name + stats (Global logbook number differs)", "", "| OPTC-DB id | Game logbookId_ | serverId_ | Name |", "|---|---|---|---|");
    for (const [id, g] of ren) L.push(`| ${id} | ${g.logbookId} | ${g.serverId} | ${esc(g.name)} |`);
    L.push("");
  }
  if (m.unmatched.length) {
    L.push("## Not joined", "", "| OPTC-DB id | Name | Why |", "|---|---|---|");
    for (const u of m.unmatched) L.push(`| ${u.id} | ${esc(u.name)} | ${esc(u.reason)} |`);
    L.push("");
  }
  L.push(`## Game units with a Rumble special that no OPTC-DB Rumble unit maps to (${m.gameOnly.length})`, "",
    "Usually units OPTC-DB has not added Rumble data for yet (or rows OPTC-DB lists without Rumble data).", "");
  if (m.gameOnly.length) {
    L.push("| logbookId_ | id_ | serverId_ | Name |", "|---|---|---|---|");
    for (const g of m.gameOnly) L.push(`| ${g.logbookId} | ${g.charId} | ${g.serverId} | ${esc(g.name)} |`);
  }
  return L.join("\n") + "\n";
}

interface Finding { id: number; name: string; ours: string; game: string }

export function crosscheckMarkdown(recs: UnitRecord[], unitRows: Record<string, DbUnitRow>, header: string[]): { md: string; counts: Record<string, number> } {
  const f: Record<string, Finding[]> = {
    name: [], style: [], def: [], spd: [], cost: [], cooldown: [], specialLevels: [], stats: [], combo: [], keyTier: [], noKey: [],
  };
  const add = (k: string, r: UnitRecord, ours: unknown, game: unknown) => f[k]!.push({ id: r.id, name: r.name, ours: String(ours), game: String(game) });
  let compared = 0;
  const keyTab = new Map<string, number>();
  for (const r of recs) {
    const g = r.game;
    if (!g) continue;
    compared++;
    const row = unitRows[Number.isInteger(r.id) ? String(r.id) : String(r.id).replace(".", "-")];
    // VS forms: units.js names the half only ("Kaido"), the game "Kaido - Emperors in Conflict"
    const gName = g.match === "vs-form" ? g.name.split(" - ")[0]! : g.name;
    if (norm(r.name.replace(/ \(form \d\)$/, "")) !== norm(gName)) add("name", r, r.name, g.name);
    const cell = `${r.keyGroup} -> ${g.key ? `${g.key.tier} (${g.key.groups.join("/") || `${Math.round((g.key.hp - 1) * 100)}% HP, taken ${g.key.taken}% dealt ${g.key.dealt}%`})` : "no key"}`;
    keyTab.set(cell, (keyTab.get(cell) ?? 0) + 1);
    if (r.stats.hp !== g.stats.hp || r.stats.atk !== g.stats.atk || r.stats.rcv !== g.stats.rcv)
      add("stats", r, `${r.stats.hp}/${r.stats.atk}/${r.stats.rcv}`, `${g.stats.hp}/${g.stats.atk}/${g.stats.rcv}`);
    if (row?.combo !== undefined && row.combo !== g.comboNum) add("combo", r, row.combo, g.comboNum);
    if (r.style !== g.style) add("style", r, r.style, g.style);
    if (r.stats.def !== g.def) add("def", r, r.stats.def, g.def);
    if (r.stats.spd !== g.spd) add("spd", r, r.stats.spd, g.spd);
    if (r.cost !== g.cost) add("cost", r, r.cost, g.cost);
    const ours = r.kit.specials.map((s) => s.cooldown);
    const theirs = g.special?.cooldowns ?? [];
    if (ours.length !== theirs.length) add("specialLevels", r, ours.length, theirs.length);
    if (ours.some((c, i) => theirs[i] !== undefined && c !== theirs[i])) add("cooldown", r, ours.join(","), theirs.join(","));
    if (!g.key) { if (r.kit.specials.length) add("noKey", r, r.keyGroup, "none"); }
    else if (!g.key.groups.includes(r.keyGroup)) add("keyTier", r, r.keyGroup, `${g.key.tier} (= ${g.key.groups.join(" / ") || "no KEY_BONUS group"}; ${g.key.vs})`);
  }
  const titles: Record<string, string> = {
    name: "Names (OPTC-DB name vs game name_ - subName_, letters and digits only)",
    stats: "Max HP / ATK / RCV",
    combo: "Hits per attack (units.js combo vs comboNum_)",
    style: "Rumble style",
    def: "Rumble DEF",
    spd: "Rumble SPD",
    cost: "Team cost (rumble.json cost vs piratesDeckCost_)",
    specialLevels: "Number of Rumble special levels",
    cooldown: "Rumble special cooldown per level (s)",
    keyTier: "Rumble key tier (our keyGroup from flags.js vs the game's MstPiratesLimitBreak_ tier; same bonus numbers count as agreeing)",
    noKey: "Units with a Rumble special that the game gives no Rumble key (no piratesLimitBreakAbilityId_; mostly forms before their last evolution); no key for these legal units in the app and simulator since 2026-11-17",
  };
  const counts = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.length]));
  const L = ["# Cross-check: OPTC-DB (2Shankz) vs the game's master data", "", ...header, "",
    `Units compared: **${compared}** (joined to a game row).`, "",
    "| Check | Disagreements |", "|---|---|"];
  for (const k of Object.keys(f)) L.push(`| ${titles[k]} | ${counts[k]} |`);
  L.push("", "## Rumble key: our keyGroup -> the game's tier (all joined units)", "",
    "Game tiers by bonus: 1000-1004 = super; 1010/1020/1030 = anni / rumbleLegend; 1040 = legend; 1050/1060/2010 =",
    "tmKizuna / rumbleRR; 2020/2021 = rr; 2030 and 100000 = rr stats but damage taken -5% (not -10%), no KEY_BONUS group.",
    "The key's damage taken / dealt bonus applies against one color or class pair only (the unit's key ability).", "",
    "| OPTC-DB -> game | Units |", "|---|---|");
  for (const [k, n] of [...keyTab].sort((a, b) => b[1] - a[1])) L.push(`| ${esc(k)} | ${n} |`);
  L.push("");
  for (const [k, list] of Object.entries(f)) {
    if (!list.length) continue;
    L.push(`## ${titles[k]} (${list.length})`, "", "| Unit | Name | OPTC-DB | Game |", "|---|---|---|---|");
    for (const x of list) L.push(`| ${x.id} | ${esc(x.name)} | ${esc(x.ours)} | ${esc(x.game)} |`);
    L.push("");
  }
  return { md: L.join("\n") + "\n", counts };
}
