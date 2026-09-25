// Cannons & Coastlines — Rulebook (portrait half-letter, pirate-themed parchment)
//
// Pages are 5.5 × 8.5 portrait so two fit side-by-side on a landscape-letter
// sheet; imposed for printing via impose-booklet.py.
//
// Build via `npx jake rulebook` (scripts/rulebook/build-rulebook.sh).
// See CLAUDE.md in this directory.

#import "@preview/tiaoma:0.3.0": qrcode

#let assets = "../../rulebook/assets"
#let renders = "../../assets/images/renders"

// Map short coin names used in the rulebook to the rendered file stems.
// The renders are produced by scripts/blender/render_stls.sh from the STLs in
// assets/stls/, so the canonical (long) names live with the meshes.
#let coin-files = (
  brace:    "coin-brace-for-impact-top",
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

#let version       = "v0.6"
#let version-long  = "v0.6, In Development · Subject to Change"

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

#drop-cap("C")[*annons \& Coastlines* is a tabletop naval game for 2 to 20 players. Each player commands a small fleet of 3D-printed ships that roll across the table on built-in wheels. The ships fire real, tension-loaded miniature cannons and cannonballs. The game has no dice, board, or grid. Just the ships, the islands between them, and the coins earned from holding those islands.]

#v(0.08in)

#ability-box("At the Table")[
  *Players:* 2–20 (2–6 Default · 6–20 Group) · *Ages:* 10+ · *Play time:* 30–90 min
]

== How It Works

On each turn, every one of the ships in your fleet steers or fires, never both, and then sails forward. A ship touching an island may take an island action instead and hold still. To steer, swivel the ship; to move it, push it along its wheels, which click to count the distance. To fire, plug one of your cannons into a slot on the ship and press down on the firing mechanism until the shot releases. The shot goes straight out from the slot, so you line up your aim *before* the turn you fire.

Each cannonball hit knocks one *fitting* (a removable piece off your ship, like masts or cargo) off the target ship, and the shooter keeps it as a *prize*. A ship with no fittings left is *dead in the water:* it can no longer move, but it can still fire. The bare hull can absorb *one more hit* after the last fitting is gone; the hit after that sinks the ship.

Islands sit between the fleets. Capture one by planting your flag on it and it will pay out *coins.* Coins are spent at the start of any turn for one-time effects listed in the Coin Actions section. Points come from the islands you hold and the prizes in front of you, so the fleet that wins is the one that fights for them.


// ----- Print List -----

= Setup

+ *Build your fleet.* Claim a faction's ships, flags, cannons, and cannonballs. Place your faction card in front of you. (Bonus: Design your own paper flags!)

+ *Choose a table.* A *6 ft round* or a *6 or 8 ft folding table* works well.

+ *Place the islands.* Going clockwise, each player sets one island on the table. Keep islands at least *6" apart* and *12" from any table edge*. On a narrow folding table, run them down the middle, as far from the long edges as it allows; if the count below does not fit, place as many as do.

+ *Add terrain (optional).* Together, place 2–6 rocks or reefs anywhere on the table. Terrain blocks ships and breaks up firing lanes. You can use household objects for this.

+ *Deploy your fleet.* Claim a stretch of table edge and line your ships up *touching it*, facing inward, fleets spread evenly around the table. With *two players*, sit a *quarter of the way round* a round table from each other, or *diagonally* across a folding table (opposite long sides, opposite halves). With three or more, set a rock just past each end of every fleet's line, a few inches in from the edge. (Islanders: use _Home Waters_ now to place your starting ship at an island.)

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

Each of your ships takes its turn, one at a time. Before any ship starts its turn, you may *spend coins*. Play then passes to the next player.

== Spending Coins

Coins are not actions. Spend them *before a ship starts its turn:* at the start of your turn, or between one ship's turn and the next, never partway through a ship's turn. You may spend any number of coins on a single turn. After a coin's effect resolves, return it to the bag.

There is *no hand limit.* You may hold as many coins as you collect.

== Each Ship

Ships are forever sailing forward. On its turn, each of your ships does two things, in this order:

+ *One action:* Set Heading, Fire, or an Island action.
+ *Click forward* at least once, up to its faction's *Move Count*.

A ship that takes an Island action while touching the island skips the forward click. No ship both steers and fires on the same turn.


== Movement

One click is one revolution of the ship's movement wheel (see *The Wheel*). Every ship ends its turn by clicking forward along its current heading. You cannot change heading between clicks.

// Only three rows; keep them together rather than letting the header repeat.
#block(width: 100%, above: 0.08in, below: 0.12in, breakable: false, table(
  columns: (0.8fr, 2fr),
  table.header[Move Count][Clicks per turn],
  [2], [1–2],
  [3], [1–3],
  [4], [1–4],
))

Ships cannot pass through other ships, islands, rocks, or reefs. If a ship contacts any of these during a click, it stops there and forfeits any remaining clicks this turn.

*Table edges.* A ship that has no room to complete its mandatory click stops at the edge and forfeits any remaining clicks. If it would be forced off the table with no room at all, it is *scuttled* and removed. Plan your headings ahead.

== Action A: Set Heading

Rotate the ship up to *90°*, port or starboard. It adds *no* movement.

#callout[
  *Queen's Fleet, Disciplined Crew.* Queen's Fleet ships can swing a full *180°* instead of 90°, once per ship per turn.
]

== Action B: Fire

+ Take one of your cannons.
+ Plug it into any open slot on the firing ship (or, for *Fire from Island* below, on the island your ship is touching).
+ Load a cannonball, then press down on the firing mechanism until the shot fires.
+ Remove the cannon from the slot.

Cannons fire *straight out from the slot.* A ship that fires *does not Set Heading* this turn, so your aim is whatever direction the ship is already pointing. Line up the angle on an earlier turn, then commit to the shot. The shot resolves before the ship clicks forward. The same cannon can be used by more than one ship in a single turn; simply move it from one ship to the next.

#callout[
  *Cannons need a crew. Your ship is the crew.* To fire any cannon, on a ship or an island, one of your ships must be touching it and spend a Fire action. Held islands cannot fire on their own without a ship in contact.
]

== Action C: Island

Instead of steering or firing, a ship may take one island action:

- *Raise Flag.* Your ship is touching an empty island (or one just cleared of defenders), and was touching it *at the end of your previous turn*. Plant your flag.
- *Fire from Island.* Your ship is touching an island flying your flag. Plug a cannon into one of the island's slots and fire as normal.
- *Collect.* Your ship is *your nearest ship* to an island flying your flag, touching it or not. Draw 1 coin from the bag. Each island pays once per turn. A ship out at sea still clicks forward.

// ----- Islands -----

== Islands

Each island flies *one flag at a time*.

- *Multiple fleets touching an empty island.* No one may raise a flag until only one fleet's ships remain in contact.
- *Enemy flag on the island.* Drive off all enemy ships first, then capture as normal.
- *Your island, your ships (or a teammate's).* No conflict; the flag stays.
- *Dead-in-the-water ships do not defend.* A dead ship at your island does not block enemy capture. But if an enemy captures and repairs the dead ship, it *does* count as a defender afterward.


// ----- Combat -----

= Combat

When a cannonball hits an enemy ship, remove one *fitting* (masts or cargo). The player who fired *keeps it* as a *prize*, and a player who sinks or captures a ship keeps its hull. Prizes score (see *Scoring*). Whenever a fitting or hull goes back onto a ship, take it from whoever holds it. No friendly fire.

- *Ship has no fittings left.* It is *Dead in the Water.* It cannot move or take island actions, but it can still fire its own guns. The bare hull can still take *one more hit* before sinking.
- *Hit on a dead-in-the-water ship.* The ship sinks.
- *Ricochets.* Only the first ship the cannonball touches takes the hit. If it is friendly, the shot is spent. Retrieve missed cannonballs at the end of your turn.

#callout[
  *Total hits to sink = Fittings + 1.* A ship with 3 fittings absorbs 3 hits to remove its fittings (leaving it dead in the water), then sinks on the 4th.
]

== Boarding

While your ship is *touching* an active enemy ship, you may spend #coin("boarding") *Boarding Party* to remove 1 fitting from that enemy ship.

== Capturing a Dead Enemy Ship

While your ship is touching a dead-in-the-water enemy ship, spend *both* #coin("boarding") *Boarding Party* and #coin("repair") *Repair Crew* on the same turn. Restore *1 fitting* under your own flag. The captured ship joins your fleet, acts from your next turn, and counts as a prize hull while it sails for you.

== Scuttling

A dead-in-the-water ship sinks on the next hit it takes. You may scuttle one of your *own* dead ships to prevent an enemy from capturing it. Nobody takes a scuttled hull as a prize.

== Repairing

Spend #coin("repair") *Repair Crew* to restore 1 fitting to one of your ships.

- If the ship *still has fittings*, the repair can be made from any distance.
- If the ship is *dead in the water*, another of your ships must touch it to repair.

// ----- Coin Actions (placed here to share the Combat page; flows inline
// without forcing a new column so it sits right below the Combat content) ---

#v(0.1in, weak: true)
#section-title[Coin Actions]

#tight(table(
  columns: (0.5fr, 1.05fr, 2.65fr),
  table.header[ ][Coin][What It Does],
  coin("brace"),    [*Brace for Impact*],  [Place it in a ship's coin slot. It negates that ship's next hit, then returns to the bag.],
  coin("fullsail"), [*Full Sail*],         [One of your ships *steers and sails twice*: Set Heading and click forward, then again. It does not fire or take an island action this turn.],
  coin("evasive"),  [*Evasive Maneuvers*], [One of your ships slides *one ship-width sideways* without rotating, on top of its turn.],
  coin("gunner"),   [*Skilled Gunner*],    [One of your ships *fires twice* this turn, both before it clicks forward.],
  coin("repair"),   [*Repair Crew*],       [Restore 1 fitting to one of your ships. *Needed to capture.*],
  coin("boarding"), [*Boarding Party*],    [While touching an enemy ship, remove 1 fitting from it. *Needed to capture.*],
))

Each player contributes 20 coins to the bag at setup: 5 Brace · 2 Full Sail · 2 Evasive · 5 Gunner · 4 Repair · 2 Boarding.


// ----- Winning -----

= Winning

The game ends in one of three ways:

- *Last fleet afloat.* Only one player still has ships on the table. That player wins.
- *Declared victory.* At the start of your turn, declare victory if you believe you have *48 or more points*. Tally all players' scores. If yours is still at least 48 and is higher than or tied with the next-highest, you win.
- *Stalemate.* Every island is under a flag and no island changed hands during the previous two rounds. Proceed to scoring. (optional)

== Scoring

#tight(table(
  columns: (2.2fr, 0.6fr),
  table.header[What You Have][Points],
  [Each island you hold],      [*8*],
  [Each prize fitting],        [*4*],
  [Each prize hull],           [*8*],
  [Each unspent coin],         [*1*],
  [_Bonus:_ most ships],       [*+8*],
  [_Bonus:_ most islands],     [*+8*],
))

Surviving ships don't score. Ties on bonuses: every tied player receives the full +8. Highest total wins. In Fleet play, score the fleet as a single player.

*Example.* A player holding 3 islands, 3 prize fittings and 3 coins (earning the most-islands bonus, and tied for most ships) scores 24 + 12 + 3 + 8 + 8 = *55*. An opponent holding 2 islands, 2 prize fittings, 1 prize hull and 5 coins (also tied for most ships) scores 16 + 8 + 8 + 5 + 8 = *45*. The first player declares and wins.


// ----- Alternate Modes -----

= Alternate Modes

Three optional modes layer on top of the standard 2–6 player game: *Group Mode* for parties, *Fleets \& Alliances* for cooperative or shifting-loyalty play, and *Custom Armada* for large mixed-faction battles.

== Group Mode (6–20 Players)

All players act simultaneously. Play alternates between two phases, each on a *60–90 second timer*:

- *Movement phase.* Spend *Evasive Maneuvers*, then every ship away from an island sets heading or holds it, and clicks forward.
- *Action phase.* Spend action coins (*Brace*, *Gunner*, *Repair*, *Boarding*), then every ship that held its heading may Fire, and every ship at an island may take an Island action.

Choose one player as the *moderator*. They announce phases, run the timer, and resolve disputes. Group mode is intentionally more chaotic than the standard game.

== Fleets \& Alliances

*Fleets (team play).* Two or more players share a single fleet. Each commands one ship and resolves their action simultaneously on the fleet's turn. Coins and the faction passive belong to the fleet, so agree on spends together. Turn order alternates by fleet. Example: six players, two three-player Queen's Fleet sides.

*Alliances.* For free-for-all games. Players form or break informal pacts at any time, updating flag colors when allegiances shift.

*Trading.* Any two players may *freely trade coins, ships, and islands* at any time, regardless of alliance. Trades can grease a new pact, buy a turn of safety, or just keep things moving.

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

- Only *3 ships* may *Set Heading* each turn. The rest hold their heading.
- Every ship still clicks forward. Any number of ships may *Fire* or take *Island actions*.

*Squadrons (optional).* Divide the armada into 2–3 Squadrons of 3–6 ships each. Each Squadron picks a *Squadron Flagship*; the whole armada also picks a single *Fleet Flagship*. Fleet Flagship effects apply armada-wide. Squadron Flagship effects apply only within their Squadron.

*Command Shock.* If a Flagship is sunk, the affected force loses control.

- *Fleet Flagship sunk.* The entire armada suffers shock. Remove your flags from every island you hold (they become neutral). Move every ship currently touching an island within *6"* of your table edge, facing inward. Take no actions and spend no coins for one full turn; your ships only click forward. Then designate a new Fleet Flagship and resume.
- *Squadron Flagship sunk.* Only that Squadron suffers shock, with the same effects limited to its ships and islands. Designate a new Squadron Flagship after.

*Scoring.* Standard scoring applies. An armada wins on islands and prizes.

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
  Three slow junks, and every island they hold pays double.

  *Bountiful Harvest:* *2 coins* per collect instead of 1, so even a small holding funds big plays.
]
#faction-entry("Stone Fleet")[
  Slow to cross the table, but punishing to chip at.

  *Stone Hulls:* *ignores the first hit* each turn while at sea. One big salvo works; pecking at them doesn't. Anchored at an island, they're just stone.
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

Every printed piece in the base set, with what it does and recommended print color. Faction ships and fittings vary in shape; flag or alliance color always wins if you'd rather match.

#tight(table(
  columns: (0.8in, 1.7fr, 1.1fr),
  align: (center + horizon, left + horizon, left + horizon),
  table.header[Image][Piece][Color],

  ..part-row("ship-queens-fleet", "Ship",
    [The hull, with a wheel built into the stern and cannon slots along the deck. Each faction has its own ship model.],
    [Faction or alliance color. Queen's Fleet ships shown in *blue-grey*; Corsairs in *black*.]),

  ..part-row("mast", "Mast",
    [A removable *fitting* that plugs into the deck, with the flag holder built into the top: slide a paper flag of any design into the slot. Print horizontally.],
    [*Wood/Brown or Black*]),

  ..part-row("mast-short", "Short Mast",
    [The same mast, shorter. Used on islands and on Islander catamarans.],
    [Same as your masts]),

  ..part-row("cargo", "Cargo & Barrel",
    [Removable *fittings*: a chest of supplies, or a barrel. Either one fills a cargo slot.],
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
    [Insert into the slot in the bottom of the hull. One full revolution is one *click* of movement.],
    [*Any color*. Wrap a *thin rubber band* around the rim before assembly.]),

  ..part-row("island", "Island",
    [A freestanding island with cannon slots and a hole for a short mast to fly your flag. Needs nothing under it.],
    [*Green*, *sand*, or *grey*; Terrain colors.]),

  ..part-row("island-topper", "Island Topper",
    [A small puck with cannon slots and flag holes. Turns any household object into an island.],
    [*Sand*, *grey*, or *green*; Terrain colors.]),

  ..part-row("coin-boarding-party", "Coins (×6 types)",
    [Drawn from the bag and spent before a ship's turn for one-time effects.],
    [*Gold*]),
))

// ----- Print List (8th-grade reading level — aimed at whoever's printing) ---

= The Print List

A *faction set* is one complete print run for one player: their fleet plus a fair share of shared terrain and coins. The only non-printed parts are the draw bag (any small cloth pouch) and the wheel rubber bands. Print at *0.2 or 0.16mm* layer height, *15%* infill. Print the *fit test* first to check that masts, cargo and cannons seat.

== Per Faction Set

#tight(table(
  columns: (0.6fr, 0.7fr, 1.7fr),
  table.header[Piece][Quantity][Notes],
  [Ships], [3–5],     [Some ship models may print better with supports enabled.],
  [Masts],             [1 per ship + 1 per island],  [*Short Masts* go on islands and Islander ships. Print spares.],
  [Cargo and barrels], [Varies by ship],             [Enough to fill your ships' fitting slots.],
  [Sails],                [1 per mast], [Decorate to customize your fleet.],
  [Cannons],              [3–4],     [One works, but spares help when one wears out.],
  [Cannonballs],          [10],   [*TPU* with three walls and no infill bounces less.],
  [Movement wheel],       [1 per ship], [Rubber band over the rim. Hard to remove once in.],
  [Islands],              [2–3],     [Print *Islands*, or put *Island Toppers* on household objects.],
  [Rocks / Reefs],   [2-4],       [Optional terrain. Block movement and cannonballs.],
  [Coins],                [1 set of 20], [Each set is 5 Brace, 2 Full Sail, 2 Evasive, 5 Gunner, 4 Repair, 2 Boarding.],
))

// ----- Designer Notes (8th-grade level — for whoever's building the game) -----

= Designer Notes

== Cannon Calibration

The cannons fire by flexing printed plastic under tension, so two copies of the same cannon will rarely shoot with exactly the same force. The firing arm also softens slightly with use. *Fire a few practice rounds at the start of each game* so everyone can calibrate their aim before the first real shot counts.

== The Wheel

Every ship has a wheel built into the stern. Two details matter:

- Wrap a thin rubber band around the rim before seating the wheel in the hull. The wheel needs the band to click at all; without it, the rim slides on the table instead of rolling.
- The wheel has a *flat spot* on one side. One full revolution brings the flat back to the table, ending one *click* and parking the ship between turns.

== Print Tips

- Print everything in *PLA* or *PETG* unless noted. It's rigid enough for the cannon mechanism and cheap enough to replace when pieces wear out.
- Cannonballs can be printed in *TPU*. They weigh about the same but bounce far less, which keeps shots closer to where they land. Coarser layer heights make them shoot harder and less predictably.
- The cannon's flex arm is the part to orient carefully. Lay it so the print layers run *across* the bending direction, not along it. Layer lines parallel to the flex will split under load.
- Print a few spare cannons per player. The snap mechanism loses tension after hundreds of shots. Swapping in a fresh cannon restores the original feel without reprinting the whole fleet.
- Bed leveling is critical. A nozzle too close to the bed may cause pieces like masts not to fit in their slots.

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

  contrast-box("Each Ship: One action, then click forward")[
    #set par(leading: 0.5em)
    - *A, Set Heading:* Rotate up to 90°. Adds no movement.
    - *B, Fire:* Plug cannon into a slot. Press to fire. No rotating.
    - *C, Island:* Raise flag · Fire from island · Collect (nearest ship, 1 coin).
    - *Then click forward* 1 to Move Count, unless touching an island.

    _Spend coins before any ship's turn._
  ],

  contrast-box("Cannon Firing")[
    + Pick a ship and a cannon slot (on the ship, or on the island it's touching).
    + Plug the cannon in.
    + Ship cannot Set Heading; aim was set on an earlier turn.
    + Press the mechanism. Fire, then click the ship forward.

    _Cannons need a crew. Your ship is the crew._
  ],

  contrast-box("Victory Points")[
    *8* per island held · *4* per prize fitting · *8* per prize hull · *1* per coin · *+8* most ships · *+8* most islands.

    _Declare Victory at start of turn with ≥ 48 points._
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
      [Hits enemy ship],     [Pull 1 fitting, keep it as a prize],
      [No fittings left],    [*Dead in the water.* Own guns only, 1 hit left],
      [Dead ship hit again], [*Sunk.* Shooter keeps the hull],
      [Friendly, terrain, or a ricochet], [Nothing. Only the first contact counts.],
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
      [#coin("fullsail", size: 1.6em) *Full Sail:* steer and sail twice, no firing.],
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
