/**
 * A box: the units you own, with their builds, for the team generator (My Boxes page). Add units by search, from your
 * team or Recent units, or paste a list (OPTCbx's export, a list of unit IDs, or this editor's own export); set builds
 * with the quick build presets or one by one. The box video / screenshot import fills it too.
 */
import { useContext, useRef, useState } from "react";
import { applyBulk, BULK_CHOICES, changedGroups, GROUP_NAMES, isKnown, STAT_GROUPS, withKnown, type BulkValue, type StatGroup } from "../engine/buildGroups";
import type { UnitDb } from "../data/unitDb";
import type { PresetDef } from "../engine/stats";
import { vsHalves } from "../data/vs";
import { shortName } from "../engine/team";
import type { MemberConfig, TeamConfig } from "../engine/types";
import { colorClass, DefaultBuild, FloatingPop, UnitSearch, UnitSettings, withDefaultBuild } from "./TeamEditor";
import { UnitThumb } from "./UnitThumb";

/**
 * A box list from text: OPTCbx's JSON export ([{number, name, type_, class_, stars}], user 2026-11-22), our own export
 * ([{unitId, ...build}] or {box: [...]}), or plain unit IDs separated by commas / spaces / lines. Unknown IDs are dropped;
 * a VS unit's combined number adds both halves.
 */
export function parseBox(text: string, db: UnitDb): { units: MemberConfig[]; skipped: number } {
  const t = text.trim();
  let raw: unknown[] = [];
  if (t.startsWith("[") || t.startsWith("{")) {
    const j = JSON.parse(t) as unknown;
    raw = Array.isArray(j) ? j : Array.isArray((j as { box?: unknown[] }).box) ? (j as { box: unknown[] }).box : Array.isArray((j as { characters?: unknown[] }).characters) ? (j as { characters: unknown[] }).characters : [];
  } else {
    raw = t.split(/[\s,;]+/).filter(Boolean).map(Number);
  }
  const out: MemberConfig[] = [];
  let skipped = 0;
  for (const x of raw) {
    const m: MemberConfig | undefined = typeof x === "number" ? { unitId: x }
      : x && typeof x === "object" && typeof (x as MemberConfig).unitId === "number" ? (x as MemberConfig)
      : x && typeof x === "object" && (x as { number?: unknown }).number != null ? { unitId: Number((x as { number: unknown }).number) }
      : undefined;
    if (!m || m.boss) { skipped++; continue; }
    // a VS unit's combined number (OPTCbx lists 4529 for Zoro vs Nusjuro): both halves, the same build
    const halves = vsHalves(db, m.unitId);
    if (!halves.length) { skipped++; continue; }
    for (const h of halves) out.push({ ...m, unitId: h });
  }
  return { units: out, skipped };
}

/** Box -> text: our builds, and OPTCbx's fields so other tools can read it. */
export function exportBox(box: MemberConfig[], db: UnitDb): string {
  return JSON.stringify(box.map((m) => {
    const r = db.byId.get(m.unitId);
    return { ...m, number: m.unitId, name: r?.name, type_: r?.color?.slice(1, -1), class_: r?.classes, stars: r?.stars };
  }));
}

/** A box unit at a glance: level, cotton candy total and key as stored (blank when not known). */
function boxLine(m: MemberConfig): string {
  const cc = m.ccMode === "custom" && m.cc ? m.cc.hp + m.cc.atk + m.cc.rcv : undefined;
  return [m.level != null ? `Lv ${m.level}` : "", cc ? `+${cc}` : "", m.rumbleKey ? "🔑" : ""].filter(Boolean).join(" · ");
}

/**
 * The box's units (My Boxes page): add by search, from your team or Recent units, or a pasted list; set every build at
 * once with a quick build; click a unit to change its build or remove it.
 */
export function BoxEditor(props: {
  db: UnitDb; box: MemberConfig[]; presets: PresetDef[]; teams: TeamConfig[]; recent: MemberConfig[]; maxCc?: TeamConfig["maxCc"];
  name: string; onChange: (b: MemberConfig[]) => void;
}) {
  const { db, box } = props;
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string>();
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<number>();
  const [, setLoaded] = useState(0);
  const anchor = useRef<HTMLButtonElement>(null);
  const defaultBuild = useContext(DefaultBuild);
  const has = new Set(box.map((m) => m.unitId));
  const add = (ms: MemberConfig[]) => {
    const fresh = ms.filter((m, i) => !has.has(m.unitId) && ms.findIndex((x) => x.unitId === m.unitId) === i && !m.boss);
    props.onChange([...box, ...fresh]);
    setMsg(`Added ${fresh.length} unit${fresh.length === 1 ? "" : "s"}${ms.length > fresh.length ? ` (${ms.length - fresh.length} already in the box)` : ""}.`);
  };
  const edit = (id: number) => { setEditing(id); void db.ensure([id]).then(() => setLoaded((n) => n + 1)); };
  const q = filter.trim().toLowerCase();
  const shown = q ? box.filter((m) => (db.byId.get(m.unitId)?.name ?? String(m.unitId)).toLowerCase().includes(q) || String(m.unitId) === q) : box;
  const em = editing != null ? box.find((m) => m.unitId === editing) : undefined;
  const er = em ? db.byId.get(em.unitId) : undefined;
  return (
    <section className="card box-editor">
      <h3>{props.name} <span className="muted small">({box.length} unit{box.length === 1 ? "" : "s"})</span></h3>
      <div className="row-btns">
        <button ref={anchor} className="primary" onClick={() => setPicking(true)}>+ Add a unit</button>
        <button onClick={() => add(props.teams.flatMap((t) => t.members.filter((m): m is MemberConfig => !!m && !m.boss)))}>+ Your team</button>
        <button onClick={() => add(props.recent)}>+ Recent units</button>
        <input className="name-input" placeholder="Filter by name or number" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="danger-btn" disabled={!box.length} onClick={() => { if (confirm(`Remove all ${box.length} units from ${props.name}?`)) props.onChange([]); }}>Clear</button>
      </div>
      {picking && (
        <FloatingPop anchor={anchor} offset={34}>
          <UnitSearch db={db} autoFocus problem={(u) => (has.has(u.id) ? "already in the box" : undefined)} onCancel={() => setPicking(false)} onPick={(u) => { void withDefaultBuild(db, u.id, defaultBuild).then((m) => add([m])); }} />
        </FloatingPop>
      )}
      <div className="box-grid">
        {shown.map((m) => {
          const r = db.byId.get(m.unitId);
          return (
            <button key={m.unitId} type="button" className={`box-unit ${editing === m.unitId ? "on" : ""}`} title={`${r ? `#${r.id} ${r.name}` : `#${m.unitId}`}. Click to change its build.`} onClick={() => edit(m.unitId)}>
              {r ? <UnitThumb id={r.id} size={48} colorClass={colorClass(r)} /> : null}
              <span className="box-name">{r ? shortName(r.name) : m.unitId}</span>
              <span className="box-line">{boxLine(m)}</span>
              {m.known?.length ? <span className="box-known" title={`Confirmed: ${m.known.map((g) => GROUP_NAMES[g as StatGroup] ?? g).join(", ")}`}>✓{m.known.length}</span> : null}
            </button>
          );
        })}
        {!box.length && <p className="muted small">Empty. Load your box from a video above, or add units here.</p>}
        {box.length > 0 && !shown.length && <p className="muted small">No unit matches "{filter}".</p>}
      </div>
      {em && er && (
        <div className="box-unit-edit">
          {db.hasDetail(em.unitId) ? (
            <UnitSettings
              db={db} unit={er} member={em} team={{ members: [], ...(props.maxCc ? { maxCc: props.maxCc } : {}) }} index={0}
              // what's set by hand is confirmed
              onChange={(m) => props.onChange(box.map((x) => (x.unitId === em.unitId ? withKnown(m, changedGroups(x, m)) : x)))}
              actions={<>
                <button className="link small danger" onClick={() => { props.onChange(box.filter((x) => x.unitId !== em.unitId)); setEditing(undefined); }}>Remove from the box</button>
                <button className="link small" onClick={() => setEditing(undefined)}>Close</button>
              </>}
            />
          ) : <p className="muted small">Loading {er.name}…</p>}
        </div>
      )}
      <BulkEditor db={db} box={box} onChange={(b, text) => { props.onChange(b); setMsg(text); }} />
      <details className="mini">
        <summary>Paste or copy a box list</summary>
        <p className="muted small">OPTCbx's export, this box's own export, or unit IDs (e.g. "4560, 4482 4571").</p>
        <textarea className="json-box" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder='[{"number": 4560, ...}] or 4560, 4482, 4571' />
        <div className="row-btns">
          <button disabled={!text.trim()} onClick={() => { try { const r = parseBox(text, db); add(r.units); if (r.skipped) setMsg((m) => `${m ?? ""} ${r.skipped} entr${r.skipped === 1 ? "y" : "ies"} not recognized.`); } catch (e) { setMsg(`Couldn't read that: ${String(e)}`); } }}>Add these</button>
          <button disabled={!box.length} onClick={() => { const t = exportBox(box, db); setText(t); navigator.clipboard?.writeText(t).then(() => setMsg("Copied the box to the clipboard."), () => setMsg("The box is in the text box above.")); }}>Copy this box</button>
        </div>
      </details>
      {msg && <p className="notice small">{msg}</p>}
    </section>
  );
}

/**
 * Change one stat on many units at once: "set sockets to 5 each for the units where it isn't confirmed" (or all of them).
 * Confirmed = read from the game, worked out from it, or set by hand.
 */
function BulkEditor(props: { db: UnitDb; box: MemberConfig[]; onChange: (b: MemberConfig[], text: string) => void }) {
  const { db, box } = props;
  const [pick, setPick] = useState<Record<string, number>>({});
  const [scope, setScope] = useState<Record<string, "unconfirmed" | "all">>({});
  const [busy, setBusy] = useState(false);
  const apply = async (g: StatGroup) => {
    const [label, to] = BULK_CHOICES[g][pick[g] ?? 0]!;
    const sc = scope[g] ?? "unconfirmed";
    const targets = box.filter((m) => sc === "all" || !isKnown(m, g));
    if (!targets.length) return props.onChange(box, `No unit has an unconfirmed ${GROUP_NAMES[g].toLowerCase()}.`);
    if (sc === "all" && box.some((m) => isKnown(m, g)) && !confirm(`Also change the ${box.filter((m) => isKnown(m, g)).length} confirmed ${GROUP_NAMES[g].toLowerCase()} values (read from the game or set by hand)?`)) return;
    setBusy(true);
    try {
      await db.ensure(targets.map((m) => m.unitId));
      const v = { group: g, to } as BulkValue;
      let n = 0;
      const next = box.map((m) => {
        const r = db.byId.get(m.unitId);
        if (!r || (sc === "unconfirmed" && isKnown(m, g))) return m;
        const out = applyBulk(r, m, v, sc);
        if (JSON.stringify(out) !== JSON.stringify(m)) n++;
        return out;
      });
      props.onChange(next, `${GROUP_NAMES[g]} set to ${label} on ${n} unit${n === 1 ? "" : "s"}${sc === "unconfirmed" ? " (confirmed ones left as they are)" : ""}.`);
    } finally {
      setBusy(false);
    }
  };
  if (!box.length) return null;
  return (
    <details className="mini bulk-editor" open>
      <summary>Change a stat on many units</summary>
      <table className="bulk-table">
        <thead><tr><th>Stat</th><th title="Read from the game, worked out from it, or set by hand">Confirmed</th><th>Set to</th><th>On</th><th /></tr></thead>
        <tbody>
          {STAT_GROUPS.map((g) => {
            const known = box.filter((m) => isKnown(m, g)).length;
            return (
              <tr key={g}>
                <td>{GROUP_NAMES[g]}</td>
                <td className="muted small">{known} / {box.length}</td>
                <td>
                  <select value={pick[g] ?? 0} onChange={(e) => setPick({ ...pick, [g]: Number(e.target.value) })}>
                    {BULK_CHOICES[g].map(([label], i) => <option key={i} value={i}>{label}</option>)}
                  </select>
                </td>
                <td>
                  <select value={scope[g] ?? "unconfirmed"} onChange={(e) => setScope({ ...scope, [g]: e.target.value as "unconfirmed" | "all" })}>
                    <option value="unconfirmed">unconfirmed ({box.length - known})</option>
                    <option value="all">all ({box.length})</option>
                  </select>
                </td>
                <td><button className="small-btn" disabled={busy} onClick={() => void apply(g)}>Apply</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
