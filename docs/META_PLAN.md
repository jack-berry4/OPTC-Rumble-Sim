# Plan: our own Rumble meta (independent of Nydato's sheet)

Status (2026-11-24): **planned**, nothing built yet. This file is updated as the work goes (see "Progress" at the end).

## Why

The app uses Nydato's Rumble Sheet in three ways:

1. **Default teams**: the sheet's OP / SS comps on the left. **Kept** (credit + link to the sheet).
2. **Which units are relevant**: the generator's "Only those on Nydato's sheet, or newer" search keeps the units on the
   sheet's tier list or in a comp / its subs (348), plus every unit released since the sheet's oldest tab update (102).
   **To replace.**
3. **The generator's starting points**: all 29 sheet comps are its starting teams; their subs fill a missing unit
   first, and the comps' units + subs are tried first in the improvement rounds. **To replace.**

(2) and (3) are replaced by our own results, computed once by a long simulation run on this PC and shipped with the
app, the way `src/engine/nydato-comps.json` is now. The sheet stays as a **check** (do we find the same comps and
units?), not an input.

## What the run is allowed to use (user, 2026-11-24)

- **Separate metas**: attack teams, defense teams, and Assault Rumble teams.
- **Builds**: every unit at each of the four default quick builds (`DEFAULT_PRESETS` in `src/engine/stats.ts`):
  Lv 1, Lv 99, Lv 120, MAX. That covers most real boxes (a Lv 1 build also covers death-special units that should go
  down early).
- **No rules at all** (no weekly Rumble rules, no Assault season rules).
- **4★ and below are irrelevant**, without simulating them (`stars` 1, 2, 3, 4, 4+: 1,929 units). That leaves 2,738
  units (5, 5+, 6, 6+).
- **Run time**: as long as it needs, but it must leave room for Windows and for Claude to monitor it.
- **GPU**: not used (see "Hardware").

## Hardware and budget

- AMD Ryzen 7 1700 (8 cores / 16 threads), 16 GB RAM, GTX 1060 6 GB.
- One battle takes about 13 ms on one thread in Node (measured 2026-11-24, three Nydato comps, 300 battles each:
  11–17 ms). A worker with the unit database loaded uses about 170 MB.
- **12 worker threads** (4 threads left for Windows and monitoring), at below-normal process priority. With
  hyper-threading that is roughly **2.5–3 million battles an hour** (to be measured on the first run).
- **The GPU can't help.** A battle is a long chain of branching, event-driven logic (targeting, specials, conditions,
  timers), so it would run slowly on a GPU even after a full rewrite of the simulator in a GPU language. The other
  maths in the run (a regression, a small matrix game) takes seconds on the CPU.

## The run (`npm run meta`, scripts/meta/)

A Node script with a worker pool (worker_threads, each loading the database once). Every step **saves its results to
`.cache/meta/`** as it finishes, so the run can be stopped (Ctrl+C) and resumed without losing work. It writes a
progress file (`.cache/meta/status.json`: stage, battles done, battles per second, best so far, time left), so the
run can be checked while it works.

> **As built (2026-11-25): no build tiers.** The user chose mixed builds in a team: every unit at each of the four
> quick builds (Lv 1 with its Rumble special / abilities maxed, Lv 99, Lv 120, MAX) is its own item, and a team may
> mix them (one per unit). The "per tier" wording in this section and the cost table below is the first draft; what
> actually ran, and what it found, is under "Progress" at the end (including the themes step, added after the
> league got stuck in mixed-type teams).

Build tiers (first draft): **Lv 99, Lv 120, MAX**. In each tier every unit has that build. **Lv 1 builds** are
offered in every tier as an extra option (like the generator's `variants` today), since a Lv 1 unit only matters for
what it does when it goes down.

### Stage 1: which units matter (per tier, per side)

No comps from anywhere are needed:

1. **Random teams.** Random legal teams from the tier's units (cost and family rules kept) play against an
   **opponent set**. Each unit's strength = how much it adds to the win rate on average, from a regression over many
   battles (each battle tells us about 8 units at once). Units are also scored per position (front starters, back,
   bench), since a unit can be good in one place and useless in another.
2. **Halving.** The bottom half of units is dropped, the opponent set is replaced by the best random teams so far,
   and it repeats. Random teams from a smaller, stronger pool get closer to real teams each round.
3. **Stop** when a few hundred units are left per tier. Those are the tier's **relevant units**.

The first opponent set is a handful of teams made of the highest-stat units of each type (no outside input).

### Stage 2: the league (per tier: attack vs defense)

1. **Start**: a group of attack teams and a group of defense teams, built by the existing generator from the
   stage-1 units (a team per type and per strong class).
2. **Matrix**: every attack team plays every defense team (about 200 battles per pair, same seeds for all).
3. **Meta weights**: the matrix is a two-player game (attacker wants wins, defender wants losses). Its equilibrium
   says how much each team is used: the **meta**. Teams with zero weight are dropped (kept in an archive).
4. **Best response**: the generator searches for the best attack team **against the defense meta** (each battle's
   opponent drawn by its weight) and the best defense team against the attack meta. This needs the generator to
   measure against a weighted list of enemies rather than one team: a small change to its `evaluate`.
5. **Repeat** 2–4 until no new team beats the meta by more than about 2% (the noise level at a few hundred battles).

The teams left with weight are the tier's **comps**, named automatically ("DEX Free Spirit", "STR", ...).

### Stage 3: subs per position (per comp)

For each comp and each position, every relevant unit that keeps the rules is tried in that position against the
meta. Every unit within about 3% of the best is a **sub for that position**, in order. Unlike the sheet, which gives
one list of subs per comp, this says which unit each sub stands in for, and how much is lost. That helps players who
lack a unit or haven't built it.

### Assault Rumble

The bosses are fixed by the game, so no league is needed: the generator searches for the best team against each boss
team, ranked by the average score at Assault Lv 10, with every unit at the tier's build. Boss teams come from
`public/game/assault-seasons.json` (22 seasons so far, 3 boss teams each). The units these teams use (and the
stage-3 subs for them) join the relevant set as **Assault-relevant**. Which seasons: see the open questions.

## Output: `src/engine/rumble-meta.json`

Committed, like `nydato-comps.json`. Roughly:

```
{ generated, simVersion, battles,
  tiers: { "Lv 99" | "Lv 120" | "MAX": {
    units: { [id]: { attack, defense, assault, positions } },   // strength scores; absent = not relevant
    attack: [ { title, units[8], subs: [[id, loss]...] per position, weight, winRate } ],
    defense: [ ... ],
    assault: { [season]: { [bossTeam]: [ { units[8], subs, score } ] } } } } }
```

## What the app does with it

- The generator's search filter "Only relevant units" uses our units for the chosen build tier, plus every unit
  released after the run's date (the same rule as today, with our date in place of the sheet's).
- The generator starts from our comps for the mode (Rumble attack / defense, Assault for the loaded boss team) and
  fills a missing unit from the **subs for that position**. It searches a pool of a few hundred units instead of
  thousands, so it should reach a good team much sooner.
- Nydato's default teams stay on the left as they are.
- Later, if wanted: our unit ranking shown in the app (per tier and mode).

## Keeping it current

When new units come out (or a new Assault season starts), only those are screened (stage 1 for the new units
against the saved opponent sets), a few league rounds continue from the saved meta, and stage 3 re-runs for the
comps that changed. That takes minutes to an hour, not days.

## Checks

- **Against the sheet**: how many of Nydato's 348 units are in our relevant set, and whether his SS comps (or close
  ones) come out of the league. A big disagreement is either a real finding or a simulator problem to look into.
- **Units the simulator can't judge**: a unit whose kit has effects the simulator doesn't handle yet
  (`SimResult.unsupported`) would score too low. Those are kept as relevant with a "can't judge" mark, never dropped.
- **Noise**: two teams within about 2–3% are a tie. Final comparisons use 400+ battles on the same seeds.

## Rough cost

| Step | Battles | Time (about 2.7 M/hour) |
|---|---|---|
| Stage 1, 3 tiers × 2 sides | ~5 M | ~2 h |
| Stage 2, 3 tiers, ~15 league rounds (each: matrix + 2 generator searches) | ~70–120 M | 1–2 days |
| Stage 3, ~10 comps × 8 positions × ~100 units × 200 battles × 3 tiers | ~50 M | ~1 day |
| Assault, current season only (3 boss teams × 3 tiers) | ~15 M | ~6 h |

So a first full run takes **a few days**. Each tier is saved when it finishes, and **MAX runs first** (the most-used
builds), so its results are usable after about a day.

## Decided after the first draft (user, 2026-11-24)

1. **Assault: all seasons** (22 so far, 3 boss teams each), not only the current one: about 7× the Assault row above.
2. **Mixed builds in a team** (e.g. MAX starters with a Lv 99 bench): each unit + build is its own item in the
   search, and a team may hold any mix (a unit still only once). The build tiers stay as **filters on the result**
   ("comps for a box with no MAX units"), not as separate runs. This makes stages 1–3 search about 3× as many items.
3. Since that is a lot more work, a second, faster PC may run it instead of (or as well as) this one. See "A faster
   PC" below.

## A faster PC (checked 2026-11-24)

- A 12-core / 24-thread Zen 5 machine (Ryzen 9 9900X). Versus this PC's Ryzen 7 1700 it is roughly **2–2.5× faster
  per thread** and has 1.5× the threads. Using 20 threads, that is an estimated **4–5× this PC**: about **10–13
  million battles an hour**.
- How it runs there: the code and `data/units.json` are copied over, the run goes in `tmux`, and its results
  (`.cache/meta/`, then `rumble-meta.json`) are copied back to be committed. Needs Node.js 20+.

### Cost with all Assault seasons and mixed builds

| Step | Battles | This PC (~2.7 M/h) | Faster PC (~11 M/h) |
|---|---|---|---|
| Stage 1: ~2,700 units × 4 builds, attack + defense | ~10 M | ~4 h | ~1 h |
| Stage 2: league, one mixed-build pool | ~80–120 M | ~1.5 days | ~9 h |
| Stage 3: subs per position, attack + defense | ~15 M | ~6 h | ~1.5 h |
| Assault: 22 seasons × 3 boss teams, best team + subs | ~100 M | ~1.5 days | ~9 h |
| **Total** | **~200–250 M** | **~3–4 days** | **~20–24 h** |

These are estimates from the 13 ms per battle measured here; the first stage on the faster PC gives the real speed.

## Progress

- [x] 2026-11-24: plan written; user's answers on separate metas, builds, rules, 4★ cut-off, run time, GPU.
- [x] 2026-11-24: all Assault seasons; mixed builds in a team.
- [x] 2026-11-24: faster PC checked (Ryzen 9 9900X, 60 GB, idle); cost table redone (~1 day there, ~3–4 days here).
- [x] 2026-11-24: set up on the faster PC: everything in one folder (its own Node v26, since the system's was too
  old; the bundled run `meta.mjs`; `data/units.json`), run detached at low priority (`nice`), log in `console.log`
  and `out/`.
- [x] 2026-11-24: runner (scripts/meta/: `run.ts`, `pool.ts`, `common.ts`, `stage1.ts`; `npm run meta:bundle` makes
  one file that needs only Node). Checkpoints: every measured team is appended as it comes in; resume rebuilds the
  same random teams from the seeds; a rerun gives the same results (also the same on both PCs). Status in
  `out/status.json`, log in `out/meta.log`.
- [x] 2026-11-24: Stage 1 items: 2,738 units of 5★ and up × 4 builds, identical builds merged = **10,646 items**.
  Round 0: 63,876 random teams × 24 battles per side.
- [x] Speed: this PC ~1,550 battles/s with 12 workers; **faster PC ~8,600 battles/s with 20 workers** (round 0's
  random teams; real teams will be slower). (A "segmentation fault" seen on this PC was Git Bash's wrapper process,
  not Node: the run kept going underneath.)
- [x] 2026-11-24, first Stage 1 attempt (stopped after 11 min): **Lao G. (880) had NaN HP** at Lv 1 / Lv 99. OPTC-DB
  gives 7 units one growth curve per stat (`growth: [1.5, 0.7, 1.5]`), and `statsAtLevel` raised to the whole list.
  A NaN-HP unit never goes down, so its side won every battle on time, the best defense teams all had it, and every
  random attack team then lost every battle (no signal: that round's attack cut was blind). **Fixed in the app too**
  (`src/engine/stats.ts`, test in `stats.test.ts`); no unit or build has non-finite stats now. The run now also:
  leaves out (and lists) any build whose stats aren't numbers; skips a round's cut when the random teams' win rates
  are too even to rank items (logged as a WARNING); and picks the next opponents half from the best teams, half from
  strong-but-beatable ones (top 10–20%), so win rates stay measurable.
- [x] 2026-11-24: **unsupported check**: each item in a fixed team that skips nothing, 3 battles as attacker and as
  defender: **0 items skip any effect** (checked that it does flag a planted made-up effect). Fits
  docs/EFFECT_CHECK.md (0 mismatches with the site's text). It can only see effects that come up in those battles.
- [x] 2026-11-24, second attempt: round 0's opponents (random 6★ teams at MAX) were too strong: random teams from all
  10,646 items won **0.7%** of their battles, too even to rank (the new check skipped the cut, as meant). Now round
  0's opponents are random teams from the same items (win rates start near 50%), and later rounds' opponents are
  spread over the previous round's top quarter (the best down to the 25th percentile). Small test: win rates
  0.2–0.65 per round, wide spread.
- [x] 2026-11-24 (user): **Lv 1 builds have the Rumble special and abilities at max** (like the app generator's
  level-1 builds: a unit kept at Lv 1 is there for what its kit does when it goes down). Stage 1 restarted for it.
- [x] 2026-11-24: Stage 2 (league, `stage2.ts`), Stage 3 (subs per position, `stage3.ts`) and Assault
  (`assault.ts`) written and run end to end on the small test. Notes:
  - The generator got two options for this (`rank`: the shortlist by score instead of newest first;
    `templateSource`), and its build identity now tells apart builds at the same level (key / cotton candy /
    expanded LB): the app's results don't change.
  - Workers keep the opponents they were sent (66 boss teams with their kits are too big to copy for every job).
  - **Assault has its own unit screen** (random teams against all 66 boss teams, scored relative to each boss team's
    average): a unit strong against bosses may be weak against teams, so the Rumble screen can't be reused.
  - Score settings: Lv 10 ×2.5, defeat ×1.9, no trusty bonus (no season rules).
  - Writing the status file can't stop the run any more (Windows held it for a moment once and the run crashed).
- [ ] Full run on the faster PC (Stage 1 → league → subs → Assault): running since 2026-11-24 22:48 .
  - [x] **Stage 1 done in 28 min** (7 rounds, ~8.7 M battles, 4,500–9,000 battles/s; no warnings; random teams'
    win rates 0.25–0.51 ± 0.22–0.32 every round). 600 attack items (298 units) and 600 defense items (319 units),
    361 units in all. Builds kept: MAX 582, Lv 120 404, Lv 99 154, Lv 1 51, "Lv 120/MAX" 9.
    **Against Nydato's sheet** (not used by the run): 54 of the 55 units in his OP / SS comps found (missing:
    Nico Robin 4617); 244 of the sheet's 342 units in our set; 117 of ours aren't on the sheet (12 of them newer
    than it). Top items throughout: Shanks 4560, 4559, 4522, 4490, 4268, 4628.
  - [x] **League, first 30 iterations (1.6 h)**: the attack mix's win rate settled near 0.29, the best responses
    still gaining 4–16 points. Its teams were all **mixed types**, sharing ~3 of 8 units with any of Nydato's comps.
    **Check against the sheet** (his OP / SS comps at MAX against our mix): OP STR won **59.3%** as attack (our
    mix: 28.5%) and held **91.7%** as defense (ours: 71.5%); DEX Free Spirit 52.3% / 84.0%. So the sim does reward
    type synergy, and **the search was stuck**: one-unit changes from mixed starting teams can't reach a mono-type
    team (its buffs only pay off once most of the team shares the type), and stage 1 ranks synergy units low (it
    measured them in mixed teams: Beckman & Yasopp #452, Lafitte #565, Shiryu #420 of 600), so the generator's
    shortlist (top 40 by score) never had them. All but Nico Robin were still in the stage-1 set.
  - [x] **Fix: themes** (`themes.ts`, once before the league goes on). The groups the units' own kits buff (every
    target token like "[STR]", "Cerebral", "[Four Emperors]", plus every type, class and type + class pair; 85–89
    groups with 6+ units), each with a cost-aware team from its units; the best 30 per side (measured against the
    current mix) are climbed by the generator with the group's own units as the shortlist; the results join the
    league. Tried first and dropped: picking a group's units by stage-1 score (8% for [STR], and most teams stuck at
    6 units by the cost limit) and random themed teams (0–8%). First results against the mix that wins 28.5%
    (attack): **[Celestial Dragon] 4% as built → 85.6%**, [World Government] 4% → 77.0%, Powerhouse 10% → 68.5%,
    [Elbaph Arc] 8% → 66.8%, Driven 10% → 65.9%, [STR] 8% → 47.2%, Free Spirit 10% → 38.3%; each climb takes
    10–40 s. Assault got the same idea, cheaper: per boss team every themed team is measured quickly, the 5 best are
    extra starts and the top 3 themes' units are shortlisted (small test: 0.28 M → 3.88 M on one boss team). The league also now starts each best
    response from its 5 most-played teams (was 3), keeps 3 starts (was 2), shortlist 60 (was 40). Nydato's comps
    were only a check: nothing from the sheet goes into the run.
  - [x] Themes, defense: e.g. **[STR] Driven 6% → 93.5%**, [Elbaph Arc] 8% → 88.8%, [Four Emperors] 6% → 77.9%.
    30 attack and 30 defense themed teams joined (2026-11-25 06:26 UTC).
  - [ ] League to 60 iterations with the themed teams (~8 min each now). It **cycles rather than settles**: the
    value moves 0.18–0.47 (0.22–0.29 over iterations 41–50) and each best response still beats the mix by
    15–25 points; each new team takes a big share of the next mix. Expected with many strong, very different teams
    (settling could take hundreds of iterations); the run's useful output (a strong, varied set of comps, the units,
    subs) doesn't need full settling. Then subs and Assault.
  - [x] **League done** (2026-11-25 10:17 UTC, 60 iterations, 96 teams per side): value 0.319; 9 attack and 8
    defense teams played at least 1%. They lean on a few units: Imu, Kaku, Pica, Master Caesar Clown (often at
    Lv 1 or Lv 120), St. Shepherd Ju Peter, St. Mars & St. Saturn, Big Mom & Katakuri, Collun. **Nydato's OP / SS
    comps against this mix**: attack 0–7% (DEX Free Spirit 19.5%), defense 8.5–58% (ours 31.9% / 68.1%). In the
    simulator our mix is far stronger; **not checked in the game**: if the simulator overrates a unit, the meta
    amplifies it, so the top comps are worth trying in game / against recordings.
  - [x] **Subs done** (11:14 UTC): 128 positions (every comp played 3%+).
  - [x] **Assault done** (2026-11-25 18:02 UTC; the whole run: ~14.5 h on the faster PC). 310 Assault-relevant units;
    best team + subs for all 66 boss teams (1,037 subs). Best averages 15.1 M–36.5 M (median 29.3 M). The newest
    units dominate: Nico Robin 4680 in 58 of the 66 teams, Luffy 4603 55, Usopp 4682 52, Biblo 4645 51, Fuga 4678 51,
    Nami 4681 37, Jinbe 4431 35; builds MAX 452, Lv 120 75, Lv 1 1. In the app, Assault mode starts from the
    comps against a boss team led by the same boss (by name: the loaded season's first, then other seasons'),
    then the rest, 15 at most.
  - [x] Assault screen done in 7 min (600 items; top: Reiju 4628, 4681, 4682, 4675, 4680); per boss team ~6 min
    (generator ~3.5 min, subs ~2.5 min), so the 66 boss teams take ~6.5 h (from 11:22 UTC). First: season 1 Buggy,
    33.9 M average with 4681 4603 4614 4680 4682 4431 4645 4678 (mostly the newest units). (Its screen's
    effects look huge, e.g. Reiju 21.4 in round 0: scores are relative to each boss team's average, which random
    teams keep low early on; checked directly, Reiju adds 20–40% damage. The ranking is what counts.)
- [x] 2026-11-25, **restricted boxes** (user: does a comp still help when a key unit is missing or under-built?).
  Measured (top 4 comps per side, 300 battles vs the other mix): a comp whose missing unit has a sub holds (attack
  #2: Caesar -> Prince Grus 26.0% -> 40.0%); one whose key unit has **no sub** within 3 points collapses with the
  "same type / class" fallback (attack #1 36.7% -> 1.3%, defense QCK #2 62.7% -> 23.7%); Lv 99 key units cost 15–28
  points. **The best team without a key unit is often a different comp**, and the league's population has it: no
  Caesar + Sommers -> the QCK attack comp ties the best (31.9%); no Imu -> an Imu-free defense (Orochi, Pica, Big
  Mom & Katakuri, ...) holds 67.0% vs 68.1%, but has **0% of the mix** (Imu teams are a bit better when you have
  Imu), so the export (mix teams >= 1% + themes) drops it.
- [x] 2026-11-25 (done before Assault came in): (1) the export has the **whole population** (96 per side) with each
  team's result against the other side's mix (`vsMix`); `metaTemplates(side, have)` puts the comps a player can
  field fully first (fewest missing units, then `vsMix`), 40 at most; (4) the export has each unit's stage-1 score
  and the app's shortlist is ranked by it (`metaScore`; units newer than the run first).
- [ ] Still open: (2) stage 3 keeps the **top ~12 replacements per position with their loss** (not only those within
  3 points) — needs a stage-3 re-run (~1 h on the faster PC); (3) export each comp unit's lower builds' loss (stage 3
  measured them) so an under-built key unit can count as missing.
- [x] 2026-11-25, **the generator's search** (user: can it find a team that needs 2+ changes when each single change
  makes it worse? — it couldn't). Ideas weighed: pairs of the best single changes; kit-synergy pairs; themed starting
  teams from the player's own units; kicks (iterated local search: a bigger change from the best team, climb again,
  keep the best ever); crossover of top teams; accepting worse moves (annealing: hard to control with noisy
  measurements); a learned model from the measured teams (unreliable with few, noisy teams); shortlist by the
  meta's scores; the whole population as starts. **Built** (src/engine/generator.ts, src/engine/themes.ts):
  - **Two-unit changes when no single change helps** (escalation): pairs of the 8 best single changes, and
    **synergy pairs**: a unit (one of the best singles, or one of the 6 highest shortlisted units in its best place
    even when that measured worse) together with up to 3 shortlisted units its kit targets, counts on ("3 or more
    Shooters") or needs ("when Shanks is on your crew"), or whose kit does that for it, in one of the 2 weakest
    places. First version tried them in every round: one test (vs the league's top defense team, from a mixed
    start) ended at **54.0%** where single changes alone reached 79.4% (big early jumps led the greedy climb into a
    worse dead end) and the first result came later (301 s vs 213 s); with escalation the early rounds are the old
    ones. In that first test: themed starts 78.5%, + 4 kicks **84.2%**, the app's set-up (meta comps + themes +
    two-unit changes) **91.7%** at the first result. With escalation, opponent 1 of a 3-opponent check: old search
    79.4% (first result 188 s; best so far 20% at 2 min, 79% at 4 min), new from the same mixed start 85.8% (318 s;
    34% at 30 s, 62% at 2 min). The rest of that check didn't finish on this PC: **Node 22's worker threads crash
    on Windows under this load** (exit code 0xC0000005, access violation; the earlier "segmentation faults" were
    the same). The faster PC (Linux, Node 26) never crashed in ~90 M battles; the app uses the browser's workers.
  - **The check on the faster PC** (`scripts/meta/gentest.ts`, 20 workers; vs the league's 3 most-played defense teams;
    win rate of the best team, final check on 1,944 battles):

    | Opponent | Old: single changes from a mixed team | New: same start | App: meta comps + themes + two-unit, first result | App + 4 kicks |
    |---|---|---|---|---|
    | 1 | 79.4% | 85.8% | 89.6% (31 s, 96 k battles) | 91.7% (175 k) |
    | 2 | **9.0%** (stuck) | 62.7% | 86.5% (38 s, 122 k) | 86.5% (156 k) |
    | 3 | **14.4%** (stuck) | 60.6% | 70.8% (27 s, 86 k) | 70.8% (311 k) |

    The old search gets stuck badly from a mixed start; the new parts fix most of it; the meta comps give the best
    first result in ~90–120 k battles (in a browser with ~7 workers, a few minutes); kicks add a little (+2 points
    on one of three) at up to 3.5x the battles: diminishing returns, as wanted.
- [x] 2026-11-25 ~18:30 UTC: results copied back (`.cache/meta-lab/out`, without the raw per-battle `.jsonl` files)
  and the run's folder removed from the faster PC.
  To run the meta again: `npm run meta:bundle`, copy `.cache/meta-dist/meta.mjs`, `data/units.json` and
  `public/game/assault-seasons.json` (as `data/assault-seasons.json`) to a machine with Node 22+ (not Windows: its
  worker threads crash under this load), run it, copy `out/` back, `npx tsx scripts/meta/export.ts --out <out>`.
  - **Themed starting teams** from the pool (every group the pool's kits buff with 4+ units, cost-aware).
  - **Kicks** after the first result: theme pivots (the rest of the team rebuilt around a group most of it is in),
    the last round's best two-unit changes, three places rebuilt around a unit and units it works with; the best is
    climbed from even if it measures worse; a final check after each. The app: "Keep improving: Stop at the first
    result / A while longer (4 kicks, default) / Until I stop"; the list shows the checked teams as it goes.
  - The kit links / themes code moved to src/engine/themes.ts (scripts/meta/themes.ts wraps it).
  - Tests: src/engine/generator.search.test.ts: with a made-up fitness where Shanks alone or Beckman & Yasopp alone
    makes a team worse and both make it much better, single changes can't get there and two-unit changes do.
- [x] 2026-11-25: **the app uses it**: `scripts/meta/export.ts` writes `src/engine/rumble-meta.json` (75 KB: 298
  attack / 319 defense units with their kept builds, 39 / 38 comps with subs per position, Assault when done;
  `since` = the day after the run's newest unit, 2026-11-21). `src/engine/meta.ts` reads it; the generator's search
  filter is now "Only relevant ones, or newer" and it starts from these comps (a missing unit -> that position's
  sub first: `Template.subs`). Nydato's comps stay as the default teams. Tests: `src/engine/meta.test.ts`.
- [ ] `rumble-meta.json` for the app from the results (relevant units per side / build, comps, subs per position,
  Assault teams per boss team); the generator using them; checks against Nydato's sheet.
- [ ] Generator: measure against a weighted list of enemies.
- [ ] Stage 1 (unit screen), first on the MAX tier; measure the real battles per second.
- [ ] Stage 2 (league).
- [ ] Stage 3 (subs per position).
- [ ] Assault.
- [ ] `rumble-meta.json` in the app (search filter, starting comps, subs per position); check against the sheet.
