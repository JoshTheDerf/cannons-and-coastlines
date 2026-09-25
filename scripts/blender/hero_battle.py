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
from mathutils import Matrix, Vector, noise

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DATA = json.loads((REPO / "nuxt-site/shared/data/ship-assemblies.json").read_text())
BUILD = REPO / "build" / "hero"

S = 0.25            # metres per model millimetre: a 120 mm hull is a 30 m ship
FPS = 24
F_START, F_END = 1, 192
PREROLL = 48        # frames of ship motion simulated before F_START so it starts settled
G = 9.81

# Wind blows from the Corsair toward the Queen's Fleet and a little downstage:
# smoke drifts that way, the flags stream that way, the rain leans that way.
WIND = Vector((0.35, -1.0, 0.0)).normalized()

# The action. Hulls lie along X with their bows toward -X (hull space), 70 m
# apart, broadside to broadside: the Corsair's port guns face -Y, the Queen's
# Fleet's starboard guns +Y.
SHIPS = {
    "corsairs":     {"pos": Vector((0.0, 28.0)),  "heading": -3.0, "speed": 0.7,
                     "cannon": {"at": [-2.99, -7.81, 15.88], "rotZ": -90.0}},
    "queens-fleet": {"pos": Vector((-6.0, -28.0)), "heading": 4.0, "speed": 0.6,
                     "cannon": {"at": [-4.83, 7.81, 14.9], "rotZ": 90.0}},
}
WATERLINE_MM = 7.0  # hull height (mm) the mean sea surface cuts

# Timeline (frames).
SHOT_1 = {"from": "corsairs", "fire": 40, "flight": 22}       # falls just short: splash
SHOT_2 = {"from": "queens-fleet", "fire": 104, "flight": 20}  # hits the Corsair's side
LIGHTNING = [(150, 1.0), (152, 0.35), (154, 0.8), (158, 0.2)]

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
        exposure=0.0, wind=10.5, wave_scale=1.35, chop=1.25, foam=0.12,
        rain=26000, rain_alpha=0.3, rain_glow=0.08, lightning=False,
        sea_deep=(0.002, 0.028, 0.045, 1), sea_crest=(0.006, 0.13, 0.14, 1),
        island=(0.07, 0.16, 0.045, 1), headland=(0.05, 0.085, 0.045, 1),
        smoke=(0.85, 0.84, 0.8, 1)),
    "storm": dict(
        sun=(-0.55, -0.55, 0.62), sun_energy=2.6, sun_angle=12, sun_color=(0.9, 0.93, 1.0),
        fog=(0.10, 0.115, 0.125, 1), mist=0.75, mist_start=80, mist_depth=5000,
        exposure=0.45, wind=15.0, wave_scale=2.2, chop=1.5, foam=0.4,
        rain=90000, rain_alpha=0.55, rain_glow=0.25, lightning=True,
        sea_deep=(0.004, 0.016, 0.018, 1), sea_crest=(0.02, 0.07, 0.065, 1),
        island=(0.06, 0.12, 0.05, 1), headland=(0.035, 0.05, 0.04, 1),
        smoke=(0.62, 0.62, 0.6, 1)),
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


def place_matrix(at, rot_z=0.0, anchor=(0, 0, 0), rot_x=0.0):
    """world = at + Rz(rotZ) * Rx(rotX) * (p - anchor), as in shipAssembly.ts."""
    return (Matrix.Translation(Vector(at))
            @ Matrix.Rotation(math.radians(rot_z), 4, "Z")
            @ Matrix.Rotation(math.radians(rot_x), 4, "X")
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

def plastic(name, color, rough=0.45, wet=0.35, layers=True, metallic=0.0,
            translucent=0.0):
    """Printed PLA, rain-wet: a filament base, faint layer lines in object
    space (0.2 mm pitch, the parts are modelled in mm) and a thin clear coat
    for the water film."""
    m = new_material(name)
    nt, N, L = nodes(m)
    b = bsdf_of(m)
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    setin(b, "Specular IOR Level", 0.4)
    setin(b, "Coat Weight", wet)
    setin(b, "Coat Roughness", 0.08)
    setin(b, "Sheen Weight", 0.08)
    if layers:
        tc = N.new("ShaderNodeTexCoord")
        sep = N.new("ShaderNodeSeparateXYZ")
        mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 5.0
        pp = N.new("ShaderNodeMath"); pp.operation = "PINGPONG"; pp.inputs[1].default_value = 1.0
        bump = N.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.12
        bump.inputs["Distance"].default_value = 0.02
        L.new(tc.outputs["Object"], sep.inputs[0])
        L.new(sep.outputs["Z"], mul.inputs[0])
        L.new(mul.outputs[0], pp.inputs[0])
        L.new(pp.outputs[0], bump.inputs["Height"])
        L.new(bump.outputs["Normal"], b.inputs["Normal"])
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
    M["black-hull"] = plastic("Corsair Hull", (0.035, 0.035, 0.038, 1), rough=0.5)
    M["black"] = plastic("Black PLA", (0.028, 0.028, 0.03, 1), rough=0.5)
    M["black-sail"] = plastic("Corsair Sail", (0.03, 0.03, 0.032, 1), rough=0.6,
                              wet=0.2, layers=False, translucent=0.08)
    M["blue-grey"] = plastic("Queen's Hull", (0.50, 0.58, 0.68, 1), rough=0.45)
    M["white"] = plastic("Sail White", (0.86, 0.84, 0.80, 1), rough=0.6,
                         wet=0.15, layers=False, translucent=0.3)
    M["wood"] = plastic("Wood PLA", (0.30, 0.17, 0.08, 1), rough=0.55)
    M["gunmetal"] = plastic("Cannon", (0.03, 0.03, 0.03, 1), rough=0.35, metallic=0.35)
    M["grey"] = plastic("Grey PLA", (0.45, 0.45, 0.45, 1))
    M["neon-green"] = plastic("Cannonball", (0.22, 0.58, 0.10, 1), rough=0.4)
    gold = plastic("Coin Gold", (1.0, 0.56, 0.13, 1), rough=0.2, metallic=0.95,
                   wet=0.1, layers=False)
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


def build_ship(key, M, coll):
    ship = DATA["ships"][key]
    parts = DATA["parts"]
    root = link(bpy.data.objects.new(f"{key}-root", None), coll)
    root.scale = (S, S, S)
    rig = {"root": root, "objs": []}

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
            continue
        if p["part"] == "cannon":
            # The kit's own placement shows the gun in its default socket; the
            # scene fires broadside, so it goes in the socket facing the enemy.
            p = dict(p, at=cannon_spec["at"], rotZ=cannon_spec["rotZ"])
        m = place_matrix(p["at"], p.get("rotZ", 0), part.get("anchor", (0, 0, 0)), p.get("rotX", 0))
        o = add(part_object(f"{key}-{p['part']}{i}", stl), M[color], m)
        if p["part"] == "cannon":
            rig["cannon"] = o
            rig["cannon_rest"] = m.copy()
        if p["part"].startswith("mast"):
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
    b.inputs["Roughness"].default_value = 0.09
    b.inputs["IOR"].default_value = 1.333
    setin(b, "Specular IOR Level", 0.5)
    # Colour: deep storm green-grey, lifted toward sea-glass on the crests
    # where light would come through the wave, and white where it foams.
    geo = N.new("ShaderNodeNewGeometry")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(geo.outputs["Position"], sep.inputs[0])
    crest = N.new("ShaderNodeMapRange")
    crest.inputs["From Min"].default_value = -0.3
    crest.inputs["From Max"].default_value = 1.6
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
    framp.color_ramp.elements[0].position = 0.22
    framp.color_ramp.elements[1].position = 0.55
    L.new(fmul.outputs[0], framp.inputs[0])
    col = N.new("ShaderNodeMix"); col.data_type = "RGBA"
    L.new(framp.outputs[0], col.inputs[0])
    L.new(body.outputs[2], col.inputs[6])
    col.inputs[7].default_value = (0.55, 0.58, 0.58, 1)
    L.new(col.outputs[2], b.inputs["Base Color"])
    rough = N.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.09
    rough.inputs["To Max"].default_value = 0.7
    L.new(framp.outputs[0], rough.inputs["Value"])
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
    bump.inputs["Strength"].default_value = 0.05
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


def build_ocean(coll):
    mat = water_material()
    # Near patch: fine enough to carry the ships and the splashes.
    me = bpy.data.meshes.new("ocean-near")
    near = link(bpy.data.objects.new("Ocean Near", me), coll)
    near.location = (-40, -10, 0)
    ocean_modifier(near, 256, 48)
    me.materials.append(mat)
    # Far patches: same spectrum, coarser, out to the haze. Cut where the
    # near patch sits.
    me2 = bpy.data.meshes.new("ocean-far")
    far = link(bpy.data.objects.new("Ocean Far", me2), coll)
    far.location = (600, -10, 0)
    ocean_modifier(far, 1024, 16, repeat=1)
    gn_delete_box(far, -40 - 128 - 600 + 2, -40 + 128 - 600 - 2, -128 + 2, 128 - 2)
    me2.materials.append(mat)
    # Beyond that, a flat sea to the horizon; its ripples are all shader.
    bpy.ops.mesh.primitive_plane_add(size=60000, location=(0, 0, -1.2))
    horizon = bpy.context.active_object
    horizon.name = "Ocean Horizon"
    for c in list(horizon.users_collection):
        c.objects.unlink(horizon)
    link(horizon, coll)
    gn_delete_box(horizon, 600 - 512 + 4, 600 + 512 - 4, -10 - 512 + 4, -10 + 512 - 4)
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
                      SHIPS[k]["speed"]] for k in rigs}], default=float)
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
    return s["pos"] + fwd * s["speed"] * t, h


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
                state[0] += (a - state[0]) * 0.35
                state[1] += (bx - state[1]) * 0.18
                state[2] += (by - state[2]) * 0.18
            if f < F_START - 1:
                continue
            base, hdg = ship_base(key, f)
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
            root = rig["root"]
            root.location = (base.x, base.y, state[0] - WATERLINE_MM * S)
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
    L.new(iop.outputs[0], go.inputs[0])
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
    b.inputs["Base Color"].default_value = (0.85, 0.9, 0.9, 1)
    b.inputs["Roughness"].default_value = 0.15
    setin(b, "Transmission Weight", 0.55)
    b.inputs["IOR"].default_value = 1.33
    setin(b, "Subsurface Weight", 0.3)
    return m


def splash(coll, name, center, frame, drop_obj, scale=1.0, n=900, seed=1):
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
            s = rnd.uniform(0.08, 0.22) * scale
        pts.append(center + Vector((math.cos(a) * r, math.sin(a) * r, rnd.uniform(-0.2, 0.3))))
        vel.append((math.cos(a) * out + WIND.x * 1.5, math.sin(a) * out + WIND.y * 1.5, up))
        birth.append(frame + rnd.uniform(0, 3.5) + (0 if crown else 1.0))
        size.append(s)
        spin.append((0, 0, 0))
    o = points_object(name, coll, pts, {
        "vel": ("FLOAT_VECTOR", vel), "birth": ("FLOAT", birth),
        "size": ("FLOAT", size), "spin": ("FLOAT_VECTOR", spin)})
    gn_ballistic(o, drop_obj, life=52, drag=0.35, spin=False)
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
    lo = cam_path_center + Vector((-45, -45, -2))
    hi = cam_path_center + Vector((60, 45, 32))
    rnd = random.Random(11)
    n = W["rain"]
    pts = []
    for _ in range(n):
        # Denser toward the camera end of the box, where drops are big enough to see.
        u = rnd.random() ** 1.7
        pts.append((lo.x + (hi.x - lo.x) * u, rnd.uniform(lo.y, hi.y), rnd.uniform(lo.z, hi.z)))
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
    Ln.new(setp.outputs[0], iop.inputs["Points"])
    Ln.new(oi.outputs["Geometry"], iop.inputs["Instance"])
    # Cylinder is along Z; lean it along the fall direction.
    q = Vector((0, 0, 1)).rotation_difference(-fall).to_euler()
    iop.inputs["Rotation"].default_value = q
    Ln.new(iop.outputs[0], go.inputs[0])
    mod = rain.modifiers.new("Rain", "NODES")
    mod.node_group = ng
    # The wrap teleports drops, which motion blur would smear across the frame.
    rain.cycles.use_motion_blur = False
    rain.visible_shadow = False
    return rain


# ---------------------------------------------------------------- smoke & fire

def smoke_puffs(coll, name, origin, direction, frame, n=7, seed=5):
    rnd = random.Random(seed)
    objs = []
    for i in range(n):
        m = new_material(f"{name}-smoke{i}")
        nt, N, L = nodes(m)
        N.remove(N["Principled BSDF"])
        vol = N.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = W["smoke"]
        vol.inputs["Anisotropy"].default_value = 0.3
        tc = N.new("ShaderNodeTexCoord")
        nz = N.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 1.6
        nz.inputs["Detail"].default_value = 6
        nz.inputs["Roughness"].default_value = 0.6
        L.new(tc.outputs["Object"], nz.inputs["Vector"])
        ln = N.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"
        L.new(tc.outputs["Object"], ln.inputs[0])
        fall = N.new("ShaderNodeMapRange")
        fall.inputs["From Min"].default_value = 1.0
        fall.inputs["From Max"].default_value = 0.2
        L.new(ln.outputs["Value"], fall.inputs["Value"])
        shape = N.new("ShaderNodeMapRange")
        shape.inputs["From Min"].default_value = 0.42
        shape.inputs["From Max"].default_value = 0.7
        L.new(nz.outputs["Fac"], shape.inputs["Value"])
        mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
        L.new(fall.outputs[0], mul.inputs[0]); L.new(shape.outputs[0], mul.inputs[1])
        dens = N.new("ShaderNodeMath"); dens.operation = "MULTIPLY"
        L.new(mul.outputs[0], dens.inputs[0])
        dens.inputs[1].default_value = 0.0
        L.new(dens.outputs[0], vol.inputs["Density"])
        L.new(vol.outputs[0], N["Material Output"].inputs["Volume"])

        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.0)
        o = bpy.context.active_object
        o.name = f"{name}-smoke{i}"
        for c in list(o.users_collection):
            c.objects.unlink(o)
        link(o, coll)
        o.data.materials.append(m)
        o.rotation_euler = (rnd.uniform(0, 6), rnd.uniform(0, 6), rnd.uniform(0, 6))
        d = i / max(1, n - 1)
        start = origin + direction * (0.5 + d * 3.5) + Vector((rnd.gauss(0, .3), rnd.gauss(0, .3), rnd.gauss(0.1, .2)))
        f0 = frame + int(d * 2)
        drift = WIND * 2.2 + direction * (2.5 * (1 - d)) + Vector((0, 0, 0.6))
        r0 = 0.5 + d * 0.8
        for f, s, dn in ((F_START, 0.01, 0.0), (f0 - 1, 0.01, 0.0), (f0, r0, 3.5),
                         (f0 + 6, r0 * 2.4, 1.6), (f0 + 30, r0 * 4.0, 0.55), (f0 + 80, r0 * 6.0, 0.0)):
            o.scale = (s, s, s * 0.85)
            o.location = start + drift * max(0, (f - f0)) / FPS
            dens.inputs[1].default_value = dn
            o.keyframe_insert("scale", frame=f)
            o.keyframe_insert("location", frame=f)
            dens.inputs[1].keyframe_insert("default_value", frame=f)
        o.visible_shadow = True
        objs.append(o)
    return objs


def muzzle_flash(coll, name, origin, direction, frame):
    m, em = emissive(f"{name}-flash", (1.0, 0.55, 0.18, 1), 0.0)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.0)
    o = bpy.context.active_object
    o.name = f"{name}-flash"
    for c in list(o.users_collection):
        c.objects.unlink(o)
    link(o, coll)
    o.data.materials.append(m)
    o.location = origin + direction * 1.2
    o.rotation_euler = Vector((1, 0, 0)).rotation_difference(direction).to_euler()
    for f, s, e in ((frame - 1, 0.01, 0), (frame, 1.0, 60), (frame + 1, 1.5, 25), (frame + 2, 1.2, 4), (frame + 3, 0.01, 0)):
        o.scale = (s * 1.8, s * 0.7, s * 0.7)
        em.inputs["Strength"].default_value = e
        o.keyframe_insert("scale", frame=f)
        em.inputs["Strength"].keyframe_insert("default_value", frame=f)
    o.visible_shadow = False
    ld = bpy.data.lights.new(f"{name}-flashlight", "POINT")
    ld.color = (1.0, 0.6, 0.25)
    ld.shadow_soft_size = 0.6
    lo = link(bpy.data.objects.new(f"{name}-flashlight", ld), coll)
    lo.location = origin + direction * 1.5
    for f, e in ((frame - 1, 0), (frame, 300000), (frame + 1, 120000), (frame + 2, 20000), (frame + 4, 0)):
        ld.energy = e
        ld.keyframe_insert("energy", frame=f)
    return o


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
    o.scale = (S, S, S)
    o.data.materials.clear()
    o.data.materials.append(M["neon-green"])
    return o


def stage_shot(coll, M, rigs, shot, target_fn, name, drop_obj, shard_obj, near):
    sc = bpy.context.scene
    rig = rigs[shot["from"]]
    cannon = rig["cannon"]
    bore, radius = find_bore(cannon)
    f0 = shot["fire"]
    f1 = f0 + shot["flight"]

    sc.frame_set(f0)
    cm = cannon.matrix_world.copy()
    muzzle = cm @ bore
    direction = (cm.to_3x3() @ Vector((1, 0, 0))).normalized()

    ball = build_ball(coll, M, name + "-ball")
    # Loaded: the ball rides in the bore, round end out and its printing
    # point back toward the breech, until the gun fires. (Its +Z is the point.)
    seat = Matrix.Translation(bore - Vector((radius * 1.6 + 2.0, 0, 0))) @ \
        Matrix.Rotation(math.radians(-90), 4, "Y")
    for f in range(F_START, f0):
        sc.frame_set(f)
        mw = cannon.matrix_world @ seat
        loc, rot, _ = mw.decompose()
        ball.rotation_mode = "QUATERNION"
        ball.location = loc
        ball.rotation_quaternion = rot
        ball.keyframe_insert("location", frame=f)
        ball.keyframe_insert("rotation_quaternion", frame=f)

    p1, after = target_fn(f1)
    ballistic_keys(ball, muzzle, p1, f0, f1, direction)
    after(ball, f1)

    # Recoil: the tensioned gun kicks back along its own axis and settles.
    rest = rig["cannon_rest"]
    for f, back in ((f0 - 1, 0.0), (f0, 3.5), (f0 + 2, 2.4), (f0 + 8, 0.4), (f0 + 14, 0.0)):
        cannon.matrix_basis = rest @ Matrix.Translation((-back, 0, 0))
        cannon.keyframe_insert("location", frame=f)
    muzzle_flash(coll, name, muzzle, direction, f0)
    smoke_puffs(coll, name, muzzle, direction, f0, seed=hash(name) % 1000)
    return muzzle, direction, p1


def sea_height_at(near, frame, x, y):
    return sample_ocean(near, [frame], lambda f: {"p": [(x, y)]})[frame]["p"][0]


def build_shots(coll, M, rigs, near):
    drop = fx_source("fx-drop", coll, "drop", spray_material(), size=1.0)
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
            foam_ring(coll, "foam-1", p, f1)
        return p, after

    stage_shot(coll, M, rigs, SHOT_1, target1, "shot1", drop, shard, near)

    # Shot 2: the Queen's Fleet answers and hits the Corsair amidships.
    def target2(f):
        sc.frame_set(f)
        cr = rigs["corsairs"]["root"]
        hit_local = Vector((6.0, -17.2, 17.0))
        p = cr.matrix_world @ hit_local
        normal = (cr.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()

        def after(ball, f1):
            # Glances off the planking and drops into the sea alongside.
            v_out = normal * 3.0 + Vector((1.5, 0, 2.5))
            land_f = f1 + 14
            lx, ly = p.x + v_out.x * 14 / FPS, p.y + v_out.y * 14 / FPS
            lz = sea_height_at(near, land_f, lx, ly)
            ballistic_keys(ball, p, Vector((lx, ly, lz)), f1, land_f, normal)
            ball.location = Vector((lx, ly, lz - 3))
            ball.keyframe_insert("location", frame=land_f + 2)
            splinters(coll, "splinters-2", p, normal, f1, shard, seed=33)
            splash(coll, "splash-2b", Vector((lx, ly, lz)), land_f, drop, scale=0.55, n=400, seed=34)
        return p, after

    stage_shot(coll, M, rigs, SHOT_2, target2, "shot2", drop, shard, near)


def foam_ring(coll, name, center, frame):
    m = new_material(f"{name}-mat")
    nt, N, L = nodes(m)
    b = bsdf_of(m)
    b.inputs["Base Color"].default_value = (0.7, 0.73, 0.72, 1)
    b.inputs["Roughness"].default_value = 0.6
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.5
    nz.inputs["Detail"].default_value = 8
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    ln = N.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"
    L.new(tc.outputs["Object"], ln.inputs[0])
    edge = N.new("ShaderNodeMapRange")
    edge.inputs["From Min"].default_value = 1.0
    edge.inputs["From Max"].default_value = 0.4
    L.new(ln.outputs["Value"], edge.inputs["Value"])
    mul = N.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
    L.new(nz.outputs["Fac"], mul.inputs[0]); L.new(edge.outputs[0], mul.inputs[1])
    thr = N.new("ShaderNodeMapRange")
    thr.inputs["From Min"].default_value = 0.3
    thr.inputs["From Max"].default_value = 0.5
    L.new(mul.outputs[0], thr.inputs["Value"])
    fade = N.new("ShaderNodeMath"); fade.operation = "MULTIPLY"
    L.new(thr.outputs[0], fade.inputs[0])
    fade.inputs[1].default_value = 0.0
    L.new(fade.outputs[0], b.inputs["Alpha"])
    for f, a in ((frame - 1, 0.0), (frame + 2, 1.0), (frame + 40, 0.7), (frame + 90, 0.0)):
        fade.inputs[1].default_value = a
        fade.inputs[1].keyframe_insert("default_value", frame=f)
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=1.0, fill_type="NGON")
    o = bpy.context.active_object
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    link(o, coll)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=12)
    bpy.ops.object.mode_set(mode="OBJECT")
    o.data.materials.append(m)
    o.location = center
    for f, s in ((frame, 1.0), (frame + 20, 5.0), (frame + 90, 9.0)):
        o.scale = (s, s, 1)
        o.keyframe_insert("scale", frame=f)
    sw = o.modifiers.new("OnSea", "SHRINKWRAP")
    sw.target = bpy.data.objects["Ocean Near"]
    sw.wrap_method = "PROJECT"
    sw.use_project_z = True
    sw.use_negative_direction = True
    sw.use_positive_direction = True
    sw.offset = 0.04
    o.visible_shadow = False
    return o


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
    # The kit's own terrain, blown up to landscape size, beyond the ships.
    place_piece(coll, base + "island.stl", "Island A", green, (300, -70, 0), 25, 0.75, sink=4)
    place_piece(coll, base + "island.stl", "Island B", green, (620, 190, 0), -70, 1.1, sink=6)
    place_piece(coll, base + "island-topper.stl", "Islet", green, (190, 75, 0), 40, 0.55, sink=2)
    place_piece(coll, base + "rock1.stl", "Rock A", stone, (110, -60, 0), 200, 0.22, sink=1.5)
    place_piece(coll, base + "rock1.stl", "Rock B", stone, (140, 22, 0), 15, 0.16, sink=1)
    place_piece(coll, base + "rock1.stl", "Rock C", stone, (60, 62, 0), 110, 0.12, sink=1)
    place_piece(coll, base + "reef.stl", "Reef A", reef, (70, 8, 0), 40, 0.28, sink=2.2)
    place_piece(coll, base + "reef.stl", "Reef B", reef, (55, -70, 0), 130, 0.3, sink=2.4)
    # And the land behind them all, going grey in the rain.
    backdrop_island(coll, "Headland 1", Vector((1500, -600, 0)), 900, 260, 1, far_mat)
    backdrop_island(coll, "Headland 2", Vector((2300, 500, 0)), 1400, 420, 2, far_mat)
    backdrop_island(coll, "Headland 3", Vector((900, 700, 0)), 450, 120, 3, far_mat)
    backdrop_island(coll, "Headland 4", Vector((3800, -1500, 0)), 1800, 600, 4, far_mat)


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
    L.new(st.outputs["Seconds"], tt.inputs[0]); tt.inputs[1].default_value = -14.0
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

    for key, img_name in (("corsairs", "flag-corsairs.png"), ("queens-fleet", "flag-queens-fleet.png")):
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
    L.new(k.outputs[0], k2.inputs[0]); k2.inputs[1].default_value = 1.3
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
    cramp.color_ramp.elements[0].position = 0.35
    cramp.color_ramp.elements[0].color = (1.5, 1.5, 1.5, 1)
    cramp.color_ramp.elements[1].position = 0.7
    cramp.color_ramp.elements[1].color = (0.3, 0.32, 0.35, 1)
    L.new(cl.outputs["Fac"], cramp.inputs[0])
    sky = N.new("ShaderNodeMix"); sky.data_type = "RGBA"; sky.blend_type = "MULTIPLY"
    sky.inputs[0].default_value = 1.0
    L.new(grad.outputs[0], sky.inputs[6]); L.new(cramp.outputs[0], sky.inputs[7])
    lit = N.new("ShaderNodeMix"); lit.data_type = "RGBA"; lit.blend_type = "ADD"
    L.new(gpow.outputs[0], lit.inputs[0])
    L.new(sky.outputs[2], lit.inputs[6])
    lit.inputs[7].default_value = (0.32, 0.30, 0.26, 1)
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
    pts = [Vector((2600, 900, 900))]
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


def build_camera(coll):
    cd = bpy.data.cameras.new("Camera")
    cd.lens = 26
    cd.sensor_width = 36
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = 5.6
    cam = link(bpy.data.objects.new("Camera", cd), coll)
    bpy.context.scene.camera = cam
    target = link(bpy.data.objects.new("Camera Target", None), coll)
    tr = cam.constraints.new("TRACK_TO")
    tr.target = target
    tr.track_axis = "TRACK_NEGATIVE_Z"
    tr.up_axis = "UP_Y"
    cd.dof.focus_object = target
    # A slow push in low over the water, drifting from the Corsair's bow
    # toward the gap between the ships, with a little hand-held float.
    keys = [(F_START, (-64, 9, 3.4), (2, 0, 7.0)),
            (F_END, (-50, 2, 4.4), (0, -5, 7.5))]
    for f, p, t in keys:
        cam.location = p
        target.location = t
        cam.keyframe_insert("location", frame=f)
        target.keyframe_insert("location", frame=f)
    for ob in (cam, target):
        for fc in _iter_fcurves(ob):
            for k in fc.keyframe_points:
                k.interpolation = "BEZIER"
                k.easing = "EASE_IN_OUT"
    for i in range(3):
        fc = next(fc for fc in _iter_fcurves(cam) if fc.data_path == "location" and fc.array_index == i)
        md = fc.modifiers.new("NOISE")
        md.scale = 40
        md.strength = (0.25, 0.25, 0.18)[i]
        md.phase = i * 17
    return cam


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
    sc.cycles.adaptive_threshold = 0.015
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 3
    sc.cycles.glossy_bounces = 4
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


# ---------------------------------------------------------------- main

def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--save", type=Path, default=BUILD / "hero-battle.blend")
    p.add_argument("--still", default="")
    p.add_argument("--render", action="store_true")
    p.add_argument("--frames", default="")
    p.add_argument("--pct", type=int, default=100)
    p.add_argument("--samples", type=int, default=128)
    p.add_argument("--out", type=Path, default=BUILD)
    p.add_argument("--weather", choices=sorted(WEATHERS), default="sunny")
    p.add_argument("--no-fx", action="store_true", help="Skip rain/shots (fast layout checks).")
    return p.parse_args(argv)


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
    rigs = {k: build_ship(k, M, coll) for k in SHIPS}
    animate_ships(rigs, near)
    build_flags(coll, rigs)
    build_terrain(coll)
    build_world()
    build_lights(coll)
    cam = build_camera(coll)
    if not a.no_fx:
        build_shots(coll, M, rigs, near)
        build_rain(coll, Vector((-57, 5, 0)))
        if W["lightning"]:
            lightning_bolt(coll)
    setup_render(a.samples, a.pct)

    a.save.parent.mkdir(parents=True, exist_ok=True)
    # Pack the flag textures so the .blend opens on any machine.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(a.save), compress=True)
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
        sc.render.filepath = str(a.out / f"frames-{a.weather}" / "hero_")
        bpy.ops.render.render(animation=True)


if __name__ == "__main__":
    main()
