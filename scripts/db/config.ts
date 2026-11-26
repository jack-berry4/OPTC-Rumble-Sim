/** Paths and source locations for the unit database (docs/DATABASE.md). */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Committed database outputs. */
export const DATA = join(ROOT, "data");
/** The database the app loads (one unit per line). */
export const UNITS_FILE = join(DATA, "units.json");
/** Game-side text (special / super special descriptions per level); not loaded by the app. */
export const GAME_TEXT_FILE = join(DATA, "game-text.json");
/** Source versions of the last build: read by the update check. */
export const SOURCES_FILE = join(DATA, "sources.json");
/** Hand-kept known values (e.g. from battle captures), merged into units by the build. */
export const KNOWN_DIR = join(DATA, "known");
export const REPORTS = join(DATA, "reports");
/** Downloads (not committed). */
export const CACHE = join(ROOT, ".cache");

export const OPTCDB_REPO = "2Shankz/optc-db.github.io";
export const OPTCDB_BRANCH = "master";
export const OPTCDB_FILES = ["rumble.json", "units.js", "families.js", "tags.js", "details.js", "flags.js", "cooldowns.js", "aliases.js", "evolutions.js"] as const;
export const optcdbRawUrl = (ref: string, file: string) => `https://raw.githubusercontent.com/${OPTCDB_REPO}/${ref}/common/data/${file}`;

/**
 * The game's decrypted master database tool folder (sakura.db, motion_ssd/motion_manifest.csv). Read-only.
 * Override with OPTC_GAME_DIR.
 */
export const GAME_DIR = resolve(process.env.OPTC_GAME_DIR ?? join(ROOT, "..", "OPTC Decomp", "master_db_tool"));
export const SAKURA_DB = join(GAME_DIR, "sakura.db");
export const MOTION_MANIFEST = join(GAME_DIR, "motion_ssd", "motion_manifest.csv");
/**
 * Decoded attack timings, one row per .ssd (`python -I tools/ssd/batch.py`; git-ignored, needs the game folder).
 * Override with OPTC_SSD_TIMINGS. Missing: the build keeps the last build's `game.attack` values.
 */
export const SSD_TIMINGS = resolve(process.env.OPTC_SSD_TIMINGS ?? join(ROOT, "tools", "ssd", "out", "ssd_timings.csv"));

/** True when the module at `url` is the script being run (not imported). */
export const isMain = (url: string) => !!process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(url).toLowerCase();
