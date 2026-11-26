# Assault Rumble test runs (user, 2026-11-24)

Videos and the user's fight notes in `Assault Test Runs/` (git-ignored): `akainu.mp4` + `akainu fight description.txt`,
`blackbeard.mp4` + `blackbeard fight description.txt`. Enemies: the latest season's bosses (season 22: the QCK Akainu
team and the DEX Blackbeard team; game data in docs/ASSAULT_DATA.md). The notes list what happened per 5 s of the
in-game timer (100 -> 0); attacks may be missed, but what's written happened; times have some wiggle room.
Team screenshots: `Samples/2026-11-24/assault-team-{1,2}.webp` (read with the import: names below).

## Teams (Rumble stats as shown on the Assault Rumble Team screen; all +574 cotton candy unless said)

Team 1/8, vs Blackbeard (CP 96,248):
- Main: St. Shamrock (Lv 110 in the screenshot; maybe 105 in the video) 10,630 / 4,129 / 620 · Usopp & Dr. Vegapunk
  "Lilith the Evil" (Lv 150) 17,105 / 5,652 / 1,089 · St. Ethanbaron V. Nusjuro (Lv 150) 14,147 / 4,545 / 827 ·
  Red-Haired Shanks (Lv 120) 16,796 / 4,986 / 936 · Master Caesar Clown (Lv 120) 14,415 / 4,124 / 933
- Sub: Nico Robin (Lv 120) 10,076 / 3,525 / 546 · Imu (Lv 120) 19,020 / 6,294 / 857 · Kuzan (Lv 120) 15,280 / 4,680 / 853

Team 2/8, vs Akainu (CP 92,794):
- Main: Roronoa Zoro (Lv 150) 16,796 / 5,594 / 903 · Usopp & Dr. Vegapunk (Lv 150) 17,105 / 5,652 / 1,089 ·
  Vinsmoke Reiju (Lv 150) 11,511 / 4,290 / 928 · Master Caesar Clown (Lv 120) 14,415 / 4,124 / 933 ·
  Luffy & Bonney (Lv 130) 18,162 / 5,571 / 1,029
- Sub: Nico Robin (Lv 120) 10,076 / 3,525 / 546 · Pudding: Tricked Witch (Lv 100, no cotton candy) 4,673 / 2,241 / 504 ·
  Kuzan (Lv 120) 15,280 / 4,680 / 853

Names in the notes: "uso lil" = Usopp & Vegapunk ("Lilith"), "lubo" = Luffy & Bonney, "aka" = Akainu, "BB" =
Blackbeard, "kiz" = Kizaru, "fuji" = Fujitora, "nusjuro" = Ethanbaron V. Nusjuro.

## What the notes show (to check against the videos and the game data)

- The boss (slot 1) acts far more than anyone: Akainu attacks about every 5 s, often twice per 5 s, plus "ranged
  medium" and "ranged power" attacks that hit 2-3 units at once (with no DoT) — his behavior pattern's extra actions.
  Blackbeard's deck has `additionalBehaviorCount_` 3 (4 places in the NEXT queue).
- Akainu's melee attacks keep going to Zoro ("targeted"), who counters; Fujitora once too.
- Every boss melee attack is "hurt by DOT" (a DoT on the boss's team from the start, or a field effect).
- Two of our units attacking at the same time ("lubo attacks akainu even while uso lil is still attacking").
- **Animation anomaly (Blackbeard, ~45 s and ~15 s):** a special used by one of ours (Shanks, Shamrock) while BB is
  mid-attack seems to cut BB's attack: the first attack deals no damage and doesn't finish, then BB restarts the
  attack when the first one would have ended, takes DoT again, and doesn't step back after it. May affect normal
  Pirate Rumble too, not just Assault.
- Akainu anomaly: the two of our units attacking him at once (user, 2026-11-24): the main boss takes several
  attackers (point 3 below).
- Blackbeard: "guarded", "critical", "blows them away", "full attack", "Break!" state after Shanks's special, and
  "can't attack because paralyzed" (×3 around 25-20 s).

## First look at the game data (2026-11-24)

- Akainu's team (boss team 66, deck 66603): Akainu (slot 1) + Kizaru + Fujitora, `additionalBehaviorCount_` 2.
  Blackbeard's team (64, deck 66403): Blackbeard alone, count 3. Working idea: the slot-1 boss gets 1 + count places
  in the action queue (Akainu 3, Blackbeard 4: 4 is what the Blackbeard video's NEXT column shows). Confirmed on the
  videos and simulated since (below).
- Akainu's pattern: Normal Attack -> Medium Range Power Attack -> Power Attack -> Medium Range Full Attack: the notes'
  "ranged medium / ranged power" multi-hit attacks. Blackbeard's: Normal -> Power -> Power -> Full Attack.
- Abilities to check in the videos: Akainu "after 30 s of battle, self Shield Lv.6", Shooter-class enemies HP Down
  Lv.10; Blackbeard "after 40 s of battle, self Special CT Speed Up Lv.10"; Kizaru heals (Medium Range).
- Stepped through both videos (below): the queue idea holds; the attack cut stays open.

## Measured on the videos (2026-11-24)

Times are video seconds of the recordings (60 fps); one beat = 1.526 s. Read frame by frame (NEXT tabs per frame
with a small reader, damage numbers with the analyzer's reader, the rest by eye). The full analyzer run does not work
on these videos: the red tint and the many effect banners break its cut-in detection, so its battle clock runs
backwards in places.

1. **Queue places = 1 + `additionalBehaviorCount_`.** Blackbeard (count 3) fills 4 NEXT places from the start, Akainu
   (count 2) 3 places; Kizaru and Fujitora 1 each. Every enemy is labelled BOSS. Each place leaves the column at its
   own beat, with our units in between, like separate units.
2. **The boss still does one thing at a time.** Blackbeard's turns start (his DoT tick) at 27.08, 31.65, 36.35,
   40.91: exactly 3 beats apart (walk, hit, walk back take about 3 beats). His places do NOT leave the column when his
   turns start: one leaves at 26.88 (the turn at 27.08), the next at 28.41 while he is mid-attack (his hit lands
   normally at 28.67), at 29.93 nobody is picked (the top two places are his and he is busy), and at 31.47 his next
   turn starts with no place leaving. So a place picked while the boss is busy is held, and its turn starts at the
   first beat the boss is free. In effect the boss acts at every beat where it is free and has a place in hand.
3. **A boss can be attacked by several of our units at once.** Blackbeard: Shanks hits at 12.47, Shamrock (crit) at
   14.08 while Shanks is still at him, Usopp at 14.88. Akainu: Luffy & Bonney 2,473 at 11.2, Usopp 2,249 at 12.1 with
   Luffy & Bonney still there (the "attacking at the same time" in the notes). The simulator lets only one attacker
   at a time aim at a unit (the rule for normal Rumble).
4. **Range attacks.** Akainu's "Medium Range" steps show a blue "Range Medium Attack" label over him (32.35), and the
   hit lands on 2-3 of our units at once (607 and 743 at 32.9). No DoT tick comes before a range attack; his melee
   turns each start with one (12,893 at 27.6 and 35.2). The user (2026-11-24): he goes up to the closest unit like a
   normal attack, but instead of the DoT / Paralysis checks he does the range attack (no direct target), then backs
   away; same animation length as a normal attack.
5. **Why every boss turn is "hurt by DOT":** Caesar's opening special puts Damage over Time Lv.3 for 100 s on the
   enemy (plus ATK -5, DEF -4, SPD -5). The tick shows 0.06-0.4 s after the beat: the boss's short walk to its target,
   then the tick on arriving, as in normal Rumble (no walk at 146.17 -> tick at 146.23). On Blackbeard: 21,285 (Lv 3),
   42,570 after Caesar's 2nd special (Lv 6), 63,855 after the 3rd (Lv 9), 70,950 after the 4th (Lv 10, not 12: every
   tick is a whole number of 7,095 = 5% of his max HP, so the 4th added only 1 level). Akainu (end of that video,
   video 233.96 and 284.21): 42,978 = Lv 10 both before and after Caesar's 4th special, with Caesar x3 + Reiju's
   special (also Damage over Time) already past 10; Fujitora 18,682 = Lv 7 at 267.24. So a boss's tick stops at Lv 10:
   a missed special would leave 9, not 10.
   The ticks give the bosses' max HP exactly: Blackbeard 141,900 = 24,000 x 1.6 x 3.5 (Lv 10) + HP Up Lv 30, Akainu
   85,956 = 14,010 x 1.6 x 3.5 + HP Up Lv 30 (Akainu, Kizaru, Fujitora 10 each) -> 12,893 at Lv 3. So the deck's
   "+600 HP" does not count (the simulator had 3,360 more on both), and percentage-damage resistance does not cut
   Damage over Time.
6. **"Break!"** replaces a boss's HP bar once it is at 0 HP (all three Akainu-team units show it late in that video).
7. **The attack cut (Blackbeard, both cases):**
   - Case 1 (timer ~42-38). 136.89: one of Blackbeard's places leaves the column and his turn starts (DoT tick
     42,570 at 137.32), aimed at Nusjuro. Next beat, 138.37: Blackbeard's next place AND Shanks (his special) leave the
     column together. The clock stops from ~138.5 to ~144.7. Blackbeard's hit, due ~1.6 s after the tick (~138.9),
     never lands. First beat after the restart, 146.17: his next place (2nd in the column; Usopp on top is passed
     over) leaves and he starts a new turn at once: DoT tick again at 146.23, with no walk (he is already in front of
     his target), and the hit lands at 147.87 (712).
   - Case 2 (timer ~16-15). DoT tick 70,950 at 213.57 (turn start), Shamrock's special at the next beat (~214.8);
     clock stopped until ~226.7; the cut turn deals nothing.
   - In both, our special went off one beat after the boss's turn started, before its hit, at a beat where another
     place of the boss also left the column, and the boss was in Break. Without a special, a place leaving mid-attack
     does not cut anything (28.41 above). Not settled from these two cases: whether any special cuts any unit's
     unfinished attack (normal Rumble too) or only this boss case.
## In the simulator (2026-11-24)

- **Main boss** = the first unit of a game boss team (`BossDef.places`, also in the boss editor as "Main boss: NEXT
  places"; bosses saved earlier: slot 1 gets 1 + the count). It has `places` gauges in the NEXT queue, each growing
  at its SPD rate, also while it acts (so its places sit on top while it attacks and it goes at about every beat
  it's free). A beat can pick a place only while the boss is free (idle, not under attack); the picked place starts
  over, the others keep their gauge. The "held place" detail (point 2: a place leaving while the boss is busy) is not
  modelled: such a place just waits on top.
- **Several attackers** may aim at the main boss at once (still only while it is idle). The other boss-team units
  (Kizaru, Fujitora) keep the one-attacker rule.
- **Range steps** (game behaviors 10004-10009, `range: "Small" | "Medium"` in the pattern): the boss picks its target
  and walks up as for a normal attack (its target is locked as usual [A]), with no Damage over Time tick or stun and no
  Paralysis check; the hit lands after the usual wind-up on its target and every other enemy within the radial special
  range (small 1.2, medium 2.3 tiles) around the boss; then it walks back. In 20 test battles (Nydato's Cerebral team
  vs Lv 10 Akainu): ~9 range attacks per battle hitting 3.3 units on average (the notes: ~7, hitting 2-3), so the
  range may be a little wide.
- **Boss stats** leave all the deck's plus values out, and the potentials / sockets bonus scales with main special
  level / max as for player units. The Lv 10 stat screens (user, 2026-11-24) match within 1: Akainu 78,456 / 6,235 /
  1,272, Kizaru 49,840 / 5,873 / 1,273, Fujitora 45,878 / 5,291 / 1,295 (special Lv 6 of 8: 30 of the 40 bonus
  levels), Blackbeard ATK 6,012 / RCV 1,029 (HP shown as ?????). The export (`npm run sync:assault`) now records each
  boss's `specialMax`. Portraits: a boss is its own game character with no link to the playable unit, so the export
  picked the OPTC-DB unit by name. Now: a boss's server id ends in the server id of the form it copies (Kizaru
  2412210 -> 12210 = the 6* Borsalino, not the 5* Kizaru; user 2026-11-24); for the few with no such form, the same
  main-game special and rarity. Fixed: Akainu (was the Egghead Sakazuki, now Fleet Admiral Sakazuki 6+), Kizaru (6*),
  Uta "Happy Halloween!" (was the Christmas Uta), Shanks: Moon Knight Emperor "Happy Spooky Halloween!" (was Moon
  Knight King 6*, now the Emperor 6+). Buggy "Soul-Shaking Proclamation" is a 6+ boss but only the 6* exists.
- **Damage over Time** stops at Lv 10 for every unit (point 5; `TUNE.dotMaxLevel`, was 20; user 2026-11-24).
- Not simulated: the attack cut (point 7, open whether it is Assault-only).
- Old saved boss teams keep their old HP and patterns: load the boss team again to get the range steps and the HP fix.

## Answers from the user (2026-11-24)

- The Akainu anomaly is the two attackers at once (simulated).
- Range attacks: Akainu goes up to the closest unit like a normal attack, but instead of the DoT / Paralysis checks
  he does the range attack (no direct target), then backs away; same animation length (simulated).
- Damage over Time: the cap is 10, not 20, for every unit (simulated).
- Lv 10 stat screens of Akainu, Kizaru, Fujitora and Blackbeard: the plus values don't count (simulated).
- Open: whether a special cuts an unfinished attack in normal Rumble too (the user is checking other videos).
