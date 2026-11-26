import { gameRule, type GlobalRule } from "../../engine/rules";

/** Test run 9 (docs/SIMULATOR_HANDOFF.md appendix A): the season's rules. */
export const RUN9_RULES: GlobalRule[] = [
  { enabled: true, side: "both", target: { by: "color", value: "QCK" }, effect: { kind: "buff", attr: "ATK", level: 4 } },
  { enabled: true, side: "both", target: { by: "class", value: "Driven" }, effect: { kind: "buff", attr: "SPD", level: 4 } },
  { enabled: true, side: "both", target: { by: "class", value: "Striker" }, effect: { kind: "buff", attr: "DEF", level: 4 } },
  { enabled: true, side: "both", target: { by: "tag", value: "Elbaph Arc" }, effect: { kind: "damage", percent: 20 } },
  { enabled: true, side: "both", target: { by: "tag", value: "Elbaph Arc" }, effect: { kind: "taken", percent: -20 } },
  { enabled: true, side: "both", target: { by: "tag", value: "Land of Wano Arc" }, effect: { kind: "damage", percent: 20 } },
  { enabled: true, side: "both", target: { by: "tag", value: "Land of Wano Arc" }, effect: { kind: "taken", percent: -20 } },
  { enabled: true, side: "both", target: { by: "tag", value: "Logia-type / Devil Fruit User" }, effect: { kind: "damage", percent: 20 } },
  { enabled: true, side: "both", target: { by: "tag", value: "Logia-type / Devil Fruit User" }, effect: { kind: "taken", percent: -20 } },
  gameRule("last30"), // the game's last-30-s rule (battle data 2026-11-13)
];
