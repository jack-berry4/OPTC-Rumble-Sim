/// <reference lib="webworker" />
import type { UnitRecord } from "./data/schema";
import { mergeSummaries, simulateMany, type RunModeOptions, type Vary, type WinRateSummary } from "./sim/simulate";
import type { GlobalRule } from "./engine/rules";
import type { TeamConfig } from "./engine/types";

/** One worker's share of a win-rate run: battles start, start + step, start + 2 x step, ... (several workers in parallel). */
export type WorkerRequest = {
  id: number; atk: TeamConfig; def: TeamConfig; battles: number; seed: number; rules: GlobalRule[];
  vary: Vary; start: number; step: number;
  /** Game mode settings (Grand Party / Assault Rumble) and the Assault Rumble scoring. */
  modeOpts?: RunModeOptions;
  /** Just the records of the units in the two teams (workers don't load the whole database). */
  units: UnitRecord[];
};
export type WorkerResponse =
  | { id: number; type: "progress"; done: number; summary: WinRateSummary }
  | { id: number; type: "done"; summary: WinRateSummary }
  | { id: number; type: "error"; message: string };

/** Progress goes out at most every UPDATE_MS, so the page shows the win rate live. */
const UPDATE_MS = 100;

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, atk, def, battles, seed, rules, vary, start, step, units, modeOpts } = ev.data;
  const db = { byId: new Map(units.map((u) => [u.id, u])) };
  try {
    let merged: WinRateSummary | undefined;
    let last = 0;
    let done = 0;
    for (let i = start; i < battles; i += step) {
      const s = simulateMany(db, atk, def, 1, i, rules, seed, vary, modeOpts);
      merged = merged ? mergeSummaries(merged, s) : s;
      done++;
      const now = performance.now();
      if (now - last >= UPDATE_MS) {
        last = now;
        self.postMessage({ id, type: "progress", done, summary: merged } satisfies WorkerResponse);
      }
    }
    if (merged) self.postMessage({ id, type: "done", summary: merged } satisfies WorkerResponse);
    else self.postMessage({ id, type: "done", summary: simulateMany(db, atk, def, 0, 0, rules, seed, vary, modeOpts) } satisfies WorkerResponse);
  } catch (e) {
    self.postMessage({ id, type: "error", message: String(e) } satisfies WorkerResponse);
  }
};
