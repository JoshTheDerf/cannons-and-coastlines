import math
import random

import bpy
from mathutils import Vector

from .context import ctx
from .materials import emissive
from .util import iter_fcurves, linear_extrapolate, link, nodes


# The looks. Each is a dict read through ctx.W.
#
#   sun, sun_energy, sun_angle, sun_color   the key light (a sun lamp); `sun`
#       points from the scene toward it. At night it is the moon.
#   sky    {"type": "clear" | "deck" | "night", ...}: which sky builder and
#       its settings (cloud cover and colours; see the builders).
#   fog, mist, mist_start, mist_depth   aerial haze on the geometry: a
#       linear ramp over mist_depth, scaled by `mist`.
#   fog_bank   {layers: [(top m, distance m), ...], color, anisotropy, glow}:
#       real volumetric fog lying on the sea, thinning with height
#       (build_fog_bank). Scenes check W.get("fog_bank"). With one, `mist`
#       is usually 0: the 2D haze can't match a dark sky.
#   exposure   film exposure (AgX).
#   wind, wave_scale, chop, foam   the ocean.
#   rain, rain_alpha, rain_glow   rain drops (0 for none).
#   lightning   strike at ctx.LIGHTNING frames.
#   lanterns, lantern_energy, lantern_glow   ships carry lit lanterns (W per
#       lamp, glass brightness); scenes check W["lanterns"].
#   sea_deep, sea_crest, island, headland, smoke, wet   colours and the
#       water film on the hulls.
#
#   sunny:    a bright afternoon after a squall. The sun is low behind the
#             camera, rakes the sails and leaves a rainbow over the islands.
#   sunrise:  a low warm sun from astern, pink-lit scattered cloud, soft
#             haze, a calm sea.
#   sunset:   the sun just above the horizon ahead, orange cloud undersides,
#             a glitter path on the water. Lanterns are lit, but the sky
#             still does most of the work.
#   overcast: a flat grey deck of cloud and soft, shadowless light. A
#             fresh breeze, no rain.
#   fog:      a pale, windless morning where the land is gone and the
#             other ship is a shape. Lanterns glow through it.
#   storm:    the squall itself, dark under a heavy deck. Lightning, rain,
#             dense haze, and every ship's lanterns lit.
#   night:    moonlight on a moderate sea under broken cloud, stars in the
#             gaps. Lanterns light the decks and throw light on the water.
_SEA = dict(sea_deep=(0.004, 0.028, 0.03, 1), sea_crest=(0.02, 0.16, 0.13, 1))
WEATHERS = {
    "sunny": dict(
        sun=(-0.90, 0.33, 0.43), sun_energy=4.2, sun_angle=0.6, sun_color=(1.0, 0.93, 0.82),
        sky=dict(type="clear", clouds=0.5, rainbow=True),
        fog=(0.46, 0.56, 0.68, 1), mist=0.22, mist_start=250, mist_depth=9000,
        exposure=-0.5, wind=9.0, wave_scale=1.0, chop=1.1, foam=0.05,
        rain=0, rain_alpha=0.2, rain_glow=0.35, lightning=False, lanterns=False,
        **_SEA,
        island=(0.07, 0.16, 0.045, 1), headland=(0.05, 0.085, 0.045, 1),
        smoke=(0.85, 0.84, 0.8, 1), wet=0.0),
    "sunrise": dict(
        sun=(-0.97, -0.22, 0.065), sun_energy=3.2, sun_angle=0.8, sun_color=(1.0, 0.70, 0.46),
        sky=dict(type="clear", clouds=0.35, rainbow=False, aerosol=2.2, strength=0.45,
                 cloud_lit=(3.4, 2.3, 1.9), cloud_shade=(0.95, 0.72, 0.78)),
        # A thin morning mist lying on the water.
        fog=(0.66, 0.56, 0.55, 1), mist=0.35, mist_start=150, mist_depth=6000,
        fog_bank=dict(layers=[(12, 1200), (40, 4000)], color=(1.0, 0.9, 0.85), anisotropy=0.5),
        exposure=-0.3, wind=6.0, wave_scale=0.8, chop=1.0, foam=0.03,
        rain=0, rain_alpha=0.2, rain_glow=0.3, lightning=False, lanterns=False,
        **_SEA,
        island=(0.06, 0.13, 0.045, 1), headland=(0.06, 0.07, 0.07, 1),
        smoke=(0.86, 0.8, 0.76, 1), wet=0.0),
    "sunset": dict(
        sun=(0.30, -0.95, 0.035), sun_energy=3.2, sun_angle=0.8, sun_color=(1.0, 0.50, 0.26),
        sky=dict(type="clear", clouds=0.45, rainbow=False, aerosol=3.5, strength=0.45,
                 cloud_lit=(3.8, 1.9, 1.0), cloud_shade=(0.62, 0.40, 0.46)),
        fog=(0.56, 0.40, 0.34, 1), mist=0.35, mist_start=150, mist_depth=6500,
        exposure=-0.45, wind=8.0, wave_scale=0.9, chop=1.1, foam=0.04,
        rain=0, rain_alpha=0.2, rain_glow=0.3, lightning=False,
        lanterns=True, lantern_energy=30.0, lantern_glow=10.0,
        **_SEA,
        island=(0.055, 0.1, 0.04, 1), headland=(0.05, 0.045, 0.05, 1),
        smoke=(0.8, 0.7, 0.62, 1), wet=0.0),
    "overcast": dict(
        sun=(-0.5, -0.4, 0.75), sun_energy=1.6, sun_angle=25, sun_color=(0.95, 0.97, 1.0),
        sky=dict(type="deck", horizon=(0.30, 0.32, 0.34), band=(0.20, 0.215, 0.23),
                 zenith=(0.10, 0.11, 0.12), glow_dir=(-0.5, -0.4, 0.75), glow=(0.10, 0.10, 0.10),
                 cloud_lit=(1.5, 1.5, 1.52), cloud_dark=(0.55, 0.57, 0.6)),
        fog=(0.42, 0.45, 0.48, 1), mist=0.45, mist_start=150, mist_depth=7000,
        exposure=0.1, wind=11.0, wave_scale=1.4, chop=1.3, foam=0.15,
        rain=0, rain_alpha=0.2, rain_glow=0.2, lightning=False, lanterns=False,
        sea_deep=(0.004, 0.022, 0.025, 1), sea_crest=(0.02, 0.12, 0.10, 1),
        island=(0.06, 0.12, 0.05, 1), headland=(0.05, 0.065, 0.06, 1),
        smoke=(0.7, 0.7, 0.68, 1), wet=0.03),
    "fog": dict(
        sun=(-0.6, -0.3, 0.7), sun_energy=0.9, sun_angle=40, sun_color=(0.95, 0.97, 1.0),
        sky=dict(type="deck", horizon=(0.50, 0.53, 0.55), band=(0.46, 0.49, 0.51),
                 zenith=(0.36, 0.38, 0.40), glow_dir=(-0.6, -0.3, 0.7), glow=(0.04, 0.04, 0.04),
                 cloud_lit=(1.06, 1.06, 1.06), cloud_dark=(0.9, 0.9, 0.92)),
        # Thick: the other ship is a third gone at 30 m, the land entirely.
        fog=(0.50, 0.53, 0.55, 1), mist=0.0, mist_start=0, mist_depth=5000,
        fog_bank=dict(layers=[(40, 75), (150, 180), (600, 600)], color=(0.92, 0.94, 0.96),
                      anisotropy=0.35),
        exposure=0.1, wind=4.0, wave_scale=0.6, chop=0.9, foam=0.02,
        rain=0, rain_alpha=0.2, rain_glow=0.2, lightning=False,
        lanterns=True, lantern_energy=45.0, lantern_glow=12.0,
        sea_deep=(0.006, 0.022, 0.026, 1), sea_crest=(0.03, 0.11, 0.10, 1),
        island=(0.06, 0.11, 0.05, 1), headland=(0.05, 0.06, 0.06, 1),
        smoke=(0.75, 0.75, 0.74, 1), wet=0.06),
    "storm": dict(
        sun=(-0.55, -0.55, 0.62), sun_energy=0.55, sun_angle=12, sun_color=(0.80, 0.86, 1.0),
        # Dark and heavy: most of the light is a pale band low behind the
        # ships where the squall thins, so they stand against it; overhead
        # it is nearly black. Fog takes the land down to shapes.
        sky=dict(type="deck", strength=0.32, horizon=(0.16, 0.175, 0.19), band=(0.05, 0.056, 0.064),
                 zenith=(0.008, 0.009, 0.011), glow=(0.16, 0.17, 0.19),
                 cloud_lit=(2.2, 2.2, 2.3), cloud_dark=(0.12, 0.13, 0.15)),
        # A low fog bank in the squall: the land goes to shapes and then to
        # nothing, and lanterns and lightning light it from inside.
        fog=(0.055, 0.062, 0.072, 1), mist=0.0, mist_start=5, mist_depth=5000,
        fog_bank=dict(layers=[(40, 130), (160, 320), (600, 1100)], color=(0.85, 0.88, 0.92),
                      anisotropy=0.45, glow=(0.03, 0.034, 0.041)),
        exposure=-0.6, wind=15.0, wave_scale=2.2, chop=1.5, foam=0.4,
        rain=45000, rain_alpha=0.3, rain_glow=0.08, lightning=True,
        lanterns=True, lantern_energy=70.0, lantern_glow=14.0,
        sea_deep=(0.004, 0.02, 0.02, 1), sea_crest=(0.025, 0.12, 0.09, 1),
        island=(0.05, 0.1, 0.045, 1), headland=(0.03, 0.042, 0.035, 1),
        smoke=(0.55, 0.55, 0.53, 1), wet=0.12),
    "night": dict(
        sun=(-0.55, 0.45, 0.40), sun_energy=0.35, sun_angle=0.55, sun_color=(0.62, 0.72, 1.0),
        sky=dict(type="night", clouds=0.35),
        # A low sea mist: the moon and the lanterns light it, and the land
        # goes soft. No 2D haze, which would grey the land against the sky.
        fog=(0.010, 0.014, 0.026, 1), mist=0.0, mist_start=120, mist_depth=4000,
        fog_bank=dict(layers=[(25, 450), (120, 1300), (500, 3500)], color=(0.8, 0.85, 0.95),
                      anisotropy=0.55),
        exposure=0.9, wind=8.0, wave_scale=1.0, chop=1.1, foam=0.05,
        rain=0, rain_alpha=0.2, rain_glow=0.1, lightning=False,
        lanterns=True, lantern_energy=90.0, lantern_glow=16.0,
        sea_deep=(0.002, 0.012, 0.018, 1), sea_crest=(0.01, 0.06, 0.07, 1),
        island=(0.03, 0.06, 0.03, 1), headland=(0.012, 0.02, 0.02, 1),
        smoke=(0.4, 0.4, 0.42, 1), wet=0.03),
}


def set_mist(w):
    w.mist_settings.start = ctx.W["mist_start"]
    w.mist_settings.depth = ctx.W["mist_depth"]
    w.mist_settings.falloff = "LINEAR"


def build_world_clear(p):
    """Physical sky with scattered fair-weather cumulus and, optionally, a
    rainbow on the rain curtain opposite the sun. Sunny, sunrise, sunset.

    p (the weather's "sky" dict): clouds (cover 0..1, 0.5 scattered),
    cloud_lit / cloud_shade (sunlit tops / shaded middles, linear RGB),
    rainbow, strength, aerosol."""
    w = bpy.data.worlds.new(ctx.weather_name or "Clear")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt, N, L = nodes(w)
    bg = N["Background"]
    sun = Vector(ctx.W["sun"]).normalized()
    sky = N.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = False          # the sun lamp is the sun; it is behind the camera
    sky.sun_elevation = math.asin(sun.z)
    # Cycles puts the sky's sun at azimuth (rotation - 90 deg).
    sky.sun_rotation = math.atan2(sun.y, sun.x) + math.pi / 2
    sky.altitude = 20
    sky.air_density = 1.0
    sky.aerosol_density = p.get("aerosol", 1.2)
    sky.ozone_density = 1.0
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Generated"], sep.inputs[0])
    zc = N.new("ShaderNodeMath"); zc.operation = "MAXIMUM"; zc.inputs[1].default_value = 0.0
    L.new(sep.outputs["Z"], zc.inputs[0])

    # Cumulus: a plane projection (xy/z) so the deck recedes to the horizon.
    zs = N.new("ShaderNodeMath"); zs.operation = "ADD"; zs.inputs[1].default_value = 0.08
    L.new(zc.outputs[0], zs.inputs[0])
    cz = N.new("ShaderNodeCombineXYZ")
    for i in range(3):
        L.new(zs.outputs[0], cz.inputs[i])
    proj = N.new("ShaderNodeVectorMath"); proj.operation = "DIVIDE"
    L.new(tc.outputs["Generated"], proj.inputs[0]); L.new(cz.outputs[0], proj.inputs[1])
    val = N.new("ShaderNodeValue")
    val.outputs[0].default_value = 0.0
    val.outputs[0].keyframe_insert("default_value", frame=0)
    val.outputs[0].default_value = 0.006
    val.outputs[0].keyframe_insert("default_value", frame=ctx.FPS)
    drift = N.new("ShaderNodeVectorMath"); drift.operation = "MULTIPLY_ADD"
    L.new(val.outputs[0], drift.inputs[0])
    drift.inputs[1].default_value = (ctx.WIND.x, ctx.WIND.y, 0)
    L.new(proj.outputs[0], drift.inputs[2])
    cl = N.new("ShaderNodeTexNoise"); cl.noise_dimensions = "4D"
    cl.inputs["Scale"].default_value = 0.9
    cl.inputs["Detail"].default_value = 7
    cl.inputs["Roughness"].default_value = 0.58
    L.new(drift.outputs[0], cl.inputs["Vector"]); L.new(val.outputs[0], cl.inputs["W"])
    cover = N.new("ShaderNodeMapRange")
    # Cover 0.5 is the scattered cumulus of a fine afternoon; more cover
    # lowers the threshold, so more of the noise turns to cloud.
    c0 = 0.78 - 0.48 * p.get("clouds", 0.5)
    cover.inputs["From Min"].default_value = c0
    cover.inputs["From Max"].default_value = c0 + 0.12
    L.new(cl.outputs["Fac"], cover.inputs["Value"])
    # Self-shadowed puffs: the denser middle of each cloud goes grey.
    shade = N.new("ShaderNodeValToRGB")
    shade.color_ramp.elements[0].position = 0.55
    shade.color_ramp.elements[0].color = (*p.get("cloud_lit", (3.2, 3.1, 2.95)), 1)
    shade.color_ramp.elements[1].position = 0.8
    shade.color_ramp.elements[1].color = (*p.get("cloud_shade", (1.25, 1.3, 1.4)), 1)
    L.new(cl.outputs["Fac"], shade.inputs[0])
    low = N.new("ShaderNodeMapRange")
    low.inputs["From Min"].default_value = 0.0
    low.inputs["From Max"].default_value = 0.06
    L.new(zc.outputs[0], low.inputs["Value"])
    mask = N.new("ShaderNodeMath"); mask.operation = "MULTIPLY"
    L.new(cover.outputs[0], mask.inputs[0]); L.new(low.outputs[0], mask.inputs[1])
    withcl = N.new("ShaderNodeMix"); withcl.data_type = "RGBA"
    L.new(mask.outputs[0], withcl.inputs[0])
    L.new(sky.outputs[0], withcl.inputs[6]); L.new(shade.outputs[0], withcl.inputs[7])

    # Rainbow: 40.5-42.5 deg from the antisolar point, violet inside, red
    # outside, only above the horizon, patchy where the shower thins.
    anti = -sun
    dot = N.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
    L.new(tc.outputs["Generated"], dot.inputs[0]); dot.inputs[1].default_value = tuple(anti)
    acos = N.new("ShaderNodeMath"); acos.operation = "ARCCOSINE"
    L.new(dot.outputs["Value"], acos.inputs[0])
    band = N.new("ShaderNodeMapRange")
    band.inputs["From Min"].default_value = math.radians(39.8)
    band.inputs["From Max"].default_value = math.radians(42.9)
    L.new(acos.outputs[0], band.inputs["Value"])
    bow = N.new("ShaderNodeValToRGB")
    ce = bow.color_ramp.elements
    ce[0].position = 0.0; ce[0].color = (0, 0, 0, 1)
    ce[1].position = 1.0; ce[1].color = (0, 0, 0, 1)
    for pos, col in ((0.12, (0.20, 0.02, 0.35)), (0.3, (0.05, 0.12, 0.6)), (0.5, (0.08, 0.5, 0.12)),
                     (0.68, (0.7, 0.62, 0.05)), (0.84, (0.75, 0.12, 0.03))):
        e = ce.new(pos); e.color = (*col, 1)
    L.new(band.outputs[0], bow.inputs[0])
    patch = N.new("ShaderNodeTexNoise")
    patch.inputs["Scale"].default_value = 2.5
    patch.inputs["Detail"].default_value = 2
    L.new(tc.outputs["Generated"], patch.inputs["Vector"])
    pm = N.new("ShaderNodeMapRange")
    pm.inputs["From Min"].default_value = 0.35
    pm.inputs["From Max"].default_value = 0.6
    pm.inputs["To Min"].default_value = 0.25
    pm.inputs["To Max"].default_value = 1.0
    L.new(patch.outputs["Fac"], pm.inputs["Value"])
    horizon = N.new("ShaderNodeMapRange")
    horizon.inputs["From Min"].default_value = 0.0
    horizon.inputs["From Max"].default_value = 0.04
    L.new(sep.outputs["Z"], horizon.inputs["Value"])
    k = N.new("ShaderNodeMath"); k.operation = "MULTIPLY"
    L.new(pm.outputs[0], k.inputs[0]); L.new(horizon.outputs[0], k.inputs[1])
    k2 = N.new("ShaderNodeMath"); k2.operation = "MULTIPLY"
    L.new(k.outputs[0], k2.inputs[0]); k2.inputs[1].default_value = 4.0
    add = N.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"
    L.new(k2.outputs[0], add.inputs[0])
    L.new(withcl.outputs[2], add.inputs[6]); L.new(bow.outputs[0], add.inputs[7])
    if p.get("rainbow", True):
        L.new(add.outputs[2], bg.inputs["Color"])
    else:
        L.new(withcl.outputs[2], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = p.get("strength", 0.32)
    linear_extrapolate(w.node_tree)
    set_mist(w)
    return w


def build_world():
    """The sky for ctx.W: its "sky" dict picks the builder by "type"."""
    p = ctx.W.get("sky", {})
    kind = p.get("type", "deck" if ctx.W["lightning"] else "clear")
    w = {"clear": build_world_clear, "deck": build_world_deck, "night": build_world_night}[kind](p)
    return w


def build_fog_bank(coll, centre):
    """Real fog lying on the sea, from the weather's `fog_bank` dict: boxes of
    scattering volume stacked in layers, thickest at the water and thinning
    with height, the way sea fog does. Light scatters in it, so lanterns and
    lightning glow; land fades at its true distance, bottom first; smoke and
    spray sit inside it; and overhead, through the thin top layers, the sky
    still shows. Each layer has one density, which Cycles renders as a
    homogeneous volume, so it stays cheap.

    fog_bank:
      layers      [(top m, distance m), ...] from the water up. Light falls to
                  1/e over `distance`, so small is thick. Make the top layer
                  taller than the land, or peaks stand out of the fog.
      color       scattering tint (default near white).
      anisotropy  forward scattering: halos round lights (default 0.4).
      glow        the colour a long look through the fog settles on
                  (default the weather's `fog`).
      size        width of the boxes, m (default 8000)."""
    fb = ctx.W.get("fog_bank")
    if not fb:
        return []
    import bmesh
    size = fb.get("size", 8000.0)
    glow = fb.get("glow", ctx.W["fog"][:3])
    s2 = size / 2
    out = []
    bottom = -4.0     # below the troughs, so the sea surface is always inside
    for i, (top, dist) in enumerate(fb["layers"]):
        me = bpy.data.meshes.new(f"fog-bank-{i}")
        vs = [(x, y, z) for z in (bottom, top) for y in (-s2, s2) for x in (-s2, s2)]
        fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        me.from_pydata(vs, [], fs)
        # Normals out: Cycles decides inside from them, and the camera starts
        # inside the fog.
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        o = link(bpy.data.objects.new(f"Fog Bank {i}", me), coll)
        o.location = (centre.x, centre.y, 0)
        m = bpy.data.materials.new(f"Fog Bank {i}")
        m.use_nodes = True
        nt, N, L = nodes(m)
        N.remove(N["Principled BSDF"])
        vol = N.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (*fb.get("color", (0.9, 0.92, 0.95)), 1)
        vol.inputs["Density"].default_value = 1.0 / dist
        vol.inputs["Anisotropy"].default_value = fb.get("anisotropy", 0.4)
        # Real fog is bright because light bounces in it many times; a render
        # with one or two volume bounces leaves it dark grey. Make up for it
        # with a faint glow, sized so a long look through the fog settles on
        # `glow` (emission / density); scattering adds the halos round
        # lanterns and the lightning on top.
        vol.inputs["Emission Color"].default_value = (*glow, 1)
        vol.inputs["Emission Strength"].default_value = 1.0 / dist
        L.new(vol.outputs[0], N["Material Output"].inputs["Volume"])
        me.materials.append(m)
        out.append(o)
        bottom = top
    return out

def build_world_deck(p):
    """A sky under a cloud deck: a horizon-to-zenith gradient, a brighter
    patch where the sun is behind the cloud, and drifting cloud texture over
    all of it. Overcast, fog and storm; the sky flashes with any lightning.

    p (the weather's "sky" dict): horizon, band, zenith (gradient colours),
    glow_dir / glow (where the cloud is lit from behind and how much),
    cloud_lit / cloud_dark (thin and thick cloud multipliers), strength."""
    w = bpy.data.worlds.new(ctx.weather_name or "Deck")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt, N, L = nodes(w)
    bg = N["Background"]
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Generated"], sep.inputs[0])
    # Horizon-to-zenith gradient: a bright band of storm light low in the
    # west (behind the islands), bruised grey overhead.
    grad = N.new("ShaderNodeValToRGB")
    cr = grad.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = (*p.get("horizon", (0.13, 0.145, 0.155)), 1)
    cr.elements[1].position = 0.35
    cr.elements[1].color = (*p.get("zenith", (0.022, 0.026, 0.031)), 1)
    e = cr.elements.new(0.08)
    e.color = (*p.get("band", (0.06, 0.068, 0.075)), 1)
    zc = N.new("ShaderNodeMath"); zc.operation = "MAXIMUM"; zc.inputs[1].default_value = 0.0
    L.new(sep.outputs["Z"], zc.inputs[0])
    L.new(zc.outputs[0], grad.inputs[0])

    # Brighter where the sun is behind the cloud (toward +X, low).
    sun_dir = Vector(p.get("glow_dir", (0.85, -0.25, 0.25))).normalized()
    dot = N.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
    L.new(tc.outputs["Generated"], dot.inputs[0])
    dot.inputs[1].default_value = tuple(sun_dir)
    glow = N.new("ShaderNodeMapRange")
    glow.inputs["From Min"].default_value = 0.55
    glow.inputs["From Max"].default_value = 1.0
    glow.inputs["To Max"].default_value = 1.0
    L.new(dot.outputs["Value"], glow.inputs["Value"])
    gpow = N.new("ShaderNodeMath"); gpow.operation = "POWER"; gpow.inputs[1].default_value = 2.2
    L.new(glow.outputs[0], gpow.inputs[0])

    # Cloud deck: noise on a plane projection (xy / z) so it recedes to the
    # horizon, drifting with the wind.
    zs = N.new("ShaderNodeMath"); zs.operation = "ADD"; zs.inputs[1].default_value = 0.06
    L.new(zc.outputs[0], zs.inputs[0])
    proj = N.new("ShaderNodeVectorMath"); proj.operation = "DIVIDE"
    L.new(tc.outputs["Generated"], proj.inputs[0])
    cz = N.new("ShaderNodeCombineXYZ")
    L.new(zs.outputs[0], cz.inputs[0]); L.new(zs.outputs[0], cz.inputs[1]); L.new(zs.outputs[0], cz.inputs[2])
    L.new(cz.outputs[0], proj.inputs[1])
    drift = N.new("ShaderNodeVectorMath"); drift.operation = "ADD"
    L.new(proj.outputs[0], drift.inputs[0])
    tv = N.new("ShaderNodeCombineXYZ")
    val = N.new("ShaderNodeValue")
    val.outputs[0].default_value = 0.0
    val.outputs[0].keyframe_insert("default_value", frame=0)
    val.outputs[0].default_value = 0.02
    val.outputs[0].keyframe_insert("default_value", frame=ctx.FPS)
    mx = N.new("ShaderNodeMath"); mx.operation = "MULTIPLY"; mx.inputs[1].default_value = ctx.WIND.x
    my = N.new("ShaderNodeMath"); my.operation = "MULTIPLY"; my.inputs[1].default_value = ctx.WIND.y
    L.new(val.outputs[0], mx.inputs[0]); L.new(val.outputs[0], my.inputs[0])
    L.new(mx.outputs[0], tv.inputs[0]); L.new(my.outputs[0], tv.inputs[1])
    L.new(tv.outputs[0], drift.inputs[1])
    cl = N.new("ShaderNodeTexNoise"); cl.noise_dimensions = "4D"
    cl.inputs["Scale"].default_value = 0.4
    cl.inputs["Detail"].default_value = 12
    cl.inputs["Roughness"].default_value = 0.62
    cl.inputs["Distortion"].default_value = 0.35
    L.new(drift.outputs[0], cl.inputs["Vector"])
    L.new(val.outputs[0], cl.inputs["W"])
    cramp = N.new("ShaderNodeValToRGB")
    cramp.color_ramp.elements[0].position = 0.45
    cramp.color_ramp.elements[0].color = (*p.get("cloud_lit", (1.9, 1.9, 1.95)), 1)
    cramp.color_ramp.elements[1].position = 0.6
    cramp.color_ramp.elements[1].color = (*p.get("cloud_dark", (0.22, 0.24, 0.27)), 1)
    L.new(cl.outputs["Fac"], cramp.inputs[0])
    sky = N.new("ShaderNodeMix"); sky.data_type = "RGBA"; sky.blend_type = "MULTIPLY"
    sky.inputs[0].default_value = 1.0
    L.new(grad.outputs[0], sky.inputs[6]); L.new(cramp.outputs[0], sky.inputs[7])
    lit = N.new("ShaderNodeMix"); lit.data_type = "RGBA"; lit.blend_type = "ADD"
    L.new(gpow.outputs[0], lit.inputs[0])
    L.new(sky.outputs[2], lit.inputs[6])
    lit.inputs[7].default_value = (*p.get("glow", (0.20, 0.22, 0.25)), 1)
    L.new(lit.outputs[2], bg.inputs["Color"])
    # Lightning: the whole sky flashes.
    base = p.get("strength", 1.0)
    bg.inputs["Strength"].default_value = base
    bg.inputs["Strength"].keyframe_insert("default_value", frame=ctx.F_START)
    for f, k in (ctx.LIGHTNING if ctx.W["lightning"] else []):
        for ff, kk in ((f - 1, 1.0), (f, 1.0 + 7.0 * k), (f + 1, 1.0 + 2.0 * k), (f + 2, 1.0)):
            bg.inputs["Strength"].default_value = kk * base
            bg.inputs["Strength"].keyframe_insert("default_value", frame=ff)
    linear_extrapolate(w.node_tree)
    for fc in iter_fcurves(w.node_tree):
        if "Strength" in fc.data_path or "inputs[1]" in fc.data_path:
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"
    set_mist(w)
    return w


def build_world_night(p):
    """A night sky: a deep blue gradient, the moon where the key light (the
    weather's "sun") comes from, with a halo, stars in the gaps, and broken
    cloud that the moon lights from behind.

    p (the weather's "sky" dict): clouds (cover 0..1), horizon, zenith,
    moon (disc colour, bright), halo, cloud_dark, cloud_lit, stars
    (brightness), strength."""
    w = bpy.data.worlds.new(ctx.weather_name or "Night")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt, N, L = nodes(w)
    bg = N["Background"]
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Generated"], sep.inputs[0])
    zc = N.new("ShaderNodeMath"); zc.operation = "MAXIMUM"; zc.inputs[1].default_value = 0.0
    L.new(sep.outputs["Z"], zc.inputs[0])

    def mix(blend, fac, a, b):
        n = N.new("ShaderNodeMix"); n.data_type = "RGBA"; n.blend_type = blend
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = (*v, 1) if len(v) == 3 else v
            else:
                L.new(v, sock)
        return n.outputs[2]

    def map_range(value, a, b, lo=0.0, hi=1.0, smooth=False):
        n = N.new("ShaderNodeMapRange")
        if smooth:
            n.interpolation_type = "SMOOTHSTEP"
        n.inputs["From Min"].default_value = a
        n.inputs["From Max"].default_value = b
        n.inputs["To Min"].default_value = lo
        n.inputs["To Max"].default_value = hi
        L.new(value, n.inputs["Value"])
        return n.outputs[0]

    def math_op(op, a, b):
        n = N.new("ShaderNodeMath"); n.operation = op
        for sock, v in ((n.inputs[0], a), (n.inputs[1], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            else:
                L.new(v, sock)
        return n.outputs[0]

    grad = N.new("ShaderNodeValToRGB")
    cr = grad.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = (*p.get("horizon", (0.010, 0.014, 0.026)), 1)
    cr.elements[1].position = 0.4
    cr.elements[1].color = (*p.get("zenith", (0.0015, 0.002, 0.005)), 1)
    L.new(zc.outputs[0], grad.inputs[0])

    moon = Vector(ctx.W["sun"]).normalized()
    dot = N.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
    L.new(tc.outputs["Generated"], dot.inputs[0])
    dot.inputs[1].default_value = tuple(moon)
    # The disc is drawn about twice true size (0.5 deg across) so it reads
    # in a 1080p frame; the halo is the moonlight scattered in thin cloud.
    r = math.radians(p.get("moon_size", 0.5))
    disc = map_range(dot.outputs["Value"], math.cos(r * 1.15), math.cos(r * 0.85), smooth=True)
    halo = math_op("POWER", map_range(dot.outputs["Value"], 0.75, 1.0), 8.0)
    sky = mix("ADD", halo, grad.outputs[0], p.get("halo", (0.035, 0.045, 0.07)))

    # Stars: sparse bright points, only above the horizon haze.
    st = N.new("ShaderNodeTexVoronoi")
    st.feature = "F1"
    st.inputs["Scale"].default_value = 420.0
    L.new(tc.outputs["Generated"], st.inputs["Vector"])
    pts = map_range(st.outputs["Distance"], 0.06, 0.0)
    pick = N.new("ShaderNodeTexNoise")
    pick.inputs["Scale"].default_value = 180.0
    pick.inputs["Detail"].default_value = 0.0
    L.new(tc.outputs["Generated"], pick.inputs["Vector"])
    few = map_range(pick.outputs["Fac"], 0.55, 0.7)
    above = map_range(zc.outputs[0], 0.03, 0.2)
    star = math_op("MULTIPLY", math_op("MULTIPLY", pts, few), above)
    star = math_op("MULTIPLY", star, p.get("stars", 0.6))
    sky = mix("ADD", star, sky, (0.85, 0.9, 1.0))
    sky = mix("ADD", disc, sky, p.get("moon", (9.0, 9.2, 9.6)))

    # Broken cloud, drifting with the wind, projected so it recedes to the
    # horizon. Dark where thick, silver-edged near the moon.
    zs = math_op("ADD", zc.outputs[0], 0.06)
    cz = N.new("ShaderNodeCombineXYZ")
    for i in range(3):
        L.new(zs, cz.inputs[i])
    proj = N.new("ShaderNodeVectorMath"); proj.operation = "DIVIDE"
    L.new(tc.outputs["Generated"], proj.inputs[0]); L.new(cz.outputs[0], proj.inputs[1])
    val = N.new("ShaderNodeValue")
    val.outputs[0].default_value = 0.0
    val.outputs[0].keyframe_insert("default_value", frame=0)
    val.outputs[0].default_value = 0.008
    val.outputs[0].keyframe_insert("default_value", frame=ctx.FPS)
    drift = N.new("ShaderNodeVectorMath"); drift.operation = "MULTIPLY_ADD"
    L.new(val.outputs[0], drift.inputs[0])
    drift.inputs[1].default_value = (ctx.WIND.x, ctx.WIND.y, 0)
    L.new(proj.outputs[0], drift.inputs[2])
    cl = N.new("ShaderNodeTexNoise"); cl.noise_dimensions = "4D"
    cl.inputs["Scale"].default_value = 0.7
    cl.inputs["Detail"].default_value = 9
    cl.inputs["Roughness"].default_value = 0.6
    cl.inputs["Distortion"].default_value = 0.25
    L.new(drift.outputs[0], cl.inputs["Vector"]); L.new(val.outputs[0], cl.inputs["W"])
    c0 = 0.78 - 0.48 * p.get("clouds", 0.4)
    cover = map_range(cl.outputs["Fac"], c0, c0 + 0.1)
    near_moon = map_range(dot.outputs["Value"], 0.6, 1.0)
    edge = math_op("MULTIPLY", map_range(cl.outputs["Fac"], c0 + 0.1, c0), near_moon)
    ccol = mix("MIX", near_moon, p.get("cloud_dark", (0.004, 0.005, 0.008)),
               p.get("cloud_lit", (0.03, 0.034, 0.045)))
    ccol = mix("ADD", edge, ccol, (0.05, 0.055, 0.07))
    low = map_range(zc.outputs[0], 0.0, 0.05)
    mask = math_op("MULTIPLY", cover, low)
    final = mix("MIX", mask, sky, ccol)
    L.new(final, bg.inputs["Color"])
    bg.inputs["Strength"].default_value = p.get("strength", 1.0)
    linear_extrapolate(w.node_tree)
    set_mist(w)
    return w


def build_lights(coll):
    sd = bpy.data.lights.new("Sun", "SUN")
    sd.energy = ctx.W["sun_energy"]
    sd.angle = math.radians(ctx.W["sun_angle"])
    sd.color = ctx.W["sun_color"]
    so = link(bpy.data.objects.new("Sun", sd), coll)
    # A sun lamp shines down its -Z, so its +Z points at the sun.
    so.rotation_euler = Vector(ctx.W["sun"]).normalized().to_track_quat("Z", "Y").to_euler()
    if not ctx.W["lightning"]:
        return
    # Lightning key: a hard white flash from high behind the ships.
    ld = bpy.data.lights.new("Lightning", "SUN")
    ld.angle = math.radians(2)
    ld.color = (0.8, 0.85, 1.0)
    lo = link(bpy.data.objects.new("Lightning", ld), coll)
    lo.rotation_euler = Vector((0.6, -0.3, 0.65)).normalized().to_track_quat("Z", "Y").to_euler()
    ld.energy = 0.0
    ld.keyframe_insert("energy", frame=ctx.F_START)
    for f, k in ctx.LIGHTNING:
        for ff, kk in ((f - 1, 0.0), (f, 14.0 * k), (f + 1, 4.0 * k), (f + 2, 0.0)):
            ld.energy = kk
            ld.keyframe_insert("energy", frame=ff)
    for fc in iter_fcurves(ld):
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"


def lightning_bolt(coll):
    rnd = random.Random(8)
    pts = [Vector((1500, -1300, 900))]
    while pts[-1].z > 0:
        p = pts[-1]
        pts.append(p + Vector((rnd.gauss(0, 35), rnd.gauss(0, 35), -rnd.uniform(40, 90))))
    cu = bpy.data.curves.new("bolt", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 2.5
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    # Two forks.
    for start in (5, 9):
        q = [pts[start]]
        for _ in range(5):
            q.append(q[-1] + Vector((rnd.gauss(30, 30), rnd.gauss(0, 30), -rnd.uniform(30, 70))))
        s2 = cu.splines.new("POLY")
        s2.points.add(len(q) - 1)
        for i, p in enumerate(q):
            s2.points[i].co = (*p, 1)
    o = link(bpy.data.objects.new("Lightning Bolt", cu), coll)
    m, em = emissive("bolt", (0.75, 0.82, 1.0, 1), 0.0)
    cu.materials.append(m)
    em.inputs["Strength"].keyframe_insert("default_value", frame=ctx.F_START)
    for f, k in ctx.LIGHTNING[:3]:
        for ff, kk in ((f - 1, 0.0), (f, 400.0 * k), (f + 1, 60 * k), (f + 2, 0.0)):
            em.inputs["Strength"].default_value = kk
            em.inputs["Strength"].keyframe_insert("default_value", frame=ff)
    for fc in iter_fcurves(m.node_tree):
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
    # An emission at strength 0 is black, so between flashes the bolt would
    # hang in the sky as a dark crack. Only render it while it is lit.
    o.hide_render = True
    o.keyframe_insert("hide_render", frame=ctx.F_START)
    for f, _ in ctx.LIGHTNING[:3]:
        for ff, hide in ((f, False), (f + 2, True)):
            o.hide_render = hide
            o.keyframe_insert("hide_render", frame=ff)
    for fc in iter_fcurves(o):
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
    o.visible_shadow = False
