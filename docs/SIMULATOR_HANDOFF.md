# Pirate Rumble simulator: handoff for a from-scratch build

Written 2026-11-10 for a new chat that will build a Pirate Rumble (One Piece Treasure Cruise) battle simulator from
scratch. Goal of that simulator: **predict Rumble win rates that match the real game as closely as possible**, over
many simulated battles.

**This document needs nothing else.** It states every rule known so far, how sure each one is, the numbers to check
an implementation against, and what is still unknown; the appendices carry the supporting material in full:

| Appendix | What |
|---|---|
| A | Test run 9, the reference battle: both teams with exact stats, opening buff levels, keys, resistances, and every ability and special effect |
| B | Test run 9 number by number: who hit whom for how much, what the rules predict, and the events the user identified |
| C | How a recording is analyzed, step by step |
| D | The full mechanics notes: every rule with its evidence, the low-end check values (test runs 1-7), full stat formulas, cut-in lengths |

Outside this document you only need:
- **the unit database**: OPTC-DB, 2Shankz fork, `https://github.com/2Shankz/optc-db.github.io`, folder `common/data/`:
  `rumble.json` (abilities, specials, patterns, DEF, SPD, resilience), `units.js`, `details.js`, `flags.js`,
  `families.js`, `tags.js`, `cooldowns.js`;
- **the recordings and screenshots** in the project folder (`Test Run 1 Videos` ... `Test Run 9 Videos`; runs 8 and 9
  are the high-end battles, each with a text file holding the two team codes), to check anything by eye.

(2026-11-17: this document now lives in `docs/`; the old engine and the old analysis tools it mentions were removed,
see `docs/HISTORY.md`.) Optional, if the repository is at hand: `src/engine/` is an older TypeScript engine (a reference for parsing the
database and for the stat formulas, **not** a model for the randomness design below; on branches from before
2026-11-11 it still has a flat guard factor, flat key bonuses, a buff level floor of -1 and "after N events"
triggers, all replaced by the rules here), and `analyzer/` is the video analyzer used for appendix B.

Confidence tags used below:
**[C]** confirmed by the user or exact on recordings · **[M]** measured from recordings · **[L]** likely (fits, few
samples) · **[A]** assumed (placeholder) · **[O]** open (unknown).

---

## 1. Randomness: the required design

Everything in a battle is deterministic except the items in the table. The simulator must take **one main seed** and
derive independent random streams from it, **per unit and per purpose**, so that one kind of randomness can be
varied while the others are held fixed.

| Stream (per unit) | What it decides | Must be independent of |
|---|---|---|
| **Special stream** | Every chance inside specials and abilities: "70% chance of Confusion", "2 random enemies", a chance-based Ability Bind, Paralysis procs from a special | Timing. The outcome of a unit's 1st, 2nd, 3rd special must be the same whatever moment it fires |
| **Timing stream** | The unit's animation times and distances (section 9): wind-up, stay, reach | Specials |
| **Attack-dice stream** (agreed by the user, 2026-11-10) | Regular-attack dice: guard, miss, crit, blow away; where a unit walks back to; where a knocked-back unit lands | Both of the above |

Rules for the streams:

1. **Derive, never share.** `stream = hash(mainSeed, side, slot, purpose)`. No global generator that every roll
   advances: with a shared generator a change in timing would shift every later special roll.
2. **Index special rolls by what they are, not by when they happen.** A roll is addressed as
   `(unit, purpose = special, n-th use of this special, effect index, target index or draw index)`. A counter-based
   generator (hash of that address) gives the same answer whenever it is asked. That is what makes "the first
   special always picks the same two targets and lands the same Confusion" true across timing variations.
   Target picks "at random among N" must draw a ranking over **all units of the side by fixed slot order** and take
   the best-ranked eligible ones, so the pick does not depend on who happens to be alive in a way that reshuffles
   everything else.
3. **Timing is drawn once per unit per battle**, at the start, from the timing stream: the unit then has the same
   animation lengths for the whole battle.
   - Unit **measured accurately**: use the measured values, no randomness.
   - Unit **measured roughly**: draw uniformly inside the measured range (section 9 gives the ranges).
   - Unit **not measured**: pick one of the measured units' timing profiles at random and use it as this unit's own.
4. **Win-rate experiments** the design must support:
   - vary the special seed, hold timing (same animation lengths, different special outcomes);
   - vary the timing seed, hold specials (identical target picks and chance results on each unit's 1st, 2nd, 3rd
     special);
   - vary everything (the plain win rate).
   Report win rate with its standard error, and the spread explained by each stream.
5. **Decision log.** Every draw is recorded (unit, purpose, address, options, result) and can be forced from
   outside, so a recorded battle can be replayed exactly (the project's standing rule: no randomness outside this
   mechanism).

---

## 2. Battle structure

- Two teams. Each has **5 field slots and 3 bench slots**; any slot may be empty. Team cost limit 300. **[C]**
- **Battle length 100 s of battle time.** The attacker (left side, "your team") wins by defeating every enemy unit,
  bench included, within 100 s; otherwise the defender wins. **[C]**
- Battle time stops during cut-ins (specials, bench entries, ability announcements). Cut-ins change nothing about
  the outcome; a win-rate simulator can treat them as instant. **[M]**
- The game renders at 30 frames per second; a tick of 1/30 s reproduces the recordings. **[M]**
- Every on-field unit's **ability (passive)** is active; bench units' abilities do nothing until they enter. **[C]**
- GP (Grand Party) data is out of scope. **[C]**

## 3. Field and positions

- The field is a **tile grid**. Units move in straight lines but stand still only on tile centers. **[M]**
  Your tiles (pixels of a 1080x1920 battle-start screen): `(199, 645) + i * (86, 37) + j * (-12, 51)`; `+i` is toward
  the enemy, `+j` down the screen. The enemy's grid is the same grid turned half a circle about `(540, 668)`.
- Start tiles (i, j), slots 1-5: yours `(1,-1) (2,-1) (3,-1) (2,0) (0,0)`; the enemy's the same list in its own grid in
  the order `(3,-1) (2,-1) (1,-1) (0,0) (2,0)`. **[M]**
- A tile is taken if a unit stands on it or is heading to it.
- Units rest where they last came back to, not on their start tile: formations drift toward the middle. **[M]**

## 4. Turn order

1. **Gauge.** Every unit has a queue gauge starting at 0. It grows by `100 + 0.86 * (SPD - 100)` per second. **[M]**
   SPD here is `min(250, base SPD + 5 * net SPD level)`: **anything above 250 counts as 250** **[L]**, although the
   stat shown can be higher.
2. **It grows only while the unit is free**: not acting (from being picked until 0.2 s after it is back on its
   tile), and not being attacked (from the moment an enemy picks it as a target until that enemy heads back). **[M]**
3. **The beat.** Every **1.526 s** one unit is picked: the free unit with the highest gauge that has a reachable
   target. Ties: your team first, then lower slot. **[M]** Its gauge resets to 0, it picks its target and starts
   moving on that beat. If nobody can act, the beat passes.
4. **Priority over the gauge:** a unit making an On Death last stand, then units with Haste, then the gauge. **[C]**
5. **A unit under attack is skipped for that beat** and the next free unit is picked instead; the skipped unit keeps
   its place and usually goes on the next beat. **[C]** (test run 9: five cases)
6. The on-screen NEXT column shows the free and attacked units by gauge plus 1 s of their own growth, redrawn on
   each beat. Display only. **[M]**
7. Action Bind stops the unit's gauge; its special still charges. **[C]** (user, 2026-11-10)

## 5. Regular actions

- Each unit has an **action pattern** that loops: Normal / Power / Full attack, or a heal of level 1-3 with an area.
  **[A]** for the loop. Example: Shanks is Normal, Normal, Power, Full.
- **Attack:** walk to the free tile nearest a point in front of the target (the reach, section 9), wind up, hit,
  stay, walk back to a tile two rows back and 1, 2 or 3 tiles behind the attack tile, **chosen at random among the
  free ones** (attack-dice stream). **[M]**
- **A full special bar fires instead of the attack**, on arriving in range, and the pattern does not advance. **[M]**
  **Special Bind: the unit attacks even with a full bar.** **[C]**
- **Targets:** by the unit's target rule (`target.criteria`): nearest (default), or highest / lowest of a stat, ties
  to the nearest. A unit cannot target an enemy that is acting or already being attacked. If no enemy is free, the
  unit waits. **[C]**
  - For "nearest" units **[L]**: first the enemy that last attacked it, else the enemy it attacked last, if free and
    reachable; then the nearest free enemy. An enemy whose front tile is off the field cannot be targeted.
- **Provoke:** regular attacks are redirected to the provoker; attackers wait while it is busy. **[C]**
- **Heal step:** a self-heal does not move the unit; at full HP it becomes a Normal attack **[L]**. Healing a
  teammate: go behind the free teammate with the lowest HP, heal, stay there. Amount: `0.3 / 0.6 / 1.0 * RCV` for
  level 1 / 2 / 3. **RCV Bind: the unit recovers no HP at all**, from pattern heals, passives or specials. **[C]**
- **Paralysis:** the unit plays its whole action but has the effect's chance (75% if none given) of not doing the
  hit or heal; the pattern still advances. **[C]**
- **Confusion [C]:** on every action while Confused the unit attacks **its closest team mate** (likely the closest;
  user) as an enemy would: it stands on the side the enemy attacks from, facing its own team (a unit of the left
  team moves to the right of its team mate and faces left), then walks back the way an enemy would retreat (up and
  to the right), and the mirror image for the right team. If its special bar is full when it acts, the charge is
  reset to zero and it attacks anyway. (run 9: the enemy Nusjuro hits Sakazuki for 4,886.)
- **An attack already launched still lands after its target is KO'd** and uses the target's stats from the moment
  of launch. **[C]** (run 9: two cases). It deals no real damage (the target is gone) but matters for triggers.

## 6. Dice of a regular hit, in this order

| Step | Who | Chance | Effect |
|---|---|---|---|
| 1. Guard | target | 5% + 5% per Guard level | **the target's DEF counts double for this hit** **[C]** |
| 2. Miss (only if not guarded) | attacker | about 9% base + 2.5% per Accuracy-down level **[M]** | no damage |
| 3. Crit (also on a guarded hit) | attacker | 5% + 5% per Critical Hit level | damage x1.5 |
| 4. Blow Away (after the damage, not if guarded **[A]**) | attacker | 5% + 5% per Blow Away level **[M]** | knock-back |

- Specials roll none of these. **[C]**
- **Knock-back:** the target slides either one tile straight back or to a return-type tile two rows back (random,
  about 5 : 8) **[M]**; it cannot act for 2 s and loses 2 s of gauge growth (**[A]**, kept by the user as long as
  it stays consistent with the recordings: test run 2 fits a loss of 2-3 s).
- Measured rates over 431 hits: crit 4.2%, guard about 6%, miss 10.4% of attacks, knock-back 5.6% of unguarded hits.

## 7. Damage

**Regular hit [C]** (all values checked against recordings to the point):

```
raw    = floor( ATK * typeMult * (1.5 if crit) )          typeMult: Normal 0.6, Power 0.9, Full 1.5
defEff = DEF * (2 if guarded)                             DEF never below 0
dmg    = floor( raw / (1 + defEff^2 / 50000) )
then each percentage factor in turn, flooring after each:
  - global rules: damage dealt +x% (attacker's tag), damage taken -x% (target's tag), last-30-s damage up (+5%)
  - the target's resistance to the attacker's color / class (resilience "damage" entry)
  - the attacker's boost against the target's color / class (resilience "dmgboost" entry)
  - Rumble key factors (section 8)
```

- ATK = base Rumble ATK + 75 per net ATK level; DEF = base DEF + 25 per net DEF level. **Half Stats / Half ATK /
  Half DEF halve the whole stat, buffs included [C]**; which stats are halved depends on the effect's text (all, or
  only ATK, or only DEF, ...).
- **Special damage [C]:** `floor(ATK * amount) / (1 + DEF^2/50000)` and the same percentage factors; no type
  multiplier, no dice. `defbypass` skips the DEF division. `fixed` damage is the amount itself and ignores DEF;
  `cut` is a percentage of current HP; `spread` splits the amount evenly over everyone hit.
  **Damage that ignores DEF also ignores Shields and Damage Reflect [C].** Percentage damage against a shielded unit
  is worked out on the unit's HP as usual and that amount is then soaked by the shield **[C]**. Effects of a special
  apply in the order listed in the data, so **a special's own DEF down lands before its damage**. **[C]**
- No color advantage in Rumble other than through resilience entries and keys. **[C]**
- **Damage over Time [C]:** 5% of max HP per level, taken each time the affected unit does a regular attack; not
  when it fires its special. Levels stack up to Lv 10 (user 2026-11-24); ignores DEF.
- **Shield [C]:** a pool of **500 HP per level** that soaks damage; a hit larger than what is left breaks the shield
  and still does no damage to the unit.
- **Damage Reflect [C]:** while it lasts the unit takes a stated share less damage and sends a stated multiple of the
  damage back to whoever dealt it, for regular attacks and special damage alike (e.g. 70% reduction, 1x reflected).
- **Counter [C]:** when hit by a **regular attack only**, the unit sends damage back; with no amount given, 1x the
  incoming damage.
- **What is sent back (both) [C]:** the incoming damage **before the defender's own DEF** (the attacker's raw
  `floor(ATK * multiplier)`), times the stated multiple, **then reduced by the original attacker's DEF** like any
  hit on it.
- **Revive [C]:** the first time the unit's HP reaches 0 it is set back to the stated share of its HP (e.g. 50%)
  instead of being KO'd; the data's `repeat` says how many times (usually 1; "may be revived again depending on the
  text").
- **On Death + Revive on one unit [C]:** when HP first reaches 0 the unit jumps to the top of the queue, fires its
  special, and has its HP restored to the Revive amount. The On Death special can be used once only (unless the
  text says otherwise): the next time it reaches 0 it does not fire again. Everything else stays as it was: buffs, statuses, gauge, special charge,
  position.

Check values (test run 9, with the stats in appendix A):

| Hit | Shown | Formula |
|---|---|---|
| Shiryu Normal on Kuma | 927 | 927 |
| Shanks Normal on Blackbeard & Kuzan (Kuma's passive bound) | 476 | 477 |
| Shanks Normal on Blackbeard & Kuzan, **guarded** | 144 | 145 (a flat guard factor would give 444) |
| Loki Normal on Nusjuro (key +20% vs STR) | 1,700 | 1,700 |
| Shiryu Power on Nusjuro at DEF 0 | 5,056 | 5,055 |
| Kuma Normal on Shiryu (resists STR 20%, key 10%) | 282 | 284 |
| Blackbeard & Kuzan special 3x on Uta / Kuma / Imu | 16,674 / 7,774 / 21,464 | 16,669 / 7,772 / 21,458 |
| Loki special 4x on Nusjuro at DEF 0 | 39,690 | 39,690 |

Tolerance when comparing: 3 points, or 0.2% for large numbers. Low-end check values (test runs 1-7) are in
appendix D, "Damage".

## 8. Stats, buffs, keys, rules

**Rumble base stats [C]:**
```
HP  = shownHP  * (1 + 0.015  * (potential levels + socket levels) * specialLv / maxSpecialLv)
ATK = shownATK * (1 + 0.0075 * ...same...)
RCV = shownRCV * (1 + 0.0025 * ...same...)
```
`shown` = character-screen stat (level, Limit Break, cotton candy: +5 HP / +2 ATK / +1 RCV per point, max 200 each).
`specialLv` is the **main-game** special level. Units without a Rumble special get no multiplier. **DEF and SPD are
fixed per unit** (`rumble.json`), changed only by buffs and the key. Full detail (level curve, Limit Break, LLB
levels, exact stats): appendix D, "Stats". The project's team codes (`RS1....`) carry a unit's level, Limit Break,
cotton candy, special and ability levels and key; their format is defined by the old engine (`src/engine/
teamCode.ts`), and appendix A gives the decoded result for run 9.

**Buff levels [C]:** per level HP +250 max HP, ATK +75, RCV +50, DEF +25, SPD +5, Critical / Guard / Blow Away +5%,
Accuracy down +2.5% miss, Special CT +3% charge speed (time = CT / (1 + 0.03 * level), shape **[A]**).
Levels from all sources add up, buffs and debuffs net out, **no maximum and no minimum on the level**; only the stat
itself stops at 0 (and SPD counts as at most 250). A unit's cards show its current levels.

- **Ability buffs** hold while their owner is on the field and not Ability-Bound, and while their condition holds.
- **Special buffs** last their duration in battle seconds; without a duration, the rest of the battle.
- **The same effect landing again while the first is still running adds its levels** for as long as the two overlap;
  each copy ends on its own time. **[C]** Shields likely add the same way while they overlap **[L]**.
- A unit KO'd, switched out or forced out takes its ability's buffs with it at once.

**Rumble key [C]:** multiplies the unit's stats and shortens its special charge by tier, and adds **to its type
resistance only**: against the same color / classes its resilience "damage" entries name, X% less damage taken and
Y% more damage dealt. Nothing against anyone else. X multiplies with the resilience percentage **[L]** (user: it
is the closer fit; Kuma on Shiryu 284 predicted, 282 shown; adding gives 276).

| Tier | HP | ATK | RCV | DEF | SPD | Charge time | X taken | Y dealt |
|---|---|---|---|---|---|---|---|---|
| Anniversary units, shop / exchange legends (exchange Ace, Vivi) | +40% | +25% | +25% | +15% | +25% | -10% | -20% | +15% |
| Super Sugo-Fest exclusives | +50% | +30% | +30% | +20% | +30% | -10% | -20% | +20% |
| Rumble legends | +40% | +25% | +25% | +15% | +25% | -10% | -20% | +15% |
| Regular legends | +30% | +20% | +20% | +10% | +20% | -5% | -15% | +10% |
| Treasure Map / Kizuna rare recruits, Rumble rare recruits | +30% | +20% | +20% | +10% | +20% | -5% | -10% | +5% |
| Other rare recruits (banner only) | +20% | +15% | +15% | +5% | +15% | none | -10% | none |
| Farmable 5-star units (co-op, PKA / TM / Kizuna shops, ...) | as above **[A]** | | | | | | -5% | none |

The tier comes from OPTC-DB `flags.js`, in this order: `annilrr` -> anniversary; `superlrr` -> Super Sugo-Fest;
`pflrr` -> Rumble legend (6-star) or Rumble rare recruit; `tmlrr` / `kclrr` -> TM / Kizuna; `shop` and 6-star ->
anniversary tier (shop / exchange legends); below 6 stars with neither `rr` nor `rro` -> farmable; otherwise regular
legend (6-star) or rare recruit.

**Global rules [C]:** a season's rules give stat levels to a color or class ("QCK units: ATK up lv 4"), damage dealt
/ taken percentages to a crew tag ("[Logia-type] damage dealt +20%, taken -20%"), and last-30-s effects (Special CT
up, damage +5%). They apply in battle even where the game text says "Combat Power only". The rules of each test
run are in appendix D ("Damage", and the run notes) and, for run 9, appendix A.

## 9. Animation times and distances (the timing stream)

Per unit: **wind-up** (arrival to the hit), **stay** (arrival to walking back), **reach** (distance kept from the
target). Walking speed is the same for every unit whatever its SPD: about 900-1,000 px/s out, 1,100 px/s back.
**[M]** Timings do not depend on SPD.

Measured so far (test runs 1-7, 15 recordings; "strip" = the colored floor strip that shows while a unit attacks,
on 0.20 s after arrival and off at take-off, the most exact clock available):

| Unit | Wind-up (arrival to number) | Stay (arrival to leaving) | Reach | Quality |
|---|---|---|---|---|
| Pacifista PX-1 to PX-5 | 0.87 (0.84-0.93) | 2.33 (strip 2.23 + 0.20; range 2.28-2.43) | 212 px | accurate |
| Monkey D. Luffy 2087 | 0.86-0.92 | 2.33 | 110 px | accurate |
| King 3137 | 0.84-0.92 | 2.33-2.43 | 110 px (one reading 225) | rough |
| Nico Robin 4375 | 0.81-0.85 | 2.33 | about 150 px | rough (few samples) |
| Usohachi 2806 | about 0.81 | 2.33 | not measured | rough |
| Kizaru 3704 | about 0.7, after a 0.35 s crouch before flying in | 2.15 | not measured | rough |
| Cabaji | 0.57 (0.51-0.63) | 3.03-3.23 | 110 px | rough |
| Buggy, Alvida, Mohji & Richie | 0.45-0.59 | 3.03 (2.6-3.2) | 212 px | rough |
| Shooter Group crews | 0.43-0.50 | 2.9-3.1 | 212-280 px | rough |

- **Full attacks take longer:** a red "Full Attack" label shows over the attacker and the number comes 0.75 s after
  it (Luffy's Full: pick to number 1.88 s against 1.12 s for a Normal; Kizaru 0.43 s after the label). Power attacks
  time like Normal ones as far as measured. **[M]** (few samples)
- High-end units (runs 8 / 9): pick to number about 1.1-1.2 s for Imu, Shanks, Lafitte, Shiryu; nothing finer yet.
  Treat them as unmeasured.
- Measurement noise is about one frame (0.033 s); a spread of 0.01-0.1 s inside one unit is noise, not variation.

How the timing stream uses this: section 1, rule 3. Whether a unit's wind-up matters for win rate: it shifts when
damage lands and when the unit and its target become free again, which changes who is picked on later beats.

## 10. Specials

- Each special has a charge time (CT). The bar starts at 0, steps on whole seconds of battle time, and resets to 0
  when the special fires. Charge time is `CT * (1 - key cut) / (1 + 0.03 * Special CT level)`. **[M]** / **[A]**
- A unit picked with a full bar walks up and fires on arriving in range, instead of attacking. The special takes no
  battle time. Two units ready at once fire in the order they are picked. **[C]**
- **A special can be ready at the start** (ability "on arrival: charge +100%"): it fires on the unit's first pick.
  In test run 9 Imu's did, before any regular hit. **[C]**
- Bench units do not charge. A unit entering for a KO'd one inherits its charge. **[C]**
- Charge boosts and delays are percentages of the unit's charge time. **[C]**
- **Super specials:** once the unit's condition is met its next full bar fires the super special instead; once per
  unit, at most 3 per team per battle. **[C]**
- **Targets:** tags aim harmful effects at enemies with that tag and helpful ones at allies with it; `count` with
  `priority` + `stat` takes the top N; **a bare `count` with no rule, or a rule that leaves more candidates than
  the count allows, picks at random among them [C]** (special stream); `status` keeps only units that have that status (so "enemies with RCV Bind" depends on an
  earlier effect of the same special having landed).
- **Ranges** (`range`): none = whole field; radial small / medium / large, forward, sideways. Sizes are not
  measured (old engine: radial 45 / 140 / 300 px) **[A]**.
- Chance effects roll per target on the special stream; then the target's debuff resilience and any Evade /
  immunity can stop the effect.

## 11. Effect catalogue

| Effect | What it does | Status |
|---|---|---|
| Stat buff / debuff | levels, section 8 | [C] |
| Ability Bind | the unit's ability is off (its buffs to others vanish, triggers do not count) | [C] |
| Action Bind | no actions; gauge stopped; special still charges | [C] |
| Special Bind (Silence) | the unit attacks even with a full bar | [C] |
| RCV Bind | the unit recovers no HP | [C] |
| Paralysis | chance not to do the hit / heal, section 5 | [C] |
| Confusion | attacks its closest team mate on every action; a full special bar is reset | [C] |
| Provoke | enemy regular attacks go to this unit | [C] |
| Haste | picked before the gauge order on the next beat | [C] |
| Forced Out | off the field for the duration: cannot act or be targeted, charge frozen, ability off, then returns | [C] |
| Switch | swaps with a bench unit (the first unless named); keeps HP; incoming unit takes the charge value | [C] |
| Shield | soaks 500 HP per level, section 7 | [C] |
| Counter | sends damage back when hit; default 1x the incoming damage | [C] |
| Damage Reflect | takes a stated share less damage and sends a stated multiple back, section 7 | [C] |
| On Death | at 0 HP: fills the bar, jumps the queue, fires its special, then goes down; once per battle | [C] |
| Revive | first KO: HP set to the stated share instead, section 7 | [C] |
| Half Stats / Half ATK / Half DEF | halve the whole stat, buffs included, for the duration | [C] |
| Damage over Time | section 7 | [C] |
| Evade / immunity | stops the listed hinderances while it lasts (blue badges over the card) | [C] |
| Cleanse | removes the named debuffs ("all": every debuff and hinderance) | [A] |
| Heal over time | `amount` every `interval` s for `duration` | [A] |
| Special CT boost / delay | adds / removes a percentage of the bar | [C] |

**Ability triggers [C]:** an effect with `condition.type: "trigger"` reads "the first `count` times this happens":
it fires **on every event until it has fired `count` times**, and each trigger condition of each unit keeps its
own counter. A triggered stat buff stacks once per firing (Loki: the first 5 times he takes damage, a level-2 ATK
buff each time; Imu: the first 10 times he heals, 5% of his own charge each time). Events: `hit`, `takes damage`, `heal`, `Guard`, `Critical Hit`, `Blow Away` (knock-backs caused),
`defeated`, `receives X`. Examples from run 9: Loki "takes damage": Giants ATK +2 and STR / Driven enemies DEF, SPD -1
each time; Kuma "Blow Away": STR units ATK +3; Imu: each time he hits, is hit or heals, his special charges and the
enemy's is delayed.

**Other conditions:** time (first N s, last N s), owner's HP above / below a percentage, crew or enemy counts
(`composition` counts the whole team of 8, otherwise units still in the fight), a named character on the field,
`mode` (other game modes: always false). `onArrival` effects apply once when the unit enters.

**Boons tied to a time condition [C]** (Loki: "last 60 s: Haste to Free Spirit / Giant"): given **once, at the
moment the condition turns true**, to the matching units on the field; and again to a unit **when it comes onto the
field** (from the bench, or back from Forced Out) while the condition holds.

## 12. KO, bench, end

- A KO'd unit is replaced 1.8 s later by the next bench unit (leftmost first) on that slot's start tile; it inherits
  the special charge and **[L]** the gauge. After several KOs at once the bench units enter together. **[M]**
- The battle ends when one side has no unit left anywhere, or at 100 s.

## 12b. Reading the unit data (scan of all 4,665 Rumble units, 2026-11-11)

Everything that occurs in `rumble.json`, with how to read it. Counts are effects over all units and levels.

- **Effect kinds:** `buff`, `debuff` (stat levels), `damage`, `recharge`, `hinderance`, `boon`, `penalty`, `cleanse`,
  `evade`.
- **`damage.type`:** `atk` (ATK with buffs), `atkbase` (base ATK, no buffs; GP only), `fixed`, `cut` (% of current
  HP), `time` (Damage over Time: `level`, `duration`; some units put it on themselves), `random` (2 old units,
  `amountrange`).
- **`recharge.type`:** `Special CT` (percentage of the bar), `RCV` (heal `amount` x RCV), `fixed` (heal that many HP),
  `percentage` (heal % of max HP); with `interval` + `duration` it repeats (heal over time).
- **`penalty`:** something bad the special does to its own side: HP (lose `amount` % of HP), stat levels down,
  Special Bind, RCV Bind, Paralysis, Half Stats on the crew or the caster. **[C]** (Stussy: Half Stats on her own
  team for 5 s is the whole cost.)
- **`boon` with a hinderance name** (Special Bind 27, Paralysis 20, Action Bind 20, Half Stats 15, Damage Over Time
  10, RCV Bind 2): **makes the targets immune to that hinderance for `duration` seconds [C]** (the blue shield
  badge over the unit's card).
- **`boon` proper:** Haste, Provoke, Counter (`amount`), Switch (`targeting.switch`: "1st / 2nd / 3rd sub character"),
  Damage Reflect (`percentage` = damage reduction, `amount` = multiple sent back), Revive (`amount` = % HP, `repeat` =
  times; can be given to other units by an ability), On Death (`repeat`).
- **`evade`** (`chance`, `duration`): a chance to shrug off the named things while it lasts: hinderances, "Stats
  Down" (stat debuffs), "Special CT Delay", and whole damage kinds ("Damage Ignoring DEF", "Fixed Damage",
  "Percentage Damage", "Damage Over Time").
- **`hinderance`:** Paralysis, Special Bind, Action Bind, Ability Bind, RCV Bind, Confusion, Forced Out, Half Stats /
  ATK / DEF / SPD / RCV, Special CT (delay, % of the bar).
- **`resilience` (per unit, always on):** `damage` (% less from a color / class), `dmgboost` (x more to a color /
  class), `debuff` (% chance to resist a hinderance), `dmgtype` (% less Fixed / Percentage / DEF-ignoring damage),
  **`healing` (heals `amount` HP every `interval` s: the "400" heals over Loki in run 9)**.
- **Targeting:** `targets` (self, crew, enemies, class, color, `[crew tag]`, `X-Style`), `excludes`, `families`,
  `count`, `priority` highest / lowest + `stat`, `priority` above / below / exactly + `percentage` or `amount`
  (threshold; "exactly Special CT 100" = units with a full bar), `status` (only units under that status), `switch`.
- **Conditions:** `time` first / remaining / after; `stat` HP above / below; `crew` / `enemies` more / less / exactly
  (with `composition`, `relative`, `targets`); `character` (a family on the crew or the enemy team); `trigger`
  (hit, takes damage, heal, Critical Hit, Guard, Blow Away, defeated, receives X, receives healing); `defeat`;
  `debuff` + a status name = **"if this character has that status" [C]** (Broggy: "if this character has Damage
  Over Time, inflicts ATK down"; Buggy: "if this character has Provoke, deals 4x ATK"); the text of a unit could in
  principle name the enemies instead, but no example is known; `multi` (and / or); `mode` (other modes: false).
- **Super special conditions** (`superspecial[].condition.type`): `heal` (times healed), `dmgreceived` (times
  damaged), `dmgtaken` (total damage), and the others listed in appendix D ("Super specials").
- **Unit target rule** (`target.criteria`): near (4,026 units), highest ATK / SPD / HP / DEF, lowest HP; 471 units
  give none (use nearest).
- **`leader` flag:** only on GP (Grand Party) specials, which are out of scope. There is no captain slot in Rumble.
- **Values grow with the special / ability level.** Each level lists its own numbers (`override`): a special's
  durations, chances, amounts and levels at level 1 are lower than at level 10 (Blackbeard & Kuzan's debuff lasts 11
  s at special level 1 and 20 s at level 10). Always resolve the unit's actual level before reading a value.
- **Data errors to tolerate:** capitalised comparators ("More", "Below"), a key typed `interva:`, malformed tags
  ("[Straw Hat Pirates", "Cerebral/Free Spirit [Straw Hat Pirates]"), an empty target.

## 13. What is not known (do not invent; ask the user or measure)

Answered by the user on 2026-11-10 and folded into the sections above: the third random stream, trigger counts,
random "N enemies", Confusion, Shield size, Damage Reflect, Revive, Counter, knock-back cost, Half Stats, Damage over
Time, how the key combines with resilience, percentage damage against a Shield, what Counter and Damage Reflect
send back, Revive, time-conditioned boons, overlapping effects, penalties, On Death with Revive.

| # | Open item |
|---|---|
| Q4 | Special range sizes in pixels; heal area sizes (need measuring) |
| Q5 | Animation times of every high-end unit (section 9), and whether Power attacks really time like Normal ones (need measuring) |
| Q6 | Two special numbers of run 9 the formula misses: Nusjuro in Blackbeard & Kuzan's special (6,985 shown, 7,655 predicted) and Sakazuki in Loki's (31,752 shown; needs DEF about 112, he has 149 before buffs) |
| Q7 | SPD below 100 and the exact shape near the 250 limit (the line is fitted between 100 and 250) |

## 14. How to validate the new simulator

1. **Formulas:** reproduce the check values in section 7 and the low-end ones in appendix D.
2. **Openings:** with every unit at SPD 100 (test run 1) the first picks are your five units, then enemy slots 3, 4,
   5; appendix D, "Turn order and timing", gives the evidence beat by beat.
3. **A whole battle:** replay test run 9 (appendix A) with the decisions of appendix B forced (who attacked whom,
   which special hit whom, when the bench entered). 22 of its 26 regular damage numbers and 5 of 7
   special numbers are reproduced by the rules above; the misses are Q6 and four late numbers.
4. **Rates:** over many battles the dice should come out at the measured rates in section 6.
5. **New recordings:** appendix C.

---

## Appendix A. Test run 9: the two teams (the reference battle)

Your team is the left side (ids A1-A8), the enemy the right side (D1-D8); slots 1-5 start on the field, 6-8 are the
bench in entry order. Stats are the opening battle stats (rules, abilities and keys applied; bench units: before
any ability). "Levels" are the opening net buff levels. Stats were exported from the two team codes; a few are
one or two points off the game (Shanks' DEF looks about 1 too low).

**Rules of this battle:** QCK units: ATK up lv 4; Driven class: SPD up lv 4; Striker class: DEF up lv 4; Elbaph Arc crew: damage dealt +20%; Elbaph Arc crew: damage taken -20%; Land of Wano Arc crew: damage dealt +20%; Land of Wano Arc crew: damage taken -20%; Logia-type / Devil Fruit User crew: damage dealt +20%; Logia-type / Devil Fruit User crew: damage taken -20%; All units: Special CT up lv 5 in the last 30s; All units: damage dealt +5% in the last 30s.

| Id | Unit (OPTC-DB id) | Color, classes, style | Key (tier) | Max HP | ATK | DEF | SPD (base) | Levels HP / ATK / DEF / SPD | Base ATK / DEF | Pattern | Rule damage dealt / taken |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Shiryu - A Hidden Blade That Exploits the Opening (4600) | [QCK], Free Spirit / Slasher, DBF | yes (rare recruit) | 13,253.4 | 5,617.6 | 529.1 | 250 (228.8) | 7 / 17 / 16 / 13 | 4,342.6 / 129.2 | Normal, heal Self lv2, Power, Power | - / - |
| A2 | Imu - Occupant of the Empty Throne (4571) | [STR], Powerhouse / Driven, SPT | yes (Super Sugo-Fest) | 19,018.7 | 6,293.2 | 342 | 250 (257.4) | 0 / 0 / 6 / 11 | 6,293.2 / 192 | Normal, Power, heal Small lv1, Power | - / - |
| A3 | Blackbeard & Kuzan - Common Interests (4522) | dual, Driven / Shooter, DBF | yes (anniversary / shop legend) | 15,136.7 | 5,556.4 | 497.5 | 250 (207.5) | 0 / 14 / 9 / 17 | 4,506.4 / 272.5 | Normal, heal Self lv2, Power, Power | 1.2 / 0.8 |
| A4 | Loki - Sun God who Brings the World to an End (4629) | [QCK], Driven / Free Spirit, ATK | yes (Super Sugo-Fest) | 18,295.2 | 6,365.7 | 719 | 250 (253.5) | 7 / 17 / 23 / 7 | 5,090.7 / 144 | Normal, Normal, Power, Full | 1.2 / 0.8 |
| A5 | Lafitte - Infiltrating Fifth Ship Captain of the Blackbeard Pirates (4608) | [QCK], Striker / Free Spirit, DBF | yes (TM / Kizuna) | 14,166.2 | 5,285.4 | 627.6 | 250 (234) | 7 / 17 / 20 / 13 | 4,010.4 / 127.6 | Normal, heal Self lv2, Power, Power | 1.2 / 0.8 |
| A6 (bench) | St. Ethanbaron V. Nusjuro - Approaching Monstrous Horse (4574) | [INT], Driven / Slasher, ATK | no (farmable) | 1,738 | 742 | 125 | 162 (162) | 0 / 0 / 0 / 0 | 742 / 125 | Normal, Normal, Power, Full | - / - |
| A7 (bench) | Beardhill Jarul (4622) | [QCK], Free Spirit / Powerhouse, DEF | no (Rumble legend) | 8,386.8 | 3,059.4 | 281 | 108 (108) | 0 / 0 / 0 / 0 | 3,059.4 / 281 | Normal, Normal, Power, heal Self lv2 | 1.2 / 0.8 |
| A8 (bench) | Jesus Burgess - Monstrous Might Chasing After the Sulong (4599) | [QCK], Free Spirit / Fighter, ATK | yes (rare recruit) | 12,101.8 | 4,399.2 | 169.1 | 213.9 (213.9) | 0 / 0 / 0 / 0 | 4,399.2 / 169.1 | Normal, Normal, Power, Full | - / - |
| D1 | Uta - Happy Christmas!! (4288) | [STR], Cerebral / Shooter, SPT | no (regular legend) | 12,191.6 | 5,940.3 | 350 | 250 (175) | -1 / 18 / 6 / 19 | 4,590.3 / 200 | Normal, Power, heal Small lv1, Power | - / - |
| D2 | Bartholomew Kuma - Selfless Impulse (4306) | [STR], Powerhouse / Shooter, ATK | no (Rumble legend) | 7,980.3 | 4,346 | 363 | 250 (183) | -1 / 18 / 6 / 19 | 2,996 / 213 | Normal, Power, Normal, Full | - / - |
| D3 | St. Ethanbaron V. Nusjuro (4529.2) | [STR], Cerebral / Slasher, ATK | yes (anniversary / shop legend) | 19,295.1 | 8,211.3 | 334 | 250 (216.2) | -1 / 26 / 6 / 19 | 6,261.3 / 184 | Normal, Normal, Power, Full | - / - |
| D4 | Red-Haired Shanks - Emperor and Captain of the Red-Hair Pirates (4560) | [STR], Cerebral / Free Spirit, ATK | yes (Super Sugo-Fest) | 16,322.3 | 6,294 | 339.6 | 250 (226.2) | -1 / 18 / 6 / 19 | 4,944 / 189.6 | Normal, Normal, Power, Full | - / - |
| D5 | Imu - Occupant of the Empty Throne (4571) | [STR], Powerhouse / Driven, SPT | no (Super Sugo-Fest) | 9,332.2 | 5,546.2 | 310 | 250 (198) | -7 / 18 / 6 / 23 | 4,196.2 / 160 | Normal, Power, heal Small lv1, Power | - / - |
| D6 (bench) | Stussy - Carrying Out the Final Job (4498) | [STR], Driven / Cerebral, SPT | no (Rumble legend) | 8,548.4 | 2,676.5 | 199 | 175 (175) | 0 / 0 / 0 / 0 | 2,676.5 / 199 | Normal, Power, heal Small lv1, Power | - / - |
| D7 (bench) | Sentomaru - Commanding the Strongest Weapon (4313) | [STR], Free Spirit / Slasher, SPT | no (Rumble legend) | 8,503.8 | 2,858.7 | 209 | 152 (152) | 0 / 0 / 0 / 0 | 2,858.7 / 209 | Normal, Power, heal Small lv1, Normal | - / - |
| D8 (bench) | Fleet Admiral Sakazuki - Determination for the New Era (4217) | [STR], Fighter / Shooter, ATK | no (Rumble legend) | 12,892.8 | 4,334.2 | 149 | 193 (193) | 0 / 0 / 0 / 0 | 4,334.2 / 149 | Normal, Normal, Power, Full | 1.2 / 0.8 |

**Resistances and key factors between the units of this battle** (damage factor attacker -> target, beyond the
rules; pairs not listed have none):

- Blackbeard & Kuzan (A3) -> Bartholomew Kuma x1.15; Imu x1.15
- Loki (A4) -> Uta x1.2; Bartholomew Kuma x1.2; St. Ethanbaron V. Nusjuro x1.2; Red-Haired Shanks x1.2; Imu x1.2; Stussy x1.2; Sentomaru x1.2; Fleet Admiral Sakazuki x1.2
- Lafitte (A5) -> Uta x1.05; Bartholomew Kuma x1.05; St. Ethanbaron V. Nusjuro x1.05; Red-Haired Shanks x1.05; Imu x1.05; Stussy x1.05; Sentomaru x1.05; Fleet Admiral Sakazuki x1.05
- Uta (D1) -> Shiryu x0.72; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72
- Bartholomew Kuma (D2) -> Shiryu x0.72; Blackbeard & Kuzan x0.56; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72
- St. Ethanbaron V. Nusjuro (D3) -> Shiryu x0.72; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72
- Red-Haired Shanks (D4) -> Shiryu x0.72; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72
- Imu (D5) -> Shiryu x0.72; Blackbeard & Kuzan x0.56; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72
- Stussy (D6) -> Shiryu x0.72; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72
- Sentomaru (D7) -> Shiryu x0.72; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72
- Fleet Admiral Sakazuki (D8) -> Shiryu x0.72; Loki x0.56; Lafitte x0.63; Beardhill Jarul x0.7; Jesus Burgess x0.72

**Abilities and specials at these units' levels** (as read from the database; one line per effect, in order):

- **A1 Shiryu** (special charge 28.57 s)
  - ability: buff DEF level 3 -> [QCK], Free Spirit, [Blackbeard Pirates]
  - ability: debuff HP level 6 -> Driven IF {"type": "crew", "composition": true, "comparator": "more", "count": 4, "targets": ["[Blackbeard Pirates]"]}
  - ability: recharge type Special CT amount 100 -> self [on arrival] IF {"type": "time", "comparator": "first", "count": 9}
  - ability: recharge type percentage amount 20 -> [Blackbeard Pirates] [on arrival] IF {"type": "time", "comparator": "remaining", "count": 90}
  - ability: buff HP level 10 -> self IF {"type": "mode", "mode": "Assault Rumble"}
  - ability: buff Special CT level 6 -> self IF {"type": "mode", "mode": "Assault Rumble"}
  - special: boon Provoke duration 30 -> ATK-Style, DBF-Style (count 1)
  - special: debuff ATK level 5 duration 15 -> Driven IF {"type": "crew", "composition": true, "count": 4, "comparator": "more", "targets": ["[Blackbeard Pirates]"]}
  - special: debuff DEF level 3 duration 15 -> Driven IF {"type": "crew", "composition": true, "count": 4, "comparator": "more", "targets": ["[Blackbeard Pirates]"]}
  - special: damage type atk amount 4.5 -> enemies (count 2; priority lowest; stat HP)
  - special: buff ATK level 5 duration 5 -> self IF {"type": "mode", "mode": "Assault Rumble"}
  - special: damage type atk amount 8 -> Driven (count 3) IF {"type": "mode", "mode": "Assault Rumble"}
  - special: boon Switch -> self IF {"type": "crew", "composition": true, "count": 4, "comparator": "more", "targets": ["[Blackbeard Pirates]"]}
- **A2 Imu** (special charge 89.1 s)
  - ability: buff SPD level 7 -> crew
  - ability: recharge type Special CT amount 5 -> self IF {"type": "trigger", "stat": "hit", "count": 10}
  - ability: hinderance Special CT amount 5 -> enemies IF {"type": "trigger", "stat": "hit", "count": 10}
  - ability: recharge type Special CT amount 5 -> self IF {"type": "trigger", "stat": "takes damage", "count": 10}
  - ability: hinderance Special CT amount 5 -> enemies IF {"type": "trigger", "stat": "takes damage", "count": 10}
  - ability: recharge type Special CT amount 5 -> self IF {"type": "trigger", "stat": "heal", "count": 10}
  - ability: hinderance Special CT amount 5 -> enemies IF {"type": "trigger", "stat": "heal", "count": 10}
  - ability: recharge type Special CT amount 100 -> self [on arrival] IF {"type": "crew", "composition": true, "comparator": "more", "count": 1, "targets": ["[Five Elders]"]}
  - ability: recharge type Special CT amount 10 -> [Five Elders] [on arrival] IF {"type": "crew", "composition": true, "comparator": "more", "count": 1, "targets": ["[Five Elders]"]}
  - ability: recharge type Special CT amount 30 -> self [on arrival] IF {"type": "time", "comparator": "remaining", "count": 50}
  - ability: hinderance Special CT amount 30 -> enemies [on arrival] IF {"type": "time", "comparator": "remaining", "count": 50}
  - special: hinderance Ability Bind duration 15 chance 100 -> enemies (count 2; priority lowest; stat HP) IF {"type": "time", "comparator": "first", "count": 15}
  - special: recharge type Special CT amount 30 -> self IF {"type": "time", "comparator": "first", "count": 15}
  - special: evade Forced Out + Confusion duration 40 chance 100 -> [World Government], [Navy]
  - special: cleanse all chance 100 -> crew IF {"type": "time", "comparator": "remaining", "count": 85}
  - special: hinderance Ability Bind duration 10 chance 80 -> enemies IF {"type": "time", "comparator": "remaining", "count": 85}
  - special: hinderance Ability Bind duration 5 chance 100 -> enemies IF {"type": "time", "comparator": "remaining", "count": 50}
  - special: recharge type percentage amount 50 -> self IF {"type": "stat", "stat": "HP", "comparator": "below", "count": 50}
  - special: damage type fixed amount 5000 -> enemies (status ['Ability Bind'])
- **A3 Blackbeard & Kuzan** (special charge 27.69 s)
  - ability: buff DEF level 6 -> Driven, [Blackbeard Pirates]
  - ability: debuff HP level 7 -> enemies
  - ability: debuff Special CT level 3 -> enemies IF {"type": "crew", "composition": true, "comparator": "more", "count": 5, "targets": ["Driven"]}
  - ability: buff ATK level 8 -> self IF {"type": "crew", "composition": true, "comparator": "more", "count": 4, "targets": ["[Blackbeard Pirates]"]}
  - ability: debuff DEF level 7 -> enemies IF {"type": "crew", "composition": true, "comparator": "more", "count": 4, "targets": ["[Blackbeard Pirates]"]}
  - special: hinderance RCV Bind duration 20 chance 100 -> enemies (count 3)
  - special: debuff ATK + SPD + DEF level 8 duration 20 -> enemies (status ['RCV Bind'])
  - special: hinderance Action Bind duration 10 chance 100 -> enemies (status ['Special Bind'])
  - special: hinderance Special CT amount 20 -> enemies (status ['Shield'])
  - special: damage type fixed amount 6000 -> enemies (status ['Shield'])
  - special: damage type atk amount 5 -> enemies (status ['Confusion'])
  - special: damage type atk amount 3 -> enemies
- **A4 Loki** (special charge 30.6 s)
  - ability: buff HP + ATK + DEF level 7 -> [QCK], Free Spirit, [Giant], [Royalty], [Elbaph Arc]
  - ability: buff DEF level 7 -> self IF {"type": "time", "comparator": "first", "count": 40}
  - ability: penalty SPD level 10 -> self IF {"type": "time", "comparator": "first", "count": 40}
  - ability: buff ATK level 2 -> [Giant] IF {"type": "trigger", "stat": "takes damage", "count": 5}
  - ability: debuff DEF + SPD level 1 -> [STR], Driven IF {"type": "trigger", "stat": "takes damage", "count": 5}
  - ability: boon Haste chance 100 -> Free Spirit, [Giant] [on arrival] IF {"type": "time", "comparator": "remaining", "count": 60}
  - special: cleanse ATK chance 100 -> crew IF {"type": "crew", "composition": true, "count": 2, "comparator": "more", "targets": ["[Giant]"]}
  - special: damage type atk amount 4 -> [STR], Driven
  - special: damage type atk amount 2 repeat 2 -> enemies (count 2; priority lowest; stat HP)
- **A5 Lafitte** (special charge 17.75 s)
  - ability: buff ATK + SPD level 6 -> [QCK], Free Spirit, [Blackbeard Pirates]
  - ability: hinderance Special CT amount 20 -> enemies (count 3; priority highest; stat Special CT) IF {"type": "trigger", "stat": "receives Paralysis", "count": 3}
  - ability: hinderance Special CT amount 30 -> [STR], Driven [on arrival] IF {"type": "time", "comparator": "remaining", "count": 90}
  - special: debuff ATK + DEF + SPD level 6 duration 20 -> enemies (count 3)
  - special: hinderance Confusion duration 10 chance 100 -> [STR], Driven
  - special: debuff Special CT level 7 duration 10 -> enemies (status ['Confusion Evasion'])
  - special: hinderance RCV Bind duration 15 chance 100 -> enemies (status ['Interval Healing'])
  - special: penalty Paralysis duration 5 chance 100 -> [Blackbeard Pirates] IF {"type": "crew", "composition": true, "count": 3, "comparator": "more", "targets": ["[Blackbeard Pirates]"]}
  - special: boon Switch -> self IF {"type": "crew", "composition": true, "count": 3, "comparator": "more", "targets": ["[Blackbeard Pirates]"]}
- **A6 St. Ethanbaron V. Nusjuro** (special charge 32 s)
  - ability: buff HP + ATK + SPD level 1 -> Driven, Slasher, [World Government]
  - ability: buff Special CT level 1 -> self IF {"type": "multi", "conjunction": "or", "conditions": [{"type": "crew", "composition": true, "comparator": "more", "count": 6, "targets": ["Slasher", "Driven"], "pool": ["A1", "A2", "A3", "A4", "A6"], "crewSize": 8, "enemySize": 8}, {"type": "crew", "composition": true, "comparator": "more", "count": 5, "targets": ["[World Government]"], "pool": ["A2", "A6"], "crewSize": 8, "enemySize": 8}]}
  - ability: buff ATK level 1 -> self IF {"type": "multi", "conjunction": "or", "conditions": [{"type": "crew", "composition": true, "comparator": "more", "count": 6, "targets": ["Slasher", "Driven"], "pool": ["A1", "A2", "A3", "A4", "A6"], "crewSize": 8, "enemySize": 8}, {"type": "crew", "composition": true, "comparator": "more", "count": 5, "targets": ["[World Government]"], "pool": ["A2", "A6"], "crewSize": 8, "enemySize": 8}]}
  - special: hinderance Paralysis duration 6 chance 30 -> enemies
  - special: debuff ATK + SPD level 1 duration 6 -> enemies (status ['Paralysis', 'Damage Over Time'])
  - special: debuff DEF level 1 duration 6 -> enemies (status ['Paralysis', 'Damage Over Time'])
  - special: damage type atk amount 6 -> enemies (status ['Paralysis'])
- **A7 Beardhill Jarul** (special charge 26 s)
  - ability: buff HP + DEF level 6 -> [QCK], Free Spirit, [Giant]
  - ability: buff HP level 12 -> self IF {"type": "crew", "composition": true, "comparator": "more", "count": 2, "targets": ["[Giant]"]}
  - ability: recharge type percentage amount 10 -> [Giant] IF {"type": "trigger", "stat": "takes damage", "count": 7}
  - ability: recharge type Special CT amount 100 -> [Giant] (count 1; priority highest; stat ATK) [on arrival] IF {"type": "time", "comparator": "remaining", "count": 60}
  - special: buff Shield level 5 duration 20 -> [QCK], Free Spirit, [Giant]
  - special: evade Damage Ignoring DEF + Paralysis duration 20 chance 100 -> [QCK]
  - special: damage type atk amount 12 -> enemies IF {"type": "crew", "composition": true, "count": 2, "comparator": "more", "targets": ["[Giant]"]}
- **A8 Jesus Burgess** (special charge 25 s)
  - ability: buff ATK level 6 -> [QCK], Free Spirit, [Blackbeard Pirates]
  - ability: buff ATK level 6 -> self IF {"type": "crew", "composition": true, "comparator": "more", "count": 4, "targets": ["[Blackbeard Pirates]"]}
  - ability: buff ATK level 6 -> self IF {"type": "crew", "relative": true, "comparator": "more", "count": 1}
  - ability: buff ATK level 6 -> self IF {"type": "enemies", "composition": true, "comparator": "more", "count": 3, "targets": ["Driven"]}
  - ability: buff HP level 10 -> self IF {"type": "mode", "mode": "Assault Rumble"}
  - ability: buff Special CT level 6 -> self IF {"type": "mode", "mode": "Assault Rumble"}
  - special: buff ATK level 6 duration 5 -> self
  - special: buff ATK level 6 duration 10 -> self IF {"type": "crew", "composition": true, "count": 4, "comparator": "more", "targets": ["[Blackbeard Pirates]"]}
  - special: buff ATK level 6 duration 20 -> self IF {"type": "time", "comparator": "remaining", "count": 50}
  - special: damage type atk amount 2.5 -> Driven (count 1)
  - special: damage type atk amount 12 -> enemies (status ['Provoke', 'Paralysis'])
  - special: damage type atk amount 15 -> enemies IF {"type": "mode", "mode": "Assault Rumble"}
- **D1 Uta** (special charge 16.13 s)
  - ability: buff HP + SPD + DEF level 6 -> [STR]
  - ability: buff Special CT level 5 -> self IF {"type": "time", "comparator": "first", "count": 20}
  - special: buff ATK + SPD + DEF level 7 duration 25 -> [STR]
  - special: recharge type Special CT amount 20 -> [STR] (excludes ['self'])
  - special: recharge type fixed amount 300 duration 30 -> crew (priority below; stat HP; percentage 50)
- **D2 Bartholomew Kuma** (special charge 25.69 s)
  - ability: buff ATK level 5 -> [STR]
  - ability: buff Blow Away level 10 -> self
  - ability: buff ATK level 3 -> [STR] IF {"type": "trigger", "stat": "Blow Away", "count": 3}
  - ability: debuff Special CT level 3 -> DBF-Style IF {"type": "crew", "composition": true, "comparator": "more", "count": 6, "targets": ["[STR]"]}
  - special: damage type atk amount 2.5 -> enemies
  - special: damage type atk amount 2 -> enemies (count 3)
  - special: hinderance Forced Out duration 10 chance 100 -> DBF-Style (count 1) IF {"count": 6, "comparator": "More", "type": "crew", "targets": ["[STR]"], "composition": true}
- **D3 St. Ethanbaron V. Nusjuro** (special charge 26.42 s)
  - ability: buff ATK + SPD + RCV level 6 -> [STR], Slasher, [Five Elders]
  - ability: buff SPD level 8 -> self IF {"type": "character", "team": "enemy", "families": ["Roronoa Zoro"]}
  - ability: buff Special CT level 5 -> self IF {"type": "character", "team": "enemy", "families": ["Roronoa Zoro"]}
  - ability: buff ATK level 8 -> self IF {"type": "stat", "stat": "HP", "comparator": "above", "count": 80}
  - ability: recharge type percentage amount 10 -> self IF {"type": "trigger", "stat": "takes damage", "count": 20}
  - ability: recharge type percentage amount 10 -> self IF {"type": "trigger", "stat": "hit", "count": 10}
  - special: damage type cut amount 50 -> enemies (count 2; priority highest; stat HP)
  - special: hinderance Forced Out duration 10 chance 100 -> enemies (count 2; priority highest; stat HP) IF {"type": "stat", "stat": "HP", "comparator": "above", "count": 80}
  - special: debuff DEF level 5 duration 20 -> enemies (count 3; priority highest; stat DEF) IF {"type": "stat", "stat": "HP", "comparator": "above", "count": 50}
  - special: recharge type percentage amount 20 -> self
  - special: cleanse ATK chance 100 -> crew IF {"type": "crew", "composition": true, "count": 5, "comparator": "more", "targets": ["[Navy]", "[World Government]", "[Zoan-type]"]}
  - special: damage type atk amount 4 -> enemies (count 3) IF {"type": "crew", "composition": true, "count": 5, "comparator": "more", "targets": ["[Navy]", "[World Government]", "[Zoan-type]"]}
- **D4 Red-Haired Shanks** (special charge 23.12 s)
  - ability: buff ATK + DEF level 7 -> [STR], Cerebral, Slasher, [Red-Haired Pirates], [Four Emperors]
  - ability: buff Special CT level 3 -> [STR], Cerebral, Slasher, [Red-Haired Pirates], [Four Emperors]
  - ability: recharge type Special CT amount 30 -> self IF {"type": "trigger", "stat": "defeated", "team": "enemies", "count": 5}
  - ability: hinderance Special CT amount 20 -> Free Spirit IF {"type": "trigger", "stat": "hit", "count": 3}
  - ability: hinderance Special CT amount 30 -> enemies [on arrival] IF {"type": "crew", "composition": true, "comparator": "more", "count": 2, "targets": ["[Red-Haired Pirates]"]}
  - special: buff ATK + DEF level 6 -> [STR], Cerebral, Slasher, [Red-Haired Pirates], [Four Emperors]
  - special: debuff DEF level 5 duration 5 -> enemies (status ['Paralysis'])
  - special: damage type atk amount 2.2 -> Free Spirit
  - special: damage type atk amount 20 -> enemies
  - special: boon Switch -> self IF {"type": "crew", "composition": true, "count": 2, "comparator": "more", "targets": ["[Red-Haired Pirates]"]}
- **D5 Imu** (special charge 90.83 s)
  - ability: buff SPD level 7 -> crew
  - ability: recharge type Special CT amount 5 -> self IF {"type": "trigger", "stat": "hit", "count": 10}
  - ability: hinderance Special CT amount 5 -> enemies IF {"type": "trigger", "stat": "hit", "count": 10}
  - ability: recharge type Special CT amount 5 -> self IF {"type": "trigger", "stat": "takes damage", "count": 10}
  - ability: hinderance Special CT amount 5 -> enemies IF {"type": "trigger", "stat": "takes damage", "count": 10}
  - ability: recharge type Special CT amount 5 -> self IF {"type": "trigger", "stat": "heal", "count": 10}
  - ability: hinderance Special CT amount 5 -> enemies IF {"type": "trigger", "stat": "heal", "count": 10}
  - ability: recharge type Special CT amount 100 -> self [on arrival] IF {"type": "crew", "composition": true, "comparator": "more", "count": 1, "targets": ["[Five Elders]"]}
  - ability: recharge type Special CT amount 10 -> [Five Elders] [on arrival] IF {"type": "crew", "composition": true, "comparator": "more", "count": 1, "targets": ["[Five Elders]"]}
  - ability: recharge type Special CT amount 30 -> self [on arrival] IF {"type": "time", "comparator": "remaining", "count": 50}
  - ability: hinderance Special CT amount 30 -> enemies [on arrival] IF {"type": "time", "comparator": "remaining", "count": 50}
  - special: hinderance Ability Bind duration 15 chance 100 -> enemies (count 2; priority lowest; stat HP) IF {"type": "time", "comparator": "first", "count": 15}
  - special: recharge type Special CT amount 30 -> self IF {"type": "time", "comparator": "first", "count": 15}
  - special: evade Forced Out + Confusion duration 40 chance 100 -> [World Government], [Navy]
  - special: cleanse all chance 100 -> crew IF {"type": "time", "comparator": "remaining", "count": 85}
  - special: hinderance Ability Bind duration 10 chance 80 -> enemies IF {"type": "time", "comparator": "remaining", "count": 85}
  - special: hinderance Ability Bind duration 5 chance 100 -> enemies IF {"type": "time", "comparator": "remaining", "count": 50}
  - special: recharge type percentage amount 50 -> self IF {"type": "stat", "stat": "HP", "comparator": "below", "count": 50}
  - special: damage type fixed amount 5000 -> enemies (status ['Ability Bind'])
- **D6 Stussy** (special charge 25 s)
  - ability: buff HP + SPD + DEF level 6 -> [STR], Driven
  - ability: recharge type Special CT amount 15 -> [STR], Driven (excludes ['self']) IF {"type": "trigger", "stat": "receives Half Stats", "count": 5}
  - ability: recharge type Special CT amount 10 -> [Straw Hat Pirates], [Vegapunk], [Paramythia-type], [Zoan-type] [on arrival]
  - special: penalty Half Stats duration 5 chance 100 -> [STR], Driven
  - special: buff ATK + RCV + SPD level 6 duration 20 -> [STR], Driven
  - special: buff DEF level 4 duration 20 -> [STR], Driven
  - special: boon Half Stats duration 5 -> self IF {"type": "crew", "composition": true, "count": 5, "comparator": "more", "targets": ["Driven"]}
  - special: buff ATK + RCV + SPD level 4 duration 20 -> [STR]
  - special: buff DEF level 3 duration 20 -> [STR]
  - special: damage type atk amount 6 -> enemies (count 1; priority lowest; stat DEF)
- **D7 Sentomaru** (special charge 24 s)
  - ability: buff HP + DEF level 6 -> [STR], Free Spirit, [Navy], [Vegapunk]
  - ability: buff Shield level 6 -> self
  - ability: buff Special CT level 3 -> [STR], Free Spirit, [Navy], [Vegapunk] IF {"type": "trigger", "stat": "defeated", "team": "crew", "count": 8}
  - ability: debuff ATK level 5 -> [DEX], Driven IF {"type": "crew", "comparator": "more", "count": 5}
  - ability: debuff ATK level 3 -> [DEX], Driven IF {"type": "crew", "comparator": "more", "count": 8}
  - special: buff ATK + SPD level 10 duration 20 -> crew (count 1; priority highest; stat ATK)
  - special: buff Special CT level 5 duration 20 -> crew (count 1; priority highest; stat ATK)
  - special: evade Special Bind duration 20 chance 100 -> crew (count 1; priority highest; stat ATK)
  - special: recharge type Special CT amount 20 -> crew (status ['Special Bind'])
  - special: boon Haste chance 100 -> crew (status ['Special Bind'])
  - special: boon Special Bind duration 20 -> crew (status ['Special Bind'])
  - special: damage type fixed amount 4000 -> enemies (count 1; priority lowest; stat HP)
  - special: buff Shield level 3 duration 20 -> self
- **D8 Fleet Admiral Sakazuki** (special charge 33 s)
  - ability: buff ATK + SPD level 7 -> [STR], [DEX], [QCK]
  - ability: buff ATK level 6 -> self IF {"type": "time", "comparator": "first", "count": 50}
  - ability: debuff DEF level 6 -> enemies IF {"type": "time", "comparator": "remaining", "count": 40}
  - special: debuff DEF level 7 duration 20 -> enemies (count 2; priority highest; stat RCV)
  - special: damage type atk amount 5.4 -> enemies (count 2; priority highest; stat RCV)
  - special: damage type time level 2 duration 35 -> enemies

## Appendix B. Test run 9: what happened, number by number

Battle time in seconds. "Seen" = identified by the user on the recording; "pick" = attacker taken from the NEXT
column; "value" = named by the number alone. "Level changes" are relative to the tracked buff state at that moment
(ATK of the attacker / DEF of the target); the usual source is Loki's "when hit" trigger (enemy DEF -1, Loki ATK +2
per firing). The battle ends at 64.1 s with the enemy team wiped.

**Events the user identified:**

- 0.0 s: Imu's special at the start: Ability Bind for 15 s on the enemy Imu and Kuma
- 61.6 s: Loki's special (no cut-in was detected here): 39,690 on Nusjuro, 31,752 on Sakazuki, both KO'd
- about 30 s: Blackbeard & Kuzan's special: KOs Imu, Uta, Kuma, Shanks; Nusjuro survives. Debuff targets are the analyzer's fit (the three that took the larger numbers), not seen directly
- Bench entries (the analyzer's reading unless noted): the analyzer's reading, not Jack's: the bench cut-in after the four KOs is at battle 33.83 s; Shiryu's 5,056 at 33.4 s still needs Nusjuro without the bench units' DEF buffs and Loki's 3,771 on Sentomaru at 39.6 s needs them; A6 (my Nusjuro) 42.3 s is a guess from the bench cut-ins at 41-43 s (he attacks at ~62 s)
- KOs: Nusjuro and Sakazuki die to Loki's special at 61.6 s (Jack); the tracker had Nusjuro KO'd at 40.3 s and Sakazuki at 49.3 s
- 2.7 s: Shanks' first attack, Normal
- 16.9 s: Shanks, guarded
- 21.1 s: Kuma on Shiryu (who resists STR)
- 30.1 s: Lafitte's attack on Uta landing after she was KO'd by the special
- 39.6 s: Loki on Sentomaru; Loki's passive gives Haste to Free Spirit / Giant here
- 28.6 s: Shanks on Blackbeard & Kuzan; Kuma's attack before this blew its target away, which gave STR units ATK +3 (Kuma's passive)
- 48.1 s: Imu on Nusjuro; only the first two digits (57..) are on screen, the rest is cut off
- 50.3 s: the enemy Nusjuro is Confused (Lafitte's special): his special charge resets and he attacks his own team mate Sakazuki
- 63.1 s: my Nusjuro (INT) on the enemy Nusjuro, landing after Loki's special had KO'd him; the analyzer read only 48

**Regular damage numbers:**

Notes on the table: "weak fit" is the fitting program's label for a row that needs several level changes. The 39.6 s
row is sound all the same (both changes come from Loki's trigger having fired three times: his ATK +6, enemy DEF -3).
The rows at 50.3 to 56.5 s are not: the buff state after the specials at 41-42 s is not fully tracked. The 86 at
50.3 s is a fragment of the 4,886; the 31,752 and 690 at 61.6 s are Loki's special (31,752 on Sakazuki; 39,690 on
Nusjuro, of which the reader caught "690"); the 57 at 48.1 s is Imu hitting Nusjuro with the last digits cut off.

| Time | Shown | Attacker -> target | Attack | Level changes ATK / DEF | Predicted | Source of the attacker | Note |
|---|---|---|---|---|---|---|---|
| 2.7 | 476 | Red-Haired Shanks -> Blackbeard & Kuzan | Normal | +0 / +0 | 476 | seen by a person | fits |
| 4.2 | 1,157 | Lafitte -> Uta | Normal | +0 / +0 | 1,157 | pick | fits |
| 5.7 | 927 | Shiryu -> Bartholomew Kuma | Normal | +0 / +0 | 927 | pick | fits |
| 7.3 | 1,292 | Imu -> Imu | Normal | +0 / +0 | 1,291 | pick | fits |
| 9.7 | 1,700 | Loki -> St. Ethanbaron V. Nusjuro | Normal | +0 / +0 | 1,700 | pick | fits |
| 11.0 | 393 | Imu -> Lafitte | Power, crit | +0 / +0 | 395 | value with tracked buff levels | fits |
| 13.8 | 2,010 | Blackbeard & Kuzan -> Red-Haired Shanks | Normal, crit | +0 / -1 | 2,013 | pick | fits |
| 15.1 | 1,283 | Shiryu -> Imu | Normal | +0 / -1 | 1,284 | - | fits |
| 16.9 | 144 | Red-Haired Shanks -> Blackbeard & Kuzan | Normal, guarded | +0 / +0 | 144 | seen by a person | fits |
| 18.1 | 1,026 | Shiryu -> Bartholomew Kuma | Normal | +0 / -1 | 1,025 | pick | fits |
| 21.1 | 282 | Bartholomew Kuma -> Shiryu | Normal | +0 / +0 | 284 | seen by a person | fits |
| 22.5 | 2,158 | Imu -> Imu | Power | +0 / -1 | 2,157 | pick | fits |
| 25.0 | 1,933 | Loki -> St. Ethanbaron V. Nusjuro | Normal | +2 / -1 | 1,933 | - | fits |
| 28.6 | 787 | Red-Haired Shanks -> Blackbeard & Kuzan | Power | +3 / +0 | 788 | seen by a person | fits |
| 30.1 | 2,140 | Lafitte -> Uta | Power | +0 / -2 | 2,138 | seen by a person | fits |
| 33.4 | 5,056 | Shiryu -> St. Ethanbaron V. Nusjuro | Power | +0 / -1 | 5,055 | pick | fits |
| 39.6 | 3,771 | Loki -> Sentomaru | Power | +6 / -3 | 3,770 | seen by a person | weak fit |
| 48.1 | 57 | Imu -> ? | ? | | | seen by a person | no fit; number only partly visible |
| 50.3 | 4,886 | St. Ethanbaron V. Nusjuro -> Fleet Admiral Sakazuki | Power, guarded | -6 / -5 | 4,885 | seen by a person | weak fit |
| 50.3 | 86 | St. Ethanbaron V. Nusjuro -> ? | ? | | | seen by a person | no fit |
| 52.9 | 337 | Fleet Admiral Sakazuki -> Imu | Normal, guarded | -6 / +0 | 337 | pick | fits |
| 55.4 | 6,081 | Blackbeard & Kuzan -> St. Ethanbaron V. Nusjuro | Power | +0 / -6 | 6,070 | pick | weak fit |
| 56.5 | 4,795 | Lafitte -> Fleet Admiral Sakazuki | Power | +0 / -5 | 4,793 | pick | weak fit |
| 61.6 | 31,752 | ? -> ? | ? | | | - | no fit |
| 61.7 | 690 | ? -> ? | ? | | | - | no fit |
| 63.1 | 489 | St. Ethanbaron V. Nusjuro -> St. Ethanbaron V. Nusjuro | Power | +0 / +0 | 488 | seen by a person | fits; reader saw 48 |

**Special damage numbers** (the state just before the special, plus its own DEF down):

| Time | Special | Target | Shown | Predicted | Shown / predicted |
|---|---|---|---|---|---|
| 30.0 | Blackbeard & Kuzan (3x ATK) | Uta | 16,674 | 16,669 | 1.000 |
| 30.0 | Blackbeard & Kuzan (3x ATK) | Bartholomew Kuma | 7,774 | 7,772 | 1.000 |
| 30.0 | Blackbeard & Kuzan (3x ATK) | St. Ethanbaron V. Nusjuro | 6,985 | 6,874 | 1.016 |
| 30.0 | Blackbeard & Kuzan (3x ATK) | Red-Haired Shanks | 17,218 | 17,235 | 0.999 |
| 61.6 | Loki (4x ATK) | St. Ethanbaron V. Nusjuro | 39,690 | 36,258 | 1.095 |
| 61.6 | Loki (4x ATK) | Fleet Admiral Sakazuki | 31,752 | 29,677 | 1.070 |

The per-target fit of the trigger count in that table is loose: with one shared count (Loki's trigger fired twice
by 30 s, three times by 61.6 s, Loki at ATK level 24) the predictions are Uta 16,669, Shanks 17,235, Kuma 7,772, Imu
21,458, Nusjuro (first special) 7,655, Nusjuro (Loki's) 39,690; Sakazuki in Loki's special is not explained.

Other numbers on screen: heals of 400 over Loki and others are Loki's built-in heal (400 every 5 s) and similar
entries; 77 and 0 are heal ticks from specials.

## Appendix C. How a battle recording is analyzed (the method used for run 9)

The tool is `analyzer/` in this repository (Python, OpenCV): `python -m rva analyze "<video>" --match
matches/runN.json`. It reads the battle timer, damage numbers, unit counts, the NEXT column and your cards from
every frame, tracks the units, and explains each number from the stats. The steps below work with any tool that
can list the damage numbers with their times.

1. Export the match file from the two team codes (`export_match.ts --codes ... --name runN --mine 1|2 --rules ...`).
   It carries the opening stats, every buff source, and the resistance / Rumble key factors per attacker-target pair.
2. `python -m rva analyze "<video>" --match matches/runN.json`. Read `explained_numbers` in order of time: each
   number lists its simplest explanation and how many buff levels away from the tracked state it needs.
3. Go to the first number whose best fit is not clean (cost above ~1.5, or none). Before it the state is right;
   something happened there that the tracker does not know. The usual causes, in the order they turned up in run 9:
   - a special the scan did not see or name (one fired at the start; a cut-in matched to the wrong unit),
   - a passive switched off (Ability Bind) or on (a trigger: "when hit", "on Blow Away"),
   - the attacker is not the NEXT-column pick, or the target is not the tracked one,
   - a bench entry or KO time taken from the tracker (unreliable in a crowd),
   - the hit landed after its target died, or on the attacker's own team (Confusion),
   - the number was only partly read (digits cut off or covered).
4. Look at the frames (`python -m rva sheet "<video>" --match ... <battle times>`), or ask someone who knows the
   game, and write what was seen into `matches/runN.observed.json`: `specials` (t, caster, targets), `cutins` (name
   or dismiss one), `hits` (t, attacker, target, optional `state_t`, `true_value`, `partial`), `entries`, `kos`,
   `special_numbers`. Re-run (seconds for the analysis, about 2 minutes with the second looks) and repeat from 3.
5. A fit that only works with a new rule (run 9: guard = DEF x2, key bonuses only against the resisted type, no
   level floor) goes into `docs/MECHANICS.md` and the engine, with the numbers that prove it; then re-export the
   match files.

Tolerance: a prediction within 3 points (0.2 % for large numbers) counts as equal; the stats behind a team code are
a few points off for some units. The cards of your own team show the current buff levels and are the direct check of
the tracked state (read by eye so far).

Run 9 ended at 22 of 26 regular numbers with a fit (18 of them clean; one more is only partly visible) and 5 of 7
special numbers.

## Appendix D. The full mechanics notes

Until 2026-11-17 this appendix was a full copy of `docs/MECHANICS.md` as of 2026-11-11. `docs/MECHANICS.md` has the
same sections ("Damage", "Stats", "Turn order and timing", "Super specials" ...) and is kept up to date, so read it
there; the copy as it was is in git history (commit 74196c2, `SIMULATOR_HANDOFF.md` at the repo root). **Where it and sections 1-14
disagree, sections 1-14 are newer and win** (and `docs/SIMULATOR.md` is newer than both). Names in `code font` there
that point into `src/engine/` (constants, `battle.ts`) refer to the old engine, removed on 2026-11-17 (docs/HISTORY.md).
