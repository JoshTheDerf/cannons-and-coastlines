// Link-preview picture for one shop page: what Instagram, Facebook, iMessage
// and Discord show when someone posts /shop/<handle>. 1200 × 630 px (the
// Open Graph size) at --ppi 144, on the faction cards' parchment.
//
//   --input product=<handle>   a fleet id from shared/data/fleets.json,
//                              base-set-files, or all-fleets
//
// The words come from the same files the shop page reads: a fleet's name and
// summary from fleets.json. The two pages that aren't one fleet are below.
// Build all of them with `npx jake social-cards`.

#import "style.typ": colors, display-font, body-font, assets

#let fleets = json("../../nuxt-site/shared/data/fleets.json").fleets
#let hull(f) = "../.." + f.hull.split("?").first()
#let by-id(id) = fleets.find(f => f.id == id)

#let handle = sys.inputs.at("product", default: "all-fleets")

#let pages = (
  "base-set-files": (
    kicker: "Free download · STL files",
    title: "Base Set",
    line: "Both base fleets, plus terrain and coins. They're free.",
    ships: ("queens-fleet", "corsairs"),
  ),
  "all-fleets": (
    kicker: "The complete set · STL files",
    title: "Every Fleet",
    line: "All seven fleets in one download.",
    ships: fleets.map(f => f.id),
  ),
)

#let card = if handle in pages { pages.at(handle) } else {
  let f = by-id(handle)
  assert(f != none, message: "no fleet or page called " + handle)
  (
    kicker: if f.group == "base" { "Base game · free STL files" } else { "Add-on fleet · STL files" },
    title: f.name,
    line: f.summary,
    ships: (f.id,),
  )
}

#set page(width: 600pt, height: 315pt, margin: 0pt, background: {
  rect(width: 100%, height: 100%, fill: colors.parchment)
  place(top + left, image(assets + "/parchment-bg.jpg", width: 100%, height: 100%, fit: "cover"))
  place(top + left, rect(width: 100%, height: 100%, fill: rgb(247, 238, 217, 150)))
  // A gold hairline frame, as on the faction cards.
  place(top + left, dx: 10pt, dy: 10pt, rect(width: 580pt, height: 295pt, stroke: 0.8pt + colors.gold))
})
#set text(font: body-font, fill: colors.ink)

#let words(width) = block(width: width, stack(dir: ttb,
  image(assets + "/logo-with-wordmark.png", width: 150pt),
  v(22pt),
  text(size: 10pt, fill: colors.gold, weight: "bold", tracking: 1.6pt, upper(card.kicker)),
  v(10pt),
  // One line: a long name ("Treasure Fleet") steps down a size to fit.
  text(font: display-font, size: if card.title.len() > 12 { 40pt } else { 46pt }, fill: colors.heading,
    top-edge: "cap-height", bottom-edge: "baseline", card.title),
  v(16pt),
  par(leading: 0.5em, text(size: 15pt, style: "italic", fill: colors.sub, card.line)),
))

// A render cropped to the box every hull fits in (the renders share one
// camera, so one crop works for all of them), `w` wide.
#let ship(path, w) = {
  let scale = w / 1294
  box(width: w, height: 613 * scale, clip: true,
    place(dx: -77 * scale, dy: -102 * scale, image(path, width: 1408 * scale)))
}

#let url = text(size: 10pt, fill: colors.faded, tracking: 0.6pt)[cannonsandcoastlines.com]

#if card.ships.len() == 1 {
  // One fleet: words on the left, its ship large on the right.
  place(left + horizon, dx: 36pt, words(240pt))
  place(left + bottom, dx: 36pt, dy: -24pt, url)
  place(right + horizon, dx: -26pt, dy: 6pt, ship(hull(by-id(card.ships.first())), 320pt))
} else if card.ships.len() == 2 {
  place(left + horizon, dx: 36pt, words(220pt))
  place(left + bottom, dx: 36pt, dy: -24pt, url)
  place(right + top, dx: -6pt, dy: 18pt, image(hull(by-id(card.ships.at(0))), width: 320pt))
  place(right + bottom, dx: -40pt, dy: -12pt, image(hull(by-id(card.ships.at(1))), width: 300pt))
} else {
  // Every fleet: words on the left, the ships in three rows on the right,
  // smaller toward the back and drawn back to front so they overlap.
  place(left + horizon, dx: 36pt, words(200pt))
  place(left + bottom, dx: 36pt, dy: -24pt, url)
  let ships = card.ships.map(id => hull(by-id(id)))
  let spots = (
    (262pt, 30pt, 108pt), (368pt, 26pt, 108pt), (474pt, 30pt, 108pt),
    (282pt, 96pt, 145pt), (432pt, 92pt, 145pt),
    (252pt, 170pt, 172pt), (410pt, 166pt, 172pt),
  )
  for (s, (x, y, w)) in ships.zip(spots) {
    place(left + top, dx: x, dy: y, ship(s, w))
  }
}
