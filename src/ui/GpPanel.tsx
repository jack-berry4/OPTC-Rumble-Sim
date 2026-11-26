/**
 * Grand Party UI (docs/PLAN_MODES.md section 1): each team's leader (the 9th unit), each side's burst state and launch
 * plan, the season's boosted-leader rules, and the burst gauge graph of a battle (click it to launch at that time).
 */
import { useEffect, useRef, useState } from "react";
import type { UnitRecord } from "../data/schema";
import type { UnitDb } from "../data/unitDb";
import { effectLines } from "../data/rumbleText";
import { burstConditionText, burstNeed, burstStep, burstUses, gpAbility, gpBurst, gpCondition, leaderBoosted, type GpBoost, type GpLaunch, type GpLeaderMatch, type GpOptions, type GpSideOptions } from "../engine/gp";
import { shortName } from "../engine/team";
import type { GpLeaderConfig, MemberConfig, Side, TeamConfig } from "../engine/types";
import type { SimResult } from "../sim/types";
import { RulesEditor } from "./RulesEditor";
import { colorClass, FloatingPop, UnitSearch } from "./TeamEditor";
import { UnitThumb } from "./UnitThumb";
import { Typed } from "./Typed";

const SIDE_LABEL: Record<Side, string> = { atk: "Your team", def: "Opponent" };
const LEVELS = [1, 2, 3, 4, 5];

/** The leader slot shown with a team in Grand Party mode. */
export function LeaderSlot(props: { db: UnitDb; team: TeamConfig; side: Side; boost?: GpBoost; onChange: (l: GpLeaderConfig | undefined) => void }) {
  const { db, team } = props;
  const l = team.leader;
  const rec = l ? db.byId.get(l.member.unitId) : undefined;
  const [picking, setPicking] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const loaded = rec && db.hasDetail(rec.id);
  const hasGp = loaded && !!rec.kit.gpSpecials?.length;
  const boosted = loaded ? leaderBoosted(rec, props.boost) : false;
  const c = loaded ? gpCondition(rec) : undefined;
  const need = burstNeed(c, boosted, props.boost);
  const pick = (m: MemberConfig) => props.onChange({ member: { ...m }, abilityLevel: l?.abilityLevel, burstLevel: l?.burstLevel });
  const members = team.members.filter((m): m is MemberConfig => !!m);

  return (
    <div ref={anchor} className={`leader-slot ${boosted ? "boosted" : ""}`}>
      <div className="leader-head">
        <span className="leader-label" title="Grand Party leader: its GP ability applies to the whole team, and its burst can be launched. It can be on the team or not.">Leader</span>
        {rec ? (
          <button className="unit-icon" style={{ width: 56, height: 56 }} title={`#${rec.id} ${rec.name} (click to change)`} onClick={() => setPicking(true)}>
            <UnitThumb id={rec.id} size={56} colorClass={colorClass(rec)} />
          </button>
        ) : (
          <button className="slot-empty leader-empty" title="Pick the leader" onClick={() => setPicking(true)}><span>+</span><small>Leader</small></button>
        )}
        <div className="leader-info">
          {rec && <div className="unit-title" title={rec.name}>{shortName(rec.name)}{boosted && <span className="boost-badge" title="Boosted leader this season: burst requirement −40%, +1 use, and the season's stat boosts">BOOSTED</span>}</div>}
          {rec && !loaded && <div className="muted small">loading…</div>}
          {loaded && !hasGp && <div className="error small">This unit has no Grand Party data.</div>}
          {hasGp && (
            <div className="leader-levels">
              <label title="GP ability level">Ability <select value={l!.abilityLevel ?? 5} onChange={(e) => props.onChange({ ...l!, abilityLevel: Number(e.target.value) })}>{LEVELS.map((v) => <option key={v} value={v}>{v === 5 ? "5 (max)" : v}</option>)}</select></label>
              <label title="GP burst level">Burst <select value={l!.burstLevel ?? 5} onChange={(e) => props.onChange({ ...l!, burstLevel: Number(e.target.value) })}>{LEVELS.map((v) => <option key={v} value={v}>{v === 5 ? "5 (max)" : v}</option>)}</select></label>
            </div>
          )}
          {hasGp && <div className="muted small" title="The burst gauge's condition (after the boost, if boosted)"><Typed text={burstConditionText(c, need)} /> · {burstUses(rec, l!, boosted, props.boost)} use{burstUses(rec, l!, boosted, props.boost) === 1 ? "" : "s"}</div>}
        </div>
        {l && <button className="slot-x" title="No leader" onClick={() => props.onChange(undefined)}>×</button>}
      </div>
      {members.length > 0 && (
        <div className="leader-quick" title="Use one of the team's units as the leader (same build)">
          <span className="muted small">From the team:</span>
          {members.map((m, i) => {
            const r = db.byId.get(m.unitId);
            return r ? (
              <button key={i} className={`mini-thumb ${l?.member.unitId === m.unitId ? "on" : ""}`} title={`${r.name}`} onClick={() => pick(m)}>
                <UnitThumb id={r.id} size={26} colorClass={colorClass(r)} />
              </button>
            ) : null;
          })}
        </div>
      )}
      {hasGp && (
        <details className="mini">
          <summary>GP ability and burst</summary>
          <div className="small"><b>Ability (lv {l!.abilityLevel ?? 5}):</b><ul className="kit-lines">{effectLines(gpAbility(rec, l!)).map((x, i) => <li key={i}><Typed text={x} /></li>)}</ul></div>
          <div className="small"><b>Burst (lv {l!.burstLevel ?? 5}):</b><ul className="kit-lines">{effectLines(gpBurst(rec, l!)?.effects).map((x, i) => <li key={i}><Typed text={x} /></li>)}</ul></div>
        </details>
      )}
      {picking && (
        <FloatingPop anchor={anchor} offset={64}>
          <UnitSearch db={db} autoFocus onCancel={() => setPicking(false)} onPick={(u: UnitRecord) => { setPicking(false); const same = members.find((m) => m.unitId === u.id); pick(same ?? { unitId: u.id }); }} />
        </FloatingPop>
      )}
    </div>
  );
}

/** Each side's burst state (carried over from earlier battles) and launch plan, plus the season boost. */
export function GpSettings(props: { db: UnitDb; teams: Record<Side, TeamConfig>; gp: GpOptions; onChange: (g: GpOptions) => void }) {
  const { db, gp } = props;
  const setSide = (s: Side, patch: Partial<GpSideOptions>) => props.onChange({ ...gp, [s]: { ...gp[s], ...patch } });
  return (
    <div className="gp-settings">
      {(["atk", "def"] as const).map((s) => {
        const l = props.teams[s].leader;
        const rec = l ? db.byId.get(l.member.unitId) : undefined;
        const ok = rec && db.hasDetail(rec.id) && rec.kit.gpSpecials?.length;
        const so = gp[s] ?? {};
        if (!ok) return <div key={s} className="gp-side"><b>{SIDE_LABEL[s]}</b> <span className="muted small">— no leader with a GP burst</span></div>;
        const boosted = leaderBoosted(rec, gp.boost);
        const c = gpCondition(rec);
        const need = burstNeed(c, boosted, gp.boost);
        const uses = burstUses(rec, l!, boosted, gp.boost);
        const step = burstStep(c);
        const launch = so.launch ?? { mode: "ready" };
        return (
          <div key={s} className={`gp-side gp-${s}`}>
            <div><b>{SIDE_LABEL[s]}</b>: {shortName(rec.name)} <span className="muted small">— {burstConditionText(c, need)}</span></div>
            <label className="ed-row" title="Burst gauge already filled in earlier battles (in the condition's own units)">
              <span>Start charge</span>
              <input type="range" min={0} max={need} step={step || Math.max(1, need / 100)} value={Math.min(need, so.startCharge ?? 0)} onChange={(e) => setSide(s, { startCharge: Number(e.target.value) })} />
              <input type="number" className="num-input sm" min={0} max={need} step={step || 1} value={so.startCharge ?? 0} onChange={(e) => setSide(s, { startCharge: Math.max(0, Math.min(need, step ? Math.round(Number(e.target.value) || 0) : Number(e.target.value) || 0)) })} />
              <span className="muted small">/ {need.toLocaleString()}</span>
            </label>
            <label className="ed-row" title="Burst uses left at the start of this battle">
              <span>Uses left</span>
              <select value={Math.min(uses, so.usesLeft ?? uses)} onChange={(e) => setSide(s, { usesLeft: Number(e.target.value) })}>
                {Array.from({ length: uses + 1 }, (_, i) => <option key={i} value={i}>{i}{i === uses ? " (all)" : ""}</option>)}
              </select>
            </label>
            <LaunchPlan launch={launch} onChange={(x) => setSide(s, { launch: x })} />
          </div>
        );
      })}
      <BoostEditor db={db} boost={gp.boost} onChange={(boost) => props.onChange({ ...gp, boost })} />
    </div>
  );
}

const fmtTimes = (t: number[]) => t.map((x) => String(+x.toFixed(1))).join(", ");
export const parseTimes = (s: string) => s.split(/[\s,;]+/).map(Number).filter((x) => Number.isFinite(x) && x >= 0 && x <= 100).sort((a, b) => a - b);

function LaunchPlan(props: { launch: GpLaunch; onChange: (l: GpLaunch) => void }) {
  const { launch } = props;
  const [text, setText] = useState(launch.mode === "times" ? fmtTimes(launch.times) : "");
  // launch times changed elsewhere (a click on the burst graph): show them
  const cur = launch.mode === "times" ? fmtTimes(launch.times) : "";
  useEffect(() => { if (fmtTimes(parseTimes(text)) !== cur) setText(cur); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ed-row" title="When the burst is launched: as soon as the gauge is full, at set battle times (full or not), or never">
      <span>Launch</span>
      <select value={launch.mode} onChange={(e) => { const m = e.target.value as GpLaunch["mode"]; props.onChange(m === "times" ? { mode: "times", times: parseTimes(text) } : { mode: m } as GpLaunch); }}>
        <option value="ready">when ready</option>
        <option value="times">at set times</option>
        <option value="never">never</option>
      </select>
      {launch.mode === "times" && (
        <input
          className="name-input"
          value={text}
          placeholder="e.g. 12, 55 (seconds)"
          title="Battle times in seconds, separated by commas (one launch each, while uses last)"
          onChange={(e) => { setText(e.target.value); props.onChange({ mode: "times", times: parseTimes(e.target.value) }); }}
          onBlur={() => setText(fmtTimes(parseTimes(text)))}
        />
      )}
    </div>
  );
}

const MATCH_BY: GpLeaderMatch["by"][] = ["class", "color", "style", "tag", "name"];
/** The season boost: which leaders, what it gives. */
function BoostEditor(props: { db: UnitDb; boost: GpBoost | undefined; onChange: (b: GpBoost) => void }) {
  const b = props.boost ?? { enabled: false, leaders: [], reqCutPct: 40, extraUses: 1, rules: [] };
  const set = (patch: Partial<GpBoost>) => props.onChange({ ...b, ...patch });
  return (
    <details className="mini gp-boost">
      <summary title="The Grand Party season's boosted leaders">
        Season boost: {b.enabled ? (b.leaders.length ? `leaders that are ${b.leaders.map((m) => m.value || "?").join(" or ")}` : "no leaders listed") : "off"}
      </summary>
      <label className="check-row"><input type="checkbox" checked={b.enabled} onChange={(e) => set({ enabled: e.target.checked })} />Boosted leaders this season</label>
      <div className="ed-chips">
        {b.leaders.map((m, i) => (
          <span key={i} className="tag-item">
            <select value={m.by} onChange={(e) => set({ leaders: b.leaders.map((x, j) => (j === i ? { ...x, by: e.target.value as GpLeaderMatch["by"] } : x)) })}>
              {MATCH_BY.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input className="name-input" value={m.value} list={m.by === "tag" ? "rule-tags" : undefined} placeholder={m.by === "class" ? "Driven" : m.by === "color" ? "STR" : m.by === "style" ? "ATK" : m.by === "tag" ? "Straw Hat Pirates" : "Luffy"} onChange={(e) => set({ leaders: b.leaders.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
            <button className="icon remove" title="Remove" onClick={() => set({ leaders: b.leaders.filter((_, j) => j !== i) })}>×</button>
          </span>
        ))}
        <button className="link small" onClick={() => set({ leaders: [...b.leaders, { by: "class", value: "" }] })}>+ leader kind</button>
      </div>
      <div className="ed-grid">
        <label className="ed-row" title="How much less the burst gauge needs (rounded up)"><span>Requirement −%</span><input type="number" className="num-input sm" value={b.reqCutPct} onChange={(e) => set({ reqCutPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></label>
        <label className="ed-row"><span>Extra uses</span><input type="number" className="num-input sm" min={0} value={b.extraUses} onChange={(e) => set({ extraUses: Math.max(0, Number(e.target.value) || 0) })} /></label>
      </div>
      <div className="muted small">Stat boosts for a boosted leader's team (the Side column is ignored: they go to that team):</div>
      <RulesEditor db={props.db} rules={b.rules} onChange={(rules) => set({ rules })} />
    </details>
  );
}

const W = 600, H = 120, PAD = 22;
/**
 * The burst gauges over a battle: each side's progress toward its next burst (0 = empty, top = full), when it was
 * ready, and when it was launched. Click a side's lane to add a launch at that time (switches it to set times).
 */
export function BurstGraph(props: { result: SimResult; gp: GpOptions; onAddLaunch?: (side: Side, t: number) => void }) {
  const g = props.result.gp;
  if (!g || (!g.atk && !g.def)) return null;
  const x = (t: number) => PAD + (t / 100) * (W - PAD * 2);
  const lane = (s: Side) => (s === "atk" ? 0 : 1);
  const laneH = (H - 10) / 2;
  const y = (s: Side, p: number) => 5 + lane(s) * laneH + (1 - p) * (laneH - 8) + 4;
  const click = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!props.onAddLaunch) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    const t = Math.max(0, Math.min(100, ((px - PAD) / (W - PAD * 2)) * 100));
    const s: Side = py < 5 + laneH ? "atk" : "def";
    if (g[s]) props.onAddLaunch(s, Math.round(t * 10) / 10);
  };
  return (
    <div className="burst-graph">
      <div className="muted small">Burst gauges (top: your team, bottom: opponent). ◆ ready, ▲ launched{props.onAddLaunch ? "; click a lane to launch at that time" : ""}.</div>
      <svg viewBox={`0 0 ${W} ${H}`} onClick={click} role="img" aria-label="Burst gauges over the battle">
        {[0, 25, 50, 75, 100].map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={4} y2={H - 4} className="bg-grid" /><text x={x(t)} y={H - 1} className="bg-axis">{t}s</text></g>)}
        {(["atk", "def"] as const).map((s) => {
          const d = g[s];
          if (!d) return <text key={s} x={PAD} y={y(s, 0.5)} className="bg-axis">no leader</text>;
          const pts = d.trace.map(([t, p]) => [t, d.need ? Math.min(1, p / d.need) : 0] as const);
          let path = "";
          pts.forEach(([t, p], i) => {
            path += i === 0 ? `M${x(t)},${y(s, p)}` : `H${x(t)}V${y(s, p)}`;
          });
          path += `H${x(Math.min(100, props.result.time))}`;
          return (
            <g key={s} className={`bg-${s}`}>
              <line x1={x(0)} x2={x(100)} y1={y(s, 1)} y2={y(s, 1)} className="bg-full" />
              <path d={path} className="bg-line" />
              {d.readyAt.map((t, i) => <path key={`r${i}`} d={`M${x(t)},${y(s, 1) - 4}l4,4l-4,4l-4,-4z`} className="bg-ready"><title>Ready at {t.toFixed(1)} s</title></path>)}
              {d.launches.map((l, i) => <path key={`l${i}`} d={`M${x(l.t)},${y(s, 0) - 9}l5,9h-10z`} className={`bg-launch ${l.full ? "" : "early"}`}><title>Launched at {l.t.toFixed(1)} s{l.full ? "" : " (gauge not full)"}</title></path>)}
              <text x={W - PAD + 2} y={y(s, 1) + 3} className="bg-axis">{d.need.toLocaleString()}</text>
            </g>
          );
        })}
      </svg>
      <div className="gp-summary small">
        {(["atk", "def"] as const).map((s) => {
          const d = g[s];
          return d ? (
            <span key={s} className={`gp-sum-${s}`}>
              {SIDE_LABEL[s]}: {d.name}{d.boosted ? " (boosted)" : ""} — ready {d.readyAt.length ? d.readyAt.map((t) => `${t.toFixed(1)}s`).join(", ") : "never"}; launched {d.launches.length ? d.launches.map((l) => `${l.t.toFixed(1)}s${l.full ? "" : "*"}`).join(", ") : "never"}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}
