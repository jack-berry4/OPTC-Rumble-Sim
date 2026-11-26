import type { BattleEvent, Frame } from "../engine/types";
import type { UnitInfo } from "./Tracker";
import { SvgThumb } from "./UnitThumb";

/**
 * "Game pauses and cut-ins": the replay stops the battle clock the way the game does and plays the cut-in.
 * - Special: a "SPECIAL ACTIVATED!" plate with the user's portrait (no full-screen cut-in), then, on the same plate,
 *   one caption per effect that went off, in order (effects whose condition failed or that had no one to apply to are
 *   skipped), then the battle resumes.
 * - Rumble in (a bench unit replacing a KO'd one): HP bars hide, the camera turns to that side and the newcomer runs
 *   in from the side of the screen to its start tile.
 * Lengths are the game's (MEASURED, `CUT` in src/sim/battle.ts, normal speed): special = intro
 * 2.07 s (the game's full-screen cut-in and close-up are left out; the plate shows instead, no camera zoom) + 1.23 s per
 * effect + outro 0.72 s (an effect lands 0.8 s into its caption); rumble in 2.03 s.
 *
 * Without pausing (Key events), a KO shows the game's "5 VS 8 -> 5 VS 7 / RUMBLE OUT" banner.
 * Graphics are the game's own (public/game-ui/pirates_arena_battle_*); the words are drawn in English.
 */
export const CUT = { intro: 2.07, part: 1.23, hit: 0.8, outro: 0.72, bench: 2.03 } as const;
const UI = "game-ui/pirates_arena_battle_";

export interface Hold {
  kind: "special" | "enter" | "end";
  t: number;
  dur: number;
  /** Special: its user. Enter: everyone coming in at this moment. */
  uids: string[];
  isSuper?: boolean;
  /** A Grand Party burst (its user is the leader, not on the field). */
  isBurst?: boolean;
  parts?: string[];
  /** Special: who each part KO'd, and the HP each part changed (uid -> HP after it). */
  partKos?: string[][];
  partHp?: Record<string, number>[];
  /** Special: who each part landed on, and what it did to them. */
  partTargets?: string[][];
  partKinds?: ("up" | "down" | "hit")[];
  partShield?: Record<string, number>[];
  partShieldHit?: Record<string, number>[];
  partOut?: string[][];
}

/**
 * The unit an "enter" event brings onto the field with a rumble-in: from the bench after a KO, back from Forced Out,
 * or switched in for a teammate (the event's target) [user 2026-11-18]. Undefined for other events.
 */
export function rumbleInUid(e: { kind: string; text: string; actor?: string; target?: string }): string | undefined {
  if (e.kind !== "enter") return undefined;
  if (/ switches with /.test(e.text)) return e.target;
  return /bench|returns to the field/.test(e.text) ? e.actor : undefined;
}

/** Every pause of a battle, in order. Units coming in at the same moment share one rumble-in. */
export function buildHolds(events: BattleEvent[]): Hold[] {
  const out: Hold[] = [];
  for (const e of events) {
    if ((e.kind === "special" || e.kind === "burst") && e.actor) {
      const parts = e.parts ?? [];
      out.push({ kind: "special", t: e.t, dur: CUT.intro + parts.length * CUT.part + CUT.outro, uids: [e.actor], isSuper: /SUPER/.test(e.text), isBurst: e.kind === "burst", parts, partKos: e.partKos, partHp: e.partHp, partTargets: e.partTargets, partKinds: e.partKinds, partShield: e.partShield, partShieldHit: e.partShieldHit, partOut: e.partOut });
    } else if (rumbleInUid(e)) {
      const uid = rumbleInUid(e)!;
      const last = out.at(-1);
      if (last?.kind === "enter" && Math.abs(last.t - e.t) < 1e-6) last.uids.push(uid);
      else out.push({ kind: "enter", t: e.t, dur: CUT.bench, uids: [uid] });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** When, into a special's pause, the part that KO'd `uid` lands (undefined: not KO'd by it). */
export function koLanding(h: Hold, uid: string): number | undefined {
  const k = h.partKos?.findIndex((list) => list.includes(uid)) ?? -1;
  return k < 0 ? undefined : CUT.intro + k * CUT.part + CUT.hit;
}

/** How many of a special's parts have landed `el` seconds into its pause. */
export function partsLanded(h: Hold, el: number): number {
  const n = h.parts?.length ?? 0;
  return Math.max(0, Math.min(n, Math.floor((el - CUT.intro - CUT.hit) / CUT.part) + 1));
}

/**
 * The replay's timeline with the pauses in it ("presentation time"): battle time plus every pause played so far.
 * `cur` = the pause playing (or the next one to come when none is), `el` = how far into it.
 */
export function pauseClock(holds: Hold[]) {
  const before = [0];
  for (const h of holds) before.push(before.at(-1)! + h.dur);
  const firstAt = (t: number) => { // index of the first pause at or after battle time t
    let lo = 0, hi = holds.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (holds[m]!.t < t - 1e-9) lo = m + 1; else hi = m; }
    return lo;
  };
  return {
    now: (t: number, cur: number, el: number) => t + before[cur]! + el,
    /** Length of the timeline with every pause in it, for a battle `end` seconds long. */
    total: (end: number) => end + before.at(-1)!,
    /**
     * Where presentation time p falls: battle time `t`, and `hold` = { i, el } when p is inside pause i
     * (otherwise `next` = the first pause still to come).
     */
    toBattle: (p: number): { t: number; hold: { i: number; el: number } | null; next: number } => {
      for (let i = 0; i < holds.length; i++) {
        const start = holds[i]!.t + before[i]!;
        if (p < start - 1e-9) return { t: p - before[i]!, hold: null, next: i };
        if (p < start + holds[i]!.dur - 1e-9) return { t: holds[i]!.t, hold: { i, el: p - start }, next: i + 1 };
      }
      return { t: p - before.at(-1)!, hold: null, next: holds.length };
    },
    /** When an event at battle time t shows; a KO by a special shows when the part that did it lands. */
    at: (t: number, koUid?: string) => {
      const i = firstAt(t);
      if (koUid) {
        for (let j = i; j < holds.length && Math.abs(holds[j]!.t - t) < 1e-9; j++) {
          const land = holds[j]!.kind === "special" ? koLanding(holds[j]!, koUid) : undefined;
          if (land !== undefined) return t + before[j]! + land;
        }
      }
      return t + before[i]!;
    },
  };
}

/** Seconds a unit Forced Out by a special takes to run off the screen once that part lands. */
export const RUN_OFF = 0.6;

/** Where a unit Forced Out by a special stands, `p` (0-1) into running off: away to its own side, off the screen. */
export function runOffX(x: number, side: "atk" | "def", p: number): number {
  const q = Math.max(0, Math.min(1, p));
  return x + (side === "def" ? 1 : -1) * 900 * q * q;
}

/** Where a unit running in stands, `el` seconds into its rumble-in (from 520 px off its tile to the tile). */
export function runInX(tileX: number, side: "atk" | "def", el: number): number {
  const p = Math.max(0, Math.min(1, (el - 0.25) / 1.35));
  const ease = 1 - (1 - p) * (1 - p);
  const from = tileX + (side === "def" ? 520 : -520);
  return from + (tileX - from) * ease;
}

/** What the time readout says during a pause. */
export function holdLabel(h: Hold, el: number): string {
  if (h.kind === "enter") return "Rumble in";
  if (h.kind === "end") return "Battle over";
  const k = Math.floor((el - CUT.intro) / CUT.part);
  const n = h.parts!.length;
  const what = h.isBurst ? "GP burst" : "Special";
  return el < CUT.intro || !n ? (h.isBurst ? "GP burst" : h.isSuper ? "Super special" : "Special") : `${what} · part ${Math.min(n, k + 1)}/${n}`;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The cut-in for a pause, in screen units (the HUD's 1000 x 740 frame). */
export function CutInOverlay(props: { hold: Hold; el: number; info: Map<string, UnitInfo>; width: number; height: number }) {
  const { hold, el, info, width: W } = props;
  if (hold.kind === "end") return null; // drawn by BattleEndOverlay
  if (hold.kind === "enter") {
    return (
      <g>
        {hold.uids.map((uid, n) => {
          const i = info.get(uid);
          if (!i) return null;
          const enemy = i.side === "def";
          const slide = clamp01(el / 0.25), fade = clamp01((hold.dur - el) / 0.25);
          const pw = 256 * 1.6, ph = 128 * 1.6;
          const x = enemy ? W - pw + (1 - slide) * pw : -(1 - slide) * pw;
          const y = 200 + n * 130;
          return (
            <g key={uid} transform={`translate(${x},${y})`} opacity={fade}>
              <image href={`${UI}inout_in_bg${enemy ? "_enemy" : ""}.png`} width={pw} height={ph} />
              {/* centred on the plate's visible part (x 57-255 enemy / 0-197 yours, of 256) */}
              <SvgThumb id={i.unitId} size={88} x={(enemy ? 250 : 158) - 44} y={12} />
              <text x={enemy ? 250 : 158} y={134} className="cut-rumble-in" textAnchor="middle">RUMBLE IN!</text>
            </g>
          );
        })}
      </g>
    );
  }
  const uid = hold.uids[0]!;
  const i = info.get(uid);
  if (!i) return null;
  const enemy = i.side === "def";
  const parts = hold.parts ?? [];
  // one plate: "SPECIAL ACTIVATED!" with the user's portrait, then each effect that went off, in order; the last one
  // stays through the outro
  const k = el < CUT.intro || !parts.length ? -1 : Math.min(parts.length - 1, Math.floor((el - CUT.intro) / CUT.part));
  const into = el - CUT.intro - k * CUT.part;
  const pop = clamp01(el / 0.18);
  const fade = el > hold.dur - CUT.outro ? clamp01((hold.dur - el) / CUT.outro) : 1;
  const pw = 720, ph = 104;
  const caption = k >= 0 ? wrap(parts[k]!) : [];
  return (
    // centred, but clear of the NEXT column on the left
    <g transform={`translate(${Math.max(160, (W - pw) / 2)},96)`} opacity={fade * pop}>
      <image href={`${UI}skillname_frame.png`} x={0} y={-ph * (22 / 84)} width={pw} height={ph * (128 / 84)} preserveAspectRatio="none" />
      <g className={enemy ? "cut-portrait-def" : "cut-portrait-atk"}>
        <SvgThumb id={i.unitId} size={80} x={12} y={(ph - 80) / 2} />
        <rect x={12} y={(ph - 80) / 2} width={80} height={80} rx={6} className="cut-portrait-frame" />
      </g>
      <text x={108} y={k >= 0 ? 30 : 48} className={`cut-activated ${hold.isSuper ? "cut-super" : ""}`}>
        {`${hold.isBurst ? "GP BURST" : hold.isSuper ? "SUPER SPECIAL" : "SPECIAL"} ACTIVATED!`}
        {k >= 0 && <tspan className="cut-part-count">{`  ${k + 1}/${parts.length}`}</tspan>}
      </text>
      {k < 0 && <text x={108} y={76} className="cut-name-small">{`${i.tag} ${i.name}`}</text>}
      {k >= 0 && (
        <text x={108} y={caption.length > 1 ? 58 : 70} className={`cut-part ${into >= CUT.hit ? "landed" : ""}`}>
          {caption.map((line, n) => <tspan key={n} x={108} dy={n ? 25 : 0}>{line}</tspan>)}
        </text>
      )}
    </g>
  );
}

/** A caption on at most two lines of ~56 characters. */
function wrap(s: string, n = 56): string[] {
  if (s.length <= n) return [s];
  const cut = s.lastIndexOf(" ", n);
  const a = s.slice(0, cut > 20 ? cut : n), b = s.slice(a.length).trim();
  return [a, b.length > n ? b.slice(0, n - 1) + "…" : b];
}

/** A KO's "5 VS 8 -> 5 VS 7 / RUMBLE OUT" banner (no pause), for 1.8 s after the KO. */
export function RumbleOutBanner(props: {
  koUid: string; el: number; before: Record<"atk" | "def", number>; after: Record<"atk" | "def", number>;
  info: Map<string, UnitInfo>; width: number;
  /** Shift down (under a special's plate). */
  dy?: number;
}) {
  const i = props.info.get(props.koUid);
  if (!i) return null;
  const enemy = i.side === "def";
  const counts = props.el < 0.5 ? props.before : props.after;
  const fade = clamp01((1.8 - props.el) / 0.3) * clamp01(props.el / 0.15);
  const W = props.width;
  const pw = 512 * 0.9, ph = 126 * 0.9;
  // the plate's visible part is x 152-510 (enemy) / 1-355 (yours) of 512: keep it all on screen, at that side's edge
  const px = enemy ? W - 510 * 0.9 : 0;
  const vsX = enemy ? W * 0.42 : W * 0.58;
  return (
    <g opacity={fade} className="rumble-out" transform={`translate(0,${props.dy ?? 0})`}>
      <g transform={`translate(${vsX},150)`}>
        <text x={-60} y={22} className="cut-count cut-count-atk">{counts.atk}</text>
        <image href={`${UI}inout_vs.png`} x={-40} y={-40} width={80} height={80} />
        <text x={60} y={22} className="cut-count cut-count-def">{counts.def}</text>
      </g>
      <g transform={`translate(${px},102)`}>
        <image href={`${UI}inout_out_bg${enemy ? "_enemy" : ""}.png`} width={pw} height={ph} />
        <SvgThumb id={i.unitId} size={86} x={enemy ? 150 : 222} y={13} />
        <text x={enemy ? 244 : 214} y={74} className="cut-rumble-out" textAnchor={enemy ? "start" : "end"}>RUMBLE OUT</text>
      </g>
    </g>
  );
}

/** Units left per team just before time t. */
export function teamsLeft(frame: Frame | undefined, info: Map<string, UnitInfo>): Record<"atk" | "def", number> {
  const out = { atk: 0, def: 0 };
  for (const u of frame?.units ?? []) {
    const s = info.get(u.uid)?.side;
    if (s && u.state !== "dead") out[s]++;
  }
  return out;
}
