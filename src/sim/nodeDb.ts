/** Load the unit database in Node (scripts, benchmarks); the app uses src/data/unitDb.ts. */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUnitDb, type CustomUnitFile } from "../data/buildDb";

export function loadNodeDb() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
  // the unit database (docs/DATABASE.md)
  const imported = JSON.parse(readFileSync(join(root, "..", "..", "data", "units.json"), "utf8"));
  const custom: CustomUnitFile[] = readdirSync(join(root, "custom")).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(root, "custom", f), "utf8")));
  return buildUnitDb(imported.units, custom);
}
