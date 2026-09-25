<p align="center">
  <img src="assets/images/logo-with-wordmark.png" alt="Cannons & Coastlines" width="400">
</p>

<p align="center">
  A physical tabletop naval conquest game for 2–20 players.<br>
  No dice. No grid. Just skill.
</p>

---

> **Development Notice:** This game is in early development. Rules, factions, and balance are subject to change. Preview images are concept art and are AI generated.

## About

Cannons & Coastlines is a 3D-printable tabletop game. Ships roll on built-in wheels across any flat surface, cannons actually fire projectiles, and you fight over islands for treasure and territory.

- **Free movement:** no grid, no spaces. Push your ships wherever you want
- **Physical cannons:** 3D-printed snap cannons that shoot across the table
- **Island capture:** plant flags, collect treasure coins, set up gun emplacements
- **Coin economy:** spend treasure for repairs, extra speed, boarding actions, and more
- **2–20 players:** 1v1 duels or massive free-for-alls (30–90 minutes, age 12+)

## Base Game Factions

| Faction | Ships | Fittings | Cannons | Playstyle |
|---------|-------|----------|---------|-----------|
| **Queen's Fleet** | 3 Frigates | 4 each | 3 broadside / side | Well-rounded, 180° pivots |
| **Corsairs** | 4 Sloops | 3 each | 3 broadside / side | Fast raiders, hit-and-run |

Additional factions (Treasure Fleet, Stone Fleet, Shadow Fleet, The Industry, The Islanders) are available as add-ons.

## Downloads

> **Early Development:** All downloads are early development versions only and have a long way to go. Rules, balance, and files are actively changing. Use at your own risk and expect rough edges.

### Rulebook

- [Rulebook (PDF)](rulebook/pdf/rulebook.pdf): portrait half-letter, for reading on screen
- [Rulebook booklet imposition (PDF)](rulebook/pdf/rulebook-booklet.pdf): two pages per landscape letter sheet. Print double-sided (flip on short edge), fold and saddle-stitch.

### Faction Cards

| Faction | PDF |
|---------|-----|
| Queen's Fleet | [PDF](rulebook/pdf/faction-card-queens-fleet.pdf) |
| Corsairs | [PDF](rulebook/pdf/faction-card-corsairs.pdf) |
| Treasure Fleet | [PDF](rulebook/pdf/faction-card-treasure-fleet.pdf) |
| Stone Fleet | [PDF](rulebook/pdf/faction-card-stone-fleet.pdf) |
| Shadow Fleet | [PDF](rulebook/pdf/faction-card-shadow-fleet.pdf) |
| The Industry | [PDF](rulebook/pdf/faction-card-the-industry.pdf) |
| The Islanders | [PDF](rulebook/pdf/faction-card-the-islanders.pdf) |

## Repository Contents

```
assets/
├── icons/          # Game action icons (SVG)
├── images/         # Logo, branding, and Blender part renders
├── playtesting/    # Photos and videos from playtest sessions
├── ships/          # Faction ship previews (renders/ is the Blender output)
└── stls/           # Free 3D-printable sets, plus the released zips
paid-sets/          # Paid sets, staged locally (gitignored, never published)
rulebook/           # Typst sources (typst/), plus built pdf/ and png/
nuxt-site/          # The website (Nuxt, deployed to Cloudflare Workers)
└── public/game/    # Static HTML easter-egg game (triggered by typing "fire")
scripts/            # Every build step; see `npx jake -T`
├── lib/common.sh   # Shared paths, Typst invocation, PDF compression
├── rulebook/       # Rulebook, booklet, faction-card and imposition builds
├── blender/        # STL render pipeline
└── print/          # OrcaSlicer 3MF generation for print orders
tools/bitty-cad/    # In-browser CAD scratchpad
Jakefile.js         # Build orchestrator, the entry point for every step
build.sh            # Nuxt/Workers build, invoked by wrangler.jsonc
```

## Building

Everything is driven by [jake](https://jakejs.com/); `npx jake -T` lists every
step with a one-line description.

```bash
npm install                       # once, for jake itself
TYPST=~/.local/bin/typst npx jake # full build: STLs, rulebook, cards, site
npx jake rulebook                 # or just one step
```

`jake site` runs `build.sh`, which builds `nuxt-site/.output/`, the artifact
`wrangler deploy` publishes. The rulebook/faction-card PDFs and PNGs, the ship
renders, and the STL zip are all committed, so a deploy doesn't need Typst or
Blender.

## STL sets

Free sets live in `assets/stls/`; `base-set/` is there and its zip is
committed. Paid sets live in `paid-sets/`, deliberately **outside** `assets/`:
the site symlinks `nuxt-site/public/assets` at that tree, so anything under it
is published as a static asset and downloadable by anyone. Keeping paid models
out of git is a separate problem from keeping them off the web, and only the
directory location solves the second. `build.sh` refuses to build if a paid set
turns up under `assets/`.

Paid models are uploaded to R2 with `npx jake publish-sets` and served only
through `/api/download/<set>` after an entitlement check. Every set folder
carries a `set.json` with its version of record, kept in step with the site
manifest at `nuxt-site/server/data/sets.json`.

Cutting a new version of a set is one command:

```sh
npx jake "bump-set[base-set,0.4]"      # add --dry-run to see the plan first
```

It writes the version into `set.json`, syncs the site manifest and rebuilds
the public zip. The zip's filename carries no version
(`cannons-and-coastlines-base-set.zip`, with a versioned folder inside), so
the download URL never changes and nothing needs redirecting. Paid sets stop after the manifest
and go to R2 via `publish-sets`. Don't edit `version` by hand: the build
scripts refuse to package anything while `set.json` and the site manifest
disagree.

## The 3D ship previews

The shop's 3D view builds every ship from one file,
`nuxt-site/shared/data/ship-assemblies.json`: which part goes in which socket,
where (in the hull STL's own millimetres), facing which way, and in which
filament. Fix a placement there and the site follows; the file's header
explains the coordinate system and fields.

The browser loads decimated meshes from `assets/previews/`, built from the
source STLs with `npx jake preview-meshes` (needs Blender). Paid hulls have no
public STL, so their preview mesh is the only form of them the site serves.

The web game at `/game/` draws its table with the same models, through the
same code (`nuxt-site/app/lib/shipAssembly.ts` and `seaScene.ts`). Its 3D
view is `nuxt-site/app/lib/game3d.ts`, bundled into the generated
`public/game/game3d.js` by `npm run game3d` (also run by `npm run dev` and
`npm run build`; use `npm run game3d:watch` while working on it). The game's
rules, AI and online play stay in the plain scripts beside it, and
`public/game/view3d.js` connects the two. Add `?2d` to the game's URL for the
old top-down view, which is also what browsers without WebGL get.

The game loads a lighter mesh set, `assets/previews/game/` (same paths, about
a quarter of the triangles), built alongside the shop's by the same
`preview-meshes` task; only the fastest desktops get the full set. It picks a
graphics level for the device (resolution, ambient occlusion, see-through
PETG, a 30 fps cap on the lowest two) and keeps adjusting it to the measured
frame rate. The game menu can pin it to high or fast instead.

## Community

Join the [Discord community](https://discord.gg/DMuFEWJtZq) to get notified about launches, new files, and playtesting opportunities.

## License

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You are free to share and adapt this material for non-commercial purposes, with attribution, under the same license. See [LICENSE](LICENSE) for details.
