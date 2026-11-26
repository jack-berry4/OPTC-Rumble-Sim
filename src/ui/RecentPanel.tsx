import { useEffect, useState, type ReactNode } from "react";
import type { UnitDb } from "../data/unitDb";
import { shortName } from "../engine/team";
import { applyPreset, type Cc, type PresetDef } from "../engine/stats";
import type { MemberConfig, TeamConfig } from "../engine/types";
import { presetTitle, UnitIcon, UnitSettings, type Dnd } from "./TeamEditor";
import { UnitThumb } from "./UnitThumb";

/**
 * Recently used units, with their levels and upgrades. Drag one onto a team position to use it (the unit there
 * comes back here), or drag a team unit here to take it off the team. Click a unit to edit it here, one at a
 * time; it's away from any team, so team rules (family, cost) don't apply until it goes back on a team.
 */
export function RecentPanel(props: {
  db: UnitDb;
  recent: MemberConfig[];
  dnd: Dnd;
  open: boolean;
  /** Cotton candy max used while editing here (your account's). */
  maxCc?: Cc;
  presets: PresetDef[];
  /** Side panel tab: Recent units, Saved teams or the box in use. */
  tab: "recent" | "teams" | "box";
  onTab: (t: "recent" | "teams" | "box") => void;
  teamsContent: ReactNode;
  teamsCount: number;
  /** The box in use (My Boxes): its units drag onto a team as copies. */
  box: MemberConfig[];
  boxName: string;
  onEditBox: () => void;
  /** Why the box can't be shown (none loaded yet, or a box video being read): the tab is greyed out. */
  boxOff?: string;
  /** Panel width in px (dragging the right edge changes it). */
  width: number;
  onResize: (w: number) => void;
  onToggle: () => void;
  onChange: (r: MemberConfig[]) => void;
}) {
  const { db, recent, dnd } = props;
  const [over, setOver] = useState(false);
  const [sel, setSel] = useState<number>();
  // Units are added at the front, so a list change shifts positions: drop the selection.
  useEffect(() => setSel(undefined), [recent.length]);

  const drop = {
    onDragOver: (e: React.DragEvent) => { if (dnd.dragging && dnd.dragging.from !== "recent") { e.preventDefault(); setOver(true); } },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); dnd.drop({ from: "recent", index: 0 }); props.onTab("recent"); },
  };

  if (!props.open) {
    return (
      <aside className={`recent collapsed ${over ? "drop-over" : ""}`} {...drop}>
        <button className="recent-toggle" onClick={() => { props.onTab("recent"); props.onToggle(); }} title="Show recent units">
          Recent units
        </button>
        <button className="recent-toggle" onClick={() => { props.onTab("teams"); props.onToggle(); }} title="Show saved teams">
          Teams{props.teamsCount ? ` (${props.teamsCount})` : ""}
        </button>
        <button className="recent-toggle" disabled={!!props.boxOff} onClick={() => { props.onTab("box"); props.onToggle(); }} title={props.boxOff ?? `Show ${props.boxName}`}>
          Box{props.box.length ? ` (${props.box.length})` : ""}
        </button>
      </aside>
    );
  }

  // the box tab while it's off shows Recent units instead
  const tab = props.tab === "box" && props.boxOff ? "recent" : props.tab;
  const selected = sel !== undefined ? recent[sel] : undefined;
  const selRec = selected ? db.byId.get(selected.unitId) : undefined;
  const update = (m: MemberConfig) => props.onChange(recent.map((x, j) => (j === sel ? m : x)));
  // Editing here happens away from any team: an empty stand-in team, with your account's cotton candy max.
  const loneTeam: TeamConfig = { members: [], maxCc: props.maxCc };

  return (
    <aside className={`recent ${over ? "drop-over" : ""} ${selected ? "editing" : ""}`} style={{ width: props.width }} {...drop}>
      <Resizer width={props.width} onResize={props.onResize} />
      <div className="recent-head">
        <div className="tabs small-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "recent"} className={tab === "recent" ? "on" : ""} onClick={() => props.onTab("recent")}>
            Recent units
          </button>
          <button role="tab" aria-selected={tab === "teams"} className={tab === "teams" ? "on" : ""} onClick={() => props.onTab("teams")}>
            Teams{props.teamsCount ? ` (${props.teamsCount})` : ""}
          </button>
          <button role="tab" aria-selected={tab === "box"} className={tab === "box" ? "on" : ""} disabled={!!props.boxOff} onClick={() => props.onTab("box")} title={props.boxOff ?? props.boxName}>
            Box{props.box.length ? ` (${props.box.length})` : ""}
          </button>
        </div>
        <button className="icon" onClick={props.onToggle} title="Hide">◂</button>
      </div>
      {tab === "box" ? <BoxList db={db} box={props.box} name={props.boxName} dnd={dnd} onEdit={props.onEditBox} /> : tab === "teams" ? props.teamsContent : <>
      <p className="muted small" title="Drag onto a team to use; drag a team unit here to take it off. Click a unit to edit it. Levels and upgrades are kept.">
        Drag to use · click to edit
      </p>
      {recent.length === 0 && <p className="muted small">Units you take off a team show up here.</p>}
      <div className="recent-grid">
        {recent.map((m, i) => {
          const rec = db.byId.get(m.unitId);
          if (!rec) return null;
          return (
            <div
              key={i}
              className={`recent-item ${m.illegal ? "illegal" : ""} ${sel === i ? "selected" : ""}`}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(m.unitId)); dnd.start({ from: "recent", index: i }); }}
              onDragEnd={() => dnd.end()}
            >
              {db.hasDetail(m.unitId) ? (
                <UnitIcon
                  unit={rec}
                  member={m}
                  size={52}
                  maxCc={props.maxCc}
                  onClick={() => setSel(sel === i ? undefined : i)}
                  title={`#${rec.id} ${rec.name}${m.illegal ? " (illegal)" : ""}. Click to edit, drag onto a team to use.`}
                />
              ) : (
                <span className="unit-icon loading" style={{ width: 52, height: 52 }} title={`#${rec.id} ${rec.name}`}>
                  <UnitThumb id={rec.id} size={52} />
                </span>
              )}
              <span className="recent-name" title={rec.name}>{shortName(rec.name)}</span>
              <button className="recent-x" title="Forget this unit" onClick={() => props.onChange(recent.filter((_, j) => j !== i))}>×</button>
            </div>
          );
        })}
      </div>
      {recent.length > 0 && !selected && <button className="link small" onClick={() => props.onChange([])}>Clear all</button>}

      {selected && selRec && db.hasDetail(selected.unitId) && (
        <div className="recent-editor" key={sel}>
          <div className="recent-editor-head">
            <div className="slot-head">
              <div className="unit-title" title={`#${selRec.id} ${selRec.name}`}>{shortName(selRec.name)}</div>
              {selRec.name.includes(" - ") && <div className="unit-subtitle" title={selRec.name}>{selRec.name.split(" - ").slice(1).join(" - ")}</div>}
            </div>
            <button
              className="small-btn"
              title="Add a copy of this unit to Recent units (to keep another build of the same character)"
              onClick={() => { if (selected) props.onChange([structuredClone(selected), ...recent]); }}
            >
              ⧉ Copy
            </button>
            <button className="icon" title="Done" onClick={() => setSel(undefined)}>✕</button>
          </div>
          <UnitSettings db={db} unit={selRec} member={selected} team={loneTeam} index={0} onChange={update} />
          <div className="preset-row" title="Quick build presets: set this unit to a saved build (edit them in Settings)">
            <span className="preset-title">Presets:</span>
            {props.presets.map((x, i) => (
              <button key={i} className="preset" title={presetTitle(x)} onClick={() => update(applyPreset(selRec, selected, x))}>{x.label}</button>
            ))}
          </div>
        </div>
      )}
      </>}
    </aside>
  );
}

export const PANEL_MIN = 200;
export const PANEL_MAX = 560;

/** Drag handle on the panel's right edge. Double-click resets to the default width. */
function Resizer(props: { width: number; onResize: (w: number) => void }) {
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = props.width;
    const aside = e.currentTarget.parentElement;
    aside?.classList.add("resizing");
    const move = (ev: PointerEvent) => props.onResize(Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w0 + ev.clientX - x0))));
    const up = () => {
      aside?.classList.remove("resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={props.width}
      title="Drag to resize · double-click to reset"
      onPointerDown={start}
      onDoubleClick={() => props.onResize(-1)}
    />
  );
}

const BOX_SHOWN = 150;
/** The box in use, to drag units from (copies: the box keeps them); a filter for big boxes. */
function BoxList(props: { db: UnitDb; box: MemberConfig[]; name: string; dnd: Dnd; onEdit: () => void }) {
  const { db, box, dnd } = props;
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(BOX_SHOWN);
  const t = q.trim().toLowerCase();
  const list = box.map((m, i) => ({ m, i })).filter(({ m }) => !t || (db.byId.get(m.unitId)?.name ?? "").toLowerCase().includes(t) || String(m.unitId) === t);
  return (
    <>
      <p className="muted small">{props.name}: drag a unit onto a team (a copy) · <button className="link small" onClick={props.onEdit}>Edit the box</button></p>
      {box.length > 12 && <input className="name-input" placeholder="Filter by name or number" value={q} onChange={(e) => { setQ(e.target.value); setLimit(BOX_SHOWN); }} />}
      {!box.length && <p className="muted small">The box is empty: load it from a box video in My Boxes.</p>}
      <div className="recent-grid">
        {list.slice(0, limit).map(({ m, i }) => {
          const rec = db.byId.get(m.unitId);
          if (!rec) return null;
          return (
            <div
              key={i}
              className="recent-item"
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", String(m.unitId)); dnd.start({ from: "box", index: i }); }}
              onDragEnd={() => dnd.end()}
              title={`#${rec.id} ${rec.name}${m.level != null ? ` · Lv ${m.level}` : ""}. Drag onto a team to use a copy.`}
            >
              <span className="unit-icon" style={{ width: 52, height: 52 }}><UnitThumb id={rec.id} size={52} /></span>
              <span className="recent-name">{shortName(rec.name)}</span>
              {m.level != null && <span className="box-line">Lv {m.level}{m.rumbleKey ? " · 🔑" : ""}</span>}
            </div>
          );
        })}
      </div>
      {list.length > limit && <button className="link small" onClick={() => setLimit(limit + BOX_SHOWN)}>Show more ({list.length - limit} left)</button>}
    </>
  );
}
