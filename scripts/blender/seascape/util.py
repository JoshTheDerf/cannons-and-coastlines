import math

import bpy
import bmesh
from mathutils import Matrix, Vector

from .context import ctx


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
        o = import_stl(ctx.REPO / stl)
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


def iter_fcurves(idblock):
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


def linear_extrapolate(idblock):
    for fc in iter_fcurves(idblock):
        fc.extrapolation = "LINEAR"
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"


def alive_between(o, f_on, f_off):
    """Render `o` only from f_on to f_off. Cycles pre-evaluates every
    volume's density every frame, live or not, and ~100 smoke puffs doing
    that cost ~27 s a frame before a single sample was traced."""
    for f, hidden in ((ctx.F_START, True), (f_on, False), (f_off + 1, True)):
        o.hide_render = hidden
        o.keyframe_insert("hide_render", frame=max(ctx.F_START, f))
    for fc in iter_fcurves(o):
        if fc.data_path == "hide_render":
            for k in fc.keyframe_points:
                k.interpolation = "CONSTANT"


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


def deck_height(rig, x, y):
    """Hull-space deck height at (x, y): cast down onto the hull mesh."""
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new()
    bm.from_mesh(rig["hull"].data)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    hit = tree.ray_cast(Vector((x, y, 200)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else 20.0


def stage(label):
    """Progress line with this process's current memory, flushed at once so
    it survives the process being killed."""
    try:
        with open("/proc/self/status") as f:
            rss = next(int(l.split()[1]) for l in f if l.startswith("VmRSS")) // 1024
    except Exception:
        rss = -1
    print(f"[seascape] {label} (RSS {rss} MB)", flush=True)
