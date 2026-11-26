import type { BattleEvent, CutIn, Frame, GameMode, Side, UnitSummary } from "../engine/types";
import type { AssaultOutcome } from "../engine/assault";
import type { GpOptions } from "../engine/gp";
import type { GlobalRule } from "../engine/rules";
import type { Draw, ForceDraw, StreamSeeds } from "./rand";
import type { TimingInfo } from "./timing";

export type { BattleEvent, CutIn, Frame, Side, UnitSummary, UnitSnapshot, StatusSnapshot } from "../engine/types";

export interface SimOptions {
  /** Main seed: every stream is derived from it unless `seeds` overrides one. */
  seed: number;
  /** Hold or vary single streams (win-rate experiments). */
  seeds?: Partial<StreamSeeds>;
  rules?: GlobalRule[];
  /** Record replay frames every this many seconds (0 = off, the default). */
  frameInterval?: number;
  /** Record the event log (default true; off for win-rate runs). */
  recordEvents?: boolean;
  /** Record every random draw (default: with events). */
  recordDraws?: boolean;
  /** Force random draws (replaying a recorded battle). */
  force?: ForceDraw;
  /** Frames and events on the real-time timeline (cut-ins stop the clock). The battle plays out the same. */
  gameTime?: boolean;
  gameSpeed?: "normal" | "fast";
  /** Game mode (default "rumble"). Grand Party uses the teams' leaders and `gp`; Assault Rumble makes the defending
   *  team bosses (`assault`). Effects marked for a mode ("During Assault Rumble ...") only work in it. */
  mode?: GameMode;
  /**
   * Assault Rumble. `immortal` (max Assault Lv; default true): a boss at 0 HP stays and takes `zeroTakenPct` % more
   * (default 50); otherwise bosses go down like any unit (lower levels: user's results, 2026-11-22).
   */
  assault?: { zeroTakenPct?: number; immortal?: boolean };
  /** Grand Party: each side's burst state and launch plan, and the boosted-leader rules. */
  gp?: GpOptions;
}

/** Grand Party: what each side's leader did. */
export interface GpSideResult {
  leaderUid: string;
  name: string;
  unitId: number;
  boosted: boolean;
  /** Burst requirement (after the boost) and uses at the start. */
  need: number;
  uses: number;
  /** Battle times the burst was launched, and whether the gauge was full each time. */
  launches: { t: number; full: boolean }[];
  /** Battle times the gauge filled up (each use). */
  readyAt: number[];
  /** Gauge progress over the battle (time, progress), one point per change. */
  trace: [number, number][];
}

export interface SimResult {
  winner: Side;
  time: number;
  reason: "wipe" | "timeout";
  gameTime: boolean;
  realTime: number;
  cutIns: CutIn[];
  units: UnitSummary[];
  events: BattleEvent[];
  frames: Frame[];
  decisions: Draw[];
  /** Effects the simulator doesn't model, with how often they were skipped. */
  unsupported: Record<string, number>;
  /** Each unit's drawn animation profile (timing stream); `windupFrom` / `firstHit` say where the wind-up came from. */
  timings: Record<string, TimingInfo & { windup: number; stay: number; reach: number }>;
  mode: GameMode;
  /** Assault Rumble: damage dealt to the bosses, HP left, whether every boss is at 0 HP (the score's parts). */
  assault?: AssaultOutcome;
  gp?: Partial<Record<Side, GpSideResult>>;
}
