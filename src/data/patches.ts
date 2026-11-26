import type { ResolvedRumbleKit } from "./schema";

/**
 * Corrections to the optc-db Rumble data, from the game itself (user's screenshots / in-game text). Applied to both the
 * resolved kit and the LLB kit of a unit id when the database is built. Empty for now.
 *
 * History: Kizaru 3704's Shooter HP up was once patched in here; it is in the data already, in his LLB ability (he is
 * LLB 4 in test run 6, so the LLB ability and special are active: KIZARU_ATTACKERS.llbLevel).
 */
export const KIT_PATCHES: Record<number, (kit: ResolvedRumbleKit) => void> = {
  // 4114 / 4115: the site's "When there is 6 or remaining crew members remaining" (data: comparator "remaining", i.e.
  // 6 or fewer) is "6 or MORE crew members remaining"; in game: "if the current team is 6 teammates or more" (user,
  // 2026-11-13). 4114 (the same unit before evolving) has the same text and data.
  4114: (kit) => sixOrMoreRemaining(kit),
  4115: (kit) => sixOrMoreRemaining(kit),
};

function allEffects(kit: ResolvedRumbleKit) {
  return [
    ...kit.abilities.flat(), ...kit.specials.flatMap((s) => s.effects), ...(kit.superSpecial?.effects ?? []),
    ...(kit.gpAbilities ?? []).flat(), ...(kit.gpSpecials ?? []).flatMap((s) => s.effects),
  ];
}

function sixOrMoreRemaining(kit: ResolvedRumbleKit) {
  for (const e of allEffects(kit)) {
    const c = e.condition as { type?: string; comparator?: string; count?: number } | undefined;
    if (c?.type === "crew" && c.comparator === "remaining" && c.count === 6) e.condition = { ...c, comparator: "more" } as typeof e.condition;
  }
}
