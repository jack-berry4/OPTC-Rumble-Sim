# History: earlier tools and what they found

The project's first tooling (an older battle engine and a Python / TypeScript video-tracking pipeline)
were **removed on 2026-11-17** in a cleanup. Everything is recoverable from git history at commit
**`74196c26f2d6414aaab7cb561f64b0e7f1c7ded6`** (`74196c2`), e.g.

```bash
git show 74196c2:analysis/FINDINGS.md          # one file
git checkout 74196c2 -- analysis src/engine     # bring folders back into the working tree
```

The rules those tools established are in `docs/MECHANICS.md` ("The whole loop in one place") and
`docs/SIMULATOR_HANDOFF.md`; changes since the v3 rebuild are in `docs/SIMULATOR.md`. This file keeps what is not
written down there: what the old tools were, the recordings they were run on, where the evidence lives, and the
switches and rules that were tried and dropped.

## What was removed, and where it went

| Removed | What it was | Replaced by |
|---|---|---|
| `src/engine/battle.ts`, `simulate.ts` (old `simulateMany`), `constants.ts`, `formulas.ts`, `rng.ts` + their tests | Battle engine v2 (0.1 s ticks, `DecisionSource` decision log, `TUNING` switches with their evidence in comments) | `src/sim/` (simulator v3, 2026-11-11). The team rules (`teamCost`, `clashReason`, `validateTeam`, `placementProblem`) moved to `src/engine/team.ts`; `rumbleBaseStats` to `stats.ts`; `TEAM_COST_LIMIT` to `team.ts` |
| `analysis/` (66 files: Python + OpenCV readers, TypeScript replay tools, `FINDINGS.md`, digit templates) | The first video pipeline: HP-bar tracking, camera registration, damage pop-up reader, NEXT-column reader, knock-back detectors, `replay_video.ts` | The labeler (branch `labeler`), the decoded attack animations (`tools/ssd`, `game.attack` in the database), and the newer analyzer on branch `claude/rumble-video-analyzer-d2d259` |
| `docs/HANDOFF.md` | New-computer setup for the pipeline (venv, `rebuild_outputs.sh`, expected replay stops) and memory notes | README.md; this file |
| `docs/VIDEO_ANALYSIS_GUIDE.md` | 2026-11-09 plan for a better analysis tool (signals ranked by reliability, ground-truth labels first, analysis by synthesis) | The labeler and the analyzer branch (which has its own copy of the guide) |
| `scripts/fit-queue.ts`, `run9-opening.ts`, `sim-bench.ts`, `sim-bench9.ts` | Queue-rule fitting against the recorded NEXT lists; run 9's opening vs the recording; speed checks | `scripts/sensitivity.ts`, the tests in `src/sim/sim.test.ts`, `npm run sim` |
| Appendix D of `SIMULATOR_HANDOFF.md` (now in `docs/`) | A copy of `docs/MECHANICS.md` as of 2026-11-11 | `docs/MECHANICS.md` itself |
| Measuring switches `DECODED`, `OLD` (`src/sim/timing.ts`), `GAME_KEYS` (`stats.ts`) | The behavior from before 2026-11-17, for before/after comparisons | See "Switches and rules dropped" below |

The pipeline's outputs (`analysis/out/`, ~27 MB, ~440 files: per-video tracks, pop-ups, cards, NEXT reads, logs) were
never in git (gitignored); they could only be rebuilt with the removed tools (`bash analysis/rebuild_outputs.sh`,
~35-60 min, Python venv from `analysis/requirements.txt`).

## The recordings (test runs 1-7)

Opponent every time: `DEFAULT_DEFENDERS` (Buggy 39, Mohji & Richie 36, Cabaji 37, Shooter crews Black 161 / Blue 158
on the field; bench Green 159, Yellow 160, Iron-Mace Alvida 30). Every team with exact stats is in
`src/engine/defaultTeams.ts` (`TEST_TEAMS`), the rules in `src/engine/rules.ts`.

| Run | Videos | Your team (slots 1-5) | Rules | Notes |
|---|---|---|---|---|
| 1 | 1-5 | PX-4 Lv19, PX-2 Lv7, PX-1 Lv14, PX-5 Lv10, PX-3 Lv8 | `DEFAULT_RULES` | 1080x1920 30 fps; NEXT column only in 1-3 |
| 2 | 21-23, 25 | Luffy 2087 + PX-2, PX-1, PX-5, PX-3 | `RUN2_RULES` | 25 recorded in fast mode, slowed 1.5x (~1% off) |
| 3 | 31-34 | Luffy 2087, King 3137 + PX-1, PX-5, PX-3 | `RUN2_RULES` | |
| 4 | 41-44 | Luffy, King, Nico Robin 4375 + PX-5, PX-3 | `RUN4_RULES` | Robin: crew SPD up lv 5 |
| 5 | 51-54 | Usohachi 2806 + PX-2, PX-1, PX-5, PX-3 | `RUN2_RULES` | crew Blow Away up lv 5 |
| 6 | 61-64 | Kizaru 3704 + PX-2, PX-1, PX-5, PX-3 | `RUN6_RULES` | LLB 4: Shooter ATK 6 / SPD 6 / HP 5, self ATK 5 |
| 7 | 71-74 | Usohachi 2806 + PX-2, PX-1, PX-5, PX-3 | `RUN6_RULES` | |

Runs 8 and 9 (high-end 8 v 8, team codes in `src/sim/fixtures/`) came after the pipeline; run 9 is the reference
battle of `docs/SIMULATOR_HANDOFF.md` (appendices A-C).

Recording notes: runs 2-7 are 1080x2400 at ~52-57 fps, variable frame rate, mapped to the run-1 layout (game screen =
0.8 x original + 108 px offset). Battle start = the frame the enemy-info overlay disappears minus 0.1 s (the timer-based
finder was a tick late about one time in six; videos 25 and 33 needed a hand-set start). Advice that still holds:
normal speed (never fast mode), NEXT column on, one changed unit at a time, a screenshot of every unit's Rumble
status and of the rules, 4-6 battles per setup.

## Findings by round (`analysis/FINDINGS.md`, newest first)

Each round's evidence (frame times, counts, which video) is in `git show 74196c2:analysis/FINDINGS.md`.

- **16 (runs 6, 7, 2026-11-09).** The [Elbaph / Wano / Logia] +20% rule applies in battle although its text says
  Combat Power only (Usohachi 1,335 = 1,113 x 1.2). A bench cut-in misread as ~1.05 s is 2.033 s. Kizaru's opening
  fitted a 250 cap on buffed SPD (later dropped for run 9, see SIMULATOR.md "Turn order"; his "crouch" was a tracking
  error, 2026-11-17). Kizaru's Shooter HP up 5 comes from his LLB ability (he is LLB 4). Knock-backs: unguarded hits
  6% at Blow Away 0, >=14% (eye count ~30%) at lv 5; guarded 0 of 12.
- **15.** Knock-back detector from raw HP bars: landings two tiles back / two rows up for most; stun and queue loss
  not measurable from these videos.
- **14 (run 5).** Blow Away level raises the chance (5% -> ~30% at lv 5). Self-heal at full HP plays as a Normal attack
  (likely). Usohachi's kit is under 2805 in the data.
- **13c.** In-game help values (per level HP 250, ATK 75, RCV 50, DEF 25, SPD 5, Blow Away 5%, Miss 2.5%). Special CT:
  3% per level as charge speed. Dice order: guard -> miss (if not guarded) -> crit -> blow away (if not guarded).
  Rates in 431 hits: crit 4.2%, guard 8.1%, miss ~9%. Bench entries 0.1-0.2 s later than KO + 1.8 s. HP cards drop
  ~0.07 s before the pop-up.
- **13.** Many replay stops were reader errors (pauses subtracted twice, pop-ups counted twice across cut-ins, partly
  read numbers). Knock-backs land on tiles. Open: run 4 at 12.23-12.93 s (King's card drop ~116 where the sim has 219).
- **12.** Walking speed is the same for every unit whatever its SPD: ~900-1,000 px/s out, ~1,100 back. The attack
  "runway" strip marks an attack's span.
- **11 (run 4).** Damage is floored after ATK x multiplier, after DEF, after each rule %. The NEXT column looks 1 s
  ahead (not one beat). SPD buffs are +5 flat per level, counted at once. Robin: wind-up 0.85, stay 2.33.
- **10.** Seeded camera registration made rebuilds repeatable. Rate = 100 + 0.86 x (SPD - 100) reliable for SPD
  100-200, probably right to 248, unmeasured below 100. Alternatives tried: power law, turn time, log, restart
  delays, subtract-on-pick.
- **9 (run 3).** King (SPD 196) pins the SPD slope at 0.86. King: arrives ~0.3 s after the pick, hits ~1.07, takes
  off ~2.57. Specials cut in Luffy first, King second in all 4 videos.
- **8.** The NEXT column is a forecast (gauge plus look-ahead), not the pick order itself.
- **7.** Specials fire on arriving in attack range (all 5 normal-speed specials, frame by frame).
- **6 (run 2).** Special charge steps on every timer tick from the battle start; cut-in phases and lengths (normal
  and fast mode); "RUMBLE ABILITY ACTIVATED!" banner 4.67-4.70 s at the start; a special doesn't use up a pattern
  step; Luffy stands ~110 px from his target.
- **5, 3.** Replaying videos with their own dice: the opening of video 4 reproduces exactly to 14.5 s; melee reach
  ~110 px; fake crits (orange sparks) and doubled pop-ups were reader errors.
- **2 and before.** Tile grid and formation (`src/engine/grid.ts`), one pick per 1.526 s beat, move-off 0.20 s after
  the beat, the opening order (your five, then enemy slots 3-5), guard x0.875, crit x1.5, DEF curve
  1 / (1 + (DEF / 223.6)^2), last 30 s damage +5%, bench cut-ins stop the clock ~2.03 s, the camera pans and zooms.

**Lessons that still apply** (memory notes from the old machine): verify tracker positions and departures frame by
frame before drawing conclusions (round 6's "special from 300 px" and round 8's "Luffy stays 1.15 s" were tracking or
occlusion errors, and so was Kizaru's crouch); when a replay stops, try other random choices (return tiles, knock-back
landings) before inventing a rule; most "unexplained" stops were reader errors.

**Open at the time** (2026-11-09; some since settled in SIMULATOR.md): run 4's King card drop at 12.93 s; run 7
videos 71 / 74 at 10.1 s (Buggy acts where the sim picks Usohachi); knock-back stun and queue loss; the 0.2-0.8 s
extra pause after specials; video 25 (fast mode) running ~1% slow.

Where each replay first departed from its video at the 2026-11-09 handoff (old engine, `replay_video.ts`): video 4
37.6 s, 5 35.7, 1 26.5, 2 20.4, 31 26.8, 21 20.7, 25 19.4, 34 17.6, 23 18.9, 52 17.9, 72 16.1, 73 14.8, 51 14.4,
32 13.1, 41-44 12.9-13.0, 54 12.9, 61-63 13.0, 3 11.4, 22 10.1, 33 10.0, 64 9.9, 71 / 74 10.1, 53 8.4.

## Switches and rules dropped from the simulator (2026-11-17)

None of them was on; removing them changed no battle (run 9, run 8 and run 1, 200 seeds each: identical winners,
end times and event logs before and after).

- **`DECODED`** (`timing.ts`): `use = false` took the wind-ups from the measured profiles instead of the decoded
  attack files; `stay = false` kept the profiles' stays; `old60` the first decoding model (60 fps + 0.32 s). Win rates
  before -> after the decoded wind-ups: SIMULATOR.md "Attack timings".
- **`OLD`** (`timing.ts`): `crouch` (Kizaru's 0.35 s crouch, own or borrowed profile), `fullInAnimation` (a Full
  attack lengthened the wind-up and stay instead of waiting before setting off), `deathOnSpot` (the 2026-11-14 death
  special: at once, from where the unit stands), `deathSkip` (the first 2026-11-17 walk-up turn). Win-rate effects:
  SIMULATOR.md "On Death" and "Full attacks, crouch, Rumble keys".
- **`GAME_KEYS`** (`stats.ts`): `use = false` gave every unit its flags.js key tier instead of the game's tiers.
- **`QUEUE`** (`battle.ts`), the pick rules tried on 2026-11-11 with `scripts/fit-queue.ts`: `forecast` (the top of the
  NEXT column drawn after the last beat acts), `forecastFree` (the same, passing over a unit under attack),
  `projected` (the next unit locked in at each beat from gauges projected `horizon` ahead), `listLock` (the NEXT list
  drawn after a beat is locked; its first unit that can act goes). Kept: `projList` (the rule) and `gauge` (used by
  `scripts/sensitivity.ts`). Also dropped: `slopeAbove` (gauge growth per SPD point above `rateCap`), `busyExtra` /
  `unitBusyExtra` (extra settle time before the gauge restarts), `specialGaugeResume` (gauge refilling while walking
  back from a special).
- A unit test that replayed the user's seed-15 death-special battle needed all the old switches; it now uses seed 44,
  the same situation under today's rules.

## Rules and readers replaced later

- **2026-11-24, Damage over Time cap 20 -> 10** (`TUNE.dotMaxLevel`): the user's 2026-11-13 answer was 20; the Assault
  videos' ticks never go past Lv 10 (Blackbeard after a 4th Lv 3 stack, Akainu with Caesar x3 + Reiju), and the user
  confirmed 10 for every unit.
- **2026-11-24, Assault boss stats**: the deck's plus values were added to ATK / RCV (and at first HP); the Lv 10
  stat screens and DoT ticks show they don't count. The potentials / sockets bonus was taken at full for every boss;
  it scales with main special level / max (Fujitora 6 of 8).
- **2026-11-24, boss portraits**: picked by name (full name, subtitle, then the newest unit of the character), which
  gave Akainu the Egghead Sakazuki, Kizaru the 5* form and Uta the Christmas one; now the copied form's server id.
- **2026-11-24, box Limit Break badge**: white vs gold pixel shares over the badge (read a favorite star as a gold
  badge and a grey key icon or white portrait as a white MAX), one video frame per unit, MAX vs number by a combined
  letters + digits reading (turned lone digits into letters). Now: the dark-disc test, per-frame voting, letters-only
  and digits-only readings (docs/IMPORT_PLAN.md).
- **2026-11-24, generator aim**: "the best score in N tries" (the 1 - 1/(N + 1) quantile), then two settings (tries,
  and Steady / Balanced / High ceiling); now one: "the score I reach at least once in N matches, p% of the time".
