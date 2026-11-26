import type { BattleEvent } from "../sim/types";
import { rumbleInUid } from "./CutIns";
import { GROUND_DY } from "./FieldBackdrop";
import type { UnitInfo } from "./Tracker";
import { SvgThumb, UnitThumb } from "./UnitThumb";

/**
 * Key-event graphics on the replay field: specials, KOs and bench entries ("RUMBLE IN!"), drawn where they happen
 * and listed in a small feed in the corner. Unlike the game's cut-ins they never stop the battle: everything is a
 * function of the replay time, so it also works when scrubbing or jumping.
 */

export type KeyKind = "special" | "super" | "ko" | "enter";
export interface KeyEvent {
  kind: KeyKind;
  /** When it shows on the replay's timeline (battle time, or later when pauses come before it). */
  t: number;
  /** Battle time it happened at. */
  bt?: number;
  uid: string;
  x: number;
  y: number;
}

/** How long each graphic stays on the field (battle seconds). */
const DUR: Record<KeyKind, number> = { special: 1.6, super: 2.0, ko: 1.6, enter: 1.8 };
/** How long a line stays in the feed. */
const FEED_S = 3.5;
const LABEL: Record<KeyKind, string> = { special: "SPECIAL", super: "SUPER SPECIAL", ko: "KO!", enter: "RUMBLE IN!" };
const THUMB = 116;

/** The key events of a battle, each with the spot it happened at. */
export function keyEvents(events: BattleEvent[], posAt: (uid: string, t: number) => { x: number; y: number } | undefined): KeyEvent[] {
  const out: KeyEvent[] = [];
  for (const e of events) {
    let kind: KeyKind | undefined, uid: string | undefined, at = e.t;
    if (e.kind === "special") { kind = /SUPER/.test(e.text) ? "super" : "special"; uid = e.actor; }
    else if (e.kind === "ko") { kind = "ko"; uid = e.target; at = e.t - 0.05; } // where it stood just before falling
    else if (rumbleInUid(e)) { kind = "enter"; uid = rumbleInUid(e); at = e.t + 0.05; }
    if (!kind || !uid) continue;
    const p = posAt(uid, at);
    if (p) out.push({ kind, t: e.t, uid, x: p.x, y: p.y });
  }
  return out;
}

const active = (list: KeyEvent[], t: number, span: (e: KeyEvent) => number) =>
  list.filter((e) => t >= e.t - 1e-9 && t < e.t + span(e));

const fadeOut = (p: number, from = 0.75) => (p < from ? 1 : Math.max(0, (1 - p) / (1 - from)));
const pop = (p: number, until = 0.12) => (p < until ? 0.5 + 0.5 * (p / until) : 1);

/** SVG graphics, in game pixels (inside the field's <svg>, above the units). */
export function FieldEventMarks(props: { list: KeyEvent[]; t: number; info: Map<string, UnitInfo> }) {
  return (
    <g className="fx" pointerEvents="none">
      {active(props.list, props.t, (e) => DUR[e.kind]).map((e) => {
        const p = (props.t - e.t) / DUR[e.kind];
        const i = props.info.get(e.uid);
        const side = i?.side ?? "atk";
        const key = `${e.kind}-${e.uid}-${e.t}`;
        const label = (cls: string) => (
          <text y={-58 - 22 * Math.min(1, p * 3)} className={`fx-label ${cls}`} opacity={fadeOut(p)}
            transform={`scale(${pop(p)})`}>{LABEL[e.kind]}</text>
        );
        if (e.kind === "ko") {
          return (
            <g key={key} transform={`translate(${e.x},${e.y})`}>
              {i && (
                <g opacity={0.85 * (1 - p)} className="fx-ghost">
                  <SvgThumb id={i.unitId} size={THUMB} x={-THUMB / 2} y={GROUND_DY - THUMB - 4 - 30 * p} />
                </g>
              )}
              <g transform={`translate(0,${GROUND_DY - THUMB / 2}) scale(${p < 0.15 ? 2 - p / 0.15 : 1})`} opacity={fadeOut(p, 0.7)}>
                <text y={14} className="fx-ko">KO!</text>
              </g>
            </g>
          );
        }
        if (e.kind === "enter") {
          return (
            <g key={key} transform={`translate(${e.x},${e.y})`}>
              <ellipse cy={GROUND_DY} rx={44 + 80 * p} ry={18 + 32 * p} className={`fx-ring fx-ring-${side}`} opacity={1 - p} />
              <rect x={-16 + 8 * p} y={GROUND_DY - 260} width={32 - 16 * p} height={260} className="fx-beam" opacity={0.6 * (1 - p)} />
              {label("fx-enter")}
            </g>
          );
        }
        return (
          <g key={key} transform={`translate(${e.x},${e.y})`}>
            <ellipse cy={GROUND_DY} rx={44 + 110 * p} ry={18 + 44 * p} className={`fx-ring fx-ring-gold`} opacity={1 - p} />
            {e.kind === "super" && <ellipse cy={GROUND_DY} rx={44 + 60 * p} ry={18 + 24 * p} className="fx-ring fx-ring-super" opacity={1 - p} />}
            {label(e.kind === "super" ? "fx-super" : "fx-special")}
          </g>
        );
      })}
    </g>
  );
}

/** A short list of the latest key events, in the field's corner (HTML, over the field). */
export function EventFeed(props: { list: KeyEvent[]; t: number; info: Map<string, UnitInfo> }) {
  const shown = active(props.list, props.t, () => FEED_S).slice(-4);
  if (!shown.length) return null;
  return (
    <ol className="fx-feed" aria-label="Latest key events">
      {shown.map((e) => {
        const i = props.info.get(e.uid);
        const p = (props.t - e.t) / FEED_S;
        return (
          <li key={`${e.kind}-${e.uid}-${e.t}`} className={`fx-feed-${e.kind} side-${i?.side ?? "atk"}`} style={{ opacity: fadeOut(p, 0.8) }}>
            {i && <UnitThumb id={i.unitId} size={24} />}
            <span className="fx-feed-tag">{i?.tag}</span>
            <span className="fx-feed-what">{e.kind === "ko" ? "KO" : e.kind === "enter" ? "Rumble in!" : e.kind === "super" ? "Super special" : "Special"}</span>
            <span className="fx-feed-t">{(e.bt ?? e.t).toFixed(1)}s</span>
          </li>
        );
      })}
    </ol>
  );
}
