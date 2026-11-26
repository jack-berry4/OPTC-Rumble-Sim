import type {
  Ability, Effect, EffectOverride, GPSpecial, RawRumbleUnit, ResolvedRumbleKit, Special,
} from "./schema";

const isOverride = (e: Effect | EffectOverride): e is EffectOverride => "override" in e;

/**
 * OPTC-DB stores level 1 in full and later levels as per-effect overrides. An override changes only the fields it
 * names and applies to the effect as last written out in full (normally level 1), not to the previous level: Hyogoro
 * 3506's special is ATK down Lv.2 at level 1, Lv.1 at level 2 (override), and Lv.2 again at level 3, whose override
 * names only the duration (user and the OPTC-DB site, 2026-11-11).
 */
export function resolveLevels(levels: { effects: (Effect | EffectOverride)[] }[]): Effect[][] {
  const out: Effect[][] = [];
  let prev: Effect[] = [];
  const full: Effect[] = [];
  for (const level of levels) {
    const cur: Effect[] = level.effects.map((e, i) => {
      // A bare {} means "as written out in full" (Sabo 1492's LLB special: Lv.4, override Lv.3 at level 2, {} = Lv.4).
      if (!isOverride(e) && !("effect" in e) && (full[i] ?? prev[i])) return structuredClone((full[i] ?? prev[i])!);
      if (!isOverride(e)) { full[i] = e; return structuredClone(e); }
      const base = full[i] ?? prev[i];
      if (!base) throw new Error(`Override at index ${i} has no base effect`);
      return { ...structuredClone(base), ...structuredClone(e.override) };
    });
    // An override list shorter than the previous level keeps the remaining effects unchanged.
    for (let i = cur.length; i < prev.length; i++) cur.push(structuredClone(prev[i]!));
    out.push(cur);
    prev = cur;
  }
  return out;
}

function resolveKit(
  u: RawRumbleUnit,
  ability: Ability[] | undefined,
  special: Special[] | undefined,
  gpability: Ability[] | undefined,
  gpspecial: GPSpecial[] | undefined,
  resilience: RawRumbleUnit["resilience"],
  superspecial?: RawRumbleUnit["superspecial"],
): ResolvedRumbleKit {
  const specials = special ?? [];
  const specialEffects = resolveLevels(specials);
  const gpEffects = gpspecial ? resolveLevels(gpspecial) : undefined;
  return {
    abilities: resolveLevels(ability ?? []),
    specials: specials.map((s, i) => ({ cooldown: s.cooldown, effects: specialEffects[i]! })),
    gpAbilities: gpability ? resolveLevels(gpability) : undefined,
    gpSpecials: gpspecial?.map((s, i) => ({ uses: s.uses, effects: gpEffects![i]! })),
    gpConditions: u.gpcondition,
    pattern: u.pattern ?? [],
    resilience: resilience ?? [],
    target: u.target ?? { criteria: "near" },
    superSpecial: superspecial?.[0]
      ? { condition: superspecial[0].condition, effects: structuredClone(superspecial[0].effects) }
      : undefined,
  };
}

export function resolveRumbleUnit(u: RawRumbleUnit): { kit: ResolvedRumbleKit; llbKit?: ResolvedRumbleKit } {
  const kit = resolveKit(u, u.ability, u.special, u.gpability, u.gpspecial, u.resilience, u.superspecial);
  const hasLlb = u.llbability || u.llbspecial || u.llbresilience || u.llbgpability || u.llbgpspecial || u.llbsuperspecial;
  const llbKit = hasLlb
    ? resolveKit(
        u,
        u.llbability ?? u.ability,
        u.llbspecial ?? u.special,
        u.llbgpability ?? u.gpability,
        u.llbgpspecial ?? u.gpspecial,
        u.llbresilience ?? u.resilience,
        u.llbsuperspecial ?? u.superspecial,
      )
    : undefined;
  return { kit, llbKit };
}

/** Replace {id, basedOn} reference entries with a copy of the unit they point to. */
export function expandReferences(units: RawRumbleUnit[]): RawRumbleUnit[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const follow = (u: RawRumbleUnit, depth = 0): RawRumbleUnit => {
    if (u.basedOn === undefined) return u;
    const base = byId.get(u.basedOn);
    if (!base || depth > 10) throw new Error(`Unit ${u.id} has a broken basedOn ${u.basedOn}`);
    return { ...follow(base, depth + 1), id: u.id };
  };
  return units.map((u) => follow(u));
}
