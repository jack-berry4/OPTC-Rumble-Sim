import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { BattleEvent } from "../engine/types";
import { usePersistedFlag } from "./persist";
import { Typed } from "./Typed";

export type LogLevel = "key" | "actions" | "detailed";

/** The event log: a filter and the events so far, kept scrolled to the latest. Click an event to jump to it. */
export function EventLog(props: {
  events: BattleEvent[];
  filter: LogLevel;
  onFilter: (f: LogLevel) => void;
  onPick: (t: number) => void;
  /** Hide the "Event log" title (the sidebar shows it on its chip). */
  bare?: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [props.events]);
  return (
    <div className="log-wrap">
      <div className="log-head">
        {!props.bare && <span>Event log</span>}
        <select value={props.filter} onChange={(e) => props.onFilter(e.target.value as LogLevel)} aria-label="Log detail">
          <option value="key">Key events</option>
          <option value="actions">Actions &amp; hits</option>
          <option value="detailed">Detailed (rolls, odds, damage maths)</option>
        </select>
      </div>
      <ol className="log" ref={list}>
        {props.events.map((e, i) => (
          <li key={i} className={`ev ev-${e.kind} ${e.detail ? "ev-detail" : ""}`} onClick={() => props.onPick(e.t)}>
            <span className="ev-t">{e.t.toFixed(1)}</span>
            <span><Typed text={e.text} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A section of the replay's info area with a header that opens and closes it (remembered in this browser).
 * `extra` sits in the header after the title (muted notes, small controls).
 */
export function Section(props: { storageKey: string; title: ReactNode; extra?: ReactNode; className?: string; children: ReactNode }) {
  const [open, setOpen] = usePersistedFlag(props.storageKey, true);
  return (
    <section className={`sub-section fold ${open ? "open" : ""} ${props.className ?? ""}`}>
      <div className="fold-head">
        <button type="button" className="fold-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span className="fold-title">{props.title}</span>
        </button>
        {props.extra && <span className="fold-extra">{props.extra}</span>}
      </div>
      {open && <div className="fold-body">{props.children}</div>}
    </section>
  );
}

export type SideKey = "log" | "graph" | "hp" | "stats" | "buffs";
export const SIDE_KEYS: SideKey[] = ["hp", "log", "graph", "stats", "buffs"];
export const SIDE_LABEL: Record<SideKey, string> = { log: "Log", graph: "Graph", hp: "HP", stats: "Stats", buffs: "Buffs" };
const SIDE_HELP: Record<SideKey, string> = {
  log: "the event log", graph: "the stat graphs (HP, ATK, DEF, SPD, RCV ... over time)", hp: "HP and special timers",
  stats: "each unit's live ATK, DEF, SPD and RCV", buffs: "statuses, buffs and debuffs",
};

const ORDER: SideKey[] = SIDE_KEYS;
/** `shown` with `k` switched on or off, in the sidebar's order. */
export const toggleSide = (shown: SideKey[], k: SideKey): SideKey[] =>
  shown.includes(k) ? shown.filter((x) => x !== k) : ORDER.filter((x) => x === k || shown.includes(x));

/**
 * The sidebar next to the field: tick any of HP / Log / Graph / Stats / Buffs; the ticked ones share its height (the field's),
 * each scrolling on its own: stacked, or side by side when the sidebar is wide.
 */
export function SidePanel(props: { shown: SideKey[]; onToggle: (k: SideKey) => void; panels: Record<SideKey, ReactNode> }) {
  const order = ORDER;
  const toggle = props.onToggle;
  return (
    <aside className="side-panel" aria-label="Sidebar">
      <div className="side-inner">
        <div className="side-chips" role="group" aria-label="Show in the sidebar">
          {order.map((k) => (
            <button key={k} className={`side-chip ${props.shown.includes(k) ? "on" : ""}`} aria-pressed={props.shown.includes(k)} onClick={() => toggle(k)}
              title={`${props.shown.includes(k) ? "Hide" : "Show"} ${SIDE_HELP[k]} here (always shown below the field too)`}>
              {SIDE_LABEL[k]}
            </button>
          ))}
        </div>
        {props.shown.length === 0 && <p className="muted small side-empty">Pick what to show here. Everything is also below the field.</p>}
        <div className="side-sections">
          {order.filter((k) => props.shown.includes(k)).map((k) => (
            <section key={k} className={`side-section side-${k}`}>
              {k !== "log" && <h4>{SIDE_LABEL[k]}</h4>}
              <div className="side-scroll">{props.panels[k]}</div>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
