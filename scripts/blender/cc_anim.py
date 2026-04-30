"""Assembly animation: position multiple STL parts with keyframed offsets.

Each `Part` has a *rest pose* (the final assembled position + rotation) and an
optional *start offset* (translation + rotation applied to the rest pose at the
start frame, interpolated to zero by the end frame). Parts that don't move have
`start_offset == end_offset == 0` and just sit at their rest pose.

The animation engine assumes the rest poses describe the assembled state.
"""

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, List, Optional, Tuple

import bpy
from mathutils import Vector, Euler

import cc_materials
import cc_mesh


Vec3 = Tuple[float, float, float]
Keyframe = Tuple[int, Vec3, Vec3]   # (frame, loc_offset, rot_offset_deg)


@dataclass
class Part:
    # Either an STL path (loaded via cc_mesh.import_stl) or a `mesh_factory`
    # callable returning a list of bpy objects (already centered at origin).
    stl: Optional[Path] = None
    mesh_factory: Optional[Callable[[], list]] = None
    material: str = "grey"
    rest_location: Vec3 = (0.0, 0.0, 0.0)        # assembled-pose translation
    rest_rotation_deg: Vec3 = (0.0, 0.0, 0.0)    # assembled-pose rotation (XYZ Euler)
    start_offset_loc: Vec3 = (0.0, 0.0, 0.0)     # legacy: added at start_frame, lerps to 0 at end_frame
    start_offset_rot_deg: Vec3 = (0.0, 0.0, 0.0)
    start_frame: int = 1
    end_frame: int = 1
    # Multi-waypoint animation: list of (frame, loc_offset, rot_offset_deg).
    # When non-empty, takes precedence over start_frame/end_frame/start_offset_*.
    keyframes: List[Keyframe] = field(default_factory=list)
    # Post-import mesh deformation hook. Called with the list of imported
    # objects AFTER recenter+apply but BEFORE material assignment. Use this
    # to bake shape changes (e.g. billowing a sail) into mesh data so the
    # deformation appears in every animated frame without per-frame work.
    mesh_modifier: Optional[Callable[[list], None]] = None
    shade_smooth: bool = False
    grey: float = 0.55
    # If True, fix this part's pivot at the bbox center so rotation offsets
    # spin the part around its own center rather than the imported origin.
    center_pivot: bool = True


def _add_loc_keys(obj, frame, loc):
    obj.location = Vector(loc)
    obj.keyframe_insert(data_path="location", frame=frame)


def _add_rot_keys(obj, frame, rot_rad):
    obj.rotation_euler = Euler(rot_rad, "XYZ")
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)


def _set_interpolation(obj, mode: str = "BEZIER"):
    """Smooth easing for slide-into-place motion. Tolerant of API changes
    across Blender versions (4.x: Action.fcurves; 5.x: Action.layers/strips)."""
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    fcurves = []
    if hasattr(ad.action, "fcurves"):
        fcurves = list(ad.action.fcurves)
    elif hasattr(ad.action, "layers"):
        for layer in ad.action.layers:
            for strip in getattr(layer, "strips", []):
                cb = getattr(strip, "channelbag", None)
                if cb and hasattr(cb, "fcurves"):
                    fcurves.extend(cb.fcurves)
                # Some 5.x builds expose channelbags() iter / channels list.
                for attr in ("channelbags", "channels"):
                    bag_iter = getattr(strip, attr, None)
                    if callable(bag_iter):
                        for bag in bag_iter():
                            if hasattr(bag, "fcurves"):
                                fcurves.extend(bag.fcurves)
    for fcu in fcurves:
        for kp in fcu.keyframe_points:
            kp.interpolation = mode
            kp.easing = "EASE_IN_OUT"


def import_part(part: Part) -> list:
    """Import the STL (or invoke mesh_factory), recenter at origin if
    requested, assign material. Returns the list of imported objects."""
    if part.mesh_factory is not None:
        objs = part.mesh_factory()
        if not objs:
            raise RuntimeError("mesh_factory returned no objects")
        # Procedural meshes are assumed to be built centered & with valid
        # normals; skip recompute/center/apply.
        mat = cc_materials.make_material(part.material, grey=part.grey, view="iso")
        cc_mesh.assign_material(objs, mat, smooth=part.shade_smooth)
        return objs

    objs = cc_mesh.import_stl(part.stl)
    if not objs:
        raise RuntimeError(f"No mesh imported from {part.stl}")

    cc_mesh.recompute_normals(objs)

    if part.center_pivot:
        # Recenter so rotations spin around the part's bbox center, not the
        # imported origin (STL origin is the slicer's print-bed corner). Then
        # *apply* the transform so the centering is baked into mesh data --
        # otherwise the keyframed `obj.location = rest_location` below
        # overwrites the centering and strands the mesh at the slicer origin.
        cc_mesh.center_to_origin(objs)
        for o in objs:
            if o.type != "MESH":
                continue
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True)
            bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    if part.mesh_modifier is not None:
        part.mesh_modifier(objs)

    mat = cc_materials.make_material(part.material, grey=part.grey, view="iso")
    cc_mesh.assign_material(objs, mat, smooth=part.shade_smooth)

    # If multiple meshes were imported (shouldn't happen for these STLs but be
    # safe), parent them under an empty so a single transform drives the part.
    if len(objs) > 1:
        bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
        empty = bpy.context.object
        for o in objs:
            o.parent = empty
        return [empty] + objs
    return objs


def keyframe_part(part: Part, root_obj):
    """Drive a single root object with rest+offset keyframes."""
    rest_loc = Vector(part.rest_location)
    rest_rot = tuple(math.radians(d) for d in part.rest_rotation_deg)

    if part.keyframes:
        for (frame, loc_off, rot_off_deg) in part.keyframes:
            loc = rest_loc + Vector(loc_off)
            rot = tuple(rest_rot[i] + math.radians(rot_off_deg[i]) for i in range(3))
            _add_loc_keys(root_obj, frame, loc)
            _add_rot_keys(root_obj, frame, rot)
        _set_interpolation(root_obj)
        return

    start_loc = rest_loc + Vector(part.start_offset_loc)
    start_rot = tuple(rest_rot[i] + math.radians(part.start_offset_rot_deg[i])
                      for i in range(3))
    if part.start_frame == part.end_frame:
        _add_loc_keys(root_obj, part.start_frame, rest_loc)
        _add_rot_keys(root_obj, part.start_frame, rest_rot)
        return

    _add_loc_keys(root_obj, part.start_frame, start_loc)
    _add_rot_keys(root_obj, part.start_frame, start_rot)
    _add_loc_keys(root_obj, part.end_frame, rest_loc)
    _add_rot_keys(root_obj, part.end_frame, rest_rot)
    _set_interpolation(root_obj)
