/**
 * Is a database update needed? Cheap: one GitHub API request and a file stat (sakura.db is only hashed when its size
 * or date changed). Compares with data/sources.json (the last build).
 *
 *   npx tsx scripts/db/check.ts          # exit code 0 = up to date, 10 = update available, 1 = error
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { MOTION_MANIFEST, SAKURA_DB, SOURCES_FILE, SSD_TIMINGS } from "./config";
import type { Sources } from "./build";
import { stampFile } from "./game";
import { latestCommit } from "./optcdb";

async function main() {
  if (!existsSync(SOURCES_FILE)) {
    console.log("No build yet (data/sources.json missing): run npx tsx scripts/db/build.ts");
    process.exit(10);
  }
  const s = JSON.parse(readFileSync(SOURCES_FILE, "utf8")) as Sources;
  const notes: string[] = [];

  const c = await latestCommit();
  if (c.sha === s.optcdb.sha) console.log(`OPTC-DB: up to date (${c.sha.slice(0, 10)}, ${c.date})`);
  else {
    console.log(`OPTC-DB: NEW COMMITS. Built from ${s.optcdb.sha.slice(0, 10)} (${s.optcdb.date}); newest ${c.sha.slice(0, 10)} (${c.date}) "${c.message}"`);
    notes.push("optcdb");
  }

  const fileChanged = (stamp: { size: number; mtime: string; sha256: string } | null | undefined, path: string) => {
    if (!existsSync(path)) return "missing";
    const st = statSync(path);
    if (stamp && st.size === stamp.size && st.mtime.toISOString() === stamp.mtime) return "same";
    return stamp && stampFile(path).sha256 === stamp.sha256 ? "same" : "changed";
  };
  const g = fileChanged(s.game?.sakuraDb, SAKURA_DB);
  if (g === "missing") console.log(`sakura.db: not found at ${SAKURA_DB} (game data stays as built)`);
  else if (g === "same") console.log(`sakura.db: unchanged (sha256 ${s.game!.sakuraDb.sha256.slice(0, 16)}...)`);
  else { console.log(`sakura.db: CHANGED since the last build (${SAKURA_DB})`); notes.push("game"); }
  const m = fileChanged(s.game?.motionManifest, MOTION_MANIFEST);
  if (m === "changed") { console.log("motion_manifest.csv: CHANGED since the last build"); notes.push("motion"); }
  const at = fileChanged(s.attackTimings, SSD_TIMINGS);
  if (at === "changed") { console.log("ssd_timings.csv (decoded attacks): CHANGED since the last build"); notes.push("attack"); }

  if (notes.length) {
    console.log(`\nUpdate available (${notes.join(", ")}): npm run db:update`);
    process.exit(10);
  }
  console.log("\nUp to date.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
