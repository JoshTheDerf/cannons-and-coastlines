"""Hero cinematic: a Corsair and a Queen's Fleet ship trade shots in a squall.

    blender -b --python scripts/blender/hero_battle.py -- [options]

    --weather W        "sunny" (default) or "storm"; see WEATHERS.
    --save PATH        Write the built scene to a .blend (default build/hero/hero-battle-<weather>.blend).
    --still F[,F..]    Render these frames as PNG stills into --out, then stop.
    --render           Render the whole animation as PNG frames into --out/frames.
    --frames A-B       Limit --render to a frame range (for splitting a long render).
    --pct N            Resolution percentage of 1920x1080 (default 100).
    --samples N        Cycles samples (default 128).
    --out DIR          Output folder (default build/hero).

Everything the ships are made of comes from the real parts: the hulls, masts,
sails, cargo, cannon, coin and cannonball are the base-set STLs, assembled from
nuxt-site/shared/data/ship-assemblies.json exactly as the site's 3D preview
assembles them (sockets, anchors, the sail bend). The pieces are then scaled up
(S metres per millimetre) so the models read as full-size ships on a real sea.

The shots are not simulated. Each ball flies a ballistic arc keyed from the
muzzle at the firing frame to its impact point, and the splash, splinters and
rain are point clouds whose motion is closed-form in geometry nodes. Nothing
needs baking, so any frame renders on its own and a render can be split across
runs.

The flag textures are single flags cropped from the kit's flag sheets
(assets/stls/base-set/flag-*.svg) and live next to this script in hero/. The
first build of each weather samples the sea under the ships (a few minutes)
and caches it in build/hero/; later builds reuse it.
"""

import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector, noise

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DATA = json.loads((REPO / "nuxt-site/shared/data/ship-assemblies.json").read_text())
BUILD = REPO / "build" / "hero"

S = 0.25            # metres per model millimetre: a 120 mm hull is a 30 m ship
FPS = 24
F_START, F_END = 1, 288
PREROLL = 48        # frames of ship motion simulated before F_START so it starts settled
G = 9.81

# The ships run before the wind toward the island, so it blows from astern:
# smoke drifts ahead of them, the flags stream forward, the rain leans on.
WIND = Vector((1.0, -0.25, 0.0)).normalized()

# The action. Both ships sail away from the start, toward the island ahead
# (+X), side by side 30 m apart. The Queen's Fleet starts well ahead, beyond
# the arc of the Corsair's gun; the Corsair, much the faster, runs it down
# (see CHASE) until the gun bears, fires, then eases to just a little faster
# than its quarry. A hull's bow is its -X, so heading 180 deg points it down +X.
# Sailing that way the Corsair's starboard (hull +Y) side faces the Queen's
# Fleet and the Queen's Fleet's port (hull -Y) side faces the Corsair.
# Each gun is in the angled socket on that side and trained on the other
# ship: the Corsair's ~28 deg forward (hull -X), the Queen's ~28 deg aft.
#
# `deck_cam` is (x, y, height above deck) in hull mm. The pieces are game
# pieces, not scale models: the gun stands 17 mm, a "man's" eye height
# (7 mm) would put the camera behind the gun. So the eye is above the gun's
# top, off the centreline opposite it, so the gun sits at the frame's edge.
SHIPS = {
    "corsairs":     {"pos": Vector((0.0, 15.0)), "heading": 180.0, "speed": 2.2, "chase": True,
                     "cannon": {"at": [-10.9, 6.69, 15.88], "rotZ": 118.0},
                     # Low, just aft of the gun, so its barrel runs along the
                     # bottom of the frame.
                     "deck_cam": (-1.0, -3.0, 9.0)},
    "queens-fleet": {"pos": None, "heading": 180.0, "speed": 2.2,   # pos: see below
                     "cannon": {"at": [3.21, -6.74, 14.9], "rotZ": -62.0},
                     # On deck just forward of the gun and to one side, low,
                     # looking back over its barrel at the Corsair: the gun and
                     # a corner of the deck and stern castle say whose ship
                     # this is. (The Corsair's camera mirrors it.)
                     "deck_cam": (1.0, 3.5, 9.0)},
    # Two more of the Corsair's consorts, a couple of hundred metres astern
    # on the same course, filling out the Queen's Fleet's view behind it.
    # Each on its own slightly different course and speed, so they read as
    # separate ships rather than a formation, but roughly keeping pace with
    # the lead Corsair (within ~0.1 m/s of it).
    # Placed so that when the Queen's Fleet fires (frame ~178) they stand
    # clear either side of the foreground Corsair in its camera, ~35 deg
    # left at ~150 m and ~33 deg right at ~170 m, rather than behind it.
    "corsairs-2":   {"model": "corsairs", "pos": Vector((-111.0, 66.0)), "heading": 177.0,
                     "speed": 2.1, "chase": True, "cannon": {"at": [-10.9, 6.69, 15.88], "rotZ": 118.0}},
    "corsairs-3":   {"model": "corsairs", "pos": Vector((39.0, 150.0)), "heading": 184.0,
                     "speed": 2.3, "chase": True, "cannon": {"at": [-10.9, 6.69, 15.88], "rotZ": 118.0}},
}
# The guns and balls are drawn smaller than the game's: at true size a gun
# is a third of the beam and walls off the deck cameras.
GUN_SCALE = 0.45
WATERLINE_MM = 6.0  # hull height (mm) the mean sea surface cuts
NEAR_C = Vector((30.0, 0.0))   # centre of the fine ocean patch

# Timeline (frames). Two shots, cut in the middle: from the Corsair's deck as
# it fires on the Queen's Fleet, then from the Queen's Fleet's deck as it
# answers.
CUT = 150
SHOT_1 = {"from": "corsairs", "fire": 84, "flight": 20}        # falls just short: splash
SHOT_2 = {"from": "queens-fleet", "fire": 178, "flight": 18}   # hits the Corsair's side
# ...and fires again: brings down the Corsair's foremast, which crippled,
# falls off the pace (CRIPPLE).
SHOT_3 = {"from": "queens-fleet", "fire": 206, "flight": 18, "train": (198, 205)}
CRIPPLE = {"to": 0.6, "over": 2.0}   # speed (m/s) the Corsair slows to, over this many s
LIGHTNING = [(118, 1.0), (120, 0.35), (122, 0.8), (236, 0.6), (238, 0.2)]

# The chase. Ships marked "chase" sail CHASE["extra"] m/s faster than their
# base speed until the first shot, then ease over CHASE["ease"] s to
# CHASE["after"] m/s faster, which they keep. The Queen's Fleet's start is
# set so that when the Corsair fires it is CHASE["lead"] m ahead, the lead
# the Corsair's gun is trained for.
CHASE = {"extra": 2.4, "ease": 1.5, "after": 0.35, "lead": 16.0}


def chase_distance(t):
    """Extra distance (m) a chasing ship has made good by time t (s)."""
    t1 = (SHOT_1["fire"] - F_START) / FPS
    e, E, a = CHASE["extra"], CHASE["ease"], CHASE["after"]
    if t <= t1:
        return e * t
    d = e * t1
    u = min(t - t1, E)
    d += e * u + (a - e) * u * u / (2 * E)     # speed eases linearly e -> a
    if t - t1 > E:
        d += a * (t - t1 - E)
    return d


SHIPS["queens-fleet"]["pos"] = Vector(
    (SHIPS["corsairs"]["pos"].x + CHASE["lead"] + chase_distance((SHOT_1["fire"] - F_START) / FPS), -15.0))

# The two consorts steer to intercept the Queen's Fleet: each heads for where
# it will be INTERCEPT_S seconds on (a long, converging course, not a dash
# across the frame), a few degrees either side of it so they don't sail in
# lockstep. heading h means travel along (-cos h, -sin h).
INTERCEPT_S = 40.0
_q = SHIPS["queens-fleet"]
_aim = _q["pos"] + Vector((-math.cos(math.radians(_q["heading"])),
                           -math.sin(math.radians(_q["heading"])))) * _q["speed"] * INTERCEPT_S
for _k, _off in (("corsairs-2", 3.0), ("corsairs-3", -3.0)):
    _d = _aim - SHIPS[_k]["pos"]
    SHIPS[_k]["heading"] = math.degrees(math.atan2(-_d.y, -_d.x)) + _off

# The two looks. `sun` points from the scene toward the sun.
#   sunny: a bright afternoon after the squall has passed over. The sun is
#          low behind the camera, so it rakes the sails, throws long
#          shadows across the decks, and the last of the shower hangs a
#          rainbow over the islands. Almost no haze.
#   storm: the squall itself. The key comes through a break in the cloud
#          behind the camera so the ships still read; the horizon behind
#          them glows. Lightning, heavy rain, dense haze on the far land.
WEATHERS = {
    "sunny": dict(
        sun=(-0.90, 0.33, 0.43), sun_energy=4.2, sun_angle=0.6, sun_color=(1.0, 0.93, 0.82),
        fog=(0.46, 0.56, 0.68, 1), mist=0.22, mist_start=250, mist_depth=9000,
        exposure=-0.5, wind=9.0, wave_scale=1.0, chop=1.1, foam=0.05,
        rain=22000, rain_alpha=0.2, rain_glow=0.35, lightning=False,
        sea_deep=(0.004, 0.028, 0.03, 1), sea_crest=(0.02, 0.16, 0.13, 1),
        island=(0.07, 0.16, 0.045, 1), headland=(0.05, 0.085, 0.045, 1),
        smoke=(0.85, 0.84, 0.8, 1), wet=0.0),
    "storm": dict(
        sun=(-0.55, -0.55, 0.62), sun_energy=2.6, sun_angle=12, sun_color=(0.9, 0.93, 1.0),
        fog=(0.10, 0.115, 0.125, 1), mist=0.75, mist_start=80, mist_depth=5000,
        exposure=0.45, wind=15.0, wave_scale=2.2, chop=1.5, foam=0.4,
        rain=45000, rain_alpha=0.3, rain_glow=0.12, lightning=True,
        sea_deep=(0.004, 0.02, 0.02, 1), sea_crest=(0.025, 0.12, 0.09, 1),
        island=(0.06, 0.12, 0.05, 1), headland=(0.035, 0.05, 0.04, 1),
        smoke=(0.62, 0.62, 0.6, 1), wet=0.12),
}
W = WEATHERS["sunny"]   # set from --weather in main()


# ---------------------------------------------------------------- utilities

def srgb(hexstr, a=1.0):
    h = hexstr.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


def link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def import_stl(path):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=str(path))
    obj = next(o for o in bpy.data.objects if o not in before)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    recalc_normals(obj.data)
    return obj


def recalc_normals(me):
    """STL winding is whatever the exporter left; make every face point out
    so shading, coat and backface-dependent effects are right."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()


_mesh_cache = {}


def part_object(name, stl, smooth=35.0):
    """A new object on the (shared) mesh of `stl`, unlinked."""
    if stl not in _mesh_cache:
        o = import_stl(REPO / stl)
        me = o.data
        bpy.data.objects.remove(o)
        if smooth:
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(smooth))
        _mesh_cache[stl] = me
    return bpy.data.objects.new(name, _mesh_cache[stl])


def set_object_material(obj, mat):
    """Parts share one mesh per STL (both ships' masts are the same mast),
    so the material goes on the object's slot, not the mesh's: otherwise the
    last ship built paints every copy (the Corsair's black masts came out
    Queen's Fleet wood)."""
    if not obj.data.materials:
        obj.data.materials.append(None)
    slot = obj.material_slots[0]
    slot.link = "OBJECT"
    slot.material = mat


def place_matrix(at, rot_z=0.0, anchor=(0, 0, 0), rot_x=0.0, scale=1.0):
    """world = at + Rz(rotZ) * Rx(rotX) * s * (p - anchor), as in
    shipAssembly.ts (which has no scale; s shrinks a part about its anchor)."""
    return (Matrix.Translation(Vector(at))
            @ Matrix.Rotation(math.radians(rot_z), 4, "Z")
            @ Matrix.Rotation(math.radians(rot_x), 4, "X")
            @ Matrix.Scale(scale, 4)
            @ Matrix.Translation(-Vector(anchor)))


def nodes(mat_or_tree):
    nt = mat_or_tree.node_tree if hasattr(mat_or_tree, "node_tree") else mat_or_tree
    return nt, nt.nodes, nt.links


def new_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m


def bsdf_of(m):
    return m.node_tree.nodes["Principled BSDF"]


def setin(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


# ---------------------------------------------------------------- materials

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
      - light filament is a little translucent (subsurface), which is why a
        white print glows at thin edges and never looks like enamel.
    The parts are modelled in mm, so object-space Z is print height in mm.
    Every filament gets some subsurface; even black PLA scatters a little,
    and without it dark parts read as painted metal. Metal-free: the kit's
    cannon is black PLA too."""
    m = new_material(name)
    nt, N, L = nodes(m)
    b = bsdf_of(m)
    b.inputs["Base Color"].default_value = color
    b.inputs["Metallic"].default_value = metallic
    b.inputs["IOR"].default_value = 1.5
    setin(b, "Specular IOR Level", 0.5)
    setin(b, "Coat Weight", W.get("wet", 0.0))
    setin(b, "Coat Roughness", 0.15)
    setin(b, "Sheen Weight", 0.0)
    if sss:
        setin(b, "Subsurface Weight", sss)
        # Neutral scatter: a warm radius turns black filament brown in sun.
        setin(b, "Subsurface Radius", (1.0, 0.95, 0.9))
        setin(b, "Subsurface Scale", 1.2 * S)   # ~1 mm of light travel in the filament
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
        bump.inputs["Distance"].default_value = 0.05 * S   # bead height ~0.05 mm
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
    m = plastic("Queen's Hull", (0.36, 0.2, 0.09, 1), rough=0.45, sss=0.12)
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
    M["black-hull"] = plastic("Corsair Hull", (0.035, 0.035, 0.038, 1), rough=0.42, sss=0.03)
    M["black"] = plastic("Black PLA", (0.028, 0.028, 0.03, 1), rough=0.42, sss=0.03)
    M["black-sail"] = plastic("Corsair Sail", (0.03, 0.03, 0.032, 1), rough=0.55,
                              layers=False, translucent=0.08, sss=0.03)
    M["blue-grey"] = queens_livery()   # the Queen's Fleet hull (kit colour key "blue-grey")
    M["white"] = plastic("Sail White", (0.86, 0.84, 0.80, 1), rough=0.55,
                         layers=False, translucent=0.3, sss=0.3)
    M["wood"] = plastic("Wood PLA", (0.30, 0.17, 0.08, 1), rough=0.5, sss=0.15)
    # The Queen's Fleet's masts: a dark walnut brown, deeper than the crates.
    M["mast-wood"] = plastic("Mast Wood PLA", (0.075, 0.035, 0.015, 1), rough=0.48, sss=0.1)
    M["gunmetal"] = plastic("Cannon", (0.03, 0.03, 0.03, 1), rough=0.4, sss=0.03)
    M["grey"] = plastic("Grey PLA", (0.45, 0.45, 0.45, 1), sss=0.2)
    M["neon-green"] = plastic("Cannonball", (0.22, 0.58, 0.10, 1), rough=0.42, sss=0.25)
    # Silk gold PLA: the one genuinely shiny filament, metallic-looking and
    # with strong layer lines.
    gold = plastic("Coin Gold", (1.0, 0.56, 0.13, 1), rough=0.28, metallic=0.7)
    M["gold"] = gold
    return M


# ---------------------------------------------------------------- ships

def bend_sail(me, holes, chord_ratio):
    """Port of bendSail() in nuxt-site/app/lib/shipAssembly.ts: thread the flat
    sheet on its mast, bowing alternately toward bow and stern between holes.
    Rewrites `me` in place; returns nothing (min Z is read afterwards)."""
    def arc_angle(ratio):
        lo, hi = 1e-4, 2 * math.pi - 1e-4
        for _ in range(60):
            mid = (lo + hi) / 2
            if math.sin(mid / 2) / (mid / 2) > ratio:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    x0, y0 = holes[0]
    xn, yn = holes[-1]
    ln = math.hypot(xn - x0, yn - y0)
    ax, ay = (xn - x0) / ln, (yn - y0) / ln
    along = lambda x, y: (x - x0) * ax + (y - y0) * ay
    stops = [along(x, y) for x, y in holes]
    segs = []
    z = 0.0
    for i in range(len(stops) - 1):
        Ls = stops[i + 1] - stops[i]
        c = min(chord_ratio, 0.999) * Ls
        th = arc_angle(c / Ls)
        segs.append(dict(s0=stops[i], L=Ls, c=c, th=th, R=Ls / th,
                         d=1 if i % 2 == 0 else -1, z0=z))
        z += c
    span = z
    first, last = segs[0], segs[-1]
    zs = [v.co.z for v in me.vertices]
    zmid = (min(zs) + max(zs)) / 2
    for v in me.vertices:
        px, py = v.co.x, v.co.y
        s = along(px, py)
        u = -(px - x0) * ay + (py - y0) * ax
        w = v.co.z - zmid
        if s <= 0:
            a = first["th"] / 2
            zz, fwd = s * math.cos(a), s * first["d"] * math.sin(a)
            nz, nf = -first["d"] * math.sin(a), math.cos(a)
        elif s >= stops[-1]:
            a = last["th"] / 2
            t = s - stops[-1]
            zz, fwd = span + t * math.cos(a), -t * last["d"] * math.sin(a)
            nz, nf = last["d"] * math.sin(a), math.cos(a)
        else:
            sg = next((q for q in segs if s <= q["s0"] + q["L"]), last)
            a = sg["th"] / 2 - (s - sg["s0"]) / sg["R"]
            zz = sg["z0"] + sg["c"] / 2 - sg["R"] * math.sin(a)
            fwd = sg["d"] * sg["R"] * (math.cos(a) - math.cos(sg["th"] / 2))
            nz, nf = -sg["d"] * math.sin(a), math.cos(a)
        v.co = (-(fwd + w * nf), u, zz + w * nz)
    me.update()


_sail_ripple = None


def sail_ripple_group():
    """Wind stirring the canvas: a travelling wave pushed through the sheet
    (sail-local X, fore and aft, the way the sheet bellies), strongest at the
    free edges and still at the mast (sail-local Y = 0), about half a
    millimetre at model scale. Two waves at odd ratios so it never repeats
    visibly; phase drifts with height so each sail moves on its own."""
    global _sail_ripple
    if _sail_ripple:
        return _sail_ripple
    ng = bpy.data.node_groups.new("sail-ripple", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    pos = N.new("GeometryNodeInputPosition")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(pos.outputs[0], sep.inputs[0])
    st = N.new("GeometryNodeInputSceneTime")

    def wave(ky, kz, w, amp):
        a = N.new("ShaderNodeMath"); a.operation = "MULTIPLY"
        L.new(sep.outputs["Y"], a.inputs[0]); a.inputs[1].default_value = ky
        b = N.new("ShaderNodeMath"); b.operation = "MULTIPLY_ADD"
        L.new(sep.outputs["Z"], b.inputs[0]); b.inputs[1].default_value = kz
        L.new(a.outputs[0], b.inputs[2])
        c = N.new("ShaderNodeMath"); c.operation = "MULTIPLY_ADD"
        L.new(st.outputs["Seconds"], c.inputs[0]); c.inputs[1].default_value = -w
        L.new(b.outputs[0], c.inputs[2])
        sn = N.new("ShaderNodeMath"); sn.operation = "SINE"
        L.new(c.outputs[0], sn.inputs[0])
        m = N.new("ShaderNodeMath"); m.operation = "MULTIPLY"
        L.new(sn.outputs[0], m.inputs[0]); m.inputs[1].default_value = amp
        return m.outputs[0]

    w1 = wave(0.22, 0.09, 5.5, 0.45)
    w2 = wave(0.51, -0.17, 8.3, 0.2)
    sm = N.new("ShaderNodeMath"); sm.operation = "ADD"
    L.new(w1, sm.inputs[0]); L.new(w2, sm.inputs[1])
    ay = N.new("ShaderNodeMath"); ay.operation = "ABSOLUTE"
    L.new(sep.outputs["Y"], ay.inputs[0])
    pin = N.new("ShaderNodeMapRange"); pin.interpolation_type = "SMOOTHSTEP"
    pin.inputs["From Min"].default_value = 1.5
    pin.inputs["From Max"].default_value = 18.0
    L.new(ay.outputs[0], pin.inputs["Value"])
    dx = N.new("ShaderNodeMath"); dx.operation = "MULTIPLY"
    L.new(sm.outputs[0], dx.inputs[0]); L.new(pin.outputs[0], dx.inputs[1])
    off = N.new("ShaderNodeCombineXYZ")
    L.new(dx.outputs[0], off.inputs["X"])
    sp = N.new("GeometryNodeSetPosition")
    L.new(gi.outputs[0], sp.inputs["Geometry"]); L.new(off.outputs[0], sp.inputs["Offset"])
    L.new(sp.outputs[0], go.inputs[0])
    _sail_ripple = ng
    return ng


def build_ship(key, M, coll):
    ship = DATA["ships"][SHIPS[key].get("model", key)]
    parts = DATA["parts"]
    root = link(bpy.data.objects.new(f"{key}-root", None), coll)
    root.scale = (S, S, S)
    rig = {"root": root, "objs": [], "key": key}

    def add(obj, mat, matrix=None):
        link(obj, coll)
        obj.parent = root
        if matrix is not None:
            obj.matrix_basis = matrix
        if obj.data and mat:
            set_object_material(obj, mat)
        rig["objs"].append(obj)
        return obj

    hull_mat = M[ship["hull"]["color"]]
    rig["hull"] = add(part_object(f"{key}-hull", ship["hull"]["source"]), hull_mat)

    masts = [p for p in ship["placements"] if p["part"].startswith("mast")]
    cannon_spec = SHIPS[key]["cannon"]
    for i, p in enumerate(ship["placements"]):
        part = parts[p["part"]]
        stl = part.get("source") or f"assets/stls/base-set/{p['part']}.stl"
        color = p["color"]
        if part.get("sail"):
            mast = masts[p.get("onMast", 0)]
            o = import_stl(REPO / f"assets/stls/base-set/{p['part']}.stl")
            o.name = f"{key}-sail{i}"
            bend_sail(o.data, part["holes"], p.get("chordRatio", 0.88))
            recalc_normals(o.data)
            o.data.shade_smooth()
            zmin = min(v.co.z for v in o.data.vertices)
            if "sailBottom" in p:
                z = p["sailBottom"] - zmin
            else:
                z = mast["at"][2] + parts[mast["part"]]["height"] - p.get("holeFromTop", 6) - (
                    max(v.co.z for v in o.data.vertices) - zmin)
            mat = M["black-sail"] if color == "black" else M[color]
            add(o, mat, Matrix.Translation((mast["at"][0], mast["at"][1], z)))
            rig.setdefault("sails", []).append(o)
            rig.setdefault("sails_on_mast", {}).setdefault(p.get("onMast", 0), []).append(o)
            o.modifiers.new("Wind", "NODES").node_group = sail_ripple_group()
            continue
        if p["part"] == "cannon":
            # The kit's own placement shows the gun in its default socket; the
            # scene fires broadside, so it goes in the socket facing the enemy.
            p = dict(p, at=cannon_spec["at"], rotZ=cannon_spec["rotZ"])
        m = place_matrix(p["at"], p.get("rotZ", 0), part.get("anchor", (0, 0, 0)), p.get("rotX", 0),
                         GUN_SCALE if p["part"] == "cannon" else 1.0)
        mat = M["mast-wood"] if p["part"].startswith("mast") and color == "wood" else M[color]
        o = add(part_object(f"{key}-{p['part']}{i}", stl), mat, m)
        if p["part"] == "cannon":
            rig["cannon"] = o
            rig["cannon_rest"] = m.copy()
        if p["part"] in ("cargo", "barrel"):
            rig.setdefault("cargo", []).append(o)
        if p["part"].startswith("mast"):
            rig.setdefault("masts", []).append(o)
            rig.setdefault("mast_at", []).append(Vector(p["at"]))
            rig.setdefault("mast_tops", []).append(
                Vector((p["at"][0], p["at"][1], p["at"][2] + part["height"])))
    return rig


def find_bore(cannon_obj):
    """The cannon's bore axis in its own STL space: shoot rays in from the
    muzzle end (+X) and take the band of heights that go deepest."""
    me = cannon_obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromBMesh(bm)
    best = []
    for zi in range(4, 72):
        z = zi * 0.25
        hit = tree.ray_cast(Vector((40, 0, z)), Vector((-1, 0, 0)))
        x = hit[0].x if hit[0] else -99
        best.append((x, z))
    bm.free()
    xmin = min(x for x, _ in best)
    deep = [z for x, z in best if x < xmin + 1.5]
    zc = (min(deep) + max(deep)) / 2
    radius = (max(deep) - min(deep)) / 2
    tip = max(v.co.x for v in me.vertices)
    return Vector((tip, 0, zc)), radius


# ---------------------------------------------------------------- ocean

def ocean_modifier(obj, size, res, repeat=1, seed=7):
    m = obj.modifiers.new("Ocean", "OCEAN")
    m.geometry_mode = "GENERATE"
    m.spatial_size = size
    m.resolution = res
    m.viewport_resolution = res
    m.repeat_x = m.repeat_y = repeat
    m.random_seed = seed
    m.wind_velocity = W["wind"]
    m.wave_scale = W["wave_scale"]
    m.wave_scale_min = 0.01
    m.choppiness = W["chop"]
    m.wave_alignment = 0.35
    m.wave_direction = math.atan2(WIND.y, WIND.x)
    m.damping = 0.5
    m.depth = 200
    m.spectrum = "PHILLIPS"
    m.use_normals = True
    m.use_foam = True
    m.foam_layer_name = "foam"
    m.foam_coverage = W["foam"]
    m.time = 0.0
    m.keyframe_insert("time", frame=0)
    m.time = 1.0
    m.keyframe_insert("time", frame=FPS)
    fc = obj.animation_data.action.fcurves if hasattr(obj.animation_data.action, "fcurves") else None
    _linear_extrapolate(obj)
    return m


def _iter_fcurves(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


def _linear_extrapolate(idblock):
    for fc in _iter_fcurves(idblock):
        fc.extrapolation = "LINEAR"
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"


def water_material():
    m = new_material("Sea")
    nt, N, L = nodes(m)
    b = bsdf_of(m)
    b.inputs["Roughness"].default_value = 0.3
    b.inputs["IOR"].default_value = 1.45
    setin(b, "Specular IOR Level", 0.35)
    # Toy-box sea: moulded plastic rather than real water. Dark green-teal
    # from trough to crest, a satin (not glassy) finish, a little subsurface glow in
    # the crests, and hard-edged painted-on foam.
    setin(b, "Coat Weight", 0.15)
    setin(b, "Coat Roughness", 0.2)
    setin(b, "Subsurface Weight", 0.15)
    setin(b, "Subsurface Radius", (0.3, 1.0, 0.9))
    setin(b, "Subsurface Scale", 0.4)
    geo = N.new("ShaderNodeNewGeometry")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(geo.outputs["Position"], sep.inputs[0])
    crest = N.new("ShaderNodeMapRange")
    crest.interpolation_type = "SMOOTHSTEP"
    crest.inputs["From Min"].default_value = -0.4
    crest.inputs["From Max"].default_value = 1.0
    L.new(sep.outputs["Z"], crest.inputs["Value"])
    body = N.new("ShaderNodeMix"); body.data_type = "RGBA"
    body.inputs[6].default_value = W["sea_deep"]
    body.inputs[7].default_value = W["sea_crest"]
    L.new(crest.outputs[0], body.inputs[0])

    foam = N.new("ShaderNodeAttribute"); foam.attribute_name = "foam"
    tc = N.new("ShaderNodeTexCoord")
    fn = N.new("ShaderNodeTexNoise")
    fn.inputs["Scale"].default_value = 0.35
    fn.inputs["Detail"].default_value = 8
    fn.inputs["Roughness"].default_value = 0.65
    L.new(tc.outputs["Object"], fn.inputs["Vector"])
    fmul = N.new("ShaderNodeMath"); fmul.operation = "MULTIPLY"
    L.new(foam.outputs["Fac"], fmul.inputs[0])
    L.new(fn.outputs["Fac"], fmul.inputs[1])
    framp = N.new("ShaderNodeValToRGB")
    framp.color_ramp.elements[0].position = 0.36
    framp.color_ramp.elements[1].position = 0.40
    L.new(fmul.outputs[0], framp.inputs[0])
    col = N.new("ShaderNodeMix"); col.data_type = "RGBA"
    # Every foam source (whitecaps here, ship wakes added later by
    # add_wakes_to_sea) is MAXed into this one value.
    foam_total = N.new("ShaderNodeMath"); foam_total.operation = "MAXIMUM"
    foam_total.name = "foam_total"
    L.new(framp.outputs[0], foam_total.inputs[0])
    foam_total.inputs[1].default_value = 0.0
    L.new(foam_total.outputs[0], col.inputs[0])
    L.new(body.outputs[2], col.inputs[6])
    col.inputs[7].default_value = (0.85, 0.9, 0.9, 1)
    L.new(col.outputs[2], b.inputs["Base Color"])
    rough = N.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.3
    rough.inputs["To Max"].default_value = 0.55
    L.new(foam_total.outputs[0], rough.inputs["Value"])
    L.new(rough.outputs[0], b.inputs["Roughness"])

    # Rain on the water: small wind ripples plus rings from drops, moving.
    ripple = N.new("ShaderNodeTexNoise"); ripple.noise_dimensions = "4D"
    ripple.inputs["Scale"].default_value = 3.0
    ripple.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], ripple.inputs["Vector"])
    t = N.new("ShaderNodeValue")
    t.outputs[0].default_value = 0.0
    t.outputs[0].keyframe_insert("default_value", frame=0)
    t.outputs[0].default_value = 1.5
    t.outputs[0].keyframe_insert("default_value", frame=FPS)
    L.new(t.outputs[0], ripple.inputs["W"])
    vor = N.new("ShaderNodeTexVoronoi"); vor.voronoi_dimensions = "4D"
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = 1.2
    L.new(tc.outputs["Object"], vor.inputs["Vector"])
    t2 = N.new("ShaderNodeValue")
    t2.outputs[0].default_value = 0.0
    t2.outputs[0].keyframe_insert("default_value", frame=0)
    t2.outputs[0].default_value = 4.0
    t2.outputs[0].keyframe_insert("default_value", frame=FPS)
    L.new(t2.outputs[0], vor.inputs["W"])
    ring = N.new("ShaderNodeMath"); ring.operation = "SINE"
    rmul = N.new("ShaderNodeMath"); rmul.operation = "MULTIPLY"; rmul.inputs[1].default_value = 40.0
    L.new(vor.outputs["Distance"], rmul.inputs[0])
    L.new(rmul.outputs[0], ring.inputs[0])
    fade = N.new("ShaderNodeMath"); fade.operation = "MULTIPLY"
    inv = N.new("ShaderNodeMapRange")
    inv.inputs["From Min"].default_value = 0.0
    inv.inputs["From Max"].default_value = 0.25
    inv.inputs["To Min"].default_value = 1.0
    inv.inputs["To Max"].default_value = 0.0
    L.new(vor.outputs["Distance"], inv.inputs["Value"])
    L.new(ring.outputs[0], fade.inputs[0])
    L.new(inv.outputs[0], fade.inputs[1])
    add = N.new("ShaderNodeMath"); add.operation = "MULTIPLY_ADD"
    add.inputs[1].default_value = 0.4
    L.new(fade.outputs[0], add.inputs[0])
    L.new(ripple.outputs["Fac"], add.inputs[2])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.015
    bump.inputs["Distance"].default_value = 0.03
    L.new(add.outputs[0], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    for tv in (t, t2):
        _linear_extrapolate(m.node_tree)
    return m


def gn_delete_box(obj, xmin, xmax, ymin, ymax):
    """Geometry-nodes cut after the ocean: removes the rectangle a nearer,
    finer patch already covers, so the two never z-fight."""
    ng = bpy.data.node_groups.new(f"{obj.name}-cut", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    pos = N.new("GeometryNodeInputPosition")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(pos.outputs[0], sep.inputs[0])
    tests = []
    for comp, lo, hi in ((0, xmin, xmax), (1, ymin, ymax)):
        a = N.new("FunctionNodeCompare"); a.data_type = "FLOAT"; a.operation = "GREATER_THAN"
        a.inputs[1].default_value = lo
        L.new(sep.outputs[comp], a.inputs[0])
        b = N.new("FunctionNodeCompare"); b.data_type = "FLOAT"; b.operation = "LESS_THAN"
        b.inputs[1].default_value = hi
        L.new(sep.outputs[comp], b.inputs[0])
        tests += [a, b]
    acc = tests[0].outputs[0]
    for t in tests[1:]:
        an = N.new("FunctionNodeBooleanMath"); an.operation = "AND"
        L.new(acc, an.inputs[0]); L.new(t.outputs[0], an.inputs[1])
        acc = an.outputs[0]
    dl = N.new("GeometryNodeDeleteGeometry"); dl.domain = "FACE"
    L.new(gi.outputs[0], dl.inputs["Geometry"])
    L.new(acc, dl.inputs["Selection"])
    L.new(dl.outputs[0], go.inputs[0])
    mod = obj.modifiers.new("Cut", "NODES")
    mod.node_group = ng


OCEAN_TILE, OCEAN_REPEAT = 256, 3
OCEAN_FADE = (250.0, 360.0)   # wave height fades to flat between these radii


def gn_fade_waves(obj, center, r0, r1):
    """Geometry nodes after the ocean: scale wave height to zero between
    radii r0 and r1 from `center` (object space), so the tiled sea lies
    flat by its edge and meets the horizon plane with no step."""
    ng = bpy.data.node_groups.new(f"{obj.name}-fade", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    pos = N.new("GeometryNodeInputPosition")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(pos.outputs[0], sep.inputs[0])
    flat = N.new("ShaderNodeCombineXYZ")
    L.new(sep.outputs["X"], flat.inputs["X"]); L.new(sep.outputs["Y"], flat.inputs["Y"])
    dist = N.new("ShaderNodeVectorMath"); dist.operation = "DISTANCE"
    L.new(flat.outputs[0], dist.inputs[0]); dist.inputs[1].default_value = (center[0], center[1], 0)
    fade = N.new("ShaderNodeMapRange")
    fade.interpolation_type = "SMOOTHSTEP"
    fade.inputs["From Min"].default_value = r0
    fade.inputs["From Max"].default_value = r1
    fade.inputs["To Min"].default_value = 1.0
    fade.inputs["To Max"].default_value = 0.0
    L.new(dist.outputs["Value"], fade.inputs["Value"])
    z = N.new("ShaderNodeMath"); z.operation = "MULTIPLY"
    L.new(sep.outputs["Z"], z.inputs[0]); L.new(fade.outputs[0], z.inputs[1])
    out = N.new("ShaderNodeCombineXYZ")
    L.new(sep.outputs["X"], out.inputs["X"]); L.new(sep.outputs["Y"], out.inputs["Y"])
    L.new(z.outputs[0], out.inputs["Z"])
    sp = N.new("GeometryNodeSetPosition")
    L.new(gi.outputs[0], sp.inputs["Geometry"]); L.new(out.outputs[0], sp.inputs["Position"])
    L.new(sp.outputs[0], go.inputs[0])
    obj.modifiers.new("Fade", "NODES").node_group = ng


def build_ocean(coll):
    """One FFT ocean, tiled. The simulated patch is periodic, so its copies
    join without a seam (separate patches of different sizes did not, and
    showed as steps in the water). The 3x3 tiles are centred on the
    action; the waves fade flat toward the edge, where a flat plane at the
    same level carries the sea to the horizon on shader ripples alone."""
    mat = water_material()
    me = bpy.data.meshes.new("ocean")
    near = link(bpy.data.objects.new("Ocean Near", me), coll)
    # Tiles run +X/+Y from the first; put the middle one over NEAR_C.
    half = OCEAN_TILE * (OCEAN_REPEAT - 1) / 2
    near.location = (NEAR_C.x - half, NEAR_C.y - half, 0)
    ocean_modifier(near, OCEAN_TILE, 32, repeat=OCEAN_REPEAT)
    gn_fade_waves(near, (half, half), *OCEAN_FADE)
    me.materials.append(mat)
    # No deformation blur on the sea: its waves barely move in a 1/48 s
    # shutter, and blurring 2.4M moving vertices needs several copies of
    # them on the GPU, which ran an 8 GB card out of memory.
    near.cycles.use_deform_motion = False
    # The rest of the sea to the horizon: a square frame of four quads around
    # the tiled ocean (a single quad with a hole cut by geometry nodes lost
    # its only face, since that face's centre lies inside the hole).
    edge = OCEAN_FADE[1] + 10
    far = 30000.0
    cx, cy = NEAR_C.x, NEAR_C.y
    vs = [(cx - far, cy - far), (cx + far, cy - far), (cx + far, cy + far), (cx - far, cy + far),
          (cx - edge, cy - edge), (cx + edge, cy - edge), (cx + edge, cy + edge), (cx - edge, cy + edge)]
    hme = bpy.data.meshes.new("ocean-horizon")
    hme.from_pydata([(x, y, -0.02) for x, y in vs], [],
                    [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    horizon = link(bpy.data.objects.new("Ocean Horizon", hme), coll)
    horizon.data.materials.append(mat)
    return near


def sample_ocean(near, frames, points_fn):
    """Sea height under each ship's sample points for every frame, read off
    the evaluated near patch (with chop, so the heights are where the surface
    actually is). points_fn(frame) -> {ship: [(x, y), ...]} in world XY."""
    sc = bpy.context.scene
    out = {}
    loc = np.array(near.location)
    for f in frames:
        sc.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = near.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        ev.to_mesh_clear()
        co = co.reshape(-1, 3) + loc
        res = {}
        for key, pts in points_fn(f).items():
            hs = []
            for x, y in pts:
                sel = (np.abs(co[:, 0] - x) < 1.2) & (np.abs(co[:, 1] - y) < 1.2)
                c = co[sel]
                if len(c) == 0:
                    hs.append(0.0)
                    continue
                d2 = (c[:, 0] - x) ** 2 + (c[:, 1] - y) ** 2
                w = 1.0 / (d2 + 0.05)
                hs.append(float((c[:, 2] * w).sum() / w.sum()))
            res[key] = hs
        out[f] = res
    return out


def cached_ship_samples(near, frames, rigs):
    """Sea heights under the ships, every other frame (linearly filled in
    between; the ships low-pass them anyway). Evaluating the FFT ocean is
    the slow part of building the scene, so the result is kept on disk,
    keyed by everything that shapes it."""
    import hashlib
    import time
    mod = near.modifiers["Ocean"]
    key = json.dumps([[getattr(mod, a) for a in ("spatial_size", "resolution", "random_seed",
                      "wind_velocity", "wave_scale", "choppiness", "wave_alignment",
                      "wave_direction", "damping", "depth")], list(near.location),
                      frames[0], frames[-1], S, {k: [SHIPS[k]["pos"][:], SHIPS[k]["heading"],
                      SHIPS[k]["speed"], SHIPS[k].get("chase", False)] for k in rigs}, CHASE,
                      SHOT_1["fire"], SHOT_3, CRIPPLE], default=float)
    path = BUILD / f"ocean-samples-{hashlib.sha1(key.encode()).hexdigest()[:12]}.json"
    if path.exists():
        raw = json.loads(path.read_text())
        return {int(f): v for f, v in raw.items()}
    t0 = time.time()
    # Foam and the far patches do not change the heights; switch them off
    # while sampling (foam alone doubles the evaluation time).
    mod.use_foam = False
    others = [(m, m.show_viewport) for o in bpy.data.objects if o is not near for m in o.modifiers]
    for m, _ in others:
        m.show_viewport = False
    coarse = frames[::2] + ([frames[-1]] if (len(frames) - 1) % 2 else [])
    got = sample_ocean(near, coarse, lambda f: {k: ship_sample_points(k, f)[0] for k in rigs})
    mod.use_foam = True
    for m, v in others:
        m.show_viewport = v
    out = {}
    for f in frames:
        if f in got:
            out[f] = got[f]
            continue
        a, b = f - 1, f + 1
        out[f] = {k: [(x + y) / 2 for x, y in zip(got[a][k], got[b][k])] for k in got[a]}
    BUILD.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    print(f"[hero] sampled the sea under the ships in {time.time() - t0:.0f}s -> {path.name}")
    return out


# ---------------------------------------------------------------- motion

def ship_base(key, frame):
    s = SHIPS[key]
    h = math.radians(s["heading"])
    fwd = Vector((-math.cos(h), -math.sin(h)))   # bow is hull -X
    t = (frame - F_START) / FPS
    d = s["speed"] * t + (chase_distance(t) if s.get("chase") else 0.0)
    if key == "corsairs":
        d -= cripple_distance(t)
    return s["pos"] + fwd * d, h


def cripple_distance(t):
    """Distance the Corsair loses once its foremast is down: its speed
    falls linearly to CRIPPLE["to"] over CRIPPLE["over"] s."""
    th = (SHOT_3["fire"] + SHOT_3["flight"] - F_START) / FPS
    if t <= th:
        return 0.0
    loss = SHOTS_SPEED_AFTER() - CRIPPLE["to"]
    E = CRIPPLE["over"]
    u = min(t - th, E)
    d = loss * u * u / (2 * E)
    if t - th > E:
        d += loss * (t - th - E)
    return d


def SHOTS_SPEED_AFTER():
    return SHIPS["corsairs"]["speed"] + CHASE["after"]


def ship_sample_points(key, frame):
    base, h = ship_base(key, frame)
    ca, sa = math.cos(h), math.sin(h)
    half_l = 55 * S * 0.8
    half_b = 16 * S
    local = [(0, 0), (-half_l, 0), (half_l, 0), (0, half_b), (0, -half_b),
             (-half_l * 0.5, half_b * 0.7), (half_l * 0.5, -half_b * 0.7)]
    return [(base.x + x * ca - y * sa, base.y + x * sa + y * ca) for x, y in local], local


def animate_ships(rigs, near):
    frames = list(range(F_START - PREROLL, F_END + 2))
    locals_ = {k: ship_sample_points(k, 0)[1] for k in rigs}
    samples = cached_ship_samples(near, frames, rigs)

    recoil = {SHOT_1["from"]: SHOT_1["fire"], SHOT_2["from"]: SHOT_2["fire"]}
    hit_frame = SHOT_2["fire"] + SHOT_2["flight"]

    for key, rig in rigs.items():
        loc = locals_[key]
        A = np.array([[1, x, y] for x, y in loc])
        state = None
        for f in frames:
            h = np.array(samples[f][key])
            a, bx, by = np.linalg.lstsq(A, h, rcond=None)[0]
            # A ship does not follow every ripple: low-pass the heave and the
            # tilt, heave faster than tilt (it has less inertia to overcome).
            if state is None:
                state = [a, bx, by]
            else:
                state[0] += (a - state[0]) * 0.6
                state[1] += (bx - state[1]) * 0.35
                state[2] += (by - state[2]) * 0.35
            if f < F_START - 1:
                continue
            base, hdg = ship_base(key, f)
            # Stay afloat: where a swell stands higher under part of the hull
            # than the fitted plane, lift the ship to meet it rather than
            # let the wave swallow that end (a lagging plane fit left the
            # stern buried in a crest).
            fitted = [state[0] + state[1] * x + state[2] * y for x, y in loc]
            excess = max(hh - ff for hh, ff in zip(h, fitted))
            lift = max(0.0, excess - 0.3) * 0.85
            pitch = math.atan(state[1]) * 0.9
            roll = math.atan(state[2]) * 0.9
            # A gun's kick heels the ship away from it, then it rolls back.
            if key in recoil and f >= recoil[key]:
                dt = (f - recoil[key]) / FPS
                side = -1 if key == "corsairs" else 1
                roll += side * math.radians(2.2) * math.exp(-dt * 1.4) * math.sin(dt * 5.0 + 0.3)
            if key == "corsairs" and f >= hit_frame:
                dt = (f - hit_frame) / FPS
                roll += math.radians(1.6) * math.exp(-dt * 1.2) * math.sin(dt * 4.5)
            mast_frame = SHOT_3["fire"] + SHOT_3["flight"]
            if key == "corsairs" and f >= mast_frame:
                # The foremast going over the side drags her down that way,
                # and she settles with a list toward the wreck.
                dt = (f - mast_frame) / FPS
                roll -= math.radians(3.0) * (1 - math.exp(-dt * 1.5)) + \
                    math.radians(1.5) * math.exp(-dt * 1.0) * math.sin(dt * 4.0)
            root = rig["root"]
            root.location = (base.x, base.y, state[0] + lift - WATERLINE_MM * S)
            root.rotation_mode = "ZXY"
            # rotation_euler ZXY: heading about Z, then roll (X), pitch (Y) in hull space.
            root.rotation_euler = (roll, -pitch, hdg)
            root.keyframe_insert("location", frame=f)
            root.keyframe_insert("rotation_euler", frame=f)


# ---------------------------------------------------------------- geometry nodes FX

def points_object(name, coll, pts, attrs):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in pts], [], [])
    for aname, (kind, vals) in attrs.items():
        at = me.attributes.new(aname, kind, "POINT")
        flat = [c for v in vals for c in (v if isinstance(v, (tuple, list, Vector)) else (v,))]
        at.data.foreach_set("vector" if kind == "FLOAT_VECTOR" else "value", flat)
    return link(bpy.data.objects.new(name, me), coll)


def gn_ballistic(obj, instance, life, gravity=G, drag=0.0, shrink=True, spin=True):
    """Points carry `vel` (m/s), `birth` (frame), `size` and `spin` (rad/s,
    Euler). Each flies p + v t + g t^2 / 2 from its birth frame, lives `life`
    frames, and is an instance of `instance`."""
    ng = bpy.data.node_groups.new(f"{obj.name}-fx", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")

    def attr(name, dtype="FLOAT"):
        n = N.new("GeometryNodeInputNamedAttribute")
        n.data_type = dtype
        n.inputs["Name"].default_value = name
        return n.outputs["Attribute"]

    def math_(op, a, b=None, c=None):
        n = N.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L.new(v, n.inputs[i])
        return n.outputs[0]

    def vmath(op, a, b=None, scale=None):
        n = N.new("ShaderNodeVectorMath"); n.operation = op
        L.new(a, n.inputs[0])
        if b is not None:
            L.new(b, n.inputs[1])
        if scale is not None:
            if isinstance(scale, (int, float)):
                n.inputs["Scale"].default_value = scale
            else:
                L.new(scale, n.inputs["Scale"])
        return n.outputs[0]

    st = N.new("GeometryNodeInputSceneTime")
    t = math_("DIVIDE", math_("SUBTRACT", st.outputs["Frame"], attr("birth")), FPS)
    # Quadratic drag stand-in: distance travelled saturates as (1-e^-kt)/k.
    if drag > 0:
        tv = math_("DIVIDE", math_("SUBTRACT", 1.0, math_("EXPONENT", math_("MULTIPLY", t, -drag))), drag)
    else:
        tv = t
    off = vmath("SCALE", attr("vel", "FLOAT_VECTOR"), scale=tv)
    gz = math_("MULTIPLY", math_("MULTIPLY", t, t), -0.5 * gravity)
    comb = N.new("ShaderNodeCombineXYZ")
    L.new(gz, comb.inputs["Z"])
    off = vmath("ADD", off, comb.outputs[0])
    sp = N.new("GeometryNodeSetPosition")
    L.new(gi.outputs[0], sp.inputs["Geometry"])
    L.new(off, sp.inputs["Offset"])

    dead = N.new("FunctionNodeCompare"); dead.data_type = "FLOAT"; dead.operation = "LESS_THAN"
    L.new(t, dead.inputs[0]); dead.inputs[1].default_value = 0.0
    old = N.new("FunctionNodeCompare"); old.data_type = "FLOAT"; old.operation = "GREATER_THAN"
    L.new(t, old.inputs[0]); old.inputs[1].default_value = life / FPS
    orr = N.new("FunctionNodeBooleanMath"); orr.operation = "OR"
    L.new(dead.outputs[0], orr.inputs[0]); L.new(old.outputs[0], orr.inputs[1])
    dl = N.new("GeometryNodeDeleteGeometry"); dl.domain = "POINT"
    L.new(sp.outputs[0], dl.inputs["Geometry"])
    L.new(orr.outputs[0], dl.inputs["Selection"])

    oi = N.new("GeometryNodeObjectInfo")
    oi.inputs["Object"].default_value = instance
    oi.transform_space = "ORIGINAL"
    iop = N.new("GeometryNodeInstanceOnPoints")
    L.new(dl.outputs[0], iop.inputs["Points"])
    L.new(oi.outputs["Geometry"], iop.inputs["Instance"])
    size = attr("size")
    if shrink:
        k = math_("SUBTRACT", 1.0, math_("DIVIDE", t, life / FPS))
        size = math_("MULTIPLY", size, math_("POWER", math_("MAXIMUM", k, 0.0), 0.5))
    L.new(size, iop.inputs["Scale"])
    if spin:
        rot = vmath("SCALE", attr("spin", "FLOAT_VECTOR"), scale=t)
        e2r = N.new("FunctionNodeEulerToRotation")
        L.new(rot, e2r.inputs[0])
        L.new(e2r.outputs[0], iop.inputs["Rotation"])
    # One mesh, not one instance per drop: Cycles builds acceleration data
    # per instance, and tens of thousands of them cost far more to set up
    # each frame than rendering the frame does.
    real = N.new("GeometryNodeRealizeInstances")
    L.new(iop.outputs[0], real.inputs[0])
    L.new(real.outputs[0], go.inputs[0])
    mod = obj.modifiers.new("FX", "NODES")
    mod.node_group = ng
    return obj


def fx_source(name, coll, kind, mat, size=1.0):
    """A small mesh used only as an instance by the FX point clouds. Parked
    far under the sea so it never shows itself."""
    if kind == "drop":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=size)
    elif kind == "shard":
        bpy.ops.mesh.primitive_cube_add(size=size)
        o = bpy.context.active_object
        o.scale = (1.0, 0.25, 0.12)
        bpy.ops.object.transform_apply(scale=True)
    elif kind == "streak":
        bpy.ops.mesh.primitive_cylinder_add(vertices=5, radius=size * 0.012, depth=size)
    o = bpy.context.active_object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    link(o, coll)
    o.location = (0, 0, -900)
    o.data.materials.append(mat)
    if kind == "drop":
        o.data.shade_smooth()
    return o


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


def splash(coll, name, center, frame, drop_obj, scale=1.0, n=300, seed=1):
    """A cannonball entering the sea: a tight crown column and a wider skirt
    of heavier drops, all launched over the first few frames."""
    rnd = random.Random(seed)
    pts, vel, birth, size, spin = [], [], [], [], []
    for i in range(n):
        crown = rnd.random() < 0.55
        a = rnd.uniform(0, 2 * math.pi)
        if crown:
            r = rnd.uniform(0, 0.6) * scale
            up = rnd.uniform(9, 17) * math.sqrt(scale)
            out = rnd.uniform(0.3, 2.2) * math.sqrt(scale)
            s = rnd.uniform(0.05, 0.14) * scale
        else:
            r = rnd.uniform(0.3, 1.2) * scale
            up = rnd.uniform(3, 8) * math.sqrt(scale)
            out = rnd.uniform(2.5, 6.0) * math.sqrt(scale)
            s = rnd.uniform(0.08, 0.2) * scale
        pts.append(center + Vector((math.cos(a) * r, math.sin(a) * r, rnd.uniform(-0.2, 0.3))))
        vel.append((math.cos(a) * out + WIND.x * 1.5, math.sin(a) * out + WIND.y * 1.5, up))
        birth.append(frame + rnd.uniform(0, 3.5) + (0 if crown else 1.0))
        size.append(s)
        spin.append((0, 0, 0))
    o = points_object(name, coll, pts, {
        "vel": ("FLOAT_VECTOR", vel), "birth": ("FLOAT", birth),
        "size": ("FLOAT", size), "spin": ("FLOAT_VECTOR", spin)})
    # Short-lived: the spray falls back into the sea rather than hanging
    # in the air as a cloud of white blobs.
    gn_ballistic(o, drop_obj, life=38, drag=0.35, spin=False)
    return o


def splinters(coll, name, center, normal, frame, shard_obj, n=160, seed=3):
    rnd = random.Random(seed)
    pts, vel, birth, size, spin = [], [], [], [], []
    for i in range(n):
        d = (normal + Vector((rnd.gauss(0, 0.55), rnd.gauss(0, 0.55), rnd.gauss(0.35, 0.4)))).normalized()
        sp = rnd.uniform(4, 16)
        pts.append(center + Vector((rnd.gauss(0, 0.25), rnd.gauss(0, 0.25), rnd.gauss(0, 0.25))))
        vel.append(tuple(d * sp))
        birth.append(frame + rnd.uniform(0, 1.2))
        size.append(rnd.uniform(0.12, 0.45))
        spin.append((rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(-20, 20)))
    o = points_object(name, coll, pts, {
        "vel": ("FLOAT_VECTOR", vel), "birth": ("FLOAT", birth),
        "size": ("FLOAT", size), "spin": ("FLOAT_VECTOR", spin)})
    gn_ballistic(o, shard_obj, life=40, drag=0.25, shrink=False)
    return o


def build_rain(coll, cam_path_center):
    """Rain as a point cloud in a box around the camera's path: each drop
    falls along the wind-leaned direction and wraps back to the top."""
    # A thin, faintly lit streak, not refractive glass: at streak size the
    # refraction is invisible, and rays bouncing through thousands of glass
    # drops were the most expensive thing in the frame.
    m = new_material("Rain")
    nt, N, L = nodes(m)
    N.remove(N["Principled BSDF"])
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (0.75, 0.8, 0.86, 1)
    em.inputs["Strength"].default_value = W["rain_glow"] * 4
    tr = N.new("ShaderNodeBsdfTransparent")
    mix = N.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = W["rain_alpha"]
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], N["Material Output"].inputs["Surface"])
    streak = fx_source("rain-streak", coll, "streak", m, size=0.55)

    fall = Vector((WIND.x * 0.28, WIND.y * 0.28, -1.0)).normalized()
    speed = 9.0
    # Both deck cameras sit inside this box for the whole shot.
    lo = cam_path_center + Vector((-35, -35, -2))
    hi = cam_path_center + Vector((50, 35, 30))
    rnd = random.Random(11)
    n = W["rain"]
    pts = []
    for _ in range(n):
        pts.append((rnd.uniform(lo.x, hi.x), rnd.uniform(lo.y, hi.y), rnd.uniform(lo.z, hi.z)))
    me = bpy.data.meshes.new("rain")
    me.from_pydata(pts, [], [])
    rain = link(bpy.data.objects.new("Rain", me), coll)

    ng = bpy.data.node_groups.new("rain-fx", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    Nn, Ln = ng.nodes, ng.links
    gi, go = Nn.new("NodeGroupInput"), Nn.new("NodeGroupOutput")
    st = Nn.new("GeometryNodeInputSceneTime")
    pos = Nn.new("GeometryNodeInputPosition")
    sc = Nn.new("ShaderNodeVectorMath"); sc.operation = "SCALE"
    sc.inputs[0].default_value = tuple(fall * speed)
    Ln.new(st.outputs["Seconds"], sc.inputs["Scale"])
    add = Nn.new("ShaderNodeVectorMath"); add.operation = "ADD"
    Ln.new(pos.outputs[0], add.inputs[0]); Ln.new(sc.outputs[0], add.inputs[1])
    wrap = Nn.new("ShaderNodeVectorMath"); wrap.operation = "WRAP"
    Ln.new(add.outputs[0], wrap.inputs[0])
    wrap.inputs[1].default_value = tuple(hi)
    wrap.inputs[2].default_value = tuple(lo)
    setp = Nn.new("GeometryNodeSetPosition")
    Ln.new(gi.outputs[0], setp.inputs["Geometry"])
    Ln.new(wrap.outputs[0], setp.inputs["Position"])
    oi = Nn.new("GeometryNodeObjectInfo")
    oi.inputs["Object"].default_value = streak
    iop = Nn.new("GeometryNodeInstanceOnPoints")
    # Keep a 3 m bubble around each camera clear: drops at arm's length
    # render as big dark bars across the frame.
    keep = setp.outputs[0]
    for cam in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        ci = Nn.new("GeometryNodeObjectInfo")
        ci.inputs["Object"].default_value = cam
        ci.transform_space = "ORIGINAL"
        pos2 = Nn.new("GeometryNodeInputPosition")
        dist = Nn.new("ShaderNodeVectorMath"); dist.operation = "DISTANCE"
        Ln.new(pos2.outputs[0], dist.inputs[0]); Ln.new(ci.outputs["Location"], dist.inputs[1])
        near_cam = Nn.new("FunctionNodeCompare"); near_cam.data_type = "FLOAT"; near_cam.operation = "LESS_THAN"
        Ln.new(dist.outputs["Value"], near_cam.inputs[0]); near_cam.inputs[1].default_value = 3.0
        dl = Nn.new("GeometryNodeDeleteGeometry"); dl.domain = "POINT"
        Ln.new(keep, dl.inputs["Geometry"]); Ln.new(near_cam.outputs[0], dl.inputs["Selection"])
        keep = dl.outputs[0]
    Ln.new(keep, iop.inputs["Points"])
    Ln.new(oi.outputs["Geometry"], iop.inputs["Instance"])
    # Cylinder is along Z; lean it along the fall direction.
    q = Vector((0, 0, 1)).rotation_difference(-fall).to_euler()
    iop.inputs["Rotation"].default_value = q
    real = Nn.new("GeometryNodeRealizeInstances")   # see gn_ballistic
    Ln.new(iop.outputs[0], real.inputs[0])
    Ln.new(real.outputs[0], go.inputs[0])
    mod = rain.modifiers.new("Rain", "NODES")
    mod.node_group = ng
    # The wrap teleports drops, which motion blur would smear across the frame.
    rain.cycles.use_motion_blur = False
    rain.visible_shadow = False
    return rain


def ship_frame_xy(key, frame, local):
    """World XY of a hull-space point (m, hull axes) at `frame`, ignoring heave."""
    base, h = ship_base(key, frame)
    x, y = local
    return Vector((base.x + x * math.cos(h) - y * math.sin(h), base.y + x * math.sin(h) + y * math.cos(h)))


WAKE_LENGTH, WAKE_HALF0 = 70.0, 3.5


def wake_origin(coll, key):
    """An empty riding each ship's transom (no heave), +X pointing astern.
    The sea shader draws that ship's wake in this empty's space."""
    o = link(bpy.data.objects.new(f"{key}-wake-origin", None), coll)
    for f in range(F_START, F_END + 2, 2):
        _, h = ship_base(key, f)
        o.location = (*ship_frame_xy(key, f, (58 * S, 0.0)), 0.0)
        o.rotation_euler = (0, 0, h)
        o.keyframe_insert("location", frame=f)
        o.keyframe_insert("rotation_euler", frame=f)
    return o


def add_wakes_to_sea(sea, origins):
    """Ship wakes as part of the sea's own foam, not as meshes laid on it:
    a Kelvin V (19.5 deg) opening astern of each transom, densest in the
    churn straight behind, fading over WAKE_LENGTH. The foam texture is
    world-space, so a wake stays on the water as its ship sails on.
    (Wake meshes shrink-wrapped to the ocean held copies of its whole
    surface and pushed a render past the laptop's memory.)"""
    nt, N, L = nodes(sea)
    total = N["foam_total"]
    geo = N.new("ShaderNodeNewGeometry")
    grain = N.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 0.45
    grain.inputs["Detail"].default_value = 10
    grain.inputs["Roughness"].default_value = 0.65
    L.new(geo.outputs["Position"], grain.inputs["Vector"])
    prev = total.inputs[0].links[0].from_socket
    for origin in origins:
        tc = N.new("ShaderNodeTexCoord")
        tc.object = origin
        sep = N.new("ShaderNodeSeparateXYZ")
        L.new(tc.outputs["Object"], sep.inputs[0])
        # Behind the transom only (x > 0), fading with distance astern.
        along = N.new("ShaderNodeMapRange")
        along.inputs["From Min"].default_value = 0.0
        along.inputs["From Max"].default_value = WAKE_LENGTH
        along.inputs["To Min"].default_value = 1.0
        along.inputs["To Max"].default_value = 0.0
        L.new(sep.outputs["X"], along.inputs["Value"])
        ahead = N.new("ShaderNodeMath"); ahead.operation = "GREATER_THAN"
        L.new(sep.outputs["X"], ahead.inputs[0]); ahead.inputs[1].default_value = 0.0
        half = N.new("ShaderNodeMath"); half.operation = "MULTIPLY_ADD"
        L.new(sep.outputs["X"], half.inputs[0])
        half.inputs[1].default_value = math.tan(math.radians(19.5))
        half.inputs[2].default_value = WAKE_HALF0
        ay = N.new("ShaderNodeMath"); ay.operation = "ABSOLUTE"
        L.new(sep.outputs["Y"], ay.inputs[0])
        rel = N.new("ShaderNodeMath"); rel.operation = "DIVIDE"
        L.new(ay.outputs[0], rel.inputs[0]); L.new(half.outputs[0], rel.inputs[1])
        band = N.new("ShaderNodeValToRGB")
        e = band.color_ramp.elements
        e[0].position = 0.0; e[0].color = (0.9, 0.9, 0.9, 1)
        e[1].position = 1.0; e[1].color = (0, 0, 0, 1)
        for pos, v in ((0.22, 0.25), (0.35, 0.08), (0.8, 0.12), (0.9, 0.6), (0.97, 0.0)):
            el = band.color_ramp.elements.new(pos); el.color = (v, v, v, 1)
        L.new(rel.outputs[0], band.inputs[0])
        k = N.new("ShaderNodeMath"); k.operation = "MULTIPLY"
        L.new(band.outputs[0], k.inputs[0]); L.new(along.outputs[0], k.inputs[1])
        k2 = N.new("ShaderNodeMath"); k2.operation = "MULTIPLY"
        L.new(k.outputs[0], k2.inputs[0]); L.new(ahead.outputs[0], k2.inputs[1])
        # Break it into foam: the grain has to beat (1 - strength).
        thr = N.new("ShaderNodeMath"); thr.operation = "SUBTRACT"
        L.new(grain.outputs["Fac"], thr.inputs[0])
        omk = N.new("ShaderNodeMath"); omk.operation = "SUBTRACT"
        omk.inputs[0].default_value = 1.0
        L.new(k2.outputs[0], omk.inputs[1])
        L.new(omk.outputs[0], thr.inputs[1])
        fo = N.new("ShaderNodeMapRange")
        fo.inputs["From Min"].default_value = -0.18
        fo.inputs["From Max"].default_value = 0.0
        L.new(thr.outputs[0], fo.inputs["Value"])
        mx = N.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
        L.new(prev, mx.inputs[0]); L.new(fo.outputs[0], mx.inputs[1])
        prev = mx.outputs[0]
    L.new(prev, total.inputs[0])


def build_bow_spray(coll, key, drop, n=2400, seed=60):
    """Spray thrown off the bow as it shoulders into the swell, a steady
    stream with gusts, launched from wherever the bow is at each drop's
    birth frame."""
    rnd = random.Random(seed)
    pts, vel, birth, size = [], [], [], []
    speed = SHIPS[key]["speed"]
    bow = -58 * S
    for i in range(n):
        f = rnd.uniform(F_START - 20, F_END)
        # Gusty: more spray when the bow meets a crest.
        if rnd.random() > 0.55 + 0.45 * math.sin(f * 0.21 + seed):
            continue
        side = rnd.choice((-1, 1))
        p = ship_frame_xy(key, f, (bow + rnd.uniform(0, 5), side * rnd.uniform(0.3, 2.5)))
        _, h = ship_base(key, f)
        fwd = Vector((-math.cos(h), -math.sin(h), 0))
        out = Vector((math.sin(h), -math.cos(h), 0)) * side * -1
        v = out * rnd.uniform(1.5, 4.5) + fwd * speed * rnd.uniform(0.6, 1.0) + Vector((0, 0, rnd.uniform(1.5, 4.0)))
        pts.append((p.x, p.y, rnd.uniform(0.1, 0.6)))
        vel.append(tuple(v))
        birth.append(f)
        size.append(rnd.uniform(0.03, 0.1))
    o = points_object(f"{key}-bow-spray", coll, pts, {
        "vel": ("FLOAT_VECTOR", vel), "birth": ("FLOAT", birth),
        "size": ("FLOAT", size), "spin": ("FLOAT_VECTOR", [(0, 0, 0)] * len(pts))})
    gn_ballistic(o, drop, life=28, drag=0.4, spin=False)
    return o


# ---------------------------------------------------------------- smoke & fire

def _volume_material(name, color, density_k, emission=None, noise_scale=2.4, edge=(0.35, 0.68),
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


_puff_mesh = None


def _puff(coll, name, mat):
    global _puff_mesh
    if _puff_mesh is None:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        _puff_mesh = bpy.data.meshes.new("puff")
        bm.to_mesh(_puff_mesh)
        bm.free()
    o = link(bpy.data.objects.new(name, _puff_mesh), coll)
    if not o.data.materials:
        o.data.materials.append(None)
    o.material_slots[0].link = "OBJECT"
    o.material_slots[0].material = mat
    o.visible_shadow = False
    return o


def alive_between(o, f_on, f_off):
    """Render `o` only from f_on to f_off. Cycles pre-evaluates every
    volume's density every frame, live or not, and ~100 smoke puffs doing
    that cost ~27 s a frame before a single sample was traced."""
    for f, hidden in ((F_START, True), (f_on, False), (f_off + 1, True)):
        o.hide_render = hidden
        o.keyframe_insert("hide_render", frame=max(F_START, f))
    for fc in _iter_fcurves(o):
        if fc.data_path == "hide_render":
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"


def muzzle_flash(coll, name, origin, direction, frame, seed=0):
    """The gun going off: a short burst of flame out of the muzzle (glowing
    volume, flaring and gone in four frames), a spray of sparks, and a
    flash of light on the deck and water."""
    rnd = random.Random(seed)
    fire = _volume_material(f"{name}-fire", (0.2, 0.15, 0.12, 1), 0.5,
                            emission=((1.0, 0.36, 0.05, 1), 160.0),
                            noise_scale=4.5, edge=(0.46, 0.6))
    rot = Vector((1, 0, 0)).rotation_difference(direction).to_euler()
    # A jet out of the barrel and a rounder bloom around the muzzle.
    for k, (reach, stretch, size) in enumerate(((1.1, 2.8, 0.42), (0.3, 1.1, 0.5))):
        o = _puff(coll, f"{name}-fire{k}", fire)
        o.rotation_euler = (rot.x, rot.y, rot.z + rnd.uniform(-0.2, 0.2))
        for f, grow, dens, glow in ((frame - 1, 0.01, 0, 0), (frame, 1.0, 1.0, 1.0),
                                    (frame + 1, 1.5, 0.8, 0.55), (frame + 2, 1.8, 0.5, 0.18),
                                    (frame + 3, 2.0, 0.2, 0.03), (frame + 4, 2.1, 0.0, 0.0)):
            sz = size * grow
            o.scale = (sz * stretch, sz, sz)
            o.location = origin + direction * reach * min(grow, 1.6)
            o.color = (dens, glow, 0, 1)
            o.keyframe_insert("scale", frame=f)
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("color", frame=f)
        alive_between(o, frame - 1, frame + 4)

    sm, sem = emissive(f"{name}-spark", (1.0, 0.55, 0.15, 1), 60.0)
    spark = fx_source(f"{name}-spark-src", coll, "drop", sm, size=1.0)
    pts, vel, birth, size_, spin = [], [], [], [], []
    for i in range(70):
        d = (direction + Vector((rnd.gauss(0, .25), rnd.gauss(0, .25), rnd.gauss(0.05, .2)))).normalized()
        pts.append(origin + direction * 0.3)
        vel.append(tuple(d * rnd.uniform(10, 32)))
        birth.append(frame + rnd.uniform(0, 1.5))
        size_.append(rnd.uniform(0.02, 0.05))
        spin.append((0, 0, 0))
    sp = points_object(f"{name}-sparks", coll, pts, {
        "vel": ("FLOAT_VECTOR", vel), "birth": ("FLOAT", birth),
        "size": ("FLOAT", size_), "spin": ("FLOAT_VECTOR", spin)})
    gn_ballistic(sp, spark, life=10, drag=1.5, spin=False)
    sp.visible_shadow = False

    ld = bpy.data.lights.new(f"{name}-flashlight", "POINT")
    ld.color = (1.0, 0.6, 0.25)
    ld.shadow_soft_size = 0.6
    lo = link(bpy.data.objects.new(f"{name}-flashlight", ld), coll)
    lo.location = origin + direction * 1.5
    # Bright on the deck and the gun, not across the water on the enemy.
    for f, e in ((frame - 1, 0), (frame, 40000), (frame + 1, 16000), (frame + 2, 3000), (frame + 4, 0)):
        ld.energy = e
        ld.keyframe_insert("energy", frame=f)
    return lo


_trail_mat = None


def smoke_trail(coll, name, p0, v, f0, f1):
    """The ball's smoke trail: overlapping puffs laid along its arc every
    half frame, each stretched along the flight so they merge into one
    streak, then swelling, drifting with the wind and thinning out."""
    global _trail_mat
    if _trail_mat is None:
        _trail_mat = _volume_material("ball-trail", W["smoke"], 2.2)
    b = f0 + 0.5
    k = 0
    while b < f1:
        t = (b - f0) / FPS
        p = p0 + v * t + Vector((0, 0, -0.5 * G * t * t))
        vel = v + Vector((0, 0, -G * t))
        spacing = vel.length * 0.5 / FPS
        # Puffs appear where the ball was up to half a frame ago; push each
        # forward by that lag plus the ball's radius so the streak starts
        # at the ball's leading face, not a metre behind it.
        ball_r = 5.0 * S * GUN_SCALE
        p = p + vel.normalized() * (ball_r + spacing)
        o = _puff(coll, f"{name}-trail{k:02d}", _trail_mat)
        o.rotation_euler = Vector((1, 0, 0)).rotation_difference(vel.normalized()).to_euler()
        born = math.ceil(b)
        for f, (sx, sr), c in ((born - 1, (0.001, 0.001), 0.0), (born, (spacing * 0.9, 0.3), 1.0),
                               (born + 8, (spacing * 1.1, 0.6), 0.6), (born + 20, (spacing * 1.3, 1.0), 0.3),
                               (born + 36, (spacing * 1.5, 1.4), 0.0)):
            o.scale = (sx, sr, sr)
            o.location = p + (WIND * 1.2 + Vector((0, 0, 0.35))) * max(0, f - b) / FPS
            o.color = (c, 0, 0, 1)
            o.keyframe_insert("scale", frame=f)
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("color", frame=f)
        alive_between(o, born - 1, born + 36)
        b += 0.5
        k += 1


# ---------------------------------------------------------------- the shots

def ballistic_keys(obj, p0, p1, f0, f1, spin_axis, f_end=None):
    T = (f1 - f0) / FPS
    v = (p1 - p0 - Vector((0, 0, -0.5 * G * T * T))) / T
    for f in range(f0, f1 + 1):
        t = (f - f0) / FPS
        p = p0 + v * t + Vector((0, 0, -0.5 * G * t * t))
        vel = v + Vector((0, 0, -G * t))
        # Round end leading, point trailing, as it left the barrel.
        rot = Vector((0, 0, -1)).rotation_difference(vel.normalized())
        spinq = Matrix.Rotation(t * 25.0, 4, "Z").to_quaternion()
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rot @ spinq
        obj.location = p
        obj.keyframe_insert("location", frame=f)
        obj.keyframe_insert("rotation_quaternion", frame=f)
    return v


def build_ball(coll, M, name):
    o = part_object(name, "assets/stls/base-set/cannonball.stl", smooth=0)
    o.data = o.data.copy()
    me = o.data
    # Origin at the round end's centre: the ball is a 10 mm sphere drawn up
    # into a point for printing, bbox 62.9..72.9 x 126.5..136.5 x 0..13.
    me.transform(Matrix.Translation((-67.9, -131.5, -5.0)))
    me.shade_smooth()
    link(o, coll)
    o.scale = (S * GUN_SCALE,) * 3
    o.data.materials.clear()
    o.data.materials.append(M["neon-green"])
    return o


def train_gun(cannon, rest, bore, p1, f0, f1, frames):
    """Swing the gun from `rest` to lie along the launch direction that puts
    a ball from its muzzle on p1, turning over `frames` (first, last) and
    holding there. Yaw about the deck's vertical, then elevation, both about
    the gun's own origin (its mount). Returns the trained basis."""
    sc = bpy.context.scene
    with quick_eval():
        sc.frame_set(f0)
        parent = cannon.matrix_world @ cannon.matrix_basis.inverted()
    T = (f1 - f0) / FPS
    loc, rot, scl = rest.decompose()
    r = (rest.to_3x3() @ Vector((1, 0, 0))).normalized()
    basis = rest
    for _ in range(3):                             # the muzzle moves as the gun turns
        muzzle = parent @ basis @ bore
        v = (p1 - muzzle) / T + Vector((0, 0, 0.5 * G * T))
        d = (parent.to_3x3().inverted() @ v).normalized()
        yaw = math.atan2(d.y, d.x) - math.atan2(r.y, r.x)
        pitch = math.asin(max(-1, min(1, d.z))) - math.asin(max(-1, min(1, r.z)))
        Rz = Matrix.Rotation(yaw, 3, "Z")
        across = (Rz @ Vector((-r.y, r.x, 0))).normalized()
        R = Matrix.Rotation(-pitch, 3, across) @ Rz
        basis = Matrix.Translation(loc) @ (R @ rot.to_matrix()).to_4x4() @ Matrix.Diagonal(scl).to_4x4()
    for f, m in ((frames[0], rest), (frames[1], basis)):
        cannon.matrix_basis = m
        cannon.keyframe_insert("location", frame=f)
        cannon.keyframe_insert("rotation_euler", frame=f)
    print(f"[hero] {cannon.name} trained {math.degrees(yaw):.1f} deg yaw, "
          f"{math.degrees(pitch):.1f} deg elevation over frames {frames[0]}-{frames[1]}", flush=True)
    return basis


def stage_shot(coll, M, rigs, shot, target_fn, name, drop_obj, shard_obj, near, loaded_from=F_START,
               train=None):
    sc = bpy.context.scene
    rig = rigs[shot["from"]]
    cannon = rig["cannon"]
    bore, radius = find_bore(cannon)
    f0 = shot["fire"]
    f1 = f0 + shot["flight"]
    if train:
        # A new target: bring the gun round onto it before it fires.
        p_aim, _ = target_fn(f1)
        rig["cannon_rest"] = train_gun(cannon, rig["cannon_rest"], bore, p_aim, f0, f1, train)

    with quick_eval():
        sc.frame_set(f0)
        cm = cannon.matrix_world.copy()
    muzzle = cm @ bore
    direction = (cm.to_3x3() @ Vector((1, 0, 0))).normalized()

    ball = build_ball(coll, M, name + "-ball")
    # Loaded: the ball rides in the bore, round end out and its printing
    # point back toward the breech, until the gun fires. (Its +Z is the point.)
    seat = Matrix.Translation(bore - Vector((radius * 1.6 + 2.0, 0, 0))) @ \
        Matrix.Rotation(math.radians(-90), 4, "Y")
    with quick_eval():
        poses = []
        for f in range(loaded_from, f0):
            sc.frame_set(f)
            poses.append((f, (cannon.matrix_world @ seat).decompose()))
    for f, (loc, rot, _) in poses:
        ball.rotation_mode = "QUATERNION"
        ball.location = loc
        ball.rotation_quaternion = rot
        ball.keyframe_insert("location", frame=f)
        ball.keyframe_insert("rotation_quaternion", frame=f)

    if loaded_from > F_START:
        # Reloaded: this ball only goes in once the last one is away.
        alive_between(ball, loaded_from, F_END + 1)
    p1, after = target_fn(f1)
    v = ballistic_keys(ball, muzzle, p1, f0, f1, direction)
    smoke_trail(coll, name, muzzle, v, f0, f1)
    after(ball, f1)

    # Recoil: the tensioned gun kicks back along its own axis and settles.
    rest = rig["cannon_rest"]
    for f, back in ((f0 - 1, 0.0), (f0, 3.5), (f0 + 2, 2.4), (f0 + 8, 0.4), (f0 + 14, 0.0)):
        cannon.matrix_basis = rest @ Matrix.Translation((-back, 0, 0))
        cannon.keyframe_insert("location", frame=f)
    muzzle_flash(coll, name, muzzle, direction, f0, seed=len(name) + f0)
    return muzzle, direction, p1


class quick_eval:
    """Switch every modifier off while the build steps through frames just
    to read keyed transforms (where a cannon is at frame N). Otherwise each
    frame_set re-runs the ocean FFT, geometry nodes and all, a few seconds a
    frame, which made building the scene take longer than rendering it."""
    def __enter__(self):
        self.saved = [(m, m.show_viewport) for o in bpy.data.objects for m in o.modifiers]
        for m, _ in self.saved:
            m.show_viewport = False
        return self

    def __exit__(self, *exc):
        for m, v in self.saved:
            m.show_viewport = v


def sea_height_at(near, frame, x, y):
    return sample_ocean(near, [frame], lambda f: {"p": [(x, y)]})[frame]["p"][0]


def build_shots(coll, M, rigs, near):
    drop = fx_source("fx-drop", coll, "drop", spray_material(), size=1.0)
    for i, key in enumerate(rigs):
        build_bow_spray(coll, key, drop, seed=60 + i)
    add_wakes_to_sea(near.data.materials[0], [wake_origin(coll, k) for k in rigs])
    shard = fx_source("fx-shard", coll, "shard", M["black-hull"], size=1.0)
    sc = bpy.context.scene

    # Shot 1: the Corsair's ball falls a few metres short of the Queen's Fleet.
    def target1(f):
        qpos, _ = ship_base("queens-fleet", f)
        x, y = qpos.x - 3.0, qpos.y + 8.5
        z = sea_height_at(near, f, x, y)
        p = Vector((x, y, z))

        def after(ball, f1):
            # Under it goes; keep it just below the surface, then hide.
            ball.location = p + Vector((0, 0, -3))
            ball.keyframe_insert("location", frame=f1 + 2)
            splash(coll, "splash-1", p, f1, drop, scale=1.25, seed=21)
        return p, after

    stage_shot(coll, M, rigs, SHOT_1, target1, "shot1", drop, shard, near)

    # Shot 2: the Queen's Fleet answers and hits the Corsair amidships.
    def target2(f):
        cr = rigs["corsairs"]["root"]
        with quick_eval():
            sc.frame_set(f)
            crm = cr.matrix_world.copy()
        hit_local = Vector((6.0, 17.2, 17.0))
        p = crm @ hit_local
        normal = (crm.to_3x3() @ Vector((0, 1, 0))).normalized()

        def after(ball, f1):
            # Glances off the planking and drops into the sea alongside.
            v_out = normal * 3.0 + Vector((0, 0, 2.5))
            land_f = f1 + 14
            lx, ly = p.x + v_out.x * 14 / FPS, p.y + v_out.y * 14 / FPS
            lz = sea_height_at(near, land_f, lx, ly)
            v2 = ballistic_keys(ball, p, Vector((lx, ly, lz)), f1, land_f, normal)
            smoke_trail(coll, "shot2-glance", p, v2, f1, land_f)
            ball.location = Vector((lx, ly, lz - 3))
            ball.keyframe_insert("location", frame=land_f + 2)
            splinters(coll, "splinters-2", p, normal, f1, shard, seed=33)
            splash(coll, "splash-2b", Vector((lx, ly, lz)), land_f, drop, scale=0.55, n=140, seed=34)
            for i, crate in enumerate(rigs["corsairs"].get("cargo", [])):
                cargo_overboard(coll, crate, rigs["corsairs"]["root"], normal, f1 + 2 + i * 3,
                                near, drop, seed=40 + i, rig=rigs["corsairs"])
        return p, after

    stage_shot(coll, M, rigs, SHOT_2, target2, "shot2", drop, shard, near)

    # Shot 3: a second ball, soon after, takes the Corsair's foremast.
    cr_rig = rigs["corsairs"]
    fore = min(range(len(cr_rig["mast_at"])), key=lambda i: cr_rig["mast_at"][i].x)   # bow is -X

    def target3(f):
        cr = cr_rig["root"]
        with quick_eval():
            sc.frame_set(f)
            crm = cr.matrix_world.copy()
        at = cr_rig["mast_at"][fore]
        p = crm @ Vector((at.x, at.y + 2.4, 46.0))
        normal = (crm.to_3x3() @ Vector((0, 1, 0))).normalized()

        def after(ball, f1):
            splinters(coll, "splinters-3", p, normal, f1, shard_mast, n=110, seed=51)
            # Ricochets back off the spar and drops into the sea alongside.
            land_f = f1 + 16
            v_out = normal * 5.0 + Vector((0, 0, 3.0))
            lx, ly = p.x + v_out.x * 16 / FPS, p.y + v_out.y * 16 / FPS
            lz = sea_height_at(near, land_f, lx, ly)
            v3 = ballistic_keys(ball, p, Vector((lx, ly, lz)), f1, land_f, normal)
            smoke_trail(coll, "shot3-glance", p, v3, f1, land_f)
            ball.location = Vector((lx, ly, lz - 3))
            ball.keyframe_insert("location", frame=land_f + 2)
            splash(coll, "splash-3b", Vector((lx, ly, lz)), land_f, drop, scale=0.5, n=120, seed=52)
            topple_mast(coll, cr_rig, fore, f1 + 1, near, drop)
        return p, after

    shard_mast = fx_source("fx-shard-mast", coll, "shard", M["black"], size=0.8)
    stage_shot(coll, M, rigs, SHOT_3, target3, "shot3", drop, shard, near,
               loaded_from=SHOT_2["fire"] + 4, train=SHOT_3["train"])


def gn_keep_z(obj, h, above):
    """Keep only the part of `obj` above (or below) local height h: the
    fallen mast and its stump are one mast mesh cut in two."""
    ng = bpy.data.node_groups.new(f"{obj.name}-cut", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    pos = N.new("GeometryNodeInputPosition")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(pos.outputs[0], sep.inputs[0])
    cmp = N.new("FunctionNodeCompare"); cmp.data_type = "FLOAT"
    cmp.operation = "LESS_THAN" if above else "GREATER_THAN"
    L.new(sep.outputs["Z"], cmp.inputs[0]); cmp.inputs[1].default_value = h
    dl = N.new("GeometryNodeDeleteGeometry"); dl.domain = "FACE"
    L.new(gi.outputs[0], dl.inputs["Geometry"]); L.new(cmp.outputs[0], dl.inputs["Selection"])
    L.new(dl.outputs[0], go.inputs[0])
    obj.modifiers.new("Cut", "NODES").node_group = ng


def topple_mast(coll, rig, mi, frame, near, drop):
    """The foremast snaps at the deck and goes over the far side, sail and
    flag still on it: slow at first, then falling fast, crashing into the
    sea, where it lies rocking, dragged along by its rigging and swinging
    aft as the ship forges on. A stump stays standing."""
    sc = bpy.context.scene
    mast = rig["masts"][mi]
    at = rig["mast_at"][mi]
    deck = deck_height(rig, at.x + 4.0, at.y) + 0.5
    cut = deck - at.z                      # in the mast's own height
    stump = link(bpy.data.objects.new(mast.name + "-stump", mast.data), coll)
    stump.material_slots[0].link = "OBJECT"
    stump.material_slots[0].material = mast.material_slots[0].material
    stump.parent = rig["root"]
    stump.matrix_basis = mast.matrix_basis.copy()
    gn_keep_z(stump, cut, above=False)
    gn_keep_z(mast, cut, above=True)
    # Same camera hiding as the rest of the rig during the Corsair's own shot.
    for f, vis in ((F_START, False), (CUT, True)):
        stump.visible_camera = vis
        stump.keyframe_insert("visible_camera", frame=f)

    pivot = link(bpy.data.objects.new(mast.name + "-pivot", None), coll)
    pivot.parent = rig["root"]
    pivot.location = (at.x, at.y, deck)
    hinge = Matrix.Translation(pivot.location).inverted()
    riders = [mast] + rig.get("sails_on_mast", {}).get(mi, []) + \
        [fl for fl in rig.get("flags", []) if fl.name.endswith(f"flag{mi}")]
    for o in riders:
        basis = o.matrix_basis.copy()
        o.parent = pivot
        o.matrix_basis = hinge @ basis

    # Tip toward hull -Y, the side away from the Queen's Fleet (+X rotation
    # carries +Z toward -Y), then yaw aft (+Z rotation swings -Y toward +X)
    # as the wreck drags.
    hit_water = frame + 17
    keys = [(frame, 0.0, 0.0), (frame + 3, 0.04, 0.0), (frame + 7, 0.22, 0.0),
            (frame + 11, 0.62, 0.01), (frame + 14, 1.15, 0.03), (hit_water - 1, 1.55, 0.05),
            (hit_water, 1.72, 0.06), (hit_water + 4, 1.62, 0.08), (hit_water + 10, 1.69, 0.13)]
    t = hit_water + 10
    k = 0
    while t < F_END + 2:
        t += 12
        k += 1
        keys.append((t, 1.68 + 0.04 * (-1) ** k, min(0.5, 0.13 + 0.02 * k)))
    pivot.rotation_mode = "XYZ"
    for f, tip, yaw in keys:
        pivot.rotation_euler = (tip, 0.0, yaw)
        pivot.keyframe_insert("rotation_euler", frame=f)

    # Where it hits the sea: along the mast, from its root to its top.
    with quick_eval():
        sc.frame_set(hit_water)
        pm = pivot.matrix_world.copy()
    length = at.z + DATA["parts"]["mast"]["height"] - deck
    for k, (frac, sc_, n) in enumerate(((0.55, 1.1, 260), (0.9, 0.8, 160))):
        p = pm @ Vector((0, 0, length * frac))
        z = sea_height_at(near, hit_water, p.x, p.y)
        splash(coll, f"{mast.name}-splash{k}", Vector((p.x, p.y, z)), hit_water + k, drop,
               scale=sc_, n=n, seed=70 + k)


def crate_centre(crate):
    """Centre of the crate's bounding box in its own mesh space, and the
    radius (hull mm) of the sphere it sweeps however it turns."""
    vs = [v.co for v in crate.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    c = (lo + hi) / 2
    radius = max((crate.matrix_basis.to_3x3() @ (v - c)).length for v in vs)
    return c, radius


def clear_rail_launch(rig, crate, side_speed, margin=3.0):
    """Upward speed (m/s) that carries `crate` over the ship's side at
    `side_speed` m/s sideways (toward hull +Y), with the whole sphere it
    sweeps while tumbling at least `margin` mm clear of the hull all the
    way across. Traced in hull space against the hull's own top surface
    (deck, then bulwark and rail), riding with the ship so only the
    sideways and vertical motion count."""
    c, rad = crate_centre(crate)
    at = crate.matrix_basis @ c                  # hull mm: the crate's centre
    half_y = half_x = rad
    beam = max(abs(v.co.y) for v in rig["hull"].data.vertices)
    g_mm = G / S                                  # hull mm per s^2
    vs = side_speed / S
    for vup10 in range(20, 160, 2):
        vu = vup10 / 10 / S
        ok = True
        t = 0.0
        while True:
            t += 1 / 240
            y = at.y + vs * t
            z = at.z + vu * t - 0.5 * g_mm * t * t
            if y - half_y > beam + 1:
                break                             # clear of the side
            lead = min(y + half_y, beam)
            if lead < beam - 3.0:
                continue                          # over the deck: only the rail it must clear matters
            top = max(deck_height(rig, at.x + dx, lead) for dx in (-half_x, 0.0, half_x))
            if z < top + margin:
                ok = False
                break
        if ok:
            return vup10 / 10
    print(f"[hero] no clean launch found for {crate.name}; using 8 m/s", flush=True)
    return 8.0


def cargo_overboard(coll, crate, root, normal, frame, near, drop, seed=40, rig=None):
    """The hit jolts the Corsair's deck cargo loose: the crate is thrown up
    and over the side toward the shot, tumbles into the sea with a splash,
    then floats, riding the waves as the ship sails on without it.

    The crate on deck is parented to the ship, so the loose crate is a copy
    in world space that takes over at `frame`; each is hidden while the
    other is in play."""
    sc = bpy.context.scene
    rnd = random.Random(seed)
    with quick_eval():
        sc.frame_set(frame)
        start = crate.matrix_world.copy()
    # The loose crate turns about its own centre, not the base-corner origin
    # it was placed by, so its mesh is recentred and it flies by that centre.
    c, _ = crate_centre(crate)
    me = crate.data.copy()
    me.transform(Matrix.Translation(-c))
    loose = link(bpy.data.objects.new(crate.name + "-loose", me), coll)
    loose.material_slots[0].link = "OBJECT"
    loose.material_slots[0].material = crate.material_slots[0].material
    _, q0, sc0 = start.decompose()
    p0 = start @ c
    half_h = (c.z - min(v.co.z for v in crate.data.vertices)) * sc0.z     # world m, centre above base
    loose.scale = sc0
    loose.rotation_mode = "QUATERNION"

    # It keeps the ship's own way on (so the ship does not sail into it),
    # and goes up hard enough to clear the rail, not through it.
    a0, _ = ship_base("corsairs", frame)
    a1, _ = ship_base("corsairs", frame + 1)
    ship_v = Vector(((a1 - a0).x, (a1 - a0).y, 0)) * FPS
    side = 4.0
    up = clear_rail_launch(rig, crate, side) if rig else 6.0
    print(f"[hero] {crate.name} thrown at {side} m/s sideways, {up} m/s up to clear the rail", flush=True)
    v = normal * side + Vector((0, 0, up)) + ship_v
    # Tumbles outboard, top first, the way a crate kicked over a rail goes.
    spin_axis = (Vector((0, 0, 1)).cross(normal).normalized() +
                 Vector((rnd.uniform(-.25, .25), rnd.uniform(-.25, .25), rnd.uniform(-.15, .15)))).normalized()
    spin_rate = 4.5
    # Fly until the crate's centre meets the sea (checked against the height
    # there a moment later, when it will actually arrive).
    t_land = None
    for k in range(1, 60):
        t = k / FPS
        p = p0 + v * t + Vector((0, 0, -0.5 * G * t * t))
        if p.z < 1.5 + half_h:
            t_land = t
            break
    t_land = t_land or 1.2
    land_f = frame + round(t_land * FPS)
    pl = p0 + v * t_land + Vector((0, 0, -0.5 * G * t_land * t_land))
    for f in range(frame, land_f + 1):
        t = (f - frame) / FPS
        loose.location = p0 + v * t + Vector((0, 0, -0.5 * G * t * t))
        loose.rotation_quaternion = Quaternion(spin_axis, spin_rate * t) @ q0
        loose.keyframe_insert("location", frame=f)
        loose.keyframe_insert("rotation_quaternion", frame=f)
    q_land = Quaternion(spin_axis, spin_rate * t_land) @ q0
    splash(coll, crate.name + "-splash", Vector((pl.x, pl.y, 0.0)), land_f, drop, scale=0.7, n=170, seed=seed)

    # Afloat: sits low, heaves and rocks on the swell, drifts slowly downwind.
    float_frames = list(range(land_f + 2, F_END + 3, 3))
    heights = sample_ocean(near, float_frames, lambda f: {"c": [
        (pl.x + WIND.x * 0.4 * (f - land_f) / FPS, pl.y + WIND.y * 0.4 * (f - land_f) / FPS)]})
    upright = Quaternion(q_land.to_euler().to_quaternion())
    for i, f in enumerate(float_frames):
        t = (f - land_f) / FPS
        x = pl.x + WIND.x * 0.4 * t
        y = pl.y + WIND.y * 0.4 * t
        z = heights[f]["c"][0] - 0.6 + half_h
        # Settle from the tumble toward floating flat, then rock.
        settle = min(1.0, t / 1.2)
        rock = Euler((math.sin(t * 2.1 + seed) * 0.18, math.sin(t * 1.7 + 1) * 0.14, t * 0.2), "XYZ").to_quaternion()
        flat = Euler((0, 0, q_land.to_euler().z), "XYZ").to_quaternion() @ rock
        loose.rotation_quaternion = q_land.slerp(flat, settle)
        loose.location = (x, y, z) if settle >= 1.0 else (x, y, z * settle + pl.z * (1 - settle))
        loose.keyframe_insert("location", frame=f)
        loose.keyframe_insert("rotation_quaternion", frame=f)

    for ob, visible_from in ((crate, None), (loose, frame)):
        for f, hidden in ((F_START, ob is loose), (frame, ob is crate)):
            ob.hide_render = hidden
            ob.hide_viewport = hidden
            ob.keyframe_insert("hide_render", frame=f)
            ob.keyframe_insert("hide_viewport", frame=f)
    return loose


# ---------------------------------------------------------------- terrain

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


def place_piece(coll, stl, name, mat, at, rot_z, scale, sink=0.0, anchor=None):
    o = part_object(name, stl, smooth=40)
    link(o, coll)
    me = o.data
    if anchor is None:
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        anchor = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(v.co.z for v in me.vertices))
    o.matrix_world = (Matrix.Translation(Vector(at) + Vector((0, 0, -sink)))
                      @ Matrix.Rotation(math.radians(rot_z), 4, "Z")
                      @ Matrix.Scale(scale, 4)
                      @ Matrix.Translation(-Vector(anchor)))
    set_object_material(o, mat)
    return o


def backdrop_island(coll, name, center, radius, height, seed, mat):
    """Distant headland: a noise heightfield under a soft radial mask, so it
    rises out of the sea with a ragged ridge line."""
    n = 120
    bm = bmesh.new()
    verts = []
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            u, v = i / n * 2 - 1, j / n * 2 - 1
            r = math.hypot(u * 1.0, v * 1.9)
            mask = max(0.0, 1 - r) ** 1.3
            p = Vector((u * 2.2, v * 1.2, 0)) + off
            h = 0.55 + 0.45 * noise.fractal(p, 0.55, 2.1, 6)
            ridge = 1 - abs(noise.noise(p * 1.7 + Vector((5, 1, 0))))
            z = height * mask * (h * 0.75 + ridge * 0.35)
            row.append(bm.verts.new((center.x + u * radius, center.y + v * radius * 0.55, z - height * 0.04)))
        verts.append(row)
    for j in range(n):
        for i in range(n):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    o = link(bpy.data.objects.new(name, me), coll)
    me.materials.append(mat)
    return o


def build_terrain(coll):
    green = terrain_material("Island Green", W["island"])
    stone = terrain_material("Rock Grey", (0.16, 0.16, 0.15, 1), rough=0.7)
    reef = terrain_material("Reef Coral", (0.55, 0.30, 0.32, 1), rough=0.6)
    far_mat = terrain_material("Headland", W["headland"], rough=0.9, wet_line=False)

    base = "assets/stls/base-set/"
    # The kit's own terrain, blown up to landscape size. The island they are
    # making for is ahead and to starboard of the Queen's Fleet, behind it as
    # seen from the Corsair. Astern there is only open water, reefs and rocks.
    place_piece(coll, base + "island.stl", "Island Ahead", green, (300, -120, 0), 25, 0.9, sink=4)
    place_piece(coll, base + "island.stl", "Island Far", green, (640, 90, 0), -70, 1.3, sink=6)
    place_piece(coll, base + "rock1.stl", "Rock A", stone, (150, -75, 0), 200, 0.22, sink=1.5)
    place_piece(coll, base + "rock1.stl", "Rock B", stone, (-40, 115, 0), 15, 0.16, sink=1)
    place_piece(coll, base + "rock1.stl", "Rock C", stone, (95, -165, 0), 110, 0.12, sink=1)
    place_piece(coll, base + "reef.stl", "Reef A", reef, (75, -50, 0), 40, 0.28, sink=1.2)
    place_piece(coll, base + "reef.stl", "Reef B", reef, (-70, 75, 0), 130, 0.3, sink=1.3)
    # And the land beyond, on both sides of the channel.
    backdrop_island(coll, "Headland 1", Vector((1400, -900, 0)), 900, 260, 1, far_mat)
    backdrop_island(coll, "Headland 2", Vector((900, -1700, 0)), 1400, 420, 2, far_mat)
    # Nothing astern: the Queen's Fleet's camera looks back that way, and land
    # behind the Corsair would read as the ships sailing away from it.
    backdrop_island(coll, "Headland 5", Vector((2600, 400, 0)), 1400, 450, 5, far_mat)

# ---------------------------------------------------------------- flags

def build_flags(coll, rigs):
    ng = bpy.data.node_groups.new("flag-wave", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    pos = N.new("GeometryNodeInputPosition")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(pos.outputs[0], sep.inputs[0])
    st = N.new("GeometryNodeInputSceneTime")
    # Travelling wave from hoist (x=0) to fly (x=1), growing toward the fly.
    ph = N.new("ShaderNodeMath"); ph.operation = "MULTIPLY_ADD"
    L.new(sep.outputs["X"], ph.inputs[0]); ph.inputs[1].default_value = 9.0
    tt = N.new("ShaderNodeMath"); tt.operation = "MULTIPLY"
    # ~0.8 Hz: a flag this size in a fresh breeze, not a fast flutter.
    L.new(st.outputs["Seconds"], tt.inputs[0]); tt.inputs[1].default_value = -5.0
    L.new(tt.outputs[0], ph.inputs[2])
    sn = N.new("ShaderNodeMath"); sn.operation = "SINE"
    L.new(ph.outputs[0], sn.inputs[0])
    ph2 = N.new("ShaderNodeMath"); ph2.operation = "MULTIPLY_ADD"
    L.new(sep.outputs["Z"], ph2.inputs[0]); ph2.inputs[1].default_value = 3.0
    L.new(ph.outputs[0], ph2.inputs[2])
    sn2 = N.new("ShaderNodeMath"); sn2.operation = "SINE"
    L.new(ph2.outputs[0], sn2.inputs[0])
    amp = N.new("ShaderNodeMath"); amp.operation = "MULTIPLY"
    L.new(sep.outputs["X"], amp.inputs[0]); amp.inputs[1].default_value = 0.09
    s12 = N.new("ShaderNodeMath"); s12.operation = "MULTIPLY_ADD"
    L.new(sn2.outputs[0], s12.inputs[0]); s12.inputs[1].default_value = 0.4
    L.new(sn.outputs[0], s12.inputs[2])
    dz = N.new("ShaderNodeMath"); dz.operation = "MULTIPLY"
    L.new(s12.outputs[0], dz.inputs[0]); L.new(amp.outputs[0], dz.inputs[1])
    comb = N.new("ShaderNodeCombineXYZ")
    L.new(dz.outputs[0], comb.inputs["Y"])
    sp = N.new("GeometryNodeSetPosition")
    L.new(gi.outputs[0], sp.inputs["Geometry"]); L.new(comb.outputs[0], sp.inputs["Offset"])
    L.new(sp.outputs[0], go.inputs[0])

    for key in rigs:
        img_name = f"flag-{SHIPS[key].get('model', key)}.png"
        path = HERE / "hero" / img_name
        if not path.exists():
            print(f"[hero] no {path}, skipping {key} flag")
            continue
        m = new_material(f"{key}-flag")
        nt, Nm, Lm = nodes(m)
        b = bsdf_of(m)
        tex = Nm.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(str(path))
        Lm.new(tex.outputs["Color"], b.inputs["Base Color"])
        b.inputs["Roughness"].default_value = 0.7
        setin(b, "Sheen Weight", 0.4)
        tr = Nm.new("ShaderNodeBsdfTranslucent")
        Lm.new(tex.outputs["Color"], tr.inputs["Color"])
        mix = Nm.new("ShaderNodeMixShader"); mix.inputs[0].default_value = 0.25
        Lm.new(b.outputs[0], mix.inputs[1]); Lm.new(tr.outputs[0], mix.inputs[2])
        # The flag art carries its own outline in alpha (the Queen's Fleet
        # ensign is notched at the fly): cut the cloth to it.
        tex.image.alpha_mode = "STRAIGHT"
        cut = Nm.new("ShaderNodeMixShader")
        clear = Nm.new("ShaderNodeBsdfTransparent")
        Lm.new(tex.outputs["Alpha"], cut.inputs[0])
        Lm.new(clear.outputs[0], cut.inputs[1])
        Lm.new(mix.outputs[0], cut.inputs[2])
        Lm.new(cut.outputs[0], Nm["Material Output"].inputs["Surface"])

        w, h = tex.image.size
        aspect = h / w
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=40, y_subdivisions=16, size=1.0)
        proto = bpy.context.active_object
        me = proto.data
        bpy.data.objects.remove(proto)
        # Grid spans -0.5..0.5; move the hoist edge to x=0 and stand it up
        # (cloth in XZ). The wave above runs in this space: along X, out of
        # the cloth along Y.
        me.transform(Matrix.Translation((0.5, 0, 0)))
        me.transform(Matrix.Diagonal((1, aspect, 1, 1)))
        me.transform(Matrix.Rotation(math.radians(90), 4, "X"))
        me.materials.append(m)
        rig = rigs[key]
        yaw = math.degrees(math.atan2(WIND.y, WIND.x))
        # Every mast flies the faction's flag, 26 mm long at the masthead,
        # streaming downwind. A fore flag a touch smaller, as on a real rig.
        for mi, top in enumerate(rig["mast_tops"]):
            o = link(bpy.data.objects.new(f"{key}-flag{mi}", me), coll)
            rig.setdefault("flags", []).append(o)
            mod = o.modifiers.new("Wave", "NODES"); mod.node_group = ng
            o.parent = rig["root"]
            size = 26.0 if mi == len(rig["mast_tops"]) - 1 else 22.0
            o.matrix_basis = (Matrix.Translation(top - Vector((0, 0, size * aspect * 0.5 + 1.0)))
                              @ Matrix.Rotation(math.radians(yaw - SHIPS[key]["heading"] + mi * 7), 4, "Z")
                              @ Matrix.Scale(size, 4))


# ---------------------------------------------------------------- sky, light, camera

def set_mist(w):
    w.mist_settings.start = W["mist_start"]
    w.mist_settings.depth = W["mist_depth"]
    w.mist_settings.falloff = "LINEAR"


def build_world_sunny():
    """Physical sky, scattered fair-weather cumulus, and a rainbow on the
    rain curtain opposite the sun."""
    w = bpy.data.worlds.new("Sunny")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt, N, L = nodes(w)
    bg = N["Background"]
    sun = Vector(W["sun"]).normalized()
    sky = N.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = False          # the sun lamp is the sun; it is behind the camera
    sky.sun_elevation = math.asin(sun.z)
    # Cycles puts the sky's sun at azimuth (rotation - 90 deg).
    sky.sun_rotation = math.atan2(sun.y, sun.x) + math.pi / 2
    sky.altitude = 20
    sky.air_density = 1.0
    sky.aerosol_density = 1.2
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
    val.outputs[0].keyframe_insert("default_value", frame=FPS)
    drift = N.new("ShaderNodeVectorMath"); drift.operation = "MULTIPLY_ADD"
    L.new(val.outputs[0], drift.inputs[0])
    drift.inputs[1].default_value = (WIND.x, WIND.y, 0)
    L.new(proj.outputs[0], drift.inputs[2])
    cl = N.new("ShaderNodeTexNoise"); cl.noise_dimensions = "4D"
    cl.inputs["Scale"].default_value = 0.9
    cl.inputs["Detail"].default_value = 7
    cl.inputs["Roughness"].default_value = 0.58
    L.new(drift.outputs[0], cl.inputs["Vector"]); L.new(val.outputs[0], cl.inputs["W"])
    cover = N.new("ShaderNodeMapRange")
    cover.inputs["From Min"].default_value = 0.54
    cover.inputs["From Max"].default_value = 0.66
    L.new(cl.outputs["Fac"], cover.inputs["Value"])
    # Self-shadowed puffs: the denser middle of each cloud goes grey.
    shade = N.new("ShaderNodeValToRGB")
    shade.color_ramp.elements[0].position = 0.55
    shade.color_ramp.elements[0].color = (3.2, 3.1, 2.95, 1)
    shade.color_ramp.elements[1].position = 0.8
    shade.color_ramp.elements[1].color = (1.25, 1.3, 1.4, 1)
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
    L.new(add.outputs[2], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.32
    _linear_extrapolate(w.node_tree)
    set_mist(w)
    return w


def build_world():
    if not W["lightning"]:
        return build_world_sunny()
    return build_world_storm()


def build_world_storm():
    w = bpy.data.worlds.new("Storm")
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
    cr.elements[0].color = (0.13, 0.145, 0.155, 1)
    cr.elements[1].position = 0.35
    cr.elements[1].color = (0.022, 0.026, 0.031, 1)
    e = cr.elements.new(0.08)
    e.color = (0.06, 0.068, 0.075, 1)
    zc = N.new("ShaderNodeMath"); zc.operation = "MAXIMUM"; zc.inputs[1].default_value = 0.0
    L.new(sep.outputs["Z"], zc.inputs[0])
    L.new(zc.outputs[0], grad.inputs[0])

    # Brighter where the sun is behind the cloud (toward +X, low).
    sun_dir = Vector((0.85, -0.25, 0.25)).normalized()
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
    val.outputs[0].keyframe_insert("default_value", frame=FPS)
    mx = N.new("ShaderNodeMath"); mx.operation = "MULTIPLY"; mx.inputs[1].default_value = WIND.x
    my = N.new("ShaderNodeMath"); my.operation = "MULTIPLY"; my.inputs[1].default_value = WIND.y
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
    cramp.color_ramp.elements[0].color = (1.9, 1.9, 1.95, 1)
    cramp.color_ramp.elements[1].position = 0.6
    cramp.color_ramp.elements[1].color = (0.22, 0.24, 0.27, 1)
    L.new(cl.outputs["Fac"], cramp.inputs[0])
    sky = N.new("ShaderNodeMix"); sky.data_type = "RGBA"; sky.blend_type = "MULTIPLY"
    sky.inputs[0].default_value = 1.0
    L.new(grad.outputs[0], sky.inputs[6]); L.new(cramp.outputs[0], sky.inputs[7])
    lit = N.new("ShaderNodeMix"); lit.data_type = "RGBA"; lit.blend_type = "ADD"
    L.new(gpow.outputs[0], lit.inputs[0])
    L.new(sky.outputs[2], lit.inputs[6])
    lit.inputs[7].default_value = (0.20, 0.22, 0.25, 1)
    L.new(lit.outputs[2], bg.inputs["Color"])
    # Lightning: the whole sky flashes.
    bg.inputs["Strength"].default_value = 1.0
    bg.inputs["Strength"].keyframe_insert("default_value", frame=F_START)
    for f, k in LIGHTNING:
        for ff, kk in ((f - 1, 1.0), (f, 1.0 + 7.0 * k), (f + 1, 1.0 + 2.0 * k), (f + 2, 1.0)):
            bg.inputs["Strength"].default_value = kk
            bg.inputs["Strength"].keyframe_insert("default_value", frame=ff)
    _linear_extrapolate(w.node_tree)
    for fc in _iter_fcurves(w.node_tree):
        if "Strength" in fc.data_path or "inputs[1]" in fc.data_path:
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"
    set_mist(w)
    return w


def build_lights(coll):
    sd = bpy.data.lights.new("Sun", "SUN")
    sd.energy = W["sun_energy"]
    sd.angle = math.radians(W["sun_angle"])
    sd.color = W["sun_color"]
    so = link(bpy.data.objects.new("Sun", sd), coll)
    # A sun lamp shines down its -Z, so its +Z points at the sun.
    so.rotation_euler = Vector(W["sun"]).normalized().to_track_quat("Z", "Y").to_euler()
    if not W["lightning"]:
        return
    # Lightning key: a hard white flash from high behind the ships.
    ld = bpy.data.lights.new("Lightning", "SUN")
    ld.angle = math.radians(2)
    ld.color = (0.8, 0.85, 1.0)
    lo = link(bpy.data.objects.new("Lightning", ld), coll)
    lo.rotation_euler = Vector((0.6, -0.3, 0.65)).normalized().to_track_quat("Z", "Y").to_euler()
    ld.energy = 0.0
    ld.keyframe_insert("energy", frame=F_START)
    for f, k in LIGHTNING:
        for ff, kk in ((f - 1, 0.0), (f, 14.0 * k), (f + 1, 4.0 * k), (f + 2, 0.0)):
            ld.energy = kk
            ld.keyframe_insert("energy", frame=ff)
    for fc in _iter_fcurves(ld):
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
    em.inputs["Strength"].keyframe_insert("default_value", frame=F_START)
    for f, k in LIGHTNING[:3]:
        for ff, kk in ((f - 1, 0.0), (f, 400.0 * k), (f + 1, 60 * k), (f + 2, 0.0)):
            em.inputs["Strength"].default_value = kk
            em.inputs["Strength"].keyframe_insert("default_value", frame=ff)
    for fc in _iter_fcurves(m.node_tree):
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
    o.visible_shadow = False


def deck_height(rig, x, y):
    """Hull-space deck height at (x, y): cast down onto the hull mesh."""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(rig["hull"].data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    hit = tree.ray_cast(Vector((x, y, 200)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else 20.0


def deck_camera(coll, name, rig, other, lens):
    """A camera standing on `rig`'s deck (eye height ~1.75 m) and riding its
    motion, kept level and aimed at the other ship, with a little hand-held
    float."""
    x, y, h, *mode = SHIPS[rig["key"]]["deck_cam"]
    # Height above the deck there, or ("abs") above the keel for a camera
    # rigged outboard where there is no deck under it.
    z = h if mode == ["abs"] else deck_height(rig, x, y) + h
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.sensor_width = 36
    cd.clip_start = 0.1
    cd.clip_end = 20000
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = 5.6
    cam = link(bpy.data.objects.new(name, cd), coll)
    cam.parent = rig["root"]
    cam.location = (x, y, z)
    cam.scale = (1 / S, 1 / S, 1 / S)   # cancel the model scale of the parent
    target = link(bpy.data.objects.new(f"{name} Target", None), coll)
    target.parent = other["root"]
    # Aim halfway up the other ship's rig so the waterline and the flags at
    # the mastheads (~100 mm) both stay in frame.
    target.location = (0, 0, 50)
    tr = cam.constraints.new("TRACK_TO")
    tr.target = target
    tr.track_axis = "TRACK_NEGATIVE_Z"
    tr.up_axis = "UP_Y"
    cd.dof.focus_object = target
    # Hand-held: noise on the aim point (in the target ship's mm).
    for f in (F_START, F_END):
        target.keyframe_insert("location", frame=f)
    for fc in _iter_fcurves(target):
        md = fc.modifiers.new("NOISE")
        md.scale = 30
        md.strength = (1.2, 1.2, 0.8)[fc.array_index] / S * 0.25
        md.phase = fc.array_index * 11 + len(name)
    return cam


def build_camera(coll, rigs):
    sc = bpy.context.scene
    cam_a = deck_camera(coll, "Corsair Deck Cam", rigs["corsairs"], rigs["queens-fleet"], 20)
    cam_b = deck_camera(coll, "Queen's Deck Cam", rigs["queens-fleet"], rigs["corsairs"], 20)
    sc.camera = cam_a
    # Each deck camera stands among its own ship's rig: the canvas would fill
    # half the frame and a mast close by reads as a dark bar at the edge.
    # Hide that ship's sails, masts and flags from the camera (only) for its
    # shot: they still cast shadows, and the other shot shows them.
    for key, (f_on, f_off) in (("corsairs", (F_START, CUT)), ("queens-fleet", (CUT, F_END + 1))):
        rig = rigs[key]
        for sail in rig.get("sails", []) + rig.get("masts", []) + rig.get("flags", []):
            for f, vis in ((F_START, True), (f_on, False), (f_off, True)):
                if f > F_END:
                    continue
                sail.visible_camera = vis
                sail.keyframe_insert("visible_camera", frame=f)
            for fc in _iter_fcurves(sail):
                for k in fc.keyframe_points:
                    k.interpolation = "CONSTANT"
    sc.timeline_markers.new("Corsair fires", frame=F_START).camera = cam_a
    sc.timeline_markers.new("Queen's Fleet answers", frame=CUT).camera = cam_b
    return cam_a


# ---------------------------------------------------------------- render setup

def setup_render(samples, pct):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    # Adaptive sampling stops clean pixels (sky, open water) early; the
    # denoiser does the rest. 64 samples + a 0.03 threshold looked the same
    # as 128 + 0.015 at hero size and renders about twice as fast.
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.adaptive_min_samples = 16
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_use_gpu = True
    sc.cycles.tile_size = 2048
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 3
    sc.cycles.transmission_bounces = 4
    sc.cycles.volume_bounces = 1
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 6.0
    # Coarser volume steps: the smoke is soft, it does not need fine ones.
    sc.cycles.volume_step_rate = 4.0
    # Keep the scene resident between frames instead of rebuilding it all.
    sc.render.use_persistent_data = True
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.resolution_percentage = pct
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = F_START, F_END
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.5
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "8"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    sc.view_settings.exposure = W["exposure"]
    vl = sc.view_layers[0]
    vl.use_pass_mist = True
    vl.use_pass_environment = True
    build_compositor()


def build_compositor():
    """Aerial perspective. Film is transparent so the sky arrives separately
    (the Environment pass); only the geometry is hazed by the Mist pass, then
    the sky goes back behind it. Hazing the sky too would wash out the
    clouds, which already fade toward the horizon on their own."""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("Hero Comp", "CompositorNodeTree")
    sc.compositing_node_group = ng
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    N, L = ng.nodes, ng.links
    rl = N.new("CompositorNodeRLayers")
    out = N.new("NodeGroupOutput")
    fog = W["fog"]

    def mix(blend, fac, a, b):
        n = N.new("ShaderNodeMix"); n.data_type = "RGBA"; n.blend_type = blend
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = v
            else:
                L.new(v, sock)
        return n.outputs[2]

    f = N.new("ShaderNodeMath"); f.operation = "MULTIPLY"; f.use_clamp = True
    L.new(rl.outputs["Mist"], f.inputs[0]); f.inputs[1].default_value = W["mist"]
    fog_a = mix("MULTIPLY", 1.0, fog, rl.outputs["Alpha"])
    hazed = mix("MIX", f.outputs[0], rl.outputs["Image"], fog_a)
    inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    L.new(rl.outputs["Alpha"], inv.inputs[1])
    env = mix("MULTIPLY", 1.0, rl.outputs["Environment"], inv.outputs[0])
    final = mix("ADD", 1.0, hazed, env)
    try:
        gl = N.new("CompositorNodeGlare")
        print("[hero] glare inputs", [i.name for i in gl.inputs])
        if "Type" in gl.inputs:
            gl.inputs["Type"].default_value = "Fog Glow"
        else:
            gl.glare_type = "FOG_GLOW"
        L.new(final, gl.inputs[0])
        for name, v in (("Threshold", 1.6), ("Strength", 0.6), ("Size", 0.6)):
            if name in gl.inputs:
                gl.inputs[name].default_value = v
        final = gl.outputs[0]
    except Exception as e:
        print("[hero] glare skipped:", e)
    L.new(final, out.inputs[0])


def bake_oceans(frames, weather):
    """Bake the Ocean modifiers for the frames about to render, so each frame
    reads its waves from disk instead of recomputing the FFT on the CPU.

    Only done for --render: the .blend is saved before this, unbaked, so the
    committed scene stays procedural and opens anywhere (a baked modifier
    points at cache files that would not exist on another machine). Checks
    one vertex against the live simulation so a time mismatch between the
    bake and the ships' sampled motion cannot slip by."""
    sc = bpy.context.scene
    f0, f1 = frames
    for name in ("Ocean Near",):
        o = bpy.data.objects[name]
        m = o.modifiers["Ocean"]
        probe_f = (f0 + f1) // 2
        sc.frame_set(probe_f)
        dg = bpy.context.evaluated_depsgraph_get()
        me = o.evaluated_get(dg).to_mesh()
        live = me.vertices[len(me.vertices) // 3].co.copy()
        o.evaluated_get(dg).to_mesh_clear()
        d = BUILD / f"ocean-bake-{weather}" / name.split()[-1].lower()
        d.mkdir(parents=True, exist_ok=True)
        m.filepath = str(d)
        m.frame_start, m.frame_end = f0, f1 + 1
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.ocean_bake(modifier="Ocean")
        sc.frame_set(probe_f)
        dg = bpy.context.evaluated_depsgraph_get()
        me = o.evaluated_get(dg).to_mesh()
        baked = me.vertices[len(me.vertices) // 3].co.copy()
        o.evaluated_get(dg).to_mesh_clear()
        err = (baked - live).length
        print(f"[hero] baked {name} frames {f0}-{f1 + 1}; check at {probe_f}: {err:.4f} m")
        if err > 0.02:
            raise SystemExit(f"[hero] baked {name} disagrees with the live ocean by {err:.3f} m; "
                             "the ships would not ride these waves. Not rendering.")


# ---------------------------------------------------------------- main

def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--save", type=Path, default=BUILD / "hero-battle.blend")
    p.add_argument("--still", default="")
    p.add_argument("--render", action="store_true")
    p.add_argument("--frames", default="")
    p.add_argument("--pct", type=int, default=100)
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--out", type=Path, default=BUILD)
    p.add_argument("--weather", choices=sorted(WEATHERS), default="sunny")
    p.add_argument("--threads", type=int, default=6,
                   help="CPU threads (default 6 of 16): keeps a laptop cool; the GPU does the rendering.")
    p.add_argument("--no-blur", action="store_true",
                   help="No motion blur (drafts): blur re-evaluates the live ocean several times a frame.")
    p.add_argument("--step", type=int, default=1, help="Render every Nth frame (drafts).")
    p.add_argument("--no-bake", action="store_true", help="Render with the live ocean.")
    p.add_argument("--no-fx", action="store_true", help="Skip rain/shots (fast layout checks).")
    return p.parse_args(argv)


def stage(label):
    """Progress line with this process's current memory, flushed at once so
    it survives the process being killed."""
    try:
        with open("/proc/self/status") as f:
            rss = next(int(l.split()[1]) for l in f if l.startswith("VmRSS")) // 1024
    except Exception:
        rss = -1
    print(f"[hero] {label} (RSS {rss} MB)", flush=True)


def main():
    global W
    a = parse()
    W = WEATHERS[a.weather]
    if a.save == BUILD / "hero-battle.blend":
        a.save = BUILD / f"hero-battle-{a.weather}.blend"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = F_START, F_END
    sc.render.fps = FPS
    coll = sc.collection

    M = build_materials()
    near = build_ocean(coll)
    stage("ocean")
    rigs = {k: build_ship(k, M, coll) for k in SHIPS}
    stage("ships")
    animate_ships(rigs, near)
    stage("ship motion")
    build_flags(coll, rigs)
    build_terrain(coll)
    build_world()
    build_lights(coll)
    cam = build_camera(coll, rigs)
    stage("flags, terrain, sky, cameras")
    if not a.no_fx:
        build_shots(coll, M, rigs, near)
        stage("shots, wakes, spray")
        build_rain(coll, Vector((12, 0, 0)))
        if W["lightning"]:
            lightning_bolt(coll)
        stage("rain")
    setup_render(a.samples, a.pct)
    if a.no_blur:
        sc.render.use_motion_blur = False
    sc.render.threads_mode = "FIXED"
    sc.render.threads = a.threads

    a.save.parent.mkdir(parents=True, exist_ok=True)
    # Pack the flag textures so the .blend opens on any machine.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(a.save), compress=True)
    stage("saved")
    bpy.app.handlers.render_pre.append(lambda *_: stage(f"render frame {bpy.context.scene.frame_current}"))
    bpy.app.handlers.render_post.append(lambda *_: stage("rendered"))
    print(f"[hero] saved {a.save}")

    a.out.mkdir(parents=True, exist_ok=True)
    if a.still:
        for f in [int(x) for x in a.still.split(",")]:
            sc.frame_set(f)
            sc.render.filepath = str(a.out / f"still_{a.weather}_{f:04d}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[hero] still {sc.render.filepath}")
    if a.render:
        if a.frames:
            s, e = (int(x) for x in a.frames.split("-"))
            sc.frame_start, sc.frame_end = s, e
        sc.frame_step = a.step
        if not a.no_bake:
            bake_oceans((sc.frame_start, sc.frame_end), a.weather)
        sc.render.filepath = str(a.out / f"frames-{a.weather}" / "hero_")
        bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
