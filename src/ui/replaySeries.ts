import type { BattleEvent, Frame, UnitSnapshot } from "../engine/types";

/**
 * Series for the replay's small graphs (HP over time, a stat's buff level over time), built once from the recorded
 * frames and cut at the replay time on each render. Values only change at events, so each series keeps just the
 * points where its value changes (drawn as steps): a few dozen points instead of a frame every 0.1 s.
 */

export interface StepPoint { t: number; v: number }
/** A stretch of time the value exists (a unit on the field or Forced Out; not while benched or after its KO). */
export interface Segment { points: StepPoint[]; /** last frame time in the stretch */ end: number }

/** Change points of `value` per unit over the frames; undefined = no value then (breaks the line). */
function stepSegments(frames: Frame[], uid: string, value: (f: Frame) => number | undefined): Segment[] {
  const segs: Segment[] = [];
  let cur: Segment | undefined;
  for (const f of frames) {
    const v = value(f);
    if (v === undefined) {
      cur = undefined;
      continue;
    }
    if (!cur) {
      cur = { points: [{ t: f.t, v }], end: f.t };
      segs.push(cur);
    } else if (cur.points.at(-1)!.v !== v) cur.points.push({ t: f.t, v });
    cur.end = f.t;
  }
  return segs;
}

export interface HpTrack {
  uid: string;
  /** HP (absolute) while on the field or Forced Out. */
  segs: Segment[];
  /** HP as % of max HP at that moment. */
  pctSegs: Segment[];
  /** Battle time of the KO, if any. */
  ko?: number;
}

/** Every unit's HP over the battle (and when it was KO'd: from the "ko" events, else the first frame it is down). */
export function hpTracks(frames: Frame[], events: BattleEvent[]): HpTrack[] {
  const uids = frames[0]?.units.map((u) => u.uid) ?? [];
  const koAt = new Map<string, number>();
  for (const e of events) if (e.kind === "ko" && e.target && !koAt.has(e.target)) koAt.set(e.target, e.t);
  return uids.map((uid) => {
    const unit = (f: Frame) => f.units.find((u) => u.uid === uid);
    const live = (f: Frame) => {
      const u = unit(f);
      return u && u.state !== "bench" && u.state !== "dead" ? u : undefined;
    };
    const segs = stepSegments(frames, uid, (f) => live(f)?.hp);
    const pctSegs = stepSegments(frames, uid, (f) => {
      const u = live(f);
      return u && u.maxHp > 0 ? (100 * u.hp) / u.maxHp : undefined;
    });
    let ko = koAt.get(uid);
    if (ko === undefined) ko = frames.find((f) => unit(f)?.state === "dead")?.t;
    // the line drops to 0 at the KO (frames may only catch the unit already down)
    if (ko !== undefined) for (const s of [segs.at(-1), pctSegs.at(-1)]) if (s && s.points.at(-1)!.v !== 0) { s.points.push({ t: ko, v: 0 }); s.end = ko; }
    return { uid, segs, pctSegs, ko };
  });
}

/** What the stat graph can show over time. */
export type Metric = "hp" | "atk" | "def" | "spd" | "rcv" | "ct" | "shield";

/** One unit's line on the stat graph (`ko` = battle time of its KO, for the cross). */
export interface Track { uid: string; segs: Segment[]; ko?: number }

/** A unit's value of `m` in a frame: its live stat, special charge in % (none without a special), Shield points. */
function metricValue(u: UnitSnapshot, m: Exclude<Metric, "hp">): number | undefined {
  if (m === "ct") return u.ctMax > 0 && Number.isFinite(u.ctMax) ? Math.min(100, Math.round((100 * u.ct) / u.ctMax)) : undefined;
  if (m === "shield") return u.shield;
  return u.stats?.[m];
}

/** Every unit's line for a stat (ATK / DEF / SPD / RCV, special charge %, Shield), while on the field or Forced Out. */
export function metricTracks(frames: Frame[], hp: HpTrack[], m: Exclude<Metric, "hp">): Track[] {
  return hp.map(({ uid, ko }) => ({
    uid, ko,
    segs: stepSegments(frames, uid, (f) => {
      const u = f.units.find((x) => x.uid === uid);
      return u && u.state !== "bench" && u.state !== "dead" ? metricValue(u, m) : undefined;
    }),
  }));
}

/** Which of the stat graph's metrics the frames carry (HP, special charge and Shield always; the stats when recorded). */
export function metricsIn(frames: Frame[]): Metric[] {
  const stats = frames.some((f) => f.units.some((u) => u.stats));
  return ["hp", ...(stats ? (["atk", "def", "spd", "rcv"] as const) : []), "ct", "shield"];
}

/** A unit's HP, special charge (%) or Shield over the battle (missing while benched, KO'd or without a special). */
export type BarMetric = "hp" | "ct" | "shield";
export function barSeries(frames: Frame[], uid: string, m: BarMetric): Segment[] {
  let wasDead = false;
  return stepSegments(frames, uid, (f) => {
    const u = f.units.find((x) => x.uid === uid);
    const dead = u?.state === "dead", justKOd = dead && !wasDead;
    wasDead = dead;
    // HP drops to 0 at the KO (then stops), so a KO'd unit's graph ends where it went down
    if (justKOd && m === "hp") return 0;
    if (!u || u.state === "bench" || dead) return undefined;
    return m === "hp" ? u.hp : metricValue(u, m);
  });
}

/** A unit's buff / debuff level on one stat over the battle (0 when it has none; missing while benched). */
export function levelSeries(frames: Frame[], uid: string, stat: string): Segment[] {
  return stepSegments(frames, uid, (f) => {
    const u = f.units.find((x) => x.uid === uid);
    return u && u.state !== "bench" ? u.buffs[stat] ?? 0 : undefined;
  });
}

/** The segments up to time t: points after t dropped, each stretch held to min(t, its end). */
export function cutSegments(segs: Segment[], t: number): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    if (s.points[0]!.t > t + 1e-9) break;
    const points = s.points.filter((p) => p.t <= t + 1e-9);
    out.push({ points, end: Math.min(t, s.end) });
  }
  return out;
}

/** SVG path of step segments, with x / y mapping time / value to pixels. */
export function stepPath(segs: Segment[], x: (t: number) => number, y: (v: number) => number): string {
  let d = "";
  for (const s of segs) {
    s.points.forEach((p, i) => {
      if (i === 0) d += `M${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      else d += `H${x(p.t).toFixed(1)}V${y(p.v).toFixed(1)}`;
    });
    d += `H${x(s.end).toFixed(1)}`;
  }
  return d;
}

/** Round axis ticks from 0 to max: about `n` of them at 1 / 2 / 5 x 10^k steps. */
export function niceTicks(max: number, n = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** The marks within `radius` of time p on a timeline, in time order. */
export function eventsNear<E extends { t: number }>(list: E[], p: number, radius: number): E[] {
  return list.filter((e) => Math.abs(e.t - p) <= radius + 1e-9).sort((a, b) => a.t - b.t);
}
