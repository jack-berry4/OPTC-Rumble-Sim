import { useMemo } from "react";
import type { UnitDb } from "../data/unitDb";
import { GAME_RULES, RULE_ATTRS, describeRule, gameRule, type GameRuleId, type GlobalRule } from "../engine/rules";

const GAME_RULE_IDS = Object.keys(GAME_RULES) as GameRuleId[];

const COLORS = ["STR", "DEX", "QCK", "PSY", "INT"];
const STYLES = ["ATK", "DEF", "SPT", "DBF", "RCV", "BAL"];

/** Crew tags for one rule: a unit with any of them counts. "+" adds another, "×" removes one. */
function TagList(props: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { tags } = props;
  const put = (i: number, v: string) => props.onChange(tags.map((t, j) => (j === i ? v : t)));
  return (
    <span className="tag-list">
      {tags.map((t, i) => (
        <span key={i} className="tag-item">
          <input className="name-input" list="rule-tags" value={t} placeholder="e.g. Straw Hat Pirates" onChange={(e) => put(i, e.target.value)} />
          {tags.length > 1 && <button className="icon remove" title="Remove this tag" onClick={() => props.onChange(tags.filter((_, j) => j !== i))}>×</button>}
          {i === tags.length - 1 && <button className="icon tag-add" title="Add another crew tag (a unit with any of them counts)" onClick={() => props.onChange([...tags, ""])}>+</button>}
        </span>
      ))}
    </span>
  );
}

/** Settings table for global rules ("Special rule activated" at the start of a battle). */
export function RulesEditor(props: { db: UnitDb; rules: GlobalRule[]; onChange: (r: GlobalRule[]) => void }) {
  const { rules, onChange } = props;
  const classes = useMemo(() => [...new Set(props.db.all.flatMap((u) => u.classes as string[]))].sort(), [props.db]);
  const tags = useMemo(() => [...new Set(props.db.all.flatMap((u) => u.tags))].sort(), [props.db]);
  const set = (i: number, r: GlobalRule) => onChange(rules.map((x, j) => (j === i ? r : x)));
  const options = (by: GlobalRule["target"]["by"]) => (by === "color" ? COLORS : by === "class" ? classes : by === "style" ? STYLES : []);

  return (
    <div className="table-wrap">
      <datalist id="rule-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
      <table className="preset-table rules-table">
        <thead>
          <tr>
            <th />
            <th>Side</th>
            <th>Applies to</th>
            <th>Effect</th>
            <th title="Buff level (HP +250, ATK +75, RCV +50, DEF +25, SPD +5 per level) or % damage">Amount</th>
            <th>When</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => r.effect.kind === "game" ? (
            <tr key={i} className={r.enabled ? "" : "off"} title="From the game's battle data; the values are fixed">
              <td><input type="checkbox" checked={r.enabled} title="On / off" onChange={(e) => set(i, { ...r, enabled: e.target.checked })} /></td>
              <td>Both</td>
              <td>All units</td>
              <td className="rule-game-text">{GAME_RULES[r.effect.id]?.text ?? "Unknown game rule"}</td>
              <td className="nowrap">
                {(GAME_RULES[r.effect.id]?.buffs ?? []).map((b) => <div key={b.attr}>{b.attr} {b.level >= 0 ? "+" : "−"}{Math.abs(b.level)} lv</div>)}
                <div className="muted small">(fixed)</div>
              </td>
              <td>Last {r.lastSeconds} s</td>
              <td><button className="icon remove" title="Delete rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          ) : (
            <tr key={i} className={r.enabled ? "" : "off"} title={describeRule(r)}>
              <td><input type="checkbox" checked={r.enabled} title="On / off" onChange={(e) => set(i, { ...r, enabled: e.target.checked })} /></td>
              <td>
                <select value={r.side} onChange={(e) => set(i, { ...r, side: e.target.value as GlobalRule["side"] })}>
                  <option value="both">Both</option>
                  <option value="atk">Your team</option>
                  <option value="def">Opponent</option>
                </select>
              </td>
              <td className="rule-target">
                <select
                  value={r.target.by}
                  onChange={(e) => {
                    const by = e.target.value as GlobalRule["target"]["by"];
                    set(i, { ...r, target: { by, value: options(by)[0] ?? "" } }); // (drops extra crew tags)
                  }}
                >
                  <option value="all">All units</option>
                  <option value="color">Color</option>
                  <option value="class">Class</option>
                  <option value="style">Style</option>
                  <option value="tag">Crew tag</option>
                </select>
                {r.target.by === "tag" ? (
                  <TagList
                    tags={[r.target.value, ...(r.target.also ?? [])]}
                    onChange={(t) => set(i, { ...r, target: { by: "tag", value: t[0] ?? "", ...(t.length > 1 ? { also: t.slice(1) } : {}) } })}
                  />
                ) : r.target.by !== "all" && (
                  <select value={r.target.value} onChange={(e) => set(i, { ...r, target: { ...r.target, value: e.target.value } })}>
                    {options(r.target.by).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )}
              </td>
              <td>
                <select
                  value={r.effect.kind === "buff" ? r.effect.attr : `__${r.effect.kind}`}
                  title={r.effect.kind === "both" ? "Deal this % more damage and take this % less (negative: deal less, take more)" : undefined}
                  onChange={(e) => {
                    const v = e.target.value;
                    const pct = r.effect.kind === "buff" || r.effect.kind === "game" ? 20 : Math.abs(r.effect.percent);
                    set(i, {
                      ...r,
                      effect: v === "__both" ? { kind: "both", percent: pct } : v === "__damage" ? { kind: "damage", percent: pct } : v === "__taken" ? { kind: "taken", percent: -pct }
                        : { kind: "buff", attr: v, level: r.effect.kind === "buff" ? r.effect.level : 1 },
                    });
                  }}
                >
                  {RULE_ATTRS.map((a) => <option key={a} value={a}>{a}</option>)}
                  <option value="__both">Damage up / taken down %</option>
                  {/* rules saved before the combined option keep their own kind */}
                  {r.effect.kind === "damage" && <option value="__damage">Damage dealt %</option>}
                  {r.effect.kind === "taken" && <option value="__taken">Damage taken %</option>}
                </select>
              </td>
              <td>
                <input
                  type="number"
                  className="num-input sm"
                  value={r.effect.kind === "buff" ? r.effect.level : r.effect.percent}
                  onChange={(e) => {
                    const n = Number(e.target.value) || 0;
                    const ef = r.effect;
                    if (ef.kind === "game") return;
                    set(i, { ...r, effect: ef.kind === "buff" ? { ...ef, level: Math.max(-10, Math.min(10, n)) } : { ...ef, percent: Math.max(-90, Math.min(500, n)) } });
                  }}
                />
                <span className="muted small">{r.effect.kind === "buff" ? " lv" : " %"}</span>
              </td>
              <td>
                <select
                  value={r.lastSeconds === undefined ? "all" : "last"}
                  onChange={(e) => set(i, { ...r, lastSeconds: e.target.value === "all" ? undefined : 30 })}
                >
                  <option value="all">Whole battle</option>
                  <option value="last">Last … s</option>
                </select>
                {r.lastSeconds !== undefined && (
                  <input
                    type="number"
                    className="num-input sm"
                    min={1}
                    max={100}
                    value={r.lastSeconds}
                    onChange={(e) => set(i, { ...r, lastSeconds: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                  />
                )}
              </td>
              <td><button className="icon remove" title="Delete rule" onClick={() => onChange(rules.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="settings-row">
        <button onClick={() => onChange([...rules, { enabled: true, side: "both", target: { by: "all", value: "" }, effect: { kind: "buff", attr: "ATK", level: 1 } }])}>+ Add rule</button>
        {GAME_RULE_IDS.map((id) => (
          (() => {
            // one of each game rule: greyed out once it's in the list
            const added = rules.some((r) => r.effect.kind === "game" && r.effect.id === id);
            return (
              <button
                key={id}
                disabled={added}
                title={`${GAME_RULES[id].text} (from the game's battle data; fixed values)${added ? ". Already added." : ""}`}
                onClick={() => onChange([...rules, gameRule(id)])}
              >
                + {GAME_RULES[id].short}
              </button>
            );
          })()
        ))}
      </div>
    </div>
  );
}
