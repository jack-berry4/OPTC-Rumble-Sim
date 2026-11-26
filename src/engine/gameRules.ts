/**
 * The regular Pirate Rumble rules from the game's data (public/game/rumble-rules.json, scripts/db/assault.py): every
 * stage of every Rumble event with its dates and rules. The app uses the stage in effect today by default
 * (user, 2026-11-22), and any stage's rules can be loaded as a set.
 *
 * Game rule data -> GlobalRule: RuleEffect::Attack / Defense / Health / Speed / Restoration / SkillSpeed values are
 * levels times the game's per-level amounts (ATK 75, DEF 25, HP 250, SPD 5, RCV 50, Special CT 3 %); targets are types
 * (`trademarks`), classes (`character_types`) or tags (`character_tags`). A tag's "damage dealt x1.2 / taken -20%" pair
 * is one "both" rule. The last-30-s pair (Special CT +30, DEF -150) is the app's built-in game rule.
 */
import { gameRule, type GlobalRule } from "./rules";

export interface GameStage { id: number; arena: number; title: string; kind: string; num: number; start: number; end: number; text: string; rules: GameRule[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameRule = Record<string, any>;
export interface RumbleRulesFile { tags: Record<string, string | null>; stages: GameStage[] }

let cache: Promise<RumbleRulesFile> | undefined;
export const loadRumbleRules = (): Promise<RumbleRulesFile> =>
  (cache ??= fetch("game/rumble-rules.json").then((r) => { if (!r.ok) throw new Error(`rumble-rules.json: ${r.status}`); return r.json() as Promise<RumbleRulesFile>; }));

const COLOR_IDS: Record<number, string> = { 1: "STR", 2: "DEX", 3: "QCK", 4: "PSY", 5: "INT" };
const CLASS_IDS: Record<number, string> = { 1: "Fighter", 2: "Slasher", 3: "Striker", 4: "Shooter", 5: "Free Spirit", 6: "Driven", 7: "Cerebral", 8: "Powerhouse" };
const STAT: Record<string, [string, number]> = {
  Attack: ["ATK", 75], Defense: ["DEF", 25], Health: ["HP", 250], Speed: ["SPD", 5], Restoration: ["RCV", 50], SkillSpeed: ["Special CT", 3],
};

/** The stage in effect at a time (seconds), else the latest that started before it. */
export function stageAt(file: RumbleRulesFile, t = Date.now() / 1000): GameStage | undefined {
  const now = file.stages.filter((s) => s.start <= t && t <= s.end);
  if (now.length) return now.sort((a, b) => b.start - a.start || b.id - a.id)[0];
  return file.stages.filter((s) => s.start <= t).sort((a, b) => b.start - a.start || b.id - a.id)[0];
}

export const stageLabel = (s: GameStage) => {
  const d = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${s.title} · ${s.kind}${s.kind === "Qualifying" ? ` ${s.num}` : ""} (${d(s.start)} – ${d(s.end)})`;
};

/** A stage's rules as the app's global rules (`notes`: parts that couldn't be read). */
export function stageRules(file: RumbleRulesFile, st: GameStage): { rules: GlobalRule[]; notes: string[] } {
  const rules: GlobalRule[] = [], notes: string[] = [];
  // the last-30-s parts: the built-in rule when they are exactly its pair, else ordinary timed rules
  const last30: GlobalRule[] = [];
  const targets = (t: GameRule | undefined): GlobalRule["target"][] => {
    if (!t) return [{ by: "all", value: "" }];
    const out: GlobalRule["target"][] = [];
    for (const c of (t.trademarks as number[] | undefined) ?? []) out.push({ by: "color", value: COLOR_IDS[c] ?? String(c) });
    for (const c of (t.character_types as number[] | undefined) ?? []) out.push({ by: "class", value: CLASS_IDS[c] ?? String(c) });
    const tags = ((t.character_tags as number[] | undefined) ?? []).map((x) => file.tags[String(x)]).filter((x): x is string => !!x);
    if (tags.length) out.push({ by: "tag", value: tags[0]!, ...(tags.length > 1 ? { also: tags.slice(1) } : {}) });
    return out.length ? out : [{ by: "all", value: "" }];
  };
  const tagPct: Map<string, { dealt?: number; taken?: number; target: GlobalRule["target"] }> = new Map();
  for (const d of st.rules) {
    const name = String(d.effect?.name ?? "");
    const tr = d.trigger ?? {};
    const lastSeconds = tr.type === 2 && tr.value_less_than_or_equal_to != null ? Number(tr.value_less_than_or_equal_to) : undefined;
    if (tr.type !== 0 && lastSeconds === undefined) { notes.push(`rule with trigger ${JSON.stringify(tr)}`); continue; }
    const stat = STAT[name.replace("RuleEffect::", "").replace("ArenaEffect::", "")];
    if (stat) {
      const level = Math.round(Number(d.effect.value) / stat[1]);
      const list = lastSeconds === 30 ? last30 : rules;
      for (const target of targets(d.target)) list.push({ enabled: true, side: "both", target, effect: { kind: "buff", attr: stat[0], level }, ...(lastSeconds !== undefined ? { lastSeconds } : {}) });
      continue;
    }
    if (name === "RuleEffect::Ability") {
      const e = d.ability?.data_json?.data?.[0]?.effect ?? {};
      const an = String(e.name ?? "");
      for (const target of targets(d.target)) {
        const key = JSON.stringify(target);
        const cur = tagPct.get(key) ?? { target };
        if (an.endsWith("DamageEnhancement")) cur.dealt = Math.round((Number(e.coefficient) - 1) * 100);
        else if (an.endsWith("DamageReduction")) cur.taken = Math.round(Number(e.coefficient) * 100);
        else { notes.push(`rule ability ${an}`); continue; }
        tagPct.set(key, cur);
      }
      continue;
    }
    notes.push(`rule ${name}`);
  }
  for (const { dealt, taken, target } of tagPct.values()) {
    if (dealt !== undefined && dealt === taken) rules.push({ enabled: true, side: "both", target, effect: { kind: "both", percent: dealt } });
    else {
      if (dealt) rules.push({ enabled: true, side: "both", target, effect: { kind: "damage", percent: dealt } });
      if (taken) rules.push({ enabled: true, side: "both", target, effect: { kind: "taken", percent: -taken } });
    }
  }
  const builtIn = last30.length === 2 && last30.every((r) => r.target.by === "all" && r.effect.kind === "buff")
    && last30.some((r) => r.effect.kind === "buff" && r.effect.attr === "Special CT" && r.effect.level === 10)
    && last30.some((r) => r.effect.kind === "buff" && r.effect.attr === "DEF" && r.effect.level === -6);
  if (builtIn) rules.push(gameRule("last30"));
  else rules.push(...last30);
  return { rules: rules.map((r) => ({ ...r, source: `stage:${st.id}` })), notes };
}
