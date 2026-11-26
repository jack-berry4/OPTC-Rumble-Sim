/**
 * Copies the per-character battle fields of a real Rumble battle capture (the server's battle-start response, e.g.
 * OPTC Decomp/rumble.json) into data/known/, where the database build picks them up as known values.
 *
 *   npx tsx scripts/db/capture.ts <capture.json> [name]
 *
 * Only fields the game's master database does not have are kept for the units, plus unit_size / combo /
 * movement_speed to check them against the game data.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { KNOWN_DIR } from "./config";

export interface CaptureUnit {
  serverId: number; side: "ally" | "enemy"; name: string;
  unit_size: number; combo: number; movement_speed: number;
  attack_destination: number; attack_destination_offset: number; tap_difficulty: string;
  hit_effect_ssd: string; hit_effect_texture: string; motion_ssd_prefix: string;
}
export interface KnownFile { source: string; units: CaptureUnit[] }

function main() {
  const [path, name] = process.argv.slice(2);
  if (!path) throw new Error("usage: tsx scripts/db/capture.ts <capture.json> [name]");
  const cap = JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
  const started = new Date(1000 * Number(cap.started_at)).toISOString();
  const units: CaptureUnit[] = [];
  for (const side of ["ally", "enemy"] as const) {
    for (const c of cap[side]?.deck_characters ?? []) {
      units.push({
        serverId: c.character_id, side, name: c.name,
        unit_size: c.unit_size, combo: c.combo, movement_speed: c.movement_speed,
        attack_destination: c.attack_destination, attack_destination_offset: c.attack_destination_offset,
        tap_difficulty: c.tap_difficulty, hit_effect_ssd: c.hit_effect_ssd, hit_effect_texture: c.hit_effect_texture,
        motion_ssd_prefix: c.motion_ssd_prefix,
      });
    }
  }
  const file: KnownFile = {
    source: `battle capture ${basename(path)} (user_pirates_arena_battle_id ${cap.user_pirates_arena_battle_id}, started ${started})`,
    units,
  };
  mkdirSync(KNOWN_DIR, { recursive: true });
  const out = join(KNOWN_DIR, `${name ?? `capture-${started.slice(0, 10)}`}.json`);
  writeFileSync(out, JSON.stringify(file, null, 1) + "\n");
  console.log(`Wrote ${units.length} units to ${out}`);
}

main();
