/**
 * Pirate Rumble rule sets (user, 2026-11-22): the game's rules in effect today by default (from the game data, updated
 * by Sync Data.bat), any Rumble stage's rules, and your own saved sets.
 */
import { useEffect, useState } from "react";
import { loadRumbleRules, stageAt, stageLabel, stageRules, type RumbleRulesFile } from "../engine/gameRules";
import type { GlobalRule } from "../engine/rules";
import { Typed } from "./Typed";

export interface RuleSet { name: string; rules: GlobalRule[]; savedAt: number }
const SETS_KEY = "rumble-sim-rule-sets-v1";
const loadSets = (): RuleSet[] => { try { return JSON.parse(localStorage.getItem(SETS_KEY) ?? "[]") as RuleSet[]; } catch { return []; } };

export function RuleSets(props: {
  rules: GlobalRule[];
  /** The rules follow the game's current stage (changed on every visit). */
  follow: boolean;
  onFollow: (on: boolean) => void;
  onRules: (rules: GlobalRule[], what: string) => void;
}) {
  const [file, setFile] = useState<RumbleRulesFile>();
  const [err, setErr] = useState<string>();
  const [stageId, setStageId] = useState<number>();
  const [sets, setSetsRaw] = useState<RuleSet[]>(loadSets);
  const [pick, setPick] = useState(0);
  const [name, setName] = useState("");
  const setSets = (s: RuleSet[]) => { setSetsRaw(s); try { localStorage.setItem(SETS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
  useEffect(() => { loadRumbleRules().then(setFile, (e) => setErr(String(e))); }, []);
  const today = file ? stageAt(file) : undefined;
  const stages = file ? [...file.stages].sort((a, b) => b.start - a.start || b.id - a.id) : [];
  const chosen = stages.find((s) => s.id === stageId) ?? today;

  return (
    <div className="rule-sets">
      {err && <p className="error small">Couldn't load the game's rules: {err}</p>}
      {today && (
        <div className="ed-row">
          <label className="check-row" title="Each visit, use the rules of the Rumble stage running today (the game data; Sync Data.bat updates it)">
            <input type="checkbox" checked={props.follow} onChange={(e) => { props.onFollow(e.target.checked); if (e.target.checked && file) props.onRules(stageRules(file, today).rules, `today's rules: ${stageLabel(today)}`); }} />
            Use today's game rules
          </label>
          <span className="muted small">{stageLabel(today)}</span>
        </div>
      )}
      {file && (
        <div className="ed-row">
          <span>Game rules</span>
          <select value={chosen?.id ?? ""} onChange={(e) => setStageId(Number(e.target.value))}>
            {stages.map((s) => <option key={s.id} value={s.id}>{stageLabel(s)}{s.id === today?.id ? " · today" : ""}</option>)}
          </select>
          <button disabled={!chosen} onClick={() => { if (chosen) { props.onFollow(chosen.id === today?.id && props.follow); props.onRules(stageRules(file, chosen).rules, stageLabel(chosen)); } }}>Load</button>
        </div>
      )}
      {chosen && <div className="muted small rule-text"><Typed text={chosen.text} /></div>}
      <div className="ed-row">
        <span>My rule sets</span>
        {sets.length > 0 && (
          <>
            <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>{sets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select>
            <button onClick={() => { const s = sets[pick]; if (s) { props.onFollow(false); props.onRules(s.rules, `your set “${s.name}”`); } }}>Load</button>
            <button className="link danger" onClick={() => { setSets(sets.filter((_, i) => i !== pick)); setPick(0); }}>Delete</button>
          </>
        )}
        <input className="name-input" value={name} placeholder="name for the current rules" maxLength={40} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()} onClick={() => { setSets([{ name: name.trim(), rules: props.rules, savedAt: Date.now() }, ...sets.filter((s) => s.name !== name.trim())]); setName(""); setPick(0); }}>Save current</button>
      </div>
    </div>
  );
}
