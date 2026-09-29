# Hero battle scene

A Corsair and a Queen's Fleet ship trade cannon shots on open water, for the
site hero. It renders in any of the seascape looks: `sunny`, `sunrise`,
`sunset`, `overcast`, `fog`, `storm` and `night`. The dark ones (sunset, fog,
storm, night) hang lit lanterns on every ship.

- `../hero_battle.py` is the battle itself: the ships, their course, the
  shots, the cameras and the islands. It is the source of truth.
- `../seascape/` has the parts any sea cinematic can use (ships from the kit,
  the ocean, weather and sky, lanterns, effects, render settings). See its
  README for writing another scene.
- `hero-battle-sunny.blend` and `hero-battle-storm.blend` are built copies for hand editing (flag
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
   scripts/blender/hero/build.sh both          # sunny and storm
   scripts/blender/hero/build.sh night,fog     # others land in build/hero/
   ```

   The first build of each weather spends a few minutes sampling the sea
   under the ships and caches the result in `build/hero/`.

## Rendering

```
scripts/blender/hero/build.sh sunny --pct 40 --samples 32 --still 60,120,200  # quick test stills
scripts/blender/hero/build.sh storm --render                               # all frames
scripts/blender/hero/build.sh storm --render --frames 1-96                 # half, to split a run
```

Stills land in `build/hero/still_<weather>_<frame>.png`, animation frames in
`build/hero/frames-<weather>/`. The script sets Cycles to OptiX (NVIDIA). On
another GPU, change `compute_device_type` in `seascape/render.py` (CUDA, HIP for
AMD, METAL on a Mac) or render in the opened .blend after picking the device
in Preferences > System.

Encode frames to a looping hero video:

```
ffmpeg -framerate 24 -i build/hero/frames-sunny/hero_%04d.png \
  -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart build/hero/hero-sunny.mp4
```

## Timeline (24 fps, frames 1-288)

- 1-150: from the Corsair's deck. It runs the Queen's Fleet down and fires at
  84; the ball falls just short (splash about 104).
- 118-122: lightning (storm only); the bolt is hidden between flashes.
- 150: cut to the Queen's Fleet's deck.
- 178: the Queen's Fleet answers and hits the Corsair amidships (about 196),
  splinters and cargo over the side.
- 206: it fires again and brings down the Corsair's foremast; the Corsair
  falls off the pace.
