"""Build the browser preview meshes listed in ship-assemblies.json.

    blender --background --python build_preview_meshes.py [-- [--game] names...]
    npx jake preview-meshes

With --game it builds the web game's lighter set instead, under
assets/previews/game/ at the same paths: a table can hold dozens of ships,
seen from further away, on phones as well as desktops, so every mesh gets a
much smaller triangle budget (GAME_TRIS). The game loads these except on the
fastest desktops.

Every `source` STL named in nuxt-site/shared/data/ship-assemblies.json (hulls,
hull-space fittings and parts) becomes a small GLB at its `preview` URL under
assets/previews/. The site's 3D viewer loads those and assembles the ship
from the same JSON, so the placements live in one file.

What happens to each mesh:
  - vertices are welded and the mesh decimated to a triangle budget (a
    part's `tris` in the JSON overrides the default), because
    the 3D view needs silhouettes, not print resolution. For a paid hull this
    is also the only form of it the site ever serves.
  - positions are exported in the STL's own millimetre space, Z up (no
    glTF Y-up swap), so the JSON's coordinates apply to them unchanged.
  - no normals or materials: the viewer welds and smooths the mesh itself and
    colours each part from the JSON palette.
  - sails stay flat but are sliced across their length (subdivide_sail),
    because the viewer bends them onto their mast at load time.

A source file that is missing locally (paid STLs are gitignored) is skipped
with a warning, and its previous GLB is left in place.
"""
import json
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSEMBLIES = os.path.join(REPO, "nuxt-site", "shared", "data", "ship-assemblies.json")

HULL_TRIS = 40000
PART_TRIS = 8000
SAIL_STEP_MM = 1.5   # bend resolution along the sail
# The game set: (hull, part, scale for a part's own `tris`, sail slicing step).
GAME_TRIS = (9000, 1800, 0.25, 3.0)
GAME = False


def preview_path(url: str) -> str:
    # "/assets/previews/x.glb" -> <repo>/assets/previews/x.glb
    # (game set: <repo>/assets/previews/game/x.glb)
    if GAME:
        url = url.replace("/assets/previews/", "/assets/previews/game/", 1)
    return os.path.join(REPO, url.lstrip("/"))


def load_stl(path: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=path)
    ob = bpy.context.selected_objects[0]
    bpy.context.view_layer.objects.active = ob
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def decimate(ob, budget: int):
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if tris <= budget:
        return tris, tris
    mod = ob.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = budget / tris
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return tris, sum(len(p.vertices) - 2 for p in ob.data.polygons)


def subdivide_sail(ob, holes):
    """Slice a flat sail across its length so the viewer can bend it.

    The sheet stays flat, in its STL's own XY, and the viewer threads it onto
    the mast at load time (the bend depends on the mast it hangs on, so it
    cannot be baked per part). A printed sail is a handful of long triangles;
    bending those would just hinge them, so cut the sheet every SAIL_STEP_MM
    along the line through its holes.
    """
    (x1, y1), (x2, y2) = holes[0], holes[-1]
    L = math.hypot(x2 - x1, y2 - y1)
    ax, ay = (x2 - x1) / L, (y2 - y1) / L
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    step = GAME_TRIS[3] if GAME else SAIL_STEP_MM
    proj = [v.co.x * ax + v.co.y * ay for v in bm.verts]
    t = min(proj) + step
    while t < max(proj):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(ax * t, ay * t, 0), plane_no=(ax, ay, 0))
        t += step
    bm.to_mesh(ob.data)
    bm.free()


def export_glb(ob, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_normals=False,
        export_materials="NONE",
        export_texcoords=False,
        export_apply=True,
    )


def build(src_rel: str, url: str, budget: int, holes=None):
    src = os.path.join(REPO, src_rel)
    out = preview_path(url)
    if not os.path.exists(src):
        print(f"skip  {src_rel} (not present locally; keeping {url})")
        return
    ob = load_stl(src)
    before, after = decimate(ob, budget)
    extra = ""
    if holes:
        subdivide_sail(ob, holes)
        extra = ", sliced for bending"
    export_glb(ob, out)
    print(f"built {url}  {before} -> {after} tris{extra}  ({os.path.getsize(out) // 1024} KB)")


def main():
    global GAME
    only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--game" in only:
        GAME = True
        only = [n for n in only if n != "--game"]
    hull_tris, part_tris = (GAME_TRIS[0], GAME_TRIS[1]) if GAME else (HULL_TRIS, PART_TRIS)
    own = lambda part: int(part["tris"] * GAME_TRIS[2]) if GAME and "tris" in part else part.get("tris", part_tris)
    data = json.load(open(ASSEMBLIES))
    jobs = []
    for name, part in data["parts"].items():
        jobs.append((name, part["source"], part["preview"], own(part), part.get("holes") if part.get("sail") else None))
    for key, ship in data["ships"].items():
        jobs.append((key, ship["hull"]["source"], ship["hull"]["preview"], hull_tris, None))
        for f in ship.get("fittings", []):
            jobs.append((f["name"], f["source"], f["preview"], part_tris, None))
    for name, src, url, budget, holes in jobs:
        if only and name not in only:
            continue
        build(src, url, budget, holes)


main()
