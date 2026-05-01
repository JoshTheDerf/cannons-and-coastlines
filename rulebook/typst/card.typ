// Faction card — 6x4 landscape, matching the HTML rulebook card layout.

#let assets = "../../rulebook/assets"
#let renders = "../../assets/images/renders"

#let colors = (
  ink:         rgb("#1a1209"),
  heading:     rgb("#2c1810"),
  accent:      rgb("#4a2c17"),
  sub-heading: rgb("#5a3a1e"),
  border:      rgb("#8b7355"),
  rule:        rgb("#c4a87a"),
  box-border:  rgb("#6b4c30"),
  parchment:   rgb("#f5ebdc"),
  dark-brown:  rgb("#3c2415"),
)

#let heading-font = ("Oswald",)
#let display-font = ("Pirata One",)   // matches rulebook section titles
#let body-font    = ("Crimson Text",)

// Margins and page size
//
// The card is laid out around a 6in × 4in TRIM line. The PDF page is larger by
// `bleed` on every side so background art (the banner, frame ornament, etc.)
// runs past the trim and survives the cut. Crop marks sit in the bleed area
// at the trim corners as a guide for the print shop / hobby knife.
#let bleed          = 0.125in
#let trim-w         = 6in
#let trim-h         = 4in
#let page-w         = trim-w + 2 * bleed
#let page-h         = trim-h + 2 * bleed
#let content-margin = 0.25in              // distance from trim line to content
#let page-margin    = bleed + content-margin

// Parchment background — cream base, subtle parchment texture overlay.
// HTML uses `opacity: 0.35` on a parchment image over white. We emulate with a
// cream-tinted page fill (most of the visible tone) plus a low-alpha parchment
// texture for the subtle mottling.
#let parchment-bg = {
  // Cream base close to the tinted parchment average
  rect(width: 100%, height: 100%, fill: rgb("#f7eed9"))
  // Faint texture overlay (parchment image at ~25% alpha).
  place(top + left, image(
    assets + "/parchment-bg.jpg",
    width: 100%, height: 100%, fit: "cover",
  ))
  // Lighten overlay so texture is just a whisper
  place(top + left, rect(
    width: 100%, height: 100%,
    fill: rgb(247, 238, 217, 180),
  ))
}

// Decorative frame overlay — drawn ON TOP of banner + body so the rule reads
// as a proper card border. Per-faction `accent` colors the rule and the four
// corner ornaments. Top-corner ornaments sit over the banner art so they use
// a parchment-tinted glyph; bottom-corner ornaments sit on parchment so they
// use the accent color directly.
#let frame-overlay(accent, ornament-path) = {
  // Inset from the trim line, NOT the page edge — so the frame sits at a
  // consistent position inside the cut card regardless of bleed.
  let inset       = bleed + 0.11in
  let gap         = 2.4pt    // distance between outer + inner rules
  let outer-w     = page-w - 2 * inset
  let outer-h     = page-h - 2 * inset
  let inner-w     = outer-w - 2 * gap
  let inner-h     = outer-h - 2 * gap

  // Outer rule
  place(top + left, dx: inset, dy: inset, rect(
    width: outer-w, height: outer-h,
    stroke: 0.7pt + accent, fill: none, radius: 1.5pt,
  ))
  // Hairline inner rule for a double-rule classical-frame look
  place(top + left, dx: inset + gap, dy: inset + gap, rect(
    width: inner-w, height: inner-h,
    stroke: 0.3pt + accent, fill: none, radius: 1pt,
  ))

  // Corner ornaments — one source PNG (dense in its top-left quadrant) rotated
  // for each corner. Sit on top of the rule, hugging the inner corner.
  let orn-size  = 0.55in
  let orn-inset = inset - 0.02in   // pull outward so the corner of the
                                   // ornament sits on the rule corner
  let ornament(angle) = rotate(angle, reflow: false,
    image(ornament-path, width: orn-size, height: orn-size))
  place(top + left,     dx: orn-inset,                       dy: orn-inset,                       ornament(0deg))
  place(top + right,    dx: -orn-inset,                      dy: orn-inset,                       ornament(90deg))
  place(bottom + right, dx: -orn-inset,                      dy: -orn-inset,                      ornament(180deg))
  place(bottom + left,  dx: orn-inset,                       dy: -orn-inset,                      ornament(270deg))

  // Crop marks — short black ticks sitting in the bleed area at each trim
  // corner. They give a printer or a hobby knife a clear cut line. Marks sit
  // outside the trim with a small gap so they remain visible after a slightly
  // imprecise cut and don't print onto the finished card.
  let mark-len = 0.07in
  let mark-gap = 0.025in
  let mark-w   = 0.4pt
  let mark-col = rgb("#1a1209")
  // Horizontal tick: lives at y=trim-edge, length mark-len, sitting in bleed.
  let h-tick(x, y) = place(top + left, dx: x, dy: y,
    line(start: (0pt, 0pt), end: (mark-len, 0pt), stroke: mark-w + mark-col))
  // Vertical tick: lives at x=trim-edge, length mark-len, sitting in bleed.
  let v-tick(x, y) = place(top + left, dx: x, dy: y,
    line(start: (0pt, 0pt), end: (0pt, mark-len), stroke: mark-w + mark-col))

  let trim-l = bleed                  // x of left trim line
  let trim-r = page-w - bleed         // x of right trim line
  let trim-t = bleed                  // y of top trim line
  let trim-b = page-h - bleed         // y of bottom trim line

  // Top-left corner: horizontal tick to the left of trim-l, vertical above trim-t
  h-tick(trim-l - mark-gap - mark-len, trim-t)
  v-tick(trim-l, trim-t - mark-gap - mark-len)
  // Top-right
  h-tick(trim-r + mark-gap, trim-t)
  v-tick(trim-r, trim-t - mark-gap - mark-len)
  // Bottom-left
  h-tick(trim-l - mark-gap - mark-len, trim-b)
  v-tick(trim-l, trim-b + mark-gap)
  // Bottom-right
  h-tick(trim-r + mark-gap, trim-b)
  v-tick(trim-r, trim-b + mark-gap)
}

// Banner: bleed-edge faction image with bottom + side fades to parchment, and
// an overlaid uppercase title near the bottom. Optionally overlays a small
// ship render in the bottom-right corner so the card shows the actual model
// the player will print.
// Pre-rendered parchment overlay with baked-in alpha edges. Sits on top of
// the banner art so the texture dissolves into the body parchment instead of
// fading to a flat color. Switch the path to `-vignette` for the four-edge
// variant.
#let banner-fade-overlay = assets + "/banner-parchment-fade-vignette.png"

#let banner(image-path, title, accent: rgb("#6b4c30"), ship-render: none) = {
  // Bleed outside the page margins so image goes edge-to-edge
  let bleed = page-margin
  let banner-w = page-w
  let banner-h = 2.48in

  block(
    width: banner-w,
    height: banner-h,
    breakable: false,
    // Pull up and out to bleed past margins
    // Negative `below` pulls the body content up so it overlaps the banner's
    // bottom fade region. That region is fully opaque parchment in the
    // overlay PNG, so the overlap is invisible — but the body gains room.
    above: 0pt, below: -0.22in,
  )[
    // Read as bytes so Typst detects real format from magic bytes — some
    // assets in the repo are JPEGs misnamed .png.
    #place(top + left, dx: -bleed, dy: -bleed,
      image(read(image-path, encoding: none), width: banner-w, height: banner-h, fit: "cover"),
    )
    // Parchment overlay with baked-in alpha edges — carries real parchment
    // texture into the fade regions so the banner dissolves into the body
    // parchment instead of fading to a flat color.
    #place(top + left, dx: -bleed, dy: -bleed,
      image(banner-fade-overlay, width: banner-w, height: banner-h, fit: "stretch"),
    )
    // Title — overlaid at the bottom of the banner with a parchment halo
    // (approximates the HTML text-shadow glow). Set in Pirata One to match
    // the rulebook section titles.
    #{
      let title-text(fill, size) = text(
        font: display-font, weight: 400, size: size,
        tracking: 0.8pt, fill: fill,
      )[#title]
      // Offset ghosts approximate the HTML parchment text-shadow glow.
      // Block has width = page-w but sits inside page-margin, so its center is
      // offset by `bleed` (= page-margin here) from the true page center.
      // Subtract that to put the title on the actual card center.
      for (dx, dy) in (
        (-1.5pt, 0pt), (1.5pt, 0pt), (0pt, -1.5pt), (0pt, 1.5pt),
        (-1pt, -1pt), (1pt, -1pt), (-1pt, 1pt), (1pt, 1pt),
      ) {
        place(bottom + center, dx: dx - bleed, dy: -0.40in + dy,
          title-text(rgb(247, 238, 217, 130), 22pt))
      }
      place(bottom + center, dx: -bleed, dy: -0.40in,
        title-text(colors.heading, 22pt))
    }
    // Ship render: sits in a parchment-tinted, brown-bordered tile at the
    // bottom-right of the banner, matching the visual language of the other
    // bordered boxes on the card. Smaller than a bare overlay so it doesn't
    // crowd the centered title.
    // Tucked inside the frame near the bottom-right of the banner. The block
    // bottom + right is the bottom-right of the content area; offsets are
    // sized so the tile sits clear of the trim/frame on every side.
    #if ship-render != none {
      place(bottom + left, dx: -0.14in, dy: -0.40in, box(
        width: 0.75in,
        inset: 0.04in,
        radius: (left: 0pt, right: 3pt),
        stroke: 0.7pt + accent,
        fill: rgb(247, 238, 217, 235),
        image(ship-render, width: 100%),
      ))
    }
  ]
}

// Stat grid: 2x2 label/value layout, very compact.
// Each label gets a thin faction-accent underline for a touch of color.
#let stat-grid(pairs, accent: rgb("#6b4c30")) = {
  grid(
    columns: (1fr, 1fr),
    column-gutter: 0.15in,
    row-gutter: 0.16in,
    ..pairs.map(p => {
      let (label, value) = p
      stack(dir: ttb, spacing: 6pt,
        // Label is drawn in the faction accent for a touch of color without
        // the height cost of an underline rule.
        text(
          font: heading-font, weight: 800, size: 7.5pt,
          tracking: 0.4pt, fill: accent,
        )[#upper(label)],
        text(size: 8.5pt, fill: colors.heading)[#value],
      )
    })
  )
}

// Ability callout — accent-colored title bar, thin border body.
// The heading sits in a filled "ribbon" using the faction accent so it reads
// as the primary callout on the card.
#let ability-box(heading-text, body, accent: rgb("#6b4c30")) = {
  block(
    width: 100%,
    radius: 4pt,
    stroke: 0.8pt + accent,
    fill: rgb(245, 235, 220, 60),
    inset: 0pt,
  )[
    // Ribbon header
    #block(
      width: 100%,
      inset: (x: 0.09in, y: 0.028in),
      fill: accent,
      // Square only the bottom edge so the ribbon sits flush at the top.
      radius: (top: 3.4pt, bottom: 0pt),
    )[
      #text(
        font: heading-font, weight: 700, size: 9pt,
        tracking: 0.3pt, fill: rgb("#f7eed9"),
      )[#heading-text]
    ]
    // Body text
    #block(
      width: 100%,
      inset: (x: 0.09in, y: 0.05in),
      above: 0pt,
    )[
      #set text(size: 8.5pt, fill: colors.ink)
      #set par(leading: 0.55em, justify: true)
      #body
    ]
  ]
}

// Small "Playstyle" hint that sits below the ability box. Keeps the same
// width as the right column so it reads as part of the same group.
// Same visual treatment as ability-box so the two read as a matched pair.
#let playstyle-block(body, accent: rgb("#6b4c30")) = {
  ability-box("Playstyle", body, accent: accent)
}

// Main entry point.
#let faction-card(
  title: none,
  banner-image: none,
  ship-render: none,
  tagline: none,
  stats: (),
  ability: none,
  playstyle: none,
  accent: rgb("#6b4c30"),
  ornament: assets + "/corner-ornament.png",
) = {
  set document(title: title)
  set page(
    width: page-w, height: page-h,
    margin: page-margin,
    background: parchment-bg,
    foreground: frame-overlay(accent, ornament),
  )
  set text(font: body-font, size: 9pt, fill: colors.ink, hyphenate: true)
  set par(leading: 0.5em, justify: true)

  banner(banner-image, title, accent: accent, ship-render: ship-render)

  // Body: two columns — tagline + stats on the left, ability box on the right.
  grid(
    columns: (1.2fr, 1fr),
    column-gutter: 0.18in,
    // Left
    {
      if tagline != none {
        text(style: "italic", size: 8.5pt)[#tagline]
        v(0.16in, weak: true)
      }
      stat-grid(stats, accent: accent)
    },
    // Right
    {
      if ability != none {
        ability-box(ability.heading, ability.body, accent: accent)
      }
      if playstyle != none {
        v(0.10in, weak: true)
        playstyle-block(playstyle, accent: accent)
      }
    }
  )
}
