/**
 * My Boxes (a tab beside the game modes): your boxes of owned units, e.g. one per account. The picked box is the one
 * the team generator's "My box" and Assault Rumble's owned-trusty bonus use. Each box is filled from a box video (or
 * screenshots), or by hand, and its units' builds can be changed one by one.
 */
import { lazy, Suspense, useState } from "react";
import type { UnitDb } from "../data/unitDb";
import type { PresetDef } from "../engine/stats";
import type { MemberConfig, TeamConfig } from "../engine/types";
import { BoxEditor } from "./BoxDialog";
import type { ImportDialog as ImportDialogFn } from "./ImportDialog";

// the box video loader (and its OCR) is its own chunk, loaded after the first screen
const ImportDialog = lazy(() => import("./ImportDialog").then((m) => ({ default: m.ImportDialog })));

export interface NamedBox { id: string; name: string; units: MemberConfig[] }
export interface Boxes { active: string; list: NamedBox[] }

export const newBoxId = () => `box-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** The boxes as saved, or the old single box (rumble-sim-box-v1) as the first one. */
export function migrateBoxes(saved: Boxes | undefined, oldBox: MemberConfig[] | undefined): Boxes {
  if (saved?.list?.length) return saved.list.some((b) => b.id === saved.active) ? saved : { ...saved, active: saved.list[0]!.id };
  const first: NamedBox = { id: newBoxId(), name: "My box", units: oldBox ?? [] };
  return { active: first.id, list: [first] };
}
/** One entry per unit: imported ones replace those already there (they carry what was read). */
export function mergeIntoBox(box: MemberConfig[], ms: MemberConfig[]): MemberConfig[] {
  const fresh = ms.filter((m, i) => !m.boss && ms.findIndex((x) => x.unitId === m.unitId) === i);
  const by = new Map(fresh.map((m) => [m.unitId, m]));
  return [...box.map((m) => by.get(m.unitId) ?? m), ...fresh.filter((m) => !box.some((x) => x.unitId === m.unitId))];
}

export function BoxesPage(props: {
  db: UnitDb;
  presets: PresetDef[];
  boxes: Boxes;
  onBoxes: (b: Boxes) => void;
  teams: TeamConfig[];
  recent: MemberConfig[];
  maxCc?: TeamConfig["maxCc"];
  /** The import's other actions (team screenshots and unit pages work here too). */
  importActs: Pick<Parameters<typeof ImportDialogFn>[0], "onTeam" | "onSave" | "onRecent" | "onUpdate">;
  /** Kept on while you're on another page (a box video still being read). */
  hidden?: boolean;
  onBusy?: Parameters<typeof ImportDialogFn>[0]["onBusy"];
}) {
  const { boxes } = props;
  const box = boxes.list.find((b) => b.id === boxes.active) ?? boxes.list[0]!;
  const [renaming, setRenaming] = useState(false);
  const setUnits = (units: MemberConfig[]) => props.onBoxes({ ...boxes, list: boxes.list.map((b) => (b.id === box.id ? { ...b, units } : b)) });
  const addBox = () => {
    const name = prompt("Name of the new box (e.g. the account it's from):", `Box ${boxes.list.length + 1}`);
    if (!name?.trim()) return;
    const b: NamedBox = { id: newBoxId(), name: name.trim().slice(0, 40), units: [] };
    props.onBoxes({ active: b.id, list: [...boxes.list, b] });
  };
  const removeBox = () => {
    if (boxes.list.length < 2 || !confirm(`Delete the box "${box.name}" and its ${box.units.length} units?`)) return;
    const list = boxes.list.filter((b) => b.id !== box.id);
    props.onBoxes({ active: list[0]!.id, list });
  };
  return (
    <div className="boxes-page" hidden={props.hidden}>
      <section className="card">
        <h3>My Boxes <span className="muted small">— the units you own, for the team generator ("My box") and Assault Rumble's owned trusty bonus</span></h3>
        <div className="row-btns boxes-tabs" role="radiogroup" aria-label="Box">
          {boxes.list.map((b) => (
            <button key={b.id} role="radio" aria-checked={b.id === box.id} className={b.id === box.id ? "on" : undefined} onClick={() => props.onBoxes({ ...boxes, active: b.id })} title="Use this box">
              {b.name} <span className="muted small">({b.units.length})</span>
            </button>
          ))}
          <button className="link small" onClick={addBox}>+ New box</button>
        </div>
        <div className="row-btns small">
          {renaming ? (
            <input
              className="name-input" autoFocus defaultValue={box.name} maxLength={40}
              onBlur={(e) => { const n = e.target.value.trim(); if (n) props.onBoxes({ ...boxes, list: boxes.list.map((b) => (b.id === box.id ? { ...b, name: n } : b)) }); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(false); }}
            />
          ) : <button className="link small" onClick={() => setRenaming(true)}>Rename</button>}
          {boxes.list.length > 1 && <button className="link small danger" onClick={removeBox}>Delete this box</button>}
          <span className="muted small">The team generator uses the box picked here.</span>
        </div>
      </section>
      <Suspense fallback={null}>
      <ImportDialog
        db={props.db}
        presets={props.presets}
        maxCc={props.maxCc}
        inline={{ title: `Load ${box.name} from a box video`, boxName: box.name }}
        onBox={(ms) => setUnits(mergeIntoBox(box.units, ms))}
        onReplaceBox={(ms) => setUnits(mergeIntoBox([], ms))}
        onClose={() => undefined}
        {...(props.hidden ? { hidden: true } : {})}
        {...(props.onBusy ? { onBusy: props.onBusy } : {})}
        {...props.importActs}
      />
      </Suspense>
      <BoxEditor
        db={props.db} box={box.units} presets={props.presets} teams={props.teams} recent={props.recent} maxCc={props.maxCc}
        name={box.name} onChange={setUnits}
      />
    </div>
  );
}
