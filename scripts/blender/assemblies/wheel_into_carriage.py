"""Assembly: rubber band slides onto wheel, then wheel slides up into carriage.

Coordinate notes:
- Both STLs sit on Z>=0 in their natural pose (slicer bed origin).
- After cc_anim.import_part recenters each part, the bbox center is at the
  origin and the part can be posed by `rest_location` / `rest_rotation_deg`.

Carriage natural bbox: 20(X) x 14(Y) x 13(Z), open-top in +Z.
Wheel natural bbox:    15(X) x 12.5(Y) x 10(Z), axle-hole through Z.

After centering + 90 deg X rotation, the wheel sits in world coords:
    X: -7.5..+7.5    (rolling direction)
    Y: -5..+5        (axle direction)
    Z: -6.25..+6.25  (vertical: arc top at +6.25, flat chord at -6.25)
    Cylinder body: center axis along Y, passing through (X=0, Z=-1.25),
                   radius 7.5; chord 5mm below center (the printed flat).

Animation:
    Frames  1-30: rubber band slides on from +Y to centered on wheel
                  (wheel parked below the carriage at Z=-25).
    Frames 30-60: wheel + band slide up together into the carriage interior.
"""

from pathlib import Path
import math
import sys

# The runner imports cc_anim before us; reuse that path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cc_anim import Part

import bpy
import bmesh


REPO = Path(__file__).resolve().parents[3]
STL_DIR = REPO / "assets" / "stls" / "cannons-and-coastlines-base-set-0.3"


# Wheel-after-rotation geometry constants. Hand-keep these in sync with the
# wheel STL bbox if the part is ever re-modeled.
WHEEL_R = 7.5
WHEEL_CYL_CENTER_Z = -1.25
WHEEL_CHORD_Z = -6.25       # flat printed bottom (in world Z, after rotation)
WHEEL_AXLE_HALFLEN = 5.0    # wheel half-thickness along Y


def make_rubber_band():
    """Procedural rubber-band mesh tracing the wheel's D-shaped silhouette
    (arc + flat chord). Origin at wheel center; band lies in XZ with width
    along Y so it can slide on along the +Y axis to seat over the wheel."""
    R = WHEEL_R
    center_z = WHEEL_CYL_CENTER_Z
    chord_z = WHEEL_CHORD_Z
    band_width = 3.0           # extent along Y (wheel axle direction)
    band_thickness = 0.9       # radial extent (sticks out from wheel surface)
    # Slight air gap so the band visibly sits on the wheel rather than coplanar.
    inner_gap = 0.05
    arc_segments = 64
    chord_segments = 12

    # Build the D-shape outline as (x, z, nx, nz) -- inner contour + outward normal.
    chord_offset = chord_z - center_z       # negative (chord is below center)
    chord_half = math.sqrt(R**2 - chord_offset**2)
    theta_start = math.atan2(chord_offset, chord_half)  # right chord endpoint angle
    theta_end = math.pi - theta_start                   # left chord endpoint angle

    outline = []
    for i in range(arc_segments + 1):
        t = theta_start + (theta_end - theta_start) * i / arc_segments
        x = R * math.cos(t)
        z = center_z + R * math.sin(t)
        outline.append((x, z, math.cos(t), math.sin(t)))   # radial outward normal

    # Chord: traverse left→right (interior points only -- arc endpoints already cover the corners).
    for i in range(1, chord_segments):
        f = i / chord_segments
        x = -chord_half + 2 * chord_half * f
        outline.append((x, chord_z, 0.0, -1.0))            # chord normal points -Z

    # Average the corner normals (arc-end ↔ chord) so the bevel doesn't
    # split open at the transition.
    def _avg(n1, n2):
        ax, az = n1[0] + n2[0], n1[1] + n2[1]
        L = math.hypot(ax, az) or 1.0
        return (ax / L, az / L)
    right_arc_n = (math.cos(theta_start), math.sin(theta_start))
    left_arc_n = (math.cos(theta_end), math.sin(theta_end))
    rcn = _avg(right_arc_n, (0.0, -1.0))
    lcn = _avg(left_arc_n, (0.0, -1.0))
    outline[0] = (outline[0][0], outline[0][1], rcn[0], rcn[1])
    outline[arc_segments] = (outline[arc_segments][0], outline[arc_segments][1], lcn[0], lcn[1])

    bm = bmesh.new()
    half_w = band_width / 2.0
    rings = []
    for (x, z, nx, nz) in outline:
        ix = x + nx * inner_gap
        iz = z + nz * inner_gap
        ox = x + nx * (inner_gap + band_thickness)
        oz = z + nz * (inner_gap + band_thickness)
        # Per-ring vertex order: in-(-Y), in-(+Y), out-(+Y), out-(-Y)
        v0 = bm.verts.new((ix, -half_w, iz))
        v1 = bm.verts.new((ix,  half_w, iz))
        v2 = bm.verts.new((ox,  half_w, oz))
        v3 = bm.verts.new((ox, -half_w, oz))
        rings.append([v0, v1, v2, v3])

    # Quad faces between adjacent rings. Loop closure: connect last back to first.
    n = len(rings)
    for i in range(n):
        a = rings[i]
        b = rings[(i + 1) % n]
        for k in range(4):
            try:
                bm.faces.new([a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]])
            except ValueError:
                pass  # face already exists

    bm.normal_update()
    me = bpy.data.meshes.new("rubber_band_mesh")
    bm.to_mesh(me)
    bm.free()

    obj = bpy.data.objects.new("rubber_band", me)
    bpy.context.scene.collection.objects.link(obj)
    # Smooth-shade the curved portion -- a faceted band reads as a polygon hoop,
    # not as rubber.
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return [obj]


# --- Parts ------------------------------------------------------------------

CARRIAGE = Part(
    stl="movement-wheel-carriage.stl",
    material="grey",
    rest_location=(0.0, 0.0, 0.0),
    rest_rotation_deg=(0.0, 0.0, 0.0),    # natural orientation -- open side up
    start_frame=1,
    end_frame=1,                          # static
)

# Wheel: dwells at start position (Z=-25) for the band-slide segment, then
# rises into the carriage between frames 30 and 60.
WHEEL_REST_Z = -1.5     # nudge wheel a touch deeper into the carriage interior.
WHEEL = Part(
    stl="movement-wheel.stl",
    material="grey",
    rest_location=(0.0, 0.0, WHEEL_REST_Z),
    rest_rotation_deg=(90.0, 0.0, 0.0),   # axle along Y
    keyframes=[
        (1,  (0.0, 0.0, -25.0), (0.0, 0.0, 0.0)),
        (30, (0.0, 0.0, -25.0), (0.0, 0.0, 0.0)),
        (60, (0.0, 0.0,   0.0), (0.0, 0.0, 0.0)),
        (80, (0.0, 0.0,   0.0), (0.0, 0.0, 0.0)),  # hold final pose
    ],
)

# Band: starts off to the -Y side of the parked wheel, slides along +Y to seat
# over the wheel by frame 30, then rides the wheel up to its final pose.
BAND = Part(
    mesh_factory=make_rubber_band,
    material="black",
    rest_location=(0.0, 0.0, WHEEL_REST_Z),
    rest_rotation_deg=(0.0, 0.0, 0.0),
    keyframes=[
        (1,  (0.0, -18.0, -25.0), (0.0, 0.0, 0.0)),
        (30, (0.0,   0.0, -25.0), (0.0, 0.0, 0.0)),
        (60, (0.0,   0.0,   0.0), (0.0, 0.0, 0.0)),
        (80, (0.0,   0.0,   0.0), (0.0, 0.0, 0.0)),  # hold final pose
    ],
    center_pivot=False,                   # mesh is built centered already
)


ASSEMBLY = {
    "name": "wheel-into-carriage",
    "stl_dir": str(STL_DIR),
    "frames": (1, 80),
    "elevation": 25.0,
    "azimuth": 35.0,
    "ortho_margin": 1.25,
    # Frame on the union of start/mid/end so the parked wheel + sliding band
    # at frame 1 stay in shot.
    "framing_frames": [1, 30, 80],
    "parts": [CARRIAGE, WHEEL, BAND],
}
