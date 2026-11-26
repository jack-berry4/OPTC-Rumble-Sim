/**
 * Assault Rumble boss editor (docs/PLAN_MODES.md section 2): a boss takes a real unit's look (portrait, sprite) and
 * has its own name, type, classes, tags, typed-in stats and kit. "Copy from a unit" fills any part from a unit's kit
 * at full build, to edit from there; the effect lists use the database's structure, so any special can be rebuilt.
 */
import { useMemo, useRef, useState } from "react";
import type { Attribute, Color, Effect, Pattern, Resilience, RumbleType, TargetingPriority, UnitClass, UnitRecord } from "../data/schema";
import type { UnitDb } from "../data/unitDb";
import { resilienceToString, superConditionToString } from "../data/rumbleText";
import { bossFromUnit, kitOf, type BossDef } from "../engine/boss";
import { shortName } from "../engine/team";
import { EffectList } from "./EffectEditor";
import { colorClass, FloatingPop, UnitSearch } from "./TeamEditor";
import { UnitThumb } from "./UnitThumb";
import { Typed } from "./Typed";

const COLORS: (Color | null)[] = ["[STR]", "[DEX]", "[QCK]", "[PSY]", "[INT]", null];
const CLASSES: UnitClass[] = ["Fighter", "Slasher", "Shooter", "Striker", "Driven", "Free Spirit", "Cerebral", "Powerhouse"];
const STYLES: RumbleType[] = ["ATK", "DEF", "SPT", "DBF", "RCV", "BAL"];
const STAT_KEYS = ["hp", "atk", "rcv", "def", "spd"] as const;
const TARGETS: { label: string; v: { criteria: Attribute; comparator?: TargetingPriority } }[] = [
  { label: "Nearby enemies", v: { criteria: "near" } },
  { label: "Highest ATK", v: { criteria: "ATK", comparator: "highest" } },
  { label: "Highest HP", v: { criteria: "HP", comparator: "highest" } },
  { label: "Lowest HP", v: { criteria: "HP", comparator: "lowest" } },
  { label: "Highest DEF", v: { criteria: "DEF", comparator: "highest" } },
  { label: "Highest SPD", v: { criteria: "SPD", comparator: "highest" } },
];
const PATTERN_STEPS: { label: string; v: Pattern }[] = [
  { label: "Normal attack", v: { action: "attack", type: "Normal" } },
  { label: "Power attack", v: { action: "attack", type: "Power" } },
  { label: "Full attack", v: { action: "attack", type: "Full" } },
  ...(["Small", "Medium"] as const).flatMap((range) => (["Normal", "Power", "Full"] as const).map((type) => ({ label: `${range} range ${type} attack`, v: { action: "attack", type, range } as Pattern }))),
  ...(["Self", "Small", "Medium", "Large"] as const).flatMap((area) => [1, 2, 3].map((level) => ({ label: `Heal ${area} lv ${level}`, v: { action: "heal", area, level } as Pattern }))),
];
const stepKey = (p: Pattern) => JSON.stringify(p);
/** Kit parts "copy from a unit" can take. */
const PARTS = [
  ["look", "Look, name, type, classes, tags"],
  ["stats", "Base stats"],
  ["abilities", "Ability"],
  ["special", "Special"],
  ["superSpecial", "Super special"],
  ["pattern", "Attack pattern"],
  ["resilience", "Resistances"],
  ["target", "Targeting"],
] as const;
type Part = (typeof PARTS)[number][0];

/** Resistances every boss in Nydato's Assault Rumble tab has (2026-11-22): percentage damage reduced by 85%. */
const BOSS_PCT_RESIST: Resilience = { type: "dmgtype", attribute: "Percentage Damage", percentage: 85 } as unknown as Resilience;

export function BossEditor(props: { db: UnitDb; boss: BossDef; isNew: boolean; onSave: (b: BossDef) => void; onCancel: () => void }) {
  const { db } = props;
  const [b, setB] = useState<BossDef>(() => structuredClone(props.boss));
  const [copying, setCopying] = useState(false);
  // a new boss copies everything by default; an existing one keeps its look and stats unless ticked
  const [parts, setParts] = useState<Set<Part>>(() => new Set(props.isNew ? PARTS.map((p) => p[0]) : ["abilities", "special", "superSpecial", "pattern", "resilience", "target"]));
  const [busy, setBusy] = useState<string>();
  const searchAnchor = useRef<HTMLButtonElement>(null);
  const baseAnchor = useRef<HTMLButtonElement>(null);
  const [pickBase, setPickBase] = useState(false);
  const set = (patch: Partial<BossDef>) => setB((x) => ({ ...x, ...patch }));
  const base = db.byId.get(b.baseId);
  const tags = useMemo(() => [...new Set(db.all.flatMap((u) => u.tags))].sort(), [db]);

  /** Copy the chosen parts from a unit (loads its detail first). */
  const copyFrom = async (u: UnitRecord, which: Set<Part>) => {
    setBusy(`Loading ${shortName(u.name)}…`);
    try {
      await db.ensure([u.id]);
      const rec = db.byId.get(u.id)!;
      const full = bossFromUnit(rec, b.id);
      const kit = kitOf(rec);
      setB((x) => ({
        ...x,
        ...(which.has("look") ? { baseId: rec.id, name: full.name, color: full.color, classes: full.classes, tags: full.tags, families: full.families, style: full.style } : {}),
        ...(which.has("stats") ? { stats: full.stats } : {}),
        ...(which.has("abilities") ? { abilities: kit.abilities } : {}),
        ...(which.has("special") ? { special: kit.special } : {}),
        ...(which.has("superSpecial") ? { superSpecial: kit.superSpecial } : {}),
        ...(which.has("pattern") ? { pattern: kit.pattern } : {}),
        ...(which.has("resilience") ? { resilience: kit.resilience } : {}),
        ...(which.has("target") ? { target: kit.target } : {}),
      }));
    } finally {
      setBusy(undefined);
    }
  };

  const statRow = (k: (typeof STAT_KEYS)[number]) => (
    <label key={k} className="ed-row" title={k === "def" ? "DEF: damage taken = damage / (1 + DEF² / 50,000)" : k === "spd" ? "SPD: how fast its turn comes (the queue gauge)" : undefined}>
      <span>{k.toUpperCase()}</span>
      <input type="number" className="num-input" min={0} value={b.stats[k]} onChange={(e) => set({ stats: { ...b.stats, [k]: Math.max(0, Number(e.target.value) || 0) } })} />
    </label>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="modal boss-modal" role="dialog" aria-modal="true" aria-label="Edit boss">
        <div className="modal-head">
          <h3>{props.isNew ? "New boss" : "Edit boss"}</h3>
          {busy && <span className="muted small">{busy}</span>}
          <button className="icon" title="Close without saving" onClick={props.onCancel}>✕</button>
        </div>

        <div className="boss-top">
          <button ref={baseAnchor} className="unit-icon boss-base" title="The unit whose portrait and animation the boss uses. Click to change." onClick={() => setPickBase(true)}>
            <UnitThumb id={b.baseId} size={72} colorClass={base ? colorClass(base) : undefined} badge={b.color} />
          </button>
          {pickBase && (
            <FloatingPop anchor={baseAnchor} offset={78}>
              <UnitSearch db={db} autoFocus onCancel={() => setPickBase(false)} onPick={(u) => { setPickBase(false); set({ baseId: u.id }); }} />
            </FloatingPop>
          )}
          <div className="boss-ident">
            <label className="ed-row"><span>Name</span><input className="name-input wide" value={b.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
            <div className="muted small">Looks like {base ? `#${base.id} ${base.name}` : `#${b.baseId}`} (portrait and animation only)</div>
            <div className="ed-row">
              <span>Type</span>
              <select value={b.color ?? ""} onChange={(e) => set({ color: (e.target.value || null) as Color | null })}>
                {COLORS.map((c) => <option key={c ?? "none"} value={c ?? ""}>{c ? c.slice(1, -1) : "None"}</option>)}
              </select>
              <span>Style</span>
              <select value={b.style} onChange={(e) => set({ style: e.target.value as RumbleType })}>
                {STYLES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="ed-row ed-chips">
              <span>Classes</span>
              {CLASSES.map((c) => {
                const on = b.classes.includes(c);
                return <button key={c} className={`ed-chip ${on ? "on" : ""}`} onClick={() => set({ classes: on ? b.classes.filter((x) => x !== c) : [...b.classes, c] })}>{c}</button>;
              })}
            </div>
          </div>
        </div>

        {b.game && (
          <section className="boss-sec boss-game">
            <h4>From the game's data {b.game.subName && <span className="muted small">({b.game.subName})</span>}</h4>
            {b.game.notes.length > 0 && (
              <div className="warn-box small">
                <b>Not read automatically: add these below by hand.</b>
                <ul>{b.game.notes.map((n, i) => <li key={i}><Typed text={n} /></li>)}</ul>
              </div>
            )}
            {b.game.specialText && <div className="small"><b>Special{b.game.specialName ? ` “${b.game.specialName}”` : ""} (lv {b.game.specialLevel}):</b> <Typed text={b.game.specialText} /></div>}
            {b.game.abilityText && <div className="small"><b>Ability (lv {b.game.abilityLevel}):</b> <Typed text={b.game.abilityText} /></div>}
            {b.game.resistText && <div className="small"><b>Resistances:</b> <Typed text={b.game.resistText} /></div>}
            {!!b.game.additionalBehaviors && <div className="muted small">Game value “additional behavior count”: {b.game.additionalBehaviors} (the team's main boss gets 1 + this many places in the NEXT queue).</div>}
          </section>
        )}

        <div className="boss-copy">
          <button ref={searchAnchor} className="primary" onClick={() => setCopying(true)} title="Pick a unit and copy the ticked parts from it (its kit at full build: ability lv 5, special lv 10, LLB)">Copy from a unit…</button>
          {PARTS.map(([k, label]) => (
            <label key={k} className="check-row small">
              <input type="checkbox" checked={parts.has(k)} onChange={(e) => setParts((p) => { const n = new Set(p); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
              {label}
            </label>
          ))}
          {copying && (
            <FloatingPop anchor={searchAnchor} offset={34}>
              <UnitSearch db={db} autoFocus onCancel={() => setCopying(false)} onPick={(u) => { setCopying(false); void copyFrom(u, parts); }} />
            </FloatingPop>
          )}
        </div>

        <section className="boss-sec">
          <h4>Stats <span className="muted small">(as the boss's Rumble screen shows them)</span></h4>
          <div className="ed-grid boss-stats">{STAT_KEYS.map(statRow)}</div>
          <div className="row-btns small">
            <span className="muted small">HP quick:</span>
            {[100_000, 500_000, 1_000_000, 5_000_000].map((v) => <button key={v} className="preset" onClick={() => set({ stats: { ...b.stats, hp: v } })}>{v.toLocaleString()}</button>)}
          </div>
        </section>

        <section className="boss-sec">
          <h4>Tags <span className="muted small">(crews, races: for rules and effects that name them)</span></h4>
          <div className="ed-chips">
            {b.tags.map((t) => <button key={t} className="ed-chip on" title="Remove" onClick={() => set({ tags: b.tags.filter((x) => x !== t) })}>{t} ×</button>)}
            <input
              className="name-input"
              list="boss-tags"
              placeholder="+ add a tag"
              onKeyDown={(e) => { const v = e.currentTarget.value.trim(); if (e.key === "Enter" && v && !b.tags.includes(v)) { set({ tags: [...b.tags, v] }); e.currentTarget.value = ""; } }}
              onChange={(e) => { const v = e.target.value; if (tags.includes(v) && !b.tags.includes(v)) { set({ tags: [...b.tags, v] }); e.target.value = ""; } }}
            />
            <datalist id="boss-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <label className="ed-row" title="Character names, for effects like “when Shanks is on the enemy crew” (comma separated)">
            <span>Characters</span>
            <input className="name-input wide" value={b.families.join(", ")} onChange={(e) => set({ families: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </label>
        </section>

        <section className="boss-sec">
          <h4>Ability <span className="muted small">(always on)</span></h4>
          <EffectList effects={b.abilities} source="ability" empty="No ability." onChange={(abilities) => set({ abilities })} />
        </section>

        <section className="boss-sec">
          <h4>
            Special{" "}
            <label className="check-row small inline">
              <input type="checkbox" checked={!!b.special} onChange={(e) => set({ special: e.target.checked ? { cooldown: 30, effects: [] } : undefined })} />
              has one
            </label>
          </h4>
          {b.special && (
            <>
              <label className="ed-row" title="Seconds of battle to charge the special (Special CT)">
                <span>Charge time s</span>
                <input type="number" className="num-input sm" min={1} value={b.special.cooldown} onChange={(e) => set({ special: { ...b.special!, cooldown: Math.max(1, Number(e.target.value) || 1) } })} />
              </label>
              <EffectList effects={b.special.effects} source="special" empty="No effects yet: add some below." onChange={(effects) => set({ special: { ...b.special!, effects } })} />
            </>
          )}
        </section>

        <section className="boss-sec">
          <h4>
            Super special{" "}
            <label className="check-row small inline">
              <input type="checkbox" checked={!!b.superSpecial} onChange={(e) => set({ superSpecial: e.target.checked ? { condition: { type: "time", count: 60 }, effects: [] } : undefined })} />
              has one
            </label>
          </h4>
          {b.superSpecial && (
            <>
              <div className="ed-row">
                <span>Unlocks</span>
                <select value={b.superSpecial.condition.type} onChange={(e) => set({ superSpecial: { ...b.superSpecial!, condition: { ...b.superSpecial!.condition, type: e.target.value } } })}>
                  <option value="time">when N s or less are left</option>
                  <option value="specialreceived">after receiving N enemy specials</option>
                  <option value="dmgreceived">after receiving damage N times</option>
                  <option value="special">after the crew uses N specials</option>
                  <option value="heal">after being healed N times</option>
                  <option value="stat">while HP is below N%</option>
                </select>
                <input type="number" className="num-input sm" value={b.superSpecial.condition.count ?? 0} onChange={(e) => set({ superSpecial: { ...b.superSpecial!, condition: { ...b.superSpecial!.condition, count: Number(e.target.value) || 0, ...(b.superSpecial!.condition.type === "stat" ? { stat: "HP", comparator: "below" } : {}) } } })} />
              </div>
              <div className="muted small">{superConditionToString(b.superSpecial.condition)}</div>
              <EffectList effects={b.superSpecial.effects} source="superSpecial" onChange={(effects) => set({ superSpecial: { ...b.superSpecial!, effects: effects as Effect[] } })} />
            </>
          )}
        </section>

        <section className="boss-sec">
          <h4>Attack pattern <span className="muted small">(repeats in order)</span></h4>
          <ol className="pattern-list">
            {b.pattern.map((p, i) => (
              <li key={i}>
                <select value={stepKey(p)} onChange={(e) => set({ pattern: b.pattern.map((x, j) => (j === i ? JSON.parse(e.target.value) as Pattern : x)) })}>
                  {PATTERN_STEPS.map((s) => <option key={s.label} value={stepKey(s.v)}>{s.label}</option>)}
                </select>
                {b.pattern.length > 1 && <button className="icon remove" title="Remove" onClick={() => set({ pattern: b.pattern.filter((_, j) => j !== i) })}>×</button>}
              </li>
            ))}
          </ol>
          <button className="link small" onClick={() => set({ pattern: [...b.pattern, { action: "attack", type: "Normal" }] })}>+ step</button>
          <label className="ed-row">
            <span>Targets</span>
            <select value={JSON.stringify(b.target)} onChange={(e) => set({ target: JSON.parse(e.target.value) })}>
              {TARGETS.map((t) => <option key={t.label} value={JSON.stringify(t.v)}>{t.label}</option>)}
              {!TARGETS.some((t) => JSON.stringify(t.v) === JSON.stringify(b.target)) && <option value={JSON.stringify(b.target)}>{b.target.comparator} {b.target.criteria}</option>}
            </select>
          </label>
          <label className="ed-row" title="Assault Rumble: the team's main boss (the game's first unit) has several places in the NEXT queue (1 + the deck's additional behavior count: Blackbeard 4, Akainu 3); it still acts one turn at a time, and several of your units can attack it at once. 0 = a regular unit of the boss team.">
            <span>Main boss: NEXT places</span>
            <input type="number" className="num-input sm" min={0} max={8} value={b.places ?? 0} onChange={(e) => { const n = Math.max(0, Math.min(8, Math.floor(Number(e.target.value) || 0))); set({ places: n }); }} />
          </label>
        </section>

        <section className="boss-sec">
          <h4>Resistances</h4>
          <ResilienceList list={b.resilience} onChange={(resilience) => set({ resilience })} />
          <div className="row-btns small">
            <button className="preset" title="Every boss in Nydato's Assault Rumble tab takes 85% less percentage damage" disabled={b.resilience.some((r) => JSON.stringify(r) === JSON.stringify(BOSS_PCT_RESIST))} onClick={() => set({ resilience: [...b.resilience, BOSS_PCT_RESIST] })}>+ % damage −85% (bosses)</button>
            {["Forced Out", "Paralysis", "Action Bind", "Confusion", "Special Bind", "Damage Over Time"].map((a) => (
              <button key={a} className="preset" title={`100% chance to resist ${a}`} disabled={b.resilience.some((r) => r.type === "debuff" && r.attribute === a)} onClick={() => set({ resilience: [...b.resilience, { type: "debuff", attribute: a as Attribute, chance: 100 }] })}>+ resist {a}</button>
            ))}
          </div>
        </section>

        <div className="modal-foot">
          <button className="primary" disabled={!b.name.trim() || b.stats.hp <= 0} onClick={() => props.onSave({ ...b, name: b.name.trim() })}>{props.isNew ? "Add boss" : "Save boss"}</button>
          <button onClick={props.onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** Resistances as the site words them, each removable; a raw JSON box adds any other kind. */
function ResilienceList(props: { list: Resilience[]; onChange: (r: Resilience[]) => void }) {
  const [raw, setRaw] = useState("");
  const [err, setErr] = useState<string>();
  return (
    <div>
      <ul className="res-list">
        {props.list.map((r, i) => (
          <li key={i}>
            <Typed text={resilienceToString(r) || JSON.stringify(r)} />
            {(r as { type: string }).type === "dmgtype" && ` (${(r as unknown as { percentage: number }).percentage}% less ${(r as unknown as { attribute: string }).attribute})`}
            <button className="icon remove" title="Remove" onClick={() => props.onChange(props.list.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
        {!props.list.length && <li className="muted small">None.</li>}
      </ul>
      <details className="mini">
        <summary>Add any resistance as JSON</summary>
        <div className="ed-row">
          <input className="name-input wide" value={raw} placeholder='{"type":"damage","attribute":"[STR]","percentage":30}' onChange={(e) => setRaw(e.target.value)} />
          <button onClick={() => { try { props.onChange([...props.list, JSON.parse(raw) as Resilience]); setRaw(""); setErr(undefined); } catch (e) { setErr(String(e)); } }}>Add</button>
        </div>
        {err && <p className="error small">{err}</p>}
      </details>
    </div>
  );
}
