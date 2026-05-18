// Cannons & Coastlines — The Versatile Admiral (addon ruleset)
//
// Contributed by Joshua David, adapted to the base game by Joshua Bemenderfer.
// Same page geometry, palette, and type as rulebook.typ so a printed copy
// slips behind the main rulebook in the same box.
//
// Build via rulebook/typst/build-versatile-admiral.sh.

#let assets = "../../rulebook/assets"
#let renders = "../../assets/images/renders"

#let coin-files = (
  brace:    "coin-brace-for-impact-top",
  signal:   "coin-signal-flag-top",
  fullsail: "coin-full-sail-top",
  evasive:  "coin-evasive-maneuver-top",
  gunner:   "coin-skilled-gunner-top",
  repair:   "coin-repair-crew-top",
  boarding: "coin-boarding-party-top",
)

#let colors = (
  parchment:   rgb("#f7eed9"),
  cream:       rgb("#faf3e0"),
  stripe:      rgb(210, 185, 145, 40),
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

#let display-font = ("Pirata One",)
#let body-font    = ("Crimson Text",)

#let version      = "v0.3"
#let version-long = "v0.3, In Development · Subject to Change"

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

#let coin(name, size: 2.2em) = box(
  baseline: 28%,
  image(renders + "/" + coin-files.at(name) + ".png", height: size),
)

#let callout(body) = block(
  width: 100%,
  inset: (x: 0.16in, y: 0.14in),
  radius: 2pt,
  stroke: (left: 3pt + colors.crimson, rest: 0.5pt + colors.box-border),
  fill: rgb(245, 235, 220, 90),
  breakable: true,
  body,
)

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

#let page-footer = context {
  let n = counter(page).get().first()
  set text(font: body-font, size: 8pt, fill: colors.faded, tracking: 1.2pt)
  grid(
    columns: (1fr, auto, 1fr),
    align: (left, center, right),
    upper[The Versatile Admiral],
    text(font: body-font, size: 9pt, fill: colors.gold)[✦ #n ✦],
    upper[#version · In Development],
  )
}

// ==== PAGE SETUP ========================================================

#set document(
  title: "The Versatile Admiral — A Cannons & Coastlines Addon",
  author: "Joshua David, with Joshua Bemenderfer",
)

#set page(
  width: 5.5in, height: 8.5in,
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

#set list(indent: 0.12in, body-indent: 0.1in, spacing: 0.75em)
#set enum(indent: 0.12in, body-indent: 0.1in, spacing: 0.75em)
#show list: set par(justify: false)
#show enum: set par(justify: false)

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

#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  section-title(it.body)
  set align(left)
}

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

#show heading.where(level: 3): it => {
  v(0.16in, weak: true)
  text(
    font: body-font, weight: 700, size: 10.5pt,
    fill: colors.crimson-dim, tracking: 0.6pt,
  )[#upper(it.body)]
  v(0.06in, weak: true)
}

#set table(
  stroke: none,
  inset: (_, y) => if y == 0 { (x: 12pt, y: 10pt) } else { (x: 8pt, y: 7pt) },
  fill: (_, y) => if y == 0 { colors.brown }
                 else if calc.odd(y) { colors.stripe }
                 else { none },
)
#show table: set block(above: 0.15in, below: 0.15in)
#show table.cell.where(y: 0): it => block(
  width: 100%,
  inset: (y: 7pt),
  align(center, text(
    font: body-font, weight: 700, size: 9.5pt,
    fill: colors.cream, tracking: 1pt,
  )[#upper(it.body)]),
)
#show table: set par(leading: 0.52em, justify: false)

#show strong: set text(fill: colors.heading)
#show emph: set text(fill: colors.sub)

#let tight(body) = block(width: 100%, above: 0.08in, below: 0.12in, body)

// ==== COVER PAGE ========================================================

#{
  set page(footer: none, margin: 0in)
  set align(center + horizon)
  block(width: 100%, height: 100%)[
    #v(0.4in)
    #image(assets + "/logo-with-wordmark.png", width: 60%)
    #v(0.15in)
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
    #v(0.25in)
    #text(
      font: display-font, size: 40pt,
      fill: colors.crimson-dim, weight: 400,
    )[The Versatile Admiral]
    #v(0.1in)
    #text(
      font: body-font, size: 14pt,
      fill: colors.sub, style: "italic",
    )[Extra and Unconventional Warfare Rules]
    #v(0.05in)
    #text(
      font: body-font, size: 12pt,
      fill: colors.brown, tracking: 2pt, weight: 500,
    )[#upper[An Addon for Cannons \& Coastlines]]
    #v(0.5in)
    #block(
      width: 60%,
      inset: (x: 0.2in, y: 0.15in),
      stroke: 0.6pt + colors.gold,
      fill: rgb(247, 238, 217, 120),
    )[
      #set par(justify: false)
      #text(
        font: body-font, weight: 700, size: 11pt,
        fill: colors.brown, tracking: 1.5pt,
      )[#upper[Contributed by]]
      #v(0.02in)
      #text(
        font: display-font, size: 22pt,
        fill: colors.heading,
      )[Joshua David]
      #v(0.04in)
      #text(
        font: body-font, style: "italic", size: 9.5pt,
        fill: colors.sub,
      )[Adapted to the base ruleset by Joshua Bemenderfer]
    ]
    #v(0.3in)
    #text(
      font: body-font, weight: 700, size: 14pt,
      fill: colors.crimson-dim, tracking: 1pt,
    )[#version]
    #v(-0.04in)
    #text(
      font: body-font, weight: 700, size: 8pt,
      fill: colors.brown, tracking: 1.5pt,
    )[#upper[In Development · Subject to Change]]
  ]
}

// ==== FOREWORD ==========================================================

= A Word from the Admiral

Welcome to the sea, where no man is safe, where no rule is unchangeable,
and where drowning, taking enemy cannon fire, and running aground are
occupational hazards. If you have opened this booklet, you are like me:
a daring captain of an ever-changing fleet on an ever-changing
battlefield.

We are the epitome of Deschamps' description: _"a free people, born of
the sea and of a brutal dream, without children and without old people,
without homes and without churches, without hope but not without
audacity, for whom atrocity is a career choice and death a certitude of
the day after tomorrow."_ We change as frequently as the wind and as
easily as the tide.

This rulebook is a guide to my ideas and modifications. Use them, but be
warned. Each offers a great advantage to their commander, held in check
by an equally great disadvantage. The bravest are prosperous, but also
die the soonest. No fear. Make your choice. May the wind be ever at your
back.

#v(0.2in)
#align(right)[
  #text(font: body-font, style: "italic", size: 11pt, fill: colors.brown)[
    Joshua David
  ]
]

#v(0.2in)

== Using This Booklet

The five modules below add new ship roles and battlefield rules. Each
is independent: pick one for a session, or stack several for an
unusually chaotic table. None replace the base rules; they layer on top.

#ability-box("The Five Modules")[
  #set par(leading: 0.5em)
  - *The Salvors,* a neutral recovery crew who turn wrecks back into
    contested prizes.
  - *The Mercenaries,* a single dangerous ship that fights for whoever
    pays best.
  - *Cannon Barges,* fleet-built fortifications that begin mobile and
    become permanent terrain.
  - *School Islands,* neutral islands where crews train for unique
    skills.
  - *The Minelayer,* a fragile faction that controls the table with
    proximity mines.
]

// ==== THE SALVORS =======================================================

= The Salvors

#text(font: body-font, style: "italic", size: 10pt, fill: colors.sub)[
  "Marine Salvage. A science of vague assumptions based on debatable
  figures taken from inconclusive experiments and performed with
  instruments of problematic accuracy by persons of doubtful reliability
  and questionable mentality."
]

#v(0.1in)

The Salvors do not fight. They recover wrecks, restore them, and auction
them back into play. *Two Salvor ships* enter each game, controlled by a
*Salvor Captain*.

== Salvor Ships

*Indestructible.* Cannon fire and boarding have no effect on a Salvor
ship. They never lose fittings and never become dead in the water. They
still block movement and line of fire.

*Movement.*
- *Move Count: 3.*
- May Set Heading up to *180°* before clicking forward (like Queen's
  Fleet).

== Wrecks

When a ship sinks under this module:

- Leave its hull in place as a *wreck*.
- Remove all fittings, sails, cannons, and flags.
- The wreck blocks movement and cannon fire.
- Only Salvors may interact with it.

When a Salvor ship's hull touches a wreck:

- Remove the wreck from the table.
- Place it in the Salvor supply.

== Restoration

At the start of each Salvor turn, restore *1 fitting* to each wreck in
the Salvor supply. When a wreck has all its fittings back, the ship is
fully repaired and ready for auction.

== Auction

Before the Salvor Captain moves on their turn, auction every fully
restored ship one at a time:

- *Starting bid:* 1 coin.
- *Bidding is clockwise.* Each player may raise or pass.
- *Once a player passes, they may not re-enter the bid.*
- The highest bidder pays the Salvors and takes the ship.

*Deployment.* Place the bought ship either within *3"* of the buyer's
table edge, or touching one island that the buyer controls. The ship may
act on its owner's next turn.

If no one bids, the Salvors retain the vessel for a future auction.

== The Salvor Hoard

All coins paid to the Salvors go into a separate *Hoard*, not the main
draw bag. Coins in the Hoard cannot be drawn, stolen, or spent through
ordinary play.

== Selling Fittings

At the start of your turn, before any ship acts, you may *sell fittings*
to the Salvors:

- For each fitting sold, gain *1 random coin* from the Salvor Hoard.
- Remove *1 fitting* from one of your ships.

Notes:

- This is voluntary damage. A ship reduced to 0 fittings becomes dead in
  the water as usual.
- Any number of fittings may be sold per turn, across any of your ships.

== Salvor Victory

The Salvor Captain gains *1 victory point per coin in the Salvor Hoard*
and wins as soon as they hold *25 VP*.

// ==== THE MERCENARIES ===================================================

= The Mercenaries

#text(font: body-font, style: "italic", size: 10pt, fill: colors.sub)[
  "Go tell the king of England, go tell him thus from me, if he reigns
  king of all the land, then I reign king at sea."
]

#v(0.1in)

Mercenary ships are an unholy terror: fast, resilient, and devastating.
They never join a fleet. They fight for the highest bidder.

*One* Mercenary ship enters the game, controlled at all times by the
*Mercenary Captain*.

== The Mercenary Ship

Any ship model can become a Mercenary. While it serves as the Mercenary
ship, it uses these stats in place of its faction values:

#ability-box("Elite Hull")[
  Ignores the *first hit* it takes each turn.
]

#ability-box("Superior Crew")[
  Takes *two actions* each turn instead of one. When it takes a Fire
  action, it may fire twice (move the cannon between shots if needed).
]

#ability-box("Fast Attack")[
  *Move Count: 3.* May Set Heading up to *180°* before clicking forward.
]

== Open Contract

At the start of each Mercenary turn, before the ship acts:

- *Any player may bid coins* to direct the Mercenary ship against a
  named target.

Rules:

- Minimum opening bid: *2 coins*.
- Bidding is open. Each new bid must exceed the current highest.
- All bid coins are paid to the Mercenary Captain.
- The highest bidder names *one target player*.

*Escalation.* The minimum opening bid increases by *+1 coin* each
consecutive turn the Mercenaries are hired. If a turn passes with no
bids, the minimum resets to 2.

== Protection

A named target may bid against the contract.

- Any number of players may *pool coins* into a single protection bid.
- To negate the contract, the protection total must *exceed* the highest
  bid naming that target.
- If protection succeeds, the Mercenary Captain chooses a different
  named target or acts freely (any target in range).

The Mercenaries always follow the highest *total* payment.

== Mercenary Actions

Once bidding is resolved:

- The Mercenary Captain takes the ship's two actions.
- If a target fleet was named, choose one of that fleet's ships within
  the Mercenary ship's Move distance at the start of its turn. The
  Mercenaries may *only attack that ship* this turn.
- If no valid target is in range, the Mercenaries do nothing.

== No Loyalty

- Mercenaries cannot be captured.
- They never capture islands.
- They are never part of any fleet for scoring.
- All agreements last *one turn only*.

== Mercenary Victory

The Mercenary Captain gains *1 VP per 2 coins* collected this game and
wins at *25 VP*.

// ==== CANNON BARGES =====================================================

= Cannon Barges

Cannon Barges are fleet-built naval fortifications. They begin the game
as mobile gun platforms *towed* across the table by a ship, and end it,
disabled, as permanent fortresses that shape movement and territorial
control.

*Each fleet begins the game with one Cannon Barge.* Use a book or block
with an island topper puck mounted on it. Each barge starts with the
same fitting count as one of that fleet's standard ships.

== Contact

A ship is in *contact* with a barge only in these three cases:

+ While it is *towing* the barge (see below).
+ While it is performing an active attack or boarding action against the
  barge.
+ During *capture resolution* (treated as island rules; see below).

At all other times, ships are *not in contact* with a barge. If a
resolving action would leave a ship illegally in contact, slide the ship
clear immediately after resolution.

== Towing a Barge

A barge is mobile only while a ship is *towing* it. In *Cannons \&
Coastlines*, towing is handled by *leading*: the ship moves, and the
barge follows along behind it in formation. The ship never pushes or
drags the barge.

*To begin towing:*

- During the ship's Move action, end its Move with the ship's stern next
  to the barge's bow. Declare *towing*.

*While towing:*

- The ship spends one Click less than its Move Count each turn (minimum
  one Click).
- The ship moves normally. After the ship finishes its Move, *reposition
  the barge directly behind the ship*, in the same heading, with the
  barge's bow touching the ship's stern. This is the only moment the
  ship and barge are considered in formation.
- If the barge cannot be legally repositioned (terrain, another ship,
  table edge), towing ends and the barge stays where it was.

*To stop towing:* declare it at the start of your turn, or let it lapse
by taking any non-Move action with the towing ship. The barge stays in
place, immobile, until another ship begins towing it.

#callout[
  Barges never enter or leave contact with anything else through their
  own motion. They only appear to move because a ship led them there.
]

== Active Firing

While the barge has at least one fitting, it is a mobile weapon
platform. It fires all installed cannons each turn (each in the fixed
direction set by its slot) and requires no ship or flag contact to do
so. The owning fleet decides whether and how to fire on its own turn.

== Disabled State

A barge becomes *Disabled* when all its fittings are removed. Disabling
is a transformation, not destruction: the disabled barge cannot be
towed, repaired, moved, destroyed, or removed, and it remains on the
table for the rest of the game.

It continues to *fire all installed cannons each turn*, independent of
any ship or flag, functioning as a fixed strategic landmark.

== Capturing a Disabled Barge

A disabled barge is treated as an island for all gameplay purposes,
including capture.

- Ships may only touch a disabled barge during an active attack or
  capture resolution.
- Use the standard island capture rules: drive off any defenders, then
  Raise Flag.
- If capture succeeds, ownership changes immediately. The barge remains
  disabled, immobile, and self-firing under the new owner.

// ==== SCHOOL ISLANDS ====================================================

= School Islands

A special neutral island type that trains crews over time.

== Setup

- Replace *1 or 2* standard islands with School Islands, or add them on
  top of the normal island count.
- Mark them clearly with a different topper, color, or symbol.

Rules:

- School Islands cannot be captured and *never fly a flag*.
- Any number of ships touching a School Island may take the *Train*
  action.

== Action: Train

If your ship is touching a School Island, it may take this action
instead of Move, Fire, or an Island action:

- Place the ship on the School Island and mark it *In Training*.
- The ship remains In Training for *10 of your own turns*.

*While In Training:*

- The ship cannot act, fire, or be targeted.
- It does not block movement or island access.
- It does not count as defending anything.
- Track elapsed turns with coins, markers, or by rotating the ship one
  step each turn.

At the end of your 10th turn, return the ship to play *touching the
School Island* and choose *one Skill* from the list below. That Skill
remains with the ship until it is sunk.

== Skills

#ability-box("Sharpshooters")[
  Once per turn, you may re-fire one missed shot immediately.
]

#ability-box("Veteran Crew")[
  This ship may take one extra *45° rotation* before or after its normal
  Move. This is on top of the standard Set Heading.
]

#ability-box("Reinforced Hull")[
  This ship gains *+1 extra hit* before becoming dead in the water.
]

#ability-box("Rapid Reload")[
  Once per turn, this ship may fire twice without spending
  #coin("gunner") *Skilled Gunner*.
]

#ability-box("Boarding Specialists")[
  When this ship uses #coin("boarding") *Boarding Party*, it removes
  *2 fittings* instead of 1. Still costs 1 coin and the ship's action.
]

#ability-box("Signal Experts")[
  When this ship is the source of a #coin("signal") *Signal Flags* coin
  spend, it may grant the free Move to *two ships* instead of one.
]

== Forced Recall

If all your other ships are sunk while one is still In Training:

- Immediately return the training ship to play at the School Island
  edge, without a Skill.
- Skip its next action.

A captain without a fleet cannot wait at school.

// ==== THE MINELAYER =====================================================

= The Minelayer

A unique support ship that controls the battlefield with proximity
mines. It cannot fight on its own and must operate through alliance.

== Faction Rules

There is *one Minelayer ship* in play and it can be sunk. Any ship model
may serve as the Minelayer.

For mines, use any small object, preferably brightly colored, under
*2"* in diameter (coins, beads, painted stones).

- The Minelayer *cannot take the Fire action* and has no functional
  cannon use.
- At setup, the Minelayer must form an alliance with at least one other
  player. It cannot act independently. If it has no ally at the start of
  a turn, it cannot take actions that turn.
- The Minelayer and its allies coordinate freely but remain separate for
  scoring unless using Fleet rules.

== Mine Network

The Minelayer may have *up to 10 mines* on the table at any time. This
is a global cap, not per-player.

== Action: Lay Mine

The Minelayer may take this action instead of Move:

- Place one mine touching the ship's stern.
- Mines cannot overlap ships, islands, terrain, or other mines.
- Once placed, mines stay until destroyed or removed by re-cap.

A newly placed mine does *not* trigger until the start of the
Minelayer's next turn.

== Proximity Trigger

A mine detonates when any ship comes within *2"* of it at any time
during movement or repositioning.

When triggered:

- The ship is immediately *Scuttled* and removed from play.
- No fittings are removed first; the ship sinks outright.
- The mine is also removed.

== Rule Interactions

Mines:

- *Ignore all defensive effects.* #coin("brace") Brace for Impact does
  not protect.
- *Affect all ships, including allied ships,* but never the Minelayer
  itself.
- *Only trigger on ships,* not on terrain, islands, barges, or
  cannonballs in flight.

A ship destroyed by a mine is removed immediately and takes no further
actions, even if mid-Move.

== Clearing Mines

Mines may only be removed by *cannon fire*. A direct hit on a mine
destroys it. Mines absorb no other damage; missed shots have no effect.

== Placement Limits

- Mines must be at least *2" apart*.
- Mines cannot be placed touching islands, terrain, or barges.
- Mines cannot be placed within *2" of a table edge*.

If placing a mine would exceed the 10-mine cap, remove one existing mine
of your choice first.

== Alliance Rules

The Minelayer must maintain *at least one ally* at all times.

- If every ally is eliminated, the Minelayer may continue to take
  actions until a new alliance is formed at the start of any future
  turn.
- Alliances may shift during play using the base game's standard
  alliance rules.

// ==== CLOSER ============================================================

#pagebreak(weak: true)

#align(center)[
  #v(0.6in)
  #fleuron
  #v(0.2in)
  #text(font: display-font, size: 22pt, fill: colors.heading)[
    Fair winds, daring captain.
  ]
  #v(0.05in)
  #text(font: body-font, size: 11pt, fill: colors.sub, style: "italic")[
    May the wind be ever at your back.
  ]
  #v(0.3in)
  #fleuron
]

#place(bottom + center, dy: -0.1in,
  text(font: body-font, size: 9pt, fill: colors.faded, tracking: 0.8pt)[
    Versatile Admiral rules © Joshua David 2026. \
    Cannons \& Coastlines © Joshua Bemenderfer 2026. \
    Released under CC BY-NC-SA 4.0.
  ]
)
