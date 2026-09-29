# seascape

Shared pieces for Blender cinematics of the kit's ships at sea. A scene
script (like `../hero_battle.py`) says which ships, where they sail, what
happens and where the cameras are. Everything else comes from here, so a new
cinematic is mostly a list of ships and a timeline.

| Module | What's in it |
|---|---|
| `context.py` | `ctx`, the scene being built: scale, frame range, wind, ships, their motion and the weather. Every helper reads it at call time. |
| `runner.py` | The command line (`--weather`, `--still`, `--render`, ...) and the build, save and render loop. |
| `weather.py` | The looks (sunny, sunrise, sunset, overcast, fog, storm, night), the three sky builders, the key light, lightning and volumetric fog. |
| `ships.py` | Ships assembled from the kit's STLs and `ship-assemblies.json`, flags, deck cameras and lanterns. |
| `materials.py` | FDM filament (PLA with layer lines, no subsurface), the kit's colours, terrain. |
| `ocean.py` | The tiled FFT sea, its water shader, sampling the sea height under the ships (cached) and baking. |
| `fx.py` | Cannon shots, muzzle flash, smoke, splashes, splinters, rain, wakes and bow spray. |
| `terrain.py` | Kit islands and rocks blown up to landscape size, and distant headlands. |
| `render.py` | Cycles settings and the haze compositor. |
| `util.py` | Small Blender helpers (STL import, node trees, keyframes, progress lines). |

## A new scene

```python
import sys
from pathlib import Path

import math
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seascape.context import ctx
from seascape.materials import build_materials
from seascape.ocean import build_ocean
from seascape.runner import run
from seascape.ships import add_lanterns, build_flags, build_ship
from seascape.weather import build_fog_bank, build_lights, build_world

ctx.SHIPS = {
    "stone": {"model": "stone-fleet", "pos": Vector((0, 0)), "heading": 180.0, "speed": 1.5,
              "cannon": {"at": [0, 6, 15], "rotZ": 90}},
}

def ship_base(key, frame):
    s = ctx.SHIPS[key]
    h = math.radians(s["heading"])
    t = (frame - ctx.F_START) / ctx.FPS
    return s["pos"] + Vector((-math.cos(h), -math.sin(h))) * s["speed"] * t, h

ctx.ship_base = ship_base

def build(args, coll):
    M = build_materials()
    build_ocean(coll, Vector((0, 0)))
    rigs = {k: build_ship(k, M, coll) for k in ctx.SHIPS}
    build_flags(coll, rigs)
    if ctx.W["lanterns"]:
        for rig in rigs.values():
            add_lanterns(coll, rig, M)
    build_world()
    build_lights(coll)
    build_fog_bank(coll, Vector((0, 0)))
    # ... ship motion on the waves, cameras, shots

run("my-scene", build)
```

```
blender -b --python my_scene.py -- --weather night --pct 50 --samples 32 --still 1,60
```

A ship spec needs `model` (a key in `ship-assemblies.json`, default the spec's
own key), `heading` (degrees; a hull's bow is its -X, so 180 points it down
+X), `speed` (m/s) and `cannon` (`at` in hull mm and `rotZ`, the socket the
gun sits in). `deck_cam` is only needed for `deck_camera`, and
`half_length_mm` overrides the measured hull length used for wakes and spray.
`ctx.ship_base(key, frame)` returns the ship's position (a 2D Vector, m) and
heading (radians); the effects use it to follow the ships.

`../hero_battle.py` shows the rest: riding the waves (`cached_samples`), shots
(`stage_shot`), cameras cut on a timeline, and keeping the lanterns and masts
out of a deck camera.

## Weather

`--weather` picks a dict from `WEATHERS`, and `ctx.W` holds it while the
scene builds. The sky is one of three builders, picked by `sky["type"]`:

- `clear`: a physical sky (the sun sets its colour, so low suns go orange by
  themselves) with cumulus. `clouds` is the cover from 0 to 1. Sunny,
  sunrise and sunset use it.
- `deck`: a gradient under a cloud deck, brighter where the sun is behind it.
  Overcast, fog and storm.
- `night`: moon, halo, stars and broken, moonlit cloud. The weather's `sun`
  is the moon, and the key light is moonlight.

Looks with `lanterns` set (sunset, fog, storm, night) are meant to have every
ship's lanterns lit: `add_lanterns` puts a pair on the stern rail, one at the
bow and one on each side amidships, read off the hull so any model gets
them. Each has glowing glass and a warm point light that falls on the deck
and the water. The scene decides whether to call it, so a daylight scene can
carry unlit lanterns or none.

Fog is real volumetric fog (`build_fog_bank`): layers of scattering volume
lying on the sea, thickest at the water and thinner going up, with the top
layer taller than the land so no peaks stand out of it. Lanterns and
lightning light it, and the land fades out bottom first. Sunrise, fog, storm
and night have a `fog_bank`. The compositor only adds a light 2D haze over
distance (`mist`), which suits clear air. It can't reach the sky or scatter
light, so the fogged looks turn it off.

A new look is a new entry in `WEATHERS`. Start from the nearest one, since
every key in the comment above `WEATHERS` is read somewhere.

## Caches

The first build of each weather samples the sea height under the ships, a
couple of minutes per weather, and keeps it in `ctx.BUILD`
(`build/seascape/` by default, `build/hero/` for the hero). The file is keyed
by the ocean settings and whatever the scene passes to `cached_samples`, so a
change to either samples again.
