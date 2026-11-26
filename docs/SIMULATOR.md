# Simulator v3 (`src/sim/`)

Rebuilt from scratch on 2026-11-11 from `docs/SIMULATOR_HANDOFF.md` (section numbers below refer to it). The team
builder, unit data and stat formulas (`src/data/`, `src/engine/stats.ts`, `rules.ts`, `teamCode.ts`, `team.ts`) are
unchanged and feed it. The old battle engine and the old video-analysis tools were removed on 2026-11-17
(`docs/HISTORY.md`).

| File | What |
|---|---|
| `rand.ts` | Seeded random streams (section 1): one main seed, separate `special` / `timing` / `dice` streams, every draw addressed by what it is (unit, use number, effect, target), loggable and forceable |
| `timing.ts` | Animation profiles (section 9), drawn once per unit per battle from the timing stream; wind-ups from the decoded attack animations (below) |
| `battle.ts` | The battle: turn order, movement, dice, damage, abilities, specials, every effect kind in the data |
| `simulate.ts` | Win-rate runs; `vary` = all / special / timing / dice; standard error |
| `types.ts` | Options and result (same frame / event shapes the replay uses) |
| `nodeDb.ts` | Loads the unit database in Node (scripts, tests) |
| `sim.test.ts` | Formula and opening checks against test runs 1 and 9, stream independence, Forced Out, tags, named characters and VS units, Evade, buff sources, a random-team crash test |

## Speed

Event-driven on the 1/30 s grid: the loop jumps to the next tick where anything can change (a beat, a whole second,
a phase of an action, a buff or status ending), and gauges grow linearly in between. The app splits a win-rate run
over up to 8 workers, each sent only the 16 unit records it needs.

| Teams | Per battle (one core) | Old engine |
|---|---|---|
| Test run 1 (low end) | ~2-3 ms | ~30 ms |
| Test run 9 (high end) | ~8 ms | |

In the app: 3,000 low-end battles in about 1.4 s.

## Checked

- Test run 9 opening stats and buff levels: all 16 units match appendix A.
- Damage check values (section 7): 927, 284 (shown 282), 5,055 (5,056), 476, 39,688 (39,690).
- Test run 1: opening picks A1-A5 then D3, D4, D5; hit values 571-573, 546, 604, 718, 260, 120.
- 1,500 random 8v8 battles from all 4,665 units: no errors, no effect kinds left unhandled.

## Turn order (2026-11-11, replaces the handoff's section 4 points 1 and 3)

Worked out with the user from the run 9 NEXT lists, the user's reading of runs 1 and 3, and the old replay tool
(`PICK=projList` there, `QUEUE` in `battle.ts`; the fitting tools `scripts/fit-queue.ts` / `run9-opening.ts` and the
other pick rules they compared were removed on 2026-11-17, `docs/HISTORY.md`):

- **Gauge rate** 100 + 0.86 x (SPD - 100) per second with **no 250 cap** (run 9: Imu 312 overtakes Loki 288.5 in NEXT).
  Kizaru's run 6 fits without the cap once his crouch-and-fly action keeps him busy 0.3-0.6 s longer than the old
  engine had (the new simulator modelled his 0.35 s crouch; since 2026-11-17 the crouch is gone, a tracking error,
  and his decoded 0.57 s wind-up replaces the measured 0.70: worth re-checking run 6 against the cap).
- **The next unit is locked in at each beat**: all units on the field and not acting, ordered by their gauge projected
  **1 s** ahead from the current state (a gauge stopped now, under attack or still busy, does not move forward). At the
  next beat the first unit of that locked order that can act goes (run 9's five skips: the locked top was under attack
  and the 2nd went; run 1 videos 4 / 5: Cabaji, under attack at the lock, was passed by the Black crew). Speed changes
  after the lock do not matter (run 9: Shanks 2nd although Imu's bind slowed him at once).
- The very first pick goes by raw SPD (key included, no buffs); ties by SPD over the cap, then your team, then slot.
- The game's NEXT column is a separate drawing: gauge + 1 s of growth for every unit, stopped or not (display only).
- **A guarded hit can still knock back** (user, run 1 video 1 at 19.4 s); the 0 / 24 earlier count never ruled it out.
- Open: run 3 videos 31 / 34 and run 1 videos 4 / 5 still replay shorter than with the old rules (Cabaji's stay is
  being checked); the look-ahead could be anything from ~0.5 s to 1 s on the evidence so far.

## Damage over Time, Paralysis, Action Bind (user, 2026-11-13 / 2026-11-18)

- **Damage over Time**: a unit picked for a regular action (attack, heal or Confused attack, **not a special**) walks
  up as usual, takes the tick **on arriving**, is **stunned there for 49 frames at 59.94 fps = 0.8175 s**
  (`TUNE.dotWait` [M]) and then attacks / heals; a special charged during the stun waits for its next turn. No stun
  before moving. Tick: 5% of max HP per level (`TUNE.dotPerLevel`), the summed level capped at **10**
  (`TUNE.dotMaxLevel` [C user 2026-11-24, measured in the Assault videos; was 20]). The action has started at the pick (target locked); a KO by the tick cancels it and frees
  the target. The unit's `activity` reads "Damage over Time (then attacking X)" during the stun. A Confused unit's
  knock-back turn has no stun and no tick.
- **Paralysis**: picked for a regular attack, the unit doesn't move or hit: it stands where it is for `TUNE.dotWait`
  and its place in the queue starts over (gauge 0). A full special still goes (and fires once), a Confused unit still
  attacks a teammate, and heals still happen. With Damage over Time on too, the tick lands at that turn; the turn uses
  up its step of the attack pattern (user, 2026-11-18).
- **Action Bind**: the unit can't act; its gauge holds (neither grows nor resets); passives still work and it can
  still be KO'd. It is off the NEXT queue while bound and until the first beat after the bind ends, then back in its
  place by gauge (user, 2026-11-18). The replay dims its portrait under a padlock.

## Assault Rumble bosses (videos and user, 2026-11-24; docs/ASSAULT_RUNS.md)

- **Main boss** (`mainBossPlaces`): in Assault mode, a boss with `BossDef.places` (set by `gameBossTeam` on the deck's
  first unit to 1 + `additionalBehaviorCount_`; editable in the boss editor as "Main boss: NEXT places"; an older
  saved game boss team falls back to 1 + count for slot 1) has that many gauges in the NEXT queue (`U.extra`, entries
  `QE { u, k }`). All its gauges grow at its SPD rate, also while it acts (`placesGrow`: on the field, alive, not on
  its last stand, not Action Bound, not knocked back). A beat can pick one of its places only while it is free (idle,
  not under attack); the picked place starts over, the others keep theirs. The NEXT column (`nextColumn`,
  `projectedOrder`) can list it several times. Not modelled: a place picked while the boss is busy being held for
  its next free beat (it just waits on top).
- **Several attackers**: `chooseTarget` lets any number of attackers aim at a main boss (still only while it is idle);
  every other unit keeps the one-attacker rule.
- **Range steps** (`Pattern` attack with `range: "Small" | "Medium"`, from behaviors 10004-10009): the boss picks its
  target and walks up as for an attack; no Damage over Time wait or tick, no Paralysis check; at the hit, the target and
  every enemy within the radial special range around the boss (`TUNE.bossRange`: small 1.2, medium 2.3 tiles) each take
  their own hit (own guard / miss / crit / blow rolls); then it walks back. The target is locked as usual [A].
- **Boss stats** (`bossStats`, src/engine/gameKit.ts): deck stat x (1 + k x f) x the Assault Lv coefficient, f = the
  deck's potentials + sockets x main special level / max; the plus values are left out.
- Not modelled: the attack cut (a special one beat after the boss's turn starts cancels that turn; seen twice).

## Confusion (rule from the user, 2026-11-13)

- A Confused unit picked to act whose special is **fully charged** (and could fire: not under Special Bind), or which
  has **no teammate available** to attack, does not attack: it is knocked back **one tile toward its own side**
  (attackers left, defenders right; no dice for one or two rows), takes the usual knock-back stop (`TUNE.knockStun`)
  and its special charge is set to **0**. Its gauge is used up as for any action. Effect event: "A2 is Confused:
  knocked back, special charge lost". If the tile behind is taken or off the field it **stays still** (confirmed by
  the user), still stopped, still losing the charge and the turn.
- **Available teammate** = one an enemy attacker could take: on the field (not waiting on its death special), idle, not
  already under attack, with a free attack tile in front of it on the enemy side. A teammate under attack is busy.
  The closest available one is attacked; while it is, it counts as under attack, so enemies can't target it either.
- The attack: it goes to the tile an opposing unit would take to attack that teammate (the enemy's grid, `reach` in
  front of the mate on the enemy side), plays its normal attack (same walk, windup, stay; a Full attack waits first),
  hits with the usual damage and dice, and goes back. Its charge is untouched. Going back it steps back **its own
  way** (attackers left, defenders right), as if it had just attacked an enemy from that tile (user, 2026-11-18).
  The replay draws its attack strip and target ring in the other team's color, pointing at the teammate.
- **Special Bind**: the special can't fire, so a full bar does not count: the unit attacks an available teammate and
  keeps its full bar. With no available teammate it is knocked back and the bar is emptied, as above.
- Choice: the attack pattern does not advance on the knock-back turn.

## On Death: death specials (rules from the user, 2026-11-14)

- A unit with a death special (an "On Death" boon left) that would be KO'd instead **stays alive at exactly 1 HP,
  waiting** (`lastStand`). An action it had started is dropped (target released, it walks home). Its special bar is
  set full. Effect event: "A2 is waiting at 1 HP to use its death special".
- While waiting it **can't be targeted for an attack** (enemy targeting, a Confused teammate's attack), and its **HP can't fall below 1**: hits from specials, attacks already on their way, reflect / Damage over Time
  leave it at 1 HP (only the HP actually lost is counted as damage). Interpretations: heals don't raise it (it stays at
  exactly 1 HP), it can't be Forced Out or switched, and a hit on it never blows it away.
- It **counts as alive**: one unit for every count, the win check, rumble-outs, `results.alive` (true, HP 1, if the
  battle ends while it waits). The replay shows HP 1, state not "dead", activity "Waiting to use its death special".
- **Its turn (rule from the user, 2026-11-17; replaces "fires at once from where it stands")**: from the moment it goes
  into its wait it is **locked at the top of the queue**. At the next beat with an enemy to aim at it launches the
  special **the same way as a normal special**: it picks its target as any special does (`chooseTarget`: an
  available enemy, Provoke and its target rule included; the target is locked as "being attacked"), **walks up to it**
  (the attack tile in front of it, `TUNE.walkOut`) and fires on arrival; then it dies or its team wins (below). While
  it walks its HP stays at 1 and it still can't be attacked (`lastStand` stays on until it fires). Replay activity:
  "Waiting to use its death special", then "Death special D3" while it walks; event "A2 ...: death special -> D3".
- **No enemy available: everyone waits (user, 2026-11-17)**. It stays first in the queue and the beat goes to nobody:
  not to the next waiting unit, not to the regular queue; no new pick happens until it can go. Units already acting
  finish as usual (walk, hit, walk back, settle; knock-backs, Forced Out and bench entries run their course).
- **Last resort** (aiming): the user confirmed it **may aim at an enemy that is itself waiting** on its death special
  (it is mainly about where the special goes off; that enemy stays at 1 HP). It applies (`deathTarget`):
  (a) when no enemy outside its own wait is on the field, Forced Out or coming in from the bench: the nearest waiting
  enemy (fewest attackers first); (b) [interpretation] when nothing on the field can change any more (`stillGoing`
  false: no unit acting, walking, settling or knocked back, none Forced Out, no bench unit about to come in) and still
  no enemy can be targeted (Provoke on an enemy with no free tile in front, tiles taken or off the field): the first
  enemy in the usual target order, tile or not (one outside its wait first, else a waiting one). With no free tile in
  front of the target it goes off from where it stands.
- **Why the "everyone waits" rule can't deadlock**: while everyone waits no new action starts, and every action or
  state in progress ends in bounded time (walk and animation lengths, settle, knock-back stop, Forced Out duration,
  bench delay), so after a few seconds the field is still (`stillGoing` false). Then the first waiting unit either has
  a target (`chooseTarget`), or the last resort gives it one (any enemy on the field), or the enemy has no unit on the
  field: then it has none Forced Out or about to come in either (that would still be going), so it has no unit left
  at all and the win check ends the battle (a KO'd field unit always leaves a bench entry while the bench has units).
  Every death turn then ends the wait: it walks (and fires on arrival) or the attempt fails and it dies. The 100 s
  limit stays as the final backstop. Run 8, 600 seeds: a waiting unit had no target at a beat 5 times (5 battles),
  the frozen-field last resort never came up, nobody was left waiting at the end.
- **NEXT column (user, 2026-11-17)**: a waiting unit jumps to the **top** of the NEXT list (the frames' `queue`) and
  stays there until it sets off (or its attempt fails); several waiting units first, in their tie order.
- **Several waiting**: they tie at the top and go one per beat in the **regular queue's tie order**: SPD over the cap
  read at the previous beat (`tieSpd`), then your team first, then slot (`tied`, the same comparison the regular pick
  uses for equal gauges). One already walking is not picked again.
- Under **Confusion, Action Bind or Special Bind** at its turn (the beat it would set off, a target found) the attempt
  fails and it dies without the special (an Action-Bound unit is still picked: the binds are only checked at its
  turn). A bind or Confusion landing while it walks does not stop it (as for any special). **If its target is Forced
  Out or switched out while it walks (user, 2026-11-17) it keeps going** to the spot it was walking to and launches
  there anyway, aimed where the target stood (that position is kept while it is off the field); it does not turn
  back. The target is released at once (`keepsGoing`). If the target is KO'd the special still goes off on arrival,
  as for any special. (A unit with no special at all would fail at once; the game's data has none.)
- Conditions such as "HP below 1%" hold at its 1 HP (1 / 13,000 = 0.008%; the check is HP / max HP x 100 < 1, the
  same for any unit that low); HP-conditioned abilities are refreshed before the special goes.
- **If the enemy reaches 0 units while it waits** (nobody on the field or bench; a waiting enemy counts as on the
  field) its team wins at once; it never fires.
- **After the special**: if the enemy has 0 units (none on the field or bench, no enemy waiting on its own death
  special), its team wins with it still alive. Otherwise it dies right after; if it was its team's last unit, its team
  loses.
- **Revive** (kept from before): the death special comes first; when the unit then dies (after the special or after a
  failed attempt) a Revive it has left brings it back with its Revive HP instead (after the special it walks back like
  after any special). A unit with several On Death uses can wait again later.
- **Revive for a group (passive abilities, user 2026-11-17)**: an ability Revive whose targets are anything other
  than "self" only (Prince Grus 4528 for [SWORD], Brook 4197, Luffy 3607 / 4162, Goldberg 4652, Pudding 4656, Gunko
  4663) works `repeat` times (usually once) for the whole game, shared by the whole group, the owner included when he
  matches. The first time a matching unit would be KO'd (after its death special, if any) while the owner is on the
  field with its ability on (no Ability Bind) and the condition holds, that unit is revived with `amount`% HP (HP only)
  and a use is gone; the log says "A1 Prince Grus's ability revives A2 Kujaku with N HP". Once the owner is KO'd for
  good it no longer works. Interpretations: the unit's own revive (an unconditional self-only ability Revive, or one
  from a special) is used before a team pool; with several pools, the first by unit order; an owner Forced Out (or on
  the bench) is not on the field, so its pool doesn't work while it is away; the condition is checked at the KO (e.g.
  Gunko 4663's "first 50 seconds"). Self-only Revives and Revives given by specials work per unit as before. Grand
  Party abilities (gpability) are not used by the simulator.
- The seed-15 battle (5 v 5 test, 2026-11-14): Blackbeard (A2) waited at 65.63 s and was KO'd at 67.17 s with no
  special because the only enemies left, D2 and D3, were themselves in their last stands and the old code could not
  aim at them. With the 2026-11-14 rule it fired at them at once. With the walk-up rule (2026-11-17) the battle runs
  differently: D1-D3 wait from 64.33 s and go at 65.63 / 67.17 / 68.70 s (one per beat, each walking up first);
  Blackbeard, waiting from 65.83 s, comes after them in the tie order and the opponent is gone before its turn
  (your team wins, Blackbeard alive at 1 HP). That battle needed the timings and key tiers from before 2026-11-17;
  the test now uses seed 44, which has the same shape with today's rules (D2, D1, D3 at 58.00 / 59.53 / 61.07 s).
- Earlier turns, compared 2026-11-17 with measuring switches since removed (`docs/HISTORY.md`): the 2026-11-14 turn
  (special at once from where it stands, waiting units by side then slot) and the first 2026-11-17 walk-up turn (no
  target: the next waiting unit or the regular queue goes; target Forced Out / switched out: it turns back; not in
  NEXT; last resort (a) only). 600 seeds: on-spot -> walk-up, run 8 98.5 % -> 99.0 % (1,153
  death specials walked, longest wait for a target 4.13 s, none left waiting at the end); walk-up -> everyone waits
  (2026-11-17 answers), run 8 99.0 % -> 99.0 % (same 1,153 walks, 6 time-outs both; the no-target case only comes up
  in 5 battles and changes no winner); runs 9 and 1 have no death specials (38.3 % and 26.5 %, unchanged).
- **Test run 8 (2026-11-17 check)**: the attackers' win rate went from ~70 % to ~96-99 % with these rules. Not a
  regression: before, a unit KO'd while walking to attack lost its action but kept phase `toAttack`, so it was never
  free to act and never targetable. Dorry / Broggy (QCK Giants) froze that way and outlived the 100 s, so every
  giant win (18 of 60 seeds) was a time-out with a frozen unit. Dropping the action (it walks home) removed that;
  the remaining giant wins are ordinary time-outs. Tests: run 8 seed 3 and 100 seeds with no unit frozen at the end.

## Attack timings (`timing.ts`, 2026-11-17)

**Current rule (user labels, 2026-11-17; supersedes the 60 fps + 0.32 s formula below):** a unit's attack animation
plays at **40 frames per second** from the moment it arrives (its HP bar stops; the attack strip starts fading in).
The damage number comes at **first hit frame / 40** and the unit leaves when the animation ends, at **animation length /
40** (the strip starts fading out then; fully gone ~0.17 s later). Checked on 7 units of all three templates in runs
9/10 (Usopp & Lilith, Caesar, Buggy 4563: first hit 15 -> 0.375 s, labeled 0.367-0.386; Shiryu: 32 -> 0.80, labeled
0.784-0.802; Imu, Shanks: 33 -> 0.825, labeled 0.816-0.840) and against the earlier measured stays (92-frame units
2.30 s vs 2.33-2.41 measured; Buggy 101 frames 2.53 vs 2.58; Cabaji 125 frames 3.13 vs 3.03). Kizaru's tracked stay
(2.15 vs 2.90) is the only disagreement and his tracking was already unreliable. Both wind-up and stay now come from
each unit's file (`stayFrom: "data"`); units without a file keep their measured or borrowed profile. The attack strip
in the replay shows from arrival. Win rates (600 seeds, before -> after): run 9 41.8% -> 38.3%, run 8 98.5% -> 98.5%,
run 1 26.8% -> 26.5%. The earlier model, kept below for the record, was fitted to "strip fully visible", which hid the
difference between templates.

Times are from **arriving** at the attack tile: wind-up = arrive -> damage number, stay = arrive -> leave, plus the
distance kept from the target (reach). No unit crouches before setting off (below).

- **Wind-up from the game's animation** [M data]: a unit with a decoded attack (`game.attack` in `data/units.json`,
  docs/DATABASE.md) gets wind-up = `0.2 + 0.12 + firstHit / 60` s: the strip appears 0.2 s after arriving, the
  number 0.12 s + the first hit frame at 60 fps after that (always 60 fps, even when the file says 45). Validated
  within 1-2 video frames on Cabaji (first hit 15: 0.57 s), the 92-frame template (32: 0.853 s; Pacifista, Luffy 2087,
  King 3137, Robin 4375) and Usohachi 2806 (33: 0.87 s); `tools/ssd/README.md`. Deterministic (no draw). 4,161 of
  4,668 units; the first hit is frame 15 (0.57 s), 32 (0.853), 33 (0.87) or 36 (0.92) for all but 28 units, and every
  decoded wind-up is between 0.57 and 1.07 s.
- **Stay, reach** stay as before: the unit's own measured profile, or a profile borrowed at random (timing
  stream) for units without one (unmeasured stays + `TUNE.unmeasuredStayAdd`). The files do not give the stay.
- **No decoded attack** (507 units: no attack file extracted for 432 mostly old units, 25 not in the game data, 50
  whose only files are special cut-ins or a 54-frame placeholder attack without hits, e.g. Loki 4629, Blackbeard &
  Kuzan 4522, the VS halves 4218 / 4219 / 4469; the VS halves 3252 / 3253 have no file): wind-up as before, from the
  own or borrowed profile (ranges drawn from the timing stream).
- A Full attack waits `TUNE.fullExtra` before setting off (next section); its wind-up and stay are a Normal attack's.
- The run's `timings` show the source per unit: `windupFrom` = `data` (with `firstHit`), `measured` or `borrowed`;
  `profile` / `measured` name the profile the stay and reach come from.
- Measured profiles vs decoded wind-ups: Pacifista 0.87 -> 0.853, Luffy 2087 0.89 -> 0.853, King 3137 0.84-0.92 ->
  0.853, Robin 4375 0.81-0.85 -> 0.853, Usohachi 2806 0.81 -> 0.87 (2805, the unevolved form, has its own 15-frame
  attack: 0.57), Cabaji 0.51-0.63 -> 0.57, Buggy 39 0.45-0.59 -> 0.57, **Kizaru 3704 0.70 -> 0.57** (not yet checked on
  video). Buggy crew 30 / 36 and the Shooter crews 158-161 have no attack file and keep their ranges.
- Win rate, before -> after, 600 paired seeds (`seedsFor(7, i, "all")`, the `scripts/sensitivity.ts` matchups):
  run 9 42.3 -> 44.0 % (+1.7 +- 1.1), run 8 98.3 -> 98.0 % (-0.3 +- 0.5), run 1 26.7 -> 26.8 % (+0.2 +- 0.6).

## Full attacks, crouch, Rumble keys (owner, 2026-11-17)

- **Full attack** [C user: the shape; M few samples: 0.75 s, label -> number]: the unit picked for a Full attack
  waits `TUNE.fullExtra` = 0.75 s (`FULL_EXTRA`, `timing.ts`) while the game shows its "Full Attack" graphic, then
  sets off; its wind-up and stay are exactly a Normal attack's (no longer lengthened). During the wait it stands
  still and is busy, its target already locked, as for the rest of its action. Damage stays x1.5 ATK.
- **Waits**: the Full attack wait comes before setting off; a Damage over Time stun comes after arriving (above).
  They add up.
- With the same pick time, a Full attack's hit and leave times are unchanged by the new shape (wait + walk + wind-up
  = walk + longer wind-up); only where the unit is during those 0.75 s changes (home instead of at the attack tile):
  what can catch it there (specials by position, the interrupt rule) and when it arrives.
- **No crouch** [user]: Kizaru 3704's measured 0.35 s crouch was a tracking error (he stood just behind the bottom of
  the NEXT column, which hid him; he sets off 1-2 frames after leaving it like every unit). No unit crouches, and a
  borrowed Kizaru profile (1 in 9 unmeasured units before) brings none. Kizaru's wind-up is his decoded 0.57 s; the
  profile's measured 0.70 (part of the same error) is no longer used; the profile's 0.57 is used when borrowed.
- **Rumble keys from the game's tiers** (`keyTierOf`, `src/engine/stats.ts`; docs/DATABASE.md): units in the game's
  data take the game's multipliers (HP / ATK / RCV / DEF / SPD, special charge time), damage taken reduction and
  damage dealt bonus, and the dealt / taken part applies only against the color or class pair of the game's key
  ability (`game.key.vs`; a class pair = either class), not against what the unit's resilience names. A legal unit
  the game gives no key gets none (the editor shows "none in the game"; a stored key is ignored); an illegal unit
  may still force one (its flags.js tier). The level needed is the tier's (120, or 99 for tier 100000). Units not in
  the game's data (25) keep their flags.js tier, against their resilience.
- Win rate, before -> after, 600 paired seeds (`seedsFor(7, i, "all")`, the `scripts/sensitivity.ts` matchups, run 8
  from `src/sim/fixtures/run8-teams.txt`; `.cache/measure-2026-11-17.ts`): run 9 44.0 -> 41.8 % (-2.2 +- 1.7), run 8
  98.0 -> 98.5 % (+0.5 +- 0.4), run 1 26.8 -> 26.8 %. All of it from the crouch (borrowed Kizaru profiles; no Kizaru
  3704 in these teams). The Full attack shape changed no winner (run 9: no battle differs at all in 50 seeds; run 8: 5
  of 50 battles differ, same winners); the game's key tiers changed nothing in these teams (their keyed units' tiers
  have the flags.js numbers and their resilience names the same pair as the game).

## Interpretations (not stated in the handoff; change if the recordings disagree)

- The first beat is at 0.0 s.
- Paralysis: lands by its chance; see the Damage over Time section for what it does.
- Special levels: each level's override applies to the effect as written out in full (level 1), as the site does (user: Hyogoro).
- An ability effect that isn't a stat level (recharge, boon, hinderance, Shield ...) and has no trigger fires once
  each time its condition turns true; a stat buff / debuff / penalty ability holds while its condition holds.
- Half Stats halves ATK, DEF, SPD and RCV, not HP (confirmed by the user, 2026-11-12).
- Forced Out: the unit's passives are off while it is out (user, 2026-11-12). When a team has no unit on the field and
  at least one Forced Out, all its Forced Out units are KO'd at once ("rumbled out", logged as `ko` events plus an
  effect line); the bench then comes in for each vacated tile as after any KO (same 1.8 s delay), and a team with no
  bench has lost (user, 2026-11-13). Interpretation: a KO'd unit whose bench replacement is still on its way does not
  count as on the field, so a team whose only other units are Forced Out is rumbled out then. Nobody is credited
  with these KOs (no "defeated" triggers, not counted for "after N defeats").
- Power attacks time like Normal ones.
- Heal areas, around the healed teammate: Small 1.0 tile (game data, below); Medium 1.6 and Large 2.78 tiles (the
  old 150 / 260 px, still assumed).
- Special-damage interrupt: a unit hit by special damage after arriving but before its hit cancels the attack and
  stays where it is.

## From the game's battle data (2026-11-13)

The owner got a datamined battle-setup file from the game (`rumble.json`, kept outside the repo). What it gives:

- **Tiles.** Ranges in the file are plain numbers; they are read as tiles, one tile = one step along a grid row,
  `TILE` = |GRID_U| = hypot(86, 37) ~ 93.6 px (`src/engine/grid.ts`; change it there to rescale everything).
- **Radial specials** [C data]: radius 1.2 tiles (database "small"), 2.3 ("medium"); 3.6 for "large" [L, inferred].
  `TUNE.radial` = `RADIAL_TILES` x `TILE` (112 / 215 / 337 px; were 45 / 140 / 300 px assumed). The labeler (branch `labeler`)
  uses the same numbers for its "sim guess" column.
- **Forward / sideways specials**: not changed yet (`lineLen`, `lineW` still assumed). The file shows forward large =
  range_type 2, range 6; another range_type 2 with range 4; sideways small = range_type 3, range 1.
- **Pattern heals** [C data]: "Lv.1" = range_type 1, range 1.0, team ALLY, effect type 6, coefficient 0.3; "Lv.2" =
  range_type 0, target self, coefficient 0.6. The simulator's amount was already `HEAL_MULT[level-1]` x the healer's
  RCV = 0.3 / 0.6 (level 3: 1.0, from the wiki), so amounts are unchanged. Small area = 1.0 tile around the healed
  teammate (was 80 px). Medium / Large and level 3 are not in the file: kept, in tiles, still assumed.
- **Shield** [C data]: 600 per level (a level-5 Shield is 3,000; was 500).
- **New global rule** (rule effect `{ kind: "game", id: "last30" }`, `GAME_RULES` in `src/engine/rules.ts`): "During
  the last 30 s of battle, Special CT Speed Up & Damage Up!" = `RuleEffect::SkillSpeed` 30 (+30% charge speed =
  Special CT level 10 at `ctPerLevel` 0.03) and `RuleEffect::Defense` -150 (DEF level -6 at 25), everyone, both
  teams, when 30 s or less are left. Added from the rules table ("+ During the last 30 s ..." button), shown with the
  game's text, values fixed (only on/off and delete), saved with the other rules, labelled in the buff breakdown as
  "Rule: DEF -6 (During the last 30 s ...)". Off unless added. The recorded-run fixtures (`DEFAULT_RULES`,
  `RUN2/4/6_RULES`, `RUN9_RULES`) still model this window as Special CT level 5 + damage +5% (measured: Pacifista 571
  -> 600) and were left alone.
- The same file's stage rules for run 6/9 match the fixtures: QCK ATK 300 (= 4 levels), Driven SPD 20 (4), Striker
  DEF 100 (4), the tagged units 20% more damage dealt / 20% less taken.
- **Confirmed unchanged**: per-level stats (HP 250, ATK 75, DEF 25, SPD 5), attack multipliers (Normal 0.6, Power
  0.9, Full 1.5), Damage over Time, charge speed per Special CT level.

Win rates (attacker, 600 seeds, `seedsFor(7, i, "all")`), before -> after: run 9 40.7% -> 41.8% (radial +1.3,
heal -0.2), run 8 73.7% -> 68.5% (radial -4.9, shield -0.9), run 1 25.8% -> 25.8%. With the new rule in place of the
fixtures' Special CT 5 / +5% window: run 9 42.3%, run 8 69.5%, run 1 26.7%.

## Open

- Run 9's opening: in the recording Imu's special fires at 0.0 s and Shiryu's doesn't fire early; under the rules
  both bars are full at the start (Shiryu: "Special CT +100% on arrival, first 9 s"), and the slot-order tie-break
  sends Shiryu first. Question for the user.
- Everything listed in the handoff's section 13 (Q4-Q7).

## Tags and crew counts

How colors, classes, styles, tags and named characters in targets and conditions are read, what the 2026-11-13 audit
found and fixed (eight bugs, among them about 2,000 effect lines whose tag never matched), the user's answers (VS
units count only their chosen half; "When X is on your crew" counts X anywhere on the team), and the numbers: see
[TAGS.md](TAGS.md).

## Evade (user, 2026-11-13)

An Evade effect gives its targets an `Evade` status listing what it covers, by the site's names. Every time one of
those tries to land on the unit while the Evade lasts, the Evade's chance is rolled (each Evade separately); on a
success it doesn't land. **Only what a special (or super special) applies is evaded**: an ability's debuffs,
hinderances and damage, ongoing or triggered, always land. The one exception is Special CT Delay, which also evades
a delay from a passive ability (e.g. Imu's passive rewind). The kinds in the data and what each stops:

| Evade | Stops (from a special) |
|---|---|
| Stats Down | any new stat debuff (ATK, DEF, SPD, RCV, HP, Special CT, Critical Hit, Guard, Accuracy ... down), a special's own-side stat penalty included. Ones already on stay |
| Half Stats | Half Stats and Half ATK / DEF / SPD / RCV: the data has no Evade kind for a single halved stat, so Half Stats covers them all (user). If one ever appears, `scripts/check-effects.ts` reports it ("Evade kind for one halved stat") and Half Stats should then cover only itself (`evadeCovers` in `battle.ts`) |
| Action Bind, Special Bind, RCV Bind, Paralysis, Confusion, Forced Out, Damage Over Time | that hinderance (Damage Over Time from a hinderance or a damage effect) |
| Special CT Delay | a Special CT delay (hinderance "Special CT"), from a special or a passive ability |
| Damage Ignoring DEF, Fixed Damage, Percentage Damage | that special damage does 0 instead; rolled for each hit of a repeated hit. The hit still counts as a hit: an attack in progress is cancelled and it counts toward "special received" (user). "Randomly deals between X-Y fixed damage" (type `random`) is fixed damage: evaded as such and, like fixed damage, past Shields |

"Crew members with Stats Down Evasion" / "enemies with Confusion Evasion" target units with an Evade covering it.
Replay frames: an Evade status carries `evades` (the list above). Win rates (1,000 seeds) did not change with these
answers: run 9 40.6%, run 8 70.9%, run 1 27.0%.

## Buff breakdown (`buffSources`)

While frames are recorded, each unit snapshot lists where every non-zero stat level comes from: one entry per
source (a unit's special / super special / triggered ability with seconds left; a unit's ability aura with its
condition in a few words; a battle rule), summing to `buffs[stat]` (anything left over would show as "Other").
Aura parts are tracked in `refreshAuras` only when `frameInterval` is set, so win-rate runs don't pay for it.
