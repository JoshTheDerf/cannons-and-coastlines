"""Assembly: mast threaded bottom-first through the sail's 4 holes.

Sail STL bbox  : 50(X) x 68(Y) x 0.4(Z) -- a thin flat sheet (no built-in
                 billow; the curvature is added at import via a Lattice cage
                 deform, baked into the mesh data).
Mast STL bbox  : 100(X) x 5.5(Y) x 4.75(Z) -- a long pole, X is the long axis,
                 with a thin tapered tip at the +X end of the mesh.

Holes in the sail (mesh-local, post-centering):
    X ~= 0.25 (all four), Y in {-28, -1.5, 13, 27.5}, hole radius ~3mm.
Holes pierce the sail's thickness (Z direction) and lie on a vertical line in Y.

Pose:
    Sail rotated +90 deg around X so mesh-Y becomes world-Z (the holes line up
    along world-Z). Sail rest_location shifted by -0.25 in X so the hole
    centers sit on the world Z axis. After rotation, the lattice billow's
    +Z displacement (mesh) becomes a +Y bulge (world): the sail bows toward
    the camera as if catching wind.
    Mast rotated +90 deg around Y so mesh +X (the thin-tip end) maps to
    world -Z. With this, the *thick base* of the mast is world +Z (top),
    the thin tip is world -Z; descending the mast inserts the thick base
    bottom-first through the sail (and the thin tip ends up below).
    Wait -- the user wants the thick base to *be* the bottom of the mast in
    the final assembly. We achieve that by mapping mesh-+X (thin tip) to
    world-+Z (top): then world-+Z = thin tip = mast top, world-Z = thick
    base = mast bottom = the end that descends through the sail first. So
    the rotation is -90 around Y. (Mesh-+X -> world-+Z.)

Animation:
    Sail static (with baked billow). Mast starts above the sail with its
    bottom hovering just above the top hole, and descends to its assembled
    position threading through all four holes. Tail-hold to keep the final
    pose visible.
"""

from pathlib import Path
import sys

import bpy
import bmesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cc_anim import Part


REPO = Path(__file__).resolve().parents[3]
STL_DIR = REPO / "assets" / "stls" / "cannons-and-coastlines-base-set-0.3"

# Hole positions in the sail's centered mesh frame (before rotation).
SAIL_HOLES_Y = (-28.0, -1.5, 13.0, 27.5)

# Frame plan: sail static; mast descends frames 1..60; hold final pose to frame 80.
FRAME_END = 80


def billow_sail(objs):
    """Bow the sail with a Mesh-Deform cage whose Y rows sit exactly at the
    sail's hole positions and at the midpoints between them. Hole rows hold
    Z=0 so the hole rims (and therefore the mast's straight path) stay
    aligned, and midpoint rows are pushed in +Z to billow the surface.

    A smooth half-cosine ramp along U (sail X axis) keeps the hole-line
    column flat and bulges progressively toward the left/right edges, so the
    bulge is *vertically wavy* (peaks between holes, nodes at holes) and
    side-to-side curved (zero on hole-line, max at edges).

    The modifier is applied so the deformation is baked into mesh data and
    the subsequent rotation/animation pipeline sees a static deformed sail.
    """
    import math

    sail = next((o for o in objs if o.type == "MESH"), None)
    if sail is None:
        return

    # The STL ships at low triangle density between holes -- straight mesh-
    # deform on it gives a faceted, polygonal billow. Apply a Simple
    # subsurf first to add interior verts without changing the silhouette
    # (Simple subdivides each face into a grid; Catmull-Clark would round
    # off the holes and outer edges, which we don't want).
    bpy.context.view_layer.objects.active = sail
    bpy.ops.object.select_all(action="DESELECT")
    sail.select_set(True)
    sub = sail.modifiers.new("Densify", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = 3
    sub.render_levels = 3
    bpy.ops.object.modifier_apply(modifier="Densify")


    # Build the cage mesh: a thin solid box subdivided in Y at hole rows and
    # midpoints, in X at five columns (edges, half-edges, hole-line), in Z at
    # the two thin faces.
    holes = sorted(SAIL_HOLES_Y)
    # Y rows: sail bottom, holes interleaved with midpoints, sail top.
    # The first/last rows are padded *outside* the sail bbox so every sail
    # vertex (including the top/bottom edge ones) lies strictly *inside* the
    # cage volume -- Mesh Deform fails silently for vertices on the cage
    # boundary.
    y_rows = [-36.0]
    for i, hy in enumerate(holes):
        y_rows.append(hy)
        if i + 1 < len(holes):
            y_rows.append(0.5 * (hy + holes[i + 1]))
    y_rows.append(36.0)
    # X columns padded outside the sail's X range for the same reason.
    x_cols = [-27.0, -13.5, 0.25, 13.5, 27.0]
    z_layers = [-1.5, 1.5]   # cage Z padding around the sail's 0.4mm thickness

    bm = bmesh.new()
    grid = {}   # (u, v, w) -> BMVert
    for w_idx, z in enumerate(z_layers):
        for v_idx, y in enumerate(y_rows):
            for u_idx, x in enumerate(x_cols):
                grid[(u_idx, v_idx, w_idx)] = bm.verts.new((x, y, z))

    nU, nV, nW = len(x_cols), len(y_rows), len(z_layers)

    def quad(a, b, c, d, flip=False):
        verts = [a, b, c, d]
        if flip:
            verts = list(reversed(verts))
        try:
            bm.faces.new(verts)
        except ValueError:
            pass

    # Top (+Z) and bottom (-Z) faces.
    for w_idx, flip in ((0, True), (nW - 1, False)):
        for v_idx in range(nV - 1):
            for u_idx in range(nU - 1):
                quad(
                    grid[(u_idx,     v_idx,     w_idx)],
                    grid[(u_idx + 1, v_idx,     w_idx)],
                    grid[(u_idx + 1, v_idx + 1, w_idx)],
                    grid[(u_idx,     v_idx + 1, w_idx)],
                    flip=flip,
                )
    # +X side and -X side.
    for u_idx, flip in ((nU - 1, False), (0, True)):
        for v_idx in range(nV - 1):
            quad(
                grid[(u_idx, v_idx,     0)],
                grid[(u_idx, v_idx + 1, 0)],
                grid[(u_idx, v_idx + 1, nW - 1)],
                grid[(u_idx, v_idx,     nW - 1)],
                flip=flip,
            )
    # +Y side and -Y side.
    for v_idx, flip in ((nV - 1, True), (0, False)):
        for u_idx in range(nU - 1):
            quad(
                grid[(u_idx,     v_idx, 0)],
                grid[(u_idx + 1, v_idx, 0)],
                grid[(u_idx + 1, v_idx, nW - 1)],
                grid[(u_idx,     v_idx, nW - 1)],
                flip=flip,
            )

    me = bpy.data.meshes.new("sail_billow_cage_mesh")
    bm.to_mesh(me)
    bm.free()
    cage = bpy.data.objects.new("sail_billow_cage", me)
    bpy.context.scene.collection.objects.link(cage)

    # Mesh Deform records the cage's *bound* pose as the rest pose, then
    # deforms the target as the cage moves away from that rest pose. So we
    # bind first (cage in undeformed rest) and only then displace cage
    # vertices.
    bpy.context.view_layer.objects.active = sail
    bpy.ops.object.select_all(action="DESELECT")
    sail.select_set(True)
    mod = sail.modifiers.new("Billow", "MESH_DEFORM")
    mod.object = cage
    mod.precision = 5
    bpy.ops.object.meshdeform_bind(modifier="Billow")

    # Drive a continuous vertical wave along Y, modulated by an X-arc so the
    # bulge is anchored along the hole-line column (X=0.25) and grows toward
    # the sail's left/right edges. Every cage row participates (including
    # hole rows), so each hole's rim tilts with the wave -- the holes
    # *deform* with the sail rather than reading as flat circles cut out of
    # an otherwise wavy surface.
    #
    # Wave: zeros at hole Y positions for the upper three holes (spaced
    # 14.5mm apart), peaks at the midpoints between them. The lower hole
    # (at y=-28) is one full period off and lands near another zero.
    amp = 8.0
    half_x = 25.0
    period = 29.0          # 2 * upper-hole spacing -> nodes at the upper holes
    phase = 1.5            # shifts node onto y=-1.5 (the second hole)
    cage_verts = cage.data.vertices
    for w_idx in range(nW):
        for v_idx, y in enumerate(y_rows):
            # Anchor sail top/bottom edges so the surface doesn't flap off
            # the bbox; all interior rows ride the wave.
            if v_idx == 0 or v_idx == nV - 1:
                continue
            wave = math.sin(2.0 * math.pi * (y + phase) / period)
            for u_idx, x in enumerate(x_cols):
                # X-arc: 0 on the hole-line, smooth ramp up to 1 at the sail
                # edges. Holes' centers (X near 0.25) therefore stay on the
                # mast axis even though their rims tilt with `wave`.
                t = min(abs(x - 0.25) / half_x, 1.0)
                arc = 0.5 * (1.0 - math.cos(math.pi * t))
                idx = w_idx * (nU * nV) + v_idx * nU + u_idx
                cage_verts[idx].co.z += amp * wave * arc
    cage.data.update()
    cage.update_tag()

    # Bake deformation into the sail's mesh data, then discard the cage.
    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = sail
    bpy.ops.object.select_all(action="DESELECT")
    sail.select_set(True)

    bpy.ops.object.modifier_apply(modifier="Billow")
    bpy.data.objects.remove(cage, do_unlink=True)


# --- Parts ------------------------------------------------------------------

SAIL = Part(
    stl="sail.stl",
    material="white",
    # Shift -0.25 in X so the hole centers (mesh X=0.25) sit on the world Z axis
    # after the +90 deg rotation around X.
    rest_location=(-0.25, 0.0, 0.0),
    rest_rotation_deg=(90.0, 0.0, 0.0),  # mesh-Y -> world-Z (vertical hole line)
    start_frame=1,
    end_frame=1,                         # static
    shade_smooth=False,
    mesh_modifier=billow_sail,
)

MAST = Part(
    stl="mast.stl",
    material="grey",
    rest_location=(0.0, 0.0, 0.0),
    # Flip mast end-for-end (vs the previous -90): mesh +X end -> world -Z
    # so the *thick base* is at world +Z (top) and the thin tip is at world
    # -Z. The mast descends bottom-first through the sail.
    rest_rotation_deg=(0.0, 90.0, 0.0),
    keyframes=[
        # Mast spans world Z = -50..+50 at rest. Lift it so its bottom (z=-50)
        # hovers just above the top hole (z=+27.5) at frame 1, then descend
        # to rest by frame 60. Tail-hold to frame 80.
        (1,  (0.0, 0.0, 82.5), (0.0, 0.0, 0.0)),
        (60, (0.0, 0.0,  0.0), (0.0, 0.0, 0.0)),
        (FRAME_END, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ],
    shade_smooth=True,
)


ASSEMBLY = {
    "name": "sail-onto-mast",
    "stl_dir": str(STL_DIR),
    "frames": (1, FRAME_END),
    "elevation": 20.0,
    "azimuth": 30.0,
    "ortho_margin": 1.20,
    "parts": [SAIL, MAST],
}
