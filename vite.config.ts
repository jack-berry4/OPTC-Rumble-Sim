/// <reference types="vitest/config" />
import { existsSync, readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The unit data's version folder (scripts/db/split.ts writes it before dev / build; "none" before the first split, e.g.
// in tests, which read data/units.json directly).
const versionFile = new URL("./public/data/version.json", import.meta.url);
const dataVersion = existsSync(versionFile) ? (JSON.parse(readFileSync(versionFile, "utf8")) as { v: string }).v : "none";

/** How fresh each data source is, for the footer (only the dates: data/sources.json also holds file stamps). */
const readJson = (f: string) => { try { return JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8")); } catch { return undefined; } };
const sources = readJson("./data/sources.json");
const dataDates = {
  units: sources?.optcdb?.date?.slice(0, 10),
  game: sources?.game?.dataTimestamp?.slice(0, 10),
  sheet: readJson("./src/engine/nydato-comps.json")?.updated?.["2A. META TEAMS COMPS"],
  meta: readJson("./src/engine/rumble-meta.json")?.generated,
};

/** The built page starts downloading the unit index at once, alongside the app code (src/data/unitDb.ts fetches it). */
const preloadUnitIndex = (): Plugin => ({
  name: "preload-unit-index",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "link", attrs: { rel: "preload", href: `data/${dataVersion}/units-index.json`, as: "fetch", crossorigin: "" }, injectTo: "head" },
  ],
});

// base "./" so the build works from any folder or subpath.
export default defineConfig({
  base: "./",
  plugins: [react(), preloadUnitIndex()],
  define: { __DATA_VERSION__: JSON.stringify(dataVersion), __DATA_DATES__: JSON.stringify(dataDates) },
  // .claude/worktrees holds other branches' checkouts: their tests aren't this branch's
  test: { exclude: ["**/node_modules/**", ".claude/**"] },
});
