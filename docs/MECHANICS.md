# Pirate Rumble Mechanics Spec

The rules the engine implements. Each entry is marked:
- **[CONFIRMED]**: from the user
- **[WIKI]**: from the r/OnePieceTC Pirate Festival wiki (2020; some details may be outdated)
- **[SHEET]**: from the community PF calculator spreadsheet (2020)
- **[ASSUMED]**: engine placeholder until confirmed
- **[OPEN]**: unknown; needs an answer

Sources:
- User answers in chat (2026-11-04)
- r/OnePieceTC wiki, "piratefestival" page (pasted by the user; its images and links are unavailable)
- PF calculator: https://docs.google.com/spreadsheets/d/1bvr44OI7w8LFTm0s7YOcsnWqW0s3nDsfUo88uM6PIro
- Unit data: https://github.com/2Shankz/optc-db.github.io (`common/data/rumble.json`, `units.js`)

## Game modes (2026-11-22; src/engine/gp.ts, assault.ts, docs/PLAN_MODES.md)
**Grand Party** **[CONFIRMED, user]**
- Only the chosen leader's GP ability and GP burst are used; no other unit's GP kit. The leader is a 9th unit (it may
  also be on the team); its ability and burst work the same whether it is on the field, on the bench or on another of
  the 3 teams. Burst damage marked `leader` uses the leader's ATK.
- Burst charge and uses carry over from battle to battle; the simulator runs one battle, with the start charge and uses
  left set. Charge counts in whole steps for counted conditions (KOs, specials, hits ...).
- A boosted leader (the season's list, e.g. "Driven or Slasher" in Nydato's sheet for 2026-11-01): burst requirement
  -40% rounded up (Whitebeard & Ace: 6 crew members defeated -> 4), +1 burst use, and the season's stat boosts (the
  sheet lists two Lv. 5 boosts for all characters).
- What each burst condition counts **[INTERPRETATION]**: team-wide tallies (src/engine/gp.ts burstProgressKey); after a
  launch the gauge starts over **[ASSUMED]**.

**Assault Rumble** **[CONFIRMED, user]**
- Max assault level (10): a boss at 0 HP stays, keeps acting normally, can't go back above 0, and takes more damage
  (default x1.5, adjustable). All damage counts, past 0 HP too. **Below the max level bosses go down like any unit**
  and damage counts only down to 0 HP **[MEASURED]**: the user's Lv 4 Blackbeard gave 46,065 damage for 42,658 HP
  (36,157 + his own HP Up Lv.26) plus heals, where counting everything would be ~62,000. 100 s; ends early only when your team is wiped (you
  still score). Up to 4 bosses, all on the field (the game's battle screen has 4 boss places; no deck in the game data has more). Boss stats are as shown (no level / LB / cotton candy).
- Score = (damage score + life score) x every modifier, multiplied together. Life: HP left, bench at full, KO'd 0.
  **[MEASURED, user's results 2026-11-22]**: Blackbeard Lv 5 (46,065 + 97,944) x 1.37 x 1.90 = 374,855 vs 526,713,
  Whitebeard Lv 6 (145,663 + 101,602) x 1.50 x 1.85 vs 960,625, Akainu Lv 7 (132,828 + 110,736) x 1.62 x 2.00 vs
  1,108,217: all three are x1.40 more, though "Trusty x1.00" is shown: the season's "1.4 x bonus for owning it!" (once).
  Defeat bonus seen x1.85-2.00 (maybe from the time the last boss went down: user). The Assault Lv multiplier is the
  fought level's (the results then show the next level): fought at 4 / 5 / 6 = x1.375 / 1.5 / 1.625 (shown rounded
  down), so **1 + 0.125 per level above 1**, and x2.5 at Lv 10 (user) **[MEASURED; Lv 7-9 assumed on the step]**.
  With these, all three results come out exact (x1.4000 left: the owned-trusty bonus).
- Boss stats **[MEASURED]**: the deck's values x the potential / socket bonus of any unit x the level's multipliers.
  The bonus scales with main special level / its max as for player units (40 levels at special 6 of 6: HP x1.6, ATK
  x1.3, RCV x1.1; Fujitora, special 6 of 8: 30 levels). The deck's plus values (+600 each at Lv 9-10) do **not** count
  (2026-11-24: the Lv 10 stat screens, Akainu 78,456 / 6,235 / 1,272, Kizaru 49,840 / 5,873 / 1,273, Fujitora 45,878 /
  5,291 / 1,295, Blackbeard ATK 6,012 / RCV 1,029, and the Damage over Time ticks: Blackbeard 141,900, Akainu 85,956 max
  HP with HP Up Lv 30). Also Blackbeard Lv 1 HP 19,759 / ATK 2,201 / RCV 228, Lv 4 36,157 / 2,485 / 235 (all within
  1). Lv 1-4, 5-8 and 9-10 each use their own deck (higher special / ability levels, plus values at 9-10).
- **The main boss** **[MEASURED, videos 2026-11-24; docs/ASSAULT_RUNS.md]**: the deck's first unit holds 1 +
  `additionalBehaviorCount_` places in the NEXT queue (Blackbeard 4, Akainu 3; Kizaru / Fujitora 1 each). It still
  does one thing at a time: its places keep filling while it acts, so it goes again at about the first beat it is
  free. Several of the player's units can attack it at the same time; the team's other units take one attacker at a
  time, as in normal Rumble. Every enemy is labelled BOSS.
- **Range steps** (behaviors 10004-10009: Small / Medium Range Normal / Power / Full Attack; Akainu's pattern
  Normal -> Medium Range Power -> Power -> Medium Range Full) **[CONFIRMED, user 2026-11-24]**: a blue "Range ...
  Attack" label; the boss picks a target and walks up as for an attack, but skips the Damage over Time and Paralysis
  checks, hits every enemy in range (2-3 units in the video) and walks back; same timings as an attack.
- Damage over Time on a boss: percentage-damage resistance (85%) does not reduce it; the tick stops at Lv 10 like any
  unit's (see Hinderances).
- **Not settled**: a special of ours one beat after the boss's turn starts can cut that turn (no hit, the boss
  restarts it; seen twice on Blackbeard): open whether this also happens in normal Rumble (user checking videos).
- What the game stores for a boss: its own character row (kit, SPD, DEF, style), the deck's level, skill levels,
  stats, a behavior pattern (target type + action ids: plain / small / medium range attacks, heals) and the deck's
  `additionalBehaviorCount_` (the main boss's extra NEXT places, above). Its server id ends in the playable form's
  server id (2412210 -> 12210), the only link to that unit.
- Boss data in the game's master DB (OPTC Decomp sakura.db): `MstAssaultRumbleEvent_` (season: rules as
  `ArenaAbility::DamageReceivedEnhancement` / `DamageReduction` by type `trademarks` / class `character_types`),
  `MstAssaultRumbleEnemyDeck_` (boss teams = NPC decks; `additionalBehaviorCount_` 2-3: the main boss's extra places),
  `MstAssaultRumbleEventEnemyLevel_` (per Assault Lv: HP x1.00-3.50, ATK x1.01-1.40, RCV x1.01-1.10; a different
  deck from Lv 5 and Lv 9), `MstAssaultRumbleEventCharacterScore_` (trusty characters and their bonus). Boss kits are
  their own (Blackbeard boss: Team HP Up Lv. 26-30 ...), not the playable unit's. The boss abilities are structured
  game JSON; boss specials only text.
- Nydato's sheet (Assault Rumble tab): every listed boss reduces percentage damage by 85%.

**VS units in the box** **[CONFIRMED, user 2026-11-22]**: the box shows a VS unit as one combined portrait (OPTC-DB's
4529.png for 4529.1 Zoro / 4529.2 Nusjuro); owning it means owning both halves, which share level, Limit Break, cotton
candy and potentials (different premium potentials combine). The import matches the combined portrait and adds both
halves with the same build (src/data/vs.ts).

## Out of scope for now
- Season cost reductions. Later. **[WIKI]**

## Team and battle structure
- **5 active units + 3 bench units per side** (max 8). **[CONFIRMED]**
- **Cost limit 300** (fixed). Legends 55, Rumble-exclusive units 20, others vary. Per-unit cost is `cost` in `rumble.json`. **[CONFIRMED]**
- Bench units are off the field at the start and **replace active units that are defeated**. **[WIKI]**
- **Bench order: the leftmost bench slot comes in first.** The incoming unit **takes over the KO'd unit's slot and
  its current special charge**. **[CONFIRMED]** It comes in **~1.8 s after the KO** (KO animation, then the "RUMBLE IN!"
  cut-in) on **the starting tile of that slot**, wherever the KO'd unit fell (`BENCH_ENTRY_DELAY`). **[MEASURED]**
  (video 4: 3/3 entries.) It also **takes over the KO'd unit's queue progress** [LIKELY: the Green crew acts before
  Mohji at 26 s in video 4; with an empty queue it couldn't] (`TUNING.benchGauge`).
- **Battle length: 100 in-game seconds.** **[CONFIRMED]**
- **Attacker wins by defeating every opposing unit (bench included) within 100 s.** Otherwise the defender wins, even if
  the attacker has more units left. **[CONFIRMED]** / **[WIKI]**
- **Abilities** work like captain abilities, but **every active unit's ability is on** while that unit is on the field.
  **Only active units provide buffs**: a benched unit's ability does nothing until it enters. **[WIKI]**
- [OPEN] The `leader` flag on some effects in the data: is there a captain slot?
- Engine tick: **1/30 s** (one video frame; beats and moves line up with frames). **[MEASURED]**

## Field and positions
- **The field is a tile grid [MEASURED, videos 1-5]** (`grid.ts`). Units move in straight lines, but every spot where
  a unit stands still (start, attack, rest) is a tile centre. Your tiles: (199, 645) + i·(86, 37) + j·(−12, 51);
  +i = toward the enemy, +j = down the screen. The enemy's grid is the same grid turned half a circle about the field
  centre (540, 668), so for both teams +i means "toward the other team". Resting units sit on tiles to within ~10 px.
  - *Superseded:* "no grid" (user's earlier description).
- **Engine v2 coordinates are game pixels**: the battle-start screen of a 1080x1920 recording at camera zoom 1. Units
  are tracked at their HP bars, so a unit's position is its HP bar's centre. **[MEASURED]**
- The in-game camera pans and zooms (about 0.75x-1.8x) during the battle; that's display only. **[MEASURED]**
- **Formation slot = team order, left to right in the team editor (1-5).** **[WIKI]** / **[MEASURED]**
- **Starting positions [MEASURED, videos 1-5]** — tiles (`ATTACKER_TILES` / `DEFENDER_TILES`): your slots 1-5 at
  (1,−1), (2,−1), (3,−1), (2,0), (0,0); the enemy's at (3,−1), (2,−1), (1,−1), (0,0), (2,0) in its own grid (so the
  enemy formation is the mirror image of yours: its slot 1 faces your slot 3, slot 4 is at the back). In px:

  | Side | Slot | x | y | Notes |
  |---|---|---|---|---|
  | Left (you) | 1 | 301 | 631 | |
  | Left | 2 | 389 | 668 | |
  | Left | 3 | 473 | 704 | front |
  | Left | 4 | 371 | 718 | |
  | Left | 5 | 199 | 645 | back |
  | Right | 1 | 607 | 632 | front (Buggy) |
  | Right | 2 | 693 | 669 | (Mohji & Richie) |
  | Right | 3 | 779 | 706 | (Cabaji) |
  | Right | 4 | 881 | 692 | back (Black Shooter crew) |
  | Right | 5 | 709 | 618 | behind slot 2 (Blue Shooter crew) |

  Same shape as the user's screenshot layout (slots 1→2→3 a diagonal toward the enemy, 4 below the middle, 5 at the back),
  about 0.84x the size.

## Turn order and timing (engine v2)

**The whole loop in one place (as of 2026-11-09, test runs 1-7; details and evidence below):**
1. **Turn progress.** Every unit has a gauge that starts at 0. It grows by **100 + 0.86 × (SPD − 100)** per second
   [MEASURED]. SPD = base SPD + 5 per net buff level [MEASURED, in-game help]; **any SPD over 250 counts as 250**
   [LIKELY, Kizaru 247 + 30 → 250; adopted by the user, base included: keys reach 280]; a net debuff level stops at −1 [user]. Examples: SPD 100 → 100/s, 120 → 117,
   150 → 143, 196 → 183, 221 → 204, 250 (the cap) → 229.
2. **When it grows.** Only while the unit is free: not acting (from being picked until 0.2 s after it is back on its
   tile) and not being attacked (from the moment an enemy picks it as a target until that enemy heads back)
   [MEASURED]. A knocked-back unit can't act for a while [in-game help; engine 2 s, ASSUMED] and loses turn
   progress [ASSUMED 2 s of growth].
3. **The beat.** Every **1.526 s** the free unit with the highest gauge that has a reachable target is picked; ties
   go to your team, then formation slot [MEASURED]. Its gauge drops to 0, it picks its target (closest free enemy,
   or the one that last hit it / it last hit when free and reachable) and starts moving at once [MEASURED]. Pauses
   (special and bench cut-ins, 2.033 s for a bench entry) stop the beat with the clock.
4. **The NEXT column** shows the free units by gauge + 1 s of their own growth, redrawn at each beat [MEASURED].
5. **Attack.** Walk out (~900-1,000 px/s, same for every unit whatever its SPD), hit, stay, walk back (~1,100 px/s)
   to a random free tile two rows back and 1-3 tiles behind the attack spot [MEASURED]. Stays (arrival → take-off):
   your measured units 2.33 s (Pacifistas, Luffy 2087, King 3137, Robin 4375, Usohachi 2806), Kizaru 3704 2.15 s
   (flies in after a ~0.35 s crouch), Buggy team 3.03 s. A self-heal step at full HP is a Normal attack [LIKELY].
6. **Dice on each regular hit:** guard (5% + 5%/level) → miss if not guarded (base ~9-10%, + 2.5%/level) → crit
   (5% + 5%/level, also on guarded hits) → after the damage, blow away if not guarded (5% + 5%/level) [in-game help +
   MEASURED rates]. A knock-back throws the unit one tile back or two rows back (random) [MEASURED].
7. **Bench.** A KO'd unit is replaced 1.8 s later by the next bench unit on its tile, inheriting its gauge [MEASURED /
   LIKELY].

- **Occupied units.** A unit is occupied while it acts (picked, moving, attacking, going back) and **from the moment
  it is chosen as an attack target until that attacker starts going back**. An occupied unit can't be picked to act
  or be picked as a target. **[CONFIRMED]**
- **The turn beat [MEASURED].** One unit is picked every **1.526 s** (`PICK_INTERVAL`), on a fixed beat: the NEXT list
  only ever changes on the beat (videos 1-2: locked to it for 18 s at a time; the phase only shifts by the length of a
  bench cut-in). The picked unit chooses its target immediately and **starts moving on that beat** (`PICK_START_DELAY` 0;
  moves start on the frame the NEXT list advances, videos 1, 2, 4; an earlier "0.2 s later" came from a 0.17 s clock
  offset in the video-4 tracks;
  9/9 attacks). If nobody can act, the beat passes.
  - *Superseded:* the user's description ("2 units per ~2 s window, the second half a window later", i.e. one per
    second) doesn't match the recordings.
- **SPD sets how fast the queue gauge grows [MEASURED, test runs 2-3]:** **100 + 0.86 x (SPD - 100) per second**
  (`TUNING.spdSlope` 0.86). Two SPD values besides 100 measured on their own:
  - Luffy, SPD 150: **141.5-144/s** (slope 0.83-0.885). Video 23 replays to 13.5 s only inside that range; 0.82 puts him
    under the Blue crew at 9.2 s, 0.89 picks him at 10.7 s. Videos 21 and 25 agree.
  - King 3137, SPD 196: **161-190/s** (slope 0.64-0.94). Videos 31 and 34 show him picked first at 0.07 s, 5th at
    4.6 s (LRRRK) and on top at 6.1 s (KRRRX), past three enemies in one beat. On video 31's own return tiles his gauge
    must be under the enemies' 613 at 6.13 s and over their 763 at 7.63 s. Video 31 and 34 replays run to 17.6 s.
  - SPD buffs: see the buff table below (+5 SPD per level, MEASURED, test run 4).
  - So **rate = SPD (slope 1) is out**, by a near-tie in video 23. A straight line and a gentle curve
    (100 x (SPD/100)^0.88) both fit two points; a third SPD value (ideally much higher or lower) would tell them apart.
    Every unit in test run 1 has SPD 100, so run 1 is unchanged by construction.
  - *Superseded:* round 8's 0.5. It came from Luffy's attack, misread as 1.15 s on the tile (a Pacifista hid him); he
    stays 2.33 s like the Pacifistas and King, so his gauge restarts ~1 s later than round 8 assumed.
  - Running speed: Luffy's long dashes average ~985 px/s (peak ~1,200), inside the spread of SPD-100 units (median
    ~900, IQR 800-990): SPD doesn't change running speed or attack length (King and Luffy: 2.33 s like the Pacifistas).
  - SPD does decide the very first pick: King (196) goes before Luffy (150, slot 1), and Luffy before the Pacifistas.
- **Queue progress [MEASURED].** Every unit has a queue gauge that grows at a fixed rate **only while it's free**
  (and, LIKELY, only from **0.2 s after** it's back on its tile: `TUNING.postReturnDelay`, decides a near-tie at 19.9 s)
  (not acting, not about to act, **not being attacked**). Being picked resets it to 0. Each beat picks the free unit
  with the most progress.
  - Evidence: with every unit at SPD 100, the first 5 picks are your 5 units, then enemy slots 3, 4, 5. Enemy slots 1
    and 2 (being shot at non-stop) are skipped and drop down the NEXT list, below your slot 1 that already acted. The
    simulator reproduces the recorded NEXT list beat for beat for the first 7 beats of videos 1 and 2 (the old
    `analysis/compare_next.ts`, docs/HISTORY.md).
  - *Superseded:* "gauge always grows" can't produce those lists.
- **The NEXT list** shows units that aren't acting, in queue order, **including units being attacked** (they can't be
  picked until they're free). **[MEASURED]** It is redrawn only at beats, and it shows a **forecast: each unit's gauge
  plus 1 s of growth at its own rate** (`TUNING.nextForecast`, `nextHorizon` 1.0). **[MEASURED, videos 21-44]** That's
  why Luffy (143/s) is drawn above the Blue crew at 9.2 s while the Black crew, not Luffy, is picked: picks use the
  current gauges. The look-ahead is 0.95-1.05 s (videos 21 / 23 / 25 at 9.2 s need >= 0.95, video 43 at 12.2 s needs
  <= 1.05), not one 1.526 s beat as first thought (round 11). With equal rates the forecast is the current order.
- *Resolved:* the Black crew's 9.2 s target in run 2 (it shoots Luffy). With Luffy's real 2.33 s attack he's back on
  his tile in time and is simply the closest free unit; no special rule.
- **Ties:** left team (yours) first, then formation slot. **[MEASURED]**
- **Pick priority:** units making an **On Death** last stand first, then **hasted** units, then most progress. **[CONFIRMED]**
- **Knock-back (Blow Away)** pushes a unit back in the queue (ASSUMED amount) and one tile back on the field; 5% base chance (see Regular actions).
- **Open edge case — 2 units per movement window (user):** something in the game involves 2 units in one window, maybe
  special charges or other edge cases. The recordings only show single picks on the beat, so the engine treats it as
  one; watch for behaviour that two-per-window would explain.
- **Bench entry pauses the battle** for ~2.03 s ("RUMBLE IN!" cut-in): the timer and the turn beat stop, units don't
  act. In battle time the entry is instant. **[MEASURED]**
- **Full game time mode** (the "Full game time" checkbox; `BattleOptions.gameTime`, `CUT_IN` / `SPECIAL_CUT_IN` in
  constants): cut-ins stop the battle as in the game. The battle freezes: the timer, movement, special charge and the
  turn beat, mid-animation (a Pacifista's laser and a 'Miss' resume where they were). The battle plays out exactly the
  same; the replay runs on real time (timer shown beside it). Cut-ins play one after another. Real seconds, normal /
  **fast mode** ("Fast mode" checkbox, `gameSpeed`):
  - The battle itself: fast mode runs it **1.5× faster** (the timer ticks every 0.667 s). **[MEASURED]**, video 24
  - Bench entry ("RUMBLE IN!"): **2.03 / 1.53 s** **[MEASURED]**.
  - Special (and super special): **5.25 s for a 2-effect special** (5.13-5.57, 6 specials) / **3.6-3.7 s** fast.
    Built from parts: intro (flash, close-up, the special's art and name) **2.07 / 1.57 s**, then **one part per
    effect, 1.23 / 0.83 s apart**, each with its caption ("Damage: ATK x 0.50", "Heal: 300") and the effect landing
    at its end (~0.8 / 0.53 s in), then ~0.7 / 0.4 s until the battle resumes. **[MEASURED]** (Luffy 2087, videos 21-24)
  - Passive ability at the start: **one "RUMBLE ABILITY ACTIVATED!" for both teams, 4.7 / 3.0 s, just before the timer
    starts** **[MEASURED]**. Later (coming in from the bench, back from being forced out) per unit **[CONFIRMED]**;
    1.5 / 1.0 s each **[ASSUMED]**. Conditions met or triggers firing later don't stop the clock.
  - Off: the clock never pauses.
- If a chosen unit has no free enemy to attack it is skipped (it waits). **[CONFIRMED]**

## Regular actions
- On its turn a unit performs the next step of its **action pattern** (`pattern`: Normal / Power / Full attack, or
  heal level 1-3). The pattern loops. **[ASSUMED]** (loop)
- **Regular attack (engine v2) [MEASURED]:**
  1. Move to the **free tile nearest to a point in front of the target at its height**, at **900 px/s**
     (`MOVE_SPEED`). How far in front is **per unit, not per class**: about **212 px** for almost everyone measured (the Pacifistas,
     the Shooter crews, Buggy (Slasher), Mohji & Richie (Fighter)); **Cabaji ~110 px** (`ATTACK_REACH`, `UNIT_REACH`;
     unmeasured units use 212). E.g. a Pacifista attacking Buggy (enemy tile (3,−1)) always stands on your tile (2,−2).
  2. **A full special bar fires on the way** instead of the attack, as soon as the target is within the special's reach
     (see Specials). **[MEASURED]**
  3. Wind up and hit: the hit lands `windup` after arriving (Pacifistas ~0.75 s, Buggy team ~0.45 s). During the attack
     the unit's pose lifts its HP bar ~30 px (display only).
  4. Stay until the attack animation ends, then **go back to a tile 2 rows back (+2 j) and 1, 2 or 3 tiles back (−i)
     from the attack tile, picked at random among the free ones** (`RETURN_ROWS_BACK`, `RETURN_STEPS_BACK`); if all
     three are taken, the same one row back; then the nearest free tile. On screen that's 110-280 px back and a little
     down for your team (up for the enemy). Returns run at ~1,100 px/s (`RETURN_SPEED`, MEASURED from frame-fitted trips, all videos); walking out ~900-1,000 px/s, the same for every unit whatever its SPD. While a unit attacks, a red (yours) or blue (enemy) "runway" strip shows on its row: it appears ~0.2 s after arrival and vanishes on the take-off back (MEASURED, n 59, ±1 frame). Evidence: ~45 clean returns over
     videos 1, 2, 4, 5 all land on one of those three tiles; the choice differs between recordings of the same opening,
     so it's a dice roll. A tile is "taken" if a unit stands on it or is heading there.
     They start back a fixed time **after arriving**: Pacifistas, Luffy 2087 and King 3137 **2.33 s**, the Buggy team
     **3.03 s** (`UNIT_ATTACK_TIMING`; MEASURED, 6/6 Pacifista attacks incl. long runs, Black crew 9.6 → 12.63 s, Blue
     crew 11.0 → 14.03 s; Luffy video 23 arrives ~0.37, back ~2.6; King videos 31/34 arrives ~0.3, hits ~1.07, back
     ~2.57). Luffy and King stand ~110 px from their target (`UNIT_REACH`), like Cabaji.
  - So formations drift: units rest wherever they last came back to, not at their starting tile; attackers and
    targets keep moving toward the middle. This decides who is "closest" for later targeting.
  - *Superseded:* "go back to where it started" (engine v2.0; only true when that tile happens to be one of the three).
    The user's "retreat down-left / up-right with random spread" was right.
- **Knock-back is Blow Away** (user, 2026-11-05) with a **5% base chance** (+5% per Blow Away level). The videos show
  16 knock-backs in 288 unguarded hits (5.6%, MEASURED) and **none in 24 guarded hits**: the engine assumes a guarded
  hit can't knock back (`TUNING.guardBlocksBlowAway`; user: Guard up resists Blow Away, and this makes it do so
  through the guard chance; ASSUMED, too few guarded hits to prove); the same hit pushes in one video and not in another, so
  it's a dice roll. **Where it lands (MEASURED, 13 knock-backs, the old `analysis/knockback.py`):** either one tile straight back along its row
  (+88 / +36 px on screen; 5 cases, even onto a teammate's tile) or a tile picked like a return tile after an attack,
  two rows back (8 cases, e.g. Buggy (3,−1) → (1,1)); who stands where doesn't decide which, so the engine picks at
  random among them. It slides there ~0.4-0.6 s after the hit pop-up. Usually that tile is its new home, but in videos 4 and 23 Buggy walked back to his own tile ~5 s later (OPEN; the engine keeps the new tile). The target also can't act
  for a while and loses queue progress (`BLOW_AWAY_STUN` / `TUNING.blowAwayQueue`, ASSUMED amounts; video 2's two knock-backs on Buggy fit a loss of 2-3 s
  of growth, the old FINDINGS round 10, docs/HISTORY.md).
- Buff levels are **not capped** (CONFIRMED), so ability stacks of +15-21 levels are real.
- **Self heal:** the unit doesn't move. **[WIKI]**
- **Self-heal at full HP is a Normal attack instead** (LIKELY, test run 5: undamaged, Usohachi's self-heal step comes out
  as a Normal 1,113 in videos 51 and 54, and his next action is the Power attack, so the pattern still moves on).
  `TUNING.fullHpSelfHeal`.
- **Heal a teammate:** the healer picks a **free (unoccupied) teammate**, moves **behind and slightly below** it
  (`HEAL_BEHIND` 70 px, `HEAL_DY` 22 px), checks its special bar (special instead of the heal if full), then heals.
  The healer is **occupied** throughout. **[CONFIRMED]** It picks the lowest-HP free teammate and stays where it healed
  (WIKI). **[ASSUMED]**
- **Paralysis (CONFIRMED):** a paralyzed unit goes through its whole action as normal (moves up, keeps its target
  occupied, waits out the attack time, retreats), but when it's about to attack/heal it has a chance to **not do it**.
  The chance comes from the effect (e.g. 70%); 75% if none is given. The pattern still advances.
- **A regular attack can't target an enemy that is attacking or being attacked.** **[CONFIRMED]** / **[WIKI]**
- **Taunt (Provoke):** every regular attack is redirected to the provoker. If the provoker is busy, the attacker
  **waits** until it's free (its special may finish charging in the meantime). **[WIKI]**
- **Without taunt, if every enemy is busy, the unit waits** until one is free, then attacks it. With only 1-2
  enemies left this can stall the clock. **[CONFIRMED]**

## Targeting
- Regular attacks use the unit's **target priority** (`target.criteria` + `comparator`): nearby (default),
  or highest/lowest HP, ATK, DEF, SPD, RCV. **[CONFIRMED]** / **[WIKI]**
- Ties between equal stats → **nearest** unit wins. **[WIKI]**
- **"Targets closest enemies" has two extra rules [LIKELY, replay of video 4]** (`TUNING.memory`, `needAttackTile`):
  1. **Grudges first:** the unit attacks the enemy that last attacked it (since its own last action), else the enemy it
     attacked last, if that enemy is free and reachable. Only then the closest free enemy.
  2. **Unreachable enemies are skipped:** if the tile in front of an enemy at its height would be off the field, nobody
     can target it (an enemy on the top row, y 580, can't be reached from y 566).
  Evidence: four picks in video 4 where "closest" fails (e.g. PX-2 runs 500 px past three free enemies to shoot the
  Blue crew that had shot it), repeated in videos 1 and 5. With these rules the replay follows the video to 28.5 s.
  Rejected: tile distance, depth-weighted distance, picking targets one beat early, lowest HP / gauge / recency.
- Specific-stat targeters **search only within some range**, so they can pick a nearer unit over a far-away "lowest HP"
  unit. **[WIKI]** [OPEN] Search range.
- **Specials** mostly ignore the regular target and **hit the nearest enemies**, unless the special names a target
  (e.g. lowest HP). **[WIKI]**

## Specials
- Each special has a **CT (charge time, seconds)**. CT doesn't change with special level. **[WIKI]**
- **When a special fires [MEASURED, Luffy 2087, videos 21-23]:** the unit is picked on its normal turn, goes up to its
  target as for an attack, and **fires the special on arriving in attack range**, in place of the attack. In all 5
  normal-speed specials Luffy dashes up and the flash comes as he reaches ~100-130 px from his target, 0.1-0.5 s after
  the pick (sim: median 0.33 s, 10-90% 0.13-0.43 s). An earlier reading of "fires from ~300 px, never at attack
  range" came from bad position tracking. When the battle resumes the user heads straight back to where it set out
  from (`SPECIAL_STAY` 0). Healers likewise fire on arriving **[ASSUMED]**. The action pattern does **not** advance
  (Luffy: Normal, Normal, special, Power, special, Full in videos 21 and 23), so the skipped attack comes next time. **[CONFIRMED]** If the bar fills just after a
  unit's turn, it waits for the next one ("speed tuning"): Luffy's 20 s special filled at 20 s and fired at 28-32 s.
- **The special takes no battle time:** the clock stops the moment it fires and all its effects land, in order, during
  the cut-in (see Full game time). **[MEASURED]**
- **Special CT buffs: −2% charge time per level** (e.g. level 10 = 20% faster). **[WIKI]** / **[SHEET]**
- **Charge starts at 0 when the battle starts and goes up one step per tick of the battle timer** (whole seconds; the
  card's bar steps on the ticks). It **resets to 0 when the special fires** and steps again on the next tick, so after
  a reset the first second is short (0.33 s in video 21). A 20 s special is ready on the 20th tick. **[MEASURED]**
  (`CHARGE_WHOLE_SECONDS`) A bench unit coming in **inherits the KO'd unit's charge**. **[CONFIRMED]**
- **Charge follows game time** (stands still during cut-ins, e.g. while a bench unit comes in). **[CONFIRMED]**
- **Two units ready at once:** whichever attacks first uses its special first (each fires on its own arrival).
  **[CONFIRMED]**
- **Super specials** play an extra animation in the game; treated as a regular special. **[CONFIRMED]**
- "Super Rumble" specials with extra conditions: ignored for now. **[CONFIRMED]**
- **Interrupts:** a unit that takes **special damage during its attack animation** cancels its attack and
  **stays where it is** instead of moving back. **[WIKI]**
- **Hypothesis [WIKI]:** each unit has an *actual* position and a *home* position. Specials sometimes aim at
  home positions, so they can overshoot and miss. Engine v1 aims specials at actual positions. **[ASSUMED]**

## Special ranges (`range` in data) **[WIKI]**
- **No range given → map-wide.** A `count` limits the number of targets (e.g. "3 enemies").
- **Radial** (small/medium/large): circle around the target area; never "misses". Small ≈ 1 enemy, medium ≈ 1-3,
  large ≈ 4-5.
- **Forward** and **Lateral (sideways)**: can overshoot and miss entirely.
- **Buff/debuff effects reach slightly less far than the damage** of the same special.
- **Engine model [ASSUMED]** (`inRange`, `RADIAL_RADIUS`, `LINE_LENGTH`), sized from the tile grid (next tile along a
  row 94 px, next row 52 px; the starting formation spans ~300 px) and the hit counts above. All aimed at the special's
  target (the unit it walked up to); the direction is user → target.
  - Radial: circle around the target, radius small 45 / medium 140 / large 300 px.
  - Forward: band from the user through the target, 80 px wide, small 150 / medium 300 / large 500 px long.
  - Sideways: band across the user → target line, centred on the target, 80 px thick, 150 / 300 / 500 px long.
  - Buff/debuff parts: 90% of the size (`NON_DAMAGE_RANGE_FACTOR`).
  - [OPEN] measure from recordings (the old `analysis/find_test_units.ts` searched the data for test units; removed, docs/HISTORY.md).

## Stats
"Displayed" = the stat on the character screen (already includes Limit Break and cotton candy).
- **Rumble base stats** **[SHEET]** / **[WIKI]**:
  - `HP  = displayedHP  × (1 + 0.015  × (potential levels + socket levels) × specialLv / maxSpecialLv)`
  - `ATK = displayedATK × (1 + 0.0075 × (potential levels + socket levels) × specialLv / maxSpecialLv)`
  - `RCV = displayedRCV × (1 + 0.0025 × (potential levels + socket levels) × specialLv / maxSpecialLv)`
  - The count is the unit's own levels, up to 40 in total (3 potentials × 5 + 5 sockets × 5), less for non-6★ and
    older units with fewer potentials or socket slots; it isn't scaled by the unit's maximum (user, 2026-11-09).
    `rumbleStats()` in `src/engine/stats.ts`.
  - Cotton candy: +5 HP, +2 ATK, +1 RCV per point; **max 200 per stat, 600 total**. **[CONFIRMED]**
  - **This formula is still current.** **[CONFIRMED]**
  - "LB nodes" in the calculator means **potential ability levels** (max 15); sockets means socket levels (max 25).
  - **Potentials** **[CONFIRMED]**: a unit has 0-3 potential abilities, each unlocked at a node of its Limit Break tree
    (OPTC-DB `details.js`). Once unlocked a potential is at least level 1, up to 5; locked ones count 0.
  - **Sockets:** up to level 5 per slot. Slots = the unit's own (OPTC-DB `units.js`) plus any unlocked by Limit Break
    nodes (sometimes behind the Limit Break key).
  - Character-screen stats = stats at the unit's **level** (`min + (max - min) × ((level-1)/(maxLevel-1))^growth`) +
    **Limit Break** node boosts (per node, parsed from OPTC-DB `details.js`) + cotton candy. Nodes after
    "LOCKED WITH KEY" need a **Limit Break key** (the expansion; separate from the Rumble key).
  - **LLB levels 0-5** raise the max level to 99 / 105 / 110 / 120 / 130 / 150 (CONFIRMED). Above level 99, stats =
    max stat × (1 + 0.5 × (1 − (150 − level)/51)), i.e. ×1.5 at 150 (same formula as OPTC-DB's damage calculator).
    Units with an LLB Rumble kit use it from **LLB 1** (ASSUMED).
  - Defaults when not set: max level, full Limit Break with expansion, 200/200/200 cotton candy, 15 potential levels,
    25 socket levels, no Rumble key.
  - **Verified against the game (2026-11-05):** 13 kit-less units (5 Pacifistas, the Buggy team) match the in-game Rumble
    status screen exactly. Findings: (1) units **without a Rumble special get no potentials/sockets multiplier**;
    (2) **stats never go below 0** (OPTC-DB gives Pacifistas negative RCV at low levels; the game shows 0);
    (3) Buggy only matches with **400 HP cotton candy**, over the 200 cap: unexplained (maybe an OPTC-DB stat
    difference). Test: `src/engine/stats.test.ts` (custom mode).
  - **Only units with max level 99 can be Limit Broken or Level Limit Broken** (others stop at their own max, e.g. 70
    or 50). **[CONFIRMED]**
  - **Cotton candy per account:** each account (yours, the opponent's) has a maximum per stat (up to 200). A unit is
    either at that max (and follows it) or has custom amounts, which legal units can't push past the max. **[CONFIRMED]**
  - **Legal vs illegal units:** each unit is a legal game unit or not (admin / test units). Illegal units have no limits
    (level, Limit Break, cotton candy, Rumble key level), can have typed-in base stats (`exact`), cost 0, and ignore
    the team rules below. Making a unit legal again brings its values back within limits.
- **Team rules** **[CONFIRMED]**: cost ≤ 300; no two legal units that are the same unit or share a **character family**
  (OPTC-DB `families.js`, e.g. two Luffys). Units with no family data never clash (old / low units; harmless).
  **Exception:** color variants of a low-rarity set (4★ and below, consecutive IDs, one family, each a different
  color, e.g. Pacifista PX-1 to PX-5 or the Shooter Group crews) can share a team. 19 such sets in OPTC-DB.
- **Positions:** 5 field slots + 3 bench, any of them may be empty. An empty field slot just has no unit; bench units
  come in from the leftmost filled bench position.
- **Rumble key** **[CONFIRMED]**: needs level 120+. Multiplies the Rumble stats (after everything above) and changes
  special charge time, damage taken and damage dealt, by key tier (tier from OPTC-DB `flags.js`; can be overridden):

  | Tier | HP | ATK | RCV | DEF | SPD | Charge time | Damage taken | Damage dealt |
  |---|---|---|---|---|---|---|---|---|
  | Anniversary exclusives, F2P (shop) legends | +40% | +25% | +25% | +15% | +25% | −10% | −20% | +15% |
  | Super Sugo-Fest exclusives | +50% | +30% | +30% | +20% | +30% | −10% | −20% | +20% |
  | Rumble legends | +40% | +25% | +25% | +15% | +25% | −10% | −20% | +15% |
  | Regular legends | +30% | +20% | +20% | +10% | +20% | −5% | −15% | +10% |
  | Treasure Map / Kizuna legends | +30% | +20% | +20% | +10% | +20% | −5% | −10% | +5% |
  | Rumble rare recruits (5★) | +30% | +20% | +20% | +10% | +20% | −5% | −10% | +5% |
  | Other rare recruits | +20% | +15% | +15% | +5% | +15% | — | −10% | — |

  Engine assumptions: the charge-time cut applies to the base cooldown before Special CT buffs; damage taken/dealt
  multiply every hit (regular and special); exact stats are taken to already include the key's stat boosts.
- **DEF and SPD are fixed per unit** (from `rumble.json`), not affected by sockets, level or any upgrade (unlike HP,
  ATK and RCV), and SPD has no cap. **[WIKI]**, **[CONFIRMED]** by the user 2026-11-06. Only buffs / debuffs change them.

## Buffs and debuffs (per level) **[WIKI]** / **[SHEET]** / **[IN-GAME]**
The game's own help screen (user, 2026-11-07) lists per level: HP 250, ATK 75, RCV 50, DEF 25, SPD 5, Blow Away % 5%,
Miss % 2.5%, Guard % 5%, Critical % 5%, Special CT Speed 3%. Crit, guard, miss and blow away never happen with Rumble
Specials; a guard gives a DEF bonus for that hit; a blown-away unit can't take action for a limited time.
**Dice of a regular attack, in order (user; fits the videos):** 1. Guard (target, 5% + 5%/level), 2. Miss, only if not
guarded (attacker, 2.5%/level on a base of ~9-10%: MEASURED 50 misses in 481 attacks), 3. Crit (attacker, 5% + 5%/level;
a guarded hit can still crit: 750 = 858 × 0.875, seen twice), 4. after the damage, Blow Away, only if not guarded
(attacker, 5% + 5%/level). MEASURED over 431 regular hits: crit 4.2%, guard ~6% (8% as read, several GUARD labels
misread), knock-back 3-6% (detection misses some) and 0 on guarded hits. Specials roll none of these.
| Effect | Per level | Notes |
|---|---|---|
| HP | +250 **max** HP | HP never goes over max HP. An HP level up raises the max but not the current HP (heals can then fill it); an HP level down lowers the max and brings the current HP down to it if it was over (user, 2026-11-18). The start of the battle and a unit's first time in from the bench are not affected: it joins at its full max with its HP up abilities. Units returning from the bench join with their current HP |
| ATK | +75 | All ATK-based damage (regular attacks and specials) |
| RCV | +50 | All RCV-based healing |
| DEF | +25 | Effective DEF floors at 0 |
| SPD | **+5 flat** (MEASURED; +5 % fails; in-game help: "SPD: 5/Lv.") | **MEASURED (test run 4, Robin 4375's crew SPD up lv 5, the old FINDINGS round 11, docs/HISTORY.md):** +5 SPD per level, speeding the queue gauge from the start (King 196 → 221, Robin 166 → 191, Pacifistas 100 → 125). A percent buff puts King 2nd at 4.6 s; no buff leaves Robin 3rd at 9.2 s where the videos have her 1st. "The rate is set at each pick" (so never the first action, as the [WIKI] says) fits run 4 too but isn't needed. No cap; walking speed unchanged |
| Special CT | charge fills **3% faster per level** (in-game help "Special CT Speed: 3%/Lv."; time = CT / (1 + 0.03 × level), the "speed" reading ASSUMED) | Was −2% time per level (a wiki example, 40 s → 32 s at 10 levels). Not measured: runs 1-4 have no Special CT buff on a unit with a special before 70 s |
| Critical Hit | +5% crit chance (base 5%, WIKI) | Crit = ×1.5 damage. Regular attacks only. **[CONFIRMED]** |
| Guard | +5% guard chance (base 5%, WIKI) | A guarded hit does **×0.875** damage (MEASURED: 573 → 501, 571 → 500). Not vs specials. **[CONFIRMED]** |
| Accuracy down (Miss) | +2.5% miss chance per level (in-game help; base ~9%: MEASURED 50 misses in 481 attacks, engine 9%) | A miss does 0 damage; specials are unaffected. **[CONFIRMED]** |
| Blow Away | +5% chance per level (base **5%**, user; MEASURED 5.6% of unguarded hits; **lv 5 → ~30%**, test run 5: 6-7 of 22 hits, by eye) | Blown-away units can't act for a while (in-game help; engine 2 s, ASSUMED) and drop back in the queue (ASSUMED). A guarded hit can't knock back (ASSUMED, user: Guard up resists it; 0 in 24 guarded hits). **[CONFIRMED]** |
- Some team buffs apply only to certain colors/classes, so each unit has its own total buff levels. **[WIKI]**
- **No cap on buff levels**: levels from all sources add up, and buffs and debuffs on the same stat net out. **[CONFIRMED]**
- **The net level can't go below −1** (user, 2026-11-07): however many debuffs stack, a stat counts as at most −1 level
  (`TUNING.minBuffLevel`). Not applied to Accuracy, whose down levels are the miss chance (+2.5% each). **[CONFIRMED]**
- **Ability (passive) effects last as long as the unit is on the field and not Ability-Bound.** Special effects
  last for their duration. **[CONFIRMED]**

## Damage **[SHEET]** / **[WIKI]** / **[MEASURED]**
- **Measured from damage pop-ups:** regular hit = **floor**( **floor**(ATK × 0.6 × 1.5 if crit) × 1/(1 + DEF²/50,000)
  × 0.875 if guarded × key boosts), then **each global-rule damage % (crew tag, last 30 s) on the rounded value, rounded
  down again** (MEASURED, test run 4). ATK × multiplier is rounded down **before** DEF applies, and the DEF constant is
  √50,000 ≈ 223.6 (DEF 50 → exactly 1/1.05). All 9 distinct measured values match: Pacifista ATK 1,000/1,002/1,004 →
  571/572/573; Mohji 1,059 → 604; Cabaji 958 → 546; Buggy 1,257 → 718; Alvida 1,299 → 741; Black crew 455 → 260, crit 389;
  Blue crew 210 → 120; crit + guard 750. The "last 30 s damage up" rule was **+5%** (571 / 572 / 573 → 599 / 600 / 601,
  never 602, so it applies after the rounding).
- **Crew tags (user, test run 4): Paramythia-type and Giant units deal +30% damage and take −30%.** MEASURED on Robin
  4375 (Paramythia, no Rumble key): Normal 1,741 → 2,263, Power 2,613 → 3,396, guarded 2,971, last 30 s 2,376.
  Modeled as tag rules (`RUN4_RULES`).
- **Miss: ~9% base** (MEASURED: 22 "Miss" pop-ups in ~247 attacks over the 5 recordings, likely range 6-13%;
  `HIT_RATES.miss`). The "Miss" shows over the **attacker's** head, not the target's.
- **Crit:** 9 CRITICAL labels in ~247 attacks (~4%), consistent with the 5% base.
- **Guard [OPEN]:** ~18% of the Pacifistas' hits on the Buggy team show GUARD, but only ~3% of the Buggy team's hits on
  the Pacifistas. The engine uses 5% for everyone.
```
rawDamage  = (ATK + 75 × ATKbuffLevel) × multiplier
effDEF     = max(0, DEF + 25 × DEFbuffLevel)
damageMult = 1 / (1 + (effDEF / 223.33)²)
damage     = rawDamage × damageMult   (× 1.5 if crit, × 0.5 if guarded — regular attacks only)
```
- Multipliers: **Normal 0.6, Power ("strong") 0.9, Full ("all-out") 1.5**. Specials use their own multiplier
  (the data's `amount` for `type: "atk"`).
- DEF is a **percentage damage reduction**, not a flat subtraction. Rough feel: 1 DEF up ≈ 9% less damage taken. The
  formula `1/(1+(DEF/223.33)²)` fits the measured data within ~1% from DEF 0 to 704. (The sheet's 6th-degree polynomial only works below 704.)
- **Fixed damage and %-HP damage (HP cuts, DoT) ignore DEF.** **[WIKI]**
- Buffs/debuffs only count if they're active **before** the hit. Some specials apply their debuff before their damage, some after; the order of effects in the data is assumed to be the order they happen. **[ASSUMED]**
- **Specials cannot crit**, and Guard doesn't apply to them. **[WIKI]**
- Guard's ×0.5 is uncertain (inconsistent at high DEF). **[WIKI]**
- **No color advantage in Rumble.** Color only matters through unit-specific damage resistances (`resilience` entries of type `damage` in the data, e.g. less damage from [STR]). **[CONFIRMED]**
- [OPEN] Random damage spread?

## Healing **[WIKI]**
- Heal pattern level 1 ≈ **0.3 × RCV**, level 2 ≈ **0.6 × RCV**, level 3 ≈ **1.0 × RCV**.
- [OPEN] Area sizes for Small/Medium/Large heals.

## Hinderances **[WIKI]**
- **Damage over Time:** **5% of max HP per level**, taken **each time the affected unit does a regular attack**
  (specials and heals don't trigger it). DoT levels stack, up to Lv 10 (user 2026-11-24). Ignores DEF.
- **Paralysis:** see Regular actions. Doesn't block specials.
- **Action Bind (Bind):** no actions at all (regular or special) for X seconds.
- **Action Bind and Special Bind add up** (user, 2026-11-25): a bind landing on a unit that already has it adds its
  duration to what is left (5 s left + a 10 s bind = 15 s). Other statuses (Paralysis, Confusion ...) run side by
  side instead, the unit having it until the last copy ends [ASSUMED].
- **Silence:** no specials for X seconds; regular attacks still allowed.
- **Provoke (Taunt):** see Regular actions.
- **Blow Away (Knockback):** see Regular actions.
- **Half Stats / Half ATK / Half DEF:** halve base ATK and/or DEF for the duration. **[ASSUMED]**
- **Ability Bind:** the unit's abilities (auras, triggers, on-arrival effects) are off for the duration. **[CONFIRMED]**
- [OPEN] Confusion, Revive.

## Unit data notes
- **Dual units get no color**: they count as neither of their colors for color-based effects. Their classes are only
  their **dual-form** classes (e.g. Vivi/Rebecca = Striker/Cerebral, not Free Spirit). **[WIKI]**
  The importer gives dual units (`units.js` color null) no color.
- VS units with separate Rumble entries (e.g. 3134.1 Kaido, 3134.2 Big Mom) have their own stats and color.

## Engine interpretations of the unit data **[ASSUMED]**
How the v1 engine reads parts of `rumble.json` that the schema doesn't spell out. Each is a guess to check.
- **Ability effects** are always-on buff/debuff levels while the unit is on the field. They're re-evaluated every 0.5 s (and
  on every KO / bench entry) so conditions such as "first 50 s" or "HP above 70%" switch on and off.
- **Special buffs/debuffs without a duration** last the rest of the battle.
- **`spread: true`** damage splits the multiplier evenly across everyone hit.
- **Tag targets** (`[QCK]`, `Slasher`, `[Straw Hat Pirates]`, …): harmful effects (damage/debuff/hinderance) hit
  *enemies* with that tag; helpful ones hit *allies* with that tag. Crew tags come from OPTC-DB `tags.js`;
  `[Navy]` also matches "Former / Navy".
- **Targeting filters:** `priority: highest/lowest` + `stat` + `count` picks the top N; `priority: above/below` + `amount` or
  `percentage` is a threshold filter (e.g. DEF below 600, special charge below 70%); `status` keeps only units under
  that status.
- **Conditions:** "more"/"less" are inclusive (≥ / ≤); "above"/"below" are strict. `composition` counts the whole 8-unit
  team; otherwise only units still in the fight count. HP conditions check the ability's owner. `mode` conditions
  (e.g. Assault Rumble) are always false.
- **Hinderances:** Paralysis's `chance` is the per-attack chance of not acting. Other hinderances roll their `chance`
  to land; then the target's debuff resilience, then any active **Evade** effect, get a chance to stop it.
- **Ability triggers** (`condition.type: "trigger"`): non-buff effects ("every 10 hits: +5 s special charge") fire **each
  time** the counter passes another multiple of N. Counted events: `hit` (regular hits landed), `takes damage`, `heal`
  (heals performed), `Guard`, `Critical Hit`, `Blow Away` (knock-backs caused), `defeated` (enemies or crew defeated),
  `receives X`. Buff abilities with a trigger switch on once the count reaches N.
- **On-arrival ability effects** (`onArrival: true`) apply once when the unit enters the field (battle start or from the
  bench), if their condition holds at that moment.
- **Special charge** is capped at the *effective* charge time (after Special CT buffs/debuffs).
- **Special charge boosts and delays are percentages** of the unit's charge time (e.g. "+30" = 30% of the bar). **[CONFIRMED]**
- **Bench units don't charge their special.** A unit coming in after a KO takes over the KO'd unit's charge. **[CONFIRMED]**
- **Counter** (boon, CONFIRMED): when hit by a regular attack, the unit strikes back for `amount` × its ATK.
- **Haste** (boon, CONFIRMED): the unit is picked instead of the highest-gauge unit in the next window.
- **Switch** (CONFIRMED): the "Nth sub character" is the Nth unit still waiting on the bench, in the order they come
  in (user, 2026-11-18): "1st" = the one about to come in next (bench place A/D6), "2nd" = the one after it (A/D7),
  "3rd" = A/D8. The two **swap places**: the outgoing unit takes the incoming unit's bench place (not the back of the
  bench) and keeps its HP; the incoming unit takes its field place. No unit waiting in that place: no switch
  [interpretation]. The incoming unit takes over the outgoing unit's special charge
  **value** (seconds, not %), which is usually 0 because the switch happens as a special fires. **[CONFIRMED]**
- **Forced Out** (CONFIRMED): the unit is **out of the game until the duration ends**: it can't be targeted, can't act,
  its special charge is frozen and its abilities are off. Then it returns to its spot. Nobody replaces it meanwhile.
  **Emergency rule** (user, 2026-11-13): if every unit a team has on the field is Forced Out, they are all KO'd at once
  ("rumbled out"); the bench comes in as after a normal KO, and with no bench the team loses.
- **Shield** (CONFIRMED): a pool of damage it can soak, bigger at higher levels (engine: 1,000 per level,
  `SHIELD_PER_LEVEL`, ASSUMED amount). Damage goes to the shield; a hit bigger than what's left breaks the shield **and still
  does no damage to the unit**. Special shields last their duration. **Ability shields are applied once, to the unit
  itself, when their condition is first met** (e.g. Ace with Luffy or Yamato on the team). **[CONFIRMED]**
- **On Death** (CONFIRMED): when the unit's HP hits 0 it fills its special bar and jumps the queue (ahead of hasted
  units) to fire its special, then goes down. Effects conditioned on "HP below 1%" apply then. Once per battle.
- **Super specials** (CONFIRMED): once a unit's super special condition is met (e.g. "after receiving enemy specials 2
  times", "after being damaged 5 times", "after 8,000 damage", "HP below 50%", "last 50 s", "after being healed 4 times",
  "after enemies use 3 specials", "after receiving Special CT Delay 3 times"), its next full special bar fires the super
  special instead. **Each unit can use its super special once, and each team at most 3 per battle.** **[CONFIRMED]**
  A unit whose super is ready after its team's 3 have gone fires its regular special. The game shows each team's
  supers left as three flames under its unit count (red yours, blue the opponent's), burnt out black from the middle
  outward; the replay HUD shows the same (user, 2026-11-18).
- **LLB upgrades** (CONFIRMED that it varies by unit; OPTC-DB only stores base vs LLB): each unit's LLB abilities (with
  resistances), LLB special and LLB super special unlock at a per-unit LLB level, default 2 / 4 / 5, editable in the
  team editor.
- **Evade** (effect): a chance to dodge the listed hinderances while it lasts.
- **Cleanse "all"**: removes every debuff and hinderance.
- **Heal over time** (`recharge` with `interval` and `duration`): heals `amount` every `interval` seconds.
- **Damage-type resilience** (`dmgtype`): reduces Fixed / Percentage / DEF-ignoring damage by its %.
- **`dmgboost`** resilience: this unit deals ×`amount` damage to units of that color/class.
- **Style targets** (`ATK-Style`, `DBF-Style`, …) match the unit's Rumble style; `targeting.families` adds those families.
- **Relative conditions** (`relative: true`): compare team sizes, e.g. "crew has 1+ more units than the enemy".
- **Recharge "Special CT"** adds `amount` seconds of charge; **hinderance "Special CT"** removes `amount` seconds.
- **Special targeting/ranges:** radial and sideways ranges centre on the enemy nearest the caster; forward ranges
  extend from the caster toward the enemy side.
- **Spread damage** (`spread: true`) splits the amount evenly across everyone hit, for ATK-based, fixed and random damage.
- **Not simulated yet** (logged as "unsupported" in each result): Confusion, Revive, and GP.
