import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { effectLines, patternToString, resilienceToString, superConditionToString } from "../data/rumbleText";
import { useSiteText } from "../data/siteText";
import { compileEffects, specText, type Source } from "../sim/spec";
import type { UnitRecord } from "../data/schema";
import type { UnitDb } from "../data/unitDb";
import { placementProblem, shortName, TEAM_COST_LIMIT, teamCost, validateTeam } from "../engine/team";
import {
  accountMaxCc, applyPreset, canLimitBreak, displayedStats, hasLbExpansion, keyAllowedAt, kitFor, lbMaxNodes,
  legalize, legalizeChanges, llbPartsActive, llbUpgradesText, statUp, MAX_CC, MAX_CC_TOTAL, MAX_LEVEL_LLB, MAX_POTENTIAL_LEVELS, POTENTIAL_MAX_LEVEL, SOCKET_MAX_LEVEL, LLB_EXTRA_LEVELS,
  maxLevelFor, memberCost, RUMBLE_KEY_MIN_LEVEL, rumbleDefSpd, rumbleStats, withDefaults, type Cc, type AdvancedPreset, type KeyTier, type PresetDef,
} from "../engine/stats";
import type { MemberConfig, TeamConfig } from "../engine/types";
import { BOSS_TEAM_MAX } from "../engine/boss";
import { boxEdit, sameBuild } from "../engine/buildGroups";
import { LegalBadge } from "./TeamLibrary";
import { UnitThumb } from "./UnitThumb";
import { Typed } from "./Typed";

export type { Cc };
/** A unit place: a team position, a Recent unit, or a unit of the box in use (dragged as a copy). */
export type SlotRef = { from: "atk" | "def" | "recent" | "box"; index: number };

const SLOT_TITLES = ["Slot 1", "Slot 2", "Slot 3", "Slot 4", "Slot 5", "Bench 1", "Bench 2", "Bench 3"];
/** Tooltip describing a quick build. */
export const presetTitle = (p: PresetDef) => p.useAdvanced && p.advanced ? advancedTitle(p.advanced) :
  `Level ${p.level}, LLB ${p.llbLevel}, Limit Break ${p.lb === "none" ? "none" : p.lb === "regular" ? "max" : "expanded (keyed)"}` +
  `${p.rumbleKey ? ", Rumble key" : ""}, special/ability ${p.maxSkills ? "maxed" : "level 1"}, potentials lv ${p.potentialLevel} each, sockets lv ${p.socketLevel} each`;

/** Tooltip for an advanced quick build. */
export function advancedTitle(a: AdvancedPreset): string {
  const mx = (v: number | undefined) => (v === undefined ? "max" : String(v));
  const pots = Object.entries(a.potentials).filter(([, v]) => v !== a.potentialDefault).map(([k, v]) => `${k} ${v}`);
  return `Advanced: level ${a.level}, LLB ${a.llbLevel}, Limit Break ${a.lb === "none" ? "none" : a.lb === "regular" ? "max" : "expanded (keyed)"}` +
    `${a.lbNodes !== undefined ? ` (up to ${a.lbNodes} nodes)` : ""}${a.rumbleKey ? ", Rumble key" : ""}` +
    `, special ${mx(a.specialLevel)}, ability ${mx(a.abilityLevel)}, main special ${mx(a.mainSpecialLevel)}` +
    `, potentials lv ${a.potentialDefault}, premium lv ${a.premiumDefault ?? a.potentialDefault}${pots.length ? ` (${pots.join(", ")})` : ""}, sockets lv ${a.socketLevel} each` +
    `, cotton candy ${a.cc === "custom" ? `${a.ccCustom.hp}/${a.ccCustom.atk}/${a.ccCustom.rcv}` : a.cc === "max" ? "account max" : a.cc}`;
}

/** Shared drag-and-drop handlers (owned by the app, so units can move between teams and the Recent panel). */
export interface Dnd {
  start: (src: SlotRef) => void;
  drop: (dst: SlotRef) => void;
  end: () => void;
  dragging?: SlotRef;
}

/**
 * The box in use, for team units copied from it (the same build as the box's): changing one on a team can change it
 * in the box too (user, 2026-11-25).
 */
export interface BoxLink {
  units: MemberConfig[];
  name: string;
  /** Changes to a box unit on a team also go to the box. */
  sync: boolean;
  onSync: (on: boolean) => void;
  /** Put this build in the box (in place of the unit's entry). */
  onUpdate: (m: MemberConfig) => void;
}

/** One team as 8 positions in a row; "Customize" opens every unit's settings in the same row. */
export function TeamEditor(props: {
  title: string;
  side: "atk" | "def";
  db: UnitDb;
  team: TeamConfig;
  dnd: Dnd;
  onChange: (t: TeamConfig) => void;
  /** A unit leaves the team (removed or replaced): it goes to the Recent panel. */
  onRetire: (m: MemberConfig) => void;
  /** Customize settings open (owned by the app, which widens the side panel when both teams are closed). */
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Open the Save / Load dialog for this team. */
  onLibrary: (mode: "save" | "load") => void;
  presets: PresetDef[];
  /** Assault Rumble boss team: BOSS_TEAM_MAX (4) positions of bosses, edited in the boss editor. */
  bosses?: { onAdd: (index: number) => void; onEdit: (index: number) => void };
  /** Shown under the team's positions (the Grand Party leader). */
  extra?: ReactNode;
  /** The box in use (not on a boss team). */
  box?: BoxLink;
}) {
  const { db, team, onChange, side } = props;
  const { open, onOpen: setOpen } = props;
  const sectionRef = useRef<HTMLElement>(null);
  const cost = teamCost(db, team);
  // Illegal units don't count toward the cost, but their real cost is still shown (with *).
  const illegalCost = team.members.reduce((n, m) => n + (m?.illegal ? db.byId.get(m.unitId)?.cost ?? 0 : 0), 0);
  const problems = validateTeam(db, team);
  const bosses = props.bosses;
  const rows = Array.from({ length: bosses ? BOSS_TEAM_MAX : 8 }, (_, i) => team.members[i] ?? null);
  /** An emptied team is no longer the saved / shared team it came from: its title and authors go too. */
  const withMembers = (members: (MemberConfig | null)[]): TeamConfig => {
    if (members.some(Boolean)) return { ...team, members };
    const { meta: _meta, ...rest } = team;
    void _meta;
    return { ...rest, members: bosses ? [...members, ...Array<null>(8 - BOSS_TEAM_MAX).fill(null)] : members };
  };
  const setRow = (i: number, m: MemberConfig | null) => {
    const next = [...rows];
    const old = next[i];
    if (bosses) { next[i] = m; onChange(withMembers(next)); return; } // bosses don't go to Recent units
    if (old && (!m || m.unitId !== old.unitId)) props.onRetire(old);
    next[i] = m;
    onChange(withMembers(next));
  };
  const clearAll = () => {
    if (!bosses) for (const m of rows) if (m) props.onRetire(m);
    onChange(withMembers(rows.map(() => null)));
  };
  const empty = !rows.some(Boolean);
  const box = bosses ? undefined : props.box;
  /** The box's entry for a unit on this team, when the team has the box's build of it. */
  const linkedBox = (m: MemberConfig | null) => {
    const b = m && !m.boss ? box?.units.find((x) => x.unitId === m.unitId) : undefined;
    return b && sameBuild(b, m!) ? b : undefined;
  };
  const boxSynced = box?.sync ? rows.filter((m) => linkedBox(m)).length : 0;
  const presetAll = (p: PresetDef) =>
    onChange({
      ...team,
      members: rows.map((m) => {
        if (!m || !db.byId.get(m.unitId)) return m;
        const nm = applyPreset(db.byId.get(m.unitId)!, m, p);
        const b = box?.sync && !nm.illegal ? linkedBox(m) : undefined;
        if (!b) return nm;
        const e = boxEdit(b, nm);
        box!.onUpdate(e);
        return e;
      }),
    });

  return (
    <section ref={sectionRef} className={`team team-${side} ${open ? "open" : ""}`}>
      <header className="team-head">
        <h2>
          {props.title}
          {team.meta?.title && <span className="team-name" title={team.meta.authors.length ? `by ${team.meta.authors.join(", ")}` : undefined}>{team.meta.title}</span>}
        </h2>
        {!bosses && <><span
          className={`cost ${cost > TEAM_COST_LIMIT ? "bad" : ""}`}
          title={`Team cost (limit 300).${illegalCost ? ` Illegal units (${illegalCost} cost, marked *) are not counted.` : ""}`}
        >
          <span className="cost-bar"><span style={{ width: `${Math.min(100, (cost / TEAM_COST_LIMIT) * 100)}%` }} /></span>
          {cost} / {TEAM_COST_LIMIT}
          {illegalCost > 0 && <span className="small">(+{illegalCost}*)</span>}
        </span>
        <span className="muted small" title="This account's cotton candy maximum, 100-200 per stat by monument level (change it in Settings)">
          CC max {fmtCc(accountMaxCc(team.maxCc))}
        </span>
        <LegalBadge db={db} team={team} /></>}
        {bosses && <span className="muted small" title={`Assault Rumble: up to ${BOSS_TEAM_MAX} bosses, all on the field`}>{rows.filter(Boolean).length} / {BOSS_TEAM_MAX} bosses</span>}
        <button className="team-btn" title="Save this team to history or as a code" onClick={() => props.onLibrary("save")}>Save</button>
        <button className="team-btn" title="Load a team from history or a code (replaces this team)" onClick={() => props.onLibrary("load")}>Load</button>
        <button
          className="team-btn"
          disabled={empty}
          title={empty ? "The team is already empty" : bosses ? "Remove every boss from this team" : "Remove every unit from this team (they go to Recent units). An empty team drops its saved name and authors."}
          onClick={clearAll}
        >
          Clear
        </button>
        <div className="customize-stack">
          <button className={`customize ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? "Close settings ▴" : "Customize ▾"}
          </button>
          {open && (
            <button
              className="link small"
              title="Open every unit's dropdowns, or close them all (Level and LLB too) if they're all open"
              onClick={() => toggleAllDetails(sectionRef.current?.querySelectorAll<HTMLDetailsElement>(".team-row details.mini"))}
            >
              Toggle all dropdowns
            </button>
          )}
        </div>
      </header>
      <div className="team-scroll">
        <div className={`team-row ${open ? "expanded" : ""}`}>
          {rows.map((m, i) => (
            <Slot
              key={i}
              index={i}
              side={side}
              db={db}
              team={team}
              member={m}
              open={open}
              presets={props.presets}
              dnd={props.dnd}
              boss={bosses ? { add: () => bosses.onAdd(i), edit: () => bosses.onEdit(i) } : undefined}
              box={box}
              onChange={(nm) => setRow(i, nm)}
            />
          ))}
        </div>
      </div>
      {props.extra}
      {open && !bosses && (
        <div className="team-foot">
          <span className="preset-title">Presets:</span>
          <span className="muted small">set every unit to</span>
          {props.presets.map((x, i) => <button key={i} className="preset" title={presetTitle(x)} onClick={() => presetAll(x)}>{x.label}</button>)}
          {boxSynced > 0 && <span className="muted small" title={`Turn this off with the checkbox on a unit's card ("From ${box!.name}")`}>(also changes {boxSynced} unit{boxSynced === 1 ? "" : "s"} in {box!.name})</span>}
        </div>
      )}
      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </section>
  );
}

function Slot(props: {
  index: number;
  side: "atk" | "def";
  db: UnitDb;
  team: TeamConfig;
  member: MemberConfig | null;
  open: boolean;
  presets: PresetDef[];
  dnd: Dnd;
  onChange: (m: MemberConfig | null) => void;
  /** A boss position (Assault Rumble): add / edit open the boss editor. */
  boss?: { add: () => void; edit: () => void };
  box?: BoxLink;
}) {
  const { db, member, onChange, index, side, team, dnd, boss } = props;
  const unit = member ? db.byId.get(member.unitId) : undefined;
  const [picking, setPicking] = useState(false);
  const [over, setOver] = useState(false);
  const bench = index >= 5;
  const self: SlotRef = { from: side, index };
  const isDragging = dnd.dragging?.from === side && dnd.dragging.index === index;
  const slotRef = useRef<HTMLDivElement>(null);

  const dropProps = {
    onDragOver: (e: React.DragEvent) => { if (dnd.dragging) { e.preventDefault(); setOver(true); } },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); dnd.drop(self); },
  };
  const cls = `slot ${bench ? "bench" : ""} ${props.open ? "card" : ""} ${over ? "drop-over" : ""} ${isDragging ? "dragging" : ""} ${member?.illegal ? "illegal" : ""}`;

  const defaultBuild = useContext(DefaultBuild);
  // The search floats above the page (portal) so neighboring Customize cards and the row's scroll box can't hide it.
  const search = picking && (
    <FloatingPop anchor={slotRef} offset={props.open ? 76 : 70}>
      <UnitSearch
        db={db}
        autoFocus
        problem={(u) => placementProblem(db, team, index, { unitId: u.id })}
        onPick={(u) => {
          setPicking(false);
          // a replaced unit's Rumble special / ability levels carry over; the rest is the default build
          const keep: Partial<MemberConfig> = {};
          if (member?.specialLevel != null) keep.specialLevel = member.specialLevel;
          if (member?.abilityLevel != null) keep.abilityLevel = member.abilityLevel;
          onChange({ unitId: u.id, ...keep });
          if (defaultBuild) void withDefaultBuild(db, u.id, defaultBuild, keep).then(onChange);
        }}
        onCancel={() => setPicking(false)}
      />
    </FloatingPop>
  );

  if (!unit || !member) {
    return (
      <div ref={slotRef} className={cls} {...dropProps}>
        {bench && index === 5 && <span className="bench-label">Bench</span>}
        {boss ? (
          <button className="slot-empty" title={`Boss ${index + 1}: empty. Click to make a boss, or drag a unit here to make a boss from it.`} onClick={boss.add}>
            <span>+</span>
            <small>Boss {index + 1}</small>
          </button>
        ) : (
          <button className="slot-empty" title={`${SLOT_TITLES[index]}: empty. Click to add a unit, or drag one here.`} onClick={() => setPicking(true)}>
            <span>+</span>
            <small>{SLOT_TITLES[index]}</small>
          </button>
        )}
        {search}
      </div>
    );
  }

  // The unit's heavy detail (kit, stats, Limit Break) is fetched on demand; show a light placeholder until it lands.
  if (!db.hasDetail(member.unitId)) {
    return (
      <div ref={slotRef} className={cls} {...dropProps}>
        {bench && index === 5 && <span className="bench-label">Bench</span>}
        <div className="slot-icon-row">
          <span className="unit-icon loading" style={{ width: 64, height: 64 }} title={`#${unit.id} ${unit.name}`}>
            <UnitThumb id={unit.id} size={64} colorClass={colorClass(unit)} />
          </span>
          {props.open && (
            <div className="slot-head">
              <div className="unit-title">{shortName(unit.name)}</div>
              <div className="unit-subtitle muted">loading…</div>
            </div>
          )}
        </div>
        {search}
      </div>
    );
  }

  if (boss && member.boss) {
    const b = member.boss;
    return (
      <div ref={slotRef} className={`${cls} boss-slot`} {...dropProps}>
        <div className="slot-icon-row" draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(member.unitId)); dnd.start(self); }} onDragEnd={() => dnd.end()} title="Drag to reorder">
          <button className="unit-icon" style={{ width: 64, height: 64 }} title={`Boss ${index + 1}: ${b.name} (click to edit)`} onClick={boss.edit} type="button">
            <UnitThumb id={unit.id} size={64} colorClass={colorClass(unit)} badge={b.color} />
            <span className="boss-hp">{fmtBig(b.stats.hp)}</span>
          </button>
          {!props.open && <button className="slot-x" title="Remove this boss" onClick={() => onChange(null)}>×</button>}
          {props.open && (
            <div className="slot-head">
              <div className="unit-title" title={b.name}>{b.name}</div>
              <div className="slot-meta">
                <span className={`style-badge style-${b.style}`}>{b.style}</span>
                <span className="meta"><Typed text={(b.color ?? "no type").replace(/[[\]]/g, "")} /> · {b.classes.join(" / ") || "no class"}</span>
              </div>
            </div>
          )}
        </div>
        {props.open && (
          <div className="boss-card">
            <div className="small">HP {b.stats.hp.toLocaleString()} · ATK {b.stats.atk.toLocaleString()} · RCV {b.stats.rcv.toLocaleString()} · DEF {b.stats.def} · SPD {b.stats.spd}</div>
            <div className="muted small">{b.abilities.length} ability effect{b.abilities.length === 1 ? "" : "s"} · {b.special ? `special ${b.special.cooldown}s, ${b.special.effects.length} effect${b.special.effects.length === 1 ? "" : "s"}` : "no special"}{b.superSpecial ? " · super special" : ""}</div>
            <div className="slot-actions">
              <button className="link" onClick={boss.edit}>Edit boss</button>
              <button className="link danger" onClick={() => onChange(null)}>Remove</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // a unit of the box in use: with the box's build, changes can go to the box too; with another build, a way to either
  const box = props.box;
  const boxed = box && !member.boss ? box.units.find((x) => x.unitId === member.unitId) : undefined;
  const linked = !!boxed && sameBuild(boxed, member);
  /** A change to this unit's build (settings, a preset). */
  const edit = (nm: MemberConfig) => {
    // (an illegal (admin) copy is never put in the box)
    if (!linked || !box!.sync || nm.illegal) return onChange(nm);
    const e = boxEdit(boxed!, nm);
    box!.onUpdate(e);
    onChange(e);
  };
  const boxNote = boxed && (linked ? (
    <label
      className="check-row box-link small"
      title={`This unit has ${box!.name}'s build (My Boxes). Checked: changing it here (its settings, a preset) changes it in the box too. Unchecked: only this team's copy changes. One setting for every box unit on your teams.`}
    >
      <input type="checkbox" checked={box!.sync} onChange={(e) => box!.onSync(e.target.checked)} />
      <span>From {box!.name}: changes here change it there too</span>
    </label>
  ) : (
    <div className="box-link muted small">
      {box!.name} has another build of this unit.{" "}
      <button className="link" title="Give this team's copy the box's build" onClick={() => onChange(boxed)}>Use the box's</button>
      {" · "}
      <button className="link" title={`Put this build in ${box!.name} in place of the one there`} onClick={() => box!.onUpdate(boxEdit(boxed, member))}>Put this one in the box</button>
    </div>
  ));

  const dragProps = {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(member.unitId)); dnd.start(self); },
    onDragEnd: () => dnd.end(),
  };

  return (
    <div ref={slotRef} className={cls} {...dropProps}>
      {bench && index === 5 && <span className="bench-label">Bench</span>}
      <div className="slot-icon-row" {...dragProps} title="Drag to move or swap">
        <UnitIcon unit={unit} member={member} maxCc={team.maxCc} onClick={() => setPicking(true)} title={`${SLOT_TITLES[index]}: #${unit.id} ${unit.name} (click to change, drag to move)`} />
        {!props.open && <button className="slot-x" title="Remove (goes to Recent units)" onClick={() => onChange(null)}>×</button>}
        {props.open && (
          <div className="slot-head">
            <div className="unit-title" title={`#${unit.id} ${unit.name}`}>{shortName(unit.name)}</div>
            {unit.name.includes(" - ") && <div className="unit-subtitle" title={unit.name}>{unit.name.split(" - ").slice(1).join(" - ")}</div>}
            <div className="slot-meta">
              <span className={`style-badge style-${unit.style}`}>{unit.style}</span>
              {kitFor(unit, member).superSpecial && <span className="super-badge" title="Has a Rumble super special">SUPER</span>}
              {member.illegal ? (
                <span className="meta" title="Illegal unit: not counted in the team cost">{unit.cost}c*</span>
              ) : (
                <span className="meta">{memberCost(unit, member)}c</span>
              )}
            </div>
          </div>
        )}
      </div>
      {search}
      {props.open && (
        <>
          {boxNote}
          <UnitSettings
            db={db}
            unit={unit}
            member={member}
            team={team}
            index={index}
            onChange={edit}
            actions={
              <div className="slot-actions">
                <button
                  className="link"
                  title="Open all of this unit's dropdowns, or close them all if they're all open"
                  onClick={() => toggleAllDetails(slotRef.current?.querySelectorAll<HTMLDetailsElement>("details.mini"))}
                >
                  Toggle all
                </button>
                <button className="link" title="Pick a different unit for this slot (you can also click the unit's icon)" onClick={() => setPicking(true)}>Change unit</button>
                <button className="link danger" title="Take this unit off the team (it goes to Recent units)" onClick={() => onChange(null)}>Remove</button>
              </div>
            }
          />
          <div className="preset-row" title="Quick build presets: set this unit to a saved build (edit them in Settings)">
            <span className="preset-title">Presets:</span>
            {props.presets.map((x, i) => (
              <button key={i} className="preset" title={presetTitle(x)} onClick={() => edit(applyPreset(unit, member, x))}>{x.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Level text as the game shows it: white below 99; gold "MAX" at the normal max (LLB 0, or a unit's own
 * max such as 70 or 50); gold while below the LLB max; red at the LLB max; red "MAX" at 150.
 */
export function levelBadge(unit: UnitRecord, d: { level: number; maxLevel: number; llbLevel: number }) {
  if (d.level >= MAX_LEVEL_LLB) return { text: "MAX", cls: "lv-red" };
  if (d.llbLevel === 0 && d.level === d.maxLevel) return { text: "MAX", cls: "lv-gold" };
  if (d.level < 99) return { text: String(d.level), cls: d.level > d.maxLevel ? "lv-red" : "lv-white" };
  if (d.level < d.maxLevel) return { text: String(d.level), cls: "lv-gold" };
  return { text: String(d.level), cls: canLimitBreak(unit) || d.level > d.maxLevel ? "lv-red" : "lv-gold" };
}

/** Unit portrait with its level, a Limit Break MAX circle and a Rumble key marker, like the game. */
export function UnitIcon(props: { unit: UnitRecord; member: MemberConfig; maxCc?: Cc; onClick?: () => void; title: string; size?: number }) {
  const { unit, member } = props;
  const d = withDefaults(unit, member, props.maxCc);
  const lv = levelBadge(unit, d);
  const lbFull = !!unit.lb && d.lbNodes > 0 && d.lbNodes >= lbMaxNodes(unit, false);
  const size = props.size ?? 64;
  return (
    <button className="unit-icon" style={{ width: size, height: size }} title={props.title} onClick={props.onClick} type="button">
      <UnitThumb id={unit.id} size={size} colorClass={colorClass(unit)} />
      <span className={`lv-badge ${lv.cls}`}><small>Lv.</small>{lv.text}</span>
      {lbFull && (
        <span
          className={`lb-max ${d.lbKey && hasLbExpansion(unit) && d.lbNodes >= unit.lb!.steps.length ? "expanded" : ""}`}
          title={`Limit Break maxed (${d.lbNodes} nodes${d.lbKey && hasLbExpansion(unit) ? ", expansion unlocked" : ""})`}
        >
          MAX
        </span>
      )}
      {d.rumbleKey && d.keyTier && <span className="rkey" title={`Rumble key (${d.keyTier.label})`}><KeyIcon /></span>}
      {member.illegal && <span className="illegal-dot" title="Illegal (admin) unit: no limits, costs 0">!</span>}
    </button>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M11.5 11.5 L21 21 M17 17 l2.5 -2.5 M14.5 14.5 l2 -2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** All the settings for one unit (shown when the team's settings are open). */
/** The simulator's reading of the same effects (src/sim/spec.ts): who, when, what, how long, how copies stack. */
export function SimReading({ effects, source }: { effects: import("../data/schema").Effect[]; source: Source }) {
  if (!effects.length) return null;
  const specs = compileEffects(effects, source);
  return (
    <details className="mini sim-reading">
      <summary title="How the simulator reads each line above: same order, one per line">How the simulator reads it</summary>
      <ol className="kit-lines">
        {specs.map((sp, i) => (
          <li key={i}>
            <Typed text={specText(sp)} />
            {sp.notes.length > 0 && <div className="muted small">{sp.notes.join(" · ")}</div>}
          </li>
        ))}
      </ol>
    </details>
  );
}

export function UnitSettings(props: {
  db: UnitDb; unit: UnitRecord; member: MemberConfig; team: TeamConfig; index: number; onChange: (m: MemberConfig) => void;
  /** Buttons shown under the Legal checkbox (Toggle all / Change unit / Remove on a team card). */
  actions?: ReactNode;
}) {
  const { unit, member, team, onChange } = props;
  const custom = !!member.illegal;
  const d = withDefaults(unit, member, team.maxCc);
  const set = (patch: Partial<MemberConfig>) => onChange({ ...member, ...patch });
  const stats = { ...rumbleStats(unit, member, team.maxCc), ...rumbleDefSpd(unit, member) };
  // What the stats go back to when typed-in stats are switched off
  const noExact = { ...member, exact: undefined };
  const calc = { ...rumbleStats(unit, noExact, team.maxCc), ...rumbleDefSpd(unit, noExact) };
  const calcText = `HP ${statUp(calc.hp).toLocaleString()} / ATK ${statUp(calc.atk).toLocaleString()} / RCV ${statUp(calc.rcv).toLocaleString()} / DEF ${statUp(calc.def)} / SPD ${statUp(calc.spd)}`;
  const shown = displayedStats(unit, member, team.maxCc);
  const exactOn = custom && !!member.exact;
  const canLb = custom || canLimitBreak(unit);
  const levelMax = custom ? Math.max(d.maxLevel, MAX_LEVEL_LLB) : d.maxLevel;
  const lbCap = custom ? unit.lb?.steps.length ?? 0 : canLimitBreak(unit) ? lbMaxNodes(unit, d.lbKey) : 0;
  const keyAllowed = keyAllowedAt(unit, d.level, custom);
  const keyMin = d.keyTier?.minLevel ?? RUMBLE_KEY_MIN_LEVEL;
  const hasMainSp = unit.kit.specials.length > 0 && unit.specialLevels > 1;
  const mainSpLv = Math.min(member.mainSpecialLevel ?? unit.specialLevels, unit.specialLevels);
  // The Rumble key checkbox shows under Limit Break and on its own between the sections (seen with them all closed)
  const rumbleKeyRow = (className = "") => (
    <label className={`check-row ${className} ${keyAllowed ? "" : "disabled"}`} title={!d.keyTier ? "The game gives this unit no Rumble key" : keyAllowed ? keyText(d.keyTier) : `Rumble key needs level ${keyMin}+. ${keyText(d.keyTier)}`}>
      <input type="checkbox" checked={d.rumbleKey} disabled={!keyAllowed} onChange={(e) => set({ rumbleKey: e.target.checked })} />
      Rumble key {!d.keyTier ? <span className="muted small">none in the game</span> : !keyAllowed && <span className="muted small">Lv {keyMin}+</span>}
    </label>
  );
  const llbParts = llbPartsActive(unit, member);
  // The website's own wording when it has the unit (scripts/import-rumble-text.ts); otherwise our port of its filters.
  const site = useSiteText(unit.id);
  const pick = <T,>(base: T | undefined, llb: T | undefined, isLlb: boolean) => (isLlb && llb !== undefined ? llb : base);
  const siteSpecial = pick(site?.s, site?.ls, llbParts.includes("special"))?.[d.specialLevel - 1];
  const siteAbility = pick(site?.a, site?.la, llbParts.includes("ability"))?.[d.abilityLevel - 1];
  const siteRes = pick(site?.r, site?.lr, llbParts.includes("resistances"));
  const siteSuper = pick(site?.ss, site?.lss, llbParts.includes("super special"));
  // Making a unit legal again must not break the team's rules (family / duplicate / cost).
  const legalProblem = custom ? placementProblem(props.db, team, props.index, legalize(unit, member, team.maxCc)) : undefined;
  const legalChanges = custom ? legalizeChanges(unit, member, team.maxCc) : [];

  // Quick level picks (only levels the current LLB allows); a Rumble key is dropped below 120.
  const pickLevel = (level: number) => setLevel(level);
  const setLevel = (level: number) => set({ level, rumbleKey: keyAllowedAt(unit, level, custom) ? member.rumbleKey : false });
  const setLlb = (llb: number) => {
    const level = custom ? d.level : Math.min(d.level, maxLevelFor(unit, llb));
    set({ llbLevel: llb, llb: undefined, level, rumbleKey: keyAllowedAt(unit, level, custom) ? member.rumbleKey : false });
  };

  const llbUpgrades = llbUpgradesText(unit);
  const kit = kitFor(unit, member);
  // The LLB slider shows in Level and LLB, and again in Rumble special & ability for units with LLB Rumble upgrades
  const llbSlider = (
    <NumberSlider
      label="LLB"
      value={d.llbLevel}
      min={0}
      max={5}
      disabled={!canLb}
      title={!canLb
        ? "Only units with max level 99 can be Level Limit Broken"
        : `Level Limit Break: max level ${d.maxLevel}${llbUpgrades ? `. Rumble: ${llbUpgrades}` : ""}${llbParts.length ? ` (active: ${llbParts.join(", ")})` : ""}`}
      onChange={setLlb}
    />
  );
  const lbSummary = !canLb || !unit.lb
    ? "none"
    // out of the nodes reachable without the Limit Break key, or all of them with it (30/30, then 30/40 when keyed)
    : `${d.lbNodes}/${lbMaxNodes(unit, d.lbKey && hasLbExpansion(unit))}${d.lbKey && hasLbExpansion(unit) ? " · keyed" : ""}`;

  return (
    <div className="unit-settings">
      <label
        className={`check-row legal-row ${legalProblem ? "disabled" : ""}`}
        title={legalProblem
          ? `Can't be legal here: ${legalProblem}. Drag it to Recent units to make it legal there.` +
            (legalChanges.length ? `${NL}${NL}What's illegal now (→ would become):${NL}${legalChanges.join(NL)}` : "")
          : custom
            ? (legalChanges.length
              ? `Tick to make it legal. What's illegal now (→ the legal value it gets):${NL}${legalChanges.join(NL)}`
              : "Tick to make it legal: nothing changes.")
            : "Legal: obtainable in the game and kept within its limits. Untick for admin / test units (no limits, cost 0)."}
      >
        <input
          type="checkbox"
          checked={!custom}
          disabled={!!legalProblem}
          onChange={(e) => onChange(e.target.checked ? legalize(unit, member, team.maxCc) : { ...member, illegal: true })}
        />
        Legal {legalProblem && <span className="warn small">⚠ {legalProblem.startsWith("same family") ? "family clash" : legalProblem.includes("cost") ? "over cost" : "duplicate"}</span>}
      </label>
      {props.actions}

      <details className="mini" open>
        <summary title="Unit level and Level Limit Break">Level and LLB <span className="muted">Lv {d.level}{canLb ? ` · LLB ${d.llbLevel}` : ""}</span></summary>
        <div className="mini-body">
          <NumberSlider label="Level" value={d.level} min={1} max={levelMax} onChange={setLevel} />
          <div className="level-picks" title="Jump to a level (up to the current LLB's max)">
            {levelPicks(unit, custom ? MAX_LEVEL_LLB : d.maxLevel).map((lv) => (
              <button key={lv} className={`pick ${d.level === lv ? "on" : ""}`} onClick={() => pickLevel(lv)}>{lv}</button>
            ))}
          </div>
          {llbSlider}
        </div>
      </details>

      <details className="mini group">
        <summary title="Main-game (non-Rumble) investment: special level, potentials, sockets, cotton candy and Limit Break">Main-game stats</summary>
        <div className="mini-body">
          <div
            className={`stat-box ${exactOn ? "exact" : ""}`}
            title={exactOn
              ? "Typed-in stats: level, Limit Break, cotton candy etc. don't change them"
              : `Rumble stats before buffs. Character screen: HP ${shown.hp.toLocaleString()} / ATK ${shown.atk.toLocaleString()} / RCV ${shown.rcv.toLocaleString()}`}
          >
            <div className="stat-box-head">
              <span>Rumble Stats</span>
              {custom && (
                <label
                  className="mini-check"
                  title={exactOn
                    ? `Untick to use the calculated stats instead: ${calcText}`
                    : "Type the stats in directly (e.g. from the game's Rumble status screen)"}
                >
                  <input
                    type="checkbox"
                    checked={exactOn}
                    onChange={(e) => {
                      if (e.target.checked) set({ exact: { hp: statUp(stats.hp), atk: statUp(stats.atk), rcv: statUp(stats.rcv), def: statUp(stats.def), spd: statUp(stats.spd) } });
                      else { const { exact: _x, ...rest } = member; void _x; onChange(rest); }
                    }}
                  />
                  edit
                </label>
              )}
            </div>
            <div className="stat-grid">
              {(["hp", "atk", "rcv", "def", "spd"] as const).map((k) => (
                <label key={k}>
                  <span>{k.toUpperCase()}</span>
                  {exactOn ? (
                    <input
                      type="number"
                      className="num-input"
                      min={0}
                      value={member.exact?.[k] ?? statUp(stats[k])}
                      onChange={(e) => set({ exact: { ...member.exact!, [k]: Math.max(0, Number(e.target.value) || 0) } })}
                    />
                  ) : (
                    <b>{statUp(stats[k]).toLocaleString()}</b>
                  )}
                </label>
              ))}
            </div>
          </div>
        <details className="mini">
          <summary title="Main-game special level (scales the potentials / sockets stat bonus), potential ability levels (each 1-5 once unlocked by the Limit Break) and socket levels (5 per slot)">
            {hasMainSp ? "Special, potentials & sockets" : "Potentials & sockets"}{" "}
            <span className="muted">{hasMainSp ? `${mainSpLv}/${unit.specialLevels} · ` : ""}{d.potentials}/{POTENTIAL_MAX_LEVEL * d.potentialLevels.length || 0} · {d.sockets}/{SOCKET_MAX_LEVEL * d.socketSlots}</span>
          </summary>
          <div className="mini-body">
            {hasMainSp && (
              <div title="The main-game special level scales the Rumble HP / ATK / RCV bonus from potentials and sockets">
                <NumberSlider label="Main-game special" value={mainSpLv} min={1} max={unit.specialLevels} onChange={(v) => set({ mainSpecialLevel: v })} />
              </div>
            )}
            {d.potentialLevels.length === 0 && <div className="muted small">No potentials.</div>}
            {(unit.lb?.potentials ?? []).map((p, i) => (
              <label
                key={i}
                className={`pot-row ${d.potentialsOpen[i] ? "" : "locked"}`}
                title={d.potentialsOpen[i]
                  ? p.name
                  : `* ${p.name}: the Limit Break isn't high enough (unlocks at Limit Break ${p.at + 1}, now ${d.lbNodes}), so it counts as 0 for stats`}
              >
                <span className="pot-name">{d.potentialsOpen[i] ? "" : <span className="lock-star">* </span>}{p.name}</span>
                <select
                  value={d.potentialChosen[i]}
                  onChange={(e) => set({ potentialLevels: d.potentialChosen.map((v, j) => (j === i ? Number(e.target.value) : v)), potentials: undefined })}
                >
                  {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>Lv {v}</option>)}
                </select>
              </label>
            ))}
            {custom && !unit.lb?.potentials.length && (
              <NumberSlider label="Potentials" value={d.potentials} min={0} max={MAX_POTENTIAL_LEVELS} onChange={(v) => set({ potentials: v, potentialLevels: undefined })} />
            )}
            <NumberSlider
              label={`${d.socketSlots < d.socketSlotsMax ? "* " : ""}Sockets (${d.socketSlots}${d.socketSlots < d.socketSlotsMax ? `/${d.socketSlotsMax}` : ""} slots)`}
              value={d.sockets}
              min={0}
              max={SOCKET_MAX_LEVEL * d.socketSlots}
              title={`Total socket levels: ${d.socketSlots} slot${d.socketSlots === 1 ? "" : "s"}, up to 5 each.` +
                (d.lockedSocketNodes.length
                  ? ` * The Limit Break isn't high enough for ${d.socketSlotsMax - d.socketSlots} more slot${d.socketSlotsMax - d.socketSlots === 1 ? "" : "s"} (unlock${d.lockedSocketNodes.length === 1 ? "s" : ""} at Limit Break ${d.lockedSocketNodes.map((s) => s.at + 1).join(", ")}, now ${d.lbNodes}), so only ${SOCKET_MAX_LEVEL * d.socketSlots} socket levels count.`
                  : "")}
              onChange={(v) => set({ sockets: v })}
            />
          </div>
        </details>

        <details className="mini">
          <summary title="Cotton candy: none, the account max, or custom amounts">Cotton candy <span className="muted">{d.ccMode === "max" ? "max" : d.ccMode === "none" ? "none" : fmtCc(d.cc)}</span></summary>
          <div className="mini-body">
            <label className="check-row">
              <input type="radio" checked={d.ccMode === "none"} onChange={() => set({ ccMode: "none" })} />
              None (0/0/0)
            </label>
            <label className="check-row">
              <input type="radio" checked={d.ccMode === "max"} onChange={() => set({ ccMode: "max" })} />
              Account max ({fmtCc(accountMaxCc(team.maxCc))})
            </label>
            <label className="check-row">
              <input type="radio" checked={d.ccMode === "custom"} onChange={() => set({ ccMode: "custom", cc: member.cc ?? d.cc })} />
              Custom
            </label>
            {d.ccMode === "custom" && (
              <CottonCandy value={d.cc} max={custom ? undefined : { hp: MAX_CC, atk: MAX_CC, rcv: MAX_CC }} onChange={(cc) => set({ ccMode: "custom", cc })} />
            )}
          </div>
        </details>

        <details className="mini">
          <summary title="Limit Break, Limit Break key (expansion) and Rumble key">
            Limit Break <span className="muted">{lbSummary}{d.rumbleKey ? " · 🔑" : ""}</span>
          </summary>
          <div className="mini-body">
            <NumberSlider
              label="Nodes"
              value={d.lbNodes}
              min={0}
              max={lbCap}
              disabled={!unit.lb || !canLb}
              title={!canLb ? "Only units with max level 99 can be Limit Broken" : unit.lb ? `Limit Break nodes unlocked (${lbCap} available)` : "This unit has no Limit Break"}
              onChange={(v) => set({ lbNodes: v, limitBreak: undefined })}
            />
            <label
              className={`check-row ${hasLbExpansion(unit) && canLb ? "" : "disabled"}`}
              title={hasLbExpansion(unit) ? "Limit Break key: unlocks the nodes after “LOCKED WITH KEY” (not the Rumble key)" : "This unit has no Limit Break expansion"}
            >
              <input
                type="checkbox"
                checked={d.lbKey && hasLbExpansion(unit)}
                disabled={!hasLbExpansion(unit) || !canLb}
                onChange={(e) => {
                  const on = e.target.checked;
                  // Turning the key on keeps the nodes where they are (30/40 until moved); off drops any past the lock.
                  const cap = lbMaxNodes(unit, on);
                  set({ lbKey: on, limitBreak: undefined, lbNodes: on ? d.lbNodes : Math.min(d.lbNodes, cap) });
                }}
              />
              Expanded (LB key)
            </label>
            {rumbleKeyRow()}
          </div>
        </details>
        </div>
      </details>

      {rumbleKeyRow("key-row")}

      <details className="mini">
        <summary title="Rumble special and ability levels and LLB Rumble upgrades">Rumble special &amp; ability</summary>
        <div className="mini-body">
          {unit.kit.specials.length > 0 && (
            <NumberSlider label="Special" value={d.specialLevel} min={1} max={unit.kit.specials.length} onChange={(v) => set({ specialLevel: v })} />
          )}
          {kit.specials.length > 0 && (
            <details className="mini kit-text">
              <summary title="The Rumble special at this level and the current LLB">
                Special text <span className="muted">lv {d.specialLevel}{llbParts.includes("special") ? " · LLB" : ""} · CT {kit.specials[d.specialLevel - 1]?.cooldown ?? "?"}s</span>
              </summary>
              <ul className="kit-lines">
                {(siteSpecial ?? effectLines(kit.specials[d.specialLevel - 1]?.effects ?? [])).map((t, i) => <li key={i}><Typed text={t} /></li>)}
              </ul>
              <SimReading effects={kit.specials[d.specialLevel - 1]?.effects ?? []} source="special" />
              {kit.superSpecial && (
                <>
                  <div className="small"><b>Super special</b>{llbParts.includes("super special") ? " (LLB)" : ""}: <Typed text={siteSuper?.condition || superConditionToString(kit.superSpecial.condition)} /></div>
                  <ul className="kit-lines">
                    {(siteSuper?.lines ?? effectLines(kit.superSpecial.effects)).map((t, i) => <li key={i}><Typed text={t} /></li>)}
                  </ul>
                  <SimReading effects={kit.superSpecial.effects} source="superSpecial" />
                </>
              )}
            </details>
          )}
          {unit.kit.abilities.length > 0 && (
            <NumberSlider label="Ability" value={d.abilityLevel} min={1} max={unit.kit.abilities.length} onChange={(v) => set({ abilityLevel: v })} />
          )}
          {kit.abilities.length > 0 && (
            <details className="mini kit-text">
              <summary title="The Rumble ability at this level and the current LLB">
                Ability text <span className="muted">lv {d.abilityLevel}{llbParts.includes("ability") ? " · LLB" : ""}</span>
              </summary>
              <ul className="kit-lines">
                {(siteAbility ?? effectLines(kit.abilities[d.abilityLevel - 1] ?? [])).map((t, i) => <li key={i}><Typed text={t} /></li>)}
              </ul>
              <SimReading effects={kit.abilities[d.abilityLevel - 1] ?? []} source="ability" />
              {kit.resilience.length > 0 && (
                <>
                  <div className="small"><b>Resistances</b>{llbParts.includes("resistances") ? " (LLB)" : ""}</div>
                  <ul className="kit-lines">{(siteRes ?? kit.resilience.map((r) => resilienceToString(r))).map((t, i) => <li key={i}><Typed text={t} /></li>)}</ul>
                </>
              )}
              <div className="small"><b>Pattern</b>: {(site?.p ?? kit.pattern.map((p) => patternToString(p))).join(" → ")}{site?.t ? ` · Targets: ${site.t}` : ""}</div>
            </details>
          )}
          {unit.kit.specials.length === 0 && unit.kit.abilities.length === 0 && <div className="muted small">None.</div>}
          {unit.llbKit && llbSlider}
        </div>
      </details>
    </div>
  );
}

const keyText = (t: KeyTier) => {
  const k = t.bonus;
  const p = (x: number) => `${Math.round(x * 100)}%`;
  // the game's key: damage taken from / dealt to one color or class pair; otherwise what the resilience names
  const vs = k.vs ? k.vs.map((a) => a.replace(/^\[(.*)\]$/, "$1")).join(" / ") : "what its resilience names";
  return `Rumble key (${t.label}): +${p(k.hp)} HP, +${p(k.atk)} ATK, +${p(k.rcv)} RCV, +${p(k.def)} DEF, +${p(k.spd)} SPD` +
    `${k.ct ? `, −${p(k.ct)} charge time` : ""}, −${p(k.taken)} damage taken from ${vs}${k.dealt ? `, +${p(k.dealt)} damage dealt to ${vs}` : ""}` +
    `; needs level ${t.minLevel}`;
};
const fmtCc = (c: Cc) => `${c.hp}/${c.atk}/${c.rcv}`;

/** Three cotton candy inputs (each up to `max`, or unlimited for illegal units). */
export function CottonCandy(props: { value: Cc; max?: Cc; onChange: (cc: Cc) => void }) {
  const total = props.value.hp + props.value.atk + props.value.rcv;
  return (
    <div className="cc-row">
      {(["hp", "atk", "rcv"] as const).map((k) => {
        const max = props.max ? props.max[k] : 99999;
        return (
          <label key={k}>
            {k.toUpperCase()}
            <input
              type="number"
              className="num-input"
              min={0}
              max={max}
              value={props.value[k]}
              onChange={(e) => props.onChange({ ...props.value, [k]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })}
            />
          </label>
        );
      })}
      <span className={`muted small ${total > MAX_CC_TOTAL ? "warn" : ""}`}>{total}/{MAX_CC_TOTAL}</span>
    </div>
  );
}
export { MAX_CC };

/** Per-unit LLB unlock levels (OPTC-DB doesn't record them; defaults 2 / 4 / 5). */
function NumberSlider(props: { label: string; value: number; min: number; max: number; disabled?: boolean; title?: string; onChange: (v: number) => void }) {
  const off = props.disabled || props.max <= props.min;
  return (
    <label className={`field-row ${off ? "disabled" : ""}`} title={props.title}>
      <span>{props.label}</span>
      <input
        type="number"
        className="num-input sm"
        min={props.min}
        max={props.max}
        value={props.value}
        disabled={off}
        onChange={(e) => props.onChange(Math.min(props.max, Math.max(props.min, Number(e.target.value) || 0)))}
      />
      <input type="range" min={props.min} max={props.max} value={props.value} disabled={off} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

/** 1,250,000 -> "1.25M", 85,000 -> "85K". */
const fmtBig = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${+(n / 1e3).toFixed(1)}K` : n.toLocaleString());

/** Line break in hover text. */
const NL = String.fromCharCode(10);

/** Opens every dropdown, or closes them all if they're all open already. */
function toggleAllDetails(list: NodeListOf<HTMLDetailsElement> | undefined) {
  const all = [...(list ?? [])];
  const openAll = all.some((d) => !d.open);
  all.forEach((d) => { d.open = openAll; });
}

/** A popup pinned below its anchor, drawn in a layer over the whole page; follows the anchor on scroll / resize. */
export function FloatingPop(props: { anchor: RefObject<HTMLElement | null>; offset: number; children: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { anchor, offset } = props;
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = 340, height = 430; // input + the results list's max height
      setPos({
        top: Math.max(8, Math.min(r.top + offset, window.innerHeight - height)),
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, offset]);
  if (!pos) return null;
  return createPortal(<div className="pick-pop floating" style={{ top: pos.top, left: pos.left }}>{props.children}</div>, document.body);
}

/**
 * What a unit is found by, like OPTC-DB's search: its name, Rumble style, character names (families) and the site's
 * aliases, so "aokiji" finds every Kuzan.
 */
const searchCache = new WeakMap<UnitRecord, string>();
function searchText(u: UnitRecord): string {
  let t = searchCache.get(u);
  if (t === undefined) {
    t = [u.name, u.style, ...u.families, ...(u.aliases ?? [])].join(" ").toLowerCase();
    searchCache.set(u, t);
  }
  return t;
}

const SEARCH_PAGE = 15;
/** Search results: newest ID first; IDs 5013 and up (OPTC-DB's special entries) last. */
const searchOrder = (a: UnitRecord, b: UnitRecord) => Number(a.id >= 5013) - Number(b.id >= 5013) || b.id - a.id;

/** Unit search settings (Settings): hide 5★ units whose 6★ form is in Rumble too. */
export const SearchOptions = createContext({ hideFiveStar: true });
/**
 * The quick build a unit gets when it's added (a team slot, the box) and what the import / generator start from
 * (site setting, "Lv 99" by default: user, 2026-11-23). Undefined: a unit is fully built.
 */
export const DefaultBuild = createContext<PresetDef | undefined>(undefined);
/** A new unit with the default build (its detail is loaded first: a build needs its Limit Break). */
export async function withDefaultBuild(db: UnitDb, unitId: number, preset: PresetDef | undefined, keep: Partial<MemberConfig> = {}): Promise<MemberConfig> {
  if (!preset) return { unitId, ...keep };
  await db.ensure([unitId]);
  const rec = db.byId.get(unitId);
  return rec ? { ...applyPreset(rec, { unitId }, preset), ...keep } : { unitId, ...keep };
}

export function UnitSearch(props: {
  db: UnitDb;
  autoFocus?: boolean;
  /** Why a unit can't be added here (family / duplicate / cost), if it can't. */
  problem?: (u: UnitRecord) => string | undefined;
  onPick: (u: UnitRecord) => void;
  onCancel?: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const { hideFiveStar } = useContext(SearchOptions);
  // more results load as the list is scrolled to the bottom
  const [limit, setLimit] = useState(SEARCH_PAGE);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const words = s.split(/\s+/);
    return props.db.all
      .filter((u) => String(u.id) === s || (words.every((w) => searchText(u).includes(w)) && !(hideFiveStar && u.sixStarForm && props.db.byId.has(u.sixStarForm))))
      .sort(searchOrder);
  }, [props.db, q, hideFiveStar]);
  const results = useMemo(() => matches.slice(0, limit).map((u) => ({ u, why: props.problem?.(u) })), [matches, limit, props]);
  const pick = (i: number) => {
    const r = results[i];
    if (r && !r.why) props.onPick(r.u);
  };

  return (
    <div className="search">
      <input
        placeholder="Search a unit by name, nickname or ID…"
        value={q}
        autoFocus={props.autoFocus}
        onChange={(e) => { setQ(e.target.value); setSel(0); setLimit(SEARCH_PAGE); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          if (e.key === "Enter") pick(sel);
          if (e.key === "Escape") props.onCancel?.();
        }}
        onBlur={() => setTimeout(() => props.onCancel?.(), 150)}
      />
      {results.length > 0 && (
        <ul
          className="results"
          role="listbox"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24 && limit < matches.length) setLimit((n) => n + SEARCH_PAGE);
          }}
        >
          {results.map(({ u, why }, i) => (
            <li key={u.id} role="option" aria-selected={i === sel} aria-disabled={!!why}>
              <button className={`${i === sel ? "sel" : ""} ${why ? "blocked" : ""}`} title={why ? `Can't add: ${why}` : undefined} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
                <UnitThumb id={u.id} size={36} colorClass={colorClass(u)} />
                <span className="res-text">
                  <span className="unit-main">{shortName(u.name)}</span>
                  <span className="unit-sub">{why ? `Can't add: ${why}` : u.name.includes(" - ") ? u.name.split(" - ").slice(1).join(" - ") : ""}</span>
                </span>
                <span className={`style-badge style-${u.style}`}>{u.style}</span>
                <span className="meta">{u.cost}c · #{u.id}</span>
              </button>
            </li>
          ))}
          {limit < matches.length && <li className="results-more muted small">Scroll for more ({matches.length - limit} left)</li>}
        </ul>
      )}
    </div>
  );
}

export const colorClass = (u: UnitRecord) => `color-${(u.color ?? "[DUAL]").slice(1, -1)}`;

/**
 * Level shortcuts: 1, 99 and each LLB cap up to `upTo` (the current LLB's max level) for units that can Limit Break;
 * otherwise just 1 and the unit's own max.
 */
function levelPicks(unit: UnitRecord, upTo: number): number[] {
  if (!canLimitBreak(unit)) return unit.maxLevel > 1 ? [1, unit.maxLevel] : [1];
  return [1, ...LLB_EXTRA_LEVELS.map((x) => unit.maxLevel + x).filter((lv) => lv <= upTo)];
}
