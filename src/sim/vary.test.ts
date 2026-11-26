import { describe, expect, it } from "vitest";
import { seedsFor } from "./simulate";

describe("win-rate 'Vary' options", () => {
  it("game randomness varies specials and attack dice, and holds the guessed values (timing stream) fixed", () => {
    const a = seedsFor(1, 0, "game").seeds!, b = seedsFor(1, 1, "game").seeds!;
    expect(a.timing).toBe(b.timing);
    expect(a.special).not.toBe(b.special);
    expect(a.dice).not.toBe(b.dice);
  });
  it("only guessed values varies the timing stream alone", () => {
    const a = seedsFor(1, 0, "timing").seeds!, b = seedsFor(1, 1, "timing").seeds!;
    expect(a.timing).not.toBe(b.timing);
    expect([a.special, a.dice]).toEqual([b.special, b.dice]);
  });
});
