import math

import bpy
from mathutils import Matrix, Vector

from .context import ctx
from .util import bsdf_of, deck_height, import_stl, iter_fcurves, link, new_material, nodes, part_object, place_matrix, recalc_normals, set_object_material, setin


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
    ship = ctx.DATA["ships"][ctx.SHIPS[key].get("model", key)]
    parts = ctx.DATA["parts"]
    root = link(bpy.data.objects.new(f"{key}-root", None), coll)
    root.scale = (ctx.S, ctx.S, ctx.S)
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
    xs = [v.co.x for v in rig["hull"].data.vertices]
    ctx.SHIPS[key].setdefault("_half_length_mm", (max(xs) - min(xs)) / 2)

    masts = [p for p in ship["placements"] if p["part"].startswith("mast")]
    cannon_spec = ctx.SHIPS[key]["cannon"]
    for i, p in enumerate(ship["placements"]):
        part = parts[p["part"]]
        stl = part.get("source") or f"assets/stls/base-set/{p['part']}.stl"
        color = p["color"]
        if part.get("sail"):
            mast = masts[p.get("onMast", 0)]
            o = import_stl(ctx.REPO / f"assets/stls/base-set/{p['part']}.stl")
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
                         ctx.GUN_SCALE if p["part"] == "cannon" else 1.0)
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
        img_name = f"flag-{ctx.SHIPS[key].get('model', key)}.png"
        path = ctx.FLAG_DIR / img_name
        if not path.exists():
            print(f"[seascape] no {path}, skipping {key} flag")
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
        yaw = math.degrees(math.atan2(ctx.WIND.y, ctx.WIND.x))
        # Every mast flies the faction's flag, 26 mm long at the masthead,
        # streaming downwind. A fore flag a touch smaller, as on a real rig.
        for mi, top in enumerate(rig["mast_tops"]):
            o = link(bpy.data.objects.new(f"{key}-flag{mi}", me), coll)
            rig.setdefault("flags", []).append(o)
            mod = o.modifiers.new("Wave", "NODES"); mod.node_group = ng
            o.parent = rig["root"]
            size = 26.0 if mi == len(rig["mast_tops"]) - 1 else 22.0
            o.matrix_basis = (Matrix.Translation(top - Vector((0, 0, size * aspect * 0.5 + 1.0)))
                              @ Matrix.Rotation(math.radians(yaw - ctx.SHIPS[key]["heading"] + mi * 7), 4, "Z")
                              @ Matrix.Scale(size, 4))


def deck_camera(coll, name, rig, other, lens):
    """A camera standing on `rig`'s deck (eye height ~1.75 m) and riding its
    motion, kept level and aimed at the other ship, with a little hand-held
    float."""
    x, y, h, *mode = ctx.SHIPS[rig["key"]]["deck_cam"]
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
    cam.scale = (1 / ctx.S, 1 / ctx.S, 1 / ctx.S)   # cancel the model scale of the parent
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
    for f in (ctx.F_START, ctx.F_END):
        target.keyframe_insert("location", frame=f)
    for fc in iter_fcurves(target):
        md = fc.modifiers.new("NOISE")
        md.scale = 30
        md.strength = (1.2, 1.2, 0.8)[fc.array_index] / ctx.S * 0.25
        md.phase = fc.array_index * 11 + len(name)
    return cam


# ---------------------------------------------------------------- lanterns

LANTERN_COLOR = (1.0, 0.52, 0.18)   # oil flame, ~1900 K


def lantern_spots(rig):
    """Where a ship carries its lanterns, in hull mm: a pair on the stern
    rail, one at the bow and one on each side amidships. Read off the hull
    itself (the bow is -X), so any hull in the kit gets sensible spots."""
    vs = rig["hull"].data.vertices
    xs = [v.co.x for v in vs]
    xmin, xmax = min(xs), max(xs)
    length = xmax - xmin

    def half_beam(x, band=3.0):
        ys = [abs(v.co.y) for v in vs if abs(v.co.x - x) < band]
        return max(ys) if ys else length * 0.1

    spots = []
    xs_ = xmax - length * 0.04
    hb = half_beam(xs_)
    for side in (-1, 1):
        spots.append(("stern", Vector((xs_, side * hb * 0.7, 0))))
    xb = xmin + length * 0.1
    spots.append(("bow", Vector((xb, 0.0, 0))))
    xm = xmin + length * 0.55
    hm = half_beam(xm)
    for side in (-1, 1):
        spots.append(("rail", Vector((xm, side * hm * 0.8, 0))))
    for _, p in spots:
        p.z = deck_height(rig, p.x, p.y)
    return spots


def lantern_mesh():
    """A small ship's lantern, in model mm: a square glass box with a
    pyramid cap and a ring on top, on a short post. Returns (frame, glass)."""
    import bmesh
    if "lantern-frame" in bpy.data.meshes:
        return bpy.data.meshes["lantern-frame"], bpy.data.meshes["lantern-glass"]
    w, h, post = 1.6, 2.2, 1.6
    bm = bmesh.new()
    # Post.
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.2, radius2=0.2, depth=post,
                          matrix=Matrix.Translation((0, 0, post / 2)))
    # Base and cap plates.
    for z, s in ((post + 0.12, 1.15), (post + h + 0.12, 1.15)):
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, z)) @ Matrix.Diagonal((w * s, w * s, 0.24, 1)))
    # Pyramid roof and ring.
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=w * 0.78, radius2=0.1, depth=0.8,
                          matrix=Matrix.Translation((0, 0, post + h + 0.64)) @ Matrix.Rotation(math.pi / 4, 4, "Z"))
    bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=0.35, radius2=0.35, depth=0.15,
                          matrix=Matrix.Translation((0, 0, post + h + 1.2)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    # Corner posts.
    for sx in (-1, 1):
        for sy in (-1, 1):
            bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(
                (sx * w * 0.5, sy * w * 0.5, post + 0.12 + h / 2)) @ Matrix.Diagonal((0.22, 0.22, h, 1)))
    frame = bpy.data.meshes.new("lantern-frame")
    bm.to_mesh(frame)
    bm.free()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, post + 0.12 + h / 2))
                          @ Matrix.Diagonal((w * 0.94, w * 0.94, h * 0.96, 1)))
    glass = bpy.data.meshes.new("lantern-glass")
    bm.to_mesh(glass)
    bm.free()
    return frame, glass


def lantern_glass_material():
    if "Lantern Glass" in bpy.data.materials:
        return bpy.data.materials["Lantern Glass"]
    m = new_material("Lantern Glass")
    nt, N, L = nodes(m)
    N.remove(N["Principled BSDF"])
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*LANTERN_COLOR, 1)
    em.inputs["Strength"].default_value = ctx.W.get("lantern_glow", 12.0)
    L.new(em.outputs[0], N["Material Output"].inputs["Surface"])
    return m


def add_lanterns(coll, rig, M, spots=None, energy=None, seed=0):
    """Hang lit lanterns on a ship: a black-PLA lantern at each spot (see
    lantern_spots) with glowing glass and a warm point light inside, parented
    to the ship so they ride with it. The light falls on the deck, the sails
    and the sea around the hull, and each lamp flickers a little.

    energy: watts per lamp (default ctx.W["lantern_energy"], else 60)."""
    import random
    rnd = random.Random(seed + len(rig["key"]))
    energy = energy if energy is not None else ctx.W.get("lantern_energy", 60.0)
    frame_me, glass_me = lantern_mesh()
    glass_mat = lantern_glass_material()
    if not frame_me.materials:
        frame_me.materials.append(M["black"])
        glass_me.materials.append(glass_mat)
    spots = spots if spots is not None else lantern_spots(rig)
    out = []
    for i, (kind, p) in enumerate(spots):
        name = f"{rig['key']}-lantern-{kind}{i}"
        fo = link(bpy.data.objects.new(name, frame_me), coll)
        go = link(bpy.data.objects.new(name + "-glass", glass_me), coll)
        # Light passes through the glass: it only glows, it casts no shadow.
        go.visible_shadow = False
        ld = bpy.data.lights.new(name + "-light", "POINT")
        ld.color = LANTERN_COLOR
        ld.shadow_soft_size = 0.12
        lo = link(bpy.data.objects.new(name + "-light", ld), coll)
        for o in (fo, go, lo):
            o.parent = rig["root"]
        fo.location = go.location = p
        lo.location = p + Vector((0, 0, 1.6 + 0.12 + 1.1))
        # A slow, uneven flicker: a few percent, never a strobe.
        base = energy * (0.9 if kind == "rail" else 1.0)
        for f in range(ctx.F_START - 1, ctx.F_END + 2, 3):
            ld.energy = base * (1.0 + rnd.uniform(-0.08, 0.08))
            ld.keyframe_insert("energy", frame=f)
        rig.setdefault("lanterns", []).extend([fo, go, lo])
        out.append((fo, go, lo))
    return out
