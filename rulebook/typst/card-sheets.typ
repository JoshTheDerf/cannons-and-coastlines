// Combined faction-card print sheet.
//
// Lays out the seven faction-card PNGs two-per-page on US-letter portrait
// (8.5 × 11) with a gap between them. Pairings:
//   Page 1: Corsairs + Queens Fleet
//   Page 2: The Islanders + Sun Fleet
//   Page 3: The Industry + Treasure Fleet
//   Page 4: Shadow Fleet (alone, vertically centered)
//
// Cards include their 0.125in bleed (so PNG is 6.25 × 4.25). Two cards
// stack to 8.5in, leaving 2.5in of vertical space distributed as a 1in
// gap between cards plus 0.75in top/bottom margins.

#let card-png(id) = "../png/faction-card-" + id + ".png"

#let CARD-W = 6.25in
#let CARD-H = 4.25in

#set page(
  paper: "us-letter",
  margin: 0in,
)

// Two cards stacked vertically, centered horizontally on the page, with a
// gap between them. Top/bottom margins are computed from the gap so the
// pair sits centered on the page even if you tweak the gap.
#let pair(top-id, bottom-id, gap: 0.6in) = {
  let side-margin = (8.5in - CARD-W) / 2
  let v-margin = (11in - 2 * CARD-H - gap) / 2
  place(top + left, dx: side-margin, dy: v-margin,
        image(card-png(top-id), width: CARD-W))
  place(top + left, dx: side-margin, dy: v-margin + CARD-H + gap,
        image(card-png(bottom-id), width: CARD-W))
}

#let solo(id) = {
  let side-margin = (8.5in - CARD-W) / 2
  let v-margin = (11in - CARD-H) / 2
  place(top + left, dx: side-margin, dy: v-margin,
        image(card-png(id), width: CARD-W))
}

#pair("corsairs", "queens-fleet")
#pagebreak()
#pair("the-islanders", "sun-fleet")
#pagebreak()
#pair("the-industry", "treasure-fleet")
#pagebreak()
#solo("shadow-fleet")
