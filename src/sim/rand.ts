/**
 * Randomness (handoff section 1). One main seed; every draw is addressed by what it is, never by when it happens:
 *   value = hash(streamSeed(purpose), side, slot, ...address)
 * so a unit's 1st special always picks the same targets and lands the same chances, whatever moment it fires, and
 * changing one stream (timing, say) leaves the others untouched. Every draw can be logged and forced from outside.
 */

export type Purpose = "special" | "timing" | "dice";

/** Seeds per stream. Built from the main seed unless one is given explicitly (win-rate experiments hold some fixed). */
export interface StreamSeeds { special: number; timing: number; dice: number }

export function streamSeeds(seed: number, over?: Partial<StreamSeeds>): StreamSeeds {
  return {
    special: over?.special ?? mix(seed, 0x5eed01),
    timing: over?.timing ?? mix(seed, 0x5eed02),
    dice: over?.dice ?? mix(seed, 0x5eed03),
  };
}

/** 32-bit integer mix (murmur3 finalizer of a ^ rotated b). */
export function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Uniform [0, 1) from a seed and an address of integers. */
export function hashUnit(seed: number, addr: readonly number[]): number {
  let h = seed >>> 0;
  for (let i = 0; i < addr.length; i++) h = mix(h, (addr[i]! | 0) + i * 0x632be5ab);
  return h / 4294967296;
}

/** One random draw, as logged. `addr` is (unit, kind, counters...) in readable form. */
export interface Draw {
  stream: Purpose;
  unit: string;
  /** e.g. "special#2 eff3 chance", "attack#7 guard", "return#4". */
  what: string;
  /** Probability of "yes" for a chance roll, or the number of options for a choice. */
  p?: number;
  options?: number;
  value: number;
  forced?: boolean;
}

/** Return a value to force a draw (0/1 for a chance roll, an option index for a choice), or undefined. */
export type ForceDraw = (d: Omit<Draw, "value" | "forced">) => number | undefined;

const KIND_CODES = new Map<string, number>();
const code = (s: string) => {
  let c = KIND_CODES.get(s);
  if (c === undefined) {
    c = 0;
    for (let i = 0; i < s.length; i++) c = mix(c, s.charCodeAt(i));
    KIND_CODES.set(s, c);
  }
  return c;
};

export class Dice {
  readonly log: Draw[] | undefined;
  constructor(readonly seeds: StreamSeeds, record: boolean, private readonly force?: ForceDraw) {
    this.log = record ? [] : undefined;
  }

  /** Uniform [0,1) for (stream, unit key, kind, counters). */
  u(stream: Purpose, unitKey: number, kind: string, a = 0, b = 0, c = 0): number {
    return hashUnit(this.seeds[stream], [unitKey, code(kind), a, b, c]);
  }

  /** A yes/no roll with probability p (0-1). */
  chance(stream: Purpose, unitKey: number, unit: string, kind: string, p: number, a = 0, b = 0, c = 0): boolean {
    if (p <= 0 && !this.force) return false;
    if (p >= 1 && !this.force) return true;
    let v = this.u(stream, unitKey, kind, a, b, c) < p ? 1 : 0;
    let forced = false;
    if (this.force) {
      const f = this.force({ stream, unit, what: label(kind, a, b, c), p });
      if (f !== undefined) { v = f ? 1 : 0; forced = true; }
    }
    this.log?.push({ stream, unit, what: label(kind, a, b, c), p, value: v, forced: forced || undefined });
    return v === 1;
  }

  /** Pick one of n options (uniform). */
  choose(stream: Purpose, unitKey: number, unit: string, kind: string, n: number, a = 0, b = 0, c = 0): number {
    if (n <= 1 && !this.force) return 0;
    let v = Math.floor(this.u(stream, unitKey, kind, a, b, c) * n);
    let forced = false;
    if (this.force) {
      const f = this.force({ stream, unit, what: label(kind, a, b, c), options: n });
      if (f !== undefined && f >= 0 && f < n) { v = f; forced = true; }
    }
    this.log?.push({ stream, unit, what: label(kind, a, b, c), options: n, value: v, forced: forced || undefined });
    return v;
  }
}

const label = (kind: string, a: number, b: number, c: number) => `${kind}#${a}${b ? `.${b}` : ""}${c ? `.${c}` : ""}`;

/** Unit key used in addresses: side and fixed slot (0-7), so draws don't depend on who is alive. */
export const unitKey = (side: "atk" | "def", slot: number) => (side === "atk" ? 0 : 16) + slot;
