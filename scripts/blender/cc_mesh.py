"""STL import, transform, and shading prep for render_stls."""

import math
from pathlib import Path

import bpy
from mathutils import Vector


def import_stl(path: Path):
    before = set(bpy.context.scene.objects)
    try:
        bpy.ops.wm.stl_import(filepath=str(path))
    except AttributeError:
        bpy.ops.import_mesh.stl(filepath=str(path))
    return [o for o in bpy.context.scene.objects
            if o not in before and o.type == "MESH"]


def world_bbox(objs):
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    for o in objs:
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], wc[i])
                maxs[i] = max(maxs[i], wc[i])
    return Vector(mins), Vector(maxs)


def normalize_size(objs, target_max_dim: float = 2.0):
    mins, maxs = world_bbox(objs)
    dims = maxs - mins
    max_dim = max(dims)
    if max_dim <= 0:
        return
    s = target_max_dim / max_dim
    for o in objs:
        o.scale = (o.scale[0] * s, o.scale[1] * s, o.scale[2] * s)
        o.location = o.location * s
    bpy.context.view_layer.update()


def rotate_z(objs, degrees: float):
    """Add `degrees` to each object's existing Z rotation."""
    if not degrees:
        return
    rad = math.radians(degrees)
    for o in objs:
        o.rotation_euler.z += rad
    bpy.context.view_layer.update()


def set_rotation_z(objs, degrees: float):
    """Set absolute Z rotation, replacing any prior value."""
    rad = math.radians(degrees)
    for o in objs:
        o.rotation_euler.z = rad
    bpy.context.view_layer.update()


def center_to_origin(objs):
    mins, maxs = world_bbox(objs)
    center = (mins + maxs) * 0.5
    for o in objs:
        o.location -= center
    bpy.context.view_layer.update()


def recompute_normals(objs):
    """Recalculate normals outward; STLs frequently have inconsistent winding."""
    for o in objs:
        if o.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")


def assign_material(objs, mat, smooth: bool = False):
    """Replace materials and set per-poly shading. STL has no smoothing data,
    so flat shading (the default) keeps the actual triangle facets visible to
    read as a printed surface. Pass smooth=True for organic shapes (e.g. an
    island topper) where the facets read as artifacts rather than print
    layers."""
    for o in objs:
        if o.type != "MESH":
            continue
        for poly in o.data.polygons:
            poly.use_smooth = smooth
        o.data.materials.clear()
        o.data.materials.append(mat)


