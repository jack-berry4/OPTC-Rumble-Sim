# Screenshot / video import: restructure plan and measurements (2026-11-23)

The user's request (2026-11-23): restructure "Import from screenshots" around the kinds of screenshots below. It should
load whole teams from team screens, a collection of units from any screen, and single units from unit pages (left side
only). For Grand Party, find the leader and its position (e.g. team 2 position 6) and ask which teams to load. Add
instructions: what each screenshot gives and how to get it. After an upload, show what is known, what was worked out
and what is unknown, with user-chosen defaults for the unknowns. Keep it simple and working on the samples.

## Kinds

| Kind | Screen | Gives |
|---|---|---|
| VS (Confirm Opponent / Confirm Assault Rumble Battle) | before a battle | enemy name, units, levels, team CP, min LLB per unit (LLB circle), LB MAX badge; your units, LLB, key state (none / possible / on) |
| Team edit (Attack / Defense / Assault edit) | your team (5 top + 3 bottom) | units, level, LLB, CC total (+574), LB MAX; mode 1: HP/ATK/RCV/CP; mode 2: SP/ABL lv, DEF, SPD |
| GP Team / GP Opponent Info | 3 teams of 8 | as VS per team; opponent teams can be hidden ("?"); the leader has a marker pin |
| Rumble status (Character Details, Rumble tab) | any unit, also the enemy's | special lv, ability lv, rumble HP/ATK/RCV/DEF/SPD, CP, level / max level -> LLB, key |
| General status (Character Details) | your own unit | No. (unit id), level / Max Lv -> LLB, main HP/ATK/RCV/CMB, special lv, sockets, potentials |
| Box video (Select Character, scrolling) | your box | per unit: level, LB, min LLB, CC total, key |

Box video (the user's: `Samples/2026-11-23/box-video.mp4`, 80 s, 1080 x 2400, ~1000 units; frames for checks in
`Samples/2026-11-23/frames/`). Tutorial: turn off the treasure / item type, set Rumble stats to "have" only, sort by type. Watch out for the
"NEW" text on tiles, the search bar at the top of the scroll and the "Auto Power Up" button bottom-left (skip tiles it
covers).

## Samples (git-ignored)
`Samples/2026-11-23/`: 18/19 Jinbe general, 20 Jinbe rumble, 21 VS New Fish-Man, 22 VS Buggy, 23 Assault VS,
24 VS (Korean name), 25 VS Monkey D. End, 26 Usohachi general, 27 GP Team, 28 GP Opponent Info (teams 2-3 hidden,
leader team 2 pos 6), 29/30 Attack Edit (HP / SP modes), 31/32 Nami&Usopp general, 33 Nami&Usopp rumble,
34/37 Attack Edit (with Whitebeard), 35 Whitebeard general, 36 Whitebeard rumble. `Samples/2026-11-22/`: 5-13 older
screens, `box-scroll-by-level.mp4`.

## Layouts (game frame 640 x 960, `toGameCanvas`)
- ROW8 xs = 26, 98, 170, 242, 314, 402, 474, 546; size 68.
- VS: enemy y 353, yours y 705. Assault VS: bosses xs 316, 404, 476, 548 at y 350 size 70 (4 places), yours y 720.
- GP Team rows y 452 / 613 / 773. GP Opponent rows y 414 / 574 / 734.
- Attack Edit: xs 28, 146, 264, 382, 500; y 345 (main) / 619 (sub), size 112. Relative to the tile's x0 (y absolute,
  main row; sub row +274):
  - CC "+574": x+30..86, y 350..375 (yellow text mask);
  - LLB digit circle: x+1..20, y 434..454;
  - level: x+44..104, y 432..456 ("outline inside" mask, below);
  - stats block: x+2..110, y 478..558 (white mask, psm 6): "HP : 9736 / ATK: 3210 / RCV: 651 (/ CP)" or SP/ABL/DEF/SPD.
- GP leader marker: a gold-rimmed pin, white arc, peach face, above the tile top at about x+14..50, y-22..+6
  (GP Team team 2 tile 4 at x 244 y 613; Opponent team 2 tile 6 at x ~402 y 574).

## OCR (tesseract.js 7.0.0, in package.json)
- White / yellow text: threshold, whitelist digits, psm 7 (6 for the stats block). Reads stats at conf ~92.
- Level text (red / yellow with dark outline): "outline inside" mask: upscale x4, dark = lum < 70, flood-fill the
  non-dark area from the border = outside, text = not dark and not outside. Then post-process: "MAX" when the text has
  letters, drop A, M->1, drop spaces, valid 1..150.

## Done before this plan
- Portrait matching (portraits.bin, GRID 12), screen classification by title banners (screenRefs.json), box video
  reading (rows by the darkest separator line, aligned by matching).

## Built (2026-11-23, uncommitted)
- `src/import/ocr.ts` (tesseract worker from local files, masks white / yellow / outline, `glyphs`),
  `src/import/tileRead.ts` (tile: level by glyph shapes, MAX color, LLB circle, cotton candy, key icon, GP leader pin;
  team-edit panel with its text lines found per tile; general / Rumble status pages),
  `src/import/infer.ts` (build fit: Limit Break nodes, cotton candy, potential + socket levels, main special level,
  key from DEF / SPD, level when not read; tries other readings and one-digit OCR slips), `src/import/names.ts`
  (Rumble status page -> unit by name / subtitle / cost), `src/import/read.ts` (screens incl. Assault VS and GP
  Opponent Info by layout, empty / hidden places, box video with numbers read from each unit's best frame).
- `src/ui/ImportDialog.tsx`: help table, defaults per side (quick builds), per-unit read / worked out / default facts,
  readings of one unit combined across screenshots, GP team ticks + leader, save several teams, update a unit on
  your teams, box entries replaced by imported builds. Tests: `src/import/infer.test.ts`.

## Findings
- Tile "Lv.MAX": red = the LLB max level (150); yellow = the level cap before LLB (99). Measured: green/red of the
  letters ~0.6 vs ~0.8; Attack Edit stats only fit a legal build that way (St. Peter, Smoothie, Mars at 99).
- Team edit HP / ATK / RCV are the Rumble status stats (Whitebeard, Nami & Usopp match their Rumble pages exactly).
- Rumble stat = main stat x (1 + k x (potentials + sockets) x main special / max) holds exactly (Jinbe 8520 -> 13632).
- The circle at a tile's bottom left = how many sockets have at least one level (user, 2026-11-23; Whitebeard 1).
  Shown on your own units (box, team edit, GP, your side of VS). The fit keeps socket levels within 1-5 per filled socket.
- The badge at a tile's top right = Limit Break (user, 2026-11-23): white MAX = the usual max (no expansion key), gold
  MAX = everything with the Limit Break key, white number = below the usual max, gold number = with the key, past the
  usual max but not all. The Attack Edit units then fit at exactly 30/40 (white) and 40/40 (Imu, gold).
- Limit Break rules (user, 2026-11-24): no Limit Break (and no badge) below level 99; the number is the nodes so far
  (Usopp & Vegapunk "17"); the Limit Break key can only be added at the usual max, then the badge turns gold until all
  nodes (gold MAX); a unit that can't take the key only ever shows a white MAX. The build follows these (infer.ts
  lbNodesFor): a level under 99 gives 0 nodes whatever the badge seemed to say, a gold reading on a unit with no key
  nodes counts as white, a surely read number pins the nodes.
- The badge vs the favorite star (measured 2026-11-24, `lbBadgeLook`): the letters sit on a dark disc, dark pixels
  0.20-0.43 of the badge box, the star 0.05-0.09; white vs gold from pure-white pixels in the middle of the letters
  (white 0.13-0.17, also over a bright portrait; gold 0.00-0.01: the disc's gold ring spoils a whole-badge test). The star
  fades in and out over the badge on a ~4 s cycle, all tiles together (~2.75 s star, ~1.25 s badge). The old test
  (white vs gold pixel shares) read the star as a gold badge and a grey key icon or white art as a white MAX.
- General status: the main special's "MAX" in red (not gold) = its shortest charge, from the Limit Break key's extra
  reduction (user): the key is used. Jinbe / Usohachi red, Nami & Usopp gold.
- GP Opponent Info: a hidden team's leader shows only its position (the unit isn't shown on the tile).

## Box video, 2026-11-23
- Full run of the user's 80 s video in the app: 1002 units found (990 sure matches). Frames every 0.2 s (was 0.08 s:
  6.5 min for this video). Unit details load afterwards (~1000 requests): the dialog shows "Loading the units'
  details… n / total" with a progress bar (2026-11-24; before, a note with no progress).
- Checked against frames 1 s / 45 s / 79 s by eye: most levels, cotton candy (+574), filled sockets and keys right.
  Known misses: a red "130" read as "120" once (the "3" of that font); some levels unread (left to the defaults);
  the Limit Break badge is mostly under the favorite star in the box (then unknown).
- 2026-11-24: the badge is now read over every frame a unit is on screen: each frame votes white / gold (star frames
  don't count), and MAX / the number is read on the frame with the clearest badge. A unit on screen less than the
  star's ~2.75 s can still miss the badge: a slower scroll catches more.
  A unit showing no badge on frames where other tiles show theirs (the star fades on all tiles together) has none:
  "empty", 0 nodes; a frame counts only when most tiles show a badge (a unit that isn't a favorite shows its badge
  all the time), and a unit on screen for more than a whole star cycle (4.5 s) without a badge is empty too.
  "MAX" vs a number: the badge's text enlarged 3x, then each mask read twice, letters only and digits only (one
  reading with both turned lone digits into letters): any M / A / X = MAX, otherwise a number (kept when read at 85+).
  The user (2026-11-24): the exact number matters less than empty / partial / MAX / gold MAX.
- Test video sorted by Limit Break (user, 2026-11-24; Samples/2026-11-24/box-lb-sorted.mp4, 84 units): 39 of 43
  MAX right (1 read as a number, 3 unknown: on screen for one badge frame only), all 7 number badges read as
  numbers (15, 15, 2 exact; 34, 18, 9, 4 without the number), the star-only units unknown (not on screen for a whole
  cycle). Whitebeard's white 34 is right: his usual max is 40 (50 with the key). A level read below 99 on a unit
  showing a badge is a misreading (the box counter over a tile): the level counts as not read.
- Level reading: the outline mask first; a red / yellow ink mask only as a fallback and only for numbers (two thin
  digits merge there and would pass for MAX). Cotton candy needs "+" and 2+ digits (or 3 digits): one stray digit
  came from the type badge's glow. The badge needs letter glyphs inside it (a star reaches past it).

## My Boxes tab (2026-11-23)
- A "My Boxes" tab beside the game modes (`src/ui/BoxesPage.tsx`, view saved in `rumble-sim-view`). Several named boxes
  (`rumble-sim-boxes-v1` {active, list}; the old single box `rumble-sim-box-v1` becomes "My box"). The picked box is
  what the team generator ("Edit box…" now opens this tab) and Assault's owned trusty bonus use.
- The page: box picker (new / rename / delete), the import inline for box videos ("Add / update N in <box>", "Replace
  <box> with these"; a long box shows the units worth a look first), and the box editor (`BoxEditor`: filter, add,
  quick builds for all, click a unit for its full build editor, paste / copy a list).
- Reading yields with a MessageChannel, not setTimeout: a tab not in front slowed every pause to 1 s.

## Review, bulk changes, motion characters, generator chart (2026-11-23)
- Default build is "Lv 99" everywhere (site setting "Default build"): units added to a team or a box, the import's
  defaults, the generator's build. `DefaultBuild` context + `withDefaultBuild` (src/ui/TeamEditor.tsx).
- Confirmed parts of a build: `MemberConfig.known` (src/engine/buildGroups.ts StatGroup names), filled from the
  import's read / worked-out facts and from hand edits. My Boxes' "Change a stat on many units" sets one stat on the
  unconfirmed units (or all, after a confirm).
- The import review (src/ui/ImportDialog.tsx UnitReview): click any unit; ←/→ step through, Esc closes; change the
  unit (best matches or search), see each stat's source (read / worked out / default / set by you), edit the build,
  "Looks right" confirms everything and moves on, save to the box / Recent / your teams. Per team: → Your team,
  → Opponent, Save to My teams, Copy code. A box (>24 units) is a table, least sure first, 100 rows at a time.
  Readings of one unit from several screenshots: the value most of them agree on.
- Motion (immersive) characters: the game's MstImmersiveIllust_ lists the arts of one unit (Luffy & Zoro & Sanji
  4365: 7 arts; Luffy & Bonney 4490: 3; Imu 4571, Loki 4629: 1 extra each). `scripts/db/assault.py` writes
  public/game/art-variants.json; `scripts/portraits/thumbs.py` adds each art's picture as one more reference for the
  same unit id (OPTC-DB has 4365-1/2/3: Luffy, Zoro, Sanji alone). The game's own box icons of every art
  (`immersive_illust_<serverId>_<art id>_t1.png`) are in the `character_face_<from>_<to>` bundles (100 characters
  each, not the character_immersive_illust ones, which hold the big art): all 12 extracted to
  .cache/art-icons/<art id>.png on 2026-11-24 (portrait index 4709 rows; each icon, shrunk and blurred, still matches
  its unit at 0.99+, the next unit under 0.6). `npm run sync:game` fetches the icons of new arts by itself.
- Team generator: a progress chart (best measure vs battles, 95% band, the round's best change dashed, dots for each
  better team, phases strip) and a verdict line (gains per round, whether the round's leader beats the current team).

## 2026-11-24
- Rumble key icon, corrected: a red outline (dark or gold swords inside) = key on; grey swords = no key (possible at
  level 120+, not possible below). The earlier "dark swords on red = possible" read keyed units as not keyed.
- My Boxes: no opponents' default (a box is yours). Left panel: a "Box" tab (the box in use; units drag onto a team as
  copies). Team generator: Leave out / Also use units (with a build: instead of the usual one, or one more to try);
  stops when its team wins every battle two rounds in a row; Assault: "Aim for the best score in N tries" ranks by the
  1 - 1/(N + 1) quantile of the scores (later the same day replaced by "the score I reach at least once in N matches,
  p% of the time": docs/PLAN_MODES.md).
- Assault Rumble game data for the accuracy work: docs/ASSAULT_DATA.md (`npm run assault:report`).

## Level colors and key icons (user, 2026-11-24; Samples/2026-11-24/box-keys.webp)

- Tile level text: **red** = at the unit's max (red MAX = LLB 5 / 150; a red number = its LLB's max: 105, 110, 120,
  130); **gold** = below the max (gold MAX = the 99 cap before LLB; a gold 99+ number = an LLB max above it, so the
  LLB is set to the least that keeps it below: gold 110 -> LLB 3, gold 99 -> LLB 1); **white** = Lv.1. Measured as
  (green - blue) / red inside the letters: red -0.02-0.13, gold 0.22-0.49; white has blue and green near red.
- Level reading: glyphs kept only when 0.7+ as tall as the tallest and on their baseline (drops the LLB / ability
  icons beside the level and the closed gaps between close digits); a "1" is a thin glyph (0.32-0.42 wide per
  height, others 0.55+), taken by shape; the other digits OCR'd together (pads 6 then 14); the outline mask fills a
  0's hole, so a failed reading retries on the letters' own color. All 20 tiles of the sample read right.
- Key icon: grey (faded, grey outline) = not possible yet (6*: Lv 120, 5*: Lv 99); red outline + dark swords = possible,
  no key; red outline + gold swords = key on; no icon = no key for the unit. infer.ts drops a key icon read on a unit
  below the key's level (keyAllowedAt).
- Key icon, fixed 2026-11-25 (`src/import/keyIcon.ts`): the first reading looked ~6 px below the icon (its box was
  measured against a hand-placed tile, not the importer's place), so most keys read as none or possible (49.webp: 1 of
  20 keys found). Now the icon is searched for around its place (red bottom edge + a red side + yellow top arc +
  gold / dark swords), a grey icon reads "locked", a box video votes over all frames of the tile, and no icon at a
  level where the game always shows one counts as not read (DEF / SPD or the default build decide). Regression
  crops: `src/import/fixtures/key-icons.*` (`keyIcon.test.ts`).
- My Boxes keeps reading when you switch pages (hidden, with a bar to show / stop it); reloading or closing warns.
