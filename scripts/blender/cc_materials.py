"""Printed-plastic materials with triangle-wave layer-line bump.

Layer lines come from a Geometry > Position node feeding world-space Z into a
Math:PINGPONG triangle wave, which becomes the height for a Bump node. World
space (rather than object space) means horizontal layers stay horizontal even
after the model is rotated around Z.
"""

import bpy


# Layer-line tuning. Tweak these in one place.
LAYER_FREQUENCY = 50.0   # cycles per unit world-Z (model is normalized to ~unit-2 cube)
LAYER_BUMP_STRENGTH = 0.08
LAYER_BUMP_DISTANCE = 0.15


def _set_if(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


def _add_layer_lines(mat,
                     frequency: float = LAYER_FREQUENCY,
                     strength: float = LAYER_BUMP_STRENGTH,
                     distance: float = LAYER_BUMP_DISTANCE):
    """Wire a triangle-wave height-map into the material's Principled BSDF
    Normal. Returns the Bump node so callers can chain further bumps."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    geom = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")

    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = frequency

    pp = nt.nodes.new("ShaderNodeMath")
    pp.operation = "PINGPONG"
    pp.inputs[1].default_value = 1.0  # period scale -> output range [0, 1]

    sub = nt.nodes.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = 0.5  # center at zero

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance

    nt.links.new(geom.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mul.inputs[0])
    nt.links.new(pp.outputs[0], sub.inputs[0])
    nt.links.new(mul.outputs[0], pp.inputs[0])
    nt.links.new(sub.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return bump


def _add_ao_darkening(mat, distance: float = 0.08, samples: int = 8,
                      strength: float = 1.0, contrast: float = 1.0):
    """Multiply Base Color by an Ambient Occlusion term so recessed/engraved
    surfaces read visibly darker than the surrounding face. `distance` is the
    ray length in world units (models are normalized to a unit-2 cube).
    `contrast` is a gamma applied to the AO output: >1 deepens mid-shadows."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    base_input = bsdf.inputs["Base Color"]

    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = distance
    ao.samples = samples
    ao.only_local = True  # ignore world environment for occlusion sampling

    ao_socket = ao.outputs["Color"]
    if contrast != 1.0:
        gamma = nt.nodes.new("ShaderNodeGamma")
        gamma.inputs["Gamma"].default_value = contrast
        nt.links.new(ao_socket, gamma.inputs["Color"])
        ao_socket = gamma.outputs["Color"]

    # Capture whatever currently feeds Base Color (a literal RGB or a node).
    if base_input.is_linked:
        prev_socket = base_input.links[0].from_socket
    else:
        rgb = nt.nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = base_input.default_value
        prev_socket = rgb.outputs[0]

    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.clamp_factor = True
    mix.inputs[0].default_value = strength  # Factor
    nt.links.new(prev_socket, mix.inputs[6])  # A = previous color
    nt.links.new(ao_socket, mix.inputs[7])    # B = AO (optionally gamma'd)
    nt.links.new(mix.outputs[2], base_input)


def _add_noise_bump(mat, scale: float = 25.0, strength: float = 0.20,
                    distance: float = 0.04, detail: float = 4.0,
                    roughness: float = 0.55):
    """Chain a fine-grained noise bump onto whatever's already feeding the
    BSDF Normal input. Gives flat surfaces a subtle organic micro-texture
    (e.g. visible from above on a coin face)."""
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = detail
    if "Roughness" in noise.inputs:
        noise.inputs["Roughness"].default_value = roughness

    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance

    nt.links.new(tex_coord.outputs["Generated"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])

    # Splice this bump in front of whatever currently feeds BSDF Normal.
    prior_links = [l for l in nt.links if l.to_socket == bsdf.inputs["Normal"]]
    for link in prior_links:
        nt.links.new(link.from_socket, bump.inputs["Normal"])
        nt.links.remove(link)
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return bump


def make_matte_pla(name: str, color):
    """Matte FDM PLA in any color. r/g/b in 0..1."""
    if len(color) == 3:
        color = (color[0], color[1], color[2], 1.0)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.65

    _set_if(bsdf, "Specular IOR Level", 0.3)
    _set_if(bsdf, "Specular", 0.3)
    _set_if(bsdf, "IOR", 1.45)

    # Slight subsurface so darker colors don't read as dead-flat black.
    _set_if(bsdf, "Subsurface Weight", 0.08)
    _set_if(bsdf, "Subsurface", 0.08)
    _set_if(bsdf, "Subsurface Radius", (0.4, 0.4, 0.4))
    _set_if(bsdf, "Subsurface Color", color)

    _set_if(bsdf, "Sheen Weight", 0.15)
    _set_if(bsdf, "Sheen", 0.15)
    _set_if(bsdf, "Sheen Roughness", 0.5)
    _set_if(bsdf, "Sheen Tint", (1.0, 1.0, 1.0, 1.0))

    _add_layer_lines(mat)
    _add_ao_darkening(mat)
    return mat


def make_grey_pla(grey: float = 0.75):
    return make_matte_pla("PLA_Grey", (grey, grey, grey))


def make_black_pla(value: float = 0.025):
    # Pure 0,0,0 reads as a silhouette; use a deep near-black so shading reads.
    #
    # `value` is the lift. The 0.025 default is right for small parts shot
    # against the light backgrounds of the rulebook and parts gallery. Ship
    # previews sit on a near-black faction card instead, where 0.025 collapses
    # the hull into its own outline -- they pass a higher value (see
    # LIFTED_BLACK) so the form still reads there.
    return make_matte_pla("PLA_Black", (value, value, value))


# Black for a hull shown against the site's dark faction card. High enough to
# hold shading and a silhouette edge on #12212c, low enough to still read as
# black filament rather than charcoal grey.
LIFTED_BLACK = 0.13


def make_blue_grey_pla():
    return make_matte_pla("PLA_BlueGrey", (0.55, 0.63, 0.72))


def make_brown_pla():
    # Warm wood/leather brown for crates.
    return make_matte_pla("PLA_Brown", (0.32, 0.18, 0.08))


def make_blue_pla():
    # Saturated medium blue. Bright enough to read across a crowded table
    # without going neon. Currently unused -- it was the printed flag's
    # colour, and that part is gone -- but kept as part of the palette.
    return make_matte_pla("PLA_Blue", (0.10, 0.30, 0.72))


def make_green_pla():
    # Mossy/foliage green for island toppers — reads as terrain, not a
    # candy/grass-mat green.
    return make_matte_pla("PLA_Green", (0.20, 0.42, 0.18))


def make_white_pla():
    # Slightly off-white so it doesn't blow out under the overhead lights and
    # keeps a readable shading gradient (paper/sail material).
    return make_matte_pla("PLA_White", (0.92, 0.90, 0.86))


def make_pine_pla():
    # Light wood brown for the Islanders' catamarans: pine, not walnut. Kept
    # well above make_brown_pla's crate brown so the two never read as the
    # same filament when a hull and a cargo crate share a render.
    return make_matte_pla("PLA_Pine", (0.52, 0.33, 0.17))


def make_rust_pla():
    # Oxidised iron brown for the Industry's hulls -- warmer and redder than
    # the crate brown, so the faction reads as rusting machinery.
    return make_matte_pla("PLA_Rust", (0.30, 0.10, 0.04))


def make_stone_pla():
    # Neutral, faintly warm quarried grey for the Stone Fleet's carved stone
    # hulls. Darker than make_white_pla so the carving keeps its shadows.
    return make_matte_pla("PLA_Stone", (0.42, 0.41, 0.38))


def make_gradient_petg(name: str = "PETG_Gradient",
                       color_low=(0.03, 0.30, 0.34, 1.0),
                       color_high=(0.24, 0.07, 0.40, 1.0),
                       transmission: float = 0.35,
                       roughness: float = 0.52,
                       scatter_density: float = 7.0,
                       absorption_density: float = 1.2,
                       anisotropy: float = 0.25,
                       subsurface: float = 0.15,
                       subsurface_scale: float = 0.06):
    """Partially translucent gradient PETG.

    Gradient filament changes colour as it is extruded, so the sweep runs up
    the print's Z axis -- the same direction as the layer lines, which is why
    it is driven by Generated texture coordinates (0..1 across the object's
    own bounding box per axis) rather than world space: the full sweep lands
    on the hull whatever its size, and stays put when the model is rotated.

    Translucency here is a volume, not a surface trick. Light enters through
    the wall (surface Transmission) and is then scattered and absorbed inside
    it:

      - Volume Scatter is what makes the print look solid-but-glowing, the
        way a thick translucent filament does. It dominates, because that
        bounced-around light is the whole effect.
      - Volume Absorption, tinted by the same ramp, is what keeps thick
        sections darker and more saturated than thin ones. On its own it
        reads as tinted glass.

    Both are tinted from the gradient ramp, so light that travels through the
    hull picks up the local filament colour rather than going grey.

    On top of that the surface carries subsurface scattering. The volume
    handles light crossing the whole wall; subsurface handles light that
    enters, bounces about within a millimetre or two and leaves again on the
    same side. That short-range term is what softens the lit faces and gives
    thin details -- railings, rigging, the spar -- the waxy glow a translucent
    print has, which a volume alone renders too cleanly.

    The surface itself is deliberately dull -- high roughness, low specular.
    A sharp reflection reads as polished resin and competes with the volume
    for the eye; a matte wall lets the scattering be the thing you see.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]

    tex = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = color_low
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = color_high
    nt.links.new(tex.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = roughness
    _set_if(bsdf, "Metallic", 0.0)
    _set_if(bsdf, "Transmission Weight", transmission)
    _set_if(bsdf, "Transmission", transmission)
    _set_if(bsdf, "IOR", 1.57)          # PETG
    # Kept low on purpose: see the docstring. This is the knob that decides
    # whether the hull reads as filament or as polished resin.
    _set_if(bsdf, "Specular IOR Level", 0.12)
    _set_if(bsdf, "Specular", 0.12)
    _set_if(bsdf, "Sheen Weight", 0.0)
    _set_if(bsdf, "Sheen", 0.0)
    _set_if(bsdf, "Coat Weight", 0.0)

    # Short-range scattering just under the surface. Radius is scaled small
    # because the model is normalized to a unit-2 cube: a couple of hundredths
    # here is the couple of millimetres a real wall diffuses light over.
    _set_if(bsdf, "Subsurface Weight", subsurface)
    _set_if(bsdf, "Subsurface", subsurface)
    _set_if(bsdf, "Subsurface Scale", subsurface_scale)
    _set_if(bsdf, "Subsurface Radius", (1.0, 0.75, 0.9))
    _set_if(bsdf, "Subsurface Anisotropy", 0.2)
    # Tint it from the same ramp so the scattered light matches the local
    # filament colour instead of washing the gradient out with white.
    if "Subsurface Color" in bsdf.inputs:
        nt.links.new(ramp.outputs["Color"], bsdf.inputs["Subsurface Color"])

    scatter = nt.nodes.new("ShaderNodeVolumeScatter")
    scatter.inputs["Density"].default_value = scatter_density
    # Forward-biased scattering: light keeps roughly its direction through a
    # thin wall, which is what makes a backlit edge glow instead of going flat.
    if "Anisotropy" in scatter.inputs:
        scatter.inputs["Anisotropy"].default_value = anisotropy
    nt.links.new(ramp.outputs["Color"], scatter.inputs["Color"])

    absorb = nt.nodes.new("ShaderNodeVolumeAbsorption")
    absorb.inputs["Density"].default_value = absorption_density
    nt.links.new(ramp.outputs["Color"], absorb.inputs["Color"])

    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(scatter.outputs["Volume"], add.inputs[0])
    nt.links.new(absorb.outputs["Volume"], add.inputs[1])
    nt.links.new(add.outputs[0], nt.nodes["Material Output"].inputs["Volume"])

    # No AO pass here: multiplying a translucent base colour by occlusion
    # fights the volume term and just muddies the gradient.
    _add_layer_lines(mat)
    return mat


def make_silk_gold_pla(noise_scale: float = 35.0,
                       noise_strength: float = 0.10,
                       noise_distance: float = 0.025,
                       layer_strength: float = LAYER_BUMP_STRENGTH,
                       ao_distance: float = 0.20,
                       ao_strength: float = 1.0,
                       ao_contrast: float = 2.0,
                       roughness: float = 0.20,
                       metallic: float = 0.75,
                       sheen: float = 0.20):
    """Silk gold FDM PLA: rich saturated gold with a satin metallic finish.
    Lean metallic for the shiny silk-PLA pearlescent look while keeping a
    dielectric sheen layer on top to soften pure metal harshness.

    Noise-bump tuning is exposed because flat surfaces seen straight-on (e.g.
    coin top view) need a stronger surface texture than angled iso shots.

    So is the finish, because scale changes what silk gold looks like. A coin
    is small and mostly flat, and reads as gold precisely because it catches a
    tight highlight. A whole hull at the same roughness turns into a mirror
    with no surface, which is the one thing a print never looks like -- it
    wants a broader, duller sheen so the extrusion texture stays visible.
    See the "gold-hull" preset."""
    mat = bpy.data.materials.new("PLA_SilkGold")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]

    # In metallic mode the base color is the F0 reflectance.
    # Orange-leaning rich gold (think antique doubloon, not lemon gold).
    base = (1.00, 0.66, 0.20, 1.0)
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic

    _set_if(bsdf, "Specular IOR Level", 0.6)
    _set_if(bsdf, "Specular", 0.6)
    _set_if(bsdf, "IOR", 1.5)

    # Soft warm sheen to keep the satin/silk character on top of the metal.
    _set_if(bsdf, "Sheen Weight", sheen)
    _set_if(bsdf, "Sheen", sheen)
    _set_if(bsdf, "Sheen Roughness", 0.30)
    _set_if(bsdf, "Sheen Tint", (1.0, 0.78, 0.45, 1.0))

    _add_layer_lines(mat, strength=layer_strength)
    # Fine surface texture so flat coin faces don't read as a featureless
    # mirror in top view.
    _add_noise_bump(mat, scale=noise_scale, strength=noise_strength,
                    distance=noise_distance)
    # AO so debossed coin icons read clearly. Tuning is per-view: top view
    # leans on AO heavily for icon contrast, iso view keeps it subtle so the
    # rim and faces stay bright.
    _add_ao_darkening(mat, distance=ao_distance, samples=16,
                      strength=ao_strength, contrast=ao_contrast)
    return mat


def make_material(preset: str, grey: float = 0.75, view: str = "iso"):
    if preset == "gold":
        if view == "top":
            # Top view: keep bump map subtle so the coin face reads as smooth
            # gold and the AO-darkened recessed icon stays the dominant detail.
            return make_silk_gold_pla(noise_scale=22.0, noise_strength=0.08,
                                      noise_distance=0.02,
                                      layer_strength=0.025,
                                      ao_distance=0.20, ao_strength=1.0,
                                      ao_contrast=2.2)
        return make_silk_gold_pla(noise_scale=45.0, noise_strength=0.07,
                                  noise_distance=0.02,
                                  ao_distance=0.06, ao_strength=0.5,
                                  ao_contrast=1.0)
    if preset == "gold-hull":
        # Treasure Fleet hull. Much rougher and less metallic than the coin
        # gold above: silk PLA on a large printed surface is satin, not
        # polished. The stronger layer and noise bumps are what sell it as an
        # extruded print rather than a gold-plated prop.
        return make_silk_gold_pla(roughness=0.48, metallic=0.55, sheen=0.28,
                                  noise_scale=60.0, noise_strength=0.14,
                                  noise_distance=0.03,
                                  layer_strength=LAYER_BUMP_STRENGTH * 1.6,
                                  ao_distance=0.06, ao_strength=0.5,
                                  ao_contrast=1.0)
    if preset == "black":
        return make_black_pla()
    if preset == "black-hull":
        # Same filament, lifted for the dark faction card. See LIFTED_BLACK.
        return make_black_pla(LIFTED_BLACK)
    if preset == "pine":
        return make_pine_pla()
    if preset == "rust":
        return make_rust_pla()
    if preset == "stone":
        return make_stone_pla()
    if preset == "shadow-petg":
        return make_gradient_petg("PETG_ShadowFleet")
    if preset == "blue-grey":
        return make_blue_grey_pla()
    if preset == "brown":
        return make_brown_pla()
    if preset == "blue":
        return make_blue_pla()
    if preset == "green":
        return make_green_pla()
    if preset == "white":
        return make_white_pla()
    return make_grey_pla(grey)
