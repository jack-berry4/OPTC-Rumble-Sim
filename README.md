# OPTC Rumble Sim

A battle simulator for Pirate Rumble and Assault Rumble in One Piece Treasure Cruise. It runs in your browser at
**https://optc-rumble-sim.pages.dev**.

- **Build both teams** from every unit in the game, with their real Rumble kits, levels, Limit Break, cotton candy,
  potentials and Rumble keys.
- **Watch a battle play out** on the game's own map and HUD, step by step, with every buff, debuff and special.
- **Run a win rate** over thousands of battles to compare teams, builds and orders.
- **Import from the game**: Confirm Opponent and team screenshots, unit pages, or a screen recording of your whole box.
- **Generate teams** from the units you own, ranked against the current meta.

Everything runs on your own device. Your teams, boxes and settings stay in your browser, and screenshots and videos
are read locally. Nothing is uploaded.

Fan-made and not affiliated with or endorsed by Bandai Namco Entertainment. ONE PIECE © Eiichiro Oda / Shueisha,
Toei Animation. Game art from ONE PIECE Treasure Cruise © Bandai Namco Entertainment.

## Found a bug or a wrong mechanic?

Open an issue. A short screen recording of the game showing what really happens helps the most: the simulator's
mechanics are measured from footage ([docs/MECHANICS.md](docs/MECHANICS.md)).

## Running it yourself

Requires Node 22.

```bash
npm install
npm run dev          # the app at http://localhost:5173
npm test             # tests
npm run build        # production build into dist/
npm run sim          # command-line battle + win rate (scripts/sim.ts has the options)
npm run db:check     # is a unit-database update needed? (docs/DATABASE.md)
npm run db:update    # rebuild data/units.json from OPTC-DB, then run the checks
npm run sync:nydato  # Nydato's Rumble Sheet: the default teams and the generator's templates
```

On Windows, `Start Simulator.bat` starts the app.

`.env.local` (git-ignored) switches on parts that aren't on the public site: `VITE_GRAND_PARTY=1` for the unfinished
Grand Party mode (src/features.ts), `VITE_DEV_EXTRAS=1` for the recorded test runs' teams (src/devExtras.ts).
Restart `npm run dev` after changing it.

## How it's built

- `src/sim/` is the battle simulator ([docs/SIMULATOR.md](docs/SIMULATOR.md)). `src/engine/` handles team building,
  stats and rules, `src/data/` loads the unit database, and `src/ui/` plus `src/App.tsx` are the app.
- `data/units.json` is the unit database, built by `scripts/db/` ([docs/DATABASE.md](docs/DATABASE.md)) from OPTC-DB
  and the game's own data.
- `src/import/` holds the screenshot and box-video import ([docs/IMPORT_PLAN.md](docs/IMPORT_PLAN.md)).
- Game modes and the team generator: [docs/PLAN_MODES.md](docs/PLAN_MODES.md). The Assault Rumble boss data is in
  [docs/ASSAULT_DATA.md](docs/ASSAULT_DATA.md).
- The meta the generator ranks against comes from a long simulation run ([docs/META_PLAN.md](docs/META_PLAN.md),
  `scripts/meta/`).
- Hosting and data updates: [docs/LAUNCH_PLAN.md](docs/LAUNCH_PLAN.md). The site is a static build on Cloudflare
  Pages. A weekly GitHub job proposes OPTC-DB and sheet updates as pull requests.
- The overall design is in [docs/DESIGN.md](docs/DESIGN.md).

## Credits and license

- Unit data: [OPTC-DB](https://github.com/2Shankz/optc-db.github.io) (GPL-3.0), via 2Shankz's fork.
- Meta team comps: Nydato's Rumble Sheet.

This project is licensed under the GNU General Public License v3.0 ([LICENSE](LICENSE)). That covers the code and
the data derived from OPTC-DB. It doesn't cover the game's art, which belongs to Bandai Namco and is used here as a fan
tool.
