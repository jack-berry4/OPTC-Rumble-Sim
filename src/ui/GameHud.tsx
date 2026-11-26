import type { ReactNode } from "react";
import type { Frame, UnitSnapshot } from "../engine/types";
import type { UnitInfo } from "./Tracker";
import type { BarMetric } from "./replaySeries";
import { SvgThumb } from "./UnitThumb";

/**
 * The game's own battle HUD pieces (public/game-ui/, from the game files "pbattle_*.png"), drawn the way the game
 * arranges them: gauges, ground circles and attack strips on the field (game pixels, moving with the camera), and the
 * timer header, enemy bench and NEXT column fixed to the screen (Hud).
 *
 * Assault Rumble (user, 2026-11-25; MEASURED on Assault Test Runs/ blackbeard.mp4 and akainu.mp4): the main boss gets the
 * long gauges (`..._ar_boss`, 170 art px for 90) at the same scale with the BOSS label left of them, its NEXT places the
 * BOSS tile, and the screen shows the Damage Score at the bottom (DamageScore).
 *
 * Sizes: on the field the HP gauge is 80 px wide at battle-start zoom (MEASURED, run 1) = 0.89 x the art; the ground
 * circle 88 px = 0.83 x the art's visible ellipse. The screen HUD is 1.35 x the art (the game draws its 640-px-wide
 * layout into the 864-px-wide game area of a 1080 recording; header and NEXT column agree within ~3%).
 */
const UI = "game-ui/pbattle_";
type Side = "atk" | "def";
const who = (side: Side) => (side === "atk" ? "self" : "enemy");

// ---------- on the field (game px) ----------

const G = 0.89; // gauge art -> game px
const S = 0.83; // ground-circle art -> game px

/** Ground circle centred on (0, 0): the attack circle while the unit attacks, the regular one otherwise. */
export function GroundShadow(props: { side: Side; attacking: boolean }) {
  // both arts' visible ellipses (106 and 128 px wide) are drawn the same size on the ground
  if (props.attacking) {
    const k = (106 / 128) * S, w = 222 * k, h = 114 * k;
    return <image href={`${UI}shadow_${who(props.side)}_attack.png`} x={-w / 2} y={-h / 2} width={w} height={h} />;
  }
  const w = 128 * S, h = 64 * S;
  return <image href={`${UI}shadow_${who(props.side)}.png`} x={-w / 2} y={-h / 2} width={w} height={h} />;
}

/**
 * The BOSS label's scale (game px per art px) and place: its letters 0.674 x the gauge's scale, their right edge 7.5
 * gauge-art px left of the gauge, centred 3 px under the HP gauge's middle (MEASURED: Blackbeard at 40 s, Akainu at the
 * battle start; the label art's letters span x 5-94, y 5-37 of 101 x 44).
 */
const BOSS_LABEL = 0.674 * G;
/** Half the HP gauge's width on the field (game px): the main boss's is the long one. */
export const gaugeHalf = (boss?: boolean) => ((boss ? 170 : 90) * G) / 2;
/** The left edge of a unit's gauges on the field, the main boss's BOSS label included (game px from the unit). */
export const gaugeLeft = (boss?: boolean) => (boss ? -gaugeHalf(true) - 7.5 * G - 95 * BOSS_LABEL : -gaugeHalf(false));

/**
 * HP gauge centred on (0, 0) with the special gauge under it; enemy HP empties from the left as in the game. The
 * Assault Rumble main boss (`boss`) has the long gauges (the same end caps: 10 art px, the special bar's 12) and the
 * BOSS label left of them.
 */
export function UnitGauges(props: {
  side: Side; hpFrac: number; spFrac?: number; spReady?: boolean; shieldFrac?: number;
  /** Hover handlers per bar (the replay's graph popup). */
  hover?: (bar: BarMetric) => object;
  boss?: boolean;
}) {
  const hv = (bar: BarMetric) => props.hover?.(bar) ?? {};
  const art = props.boss ? 170 : 90, ar = props.boss ? "_ar_boss" : "";
  const fw = art * G, fh = 23 * G, x0 = -fw / 2, y0 = -fh / 2;
  const inW = (art - 20) * G, hp = Math.max(0, Math.min(1, props.hpFrac));
  const hpX = x0 + 10 * G + (props.side === "def" ? inW * (1 - hp) : 0);
  const sy = y0 + fh - 2;
  return (
    <>
      {/* Shield: a grey bar just above the HP gauge, its length = shield / max HP (capped at the gauge's width) */}
      {(props.shieldFrac ?? 0) > 0 && (
        <g className="shield-bar gauge-hover" {...hv("shield")}>
          <rect x={x0 + 9 * G} y={y0 - 9 * G} width={inW + 2 * G} height={8 * G} rx={3} className="shield-bar-bg" />
          <rect x={x0 + 10 * G} y={y0 - 8 * G} width={inW * Math.min(1, props.shieldFrac!)} height={6 * G} rx={2} className="shield-bar-fill" />
        </g>
      )}
      {props.boss && <image href={`${UI}label_ar_boss.png`} x={x0 - 7.5 * G - 95 * BOSS_LABEL} y={3 * G - 21.5 * BOSS_LABEL} width={101 * BOSS_LABEL} height={44 * BOSS_LABEL} />}
      <g className="gauge-hover" {...hv("hp")}>
        <image href={`${UI}SD_charaHP_gauge${ar}.png`} x={x0} y={y0} width={fw} height={fh} />
        {hp > 0 && <image href={`${UI}SD_chara_HP_${who(props.side)}.png`} x={hpX} y={y0 + 5 * G} width={inW * hp} height={11 * G} preserveAspectRatio="none" />}
      </g>
      {props.spFrac !== undefined && (
        <g className={`gauge-hover ${props.spReady ? "sp-ready" : ""}`} {...hv("ct")}>
          <image href={`${UI}SD_charaSP_gauge${ar}.png`} x={x0} y={sy} width={fw} height={17 * G} />
          {props.spFrac > 0 && <image href={`${UI}SD_charaSP.png`} x={x0 + 12 * G} y={sy + 4.5 * G} width={(art - 24) * G * Math.min(1, props.spFrac)} height={6 * G} preserveAspectRatio="none" />}
        </g>
      )}
    </>
  );
}

/** The game's attack strip (with its arrows) on the ground from an attacker to its target. */
/** Length of the attack strip once a unit is in position (px on the field): the measured standard reach. */
const STRIP_LEN = 212;

export function AttackStrip(props: { side: Side; x1: number; y1: number; x2: number; y2: number; engaged?: boolean }) {
  const { side, x1, y1 } = props;
  // In position the game draws its strip flat along the map at a fixed size, from the attacker toward the enemy side;
  // while walking up it is a faint line to the target.
  const x2 = props.engaged ? x1 + (side === "atk" ? STRIP_LEN : -STRIP_LEN) : props.x2;
  const y2 = props.engaged ? y1 : props.y2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 10) return null;
  // art 689 x 112, the strip itself spans x 33-644, y 13-99
  const W = (len * 689) / 611, H = 40, off = (33 / 689) * W;
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  // the enemy's art points left: draw it from the target back to the attacker, turned round
  const [ox, oy, a] = side === "atk" ? [x1, y1, ang] : [x2, y2, ang + 180];
  return (
    <image href={`${UI}shadow_attack_base_${who(side)}.png`} x={-off} y={-H / 2} width={W} height={H} preserveAspectRatio="none"
      transform={`translate(${ox},${oy}) rotate(${a})`} opacity={props.engaged ? 0.95 : 0.3} />
  );
}

// ---------- fixed to the screen ----------

/** A bench slot's unit: still waiting, or KO'd and shown greyed out as in the game. */
export interface BenchSlot { uid: string; ko: boolean }

/**
 * The bench slots at battle time `t`, left to right with no gaps: the units still waiting on the bench (in bench order;
 * one coming in leaves and the rest shift up), then the KO'd units greyed out, in KO order; the first 3 of these.
 * A unit switched out to the bench takes the bench place of the one it switched with; a revived unit leaves the KO list.
 * Jack's example (field then bench, (x) = KO'd): abcde fg -> b KO'd, f comes in -> afcde g(b) -> d KO'd, g comes in ->
 * afcge (b)(d).
 */
export function benchSlotsAt(
  events: { t: number; kind: string; text: string; actor?: string; target?: string }[],
  start: { uid: string; side: Side; bench: boolean }[], t: number,
): Record<Side, (BenchSlot | null)[]> {
  const sideOf = new Map(start.map((u) => [u.uid, u.side]));
  const waiting: Record<Side, string[]> = { atk: [], def: [] };
  const kos: Record<Side, string[]> = { atk: [], def: [] };
  for (const u of start) if (u.bench) waiting[u.side].push(u.uid);
  for (const e of events) {
    if (e.t > t + 1e-9) break;
    if (e.kind === "enter" && e.actor) {
      const side = sideOf.get(e.actor);
      if (!side) continue;
      if (/ switches with /.test(e.text) && e.target) {
        // "<actor> switches with <target>": the target comes in from the bench, the actor takes its bench place
        waiting[side] = waiting[side].map((x) => (x === e.target ? e.actor! : x));
        continue;
      }
      // comes in from the bench: the rest shift up (a unit back from Forced Out isn't on the bench)
      waiting[side] = waiting[side].filter((x) => x !== e.actor);
    } else if (e.kind === "ko" && e.target) {
      const side = sideOf.get(e.target);
      if (side && !kos[side].includes(e.target)) kos[side].push(e.target);
    } else if (e.kind === "effect" && e.actor && / revives with /.test(e.text)) {
      const side = sideOf.get(e.actor);
      if (side) kos[side] = kos[side].filter((x) => x !== e.actor);
    }
  }
  const slots = (side: Side): (BenchSlot | null)[] => {
    const list: (BenchSlot | null)[] = [
      ...waiting[side].map((uid) => ({ uid, ko: false })),
      ...kos[side].map((uid) => ({ uid, ko: true })),
    ].slice(0, 3);
    while (list.length < 3) list.push(null);
    return list;
  };
  return { atk: slots("atk"), def: slots("def") };
}

/**
 * Each side's five field places at battle time `t` for the lineup under the field: the unit standing there now (a bench
 * unit that came in takes the place of the one it replaced), `ko` once it is KO'd and nobody has come in for it.
 */
export function lineupAt(
  events: { t: number; kind: string; text: string; actor?: string; target?: string }[],
  start: { uid: string; side: Side; bench: boolean }[], t: number,
): Record<Side, BenchSlot[]> {
  const sideOf = new Map(start.map((u) => [u.uid, u.side]));
  const places: Record<Side, BenchSlot[]> = { atk: [], def: [] };
  for (const u of start) if (!u.bench) places[u.side].push({ uid: u.uid, ko: false });
  // KO'd places nobody has come in for yet, in KO order (bench units come in for them in that order)
  const open: Record<Side, string[]> = { atk: [], def: [] };
  const place = (side: Side, uid: string) => places[side].find((x) => x.uid === uid);
  for (const e of events) {
    if (e.t > t + 1e-9) break;
    if (e.kind === "ko" && e.target) {
      const side = sideOf.get(e.target);
      const p = side && place(side, e.target);
      if (side && p && !p.ko) { p.ko = true; open[side].push(e.target); }
    } else if (e.kind === "effect" && e.actor && / revives with /.test(e.text)) {
      const side = sideOf.get(e.actor);
      const p = side && place(side, e.actor);
      if (side && p) { p.ko = false; open[side] = open[side].filter((x) => x !== e.actor); }
    } else if (e.kind === "enter" && e.actor) {
      const side = sideOf.get(e.actor);
      if (!side) continue;
      if (/ switches with /.test(e.text) && e.target) {
        // "<actor> switches with <target>": the target takes the actor's place
        const k = places[side].findIndex((x) => x.uid === e.actor);
        if (k >= 0) places[side][k] = { uid: e.target, ko: false };
        continue;
      }
      if (place(side, e.actor)) continue; // back from Forced Out
      const gone = open[side].shift();
      const k = gone ? places[side].findIndex((x) => x.uid === gone) : -1;
      if (k >= 0) places[side][k] = { uid: e.actor, ko: false };
    }
  }
  return places;
}

const K = 1.35; // HUD art -> screen units (the field's home view is 1000 x 740)
/** The tenths timer's widths at its 31 px font (measured): one digit, and "." plus a digit. */
const TIMER_DIGIT_W = 18.6, TIMER_TENTH_W = 28.5;

/**
 * Screen HUD over the field: the timer header with each team's units left, the enemy bench, and (optional) the NEXT
 * column. Its own SVG with the field's aspect ratio, so it scales with the field but not with the camera.
 */
export function Hud(props: {
  frame: Frame; info: Map<string, UnitInfo>; battleLength: number; showNext: boolean; width: number; height: number;
  /** The battle clock is stopped (a special or rumble-in pause): the timer turns amber and pulses. */
  clockStopped?: boolean;
  /** Timer: count up from 0 instead of down (the game counts down), and show tenths of a second. */
  timerUp?: boolean;
  timerTenths?: boolean;
  /** The three bench slots per side: a waiting unit, a KO'd unit (greyscale), or empty. Without it, the frame's bench. */
  benchSlots?: Record<Side, (BenchSlot | null)[]>;
  /** Draw the two benches at the top (default on). */
  showBench?: boolean;
  /** Clicking a bench portrait (shows that unit's special and ability under the lineups). */
  onPick?: (uid: string) => void;
  /** Assault Rumble: the Damage Score so far (bottom of the screen). */
  score?: number;
  /** Assault Rumble: the main boss (its NEXT places get the BOSS tile). */
  bosses?: Set<string>;
  children?: ReactNode;
}) {
  const showBench = props.showBench ?? true;
  const { frame, info } = props;
  const left = (side: Side) => frame.units.filter((u) => info.get(u.uid)?.side === side && u.state !== "dead").length;
  const shownSecs = props.timerUp ? Math.min(props.battleLength, frame.clock) : Math.max(0, props.battleLength - frame.clock);
  // whole seconds as the game shows them: counting down rounds up (100 until a second has passed), up rounds down
  const timer = props.timerTenths
    ? (props.timerUp ? Math.floor(shownSecs * 10 + 1e-6) : Math.ceil(shownSecs * 10 - 1e-6)) / 10
    : props.timerUp ? Math.floor(shownSecs + 1e-9) : Math.ceil(shownSecs - 1e-9);
  const fromFrame = (side: Side): (BenchSlot | null)[] => frame.units.filter((u) => info.get(u.uid)?.side === side && u.state === "bench").slice(0, 3).map((u) => ({ uid: u.uid, ko: false }));
  const bench = props.benchSlots?.def ?? fromFrame("def");
  const ownBench = props.benchSlots?.atk ?? fromFrame("atk");
  const hw = 282 * K, hx = props.width / 2 - hw / 2;
  const bw = 192 * K, bx = props.width - bw - 4;
  return (
    <svg className="hud" viewBox={`0 0 ${props.width} ${props.height}`} preserveAspectRatio="xMidYMin meet" aria-hidden="true">
      <g transform={`translate(${hx},0)`}>
        <image href={`${UI}header_base.png`} width={hw} height={64 * K} />
        <text x={78 * K} y={30 * K} className="hud-count">{left("atk")}</text>
        <text x={204 * K} y={30 * K} className="hud-count">{left("def")}</text>
        {props.timerTenths && timer < 100 ? (
          // pinned at the decimal point, digits all one width, so the number doesn't shift as it counts; the point sits
          // where the whole number is centred for its count of digits (it moves only at 10 s). 100.0 shows as 100.
          (() => {
            const whole = Math.trunc(timer), digits = String(whole).length;
            const point = 141 * K + (digits * TIMER_DIGIT_W - TIMER_TENTH_W) / 2;
            return (
              <g className={`hud-timer-tenths ${props.clockStopped ? "stopped" : ""}`}>
                <text x={point} y={55 * K} className="hud-timer tenths int">{whole}</text>
                <text x={point} y={55 * K} className="hud-timer tenths dec">.{Math.round((timer % 1) * 10) % 10}</text>
              </g>
            );
          })()
        ) : (
          <text x={141 * K} y={55 * K} className={`hud-timer ${props.clockStopped ? "stopped" : ""}`}>{Math.round(timer)}</text>
        )}
        {props.clockStopped && <text x={176 * K} y={53 * K} className="hud-timer-pause">❚❚</text>}
        {frame.supersLeft && <SuperFlames left={frame.supersLeft} />}
      </g>
      {showBench && <g transform={`translate(${bx},0)`}>
        <image href={`${UI}header_enemy_bench.png`} width={bw} height={77 * K} />
        {bench.map((u, i) => {
          if (!u) return null;
          const id = info.get(u.uid)!.unitId, sz = 50 * K;
          return (
            <g key={u.uid} className={`hud-pick ${u.ko ? "bench-ko" : ""}`} onClick={() => props.onPick?.(u.uid)}>
              <title>{info.get(u.uid)!.name}: click for its special and ability</title>
              <clipPath id={`bench-clip-${i}`}><rect x={(7 + i * 63) * K} y={6 * K} width={sz} height={sz} rx={22 * K} /></clipPath>
              <g clipPath={`url(#bench-clip-${i})`}><SvgThumb id={id} size={sz} x={(7 + i * 63) * K} y={6 * K} /></g>
            </g>
          );
        })}
      </g>}
      {/* your bench, top left: the enemy's header mirrored, portraits upright, bench 1 on the left */}
      {showBench && <g transform="translate(4,0)">
        <image href={`${UI}header_enemy_bench.png`} width={bw} height={77 * K} transform={`translate(${bw},0) scale(-1,1)`} className="own-bench-art" />
        {ownBench.map((u, i) => {
          if (!u) return null;
          const id = info.get(u.uid)!.unitId, sz = 50 * K;
          const x = bw - (7 + (2 - i) * 63) * K - sz;
          return (
            <g key={u.uid} className={`hud-pick ${u.ko ? "bench-ko" : ""}`} onClick={() => props.onPick?.(u.uid)}>
              <title>{info.get(u.uid)!.name}: click for its special and ability</title>
              <clipPath id={`own-bench-clip-${i}`}><rect x={x} y={6 * K} width={sz} height={sz} rx={22 * K} /></clipPath>
              <g clipPath={`url(#own-bench-clip-${i})`}><SvgThumb id={id} size={sz} x={x} y={6 * K} /></g>
            </g>
          );
        })}
      </g>}
      {props.showNext && <NextColumnSvg frame={frame} info={info} bosses={props.bosses} />}
      {props.score !== undefined && <DamageScore score={props.score} width={props.width} height={props.height} />}
      {props.children}
    </svg>
  );
}

/** Height of the lineup strip under the field, in the field's units (the field is 1000 x 740). */
export const LINEUP_H = 112;

/**
 * The super specials each team has left, as the game shows them under the unit counts: three flame sockets a side,
 * yours red, the opponent's blue, burnt out (black) from the middle outward as they're used [user 2026-11-18]. The
 * flames are crops of run 8 battle 1 (3:49-3:51, 16 frames averaged, 4x upscaled); the gold sockets are drawn to
 * match. Header-art units, measured from the same footage.
 */
const FLAME = {
  atk: [47.4, 62.8, 78.3], def: [234.6, 219.2, 203.7],
  neck: { y: 40.9, r: 3.05 }, body: { y: 49.76, rx: 6.41, ry: 7.63 },
  rim: { neckY: 40.3, neckR: 5.19, rx: 7.94, ry: 9.16 },
  img: { w: 14.65, h: 21.37, y: 36.63 },
};
function SuperFlames(props: { left: Record<Side, number> }) {
  const F = FLAME;
  // a socket: a small circle (the neck) over an egg (the body); fragments, since a clipPath can't hold a <g>
  const shape = (cx: number, grow: number, rim = false) => (
    <>
      <circle cx={cx * K} cy={(rim ? F.rim.neckY : F.neck.y) * K} r={((rim ? F.rim.neckR : F.neck.r) + grow) * K} />
      <ellipse cx={cx * K} cy={F.body.y * K} rx={((rim ? F.rim.rx : F.body.rx) + grow) * K} ry={((rim ? F.rim.ry : F.body.ry) + grow) * K} />
    </>
  );
  const sockets = (["atk", "def"] as Side[]).flatMap((s) => FLAME[s].map((cx, i) => ({ s, i, cx, lit: i < props.left[s] })));
  return (
    <g className="super-flames" aria-label={`Super specials left: yours ${props.left.atk}, opponent ${props.left.def}`}>
      <defs>
        <linearGradient id="flame-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe7a1" /><stop offset="0.45" stopColor="#d4a548" /><stop offset="1" stopColor="#8d5f1c" />
        </linearGradient>
        {sockets.map((k) => (
          <clipPath key={k.s + k.i} id={`flame-clip-${k.s}-${k.i}`}>{shape(k.cx, 0)}</clipPath>
        ))}
      </defs>
      {sockets.map((k) => <g key={k.s + k.i} className="flame-outline">{shape(k.cx, 0.6, true)}</g>)}
      {sockets.map((k) => <g key={k.s + k.i} fill="url(#flame-rim)">{shape(k.cx, 0, true)}</g>)}
      {sockets.map((k) => <g key={k.s + k.i} className="flame-line">{shape(k.cx, 0.3)}</g>)}
      {sockets.map((k) => (
        <image key={k.s + k.i} href={`${UI}super_flame_${!k.lit ? "used" : k.s === "atk" ? "self" : "enemy"}.png`}
          x={(k.cx - F.img.w / 2) * K} y={F.img.y * K} width={F.img.w * K} height={F.img.h * K}
          clipPath={`url(#flame-clip-${k.s}-${k.i})`} preserveAspectRatio="none" />
      ))}
    </g>
  );
}

/** Action Bound right now (the replay's padlock). */
export function isBound(u: UnitSnapshot): boolean {
  return u.statuses.some((s) => s.attr === "Action Bind");
}

/** Over an Action Bound unit's portrait (size x size at x, y): the portrait dimmed and a padlock on it [user 2026-11-18]. */
export function BindLock(props: { x: number; y: number; size: number; rx?: number; /** dim the portrait under it (default on) */ dim?: boolean }) {
  const s = props.size, cx = props.x + s / 2, w = s * 0.42, h = s * 0.34, y = props.y + s * 0.5 - h * 0.25;
  const r = w * 0.3; // shackle radius
  return (
    <g className="bind-lock" pointerEvents="none">
      <title>Action Bind: can't act</title>
      {props.dim !== false && <rect x={props.x} y={props.y} width={s} height={s} rx={props.rx ?? 5} className="bind-lock-dim" />}
      <path d={`M ${cx - r} ${y} v ${-r * 0.6} a ${r} ${r} 0 0 1 ${2 * r} 0 v ${r * 0.6}`} className="bind-lock-shackle" strokeWidth={s * 0.07} />
      <rect x={cx - w / 2} y={y} width={w} height={h} rx={s * 0.05} className="bind-lock-body" />
      <circle cx={cx} cy={y + h * 0.42} r={s * 0.045} className="bind-lock-hole" />
      <rect x={cx - s * 0.016} y={y + h * 0.42} width={s * 0.032} height={h * 0.32} className="bind-lock-hole" />
    </g>
  );
}

/**
 * The two teams' field units under the field (own strip, so it never covers the battle): yours bottom left, the
 * opponent's bottom right, in the bench art the way the benches hang from the top of the screen: flat edge on top
 * against the field, yours mirrored so its flat end lines up with the left side (and tinted red like your bench). A
 * place shows the unit standing there now; KO'd and nobody in for it yet: greyscale.
 */
export function LineupStrip(props: {
  lineup: Record<Side, BenchSlot[]>; info: Map<string, UnitInfo>; picked?: string; onPick?: (uid: string) => void;
  /** Units Action Bound now: a padlock over their portrait. */
  bound?: Set<string>;
}) {
  const aw = 192, ah = 77, pitch = 63, sz = 50 * K;
  // three pockets from the art, then the first two pockets of a second copy
  const w2 = 2 * pitch + 6;
  const fullW = (3 * pitch + w2) * K;
  const side = (s: Side, x0: number) => {
    const list = props.lineup[s];
    const mirror = s === "atk";
    const art = (dx: number, clipW: number | undefined, key: string) => (
      <g key={key} transform={`translate(${dx * K},0)`} clipPath={clipW ? `url(#lineup-art-clip-${s})` : undefined}>
        <image href={`${UI}header_enemy_bench.png`} width={aw * K} height={ah * K}
          className={mirror ? "own-bench-art" : undefined} preserveAspectRatio="none" />
      </g>
    );
    // the five pockets left to right (mirrored for yours)
    const pocketX = (i: number) => (mirror ? fullW - (7 + (4 - i) * pitch) * K - sz : (7 + i * pitch) * K);
    return (
      <g transform={`translate(${x0},0)`} className={`lineup lineup-${s}`}>
        <clipPath id={`lineup-art-clip-${s}`}><rect x={0} y={0} width={w2 * K} height={ah * K} /></clipPath>
        <g transform={mirror ? `translate(${fullW},0) scale(-1,1)` : undefined}>
          {art(0, undefined, "a")}
          {art(3 * pitch, w2, "b")}
        </g>
        {list.slice(0, 5).map((p, i) => {
          const u = props.info.get(p.uid);
          if (!u) return null;
          const x = pocketX(i), y = 6 * K;
          return (
            <g key={`${i}-${p.uid}`} className={`lineup-pick ${p.ko ? "bench-ko" : ""} ${props.picked === p.uid ? "picked" : ""}`} onClick={() => props.onPick?.(p.uid)}>
              <title>{u.name}: click for its special and ability</title>
              <clipPath id={`lineup-clip-${s}-${i}`}><rect x={x} y={y} width={sz} height={sz} rx={22 * K} /></clipPath>
              <g clipPath={`url(#lineup-clip-${s}-${i})`}><SvgThumb id={u.unitId} size={sz} x={x} y={y} /></g>
              {!p.ko && props.bound?.has(p.uid) && <BindLock x={x} y={y} size={sz} rx={22 * K} />}
              <text x={x + sz / 2} y={y + sz + 17} className="lineup-tag">{u.tag}</text>
            </g>
          );
        })}
      </g>
    );
  };
  return (
    <svg className="lineup-strip" viewBox={`0 0 1000 ${LINEUP_H}`} preserveAspectRatio="xMidYMid meet" aria-label="The teams on the field">
      {side("atk", 4)}
      {side("def", 1000 - 4 - fullW)}
    </svg>
  );
}

/** Width of the NEXT strip beside the field, in the field's home-view units (the field is 1000 x 740). */
export const NEXT_STRIP_W = 140;

/**
 * The NEXT column in its own strip left of the field, at the field's scale, so it never covers the battle (an Assault
 * Rumble main boss's BOSS tile reaches over the field's edge, as in the game).
 */
export function NextStrip(props: { frame: Frame; info: Map<string, UnitInfo>; height: number; bosses?: Set<string> }) {
  return (
    <svg className="next-strip" viewBox={`0 0 ${NEXT_STRIP_W} ${props.height}`} overflow="visible" aria-label="NEXT: the units in queue order">
      <NextColumnSvg frame={props.frame} info={props.info} bosses={props.bosses} />
    </svg>
  );
}

/**
 * The game's NEXT column: parchment slots, a red / blue flag per unit, portraits in arches, numbered 1-5. An Assault
 * Rumble main boss's places get the BOSS tile (the enemy flag with "BOSS" beside it, 148 art px wide for 87).
 */
function NextColumnSvg(props: { frame: Frame; info: Map<string, UnitInfo>; bosses?: Set<string> }) {
  const q = props.frame.queue.slice(0, 5);
  const x0 = 8, y0 = 70;
  return (
    <g transform={`translate(${x0},${y0})`} className="hud-next">
      <image href={`${UI}action_order_base.png`} width={95 * K} height={300 * K} />
      {q.map((uid, i) => {
        const u = props.info.get(uid);
        if (!u) return null;
        const y = (2 + i * 56) * K;
        const sz = 50 * K;
        return (
          <g key={i}>
            {props.bosses?.has(uid)
              ? <image href={`${UI}action_order_ar_boss.png`} x={2 * K} y={y - 3 * K} width={148 * K} height={61 * K} />
              : <image href={`${UI}action_order_${who(u.side)}.png`} x={2 * K} y={y - 3 * K} width={87 * K} height={61 * K} />}
            <clipPath id={`next-clip-${i}`}><rect x={36 * K} y={y + 6 * K} width={sz} height={sz} rx={20 * K} /></clipPath>
            <g clipPath={`url(#next-clip-${i})`}><SvgThumb id={u.unitId} size={sz} x={36 * K} y={y + 6 * K} /></g>
            <text x={18 * K} y={y + 33 * K} className="hud-next-num">{i + 1}</text>
            <text x={18 * K} y={y + 50 * K} className="hud-next-tag">{u.tag}</text>
          </g>
        );
      })}
      <image href={`${UI}action_order_frame.png`} x={31 * K} y={-6 * K} width={62 * K} height={293 * K} />
    </g>
  );
}

/**
 * Assault Rumble's Damage Score at the bottom of the screen, as the game shows it during the battle: the label bottom
 * left, the number bottom right in the score digits (user, 2026-11-25). MEASURED on Assault Test Runs/blackbeard.mp4 at
 * 40 s ("68,043"; screen units = the recording's canonical px): the label 1.35 x its art, 40 from the game area's left,
 * its top 61 above the field's bottom; the digits 1.30 x, 41 apart (a comma adds 12, its mark 0.55 x, starting 44 after
 * the digit before it, 4 below the digits), the last one ending 28 from the right, their top 81 above the bottom.
 */
const DS = { label: K, digit: 1.3, adv: 41, commaAdv: 12, comma: 0.55, commaAt: 44, right: 28, top: 81, labelTop: 61, left: 40 };
export function DamageScore(props: { score: number; width: number; height: number }) {
  const text = Math.max(0, Math.floor(props.score)).toLocaleString("en-US");
  const top = props.height - DS.top;
  // left to right from 0, then moved so the last digit ends DS.right from the right edge
  const glyphs: { href: string; x: number; y: number; w: number; h: number }[] = [];
  let x = 0, prev = 0;
  for (const ch of text) {
    if (ch === ",") {
      // the comma's cell is 26 x 51 art px, its mark at x 2-24, y 25-50
      glyphs.push({ href: "comma", x: prev + DS.commaAt - 2 * DS.comma, y: top + 48 * DS.digit + 4 - 50 * DS.comma, w: 26 * DS.comma, h: 51 * DS.comma });
      x += DS.commaAdv;
      continue;
    }
    glyphs.push({ href: `num_${ch}`, x, y: top, w: 42 * DS.digit, h: 51 * DS.digit });
    prev = x;
    x += DS.adv;
  }
  const shift = props.width - DS.right - (prev + 40 * DS.digit);
  return (
    <g className="damage-score" aria-label={`Damage Score ${text}`}>
      <image href="game-ui/pbattle_label_ar_damage_score.png" x={DS.left} y={props.height - DS.labelTop} width={200 * DS.label} height={36 * DS.label} />
      {glyphs.map((g, i) => (
        <image key={i} href={`game-ui/assault_rumble_result_score_${g.href}.png`} x={g.x + shift} y={g.y} width={g.w} height={g.h} />
      ))}
    </g>
  );
}
