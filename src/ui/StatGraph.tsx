import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { statUp } from "../engine/stats";
import type { Frame } from "../engine/types";
import { cutSegments, metricTracks, niceTicks, stepPath, type HpTrack, type Metric, type Track } from "./replaySeries";
import type { UnitInfo } from "./Tracker";

export const METRIC_LABEL: Record<Metric, string> = { hp: "HP", atk: "ATK", def: "DEF", spd: "SPD", rcv: "RCV", ct: "Special", shield: "Shield" };
const METRIC_HELP: Record<Metric, string> = {
  hp: "HP (or % of max HP)", atk: "ATK with buffs and debuffs", def: "DEF with buffs and debuffs", spd: "SPD with buffs and debuffs",
  rcv: "RCV with buffs and debuffs", ct: "Special charge, % of a full charge", shield: "Shield points",
};
export const GRAPH_H = { min: 90, max: 600, fallback: 190 };

/**
 * A stat over time for every unit, from the start of the battle to the replay time (it grows as the battle plays and
 * follows scrubbing): HP (absolute or % of max), ATK / DEF / SPD / RCV, special charge or Shield, picked with tabs.
 * Lines are colored by team; hover a line (or a unit's row in the HP list) to pick it out and name it. A cross marks
 * each KO. The time axis is the whole battle. `height` "fill" takes the parent's height (sidebar); a number shows a
 * drag handle under the plot to change it.
 */
export function StatGraph(props: {
  frames: Frame[]; hp: HpTrack[]; t: number; end: number; info: Map<string, UnitInfo>;
  metrics: Metric[]; metric: Metric; onMetric: (m: Metric) => void;
  pct: boolean; onPct: (v: boolean) => void;
  highlight?: string; onHighlight: (uid: string | undefined) => void;
  height: number | "fill"; onHeight?: (h: number) => void;
}) {
  const { t, info, pct, highlight, metric } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 150 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: Math.max(200, Math.round(el.clientWidth)), h: Math.max(GRAPH_H.min, Math.round(el.clientHeight)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const other = useMemo(
    () => (metric === "hp" ? undefined : metricTracks(props.frames, props.hp, metric)),
    [props.frames, props.hp, metric],
  );
  const tracks: Track[] = other ?? props.hp.map((k) => ({ uid: k.uid, ko: k.ko, segs: pct ? k.pctSegs : k.segs }));
  const isPct = (metric === "hp" && pct) || metric === "ct";

  const w = box.w;
  const h = props.height === "fill" ? box.h : props.height;
  const m = { l: 38, r: 8, t: 8, b: 18 };
  const span = Math.max(1, props.end);
  const yMax = isPct ? 100 : Math.max(1, ...tracks.flatMap((k) => k.segs.flatMap((s) => s.points.map((p) => p.v))));
  const x = (v: number) => m.l + ((w - m.l - m.r) * v) / span;
  const y = (v: number) => m.t + ((h - m.t - m.b) * (yMax - v)) / yMax;
  const yt = niceTicks(yMax, Math.max(2, Math.min(6, Math.floor(h / 45))));
  const xt = niceTicks(span, Math.max(2, Math.floor(w / 70)));
  const fmt = (v: number) => (isPct ? `${Math.round(v)}%` : v >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`);
  const fmtFull = (v: number) => (isPct ? `${Math.round(v)}%` : statUp(v).toLocaleString());
  const cut = tracks.map((k) => ({ k, segs: cutSegments(k.segs, t), side: info.get(k.uid)?.side ?? "atk" }));
  const lit = highlight ? cut.find((c) => c.k.uid === highlight) : undefined;

  // drag the handle under the plot to change its height
  const drag = useRef<{ y: number; h: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (typeof props.height !== "number") return;
    e.preventDefault(); // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: props.height };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    props.onHeight?.(Math.round(Math.max(GRAPH_H.min, Math.min(GRAPH_H.max, drag.current.h + e.clientY - drag.current.y))));
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className={`stat-graph ${props.height === "fill" ? "fill" : ""}`}>
      <div className="stat-graph-head">
        <span className="seg" role="tablist" aria-label="What the graph shows">
          {props.metrics.map((k) => (
            <button key={k} type="button" role="tab" className={metric === k ? "on" : ""} aria-selected={metric === k} title={METRIC_HELP[k]} onClick={() => props.onMetric(k)}>
              {METRIC_LABEL[k]}
            </button>
          ))}
        </span>
        {metric === "hp" && (
          <span className="seg" role="group" aria-label="HP scale">
            <button type="button" className={pct ? "" : "on"} aria-pressed={!pct} onClick={() => props.onPct(false)}>HP</button>
            <button type="button" className={pct ? "on" : ""} aria-pressed={pct} onClick={() => props.onPct(true)}>%</button>
          </span>
        )}
        <span className="hp-graph-legend muted">
          <i className="key key-atk" /> yours <i className="key key-def" /> opponent <span className="ko-key">✕</span> KO
        </span>
      </div>
      <div ref={wrap} className="hp-graph-plot" style={props.height === "fill" ? undefined : { height: h }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
          aria-label={`${METRIC_LABEL[metric]} over time${metric === "hp" && pct ? ", % of max HP" : ""}, 0 to ${t.toFixed(1)} s`}
          className={highlight ? "has-lit" : undefined}>
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} className={v === 0 ? "graph-zero" : "graph-grid"} />
              <text x={m.l - 4} y={y(v) + 3} className="graph-tick" textAnchor="end">{fmt(v)}</text>
            </g>
          ))}
          {xt.map((v) => <text key={`x${v}`} x={x(v)} y={h - 5} className="graph-tick" textAnchor="middle">{v}s</text>)}
          <line x1={x(t)} x2={x(t)} y1={m.t} y2={h - m.b} className="graph-now" />
          {cut.map(({ k, segs, side }) => (
            <path key={k.uid} d={stepPath(segs, x, y)} className={`hp-line hp-line-${side} ${highlight === k.uid ? "lit" : ""}`} />
          ))}
          {cut.map(({ k, side }) => k.ko !== undefined && k.ko <= t + 1e-9 && (
            <text key={`ko-${k.uid}`} x={x(k.ko)} y={y(0) + 3.5} className={`hp-ko hp-ko-${side} ${highlight === k.uid ? "lit" : ""}`} textAnchor="middle">✕</text>
          ))}
          {/* wide invisible copies take the hover */}
          {cut.map(({ k, segs }) => (
            <path key={`hit-${k.uid}`} d={stepPath(segs, x, y)} className="hp-hit"
              onMouseEnter={() => props.onHighlight(k.uid)} onMouseLeave={() => props.onHighlight(undefined)} />
          ))}
          {lit && lit.segs.length > 0 && (() => {
            const s = lit.segs.at(-1)!, p = s.points.at(-1)!;
            const i = info.get(lit.k.uid);
            const lx = x(s.end), ly = y(p.v);
            const right = lx > w * 0.6;
            const label = `${i?.tag ?? ""} ${i?.name ?? ""} · ${fmtFull(p.v)}`;
            return <text x={right ? lx - 6 : lx + 6} y={Math.max(m.t + 10, ly - 6)} textAnchor={right ? "end" : "start"} className="hp-line-label">{label}</text>;
          })()}
        </svg>
      </div>
      {typeof props.height === "number" && (
        <div className="stat-graph-grip" role="separator" aria-orientation="horizontal" aria-label="Drag to change the graph's height"
          title="Drag to change the graph's height" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      )}
    </div>
  );
}
