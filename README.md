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

Additional factions (Treasure Fleet, Sun Fleet, Shadow Fleet, The Industry, The Islanders) are available as add-ons.

## Downloads

> **Early Development:** All downloads are early development versions only and have a long way to go. Rules, balance, and files are actively changing. Use at your own risk and expect rough edges.

### Rulebook

- [Rulebook (PDF)](rulebook/pdf/rulebook.pdf) — portrait half-letter, read on screen
- [Rulebook — Booklet Imposition (PDF)](rulebook/pdf/rulebook-booklet.pdf) — two pages per landscape letter sheet; print double-sided (flip on short edge), fold, saddle-stitch

### Faction Cards

| Faction | PDF |
|---------|-----|
| Queen's Fleet | [PDF](rulebook/pdf/faction-card-queens-fleet.pdf) |
| Corsairs | [PDF](rulebook/pdf/faction-card-corsairs.pdf) |
| Treasure Fleet | [PDF](rulebook/pdf/faction-card-treasure-fleet.pdf) |
| Sun Fleet | [PDF](rulebook/pdf/faction-card-sun-fleet.pdf) |
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
└── stls/           # 3D-printable parts, one folder per set, plus released zips
rulebook/           # Typst sources (typst/), plus built pdf/ and png/
nuxt-site/          # The website (Nuxt, deployed to Cloudflare Workers)
└── public/game/    # Static HTML easter-egg game (triggered by typing "fire")
scripts/            # Every build step; see `npx jake -T`
├── lib/common.sh   # Shared paths, Typst invocation, PDF compression
├── rulebook/       # Rulebook, booklet, faction-card and imposition builds
├── blender/        # STL render pipeline
└── print/          # OrcaSlicer 3MF generation for print orders
tools/bitty-cad/    # In-browser CAD scratchpad
Jakefile.js         # Build orchestrator — the entry point for every step
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

`jake site` runs `build.sh`, which builds `nuxt-site/.output/` — the artifact
`wrangler deploy` publishes. The rulebook/faction-card PDFs and PNGs, the ship
renders, and the STL zip are all committed, so a deploy doesn't need Typst or
Blender.

## STL sets

`assets/stls/` holds one folder per set. `base-set/` is free and its zip is
committed; the add-on faction sets are sold, so their models are **not** in
this repository — they are staged locally and published to R2 by
`npx jake publish-sets`. Each folder carries a `set.json` with its version of
record, which `npx jake sets-sync` keeps in step with the site's manifest at
`nuxt-site/server/data/sets.json`.

## Community

Join the [Discord community](https://discord.gg/DMuFEWJtZq) to get notified about launches, new files, and playtesting opportunities.

## License

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You are free to share and adapt this material for non-commercial purposes, with attribution, under the same license. See [LICENSE](LICENSE) for details.
