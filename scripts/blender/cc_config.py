"""Per-item overrides for render_stls."""

# Keys may be exact stems ("ship-corsair") or prefix shorthands ending with "-"
# ("coin-"). Multiple matches merge, with later entries winning.
#
# Recognized fields:
#   material: "grey" | "gold" | "black" | "blue-grey" | "brown" | "blue"
#             | "green" | "white"   (default "grey")
#   rotation_z_deg: float        Z rotation applied to the iso view (default 0).
#   top_rotation_z_deg: float    Z rotation applied to the top view (default 0).
#                                Top view rotation is independent so a coin can
#                                read upright from above while the iso view is
#                                rotated to align the design with the iso
#                                camera's vertical axis.
#   also_top: bool               Render an extra `<stem>-top.png`.
#   shade_smooth: bool           Use smooth shading instead of the flat-faceted
#                                default. Use for organic shapes where facets
#                                read as artifacts rather than print layers.
ITEM_OVERRIDES = {
    # Iso camera-up projects to world XY direction (-1, +1)/sqrt(2). Coin
    # designs are authored with the design top pointing world +Y, so a +45°
    # rotation aligns the iso view's vertical with the design's top.
    "coin-":             {"material": "gold", "also_top": True,
                          "rotation_z_deg": 45, "top_rotation_z_deg": 0},
    "ship-corsair":      {"material": "black", "rotation_z_deg": -90},
    "ship-queens-fleet": {"material": "blue-grey", "rotation_z_deg": -90},
    "cannon":            {"material": "black"},
    "cannonball":        {"material": "black"},
    "cargo":             {"material": "brown"},
    "flag-printed":      {"material": "blue"},
    "island-topper":     {"material": "green", "shade_smooth": True},
    "sail":              {"material": "white"},
    "sail-damaged":      {"material": "black"},
}


def overrides_for(stem: str) -> dict:
    out = {}
    for key, val in ITEM_OVERRIDES.items():
        if stem == key or (key.endswith("-") and stem.startswith(key)):
            out.update(val)
    return out
