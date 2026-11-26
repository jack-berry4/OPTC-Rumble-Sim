# OPTC Rumble Sim: Design

## Goal

A simulator for One Piece Treasure Cruise's Pirate Rumble mode. Rumble is RNG-heavy, so the core output is
probabilities, not single outcomes.

### End-state features
1. **Win rates.** Run thousands of battles between two specific teams (with specific unit levels: special lv,
   ability lv, GP lv, LLB, etc.) and report win rate and supporting stats.
2. **Battle stepper.** Step through one battle tick by tick. See every random event, how likely each outcome was,
   and force a specific outcome to explore "what if" branches.
3. **Team comparison.** Compare two candidate teams against the same opponent.
4. **Team optimizer.** Search for the best team or arrangement against a given defense or meta.
5. **Inspector.** Live numbers: damage per hit, special/GP cooldowns remaining, buff/debuff timers, and so on.

### Version 1 scope
- Team vs team, real-time battle on a field with **positions, movement, ranges, timers, and ticks**, like the game.
- Random decisions are rolled randomly (but already logged and forceable; see the RNG section).
- Behavior does not need to be exact yet. Accuracy gets tightened in later versions.
- Runs as a web app (GitHub Pages once the repo is public). A desktop/Node runner for heavy batch sims may come later.

## Architecture

```
src/
  sim/          The battle simulator (v3, docs/SIMULATOR.md): pure TypeScript, no DOM, so it runs in the browser,
                a Web Worker or Node. battle.ts (the battle), rand.ts (random streams), timing.ts (animation
                times), simulate.ts (win-rate runs), spec.ts, types.ts, nodeDb.ts (database for Node), fixtures/.
  engine/       Team building shared by the app and the simulator: types.ts, stats.ts (stat formulas, keys, LLB),
                team.ts (cost, duplicate / family rule), teamCode.ts (RS1 team codes), rules.ts (global rules),
                grid.ts (field tiles), defaultTeams.ts (the recorded test-run teams, Nydato's comps from
                nydato-comps.json), gp.ts (Grand Party), assault.ts (Assault Rumble score), boss.ts (bosses),
                generator.ts (team generator search), meta.ts (the meta run's relevant units and comps from
                rumble-meta.json: the generator's starting points, docs/META_PLAN.md), themes.ts (kit links: the
                groups a unit's kit buffs / counts on / needs; themed teams; the generator's two-unit changes and
                kicks), gameKit.ts (Assault bosses from the game data: kits from its
                JSON / text, stats, rules), gameRules.ts (Pirate Rumble stage rules from the game data).
  data/         Unit database: the resolver, custom units, effect text; unitDb.ts (the browser loader: a light
                index up front, each unit's detail on demand), split.ts (the index / detail shapes).
  import/       Screenshot / video import: screens.ts (game frame, screen kinds, unit places), portraits.ts (portrait
                matching against public/import/portraits.bin), read.ts, screenRefs.json.
  ui/           React components of the app (team editor, team library, replay viewer, win rates).
  App.tsx, main.tsx, sim.worker.ts   The app; win-rate runs are split over several Web Workers.
data/           units.json (built by scripts/db/, docs/DATABASE.md) and its build inputs and reports.
public/         The game art the app draws (game-art/ built by scripts/build_field_art.py, game-art/assault/ by
                scripts/build_assault_art.py, game-ui/) and the split database (data/, generated, ignored).
scripts/        db/ (unit database build and checks; split.ts writes public/data/ before dev / build), check-effects.ts,
                sensitivity.ts, sim.ts (command-line battles), import-rumble-text.ts, build_field_art.py, build_assault_art.py,
                portraits/ (thumbs.py: OPTC-DB thumbnails + portrait features; screen_refs.py), sync/nydato_sheet.py
                (Nydato's Rumble Sheet comps -> src/engine/nydato-comps.json; the game-server syncs live in
                ../OPTC Decomp/rumble-sync/, out of this repo), db/assault.py (the game's Assault
                Rumble seasons and Pirate Rumble stage rules -> public/game/), meta/ (the meta run: run.ts, pool.ts,
                stage1.ts unit screen, stage2.ts league, themes.ts, stage3.ts subs, assault.ts, export.ts ->
                src/engine/rumble-meta.json; docs/META_PLAN.md).
tools/ssd/      Decoder for the game's .ssd attack animations (attack timings in the database).
docs/           This file, MECHANICS.md (the rules), SIMULATOR.md + SIMULATOR_HANDOFF.md (the simulator), and the
                rest (DATABASE, TAGS, SENSITIVITY, EFFECT_CHECK, HISTORY).
Start Simulator.bat, Sync Data.bat   Double-click starters: the app; the phone + OPTC-DB + Nydato's sheet sync.
```

Keeping the simulator free of UI code lets the batch runners (Web Workers, `scripts/`) reuse it unchanged.

### Randomness (`src/sim/rand.ts`)
One main seed; separate streams for specials, timing and attack dice, and every draw is addressed by what it is (unit,
use number, effect, target), never by when it happens. So the same seed gives the same battle, changing one stream
leaves the others untouched, and a forced draw doesn't reshuffle later ones. Draws can be recorded with their
probabilities (`recordDraws`) and forced (`force`), the base for the stepper and likelihood views.

### Unit data (`src/data/`)
- The unit database is `data/units.json`, built by `scripts/db/` from OPTC-DB (2Shankz fork, the most up to date) at a
  pinned commit plus the game's own master data (sakura.db). See [DATABASE.md](DATABASE.md).
- `rumble.json` already encodes Rumble style, DEF, SPD, abilities, specials (10 levels), GP abilities/specials,
  action patterns, targeting and resilience in a structured schema (`src/data/schema.ts`). HP/ATK/RCV come from `units.js`.
- OPTC-DB stores later levels as overrides of level 1. `resolve.ts` flattens them into complete per-level effects.
- **Custom units:** drop a JSON file into `src/data/custom/` with the same shape (see `CustomUnitFile` in
  `unitDb.ts`). Custom units override imported ones with the same ID. Use this for units newer than the
  OPTC-DB data or to correct mistakes.
- Later: tooling to convert ability/special text into this structure for new units.
- **In the browser** the app doesn't bundle the 10 MB database. `scripts/db/split.ts` (run before `npm run dev` and
  `npm run build`, and again whenever the database, `src/data/` or the potential list changes) writes
  `public/data/<v>/units-index.json` (a light record per unit: name, color, classes, families, tags, cost ... for
  search, the team rules and lists) and `public/data/<v>/units/<id>.json` (the rest: kit, stats, Limit Break, game
  data). `<v>` is a hash of the output, named in `public/data/version.json`; the build bakes it in (`__DATA_VERSION__`,
  vite.config.ts, which also preloads the index), the dev server reads version.json. So the hosted files never change
  under one URL and are cached for a year (`public/_headers`). The app loads the index first and a unit's detail when
  it's on a team or in Recent; a battle or win rate waits for both teams' detail. Node scripts and tests use the full
  database (`loadNodeDb`).
- **Hosting** (docs/LAUNCH_PLAN.md): a static site on Cloudflare Pages. `public/_headers` sets the caching; the
  Generator, the screenshot import and the simulator load as their own chunks after the first screen; a reload follows
  a failed chunk load after a new deploy (`src/main.tsx`). CI (`.github/workflows/ci.yml`) runs typecheck, tests and
  build.

### Battle maps (replay background)
- Pirate Rumble and Grand Party: the market plaza (`scripts/build_field_art.py` → `public/game-art/plaza/`), rendered
  from the game's own layout file (`pirates_arena_cpu_near_01.ssd`, VE_PiratesArenaMap bundle) since 2026-11-25: the
  cells in the game's draw order as layers, the crowd groups and torches swapping poses / flames on its 0.4 s loop.
  Placed by a fit to the earlier hand-measured plaza (residual 0.26 px), which was fit to test runs 1-7.
- Assault Rumble (user, 2026-11-25): the lava field every season uses (`MstAssaultRumbleEvent_` names
  `assaultrumble_arena_map_01` for all 22 seasons). `scripts/build_assault_art.py` renders the game's own layer files
  (SpriteStudio `.ssd` far / near layers and their six atlases, from the `VE_AssaultRumble` bundle) into
  `public/game-art/assault/`: the far and near layers as still images plus their lava strips, which flow along
  themselves on the game's loops (21.3 s far, 5.3 s near). Placed by fitting the render to the Assault recordings'
  first clear frame (scale 1.057, rotation 0); the script's header has the measurements. The thorn vines, lights and
  the screen layer's sparks / ash aren't animated.
- `scripts/game_ssd.py` reads the layout files and draws their cells for both builds.
- `FieldBackdrop` picks the map by the battle's mode; the View menu's "Stop background animation" freezes the crowd
  and the lava.

### Battle HUD (`src/ui/GameHud.tsx`, art in `public/game-ui/`)
- The pbattle_* pieces are the same in the English and Japanese clients (checked 2026-11-25). The end banner uses the
  English client's MATCH SET!! logo on its scroll (`BattleEnd.tsx`; it used to write "BATTLE OVER!!").
- Assault Rumble (2026-11-25, measured on the Assault recordings): the main boss (`UnitSummary.mainBoss`) has the long
  HP / special gauges with the BOSS label left of them; its NEXT places get the BOSS tile (reaching over the field's
  edge); the Damage Score (`Frame.score`: all damage to the bosses so far) shows bottom left / right in the game's
  label and score digits. The Auto camera toggle, the pause badge and the event feed move up above it.

### Sprite field: on branch `sprites` only (user, 2026-11-25)
- The units' real in-game animations on the field instead of portrait cards (work in progress) live on the git branch
  `sprites`: the replay's "Animated sprites" option, the canvas layer (`src/ui/FieldBattleCanvas.tsx`), the sprite
  player (`src/anim/`, with its `?animtest` dev page), the bake script (`scripts/anim/bake.py`) and the baked
  animations (`public/anim/`, about 24 MB). main has none of it: the field is the portrait cards only. The field SVG
  (z-index 1) holds everything below the HUD; the HUD (timer, counts, the "SPECIAL ACTIVATED!" plate, banners, end
  screen), the event feed and the pause badge sit above it (z-index 2).

## Simulation approach

**Fixed time step.** The battle advances in 1/30 s ticks (`TICK` in `src/sim/battle.ts`); movement is worked out from
start and end points rather than stepped, and nothing is allocated per tick, so a battle takes well under a
millisecond per second of battle time. The rules are continuous and interlocking (positions decide targets, queue
gauges fill at SPD per second, picks come on a 1.526 s beat, special bars charge in real time, effects expire
mid-action); a fixed step handles all of that with one simple loop. A turn-based abstraction would throw away the
positions the targeting rules depend on.

**Engine, recording, display are separate layers.**
- The simulator (`src/sim/battle.ts`) only knows rules and numbers.
- A single battle can record *frames* (positions, HP, charge, queue gauge, buffs, statuses, current target), a
  readable event log and every random draw. Win-rate runs turn them off for speed.
- The UI only reads frames, so display changes never touch the rules.

**Assumed and roughly measured numbers live in one place** (`TUNE` and `QUEUE` in `src/sim/battle.ts`, tagged
[C] confirmed, [M] measured, [L] likely, [A] assumed), so they can be varied (`scripts/sensitivity.ts`) and fitted to
recorded battles without code changes.

## Roadmap
- [x] v0.1 Project scaffold, RNG/decision log, OPTC-DB import
- [x] v0.2 Battle engine v1: field, movement, targeting, normal/power/full attacks, heals, specials, abilities, win condition
- [x] v0.3 UI: pick two teams, run one battle with a visual replay and event log, run N battles for a win rate
- [x] Simulator v3 (2026-11-11), rebuilt from docs/SIMULATOR_HANDOFF.md; the old engine removed 2026-11-17
- [ ] v0.4 Accuracy pass against recorded battles (Test Runs videos; the labeler on the `labeler` branch and the decoded animations)
- [ ] v0.5 Battle stepper with forced decisions and outcome probabilities
- [x] Game modes (2026-11-22): Grand Party, Assault Rumble (bosses, score), team generator, screenshot / video import
      (docs/PLAN_MODES.md)
- [ ] Later: Assault boss teams straight from the game data (kits from its JSON / text), numbers from screenshots
      (levels, cotton candy, stats), text-to-effect converter, GitHub Pages deploy

## Data licensing note
OPTC-DB is GPL-licensed. Before the repo goes public, check that bundling its data is compatible with how we
license this project (simplest: license this project GPL as well).
