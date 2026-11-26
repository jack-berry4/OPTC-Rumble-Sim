# Plan: Grand Party, Assault Rumble, team generator, screenshot / video import

Status (2026-11-22): **built**: all four parts, first versions (see "Built" at the end). Everything stays a static,
client-side site: no server, no accounts, nothing uploaded.

## 0. Shared groundwork

- **Game mode** switch at the top of the app: Rumble / Grand Party / Assault Rumble. Teams, saved teams and settings
  are kept per mode; the team editor, presets, rules editor, replay and win rate are shared.
- Simulator option `mode`. The data already marks mode-only effect parts: 328 effect parts in 96 units carry
  `condition: {type: "mode", mode: "Assault Rumble"}` (e.g. Ivankov 4411's special: "During Assault Rumble, reduces
  30% of Special CT ..."). Today the condition is always false; with `mode` it holds in Assault Rumble.
- Grand Party data is already in the database and resolved: 525 units have a GP ability (5 levels), a GP special
  ("burst": `uses` + effects, some parts flagged `leader: true`) and a burst condition (`defeat` 405 units, then
  `special`, `dmgdealt`, `hitreceived`, `time`, `dmgreceived`, `attack`, `damage`, `debuff`, `action`, `dbfreceived`).

## 1. Grand Party

- Setup per side: 3 teams of 8 + a **leader** (a 9th unit; may be a copy of a team member) with its GP ability /
  burst level. Battles are simulated one pair at a time (1st vs 1st, ...), with a "run all three" that lists the
  three results.
- **Leader ability** (GP ability): applied to the leader's side for the whole battle, like a rule.
- **Burst** (GP special): its condition is tracked through the battle for both sides; the replay and a small graph
  show each side's burst gauge and when it is ready. Launch times are the user's: per side a list of launches ("when
  ready" by default, or at set battle times, even before it is ready). Start charge settable.
- **Boosted leaders**: a list of matchers (name / tag / class / type, like the rules' targets) with stat boosts edited
  like the global rules; a boosted leader also gets -40% burst requirement and +1 burst use.
- Win rate per pair; launch timing can be compared ("when ready" vs set times).

## 2. Assault Rumble

- **Boss editor**: pick a base unit (portrait, sprite, tags), then set name, type, classes, stats (HP, ATK, RCV, DEF,
  SPD), style, action pattern, targeting, resistance, ability and special(s). The ability / special editor works on
  the same effect structure as the database (every regular special can be built), and "start from unit X" copies a
  real unit's kit to edit. Bosses are saved like teams and shareable by code.
- **Boss team**: 1-8 bosses (layout: see question 7).
- **Max assault level** (always): a boss at 0 HP stays on the field, can't be KO'd, and takes extra damage (a setting).
- **Score** = (damage score + life score) x modifiers. Damage score = all damage dealt to the bosses (past 0 HP too);
  life score = HP left on your units, bench included. Modifiers: a list with on / off and value, defaults "defeat the
  team x1.8", "assault level 10 x2.5", "owned boosted character x1.5"; add your own.
- Assault-only effects (the `mode` condition) are on.
- The win-rate panel shows the score instead: average, spread, best / worst seeds (the seed lists work as now).

## 3. Team generator (Rumble and Assault Rumble)

- Input: your box (from the box import below, a typed list, or "every unit" at a preset) + the enemy team (or boss
  team), with the usual rules and cost limit.
- Search in the win-rate workers: a quick score for each box unit against the enemy, then a local search over teams
  (swap a unit, swap positions / bench order) with few battles per try, spending more battles on the leaders
  (successive halving). Live progress, stop any time; the top teams are listed with win rate (or score) ± error and a
  "use this team" button. Same seeds for every candidate, so the comparison is fair.
- As built (src/engine/generator.ts, src/ui/Generator.tsx): starts from the meta run's comps (src/engine/meta.ts,
  docs/META_PLAN.md; Nydato's comps until 2026-11-25) and your teams, improvement
  rounds of single changes, a final check; build options (a build for unknown units, every unit at least a quick
  build, 5★-and-below final forms on their own build, death-special units also at level 1); Assault ranks by "the
  score I reach at least once in N matches, p% of the time"; normal Rumble by win rate, stopping once the best team
  wins every battle two rounds in a row. Details in the dated entries at the end.

## 4. Screenshot and video import (in the browser)

**How sites like this usually do it.** Three patterns:
1. In the browser (canvas pixel work, maybe a WASM / JS OCR such as tesseract.js): free to host, private, works on a
   static site; limited by the visitor's device. Example: Genshin Optimizer's built-in artifact scanner.
2. A downloadable desktop scanner that writes a file in a shared format the site imports. Example: Inventory Kamera
   writes the GOOD JSON format that Genshin Optimizer reads.
3. A server doing the vision work (OPTCbx: a Python / Flask server with OpenCV, and PyTorch models for the "smart"
   detector). It costs hosting money, and screenshots are uploaded.

With a static site and no server costs, **1 is the fit, and it is enough here**: the game's screens have a fixed
layout and a fixed font, so this needs layout geometry, portrait matching and digit templates, not heavy AI. A desktop
helper (2) stays a fallback only if browser speed on long videos is a problem; it would hand over a box code / file in
the same format.

Pipeline:
- **Screen type** from the layout (Select Character box, Attack Edit, Confirm Opponent VS, GP Team, character details,
  Rumble details).
- **Tiles** from the screen geometry, calibrated by width (the game scales with width; taller phones add space).
- **Which unit**: each portrait against precomputed features of all OPTC-DB thumbnails (a script computes them at
  build time; ~1 MB committed), narrowed by type color; overlays (Lv, +574, MAX, type icon) masked out. The thumbnail
  host allows cross-origin reads, so close matches can be confirmed live against the real thumbnail.
- **Numbers** (Lv, +CC, MAX, HP / ATK / RCV / DEF / SPD, CT, special level, Limit Break) by template matching against
  the game's digits, cut from real screenshots.
- **Unit pages**: the Rumble details page gives exact Rumble stats; with the unit's data the level, cotton candy, Limit
  Break and potentials are worked back (the closest legal build; off by 1-2 is fine). The main-game page adds level /
  Limit Break / CC for your own units.
- **Video**: frames read in the browser, the scroll tracked, each tile read once from its clearest frame.
- **Assumptions** for what a screen doesn't show (hidden by the favorite star, luck, sort overlays): settings per
  source, e.g. "missing level → max", "MAX hidden → assume max / keep unknown", or "use preset X".
- **Review step** before anything is applied: each crop next to its match, the top alternatives one click away,
  values editable, low-confidence ones flagged.
- Targets: a team (Attack Edit, unit pages), the enemy team (VS screen, unit pages), 3 teams + leader (GP Team), your
  box (box screenshots / video, exported in the OPTCbx shape {number, name, type, class, stars} plus level / CC / LB),
  and Assault bosses (base unit and stats from a unit page or the VS screen).

## Order

1. Groundwork + Assault Rumble (mode condition, immortal bosses, score, boss editor).
2. Grand Party (leader, bursts and their timeline, boosted leaders, 3 teams).
3. Team generator.
4. Import: team screens and unit pages, then box screenshots, then box video.

Each part is committed on its own.

## Answers (user, 2026-11-22)

1. GP: only the leader's GP ability / burst apply; no other unit's GP kit.
2. Leader-flagged burst damage uses the leader's ATK; bursts work the same wherever the leader is. One team per side
   plus the leader as a 9th unit.
3. Start charge = the leader's burst gauge, for both sides.
4. Charge and uses carry over: set them at the start; counted conditions start in whole steps.
5. -40% rounds up (6 -> 4).
6. GP ability / burst level: max by default, a dropdown for lower.
7. Bosses: at most 4 (changed from 5 on 2026-11-23: the game screen has 4 places, the data's decks 1-4 units), all on the field; your team as usual.
8. A boss at 0 HP acts normally; x1.5 more damage taken by default, adjustable.
9. All damage counts (past 0 HP too); life = HP left, bench at full, KO'd 0; modifiers multiply; once at 0 HP a boss
   stays there.
10. 100 s; early end only on a wipe of your team (still scored).
11. Boss stats as typed / read.
12. Generator: against the chosen enemy; may use saved teams and Nydato's sheet comps and subs as templates (credit
    Nydato); Sync Data.bat updates the default teams from the sheet (tier SS and up, the format of the first three).
13. Any phone shape; the box is always 5 columns.
14. The box's "+574" is the total cotton candy: spread evenly, extra to ATK, then HP, then RCV; only real cotton candy
    steps; exact amounts when the base stats are known.

## Built

- Game mode switch (each mode keeps its own teams); simulator `mode`, Assault-only effects on in Assault Rumble.
- Grand Party: leader slot (team picks, levels), GP ability as an aura, burst gauges (every condition kind), launch
  when ready / at set times / never, start charge, uses left, season boost (leaders, -%, +uses, stat rules), burst
  graph (click to add a launch), burst cut-ins.
- Assault Rumble: boss editor (copy any unit's kit, effect editor with JSON, resistances), bosses at 0 HP, score with
  modifiers, score runs (average, spread, histogram, best / worst seeds).
- Team generator: box / meta comps / saved teams as the pool, successive halving, results with Use / Save.
- Nydato's sheet sync (Sync Data.bat step 3): 29 comps with options; tier OP / SS are default teams.
- Import: Attack Edit, VS, GP Team, Select Character (screenshots, box video), Character Details; review with
  alternatives. Not yet: numbers (levels, cotton candy, stats), the Rumble details page, the GP leader.
- Assault boss teams from the game (2026-11-22): every season in the game data (Sync Data.bat), a season / boss team
  / Assault Lv picked in the Assault card; stats, abilities, resistances, pattern and targeting from the game's data,
  specials parsed from its text (96% of all clauses; the rest listed on the boss to add by hand); the team's season
  rules, the Assault Lv and owned-trusty modifiers. Bosses stay at 0 HP only at Lv 10.
- Settings (2026-11-22): site settings (your account's cotton candy, author, night mode, unit search, quick builds)
  apart from each mode's (Pirate Rumble: opponent account, global rules; Grand Party: opponent account, bursts, season
  boost; Assault Rumble, at the top: the game's boss teams with their rules, saved boss teams, score settings). Each
  mode has its own rules (Grand Party: none).
- Pirate Rumble rules from the game data (public/game/rumble-rules.json, every stage of every Rumble event): today's by
  default (on each visit while "Use today's game rules" is on; editing a rule turns it off), any stage loadable, own
  sets saved by name.
- Boss teams are saved and shared in their own format (RSA1. codes) with their rules and Assault Lv.
- Team generator (user, 2026-11-22): available units = all units or only My box; search = every available unit or only
  those on Nydato's sheet (its character tier list or a comp with its subs; the sync reads the tier list too)
  or newer than it: every unit released on or after the oldest "Last Update" of the sheet's tabs (user, 2026-11-24; the
  sync reads each tab's date into `since`, the release date is the game's `publishTimestamp_`, in `game.released`); one build
  for every unit except box units whose build is known; units with a death special are also tried at level 1
  everything with their Rumble special / ability maxed. Searching every unit tries the sheet's and your teams' units
  plus the 200 newest. Screenshot-imported box units have no build yet (levels aren't read).
- Team generator (user, 2026-11-24/25): **no longer uses Nydato's sheet** (its comps stay as the default teams, with
  credit). The search filter is "Only relevant ones, or newer": the units the meta run kept for the mode (Rumble: its
  attack side; Assault: its Assault screen, or the attack side until that's in) plus every unit released after the
  run's newest unit (`since` in src/engine/rumble-meta.json). The starting comps are the meta run's (the league's
  final mix and its climbed themed teams; Assault: the best team per boss team), and a missing unit is replaced by
  that position's sub first (`Template.subs`), then a unit of the same type and class. Saved "sheet" settings become
  "meta".
- Team generator (user, 2026-11-25): **changes of two units at once** (pairs of the best single changes; a unit with a
  unit its kit targets, counts on or needs, in a weak place), **themed starting teams** from your units (every group
  their abilities buff), and **kicks** after the first result ("Keep improving": stop at the first result / a while
  longer / until I stop): bigger changes from the best team, climbed from even if worse at first, each followed by a
  final check, so the list improves the longer it runs. The comps you can field fully are tried first; the units
  tried in each round are ranked by the meta run's scores. Details: docs/META_PLAN.md (Progress, 2026-11-25).
- Team generator (user, 2026-11-24):
  - Builds: "Every unit at least" a quick build raises each unit part by part, nothing goes down (`atLeastPreset`);
    "5★ and below" gives final-form 5★-and-below units (not a 5★ with a 6★ form) their own quick build; a box unit
    whose build is known is only raised where it's below that build, part by part (`atLeastPreset`: a maxed box unit
    stays maxed; user, 2026-11-25; it used to replace box builds). "Free-to-play 5★ and below" (2026-11-25) does the
    same for farmed units (Co-op, Pirate King Adventures, raids, story...: `UnitRecord.farmable`), unset = like "5★
    and below". Builds set under Also use and the level-1 death-special builds are left alone.
  - Assault aim, one sentence: "the score I reach at least once in N matches, p% of the time" (N any number,
    suggested 1 / 2 / 3 / 5 / 10; p 5-95% on a slider, quick picks 90% steady / 50% even odds / 20% high ceiling).
    Matches and the % were two settings at first ("Tries" and "Team"), but only their combination matters: teams
    are ranked by the (1 - p)^(1/N) quantile of a team's per-match scores (`aimQuantile`), shown as "the score a
    single match beats X% of the time". Each result lists its score in N matches at 90 / 50 / 20% (and the chosen
    %) and its one-match average, so the steady / ceiling trade is visible.
  - Progress: a status line (phase and step), figure tiles (best team, gain since the start, better teams found,
    teams tried, battles), the round's leading change against the current team, and the chart with a real legend
    (compact axis numbers).
  - While it runs (user, 2026-11-25): it stays on out of sight on My Boxes (a note there has Show); switching game
    mode asks first, then stops it and drops what it found (its teams were for the other mode's opponent); closing or
    reloading the page asks first (the browser's own prompt).
- Box units on a team (user, 2026-11-25): a team unit with the same build as its entry in the box in use (`sameBuild`:
  key order, unset fields and confirmed parts don't matter) shows "From <box>: changes here change it there too" with
  a checkbox (one setting for all, on by default). Checked, its settings and presets (one unit's or the whole team's)
  change the box entry too, the changed parts marked confirmed (`boxEdit`); unchecking it, or making the copy illegal,
  only changes the team's copy. A unit whose box entry has another build shows "Use the box's" / "Put this one in
  the box". Off while a box video is being read.
- Type names are shown in their colors (STR red, DEX green, QCK blue, PSY yellow, INT purple); a boss shows its own
  type badge (cut from OPTC-DB's thumbnails: the game's badges, public/game-ui/type/) over its base unit's portrait.
