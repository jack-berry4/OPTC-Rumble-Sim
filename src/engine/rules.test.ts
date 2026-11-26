import { describe, expect, it } from "vitest";
import { loadNodeDb as loadUnitDb } from "../sim/nodeDb";
import { APP_DEFAULT_RULES, describeRule, ruleMatches, type GlobalRule } from "./rules";

const db = loadUnitDb();

describe("global rules", () => {
  it("a crew-tag rule can list several tags: a unit with any of them counts", () => {
    const wano = db.all.find((u) => u.tags.includes("Land of Wano Arc") && !u.tags.includes("Elbaph Arc"))!;
    const one: GlobalRule = { enabled: true, side: "both", target: { by: "tag", value: "Elbaph Arc" }, effect: { kind: "both", percent: 20 } };
    const two: GlobalRule = { ...one, target: { ...one.target, also: ["Land of Wano Arc"] } };
    expect(ruleMatches(one, wano, "atk")).toBe(false);
    expect(ruleMatches(two, wano, "atk")).toBe(true);
    expect(describeRule(two)).toBe("[Elbaph Arc] / [Land of Wano Arc] units: deal 20% more damage and take 20% less damage");
  });
  it("first visit: only the game's last-30-s rule", () => {
    expect(APP_DEFAULT_RULES.map((r) => r.effect.kind)).toEqual(["game"]);
  });
});
