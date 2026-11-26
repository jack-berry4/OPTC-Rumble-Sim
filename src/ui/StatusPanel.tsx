import type { UnitSnapshot } from "../engine/types";
import { useInspectHover, type InspectWhat } from "./BuffPopup";
import { evadeEntries, evadeShort, isEvade, layoutCells } from "./statusText";
import { evadeIcon, statIcon, statusIcon, useStatusIcons } from "./statusIcons";

/**
 * The status panel under a unit's portrait on the replay field: badges 2 wide, most important first, each with a short
 * label and the seconds left. Every special effect comes before any stat change (user):
 *   bad    - effects that stop or weaken the unit's actions (Bind, Paralysis, Confusion, Half Stats, DoT ...)
 *   guard  - protection (Shield, Damage Reflect, Counter, Provoke) and heal over time
 *   immune - immunities
 *   down   - stat debuffs (biggest first)
 *   up     - stat buffs (biggest first)
 * Then, on a row of its own, the Evade section: a blue "Evade:" badge and one badge per thing evaded (with its seconds).
 * Up to 6 rows (12 cells); with more, the 12th cell is "…" and hovering it lists the rest. The panel keeps room for 4
 * rows under the portrait and hangs lower than the card when it needs more.
 */
export type BadgeKind = "bad" | "down" | "guard" | "up" | "immune" | "evade" | "more";
export interface Badge {
  label: string; kind: BadgeKind; secs?: number; title: string; rank: number;
  /** what the breakdown popup shows for it */
  what: InspectWhat;
  /** in the Evade section at the bottom */
  section?: "evade";
  /** with the "Status icons" option: the game's icon in place of the word, `pre` / `post` text around it */
  icon?: { href: string; pre?: string; post?: string };
}

const STAT_SHORT: Record<string, string> = {
  ATK: "ATK", DEF: "DEF", SPD: "SPD", HP: "HP", RCV: "RCV", "Critical Hit": "Crit", Guard: "Grd",
  Accuracy: "Acc", "Blow Away": "Blow", "Special CT": "CT",
};
const STAT_ORDER = ["ATK", "DEF", "SPD", "Special CT", "HP", "Critical Hit", "Guard", "Blow Away", "Accuracy", "RCV"];

const BAD: Record<string, string> = {
  "Action Bind": "Bind", Paralysis: "Para", Confusion: "Conf", "Forced Out": "Out", "Special Bind": "SpBind",
  "Ability Bind": "AbBind", "RCV Bind": "RcvBnd", "Half Stats": "½ All", "Half ATK": "½ ATK", "Half DEF": "½ DEF",
  "Half SPD": "½ SPD", "Half RCV": "½ RCV", "Damage Over Time": "DoT",
};
const BAD_ORDER = Object.keys(BAD);
const GUARD: Record<string, string> = { "Damage Reflect": "Reflect", Counter: "Counter", Provoke: "Taunt", HoT: "Regen" };

export const fmtSecs = (s: number) => (s >= 10 ? `${Math.round(s)}` : s.toFixed(1).replace(/\.0$/, ""));
const secsOf = (r: number) => (r > 900 ? undefined : r);
const pct = (c: number | undefined) => (c === undefined ? "" : `${Math.round(c * 100)}% chance`);

/** The Evade section's badges: "Evade:" then one per thing evaded, each with its seconds left. */
function evadeBadges(u: UnitSnapshot): Badge[] {
  const list = evadeEntries(u.statuses);
  if (!list.length) return [];
  const known = list.filter((e) => e.what !== "?");
  // the header keeps its full label (no room for seconds next to "Evade:"): the seconds go on the items
  const head: Badge = {
    label: known.length ? "Evade:" : "Evade", kind: "evade", section: "evade", rank: 0,
    secs: known.length ? undefined : secsOf(list[0]!.remaining),
    title: known.length ? `Evade: ${known.map((e) => e.what).join(", ")}` : "Evade (what it evades is not recorded)",
    what: { kind: "status", attr: "Evade" },
  };
  return [
    head,
    ...known.map((e, i): Badge => ({
      label: evadeShort(e.what), kind: "immune", section: "evade", rank: i + 1, icon: iconOf(evadeIcon(e.what) ?? statusIcon(e.what)),
      secs: secsOf(e.remaining),
      title: `Evades ${e.what}${e.chance !== undefined ? `, ${pct(e.chance)}` : ""}${e.remaining <= 900 ? `, ${e.remaining.toFixed(1)} s left` : ""}`,
      what: { kind: "status", attr: "Evade", evade: e.what },
    })),
  ];
}

const iconOf = (href: string | undefined, post?: string, pre?: string) => (href ? { href, post, pre } : undefined);

export function badgesFor(u: UnitSnapshot): Badge[] {
  const out: Badge[] = [];
  // the soonest-ending copy of each status
  const soonest = new Map<string, { remaining: number; level?: number }>();
  for (const s of u.statuses) {
    const prev = soonest.get(s.attr);
    if (!prev || s.remaining < prev.remaining) soonest.set(s.attr, { remaining: s.remaining, level: s.attr === "HoT" ? undefined : s.level });
  }
  for (const [attr, s] of soonest) {
    const what = { kind: "status" as const, attr };
    if (BAD[attr]) {
      const lv = attr === "Damage Over Time" && s.level ? ` ${s.level}` : "";
      // one Half Stats icon in the game: a single halved stat says which next to it
      const post = /^Half (ATK|DEF|SPD|RCV)$/.test(attr) ? attr.slice(5) : lv.trim();
      out.push({ label: `${BAD[attr]}${lv}`, kind: "bad", secs: secsOf(s.remaining), title: attr, rank: 100 + BAD_ORDER.indexOf(attr), what, icon: iconOf(statusIcon(attr), post) });
    } else if (GUARD[attr]) {
      out.push({ label: GUARD[attr]!, kind: "guard", secs: secsOf(s.remaining), title: attr === "HoT" ? "Heal over time" : attr, rank: 160, what, icon: iconOf(statusIcon(attr)) });
    } else if (attr.startsWith("Immune: ")) {
      const imm = attr.slice(8);
      // the game's shield icon where it has one, else the plain icon with ✕
      const shield = evadeIcon(imm);
      out.push({ label: `✕${BAD[imm] ?? imm.slice(0, 5)}`, kind: "immune", secs: secsOf(s.remaining), title: `Immune to ${imm}`, rank: 180, what, icon: shield ? iconOf(shield) : iconOf(statusIcon(imm), undefined, "✕") });
    } else if (isEvade(attr)) {
      // in the Evade section below
    }
  }
  const shld = u.shield >= 1000 ? `${(u.shield / 1000).toFixed(1)}k` : `${Math.round(u.shield)}`;
  if (u.shield > 0) out.push({ label: `Shld ${shld}`, icon: iconOf(statusIcon("Shield"), shld), kind: "guard", title: `Shield: ${Math.round(u.shield)} HP`, rank: 150, what: { kind: "shield" } });
  for (const [attr, lv] of Object.entries(u.buffs)) {
    if (!lv) continue;
    const name = STAT_SHORT[attr] ?? attr.slice(0, 4);
    const order = STAT_ORDER.indexOf(attr);
    const secs = u.buffEnds?.[attr];
    out.push({
      label: `${name}${lv > 0 ? "+" : "−"}${Math.abs(lv)}`,
      kind: lv > 0 ? "up" : "down",
      secs,
      title: `${attr} ${lv > 0 ? "up" : "down"} ${Math.abs(lv)} level${Math.abs(lv) === 1 ? "" : "s"}${secs !== undefined ? ` (next part ends in ${secs.toFixed(1)} s)` : ""}`,
      rank: (lv > 0 ? 400 : 200) - Math.min(50, Math.abs(lv)) + (order < 0 ? 9 : order) / 100,
      what: { kind: "stat", stat: attr },
      icon: iconOf(statIcon(attr, lv), `${Math.abs(lv)}`),
    });
  }
  return [...out.sort((a, b) => a.rank - b.rank), ...evadeBadges(u)];
}

/** Badge cell size in field pixels; the panel is 2 cells wide. */
/** Sized to fit 4 rows under the portrait while the card keeps the old height (bars to ground circle, as in the game). */
export const BADGE = { w: 39, h: 12.5, gap: 2 };
export const PANEL_W = BADGE.w * 2 + BADGE.gap * 3;
/** The panel always keeps room for 4 rows (the card's geometry); it grows to MAX_ROWS when it needs to. */
export const PANEL_H = 4 * (BADGE.h + BADGE.gap) + BADGE.gap;
export const MAX_ROWS = 6;
/** Icon size in a badge (the "Status icons" option). */
const ICON = BADGE.h - 1;

/** Panel height for this many cells (0 when there are none). */
export const panelHeight = (n: number) => (n ? Math.ceil(Math.min(MAX_ROWS * 2, n) / 2) * (BADGE.h + BADGE.gap) + BADGE.gap : 0);

/** The badges, drawn with their top-left corner at (x, y). */
export function StatusPanel(props: { badges: Badge[]; x: number; y: number; side?: "atk" | "def"; /** the unit: hovering a badge opens its breakdown */ uid?: string }) {
  const main = props.badges.filter((b) => b.section !== "evade");
  const evade = props.badges.filter((b) => b.section === "evade");
  const { cells, more } = layoutCells(main, evade, MAX_ROWS * 2);
  const all: (Badge | null)[] = more.length
    ? [...cells, {
        label: "…", kind: "more", rank: 0, title: more.map((b) => b.title).join("\n"),
        what: { kind: "more", items: more.map((b) => ({ label: b.label, title: b.title, kind: b.kind, secs: b.secs })) },
      }]
    : cells;
  const hover = useInspectHover();
  const icons = useStatusIcons();
  const uid = props.uid;
  const h = Math.max(PANEL_H, panelHeight(all.length));
  return (
    <g transform={`translate(${props.x},${props.y})`} className="status-panel">
      <rect x={0} y={0} width={PANEL_W} height={h} className={`status-panel-bg ${all.length ? "" : "empty"} ${props.side ? `status-panel-${props.side}` : ""}`} />
      {all.map((b, i) => {
        if (!b) return null;
        const bx = BADGE.gap + (i % 2) * (BADGE.w + BADGE.gap);
        const by = BADGE.gap + Math.floor(i / 2) * (BADGE.h + BADGE.gap);
        // with the popup the native tooltip would only double it
        const pop = uid ? hover({ uid, ...b.what }) : {};
        // one line: label, then the seconds at the right end; a long label is squeezed to fit
        const secs = b.secs !== undefined ? fmtSecs(b.secs) : "";
        const room = BADGE.w - 5 - (secs ? secs.length * 4.2 + 3 : 2);
        if (icons && b.icon) {
          // the icon in place of the word: [pre] icon [post] ... secs
          const pre = b.icon.pre ?? "";
          const ix = 4 + (pre ? pre.length * 5.6 : 0);
          const post = b.icon.post ?? "";
          const px = ix + ICON + 1;
          const postRoom = BADGE.w - px - (secs ? secs.length * 4.2 + 3 : 2);
          return (
            <g key={`${b.label}-${i}`} transform={`translate(${bx},${by})`} className={`badge badge-${b.kind} badge-iconic`} {...pop}>
              {!("onMouseEnter" in pop) && <title>{b.title}</title>}
              <rect width={BADGE.w} height={BADGE.h} className="badge-bg" />
              <rect width={2.5} height={BADGE.h} className="badge-accent" />
              {pre && <text x={4} y={BADGE.h / 2 + 0.5} className="badge-label badge-pre">{pre}</text>}
              <image href={b.icon.href} x={ix} y={(BADGE.h - ICON) / 2} width={ICON} height={ICON} className="badge-icon" />
              {post && <text x={px} y={BADGE.h / 2 + 0.5} className="badge-label"
                {...(post.length * 5.4 > postRoom ? { textLength: postRoom, lengthAdjust: "spacingAndGlyphs" } : {})}>{post}</text>}
              {secs && <text x={BADGE.w - 2} y={BADGE.h / 2 + 0.5} className="badge-secs">{secs}</text>}
            </g>
          );
        }
        const squeeze = b.label.length * 5.4 > room;
        return (
          <g key={`${b.label}-${i}`} transform={`translate(${bx},${by})`} className={`badge badge-${b.kind}`} {...pop}>
            {!("onMouseEnter" in pop) && <title>{b.title}</title>}
            <rect width={BADGE.w} height={BADGE.h} className="badge-bg" />
            <rect width={2.5} height={BADGE.h} className="badge-accent" />
            <text x={b.kind === "more" ? BADGE.w / 2 : 4.5} y={BADGE.h / 2 + 0.5} className="badge-label" textAnchor={b.kind === "more" ? "middle" : undefined}
              {...(squeeze ? { textLength: room, lengthAdjust: "spacingAndGlyphs" } : {})}>{b.label}</text>
            {secs && <text x={BADGE.w - 2} y={BADGE.h / 2 + 0.5} className="badge-secs">{secs}</text>}
          </g>
        );
      })}
    </g>
  );
}
