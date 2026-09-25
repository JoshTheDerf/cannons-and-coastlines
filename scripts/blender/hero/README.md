# Hero battle scene

A Corsair and a Queen's Fleet ship trade cannon shots on open water, for the
site hero. Two looks: `sunny` (physical sky, rainbow, very little haze) and
`storm` (squall, lightning, heavy rain, haze).

- `../hero_battle.py` builds everything from the base-set STLs and
  `nuxt-site/shared/data/ship-assemblies.json`. It is the source of truth.
- `hero-battle-<weather>.blend` are built copies for hand editing (flag
  textures packed in, so they open anywhere). Rebuilding overwrites them, so
  move lasting changes into the script or save your edited copy under
  another name.
- `flag-*.png` are single flags cut from the kit's flag sheets.

## On a new machine

1. Install Blender 5.2 or newer (blender.org, or `snap install blender --classic`).
2. `git clone` this repo (or `git pull`).
3. Open `scripts/blender/hero/hero-battle-sunny.blend` in Blender to edit, or
   rebuild both scenes from the script:

   ```
   scripts/blender/hero/build.sh both
   ```

   The first build of each weather spends a few minutes sampling the sea
   under the ships and caches the result in `build/hero/`.

## Rendering

```
scripts/blender/hero/build.sh sunny --pct 40 --samples 32 --still 66,125   # quick test stills
scripts/blender/hero/build.sh storm --render                               # all frames
scripts/blender/hero/build.sh storm --render --frames 1-96                 # half, to split a run
```

Stills land in `build/hero/still_<weather>_<frame>.png`, animation frames in
`build/hero/frames-<weather>/`. The script sets Cycles to OptiX (NVIDIA). On
another GPU, change `compute_device_type` in `setup_render()` (CUDA, HIP for
AMD, METAL on a Mac) or render in the opened .blend after picking the device
in Preferences > System.

Encode frames to a looping hero video:

```
ffmpeg -framerate 24 -i build/hero/frames-sunny/hero_%04d.png \
  -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart build/hero/hero-sunny.mp4
```

## Timeline (24 fps, frames 1-192)

- 40: the Corsair fires; the ball falls just short of the Queen's Fleet (splash at 62).
- 104: the Queen's Fleet answers and hits the Corsair amidships (124), splinters.
- 150-158: lightning (storm only).
