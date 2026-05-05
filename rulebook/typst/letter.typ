// Cannons & Coastlines — Welcome letter from Goldenbeard
// Single-page US Letter parchment letter, signed.
// Build via build-letter.sh.

#let assets        = "../../rulebook/assets"
#let letter-assets = "../../rulebook/assets/letter"

// Palette borrowed from rulebook.typ.
#let colors = (
  parchment:   rgb("#f7eed9"),
  ink:         rgb("#1a1209"),
  heading:     rgb("#2c1810"),
  sub:         rgb("#5a3a1e"),
  crimson:     rgb("#8b1a1a"),
  gold:        rgb("#a8801a"),
  brown:       rgb("#3c2415"),
  faded:       rgb("#8a6f45"),
)

// Title remains in Pirata One (decorative pirate display).
// Greeting + closing flourishes use Mrs Saint Delafield — a copperplate
// script in the spirit of a hand-engrossed letter of marque.
// Body uses IM Fell English — a period-correct revival of John Fell's
// 17th-century types, the closest legible match to age-of-sail correspondence.
#let display-font = ("Pirata One",)
#let script-font  = ("Treasure Map Deadhand", "Mrs Saint Delafield", "Pinyon Script")
#let body-font    = ("IM FELL English", "IM Fell English")

// Helper: render an image at reduced opacity by laying a parchment-tinted
// rectangle on top with a porter-duff "in" — Typst lacks blend modes, so we
// fake fade by relying on PNG alpha + place opacity isn't available; instead
// we use scale + image directly and let the alpha do its work.
#let mark(path, w, angle: 0deg, alpha: 100%) = {
  // Wrap in a layout box so rotation doesn't reflow surrounding content.
  rotate(angle, image(path, width: w))
}

// Background art — parchment + edge marks. Parametrized so the second page
// can render the same content without the parchment underlay (for printing
// directly onto parchment paper).
#let edge-marks = {
  // Marks are oversized and pushed mostly off the page; only their outer
  // fringes hint inward at the edges of the parchment.

  // Top edge: huge powder smear, mostly above the page.
  place(top + center, dx: -0.4in, dy: -3.0in,
    mark(letter-assets + "/powder-a.png", 11in, angle: -6deg))

  // Bottom-left: oversized powder smear, mostly off the bottom-left edge.
  place(bottom + left, dx: -3.0in, dy: 1.8in,
    mark(letter-assets + "/powder-b.png", 7.5in, angle: 8deg))

  // Top-left corner: large round ink splatter, mostly off-page.
  place(top + left, dx: -3.0in, dy: -2.4in,
    mark(letter-assets + "/ink-blot-a.png", 5.0in, angle: -25deg))

  // Top-right: powder smudge bleeding in from the upper-right corner.
  place(top + right, dx: 3.6in, dy: -1.8in,
    mark(letter-assets + "/powder-b.png", 7.0in, angle: 165deg))

  // Bottom-right corner: oil stain hinted behind the signature.
  place(bottom + right, dx: 3.4in, dy: 3.0in,
    mark(letter-assets + "/oil-blot.png", 4.4in, angle: -15deg))
}

#let parchment-bg = {
  rect(width: 100%, height: 100%, fill: colors.parchment)
  place(top + left, image(
    assets + "/parchment-bg.jpg",
    width: 100%, height: 100%, fit: "cover",
  ))
  place(top + left, rect(
    width: 100%, height: 100%,
    fill: rgb(247, 238, 217, 110),
  ))
  edge-marks
}

#set page(
  paper: "us-letter",
  margin: (top: 1.3in, bottom: 0.65in, left: 0.9in, right: 0.9in),
  background: parchment-bg,
)

// Body block — defined once and rendered on both pages.
#let body-content = [

// Body uses Treasure Map Deadhand — handwritten, age-of-sail feel.
// Sized for legibility; tightened leading because the font is tall.
#set text(font: script-font, size: 21pt, fill: colors.ink, lang: "en")
#set par(leading: 0.55em, justify: true, first-line-indent: 0pt)

#text(font: display-font, size: 22pt, fill: colors.heading)[Greetings, sailor.]

#v(0.10in)

Word has reached Goldenbeard that ye have acquired one of the finest naval
combat systems ever to sail these waters. Naturally, this is because I had a
hand in it.

#v(0.04in)

Ye are among the first crew to sail under these colors. That makes ye either
extraordinarily lucky or extraordinarily foolish. The seas will decide which.

#v(0.04in)

There are those who sail under the Queen's colors, fat and proud in their
tin-hat navy, following orders and calling it honor. Then there are those who
sail free wherever the wind in their sails takes them. I trust that ye will
choose your own course wisely.

#v(0.04in)

Find us on Instagram at #text(fill: colors.crimson, weight: "bold")[\@cannonsandcoastlines]
and show Goldenbeard what ye're made of. I shall be watching.

#v(0.18in)

#align(right)[
  #text(font: display-font, size: 22pt, fill: colors.heading)[
    Sail true, aim truer.
  ]
]

#v(0.20in)

// Signature — rotated and faded so it reads like a hasty scrawl
// rather than a printed nameplate.
#place(right, dx: -0.2in, dy: -0.1in,
  rotate(-20deg, origin: right + horizon,
    box(width: 2.4in,
      image(letter-assets + "/signature-goldenbeard.png", width: 2.4in)
    )
  )
)
]

// Page 1 — full parchment + edge marks (for digital viewing / standard paper).
#body-content

// Page 2 — same content, no parchment background, edge marks still hinting.
// Intended for printing directly onto pre-bought parchment-finish paper.
#set page(background: edge-marks)
#pagebreak()
#body-content
