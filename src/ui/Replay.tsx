import { statUp } from "../engine/stats";
import { useEffect, useMemo, useRef, useState } from "react";
import type { UnitDb } from "../data/unitDb";
import { BATTLE_LENGTH } from "../sim/battle";
import { shortName } from "../engine/team";
import type { Frame, UnitSnapshot } from "../engine/types";
import type { SimResult as BattleResult } from "../sim/types";
import { BuffTable, HealthPanel, StatsTable, type UnitInfo } from "./Tracker";
import { AttackStrip, BindLock, GroundShadow, Hud, LineupStrip, NextStrip, benchSlotsAt, gaugeHalf, gaugeLeft, isBound, lineupAt, UnitGauges } from "./GameHud";
import { PANEL_H, PANEL_W, StatusPanel, badgesFor } from "./StatusPanel";
import { StatusIconsContext } from "./statusIcons";
import { DamageNumbers, NUM_DUR, type FloatNum } from "./DamageNumbers";
import { EventFeed, FieldEventMarks, keyEvents } from "./FieldEvents";
import { BattleEndOverlay, END_DUR } from "./BattleEnd";
import { type Hold, buildHolds, CUT, RUN_OFF, runOffX, CutInOverlay, holdLabel, partsLanded, pauseClock, RumbleOutBanner, runInX, teamsLeft } from "./CutIns";
import { SvgThumb } from "./UnitThumb";
import { UnitCard } from "./UnitCard";
import { FieldBackdrop, GROUND_DY } from "./FieldBackdrop";
import { useFieldCamera, type Rect } from "./fieldCamera";
import { ReplaySettings } from "./ReplaySettings";
import { Minimap } from "./Minimap";
import { EventLog, Section, SIDE_KEYS, SidePanel, toggleSide, type LogLevel, type SideKey } from "./ReplayPanels";
import { BuffPopup, InspectContext, useInspectState } from "./BuffPopup";
import { GRAPH_H, StatGraph } from "./StatGraph";
import { hpTracks, metricsIn, type BarMetric, type Metric } from "./replaySeries";
import { usePersistedChoice, usePersistedFlag, usePersistedNumber } from "./persist";
import { TimelineBar } from "./TimelineBar";

// Game pixels at battle start (a 1080x1920 recording; the game shows x 108-972, y 310-1000 there). Tile positions
// (HP bars) run x 40-1040, y 575-900; feet are GROUND_DY lower.
const VIEW = { x: 40, y: 330, w: 1000, h: 740 };
const TILES_KEY = "rumble-sim-show-tiles";
const STILL_KEY = "rumble-sim-still-crowd";
const FX_KEY = "rumble-sim-key-event-fx";
const QUEUE_KEY = "rumble-sim-next-queue";
const NUMS_KEY = "rumble-sim-damage-numbers";
const TIME_MODE_KEY = "rumble-sim-time-with-pauses";
const TIMER_UP_KEY = "rumble-sim-timer-up";
const TIMER_TENTHS_KEY = "rumble-sim-timer-tenths";
/** The stat graph section (open or not: the old HP graph's key), HP or %, which stat, its height. */
const HP_GRAPH_KEY = "rumble-sim-hp-graph";
const HP_GRAPH_PCT_KEY = "rumble-sim-hp-graph-pct";
const GRAPH_METRIC_KEY = "rumble-sim-graph-metric";
const GRAPH_H_KEY = "rumble-sim-graph-height";
/** The other sections below the field: open or not. */
const SECTION_KEYS = {
  hp: "rumble-sim-section-hp", stats: "rumble-sim-section-stats", buffs: "rumble-sim-section-buffs", log: "rumble-sim-section-log",
};
const LINEUP_KEY = "rumble-sim-lineups";
const BENCH_KEY = "rumble-sim-benches";
const METRICS: Metric[] = ["hp", "atk", "def", "spd", "rcv", "ct", "shield"];

/**
 * The time bar's track: played part in the accent color, the rest grey; with pauses on, each pause's stretch in its
 * kind's color (PAUSE_COLOR), dimmed until played.
 */
function timelineBackground(holds: Hold[], clock: ReturnType<typeof pauseClock>, total: number, pos: number, pauseOn: boolean): string {
  const pct = (v: number) => `${((100 * v) / Math.max(1e-9, total)).toFixed(3)}%`;
  const played = "var(--timeline-played)", rest = "var(--timeline-rest)";
  const stops: string[] = [];
  let at = 0;
  const run = (from: number, to: number, a: string, b: string) => {
    // [from, to) coloured a where played (before pos), b after
    if (to <= from) return;
    const cut = Math.max(from, Math.min(to, pos));
    if (cut > from) stops.push(`${a} ${pct(from)} ${pct(cut)}`);
    if (to > cut) stops.push(`${b} ${pct(cut)} ${pct(to)}`);
  };
  if (pauseOn) {
    holds.forEach((h, i) => {
      const start = clock.now(h.t, i, 0);
      run(at, start, played, rest);
      const c = PAUSE_COLOR[h.kind];
      run(start, start + h.dur, c, `color-mix(in srgb, ${c} 38%, var(--timeline-rest))`);
      at = start + h.dur;
    });
  }
  run(at, total, played, rest);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
const PANEL_KEY = "rumble-sim-status-panels";
const STATUS_ICONS_KEY = "rumble-sim-status-icons";
const PAUSE_KEY = "rumble-sim-pause-cut-ins";
const PAUSE_SPECIALS_KEY = "rumble-sim-pause-specials";
const PAUSE_RUMBLE_KEY = "rumble-sim-pause-rumble-ins";
const PAUSE_END_KEY = "rumble-sim-pause-ending";
const TILE_OPACITY_KEY = "rumble-sim-tile-opacity";
const BLANK_KEY = "rumble-sim-blank-field";
/** What a unit is receiving now (the flash / ring), 0-1 through it. */
type Receiving = Map<string, { kind: "up" | "down" | "hit"; p: number }>;
/** The shake a hit gives a unit's card. */
const hitShake = (p: number) => Math.sin(p * Math.PI * 6) * 5 * (1 - p);
const SIDE_KEY = "rumble-sim-side-panels-2"; // "-2": HP became the default (2026-11-18); older saved picks start over

/** Which panels the sidebar shows, remembered in this browser (default: HP). */
function loadSide(): SideKey[] {
  try {
    const v = localStorage.getItem(SIDE_KEY);
    if (v !== null) return v.split(",").filter((x): x is SideKey => (SIDE_KEYS as string[]).includes(x));
  } catch {
    /* storage unavailable */
  }
  return ["hp"];
}
const PAUSE_SPECIAL_HELP = "Stop the battle clock while each special plays, part by part, as in the game.";
const PAUSE_RUMBLE_HELP = "Stop the battle clock while a unit rumbles in: from the bench, or back from Forced Out.";
const PAUSE_END_HELP = "Play BATTLE OVER!!, WIN!! / LOSE... and a result card at the end. Off: a short banner.";
/** Each kind of pause's color: its checkbox, its stretches on the time bar, the time readout while it plays. */
const PAUSE_COLOR: Record<Hold["kind"], string> = { special: "var(--pause-special)", enter: "var(--pause-rumble)", end: "var(--pause-end)" };

/** How far the camera may go: the drawn field (public/game-art, scripts/build_field_art.py WORLD). */
const FIELD_ART: Rect = { x: 0, y: 300, w: 1080, h: 780 };
/** Closest zoom: this many game px across. */
const MIN_VIEW_W = 420;

const LOG_LEVEL_KEY = "rumble-sim-log-level";
/** Key events: specials, KOs, entries, statuses and other turning points. */
const KEY_KINDS = new Set(["special", "burst", "effect", "ko", "enter", "paralyzed", "interrupt", "end", "miss"]);
function loadLogLevel(): LogLevel {
  try {
    const v = localStorage.getItem(LOG_LEVEL_KEY);
    if (v === "key" || v === "actions" || v === "detailed") return v;
  } catch {
    /* storage unavailable */
  }
  return "key";
}
/** Sizes in game pixels at battle-start zoom (MEASURED, run 1): HP bar 80 x 18 with its frame (70 x 12 inside),
 *  ground circle ~88 x 36. The portrait stands in for the character, filling the space from the circle up to the
 *  gauges as a sprite does. */
const THUMB = 116;
/** Seconds a regular hit flashes its target (about as long as the damage number pops). */
const HIT_FLASH = 0.45;
/** The unit card keeps the old height (THUMB: bars to ground circle, as in the game): a smaller square portrait on top,
 *  the status panel (4 rows) under it. */
const PORTRAIT = THUMB - PANEL_H - 4;
/** Portrait top within the card (from the card's top): under the gauges with the status panel, in the middle without. */
const portraitY = (panel: boolean) => (panel ? 2 : (THUMB - PORTRAIT) / 2);
const BAR = { w: 80, h: 18, inW: 70, inH: 12 };
const CIRCLE = { rx: 44, ry: 18 };

/**
 * Units Forced Out right now, under the benches (screen HUD): yours top left, filling in from the left; the enemy's top
 * right, filling in from the right. Each shows as its field card (gauges, shield, portrait, status panel) with the
 * seconds until it comes back. Forced-out units are not drawn on the field.
 */
function ForcedOutCards(props: { frame: Frame; info: Map<string, UnitInfo>; width: number; panels: boolean }) {
  const out = props.frame.units.filter((u) => u.state === "forced");
  if (!out.length) return null;
  const y0 = 122;
  const card = (u: UnitSnapshot, cx: number) => {
    const i = props.info.get(u.uid)!;
    const cy = y0 + 26;
    const top = GROUND_DY - 4 - THUMB;
    const hasSp = u.ctMax > 0 && Number.isFinite(u.ctMax);
    return (
      <g key={u.uid} transform={`translate(${cx},${cy})`}>
        <SvgThumb id={i.unitId} size={PORTRAIT} x={-PORTRAIT / 2} y={top + portraitY(props.panels)} />
        <rect x={-PORTRAIT / 2} y={top + portraitY(props.panels)} width={PORTRAIT} height={PORTRAIT} rx={5} className={`thumb-frame thumb-frame-${i.side}`} />
        {props.panels && <StatusPanel badges={badgesFor(u)} x={-PANEL_W / 2} y={top + PORTRAIT + 4} side={i.side} uid={u.uid} />}
        <UnitGauges side={i.side} hpFrac={u.maxHp > 0 ? u.hp / u.maxHp : 0} spFrac={hasSp ? Math.min(1, u.ct / u.ctMax) : undefined} spReady={hasSp && u.ct >= u.ctMax} shieldFrac={u.maxHp > 0 ? u.shield / u.maxHp : 0} />
        <text x={BAR.w / 2 + 4} y={7} className="unit-label unit-label-side">{i.tag}</text>
        {u.outFor !== undefined && <text y={GROUND_DY + 14} className="forced-out-secs-svg">back in {u.outFor.toFixed(1)}s</text>}
      </g>
    );
  };
  const pitch = PANEL_W + 16;
  const mine = out.filter((u) => props.info.get(u.uid)?.side === "atk");
  const theirs = out.filter((u) => props.info.get(u.uid)?.side === "def");
  // the tag sits right of the gauges, so the enemy's first card keeps room for it at the right edge
  const right = props.width - 12 - PANEL_W / 2 - 22;
  return (
    <g className="forced-out" pointerEvents="none">
      {mine.length > 0 && <text x={10} y={y0} className="forced-out-head">FORCED OUT</text>}
      {mine.map((u, n) => card(u, 12 + PANEL_W / 2 + n * pitch))}
      {theirs.length > 0 && <text x={props.width - 10} y={y0} className="forced-out-head" textAnchor="end">FORCED OUT</text>}
      {theirs.map((u, n) => card(u, right - n * pitch))}
    </g>
  );
}

/**
 * A special's effect on the units `el` seconds into its pause: each landed part's HP, Shield and KOs; a unit it
 * Forced Out runs off to its own side (RUN_OFF s), then shows with the forced-out cards (seconds left from `post`).
 */
function applySpecialParts(units: UnitSnapshot[], h: Hold, el: number, post: Frame | undefined, info: Map<string, UnitInfo>): UnitSnapshot[] {
  const n = partsLanded(h, el);
  const hp = new Map<string, number>(), dead = new Set<string>(), shield = new Map<string, number>(), runOff = new Map<string, number>();
  for (let k = 0; k < n; k++) {
    for (const [uid, v] of Object.entries(h.partHp?.[k] ?? {})) hp.set(uid, v);
    for (const [uid, v] of Object.entries(h.partShield?.[k] ?? {})) shield.set(uid, v);
    for (const uid of h.partKos?.[k] ?? []) dead.add(uid);
  }
  (h.partOut ?? []).forEach((list, k) => {
    const p = (el - (CUT.intro + k * CUT.part + CUT.hit)) / RUN_OFF;
    if (p > 0) for (const uid of list) runOff.set(uid, p);
  });
  return units.map((u) => ({
    ...u,
    ...(hp.has(u.uid) ? { hp: hp.get(u.uid)! } : {}),
    ...(shield.has(u.uid) ? { shield: shield.get(u.uid)! } : {}),
    ...(dead.has(u.uid) ? { state: "dead" as const } : {}),
    ...(runOff.has(u.uid)
      ? runOff.get(u.uid)! >= 1
        ? { state: "forced" as const, outFor: post?.units.find((x) => x.uid === u.uid)?.outFor, targetUid: undefined }
        : { x: runOffX(u.x, info.get(u.uid)?.side ?? "atk", runOff.get(u.uid)!), targetUid: undefined }
      : {}),
  }));
}

export function Replay(props: { result: BattleResult; db: UnitDb }) {
  const { result } = props;
  const frames = result.frames;
  // the battle's end: its last frame, or the end time when that comes after it (frames are taken every so often; a
  // special at the very end would otherwise never be reached, nor the battle-over sequence after it)
  const end = Math.max(frames.at(-1)?.t ?? 0, result.gameTime ? 0 : result.time);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Unit under the mouse on the field: drawn again on top of everything. */
  const [hoverUid, setHoverUid] = useState<string>();
  const [speed, setSpeed] = useState(2);
  const [logFilter, setLogFilter] = useState<LogLevel>(loadLogLevel);
  const [showTiles, setShowTiles] = usePersistedFlag(TILES_KEY, true);
  const [stillCrowd, setStillCrowd] = usePersistedFlag(STILL_KEY, false);
  const [tileOpacity, setTileOpacity] = usePersistedNumber(TILE_OPACITY_KEY, 1);
  const [blankField, setBlankField] = usePersistedFlag(BLANK_KEY, false);
  const [side, setSide] = useState<SideKey[]>(loadSide);
  useEffect(() => {
    try {
      localStorage.setItem(SIDE_KEY, side.join(","));
    } catch {
      /* storage unavailable */
    }
  }, [side]);
  const [showFx, setShowFx] = usePersistedFlag(FX_KEY, true);
  const [showQueue, setShowQueue] = usePersistedFlag(QUEUE_KEY, true);
  const [showNums, setShowNums] = usePersistedFlag(NUMS_KEY, true);
  const [showPanels, setShowPanels] = usePersistedFlag(PANEL_KEY, true);
  const [statusIcons, setStatusIcons] = usePersistedFlag(STATUS_ICONS_KEY, false);
  const [showLineups, setShowLineups] = usePersistedFlag(LINEUP_KEY, true);
  /** The unit whose special / ability shows under the lineups (click its portrait; again or ✕ closes). */
  const [cardUid, setCardUid] = useState<string>();
  const pickCard = (uid: string) => setCardUid((c) => (c === uid ? undefined : uid));
  const [showBenches, setShowBenches] = usePersistedFlag(BENCH_KEY, true);
  const [timerUp, setTimerUp] = usePersistedFlag(TIMER_UP_KEY, true);
  const [timerTenths, setTimerTenths] = usePersistedFlag(TIMER_TENTHS_KEY, false);
  // Which pauses play: each can be turned off on its own (the old single switch is the default for all three)
  const [pauseAll] = usePersistedFlag(PAUSE_KEY, true); // (the old single switch; all pauses default on)
  const [pauseSpecials, setPauseSpecials] = usePersistedFlag(PAUSE_SPECIALS_KEY, pauseAll);
  const [pauseRumble, setPauseRumble] = usePersistedFlag(PAUSE_RUMBLE_KEY, pauseAll);
  const [pauseEnd, setPauseEnd] = usePersistedFlag(PAUSE_END_KEY, pauseAll);
  const pauseOn = pauseSpecials || pauseRumble || pauseEnd;
  const [playbackTime, setPlaybackTime] = usePersistedFlag(TIME_MODE_KEY, false);
  const timeMode = playbackTime ? "playback" : "battle";
  const setTimeMode = (m: "battle" | "playback") => setPlaybackTime(m === "playback");
  const raf = useRef<number>(0);
  // HP graph (HP tab and below the field): open or not, HP or % of max, and the unit picked out on it
  const [hpGraphPct, setHpGraphPct] = usePersistedFlag(HP_GRAPH_PCT_KEY, false);
  const [hpLit, setHpLit] = useState<string>();
  const [metricPick, setMetric] = usePersistedChoice<Metric>(GRAPH_METRIC_KEY, METRICS, "hp");
  const [graphH, setGraphH] = usePersistedNumber(GRAPH_H_KEY, GRAPH_H.fallback, GRAPH_H.min, GRAPH_H.max);
  const tracks = useMemo(() => hpTracks(result.frames, result.events), [result]);
  const metrics = useMemo(() => metricsIn(result.frames), [result]);
  const metric = metrics.includes(metricPick) ? metricPick : "hp";
  // the buff breakdown popup (hover a level in the Buffs / Stats tables or a status badge)
  const [inspect, inspectApi] = useInspectState();
  /** Hovering a unit's HP / special / Shield bar on the field opens its graph popup. */
  const gaugeHover = (uid: string) => (metric: BarMetric) => ({
    onMouseEnter: (e: React.MouseEvent<Element>) => inspectApi.open({ uid, kind: "track", metric }, e.currentTarget),
    onMouseLeave: () => inspectApi.close(),
  });

  // Pauses (cut-ins) at specials and rumble-ins: battle time stands still while `hold` plays.
  // ... and at the end, the battle-over sequence
  const holds = useMemo(
    () => [...buildHolds(result.events), { kind: "end" as const, t: end, dur: END_DUR, uids: [] }]
      .filter((h) => (h.kind === "special" ? pauseSpecials : h.kind === "enter" ? pauseRumble : pauseEnd)),
    [result, end, pauseSpecials, pauseRumble, pauseEnd],
  );
  const [hold, setHold] = useState<{ i: number; el: number } | null>(null);
  const tRef = useRef(0);
  const holdRef = useRef<{ i: number; el: number } | null>(null);
  const nextHold = useRef(0);
  tRef.current = t;
  holdRef.current = hold;
  /** Jump to battle time v (stops playback); pauses from v on are still to come. */
  const seek = (v: number) => {
    setPlaying(false);
    setHold(null);
    holdRef.current = null;
    nextHold.current = holds.findIndex((h) => h.t >= v - 1e-9);
    if (nextHold.current < 0) nextHold.current = holds.length;
    tRef.current = v;
    setT(v);
  };

  // A new battle starts paused at 0s; press Play to watch it.
  useEffect(() => {
    seek(0);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(LOG_LEVEL_KEY, logFilter);
    } catch {
      /* storage unavailable */
    }
  }, [logFilter]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let d = dt * speed, cur = tRef.current, h = holdRef.current;
      while (d > 1e-9) {
        if (h) {
          const left = holds[h.i]!.dur - h.el;
          if (d < left) { h = { i: h.i, el: h.el + d }; d = 0; } else { d -= left; h = null; }
          continue;
        }
        const nh = pauseOn ? holds[nextHold.current] : undefined;
        if (nh && nh.t <= cur + d) {
          d -= Math.max(0, nh.t - cur);
          cur = Math.max(cur, nh.t);
          h = { i: nextHold.current++, el: 0 };
          continue;
        }
        cur = Math.min(end, cur + d);
        d = 0;
      }
      tRef.current = cur;
      holdRef.current = h;
      setT(cur);
      setHold(h);
      if (cur >= end && !h) setPlaying(false);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, end, pauseOn, holds]);

  // Turning the pauses on or off mid-battle: only pauses still ahead count.
  useEffect(() => {
    if (holdRef.current && !pauseOn) setHold(null);
    const i = holds.findIndex((h) => h.t >= tRef.current - 1e-9);
    nextHold.current = i < 0 ? holds.length : i;
  }, [pauseOn, holds]);
  const activeHold = hold && pauseOn ? holds[hold.i] : undefined;
  // Event graphics run on the timeline with the pauses in it: a KO by a special shows when its part lands.
  const clock = useMemo(() => pauseClock(holds), [holds]);
  const now = pauseOn ? clock.now(t, hold ? hold.i : nextHold.current, hold?.el ?? 0) : t;
  // The ending: seconds into the battle-over sequence (pauses on), undefined for the short one (pauses off), null before
  const endEl: number | null | undefined = activeHold?.kind === "end" ? hold!.el : t >= end - 1e-9 && end > 0 && !activeHold ? (pauseEnd ? END_DUR : undefined) : null;

  const info = useMemo(() => {
    const m = new Map<string, UnitInfo>();
    for (const u of result.units) {
      m.set(u.uid, { uid: u.uid, unitId: u.unitId, name: shortName(u.name), tag: `${u.side === "atk" ? "A" : "D"}${u.slot}`, side: u.side });
    }
    // Grand Party leaders (not on the field): their bursts' cut-ins
    for (const [side, g] of Object.entries(result.gp ?? {})) if (g) m.set(g.leaderUid, { uid: g.leaderUid, unitId: g.unitId, name: g.name, tag: "Leader", side: side as "atk" | "def" });
    return m;
  }, [result]);

  /** Assault Rumble: the boss team's main boss (long gauges with the BOSS label, the BOSS tile in NEXT). */
  const bosses = useMemo(() => new Set(result.units.filter((u) => u.mainBoss).map((u) => u.uid)), [result]);
  const frame = useMemo(() => {
    if (activeHold?.kind === "special") {
      // a special: start from just before it (with any special at the same moment before it played out in full), and
      // apply each part's HP changes, KOs and Forced Outs as that part lands
      const pre = frameAt(frames, activeHold.t - 0.05);
      if (!pre) return pre;
      const post = frameFrom(frames, activeHold.t);
      let units = pre.units;
      const same = holds.filter((h, j) => j < hold!.i && h.kind === "special" && Math.abs(h.t - activeHold.t) < 1e-6);
      for (const h of same) units = applySpecialParts(units, h, Infinity, post, info);
      units = applySpecialParts(units, activeHold, hold!.el, post, info);
      return { ...pre, t, units };
    }
    // just after a special's pause: show the battle as the special left it
    const upTo = hold ? hold.i : nextHold.current;
    // frames are taken every so often: between a played special and the next frame, the last frame is from before it
    const lastFrameT = frameTakenAt(frames, t);
    const afterSpecial = pauseOn && holds.some((h, j) => j < upTo && h.kind === "special" && h.t <= t + 1e-6 && h.t > lastFrameT - 1e-9);
    const f = afterSpecial ? frameFrom(frames, t) : frameAt(frames, t);
    if (!f || activeHold?.kind !== "enter") return f;
    // a rumble-in: the newcomers (placed at this instant) run in from their side of the screen to their tile
    const after = frameAt(frames, activeHold.t + 0.15);
    return {
      ...f,
      units: f.units.map((u) => {
        if (!activeHold.uids.includes(u.uid)) return u;
        const v = after?.units.find((x) => x.uid === u.uid) ?? u;
        const side = info.get(u.uid)?.side ?? "atk";
        return { ...v, x: runInX(v.x, side, hold!.el), targetUid: undefined };
      }),
    };
  }, [frames, t, activeHold, hold, info, pauseOn, holds]);
  const shown = useMemo(() => spreadStacked(frame), [frame]);
  // bench slots: waiting units, and KO'd units greyed out in the first empty slot
  const benchStart = useMemo(() => (frames[0]?.units ?? []).map((u) => ({ uid: u.uid, side: info.get(u.uid)?.side ?? "atk", bench: u.state === "bench" })), [frames, info]);
  const benchSlots = useMemo(() => benchSlotsAt(result.events, benchStart, frame?.clock ?? 0), [result.events, benchStart, frame?.clock]);
  const lineup = useMemo(() => lineupAt(result.events, benchStart, frame?.clock ?? 0), [result.events, benchStart, frame?.clock]);
  const bound = new Set((frame?.units ?? []).filter(isBound).map((u) => u.uid));

  // Damage and heal numbers showing now: regular hits / Counter / DoT / heals by the battle clock, specials part by part.
  const nums = useMemo(() => {
    const out: FloatNum[] = [];
    if (!showNums || !shown) return out;
    const slots = new Map<string, number>();
    const push = (key: string, uid: string, amount: number, heal: boolean, age: number, shield = false) => {
      const slot = slots.get(uid) ?? 0;
      slots.set(uid, slot + 1);
      out.push({ key, uid, amount, heal, age, slot, shield });
    };
    if (activeHold?.kind === "special" && hold) {
      const pre = frameAt(frames, activeHold.t - 0.05);
      const hp = new Map(pre?.units.map((u) => [u.uid, u.hp]) ?? []);
      (activeHold.partHp ?? []).forEach((changed, k) => {
        const age = (hold.el - (CUT.intro + k * CUT.part + CUT.hit)) / NUM_DUR;
        for (const [uid, after] of Object.entries(changed)) {
          const before = hp.get(uid) ?? after;
          hp.set(uid, after);
          if (age >= 0 && age < 1 && Math.abs(before - after) >= 1) push(`sp-${activeHold.t}-${k}-${uid}`, uid, Math.abs(before - after), after > before, age);
        }
        for (const [uid, d] of Object.entries(activeHold.partShieldHit?.[k] ?? {})) {
          if (age >= 0 && age < 1 && d >= 1) push(`sps-${activeHold.t}-${k}-${uid}`, uid, d, false, age, true);
        }
      });
    } else {
      const clock = shown.clock;
      for (const e of result.events) {
        if (e.t > clock) break;
        if (clock - e.t >= NUM_DUR || !e.target || !e.amount) continue;
        const dmg = (e.kind === "hit" && !/special/.test(e.text)) || (e.kind === "effect" && /sends .* back|Damage over Time/.test(e.text));
        const heal = e.kind === "heal" && !/\(special\)/.test(e.text); // a special's heals show with its parts
        if (dmg || heal) push(`${e.t}-${e.kind}-${e.target}-${e.amount}`, e.target, e.amount, heal, (clock - e.t) / NUM_DUR, /\(into Shield\)/.test(e.text));
      }
    }
    return out;
  }, [showNums, shown, activeHold, hold, frames, result.events]);
  const fx = useMemo(() => {
    const list = keyEvents(result.events, (uid, at) => frameAt(frames, Math.max(0, at))?.units.find((u) => u.uid === uid));
    // with pauses on: when each shows on the paused timeline (kept as battle time `bt` for the feed)
    return pauseOn ? list.map((e) => ({ ...e, bt: e.t, t: clock.at(e.t, e.kind === "ko" ? e.uid : undefined) })) : list;
  }, [result, frames, pauseOn, clock]);
  // specials and KOs for the time bar's ticks and hover bubble (on the bar's timeline)
  const timelineMarks = useMemo(() => fx.filter((e) => e.kind !== "enter"), [fx]);
  const lastKo = useMemo(() => {
    const ko = [...fx].reverse().find((e) => e.kind === "ko" && e.t <= now + 1e-9 && now < e.t + 1.8);
    if (!ko) return undefined;
    // teams before this KO: before the moment, minus earlier KOs at that same moment (one special KO-ing several)
    const bt = ko.bt ?? ko.t;
    const before = teamsLeft(frameAt(frames, bt - 0.05), info);
    const after = { ...before };
    for (const e of fx) {
      if (e.kind !== "ko" || (e.bt ?? e.t) !== bt || e.t > ko.t) continue;
      const side = info.get(e.uid)?.side ?? "atk";
      if (e.t < ko.t) before[side]--; // KO'd earlier by the same special
      after[side]--; // this KO and any at the same instant
    }
    return { ko, before, after };
  }, [fx, now, frames, info]);
  // (an Assault Rumble main boss can hold several places: its badge shows the first)
  const queuePos = useMemo(() => {
    const m = new Map<string, number>();
    (frame?.queue ?? []).slice(0, 5).forEach((uid, i) => { if (!m.has(uid)) m.set(uid, i + 1); });
    return m;
  }, [frame]);

  // Camera: drag to pan, wheel to zoom; "Auto camera" keeps every unit in view.
  const [autoCam, setAutoCam] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const fitAll = useMemo((): Rect | null => {
    const entering = activeHold?.kind === "enter" ? activeHold.uids : undefined;
    // a unit Forced Out by a special drops out of the fit once its part lands: the camera lets it run off the screen
    const leaving = new Set<string>();
    if (activeHold?.kind === "special" && hold) {
      (activeHold.partOut ?? []).forEach((list, k) => {
        if (hold.el >= CUT.intro + k * CUT.part + CUT.hit) for (const uid of list) leaving.add(uid);
      });
    }
    const us = shown?.units.filter((u) => (entering ? entering.includes(u.uid) : u.state !== "bench" && u.state !== "dead" && u.state !== "forced" && !leaving.has(u.uid))) ?? [];
    if (!us.length) return null;
    const pad = 30;
    const x0 = Math.min(...us.map((u) => u.x)) - THUMB / 2 - pad, x1 = Math.max(...us.map((u) => u.x)) + THUMB / 2 + pad;
    const y0 = Math.min(...us.map((u) => u.y)) - BAR.h / 2 - 28 - pad, y1 = Math.max(...us.map((u) => u.y)) + GROUND_DY + CIRCLE.ry + pad;
    if (entering) {
      // the game swings the camera to the newcomer's side, zoomed in
      const cx = (x0 + x1) / 2 + (info.get(entering[0]!)?.side === "def" ? 140 : -140), cy = (y0 + y1) / 2;
      return { x: cx - 390, y: cy - 290, w: 780, h: 577 };
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, [shown, activeHold, hold, info]);
  // The minimap shows while you steer the camera and fades 1.5 s after you stop (stays while the mouse is on it).
  const [steering, setSteering] = useState(false);
  const [onMinimap, setOnMinimap] = useState(false);
  const steerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const steered = () => {
    setSteering(true);
    clearTimeout(steerTimer.current);
    steerTimer.current = setTimeout(() => setSteering(false), 1500);
  };
  useEffect(() => () => clearTimeout(steerTimer.current), []);
  /** Every manual camera move (drag, wheel, minimap) turns auto off: that's also the activity that shows the minimap. */
  const setAutoFromCamera = (on: boolean) => {
    setAutoCam(on);
    if (!on) steered();
  };
  const camera = useFieldCamera({ svgRef, home: VIEW, bounds: FIELD_ART, minW: MIN_VIEW_W, target: fitAll, auto: autoCam, setAuto: setAutoFromCamera });
  const cam = camera.cam;

  const visibleEvents = useMemo(
    () => result.events.filter((e) => e.t <= t + 1e-9 && (
      logFilter === "detailed" || (!e.detail && (logFilter === "actions" || KEY_KINDS.has(e.kind))))),
    [result, t, logFilter],
  );

  // The timeline the bar and the step buttons work on: battle time, or with pauses on, battle time plus the pauses
  const total = pauseOn ? clock.total(end) : end;
  const posNow = () => (pauseOn ? clock.now(tRef.current, holdRef.current ? holdRef.current.i : nextHold.current, holdRef.current?.el ?? 0) : tRef.current);
  /** Jump to a point on that timeline (stops playback); with pauses on it can land inside a pause. */
  const seekTo = (p: number) => {
    p = Math.max(0, Math.min(total, p));
    if (!pauseOn) return seek(p);
    const m = clock.toBattle(p);
    setPlaying(false);
    holdRef.current = m.hold;
    setHold(m.hold);
    nextHold.current = m.next;
    tRef.current = Math.min(end, m.t);
    setT(Math.min(end, m.t));
  };
  const jump = (dt: number) => seekTo(posNow() + dt);
  const togglePlay = () => (tRef.current >= end && !holdRef.current ? (seek(0), setPlaying(true)) : setPlaying((p) => !p));

  // Keyboard: Space plays / pauses, arrows step 1 s (not while typing in a field).
  const keys = useRef({ togglePlay, jump });
  keys.current = { togglePlay, jump };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (e.altKey || e.ctrlKey || e.metaKey || el?.closest("input, select, textarea, button, [contenteditable=true]")) return;
      if (e.key === " ") { e.preventDefault(); keys.current.togglePlay(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); keys.current.jump(e.shiftKey ? -0.25 : -1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); keys.current.jump(e.shiftKey ? 0.25 : 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!frame || !shown) return null;
  const statGraph = (height: number | "fill") => (
    <StatGraph frames={frames} hp={tracks} t={t} end={end} info={info} metrics={metrics} metric={metric} onMetric={setMetric}
      pct={hpGraphPct} onPct={setHpGraphPct} highlight={hpLit} onHighlight={setHpLit} height={height} onHeight={setGraphH} />
  );
  const at = <span className="muted">at {t.toFixed(1)}s</span>;
  /** The game hides every HP bar during a rumble-in. */
  const hideBars = activeHold?.kind === "enter";
  const fxShown = pauseRumble ? fx.filter((e) => e.kind !== "enter") : fx;
  // What each unit is receiving right now, and how far through it is (0-1): drawn as a ring / flash. During a special the units the part now playing lands on come over the others (in the usual
  // order), and the caster over everything.
  let raised: string[] = [];
  const receiving: Receiving = new Map();
  if (activeHold?.kind === "special" && hold) {
    const n = activeHold.parts?.length ?? 0;
    const k = hold.el < CUT.intro || !n ? -1 : Math.min(n - 1, Math.floor((hold.el - CUT.intro) / CUT.part));
    raised = [...(k >= 0 ? activeHold.partTargets?.[k] ?? [] : []).filter((x) => x !== activeHold.uids[0]), activeHold.uids[0]!];
    if (k >= 0) {
      const p = Math.min(1, Math.max(0, (hold.el - CUT.intro - k * CUT.part) / CUT.part));
      const kind = activeHold.partKinds?.[k] ?? "up";
      for (const uid of activeHold.partTargets?.[k] ?? []) receiving.set(uid, { kind, p });
    }
  } else {
    // regular hits: a flash on the target while the hit shows (HIT_FLASH s)
    const clock = shown.clock;
    for (const e of result.events) {
      if (e.t > clock) break;
      // regular hits, and damage sent back (Counter / Damage Reflect) or Damage over Time
      const damaging = (e.kind === "hit" && !/special/.test(e.text)) || (e.kind === "effect" && /sends .* back|Damage over Time/.test(e.text));
      if (!damaging || !e.target || !e.amount || clock - e.t > HIT_FLASH) continue;
      receiving.set(e.target, { kind: "hit", p: (clock - e.t) / HIT_FLASH });
    }
  }
  const onFieldNow = (u: UnitSnapshot) => u.state !== "bench" && u.state !== "dead" && u.state !== "forced";
  // The ground under the units: map art and crowd, tiles, then the attack strips (from each attacker to its target).
  const ground = (
    <>
      <rect x={FIELD_ART.x} y={FIELD_ART.y} width={FIELD_ART.w} height={FIELD_ART.h} className="field-bg" />
      <FieldBackdrop showTiles={showTiles} animate={!stillCrowd} tileOpacity={tileOpacity} showArt={!blankField} map={result.mode === "assault" ? "assault" : "plaza"} />
      {shown.units.filter((u) => u.targetUid).map((u) => {
        const tgt = shown.units.find((x) => x.uid === u.targetUid);
        const own = info.get(u.uid)?.side ?? "atk";
        if (!tgt) return null;
        // a Confused attack on a teammate: the strip (and ring) of the other team, pointing at the teammate, as
        // the game draws it [user 2026-11-18]
        const side = info.get(tgt.uid)?.side === own ? (own === "atk" ? "def" : "atk") : own;
        const g = GROUND_DY;
        return (
          <g key={`lane-${u.uid}`}>
            {/* faint while walking up; full once in position, as the game draws its strip */}
            <AttackStrip side={side} x1={u.x} y1={u.y + g} x2={tgt.x} y2={tgt.y + g} engaged={u.engaged} />
            <ellipse cx={tgt.x} cy={tgt.y + g} rx={CIRCLE.rx + 8} ry={CIRCLE.ry + 6} className={`target-ring lane-${side}`} opacity={u.engaged ? 1 : 0.35} />
          </g>
        );
      })}
    </>
  );
  return (
    <InspectContext.Provider value={inspectApi}>
    <StatusIconsContext.Provider value={statusIcons}>
    <div className="replay">
      <div className="replay-controls">
        <button className="play-btn" onClick={togglePlay} title="Play / pause (Space)">
          {playing ? "❚❚ Pause" : t >= end && !hold ? "↺ Replay" : "▶ Play"}
        </button>
        <div className="step-btns">
          <button onClick={() => jump(-1)} title="Back 1 second (←)">−1s</button>
          <button onClick={() => jump(-0.5)} title="Back 0.5 seconds">−.5</button>
          <button onClick={() => jump(-0.25)} title="Back 0.25 seconds (Shift+←)">−.25</button>
          <button onClick={() => jump(0.25)} title="Forward 0.25 seconds (Shift+→)">+.25</button>
          <button onClick={() => jump(0.5)} title="Forward 0.5 seconds">+.5</button>
          <button onClick={() => jump(1)} title="Forward 1 second (→)">+1s</button>
        </div>
        <TimelineBar
          total={total}
          now={now}
          onSeek={seekTo}
          background={timelineBackground(holds, clock, total, now, pauseOn)}
          label={pauseOn ? "Playback time, with the pauses" : "Battle time"}
          marks={timelineMarks}
          info={info}
          toBattle={(p) => (pauseOn ? clock.toBattle(p).t : p)}
        />
        {(() => {
          const battle = `${t.toFixed(1)}s / ${end.toFixed(1)}s`;
          const playback = `${now.toFixed(1)}s / ${total.toFixed(1)}s`;
          const showPlayback = pauseOn && timeMode === "playback";
          return (
            <button
              type="button"
              className={`time ${activeHold ? "special-paused" : ""}`}
              style={activeHold ? { color: PAUSE_COLOR[activeHold.kind] } : undefined}
              onClick={() => setTimeMode(timeMode === "playback" ? "battle" : "playback")}
              title={showPlayback
                ? `Playback time, with the pauses for animations. Battle time: ${battle}. Click for battle time.`
                : `Battle time${pauseOn ? " (stands still while the clock is paused)" : ""}. With the pauses for animations: ${playback}. Click for that time.`}
            >
              {showPlayback ? playback : battle}
            </button>
          );
        })()}
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
          {[0.5, 1, 2, 4, 8].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <ReplaySettings
          groups={[
            {
              title: "Playback",
              options: [
                { label: "Pause the clock for specials", help: PAUSE_SPECIAL_HELP, checked: pauseSpecials, onChange: setPauseSpecials, color: PAUSE_COLOR.special },
                { label: "Pause the clock for rumble-ins", help: PAUSE_RUMBLE_HELP, checked: pauseRumble, onChange: setPauseRumble, color: PAUSE_COLOR.enter },
                { label: "Battle-over sequence", help: PAUSE_END_HELP, checked: pauseEnd, onChange: setPauseEnd, color: PAUSE_COLOR.end },
              ],
            },
            {
              title: "Units",
              options: [
                { label: "Status panels", help: "The status badges (buffs, debuffs, Shield, Bind ...) under each unit's portrait; off, the portrait sits in the middle of the card", checked: showPanels, onChange: setShowPanels },
                { label: "Status icons", help: "The game's icons in place of the words for buffs, debuffs and statuses that have one (status panels and the Buffs tab); the level and seconds left stay next to it, hover for the full name", checked: statusIcons, onChange: setStatusIcons },
                { label: "Damage numbers", help: "Damage and heal numbers over the units, for hits, specials, Counters, Damage over Time and heals", checked: showNums, onChange: setShowNums },
              ],
            },
            {
              title: "Battle info",
              options: [
                { label: "Timer counts up", help: "The timer at the top counts up from 0 instead of down (the game counts down).", checked: timerUp, onChange: setTimerUp },
                { label: "Timer shows tenths", help: "The timer at the top shows tenths of a second.", checked: timerTenths, onChange: setTimerTenths },
                { label: "Benches", help: "Each team's bench at the top of the field: waiting units, then KO'd units (greyed)", checked: showBenches, onChange: setShowBenches },
                { label: "Team lineups", help: "Each team's units on the field in a strip under it (yours left, the opponent's right); greyed once KO'd until a bench unit comes in", checked: showLineups, onChange: setShowLineups },
                { label: "Next queue", help: "The NEXT column, and each unit's place in the queue on the field", checked: showQueue, onChange: setShowQueue },
                { label: "Key events", help: "Graphics on the field for specials, KOs and units coming in, the KO banner, and a list of the latest ones", checked: showFx, onChange: setShowFx },
              ],
            },
            {
              title: "Field and camera",
              options: [
                { label: "Auto camera", help: "Follow the battle, zoomed to fit every unit. Dragging or scrolling on the field turns it off; tick it to fit again.", checked: autoCam, onChange: setAutoCam },
                { label: "Tile markers", help: "Every tile a unit can stand on (start tiles dashed)", checked: showTiles, onChange: setShowTiles },
                {
                  kind: "range", label: "Opacity", help: "How strongly the tile markers show", value: tileOpacity, min: 0.1, max: 1, step: 0.05,
                  format: (v) => `${Math.round(v * 100)}%`, onChange: setTileOpacity, disabled: !showTiles,
                },
                { label: "Blank background", help: "Hide the map and crowd: just a plain field", checked: blankField, onChange: setBlankField },
                { label: "Stop background animation", help: "Freeze the crowd in the background (Assault Rumble: the flowing lava)", checked: stillCrowd, onChange: setStillCrowd, disabled: blankField },
              ],
            },
          ]}
        />
      </div>

      <div className="replay-top">
        <div className={`field-wrap ${showQueue ? "with-next" : ""} ${showLineups ? "with-lineup" : ""}`}>
          <div className="field-row">
          {/* the NEXT column sits beside the field, never over it */}
          {showQueue && <NextStrip frame={frame} info={info} height={VIEW.h} bosses={bosses} />}
          <div className={`field-stage ${autoCam ? "" : "has-minimap"} ${result.mode === "assault" ? "assault" : ""}`}>
          <svg
            ref={svgRef}
            className={`field ${camera.dragging ? "dragging" : ""}`}
            viewBox={`${cam.x} ${cam.y} ${cam.w} ${cam.h}`}
            preserveAspectRatio="xMidYMid slice"
            role="img"
            aria-label="Battle field (drag to move, scroll to zoom)"
            {...camera.handlers}
          >
            {/* the ground */}
            {ground}
            {(() => {
              // one unit: card on its feet, gauges on top. `overlay` = the copy drawn over everything while hovered.
              const renderUnit = (u: (typeof shown.units)[number], overlay: boolean) => {
                const recv = receiving.get(u.uid);
                // a hit: a quick shake that dies out over the flash
                const shake = recv?.kind === "hit" ? hitShake(recv.p) : 0;
                const i = info.get(u.uid)!;
                const hpFrac = u.maxHp > 0 ? u.hp / u.maxHp : 0;
                const hasSp = u.ctMax > 0 && Number.isFinite(u.ctMax);
                const ctFrac = hasSp ? Math.min(1, u.ct / u.ctMax) : 0;
                return (
                  <g
                    key={overlay ? `hover-${u.uid}` : u.uid}
                    transform={`translate(${u.x + shake},${u.y})`}
                    className={`${u.occupied ? "busy" : ""} ${overlay ? "unit-hover" : ""}`}
                    onMouseEnter={overlay ? undefined : () => setHoverUid(u.uid)}
                    onMouseLeave={overlay ? () => setHoverUid(undefined) : undefined}
                  >
                    <title>{`${i.tag} ${i.name} — ${u.activity}: ${statUp(u.hp).toLocaleString()} / ${statUp(u.maxHp).toLocaleString()} HP`}</title>
                    <g transform={`translate(0,${GROUND_DY})`}><GroundShadow side={i.side} attacking={u.state === "acting" || !!u.targetUid} /></g>
                    {(() => {
                      const r = receiving.get(u.uid);
                      if (!r || r.kind === "hit") return null;
                      // helped: a ring rising from the feet; hindered: a ring closing in
                      const grow = r.kind === "up" ? r.p : 1 - r.p;
                      return <ellipse cy={GROUND_DY - (r.kind === "up" ? 40 * r.p : 0)} rx={30 + 34 * grow} ry={12 + 14 * grow} className={`recv-ring recv-${r.kind}`} opacity={Math.sin(Math.PI * Math.min(1, r.p * 1.15))} />;
                    })()}
                    {(() => {
                      // card standing on the unit's feet: portrait, then the status panel; gauges ride on top
                      const badges = badgesFor(u);
                      const cardH = THUMB;
                      const top = GROUND_DY - 4 - cardH;
                      const lift = 0;
                      const py = top + portraitY(showPanels);
                      return (
                        <>
                          {/* portrait in its team frame (nothing behind it at the sides), the status panel below */}
                          <SvgThumb id={i.unitId} size={PORTRAIT} x={-PORTRAIT / 2} y={py} />
                          <rect x={-PORTRAIT / 2} y={py} width={PORTRAIT} height={PORTRAIT} rx={5} className={`thumb-frame thumb-frame-${i.side}`} />
                          {recv?.kind === "hit" && <rect x={-PORTRAIT / 2} y={py} width={PORTRAIT} height={PORTRAIT} rx={5} className="recv-hit" opacity={0.55 * (1 - recv.p)} />}
                          {isBound(u) && <BindLock x={-PORTRAIT / 2} y={py} size={PORTRAIT} dim />}
                          {showPanels && <StatusPanel badges={badges} x={-PANEL_W / 2} y={top + PORTRAIT + 4} side={i.side} uid={u.uid} />}
                          <g transform={`translate(0,${-lift})`}>
                            {!hideBars && <UnitGauges side={i.side} hpFrac={hpFrac} spFrac={hasSp ? ctFrac : undefined} spReady={hasSp && ctFrac >= 1} shieldFrac={u.maxHp > 0 ? u.shield / u.maxHp : 0} hover={gaugeHover(u.uid)} boss={bosses.has(u.uid)} />}
                            <text x={gaugeHalf(bosses.has(u.uid)) + 4} y={7} className="unit-label unit-label-side">{i.tag}</text>
                            {showQueue && !hideBars && queuePos.has(u.uid) && (
                              <g transform={`translate(${gaugeLeft(bosses.has(u.uid)) - 15},0)`} className={`queue-badge ${queuePos.get(u.uid)! <= 2 ? "next-window" : ""}`}>
                                <circle r={13} />
                                <text y={6}>{queuePos.get(u.uid)}</text>
                              </g>
                            )}
                          </g>
                        </>
                      );
                    })()}
                  </g>
                );
              };
              const onField = shown.units.filter(onFieldNow).sort((a, b) => a.y - b.y);
              const hovered = hoverUid ? onField.find((u) => u.uid === hoverUid) : undefined;
              const isRaised = (u: (typeof onField)[number]) => raised.includes(u.uid);
              const caster = raised.at(-1);
              const ordered = [
                ...onField.filter((u) => !isRaised(u)),
                ...onField.filter((u) => isRaised(u) && u.uid !== caster),
                ...onField.filter((u) => u.uid === caster),
              ];
              return (
                <>
                  {ordered.map((u) => renderUnit(u, false))}
                  {/* hovering any visible part of a unit shows all of it on top until the mouse leaves it */}
                  {hovered && renderUnit(hovered, true)}
                </>
              );
            })()}
            {showNums && <DamageNumbers list={nums} pos={new Map(shown.units.map((u) => [u.uid, { x: u.x, y: u.y }]))} />}
            {showFx && <FieldEventMarks list={fxShown} t={now} info={info} />}
          </svg>
          <Hud frame={frame} info={info} battleLength={BATTLE_LENGTH} showNext={false} width={VIEW.w} height={VIEW.h} clockStopped={!!activeHold} benchSlots={benchSlots} showBench={showBenches} onPick={pickCard} timerUp={timerUp} timerTenths={timerTenths}
            {...(result.mode === "assault" ? { score: frame.score ?? 0, bosses } : {})}>
            {showFx && lastKo && activeHold?.kind !== "enter" && endEl === null && <RumbleOutBanner koUid={lastKo.ko.uid} el={now - lastKo.ko.t} before={lastKo.before} after={lastKo.after} info={info} width={VIEW.w} dy={activeHold ? 130 : 0} />}
            {activeHold && hold && <CutInOverlay hold={activeHold} el={hold.el} info={info} width={VIEW.w} height={VIEW.h} />}
            <ForcedOutCards frame={frame} info={info} width={VIEW.w} panels={showPanels} />
            {endEl !== null && (
              <BattleEndOverlay win={result.winner === "atk"} reason={result.reason} time={result.time} units={result.units} info={info}
                width={VIEW.w} height={VIEW.h} el={endEl} />
            )}
          </Hud>
          {showFx && <EventFeed list={fx} t={now} info={info} />}
          {!autoCam && (
            <Minimap
              visible={steering || onMinimap}
              onHover={(on) => { setOnMinimap(on); if (!on) steered(); }}
              bounds={FIELD_ART}
              cam={cam}
              units={shown.units
                .filter((u) => u.state !== "bench" && u.state !== "dead" && u.state !== "forced")
                .map((u) => ({ uid: u.uid, x: u.x, y: u.y + GROUND_DY, side: info.get(u.uid)?.side ?? "atk" }))}
              onMove={camera.moveTo}
              onZoom={camera.zoomBy}
            />
          )}
          {activeHold && hold && <div className="hold-badge" role="status">Paused · {holdLabel(activeHold, hold.el)}</div>}
          {/* the View menu's Auto camera, on the field too */}
          <label className="field-autocam" title="Follow the battle, zoomed to fit every unit. Dragging or scrolling on the field turns it off.">
            <input type="checkbox" checked={autoCam} onChange={(e) => setAutoCam(e.target.checked)} /> Auto camera
          </label>
          </div>
          </div>
          {showLineups && (
            <div className="field-row lineup-row">
              {showQueue && <div className="next-spacer" aria-hidden="true" />}
              <LineupStrip lineup={lineup} info={info} bound={bound} picked={cardUid} onPick={pickCard} />
            </div>
          )}
          <UnitCard db={props.db} units={result.units} info={info} uid={showLineups || showBenches ? cardUid : undefined} onClose={() => setCardUid(undefined)} />
        </div>
        <SidePanel
          shown={side}
          onToggle={(k) => setSide((s) => toggleSide(s, k))}
          panels={{
            log: <EventLog events={visibleEvents} filter={logFilter} onFilter={setLogFilter} onPick={seek} />,
            graph: statGraph("fill"),
            hp: <HealthPanel frame={frame} info={info} highlight={hpLit} onHover={setHpLit} />,
            stats: <StatsTable frame={frame} info={info} />,
            buffs: <BuffTable frame={frame} info={info} compact />,
          }}
        />
      </div>

      {/* always here, whatever the sidebar shows; each section opens and closes (remembered) */}
      <div className="replay-below">
        <Section storageKey={HP_GRAPH_KEY} title="Stat graphs" extra={<span className="muted">over time, to {t.toFixed(1)}s</span>}>
          {statGraph(graphH)}
        </Section>
        <Section storageKey={SECTION_KEYS.hp} title="HP & specials" extra={at}>
          <HealthPanel frame={frame} info={info} highlight={hpLit} onHover={setHpLit} />
        </Section>
        <Section storageKey={SECTION_KEYS.stats} title="Stats" extra={<span className="muted">at {t.toFixed(1)}s, with buffs and debuffs</span>}>
          <StatsTable frame={frame} info={info} />
        </Section>
        <Section storageKey={SECTION_KEYS.buffs} title="Buffs & debuffs" extra={at}>
          <BuffTable frame={frame} info={info} />
        </Section>
        <Section storageKey={SECTION_KEYS.log} title="Event log" className="below-log">
          <EventLog events={visibleEvents} filter={logFilter} onFilter={setLogFilter} onPick={seek} bare />
        </Section>
      </div>
      {inspect && <BuffPopup state={inspect} frame={frame} frames={frames} t={t} info={info} />}
    </div>
    </StatusIconsContext.Provider>
    </InspectContext.Provider>
  );
}

/**
 * Display only: units standing on (almost) the same spot are fanned out a little so each
 * one stays visible. The simulation positions are unchanged.
 */
function spreadStacked(frame: Frame | undefined): Frame | undefined {
  if (!frame) return frame;
  const seen = new Map<string, number>();
  return {
    ...frame,
    units: frame.units.map((u) => {
      if (u.state === "bench" || u.state === "dead") return u;
      const key = `${Math.round(u.x / 8)},${Math.round(u.y / 8)}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      return n === 0 ? u : { ...u, x: u.x + n * 40, y: u.y + n * 20 };
    }),
  };
}

/** Recorded frame at or before t, with positions interpolated toward the next frame for smooth motion. */
/** When the last frame at or before battle time t was taken. */
function frameTakenAt(frames: Frame[], t: number): number {
  let lo = 0, hi = frames.length - 1;
  if (hi < 0 || frames[0]!.t > t) return -Infinity;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo]!.t;
}

/** The first frame taken at or after battle time t (a frame at an event's moment is taken after it), shown at t. */
function frameFrom(frames: Frame[], t: number): Frame | undefined {
  const f = frames.find((x) => x.t >= t - 1e-9) ?? frames.at(-1);
  return f && { ...f, t };
}

function frameAt(frames: Frame[], t: number): Frame | undefined {
  if (!frames.length) return undefined;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo]!;
  const b = frames[lo + 1];
  if (!b || b.t === a.t) return a;
  const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const next = new Map(b.units.map((u) => [u.uid, u]));
  // during a cut-in the battle stands still: no motion to interpolate
  if (a.cutIn) return { ...a, t };
  return {
    ...a,
    t,
    units: a.units.map((u) => {
      const v = next.get(u.uid);
      return !v || v.state !== u.state ? u : { ...u, x: u.x + (v.x - u.x) * k, y: u.y + (v.y - u.y) * k };
    }),
  };
}
