import { statUp } from "../engine/stats";
import { evadeIcon, statusIcon, useStatusIcons } from "./statusIcons";
import type { Frame, StatusSnapshot, UnitSnapshot } from "../engine/types";
import { useInspectHover } from "./BuffPopup";
import { chanceText, statusName } from "./statusText";
import { UnitThumb } from "./UnitThumb";

export interface UnitInfo {
  uid: string;
  unitId: number;
  name: string;
  tag: string;
  side: "atk" | "def";
}

const bySide = (frame: Frame, info: Map<string, UnitInfo>, side: "atk" | "def") =>
  frame.units.filter((u) => info.get(u.uid)?.side === side);

/** Compact health + special-timer panel shown right under the battle field. */
export function HealthPanel(props: {
  frame: Frame; info: Map<string, UnitInfo>;
  /** hovering a row names that unit (the HP graph highlights its line) */
  onHover?: (uid: string | undefined) => void; highlight?: string;
}) {
  return (
    <div className="health-panel">
      {(["atk", "def"] as const).map((side) => (
        <div key={side} className={`hp-col side-${side}`}>
          {bySide(props.frame, props.info, side).map((u) => (
            <HealthRow key={u.uid} u={u} info={props.info.get(u.uid)!} lit={props.highlight === u.uid}
              onHover={props.onHover && ((on) => props.onHover!(on ? u.uid : undefined))} />
          ))}
        </div>
      ))}
    </div>
  );
}

function HealthRow({ u, info, lit, onHover }: { u: UnitSnapshot; info: UnitInfo; lit?: boolean; onHover?: (on: boolean) => void }) {
  const gone = u.state === "dead" || u.state === "bench" || u.state === "forced";
  const hpFrac = u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0;
  const hasSpecial = !gone && u.ctMax > 0 && Number.isFinite(u.ctMax);
  const ready = hasSpecial && u.ct >= u.ctMax - 1e-9;
  const note = u.state === "dead" ? "KO" : u.state === "bench" ? "Bench" : u.state === "forced" ? "Forced out" : undefined;
  const hover = useInspectHover();
  return (
    <div className={`hrow ${gone ? "gone" : ""} ${lit ? "lit" : ""}`} title={`${info.tag} ${info.name} — ${u.activity}`}
      onMouseEnter={onHover && (() => onHover(true))} onMouseLeave={onHover && (() => onHover(false))}>
      <span className="hrow-tag">{info.tag}</span>
      <UnitThumb id={info.unitId} size={26} />
      <span className="hrow-name">{info.name}</span>
      <div className="meter" {...(u.state === "bench" ? {} : hover({ uid: u.uid, kind: "track", metric: "hp" }))}>
        <div className={`meter-fill hp hp-${hpFrac > 0.5 ? "high" : hpFrac > 0.25 ? "mid" : "low"}`} style={{ width: `${hpFrac * 100}%` }} />
        <span className="meter-text">{note ?? `${statUp(u.hp).toLocaleString()} / ${statUp(u.maxHp).toLocaleString()}`}</span>
      </div>
      <span className={`sp-timer ${ready ? "ready" : ""} ${ready && u.superReady ? "super" : ""}`} {...(hasSpecial ? hover({ uid: u.uid, kind: "track", metric: "ct" }) : {})}>
        {!hasSpecial ? "—" : ready ? (u.superReady ? "SUPER" : "Ready") : `${Math.max(0, u.ctMax - u.ct).toFixed(1)}s`}
        {hasSpecial && <span className="sp-bar"><span style={{ width: `${Math.min(100, (u.ct / u.ctMax) * 100)}%` }} /></span>}
      </span>
    </div>
  );
}

const BUFF_COLUMNS: { key: string; label: string; title: string }[] = [
  { key: "HP", label: "HP", title: "Max HP (+250 per level)" },
  { key: "ATK", label: "ATK", title: "ATK (+75 per level)" },
  { key: "DEF", label: "DEF", title: "DEF (+25 per level)" },
  { key: "SPD", label: "SPD", title: "SPD (+5 per level)" },
  { key: "RCV", label: "RCV", title: "RCV (+50 per level)" },
  { key: "Special CT", label: "CT", title: "Special charge speed (2% per level)" },
  { key: "Critical Hit", label: "Crit", title: "Crit chance (+5% per level)" },
  { key: "Guard", label: "Guard", title: "Guard chance (+5% per level)" },
  { key: "Accuracy", label: "Acc", title: "Accuracy (each level down = +2.5% miss)" },
  { key: "Blow Away", label: "Blow", title: "Blow Away chance (+5% per level)" },
];

/** Shorter column heads for the narrow sidebar. */
const COMPACT_LABEL: Record<string, string> = { "Critical Hit": "Crt", Guard: "Grd", "Blow Away": "Blw" };

/**
 * Every unit's live stats at the current replay time: HP and ATK / DEF / SPD / RCV with every buff, debuff and
 * half-stat status applied (green: raised, red: lowered; hover for the level). Units on the bench or KO'd are greyed.
 */
export function StatsTable(props: { frame: Frame; info: Map<string, UnitInfo> }) {
  const cols = [
    { key: "atk", buff: "ATK", label: "ATK" }, { key: "def", buff: "DEF", label: "DEF" },
    { key: "spd", buff: "SPD", label: "SPD" }, { key: "rcv", buff: "RCV", label: "RCV" },
  ] as const;
  const half = (u: UnitSnapshot, stat: string) => u.statuses.some((st) => st.attr === "Half Stats" || st.attr === `Half ${stat}`);
  const hover = useInspectHover();
  return (
    <div className="table-wrap">
      <table className="buff-table stats-table">
        <thead>
          <tr>
            <th>Unit</th>
            <th className="num" title="HP now / max HP (max HP includes HP buffs)">HP</th>
            {cols.map((c) => <th key={c.key} className="num">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {props.frame.units.map((u) => {
            const info = props.info.get(u.uid)!;
            const gone = u.state === "dead" || u.state === "bench" || u.state === "forced";
            const lvHp = u.buffs.HP ?? 0;
            return (
              <tr key={u.uid} className={`row-${info.side} ${gone ? "gone" : ""}`}>
                <td className="unit-cell"><b>{info.tag}</b> {info.name}</td>
                <td className={`num lvl ${lvHp > 0 ? "up" : lvHp < 0 ? "down" : "zero"}`} {...hover({ uid: u.uid, kind: "stat", stat: "HP" })}>
                  {u.state === "dead" ? "KO" : `${statUp(u.hp).toLocaleString()} / ${statUp(u.maxHp).toLocaleString()}`}
                </td>
                {cols.map((c) => {
                  const v = u.stats?.[c.key];
                  const lv = u.buffs[c.buff] ?? 0;
                  const halved = half(u, c.buff);
                  const dir = halved || lv < 0 ? "down" : lv > 0 ? "up" : "zero";
                  return (
                    <td key={c.key} className={`num lvl ${dir}`} {...hover({ uid: u.uid, kind: "stat", stat: c.buff, halved })}>
                      {v === undefined ? "·" : statUp(v).toLocaleString()}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One status as a chip: full name (an Evade says what it evades), level, chance, seconds left; hover for the popup. */
function StatusChip({ uid, s }: { uid: string; s: StatusSnapshot }) {
  const hover = useInspectHover();
  const chance = chanceText(s);
  // an immunity: the game's shield icon where it has one, else the plain icon with ✕
  const imm = s.attr.startsWith("Immune: ") ? s.attr.slice(8) : undefined;
  const shield = imm ? evadeIcon(imm) : undefined;
  const icon = useStatusIcons() ? shield ?? statusIcon(s.attr) : undefined;
  const name = statusName(s);
  return (
    <span className={`chip-b status ${statusClass(s.attr)}`} {...hover({ uid, kind: "status", attr: s.attr })}>
      {icon ? <>{imm && !shield ? "✕" : ""}<img src={icon} alt={name} className="chip-icon" /></> : name}
      {s.level ? ` ${s.level}` : ""}
      {chance ? ` ${chance}` : ""}
      {s.remaining > 0 && s.remaining <= 900 ? ` · ${s.remaining.toFixed(0)}s` : ""}
    </span>
  );
}

/** A unit's Shield and statuses as chips (Forced Out first). */
function StatusChips({ u }: { u: UnitSnapshot }) {
  const hover = useInspectHover();
  const icons = useStatusIcons();
  return (
    <>
      {u.state === "forced" && <span className="chip-b status bad" {...hover({ uid: u.uid, kind: "forced" })}>{u.activity}</span>}
      {u.shield > 0 && <span className="chip-b shield" {...hover({ uid: u.uid, kind: "shield" })}>{icons ? <img src={statusIcon("Shield")} alt="Shield" className="chip-icon" /> : "Shield"} {statUp(u.shield).toLocaleString()}</span>}
      {u.statuses.map((s, i) => <StatusChip key={`${s.attr}-${i}`} uid={u.uid} s={s} />)}
    </>
  );
}

/**
 * Buff/debuff levels and statuses for every unit at the current replay time. Wide: one row per unit. `compact` (the
 * narrow sidebar): two lines per unit, Shield and statuses first, the stat levels under them.
 */
export function BuffTable(props: { frame: Frame; info: Map<string, UnitInfo>; compact?: boolean }) {
  const rows = props.frame.units.filter((u) => u.state !== "bench" && u.state !== "dead");
  const hover = useInspectHover();
  const levels = (u: UnitSnapshot) => BUFF_COLUMNS.map((c) => {
    const v = u.buffs[c.key] ?? 0;
    return (
      <td key={c.key} className={`num lvl ${v > 0 ? "up" : v < 0 ? "down" : "zero"}`} {...hover({ uid: u.uid, kind: "stat", stat: c.key })}>
        {v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "·"}
      </td>
    );
  });
  if (props.compact) {
    return (
      <div className="table-wrap">
        <table className="buff-table buff-table-compact">
          <thead>
            <tr>
              <th className="unit-cell" />
              {BUFF_COLUMNS.map((c) => <th key={c.key} className="num" title={c.title}>{COMPACT_LABEL[c.key] ?? c.label}</th>)}
            </tr>
          </thead>
          {rows.map((u) => {
            const info = props.info.get(u.uid)!;
            const any = u.state === "forced" || u.shield > 0 || u.statuses.length > 0;
            return (
              <tbody key={u.uid} className={`row-${info.side}`}>
                <tr className="buff-status-line">
                  <td className="unit-cell" rowSpan={2} title={`${info.tag} ${info.name}`}><b>{info.tag}</b></td>
                  <td colSpan={BUFF_COLUMNS.length}>
                    <div className="chips wrap">
                      {any ? <StatusChips u={u} /> : <span className="muted small">no status</span>}
                    </div>
                  </td>
                </tr>
                <tr className="buff-level-line">{levels(u)}</tr>
              </tbody>
            );
          })}
        </table>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="buff-table">
        <thead>
          <tr>
            <th>Unit</th>
            {BUFF_COLUMNS.map((c) => <th key={c.key} className="num" title={c.title}>{c.label}</th>)}
            <th className="num" title="Shield points left">Shield</th>
            <th>Statuses</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const info = props.info.get(u.uid)!;
            return (
              <tr key={u.uid} className={`row-${info.side}`}>
                <td className="unit-cell"><b>{info.tag}</b> {info.name}</td>
                {levels(u)}
                <td className="num" {...(u.shield > 0 ? hover({ uid: u.uid, kind: "shield" }) : {})}>{u.shield > 0 ? statUp(u.shield).toLocaleString() : "·"}</td>
                <td>
                  <div className="chips">
                    {u.state === "forced" && <span className="chip-b status bad" {...hover({ uid: u.uid, kind: "forced" })}>{u.activity}</span>}
                    {u.statuses.map((s, i) => <StatusChip key={`${s.attr}-${i}`} uid={u.uid} s={s} />)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function statusClass(attr: string) {
  if (attr.startsWith("Evade") || attr.startsWith("Counter") || attr === "Provoke" || attr === "Haste" || attr === "Regen") return "good";
  return "bad";
}
