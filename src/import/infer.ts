/**
 * From what a screenshot shows of a unit to a build (docs/IMPORT_PLAN.md): every value is either read off the
 * screen, worked out from what was read (the cotton candy split and potential + socket levels from the stats, the
 * Rumble key from DEF / SPD, the LLB from the max level, ...), or unknown and taken from the user's default build.
 */
import type { UnitRecord } from "../data/schema";
import {
  applyPreset, canLimitBreak, displayedStats, keyAllowedAt, keyTierOf, lbMaxNodes, LLB_EXTRA_LEVELS, MAX_CC, maxLevelFor,
  POTENTIAL_MAX_LEVEL, rumbleDefSpd, rumbleStats, SOCKET_MAX_LEVEL, socketSlots, statUp, withDefaults, type PresetDef,
} from "../engine/stats";
import type { MemberConfig } from "../engine/types";
import { FACT_GROUPS } from "../engine/buildGroups";

/**
 * The Rumble key icon on a tile (keyIcon.ts): "on" (gold swords, red outline), "possible" (dark swords, red outline:
 * the unit can have a key), "locked" (a grey icon: the unit has a key, not yet possible at its level), "none" (no icon
 * seen: a unit with no key, or the icon wasn't found).
 */
export type KeyState = "on" | "possible" | "locked" | "none";

/** What a screen showed of one unit (any part may be missing). */
export interface Seen {
  /** Unit level, or "max" (the max level of its LLB). */
  level?: number | "max";
  /**
   * A tile's "Lv.MAX" color: red = the max level after Level Limit Break (150 at LLB 5), yellow = the unit's level cap
   * before LLB (99), whatever its LLB (2026-11-23: Attack Edit stats only fit that way).
   */
  maxKind?: "llb" | "base";
  /** "(MAX Lv.150)", or a tile's level in red digits (at its max): the max level, which gives the LLB. */
  maxLevel?: number;
  /**
   * A tile's level in gold digits: below the unit's max level (user, 2026-11-24: a gold "110" has an LLB max of 120+,
   * a gold "99" at least LLB 1). The LLB is taken as the least that keeps the level below the max.
   */
  belowMax?: boolean;
  /**
   * The circle at a tile's bottom left: how many sockets have at least one level (0-5; user, 2026-11-23). Shown on
   * your own units (box, team edit, GP, your side of a VS screen).
   */
  socketsFilled?: number;
  /** Cotton candy total ("+574"). */
  ccTotal?: number;
  /** Limit Break maxed (the MAX badge). */
  lbMax?: never;
  /**
   * The Limit Break badge (top right of a tile; a favorite star can hide it; user, 2026-11-23): "MAX" in white = the
   * usual max (no expansion key), "MAX" in gold = everything with the Limit Break key, a white number = not yet at the
   * usual max, a gold number = with the key, past the usual max but not all. "empty": a box video showed no badge while
   * the other tiles showed theirs: no Limit Break yet.
   */
  lb?: "max" | "keyMax" | "partial" | "keyPartial" | "empty";
  /** The badge's number when it was read surely (the Limit Break nodes unlocked; user, 2026-11-24: Usopp & Vegapunk
   *  "17"). */
  lbNumber?: number;
  /** The main special's "MAX" in red: its shortest charge, from the Limit Break key's extra reduction (user). */
  lbKeyUsed?: boolean;
  key?: KeyState;
  /** Rumble HP / ATK / RCV (and DEF / SPD) as shown (team edit, Rumble status). */
  rumble?: { hp?: number; atk?: number; rcv?: number; def?: number; spd?: number };
  /** Main-game HP / ATK / RCV as shown (general status). */
  main?: { hp?: number; atk?: number; rcv?: number };
  /** Rumble special / ability level ("max" = the unit's max). */
  specialLevel?: number | "max";
  abilityLevel?: number | "max";
  /** Main-game special level. */
  mainSpecialLevel?: number | "max";
  /** Each potential's level, in order (general status). */
  potentialLevels?: number[];
  /** Socket levels in total (general status). */
  sockets?: number;
  /** Other readings of the stats, most likely first (OCR mixes up 1 / 4 / 7 and the like): the build fit tries them. */
  alts?: { hp?: number[]; atk?: number[]; rcv?: number[] };
  /** Combat power (only checked against). */
  cp?: number;
}

export type FactHow = "read" | "worked" | "unknown";
export interface Fact { what: string; value: string; how: FactHow; note?: string }

export interface Inferred { member: MemberConfig; facts: Fact[]; /** The stats seen didn't fit any legal build. */ misfit?: string }

const llbForMax = (rec: UnitRecord, max: number) => {
  for (let l = 0; l <= 5; l++) if (maxLevelFor(rec, l) >= max) return l;
  return 5;
};
const minLlbFor = (rec: UnitRecord, level: number) => {
  for (let l = 0; l <= 5; l++) if (maxLevelFor(rec, l) >= level) return l;
  return 5;
};
const lvText = (v: number | "max" | undefined, max: number) => (v === "max" ? `${max} (max)` : String(v));

/**
 * The build: `seen` where known, worked out where possible, `preset` for the rest (`maxCc` = the account's cotton
 * candy max, for presets that use it).
 */
export function inferBuild(rec: UnitRecord, seenRead: Seen, preset: PresetDef | undefined, unitId = rec.id): Inferred {
  // a Limit Break badge only shows from level 99: with one seen, a level read below 99 is a misreading (the box's
  // "2660/2700" counter over a tile read as "Lv 1", 2026-11-24 video): the level counts as not read
  const badge = seenRead.lb && seenRead.lb !== "empty";
  const seen: Seen = badge && typeof seenRead.level === "number" && seenRead.level < 99 ? { ...seenRead, level: undefined } : seenRead;
  const first = inferOnce(rec, seen, preset, unitId, 16);
  // level not read but stats shown: the level is one of the usual ones, and the stats tell which
  if (!first.misfit || seen.level != null || !(seen.rumble?.hp || seen.main?.hp)) return first;
  for (const level of [150, 130, 120, 110, 105, 99, 100, 101, 1]) {
    if (level > maxLevelFor(rec, 5)) continue;
    const r = inferOnce(rec, { ...seen, level }, preset, unitId, 3);
    if (!r.misfit) {
      const f = r.facts.find((x) => x.what === "Level");
      if (f) { f.how = "worked"; f.note = "not read: the level the stats fit"; }
      return r;
    }
  }
  return first;
}

function inferOnce(rec: UnitRecord, seen: Seen, preset: PresetDef | undefined, unitId: number, maxCands: number): Inferred {
  const facts: Fact[] = [];
  const fact = (what: string, value: string | number, how: FactHow, note?: string) => facts.push({ what, value: String(value), how, ...(note ? { note } : {}) });
  const base: MemberConfig = preset ? applyPreset(rec, { unitId }, preset) : { unitId };
  const m: MemberConfig = { ...base, unitId };
  const lbOk = canLimitBreak(rec);

  // LLB and level
  if (!lbOk) {
    m.llbLevel = 0;
  } else if (seen.level === "max" && seen.maxKind === "llb") {
    m.llbLevel = 5; fact("LLB", 5, "worked", "a red Lv.MAX: the LLB max level");
  } else if (seen.maxLevel != null) {
    m.llbLevel = llbForMax(rec, seen.maxLevel); fact("LLB", m.llbLevel, "worked", `max level ${seen.maxLevel}`);
  } else if (seen.belowMax && typeof seen.level === "number" && seen.level >= rec.maxLevel) {
    const min = minLlbFor(rec, seen.level + 1);
    m.llbLevel = min;
    fact("LLB", min, "worked", `at least ${min}: a gold Lv.${seen.level} is below the max (${maxLevelFor(rec, min)})`);
  } else if (typeof seen.level === "number" && seen.level > rec.maxLevel) {
    const min = minLlbFor(rec, seen.level);
    m.llbLevel = Math.max(min, base.llbLevel ?? 0);
    fact("LLB", m.llbLevel, m.llbLevel === min ? "worked" : "unknown", `at least ${min} for level ${seen.level}`);
  } else {
    fact("LLB", m.llbLevel ?? 0, "unknown");
  }
  const maxLv = maxLevelFor(rec, m.llbLevel ?? 0);
  if (seen.level === "max" && seen.maxKind === "base") {
    m.level = rec.maxLevel;
    fact("Level", `${rec.maxLevel} (max before LLB)`, "worked", "a yellow Lv.MAX");
  } else if (seen.level != null) {
    m.level = seen.level === "max" ? maxLv : Math.min(seen.level, maxLv);
    fact("Level", lvText(seen.level, maxLv), seen.level === "max" && seen.maxLevel == null ? "worked" : "read",
      seen.level === "max" && seen.maxLevel == null ? "MAX: the max of that LLB" : undefined);
  } else {
    m.level = Math.min(m.level ?? maxLv, maxLv);
    fact("Level", m.level, "unknown");
  }

  // Rumble special / ability
  const spMax = Math.max(1, rec.kit.specials.length), abMax = Math.max(1, rec.kit.abilities.length);
  if (seen.specialLevel != null) { m.specialLevel = seen.specialLevel === "max" ? spMax : seen.specialLevel; fact("Rumble special", `${m.specialLevel}/${spMax}`, "read"); }
  else if (rec.kit.specials.length) fact("Rumble special", `${m.specialLevel ?? spMax}/${spMax}`, "unknown");
  if (seen.abilityLevel != null) { m.abilityLevel = seen.abilityLevel === "max" ? abMax : seen.abilityLevel; fact("Rumble ability", `${m.abilityLevel}/${abMax}`, "read"); }
  else if (rec.kit.abilities.length) fact("Rumble ability", `${m.abilityLevel ?? abMax}/${abMax}`, "unknown");
  const msMax = Math.max(1, rec.specialLevels ?? 1);
  if (seen.mainSpecialLevel != null) { m.mainSpecialLevel = seen.mainSpecialLevel === "max" ? msMax : seen.mainSpecialLevel; fact("Main special", `${m.mainSpecialLevel}/${msMax}`, "read"); }

  // Rumble key: read, or from DEF / SPD (a key raises both)
  let keyKnown = false;
  const keyAllowed = keyAllowedAt(rec, m.level ?? maxLv);
  if (seen.key && !keyAllowed) {
    // a key needs the level (6*: 120, 5*: 99; user 2026-11-24): an icon read on a unit below it is something else
    m.rumbleKey = false; keyKnown = true;
    fact("Rumble key", keyTierOf(rec) ? "no (not possible yet)" : "no (none in the game)", "read");
  } else if (seen.key === "on" || seen.key === "possible") {
    m.rumbleKey = seen.key === "on"; keyKnown = true;
    fact("Rumble key", seen.key === "on" ? "yes" : "no (can have one)", "read");
  } else if (seen.rumble?.def != null || seen.rumble?.spd != null) {
    // (also when the icon read grey or wasn't found at a level where the game shows a red one: not a reading)
    const on = rumbleDefSpd(rec, { ...m, rumbleKey: true }), off = rumbleDefSpd(rec, { ...m, rumbleKey: false });
    const d = (v: { def: number; spd: number }) => Math.abs(statUp(v.def) - (seen.rumble!.def ?? statUp(v.def))) + Math.abs(statUp(v.spd) - (seen.rumble!.spd ?? statUp(v.spd)));
    if (keyTierOf(rec) && d(on) < d(off)) { m.rumbleKey = true; keyKnown = true; fact("Rumble key", "yes", "worked", "from DEF / SPD"); }
    else if (d(off) <= 1) { m.rumbleKey = false; keyKnown = true; fact("Rumble key", "no", "worked", "from DEF / SPD"); }
  }
  if (!keyKnown) {
    m.rumbleKey = !!m.rumbleKey && keyAllowed;
    fact("Rumble key", m.rumbleKey ? "yes" : "no", "unknown", seen.key === "none" || seen.key === "locked" ? "the tile's key icon wasn't read" : undefined);
  }

  // Potentials / sockets read (general status)
  const pots = rec.lb?.potentials ?? [];
  if (seen.potentialLevels?.length) {
    m.potentialLevels = pots.map((_, i) => Math.min(POTENTIAL_MAX_LEVEL, Math.max(1, seen.potentialLevels![i] ?? 1)));
    fact("Potentials", seen.potentialLevels.join(" / "), "read");
  }
  if (seen.sockets != null) { m.sockets = seen.sockets; fact("Socket levels", seen.sockets, "read"); }
  const filled = seen.sockets == null ? seen.socketsFilled : undefined;
  if (filled != null) {
    // the default build's level in each of those sockets
    const each = Math.max(1, Math.round((m.sockets ?? 0) / Math.max(1, socketSlots(rec, m.lbNodes ?? lbMaxNodes(rec, true)))) || SOCKET_MAX_LEVEL);
    m.sockets = filled * Math.min(SOCKET_MAX_LEVEL, each);
    fact("Sockets with levels", filled, "read");
  }

  // Limit Break nodes, cotton candy and potentials + sockets: from the stats when shown. The stats as read first,
  // then the other readings and the usual OCR mix-ups (1 / 4 / 7, 5 / 6 / 8, ...): a wrong digit rarely fits a build.
  const nodeOptions = !lbOk || !rec.lb ? [0] : lbNodesFor(rec, seen);
  let misfit: string | undefined;
  const fixedNote = (read: Stats3, used: Stats3) => {
    const diff = (["hp", "atk", "rcv"] as const).filter((k) => read[k] !== used[k]);
    return diff.length ? `; read ${diff.map((k) => `${k.toUpperCase()} ${read[k]} as ${used[k]}`).join(", ")}: that one fits a build` : "";
  };
  if (seen.main?.hp != null && seen.main.atk != null && seen.main.rcv != null) {
    const read = seen.main as Stats3;
    let fit: ReturnType<typeof fitMain>, used = read;
    for (const cand of candidates(read, seen.alts).slice(0, maxCands)) { fit = fitMain(rec, m, cand, nodeOptions); if (fit) { used = cand; break; } }
    if (fit) {
      Object.assign(m, fit.m);
      lbFact(fit.m.lbNodes!);
      fact("Cotton candy", ccText(fit.m.cc!), "worked", `from the stats${fixedNote(read, used)}`);
    } else misfit = "The main stats don't fit a legal build (check the level and the unit).";
  } else if (seen.rumble?.hp != null && seen.rumble.atk != null && seen.rumble.rcv != null) {
    const read = seen.rumble as Stats3;
    // the main-game special level scales the potential / socket bonus: try it lower only when nothing fits at max
    const msTry = seen.mainSpecialLevel != null || msMax <= 1 ? [m.mainSpecialLevel ?? msMax] : range(1, msMax).reverse();
    const levelsKnown = seen.potentialLevels != null || seen.sockets != null;
    let fit: ReturnType<typeof fitRumble>, used = read, msUsed = msMax;
    // first every reading at the usual main special level, then lower levels for the likeliest readings
    const cands = candidates(read, seen.alts).slice(0, maxCands);
    const tries: [Stats3, number][] = [...cands.map((c) => [c, msTry[0]!] as [Stats3, number]), ...cands.slice(0, 2).flatMap((c) => msTry.slice(1).map((ms) => [c, ms] as [Stats3, number]))];
    for (const [cand, ms] of tries) {
      fit = fitRumble(rec, { ...m, mainSpecialLevel: ms }, cand, nodeOptions, seen.ccTotal, levelsKnown, filled);
      if (fit) { used = cand; msUsed = ms; break; }
    }
    if (fit) {
      Object.assign(m, fit.m);
      if (msUsed !== msMax && seen.mainSpecialLevel == null) { m.mainSpecialLevel = msUsed; fact("Main special", `${msUsed}/${msMax}`, "worked", "from the stats"); }
      lbFact(fit.m.lbNodes!);
      fact("Cotton candy", ccText(fit.m.cc!), "worked", `from the stats${fixedNote(read, used)}`);
      if (!levelsKnown && rec.kit.specials.length) fact("Potential + socket levels", fit.n, "worked", "from the stats (as potentials first, then sockets)");
    } else misfit = "The Rumble stats don't fit a legal build: kept the default build (check the level, LLB and the unit).";
  }
  if (!facts.some((f) => f.what === "Limit Break") && rec.lb && lbOk) {
    const opts = lbNodesFor(rec, seen);
    if (opts.length === 1) { m.lbNodes = opts[0]; m.lbKey = opts[0]! > lbMaxNodes(rec, false); lbFact(opts[0]!); }
    else {
      // only a range is known: the default build's nodes, kept inside it
      const want = m.lbNodes ?? lbMaxNodes(rec, true);
      const n = opts.includes(want) ? want : opts.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), opts[0]!);
      m.lbNodes = n; m.lbKey = n > lbMaxNodes(rec, false);
      fact("Limit Break", `${n}/${lbMaxNodes(rec, true)} nodes`, seen.lb || seen.lbKeyUsed ? "worked" : "unknown", seen.lb || seen.lbKeyUsed ? lbNote(seen) : undefined);
    }
  }
  if (!facts.some((f) => f.what === "Cotton candy")) {
    if (seen.ccTotal != null) {
      const cc = splitCc(seen.ccTotal);
      m.ccMode = "custom"; m.cc = cc;
      fact("Cotton candy", `${ccText(cc)} (total ${seen.ccTotal} read; split evenly, ATK first)`, "worked");
    } else fact("Cotton candy", m.ccMode === "custom" && m.cc ? ccText(m.cc) : m.ccMode === "none" ? "none" : "account max", "unknown");
  }
  if (!facts.some((f) => f.what.startsWith("Potential")) && pots.length) fact("Potentials", (m.potentialLevels ?? []).join(" / ") || "default", "unknown");
  if (!facts.some((f) => f.what.startsWith("Socket") || f.what.startsWith("Potential +"))) fact("Socket levels", m.sockets ?? "default", "unknown");
  if (seen.mainSpecialLevel == null && msMax > 1 && !facts.some((f) => f.what === "Main special")) fact("Main special", `${m.mainSpecialLevel ?? msMax}/${msMax}`, "unknown", "scales the potential / socket stat bonus");
  // the parts read or worked out are confirmed (a bulk change for "unconfirmed" leaves them alone)
  const known = [...new Set(facts.filter((f) => f.how !== "unknown").flatMap((f) => FACT_GROUPS[f.what] ?? []))];
  if (known.length) m.known = known;
  else delete m.known;
  return { member: m, facts, ...(misfit ? { misfit } : {}) };

  function lbFact(n: number) {
    const all = lbMaxNodes(rec.lb ? rec : rec, true), usual = lbMaxNodes(rec, false);
    if (belowLb(seen)) { fact("Limit Break", "none", "worked", `level ${seen.level}: no Limit Break below level 99`); return; }
    const exact = seen.lb === "max" || seen.lb === "keyMax" || seen.lb === "empty" || (seen.lbNumber != null && n === seen.lbNumber);
    const text = n === all ? `max (${n}/${all} nodes${all > usual ? ", with the Limit Break key" : ""})` : n === usual && all > usual ? `usual max (${n}/${all} nodes, no Limit Break key)` : `${n}/${all} nodes`;
    fact("Limit Break", text, exact ? "read" : "worked", exact ? lbNote(seen) : seen.lb || seen.lbKeyUsed ? `${lbNote(seen)}; the rest from the stats` : "from the stats");
  }
}

const lbNote = (seen: Seen) =>
  seen.lbNumber != null && (seen.lb === "partial" || seen.lb === "keyPartial") ? `a ${seen.lb === "partial" ? "white" : "gold"} ${seen.lbNumber} on the badge`
  : seen.lb === "empty" ? "no badge: no Limit Break yet" : seen.lb === "max" ? "a white MAX badge" : seen.lb === "keyMax" ? "a gold MAX badge" : seen.lb === "partial" ? "a white number on the badge: below the usual max"
  : seen.lb === "keyPartial" ? "a gold number on the badge: past the usual max with the key" : seen.lbKeyUsed ? "a red special MAX: the Limit Break key is used" : "";

/** A unit below level 99 has no Limit Break at all (no badge; user, 2026-11-24). */
const belowLb = (seen: Seen) => typeof seen.level === "number" && seen.level < 99;

/**
 * The Limit Break node counts the badge (and a red special MAX) allow, highest first (stat-distinct ones). The badge
 * (user, 2026-11-24): none below level 99; a white number = nodes so far, a white MAX = the usual max; a unit that can
 * take the Limit Break key only then gets it, and its badge turns gold: a gold number until all nodes, then a gold
 * MAX. A unit with no key nodes never shows gold, so a gold reading there is a favorite star or a misreading.
 */
function lbNodesFor(rec: UnitRecord, seen: Seen): number[] {
  const all = lbMaxNodes(rec, true), usual = lbMaxNodes(rec, false);
  if (belowLb(seen) || seen.lb === "empty") return [0];
  const lb = all === usual ? (seen.lb === "keyMax" ? "max" : seen.lb === "keyPartial" ? "partial" : seen.lb) : seen.lb;
  if (lb === "keyMax" || (lb === "max" && all === usual)) return [all];
  if (lb === "max") return [usual];
  const ok = (n: number) =>
    (lb !== "partial" || n < usual) && (lb !== "keyPartial" || (n > usual && n < all)) && (!seen.lbKeyUsed || n > usual || all === usual);
  // the number itself, when it was read surely and fits the color
  if (seen.lbNumber != null && seen.lbNumber >= 1 && ok(seen.lbNumber)) return [seen.lbNumber];
  const list = distinctNodes(rec).filter(ok);
  return list.length ? list : distinctNodes(rec);
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
type Stats3 = { hp: number; atk: number; rcv: number };

/** Limit Break node counts that give different stats, slots or unlocked potentials (the highest of each kind). */
function distinctNodes(rec: UnitRecord): number[] {
  const out: number[] = [];
  const seenKeys = new Set<string>();
  for (let n = lbMaxNodes(rec, true); n >= 0; n--) {
    const k = `${JSON.stringify(n > 0 ? rec.lb?.steps[n - 1] : [0, 0, 0])}|${(rec.lb?.potentials ?? []).filter((p) => p.at < n).length}|${socketSlots(rec, n)}`;
    if (!seenKeys.has(k)) { seenKeys.add(k); out.push(n); }
  }
  return out;
}

const MIXUPS: Record<string, string[]> = { "1": ["4", "7"], "4": ["1"], "7": ["1"], "5": ["6", "3"], "6": ["5", "8"], "8": ["6", "3", "9", "0"], "3": ["8", "5"], "9": ["8"], "0": ["8"] };
/** One-digit mix-ups of a number, and the number with one digit too many taken out ("7139" for 739). */
function mixups(v: number): number[] {
  const t = String(v);
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) for (const r of MIXUPS[t[i]!] ?? []) out.push(Number(t.slice(0, i) + r + t.slice(i + 1)));
  if (t.length >= 3) for (let i = 0; i < t.length; i++) out.push(Number(t.slice(0, i) + t.slice(i + 1)));
  return out;
}
/**
 * The stats to try: as read, the other readings, then one digit mixed up in one stat; readings that look like a
 * unit's (HP over ATK over RCV) first.
 */
function candidates(read: Stats3, alts?: Seen["alts"]): Stats3[] {
  const all = [...rawCandidates(read, alts)];
  const plausible = (s: Stats3) => s.hp > s.atk && s.atk > s.rcv;
  return [all[0]!, ...all.slice(1).filter(plausible), ...all.slice(1).filter((x) => !plausible(x))];
}
function* rawCandidates(read: Stats3, alts?: Seen["alts"]): Generator<Stats3> {
  const done = new Set<string>();
  const key = (s: Stats3) => `${s.hp}/${s.atk}/${s.rcv}`;
  const take = function* (s: Stats3) { if (!done.has(key(s))) { done.add(key(s)); yield s; } };
  yield* take(read);
  for (const h of alts?.hp ?? [read.hp]) for (const a of alts?.atk ?? [read.atk]) for (const r of alts?.rcv ?? [read.rcv]) yield* take({ hp: h, atk: a, rcv: r });
  for (const k of ["hp", "atk", "rcv"] as const) for (const v of mixups(read[k])) yield* take({ ...read, [k]: v });
}
const ccText = (c: { hp: number; atk: number; rcv: number }) => `${c.hp} HP / ${c.atk} ATK / ${c.rcv} RCV`;

/** A cotton candy total split as evenly as it goes, any extra to ATK, then HP, then RCV (user, 2026-11-22). */
export function splitCc(total: number): { hp: number; atk: number; rcv: number } {
  const t = Math.max(0, Math.min(3 * MAX_CC, Math.round(total)));
  const each = Math.floor(t / 3), extra = t - 3 * each;
  return { atk: each + (extra > 0 ? 1 : 0), hp: each + (extra > 1 ? 1 : 0), rcv: each };
}

/** Main-game stats -> Limit Break nodes and cotton candy (stats = level + Limit Break + cotton candy). */
function fitMain(rec: UnitRecord, m: MemberConfig, seen: { hp?: number; atk?: number; rcv?: number }, nodes: number[]) {
  let best: { m: Partial<MemberConfig>; err: number } | undefined;
  for (const n of nodes) {
    const probe: MemberConfig = { ...m, lbNodes: n, lbKey: rec.lb ? n > lbMaxNodes(rec, false) : false, ccMode: "none" };
    const d = displayedStats(rec, probe);
    const cc = { hp: Math.round((seen.hp! - d.hp) / 5), atk: Math.round((seen.atk! - d.atk) / 2), rcv: Math.round(seen.rcv! - d.rcv) };
    if (cc.hp < 0 || cc.atk < 0 || cc.rcv < 0 || cc.hp > MAX_CC || cc.atk > MAX_CC || cc.rcv > MAX_CC) continue;
    const t = displayedStats(rec, { ...probe, ccMode: "custom", cc });
    const err = Math.abs(t.hp - seen.hp!) + Math.abs(t.atk - seen.atk!) + Math.abs(t.rcv - seen.rcv!);
    if (err <= 2 && (!best || err < best.err)) best = { m: { lbNodes: n, lbKey: probe.lbKey, ccMode: "custom", cc }, err };
    if (best?.err === 0) break;
  }
  return best;
}

/**
 * Rumble stats -> Limit Break nodes, cotton candy and potential + socket levels: Rumble stat = shown stat x
 * (1 + k x levels x main special / max) x key; every combination is tried and the cotton candy that fits taken.
 */
function fitRumble(rec: UnitRecord, m: MemberConfig, seen: { hp: number; atk: number; rcv: number }, nodes: number[], ccTotal: number | undefined, levelsKnown: boolean, socketsFilled?: number) {
  let best: { m: Partial<MemberConfig>; err: number; n: number } | undefined;
  const pots = rec.lb?.potentials ?? [];
  for (const nd of nodes) {
    const lbKey = rec.lb ? nd > lbMaxNodes(rec, false) : false;
    const open = pots.filter((p) => p.at < nd).length;
    const slots = socketSlots(rec, nd);
    if (socketsFilled != null && !levelsKnown && slots < socketsFilled) continue;
    const maxN = levelsKnown ? 0 : open * POTENTIAL_MAX_LEVEL + slots * SOCKET_MAX_LEVEL;
    for (let n = maxN; n >= 0; n--) {
      let lv: Partial<MemberConfig> = levelsKnown ? {} : spread(pots, nd, n);
      if (!levelsKnown && socketsFilled != null) {
        // that many sockets hold 1-5 levels each; the rest of the levels are potentials
        if (n < open + socketsFilled || n > POTENTIAL_MAX_LEVEL * open + SOCKET_MAX_LEVEL * socketsFilled) continue;
        const sockets = Math.min(SOCKET_MAX_LEVEL * socketsFilled, Math.max(socketsFilled, n - POTENTIAL_MAX_LEVEL * open));
        lv = { ...spread(pots, nd, n - sockets), sockets };
      }
      const probe: MemberConfig = { ...m, ...lv, lbNodes: nd, lbKey, ccMode: "none" };
      const zero = rumbleStats(rec, probe);
      const per = rumbleStats(rec, { ...probe, ccMode: "custom", cc: { hp: 1, atk: 1, rcv: 1 } });
      const step = { hp: per.hp - zero.hp, atk: per.atk - zero.atk, rcv: per.rcv - zero.rcv };
      const cc = {
        hp: Math.round((seen.hp - zero.hp) / step.hp), atk: Math.round((seen.atk - zero.atk) / step.atk), rcv: Math.round((seen.rcv - zero.rcv) / step.rcv),
      };
      if (Object.values(cc).some((v) => !(v >= 0 && v <= MAX_CC))) continue;
      if (ccTotal != null && cc.hp + cc.atk + cc.rcv !== ccTotal) {
        // the RCV step is small: let the total settle RCV when it's close
        const r = ccTotal - cc.hp - cc.atk;
        if (r < 0 || r > MAX_CC || Math.abs(r - cc.rcv) > 2) continue;
        cc.rcv = r;
      }
      const s = rumbleStats(rec, { ...probe, ccMode: "custom", cc });
      const err = Math.abs(statUp(s.hp) - seen.hp) + Math.abs(statUp(s.atk) - seen.atk) + Math.abs(statUp(s.rcv) - seen.rcv);
      if (err <= 3 && (!best || err < best.err)) best = { m: { ...lv, lbNodes: nd, lbKey, ccMode: "custom", cc }, err, n };
      if (best?.err === 0) return best;
    }
  }
  return best;
}

/** n potential + socket levels as a build: unlocked potentials first (up to 5 each), then sockets. */
function spread(pots: NonNullable<UnitRecord["lb"]>["potentials"], nodes: number, n: number): Partial<MemberConfig> {
  let left = n;
  const potentialLevels = pots.map((p) => {
    if (p.at >= nodes) return 1; // locked: counts 0 anyway
    const v = Math.max(1, Math.min(POTENTIAL_MAX_LEVEL, left));
    left -= Math.min(POTENTIAL_MAX_LEVEL, left);
    return v;
  });
  // an unlocked potential is at least level 1: with fewer levels than open potentials this overcounts, so
  // the caller's stats check rejects it
  return { potentialLevels, sockets: left };
}

/** Max level and LLB of a "(MAX Lv.130)" reading. */
export const llbOfMaxLevel = (rec: UnitRecord, max: number) => llbForMax(rec, max);
export { LLB_EXTRA_LEVELS, withDefaults };
