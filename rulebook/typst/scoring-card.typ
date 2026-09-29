// Scoring card — a 6x4 lookup table for counting points mid-game. Find how
// many of each thing you have along the top, read the points in that row,
// and add the rows up.
//
// Standalone for now; it is meant to become the back of every faction card
// later. Compile plain for the neutral brown version, or pass
// `--input faction=<id>` to take that faction's accent and corner ornament
// so it can be paired with the matching card front:
//   typst compile --input faction=corsairs scoring-card.typ out.pdf
//
// `--input blank=1` swaps every point value (bonuses too) for an empty
// write-in square, for playtesting values before they are settled.
//
// Point values mirror the Scoring table in rulebook.typ. Change both.
#import "card.typ": (
  colors, heading-font, display-font, body-font, renders, assets,
  page-w, page-h, page-margin, parchment-bg, frame-overlay,
)
#import "factions.typ": data

#let faction-id = sys.inputs.at("faction", default: none)
#let accent = if faction-id == none { colors.box-border } else { data.at(faction-id).accent }
#let ornament = if faction-id == none {
  assets + "/corner-ornament.png"
} else {
  assets + "/corner-ornament-" + faction-id + ".png"
}

#let blank = sys.inputs.at("blank", default: none) != none

#set document(title: "Scoring")
#set page(
  width: page-w, height: page-h,
  margin: page-margin,
  background: parchment-bg,
  foreground: frame-overlay(accent, ornament),
)
#set text(font: body-font, size: 9pt, fill: colors.ink, hyphenate: true)
#set par(leading: 0.5em, justify: false)

#let counts = range(1, 11)

#let icon(file) = image(renders + "/" + file + ".png", height: 0.28in)

#let what(name, note) = align(left + horizon, {
  text(weight: 700, size: 10pt, fill: colors.heading)[#name]
  if note != none {
    linebreak()
    text(style: "italic", size: 7.5pt, fill: colors.sub-heading)[#note]
  }
})

#let write-in = box(width: 0.28in, height: 0.24in, radius: 1.5pt,
  stroke: 0.6pt + colors.border, fill: rgb(255, 250, 240, 160))

#let points(n) = if blank { write-in } else {
  text(font: heading-font, weight: 700, size: 11pt, fill: colors.heading)[#n]
}

// A counted row: icon, name, then the points for 1..10 of it.
#let count-row(file, name, note, each) = (
  icon(file), what(name, note),
  ..counts.map(n => points(n * each)),
)

// A bonus row: a flat +8, no count.
#let bonus-row(name) = (
  [], what(name, none),
  table.cell(colspan: counts.len(), align(left + horizon, grid(
    columns: 2, column-gutter: 0.08in, align: horizon,
    if blank { write-in } else {
      text(font: heading-font, weight: 700, size: 11pt, fill: accent)[+8]
    },
    text(size: 8.5pt)[Ties count.],
  ))),
)

#align(center, text(font: display-font, size: 24pt, fill: colors.heading, tracking: 0.8pt)[Scoring])
#v(-0.10in)

#table(
  columns: (0.34in, 1.3in, ..counts.map(_ => 1fr)),
  rows: (auto, ..range(6).map(_ => 0.35in), 0.44in),
  align: center + horizon,
  inset: (x: 2pt, y: 2pt),
  stroke: (x, y) => (
    // A heavier rule above the total row, like the line under a sum.
    top: if y == 7 { 1.2pt + accent } else if y > 0 { 0.4pt + colors.rule },
    left: if x > 2 and y < 7 { 0.4pt + colors.rule },
  ),
  // Shade every other count column so the eye can run straight down from
  // the number in the header.
  fill: (x, y) => if y <= 4 and x >= 2 and calc.even(x) { rgb(196, 168, 122, 45) },
  table.header(
    [],
    align(left, text(font: heading-font, weight: 800, size: 7.5pt, tracking: 0.4pt, fill: accent)[HOW MANY?]),
    ..counts.map(n => text(font: heading-font, weight: 700, size: 10pt, fill: accent)[#n]),
  ),
  ..count-row("island", [Islands held], none, 8),
  ..count-row("mast", [Prize fittings], [Masts, cargo taken], 4),
  ..count-row("ship-queens-fleet", [Prize ships], [Sunk or captured], 8),
  ..count-row("coin-boarding-party-top", [Coins in hand], none, 1),
  ..bonus-row[Most ships],
  ..bonus-row[Most islands],
  // Total: a write-in box, with the declare rule beside it.
  [], align(left + horizon, text(font: heading-font, weight: 700, size: 11pt, fill: colors.heading)[YOUR SCORE]),
  table.cell(colspan: 3, inset: (x: 3pt, y: 4pt), rect(
    width: 100%, height: 100%, radius: 2pt, stroke: 0.8pt + accent, fill: rgb(255, 250, 240, 160),
  )),
  table.cell(colspan: counts.len() - 3, inset: (left: 0.08in), align(left + horizon, par(justify: false,
    text(size: 8pt, hyphenate: false, fill: colors.sub-heading)[If you have at least *60 points*, and you think no one has more than you, declare so at the start of your turn to end the game.],
  ))),
)
