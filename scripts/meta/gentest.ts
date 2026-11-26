/**
 * A check of the team generator's search (src/engine/generator.ts) with the meta run's worker pool: the same pool of
 * units and the same opponent, with the search's parts turned on one by one, and what each reaches, in how many
 * battles and how much time. Not part of the run; bundled on its own:
 *
 *   npx esbuild scripts/meta/gentest.ts --bundle --platform=node --format=esm --outfile=.cache/meta-dist/gentest.mjs
 *   node .cache/meta-dist/gentest.mjs --data data --custom src/data/custom --out .cache/meta-lab/out [--workers 12]
 */
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { generate, type GenOptions } from "../../src/engine/generator";
import type { TeamConfig } from "../../src/engine/types";
import { META, metaScore, metaTemplates } from "../../src/engine/meta";
import { loadDb, makeItems, readJson } from "./common";
import { mixEvaluate, Pool, runJob, type Job } from "./pool";
import type { LeagueFinal } from "./stage2";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };

function workerMain() {
  const { data, custom } = workerData as { data: string; custom: string };
  const db = loadDb(data, custom);
  parentPort!.on("message", (j: Job) => parentPort!.postMessage(runJob(db, j)));
  parentPort!.postMessage("ready");
}

async function main() {
  const data = resolve(arg("data") ?? "data"), custom = resolve(arg("custom") ?? join(data, "custom")), out = resolve(arg("out") ?? ".cache/meta-lab/out");
  const workers = Number(arg("workers") ?? Math.max(1, availableParallelism() - 4));
  const db = loadDb(data, custom);
  const items = makeItems(db);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const league = readJson<LeagueFinal>(join(out, "stage2", "final.json"))!;
  const team = (keys: string[]): TeamConfig => ({ members: Array.from({ length: 8 }, (_, i) => (keys[i] ? byKey.get(keys[i]!)!.m : null)) });
  // the opponents: the 3 defense teams the league's mix plays most
  const opps = league.y.map((w, i) => ({ w, i })).sort((x, y) => y.w - x.w).slice(0, Number(arg("opps") ?? 3)).map((e) => team(league.teams.def[e.i]!));
  // the pool: every relevant attack unit at MAX (or its only build)
  const ids = Object.keys(META.units.atk);
  const pool = ids.map((id) => (byKey.get(`${id}@MAX`) ?? items.find((i) => i.unitId === Number(id) && i.build.includes("MAX")) ?? items.find((i) => i.unitId === Number(id)))?.m).filter((m): m is NonNullable<typeof m> => !!m);
  // a mixed starting team: stage 1's best random attack team (the kind of start the league got stuck from)
  const s1 = readJson<{ round: number }>(join(out, "stage1", "state.json"))!;
  const lastR = readJson<{ sides: { atk: { best?: string[][]; nextOpps: string[][] } } }>(join(out, "stage1", `r${s1.round - 1}.json`))!;
  const mixedStart = team((lastR.sides.atk.best ?? lastR.sides.atk.nextOpps)[0]!);
  const p = new Pool(fileURLToPath(import.meta.url), workers, { data, custom });
  await p.start();
  const mixed = { templates: [], teams: [{ title: "mixed", team: mixedStart }] };
  const app = { templates: metaTemplates("atk", new Set(pool.map((m) => m.unitId))), teams: [] };
  const scenarios: [string, Partial<GenOptions>][] = [
    ["A. old: single changes, from a mixed team", { compounds: false, themes: false, kicks: 0, ...mixed }],
    ["N. new: + two-unit changes when stuck + themed starts", { compounds: true, themes: true, kicks: 0, ...mixed }],
    ["E. the app: meta comps + themes + two-unit changes", { compounds: true, themes: true, kicks: 0, ...app }],
    ["E4. the app + 4 kicks", { compounds: true, themes: true, kicks: 4, ...app }],
  ];
  const marks = [30, 60, 120, 240, 480];
  for (const [oi, opp] of opps.entries()) {
    console.log(`\n=== opponent ${oi + 1} ===`);
    for (const [label, opt] of scenarios) {
      const t0 = Date.now();
      let battles = 0;
      let firstAt: { battles: number; s: number } | undefined;
      const curve: { s: number; fit: number }[] = [];
      const res = await generate({
        db, pool, templates: [], teams: [], templateSource: "meta", winRate: true, step: 24, final: 400, beam: 2, shortlist: 30,
        rank: (m) => metaScore("atk", m.unitId) ?? -1,
        evaluate: mixEvaluate(p, "atk", [opp], [1], 4242 + oi, (k) => { battles += k; }),
        onProgress: (pr) => {
          const b = pr.best[0];
          if (b) curve.push({ s: (Date.now() - t0) / 1000, fit: (b.sq ?? 0) / Math.max(1, b.n) });
          if (!firstAt && pr.stage === "final") firstAt = { battles, s: (Date.now() - t0) / 1000 };
        },
        ...opt,
      });
      const top = res[0]!;
      const at = (t: number) => { const c = curve.filter((x) => x.s <= t).at(-1); return c ? `${(c.fit * 100).toFixed(0)}%` : "-"; };
      console.log(`${label}\n  best ${((top.sq ?? 0) / top.n * 100).toFixed(1)}% (${top.n} battles); ${battles.toLocaleString()} battles, ${((Date.now() - t0) / 1000).toFixed(0)} s; first result at ${firstAt?.s.toFixed(0)} s; best so far at ${marks.map((m) => `${m}s ${at(m)}`).join(", ")}`);
    }
  }
  await p.stop();
}

if (isMainThread) main().catch((e) => { console.error(e); process.exit(1); });
else workerMain();
