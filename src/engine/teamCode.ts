import type { UnitRecord } from "../data/schema";
import { validateTeam } from "./team";
import type { MemberConfig, TeamConfig } from "./types";

/** Limits for saved-team text. */
export const TITLE_MAX = 60;
export const AUTHOR_MAX = 24;
export const AUTHORS_MAX = 5;
/** The author text field (several names separated by commas). */
export const AUTHORS_TEXT_MAX = AUTHORS_MAX * (AUTHOR_MAX + 2);
export const AUTHOR_PLACEHOLDER = 'Your name (ex: "SMHmyHead")';

/** A team with its title and authors, as saved to history or shared as a code. */
export interface TeamShare {
  title: string;
  /** The team's authors (an editable text field; commas separate several names). */
  authors: string[];
  team: TeamConfig;
}

/** A team in the local history. */
export interface SavedTeam extends TeamShare {
  id: string;
  savedAt: number;
}

const PREFIX = "RS1.";
type Db = { byId: Map<number, UnitRecord> };

export const cleanTitle = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
export const cleanAuthor = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, AUTHOR_MAX);
/** "A, B" → ["A", "B"] (cleaned, no blanks, at most AUTHORS_MAX). */
export const splitAuthors = (s: string) => s.split(",").map(cleanAuthor).filter(Boolean).slice(0, AUTHORS_MAX);

/** Only the fields a team needs (positions, units and their builds, the account's cotton candy max, a GP leader). */
function teamOnly(t: TeamConfig): TeamConfig {
  return { members: Array.from({ length: 8 }, (_, i) => t.members[i] ?? null), ...(t.maxCc ? { maxCc: t.maxCc } : {}), ...(t.leader ? { leader: t.leader } : {}) };
}

/** Team → shareable code ("RS1." + URL-safe base64 of the JSON). */
export function encodeTeam(share: TeamShare): string {
  // Trailing empty positions are dropped to keep codes short.
  const members = teamOnly(share.team).members;
  while (members.length && !members[members.length - 1]) members.pop();
  const payload = { v: 1, t: cleanTitle(share.title), a: share.authors.map(cleanAuthor).filter(Boolean), m: members, c: share.team.maxCc, ...(share.team.leader ? { l: share.team.leader } : {}) };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Code → team, checked against the unit database. Throws a readable error for bad codes. */
export function decodeTeam(code: string, db: Db): TeamShare {
  const c = code.trim();
  if (!c.startsWith(PREFIX)) throw new Error("That isn't a team code (it should start with RS1.).");
  let payload: { v?: number; t?: unknown; a?: unknown; m?: unknown; c?: unknown; l?: unknown };
  try {
    const b64 = c.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  } catch {
    throw new Error("The code is damaged or incomplete.");
  }
  if (!Array.isArray(payload.m) || payload.m.length > 8) throw new Error("The code has no valid team.");
  const unknown: number[] = [];
  const members = payload.m.map((x): MemberConfig | null => {
    if (!x || typeof x !== "object") return null;
    const m = x as MemberConfig;
    if (typeof m.unitId !== "number") return null;
    // an Assault Rumble boss carries its whole definition (no database record needed)
    if (m.boss && typeof m.boss === "object" && m.boss.id === m.unitId) { if (!db.byId.has(m.boss.baseId)) unknown.push(m.boss.baseId); return m; }
    if (!db.byId.has(m.unitId)) unknown.push(m.unitId);
    return m;
  });
  if (unknown.length) throw new Error(`The code has units this version doesn't know: ${unknown.join(", ")}.`);
  const cc = payload.c as TeamConfig["maxCc"] | undefined;
  const maxCc = cc && [cc.hp, cc.atk, cc.rcv].every((n) => typeof n === "number") ? cc : undefined;
  const l = payload.l as TeamConfig["leader"] | undefined;
  const leader = l && typeof l === "object" && l.member && typeof l.member.unitId === "number" && db.byId.has(l.member.unitId) ? l : undefined;
  const authors = Array.isArray(payload.a) ? payload.a.filter((s): s is string => typeof s === "string").map(cleanAuthor).filter(Boolean).slice(0, AUTHORS_MAX) : [];
  return {
    title: typeof payload.t === "string" ? cleanTitle(payload.t) : "",
    authors,
    team: teamOnly({ members, ...(maxCc ? { maxCc } : {}), ...(leader ? { leader } : {}) }),
  };
}

/**
 * Whether a team could be used in the game as is: no illegal (admin) units and no rule problems
 * (cost, duplicates, families, empty field).
 */
export function teamLegality(db: Db, team: TeamConfig): { legal: boolean; reasons: string[] } {
  const illegal = team.members.filter((m) => m?.illegal).length;
  const reasons = [...(illegal ? [`${illegal} illegal unit${illegal === 1 ? "" : "s"}`] : []), ...validateTeam(db, team)];
  return { legal: reasons.length === 0, reasons };
}

export { teamOnly };
