// All seven factions as data. Compile with `-input faction=<id>`:
//   typst compile --input faction=corsairs factions.typ out.pdf
#import "card.typ": faction-card, assets, renders

#let data = (
  "queens-fleet": (
    title: "Queen's Fleet",
    accent: rgb("#1f3a5f"),
    banner-image: assets + "/faction-queens-fleet.png",
    ship-render: renders + "/ship-queens-fleet.png",
    tagline: [The Crown's expedition to the new territory. A standing fleet sent to plant flags and hold the harbors that matter.],
    stats: (
      ("Ships",        [3 frigates]),
      ("Fittings",     [4 each]),
      ("Cannon Slots", [3 broadside per side]),
      ("Move Count",   [2]),
    ),
    ability: (
      heading: "Passive: Disciplined Crew",
      body: [Your ships can turn up to *180°* instead of 90° at the start of a move.],
    ),
    playstyle: [Balanced and forgiving. A solid first pick while you're learning how the table flows.],
  ),
  "corsairs": (
    title: "Corsairs",
    accent: rgb("#7a1f1f"),
    banner-image: assets + "/faction-corsairs.png",
    ship-render: renders + "/ship-corsair.png",
    tagline: [Privateers who came for the rush and stayed. They sail for whoever pays, or for themselves.],
    stats: (
      ("Ships",        [4 sloops]),
      ("Fittings",     [3 each]),
      ("Cannon Slots", [3 broadside per side]),
      ("Move Count",   [3]),
    ),
    ability: (
      heading: "Passive: Plunder",
      body: [Draw *1 bonus coin* on every successful board or island capture.],
    ),
    playstyle: [Hit-and-run. Pick fights you can disengage from. Don't get pinned in a slugging match.],
  ),
  "treasure-fleet": (
    title: "Treasure Fleet",
    accent: rgb("#a07020"),
    banner-image: assets + "/faction-treasure-fleet.png",
    tagline: [Merchant junks carrying the seal of a great northern empire. Their orders are simple: fill the holds and ship the cargo home.],
    stats: (
      ("Ships",        [2 junks]),
      ("Fittings",     [3 each]),
      ("Move Count",   [1]),
    ),
    ability: (
      heading: "Passive: Bountiful Harvest",
      body: [Draw *2 coins* instead of 1 when collecting from your islands.],
    ),
    playstyle: [Economy. Hold an island or two hard, then use coin actions to buff your ships. Don't trade hulls.],
  ),
  "shadow-fleet": (
    title: "Shadow Fleet",
    accent: rgb("#3d2845"),
    banner-image: assets + "/faction-shadow-fleet.png",
    tagline: [Ships lost in the first rush for the islands, surfaced again somehow. Whatever crews them now does not answer hails.],
    stats: (
      ("Ships",        [3 galleons]),
      ("Fittings",     [3 each]),
      ("Move Count",   [1]),
    ),
    ability: (
      heading: "Passive: Return from the Deep",
      body: [Spend *2 coins* to raise a sunken ship at *1 HP* on any island you hold.],
    ),
    playstyle: [Trade ships freely. Press fights others would walk away from; keep a held island close for fast returns.],
  ),
  "sun-fleet": (
    title: "Sun Fleet",
    accent: rgb("#2e7472"),
    banner-image: assets + "/faction-sun-fleet.png",
    tagline: [Stone ships from a kingdom across the sea, far more ancient than the powers crowding the islands today.],
    stats: (
      ("Ships",        [3 barges]),
      ("Fittings",     [4 each]),
      ("Move Count",   [1]),
    ),
    ability: (
      heading: "Passive: Stone Hulls",
      body: [Each ship ignores the *first hit* it takes each turn.],
    ),
    playstyle: [Tank salvos. Force opponents to focus-fire or watch their shots bounce off. Advance slowly, fire deliberately.],
  ),
  "the-industry": (
    title: "The Industry",
    accent: rgb("#7a4a1f"),
    banner-image: assets + "/faction-industry.png",
    tagline: [Steam warships from a newly-independent industrial power. The first iron hulls in these waters.],
    stats: (
      ("Ships",        [3 warships]),
      ("Fittings",     [2 hull + 1 turret]),
      ("Cannon Slots", [1 bow (forward only) + 1 turret (rotates)]),
      ("Move Count",   [2]),
    ),
    ability: (
      heading: "Passive: Rotating Turret",
      body: [The turret slot sits in a *turret fitting* and fires *in any direction*. If the turret is shot off, only the bow slot remains until repaired.],
    ),
    playstyle: [The bow gun wants a head-on charge; the turret covers everything else. Keep the turret alive.],
  ),
  "the-islanders": (
    title: "The Islanders",
    accent: rgb("#2a6b4a"),
    banner-image: assets + "/faction-islanders.png",
    tagline: [The native peoples of the islands. They fished and fought these channels long before anyone else heard of them.],
    stats: (
      ("Ships",        [5 canoes]),
      ("Fittings",     [2 each]),
      ("Cannon Slots", [3, *rear-facing only*]),
      ("Move Count",   [3]),
    ),
    ability: (
      heading: "Passive: Home Waters",
      body: [Claim the nearest island during setup and place one canoe there.],
    ),
    playstyle: [Strike early, then slip away. Lure pursuers across your home waters and rake them with stern fire as you flee.],
  ),
)

#let faction-id = sys.inputs.at("faction", default: "corsairs")
#let d = data.at(faction-id) + (
  ornament: assets + "/corner-ornament-" + faction-id + ".png",
)
#faction-card(..d)
