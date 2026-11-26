import { advancedTitle } from "./TeamEditor";
import {
  advancedFrom, MAX_CC, MAX_LEVEL_LLB, POTENTIAL_MAX_LEVEL, PREMIUM_POTENTIALS, SOCKET_MAX_LEVEL,
  type AdvancedPreset, type PresetDef,
} from "../engine/stats";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Settings table for the quick-build buttons (Lv 1 / 99 / 120 / MAX by default). Each preset is simple (one row of
 * settings) or, with its Advanced box ticked, set part by part in a panel under its row; the simple settings grey out
 * then [user 2026-11-18].
 */
export function PresetEditor(props: { presets: PresetDef[]; potentials: string[]; onChange: (p: PresetDef[]) => void; onReset: () => void }) {
  const { presets, onChange } = props;
  const set = (i: number, patch: Partial<PresetDef>) => onChange(presets.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setAdv = (i: number, patch: Partial<AdvancedPreset>) => {
    const p = presets[i]!;
    set(i, { advanced: { ...(p.advanced ?? advancedFrom(p)), ...patch } });
  };
  const num = (i: number, key: "level" | "llbLevel" | "potentialLevel" | "socketLevel", min: number, max: number, off: boolean) => (
    <input
      type="number"
      className="num-input sm"
      min={min}
      max={max}
      disabled={off}
      value={presets[i]![key]}
      onChange={(e) => set(i, { [key]: clamp(Number(e.target.value) || 0, min, max) })}
    />
  );
  return (
    <div className="table-wrap">
      <table className="preset-table">
        <thead>
          <tr>
            <th>Button</th><th>Level</th><th title="Raised automatically if the level needs more">LLB</th><th>Limit Break</th>
            <th>Rumble key</th><th title="Max Rumble special and ability levels">Max special/ability</th><th title="Level of every unlocked potential ability (up to 3 per unit, unlocked along the Limit Break). Tick the box to raise the premium potentials too; otherwise they stay at level 1.">Potential lv (each, max 5)</th><th title="Level of every available socket slot">Socket lv (each, max 5)</th><th title="Cotton candy the build sets">Cotton candy</th>
            <th title="Set this preset part by part: skill levels, Limit Break nodes, each potential, custom cotton candy">Advanced</th><th />
          </tr>
        </thead>
        <tbody>
          {presets.map((p, i) => {
            const off = !!p.useAdvanced;
            const cell = off ? "preset-off" : undefined;
            return [
              <tr key={i} className={off ? "preset-def adv-on" : "preset-def"}>
                <td><input className="name-input" value={p.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
                <td className={cell}>{num(i, "level", 1, MAX_LEVEL_LLB, off)}</td>
                <td className={cell}>{num(i, "llbLevel", 0, 5, off)}</td>
                <td className={cell}>
                  <select disabled={off} value={p.lb} onChange={(e) => set(i, { lb: e.target.value as PresetDef["lb"] })}>
                    <option value="none">None</option>
                    <option value="regular">Max Limit Break</option>
                    <option value="expanded">Expanded Limit Break (keyed)</option>
                  </select>
                </td>
                <td className={cell}><input type="checkbox" disabled={off} checked={p.rumbleKey} onChange={(e) => set(i, { rumbleKey: e.target.checked })} /></td>
                <td className={cell}><input type="checkbox" disabled={off} checked={p.maxSkills} onChange={(e) => set(i, { maxSkills: e.target.checked })} /></td>
                <td className={`nowrap ${cell ?? ""}`}>
                  {num(i, "potentialLevel", 1, POTENTIAL_MAX_LEVEL, off)}
                  <label className="premium-check" title={`Also premium potentials (${PREMIUM_POTENTIALS.join(", ")}); otherwise they stay at level 1`}>
                    <input type="checkbox" disabled={off} checked={!!p.premiumPotentials} onChange={(e) => set(i, { premiumPotentials: e.target.checked })} />
                    premium
                  </label>
                </td>
                <td className={cell}>{num(i, "socketLevel", 0, SOCKET_MAX_LEVEL, off)}</td>
                <td className={cell}>
                  <select disabled={off} value={p.cc ?? "keep"} onChange={(e) => set(i, { cc: e.target.value as NonNullable<PresetDef["cc"]> })}>
                    <option value="none">None (0/0/0)</option>
                    <option value="max">Account max</option>
                    <option value="maxPossible">Max possible (200/200/200)</option>
                    <option value="keep">Keep the unit's</option>
                  </select>
                </td>
                <td className="center">
                  <input
                    type="checkbox"
                    checked={off}
                    title="Advanced mode: set this preset part by part (starts from its simple settings)"
                    onChange={(e) => set(i, { useAdvanced: e.target.checked, advanced: p.advanced ?? advancedFrom(p) })}
                  />
                </td>
                <td><button className="icon remove" title="Delete this preset" onClick={() => onChange(presets.filter((_, j) => j !== i))}>×</button></td>
              </tr>,
              off && (
                <tr key={`${i}-adv`} className="preset-adv-row">
                  <td colSpan={11}>
                    <div className={`adv-wrap ${p.advancedCollapsed ? "collapsed" : ""}`}>
                      <button
                        className="adv-toggle"
                        aria-expanded={!p.advancedCollapsed}
                        title={p.advancedCollapsed ? "Show the advanced settings" : "Fold the advanced settings away (they stay in use)"}
                        onClick={() => set(i, { advancedCollapsed: !p.advancedCollapsed })}
                      >
                        <span className="adv-caret">{p.advancedCollapsed ? "▸" : "▾"}</span> Advanced settings
                        {p.advancedCollapsed && <span className="adv-summary muted">{advancedTitle(p.advanced ?? advancedFrom(p)).replace(/^Advanced: /, "")}</span>}
                      </button>
                      {!p.advancedCollapsed && (
                        <AdvancedPanel a={p.advanced ?? advancedFrom(p)} potentials={props.potentials} onChange={(patch) => setAdv(i, patch)} onReset={() => set(i, { advanced: advancedFrom(p) })} />
                      )}
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
      <div className="settings-row">
        <button
          onClick={() => onChange([...presets, { label: "New", level: 99, llbLevel: 0, lb: "regular", rumbleKey: false, maxSkills: true, potentialLevel: 1, premiumPotentials: false, socketLevel: SOCKET_MAX_LEVEL, cc: "max" }])}
        >
          + Add preset
        </button>
        <button onClick={props.onReset}>Reset to defaults</button>
      </div>
    </div>
  );
}

/** A number box; blank = the unit's max (`undefined`). */
function MaxOr(props: { value?: number; max: number; onChange: (v?: number) => void; title?: string }) {
  return (
    <input
      type="number"
      className="num-input sm"
      min={1}
      max={props.max}
      placeholder="max"
      title={props.title ?? "Blank: the unit's max. A number is capped at the unit's max."}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value === "" ? undefined : clamp(Math.round(Number(e.target.value) || 1), 1, props.max))}
    />
  );
}

function AdvancedPanel(props: { a: AdvancedPreset; potentials: string[]; onChange: (patch: Partial<AdvancedPreset>) => void; onReset: () => void }) {
  const { a, onChange } = props;
  const n = (v: string, lo: number, hi: number) => clamp(Math.round(Number(v) || 0), lo, hi);
  const setPot = (name: string, v: string) => {
    const potentials = { ...a.potentials };
    if (v === "") delete potentials[name];
    else potentials[name] = Number(v);
    onChange({ potentials });
  };
  const premium = props.potentials.filter((x) => PREMIUM_POTENTIALS.includes(x));
  const regular = props.potentials.filter((x) => !PREMIUM_POTENTIALS.includes(x));
  return (
    <div className="adv-panel">
      <fieldset>
        <legend>Level</legend>
        <label>Level <input type="number" className="num-input sm" min={1} max={MAX_LEVEL_LLB} value={a.level} onChange={(e) => onChange({ level: n(e.target.value, 1, MAX_LEVEL_LLB) })} /></label>
        <label title="Raised automatically if the level needs more">LLB <input type="number" className="num-input sm" min={0} max={5} value={a.llbLevel} onChange={(e) => onChange({ llbLevel: n(e.target.value, 0, 5) })} /></label>
      </fieldset>
      <fieldset>
        <legend>Limit Break</legend>
        <select value={a.lb} onChange={(e) => onChange({ lb: e.target.value as AdvancedPreset["lb"] })}>
          <option value="none">None</option>
          <option value="regular">Max Limit Break</option>
          <option value="expanded">Expanded Limit Break (keyed)</option>
        </select>
        <label title="Stop after this many Limit Break nodes (blank: every node the choice above allows). Potentials and socket slots unlock along the nodes.">
          Nodes
          <input type="number" className="num-input sm" min={0} max={99} placeholder="all" value={a.lbNodes ?? ""} onChange={(e) => onChange({ lbNodes: e.target.value === "" ? undefined : n(e.target.value, 0, 99) })} />
        </label>
        <label><input type="checkbox" checked={a.rumbleKey} onChange={(e) => onChange({ rumbleKey: e.target.checked })} /> Rumble key</label>
      </fieldset>
      <fieldset>
        <legend>Skill levels</legend>
        <label>Special <MaxOr value={a.specialLevel} max={10} onChange={(v) => onChange({ specialLevel: v })} /></label>
        <label>Ability <MaxOr value={a.abilityLevel} max={5} onChange={(v) => onChange({ abilityLevel: v })} /></label>
        <label title="The main-game special level: scales the stat bonus from potentials and sockets. Blank: the unit's max.">
          Main special <MaxOr value={a.mainSpecialLevel} max={99} onChange={(v) => onChange({ mainSpecialLevel: v })} />
        </label>
      </fieldset>
      <fieldset>
        <legend>Sockets</legend>
        <label title="Level of every available socket slot">Lv each <input type="number" className="num-input sm" min={0} max={SOCKET_MAX_LEVEL} value={a.socketLevel} onChange={(e) => onChange({ socketLevel: n(e.target.value, 0, SOCKET_MAX_LEVEL) })} /></label>
      </fieldset>
      <fieldset>
        <legend>Cotton candy</legend>
        <select value={a.cc} onChange={(e) => onChange({ cc: e.target.value as AdvancedPreset["cc"] })}>
          <option value="none">None (0/0/0)</option>
          <option value="max">Account max</option>
          <option value="custom">Custom</option>
          <option value="keep">Keep the unit's</option>
        </select>
        {(["hp", "atk", "rcv"] as const).map((k) => (
          <label key={k} className={a.cc === "custom" ? undefined : "preset-off"}>
            {k.toUpperCase()}
            <input
              type="number" className="num-input sm" min={0} max={MAX_CC} disabled={a.cc !== "custom"} value={a.ccCustom[k]}
              onChange={(e) => onChange({ ccCustom: { ...a.ccCustom, [k]: n(e.target.value, 0, MAX_CC) } })}
            />
          </label>
        ))}
      </fieldset>
      <fieldset className="adv-pots">
        <legend>Potentials</legend>
        <PotentialList a={a} premium={premium} regular={regular} onChange={onChange} onSet={setPot} />
      </fieldset>
      <div className="adv-foot">
        <button className="small-btn" onClick={props.onReset} title="Start over from this preset's simple settings">Copy from simple settings</button>
      </div>
    </div>
  );
}

/**
 * The potentials: one level for every regular potential and one for every premium one, then one list to set any of
 * them on its own, the premium ones first.
 */
function PotentialList(props: {
  a: AdvancedPreset; premium: string[]; regular: string[];
  onChange: (patch: Partial<AdvancedPreset>) => void; onSet: (name: string, v: string) => void;
}) {
  const { a } = props;
  const prem = a.premiumDefault ?? a.potentialDefault;
  const set = Object.keys(a.potentials).length;
  const levels = (v: number, on: (v: number) => void) => (
    <select value={v} onChange={(e) => on(Number(e.target.value))}>
      {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>Lv {x}</option>)}
    </select>
  );
  const row = (name: string, isPrem: boolean) => {
    const same = isPrem ? prem : a.potentialDefault;
    return (
      <label key={name} className={`${a.potentials[name] !== undefined ? "set" : ""} ${isPrem ? "prem" : ""}`} title={isPrem ? `${name} (premium)` : name}>
        <span>{name}</span>
        <select value={a.potentials[name] ?? ""} onChange={(e) => props.onSet(name, e.target.value)}>
          <option value="">same ({same})</option>
          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>Lv {v}</option>)}
        </select>
      </label>
    );
  };
  return (
    <>
      <div className="adv-pot-head">
        <label title="Level of every unlocked regular potential not set on its own below">Every potential {levels(a.potentialDefault, (v) => props.onChange({ potentialDefault: v }))}</label>
        <label title={`Level of every unlocked premium potential (${PREMIUM_POTENTIALS.join(", ")}) not set on its own below`}>Premium potentials {levels(prem, (v) => props.onChange({ premiumDefault: v }))}</label>
      </div>
      <details open={set > 0}>
        <summary>Each one{set ? ` (${set} set)` : ""}</summary>
        <div className="adv-pot-grid">
          {props.premium.map((n) => row(n, true))}
          {props.regular.map((n) => row(n, false))}
        </div>
      </details>
    </>
  );
}
