import math

import bpy
import numpy as np

from .context import ctx
from .util import bsdf_of, linear_extrapolate, link, new_material, nodes, setin


def ocean_modifier(obj, size, res, repeat=1, seed=7):
    m = obj.modifiers.new("Ocean", "OCEAN")
    m.geometry_mode = "GENERATE"
    m.spatial_size = size
    m.resolution = res
    m.viewport_resolution = res
    m.repeat_x = m.repeat_y = repeat
    m.random_seed = seed
    m.wind_velocity = ctx.W["wind"]
    m.wave_scale = ctx.W["wave_scale"]
    m.wave_scale_min = 0.01
    m.choppiness = ctx.W["chop"]
    m.wave_alignment = 0.35
    m.wave_direction = math.atan2(ctx.WIND.y, ctx.WIND.x)
    m.damping = 0.5
    m.depth = 200
    m.spectrum = "PHILLIPS"
    m.use_normals = True
    m.use_foam = True
    m.foam_layer_name = "foam"
    m.foam_coverage = ctx.W["foam"]
    m.time = 0.0
    m.keyframe_insert("time", frame=0)
    m.time = 1.0
    m.keyframe_insert("time", frame=ctx.FPS)
    fc = obj.animation_data.action.fcurves if hasattr(obj.animation_data.action, "fcurves") else None
    linear_extrapolate(obj)
    return m


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
    body.inputs[6].default_value = ctx.W["sea_deep"]
    body.inputs[7].default_value = ctx.W["sea_crest"]
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
    t.outputs[0].keyframe_insert("default_value", frame=ctx.FPS)
    L.new(t.outputs[0], ripple.inputs["W"])
    vor = N.new("ShaderNodeTexVoronoi"); vor.voronoi_dimensions = "4D"
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = 1.2
    L.new(tc.outputs["Object"], vor.inputs["Vector"])
    t2 = N.new("ShaderNodeValue")
    t2.outputs[0].default_value = 0.0
    t2.outputs[0].keyframe_insert("default_value", frame=0)
    t2.outputs[0].default_value = 4.0
    t2.outputs[0].keyframe_insert("default_value", frame=ctx.FPS)
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
        linear_extrapolate(m.node_tree)
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


def build_ocean(coll, centre):
    """One FFT ocean, tiled. The simulated patch is periodic, so its copies
    join without a seam (separate patches of different sizes did not, and
    showed as steps in the water). The 3x3 tiles are centred on the
    action; the waves fade flat toward the edge, where a flat plane at the
    same level carries the sea to the horizon on shader ripples alone."""
    mat = water_material()
    me = bpy.data.meshes.new("ocean")
    near = link(bpy.data.objects.new("Ocean Near", me), coll)
    # Tiles run +X/+Y from the first; put the middle one over `centre`.
    half = OCEAN_TILE * (OCEAN_REPEAT - 1) / 2
    near.location = (centre.x - half, centre.y - half, 0)
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
    cx, cy = centre.x, centre.y
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
    actually is). points_fn(frame) -> {ship: [(x, y), ...]} in world XY.

    Fast path: the FFT patch is periodic, so only one tile is generated
    (not the 3x3 repeat), sample points are wrapped into it, and the Fade
    modifier is replaced by the same smoothstep applied here. Everything
    else in the scene has its modifiers off, and foam and normals too,
    since none of them move the surface."""
    sc = bpy.context.scene
    mod = near.modifiers["Ocean"]
    fade_mod = near.modifiers.get("Fade")
    half = OCEAN_TILE * (OCEAN_REPEAT - 1) / 2
    loc = np.array(near.location)
    centre = loc[:2] + half           # where Fade centres (the ocean centre)
    r0, r1 = OCEAN_FADE
    T = float(OCEAN_TILE)
    saved = [(m, m.show_viewport) for o in bpy.data.objects if o is not near for m in o.modifiers]
    saved_mod = (mod.repeat_x, mod.repeat_y, mod.use_foam, mod.use_normals)
    saved_fade = fade_mod.show_viewport if fade_mod else None
    for m, _ in saved:
        m.show_viewport = False
    mod.repeat_x = mod.repeat_y = 1
    mod.use_foam = mod.use_normals = False
    if fade_mod:
        fade_mod.show_viewport = False

    def wrap(d):
        return (d + T / 2) % T - T / 2

    out = {}
    try:
        for f in frames:
            sc.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            ev = near.evaluated_get(dg)
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3, dtype=np.float32)
            me.vertices.foreach_get("co", co)
            ev.to_mesh_clear()
            co = co.reshape(-1, 3).astype(np.float64)
            res = {}
            for key, pts in points_fn(f).items():
                hs = []
                for x, y in pts:
                    # Query point in the tile's local frame, wrapped modulo
                    # the tile, against vertices by the same wrapped offset.
                    dx = wrap(co[:, 0] - (x - loc[0]))
                    dy = wrap(co[:, 1] - (y - loc[1]))
                    sel = (np.abs(dx) < 1.2) & (np.abs(dy) < 1.2)
                    if not sel.any():
                        hs.append(0.0)
                        continue
                    d2 = dx[sel] ** 2 + dy[sel] ** 2
                    w = 1.0 / (d2 + 0.05)
                    z = float((co[sel, 2] * w).sum() / w.sum())
                    t = min(max((math.hypot(x - centre[0], y - centre[1]) - r0) / (r1 - r0), 0.0), 1.0)
                    hs.append(z * (1.0 - t * t * (3 - 2 * t)))
                res[key] = hs
            out[f] = res
    finally:
        mod.repeat_x, mod.repeat_y, mod.use_foam, mod.use_normals = saved_mod
        if fade_mod:
            fade_mod.show_viewport = saved_fade
        for m, v in saved:
            m.show_viewport = v
    return out


def cached_samples(near, frames, points_fn, key_data, label="the ships"):
    """sample_ocean() for every frame in `frames`, sampled every other frame
    and linearly filled in between (the ships low-pass the heights anyway).
    Evaluating the FFT ocean is the slow part of building a scene, so the
    result is kept on disk under ctx.BUILD, keyed by the ocean's settings,
    the frame range and `key_data`: pass everything in the scene that moves
    the sample points (ship specs, timings), as JSON-able values."""
    import hashlib
    import json
    import time
    mod = near.modifiers["Ocean"]
    key = json.dumps([[getattr(mod, a) for a in ("spatial_size", "resolution", "random_seed",
                      "wind_velocity", "wave_scale", "choppiness", "wave_alignment",
                      "wave_direction", "damping", "depth")], list(near.location),
                      frames[0], frames[-1], *key_data], default=float)
    path = ctx.BUILD / f"ocean-samples-{hashlib.sha1(key.encode()).hexdigest()[:12]}.json"
    if path.exists():
        raw = json.loads(path.read_text())
        return {int(f): v for f, v in raw.items()}
    t0 = time.time()
    coarse = frames[::2] + ([frames[-1]] if (len(frames) - 1) % 2 else [])
    got = sample_ocean(near, coarse, points_fn)
    out = {}
    for f in frames:
        if f in got:
            out[f] = got[f]
            continue
        a, b = f - 1, f + 1
        out[f] = {k: [(x + y) / 2 for x, y in zip(got[a][k], got[b][k])] for k in got[a]}
    ctx.BUILD.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    print(f"[seascape] sampled the sea under {label} in {time.time() - t0:.0f}s -> {path.name}")
    return out


def sea_height_at(near, frame, x, y):
    return sample_ocean(near, [frame], lambda f: {"p": [(x, y)]})[frame]["p"][0]


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
        d = ctx.BUILD / f"ocean-bake-{weather}" / name.split()[-1].lower()
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
        print(f"[seascape] baked {name} frames {f0}-{f1 + 1}; check at {probe_f}: {err:.4f} m")
        if err > 0.02:
            raise SystemExit(f"[seascape] baked {name} disagrees with the live ocean by {err:.3f} m; "
                             "the ships would not ride these waves. Not rendering.")
