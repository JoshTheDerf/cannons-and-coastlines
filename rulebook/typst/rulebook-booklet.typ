// Cannons & Coastlines — Rulebook imposed for saddle-stitch booklet printing.
//
// The main rulebook (rulebook.typ) renders as portrait half-letter pages
// (5.5 × 8.5). This file imposes them two-up on landscape US-letter sheets
// (11 × 8.5) using the bookletic package. Print double-sided, stack sheets,
// fold in half along the vertical center line → standard spine-on-left
// half-letter booklet.
//
// Pipeline:
//   1. build-rulebook.sh compiles rulebook.typ → per-page SVGs (vector).
//   2. build-booklet.sh compiles THIS file, which imports those SVGs and
//      feeds them to bookletic.sig() in reading order. Bookletic handles
//      signature ordering + blank padding to the next multiple of 4.
//
// Page count is passed via --input pages=N (see build-booklet.sh).

#import "@preview/bookletic:0.3.2"

#let svg-dir = "../../rulebook/svg"
#let page-count = int(sys.inputs.at("pages", default: "17"))

// Physical sheet: landscape US-letter. Margin 0 — the rulebook pages already
// have their own internal margins, and we want bookletic to give us full-bleed
// half-cells so each content page lands at its native 5.5 × 8.5 size.
#set page(paper: "us-letter", flipped: true, margin: 0in)

#let page-svg(n) = image(
  svg-dir + "/rulebook-" + str(n) + ".svg",
  width: 5.5in, height: 8.5in, fit: "contain",
)

#bookletic.sig(
  contents: range(1, page-count + 1).map(page-svg),
  pad-content: 0in,
  page-margin-binding: 0in,
)
