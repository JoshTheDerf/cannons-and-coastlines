"""Command line and build/save/render loop shared by every scene script.

A scene script calls run() with a function that builds the scene:

    def build(args, coll):
        ...                      # ctx.W is already set from --weather
    run("my-scene", build)

    blender -b --python my_scene.py -- --weather sunset --still 40,120

Options: --weather W, --save PATH, --still F[,F..], --render, --frames A-B,
--pct N, --samples N, --out DIR, --threads N, --no-blur, --step N,
--no-bake, --no-fx. A scene can add its own with `extra_args(parser)`.
"""

import argparse
import sys
from pathlib import Path

import bpy

from .context import ctx
from .ocean import bake_oceans
from .render import setup_render
from .util import stage
from .weather import WEATHERS


def parse(name, extra_args=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser(prog=name)
    p.add_argument("--weather", choices=sorted(WEATHERS), default="sunny")
    p.add_argument("--save", type=Path, default=None,
                   help=f"Write the built scene here (default <build>/{name}-<weather>.blend).")
    p.add_argument("--still", default="", help="Render these frames as PNG stills into --out.")
    p.add_argument("--render", action="store_true", help="Render the animation as PNG frames.")
    p.add_argument("--frames", default="", help="Limit --render to a frame range A-B.")
    p.add_argument("--pct", type=int, default=100, help="Resolution percentage of 1920x1080.")
    p.add_argument("--samples", type=int, default=64)
    p.add_argument("--out", type=Path, default=None, help="Output folder (default the build folder).")
    p.add_argument("--threads", type=int, default=6,
                   help="CPU threads (default 6 of 16): keeps a laptop cool; the GPU does the rendering.")
    p.add_argument("--no-blur", action="store_true",
                   help="No motion blur (drafts): blur re-evaluates the live ocean several times a frame.")
    p.add_argument("--step", type=int, default=1, help="Render every Nth frame (drafts).")
    p.add_argument("--no-bake", action="store_true", help="Render with the live ocean.")
    p.add_argument("--no-fx", action="store_true", help="Skip rain, shots and other effects (layout checks).")
    if extra_args:
        extra_args(p)
    return p.parse_args(argv)


def run(name, build, extra_args=None, frame_prefix="frame_"):
    """Parse the command line, set the weather, build the scene with
    build(args, collection), then save it and render what was asked for."""
    a = parse(name, extra_args)
    ctx.set_weather(a.weather)
    save = a.save or ctx.BUILD / f"{name}-{a.weather}.blend"
    out = a.out or ctx.BUILD

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = ctx.F_START, ctx.F_END
    sc.render.fps = ctx.FPS
    build(a, sc.collection)

    setup_render(a.samples, a.pct)
    if a.no_blur:
        sc.render.use_motion_blur = False
    sc.render.threads_mode = "FIXED"
    sc.render.threads = a.threads

    save.parent.mkdir(parents=True, exist_ok=True)
    # Pack textures (flags) so the .blend opens on any machine.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(save), compress=True)
    stage("saved")
    bpy.app.handlers.render_pre.append(lambda *_: stage(f"render frame {bpy.context.scene.frame_current}"))
    bpy.app.handlers.render_post.append(lambda *_: stage("rendered"))
    print(f"[seascape] saved {save}")

    out.mkdir(parents=True, exist_ok=True)
    if a.still:
        for f in [int(x) for x in a.still.split(",")]:
            sc.frame_set(f)
            sc.render.filepath = str(out / f"still_{a.weather}_{f:04d}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[seascape] still {sc.render.filepath}")
    if a.render:
        if a.frames:
            s, e = (int(x) for x in a.frames.split("-"))
            sc.frame_start, sc.frame_end = s, e
        sc.frame_step = a.step
        if not a.no_bake:
            bake_oceans((sc.frame_start, sc.frame_end), a.weather)
        sc.render.filepath = str(out / f"frames-{a.weather}" / frame_prefix)
        bpy.ops.render.render(animation=True)
    return a
