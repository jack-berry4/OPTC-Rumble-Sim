/**
 * Assault Rumble bosses (docs/PLAN_MODES.md section 2): made-up units with typed-in stats and an editable kit. A boss
 * borrows a real unit's portrait and sprite (its base unit); everything else (name, type, classes, tags, stats,
 * ability, special, attack pattern, resistances, targeting) is the boss's own. The kit uses the database's effect
 * structure, so any special in the game can be rebuilt (or copied from a unit and edited).
 *
 * A boss lives inside its team member (MemberConfig.boss), so saved teams and team codes carry it whole; the app
 * registers a unit record for it under its generated id (registerBosses) for everything that looks units up by id.
 */
import type { Attribute, Color, Effect, Pattern, Resilience, RumbleType, SuperCondition, TargetingPriority, UnitClass, UnitRecord } from "../data/schema";
import { kitFor } from "./stats";
import type { MemberConfig, TeamConfig } from "./types";

/** Boss ids: 9,000,000 and up (no real unit comes close). */
export const BOSS_ID_MIN = 9_000_000;
export const isBossId = (id: number) => id >= BOSS_ID_MIN;
/** Most units an Assault Rumble boss team has on the field (user, 2026-11-22: never seen more than 5). */
export const BOSS_TEAM_MAX = 4;

export interface BossStats { hp: number; atk: number; rcv: number; def: number; spd: number }

export interface BossDef {
  /** The boss's unit id (BOSS_ID_MIN and up). */
  id: number;
  /** The unit whose portrait and sprite animation the boss uses. */
  baseId: number;
  name: string;
  /** null = no type (like a dual unit). */
  color: Color | null;
  classes: UnitClass[];
  /** Crew / race tags ("Blackbeard Pirates", ...): count for rules, and for effects that name tags. */
  tags: string[];
  /** Character names: "when Marco is on the enemy crew" and the like. */
  families: string[];
  style: RumbleType;
  /** Rumble stats as shown (no level, Limit Break, cotton candy or key: user 2026-11-22). */
  stats: BossStats;
  /** The ability (always on, like a level-5 Rumble ability). */
  abilities: Effect[];
  special?: { cooldown: number; effects: Effect[] };
  superSpecial?: { condition: SuperCondition; effects: Effect[] };
  pattern: Pattern[];
  resilience: Resilience[];
  target: { criteria: Attribute; comparator?: TargetingPriority };
  /**
   * The team's main boss (Assault Rumble; the deck's first unit): its places in the NEXT queue, 1 + the deck's
   * additionalBehaviorCount_ (Blackbeard 4, Akainu 3). Each place fills like a unit's gauge and gives the boss a turn,
   * one turn at a time; several of your units can attack the main boss at once (docs/ASSAULT_RUNS.md, 2026-11-24).
   * 0 or unset: a regular unit of the boss team (unset on the first unit of a game boss team saved earlier: 1 + the count).
   */
  places?: number;
  /**
   * A boss loaded from the game's data (src/engine/gameKit.ts): the game's own text for its kit, the deck's
   * additionalBehaviorCount_ (the main boss's extra queue places: `places`), and the parts that couldn't be read (to add by hand).
   */
  game?: {
    subName?: string; specialName?: string; specialLevel?: number; specialText?: string; abilityLevel?: number; abilityText?: string;
    resistText?: string; additionalBehaviors?: number; notes: string[];
  };
}

/** A new boss id (random, so two bosses made on different devices hardly ever clash). */
export function newBossId(taken: Iterable<number> = []): number {
  const used = new Set(taken);
  for (;;) {
    const id = BOSS_ID_MIN + 1 + Math.floor(Math.random() * 899_999);
    if (!used.has(id)) return id;
  }
}

/**
 * A boss copied from a unit: its name, type, classes, tags and the kit it has at full build (ability level 5,
 * special level 10, its Level Limit Break kit when it has one). Stats start at the unit's max-level base stats.
 */
export function bossFromUnit(rec: UnitRecord, id = newBossId()): BossDef {
  const kit = kitFor(rec, { unitId: rec.id, llbLevel: 5 });
  return {
    id, baseId: rec.id, name: `${rec.name.split(" - ")[0]} (boss)`,
    color: rec.color, classes: [...rec.classes], tags: [...rec.tags], families: [...(rec.ownFamilies ?? rec.families)], style: rec.style,
    stats: { hp: rec.stats.hp, atk: rec.stats.atk, rcv: rec.stats.rcv, def: rec.stats.def, spd: rec.stats.spd },
    ...kitOf(rec),
    // kitFor picked the LLB parts; kitOf copies them
    abilities: structuredClone(kit.abilities.at(-1) ?? []),
  };
}

/** A unit's whole kit at full build, ready to put on a boss ("copy the kit of ..."). */
export function kitOf(rec: UnitRecord): Pick<BossDef, "abilities" | "special" | "superSpecial" | "pattern" | "resilience" | "target"> {
  const kit = kitFor(rec, { unitId: rec.id, llbLevel: 5 });
  const sp = kit.specials.at(-1);
  return structuredClone({
    abilities: kit.abilities.at(-1) ?? [],
    special: sp ? { cooldown: sp.cooldown, effects: sp.effects } : undefined,
    superSpecial: kit.superSpecial,
    pattern: kit.pattern.length ? kit.pattern : [{ action: "attack", type: "Normal" } as Pattern],
    resilience: kit.resilience,
    target: kit.target ?? { criteria: "near" as Attribute },
  });
}

/** The team member for a boss: exact stats, nothing else to set. */
export function bossMember(def: BossDef): MemberConfig {
  return { unitId: def.id, illegal: true, ccMode: "none", specialLevel: 1, abilityLevel: 1, exact: { ...def.stats }, boss: def };
}

/** The unit record of a boss (what the simulator and the app's lists use). */
export function bossRecord(def: BossDef, base?: UnitRecord): UnitRecord {
  const b = base as (UnitRecord & { serverId?: number; comboNum?: number; unitSize?: number }) | undefined;
  return {
    id: def.id, name: def.name || "Boss", color: def.color, classes: def.classes, stars: b?.stars ?? 6,
    families: def.families, tags: def.tags, style: def.style,
    stats: { ...def.stats }, minStats: { hp: def.stats.hp, atk: def.stats.atk, rcv: def.stats.rcv }, maxLevel: 1, growth: 1,
    sockets: 0, specialLevels: 1, keyGroup: b?.keyGroup ?? "rr",
    kit: {
      abilities: [def.abilities], specials: def.special ? [def.special] : [], pattern: def.pattern.length ? def.pattern : [{ action: "attack", type: "Normal" }],
      resilience: def.resilience, target: def.target, superSpecial: def.superSpecial,
    },
    source: "custom", cost: 0, game: b?.game, portraitId: def.baseId,
    // the sprite animation and hits per attack of the base unit (light index fields)
    ...(b?.serverId !== undefined ? { serverId: b.serverId, comboNum: b.comboNum, unitSize: b.unitSize } : {}),
  } as UnitRecord;
}

/** Boss id -> base unit id, for portraits (UnitThumb). Filled by registerBosses. */
const PORTRAITS = new Map<number, number>();
export const portraitOf = (id: number) => PORTRAITS.get(id) ?? id;

/**
 * Put a unit record in the database for every boss on these teams (and any other boss definitions given), replacing
 * an older record of the same boss. Bosses count as loaded (they have no detail file to fetch).
 */
export function registerBosses(db: { byId: Map<number, UnitRecord>; loaded?: Set<number> }, teams: (TeamConfig | undefined)[], more: BossDef[] = []): void {
  const defs = [...teams.flatMap((t) => (t?.members ?? []).map((m) => m?.boss)), ...more].filter((d): d is BossDef => !!d);
  for (const def of defs) {
    const old = db.byId.get(def.id) as (UnitRecord & { bossDef?: BossDef }) | undefined;
    if (old?.bossDef === def) continue;
    const rec = bossRecord(def, db.byId.get(def.baseId)) as UnitRecord & { bossDef?: BossDef };
    Object.defineProperty(rec, "bossDef", { value: def, enumerable: false });
    db.byId.set(def.id, rec);
    db.loaded?.add(def.id);
    PORTRAITS.set(def.id, def.baseId);
  }
}
