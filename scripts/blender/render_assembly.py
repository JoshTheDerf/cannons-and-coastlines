"""Render an assembly animation as PNG frames + an MP4 video.

Usage:
    blender --background --python render_assembly.py -- \
            <assembly_module> <output_dir> [--res 720] [--fps 30] [--samples 32]

The assembly module must define an `ASSEMBLY` dict with this shape:

    ASSEMBLY = {
        "name": "wheel-into-carriage",
        "stl_dir": "/abs/path/to/stls",          # or relative to repo root
        "frames": (1, 60),                       # inclusive
        "elevation": 35,
        "azimuth": 35,
        "ortho_margin": 1.10,
        "parts": [Part(...), Part(...)],
    }

Frames are written as <output_dir>/frames/<name>_####.png. The encoded video
is written to <output_dir>/<name>.mp4 (H.264 / yuv420p).

EEVEE is the only supported engine here -- it's interactive-fast, which is the
right tradeoff for instructional animations.
"""

import argparse
import importlib.util
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import cc_anim
import cc_scene


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("assembly_module", type=Path,
                   help="Python file defining ASSEMBLY = {...}")
    p.add_argument("output_dir", type=Path)
    p.add_argument("--res", type=int, default=720)
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--frames-only", action="store_true",
                   help="Skip video encoding (frames only).")
    return p.parse_args(argv)


def load_assembly(path: Path) -> dict:
    spec = importlib.util.spec_from_file_location("assembly_cfg", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, "ASSEMBLY"):
        raise SystemExit(f"{path} has no ASSEMBLY dict")
    return mod.ASSEMBLY


def configure_eevee(scene, samples: int):
    # Blender 4.x ships EEVEE-Next as BLENDER_EEVEE_NEXT; older builds use
    # BLENDER_EEVEE. Pick whichever this build supports.
    candidates = ["BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"]
    for engine in candidates:
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue

    # Sampling -- EEVEE-Next uses scene.eevee.taa_render_samples.
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.taa_render_samples = samples
        except Exception:
            pass
        # Soft shadows + ambient occlusion give the printed parts depth
        # without paying Cycles render time.
        for attr in ("use_gtao", "use_ssr", "use_soft_shadows", "use_shadow_high_bitdepth"):
            if hasattr(scene.eevee, attr):
                try:
                    setattr(scene.eevee, attr, True)
                except Exception:
                    pass


def main():
    args = parse_args()
    cfg = load_assembly(args.assembly_module.resolve())

    name = cfg["name"]
    frame_start, frame_end = cfg["frames"]
    elevation = float(cfg.get("elevation", 35.0))
    azimuth = float(cfg.get("azimuth", 35.0))
    margin = float(cfg.get("ortho_margin", 1.10))
    stl_dir = Path(cfg["stl_dir"]).expanduser().resolve()

    out_dir = args.output_dir.expanduser().resolve()
    frames_dir = out_dir / "frames" / name
    frames_dir.mkdir(parents=True, exist_ok=True)

    # Reset + lighting + EEVEE. Pick whichever EEVEE name this build supports.
    eevee_engine = "BLENDER_EEVEE_NEXT"
    try:
        bpy.context.scene.render.engine = eevee_engine
    except TypeError:
        eevee_engine = "BLENDER_EEVEE"
    cc_scene.reset_scene(eevee_engine, args.samples, args.res)
    configure_eevee(bpy.context.scene, args.samples)
    cc_scene.add_lights()

    # Import + keyframe each part.
    part_objs = []  # list of (Part, root_obj) for fit_ortho later.
    all_objs = []
    for part in cfg["parts"]:
        if part.stl is not None:
            stl_path = Path(part.stl)
            part.stl = stl_path if stl_path.is_absolute() else (stl_dir / stl_path).resolve()
        objs = cc_anim.import_part(part)
        root = objs[0]
        cc_anim.keyframe_part(part, root)
        part_objs.append((part, root))
        all_objs.extend([o for o in objs if o.type == "MESH"])

    # Camera. We sample object positions across multiple frames to size the
    # ortho fit so the whole animation fits without re-fitting each frame.
    cam = cc_scene.add_iso_camera(elevation, azimuth)

    # Fit. By default, frame on the *final assembled pose* so the assembly
    # reads at intended scale; in-flight parts may extend beyond the frame
    # edge, which is fine for "entering from off-screen". Set `framing_frames`
    # in the assembly config to override (e.g. all sample frames for a tight
    # fit on the union of motion).
    scene = bpy.context.scene
    framing_frames = cfg.get("framing_frames")
    if framing_frames is None:
        framing_frames = [frame_end]
    bbox_corners_world = []
    from mathutils import Vector
    for f in framing_frames:
        scene.frame_set(f)
        bpy.context.view_layer.update()
        for o in all_objs:
            for c in o.bound_box:
                bbox_corners_world.append(o.matrix_world @ Vector(c))
    # Project corners through the (already-positioned) camera.
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for wc in bbox_corners_world:
        cc = inv @ wc
        xs.append(cc.x); ys.append(cc.y)
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    cam.data.ortho_scale = max(max(width, height) * margin, 0.01)

    # Frame range + output.
    scene.frame_start = frame_start
    scene.frame_end = frame_end
    scene.render.fps = args.fps
    scene.render.resolution_x = args.res
    scene.render.resolution_y = args.res
    scene.render.film_transparent = False  # solid background reads cleaner in video
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = str(frames_dir / f"{name}_")

    # Render frame sequence.
    bpy.ops.render.render(animation=True)

    # Encode video unless skipped.
    if not args.frames_only:
        encode_video(frames_dir, name, out_dir, args.fps)
    print(f"Done. Frames: {frames_dir}")


def encode_video(frames_dir: Path, name: str, out_dir: Path, fps: int):
    """Use ffmpeg to assemble the PNG sequence into an MP4."""
    import shutil
    import subprocess
    if not shutil.which("ffmpeg"):
        print("[WARN] ffmpeg not on PATH -- skipping video encode.")
        return
    pattern = str(frames_dir / f"{name}_%04d.png")
    out_path = out_dir / f"{name}.mp4"
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", pattern,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "20",
        str(out_path),
    ]
    print("Encoding:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"Video: {out_path}")


if __name__ == "__main__":
    main()
