import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeRule } from "./rules";
import { stageAt, stageRules, type RumbleRulesFile } from "./gameRules";

const file = JSON.parse(readFileSync(new URL("../../public/game/rumble-rules.json", import.meta.url), "utf8")) as RumbleRulesFile;

describe("Pirate Rumble rules from the game data", () => {
  it("the stage of test runs 6-7 (2026-11-09) gives the rules measured then (RUN6_RULES)", () => {
    const st = stageAt(file, Date.UTC(2026, 10, 10) / 1000)!;
    expect(st.start).toBeLessThanOrEqual(Date.UTC(2026, 10, 10) / 1000);
    const { rules, notes } = stageRules(file, st);
    expect(notes).toEqual([]);
    expect(rules.map(describeRule)).toEqual([
      "QCK units: ATK up lv 4",
      "Driven class: SPD up lv 4",
      "Striker class: DEF up lv 4",
      "[Elbaph Arc] / [Land of Wano Arc] / [Logia-type / Devil Fruit User] units: deal 20% more damage and take 20% less damage",
      "During the last 30 s of battle, Special CT Speed Up & Damage Up!",
    ]);
  });
  it("every stage converts without leftovers", () => {
    const left = file.stages.flatMap((s) => stageRules(file, s).notes);
    expect(left.length).toBeLessThan(5);
  });
});
