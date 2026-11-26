/**
 * Assault Rumble boss teams: saved and shared in their own format (user, 2026-11-22), not as regular teams. A boss team
 * carries its bosses (whole definitions), the rules that go with it (the season's rules for that team) and its
 * Assault Lv, so loading one sets all three. Codes start with "RSA1.".
 */
import { useState } from "react";
import type { UnitDb } from "../data/unitDb";
import type { BossDef } from "../engine/boss";
import type { GlobalRule } from "../engine/rules";
import { AUTHOR_PLACEHOLDER, cleanAuthor, cleanTitle, splitAuthors } from "../engine/teamCode";
import { UnitThumb } from "./UnitThumb";

export interface BossTeamShare {
  title: string;
  authors: string[];
  bosses: BossDef[];
  rules: GlobalRule[];
  /** Assault Lv (10 = max: bosses stay at 0 HP). */
  level: number;
}
export interface SavedBossTeam extends BossTeamShare { id: string; savedAt: number }

const PREFIX = "RSA1.";
export function encodeBossTeam(s: BossTeamShare): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, t: cleanTitle(s.title), a: s.authors, b: s.bosses, r: s.rules, l: s.level }));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return PREFIX + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeBossTeam(code: string): BossTeamShare {
  const c = code.trim();
  if (c.startsWith("RS1.")) throw new Error("That's a regular team code (RS1.): load it into a regular team instead.");
  if (!c.startsWith(PREFIX)) throw new Error("That isn't a boss team code (it should start with RSA1.).");
  let p: { t?: unknown; a?: unknown; b?: unknown; r?: unknown; l?: unknown };
  try {
    const b64 = c.slice(PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  } catch {
    throw new Error("The code is damaged or incomplete.");
  }
  if (!Array.isArray(p.b) || !p.b.length || p.b.length > 5) throw new Error("The code has no valid boss team.");
  return {
    title: typeof p.t === "string" ? cleanTitle(p.t) : "",
    authors: Array.isArray(p.a) ? p.a.filter((x): x is string => typeof x === "string").map(cleanAuthor) : [],
    bosses: p.b as BossDef[],
    rules: Array.isArray(p.r) ? (p.r as GlobalRule[]) : [],
    level: typeof p.l === "number" ? p.l : 10,
  };
}

export function BossTeamsDialog(props: {
  db: UnitDb;
  current: BossTeamShare;
  saved: SavedBossTeam[];
  defaultAuthor: string;
  onSave: (s: BossTeamShare) => void;
  onLoad: (s: BossTeamShare) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"save" | "load">(props.current.bosses.length ? "save" : "load");
  const [title, setTitle] = useState(props.current.title);
  const [authors, setAuthors] = useState(props.current.authors.join(", ") || props.defaultAuthor);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string>();
  const share = { ...props.current, title, authors: splitAuthors(authors) };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Boss teams">
        <div className="modal-head">
          <div className="seg">
            <button className={tab === "save" ? "on" : undefined} onClick={() => setTab("save")}>Save boss team</button>
            <button className={tab === "load" ? "on" : undefined} onClick={() => setTab("load")}>Load boss team</button>
          </div>
          <button className="icon" title="Close" onClick={props.onClose}>✕</button>
        </div>
        <p className="muted small">Boss teams are saved with their rules and Assault Lv, apart from regular teams.</p>
        {tab === "save" ? (
          <div className="pane">
            <BossRow db={props.db} share={share} />
            <label className="form-row"><span>Title</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="form-row"><span>Authors</span><input value={authors} placeholder={AUTHOR_PLACEHOLDER} onChange={(e) => setAuthors(e.target.value)} /></label>
            <div className="row-btns">
              <button className="primary" disabled={!share.bosses.length} onClick={() => { props.onSave(share); setMsg(`Saved “${title || "Untitled boss team"}”.`); }}>Save to my boss teams</button>
              <button disabled={!share.bosses.length} onClick={() => { const c = encodeBossTeam(share); setCode(c); navigator.clipboard?.writeText(c).then(() => setMsg("Code copied."), () => setMsg("The code is below.")); }}>Copy code</button>
            </div>
            {code && <textarea className="json-box" rows={3} readOnly value={code} />}
          </div>
        ) : (
          <div className="pane">
            <div className="form-row code-row">
              <span>Code</span>
              <textarea rows={2} value={code} placeholder="RSA1.…" onChange={(e) => setCode(e.target.value)} />
              <button disabled={!code.trim()} onClick={() => { try { props.onLoad(decodeBossTeam(code)); } catch (e) { setMsg(String(e instanceof Error ? e.message : e)); } }}>Load</button>
            </div>
            {props.saved.length === 0 && <p className="muted small">No saved boss teams yet.</p>}
            {props.saved.map((s) => (
              <div key={s.id} className="boss-saved-row">
                <BossRow db={props.db} share={s} />
                <div className="row-btns">
                  <button className="primary" onClick={() => props.onLoad(s)}>Load</button>
                  <button className="link danger" onClick={() => props.onDelete(s.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {msg && <p className="notice small">{msg}</p>}
      </div>
    </div>
  );
}

function BossRow({ share }: { db: UnitDb; share: BossTeamShare }) {
  return (
    <div className="boss-row">
      {share.bosses.map((b) => <UnitThumb key={b.id} id={b.baseId} size={36} badge={b.color} title={b.name} />)}
      <span>
        <b>{share.title || "Untitled boss team"}</b>
        <span className="muted small"> · Assault Lv {share.level} · {share.rules.length} rule{share.rules.length === 1 ? "" : "s"}{share.authors.length ? ` · by ${share.authors.join(", ")}` : ""}</span>
      </span>
    </div>
  );
}
