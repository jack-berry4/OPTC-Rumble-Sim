import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evadeIcon, iconFiles, statIcon, statusIcon } from "./statusIcons";

describe("status icons", () => {
  it("every mapped file is in public/game-ui/status/", () => {
    const dir = join(process.cwd(), "public", "game-ui", "status");
    const missing = iconFiles().filter((f) => !existsSync(join(dir, f)));
    expect(missing).toEqual([]);
  });

  it("stat levels pick the up or down icon; unmapped names have none", () => {
    expect(statIcon("ATK", 3)).toBe("game-ui/status/atk_up.png");
    expect(statIcon("Special CT", -2)).toBe("game-ui/status/ct_down.png");
    expect(statIcon("ATK", 0)).toBeUndefined();
    expect(statusIcon("Damage Over Time")).toBe("game-ui/status/dot.png");
    expect(statusIcon("Immune: Paralysis")).toBe("game-ui/status/paralysis.png");
    expect(statusIcon("Half Stats")).toBe("game-ui/status/half_stats.png");
    expect(statusIcon("Half ATK")).toBe("game-ui/status/half_stats.png");
    expect(statusIcon("Ability Bind")).toBe("game-ui/status/ability_bind.png");
    expect(statusIcon("Haste")).toBeUndefined();
  });

  it("an Evade / immunity gets the game's shield icon where it has one", () => {
    expect(evadeIcon("Paralysis")).toBe("game-ui/status/evade_paralysis.png");
    expect(evadeIcon("Damage Ignoring DEF")).toBe("game-ui/status/evade_ignore_def.png");
    expect(evadeIcon("Provoke")).toBeUndefined();
  });
});
