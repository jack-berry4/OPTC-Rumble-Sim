/**
 * The meta run (docs/META_PLAN.md). Bundled into one file that runs with plain Node, with no packages to install:
 *
 *   npm run meta:bundle                        # -> .cache/meta-dist/meta.mjs
 *   node .cache/meta-dist/meta.mjs --data data --custom src/data/custom --out .cache/meta [--workers 12] [--small]
 *
 * --data: the folder with units.json; --custom: the custom units (default <data>/custom); --out: where everything
 * measured, the status file (status.json) and the log (meta.log) go; --workers: worker threads (default: all but 4);
 * --small: a quick test (300 items, few teams); --stop-after N: end after stage N (1-3); --league-iters N: the
 * league's iteration limit (default 30); --seasons: the Assault
 * seasons file (default <data>/assault-seasons.json, from public/game/). Stop with Ctrl+C or SIGTERM: what's measured is kept, and the same
 * command picks up from there.
 */
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { loadDb, makeItems, readJson, Status, writeJson } from "./common";
import { unsupportedItems } from "./unsupported";
import { rumbleStats } from "../../src/engine/stats";
import { Pool, runJob, type Job } from "./pool";
import { stage1, STAGE1_DEFAULTS } from "./stage1";
import { stage2, STAGE2_DEFAULTS, type LeagueFinal } from "./stage2";
import { stage3, SUBS_DEFAULTS } from "./stage3";
import { assaultStage, ASSAULT_DEFAULTS } from "./assault";
import type { AssaultSeasons } from "../../src/engine/gameKit";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function workerMain() {
  const { data, custom } = workerData as { data: string; custom: string };
  const db = loadDb(data, custom);
  parentPort!.on("message", (j: Job) => parentPort!.postMessage(runJob(db, j)));
  parentPort!.postMessage("ready");
}

async function main() {
  const data = resolve(arg("data") ?? "data");
  const custom = resolve(arg("custom") ?? join(data, "custom"));
  const out = resolve(arg("out") ?? ".cache/meta");
  const small = process.argv.includes("--small");
  const workers = Number(arg("workers") ?? Math.max(1, availableParallelism() - 4));
  const status = new Status(out, workers);
  let stopping = false;
  const stopNow = () => {
    if (stopping) process.exit(1);
    stopping = true;
    status.log("stop asked: finishing the batches in flight (again to quit at once)");
  };
  process.on("SIGINT", stopNow);
  process.on("SIGTERM", stopNow);

  status.log(`meta run: ${workers} workers, data ${data}, out ${out}${small ? " (small test)" : ""}, node ${process.version}`);
  const db = loadDb(data, custom);
  let items = makeItems(db);
  if (small) items = items.filter((_, i) => i % Math.ceil(items.length / 300) === 0);
  // a build whose stats aren't real numbers can't be simulated (e.g. a NaN HP never goes down: found 2026-11-24)
  const broken = items.filter((it) => { const s = rumbleStats(db.byId.get(it.unitId)!, it.m); return ![s.hp, s.atk, s.rcv].every(Number.isFinite); });
  if (broken.length) {
    status.log(`WARNING ${broken.length} items have stats that aren't numbers, left out: ${broken.map((i) => i.key).join(", ")}`);
    writeJson(join(out, "broken.json"), broken.map((i) => i.key));
    items = items.filter((it) => !broken.includes(it));
  }
  status.log(`${items.length} items (unit + build) from ${new Set(items.map((i) => i.unitId)).size} units of 5★ and up`);
  writeJson(join(out, "items.json"), items.map((i) => ({ key: i.key, unitId: i.unitId, build: i.build, cost: i.cost })));
  // the items the simulator can't judge (kept whatever they score); once, in the main thread (a few minutes)
  const unsupportedPath = join(out, "unsupported.json");
  if (!readJson(unsupportedPath)) {
    status.set({ stage: 0, phase: "unsupported check", note: "Finding the units the simulator can't judge yet" });
    const found = unsupportedItems(db, items, small ? 1 : 3, (s) => status.log(s));
    writeJson(unsupportedPath, found);
    status.log(`unsupported check: ${Object.keys(found).length} items skip something (kept whatever they score)`);
  }
  if (process.argv.includes("--only-check")) return;

  const pool = new Pool(fileURLToPath(import.meta.url), workers, { data, custom });
  await pool.start();
  status.log("workers ready");
  try {
    const cfg = small ? { ...STAGE1_DEFAULTS, appear: 8, per: 2, nOpp: 3, stopAt: 60, topTeams: 6, topPer: 4 } : STAGE1_DEFAULTS;
    const s1 = await stage1({ db, items, pool, out, status, cfg, stop: () => stopping });
    if (!s1?.done) return stopped(status);
    status.log(`stage 1 finished after ${s1.round} rounds: ${s1.alive.atk.length} attack items, ${s1.alive.def.length} defense items`);
    if (Number(arg("stop-after") ?? 99) <= 1) return;

    const cfg2Base = small ? { ...STAGE2_DEFAULTS, pairN: 10, step: 4, final: 12, beam: 1, shortlist: 8, variantsOf: 3, maxIters: 2, themes: 3, themeN: 6, themeShortlist: 8, themeStep: 4, themeFinal: 8 } : STAGE2_DEFAULTS;
    // --league-iters N: a league that stopped at the iteration limit goes on to N (then delete stage2/final.json and
    // stage3/, which were made from the earlier mix)
    const cfg2 = arg("league-iters") ? { ...cfg2Base, maxIters: Number(arg("league-iters")) } : cfg2Base;
    const s2 = await stage2({ db, items, s1, s1Dir: join(out, "stage1"), pool, out, status, cfg: cfg2, stop: () => stopping });
    if (!s2) return stopped(status);
    status.log(`stage 2 finished after ${s2.iter} iterations${s2.done ? "" : " (iteration limit)"}`);
    const league = readJson<LeagueFinal>(join(out, "stage2", "final.json"))!;
    if (Number(arg("stop-after") ?? 99) <= 2) return;

    const subsCfg = small ? { ...SUBS_DEFAULTS, step: 4, keep: 4 } : SUBS_DEFAULTS;
    const ok3 = await stage3({ db, pool, items, alive: s1.alive, league, weights: { atk: league.x, def: league.y }, out, status, cfg: subsCfg, minWeight: 0.03, stop: () => stopping });
    if (!ok3) return stopped(status);
    status.log("stage 3 finished");
    if (Number(arg("stop-after") ?? 99) <= 3) return;

    const seasonsPath = resolve(arg("seasons") ?? join(data, "assault-seasons.json"));
    const seasons = readJson<AssaultSeasons>(seasonsPath);
    if (!seasons) { status.log(`WARNING no Assault seasons at ${seasonsPath}: Assault skipped`); return; }
    const leagueAtk = league.x.map((w, i) => ({ w, i })).filter((e) => e.w >= 0.03).sort((a, b) => b.w - a.w).map((e) => league.teams.atk[e.i]!);
    const cfgA = small ? { ...ASSAULT_DEFAULTS, appear: 4, per: 3, stopAt: 40, step: 3, final: 6, beam: 1, shortlist: 6, variantsOf: 2, themeN: 3, themeStarts: 2, themeShortlist: 1, subs: { ...ASSAULT_DEFAULTS.subs, step: 3, keep: 3 } } : ASSAULT_DEFAULTS;
    const smallSeasons = small ? { ...seasons, seasons: seasons.seasons.slice(-1) } : seasons;
    const okA = await assaultStage({ db, pool, items, seasons: smallSeasons, leagueAtk, out, status, cfg: cfgA, stop: () => stopping });
    if (!okA) return stopped(status);
    status.set({ stage: "done", phase: "finished", note: "All stages finished" });
    status.log("all stages finished");
  } finally {
    await pool.stop();
  }
}

function stopped(status: Status) {
  status.set({ phase: "stopped", note: "Stopped: run the same command again to go on" });
  status.log("stopped");
}

if (isMainThread) {
  main().catch((e) => { console.error(e); process.exit(1); });
} else {
  workerMain();
}
