import type { UnitRecord } from "../data/schema";
import type { MemberConfig, TeamConfig } from "./types";
import nydatoSheet from "./nydato-comps.json";

/**
 * The user's reference matchup (2026-11-05), matching the in-game Rumble status screens.
 * Legal units (the Pacifistas and Shooter Group crews, color-variant sets) use their level and cotton candy, which
 * reproduce the in-game stats exactly. Buggy, Mohji & Richie, Cabaji and Alvida have cotton candy over the 200 cap
 * (admin team), so they're illegal and keep the exact stats from the game.
 * None of these units has a Rumble special or ability; all attack normally and target the closest enemy.
 */
export const DEFAULT_ATTACKERS: TeamConfig = {
  name: "Pacifista team",
  members: [
    { ccMode: "custom", unitId: 971, cc: { hp: 0, atk: 0, rcv: 0 }, lbNodes: 0, level: 19 }, // Pacifista PX-4 [STR]
    { ccMode: "custom", unitId: 969, cc: { hp: 0, atk: 0, rcv: 0 }, lbNodes: 0, level: 7 }, // Pacifista PX-2 [PSY]
    { ccMode: "custom", unitId: 968, cc: { hp: 0, atk: 0, rcv: 0 }, lbNodes: 0, level: 14 }, // Pacifista PX-1 [DEX]
    { ccMode: "custom", unitId: 972, cc: { hp: 0, atk: 0, rcv: 0 }, lbNodes: 0, level: 10 }, // Pacifista PX-5 [INT]
    { ccMode: "custom", unitId: 970, cc: { hp: 0, atk: 0, rcv: 0 }, lbNodes: 0, level: 8 }, // Pacifista PX-3 [QCK]
  ],
};

export const DEFAULT_DEFENDERS: TeamConfig = {
  name: "Buggy team",
  members: [
    { illegal: true, ccMode: "custom", unitId: 39, cc: { hp: 400, atk: 100, rcv: 0 }, lbNodes: 0, exact: { hp: 3666, atk: 957, rcv: 135, def: 50, spd: 100 } }, // Buggy the Clown
    { illegal: true, ccMode: "custom", unitId: 36, cc: { hp: 300, atk: 100, rcv: 0 }, lbNodes: 0, exact: { hp: 2572, atk: 759, rcv: 55, def: 50, spd: 100 } }, // Mohji & Richie
    { illegal: true, ccMode: "custom", unitId: 37, cc: { hp: 300, atk: 100, rcv: 0 }, lbNodes: 0, exact: { hp: 2324, atk: 658, rcv: 130, def: 50, spd: 100 } }, // Cabaji the Acrobat
    { ccMode: "custom", unitId: 161, cc: { hp: 150, atk: 150, rcv: 0 }, lbNodes: 0 }, // Shooter Group Crew - Black Pirates
    { ccMode: "custom", unitId: 158, cc: { hp: 0, atk: 50, rcv: 0 }, lbNodes: 0 }, // Shooter Group Crew - Blue Pirates
    { ccMode: "custom", unitId: 159, cc: { hp: 150, atk: 50, rcv: 0 }, lbNodes: 0 }, // bench 1: Shooter Group Crew - Green Pirates
    { ccMode: "custom", unitId: 160, cc: { hp: 150, atk: 50, rcv: 0 }, lbNodes: 0 }, // bench 2: Shooter Group Crew - Yellow Pirates
    { illegal: true, ccMode: "custom", unitId: 30, cc: { hp: 300, atk: 150, rcv: 0 }, lbNodes: 0, exact: { hp: 3168, atk: 1299, rcv: 369, def: 50, spd: 100 } }, // bench 3: Iron-Mace Alvida
  ],
};

export const defaultTeams = (): [TeamConfig, TeamConfig] => [
  structuredClone(DEFAULT_ATTACKERS),
  structuredClone(DEFAULT_DEFENDERS),
];

/**
 * Test run 2 (2026-11-06): Luffy "Let's Go to the Pirate Festival!" (lv 101, special lv 1, ability lv 1) replaces
 * Pacifista PX-4 in slot 1. Stats copied from his Rumble status screen (marked illegal only so the exact stats apply; his Limit Break isn't known). Used with RUN2_RULES against DEFAULT_DEFENDERS.
 */
export const LUFFY_ATTACKERS: TeamConfig = {
  name: "Luffy + Pacifistas",
  members: [
    { illegal: true, ccMode: "custom", unitId: 2087, specialLevel: 1, abilityLevel: 1, cc: { hp: 0, atk: 0, rcv: 0 }, exact: { hp: 2566, atk: 1425, rcv: 133, def: 102, spd: 150 } }, // Luffy [STR]
    ...DEFAULT_ATTACKERS.members.slice(1),
  ],
};

/**
 * Test run 3 (2026-11-06): King "King the Wildfire" 3137 (lv 11, special lv 1, ability lv 1, SPD 196) replaces
 * Pacifista PX-2 in slot 2, after Luffy. Stats from his Rumble status screen (illegal so the exact stats apply). Used
 * with RUN2_RULES (same rules) against DEFAULT_DEFENDERS.
 */
export const KING_ATTACKERS: TeamConfig = {
  name: "Luffy + King + Pacifistas",
  members: [
    LUFFY_ATTACKERS.members[0]!,
    { illegal: true, ccMode: "custom", unitId: 3137, specialLevel: 1, abilityLevel: 1, cc: { hp: 0, atk: 0, rcv: 0 }, exact: { hp: 1552, atk: 970, rcv: 94, def: 110, spd: 196 } }, // King [STR]
    ...DEFAULT_ATTACKERS.members.slice(2),
  ],
};

/**
 * Test run 4 (2026-11-06): Nico Robin "Gratitude to the Ship Doctor" 4375 (lv 120, special and ability MAX: special
 * lv 10, ability lv 5 = crew SPD up lv 5; her ATK/DEF/Accuracy down needs 4+ Straw Hats, only 2 here) replaces
 * Pacifista PX-1 in slot 3, after Luffy and King. Stats from her Rumble status screen (illegal so the exact stats apply).
 * Used with RUN4_RULES (run 2's + Paramythia-type damage dealt +30 % / taken -30 %) against DEFAULT_DEFENDERS. The test
 * of how SPD buffs change the queue.
 */
export const ROBIN_ATTACKERS: TeamConfig = {
  name: "Luffy + King + Robin + Pacifistas",
  members: [
    KING_ATTACKERS.members[0]!,
    KING_ATTACKERS.members[1]!,
    { illegal: true, ccMode: "custom", unitId: 4375, specialLevel: 10, abilityLevel: 5, cc: { hp: 0, atk: 0, rcv: 0 }, exact: { hp: 8380, atk: 3049, rcv: 471, def: 156, spd: 166 } }, // Nico Robin [PSY], no Rumble key; her Paramythia tag deals +30% (RUN4_RULES)
    ...DEFAULT_ATTACKERS.members.slice(3),
  ],
};

/**
 * Test run 5 (2026-11-07): Usohachi "Toad-Oil Salesman" 2806 (lv 101, special lv 3, ability lv 5 = Team Blow Away % Up
 * Lv.5) replaces Pacifista PX-4 in slot 1, as Luffy did in run 2. The data links 2806 to 2805's Rumble kit; 2806 keeps
 * its own [Land of Wano Arc] tag (run 7's rules boost it). Exact stats from his Rumble status screen (HP 3,894, ATK
 * 1,949, RCV 503, DEF 128, SPD 133). Used with RUN2_RULES (run 5) and RUN6_RULES (run 7) against DEFAULT_DEFENDERS.
 */
export const USOHACHI_ATTACKERS: TeamConfig = {
  name: "Usohachi + Pacifistas",
  members: [
    { illegal: true, ccMode: "custom", unitId: 2806, specialLevel: 3, abilityLevel: 5, cc: { hp: 0, atk: 0, rcv: 0 }, exact: { hp: 3894, atk: 1949, rcv: 503, def: 128, spd: 133 } }, // Usohachi [STR]
    ...DEFAULT_ATTACKERS.members.slice(1),
  ],
};

/**
 * Test run 6 (2026-11-09): Kizaru "Invading Navy Admiral" 3704 (lv 130, special and ability MAX: Shooters ATK / SPD up
 * lv 6, so himself and the four Pacifistas; base SPD 247 -> 277, the fastest a unit gets) replaces Pacifista PX-4 in
 * slot 1, as Luffy and Usohachi did. Exact stats from his Rumble status screen: HP 9,005, ATK 3,387, RCV 577, DEF 122,
 * SPD 247. Used with RUN6_RULES against DEFAULT_DEFENDERS. Test run 7 is USOHACHI_ATTACKERS with the same rules.
 */
export const KIZARU_ATTACKERS: TeamConfig = {
  name: "Kizaru + Pacifistas",
  members: [
    { illegal: true, ccMode: "custom", unitId: 3704, llbLevel: 4, specialLevel: 10, abilityLevel: 5, cc: { hp: 0, atk: 0, rcv: 0 }, exact: { hp: 9005, atk: 3387, rcv: 577, def: 122, spd: 247 } }, // Kizaru [QCK], LLB 4: LLB ability (adds Shooter HP up) and LLB special
    ...DEFAULT_ATTACKERS.members.slice(1),
  ],
};

/**
 * The teams of the recorded test runs, offered in the left panel's Saved teams (and their special units in Recent
 * units) so they can be loaded with one click. Each run's global rules are listed in src/engine/rules.ts (DEFAULT_RULES
 * run 1, RUN2_RULES runs 2, 3, 5, RUN4_RULES run 4, RUN6_RULES runs 6-7); the opponent is always DEFAULT_DEFENDERS.
 */
export const TEST_TEAMS: { id: string; title: string; team: TeamConfig }[] = [
  { id: "test-run-1", title: "Test run 1: 5 Pacifistas", team: DEFAULT_ATTACKERS },
  { id: "test-run-2", title: "Test run 2: Luffy 2087 + Pacifistas", team: LUFFY_ATTACKERS },
  { id: "test-run-3", title: "Test run 3: Luffy + King 3137 + Pacifistas", team: KING_ATTACKERS },
  { id: "test-run-4", title: "Test run 4: Luffy + King + Robin 4375 + Pacifistas", team: ROBIN_ATTACKERS },
  { id: "test-run-5", title: "Test runs 5 / 7: Usohachi 2806 + Pacifistas", team: USOHACHI_ATTACKERS },
  { id: "test-run-6", title: "Test run 6: Kizaru 3704 + Pacifistas", team: KIZARU_ATTACKERS },
  { id: "test-opponent", title: "Test opponent: Buggy team (Buggy, Mohji, Cabaji, Shooter crews, Alvida)", team: DEFAULT_DEFENDERS },
];

/** When Nydato made the teams below (2026-11-14). */
export const NYDATO_DATE = new Date(2026, 10, 14, 12).getTime();
const nydato = (m: MemberConfig) => ({ ...m, ccMode: "max" as const, level: 120, llbLevel: 3, lbKey: false, rumbleKey: true, specialLevel: 10, abilityLevel: 5, sockets: 25 });

export const NYDATO_STR: TeamConfig = {
  maxCc: { hp: 180, atk: 180, rcv: 180 },
  members: [
    nydato({ unitId: 4571, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 1, 1] }),
    nydato({ unitId: 4547, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 1] }),
    nydato({ unitId: 4453, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 1] }),
    nydato({ unitId: 4560, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 1, 1] }),
    nydato({ unitId: 4482, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
    nydato({ unitId: 4306, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
    nydato({ unitId: 4321, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
    nydato({ unitId: 4217, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
  ],
};

export const NYDATO_CEREBRAL: TeamConfig = {
  maxCc: { hp: 180, atk: 180, rcv: 180 },
  members: [
    nydato({ unitId: 4529.1, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 1] }),
    nydato({ unitId: 4307, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
    nydato({ unitId: 4490, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 1, 1] }),
    nydato({ unitId: 4560, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 1, 1] }),
    nydato({ unitId: 4482, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
    nydato({ unitId: 4431, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
    nydato({ unitId: 4192, lbNodes: 10, mainSpecialLevel: 1, potentialLevels: [5, 5] }),
    nydato({ unitId: 4321, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
  ],
};

export const NYDATO_QCK: TeamConfig = {
  maxCc: { hp: 190, atk: 194, rcv: 190 },
  members: [
    nydato({ unitId: 4600, lbNodes: 15, mainSpecialLevel: 7, potentialLevels: [5, 5] }),
    nydato({ unitId: 4663, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 1] }),
    nydato({ unitId: 4629, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 1, 1] }),
    nydato({ unitId: 4562, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 1, 1] }),
    nydato({ unitId: 4673, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
    nydato({ unitId: 4608, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 1] }),
    nydato({ unitId: 4622, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 1] }),
    nydato({ unitId: 4321, lbNodes: 30, mainSpecialLevel: 6, potentialLevels: [5, 5, 5] }),
  ],
};

/**
 * One comp of Nydato's Rumble Sheet ("2A. META TEAMS COMPS" and "2B. COMPS & SUBS", read by scripts/sync/nydato_sheet.py).
 * Comps only on the comps & subs page have no tier.
 */
export interface NydatoComp {
  tier: string;
  title: string;
  /** 5 starters then 3 bench, as the sheet shows them (null: a portrait that couldn't be read). */
  units: (number | null)[];
  /** Its "options and replacements" ("2B. COMPS & SUBS"): units that can stand in for one of its units. */
  options: number[];
}
/** The sheet's comps, best tier first (Sync Data.bat updates them). */
export const NYDATO_COMPS: NydatoComp[] = (nydatoSheet as { comps: NydatoComp[] }).comps;
/** The units on the sheet's character tier list ("4A. CHARACTER TIER LIST"). */
export const NYDATO_TIER_LIST: number[] = (nydatoSheet as { tierList?: number[] }).tierList ?? [];
/**
 * Every unit the sheet mentions: on the tier list or in a comp (its units and options). In Pirate Rumble the team
 * generator only uses these (user, 2026-11-22). A VS unit's combined number stands for both halves (src/data/vs.ts).
 */
export const NYDATO_LISTED: ReadonlySet<number> = new Set([...NYDATO_TIER_LIST, ...NYDATO_COMPS.flatMap((c) => [...c.units, ...c.options])].filter((x): x is number => x != null));
/**
 * The oldest "Last Update" among the sheet's tabs (YYYY-MM-DD): units released on or after it are newer than (some of)
 * the sheet, so the generator uses them too when it keeps to the sheet's units (user, 2026-11-24).
 */
export const NYDATO_SINCE: string | null = (nydatoSheet as { since?: string | null }).since ?? null;
/** A unit's Global release date (YYYY-MM-DD) from the game data, if known. */
export const releasedOf = (u: UnitRecord): string | undefined => (u as UnitRecord & { released?: string }).released ?? u.game?.released;
/** A Rumble unit released on or after the sheet's oldest tab update: the sheet may not cover it yet. */
export const newerThanSheet = (u: UnitRecord, since: string | null = NYDATO_SINCE): boolean => {
  const r = releasedOf(u);
  return since != null && r != null && r >= since && u.style != null;
};
/** Tiers that become default teams (user, 2026-11-22: "SS and above"). */
export const NYDATO_DEFAULT_TIERS = ["OP", "SS"];

/** The builds from Nydato's own team codes (2026-11-14), kept for the units still in those comps. */
const NYDATO_CODES: Record<string, TeamConfig> = { "str": NYDATO_STR, "cerebral free spirit": NYDATO_CEREBRAL, "qck": NYDATO_QCK };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A comp as a team. The units are the sheet's; the builds are Nydato's (his team codes, for units in them; the same
 * kind of build otherwise: level 120, LLB 3, Rumble key, special 10, ability 5, sockets maxed, cotton candy 180). When
 * the sheet has exactly the units of his team code, the code's order is kept.
 */
export function nydatoTeam(c: NydatoComp): TeamConfig {
  const code = NYDATO_CODES[c.title.toLowerCase()];
  const ids = c.units.filter((u): u is number => u != null);
  const codeIds = code?.members.map((m) => m?.unitId) ?? [];
  if (code && ids.length === codeIds.length && ids.every((id) => codeIds.includes(id))) return code;
  return {
    maxCc: code?.maxCc ?? { hp: 180, atk: 180, rcv: 180 },
    members: c.units.map((id) => (id == null ? null : code?.members.find((m) => m?.unitId === id) ?? nydato({ unitId: id }))),
  };
}

/**
 * Nydato's teams (from Nydato's Rumble Sheet): every comp of tier SS and up, in the sheet's order. STR is the default
 * opponent and Cerebral Free Spirit your default team; all are in Saved teams.
 */
export const NYDATO_TEAMS: { id: string; title: string; team: TeamConfig; tier: string }[] = NYDATO_COMPS
  .filter((c) => NYDATO_DEFAULT_TIERS.includes(c.tier) && c.units.some((u) => u != null))
  .map((c) => ({ id: `nydato-${slug(c.title)}`, title: `${c.title} (from Nydato's Rumble Sheet)`, team: nydatoTeam(c), tier: c.tier }));
export const NYDATO_AUTHOR = "Nydato";
export const NYDATO_SHEET_URL = "https://docs.google.com/spreadsheets/d/1IvYZjjs9SAMF9L_Wj9ql-5hqg5tgcOVNYvfFZSKWroI";
