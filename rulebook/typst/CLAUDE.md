# Typst build — guide for Claude

Typst is the canonical source for the rulebook and the seven faction cards (6"×4" landscape). There is no HTML/Markdown pipeline anymore.

## Files in this directory

- `rulebook.typ` — full rulebook (portrait half-letter, 5.5 × 8.5, single column, ~17 pages). Sized so two pages fit side-by-side on a landscape letter sheet for booklet printing.
- `rulebook-booklet.typ` — imposes per-page SVGs two-up on landscape letter using `@preview/bookletic`. Output is a saddle-stitch signature: print double-sided (flip on short edge), stack, fold, staple → spine-on-left half-letter booklet.
- `card.typ` — faction card template: page setup, parchment background, banner, stat grid, ability box. Edit this for **layout/styling**.
- `factions.typ` — data-only dictionary of all seven factions, dispatches on `--input faction=<id>`. Edit this for **faction content**.
- `build-rulebook.sh` — builds `rulebook.pdf` + `rulebook-{p}.png` @ 300dpi.
- `build-cards.sh` — loops the seven factions, emits PDF + 300dpi PNG for each.
- `fonts/` — vendored Pirata One + Oswald + Crimson Text (hermetic build). Don't rely on system fonts.

## Build

```bash
TYPST=~/.local/bin/typst rulebook/typst/build-rulebook.sh   # PDF + per-page PNG/SVG
TYPST=~/.local/bin/typst rulebook/typst/build-booklet.sh    # imposed booklet PDF (depends on SVGs above)
TYPST=~/.local/bin/typst rulebook/typst/build-cards.sh
```

PDFs land in `rulebook/pdf/`, PNGs in `rulebook/png/`. These paths are linked from the site `index.html` and `README.md` — don't move them.

Per-faction manual build:

```bash
~/.local/bin/typst compile \
  --root /home/sysadmin/Experiments/cannons-and-coastlines \
  --font-path rulebook/typst/fonts \
  --input faction=corsairs \
  rulebook/typst/factions.typ out.pdf
```

`--root` is required because `card.typ` reads `../../rulebook/assets/*` which sits outside the source file's directory.

## Adding a faction

1. Add an entry to the `data` dict in `factions.typ` (copy an existing one).
2. Drop the banner image into `rulebook/assets/faction-<id>.png` at ~1584×672.
3. Add `<id>` to the `FACTIONS` array in `build-cards.sh`.

## Things that bit me last time

**Gradient angles in Typst are not CSS.** `gradient.linear(angle: X)`:
- `0deg` = left→right (first stop on the left)
- `90deg` = top→bottom (first stop at the top)
- `180deg` = right→left
- `270deg` = bottom→top

For the banner bottom-fade (transparent top → parchment bottom) use `90deg`. For the side-fade (parchment → transparent → parchment horizontally) use `0deg`. Getting this wrong makes the gradient run along the wrong axis.

**Some banner assets are JPEG with a `.png` extension** (e.g. `faction-shadow-fleet.png`). `image(path)` fails on these because Typst reads the extension. Fix already applied — `image(read(path, encoding: none))` lets Typst detect format from magic bytes. Don't revert it.

**Variable font warnings are noise.** Typst 0.14 warns on `Oswald[wght].ttf` but renders correctly. The build script greps them out. Don't waste time trying to install static Oswald — the Google Fonts repo's `static/` subdir 404s for Oswald.

**Overflow is silent in the PDF, loud in PNG.** If content exceeds the 4in page, the PDF gets a second page (no error) but PNG export then fails with `cannot export multiple images without a page number template`. Always verify with `pdfinfo out.pdf | grep Pages` → expect `Pages: 1`.

**Body space is tight.** Trim = 4in. Banner = 2.48in. Content margins = 0.5in (top + bottom). Body ≈ 0.96in for tagline + 2 rows of stats. If you add gutter or raise font sizes and it overflows:
- Trim banner height first (smallest visual impact).
- Then tighten `v(…)` after the tagline.
- Last resort: shrink in-cell spacing in `stat-grid`.

**Typst's bold weights differ from CSS.** `weight: 700` is regular bold; `weight: 800` is visibly heavier on Oswald. The user preferred 800 for stat labels.

**The faction title "glow" is faked with offset ghost copies** because Typst 0.14 has no text-shadow/blur. Eight offset placements at `rgb(247, 238, 217, 130)` approximates the HTML `text-shadow` well enough. Don't try to do it "properly" with filters.

## Sanity check after any change

```bash
for f in queens-fleet corsairs treasure-fleet shadow-fleet sun-fleet the-industry the-islanders; do
  pdfinfo rulebook/pdf/faction-card-$f.pdf | grep -H Pages || echo "MISSING: $f"
done
pdfinfo rulebook/pdf/rulebook.pdf | grep Pages   # expect 10
```

Every faction line should say `Pages: 1`.

## Known good geometry

These values balance on the edge of the 4in page — change one, test with `pdfinfo` before celebrating.

| Thing | Value |
|---|---|
| Page | 6.25in × 4.25in (6×4 trim + 0.125in bleed each side), 0.25in content margin from trim |
| Banner height | 2.48in |
| Banner title | 16pt Oswald 700, placed `dy: -0.32in` from banner bottom |
| Stat label | Oswald 800, 7pt, tracking 0.4pt, dark-brown |
| Stat value | Crimson Text, 7.5pt |
| In-cell gap (label→value) | `spacing: 4pt` |
| Between stat rows | `row-gutter: 0.10in` |
| After tagline | `v(0.09in, weak: true)` |
