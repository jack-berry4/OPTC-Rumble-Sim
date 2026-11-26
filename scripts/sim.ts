/**
 * Command-line battle runner.
 *
 *   npm run sim                              # default teams, one battle with log + 1000-battle win rate
 *   npm run sim -- --atk 1,2,3,4,5,6,7,8 --def 9,10,11,12,13 --n 5000 --seed 7 --log
 *   npm run sim -- --vary timing            # which randomness varies: all | game | special | timing | dice
 */
import { loadNodeDb } from "../src/sim/nodeDb";
import { simulateBattle } from "../src/sim/battle";
import { simulateMany, type Vary } from "../src/sim/simulate";
import { teamCost } from "../src/engine/team";
import type { TeamConfig } from "../src/engine/types";
import { DEFAULT_RULES } from "../src/engine/rules";
import { defaultTeams } from "../src/engine/defaultTeams";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const toTeam = (ids: string, name: string): TeamConfig => ({
  name,
  members: ids.split(",").map((s) => ({ unitId: Number(s.trim()) })),
});

const db = loadNodeDb();
const samples = defaultTeams();
const atk = arg("atk") ? toTeam(arg("atk")!, "Attackers") : samples[0]!;
const def = arg("def") ? toTeam(arg("def")!, "Defenders") : samples[1]!;
const n = Number(arg("n") ?? 1000);
const seed = Number(arg("seed") ?? 1);

for (const [label, team] of [["Attackers", atk], ["Defenders", def]] as const) {
  console.log(`${label} (cost ${teamCost(db, team)}):`);
  team.members.forEach((m, i) => {
    if (!m) return;
    const u = db.byId.get(m.unitId)!;
    console.log(`  ${i < 5 ? `slot ${i + 1}` : `bench ${i - 4}`}: ${u.id} ${u.name} [${u.style}] HP ${u.stats.hp} ATK ${u.stats.atk} DEF ${u.stats.def} SPD ${u.stats.spd}`);
  });
}

const rules = process.argv.includes("--no-rules") ? [] : DEFAULT_RULES;
const one = simulateBattle(db, atk, def, { seed, rules });
console.log(`\nBattle seed ${seed}: ${one.winner === "atk" ? "attackers" : "defenders"} win (${one.reason}) at ${one.time.toFixed(1)}s, ${one.decisions.length} random draws`);
if (process.argv.includes("--log")) for (const e of one.events) console.log(`  ${e.t.toFixed(1).padStart(5)}s  ${e.text}`);
console.log("  unit                                  HP left    dealt   taken  healed  acts  sp  KOs");
for (const u of one.units) {
  console.log(`  ${u.uid.padEnd(5)} ${u.name.slice(0, 30).padEnd(31)} ${String(u.hp).padStart(7)} ${String(u.damageDealt).padStart(8)} ${String(u.damageTaken).padStart(7)} ${String(u.healingDone).padStart(7)} ${String(u.actions).padStart(5)} ${String(u.specials).padStart(3)} ${String(u.kos).padStart(4)}`);
}

const t0 = performance.now();
const vary = (arg("vary") ?? "all") as Vary;
const s = simulateMany(db, atk, def, n, 0, rules, seed, vary);
const ms = performance.now() - t0;
console.log(`\n${n} battles in ${(ms / 1000).toFixed(1)}s: attacker win rate ${(s.winRate * 100).toFixed(1)}% ± ${(s.margin * 100).toFixed(1)}% (95%), SE ${(s.se * 100).toFixed(2)}%, vary ${vary}`);
console.log(`  avg end ${s.avgTime.toFixed(1)}s, timeouts ${s.timeouts}, avg units left atk ${s.avgAttackersLeft.toFixed(2)} / def ${s.avgDefendersLeft.toFixed(2)}`);
const un = Object.entries(s.unsupported).sort((a, b) => b[1] - a[1]);
if (un.length) console.log(`  unsupported effects skipped: ${un.map(([k, v]) => `${k}×${v}`).join(", ")}`);
