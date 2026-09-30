// Cannons & Coastlines: print list + printing guide for one STL download.
//
//   typst compile --input set=<set-id | bundle-id> print-list.typ out.pdf
//
// This is the PRINTING.pdf inside each zip and the PDF the /print-list/<set>
// page (and /print-guide, for the base set) links. It has no words of its
// own: the lists are nuxt-site/content/pages/print-lists.yml (parts, howTo,
// steps, kit), the colors
// and settings print-guide.yml, and the set titles and versions
// nuxt-site/server/data/sets.json. The site page reads the same
// files. Same page and type as the rulebook (style.typ).
//
// Every note is about the fleets on the list, nothing else. An add-on fleet
// fits one page, the base set two; the bundle runs longer.
//
// Build via `npx jake print-lists` (scripts/rulebook/build-print-lists.sh);
// the zip builds call print_list_pdf in scripts/lib/common.sh.

#import "style.typ": *

#let lists    = yaml("/nuxt-site/content/pages/print-lists.yml")
#let guide    = yaml("/nuxt-site/content/pages/print-guide.yml")
#let manifest = json("/nuxt-site/server/data/sets.json")
#let site     = "https://cannonsandcoastlines.com"

#let target = sys.inputs.at("set", default: "base-set")
#let bundle = manifest.bundles.find(b => b.id == target)
#let set-ids = if bundle != none { bundle.includes.map(i => i.set) } else { (target,) }
#let find-set(id) = manifest.sets.find(s => s.id == id)
#if bundle == none and find-set(target) == none {
  panic("print-list.typ: no set or bundle called " + target + " in sets.json")
}
#let fleets = lists.fleets.items.filter(f => f.set in set-ids)
#if fleets.len() == 0 { panic("print-list.typ: print-lists.yml has no fleet for " + target) }
#let has-base = lists.base.set in set-ids
#let short-url(u) = link(u, u.replace("https://", ""))
// The base set's list is the print guide.
#let list-url(id) = site + if id == lists.base.set { "/print-guide" } else { "/print-list/" + id }
#let page-url = list-url(target)
#let base-url = list-url(lists.base.set)

// ── Text helpers ─────────────────────────────────────────────────────────

// The YAML fields use **bold** and *italic*, like the site's RichText.
#let rich(s) = {
  let s = str(s).trim()
  for (i, chunk) in s.split("**").enumerate() {
    if calc.odd(i) { strong(chunk) } else {
      for (j, t) in chunk.split("*").enumerate() {
        if calc.odd(j) { emph(t) } else { t }
      }
    }
  }
}

#let names(xs) = if xs.len() == 1 { xs.first() } else {
  xs.slice(0, -1).join(", ") + " and " + xs.last()
}

// ── Lookups (mirrored in nuxt-site/app/composables/usePrintList.ts) ─────

#let guide-fleet(id) = {
  let f = guide.fleets.items.find(f => f.id == id)
  if f == none { panic("print-guide.yml has no fleet " + id) }
  f
}

// A color id from print-guide.yml, or `hull`. A fleet that matches its
// rigging to the hull prints masts and sails in the hull color too.
#let color-of(key, fleet: none) = {
  let gf = if fleet != none { guide-fleet(fleet.id) } else { none }
  if gf != none and (key == "hull" or (gf.at("matchRigging", default: false) and key in ("masts", "sails"))) {
    gf.hull
  } else {
    let row = guide.colors.rows.find(r => r.id == key)
    if row == none { panic("print-guide.yml colors has no id " + key) }
    row.color
  }
}

#let qty-of(item, fleet: none) = {
  let each = item.at("each", default: none)
  if each != none { str(each * fleet.ships) } else { str(item.qty) }
}

#let render-of(item) = renders + "/" + item.at("render", default: item.file.replace(".stl", "")) + ".png"

// ── Pieces ───────────────────────────────────────────────────────────────

// A small section heading that doesn't start a new page.
#let list-title(body, sub: none) = {
  v(0.1in, weak: true)
  block(below: 0.04in, grid(
    columns: (auto, 1fr),
    column-gutter: 8pt,
    align: (left + bottom, right + bottom),
    text(font: display-font, size: 19pt, fill: colors.heading)[#body],
    if sub != none { text(size: 9pt, style: "italic", fill: colors.sub)[#sub] },
  ))
  v(-0.02in)
  line(length: 100%, stroke: 0.8pt + colors.gold)
}

// One table for a list of parts. `fleet` is set for a fleet's own list,
// which is where qty `each` and the hull color come from.
#let parts-table(items, fleet: none, show-base: false) = block(above: 0.06in, below: 0.06in, table(
  columns: (0.3in, 1.9fr, 0.44in, 1.15fr, 0.72in),
  align: (center + horizon, left + horizon, center + horizon, left + horizon, center + horizon),
  inset: (_, y) => if y == 0 { (x: 4pt, y: 0pt) } else { (x: 4pt, y: 2pt) },
  table.header[][Part][Qty][Color][Supports],
  ..items.map(it => (
    image(render-of(it), height: 0.24in, width: 100%, fit: "contain"),
    text(size: 9pt)[
      *#it.part* #h(2pt) #text(size: 7.5pt, fill: colors.sub, style: "italic")[#it.file#if show-base and it.at("base", default: false) [ from the base set]]
      #if it.at("note", default: none) != none [ \ #text(size: 8pt)[#rich(it.note)]]
    ],
    text(size: 10pt, weight: 700)[#qty-of(it, fleet: fleet)],
    text(size: 8.5pt)[#rich(color-of(it.color, fleet: fleet))],
    text(size: 8.5pt)[#if it.at("supports", default: false) [*Yes*] else [No]],
  )).flatten(),
))

#let fleet-list(f) = block(breakable: false, {
  let gf = guide-fleet(f.id)
  let paid = find-set(f.set).paid
  // A single fleet already has its name in the page title.
  if fleets.len() > 1 { list-title(gf.name, sub: [#f.ships #f.shipType with #f.fittings]) } else {
    align(center, text(size: 10pt, style: "italic", fill: colors.sub)[#f.ships #f.shipType with #f.fittings])
  }
  parts-table(f.parts, fleet: f, show-base: paid)
})

// ── Document ─────────────────────────────────────────────────────────────

#let doc-title = if bundle != none { lists.bundle.title } else { names(fleets.map(f => guide-fleet(f.id).name)) }
#let versions = set-ids.map(id => {
  let s = find-set(id)
  s.title + " v" + s.version
}).join(", ")

#set document(
  title: "Cannons & Coastlines Print List: " + doc-title,
  author: "Joshua Bemenderfer",
)

#show: book.with(footer-right: [Print List])
#set page(margin: (x: 0.4in, top: 0.35in, bottom: 0.45in))

// Title block: the rulebook's section title, with the versions under it.
#align(center)[
  #text(font: display-font, size: 24pt, fill: colors.heading)[#doc-title print list]
  #v(-0.14in)
  #line(length: 45%, stroke: 0.8pt + colors.gold)
  #v(-0.06in)
  #text(size: 9pt, fill: colors.faded, style: "italic")[#versions. Online at #short-url(page-url).]
]

#if bundle != none [
  #text(size: 9.5pt)[#rich(lists.bundle.intro)]
]

#let compact(body) = {
  set par(justify: false)
  set par(spacing: 0.55em, leading: 0.55em)
  set enum(spacing: 0.45em, indent: 0.05in, body-indent: 0.08in)
  set text(size: 9pt)
  body
}

// Every file on this list, for the steps' `needs`.
#let files-here = {
  let fs = fleets.map(f => f.parts.map(p => p.file)).flatten()
  if has-base {
    fs += ("perPlayer", "perTable").map(sec => lists.general.at(sec).parts.map(p => p.at("files", default: (p.file,)))).flatten()
  }
  fs
}

// The settings from print-guide.yml, in one row. The part tables say which
// parts need supports.
#let settings-block = {
  let rows = guide.settings.rows.map(r => (r.at(0), r.at(1)))
  set par(justify: false)
  block(width: 100%, above: 0.12in, below: 0.1in, inset: (x: 8pt, y: 6pt), radius: 2pt,
    stroke: 0.5pt + colors.box-border, fill: rgb(245, 235, 220, 70),
    grid(
      // Three to a row. The middle column gets the long ones (layer height,
      // orientation).
      columns: (1fr, 1.7fr, 1fr),
      column-gutter: 12pt,
      row-gutter: 5pt,
      ..rows.map(((k, v)) => [
        #text(size: 7.5pt, weight: 700, fill: colors.brown, tracking: 0.8pt)[#upper(k)] \
        #text(size: 9pt)[#rich(v)]
      ]),
    ),
  )
}

#let steps-section = {
  list-title(lists.steps.title)
  compact(enum(..lists.steps.items
    .filter(st => st.at("needs", default: none) == none or st.needs.any(n => n in files-here))
    .map(st => rich(st.text))))
}

// What a game needs besides the prints. An add-on fleet's list says it
// needs the base set in its steps at the top instead.
#let kit-section = if has-base {
  list-title(lists.kit.title)
  compact(rich(lists.kit.body))
}

// The numbered "How to do it" (print-lists.yml howTo, the `file` wording).
// The free zip has no plates folder, so it points at the page for those.
#let how-to = {
  let h = lists.howTo
  let fill(s) = s.replace("{page}", page-url.replace("https://", "")).replace("{base}", base-url.replace("https://", ""))
  let steps = (
    if bundle == none and not find-set(target).paid { h.get.fileFree } else { h.get.file },
    ..if has-base { () } else { (h.base.file,) },
    h.print.file,
    h.build.file,
  )
  block(width: 100%, above: 0.1in, below: 0.08in, inset: (x: 8pt, y: 6pt), radius: 2pt,
    stroke: 0.5pt + colors.gold, {
      text(size: 7.5pt, weight: 700, fill: colors.brown, tracking: 0.8pt)[#upper(h.title)]
      v(0.02in)
      compact(enum(..steps.map(st => rich(fill(st)))))
    })
}

#how-to

#for f in fleets { fleet-list(f) }

// ----- The shared pieces -----

#if has-base {
  // The base set's two fleets fill the first page; the settings and the
  // shared pieces start the second.
  if bundle == none { pagebreak(weak: true) }
  settings-block
  list-title(lists.general.title)
  for sec in ("perPlayer", "perTable") {
    let s = lists.general.at(sec)
    v(0.04in)
    text(size: 9.5pt, weight: 700, fill: colors.brown, tracking: 0.8pt)[#upper(s.title)]
    parts-table(s.parts)
  }
} else {
  settings-block
}

#steps-section
#kit-section

// The fleet's shop page, and the print guide unless this is it.
#let shop-url = site + "/shop" + if bundle != none { "" } else if has-base { "/base-set-files" } else { "/" + fleets.first().id }
#v(0.1in, weak: true)
#set par(justify: false)
#text(size: 8.5pt, style: "italic", fill: colors.sub)[
  The shop page is #short-url(shop-url)#if page-url != base-url [, and the print guide is at #short-url(base-url)].
]
