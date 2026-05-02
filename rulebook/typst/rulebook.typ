// Cannons & Coastlines — Rulebook (portrait half-letter, pirate-themed parchment)
//
// Pages are 5.5 × 8.5 portrait so two fit side-by-side on a landscape-letter
// sheet; imposed for printing via impose-booklet.py.
//
// Build via rulebook/typst/build-rulebook.sh. See CLAUDE.md in this directory.

#import "@preview/tiaoma:0.3.0": qrcode

#let assets = "../../rulebook/assets"
#let renders = "../../assets/images/renders"

// Map short coin names used in the rulebook to the rendered file stems.
// The renders are produced by scripts/blender/render_stls.sh from the STLs in
// assets/stls/, so the canonical (long) names live with the meshes.
#let coin-files = (
  brace:    "coin-brace-for-impact-top",
  signal:   "coin-signal-flag-top",
  fullsail: "coin-full-sail-top",
  evasive:  "coin-evasive-maneuver-top",
  gunner:   "coin-skilled-gunner-top",
  repair:   "coin-repair-crew-top",
  boarding: "coin-boarding-party-top",
)

// Pirate-themed palette — parchment base, sepia ink, dried-blood crimson accent,
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
//   display-font — Pirata One — cover + section (level-1) titles, drop caps,
//     and the occasional decorative glyph.
//   body-font    — Crimson Text — body copy, italics, subsection headings
//     (rendered in bold small-caps via upper() + tracking), table headers,
//     footer, everything else.
#let display-font = ("Pirata One",)
#let body-font    = ("Crimson Text",)

#let version       = "v0.3"
#let version-long  = "v0.3, In Development · Subject to Change"

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

// Anchor flanked by two short gold rules — used as a section separator.
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

// Coin icon — inline image referenced by short name, e.g. #coin("brace").
// Aligned to baseline via a fixed height so it sits nicely in running text
// and table cells alike.
#let coin(name, size: 2.2em) = box(
  baseline: 28%,
  image(renders + "/" + coin-files.at(name) + ".png", height: size),
)

// Rule-highlight callout — crimson left bar, subtle parchment fill.
#let callout(body) = block(
  width: 100%,
  inset: (x: 0.16in, y: 0.14in),
  radius: 2pt,
  stroke: (left: 3pt + colors.crimson, rest: 0.5pt + colors.box-border),
  fill: rgb(245, 235, 220, 90),
  breakable: true,
  body,
)

// Ability / rule-box — framed block with a small heading.
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

// High-contrast box — for Quick Reference. Dark border + heavier fill.
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

// Drop cap for section openings — fake "illuminated" capital using Pirata One
// dropped into a text paragraph. Size tuned for 2-column body.
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

// Footer shown on every page except the cover.
#let page-footer = context {
  let n = counter(page).get().first()
  set text(font: body-font, size: 8pt, fill: colors.faded, tracking: 1.2pt)
  grid(
    columns: (1fr, auto, 1fr),
    align: (left, center, right),
    upper[Cannons \& Coastlines],
    text(font: body-font, size: 9pt, fill: colors.gold)[✦ #n ✦],
    upper[#version · In Development],
  )
}

// ==== PAGE SETUP ========================================================

#set document(
  title: "Cannons & Coastlines Rulebook",
  author: "Joshua Bemenderfer",
)

#set page(
  width: 5.5in, height: 8.5in,         // portrait half-letter
  margin: (x: 0.45in, y: 0.5in),
  background: parchment-bg,
  footer: page-footer,
  footer-descent: 0.15in,
)

#set text(
  font: body-font, size: 10.5pt,
  fill: colors.ink, hyphenate: false,
)
#set par(leading: 0.65em, justify: true, first-line-indent: 0pt, spacing: 0.9em)

// List tuning — loose enough that bullets and numbered steps read as
// distinct thoughts rather than a dense block.
#set list(indent: 0.12in, body-indent: 0.1in, spacing: 0.75em)
#set enum(indent: 0.12in, body-indent: 0.1in, spacing: 0.75em)
// List/enum items are usually short directives, not flowing prose; ragged-right
// reads better and avoids loose word spacing.
#show list: set par(justify: false)
#show enum: set par(justify: false)

// ==== HEADING RULES =====================================================

// Shared section-title renderer — used by the level-1 heading rule AND by
// inline section starts that want the title block without forcing a new column.
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

// Level 1: major section title — Pirata One, centered, gold rules flanking.
#show heading.where(level: 1): it => {
  // Break to a new page so sections have room to breathe; use a weak break so
  // the very first section doesn't force a blank page after the cover.
  pagebreak(weak: true)
  section-title(it.body)
  set align(left)
}

// Level 2: subsection — bold small-caps serif, sepia, thin rule under.
#show heading.where(level: 2): it => {
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

// Level 3: minor heading — bold small-caps serif, crimson.
#show heading.where(level: 3): it => {
  v(0.16in, weak: true)
  text(
    font: body-font, weight: 700, size: 10.5pt,
    fill: colors.crimson-dim, tracking: 0.6pt,
  )[#upper(it.body)]
  v(0.06in, weak: true)
}

// ==== TABLE STYLE =======================================================

// Header row gets a tall, generously padded brown band (reads like a title
// bar). Body rows stay compact. Inset is a function of row index.
#set table(
  stroke: none,
  inset: (_, y) => if y == 0 { (x: 12pt, y: 10pt) } else { (x: 8pt, y: 7pt) },
  fill: (_, y) => if y == 0 { colors.brown }
                 else if calc.odd(y) { colors.stripe }
                 else { none },
)
// Breathing room around tables so they don't butt up against paragraphs.
#show table: set block(above: 0.15in, below: 0.15in)
// Header row text: cream caps on brown. Use a block with generous vertical
// padding so the brown band visibly surrounds the text — the cell's own
// inset alone doesn't reliably leave breathing room around bold small caps.
#show table.cell.where(y: 0): it => block(
  width: 100%,
  inset: (y: 7pt),
  align(center, text(
    font: body-font, weight: 700, size: 9.5pt,
    fill: colors.cream, tracking: 1pt,
  )[#upper(it.body)]),
)
// Body cells: tighter leading than running body copy.
#show table: set par(leading: 0.52em, justify: false)

// Strong is used throughout — render in brown/heading color, not black.
#show strong: set text(fill: colors.heading)
#show emph: set text(fill: colors.sub)

// ==== COVER PAGE ========================================================

#{
  // Footerless, marginless cover.
  set page(footer: none, margin: 0in)
  set align(center + horizon)
  block(width: 100%, height: 100%)[
    #v(0.3in)
    #image(assets + "/logo-with-wordmark.png", width: 72%)
    #v(0.1in)
    // Decorative sub-rule: gold line — crossed-cannons glyph — gold line.
    #box(width: 55%)[
      #grid(
        columns: (1fr, auto, 1fr),
        align: (horizon, horizon, horizon),
        column-gutter: 10pt,
        line(length: 100%, stroke: 0.8pt + colors.gold),
        text(font: body-font, size: 18pt, fill: colors.gold)[✦ ⚓ ✦],
        line(length: 100%, stroke: 0.8pt + colors.gold),
      )
    ]
    #v(0.15in)
    #text(
      font: body-font, size: 20pt,
      fill: colors.sub, style: "italic",
    )[A Tabletop Naval Conquest Game]
    #v(0.06in)
    #text(
      font: body-font, size: 13pt,
      fill: colors.brown, tracking: 3pt, weight: 500,
    )[#upper[Rules of Play]]
    #v(0.6in)
    // Version block
    #block(
      width: 42%,
      inset: (x: 0.2in, y: 0.15in),
      stroke: 0.6pt + colors.gold,
      fill: rgb(247, 238, 217, 120),
    )[
      #set par(justify: false)
      #text(
        font: body-font, weight: 700, size: 22pt,
        fill: colors.crimson-dim, tracking: 1pt,
      )[#version]
      #v(-0.04in)
      #text(
        font: body-font, weight: 700, size: 9pt,
        fill: colors.brown, tracking: 1.5pt,
      )[#upper[In Development · Subject to Change]]
      #v(0.04in)
      #text(
        font: body-font, style: "italic", size: 10pt,
        fill: colors.sub,
      )[Rules, factions, and fleet compositions may shift as we playtest.]
    ]
  ]
}

// ==== BODY (single-column portrait half-letter) ========================

// Helper: full-column-width content (used for inline tables/boxes that want
// to shrink the trailing paragraph gap).
#let tight(body) = block(width: 100%, above: 0.08in, below: 0.12in, body)

// ----- Welcome -----

= Welcome Aboard

#drop-cap("C")[*annons \& Coastlines* is a tabletop naval game for 2 to 20 players. Each player commands a small fleet of 3D-printed ships that roll across the table on built-in wheels. The ships fire real, tension-loaded miniature cannons and cannonballs. The game has no dice, board, or grid. Everything is played with physical 3d miniatures. Just the ships, the islands between them, and the coins earned from holding those islands.]

#v(0.08in)

#ability-box("At the Table")[
  *Players:* 2–20 (2–6 Default · 6–20 Group) · *Ages:* 10+ · *Play time:* 30–90 min
]

== How It Works

On each turn, every one of the ships in your fleet takes one action: it either moves, fires, or (if it's touching an island) performs an island action. To move, swivel the ship and push it forward along its wheels. The wheels click to count movement. To fire, plug one of your cannons into a slot on the ship and press down on the firing mechanism until the shot releases. The shot goes straight out from the slot, so you line up your aim with a Move action *before* the turn you fire.

Each cannonball hit removes one *fitting* (a removable piece off your ship, like masts or cargo) from the target ship. A ship with no fittings left is *dead in the water:* it can no longer move, but it can still fire. The bare hull can absorb *one more hit* after the last fitting is gone; the hit after that sinks the ship.

Islands sit between the fleets. Capture one by planting your flag on it and it will pay out *coins.* Coins can be spent at the start of any turn for one-time effects listed in the Coin Actions section, or hoarded as victory points.


// ----- Print List -----

= Setup

+ *Build your fleet.* Claim a faction's ships, flags, cannons, and cannonballs. Place your faction card in front of you for reference. (Bonus: Design your own paper flags!)

+ *Place the islands.* Going clockwise, each player sets one island on the table. Keep islands at least *6" apart* and *12" from any table edge*.

+ *Add terrain (optional).* Together, place 2–6 rocks or reefs anywhere on the table. Terrain blocks ships and breaks up firing lanes. You can use household objects for this. It's up to you how many obstacles to add.

+ *Deploy your fleet.* Claim an edge of the table and line your ships up within *3"* of it, facing inward. (Islanders: use _Home Waters_ now to place your starting ship at an island.)

+ *Fill the bag.* Put all coins into the draw bag and shake it to mix.

+ *Begin play.* The youngest player goes first. Play passes clockwise. Choose Default mode (2–6 players) or Group mode (6–20 players).

#tight(table(
  columns: (1fr, 1fr),
  table.header[Players][Islands],
  [2],                 [4],
  [3–4],               [6],
  [5–6],               [8],
  [Group mode (6–20)], [10–12],
))


// ----- Your Turn -----

= Your Turn

A turn has two steps, in this order:

+ *Spend coins* you want to use, before any ship moves or fires.
+ *Each of your ships takes one action.*

Play then passes to the next player.

== Spending Coins

Coins are not actions. They are spent *at the start of your turn,* before any ship moves or fires. You may spend any number of coins on a single turn. After a coin's effect resolves, return it to the bag.

There is *no hand limit.* You may hold as many coins as you collect.

== Action A: Move

A Move action has two steps: *Set Heading* (rotate the ship up to *90°*, port or starboard), then *click* the ship forward. One click is one revolution of the ship's movement wheel (see *The Wheel*). You cannot change heading between clicks.

The number of clicks equals your faction's *Move Count*:

#tight(table(
  columns: (0.8fr, 2fr),
  table.header[Move Count][Sequence],
  [1], [Set Heading → Click],
  [2], [Set Heading → Click → Click],
  [3], [Set Heading → Click → Click → Click],
))

Ships cannot pass through other ships, islands, rocks, or reefs. If a ship contacts any of these during a click, it stops there and forfeits any remaining clicks this turn.

#callout[
  *Queen's Fleet, Disciplined Crew.* Queen's Fleet ships can swing a full *180°* instead of 90°, once per ship per turn.
]

== Action B: Fire

+ Take one of your cannons.
+ Plug it into any open slot on the ship.
+ Load a cannonball, then press down on the firing mechanism until the shot fires.
+ Remove the cannon from the slot.

Cannons fire *straight out from the slot.* A ship that fires *does not move or rotate* this turn, so your aim is whatever direction the ship is already pointing. Line up the angle with a prior Move action, then commit to the shot. The same cannon can be used by more than one ship in a single turn; simply move it from one ship to the next.

== Action C: Island

If your ship is *touching an island*, it may take one of the following actions instead of moving or firing:

- *Raise Flag.* Plant your flag on the island. The island must be empty (or have just been cleared of defenders), and your ship must have been touching the island *at the end of your previous turn*.
- *Collect.* The island must already fly *your flag*. Draw 1 coin from the bag at random.
- *Fire from Island.* The island must already fly your flag. Plug a cannon into one of the island's cannon slots and fire as normal. Islands have cannon coverage in all directions.

Each ship takes at most one island action per turn.

// ----- Islands -----

== Islands

Each island flies *one flag at a time*.

- *Empty island with ships from multiple fleets touching it.* No one may raise a flag until only one fleet's ships remain in contact with the island.
- *Enemy flag on the island.* Drive off all enemy ships from the island first. Then capture the island as normal.
- *Your island, your ships (or a teammate's ships).* No conflict; the flag stays.
- *Dead-in-the-water ships do not defend an island.* A dead ship touching your island does not block an enemy capture. However, if the enemy captures the dead ship first and repairs it, that ship *does* count as a defender afterward.


// ----- Combat -----

= Combat

When a cannonball hits an enemy ship, remove one *fitting* (masts or cargo) from the ship and set it in the water beside the ship. No friendly fire.

- *Ship has no fittings left.* It is *Dead in the Water.* It cannot move, but it can still fire. The bare hull can still take *one more hit* before sinking.
- *Hit on a dead-in-the-water ship.* The ship is *Scuttled* and removed.
- *Missed shots.* Retrieve missed cannonballs at the end of your turn.

#callout[
  *Total hits to sink = Fittings + 1.* A ship with 3 fittings absorbs 3 hits to remove its fittings (leaving it dead in the water), then sinks on the 4th.
]

== Boarding

While your ship is *touching* an active enemy ship, you may spend #coin("boarding") *Boarding Party* to remove 1 fitting from that enemy ship.

== Capturing a Dead Enemy Ship

While your ship is touching a dead-in-the-water enemy ship, spend *both* #coin("boarding") *Boarding Party* and #coin("repair") *Repair Crew* on the same turn. Restore *1 fitting* under your own flag. The captured ship becomes part of your fleet and may act on the following turn.

== Scuttling

A dead-in-the-water ship sinks on the next hit it takes. You may scuttle one of your *own* dead ships to prevent an enemy from capturing it.

== Repairing

Spend #coin("repair") *Repair Crew* to restore 1 fitting to one of your ships.

- If the ship *still has fittings*, the repair can be made from any distance.
- If the ship is *dead in the water*, another of your ships must touch it to repair.

// ----- Coin Actions (placed here to share the Combat page; flows inline
// without forcing a new column so it sits right below the Combat content) ---

#v(0.2in, weak: true)
#section-title[Coin Actions]

#tight(table(
  columns: (0.6fr, 1.1fr, 2.5fr),
  table.header[ ][Coin][What It Does],
  coin("brace"),    [*Brace for Impact*],  [Place the coin in a ship's coin slot. The next hit that ship takes is negated (no fitting lost) and the coin returns to the bag.],
  coin("signal"),   [*Signal Flags*],      [One of your ships, or one allied ship, immediately takes a free Move action. They may still take a Fire action afterwards.],
  coin("fullsail"), [*Full Sail*],         [One of your ships takes *two* Move actions this turn. Each is a full Set Heading followed by Move-Count clicks.],
  coin("evasive"),  [*Evasive Maneuvers*], [One of your ships slides exactly *one ship-width sideways* (port or starboard) without rotating. This does not use that ship's action.],
  coin("gunner"),   [*Skilled Gunner*],    [One of your ships *fires twice* this turn. You may move the cannon between shots.],
  coin("repair"),   [*Repair Crew*],       [Restore 1 fitting to one of your ships. *Required to capture a dead-in-the-water enemy ship.*],
  coin("boarding"), [*Boarding Party*],    [While touching an enemy ship, remove 1 fitting from it. *Required to capture a dead-in-the-water enemy ship.*],
))

Each player contributes 20 coins to the bag at setup: 2 Brace · 2 Signal · 4 Full Sail · 2 Evasive · 4 Gunner · 4 Repair · 2 Boarding.


// ----- Winning -----

= Winning

The game ends in one of three ways:

- *Last fleet afloat.* Only one player still has ships on the table. That player wins.
- *Declared victory.* At the start of your turn, declare victory if you believe you have *25 or more points*. Tally all players' scores. If yours is still at least 25 and is higher than or tied with the next-highest, you win.
- *Stalemate.* Every island is under a flag and no island changed hands during the previous two rounds. Proceed to scoring. (optional)

== Scoring

#tight(table(
  columns: (2.2fr, 0.6fr),
  table.header[What You Have][Points],
  [Each surviving ship],       [*3*],
  [Each island you hold],      [*2*],
  [Each unspent coin],         [*1*],
  [_Bonus:_ most ships],       [*+2*],
  [_Bonus:_ most islands],     [*+2*],
  [_Bonus:_ most coins],       [*+2*],
))

Ties on bonuses: every tied player receives the full +2. Highest total wins. In Fleet play, score the fleet as a single player.

*Example.* A player with 1 ship, 3 islands, and 12 coins (earning both the most-islands and most-coins bonuses) scores 3 + 6 + 12 + 2 + 2 = *25*. An opponent with 3 ships, 2 islands, and 4 coins (earning the most-ships bonus) scores 9 + 4 + 4 + 2 = *19*. The first player wins.


// ----- Alternate Modes -----

= Alternate Modes

Three optional modes layer on top of the standard 2–5 player game: *Group Mode* for parties, *Fleets \& Alliances* for cooperative or shifting-loyalty play, and *Custom Armada* for large mixed-faction battles.

== Group Mode (6–20 Players)

All players act simultaneously. Play alternates between two phases, each on a *60–90 second timer*:

- *Movement phase.* Spend movement coins (*Evasive*, *Full Sail*, *Signal Flags*), then each ship may take a Move action.
- *Action phase.* Spend action coins (*Brace*, *Gunner*, *Repair*, *Boarding*), then each ship may Fire or take an Island action.

Choose one player as the *moderator*. They announce phases, run the timer, and resolve disputes. Group mode is intentionally more chaotic than the standard game and is best suited for parties or large gatherings.

== Fleets \& Alliances

*Fleets (team play).* Two or more players share a single fleet. Each commands one ship and resolves their action simultaneously on the fleet's turn. Coins and the faction passive belong to the fleet, so agree on spends together. Turn order alternates by fleet. Example: six players, two three-player Queen's Fleet sides. The fleets alternate, and on each turn all three teammates act at once.

*Alliances.* For free-for-all games. Players form or break informal pacts at any time, updating flag colors when allegiances shift. Allies may *freely trade coins, ships, and islands*.

*Watch for at the table.*

- *Crippled-ship leverage.* Near-sunk players trade alliances for *Repair* coins or covering fire, sometimes flipping the game in a turn.
- *Bluffed shots.* Aim is visible a turn early; line up a shot you never fire and watch opponents divert.
- *Sacrificial hulls.* A dead-in-the-water ship still fires and blocks. Park a damaged ship in a chokepoint and it becomes a battle arena. Opponents pile in to capture or scuttle.

== Custom Armada

#emph[Contributed by Joshua David]

A large-scale variant for advanced games. Each player fields a mixed armada of up to *15 ships* drawn from any factions, trading coordination for sheer presence.

*Build your armada.*

- Up to *15 ships* per player. No more than half may belong to a single faction.
- Use only the *printed values* (movement, cannon slots, fittings). All faction abilities are ignored.
- Recommended size by table: 4×4 ft → 4–6 ships, 5×5 ft → 6–9, 6×6 ft → 8–12, 6×8 ft or larger → 10–15.

*Coin cap.* An armada may hold at most *20 coins*. Any earned beyond that go straight back to the bag.

*Restricted actions.* Coordinating a large mixed fleet is hard:

- Only *3 ships* may take Move actions each turn.
- Any number of ships may *Fire* or take *Island actions*.

*Squadrons (optional).* Divide the armada into 2–3 Squadrons of 3–6 ships each. Each Squadron picks a *Squadron Flagship*; the whole armada also picks a single *Fleet Flagship*. Fleet Flagship effects apply armada-wide. Squadron Flagship effects apply only within their Squadron.

*Command Shock.* If a Flagship is sunk, the affected force loses control.

- *Fleet Flagship sunk.* The entire armada suffers shock. Remove your flags from every island you hold (they become neutral). Move every ship currently touching an island within *6"* of your table edge, facing inward. Take no actions and spend no coins for one full turn. Then designate a new Fleet Flagship and resume.
- *Squadron Flagship sunk.* Only that Squadron suffers shock, with the same effects limited to its ships and islands. Designate a new Squadron Flagship after.

*Scoring.* Standard scoring applies, except *surviving ships are worth 0 VP*. Islands, unspent coins, and bonus categories are unchanged. A Custom Armada wins by holding ground long enough for its numbers to matter, not by size alone.

// ----- Factions Overview -----

= The Seven Factions

*Queen's Fleet* and *Corsairs* come in the base game. The other five are expansion packs. The *Faction Reference Cards* have the full stats; these are just quick sketches of how each one plays.

#let faction-entry(name, body) = block(breakable: false, below: 0.14in)[
  #text(font: body-font, weight: 700, size: 11pt, fill: colors.crimson-dim, tracking: 0.6pt)[#upper(name)]
  #v(0.09in, weak: true)
  #body
]

#faction-entry("Queen's Fleet")[
  A good pick for a first game.

  *Disciplined Crew:* swings *180°* instead of 90°, so maneuvering mistakes are easy to walk back.
]
#faction-entry("Corsairs")[
  Faster and more numerous than the Queen's Fleet, with thinner hulls.

  *Plunder:* an *extra coin* on every successful board or capture, so their economy rewards picking fights.
]
#faction-entry("Treasure Fleet")[
  Only two ships on the table, but every island they hold pays double.

  *Bountiful Harvest:* *2 coins* per collect instead of 1, so even a small holding funds big plays.
]
#faction-entry("Sun Fleet")[
  Slow to cross the table, but punishing to chip at.

  *Stone Hulls:* *ignores the first hit* each turn, which makes spreading fire on them useless. One big salvo works; pecking at them doesn't.
]
#faction-entry("Shadow Fleet")[
  Average across every stat, with one trick that changes the math.

  *Return from the Deep:* sunken ships come back on a coin spend, so trading hulls isn't as final as it looks.
]
#faction-entry("The Industry")[
  Two cannon slots per ship: a *forward-facing* bow gun and a rotating turret that can fire any direction.

  *Rotating Turret:* the second slot sits in a *turret fitting* that swivels. Like any fitting, the turret can be shot off; if that happens, only the bow slot remains until it's repaired.
]
#faction-entry("The Islanders")[
  Fast, numerous, and each one folds to a *single hit*. Played well, the numbers make up for the paper hulls.

  *Home Waters:* a free starting island.
]


// ----- Parts gallery (visual reference — what each piece is and a print color) -----

#let part-row(render-file, name, desc, color) = (
  align(center + horizon, image(renders + "/" + render-file + ".png", height: 0.78in)),
  [*#name.* #desc],
  color,
)

= The Parts

Every printed piece in the base set, with what it does and recommended print color. Faction ships and fittings vary in shape; the colors below are the default suggestions, but flag color or alliance color always wins if you'd rather match.

#tight(table(
  columns: (0.8in, 1.7fr, 1.1fr),
  align: (center + horizon, left + horizon, left + horizon),
  table.header[Image][Piece][Color],

  ..part-row("ship-queens-fleet", "Ship",
    [The hull, with a wheel built into the stern and cannon slots along the deck. Each faction has its own ship model.],
    [Faction or alliance color. Queen's Fleet ships shown in *blue-grey*; Corsairs in *black*.]),

  ..part-row("mast", "Mast",
    [A removable *fitting* that plugs into the deck. Print horizontally.],
    [*Wood/Brown or Black*]),

  ..part-row("cargo", "Cargo",
    [A removable *fitting* representing crates of supplies.],
    [*Wood/Brown.* Any natural wood tone reads correctly.]),

  ..part-row("sail", "Sail",
    [Slides over the mast. Cosmetic, decorate and modify as you desire.],
    [*White, black, or custom*]),

  ..part-row("sail-damaged", "Damaged Sail",
    [Torn sail variant.],
    [*White, black, or custom*]),

  ..part-row("cannon", "Cannon",
    [The tension-loaded firing mechanism. Plugs into cannon slots.],
    [*Black, gunmetal grey, or custom*]),

  ..part-row("cannonball", "Cannonball",
    [Loaded into the cannon and fired across the table. *EASY TO LOSE*],
    [A *bright color* like neon green or orange for easy recovery. *TPU* optional for less bounce.]),

  ..part-row("movement-wheel", "Movement Wheel",
    [Insert into wheel carriage. One full revolution is one *click* of movement.],
    [*Any color*. Wrap a *thin rubber band* around the rim before assembly.]),

  ..part-row("movement-wheel-carriage", "Wheel Carriage",
    [Holds the movement wheel inside the hull. Printed once per ship and assembled with the wheel before first play.],
    [*Any color*. Insert into rectangular slot in bottom of ship.]),

  ..part-row("paper-flag-holder", "Paper Flag Holder",
    [The *primary flag mount.* Slide a paper flag of any design into the slot on the side, then place the holder on top of a mast.],
    [*Any color*]),

  ..part-row("flag-printed", "Printed Flag (optional)",
    [A fully 3D-printed flag for players who really want one in solid plastic instead of paper.],
    [*Fleet or alliance color.*]),

  ..part-row("island-topper", "Island Topper",
    [A small puck with cannon slots and flag holes. Turns any household object into an island.],
    [*Sand*, *grey*, or *green*; Terrain colors.]),

  ..part-row("coin-boarding-party", "Coins (×7 types)",
    [Drawn from the bag and spent at the start of your turn for one-time effects.],
    [*Gold*]),
))

// ----- Print List (8th-grade reading level — aimed at whoever's printing) ---

= The Print List

A *faction set* is one complete print run for one player: their fleet plus a fair share of shared terrain and coins. Print one set per player. The only non-printed parts are the draw bag (any small cloth pouch) and the wheel rubber bands. Print at *0.2 or 0.16mm* layer height, *15%* infill.

== Per Faction Set

#tight(table(
  columns: (0.6fr, 0.7fr, 1.7fr),
  table.header[Piece][Quantity][Notes],
  [Ships], [2–5],     [Some ship models may print better with supports enabled.],
  [Masts],             [1 per ship + 1 per island],  [Good to have a few spares as well.],
  [Sails],                [1 per mast], [Decorate to customize your fleet.],
  [Cannons],              [3–4],     [You can get away with one, but it's good to have options if one fails.],
  [Cannonballs],          [10],   [Coarser layer heights causes cannonballs to shoot stronger and less predictably. *TPU* with three walls and no infill reduces bounce.],
  [Flag holders],          [1 per mast + 5 spare], [Enough to cover your ships, islands, and any ships you might capture],
  [Movement wheel + carriage], [1 per ship], [Pre-assemble with a rubber band over the wheel before the first game. Difficult to remove once installed.],
  [Islands],              [2–3],     [Print island models or use *Island Toppers* that sit on top of household objects],
  [Rocks / Reefs],   [2-4],       [Optional terrain. Block movement and cannonballs.],
  [Coins],                [1 set of 20], [Each set is 2 Brace, 2 Signal, 4 Full Sail, 2 Evasive, 4 Gunner, 4 Repair, 2 Boarding.],
))

// ----- Designer Notes (8th-grade level — for whoever's building the game) -----

= Designer Notes

== Cannon Calibration

The cannons fire by flexing printed plastic under tension, so two copies of the same cannon will rarely shoot with exactly the same force. The firing arm also softens slightly with use. *Fire a few practice rounds at the start of each game* so everyone can calibrate their aim before the first real shot counts.

== The Wheel

Every ship has a wheel built into the stern. Two details matter:

- Wrap a thin rubber band around the rim before assembling the wheel into the carriage. The wheel needs the band to click at all; without it, the rim slides on the table instead of rolling.
- The wheel has a *flat spot* on one side. One full revolution brings the flat back to the table, ending one *click* and parking the ship between turns.

== Print Tips

- Print everything in *PLA* or *PETG* unless noted. It's rigid enough for the cannon mechanism and cheap enough to replace when pieces wear out.
- Cannonballs can be printed in *TPU*. They weigh about the same but bounce far less, which keeps shots closer to where they land.
- The cannon's flex arm is the part to orient carefully. Lay it so the print layers run *across* the bending direction, not along it. Layer lines parallel to the flex will split under load.
- Print a few spare cannons per player. The snap mechanism loses tension after hundreds of shots. Swapping in a fresh cannon restores the original feel without reprinting the whole fleet.
- Bed leveling is critical. A nozzle to close to the bed may cause pieces like masts not to fit in their slots.

// ==== QUICK REFERENCE (stacked boxed reference) ========================

#pagebreak(weak: true)

#align(center)[
  #v(0.02in)
  #text(
    font: display-font, size: 32pt,
    fill: colors.heading, weight: 400,
  )[Quick Reference]
  #v(-0.05in)
  #line(length: 35%, stroke: 0.8pt + colors.gold)
]

#v(0.12in)

// Single-column stack of reference boxes — each spans the full body width
// on the narrower half-letter page.
#grid(
  columns: 1,
  row-gutter: 0.12in,

  contrast-box("Actions: One per ship per turn")[
    #set par(leading: 0.5em)
    - *A, Move:* Set Heading (≤ 90°), then click forward × Move Count.
    - *B, Fire:* Plug cannon into a slot. Press to fire. Ship stays put.
    - *C, Island:* _Pick one:_ Raise flag · Collect 1 coin · Fire from island slot. Ship stays put.

    _Spend coins at the start of your turn, before ship actions._
  ],

  contrast-box("Cannon Firing")[
    + Pick a ship and a cannon slot.
    + Plug the cannon in.
    + Ship cannot move or rotate; aim was set by a prior Move.
    + Press the mechanism. Fire.
  ],

  contrast-box("Victory Points")[
    #table(
      columns: (2.1fr, 0.6fr),
      stroke: none,
      inset: (_, y) => if y == 0 { (x: 6pt, y: 7pt) } else { (x: 6pt, y: 6pt) },
      fill: (_, y) => if y == 0 { colors.brown }
                     else if calc.odd(y) { colors.stripe }
                     else { none },
      table.header[What You Have][Points],
      [Each surviving ship], [*3*],
      [Each island you hold], [*2*],
      [Each unspent coin], [*1*],
      [Most in any category], [*+2*],
    )
    _Declare Victory at start of turn with ≥ 25 points._
  ],

  contrast-box("Hit Resolution")[
    #table(
      columns: (1.3fr, 1.3fr),
      stroke: none,
      inset: (_, y) => if y == 0 { (x: 6pt, y: 7pt) } else { (x: 6pt, y: 6pt) },
      fill: (_, y) => if y == 0 { colors.brown }
                     else if calc.odd(y) { colors.stripe }
                     else { none },
      table.header[What Happened][Result],
      [Hits enemy ship],    [Pull 1 fitting],
      [No fittings left],   [*Dead in the water.* No move, can fire, 1 hit left],
      [Dead ship hit again],[*Scuttled.* Gone for good],
      [Hits friendly ship], [Nothing],
      [Hits terrain],       [Nothing],
    )
  ],

  contrast-box("Capturing Things")[
    #table(
      columns: (1fr, 1.6fr),
      stroke: none,
      inset: (_, y) => if y == 0 { (x: 6pt, y: 7pt) } else { (x: 6pt, y: 6pt) },
      fill: (_, y) => if y == 0 { colors.brown }
                     else if calc.odd(y) { colors.stripe }
                     else { none },
      table.header[Target][How],
      [Dead enemy ship],      [Touch it + spend #coin("boarding", size: 1.6em) Boarding \& #coin("repair", size: 1.6em) Repair (same turn). Joins fleet at 1 fitting.],
      [Uncaptured island],    [Touch it, wait a turn, then Raise Flag.],
      [Undefended enemy island], [Touch, wait a turn, swap flag.],
      [Defended enemy island],[Clear defenders, then capture as above.],
    )
  ],

  contrast-box("Coin Cheatsheet")[
    #set par(first-line-indent: 0pt, leading: 0.6em, spacing: 0.7em)
    #stack(dir: ttb, spacing: 0.5em,
      [#coin("brace", size: 1.6em) *Brace:* shield next hit.],
      [#coin("signal", size: 1.6em) *Signal:* free Move (ally ok).],
      [#coin("fullsail", size: 1.6em) *Full Sail:* double Move.],
      [#coin("evasive", size: 1.6em) *Evasive:* slide one ship-width.],
      [#coin("gunner", size: 1.6em) *Gunner:* fire twice.],
      [#coin("repair", size: 1.6em) *Repair:* restore 1 fitting.],
      [#coin("boarding", size: 1.6em) *Boarding:* 1 hit at contact.],
    )
  ],
)

#v(0.2in)

#align(center)[
  #fleuron
  #v(0.05in)
  #text(font: body-font, size: 11pt, fill: colors.faded, style: "italic")[
    Fair winds and a following sea.
  ]
]

#pagebreak()

= Set Sail Online

#v(0.05in)

#align(center)[
  #box(stroke: 1pt + colors.box-border, inset: 7pt, fill: colors.cream)[
    #qrcode("https://cannonsandcoastlines.com", options: (scale: 2.2))
  ]
]

#v(0.1in)

Drop anchor at *#link("https://cannonsandcoastlines.com")[https:\/\/cannonsandcoastlines.com]* (or scan the QR code above) to:

#set list(indent: 0.15in, body-indent: 0.4em, spacing: 0.9em)
- *Order printed sets.* Boxed games shipped to your door, plus loose components and starter packs.
- *Download the latest rulebook & faction cards.* This is a *preview release*, so rules and cards are still in active revision. The site always carries the current version.
- *Grab the print files.* STLs for every ship, coin, and terrain piece, free for personal printing under the license below.

#v(0.1in)

== License: CC BY-NC-SA 4.0

This rulebook, the artwork, and the printable game files are released under the *Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International* license. Full text at #link("https://creativecommons.org/licenses/by-nc-sa/4.0")[https:\/\/creativecommons.org/licenses/by-nc-sa/4.0]. In plain terms:

#set list(indent: 0.15in, body-indent: 0.4em, spacing: 0.8em)
- *Share & remix freely.* Print sets for yourself and your crew, hand them to friends, modify the files, build on the rules.
- *Give credit.* Attribute the original work to Joshua Bemenderfer and link back to https:\/\/cannonsandcoastlines.com.
- *Non-commercial only.* Don't sell prints, derivatives, or merchandise. Commercial licensing is available; reach out via the website.
- *Share alike.* If you remix or adapt, release your version under this same license so the next captain inherits the same freedoms.

#place(bottom + center, dy: 0.05in,
  text(font: body-font, size: 9pt, fill: colors.faded, tracking: 0.8pt)[
    © Joshua Bemenderfer 2026
  ]
)
