
from .context import ctx
from .util import bsdf_of, new_material, nodes, setin


def plastic(name, color, rough=0.45, layers=True, metallic=0.0, translucent=0.0,
            sss=0.0):
    """FDM-printed PLA.

    What makes a print read as plastic rather than painted metal:
      - a dielectric with a satin finish: IOR 1.5, roughness ~0.45, no
        clear coat (a storm adds only a faint water film, WEATHERS "wet");
      - layer lines as real beads, not a sawtooth: each 0.2 mm layer is a
        rounded ridge (1 - (2t - 1)^2), and the valleys between beads are
        rougher than their crowns;
      - anisotropic highlights running along the layers (the beads act like
        brushed grooves), so a highlight streaks around the part instead of
        pooling into a hotspot;
      - no subsurface: PLA scatters so little that any visible amount made
        the hulls look like skin. Thin sheets (sails) get `translucent`
        instead, which lets light through without the waxy glow.
    The parts are modelled in mm, so object-space Z is print height in mm.
    Metal-free: the kit's cannon is black PLA too. `sss` is left in for
    experiments and defaults to off."""
    m = new_material(name)
    nt, N, L = nodes(m)
    b = bsdf_of(m)
    b.inputs["Base Color"].default_value = color
    b.inputs["Metallic"].default_value = metallic
    b.inputs["IOR"].default_value = 1.5
    setin(b, "Specular IOR Level", 0.5)
    setin(b, "Coat Weight", ctx.W.get("wet", 0.0))
    setin(b, "Coat Roughness", 0.15)
    setin(b, "Sheen Weight", 0.0)
    if sss:
        setin(b, "Subsurface Weight", sss)
        # Neutral scatter: a warm radius turns black filament brown in sun.
        setin(b, "Subsurface Radius", (1.0, 0.95, 0.9))
        setin(b, "Subsurface Scale", 1.2 * ctx.S)   # ~1 mm of light travel in the filament
    rough_out = None
    if layers:
        tc = N.new("ShaderNodeTexCoord")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(tc.outputs["Object"], sep.inputs[0])
        mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 5.0
        L.new(sep.outputs["Z"], mul.inputs[0])
        fr = N.new("ShaderNodeMath"); fr.operation = "FRACT"
        L.new(mul.outputs[0], fr.inputs[0])
        cen = N.new("ShaderNodeMath"); cen.operation = "MULTIPLY_ADD"
        cen.inputs[1].default_value = 2.0; cen.inputs[2].default_value = -1.0
        L.new(fr.outputs[0], cen.inputs[0])
        sq = N.new("ShaderNodeMath"); sq.operation = "MULTIPLY"
        L.new(cen.outputs[0], sq.inputs[0]); L.new(cen.outputs[0], sq.inputs[1])
        bead = N.new("ShaderNodeMath"); bead.operation = "SUBTRACT"
        bead.inputs[0].default_value = 1.0
        L.new(sq.outputs[0], bead.inputs[1])
        bump = N.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        bump.inputs["Distance"].default_value = 0.05 * ctx.S   # bead height ~0.05 mm
        L.new(bead.outputs[0], bump.inputs["Height"])
        # Faint surface grain so large flat faces are not mirror-even.
        grain = N.new("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 1.5
        grain.inputs["Detail"].default_value = 6
        L.new(tc.outputs["Object"], grain.inputs["Vector"])
        gb = N.new("ShaderNodeBump")
        gb.inputs["Strength"].default_value = 0.06
        L.new(grain.outputs["Fac"], gb.inputs["Height"])
        L.new(bump.outputs["Normal"], gb.inputs["Normal"])
        L.new(gb.outputs["Normal"], b.inputs["Normal"])
        rr = N.new("ShaderNodeMapRange")
        rr.inputs["To Min"].default_value = rough + 0.12
        rr.inputs["To Max"].default_value = rough - 0.05
        L.new(bead.outputs[0], rr.inputs["Value"])
        rough_out = rr.outputs[0]
        # Highlights stretch along the layers: tangent circles the print's
        # vertical axis.
        tan = N.new("ShaderNodeTangent")
        tan.direction_type = "RADIAL"
        tan.axis = "Z"
        setin(b, "Anisotropic", 0.45)
        if "Tangent" in b.inputs:
            L.new(tan.outputs["Tangent"], b.inputs["Tangent"])
    if rough_out is not None:
        L.new(rough_out, b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = rough
    if translucent:
        out = N["Material Output"]
        tr = N.new("ShaderNodeBsdfTranslucent")
        tr.inputs["Color"].default_value = color
        mix = N.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = translucent
        L.new(b.outputs[0], mix.inputs[1])
        L.new(tr.outputs[0], mix.inputs[2])
        L.new(mix.outputs[0], out.inputs["Surface"])
    return m


def queens_livery():
    """The Queen's Fleet hull as a painted man-o'-war, since blue-grey
    filament vanished against the sea: light wood planking with a faint
    grain along the length and a navy strake along the side between gold
    wale lines. Bands are by hull height in mm (object space), measured off
    the hull: waterline 7, sides up to a rail at ~15-21."""
    m = plastic("Queen's Hull", (0.36, 0.2, 0.09, 1), rough=0.45)
    nt, N, L = nodes(m)
    b = bsdf_of(m)
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Object"], sep.inputs[0])
    nsep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Normal"], nsep.inputs[0])

    def cmp(sock, op, v):
        c = N.new("ShaderNodeMath"); c.operation = op
        L.new(sock, c.inputs[0]); c.inputs[1].default_value = v
        return c.outputs[0]

    def mul(*socks):
        out = socks[0]
        for sk in socks[1:]:
            n = N.new("ShaderNodeMath"); n.operation = "MULTIPLY"
            L.new(out, n.inputs[0]); L.new(sk, n.inputs[1])
            out = n.outputs[0]
        return out

    def add(a, b_):
        n = N.new("ShaderNodeMath"); n.operation = "ADD"; n.use_clamp = True
        L.new(a, n.inputs[0]); L.new(b_, n.inputs[1])
        return n.outputs[0]

    z = sep.outputs["Z"]
    band = lambda lo, hi: mul(cmp(z, "GREATER_THAN", lo), cmp(z, "LESS_THAN", hi))
    side = cmp(nsep.outputs["Z"], "LESS_THAN", 0.6)   # hull sides, not deck or rail tops
    # Just the one painted strake along the side, between gold lines. (A
    # blue rail cap and gilded stern castle only half covered the carving,
    # which read as a mess.)
    blue = mul(band(9.7, 13.1), side)
    gold = mul(add(band(9.1, 9.7), band(13.1, 13.6)), side)

    # Planking: light wood with a grain stretched along the hull.
    grain_v = N.new("ShaderNodeVectorMath"); grain_v.operation = "MULTIPLY"
    L.new(tc.outputs["Object"], grain_v.inputs[0]); grain_v.inputs[1].default_value = (0.08, 1.2, 1.2)
    grain = N.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 1.0
    grain.inputs["Detail"].default_value = 4
    L.new(grain_v.outputs[0], grain.inputs["Vector"])
    wood = N.new("ShaderNodeValToRGB")
    wood.color_ramp.elements[0].color = (0.27, 0.14, 0.06, 1)
    wood.color_ramp.elements[1].color = (0.40, 0.23, 0.10, 1)
    L.new(grain.outputs["Fac"], wood.inputs[0])
    c1 = N.new("ShaderNodeMix"); c1.data_type = "RGBA"
    L.new(blue, c1.inputs[0]); L.new(wood.outputs[0], c1.inputs[6])
    c1.inputs[7].default_value = (0.075, 0.075, 0.09, 1)   # weathered slate, near the wood
    c2 = N.new("ShaderNodeMix"); c2.data_type = "RGBA"
    L.new(gold, c2.inputs[0]); L.new(c1.outputs[2], c2.inputs[6])
    c2.inputs[7].default_value = (1.0, 0.56, 0.13, 1)
    L.new(c2.outputs[2], b.inputs["Base Color"])
    met = N.new("ShaderNodeMath"); met.operation = "MULTIPLY"
    L.new(gold, met.inputs[0]); met.inputs[1].default_value = 0.7
    L.new(met.outputs[0], b.inputs["Metallic"])
    return m


def emissive(name, color, strength):
    m = new_material(name)
    nt, N, L = nodes(m)
    N.remove(N["Principled BSDF"])
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = color
    em.inputs["Strength"].default_value = strength
    L.new(em.outputs[0], N["Material Output"].inputs["Surface"])
    return m, em


def build_materials():
    M = {}
    # Hull and fitting colours are the kit's filaments. The Corsair's black is
    # lifted a touch: under an overcast sky pure filament black is a hole.
    M["black-hull"] = plastic("Corsair Hull", (0.035, 0.035, 0.038, 1), rough=0.42)
    M["black"] = plastic("Black PLA", (0.028, 0.028, 0.03, 1), rough=0.42)
    M["black-sail"] = plastic("Corsair Sail", (0.03, 0.03, 0.032, 1), rough=0.55,
                              layers=False, translucent=0.08)
    M["blue-grey"] = queens_livery()   # the Queen's Fleet hull (kit colour key "blue-grey")
    M["white"] = plastic("Sail White", (0.86, 0.84, 0.80, 1), rough=0.55,
                         layers=False, translucent=0.3)
    M["wood"] = plastic("Wood PLA", (0.30, 0.17, 0.08, 1), rough=0.5)
    # The Queen's Fleet's masts: a dark walnut brown, deeper than the crates.
    M["mast-wood"] = plastic("Mast Wood PLA", (0.075, 0.035, 0.015, 1), rough=0.48)
    M["gunmetal"] = plastic("Cannon", (0.03, 0.03, 0.03, 1), rough=0.4)
    M["grey"] = plastic("Grey PLA", (0.45, 0.45, 0.45, 1))
    M["neon-green"] = plastic("Cannonball", (0.22, 0.58, 0.10, 1), rough=0.42)
    # Silk gold PLA: the one genuinely shiny filament, metallic-looking and
    # with strong layer lines.
    gold = plastic("Coin Gold", (1.0, 0.56, 0.13, 1), rough=0.28, metallic=0.7)
    M["gold"] = gold
    return M


def spray_material():
    m = new_material("Spray")
    b = bsdf_of(m)
    # Clear water, not white: droplets glint and refract; they only read as
    # white where many overlap.
    b.inputs["Base Color"].default_value = (0.8, 0.9, 0.9, 1)
    b.inputs["Roughness"].default_value = 0.08
    setin(b, "Transmission Weight", 0.9)
    b.inputs["IOR"].default_value = 1.33
    setin(b, "Subsurface Weight", 0.1)
    return m


def volume_material(name, color, density_k, emission=None, noise_scale=2.4, edge=(0.35, 0.68),
                     detail=6.0):
    """A soft noise-shaped volume whose strength is driven per object by
    the object's colour (keyframed), so every puff can share one material:
    red scales density, green scales emission."""
    m = new_material(name)
    nt, N, L = nodes(m)
    N.remove(N["Principled BSDF"])
    vol = N.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = color
    vol.inputs["Anisotropy"].default_value = 0.35
    oi = N.new("ShaderNodeObjectInfo")
    sepc = N.new("ShaderNodeSeparateColor")
    L.new(oi.outputs["Color"], sepc.inputs[0])
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = noise_scale
    nz.inputs["Detail"].default_value = detail
    nz.inputs["Roughness"].default_value = 0.6
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    ln = N.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"
    L.new(tc.outputs["Object"], ln.inputs[0])
    fall = N.new("ShaderNodeMapRange")
    fall.inputs["From Min"].default_value = 1.0
    fall.inputs["From Max"].default_value = 0.25
    L.new(ln.outputs["Value"], fall.inputs["Value"])
    shape = N.new("ShaderNodeMapRange")
    shape.inputs["From Min"].default_value = edge[0]
    shape.inputs["From Max"].default_value = edge[1]
    L.new(nz.outputs["Fac"], shape.inputs["Value"])
    body = N.new("ShaderNodeMath"); body.operation = "MULTIPLY"
    L.new(fall.outputs[0], body.inputs[0]); L.new(shape.outputs[0], body.inputs[1])
    dens = N.new("ShaderNodeMath"); dens.operation = "MULTIPLY"
    L.new(body.outputs[0], dens.inputs[0]); L.new(sepc.outputs["Red"], dens.inputs[1])
    dk = N.new("ShaderNodeMath"); dk.operation = "MULTIPLY"; dk.inputs[1].default_value = density_k
    L.new(dens.outputs[0], dk.inputs[0])
    L.new(dk.outputs[0], vol.inputs["Density"])
    if emission:
        # Flame colour by heat: white-yellow in the dense core, through
        # orange, to a deep red at the ragged edges.
        heat = N.new("ShaderNodeValToRGB")
        he = heat.color_ramp.elements
        he[0].position = 0.0; he[0].color = (0.6, 0.04, 0.005, 1)
        he[1].position = 1.0; he[1].color = (1.0, 0.9, 0.6, 1)
        e = heat.color_ramp.elements.new(0.45); e.color = emission[0]
        L.new(body.outputs[0], heat.inputs[0])
        L.new(heat.outputs[0], vol.inputs["Emission Color"])
        es = N.new("ShaderNodeMath"); es.operation = "MULTIPLY"
        L.new(body.outputs[0], es.inputs[0]); L.new(sepc.outputs["Green"], es.inputs[1])
        ek = N.new("ShaderNodeMath"); ek.operation = "MULTIPLY"; ek.inputs[1].default_value = emission[1]
        L.new(es.outputs[0], ek.inputs[0])
        L.new(ek.outputs[0], vol.inputs["Emission Strength"])
    L.new(vol.outputs[0], N["Material Output"].inputs["Volume"])
    return m


def terrain_material(name, base, rough=0.8, wet_line=True):
    m = new_material(name)
    nt, N, L = nodes(m)
    b = bsdf_of(m)
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.08
    nz.inputs["Detail"].default_value = 10
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    ramp = N.new("ShaderNodeValToRGB")
    r, g, bb, _ = base
    ramp.color_ramp.elements[0].color = (r * 0.55, g * 0.55, bb * 0.55, 1)
    ramp.color_ramp.elements[1].color = (min(1, r * 1.3), min(1, g * 1.3), min(1, bb * 1.3), 1)
    L.new(nz.outputs["Fac"], ramp.inputs[0])
    col = ramp.outputs[0]
    if wet_line:
        # Dark, glossy wet band just above the water.
        geo = N.new("ShaderNodeNewGeometry")
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(geo.outputs["Position"], sep.inputs[0])
        band = N.new("ShaderNodeMapRange")
        band.inputs["From Min"].default_value = 2.5
        band.inputs["From Max"].default_value = 0.5
        L.new(sep.outputs["Z"], band.inputs["Value"])
        mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        L.new(band.outputs[0], mix.inputs[0])
        L.new(col, mix.inputs[6])
        mix.inputs[7].default_value = (0.35, 0.35, 0.33, 1)
        col = mix.outputs[2]
        rr = N.new("ShaderNodeMapRange")
        rr.inputs["To Min"].default_value = rough
        rr.inputs["To Max"].default_value = 0.25
        L.new(band.outputs[0], rr.inputs["Value"])
        L.new(rr.outputs[0], b.inputs["Roughness"])
    else:
        b.inputs["Roughness"].default_value = rough
    L.new(col, b.inputs["Base Color"])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nz2 = N.new("ShaderNodeTexNoise")
    nz2.inputs["Scale"].default_value = 1.5
    nz2.inputs["Detail"].default_value = 8
    L.new(tc.outputs["Object"], nz2.inputs["Vector"])
    L.new(nz2.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m
