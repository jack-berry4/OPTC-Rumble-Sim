/**
 * Editor for a list of effects in the database's structure (src/data/schema.ts Effect): what a Rumble special,
 * ability or GP burst is made of. Each effect shows as the site's sentence (rumbleText.effectLines); open one to edit
 * its fields, or its raw JSON for anything the fields don't cover. Used by the Assault Rumble boss editor, where any
 * regular special can be rebuilt (or copied from a unit and edited).
 */
import { useState } from "react";
import type { Attribute, Effect } from "../data/schema";
import { effectLines } from "../data/rumbleText";
import type { Source } from "../sim/spec";
import { SimReading } from "./TeamEditor";
import { Typed } from "./Typed";
import { FEATURES } from "../features";

type Ef = Effect & Record<string, unknown>;

const KINDS: { v: Effect["effect"]; label: string; help: string }[] = [
  { v: "buff", label: "Buff", help: "Raise stat levels (ATK, DEF, SPD, Special CT ...) or give a Shield" },
  { v: "debuff", label: "Debuff", help: "Lower stat levels" },
  { v: "hinderance", label: "Hinderance", help: "Paralysis, binds, Confusion, Half Stats, Forced Out, Special CT delay ..." },
  { v: "damage", label: "Damage", help: "ATK-based, fixed, % HP cut, random, Damage over Time" },
  { v: "recharge", label: "Heal / charge", help: "Restore HP (RCV x, fixed, %) or Special CT" },
  { v: "boon", label: "Boon", help: "Provoke, Haste, Counter, Revive, Damage Reflect, resist a status ..." },
  { v: "penalty", label: "Penalty", help: "A cost on its own side (stat down, HP cut, a status)" },
  { v: "cleanse", label: "Cleanse", help: "Remove debuffs / statuses" },
  { v: "evade", label: "Evade", help: "A chance to evade statuses or kinds of damage" },
];

/** Attributes found in the database, per effect kind (2026-11-22). */
const ATTRS: Partial<Record<Effect["effect"], string[]>> = {
  buff: ["ATK", "DEF", "SPD", "HP", "RCV", "Special CT", "Critical Hit", "Guard", "Accuracy", "Blow Away", "Shield"],
  debuff: ["ATK", "DEF", "SPD", "HP", "RCV", "Special CT", "Critical Hit", "Guard", "Accuracy"],
  hinderance: ["Paralysis", "Special CT", "Special Bind", "Action Bind", "Half Stats", "Half ATK", "Half DEF", "Half SPD", "Half RCV", "Confusion", "Forced Out", "RCV Bind", "Ability Bind"],
  boon: ["Haste", "Provoke", "Counter", "Switch", "Revive", "On Death", "Damage Reflect", "Special Bind", "Paralysis", "Action Bind", "Half Stats", "Damage Over Time", "RCV Bind"],
  penalty: ["HP", "ATK", "DEF", "SPD", "Special CT", "Special Bind", "Half Stats", "Paralysis", "RCV Bind"],
  cleanse: ["all", "ATK", "DEF", "SPD"],
  evade: ["Stats Down", "Damage Ignoring DEF", "Fixed Damage", "Percentage Damage", "Action Bind", "Special Bind", "Paralysis", "Half Stats", "Damage Over Time", "Forced Out", "Confusion", "RCV Bind", "Special CT Delay"],
};
const TYPES: Partial<Record<Effect["effect"], { v: string; label: string }[]>> = {
  damage: [
    { v: "atk", label: "x ATK" }, { v: "atkbase", label: "x base ATK" }, { v: "fixed", label: "fixed" },
    { v: "cut", label: "% of HP left" }, { v: "random", label: "random fixed" }, { v: "time", label: "Damage over Time" },
  ],
  recharge: [{ v: "RCV", label: "x RCV of HP" }, { v: "fixed", label: "fixed HP" }, { v: "percentage", label: "% of max HP" }, { v: "Special CT", label: "% Special CT" }],
};
const TARGETS = ["enemies", "crew", "self", "[STR]", "[DEX]", "[QCK]", "[PSY]", "[INT]", "Fighter", "Slasher", "Shooter", "Striker", "Driven", "Free Spirit", "Cerebral", "Powerhouse", "ATK-Style", "DEF-Style", "SPT-Style", "DBF-Style", "RCV-Style", "BAL-Style"];
const PRIORITY_STATS = ["ATK", "HP", "DEF", "SPD", "RCV", "Special CT"];

/** A fresh effect of a kind, with sensible values. */
export function blankEffect(kind: Effect["effect"] = "buff"): Effect {
  switch (kind) {
    case "buff": return { effect: "buff", attributes: ["ATK"], level: 5, duration: 20, targeting: { targets: ["crew"] } };
    case "debuff": return { effect: "debuff", attributes: ["DEF"], level: 5, duration: 20, targeting: { targets: ["enemies"] } };
    case "hinderance": return { effect: "hinderance", attributes: ["Paralysis"], chance: 100, duration: 10, targeting: { targets: ["enemies"] } };
    case "damage": return { effect: "damage", type: "atk", amount: 3, targeting: { targets: ["enemies"] } };
    case "recharge": return { effect: "recharge", type: "RCV", amount: 5, targeting: { targets: ["crew"] } };
    case "boon": return { effect: "boon", attributes: ["Provoke"], duration: 20, targeting: { targets: ["self"] } };
    case "penalty": return { effect: "penalty", attributes: ["HP"], amount: 10, targeting: { targets: ["self"] } };
    case "cleanse": return { effect: "cleanse", attributes: ["all"], chance: 100, targeting: { targets: ["crew"] } };
    case "evade": return { effect: "evade", attributes: ["Stats Down" as Attribute], chance: 100, duration: 20, targeting: { targets: ["crew"] } };
  }
}

/** Common conditions, one click away (the rest through the JSON). */
const CONDITIONS: { label: string; make: (n: number) => Effect["condition"] | Record<string, unknown> | undefined; n?: number; unit?: string }[] = [
  { label: "Always", make: () => undefined },
  { label: "For the first N s", make: (n) => ({ type: "time", comparator: "first", count: n }), n: 30, unit: "s" },
  { label: "After N s of battle", make: (n) => ({ type: "time", comparator: "after", count: n }), n: 40, unit: "s" },
  { label: "When N s or less are left", make: (n) => ({ type: "time", comparator: "remaining", count: n }), n: 60, unit: "s" },
  { label: "While HP is above N%", make: (n) => ({ type: "stat", stat: "HP", comparator: "above", count: n }), n: 50, unit: "%" },
  { label: "While HP is below N%", make: (n) => ({ type: "stat", stat: "HP", comparator: "below", count: n }), n: 30, unit: "%" },
  { label: "Only in Assault Rumble", make: () => ({ type: "mode", mode: "Assault Rumble" }) },
];
function conditionPreset(c: unknown): { i: number; n?: number } {
  const x = c as Record<string, unknown> | undefined;
  if (!x) return { i: 0 };
  if (x.type === "time") return { i: x.comparator === "first" ? 1 : x.comparator === "after" ? 2 : x.comparator === "remaining" ? 3 : -1, n: x.count as number };
  if (x.type === "stat" && x.stat === "HP") return { i: x.comparator === "above" ? 4 : x.comparator === "below" ? 5 : -1, n: x.count as number };
  if (x.type === "mode") return { i: 6 };
  return { i: -1 };
}

const num = (v: string): number | undefined => (v.trim() === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))) as T;

/** A list of effects: each as its sentence, opened to edit; add, copy, move, remove. */
export function EffectList(props: {
  effects: Effect[];
  onChange: (e: Effect[]) => void;
  source: Source;
  /** Shown as the "add from" helper (e.g. copy a unit's special line). */
  addFrom?: React.ReactNode;
  empty?: string;
}) {
  const { effects, onChange } = props;
  const [open, setOpen] = useState<number>();
  const lines = effectLines(effects);
  const set = (i: number, e: Effect) => onChange(effects.map((x, j) => (j === i ? e : x)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= effects.length) return;
    const next = [...effects];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
    if (open === i) setOpen(j);
  };
  return (
    <div className="effect-list">
      {effects.length === 0 && <p className="muted small">{props.empty ?? "No effects."}</p>}
      <ol className="effect-rows">
        {effects.map((e, i) => (
          <li key={i} className={open === i ? "open" : ""}>
            <div className="effect-line">
              <button className="link effect-text" title="Edit this effect" onClick={() => setOpen(open === i ? undefined : i)}><Typed text={lines[i]} /></button>
              <span className="effect-tools">
                <button className="icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="icon" title="Move down" disabled={i === effects.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="icon" title="Duplicate" onClick={() => onChange([...effects.slice(0, i + 1), structuredClone(e), ...effects.slice(i + 1)])}>⧉</button>
                <button className="icon remove" title="Remove" onClick={() => { onChange(effects.filter((_, j) => j !== i)); setOpen(undefined); }}>×</button>
              </span>
            </div>
            {open === i && <EffectForm effect={e} onChange={(x) => set(i, x)} />}
          </li>
        ))}
      </ol>
      <div className="effect-add">
        <span className="muted small">Add:</span>
        {KINDS.map((k) => (
          <button key={k.v} className="preset" title={k.help} onClick={() => { onChange([...effects, blankEffect(k.v)]); setOpen(effects.length); }}>{k.label}</button>
        ))}
        {props.addFrom}
      </div>
      {effects.length > 0 && <SimReading effects={effects} source={props.source} />}
    </div>
  );
}

/** One effect's fields. */
function EffectForm({ effect, onChange }: { effect: Effect; onChange: (e: Effect) => void }) {
  const e = effect as Ef;
  const [json, setJson] = useState<string>();
  const [jsonErr, setJsonErr] = useState<string>();
  const set = (patch: Record<string, unknown>) => onChange(clean({ ...e, ...patch }) as Effect);
  const tg = (e.targeting ?? { targets: [] }) as NonNullable<Effect["targeting"]> & Record<string, unknown>;
  const setT = (patch: Record<string, unknown>) => set({ targeting: clean({ ...tg, ...patch }) });
  const attrs = ATTRS[e.effect] ?? [];
  const types = TYPES[e.effect];
  const cp = conditionPreset(e.condition);
  const hasLevel = e.effect === "buff" || e.effect === "debuff" || (e.effect === "damage" && e.type === "time") || (e.effect === "penalty" && !e.amount);
  const hasAmount = e.effect === "damage" ? e.type !== "time" && e.type !== "random" : e.effect === "recharge" || (e.effect === "hinderance" && (e.attributes ?? []).includes("Special CT")) || e.effect === "penalty" || (e.effect === "boon" && ["Counter", "Revive", "Damage Reflect"].some((a) => (e.attributes ?? []).includes(a as never)));
  const amountHelp = e.effect === "damage" ? (e.type === "fixed" ? "Fixed damage" : e.type === "cut" ? "% of the target's HP left" : "Multiplier of ATK") : e.effect === "recharge" ? (e.type === "RCV" ? "Multiplier of RCV" : e.type === "fixed" ? "HP" : "%") : "%";

  if (json !== undefined) {
    return (
      <div className="effect-form">
        <textarea className="json-box" rows={10} value={json} spellCheck={false} onChange={(ev) => setJson(ev.target.value)} />
        {jsonErr && <p className="error small">{jsonErr}</p>}
        <div className="row-btns">
          <button className="primary" onClick={() => {
            try {
              const v = JSON.parse(json) as Effect;
              if (!v || typeof v !== "object" || !KINDS.some((k) => k.v === v.effect)) throw new Error(`"effect" must be one of ${KINDS.map((k) => k.v).join(", ")}`);
              onChange(v);
              setJson(undefined);
              setJsonErr(undefined);
            } catch (err) { setJsonErr(String(err instanceof Error ? err.message : err)); }
          }}>Apply JSON</button>
          <button onClick={() => { setJson(undefined); setJsonErr(undefined); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="effect-form">
      <label className="ed-row" title={KINDS.find((k) => k.v === e.effect)?.help}>
        <span>Kind</span>
        <select value={e.effect} onChange={(ev) => onChange(blankEffect(ev.target.value as Effect["effect"]))}>
          {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
        </select>
        {types && (
          <select value={String(e.type ?? "")} title="How the amount works" onChange={(ev) => set({ type: ev.target.value })}>
            {types.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        )}
      </label>
      {attrs.length > 0 && (
        <div className="ed-row ed-chips" title="What it affects (several allowed)">
          <span>What</span>
          {attrs.map((a) => {
            const on = (e.attributes ?? []).includes(a as never);
            return <button key={a} className={`ed-chip ${on ? "on" : ""}`} onClick={() => set({ attributes: on ? (e.attributes ?? []).filter((x) => x !== a) : [...(e.attributes ?? []), a] })}>{a}</button>;
          })}
        </div>
      )}
      <div className="ed-grid">
        {hasLevel && <NumField label="Level" value={e.level} onChange={(v) => set({ level: v })} />}
        {hasAmount && <NumField label="Amount" value={e.amount} help={amountHelp} step={0.1} onChange={(v) => set({ amount: v })} />}
        {e.effect === "damage" && e.type === "random" && (
          <>
            <NumField label="From" value={e.amountrange?.[0]} onChange={(v) => set({ amountrange: [v ?? 0, e.amountrange?.[1] ?? v ?? 0] })} />
            <NumField label="To" value={e.amountrange?.[1]} onChange={(v) => set({ amountrange: [e.amountrange?.[0] ?? 0, v ?? 0] })} />
          </>
        )}
        <NumField label="Chance %" value={e.chance} help="Blank = always" onChange={(v) => set({ chance: v })} />
        <NumField label="Duration s" value={e.duration} help="Blank = for the whole battle (or instant)" onChange={(v) => set({ duration: v })} />
        {(e.effect === "damage" || e.effect === "recharge") && <NumField label="Times" value={e.repeat} help="Repeat the hit (blank = once)" onChange={(v) => set({ repeat: v })} />}
        {e.effect === "recharge" && <NumField label="Every s" value={e.interval} help="Heal over time: every N seconds for the duration" onChange={(v) => set({ interval: v })} />}
        {e.effect === "damage" && e.type !== "time" && (
          <label className="check-row"><input type="checkbox" checked={!!e.defbypass} onChange={(ev) => set({ defbypass: ev.target.checked || undefined })} />Ignores DEF</label>
        )}
        {e.effect === "damage" && (FEATURES.grandParty || e.leader) && (
          <label className="check-row" title="Damage based on the Grand Party leader's ATK (bursts)"><input type="checkbox" checked={!!e.leader} onChange={(ev) => set({ leader: ev.target.checked || undefined })} />Leader's ATK</label>
        )}
      </div>
      <div className="ed-row ed-chips" title="Who it lands on: a side, or types / classes / styles (any of them). Tags go in the box.">
        <span>Targets</span>
        {TARGETS.map((t) => {
          const on = (tg.targets ?? []).includes(t as never);
          return <button key={t} className={`ed-chip ${on ? "on" : ""}`} onClick={() => setT({ targets: on ? tg.targets.filter((x) => x !== t) : [...(tg.targets ?? []), t] })}>{t}</button>;
        })}
        <input
          className="name-input"
          list="rule-tags"
          placeholder="+ tag, e.g. [Straw Hat Pirates]"
          onKeyDown={(ev) => {
            const v = ev.currentTarget.value.trim();
            if (ev.key !== "Enter" || !v) return;
            setT({ targets: [...(tg.targets ?? []), (v.startsWith("[") ? v : `[${v}]`) as never] });
            ev.currentTarget.value = "";
          }}
        />
        {(tg.targets ?? []).filter((t) => !TARGETS.includes(t)).map((t) => (
          <button key={t} className="ed-chip on" title="Remove" onClick={() => setT({ targets: tg.targets.filter((x) => x !== t) })}>{t} ×</button>
        ))}
      </div>
      <div className="ed-grid">
        <NumField label="How many" value={tg.count} help="Blank = all of them" onChange={(v) => setT({ count: v })} />
        <label className="ed-row">
          <span>Pick by</span>
          <select value={String(tg.priority ?? "")} onChange={(ev) => setT({ priority: ev.target.value || undefined, stat: ev.target.value ? tg.stat ?? "ATK" : undefined })}>
            <option value="">random / all</option>
            <option value="highest">highest</option>
            <option value="lowest">lowest</option>
            <option value="above">above %</option>
            <option value="below">below %</option>
          </select>
          {tg.priority && (
            <select value={String(tg.stat ?? "ATK")} onChange={(ev) => setT({ stat: ev.target.value })}>
              {PRIORITY_STATS.map((s) => <option key={s}>{s}</option>)}
            </select>
          )}
        </label>
        {(tg.priority === "above" || tg.priority === "below") && <NumField label="%" value={tg.percentage as number | undefined} onChange={(v) => setT({ percentage: v })} />}
        <label className="ed-row" title="Area around the special's target (blank = no range: every target named)">
          <span>Range</span>
          <select value={e.range ? `${e.range.direction}:${e.range.size}` : ""} onChange={(ev) => {
            const [direction, size] = ev.target.value.split(":");
            set({ range: ev.target.value ? { direction, size } : undefined });
          }}>
            <option value="">none</option>
            {["radial", "forward", "sideways"].flatMap((d) => ["small", "medium", "large"].map((s) => <option key={`${d}:${s}`} value={`${d}:${s}`}>{d} {s}</option>))}
          </select>
        </label>
      </div>
      <label className="ed-row" title="When the effect works (more kinds: edit the JSON)">
        <span>When</span>
        <select value={cp.i} onChange={(ev) => { const c = CONDITIONS[Number(ev.target.value)]; if (c) set({ condition: c.make(c.n ?? 0) }); }}>
          {cp.i < 0 && <option value={-1}>(custom, see JSON)</option>}
          {CONDITIONS.map((c, i) => <option key={c.label} value={i}>{c.label}</option>)}
        </select>
        {cp.i > 0 && CONDITIONS[cp.i]!.n !== undefined && (
          <input type="number" className="num-input sm" value={cp.n ?? 0} onChange={(ev) => set({ condition: CONDITIONS[cp.i]!.make(Number(ev.target.value) || 0) })} />
        )}
        {cp.i > 0 && CONDITIONS[cp.i]!.unit}
      </label>
      <button className="link small" title="Edit every field of this effect as JSON (the database's structure)" onClick={() => setJson(JSON.stringify(effect, null, 2))}>Edit as JSON</button>
    </div>
  );
}

function NumField(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; help?: string; step?: number }) {
  return (
    <label className="ed-row" title={props.help}>
      <span>{props.label}</span>
      <input type="number" className="num-input sm" step={props.step ?? 1} value={props.value ?? ""} placeholder="—" onChange={(e) => props.onChange(num(e.target.value))} />
    </label>
  );
}
