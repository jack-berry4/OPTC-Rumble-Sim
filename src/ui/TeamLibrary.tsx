import { useEffect, useMemo, useState } from "react";
import type { UnitDb } from "../data/unitDb";
import {
  AUTHOR_PLACEHOLDER, AUTHORS_TEXT_MAX, cleanTitle, decodeTeam, encodeTeam, splitAuthors, teamLegality, TITLE_MAX, type SavedTeam, type TeamShare,
} from "../engine/teamCode";
import type { TeamConfig } from "../engine/types";
import { UnitThumb } from "./UnitThumb";

export type Side = "atk" | "def";
export const SIDE_NAMES: Record<Side, string> = { atk: "Your team", def: "Opponent" };

/** Legal / Illegal pill; hover lists why. */
export function LegalBadge(props: { db: UnitDb; team: TeamConfig }) {
  const { legal, reasons } = teamLegality(props.db, props.team);
  return (
    <span className={`legal-badge ${legal ? "ok" : "bad"}`} title={legal ? "Fully legal: could be used in the game as is" : `Not legal: ${reasons.join("; ")}`}>
      {legal ? "✓ Legal" : "✕ Illegal"}
    </span>
  );
}

/** The 8 positions as small portraits (bench after a gap). */
export function TeamPreview(props: { team: TeamConfig; size?: number }) {
  const size = props.size ?? 26;
  return (
    <span className="team-preview">
      {Array.from({ length: 8 }, (_, i) => {
        const m = props.team.members[i];
        return (
          <span key={i} className={`tp-slot ${i === 5 ? "bench-start" : ""} ${m?.illegal ? "illegal" : ""}`} style={{ width: size, height: size }}>
            {m && <UnitThumb id={m.unitId} size={size} />}
          </span>
        );
      })}
    </span>
  );
}

/** A button that asks for a second click ("Replace 5 units?") before doing something that overwrites. */
export function ConfirmButton(props: { label: string; confirm?: string; className?: string; title?: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`${props.className ?? ""} ${armed ? "armed" : ""}`}
      title={props.title}
      onClick={() => {
        if (props.confirm && !armed) return setArmed(true);
        setArmed(false);
        props.onConfirm();
      }}
    >
      {armed ? props.confirm : props.label}
    </button>
  );
}

const filled = (t: TeamConfig) => t.members.filter(Boolean).length;
const loadConfirm = (current: TeamConfig) => (filled(current) ? `Replace ${filled(current)} unit${filled(current) === 1 ? "" : "s"}?` : undefined);
const loadTitle = (side: Side, current: TeamConfig) =>
  filled(current)
    ? `Load into ${SIDE_NAMES[side]}. This replaces its ${filled(current)} units; they move to Recent units. Click twice to confirm.`
    : `Load into ${SIDE_NAMES[side]}`;

const other = (s: Side): Side => (s === "atk" ? "def" : "atk");

/**
 * Load buttons in the Save / Load dialog: a big one for the side the dialog was opened from, and a small one out of
 * the way for the other side. Both ask for a second click when they'd replace units.
 */
function LoadButtons(props: { side: Side; teams: Record<Side, TeamConfig>; onLoad: (side: Side) => void }) {
  const { side, teams } = props;
  return (
    <span className="load-buttons">
      <ConfirmButton
        className="primary load-main"
        label={`Load → ${SIDE_NAMES[side]}`}
        confirm={loadConfirm(teams[side])}
        title={loadTitle(side, teams[side])}
        onConfirm={() => props.onLoad(side)}
      />
      <ConfirmButton
        className="small-btn load-other"
        label={`or → ${SIDE_NAMES[other(side)]}`}
        confirm={loadConfirm(teams[other(side)])}
        title={loadTitle(other(side), teams[other(side)])}
        onConfirm={() => props.onLoad(other(side))}
      />
    </span>
  );
}

/** One saved team: preview, legality, and load / copy code / delete. */
export function SavedTeamRow(props: {
  db: UnitDb;
  entry: SavedTeam;
  teams: Record<Side, TeamConfig>;
  compact?: boolean;
  /** In the dialog: the side it was opened from (gets the big Load button). */
  side?: Side;
  onLoad: (entry: TeamShare, side: Side) => void;
  onDelete: (id: string) => void;
}) {
  const { entry } = props;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(encodeTeam(entry));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is also shown in the Save dialog */
    }
  };
  return (
    <li className={`saved-row ${props.compact ? "compact" : ""}`}>
      <div className="saved-top">
        <span className="saved-title" title={entry.title || "Untitled team"}>{entry.title || <i className="muted">Untitled team</i>}</span>
        <LegalBadge db={props.db} team={entry.team} />
      </div>
      <div className="saved-meta muted small" title={`Saved ${new Date(entry.savedAt).toLocaleString()}`}>
        {entry.authors.length ? `by ${entry.authors.join(", ")}` : "no author"} · {new Date(entry.savedAt).toLocaleDateString()}
      </div>
      <TeamPreview team={entry.team} size={props.compact ? 22 : 28} />
      <div className="saved-actions">
        {props.side ? (
          <LoadButtons side={props.side} teams={props.teams} onLoad={(side) => props.onLoad(entry, side)} />
        ) : (["atk", "def"] as const).map((side) => (
          <ConfirmButton
            key={side}
            className="small-btn"
            label={side === "atk" ? "→ Your team" : "→ Opponent"}
            confirm={loadConfirm(props.teams[side])}
            title={loadTitle(side, props.teams[side])}
            onConfirm={() => props.onLoad(entry, side)}
          />
        ))}
        <button className="small-btn" title="Copy this team's code" onClick={copy}>{copied ? "Copied" : "Code"}</button>
        <ConfirmButton className="small-btn danger" label="✕" confirm="Delete?" title="Delete from history (click twice)" onConfirm={() => props.onDelete(entry.id)} />
      </div>
    </li>
  );
}

/** Searchable list of saved teams (used in the dialog and the side panel). */
export function SavedTeamsList(props: {
  db: UnitDb;
  saved: SavedTeam[];
  teams: Record<Side, TeamConfig>;
  compact?: boolean;
  side?: Side;
  onLoad: (entry: TeamShare, side: Side) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return props.saved;
    return props.saved.filter((e) =>
      `${e.title} ${e.authors.join(" ")} ${e.team.members.map((m) => (m ? props.db.byId.get(m.unitId)?.name ?? "" : "")).join(" ")}`.toLowerCase().includes(s));
  }, [props.saved, props.db, q]);
  return (
    <div className="saved-list-wrap">
      {props.saved.length > 0 && <input className="saved-search" placeholder="Search title, author or unit…" value={q} onChange={(e) => setQ(e.target.value)} />}
      {props.saved.length === 0 && <p className="muted small">No saved teams yet. Use Save on a team.</p>}
      <ul className="saved-list">
        {shown.map((e) => <SavedTeamRow key={e.id} {...props} entry={e} />)}
      </ul>
    </div>
  );
}

/** Save / Load dialog for one team: save to history or a code, load from history or a code. */
export function TeamsDialog(props: {
  db: UnitDb;
  side: Side;
  mode: "save" | "load";
  teams: Record<Side, TeamConfig>;
  saved: SavedTeam[];
  defaultAuthor: string;
  onMode: (m: "save" | "load") => void;
  onSave: (side: Side, share: TeamShare) => void;
  onLoad: (entry: TeamShare, side: Side) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { db, side, teams } = props;
  const team = teams[side];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Save or load a team">
        <div className="modal-head">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={props.mode === "save"} className={props.mode === "save" ? "on" : ""} onClick={() => props.onMode("save")}>Save</button>
            <button role="tab" aria-selected={props.mode === "load"} className={props.mode === "load" ? "on" : ""} onClick={() => props.onMode("load")}>Load</button>
          </div>
          <span className="muted small">{SIDE_NAMES[side]}</span>
          <button className="icon" title="Close (Esc)" onClick={props.onClose}>✕</button>
        </div>
        {props.mode === "save"
          ? <SavePane db={db} team={team} side={side} defaultAuthor={props.defaultAuthor} onSave={props.onSave} />
          : <LoadPane {...props} />}
      </div>
    </div>
  );
}

function SavePane(props: { db: UnitDb; team: TeamConfig; side: Side; defaultAuthor: string; onSave: (side: Side, share: TeamShare) => void }) {
  const { team } = props;
  const [title, setTitle] = useState(team.meta?.title ?? team.name ?? "");
  // A plain text field: the team's authors if it has any, else your default author. Commas separate several names.
  const [author, setAuthor] = useState(team.meta?.authors.length ? team.meta.authors.join(", ") : props.defaultAuthor);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const authors = splitAuthors(author);
  const share: TeamShare = { title: cleanTitle(title), authors, team };
  const code = encodeTeam(share);

  return (
    <div className="pane">
      <div className="pane-row">
        <TeamPreview team={team} size={34} />
        <LegalBadge db={props.db} team={team} />
      </div>
      <label className="form-row">
        <span>Title</span>
        <input value={title} maxLength={TITLE_MAX} placeholder="Optional" onChange={(e) => setTitle(e.target.value)} />
        <small className="muted">{title.length}/{TITLE_MAX}</small>
      </label>
      <label className="form-row" title="Optional. Separate several names with commas.">
        <span>Author</span>
        <input value={author} maxLength={AUTHORS_TEXT_MAX} placeholder={AUTHOR_PLACEHOLDER} onChange={(e) => setAuthor(e.target.value)} />
      </label>
      <div className="pane-row">
        <button
          className="primary"
          onClick={() => {
            props.onSave(props.side, share);
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          {saved ? "Saved ✓" : "Save to history"}
        </button>
        <span className="muted small">Stored in this browser.</span>
      </div>
      <label className="form-row code-row">
        <span>Code</span>
        <textarea readOnly value={code} rows={3} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <div className="pane-row">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: select the text instead */
            }
          }}
        >
          {copied ? "Copied ✓" : "Copy code"}
        </button>
        <span className="muted small">Includes title and authors.</span>
      </div>
    </div>
  );
}

function LoadPane(props: {
  db: UnitDb;
  side: Side;
  teams: Record<Side, TeamConfig>;
  saved: SavedTeam[];
  onLoad: (entry: TeamShare, side: Side) => void;
  onDelete: (id: string) => void;
}) {
  const [code, setCode] = useState("");
  const result = useMemo((): { share?: TeamShare; error?: string } => {
    if (!code.trim()) return {};
    try {
      return { share: decodeTeam(code, props.db) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [code, props.db]);
  const parsed = result.share;
  const error = result.error;

  return (
    <div className="pane">
      <p className="warn small">Loading replaces the chosen team. Its current units move to Recent units.</p>
      <label className="form-row code-row">
        <span>Code</span>
        <textarea value={code} rows={3} placeholder="Paste a team code (RS1.…)" onChange={(e) => setCode(e.target.value)} />
      </label>
      {error && <p className="error small">{error}</p>}
      {parsed && (
        <div className="pane-row parsed">
          <span className="saved-title">{parsed.title || "Untitled team"}</span>
          <span className="muted small">{parsed.authors.length ? `by ${parsed.authors.join(", ")}` : ""}</span>
          <TeamPreview team={parsed.team} size={28} />
          <LegalBadge db={props.db} team={parsed.team} />
          <LoadButtons side={props.side} teams={props.teams} onLoad={(side) => { props.onLoad(parsed, side); setCode(""); }} />
        </div>
      )}
      <h4>History</h4>
      <SavedTeamsList db={props.db} saved={props.saved} teams={props.teams} side={props.side} onLoad={props.onLoad} onDelete={props.onDelete} />
    </div>
  );
}

