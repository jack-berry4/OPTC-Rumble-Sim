import { createContext, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { statUp } from "../engine/stats";
import type { BuffSource, Frame, UnitSnapshot } from "../engine/types";
import { barSeries, cutSegments, levelSeries, niceTicks, stepPath, type BarMetric } from "./replaySeries";
import { chanceText, evadeList, isEvade, statusName } from "./statusText";
import type { UnitInfo } from "./Tracker";
import { UnitThumb } from "./UnitThumb";

/**
 * The breakdown popup of the replay: hover a buff / debuff level (Buffs and Stats tables, the status badges under the
 * units) to see where the total comes from (each part's level, who or what gave it, seconds left) and a small graph of
 * that level for the unit from the start of the battle to now. Statuses that aren't stat levels (Confusion, Shield,
 * binds, immunities ...) show their name, seconds left and level / chance, without a graph.
 */

/** What is hovered: a stat's level, a status, the Shield or the Forced Out timer of a unit. */
export type InspectTarget =
  | { uid: string; kind: "stat"; stat: string; halved?: boolean }
  | { uid: string; kind: "status"; attr: string; /** Evade: the one thing evaded this is about */ evade?: string }
  | { uid: string; kind: "shield" }
  | { uid: string; kind: "forced" }
  /** An HP / special charge / Shield bar: its value now and its history */
  | { uid: string; kind: "track"; metric: BarMetric }
  | { uid: string; kind: "more"; items: MoreItem[] };
/** A badge that didn't fit in a unit's status panel (listed by the "…" badge). */
export interface MoreItem { label: string; title: string; kind: string; secs?: number }
/** The same, before the unit is known (a badge knows its stat; the panel knows the unit). */
export type InspectWhat =
  | { kind: "stat"; stat: string } | { kind: "status"; attr: string; evade?: string } | { kind: "shield" }
  | { kind: "more"; items: MoreItem[] };

interface InspectApi { open: (target: InspectTarget, el: Element) => void; close: () => void }
export const InspectContext = createContext<InspectApi | null>(null);

/** Mouse handlers that open the popup for `target` on hover (none outside the replay). */
export function useInspectHover() {
  const api = useContext(InspectContext);
  return (target: InspectTarget) =>
    api
      ? {
          onMouseEnter: (e: ReactMouseEvent<Element>) => api.open(target, e.currentTarget),
          onMouseLeave: () => api.close(),
        }
      : {};
}

export interface InspectState { target: InspectTarget; rect: { left: number; top: number; right: number; bottom: number } }

/** The popup's state and the API the tables use. */
export function useInspectState(): [InspectState | null, InspectApi] {
  const [state, setState] = useState<InspectState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const anchor = useRef<Element | null>(null);
  const api = useMemo<InspectApi>(() => ({
    open: (target, el) => {
      clearTimeout(timer.current);
      anchor.current = el;
      const r = el.getBoundingClientRect();
      setState({ target, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
    },
    // closes at once (user 2026-11-17: it lingered); moving straight to another cell opens that one in the same
    // event, so React draws no gap and nothing flickers
    close: () => {
      clearTimeout(timer.current);
      anchor.current = null;
      setState(null);
    },
  }), []);
  useEffect(() => () => clearTimeout(timer.current), []);
  // a hovered cell or badge can be redrawn or vanish under a still mouse (the replay plays on): the next move away
  // closes the popup even without a mouseleave
  useEffect(() => {
    if (!state) return;
    const moved = (e: PointerEvent) => {
      const a = anchor.current;
      if (!a || !a.isConnected || !(e.target instanceof Node) || !a.contains(e.target)) api.close();
    };
    document.addEventListener("pointermove", moved);
    return () => document.removeEventListener("pointermove", moved);
  }, [state, api]);
  return [state, api];
}

/** Long names and what one level is worth, for the popup's title. */
const STAT_INFO: Record<string, { name: string; per: string }> = {
  HP: { name: "Max HP", per: "+250 max HP per level" },
  ATK: { name: "ATK", per: "+75 ATK per level" },
  DEF: { name: "DEF", per: "+25 DEF per level" },
  SPD: { name: "SPD", per: "+5 SPD per level" },
  RCV: { name: "RCV", per: "+50 RCV per level" },
  "Special CT": { name: "Special charge", per: "2% faster charge per level" },
  "Critical Hit": { name: "Critical Hit", per: "+5% crit chance per level" },
  Guard: { name: "Guard", per: "+5% guard chance per level" },
  Accuracy: { name: "Accuracy", per: "each level down: +2.5% miss" },
  "Blow Away": { name: "Blow Away", per: "+5% Blow Away chance per level" },
};
const KIND_LABEL: Record<BuffSource["kind"], string> = { special: "Special", ability: "Ability", rule: "Rule", other: "Other" };

const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
const secs = (s: number) => (s > 900 ? "until removed" : `${s.toFixed(1)} s left`);

export function BuffPopup(props: { state: InspectState; frame: Frame; frames: Frame[]; t: number; info: Map<string, UnitInfo> }) {
  const { target, rect } = props.state;
  const u = props.frame.units.find((x) => x.uid === target.uid);
  const who = props.info.get(target.uid);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 280, h: 160 });
  useEffect(() => {
    const el = box.current;
    if (el && (Math.abs(el.offsetWidth - size.w) > 1 || Math.abs(el.offsetHeight - size.h) > 1)) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  });
  if (!u || !who) return null;
  // under the hovered thing, or over it when there's no room below; kept inside the window
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.max(8, Math.min(vw - size.w - 8, (rect.left + rect.right) / 2 - size.w / 2));
  const below = rect.bottom + 6 + size.h <= vh - 8;
  const top = Math.max(8, Math.min(vh - size.h - 8, below ? rect.bottom + 6 : rect.top - 6 - size.h));
  return (
    <div className="inspect-pop" ref={box} style={{ left, top }} role="tooltip">
      <div className="inspect-unit">
        <UnitThumb id={who.unitId} size={22} />
        <b className={`side-text-${who.side}`}>{who.tag}</b>
        <span className="inspect-unit-name">{who.name}</span>
      </div>
      {target.kind === "stat" && <StatBody u={u} stat={target.stat} halved={target.halved} frames={props.frames} t={props.t} info={props.info} />}
      {target.kind === "status" && <StatusBody u={u} attr={target.attr} evade={target.evade} />}
      {target.kind === "more" && (
        <>
          <div className="inspect-head"><span>More statuses</span><b>{target.items.length}</b></div>
          <ul className="inspect-more">
            {target.items.map((m, i) => (
              <li key={i} className={`more-${m.kind}`}>
                <span className="inspect-more-label">{m.title}</span>
                {m.secs !== undefined && <span className="secs muted">{m.secs.toFixed(1)} s</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {target.kind === "track" && <TrackBody u={u} metric={target.metric} frames={props.frames} t={props.t} />}
      {target.kind === "shield" && (
        <div className="inspect-head"><span>Shield</span><b>{u.shield > 0 ? `${statUp(u.shield).toLocaleString()} HP` : "none"}</b></div>
      )}
      {target.kind === "forced" && (
        <>
          <div className="inspect-head"><span>Forced Out</span><b>{u.outFor !== undefined ? `back in ${u.outFor.toFixed(1)} s` : ""}</b></div>
          <p className="inspect-note">{u.activity}</p>
        </>
      )}
    </div>
  );
}

function StatBody(props: { u: UnitSnapshot; stat: string; halved?: boolean; frames: Frame[]; t: number; info: Map<string, UnitInfo> }) {
  const { u, stat } = props;
  const total = u.buffs[stat] ?? 0;
  const sources = u.buffSources?.[stat];
  const ends = u.buffEnds?.[stat];
  const meta = STAT_INFO[stat] ?? { name: stat, per: "" };
  return (
    <>
      <div className="inspect-head">
        <span>{meta.name}</span>
        <b className={total > 0 ? "lvl-up" : total < 0 ? "lvl-down" : "muted"}>{total ? `${signed(total)} level${Math.abs(total) === 1 ? "" : "s"}` : "no change"}</b>
      </div>
      {props.halved && <p className="inspect-note lvl-down">Halved by a status (on top of the levels).</p>}
      {sources && sources.length > 0 ? (
        <table className="inspect-sources">
          <tbody>
            {sources.map((s, i) => {
              const from = s.from ? props.info.get(s.from) : undefined;
              return (
                <tr key={i}>
                  <td className={`num ${s.level > 0 ? "lvl-up" : s.level < 0 ? "lvl-down" : ""}`}>{signed(s.level)}</td>
                  <td>
                    <div className="inspect-src">
                      {from && <UnitThumb id={from.unitId} size={18} />}
                      <span className="inspect-src-label">{s.label}</span>
                      <span className="inspect-kind">{KIND_LABEL[s.kind]}</span>
                    </div>
                  </td>
                  <td className="secs muted">{s.remaining !== undefined ? `${s.remaining.toFixed(1)} s` : "while it holds"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : total !== 0 ? (
        <p className="inspect-note muted">
          {ends !== undefined ? `The next timed part ends in ${ends.toFixed(1)} s.` : "No timed part: it lasts while its condition holds."}
          {" "}Sources not recorded for this battle.
        </p>
      ) : null}
      {meta.per && <p className="inspect-note muted">{meta.per}</p>}
      <LevelGraph frames={props.frames} uid={u.uid} stat={stat} t={props.t} />
    </>
  );
}

function StatusBody(props: { u: UnitSnapshot; attr: string; evade?: string }) {
  const evade = isEvade(props.attr);
  // every Evade copy (they all share attr "Evade"; older recordings: "Evade: X"), or just those covering `evade`
  const copies = props.u.statuses.filter((s) =>
    evade ? isEvade(s.attr) && (!props.evade || evadeList(s).includes(props.evade)) : s.attr === props.attr);
  const name = evade ? (props.evade ? `Evade: ${props.evade}` : "Evade") : props.attr === "HoT" ? "Heal over time" : props.attr;
  return (
    <>
      <div className="inspect-head"><span className="inspect-head-name">{name}</span><b>{copies.length ? "" : "ended"}</b></div>
      {copies.length > 0 && (
        <table className="inspect-sources">
          <tbody>
            {copies.map((s, i) => {
              const what = evade ? (evadeList(s).length ? statusName(s).slice(6) : "not recorded") : "";
              const chance = chanceText(s);
              return (
                <tr key={i}>
                  <td>
                    <div className="inspect-src">
                      <span className="inspect-src-label">
                        {evade && <>Evades <b>{what}</b></>}
                        {!evade && s.level ? `Level ${s.level}` : ""}
                      </span>
                      {chance && <span className="inspect-kind" title={evade ? "Chance the evasion works" : "Chance"}>{evade ? `${chance} chance` : chance}</span>}
                    </div>
                  </td>
                  <td className="secs muted">{secs(s.remaining)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {evade && <p className="inspect-note muted">Each time one of these would land, the Evade works with the chance shown.</p>}
    </>
  );
}

const G = { w: 264, h: 74, l: 24, r: 6, t: 6, b: 16 };

const BAR_NAME: Record<BarMetric, string> = { hp: "HP", ct: "Special charge", shield: "Shield" };

/** An HP / special charge / Shield bar: the value now, and a graph of it from the start to the replay time. */
function TrackBody(props: { u: UnitSnapshot; metric: BarMetric; frames: Frame[]; t: number }) {
  const { u, metric } = props;
  const all = useMemo(() => barSeries(props.frames, u.uid, metric), [props.frames, u.uid, metric]);
  const segs = cutSegments(all, props.t);
  const hasSp = u.ctMax > 0 && Number.isFinite(u.ctMax);
  const now = metric === "hp" ? `${statUp(u.hp).toLocaleString()} / ${statUp(u.maxHp).toLocaleString()}`
    : metric === "shield" ? (u.shield > 0 ? `${statUp(u.shield).toLocaleString()} HP` : "none")
    : !hasSp ? "no special" : u.ct >= u.ctMax - 1e-9 ? "Ready" : `${Math.round((100 * u.ct) / u.ctMax)}% · ${(u.ctMax - u.ct).toFixed(1)} s left`;
  const vals = segs.flatMap((s) => s.points.map((p) => p.v));
  const hi = metric === "ct" ? 100 : Math.max(1, metric === "hp" ? u.maxHp : 0, ...vals);
  const span = Math.max(5, props.t);
  const x = (t: number) => G.l + ((G.w - G.l - G.r) * t) / span;
  const y = (v: number) => G.t + ((G.h - G.t - G.b) * (hi - v)) / hi;
  const xt = niceTicks(span, 4);
  const short = (v: number) => (metric === "ct" ? `${v}%` : v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  return (
    <>
      <div className="inspect-head"><span>{BAR_NAME[metric]}</span><b>{now}</b></div>
      <svg className="mini-graph" width={G.w} height={G.h} viewBox={`0 0 ${G.w} ${G.h}`} aria-label={`${BAR_NAME[metric]} over time`}>
        {xt.map((v) => <line key={v} x1={x(v)} x2={x(v)} y1={G.t} y2={G.h - G.b} className="graph-grid" />)}
        <line x1={G.l} x2={G.w - G.r} y1={y(0)} y2={y(0)} className="graph-zero" />
        <text x={G.l - 4} y={y(hi) + 3} className="graph-tick" textAnchor="end">{short(hi)}</text>
        <text x={G.l - 4} y={y(0) + 3} className="graph-tick" textAnchor="end">0</text>
        {xt.map((v) => <text key={v} x={x(v)} y={G.h - 4} className="graph-tick" textAnchor="middle">{v}s</text>)}
        <path d={stepPath(segs, x, y)} className={`graph-level graph-${metric}`} />
      </svg>
    </>
  );
}

/** The stat's level for this unit from the start to the replay time, as steps around a 0 line. */
function LevelGraph(props: { frames: Frame[]; uid: string; stat: string; t: number }) {
  const all = useMemo(() => levelSeries(props.frames, props.uid, props.stat), [props.frames, props.uid, props.stat]);
  const segs = cutSegments(all, props.t);
  const vals = segs.flatMap((s) => s.points.map((p) => p.v));
  const hi = Math.max(1, ...vals), lo = Math.min(0, ...vals);
  const span = Math.max(5, props.t);
  const x = (t: number) => G.l + ((G.w - G.l - G.r) * t) / span;
  const y = (v: number) => G.t + ((G.h - G.t - G.b) * (hi - v)) / (hi - lo || 1);
  const xt = niceTicks(span, 4);
  return (
    <svg className="mini-graph" width={G.w} height={G.h} viewBox={`0 0 ${G.w} ${G.h}`} aria-label={`${props.stat} level over time`}>
      {xt.map((v) => <line key={v} x1={x(v)} x2={x(v)} y1={G.t} y2={G.h - G.b} className="graph-grid" />)}
      <line x1={G.l} x2={G.w - G.r} y1={y(0)} y2={y(0)} className="graph-zero" />
      <text x={G.l - 4} y={y(hi) + 3} className="graph-tick" textAnchor="end">{signed(hi)}</text>
      {lo < 0 && <text x={G.l - 4} y={y(lo) + 3} className="graph-tick" textAnchor="end">{signed(lo)}</text>}
      <text x={G.l - 4} y={y(0) + 3} className="graph-tick" textAnchor="end">0</text>
      {xt.map((v) => <text key={v} x={x(v)} y={G.h - 4} className="graph-tick" textAnchor="middle">{v}s</text>)}
      <path d={stepPath(segs, x, y)} className="graph-level" />
    </svg>
  );
}
