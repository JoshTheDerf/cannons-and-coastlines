import math
import random

import bpy
import bmesh
from mathutils import Matrix, Vector

from .context import ctx
from .materials import emissive, volume_material
from .util import alive_between, find_bore, link, new_material, nodes, part_object, quick_eval


G = 9.81


def half_length_mm(key):
    """Half a hull's length in model mm, for where its bow and transom are:
    the ship spec's "half_length_mm", else the hull as built (build_ship
    records it), else the base-set frigates' 58."""
    spec = ctx.SHIPS[key]
    return spec.get("half_length_mm", spec.get("_half_length_mm", 58.0))


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
    t = math_("DIVIDE", math_("SUBTRACT", st.outputs["Frame"], attr("birth")), ctx.FPS)
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
    L.new(t, old.inputs[0]); old.inputs[1].default_value = life / ctx.FPS
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
        k = math_("SUBTRACT", 1.0, math_("DIVIDE", t, life / ctx.FPS))
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
        vel.append((math.cos(a) * out + ctx.WIND.x * 1.5, math.sin(a) * out + ctx.WIND.y * 1.5, up))
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
    em.inputs["Strength"].default_value = ctx.W["rain_glow"] * 4
    tr = N.new("ShaderNodeBsdfTransparent")
    mix = N.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = ctx.W["rain_alpha"]
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], N["Material Output"].inputs["Surface"])
    streak = fx_source("rain-streak", coll, "streak", m, size=0.55)

    fall = Vector((ctx.WIND.x * 0.28, ctx.WIND.y * 0.28, -1.0)).normalized()
    speed = 9.0
    # Both deck cameras sit inside this box for the whole shot.
    lo = cam_path_center + Vector((-35, -35, -2))
    hi = cam_path_center + Vector((50, 35, 30))
    rnd = random.Random(11)
    n = ctx.W["rain"]
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
    base, h = ctx.ship_base(key, frame)
    x, y = local
    return Vector((base.x + x * math.cos(h) - y * math.sin(h), base.y + x * math.sin(h) + y * math.cos(h)))


WAKE_LENGTH, WAKE_HALF0 = 70.0, 3.5


def wake_origin(coll, key):
    """An empty riding each ship's transom (no heave), +X pointing astern.
    The sea shader draws that ship's wake in this empty's space."""
    o = link(bpy.data.objects.new(f"{key}-wake-origin", None), coll)
    for f in range(ctx.F_START, ctx.F_END + 2, 2):
        _, h = ctx.ship_base(key, f)
        o.location = (*ship_frame_xy(key, f, (half_length_mm(key) * ctx.S, 0.0)), 0.0)
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
    speed = ctx.SHIPS[key]["speed"]
    bow = -half_length_mm(key) * ctx.S
    for i in range(n):
        f = rnd.uniform(ctx.F_START - 20, ctx.F_END)
        # Gusty: more spray when the bow meets a crest.
        if rnd.random() > 0.55 + 0.45 * math.sin(f * 0.21 + seed):
            continue
        side = rnd.choice((-1, 1))
        p = ship_frame_xy(key, f, (bow + rnd.uniform(0, 5), side * rnd.uniform(0.3, 2.5)))
        _, h = ctx.ship_base(key, f)
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


def muzzle_flash(coll, name, origin, direction, frame, seed=0):
    """The gun going off: a short burst of flame out of the muzzle (glowing
    volume, flaring and gone in four frames), a spray of sparks, and a
    flash of light on the deck and water."""
    rnd = random.Random(seed)
    fire = volume_material(f"{name}-fire", (0.2, 0.15, 0.12, 1), 0.5,
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
        _trail_mat = volume_material("ball-trail", ctx.W["smoke"], 2.2)
    b = f0 + 0.5
    k = 0
    while b < f1:
        t = (b - f0) / ctx.FPS
        p = p0 + v * t + Vector((0, 0, -0.5 * G * t * t))
        vel = v + Vector((0, 0, -G * t))
        spacing = vel.length * 0.5 / ctx.FPS
        # Puffs appear where the ball was up to half a frame ago; push each
        # forward by that lag plus the ball's radius so the streak starts
        # at the ball's leading face, not a metre behind it.
        ball_r = 5.0 * ctx.S * ctx.GUN_SCALE
        p = p + vel.normalized() * (ball_r + spacing)
        o = _puff(coll, f"{name}-trail{k:02d}", _trail_mat)
        o.rotation_euler = Vector((1, 0, 0)).rotation_difference(vel.normalized()).to_euler()
        born = math.ceil(b)
        for f, (sx, sr), c in ((born - 1, (0.001, 0.001), 0.0), (born, (spacing * 0.9, 0.3), 1.0),
                               (born + 8, (spacing * 1.1, 0.6), 0.6), (born + 20, (spacing * 1.3, 1.0), 0.3),
                               (born + 36, (spacing * 1.5, 1.4), 0.0)):
            o.scale = (sx, sr, sr)
            o.location = p + (ctx.WIND * 1.2 + Vector((0, 0, 0.35))) * max(0, f - b) / ctx.FPS
            o.color = (c, 0, 0, 1)
            o.keyframe_insert("scale", frame=f)
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("color", frame=f)
        alive_between(o, born - 1, born + 36)
        b += 0.5
        k += 1


def ballistic_keys(obj, p0, p1, f0, f1, spin_axis, f_end=None):
    T = (f1 - f0) / ctx.FPS
    v = (p1 - p0 - Vector((0, 0, -0.5 * G * T * T))) / T
    for f in range(f0, f1 + 1):
        t = (f - f0) / ctx.FPS
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
    o.scale = (ctx.S * ctx.GUN_SCALE,) * 3
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
    T = (f1 - f0) / ctx.FPS
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
    print(f"[seascape] {cannon.name} trained {math.degrees(yaw):.1f} deg yaw, "
          f"{math.degrees(pitch):.1f} deg elevation over frames {frames[0]}-{frames[1]}", flush=True)
    return basis


def stage_shot(coll, M, rigs, shot, target_fn, name, drop_obj, shard_obj, near, loaded_from=ctx.F_START,
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

    if loaded_from > ctx.F_START:
        # Reloaded: this ball only goes in once the last one is away.
        alive_between(ball, loaded_from, ctx.F_END + 1)
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
