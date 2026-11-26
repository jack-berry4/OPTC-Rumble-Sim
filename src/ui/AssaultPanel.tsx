/**
 * Assault Rumble UI (docs/PLAN_MODES.md section 2): the score settings (extra damage at 0 HP, the modifiers), one
 * battle's score, and a run's score statistics.
 */
import { useEffect, useState } from "react";
import { assaultMultiplier, assaultScore, type AssaultModifier, type AssaultSettings } from "../engine/assault";
import { BOSS_TEAM_MAX, newBossId, type BossDef } from "../engine/boss";
import { assaultLevelMult, bossStats, gameBossTeam, loadAssaultSeasons, seasonRules, specialEffects, type AssaultSeasons } from "../engine/gameKit";
import type { GlobalRule } from "../engine/rules";
import { UnitThumb } from "./UnitThumb";
import type { ScoreStats } from "../sim/simulate";
import type { SimResult } from "../sim/types";
import { Typed } from "./Typed";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function AssaultSettingsEditor(props: { settings: AssaultSettings; onChange: (s: AssaultSettings) => void }) {
  const s = props.settings;
  const setMod = (i: number, patch: Partial<AssaultModifier>) => props.onChange({ ...s, modifiers: s.modifiers.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <div className="assault-settings">
      <label className="check-row" title="At the max Assault Lv (10) a boss at 0 HP stays in the battle, keeps acting and takes more damage; at lower levels bosses go down like any unit">
        <input type="checkbox" checked={s.immortal} onChange={(e) => props.onChange({ ...s, immortal: e.target.checked })} />
        Max Assault Lv: bosses stay at 0 HP
      </label>
      <label className={`ed-row ${s.immortal ? "" : "disabled"}`} title="Max assault level: a boss at 0 HP stays in the battle and takes this much more damage">
        <span>Boss at 0 HP takes</span>
        <input type="number" className="num-input sm" min={0} step={5} value={s.zeroTakenPct} onChange={(e) => props.onChange({ ...s, zeroTakenPct: Math.max(0, Number(e.target.value) || 0) })} />
        <span className="muted small">% more damage (×{(1 + s.zeroTakenPct / 100).toFixed(2)})</span>
      </label>
      <table className="preset-table">
        <thead><tr><th /><th>Score modifier</th><th>×</th><th>Applies</th><th /></tr></thead>
        <tbody>
          {s.modifiers.map((m, i) => (
            <tr key={m.id} className={m.enabled ? "" : "off"}>
              <td><input type="checkbox" checked={m.enabled} onChange={(e) => setMod(i, { enabled: e.target.checked })} /></td>
              <td><input className="name-input" value={m.label} onChange={(e) => setMod(i, { label: e.target.value })} /></td>
              <td><input type="number" className="num-input sm" step={0.1} min={0} value={m.mult} onChange={(e) => setMod(i, { mult: Math.max(0, Number(e.target.value) || 0) })} /></td>
              <td>
                <select value={m.when} onChange={(e) => setMod(i, { when: e.target.value as AssaultModifier["when"] })}>
                  <option value="always">always</option>
                  <option value="defeat">if every boss is defeated</option>
                </select>
              </td>
              <td><button className="icon remove" title="Remove" onClick={() => props.onChange({ ...s, modifiers: s.modifiers.filter((_, j) => j !== i) })}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="link small" onClick={() => props.onChange({ ...s, modifiers: [...s.modifiers, { id: Date.now().toString(36), label: "Modifier", mult: 1.2, enabled: true, when: "always" }] })}>+ modifier</button>
      <p className="muted small">Score = (damage dealt to the bosses + HP left on your team, bench at full) × the modifiers that apply.</p>
    </div>
  );
}

/** One battle's score, part by part. */
export function BattleScore(props: { result: SimResult; settings: AssaultSettings }) {
  const a = props.result.assault;
  if (!a) return null;
  const m = assaultMultiplier(a, props.settings);
  const bosses = props.result.units.filter((u) => u.side === "def");
  return (
    <div className="battle-score">
      <div className="score-total" title="(damage + life) × modifiers">Score {fmt(assaultScore(a, props.settings))}</div>
      <div className="small">
        Damage {fmt(a.damage)} + life {fmt(a.life)} = {fmt(a.damage + a.life)} × {m.toFixed(2)}
        {" · "}{a.defeated ? "every boss defeated" : `${bosses.filter((b) => b.zeroAt !== undefined || !b.alive).length} of ${bosses.length} bosses defeated`}
      </div>
      <div className="muted small">
        {bosses.map((b) => `${b.name}: ${b.zeroAt !== undefined ? `0 HP at ${b.zeroAt.toFixed(1)}s` : !b.alive ? "KO'd" : `${fmt(b.hp)} HP left`}, took ${fmt(b.damageTaken)}`).join(" · ")}
      </div>
    </div>
  );
}

/** A run's scores: average with its 95% range, spread, best / worst seeds, a histogram. */
export function ScoreSummary(props: { score: ScoreStats; onPick: (seed: number) => void }) {
  const s = props.score;
  const mean = s.sum / s.n;
  const sd = Math.sqrt(Math.max(0, s.sumSq / s.n - mean * mean));
  const margin = (1.96 * sd) / Math.sqrt(s.n);
  // 30 bins from the lowest to the highest score
  const BINS = 30;
  const width = (s.max - s.min) / BINS || 1;
  const bins = new Array<number>(BINS).fill(0);
  for (const v of s.sample) bins[Math.min(BINS - 1, Math.floor((v - s.min) / width))]!++;
  const top = Math.max(1, ...bins);
  return (
    <div className="score-summary">
      <div className="stats">
        <div className="stat"><div className="stat-label">Average score</div><div className="stat-value">{fmt(mean)}</div><div className="stat-sub">± {fmt(margin)} (95%), spread {fmt(sd)}</div></div>
        <div className="stat"><div className="stat-label">Best / worst</div><div className="stat-value">{fmt(s.max)}</div><div className="stat-sub">worst {fmt(s.min)}</div></div>
        <div className="stat"><div className="stat-label">Boss team defeated</div><div className="stat-value">{((s.defeated / s.n) * 100).toFixed(1)}%</div></div>
        <div className="stat"><div className="stat-label">Avg damage / life</div><div className="stat-value">{fmt(s.damageSum / s.n)}</div><div className="stat-sub">life {fmt(s.lifeSum / s.n)}</div></div>
      </div>
      {s.n > 1 && s.max > s.min && (
        <>
          <div className="score-hist" title="How often each score came up">
            {bins.map((c, k) => (
              <div key={k} className="hist-bar" style={{ height: `${(c / top) * 100}%` }} title={`${fmt(s.min + k * width)}–${fmt(s.min + (k + 1) * width)}: ${c} battle${c === 1 ? "" : "s"}`} />
            ))}
          </div>
          <div className="winbar-axis muted"><span>{fmt(s.min)}</span><span>score</span><span>{fmt(s.max)}</span></div>
        </>
      )}
      <div className="seed-lists">
        <SeedChips label="Best seeds" list={s.best} onPick={props.onPick} />
        <SeedChips label="Worst seeds" list={s.worst} onPick={props.onPick} />
      </div>
    </div>
  );
}

function SeedChips(props: { label: string; list: { seed: number; score: number }[]; onPick: (s: number) => void }) {
  return (
    <div className="stat seed-box">
      <div className="stat-label seed-head"><span>{props.label}</span></div>
      <div className="seed-scroll">
        {props.list.map((x) => <button key={x.seed} className="seed-chip" title={`Score ${fmt(x.score)}: run this battle`} onClick={() => props.onPick(x.seed)}>{x.seed}</button>)}
      </div>
    </div>
  );
}

/**
 * Load an Assault Rumble boss team straight from the game's data (public/game/assault-seasons.json): a season, one of
 * its boss teams and an Assault Lv. Loading sets the boss team (stats, kits, resistances, attack patterns from the
 * game), that team's season rules, and the Assault Lv and owned-trusty score modifiers.
 */
export function GameBossLoader(props: {
  /** Unit ids in My box (a trusty character there counts as owned). */
  owned: Set<number>;
  onLoad: (x: { bosses: BossDef[]; rules: GlobalRule[]; level: number; title: string; trustyCoef: number }) => void;
}) {
  const [data, setData] = useState<AssaultSeasons>();
  const [err, setErr] = useState<string>();
  const [seasonId, setSeasonId] = useState<number>();
  const [teamIdx, setTeamIdx] = useState(0);
  const [level, setLevel] = useState(10); // the max level by default (user, 2026-11-22)
  const [mine, setMine] = useState<Set<number>>();
  useEffect(() => { loadAssaultSeasons().then(setData, (e) => setErr(String(e))); }, []);
  if (err) return <p className="error small">Couldn't load the game's Assault Rumble data: {err}</p>;
  if (!data) return <p className="muted small">Loading the game's Assault Rumble seasons…</p>;
  const now = Date.now() / 1000;
  const seasons = [...data.seasons].sort((a, b) => b.id - a.id);
  const season = seasons.find((s) => s.id === seasonId) ?? seasons.find((s) => s.start <= now && now <= s.end) ?? seasons[0]!;
  const team = season.teams[Math.min(teamIdx, season.teams.length - 1)]!;
  const lv = team.levels.find((l) => l.level === level) ?? team.levels[0]!;
  const deck = data.decks[String(lv.deck)];
  const ownedNow = mine ?? new Set(season.trusty.filter((t) => t.unitId != null && props.owned.has(t.unitId)).map((t) => t.unitId!));
  const trustyCoef = Math.max(1, ...season.trusty.filter((t) => t.unitId != null && ownedNow.has(t.unitId)).map((t) => t.coef));
  const date = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const load = () => {
    const taken = new Set<number>();
    const bosses = gameBossTeam(data, season, team, level, () => { const id = newBossId(taken); taken.add(id); return id; });
    props.onLoad({
      bosses,
      rules: seasonRules(season, team).map((r) => ({ ...r, source: `assault:${season.id}:${team.boss}` })),
      level, title: `${team.name} boss team (Assault Lv ${level}, season ${season.id})`, trustyCoef,
    });
  };
  return (
    <div className="game-loader">
      <div className="ed-row">
        <span>Season</span>
        <select value={season.id} onChange={(e) => { setSeasonId(Number(e.target.value)); setTeamIdx(0); setMine(undefined); }}>
          {seasons.map((s) => <option key={s.id} value={s.id}>{`#${s.id}: ${s.teams.map((t) => t.name).join(", ")} (${date(s.start)})${s.start <= now && now <= s.end ? " · now" : ""}`}</option>)}
        </select>
      </div>
      <div className="ed-row">
        <span>Boss team</span>
        <select value={teamIdx} onChange={(e) => setTeamIdx(Number(e.target.value))}>{season.teams.map((t, i) => <option key={t.boss} value={i}>{t.name}</option>)}</select>
        <span>Assault Lv</span>
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))} title="The level you're fighting (after a win the results screen shows the next one)">
          {team.levels.map((l) => <option key={l.level} value={l.level}>{l.level}{l.level === 10 ? " (max)" : ""}</option>)}
        </select>
        <span className="muted small">score ×{assaultLevelMult(level)} · boss HP ×{lv.hp} · ATK ×{lv.atk}</span>
      </div>
      <div className="game-boss-preview">
        {deck?.units.slice(0, BOSS_TEAM_MAX).map((u, i) => {
          const st = bossStats(u, lv);
          const sp = u.special ? specialEffects(u.special.text) : { notes: [] as string[] };
          const tip = [`${u.name} - ${u.subName}`, `Special (lv ${u.special?.level ?? "-"}, ${u.special?.ct ?? "-"} s): ${u.special?.text ?? "none"}`, `Ability (lv ${u.ability?.level ?? "-"}): ${u.ability?.text ?? "none"}`, `Resistances: ${u.resist?.text ?? "none"}`].join("\n");
          return (
            <div key={i} className="game-boss" title={tip}>
              {u.baseId != null && <UnitThumb id={u.baseId} size={44} badge={u.color} />}
              <div>
                <div className="small"><b>{u.name}</b> <span className="muted"><Typed text={u.color} /> {u.classes.join("/")} · {u.style}</span></div>
                <div className="small muted">HP {fmt(st.hp)} · ATK {fmt(st.atk)} · RCV {fmt(st.rcv)} · DEF {st.def} · SPD {st.spd}</div>
                {sp.notes.length > 0 && <div className="small warn-text">{sp.notes.length} special part{sp.notes.length === 1 ? "" : "s"} to add by hand</div>}
              </div>
            </div>
          );
        })}
        {deck && deck.additionalBehaviors > 0 && <div className="muted small">Game value “additional behavior count”: {deck.additionalBehaviors} (the main boss, first in the team, gets 1 + this many places in the NEXT queue).</div>}
      </div>
      <div className="muted small">Season rules: <Typed text={season.rulesText} /></div>
      {season.trusty.length > 0 && (
        <div className="ed-row ed-chips" title="Trusty characters: owning one multiplies the score (the best one counts). Units in My box start ticked.">
          <span>Trusty owned</span>
          {season.trusty.map((t, i) => {
            const on = t.unitId != null && ownedNow.has(t.unitId);
            return (
              <button key={i} className={`ed-chip ${on ? "on" : ""}`} onClick={() => { if (t.unitId == null) return; const n = new Set(ownedNow); if (on) n.delete(t.unitId); else n.add(t.unitId); setMine(n); }}>
                {t.unitId != null && <UnitThumb id={t.unitId} size={20} />} {t.name} ×{t.coef}
              </button>
            );
          })}
          <span className="muted small">→ ×{trustyCoef}</span>
        </div>
      )}
      <div className="row-btns">
        <button className="primary" disabled={!deck?.units.length} onClick={load}>Load this boss team</button>
        <span className="muted small">Replaces the boss team and its rules (the season's rules for this team), and sets the Assault Lv and owned-trusty modifiers.</span>
      </div>
    </div>
  );
}
