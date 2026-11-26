import type { KeyGroup, ResolvedRumbleKit, UnitRecord } from "../data/schema";
import type { MemberConfig } from "./types";

export const MAX_POTENTIAL_LEVELS = 15; // 3 potentials × 5
export const MAX_SOCKET_LEVELS = 25; // 5 sockets × 5
/** Each potential ability and each socket goes up to level 5. */
export const POTENTIAL_MAX_LEVEL = 5;
export const SOCKET_MAX_LEVEL = 5;
/** Cotton candy: up to 200 per stat, 600 in total (CONFIRMED). Custom mode lifts the cap. */
export const MAX_CC = 200;
/**
 * The amounts an account's cotton candy maximum can be, per stat: one per level of that stat's monument, level 0 = 100
 * up to level 35 = 200 (user, 2026-11-17). Other amounts round up to the next one.
 */
export const CC_MONUMENT = [
  100, 101, 103, 105, 107, 110, 112, 114, 116, 118, 130, 132, 134, 136, 138, 145, 147, 149, 151, 153,
  160, 162, 164, 166, 168, 180, 182, 184, 186, 188, 190, 192, 194, 196, 198, 200,
] as const;
export const MIN_ACCOUNT_CC = CC_MONUMENT[0];
/** An amount rounded up to the next monument value (100-200). */
export const snapAccountCc = (n: number): number => CC_MONUMENT.find((v) => v >= n) ?? MAX_CC;
/** The monument level (0-35) of a monument value. */
export const ccMonumentLevel = (n: number): number => CC_MONUMENT.indexOf(snapAccountCc(n) as (typeof CC_MONUMENT)[number]);
export const MAX_CC_TOTAL = 600;
/** An account's cotton candy maximum when it isn't set (user, 2026-11-17: 180 each). */
export const DEFAULT_CC = { hp: 180, atk: 180, rcv: 180 } as const;
/** The game's cap per stat. */
const CC_CAP = { hp: MAX_CC, atk: MAX_CC, rcv: MAX_CC } as const;
/** Highest level a unit can reach (LLB 5). */
export const MAX_LEVEL_LLB = 150;
/**
 * A Rumble key can only be given to a unit at level 120 or higher (CONFIRMED) when the game's data doesn't say: the
 * game's own tier gives the level needed (`game.key.minLevel`: 120, or 99 for tier 100000; keyTierOf).
 */
export const RUMBLE_KEY_MIN_LEVEL = 120;

/**
 * Rumble key bonuses (fractions: 0.4 = +40%; ct = shorter special charge time). `vs`: the colors / classes the
 * damage taken / dealt part applies against, as UnitRecord writes them ("[DEX]", "Cerebral"): the game's key ability.
 * Without `vs` (units not in the game data) it applies against what the unit's damage resilience names (the old rule).
 */
export interface KeyBonus { hp: number; atk: number; rcv: number; def: number; spd: number; ct: number; taken: number; dealt: number; vs?: string[] }
/** Rumble key bonuses per flags.js key tier (CONFIRMED, user 2026-11-05): used for units without the game's data. */
const kb = (hp: number, atk: number, rcv: number, def: number, spd: number, ct: number, taken: number, dealt: number): KeyBonus =>
  ({ hp: hp / 100, atk: atk / 100, rcv: rcv / 100, def: def / 100, spd: spd / 100, ct: ct / 100, taken: taken / 100, dealt: dealt / 100 });
export const KEY_BONUS: Record<KeyGroup, KeyBonus> = {
  anni: kb(40, 25, 25, 15, 25, 10, 20, 15),
  super: kb(50, 30, 30, 20, 30, 10, 20, 20),
  rumbleLegend: kb(40, 25, 25, 15, 25, 10, 20, 15),
  legend: kb(30, 20, 20, 10, 20, 5, 15, 10),
  tmKizuna: kb(30, 20, 20, 10, 20, 5, 10, 5),
  rumbleRR: kb(30, 20, 20, 10, 20, 5, 10, 5),
  rr: kb(20, 15, 15, 5, 15, 0, 10, 0),
};
export const KEY_GROUP_LABELS: Record<KeyGroup, string> = {
  anni: "Anniversary / F2P legend",
  super: "Super Sugo-Fest exclusive",
  rumbleLegend: "Rumble legend",
  legend: "Regular legend",
  tmKizuna: "Treasure Map / Kizuna legend",
  rumbleRR: "Rumble rare recruit",
  rr: "Regular rare recruit",
};

/** The Rumble key a unit can take: its bonuses, the level it needs, and a label for the team editor. */
export interface KeyTier { bonus: KeyBonus; minLevel: number; label: string; from: "game" | "flags" }
const pct = (mult: number) => Math.round((mult - 1) * 1e6) / 1e6;
/** "DEX" -> "[DEX]" (UnitRecord colors); class names are written the same way in both. */
const attrName = (a: string) => (/^(STR|DEX|QCK|PSY|INT)$/.test(a) ? `[${a}]` : a);
/**
 * The unit's Rumble key tier. Units in the game's data use the game's tier (`game.key`, MstPiratesLimitBreak_:
 * multipliers, special charge, damage taken / dealt against its color or class pair, level needed); the game gives
 * some units no key at all (null: no key possible, except that an illegal / admin unit may still force the flags.js
 * tier). Units not joined to the game data keep their flags.js tier (KEY_BONUS[keyGroup], level 120).
 */
export function keyTierOf(rec: UnitRecord, illegal = false): KeyTier | null {
  const g = rec.game?.key;
  if (g) {
    const vs = g.vs.split("/").map((a) => a.trim()).filter(Boolean).map(attrName);
    const groups = g.groups.filter((x): x is KeyGroup => x in KEY_GROUP_LABELS);
    return {
      bonus: { hp: pct(g.hp), atk: pct(g.atk), rcv: pct(g.rcv), def: pct(g.def), spd: pct(g.spd), ct: -pct(g.ct) || 0, taken: g.taken / 100, dealt: g.dealt / 100, vs },
      minLevel: g.minLevel,
      label: `game tier ${g.tier}${groups.length ? `: ${groups.map((x) => KEY_GROUP_LABELS[x]).join(" / ")}` : ""}`,
      from: "game",
    };
  }
  if (rec.game && !illegal) return null;
  return { bonus: KEY_BONUS[rec.keyGroup], minLevel: RUMBLE_KEY_MIN_LEVEL, label: KEY_GROUP_LABELS[rec.keyGroup], from: "flags" };
}
/** Whether a member at this level can have a Rumble key (illegal units: always). */
export function keyAllowedAt(rec: UnitRecord, level: number, illegal = false) {
  const t = keyTierOf(rec, illegal);
  return !!t && (illegal || level >= t.minLevel);
}

/** Limit Break nodes reachable: up to the key lock, or all of them with a Limit Break key. */
export function lbMaxNodes(rec: UnitRecord, lbKey: boolean) {
  if (!rec.lb) return 0;
  const all = rec.lb.steps.length;
  return rec.lb.keyAt === null || lbKey ? all : rec.lb.keyAt;
}
/** The unit has nodes behind a Limit Break key ("LOCKED WITH KEY"). */
export const hasLbExpansion = (rec: UnitRecord) => !!rec.lb && rec.lb.keyAt !== null;
/** Extra levels unlocked per LLB level 0-5 (99 → 105 / 110 / 120 / 130 / 150). */
export const LLB_EXTRA_LEVELS = [0, 6, 11, 21, 31, 51] as const;
/** LLB level at which each part of an LLB Rumble kit unlocks, when OPTC-DB doesn't say (its most common pattern). */
export const DEFAULT_LLB_TIERS = { ability: 2, special: 4, resilience: 5, superSpecial: 5 } as const;
export type LlbTierMap = { ability: number; special: number; resilience: number; superSpecial: number };
/**
 * The unit's own LLB upgrade levels (OPTC-DB details.js lLimit; fixed per unit, not a setting). A part the unit's
 * list leaves out never upgrades (Infinity); units with no list use DEFAULT_LLB_TIERS.
 */
export const llbTiersOf = (rec: UnitRecord): LlbTierMap => {
  const t = rec.llbTiers;
  if (!t) return { ...DEFAULT_LLB_TIERS };
  return { ability: t.ability ?? Infinity, special: t.special ?? Infinity, resilience: t.resilience ?? Infinity, superSpecial: t.superSpecial ?? Infinity };
};
/** What each LLB level upgrades, for hover text: "ability LLB 2, special LLB 4, resistances LLB 5". */
export function llbUpgradesText(rec: UnitRecord): string {
  if (!rec.llbKit) return "";
  const t = llbTiersOf(rec);
  const parts: [string, number][] = [["ability", t.ability], ["special", t.special], ["resistances", t.resilience]];
  if (rec.llbKit.superSpecial) parts.push(["super special", t.superSpecial]);
  return parts.filter(([, v]) => Number.isFinite(v)).sort((a, b) => a[1] - b[1]).map(([n, v]) => `upgraded ${n} LLB ${v}`).join(", ");
}

/** Only units with a max level of 99 can be Limit Broken or Level Limit Broken (CONFIRMED). */
export const canLimitBreak = (rec: UnitRecord) => rec.maxLevel >= 99;
export const llbLevelOf = (m: MemberConfig) => clamp(Math.round(m.llbLevel ?? (m.llb ? 5 : 0)), 0, 5);
/** Max character level including Level Limit Break. */
export const maxLevelFor = (rec: UnitRecord, llbLevel: number) =>
  canLimitBreak(rec) ? rec.maxLevel + LLB_EXTRA_LEVELS[clamp(llbLevel, 0, 5)]! : rec.maxLevel;

export type Cc = { hp: number; atk: number; rcv: number };
const ccClamp = (cc: Cc, max: Cc): Cc => ({ hp: clamp(cc.hp, 0, max.hp), atk: clamp(cc.atk, 0, max.atk), rcv: clamp(cc.rcv, 0, max.rcv) });
/** An account's cotton candy maximum: each stat a monument value (100-200, others round up). */
export const accountMaxCc = (maxCc?: Cc): Cc => {
  const c = maxCc ?? DEFAULT_CC;
  return { hp: snapAccountCc(c.hp), atk: snapAccountCc(c.atk), rcv: snapAccountCc(c.rcv) };
};
/** Whether a member follows its account's cotton candy max (default), has none, or has its own amounts. */
export const ccModeOf = (m: MemberConfig): "none" | "max" | "custom" => m.ccMode ?? (m.cc ? "custom" : "max");
const NO_CC: Cc = { hp: 0, atk: 0, rcv: 0 };

/**
 * Investment defaults when a team member doesn't say otherwise: a fully built unit.
 * Legal units are kept inside the game's limits; illegal (admin / custom) units have no limits.
 * `maxCc` is the team's account cotton candy maximum.
 */
export function withDefaults(rec: UnitRecord, m: MemberConfig, maxCc?: Cc) {
  const custom = !!m.illegal;
  const llbLevel = custom || canLimitBreak(rec) ? llbLevelOf(m) : 0;
  const maxLevel = maxLevelFor(rec, llbLevel);
  const level = clamp(Math.round(m.level ?? maxLevel), 1, custom ? Math.max(maxLevel, MAX_LEVEL_LLB) : maxLevel);
  const legacyKey = m.limitBreak === "expansion" || m.limitBreak === undefined;
  const lbKey = m.lbKey ?? legacyKey;
  const lbCap = custom ? rec.lb?.steps.length ?? 0 : canLimitBreak(rec) ? lbMaxNodes(rec, lbKey) : 0;
  const legacyNodes = m.limitBreak === "none" ? 0 : m.limitBreak === "rainbow" ? lbMaxNodes(rec, false) : undefined;
  const acct = accountMaxCc(maxCc);
  const ccMode = ccModeOf(m);
  // custom amounts may go over the account max, up to the game's 200 per stat (user, 2026-11-12); illegal units: any
  const cc = ccMode === "none" ? NO_CC : ccMode === "max" ? acct : custom ? m.cc ?? acct : ccClamp(m.cc ?? acct, CC_CAP);
  const lbNodes = clamp(Math.round(m.lbNodes ?? legacyNodes ?? lbMaxNodes(rec, lbKey)), 0, lbCap);
  // Potentials (CONFIRMED): each one unlocks at its Limit Break node and is then at least level 1, up to 5.
  const pots = rec.lb?.potentials ?? [];
  // Illegal (admin) units have everything unlocked.
  const open = pots.map((p) => custom || p.at < lbNodes);
  const nOpen = open.filter(Boolean).length;
  const legacyEach = m.potentials !== undefined && !m.potentialLevels ? m.potentials / Math.max(1, nOpen) : undefined;
  // The level set for each potential (1-5), whether or not the Limit Break has unlocked it yet
  const potentialChosen = pots.map((_, i) => clamp(Math.round(m.potentialLevels?.[i] ?? legacyEach ?? POTENTIAL_MAX_LEVEL), 1, POTENTIAL_MAX_LEVEL));
  // ...and what counts for stats: 0 while still locked
  const potentialLevels = potentialChosen.map((v, i) => (open[i] ? v : 0));
  let potentials = potentialLevels.reduce((a, b) => a + b, 0);
  if (custom && !pots.length && m.potentials !== undefined) potentials = clamp(m.potentials, 0, MAX_POTENTIAL_LEVELS);
  // Sockets: up to level 5 per slot; some units get extra slots from Limit Break nodes.
  // Socket slots unlocked by Limit Break nodes count only once reached; illegal units get every slot (at least 5).
  const slots = custom ? Math.max(5, socketSlots(rec, Infinity)) : socketSlots(rec, lbNodes);
  const slotsMax = custom ? slots : socketSlots(rec, Infinity);
  // Limit Break nodes still to reach for more slots (legal units)
  const lockedSocketNodes = custom ? [] : (rec.lb?.socketNodes ?? []).filter((s) => s.at >= lbNodes);
  return {
    illegal: custom,
    llbLevel,
    maxLevel,
    level,
    lbKey,
    lbNodes,
    // the game's tier and level needed; a unit the game gives no key can't have one (illegal units may force one)
    rumbleKey: !!m.rumbleKey && keyAllowedAt(rec, level, custom),
    keyGroup: rec.keyGroup, // always the unit's own tier from OPTC-DB (CONFIRMED: not a choice); fallback of keyTier
    /** The key tier used (null: the game gives this unit no key). */
    keyTier: keyTierOf(rec, custom),
    ccMode,
    cc,
    /** Level of each potential ability that counts for stats (0 = still locked). */
    potentialLevels,
    /** Level set for each potential ability (1-5), counted only once unlocked. */
    potentialChosen,
    potentialsOpen: open,
    potentials,
    socketSlots: slots,
    /** Socket slots with the whole Limit Break; more than socketSlots when the Limit Break limits them. */
    socketSlotsMax: slotsMax,
    lockedSocketNodes,
    sockets: clamp(Math.round(m.sockets ?? SOCKET_MAX_LEVEL * slots), 0, SOCKET_MAX_LEVEL * slots),
    specialLevel: clamp(Math.round(m.specialLevel ?? 10), 1, Math.max(1, rec.kit.specials.length)),
    abilityLevel: clamp(Math.round(m.abilityLevel ?? 5), 1, Math.max(1, rec.kit.abilities.length)),
  };
}

/**
 * HP/ATK/RCV at a unit level: OPTC's growth curve up to the normal max level, then the LLB
 * curve above 99 (same as OPTC-DB's damage calculator: max × (1 + 0.5 × (1 − (150 − L)/51))).
 */
export function statsAtLevel(rec: UnitRecord, level: number) {
  if (rec.maxLevel >= 99 && level > rec.maxLevel) {
    const k = 1 + 0.5 * (1 - (150 - Math.min(150, level)) / 51);
    return { hp: Math.floor(rec.stats.hp * k), atk: Math.floor(rec.stats.atk * k), rcv: Math.floor(rec.stats.rcv * k) };
  }
  const span = rec.maxLevel - 1;
  // the growth curve: one for all stats, or one per stat [HP, ATK, RCV] (a few OPTC-DB units, e.g. Lao G.; taking the
  // list as one number made their HP NaN: unkillable in the simulator)
  const g = (i: number) => (Array.isArray(rec.growth) ? rec.growth[i] : rec.growth) || 1;
  const f = (i: number) => (span > 0 ? Math.pow((clamp(level, 1, rec.maxLevel) - 1) / span, g(i)) : 1);
  // Stats never go below 0 (e.g. Pacifista RCV is negative at low level in OPTC-DB but shows 0 in game).
  // The game's level stats are whole numbers, rounded DOWN (MEASURED: 5 Pacifistas below max level, e.g. PX-4 lv 19
  // curve 2,002.35 HP -> 2,002 in game; rounding up would be 1 off on all 5). Rumble stats built on them stay unrounded.
  const at = (min: number, max: number, i: number) => Math.max(0, Math.floor(min + (max - min) * f(i)));
  return {
    hp: at(rec.minStats.hp, rec.stats.hp, 0),
    atk: at(rec.minStats.atk, rec.stats.atk, 1),
    rcv: at(rec.minStats.rcv, rec.stats.rcv, 2),
  };
}

/** The stats shown on the character screen: level stats + Limit Break + cotton candy. */
export function displayedStats(rec: UnitRecord, m: MemberConfig, maxCc?: Cc) {
  if (m.displayed) return m.displayed;
  const d = withDefaults(rec, m, maxCc);
  const base = statsAtLevel(rec, d.level);
  const [lhp, latk, lrcv] = (d.lbNodes > 0 && rec.lb?.steps[d.lbNodes - 1]) || [0, 0, 0];
  return {
    hp: base.hp + lhp + 5 * d.cc.hp,
    atk: base.atk + latk + 2 * d.cc.atk,
    rcv: base.rcv + lrcv + d.cc.rcv,
  };
}

/** The Rumble key bonus a member gets, or undefined without a (usable) key. */
export function keyBonusFor(rec: UnitRecord, m: MemberConfig): KeyBonus | undefined {
  const d = withDefaults(rec, m);
  return d.rumbleKey && d.keyTier ? d.keyTier.bonus : undefined;
}

/**
 * Rumble base HP/ATK/RCV from the stats shown on the character screen (SHEET, confirmed current):
 *   stat × (1 + k × (potential levels + socket levels) × mainSpecialLv / mainSpecialMax), the main-game special
 *   (not the Rumble one; user, Luffy 2087 / Usohachi 2806 status screens).
 */
export function rumbleBaseStats(
  displayed: { hp: number; atk: number; rcv: number },
  lbNodesAndSockets: number,
  specialLevel: number,
  maxSpecialLevel = 10,
): { hp: number; atk: number; rcv: number } {
  const f = (lbNodesAndSockets * specialLevel) / maxSpecialLevel;
  return {
    hp: displayed.hp * (1 + 0.015 * f),
    atk: displayed.atk * (1 + 0.0075 * f),
    rcv: displayed.rcv * (1 + 0.0025 * f),
  };
}

/** Rumble HP/ATK/RCV before any buffs (displayed stats × the potentials/sockets/special-level multiplier). */
export function rumbleStats(rec: UnitRecord, m: MemberConfig, maxCc?: Cc) {
  // Exact stats (illegal units only) are the Rumble status screen, which already includes any Rumble key.
  if (m.illegal && m.exact) return { hp: m.exact.hp, atk: m.exact.atk, rcv: m.exact.rcv };
  const d = withDefaults(rec, m, maxCc);
  // The multiplier scales with special level / max special level, so units without a Rumble special get none
  // (verified against in-game stats for kit-less units, 2026-11-05).
  const maxSp = rec.kit.specials.length;
  const n = m.lbNodesAndSockets ?? d.potentials + d.sockets;
  // The multiplier's special term is the MAIN-GAME special level / max (not the Rumble special): Luffy 2087 with Rumble
  // special 1/10 and 7 socket levels has 2,566 = 2,322 x (1 + 0.015 x 7); Usohachi (main special MAX, Rumble 3/10,
  // potentials 5+5+3, sockets 1+2+1+1+2 = 20) 3,894 = 2,995 x 1.3 (user's status screens, 2026-11-09).
  const msMax = Math.max(1, rec.specialLevels ?? 1);
  const msLevel = clamp(m.mainSpecialLevel ?? msMax, 1, msMax);
  const s = maxSp === 0 ? { ...displayedStats(rec, m, maxCc) } : rumbleBaseStats(displayedStats(rec, m, maxCc), n, msLevel, msMax);
  const key = keyBonusFor(rec, m);
  if (!key) return s;
  // Unrounded: calculations use the exact values; displays round up (statUp)
  return { hp: s.hp * (1 + key.hp), atk: s.atk * (1 + key.atk), rcv: s.rcv * (1 + key.rcv) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The Rumble kit a member uses: each part switches to its LLB version once the member's LLB
 * level reaches that part's unlock level (`llbTiers`).
 */
export function kitFor(rec: UnitRecord, m: MemberConfig): ResolvedRumbleKit {
  const llb = rec.llbKit;
  if (!llb) return rec.kit;
  const lvl = llbLevelOf(m);
  const tiers = llbTiersOf(rec);
  const ab = lvl >= tiers.ability;
  const rs = lvl >= tiers.resilience;
  const sp = lvl >= tiers.special;
  const ss = lvl >= tiers.superSpecial;
  if (!ab && !rs && !sp && !ss) return rec.kit;
  return {
    ...rec.kit,
    abilities: ab ? llb.abilities : rec.kit.abilities,
    resilience: rs ? llb.resilience : rec.kit.resilience,
    specials: sp ? llb.specials : rec.kit.specials,
    superSpecial: ss && llb.superSpecial ? llb.superSpecial : rec.kit.superSpecial,
  };
}

/** Which LLB parts are active for a member, for display. */
export function llbPartsActive(rec: UnitRecord, m: MemberConfig) {
  if (!rec.llbKit) return [];
  const lvl = llbLevelOf(m);
  const t = llbTiersOf(rec);
  const parts: string[] = [];
  if (lvl >= t.ability) parts.push("ability");
  if (lvl >= t.special) parts.push("special");
  if (lvl >= t.resilience) parts.push("resistances");
  if (lvl >= t.superSpecial && rec.llbKit.superSpecial) parts.push("super special");
  return parts;
}

/** How a stat is shown: always rounded up (calculations keep the unrounded value). Ignores float noise. */
export const statUp = (v: number) => Math.ceil(v - 1e-6) || 0; // "|| 0": no -0

/** DEF and SPD: fixed per unit, raised by a Rumble key; exact stats (custom mode) override them. */
export function rumbleDefSpd(rec: UnitRecord, m: MemberConfig) {
  const key = keyBonusFor(rec, m);
  const ex = m.illegal ? m.exact : undefined;
  return {
    def: ex?.def ?? rec.stats.def * (1 + (key?.def ?? 0)),
    spd: ex?.spd ?? rec.stats.spd * (1 + (key?.spd ?? 0)),
  };
}

/** Socket slots at a Limit Break progress: the unit's own slots plus any unlocked by Limit Break nodes. */
export const socketSlots = (rec: UnitRecord, lbNodes: number) =>
  (rec.sockets ?? 0) + (rec.lb?.socketNodes ?? []).filter((s) => s.at < lbNodes).reduce((a, s) => a + s.n, 0);

/** Team cost of one member: illegal (admin) units cost nothing. */
export const memberCost = (rec: UnitRecord | undefined, m: MemberConfig) => (m.illegal ? 0 : rec?.cost ?? 0);

/**
 * Stored values brought back inside the game's limits (used when a unit is marked legal again):
 * levels, Limit Break, cotton candy and the Rumble key are clamped, and exact stats are dropped.
 */
export function legalize(rec: UnitRecord, m: MemberConfig, maxCc?: Cc): MemberConfig {
  const { exact: _exact, illegal: _illegal, ...rest } = m;
  void _exact; void _illegal;
  const d = withDefaults(rec, rest, maxCc);
  return {
    ...rest,
    level: d.level,
    llbLevel: d.llbLevel,
    lbNodes: d.lbNodes,
    lbKey: canLimitBreak(rec) ? d.lbKey : false,
    rumbleKey: d.rumbleKey,
    potentialLevels: d.potentialChosen,
    potentials: undefined,
    sockets: d.sockets,
    ...(d.ccMode === "custom" ? { cc: d.cc } : {}),
  };
}

/**
 * What marking an illegal unit legal would change (each line "what: now -> legal"), for the Legal checkbox's hover.
 * Empty when nothing changes but the cost.
 */
export function legalizeChanges(rec: UnitRecord, m: MemberConfig, maxCc?: Cc): string[] {
  if (!m.illegal) return [];
  const legal = legalize(rec, m, maxCc);
  const a = withDefaults(rec, m, maxCc);
  const b = withDefaults(rec, legal, maxCc);
  const out: string[] = [];
  const diff = (what: string, x: string | number, y: string | number) => { if (x !== y) out.push(`${what}: ${x} → ${y}`); };
  const ccText = (c: Cc) => `${c.hp}/${c.atk}/${c.rcv}`;
  diff("Level", a.level, b.level);
  diff("LLB", a.llbLevel, b.llbLevel);
  diff("Limit Break nodes", a.lbNodes, b.lbNodes);
  diff("Limit Break key", a.lbKey && hasLbExpansion(rec) ? "on" : "off", b.lbKey && hasLbExpansion(rec) ? "on" : "off");
  diff("Rumble key", a.rumbleKey ? "on" : "off", b.rumbleKey ? "on" : "off");
  diff("Cotton candy", ccText(a.cc), ccText(b.cc));
  const locked = a.potentialsOpen.map((o, i) => (o && !b.potentialsOpen[i] ? rec.lb?.potentials[i]?.name : undefined)).filter(Boolean);
  if (locked.length) out.push(`Potentials not unlocked by the Limit Break count 0: ${locked.join(", ")}`);
  diff("Potential levels counted", a.potentials, b.potentials);
  diff("Socket slots", a.socketSlots, b.socketSlots);
  diff("Socket levels", a.sockets, b.sockets);
  const sa = { ...rumbleStats(rec, m, maxCc), ...rumbleDefSpd(rec, m) };
  const sb = { ...rumbleStats(rec, legal, maxCc), ...rumbleDefSpd(rec, legal) };
  if (m.exact) out.push("Typed-in stats are replaced by calculated ones");
  for (const k of ["hp", "atk", "rcv", "def", "spd"] as const)
    diff(k.toUpperCase(), statUp(sa[k]).toLocaleString("en-US"), statUp(sb[k]).toLocaleString("en-US"));
  if (rec.cost) out.push(`Team cost: +${rec.cost} (illegal units cost 0)`);
  return out;
}

/** A quick build (editable in Settings). */
export interface PresetDef {
  label: string;
  level: number;
  /** LLB level (raised automatically if `level` needs more). */
  llbLevel: number;
  /** Limit Break: none, all nodes up to the key lock, or everything with the Limit Break key. */
  lb: "none" | "regular" | "expanded";
  rumbleKey: boolean;
  /** Max Rumble special and ability levels (otherwise level 1). */
  maxSkills: boolean;
  /** Level of every unlocked potential ability (1-5); premium ones only when `premiumPotentials`, else level 1. */
  potentialLevel: number;
  /** Also raise the premium potentials (Super Tandem, Last Tap, Rush, ...: PREMIUM_POTENTIALS) to `potentialLevel`. */
  premiumPotentials?: boolean;
  /** Level of every available socket slot (0-5). */
  socketLevel: number;
  /**
   * Cotton candy: none (0), the account max, "maxPossible" (custom 200/200/200; legal units still stop at the
   * account max), or leave each unit's as it is. Default "keep".
   */
  cc?: "none" | "max" | "maxPossible" | "keep";
  /** Use `advanced` instead of the simple fields above (the label stays). */
  useAdvanced?: boolean;
  /** Advanced mode: finer control (kept when advanced mode is switched off, so it can be switched back on). */
  advanced?: AdvancedPreset;
  /** The advanced panel is folded away in Settings (display only). */
  advancedCollapsed?: boolean;
}

/**
 * An advanced quick build [user 2026-11-18]. Skill levels: undefined = the unit's max, a number is capped at the unit's
 * max. Potentials: a level per potential name; names not listed get `premiumDefault` (premium ones) or
 * `potentialDefault` (the rest).
 */
export interface AdvancedPreset {
  level: number;
  llbLevel: number;
  lb: "none" | "regular" | "expanded";
  /** At most this many Limit Break nodes (undefined: every node `lb` allows). */
  lbNodes?: number;
  rumbleKey: boolean;
  specialLevel?: number;
  abilityLevel?: number;
  /** Main-game special level (scales the potential / socket stat bonus). */
  mainSpecialLevel?: number;
  potentialDefault: number;
  /** Level of the premium potentials (PREMIUM_POTENTIALS) not listed in `potentials` (older saves: `potentialDefault`). */
  premiumDefault?: number;
  potentials: Record<string, number>;
  socketLevel: number;
  cc: "none" | "max" | "keep" | "custom";
  ccCustom: { hp: number; atk: number; rcv: number };
}

/** An advanced build that does what the simple preset `p` does (the starting point when advanced mode is switched on). */
export function advancedFrom(p: PresetDef): AdvancedPreset {
  return {
    level: p.level, llbLevel: p.llbLevel, lb: p.lb, rumbleKey: p.rumbleKey,
    specialLevel: p.maxSkills ? undefined : 1, abilityLevel: p.maxSkills ? undefined : 1, mainSpecialLevel: p.maxSkills ? undefined : 1,
    potentialDefault: p.potentialLevel,
    premiumDefault: p.premiumPotentials ? p.potentialLevel : 1,
    potentials: {},
    socketLevel: p.socketLevel,
    cc: p.cc === "maxPossible" ? "custom" : p.cc ?? "keep",
    ccCustom: { hp: MAX_CC, atk: MAX_CC, rcv: MAX_CC },
  };
}

/** A potential's level in an advanced build: its own entry or the default; a combined one ("Super Tandem/Last Tap") the lowest of its parts'. */
export function advancedPotential(a: AdvancedPreset, name: string): number {
  return Math.min(...name.split("/").map((x) => x.trim()).map((x) =>
    a.potentials[x] ?? (PREMIUM_POTENTIALS.includes(x) ? a.premiumDefault ?? a.potentialDefault : a.potentialDefault)));
}

/** Every potential ability name in the database (combined ones split into their parts), A-Z. */
export function potentialNames(recs: Iterable<UnitRecord>): string[] {
  const out = new Set<string>();
  for (const r of recs) for (const p of r.lb?.potentials ?? []) for (const x of p.name.split("/")) if (x.trim()) out.add(x.trim());
  return [...out].sort();
}

/** LLB level needed to reach a given level (120 → LLB 3 with the 99/105/110/120/130/150 caps). */
export const llbFor = (level: number) => Math.max(0, LLB_EXTRA_LEVELS.findIndex((x) => 99 + x >= level));

export const DEFAULT_PRESETS: PresetDef[] = [
  { label: "Lv 1", level: 1, llbLevel: 0, lb: "none", rumbleKey: false, maxSkills: false, potentialLevel: 1, premiumPotentials: false, socketLevel: 0, cc: "none" },
  { label: "Lv 99", level: 99, llbLevel: 0, lb: "regular", rumbleKey: false, maxSkills: true, potentialLevel: 1, premiumPotentials: false, socketLevel: 5, cc: "none" },
  { label: "Lv 120", level: 120, llbLevel: llbFor(120), lb: "regular", rumbleKey: true, maxSkills: true, potentialLevel: 5, premiumPotentials: false, socketLevel: 5, cc: "max" },
  { label: "MAX", level: MAX_LEVEL_LLB, llbLevel: 5, lb: "expanded", rumbleKey: true, maxSkills: true, potentialLevel: 5, premiumPotentials: true, socketLevel: 5, cc: "max" },
];

/**
 * The premium potential abilities (user, 2026-11-17): a quick build leaves them at level 1 unless it says otherwise.
 * Combined ones ("Super Tandem/Last Tap") count when every part is premium.
 */
export const PREMIUM_POTENTIALS = ["Super Tandem", "Last Tap", "Rush", "Damage Limit Break: Class", "Damage Limit Break: Type", "Super Tandem Boost"];
export const isPremiumPotential = (name: string) => name.split("/").every((part) => PREMIUM_POTENTIALS.includes(part.trim()));

/**
 * Apply a quick build. Units that can't Limit Break stop at their own max level with no LLB, Limit Break or
 * Rumble key; a Rumble key needs its tier's level and a unit the game gives a key (legal units). Cotton candy follows the build's `cc` (none / account max /
 * keep); legal status and typed-in stats are kept.
 */
export function applyPreset(rec: UnitRecord, m: MemberConfig, p: PresetDef): MemberConfig {
  if (p.useAdvanced && p.advanced) return applyAdvanced(rec, m, p.advanced);
  const cc: Pick<MemberConfig, "ccMode" | "cc"> =
    p.cc === "none" ? { ccMode: "none" }
    : p.cc === "max" ? { ccMode: "max" }
    : p.cc === "maxPossible" ? { ccMode: "custom", cc: { hp: MAX_CC, atk: MAX_CC, rcv: MAX_CC } }
    : { ccMode: m.ccMode, cc: m.cc };
  const keep: MemberConfig = { unitId: m.unitId, illegal: m.illegal, ...cc, exact: m.exact };
  const lbOk = canLimitBreak(rec);
  const llbLevel = lbOk ? clamp(Math.max(p.llbLevel, llbFor(p.level)), 0, 5) : 0;
  const level = clamp(Math.round(p.level), 1, maxLevelFor(rec, llbLevel));
  const lbNodes = !lbOk || p.lb === "none" ? 0 : lbMaxNodes(rec, p.lb === "expanded");
  return {
    ...keep,
    level,
    llbLevel,
    lbKey: lbOk && p.lb === "expanded",
    lbNodes,
    rumbleKey: p.rumbleKey && keyAllowedAt(rec, level, !!m.illegal),
    specialLevel: p.maxSkills ? Math.max(1, rec.kit.specials.length) : 1,
    mainSpecialLevel: p.maxSkills ? Math.max(1, rec.specialLevels ?? 1) : 1,
    abilityLevel: p.maxSkills ? Math.max(1, rec.kit.abilities.length) : 1,
    // Locked potentials stay at 0 (withDefaults); unlocked ones get the build's level.
    potentialLevels: (rec.lb?.potentials ?? []).map((pot) =>
      isPremiumPotential(pot.name) && !p.premiumPotentials ? 1 : clamp(p.potentialLevel, 1, POTENTIAL_MAX_LEVEL)),
    sockets: clamp(p.socketLevel, 0, SOCKET_MAX_LEVEL) * socketSlots(rec, lbNodes),
  };
}

/**
 * A build raised to at least a quick build, part by part (generator "every unit at least", user 2026-11-24): level and
 * LLB, Limit Break nodes, Rumble key, special / ability / main special levels, each potential, sockets and each cotton
 * candy stat take the higher of the two; nothing goes down. Typed-in (illegal / exact) builds are kept as they are.
 */
export function atLeastPreset(rec: UnitRecord, m: MemberConfig, p: PresetDef, maxCc?: Cc): MemberConfig {
  if (m.illegal || m.exact) return m;
  const floor = applyPreset(rec, { unitId: m.unitId, ccMode: "none" }, p);
  const a = withDefaults(rec, m, maxCc), b = withDefaults(rec, floor, maxCc);
  const llbLevel = Math.max(a.llbLevel, b.llbLevel);
  const level = clamp(Math.max(a.level, b.level), 1, maxLevelFor(rec, llbLevel));
  const lbNodes = Math.max(a.lbNodes, b.lbNodes);
  const lbKey = (a.lbKey && a.lbNodes === lbNodes) || (b.lbKey && b.lbNodes === lbNodes) || lbNodes > lbMaxNodes(rec, false);
  const cc = { hp: Math.max(a.cc.hp, b.cc.hp), atk: Math.max(a.cc.atk, b.cc.atk), rcv: Math.max(a.cc.rcv, b.cc.rcv) };
  const ccSame = cc.hp === a.cc.hp && cc.atk === a.cc.atk && cc.rcv === a.cc.rcv;
  const msMax = Math.max(1, rec.specialLevels ?? 1);
  return {
    ...m,
    level, llbLevel, lbNodes, lbKey,
    rumbleKey: (a.rumbleKey || b.rumbleKey) && keyAllowedAt(rec, level, false),
    specialLevel: Math.max(a.specialLevel, b.specialLevel),
    abilityLevel: Math.max(a.abilityLevel, b.abilityLevel),
    mainSpecialLevel: Math.max(clamp(Math.round(m.mainSpecialLevel ?? msMax), 1, msMax), floor.mainSpecialLevel ?? 1),
    potentialLevels: a.potentialChosen.map((v, i) => Math.max(v, b.potentialChosen[i] ?? 1)),
    sockets: Math.max(a.sockets, b.sockets),
    ...(ccSame ? {} : { ccMode: "custom" as const, cc }),
  };
}

/** An advanced quick build: the same rules as applyPreset, with each part set on its own. */
function applyAdvanced(rec: UnitRecord, m: MemberConfig, a: AdvancedPreset): MemberConfig {
  const cc: Pick<MemberConfig, "ccMode" | "cc"> =
    a.cc === "none" ? { ccMode: "none" }
    : a.cc === "max" ? { ccMode: "max" }
    : a.cc === "custom" ? { ccMode: "custom", cc: { hp: clamp(a.ccCustom.hp, 0, MAX_CC), atk: clamp(a.ccCustom.atk, 0, MAX_CC), rcv: clamp(a.ccCustom.rcv, 0, MAX_CC) } }
    : { ccMode: m.ccMode, cc: m.cc };
  const keep: MemberConfig = { unitId: m.unitId, illegal: m.illegal, ...cc, exact: m.exact };
  const lbOk = canLimitBreak(rec);
  const llbLevel = lbOk ? clamp(Math.max(a.llbLevel, llbFor(a.level)), 0, 5) : 0;
  const level = clamp(Math.round(a.level), 1, maxLevelFor(rec, llbLevel));
  const allNodes = !lbOk || a.lb === "none" ? 0 : lbMaxNodes(rec, a.lb === "expanded");
  const lbNodes = a.lbNodes === undefined ? allNodes : clamp(Math.round(a.lbNodes), 0, allNodes);
  const lv = (want: number | undefined, max: number) => (want === undefined ? max : clamp(Math.round(want), 1, max));
  return {
    ...keep,
    level,
    llbLevel,
    lbKey: lbOk && a.lb === "expanded",
    lbNodes,
    rumbleKey: a.rumbleKey && keyAllowedAt(rec, level, !!m.illegal),
    specialLevel: lv(a.specialLevel, Math.max(1, rec.kit.specials.length)),
    mainSpecialLevel: lv(a.mainSpecialLevel, Math.max(1, rec.specialLevels ?? 1)),
    abilityLevel: lv(a.abilityLevel, Math.max(1, rec.kit.abilities.length)),
    potentialLevels: (rec.lb?.potentials ?? []).map((pot) => clamp(advancedPotential(a, pot.name), 1, POTENTIAL_MAX_LEVEL)),
    sockets: clamp(a.socketLevel, 0, SOCKET_MAX_LEVEL) * socketSlots(rec, lbNodes),
  };
}
