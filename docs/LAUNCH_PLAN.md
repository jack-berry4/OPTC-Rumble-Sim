# Public launch plan (2026-11-25)

Goal: put the simulator on the web for anyone to use, for free, fast on the first visit and instant after that, and
built so a phone version can follow.

## Where the app stands

The app is already a static site, which is what free hosts serve best. It has no server and no accounts. Teams, boxes
and settings live in the visitor's own browser (localStorage). Simulations run in Web Workers on the visitor's own
machine. So hosting costs nothing but file serving.

A production build (`npm run build`, measured 2026-11-25) is **55 MB in about 4,800 files**:

| Piece | Size (as sent, gzip) | When it loads |
|---|---|---|
| Main JS bundle `index-*.js` | 697 KB (203 KB) | first visit |
| CSS | 81 KB (17 KB) | first visit |
| Unit search index `data/units-index.json` | 1.66 MB (199 KB) | first visit |
| Map art (plaza or Assault, webp) + HUD art (png) | ≈ 1.8 MB | first replay |
| Replay code | 93 KB (31 KB) | first replay |
| One unit's detail `data/units/<id>.json` | ≈ 1 KB each | per unit used |
| OPTC-DB Rumble text `rumble-text-*.js` | 6.8 MB (337 KB) | first time the team editor shows a unit's text |
| Screenshot import: OCR engine + English model | 3.9 MB + 5.0 MB (1.5 MB + 3.0 MB) | only when importing a screenshot |
| Unit portraits | from 2Shankz's OPTC-DB site (`UnitThumb.tsx`) | per unit shown |

**A first visit costs about 2.5 MB. A repeat visit should cost almost nothing once caching is set up (Phase 1).**
For 100 GB of bandwidth a month (the cap on Vercel's and GitHub's free tiers), that works out to roughly 40,000 new
visitors.

## Host: Cloudflare Pages (recommended)

| | Cloudflare Pages (free) | Vercel Hobby (free) | GitHub Pages (free) | Netlify (free) |
|---|---|---|---|---|
| Bandwidth | **unlimited** | 100 GB/mo, then the site is paused until the month resets | 100 GB/mo soft cap | credit-based, small |
| Private repo | yes | yes | **no** (Pages on a private repo needs GitHub Pro) | yes |
| Commercial use (ads, donations) | allowed | **not allowed** (Hobby is personal and non-commercial only) | allowed | allowed |
| File limits | 20,000 files, 25 MiB each (we use ≈4,800, largest 6.8 MB) | fine | 1 GB site | fine |
| Builds | 500/mo, 20 min each (ours: ≈1 min) | fine | Actions minutes | 300 min/mo |
| Preview link per branch | yes | yes | no | yes |
| Free analytics | Web Analytics, no cookies | paid add-on | none | paid |
| Global CDN | yes, very large network | yes | yes | yes |

Vercel would work, but for this site it has two drawbacks. If a Reddit post sends a traffic spike, the site gets
switched off for the rest of the month. And any donation link would break its non-commercial rule. Cloudflare Pages
has neither problem and costs the same $0. GitHub Pages is out while the repo is private.

How the deploy works: connect the GitHub repo to Cloudflare Pages once in the Cloudflare dashboard (build command
`npm run build`, output `dist`, Node 22). After that, every push to `main` goes live automatically, and every other
branch (`sprites`, `labeler`, …) gets its own private-ish preview URL. Nothing about the build needs secrets.
`public/data/` is regenerated in the build from the committed `data/units.json`, and `VITE_DEV_EXTRAS` is unset there,
so the developer-only teams stay off.

## Phase 1: make the hosted site fast and robust (before launch)

Status 2026-11-25:
- Items 1 to 4, 6 and 7 are done. The main bundle went from 203 KB to 131 KB gzip, and the unit index is preloaded.
- Still to do: moving the import dialog out of the main bundle (BoxesPage still imports it directly), and item 5.
- Item 6 is missing the `og:image` link preview. It needs the site's final address and a screenshot.

1. **Long caching for everything with a hash.**
   - Add a `public/_headers` file (Cloudflare's format).
   - `/assets/*` (Vite gives these hashed names) get `Cache-Control: public, max-age=31536000, immutable`.
   - Repeat visits then load the app with zero requests for code.
2. **Version the unit data so it can be cached the same way.**
   - The problem: `data/units-index.json` and the 4,672 `data/units/<id>.json` files keep the same name across updates.
     Today the browser has to ask "has this changed?" for each one on every visit.
   - The fix: `scripts/db/split.ts` writes them under `data/<hash of units.json>/`, and the app reads that folder name
     from the build.
   - Then they get the same one-year cache, and a units.json update simply uses a new folder.
   - The `game/*.json` and `game-art/`, `game-ui/` files get a shorter cache, a day with revalidation, since they
     rarely change.
3. **Survive a deploy while someone has the page open.**
   - The problem: after a new deploy, the old hashed chunks are gone. A visitor on the old page who opens the replay
     or the import gets "failed to fetch module".
   - The fix: listen for Vite's `vite:preloadError` and reload the page once. This is the standard fix.
4. **Trim the first load.**
   - Move the 230 KB `rumble-meta.json` (the Generator's meta) out of the main bundle, loading it when the Generator
     opens.
   - Split the Generator, Boxes and Import pages into their own chunks.
   - Target: under 150 KB gzip of JS before the first screen.
5. **Compress the OCR model.**
   - Cloudflare doesn't compress unknown file types, so `eng.traineddata` goes out as the full 5 MB.
   - Ship it gzipped. tesseract.js reads `.traineddata.gz` itself, so only the 3 MB version is ever sent.
6. **Page basics a public site needs.**
   - A favicon and app icon.
   - A meta description and a link-preview image for Discord, Reddit and Twitter.
   - A short About/credits panel and footer with:
     - "Fan-made, not affiliated with Bandai Namco".
     - Game art © Bandai Namco.
     - Unit data from OPTC-DB (GPL-3.0), via 2Shankz's fork.
     - Thanks to Nydato.
     - A link for bug reports.
     - A note that all data stays in your browser.
7. **CI check.**
   - A GitHub Actions workflow runs `npm test` and the typecheck on every push.
   - A broken push still deploys, but you'd see a red X.
   - This could be made a deploy gate later.
8. **Check a clean Linux build.**
   - The lockfile already has the Linux packages (esbuild, TypeScript 7).
   - The first Cloudflare build confirms it works. Its build log is the proof.

Kept as is:
- The simulation engine. It already runs in Workers sized to the CPU's core count.
- The existing code-splitting: Replay, OCR and Rumble text already load on demand.

## Phase 2: launch

1. You create a free Cloudflare account and connect the GitHub repo in the dashboard (Workers & Pages → Create →
   Pages → Connect to Git). I can walk you through it in the browser pane. The sign-in and the GitHub permission grant
   are yours to click.
2. The first deploy gets a `*.pages.dev` URL. I check it from the outside:
   - every page and the replay
   - loading a unit's detail
   - a win-rate run
   - the screenshot import
   - cache headers
   - a Lighthouse-style load check
   - the console
3. Optional: point a custom domain at it (≈ $10/yr at Cloudflare's registrar, at cost).
4. Optional: turn on Cloudflare Web Analytics (free, no cookies, no consent banner needed).
5. Share it.

## Keeping the site up to date (built 2026-11-25)

What is built:
- **The weekly job:** `.github/workflows/data-update.yml`. It covers OPTC-DB only. Nydato's sheet stays a PC step
  (2026-11-26), because Google won't serve the sheet's portrait images to GitHub's servers.
- **The publish step:** step 5 of `Sync Data.bat`.
- **Game-server scripts moved out:** they are now in `../OPTC Decomp/rumble-sync/`, which has its own local git
  history.
- **Data dates:** shown in the footer.
- **No local paths in the data:** `data/sources.json` now stores paths relative to the repo, so your own folder names
  aren't in the public data.

Everything stays free:
- GitHub Actions is unlimited for public repos (2,000 minutes a month while private). One run takes a few minutes.
- Cloudflare allows 500 builds a month. We'd use a few a week.

The weekly job needs one setting in the public repo, Settings → Actions → General → "Allow GitHub Actions to create and
approve pull requests". It can only be tested after it is pushed. Use "Run workflow" on the Actions tab.


The live site is whatever is on `main`. Every data source already ends in files committed to the repo, so publishing
new data is always the same three steps:
1. Sync.
2. Commit and push.
3. Cloudflare rebuilds, about 2 minutes.

Visitors get the new data on their next page load. The versioned data folder means no one is left with a stale cache.
A page that is already open keeps its data until it is reloaded.

| Source | What it updates | Needs | Where it can run |
|---|---|---|---|
| 2Shankz OPTC-DB (`db:check`, `db:update`) | `data/units.json` (new units, kit fixes) | network only (`build.ts --no-game` keeps the last game data) | GitHub Actions or this PC |
| Nydato's sheet (`sync:nydato`) | `src/engine/nydato-comps.json` (default teams, generator templates) | network only, but Google refuses GitHub's servers the sheet's portrait images | this PC (`Sync Data.bat`) |
| Game servers (`sync:game`, phone fallback) | game data in units.json, `public/game/*.json` (rules, Assault seasons), portraits | the OPTC Decomp tools and assets (4 GB, decryption) | this PC only |
| Own meta run (`scripts/meta`) | `src/engine/rumble-meta.json` | hours of compute | a fast PC |

Proposal:
1. **Scheduled pull request for OPTC-DB.**
   - A GitHub Actions job runs weekly, and can also be started by hand.
   - It syncs OPTC-DB and runs the checks and tests. Nydato's sheet is left to `Sync Data.bat`.
   - If anything changed, it opens a pull request with `data/reports/` in the description.
   - Cloudflare builds that branch into a preview link, so the new data can be tried before it goes live.
   - Merging the pull request publishes it.
   - Nothing reaches the live site without someone merging it: a bad upstream edit can't break the site on its own.
2. **Game data stays a PC job.**
   - `Sync Data.bat` stays as it is.
   - A new step at the end shows what changed and asks "Publish to the website? (y/n)". On yes, it commits the data
     files only and pushes. That one click is the go-ahead.
3. **The public repo leaves out the game-server tooling.**
   - `scripts/sync/game_sync.py` and `phone_sync.py` register anonymous game accounts and decrypt the master data.
   - They move into the private `OPTC Decomp` folder next to the tools they drive. `Sync Data.bat` calls them there.
   - The one repo can then be public, with no second private copy to keep in step.
   - Everything they produce is plain data files, which stay in the repo.
4. **A footer line saying when the data is from**, for example "Units: OPTC-DB Nov 23 · Game data: Nov 19 · Meta teams:
   Nov 24", built from `data/sources.json`. Players can see how fresh it is.

## Next steps (as of 2026-11-25)

1. Done: pushed, and CI passes.
2. Done: Cloudflare account created (2026-11-25).
3. Done 2026-11-26: the public repo `jack-berry4/OPTC-Rumble-Sim` was created from one fresh commit.
   - It has the GPL-3.0 license, the player README and the docs made generic.
   - The old private repo is now `OPTC-Rumble-Sim-archive`. This folder's `origin` is the public repo and `archive`
     is the private one.
   - Commits use GitHub's no-reply address.
   - The Actions pull-request setting is on.
4. **Connect Cloudflare Pages to the public repo:**
   - Project name `optc-rumble-sim`, which gives the address optc-rumble-sim.pages.dev.
   - Build command `npm run build`, output folder `dist`.
5. **Check the live site:**
   - every page, a replay, a win rate, the import
   - cache headers, load speed, the console
   - then add the `og:image` link preview with the real address
6. **Run the weekly data job once by hand** and merge its pull request if it opened one.
7. **Optional:** Cloudflare Web Analytics.
8. **Share it.**
9. **After launch:** Phase 3 (the phone version), then share links.

## Phase 3: phone version (after launch)

The CSS is desktop-first today:
- A handful of `max-width` breakpoints (640/760/900/1100 px).
- The side panel is hidden under 900 px.
- The replay field is sized from the window height.

Plan:
1. Go through every page at 375×812 in the browser pane and list what breaks.
2. Navigation becomes a bottom tab bar on narrow screens.
3. The replay field fills the width, and the Log/HP/Stats/Buffs sidebar becomes a swipe-up sheet under it.
4. Anything that only shows on hover (buff popups, `title` tooltips) also opens on tap.
5. Touch targets are at least 44 px.
6. Phones run hot: win-rate runs pick a smaller default battle count, and a stop button stays reachable.
7. PWA:
   - A web manifest and a service worker (`vite-plugin-pwa`), so the site installs to the home screen.
   - It opens instantly and works offline.
   - It is all static, so this is easy once Phase 1's versioned data is in.

## Later, worth considering

- **Share links:** put a team or a matchup in the URL (compressed into the `#hash`), so people can post a sim result
  and others open the same battle. It is the feature most likely to spread the site.
- **Self-hosting the portraits** instead of loading them from 2Shankz's site. This means about 4,700 small images,
  within the file limit. It removes a dependency on another person's site and its bandwidth.
- **Ads or a donation link:** fine on Cloudflare. On Vercel it would mean the Pro plan.

## Decisions (user, 2026-11-25)

1. **Host:** Cloudflare Pages.
2. **Game art:** ships as it is now, with the "fan-made, not affiliated with Bandai Namco" disclaimer.
3. **License:** GPL-3.0. The repo goes public at launch.
   - Before it goes public, the tracked files need a check for private details. A 2026-11-25 scan found no keys,
     passwords or hostnames.
   - The git history is 1.37 GB, mostly old copies of `data/units.json`.
   - The public repo starts from a single fresh commit, made right before publishing (user, 2026-11-25). It is
     smaller and holds nothing from the private days.
4. **Address:** the free `*.pages.dev` name for now. A custom domain can come later.
5. Analytics: not decided yet. The default is Cloudflare Web Analytics, which is cookie-free.

Sources (checked 2026-11-25):
[Vercel Hobby plan](https://vercel.com/docs/plans/hobby) ·
[Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines) ·
[Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits) ·
[Cloudflare Pages file-limit changelog](https://developers.cloudflare.com/changelog/2026-01-23-pages-file-limit-increase/) ·
[GitHub Pages limits](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/github-pages-limits) ·
[GitHub plans](https://docs.github.com/en/enterprise-server@3.17/get-started/learning-about-github/githubs-plans)
