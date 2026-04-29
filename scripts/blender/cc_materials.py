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


def make_black_pla():
    # Pure 0,0,0 reads as a silhouette; use a deep near-black so shading reads.
    return make_matte_pla("PLA_Black", (0.025, 0.025, 0.025))


def make_blue_grey_pla():
    return make_matte_pla("PLA_BlueGrey", (0.55, 0.63, 0.72))


def make_brown_pla():
    # Warm wood/leather brown for crates.
    return make_matte_pla("PLA_Brown", (0.32, 0.18, 0.08))


def make_blue_pla():
    # Saturated medium blue for printed flags. Bright enough to read across a
    # crowded table without going neon.
    return make_matte_pla("PLA_Blue", (0.10, 0.30, 0.72))


def make_green_pla():
    # Mossy/foliage green for island toppers — reads as terrain, not a
    # candy/grass-mat green.
    return make_matte_pla("PLA_Green", (0.20, 0.42, 0.18))


def make_white_pla():
    # Slightly off-white so it doesn't blow out under the overhead lights and
    # keeps a readable shading gradient (paper/sail material).
    return make_matte_pla("PLA_White", (0.92, 0.90, 0.86))


def make_silk_gold_pla(noise_scale: float = 35.0,
                       noise_strength: float = 0.10,
                       noise_distance: float = 0.025,
                       layer_strength: float = LAYER_BUMP_STRENGTH,
                       ao_distance: float = 0.20,
                       ao_strength: float = 1.0,
                       ao_contrast: float = 2.0):
    """Silk gold FDM PLA: rich saturated gold with a satin metallic finish.
    Lean metallic for the shiny silk-PLA pearlescent look while keeping a
    dielectric sheen layer on top to soften pure metal harshness.

    Noise-bump tuning is exposed because flat surfaces seen straight-on (e.g.
    coin top view) need a stronger surface texture than angled iso shots."""
    mat = bpy.data.materials.new("PLA_SilkGold")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]

    # In metallic mode the base color is the F0 reflectance.
    # Orange-leaning rich gold (think antique doubloon, not lemon gold).
    base = (1.00, 0.66, 0.20, 1.0)
    bsdf.inputs["Base Color"].default_value = base
    bsdf.inputs["Roughness"].default_value = 0.20
    bsdf.inputs["Metallic"].default_value = 0.75

    _set_if(bsdf, "Specular IOR Level", 0.6)
    _set_if(bsdf, "Specular", 0.6)
    _set_if(bsdf, "IOR", 1.5)

    # Soft warm sheen to keep the satin/silk character on top of the metal.
    _set_if(bsdf, "Sheen Weight", 0.20)
    _set_if(bsdf, "Sheen", 0.20)
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
    if preset == "black":
        return make_black_pla()
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
