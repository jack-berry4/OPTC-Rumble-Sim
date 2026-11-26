/**
 * Types mirroring OPTC-DB's Pirate Rumble data schema (common/data/rumble.schema.json).
 * Hand-written units in src/data/custom/ use these same shapes, so one parser handles both.
 */

export type RumbleType = "ATK" | "DEF" | "SPT" | "DBF" | "RCV" | "BAL";
export type Color = "[STR]" | "[DEX]" | "[QCK]" | "[PSY]" | "[INT]";
export type UnitClass =
  | "Fighter" | "Slasher" | "Shooter" | "Striker" | "Driven" | "Free Spirit" | "Cerebral" | "Powerhouse";

export type Attribute =
  | "SPD" | "ATK" | "DEF" | "HP" | "RCV" | "Critical Hit" | "Guard" | "Accuracy" | "Blow Away" | "Special CT"
  | "Silence" | "Provoke" | "Paralysis" | "Damage Over Time" | "Action Bind" | "Half Stats" | "Half ATK"
  | "Half DEF" | "Haste" | "Counter" | "Revive" | "Shield" | "Confusion" | "hit" | "takes damage" | "heal"
  | "near" | "all";

export type DamageAttribute = Color | UnitClass | "all";
export type EffectKind = "buff" | "debuff" | "hinderance" | "damage" | "recharge" | "boon" | "penalty" | "cleanse" | "evade";
export type TargetElement = "self" | "crew" | "enemies" | UnitClass | Color;
export type TargetingPriority = "highest" | "lowest" | "above" | "below" | "exactly";
export type ConditionComparator = "above" | "exactly" | "below" | "remaining" | "first" | "after" | "more" | "less";
export type ConditionType = "stat" | "time" | "crew" | "enemies" | "trigger" | "defeat" | "character";
export type AttackEffectType = "fixed" | "cut" | "atk" | "atkbase" | "time" | "random";
export type RechargeEffectType = "fixed" | "percentage" | "Special CT" | "RCV";

export interface Condition {
  type: ConditionType;
  comparator?: ConditionComparator;
  stat?: Attribute;
  families?: string[];
  team?: "crew" | "enemies";
  count?: number;
  relative?: boolean;
}

export interface Targeting {
  targets: TargetElement[];
  excludes?: TargetElement[];
  count?: number;
  priority?: TargetingPriority;
  percentage?: number;
  stat?: Attribute;
}

export interface Range {
  direction: "forward" | "radial" | "sideways";
  size: "small" | "medium" | "large";
}

export interface Effect {
  effect: EffectKind;
  attributes?: Attribute[];
  chance?: number;
  duration?: number;
  targeting?: Targeting;
  amount?: number;
  amountrange?: [number, number];
  interval?: number;
  level?: number;
  repeat?: number;
  range?: Range;
  condition?: Condition;
  defbypass?: boolean;
  leader?: boolean;
  /** For damage: AttackEffectType; for recharge: RechargeEffectType. */
  type?: AttackEffectType | RechargeEffectType;
}

export interface EffectOverride {
  override: Partial<Omit<Effect, "effect" | "type">>;
}

export interface Ability { effects: (Effect | EffectOverride)[] }
export interface Special { cooldown: number; effects: (Effect | EffectOverride)[] }
/**
 * Super special unlock conditions, e.g. {type: "specialreceived", team: "enemy", count: 2}
 * = "after this character receives enemies' Rumble Specials 2 times".
 */
export interface SuperCondition {
  type: "specialreceived" | "dmgreceived" | "special" | "time" | "dbfreceived" | "heal" | "stat" | "dmgtaken" | string;
  count?: number;
  team?: string;
  attribute?: string;
  stat?: string;
  comparator?: string;
}
export interface SuperSpecial { condition: SuperCondition; effects: Effect[] }
export interface GPSpecial { uses: number; effects: (Effect | EffectOverride)[] }

export type Pattern =
  /** range: an Assault Rumble boss's range attack (game behaviors 10004-10009): no walk, hits every enemy in that
   *  range around the boss, no Damage over Time tick before it (docs/ASSAULT_RUNS.md, measured 2026-11-24). */
  | { action: "attack"; type: "Normal" | "Power" | "Full"; range?: "Small" | "Medium" }
  | { action: "heal"; area: "Self" | "Small" | "Medium" | "Large"; level: number };

export type Resilience =
  | { type: "debuff"; attribute: Attribute; chance: number }
  | { type: "damage"; attribute?: DamageAttribute; percentage: number }
  | { type: "dmgboost"; attribute?: DamageAttribute; amount: number }
  | { type: "healing"; amount: number; interval: number; condition?: Condition };

export interface RawRumbleUnit {
  id: number;
  basedOn?: number;
  ability?: Ability[];
  special?: Special[];
  pattern?: Pattern[];
  resilience?: Resilience[];
  stats?: { rumbleType: RumbleType; def: number; spd: number };
  /** Rumble team cost (team limit is 300). */
  cost?: number;
  target?: { criteria: Attribute; comparator?: TargetingPriority };
  gpability?: Ability[];
  gpspecial?: GPSpecial[];
  gpcondition?: Condition[];
  llbability?: Ability[];
  llbspecial?: Special[];
  llbresilience?: Resilience[];
  llbgpability?: Ability[];
  llbgpspecial?: GPSpecial[];
  /** Rumble super special (single level) with its unlock condition. */
  superspecial?: SuperSpecial[];
  llbsuperspecial?: SuperSpecial[];
}

// ---------- Resolved form used by the engine (all overrides flattened) ----------

export interface ResolvedRumbleKit {
  /** abilities[level-1] = list of effects at that ability level (1..5). */
  abilities: Effect[][];
  /** specials[level-1] = { cooldown, effects } for special level 1..10. */
  specials: { cooldown: number; effects: Effect[] }[];
  gpAbilities?: Effect[][];
  gpSpecials?: { uses: number; effects: Effect[] }[];
  gpConditions?: Condition[];
  pattern: Pattern[];
  resilience: Resilience[];
  target: { criteria: Attribute; comparator?: TargetingPriority };
  /** Super special: replaces the special once its condition is met (max 3 per team per battle). */
  superSpecial?: { condition: SuperCondition; effects: Effect[] };
}

export interface UnitRecord {
  id: number;
  name: string;
  /** null for dual units, which count as no color in Rumble. */
  color: Color | null;
  classes: UnitClass[];
  stars: string | number;
  /**
   * Character families from OPTC-DB families.js. For a VS form (e.g. 4529.2 Nusjuro) these are BOTH characters' names,
   * because the other half still counts for the "same character can't be on a team twice" rule (user, 2026-11-13).
   */
  families: string[];
  /**
   * VS forms only: the chosen half's own names (4529.2 Nusjuro: not Roronoa Zoro). "When Zoro is on your crew" and
   * "to Zoro crew members" use these; team legality uses `families`. Undefined = same as `families`.
   */
  ownFamilies?: string[];
  /** Crew / race / arc tags from OPTC-DB tags.js, e.g. "Straw Hat Pirates", "Former / Navy". */
  tags: string[];
  /** Other names to search by (OPTC-DB aliases.js), e.g. "Aokiji" on Kuzan units. */
  aliases?: string[];
  /** 5★ units: the 6★ unit this one evolves into (OPTC-DB evolutions.js); the unit search can hide this form. */
  sixStarForm?: number;
  style: RumbleType;
  /** Max-level base stats (before LB / cotton candy / Rumble level bonuses). */
  stats: { hp: number; atk: number; rcv: number; def: number; spd: number };
  /** Level-1 HP/ATK/RCV; stats at level L = min + (max - min) × ((L-1)/(maxLevel-1))^growth. */
  minStats: { hp: number; atk: number; rcv: number };
  maxLevel: number;
  /** One curve for all three stats, or one each [HP, ATK, RCV] (7 units in OPTC-DB, e.g. Lao G. 879 / 880). */
  growth: number | number[];
  /** Limit Break nodes: cumulative [HP, ATK, RCV] after each node, and how many come before the key lock. */
  lb?: LimitBreak;
  /** Socket slots before Limit Break. */
  sockets: number;
  /** Main-game special levels (cooldowns.js max - min + 1; 1 when the unit has no special or only one level). */
  specialLevels: number;
  /**
   * Color-variant set, e.g. Pacifista PX-1 to PX-5: low-rarity (4★ and below) units of one family released as a run
   * of consecutive IDs, each a different color. Units in the same set can share a team despite the family rule.
   */
  variantSet?: string;
  /** Rumble key tier (where the unit comes from). */
  keyGroup: KeyGroup;
  /** Free to play: farmed (Co-op, Pirate King Adventures, raids, story...), not recruited or bought (OPTC-DB flags.js). */
  farmable?: boolean;
  kit: ResolvedRumbleKit;
  /** Kit after Level Limit Break, if the unit has LLB Rumble data. */
  llbKit?: ResolvedRumbleKit;
  /** LLB level (1-5) that switches each part to the LLB kit (OPTC-DB details.js lLimit); see llbTiersOf. */
  llbTiers?: { ability?: number; special?: number; resilience?: number; superSpecial?: number };
  /** "optc-db" for imported data, "custom" for hand-written units. */
  source: "optc-db" | "custom";
  /** Show this unit's portrait instead (Assault Rumble bosses use their base unit's). */
  portraitId?: number;
  /** Rumble team cost; 0 if unknown. */
  cost: number;
  /** The game's own data for this unit (data/units.json, docs/DATABASE.md). Not used by the simulator yet. */
  game?: GameUnitData;
  /** Values known from other sources (battle captures), with their source. Not used by the simulator yet. */
  known?: KnownUnitData;
}

/**
 * Per-unit data from the game's master database (sakura.db MstCharacter_ and the Rumble tables), joined to the OPTC-DB
 * unit by scripts/db/game.ts. Main-game fields are of the row the Rumble unit uses (a VS form's own half).
 */
export interface GameUnitData {
  /** MstCharacter_.id_ (internal row id). */
  charId: number;
  /** MstCharacter_.serverId_: the asset id (motion .ssd files, battle captures' character_id). */
  serverId: number;
  /** MstCharacter_.logbookId_ (Character Log number; -1 for VS halves). Usually = the OPTC-DB id. */
  logbookId: number;
  /** How the row was found: logbookId_ = OPTC-DB id, exact name + max stats, or the VS parent's child list. */
  match: "logbook" | "name+stats" | "vs-form";
  /** Game name ("name_ - subName_"). */
  name: string;
  rarity: number;
  /**
   * Global release date (YYYY-MM-DD, UTC) from MstCharacter_.publishTimestamp_, or the row's insertTimestamp_ where
   * the publish time is the old 1999 placeholder. The team generator adds units released since Nydato's sheet's
   * oldest page update (src/engine/defaultTeams.ts).
   */
  released?: string;
  /** Max-level HP / ATK / RCV (maxHealth_ / maxAttackDamage_ / maxRestoration_). */
  stats: { hp: number; atk: number; rcv: number };
  /** unitSize_ (2 or 3): sprite size class; captures' unit_size. */
  unitSize: number;
  /** comboNum_: hits per attack; captures' combo. */
  comboNum: number;
  /** movementSpeed_ (15 for every Rumble unit seen); captures' movement_speed. */
  movementSpeed: number;
  motionType: number;
  /** The row has a Rumble special (piratesActiveSkillId_ > 0). Without it style/def/spd are the game's defaults. */
  hasRumble: boolean;
  /** piratesStyle_ / piratesDefense_ / piratesSpeed_ / piratesDeckCost_. */
  style: RumbleType | null;
  def: number;
  spd: number;
  cost: number;
  /** Rumble special: MstPiratesActiveSkillEffect_ per level (chargeIntervalTime_ = cooldown s). Text in data/game-text.json. */
  special?: { id: number; name: string; cooldowns: number[]; limit: number };
  superSpecialId?: number;
  /** Rumble key tier (MstPiratesLimitBreak_ via piratesLimitBreakAbilityId_); null = the unit can't take a key. */
  key: GameKeyTier | null;
  /** motion_ssd/motion_manifest.csv: the unit's attack-motion and special-motion .ssd files (by serverId). */
  motionSsd: string[];
  skillSsd: string[];
  /**
   * The attack animation decoded from the unit's own attack .ssd (tools/ssd, scripts/db/attack.ts). Absent when the
   * serverId has no attack file with hit frames (no file extracted, VS halves without their own file, files with no
   * events): the simulator then keeps the borrowed timing profile.
   */
  attack?: GameAttackMotion;
}

/** Hit timing of a unit's regular attack, from its attack .ssd (docs/DATABASE.md, tools/ssd/README.md). */
export interface GameAttackMotion {
  /** The .ssd file used (variant `sd` = the unit's attack, `evolved` = the evolved form's attack; never `skill` cut-ins). */
  file: string;
  variant: "sd" | "evolved";
  /** fps written in the file (60 or 45); the game plays attacks at 60 fps either way. */
  fps: number;
  frames: number;
  /** Hit frames: `hit` events; for files with only hit sounds, the template's hits or the hit-sound frames (`hitsFrom`). */
  hits: number[];
  /** "hit" = UDAT hit events; "template" = sound-only file of a known template (its hits); "sound" = hit-sound frames. */
  hitsFrom: "hit" | "template" | "sound";
  firstHit: number;
  /** Arrive -> first damage number, s: 0.2 (strip) + 0.12 + firstHit / 60, rounded to 1 ms. */
  windup: number;
}

export interface GameKeyTier {
  /** MstPiratesLimitBreak_.serverId_ (1000-1004, 1010-1060, 2010-2030, 100000). */
  tier: number;
  /** Stat multipliers (1.3 = +30%); ct = special charge-time multiplier (0.9 = -10%). */
  hp: number; atk: number; rcv: number; def: number; spd: number; ct: number;
  /** % damage taken reduction / dealt increase of the key's ability, against `vs` only. */
  taken: number; dealt: number;
  /**
   * Who the key ability's damage bonuses apply to, e.g. "DEX" or "Cerebral/Powerhouse" (MstPiratesAbility_: "Reduce
   * damage taken from DEX by 20%, increase damage dealt to DEX by 20%").
   */
  vs: string;
  /** Character level needed (requireCharacterLevel_). */
  minLevel: number;
  /** KeyGroup(s) of the simulator's KEY_BONUS with the same numbers ([] = none). */
  groups: string[];
}

/** A value seen in a real battle capture, with where it came from (a data/known/ file name; data/sources.json describes it). */
export interface KnownValue<T> { value: T; source: string }
export interface KnownUnitData {
  /** Battle capture attack_destination (0, 1 or 2): see docs/DATABASE.md "Attack type". */
  attackDestination?: KnownValue<number>;
  /** Battle capture attack_destination_offset (tiles?, -1.2 to 0.5). */
  attackDestinationOffset?: KnownValue<number>;
  /** Battle capture tap_difficulty ("b", "c", "1c"). */
  tapDifficulty?: KnownValue<string>;
  /** Battle capture hit effect files. */
  hitEffect?: KnownValue<{ ssd: string; texture: string }>;
}

export interface LimitBreak {
  steps: [number, number, number][];
  keyAt: number | null;
  /** Potential abilities in Limit Break order, with the node index that unlocks each. */
  potentials: { name: string; at: number }[];
  /** Extra socket slots unlocked at Limit Break nodes. */
  socketNodes: { at: number; n: number }[];
}

/**
 * Rumble key tiers: anniversary and shop (F2P) legends, Super Sugo-Fest legends, Rumble legends,
 * regular legends, Treasure Map / Kizuna legends, Rumble rare recruits, other rare recruits.
 */
export type KeyGroup = "anni" | "super" | "rumbleLegend" | "legend" | "tmKizuna" | "rumbleRR" | "rr";
