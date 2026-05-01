"""
Render every .stl in a directory to consistent isometric product shots.

Usage:
    blender --background --python render_stls.py -- <input_dir> <output_dir> \
            [--res 1500] [--samples 64] [--elevation 55] [--azimuth 45] \
            [--engine CYCLES|BLENDER_EEVEE_NEXT] [--no-normalize] \
            [--only "ship-*.stl"]

Per-item rotation and material overrides live in cc_config.ITEM_OVERRIDES.
Materials and lighting live in cc_materials and cc_scene.
"""

import argparse
import os
import sys
from pathlib import Path

import bpy

# Make sibling cc_* modules importable when Blender runs this script directly.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import cc_config
import cc_materials
import cc_mesh
import cc_scene


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("input_dir", type=Path)
    p.add_argument("output_dir", type=Path)
    p.add_argument("--res", type=int, default=800)
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--elevation", type=float, default=55.0)
    p.add_argument("--azimuth", type=float, default=45.0)
    p.add_argument("--engine", default="CYCLES",
                   choices=["CYCLES", "BLENDER_EEVEE_NEXT"])
    p.add_argument("--margin", type=float, default=1.10)
    p.add_argument("--grey", type=float, default=0.55)
    p.add_argument("--no-normalize", action="store_true",
                   help="Keep STL's source size instead of fitting to a unit cube.")
    p.add_argument("--only", default=None,
                   help="Glob filter relative to input_dir (e.g. 'ship-*.stl').")
    return p.parse_args(argv)


def _render_view(cam, objs, margin, out_path):
    cc_scene.fit_ortho_to_objects(cam, objs, margin)
    bpy.context.scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)


def render_one(stl_path: Path, output_path: Path, args):
    overrides = cc_config.overrides_for(stl_path.stem)
    preset = overrides.get("material", "grey")
    iso_rot = float(overrides.get("rotation_z_deg", 0.0))
    top_rot = float(overrides.get("top_rotation_z_deg", 0.0))
    also_top = bool(overrides.get("also_top", False))
    shade_smooth = bool(overrides.get("shade_smooth", False))

    cc_scene.reset_scene(args.engine, args.samples, args.res)
    cc_scene.add_lights()

    objs = cc_mesh.import_stl(stl_path)
    if not objs:
        print(f"[WARN] no mesh imported from {stl_path}")
        return

    if not args.no_normalize:
        cc_mesh.normalize_size(objs, target_max_dim=2.0)
    cc_mesh.recompute_normals(objs)

    # Iso pass.
    cc_mesh.assign_material(objs, cc_materials.make_material(preset, grey=args.grey, view="iso"),
                            smooth=shade_smooth)
    cc_mesh.set_rotation_z(objs, iso_rot)
    cc_mesh.center_to_origin(objs)
    cam_iso = cc_scene.add_iso_camera(args.elevation, args.azimuth)
    _render_view(cam_iso, objs, args.margin, output_path)

    extras = ""
    if also_top:
        bpy.data.objects.remove(cam_iso, do_unlink=True)
        cc_scene.add_top_view_lights()
        cc_mesh.assign_material(objs, cc_materials.make_material(preset, grey=args.grey, view="top"),
                                smooth=shade_smooth)
        cc_mesh.set_rotation_z(objs, top_rot)
        cc_mesh.center_to_origin(objs)
        cam_top = cc_scene.add_top_camera()
        top_path = output_path.with_name(output_path.stem + "-top" + output_path.suffix)
        _render_view(cam_top, objs, args.margin, top_path)
        extras = f" + {top_path.name}"

    rot_desc = f"iso={iso_rot:+.0f}" + (f" top={top_rot:+.0f}" if also_top else "")
    print(f"     {preset:9s}  {rot_desc}  -> {output_path.name}{extras}")


def main():
    args = parse_args()
    in_dir = args.input_dir.expanduser().resolve()
    out_dir = args.output_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    pattern = args.only or "*.stl"
    stls = sorted(in_dir.glob(pattern))
    if not stls:
        print(f"No STLs matched {pattern} in {in_dir}")
        return

    print(f"Rendering {len(stls)} STL(s) [{args.engine}, {args.res}px, "
          f"elev={args.elevation} azim={args.azimuth}]")
    print(f"  in:  {in_dir}")
    print(f"  out: {out_dir}")

    for stl in stls:
        out = out_dir / f"{stl.stem}.png"
        render_one(stl, out, args)

    print("Done.")


if __name__ == "__main__":
    main()
