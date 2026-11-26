/** Team building rules: cost, the duplicate / family rule, a team's problems. */
import type { UnitRecord } from "../data/schema";
import { memberCost } from "./stats";
import type { MemberConfig, TeamConfig } from "./types";

/** Team cost limit [C]. */
export const TEAM_COST_LIMIT = 300;

/** A unit's name without its title ("Monkey D. Luffy - ..." -> "Monkey D. Luffy"). */
export const shortName = (name: string) => (name.split(" - ")[0] ?? name).split(":")[0]!.trim();

type Db = { byId: Map<number, UnitRecord> };
const present = (team: TeamConfig) => team.members.filter((m): m is MemberConfig => !!m);

/** Team cost: illegal (admin) units cost nothing. */
export function teamCost(db: Db, team: TeamConfig): number {
  return present(team).reduce((s, m) => s + memberCost(db.byId.get(m.unitId), m), 0);
}

/**
 * Why two legal units can't be on the same team: the same unit, or the same character family
 * (e.g. two Luffys) (CONFIRMED). Illegal units are exempt.
 */
export function clashReason(db: Db, a: MemberConfig, b: MemberConfig): string | undefined {
  if (a.illegal || b.illegal) return undefined;
  const ra = db.byId.get(a.unitId), rb = db.byId.get(b.unitId);
  if (!ra || !rb) return undefined;
  if (ra.id === rb.id) return `${shortName(ra.name)} is already on the team`;
  // Color variants of a low-rarity set (e.g. Pacifista PX-1 to PX-5) can share a team (CONFIRMED).
  if (ra.variantSet && ra.variantSet === rb.variantSet) return undefined;
  const fam = ra.families.find((f) => rb.families.includes(f));
  if (fam) return `same family as ${shortName(rb.name)} (${fam})`;
  return undefined;
}

export function validateTeam(db: Db, team: TeamConfig): string[] {
  const problems: string[] = [];
  const members = present(team);
  if (team.members.slice(0, 5).every((m) => !m)) problems.push("Put at least one unit in slots 1-5.");
  if (team.members.length > 8) problems.push("Team can have at most 8 positions (5 + 3 bench).");
  const cost = teamCost(db, team);
  if (cost > TEAM_COST_LIMIT) problems.push(`Team cost ${cost} is over the ${TEAM_COST_LIMIT} limit.`);
  members.forEach((m, i) => {
    for (const o of members.slice(i + 1)) {
      const why = clashReason(db, o, m);
      if (why) problems.push(`${shortName(db.byId.get(o.unitId)!.name)}: ${why}.`);
    }
  });
  for (const m of members) if (!db.byId.has(m.unitId)) problems.push(`Unknown unit ${m.unitId}.`);
  return problems;
}

/**
 * Whether `member` may go into position `index` (replacing whatever is there): checks the duplicate / family
 * rule against the rest of the team and the cost limit. Returns the reason it can't, or undefined.
 */
export function placementProblem(db: Db, team: TeamConfig, index: number, member: MemberConfig): string | undefined {
  const others = team.members.filter((m, i): m is MemberConfig => !!m && i !== index);
  for (const o of others) {
    const why = clashReason(db, member, o);
    if (why) return why;
  }
  const cost = others.reduce((s, m) => s + memberCost(db.byId.get(m.unitId), m), 0) + memberCost(db.byId.get(member.unitId), member);
  if (cost > TEAM_COST_LIMIT) return `team cost would be ${cost} (limit ${TEAM_COST_LIMIT})`;
  return undefined;
}
