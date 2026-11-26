# Unit database (`data/`)

Our own unit database: 2Shankz's OPTC-DB fork mirrored at a pinned commit, plus the game's own master data
(decrypted `sakura.db`) and values seen in real battle captures. The app and the simulator load `data/units.json`.

## Files

| File | What | Committed |
|---|---|---|
| `data/units.json` | The database: one Rumble unit per line (`{"meta": ..., "units": [...]}`); ~9.5 MB | yes |
| `data/sources.json` | What the last build was made from (OPTC-DB commit, sakura.db hash, ...); read by the update check | yes |
| `data/game-text.json` | Game text per unit: Rumble special per level, super special effect / condition; not loaded by the app | yes |
| `data/known/*.json` | Hand-kept inputs: per-unit values from battle captures (`scripts/db/capture.ts`) | yes |
| `data/reports/mapping.md` | The OPTC-DB <-> game join: counts, units joined by name, units not joined and why | yes |
| `data/reports/crosscheck.md` | Where OPTC-DB and the game data disagree | yes |
| `data/reports/update-<date>-<sha>.md` | What a build changed since the build before it (new / removed units, field changes); a second build on the same day and commit gets `-2`, `-3` ... | yes |
| `.cache/2shankz/<sha>/` | Downloaded OPTC-DB files (one folder per commit) | no |

Scripts (`scripts/db/`): `build.ts` (build + reports), `check.ts` (is an update needed?), `diff.ts` (diff two builds),
`compare-loaded.ts` (compare what the simulator loads from two builds), `capture.ts` (battle capture -> `data/known/`),
`optcdb.ts` / `game.ts` / `reports.ts` (the parts). Node 22.13+ (uses the built-in `node:sqlite`).

The game folder defaults to `../OPTC Decomp/master_db_tool` (next to this repo); set `OPTC_GAME_DIR` to move it. It is
only read; nothing from it is copied into the repo except the extracted per-unit fields.

## A unit record

Everything the old import had, unchanged (`src/data/generated/optcdb-units.json` is gone; same fields, same rules), plus
`game` and `known`. Types: `GameUnitData`, `GameKeyTier`, `KnownUnitData` in `src/data/schema.ts`; `UnitRecord.game` /
`UnitRecord.known` carry them into the app (the simulator uses `game.attack.firstHit` for wind-ups and `game.key` for
Rumble keys; nothing else yet).

| Field | Source |
|---|---|
| `id`, `name`, `color`, `classes`, `stars`, `hp/atk/rcv`, `minStats`, `maxLevel`, `growth`, `sockets` | OPTC-DB `units.js` |
| `families`, `ownFamilies` (VS halves, split by hand in `VS_FAMILY_SPLIT`) | OPTC-DB `families.js` |
| `tags` | OPTC-DB `tags.js` (VS halves: own list) |
| `lb`, `llbTiers` | OPTC-DB `details.js` |
| `specialLevels` | OPTC-DB `cooldowns.js` |
| `keyGroup` (flags.js key tier: used only for units not in the game's data, and for illegal units the game gives no key) | OPTC-DB `flags.js` + rarity |
| `farmable` (free to play: in flags.js with no recruit / limited / TM / Kizuna / PF / Super / Anniversary / shop / promo / special flag, so farmed in Co-op, Pirate King Adventures, raids, story...; 1,814 units, 433 of them 5★ / 5+; the generator's "Free-to-play 5★ and below" build) | OPTC-DB `flags.js` (`farmableOf`, scripts/db/optcdb.ts) |
| `rumble` (the Rumble kit: style, DEF, SPD, cost, abilities, specials, patterns, targeting, GP, LLB, super special) | OPTC-DB `rumble.json` (the kit source) |
| `game.charId` / `serverId` / `logbookId` / `match` | `MstCharacter_.id_` / `serverId_` / `logbookId_`; how the row was found |
| `game.name`, `rarity`, `stats` (max HP/ATK/RCV) | `MstCharacter_` |
| `game.released` (Global release date, YYYY-MM-DD UTC; also in the light index as `released`) | `MstCharacter_.publishTimestamp_` (03:00 UTC the day after the JP-time release); rows with the old 1999 placeholder use `insertTimestamp_`; VS halves take their parent's. The team generator adds units released since Nydato's sheet's oldest tab update |
| `game.unitSize` (1-4; 2 and 3 for most) | `MstCharacter_.unitSize_` (= captures' `unit_size`) |
| `game.comboNum` (hits per attack) | `MstCharacter_.comboNum_` (= captures' `combo`, = units.js `combo`) |
| `game.movementSpeed` (15 for every unit), `motionType` (1 for every unit) | `MstCharacter_.movementSpeed_`, `motionType_` |
| `game.style`, `def`, `spd`, `cost`, `hasRumble` | `piratesStyle_` (0 BAL, 1 ATK, 2 DEF, 3 RCV, 4 SPT, 5 DBF), `piratesDefense_`, `piratesSpeed_`, `piratesDeckCost_`; `piratesActiveSkillId_ > 0` |
| `game.special` `{id, name, cooldowns[level-1], limit}` | `MstPiratesActiveSkill_`, `MstPiratesActiveSkillEffect_.chargeIntervalTime_` per level |
| `game.superSpecialId` | `piratesSuperActiveSkillId_` (text in `game-text.json`) |
| `game.key` (Rumble key tier) | see below |
| `game.motionSsd`, `skillSsd` (file names) | `motion_ssd/motion_manifest.csv` by `serverId`; `[]` = no per-unit `.ssd` |
| `game.attack` `{file, variant, fps, frames, hits, hitsFrom, firstHit, windup}` | the unit's attack `.ssd` decoded by `tools/ssd` (`tools/ssd/out/ssd_timings.csv`, `scripts/db/attack.ts`); see below |
| `known.attackDestination`, `attackDestinationOffset`, `tapDifficulty`, `hitEffect` (`{value, source}`) | battle captures in `data/known/` (16 units so far) |

### Decoded attack (`game.attack`)

From the attack animation of the unit's own `serverId` (`tools/ssd/README.md`): `file` (the `.ssd` used), `variant`
(`sd` = the unit's attack, `evolved` = the evolved form's), `fps` (as written in the file; the game plays attacks at
60), `frames`, `hits` (hit frames), `hitsFrom`, `firstHit` and `windup` = 0.2 + 0.12 + firstHit / 60 s (arrive -> first
damage number, the formula the simulator uses: docs/SIMULATOR.md). 4,161 of 4,668 units have it.

- **File choice** (a serverId can have several files): never a special cut-in (any name with `_skil` or `sikll`:
  `_skill-1`, `_skill_effect`, `_skill_evolved`, `_skil` ..., whatever `batch.py`'s variant column says); the base motion
  before the alternate motions of multi-attack units (`_blow`, `_pile`, `_shot`, `_slash`, `_toy`) and `_nsize`; `sd`
  before `evolved`; files with hits or hit sounds first; then the shortest name, then alphabetical. Only the unit's own
  serverId counts: a VS half or another form without its own file gets nothing (no borrowing from its partner or
  other forms), and the simulator keeps a borrowed profile for it.
- **Hit frames** (`hitsFrom`): `hit` = the `hit` events (2,437 units). `template` (651) = a file with only hit sounds
  whose sound frames match a template: 35/36/44/52 -> hits 32/41/47/51 (validated on Pacifista and Luffy 2087),
  35/36/42/48 -> 33/39/44/47, 35/36/46/56 -> 36/48/54/59 (the hits of the files that have both: 890 of 890, 1,100 of
  1,101, 11 of 11). `sound` (1,073) = the hit-sound frames of other sound-only files, almost all on the frame-15
  family, where sounds and hits share frames in all 917 files that have both.
- **No `attack`** (507 units): 25 not joined to the game, 432 without an extracted attack file (mostly old units), 50
  with only special files or a 54-frame placeholder attack without hits or sounds (34 such files: newest units, e.g.
  Loki 4629, Blackbeard & Kuzan 4522, the VS halves 4218 / 4219 / 4469; the VS halves 3252 / 3253 have no file at all).
- Decoded wind-ups are all 0.57-1.07 s: first hit 15 (1,828 units), 32 (1,305), 33 (976), 36 (24) and 28 others
  (frames 20-45, sound-only files: e.g. Crocodile 384 / 510 at 20, Morgan 35 / Pearl 55 at 40, Street Punks 624 / 625
  at 45).

`game-text.json`: `special` is either the list of level texts or, when the levels differ only in numbers,
`{text, values}` with `{}` where a number changes (`expandLevelText` in `scripts/db/game.ts` gives the list back).

### Rumble key tiers in the game

`MstCharacter_.piratesLimitBreakAbilityId_` -> `MstPiratesLimitBreakAbility_` (`piratesLimitBreakId_` = tier,
`piratesAbilityId_` = the key's ability) -> `MstPiratesLimitBreak_` (stat multipliers, special charge multiplier,
level needed). `characterIdsJson_` is empty for every tier but 2021 (six ids), so it does not assign units; the
per-unit ability id does. The key's damage taken / dealt bonus is an ability against one color or class pair
(`MstPiratesAbility_`, e.g. "Reduce damage taken from DEX by 20%, increase damage dealt to DEX by 20%"): `game.key.vs`.

| Tier | HP / ATK / RCV / DEF / SPD / charge | Taken / dealt | Same numbers as our `KEY_BONUS` |
|---|---|---|---|
| 1000-1004 | +50 / 30 / 30 / 20 / 30 % / -10 % | 20 / 20 | super |
| 1010, 1020, 1030 | +40 / 25 / 25 / 15 / 25 % / -10 % | 20 / 15 | anni, rumbleLegend |
| 1040 | +30 / 20 / 20 / 10 / 20 % / -5 % | 15 / 10 | legend |
| 1050, 1060, 2010 | +30 / 20 / 20 / 10 / 20 % / -5 % | 10 / 5 | tmKizuna, rumbleRR |
| 2020, 2021 | +20 / 15 / 15 / 5 / 15 % / 0 | 10 / 0 | rr |
| 2030, 100000 | +20 / 15 / 15 / 5 / 15 % / 0 | **5** / 0 | none (100000 needs level 99, the rest 120) |

Units without a tier (`game.key: null`) cannot take a Rumble key in the game.

**Used by the app and simulator since 2026-11-17** (`keyTierOf` in `src/engine/stats.ts`, docs/SIMULATOR.md): a unit
with `game.key` gets that tier's numbers, its `vs` pair for damage taken / dealt (not the colors / classes its
resilience names), and its `minLevel`; `game.key: null` = no Rumble key for legal units (illegal ones may force their
flags.js tier); units not joined to the game keep `keyGroup`. Of the 1,289 keyed units, the old rule (resilience)
named the same pair for 639 (with LLB 5 kits), had no damage resilience for 583, overlapped (one of the two classes,
or a class plus the color) for 32 and named something else for 35 (e.g. 1632 Cerebral -> INT, 2245 INT -> PSY, 3708
Fighter -> Striker/Driven).

## How OPTC-DB ids map to the game

- **OPTC-DB id = `MstCharacter_.logbookId_`** (the Character Log number). Not `id_` (internal row id, e.g. Nami
  2939 is `id_` 4134) and not `serverId_` (the asset id used by motion files and battle captures: Nami `serverId_`
  11343). Examples: Pacifista PX-4 = OPTC-DB 971 = logbook 971, `id_` 1094, `serverId_` 1199; Cabaji the Acrobat =
  37 / `id_` 125 / `serverId_` 144; Buggy the Clown = 39 / 40 / 41. (`optc_compile_units.py` keys flags / cooldowns /
  2Shankz kits by `id_`, which is wrong for almost every unit.)
- A logbook match is accepted only when the name (letters and digits) or the max HP/ATK/RCV agree: all 4,555 agree on both.
- **49 units** are numbered differently in Global (`logbookId_` 5009-5068, e.g. OPTC-DB 1923 Silvers Rayleigh = logbook
  5009): joined by exact name + max stats. OPTC-DB will reach id 5009 one day; the verification keeps those apart.
- **VS units** (36 halves): rumble.json `3134.1` / `3134.2` = the parent row's `versusChildCharacterIds_` (serverIds) in
  order; the halves have `logbookId_` -1 and their own Rumble style / DEF / SPD / special. **Dual units** are one Rumble
  unit: the parent row has the Rumble data; `childCharacterIds_` are the two characters (no Rumble data).
- **25 not joined**, all absent from Global: 18 Strong World film units (519-528, 553-560; Global has them as other
  OPTC-DB ids with the same stats, 1114-1212 "Dream Chaser" / "A Pirate Who Lives by His Code"), Kizuna BOOST Luffy 1009,
  and 744, 745, 801, 802, 1414, 2494. They keep `game` undefined.
- Manuals (`... manual`) and other non-units have `logbookId_` -1 and no Rumble data; they never join.
- `data/reports/mapping.md` also lists game units with a Rumble special that OPTC-DB has no Rumble data for yet (5 at
  the pinned commit, all newer than it).

## Update procedure

1. **Check** (cheap: one GitHub API call, a file stat; sakura.db is hashed only if its size or date changed):
   `npm run db:check`. Exit code 0 = up to date, 10 = update available. It compares the newest commit of
   `2Shankz/optc-db.github.io` (master) and `sakura.db` / `motion_manifest.csv` with `data/sources.json`.
2. **New game data** (only when the game updated): pull the shards and decrypt them as in the master_db_tool README
   (`python optc_master_decrypt.py ./shards ./sakura.db`), and re-run its motion extractor for new units if wanted.
   Then decode the attack animations: `python -I tools/ssd/batch.py` (about 5 min) writes `tools/ssd/out/ssd_timings.csv`
   (git-ignored), which the build reads for `game.attack` (path override: `OPTC_SSD_TIMINGS`). Without the CSV (no
   decomp folder on this computer) the build keeps the last build's `game.attack` values, as `--no-game` keeps the
   other game fields; `db:check` reports a changed CSV.
3. **Preview** (optional, changes nothing in `data/`): `npm run db:build -- --out .cache/preview` writes the would-be
   database and `reports/update-*.md` (diff against the current `data/units.json`) to `.cache/preview/`.
4. **Rebuild and verify**: `npm run db:update` = `db:build` (newest OPTC-DB commit + sakura.db, writes `data/`) then
   `db:verify` (`tsc --noEmit -p .`, `npx tsx scripts/check-effects.ts`, `npx vitest run`). Variants:
   `npm run db:build -- --pinned` (keep the OPTC-DB commit, e.g. only sakura.db changed), `-- --ref <sha>` (a given
   commit), `-- --no-game` (no sakura.db on this computer: keeps the last build's game data and text).
5. **Read the reports**: `data/reports/update-<date>-<sha>.md` (new / removed units, per-unit field changes: stats,
   kit, tags, cooldowns, game fields ...), `crosscheck.md` (new disagreements), `mapping.md` (new unjoined units).
   A new VS unit stops the build until its families split is added to `VS_FAMILY_SPLIT` (`scripts/db/optcdb.ts`).
6. **Simulator data check** (optional): `git show HEAD:data/units.json > .cache/old-units.json` then
   `npx tsx scripts/db/compare-loaded.ts .cache/old-units.json data/units.json` lists every unit whose loaded record
   (what the simulator sees, `game` / `known` left out) changed.
7. Commit `data/` (the update report documents what changed).

New battle capture: `npx tsx scripts/db/capture.ts <capture.json>` writes `data/known/capture-<date>.json`; the next
build adds its values to the captured units (`--pinned` to keep everything else as is).

## Cross-check summary (pinned build, OPTC-DB e13b671748 vs sakura.db of 2026-11-11)

All 4,640 joined units agree on name, max HP/ATK/RCV, hits per attack, Rumble style, DEF, SPD, team cost and number
of special levels. Disagreements (`data/reports/crosscheck.md`):

- **Special cooldowns, 9 units**: 932 / 933 Pica (OPTC-DB 25 at every level; game 25 down to 16), 2987 Soba Mask (27 vs
  28), 3048 Jinbe (35 vs 31), 3101 Law Halloween (45 vs 25), 3279 / 3280 Blackbeard (28 vs 33), 3554 / 3555 Kin'emon &
  Denjiro (level 1 31 vs 27).
- **Key tier, 409 units** (the app and simulator use the game's tier since 2026-11-17): 407 are in tiers 2030 / 100000 (rr stats but damage taken -5%, not the -10% of our `rr`):
  378 `rr`, 27 5* `tmKizuna` (e.g. 3365 MUGIWARA 56 Luffy) and 2 6* `legend` (578, 5014); and 2 legends (3175 Oden,
  3177 Roger) are in the game's super tier 1000.
- **No key in the game, 517 units with a Rumble special**: mostly forms before their last evolution (e.g. 3333 Luffy
  before 3334) and old 5* units; our flags rule gives every 4-5* TM/Kizuna unit `tmKizuna`.

## Attack type (`attack_destination`) research

A battle capture (the server's battle-start response, `OPTC Decomp/rumble.json`) gives per character
`attack_destination` (0 / 1 / 2), `attack_destination_offset` (-1.2 to 0.5), `unit_size`, `combo`, `movement_speed`,
`tap_difficulty`, `hit_effect_ssd`, `hit_effect_texture`, `motion_ssd_prefix`, and the structured special (`data_json`).

- `unit_size`, `combo`, `movement_speed` are `MstCharacter_.unitSize_`, `comboNum_`, `movementSpeed_` (equal for all 16).
- **`attack_destination`, its offset, `tap_difficulty` and the hit-effect files are in no table or column of
  sakura.db** (all 260 tables searched by column name and by value), nor in the unpacked APK folders. Like the
  special's `data_json`, they come with the server's own character data in the battle response.
- No column explains them for the 16 captured units: `motionType_` is 1 and `movementSpeed_` 15 everywhere; style,
  class, `characterType_`, `comboNum_`, `unitSize_`, rarity all mix. Same classes and hit kind split too (Dorry 1,
  Broggy 2; Slashers Zoro / Hyouzou / Smoothie 1, Vivi 2). Values: 0 = Nami (weather), Sanji (kick), Loki; 1 = Zoro,
  Hyouzou, Smoothie, Jarul, Dorry; 2 = Jinbe, Luffy & Law, Mihawk & Perona, Luffy (Elbaph), Vivi, Gunko, Broggy, Collun.
- Reading (owner's memory: close-range vs ranged vs something): where the attacker goes to hit, a reference point (0, 1,
  2) plus an offset that looks like tiles (ranges in the battle data are in tiles). It is the main game's attack data
  too (`tap_difficulty`, hit effects are main-game tap-attack fields), which Rumble reuses.
- How the simulator could use it: today a unit stops its timing profile's reach from its target (`src/sim/timing.ts`:
  212 px for Pacifistas and the Buggy crew, 110 for Luffy 2087 / King 3137 / Cabaji, 150 for Robin 4375, Shooter crews
  212-280; units without a reach borrow one). With the data:
  `reach(unit) = BASE_REACH[attackDestination] + attackDestinationOffset * TILE` (`TILE` ~ 93.6 px,
  `src/engine/grid.ts`), with the three bases fitted from videos of units with known values (the 16 here, then the
  Pacifista measurement once their values are known). Nothing in the simulator uses it yet.
- Data needed for every unit: more captures (each battle gives up to 16 units: `scripts/db/capture.ts`), or the
  server's character master. The values now known are in `data/units.json` (`known`, source
  `capture-2026-11-14`, the battle of 2026-11-14 02:16 UTC, `user_pirates_arena_battle_id` 385318673).

## Sync from the game's servers (one command, no phone)

`npm run sync:game` (script: `../OPTC Decomp/rumble-sync/game_sync.py`, outside this repo since 2026-11-25 so the public repo has no game-server tooling; `--help` for options) gets the same data without a phone,
through the decomp folder's online tool (`optc_acquire.py`, run with `py -3.13`; it needs `requests` installed in that
Python). Each run registers a new anonymous game account (the game's own sign-up call, a made-up device id; nothing
of yours is sent) to ask the server for its current resource list, and stops there if that list is the one already
synced (`--force` to redo). Otherwise: download and decrypt the `sakura_master_db_*.db` pieces from the game's
download servers into `<game dir>/sync/server/`, check the new `sakura.db` isn't smaller than the current one, keep
the old one as `sakura.prev.db` -> the same animation / decoder / `npm run db:update` steps as the phone sync ->
`npm run sync:assault` (Assault seasons, rule sets, alternate arts) -> download the box icons of any new alternate
art ("motion" characters, from the `character_face` bundles: signed links in `resources.json`, no account) into
`.cache/art-icons/<art id>.png` and rebuild the portrait index (`npm run portraits`). The synced resource list goes in
`<game dir>/sync_state.json`. Helper tests: `python -I test_game_sync.py` in that folder. The phone sync below stays as
the fallback if the game's sign-up keys change.

## Sync from the phone (one command, fallback)

`npm run sync:phone` (script: `../OPTC Decomp/rumble-sync/phone_sync.py`, `--help` for options) pulls the game's data off a rooted
phone and runs the whole update. Needs: the phone plugged in with USB debugging on and this PC authorized; Magisk
granting root to the ADB shell (Superuser -> Shell -> grant, once; hiding root from the game doesn't affect it); the
game installed, updated and opened once after an update so it has downloaded its data; adb (found on PATH, in `$ADB`,
or the Android SDK's platform-tools).

Steps, each stopping with a plain message on failure: read the game version and stop if it was already synced
(`--force` to redo) -> check root -> wait until the game's cache stops changing -> find `resources.json` and the
`sakura_master_db_*.db` pieces by name under `GNPCACHE` (the subfolder isn't stable; newest copy wins) -> pull them and
check every piece `resources.json` lists (type `sqlite_database`) is there (never decrypts a partial set) -> decrypt and
merge into a new `sakura.db`, check it isn't smaller than the current one, keep the old one as `sakura.prev.db` ->
download new animation files (`optc_extract_motion.py`, only files not already there) -> `tools/ssd/batch.py` ->
`npm run db:update`. Pulled files are kept in `<game dir>/sync/<versionCode>/`; the synced version goes in
`<game dir>/sync_state.json`.

Limits: an animation file that changed for an existing unit isn't re-downloaded (only new files are); per-battle
server data (attack type/offset, the special `data_json`) isn't in the phone's cache and still needs battle captures.
Helper tests: `python -I test_phone_sync.py` in that folder.

