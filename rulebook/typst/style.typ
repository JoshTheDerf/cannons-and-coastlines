// Shared look for the half-letter documents: the rulebook and the print lists.
//
// Parchment page, sepia ink, Pirata One section titles, Crimson Text for
// everything else, brown-banded tables. rulebook.typ and print-list.typ both
// `#show: book.with(...)` this, so a change here moves both.

#let assets = "../../rulebook/assets"
#let renders = "../../assets/images/renders"

// Pirate-themed palette: parchment base, sepia ink, dried-blood crimson accent,
// weathered-gold rules, aged-brown borders.
#let colors = (
  parchment:   rgb("#f7eed9"),
  cream:       rgb("#faf3e0"),
  stripe:      rgb(210, 185, 145, 40),   // table alt-row tint
  ink:         rgb("#1a1209"),
  heading:     rgb("#2c1810"),
  sub:         rgb("#5a3a1e"),
  crimson:     rgb("#8b1a1a"),
  crimson-dim: rgb("#6b1414"),
  gold:        rgb("#a8801a"),
  brown:       rgb("#3c2415"),
  box-border:  rgb("#6b4c30"),
  rule:        rgb("#c4a87a"),
  faded:       rgb("#8a6f45"),
)

// Two font families only:
//   display-font: Pirata One. Cover and section (level-1) titles, drop caps,
//     and the occasional decorative glyph.
//   body-font: Crimson Text. Body copy, italics, subsection headings
//     (rendered in bold small-caps via upper() + tracking), table headers,
//     footer, everything else.
#let display-font = ("Pirata One",)
#let body-font    = ("Crimson Text",)

// Parchment background (matches faction cards: cream base + texture + lighten)
#let parchment-bg = {
  rect(width: 100%, height: 100%, fill: colors.parchment)
  place(top + left, image(
    assets + "/parchment-bg.jpg",
    width: 100%, height: 100%, fit: "cover",
  ))
  place(top + left, rect(
    width: 100%, height: 100%,
    fill: rgb(247, 238, 217, 180),
  ))
}

// Anchor flanked by two short gold rules, used as a section separator.
#let fleuron = box(width: 28%)[
  #grid(
    columns: (1fr, auto, 1fr),
    align: (horizon, horizon, horizon),
    column-gutter: 8pt,
    line(length: 100%, stroke: 0.6pt + colors.gold),
    text(font: body-font, size: 14pt, fill: colors.gold)[⚓],
    line(length: 100%, stroke: 0.6pt + colors.gold),
  )
]

#let divider = {
  set align(center)
  v(0.08in)
  fleuron
  v(0.08in)
}

// Rule-highlight callout: crimson left bar, subtle parchment fill.
#let callout(body) = block(
  width: 100%,
  inset: (x: 0.16in, y: 0.14in),
  radius: 2pt,
  stroke: (left: 3pt + colors.crimson, rest: 0.5pt + colors.box-border),
  fill: rgb(245, 235, 220, 90),
  breakable: true,
  body,
)

// Ability / rule-box: framed block with a small heading.
#let ability-box(head, body) = block(
  width: 100%,
  inset: (x: 0.16in, y: 0.14in),
  radius: 3pt,
  stroke: 0.8pt + colors.box-border,
  fill: rgb(245, 235, 220, 70),
  breakable: true,
)[
  #text(
    font: body-font, weight: 700, size: 10pt,
    fill: colors.brown, tracking: 0.6pt,
  )[#upper(head)]
  #v(0.07in, weak: true)
  #body
]

// High-contrast box, for Quick Reference. Dark border + heavier fill.
#let contrast-box(head, body) = block(
  width: 100%,
  inset: (x: 0.16in, y: 0.14in),
  radius: 3pt,
  stroke: 1.2pt + colors.brown,
  fill: rgb(240, 226, 200, 110),
  breakable: true,
)[
  #text(
    font: body-font, weight: 700, size: 11pt,
    fill: colors.crimson-dim, tracking: 0.8pt,
  )[#upper(head)]
  #v(0.08in, weak: true)
  #body
]

// Drop cap for section openings: fake "illuminated" capital using Pirata One
// dropped into a text paragraph.
#let drop-cap(letter, rest) = {
  grid(
    columns: (auto, 1fr),
    column-gutter: 6pt,
    align: (top, top),
    text(
      font: display-font, size: 56pt,
      fill: colors.crimson-dim,
      top-edge: "cap-height",
      bottom-edge: "baseline",
    )[#letter],
    [#rest],
  )
}

// Footer shown on every page except the cover. `label` is the right-hand
// label (the rulebook puts its version there).
#let page-footer(label) = context {
  let n = counter(page).get().first()
  set text(font: body-font, size: 8pt, fill: colors.faded, tracking: 1.2pt)
  grid(
    columns: (1fr, auto, 1fr),
    align: (left, center, right),
    upper[Cannons \& Coastlines],
    text(font: body-font, size: 9pt, fill: colors.gold)[✦ #n ✦],
    upper(label),
  )
}

// Shared section-title renderer, used by the level-1 heading rule AND by
// inline section starts that want the title block without forcing a new page.
#let section-title(body) = {
  set align(center)
  v(0.02in)
  text(
    font: display-font, size: 28pt,
    fill: colors.heading, weight: 400,
  )[#body]
  v(-0.05in)
  line(length: 45%, stroke: 0.8pt + colors.gold)
  v(0.1in)
}

// Full-column-width content (used for inline tables/boxes that want to shrink
// the trailing paragraph gap).
#let tight(body) = block(width: 100%, above: 0.08in, below: 0.12in, body)

// The page template. `footer-right` is the right-hand footer label.
#let book(footer-right: [], body) = {
  set page(
    width: 5.5in, height: 8.5in,         // portrait half-letter
    margin: (x: 0.45in, y: 0.5in),
    background: parchment-bg,
    footer: page-footer(footer-right),
    footer-descent: 0.15in,
  )

  set text(
    font: body-font, size: 10.5pt,
    fill: colors.ink, hyphenate: false,
  )
  set par(leading: 0.65em, justify: true, first-line-indent: 0pt, spacing: 0.9em)

  // List tuning: loose enough that bullets and numbered steps read as
  // distinct thoughts rather than a dense block.
  set list(indent: 0.12in, body-indent: 0.1in, spacing: 0.75em)
  set enum(indent: 0.12in, body-indent: 0.1in, spacing: 0.75em)
  // List/enum items are usually short directives, not flowing prose;
  // ragged-right reads better and avoids loose word spacing.
  show list: set par(justify: false)
  show enum: set par(justify: false)

  // Level 1: major section title. Pirata One, centered, gold rule under.
  show heading.where(level: 1): it => {
    // Break to a new page so sections have room to breathe; a weak break so
    // the very first section doesn't force a blank page after the cover.
    pagebreak(weak: true)
    section-title(it.body)
    set align(left)
  }

  // Level 2: subsection. Bold small-caps serif, sepia, thin rule under.
  show heading.where(level: 2): it => {
    v(0.2in, weak: true)
    block(below: 0.1in)[
      #text(
        font: body-font, weight: 700, size: 12pt,
        fill: colors.brown, tracking: 1pt,
      )[#upper(it.body)]
      #v(-0.06in)
      #line(length: 100%, stroke: 0.5pt + colors.rule)
    ]
  }

  // Level 3: minor heading. Bold small-caps serif, crimson.
  show heading.where(level: 3): it => {
    v(0.16in, weak: true)
    text(
      font: body-font, weight: 700, size: 10.5pt,
      fill: colors.crimson-dim, tracking: 0.6pt,
    )[#upper(it.body)]
    v(0.06in, weak: true)
  }

  // Header row gets a tall, generously padded brown band (reads like a title
  // bar). Body rows stay compact. Inset is a function of row index.
  set table(
    stroke: none,
    inset: (_, y) => if y == 0 { (x: 12pt, y: 10pt) } else { (x: 8pt, y: 7pt) },
    fill: (_, y) => if y == 0 { colors.brown }
                   else if calc.odd(y) { colors.stripe }
                   else { none },
  )
  // Breathing room around tables so they don't butt up against paragraphs.
  show table: set block(above: 0.15in, below: 0.15in)
  // Header row text: cream caps on brown, padded so the band visibly
  // surrounds the text.
  show table.cell.where(y: 0): it => block(
    width: 100%,
    inset: (y: 7pt),
    align(center, text(
      font: body-font, weight: 700, size: 9.5pt,
      fill: colors.cream, tracking: 1pt,
    )[#upper(it.body)]),
  )
  // Body cells: tighter leading than running body copy.
  show table: set par(leading: 0.52em, justify: false)

  // Strong is used throughout; render in brown/heading color, not black.
  show strong: set text(fill: colors.heading)
  show emph: set text(fill: colors.sub)

  body
}
