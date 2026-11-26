import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { KeyEvent } from "./FieldEvents";
import { eventsNear } from "./replaySeries";
import type { UnitInfo } from "./Tracker";
import { UnitThumb } from "./UnitThumb";

/** The thumb's width (styles.css): the slider's track runs from half of it to the width minus half of it. */
const THUMB_W = 12;
/** Marks within this many pixels of the mouse show in the bubble. */
const NEAR_PX = 9;

/**
 * The replay's time bar: a range input on the replay's timeline (battle time, or playback time with the pauses in it),
 * with a small tick where each special and KO happens, and on hover a bubble above the point with the specials and
 * KOs around it (portrait, tag, which of the two, battle time).
 */
export function TimelineBar(props: {
  total: number; now: number; onSeek: (p: number) => void; background: string; label: string;
  /** specials and KOs, `t` on the same timeline as the bar, `bt` battle time */
  marks: KeyEvent[]; info: Map<string, UnitInfo>;
  /** playback time -> battle time, for the bubble's time */
  toBattle: (p: number) => number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ p: number; px: number; w: number; below: boolean } | null>(null);
  // the bubble's half width, measured, so it stays over the bar's span
  const bubble = useRef<HTMLDivElement>(null);
  const [half, setHalf] = useState(70);
  useLayoutEffect(() => {
    const w = bubble.current?.offsetWidth;
    if (w && Math.abs(w / 2 - half) > 1) setHalf(w / 2);
  });
  const total = Math.max(1e-9, props.total);
  const frac = (v: number) => Math.max(0, Math.min(1, v / total));
  const at = (f: number) => `calc(${THUMB_W / 2}px + (100% - ${THUMB_W}px) * ${f.toFixed(5)})`;
  const onMove = (e: ReactMouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left - THUMB_W / 2) / Math.max(1, r.width - THUMB_W)));
    // no room above (the bar is near the window's top): the bubble goes under it
    setHover({ p: f * total, px: THUMB_W / 2 + f * (r.width - THUMB_W), w: r.width, below: r.top < 150 });
  };
  const cx = hover ? Math.max(half, Math.min(hover.w - half, hover.px)) : 0;
  const near = hover ? eventsNear(props.marks, hover.p, (NEAR_PX * total) / Math.max(1, hover.w - THUMB_W)) : [];
  return (
    <div className="timeline-wrap" ref={box} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <input
        type="range"
        className="timeline"
        min={0}
        max={props.total}
        step={0.05}
        value={props.now}
        onChange={(e) => props.onSeek(Number(e.target.value))}
        style={{ background: props.background }}
        aria-label={props.label}
      />
      <div className="timeline-ticks" aria-hidden="true">
        {props.marks.map((m, i) => (
          <span key={i} className={`timeline-tick tick-${m.kind === "ko" ? "ko" : "special"} side-${props.info.get(m.uid)?.side ?? "atk"}`} style={{ left: at(frac(m.t)) }} />
        ))}
      </div>
      {hover && (
        <div
          ref={bubble}
          className={`timeline-bubble ${hover.below ? "below" : ""}`}
          style={{ left: cx }}
          role="tooltip"
        >
          <div className="timeline-bubble-time">{props.toBattle(hover.p).toFixed(1)}s</div>
          {near.map((m, i) => {
            const u = props.info.get(m.uid);
            if (!u) return null;
            return (
              <div key={i} className={`timeline-bubble-row side-${u.side}`}>
                <span className={`mark mark-${m.kind === "ko" ? "ko" : "special"}`}>{m.kind === "ko" ? "KO" : m.kind === "super" ? "SUPER" : "SP"}</span>
                <UnitThumb id={u.unitId} size={22} />
                <b>{u.tag}</b>
                <span className="timeline-bubble-name">{u.name}</span>
                <span className="muted">{(m.bt ?? m.t).toFixed(1)}s</span>
              </div>
            );
          })}
          <span className="timeline-bubble-pin" style={{ left: `calc(50% + ${hover.px - cx}px)` }} />
        </div>
      )}
    </div>
  );
}
