"""Per-item overrides for render_stls."""

# Keys may be exact stems ("ship-corsair") or prefix shorthands ending with "-"
# ("coin-"). Multiple matches merge, with later entries winning.
#
# Recognized fields:
#   material: "grey" | "gold" | "black" | "black-hull" | "blue-grey"
#             | "brown" | "pine" | "rust" | "stone" | "blue" | "green"
#             | "white" | "neon-green" | "gold-hull" | "shadow-petg" | "reef-pink"
#             (default "grey")
#             See cc_materials.make_material for what each one is.
#   preview_material: str        Material for the ship-preview pass only
#                                (--material-variant preview). The two passes
#                                land on backgrounds of opposite brightness --
#                                the parts renders go on the rulebook's
#                                parchment, the previews on the site's near
#                                black faction card -- so a near-black hull
#                                needs a lift in one and not the other. Same
#                                filament, different exposure; only items with
#                                that problem need this. Defaults to `material`.
#   rotation_z_deg: float        Z rotation applied to the iso view (default 0).
#   top_rotation_z_deg: float    Z rotation applied to the top view (default 0).
#                                Top view rotation is independent so a coin can
#                                read upright from above while the iso view is
#                                rotated to align the design with the iso
#                                camera's vertical axis.
#   also_top: bool               Render an extra `<stem>-top.png`.
#   fittings: [str]              Other STLs in the same folder to import into
#                                this render. They are modeled in this model's
#                                coordinate space, so they are placed by their
#                                own geometry -- there is no offset to give
#                                here. Used for hulls whose turrets/stacks
#                                print separately but are part of the ship.
#   fitting_material: str        Material to use when this item is imported as
#                                someone else's fitting. Defaults to the host's
#                                material, i.e. one ship, one filament. Its own
#                                `material` still governs its solo render for
#                                the parts gallery.
#   shade_smooth: bool           Use smooth shading instead of the flat-faceted
#                                default. Use for organic shapes where facets
#                                read as artifacts rather than print layers.
ITEM_OVERRIDES = {
    # Iso camera-up projects to world XY direction (-1, +1)/sqrt(2). Coin
    # designs are authored with the design top pointing world +Y, so a +45°
    # rotation aligns the iso view's vertical with the design's top.
    "coin-":             {"material": "gold", "also_top": True,
                          "rotation_z_deg": 45, "top_rotation_z_deg": 0},
    # Every hull is shade-smoothed. STL carries no smoothing data, so the
    # default flat shading shows the mesh's own triangles -- on a part-sized
    # render those read as print facets, but a hull is a big curved surface
    # where they read as low-poly faceting instead. The layer-line bump in
    # the material is what makes these look printed; the triangles are just
    # tessellation, and smoothing hides them without touching it.
    "ship-":             {"shade_smooth": True},

    "ship-corsair":      {"material": "black", "preview_material": "black-hull",
                          "rotation_z_deg": 90},
    "ship-queens-fleet": {"material": "blue-grey", "rotation_z_deg": 90},

    # Paid-set hulls. Each is the filament that faction is meant to be
    # printed in: Treasure hoards coin, the Stone Fleet is carved stone, the
    # Industry is rusting machinery, the Islanders sail pine catamarans, and
    # the Shadow Fleet is a translucent teal-to-purple gradient PETG -- the
    # one hull that is not opaque, which is why it has a material of its own
    # rather than a colour swap.
    #
    # The +90 Z rotation matches the base-set hulls: it puts the bow
    # camera-right and the superstructure camera-left, which is the framing
    # every existing preview uses. Check it on a real render before trusting
    # it for a new hull, since it is the one setting that depends on how the
    # model was authored rather than on taste.
    "ship-treasure-fleet": {"material": "gold-hull", "rotation_z_deg": 90},
    "ship-stone-fleet":      {"material": "stone", "rotation_z_deg": 90},
    "ship-shadow-fleet":   {"material": "shadow-petg", "rotation_z_deg": 90},
    "ship-industry":       {"material": "rust", "rotation_z_deg": 90,
                            "fittings": ["industry-turret.stl",
                                         "industry-smokestack.stl"]},
    "ship-islander":       {"material": "pine", "rotation_z_deg": 90},

    # Paid-set fittings. These render solo into assets/images/renders/ for
    # the parts gallery, and are ALSO imported into ship-industry's preview
    # (see its "fittings"), where they take the hull's rust unless a
    # fitting_material below says otherwise.
    "industry-smokestack": {"material": "rust"},
    "industry-turret":     {"material": "rust"},
    "cannon":            {"material": "black"},
    "cannonball":        {"material": "neon-green"},
    "cargo":             {"material": "brown"},
    "barrel":            {"material": "brown"},
    "island-topper":     {"material": "green", "shade_smooth": True},
    "rock1":             {"material": "stone"},
    "reef":              {"material": "reef-pink"},
    "island":            {"material": "green", "shade_smooth": True},
    "sail":              {"material": "white"},
    "sail-treasure-fleet": {"material": "white"},
    "sail-stone-fleet":    {"material": "white"},
    "sail-islanders":      {"material": "white"},
    "sail-damaged":      {"material": "black"},
}


def overrides_for(stem: str) -> dict:
    out = {}
    for key, val in ITEM_OVERRIDES.items():
        if stem == key or (key.endswith("-") and stem.startswith(key)):
            out.update(val)
    return out
