"""Hero cinematic: a Corsair and a Queen's Fleet ship trade shots at sea.

    blender -b --python scripts/blender/hero_battle.py -- [options]

    --weather W        sunny (default), sunrise, sunset, overcast, fog, storm
                       or night; see seascape/weather.py.
    --save PATH        Write the built scene to a .blend (default build/hero/hero-battle-<weather>.blend).
    --still F[,F..]    Render these frames as PNG stills into --out, then stop.
    --render           Render the whole animation as PNG frames into --out/frames-<weather>.
    --frames A-B       Limit --render to a frame range (for splitting a long render).
    --pct N            Resolution percentage of 1920x1080 (default 100).
    --samples N        Cycles samples (default 64).
    --out DIR          Output folder (default build/hero).

This file is only the battle: which ships, where they sail, the shots, the
cameras and the islands. The parts that suit any sea scene (ships built from
the kit, the ocean, weather and sky, lanterns, shots and splashes, render
settings) are in the seascape package next to it; see seascape/README.md.

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

The first build of each weather samples the sea under the ships (a few
minutes) and caches it in build/hero/; later builds reuse it.
"""

import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))

from seascape.context import ctx  # noqa: E402
from seascape.fx import (add_wakes_to_sea, ballistic_keys, build_bow_spray, build_rain, fx_source,  # noqa: E402
                         gn_keep_z, smoke_trail, splash, splinters, stage_shot, wake_origin)
from seascape.materials import build_materials, spray_material, terrain_material  # noqa: E402
from seascape.ocean import build_ocean, cached_samples, sample_ocean, sea_height_at  # noqa: E402
from seascape.runner import run  # noqa: E402
from seascape.ships import add_lanterns, build_flags, build_ship, deck_camera  # noqa: E402
from seascape.terrain import backdrop_island, place_piece  # noqa: E402
from seascape.util import deck_height, iter_fcurves, link, quick_eval, stage  # noqa: E402
from seascape.weather import build_fog_bank, build_lights, build_world, lightning_bolt  # noqa: E402


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DATA = ctx.DATA
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


# ---------------------------------------------------------------- ocean


def cached_ship_samples(near, frames, rigs):
    """Sea heights under the ships for every frame, cached on disk, keyed by
    everything in this scene that moves the ships (see cached_samples)."""
    key = [S, {k: [SHIPS[k]["pos"][:], SHIPS[k]["heading"], SHIPS[k]["speed"],
                   SHIPS[k].get("chase", False)] for k in rigs}, CHASE, SHOT_1["fire"], SHOT_3, CRIPPLE]
    return cached_samples(near, frames, lambda f: {k: ship_sample_points(k, f)[0] for k in rigs}, key)


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


# ---------------------------------------------------------------- the shots


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


def build_terrain(coll):
    green = terrain_material("Island Green", ctx.W["island"])
    stone = terrain_material("Rock Grey", (0.16, 0.16, 0.15, 1), rough=0.7)
    reef = terrain_material("Reef Coral", (0.55, 0.30, 0.32, 1), rough=0.6)
    far_mat = terrain_material("Headland", ctx.W["headland"], rough=0.9, wet_line=False)

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

# ---------------------------------------------------------------- sky, light, camera


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
        # Its lanterns too: one would sit right in front of the lens. Their
        # lights still fall on the deck in view.
        lanterns = [o for o in rig.get("lanterns", []) if o.type == "MESH"]
        for sail in rig.get("sails", []) + rig.get("masts", []) + rig.get("flags", []) + lanterns:
            for f, vis in ((F_START, True), (f_on, False), (f_off, True)):
                if f > F_END:
                    continue
                sail.visible_camera = vis
                sail.keyframe_insert("visible_camera", frame=f)
            for fc in iter_fcurves(sail):
                for k in fc.keyframe_points:
                    k.interpolation = "CONSTANT"
    sc.timeline_markers.new("Corsair fires", frame=F_START).camera = cam_a
    sc.timeline_markers.new("Queen's Fleet answers", frame=CUT).camera = cam_b
    return cam_a


# ---------------------------------------------------------------- main

def build(a, coll):
    W = ctx.W
    M = build_materials()
    near = build_ocean(coll, NEAR_C)
    stage("ocean")
    rigs = {k: build_ship(k, M, coll) for k in SHIPS}
    stage("ships")
    animate_ships(rigs, near)
    stage("ship motion")
    build_flags(coll, rigs)
    if W.get("lanterns"):
        for rig in rigs.values():
            add_lanterns(coll, rig, M)
    build_terrain(coll)
    build_world()
    build_lights(coll)
    build_fog_bank(coll, NEAR_C)
    build_camera(coll, rigs)
    stage("flags, lanterns, terrain, sky, cameras")
    if not a.no_fx:
        build_shots(coll, M, rigs, near)
        stage("shots, wakes, spray")
        if W["rain"]:
            build_rain(coll, Vector((12, 0, 0)))
        if W["lightning"]:
            lightning_bolt(coll)
        stage("rain")


def main():
    ctx.BUILD = BUILD
    ctx.S, ctx.FPS, ctx.F_START, ctx.F_END = S, FPS, F_START, F_END
    ctx.WIND, ctx.GUN_SCALE, ctx.LIGHTNING = WIND, GUN_SCALE, LIGHTNING
    ctx.SHIPS = SHIPS
    ctx.ship_base = ship_base
    run("hero-battle", build, frame_prefix="hero_")


if __name__ == "__main__":
    main()
