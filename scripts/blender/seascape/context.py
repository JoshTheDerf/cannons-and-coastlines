"""The scene being built: settings every seascape helper reads at call time.

A scene script fills this in before building anything:

    from seascape.context import ctx
    ctx.SHIPS = {...}              # ship specs, see ships.build_ship
    ctx.ship_base = my_motion      # (key, frame) -> (xy Vector, heading rad)
    ctx.set_weather("storm")

Everything else has a default that suits the kit's models on a sea.
"""

import json
from pathlib import Path

from mathutils import Vector

HERE = Path(__file__).resolve().parent          # scripts/blender/seascape
REPO = HERE.parents[2]


class Context:
    def __init__(self):
        self.REPO = REPO
        self.BUILD = REPO / "build" / "seascape"
        # Single flags cut from the kit's flag sheets, flag-<model>.png.
        self.FLAG_DIR = REPO / "scripts" / "blender" / "hero"
        self._data = None

        self.S = 0.25            # metres per model millimetre: a 120 mm hull is a 30 m ship
        self.FPS = 24
        self.F_START, self.F_END = 1, 240
        # Direction the wind blows toward (smoke, flags, rain, clouds, waves).
        self.WIND = Vector((1.0, -0.25, 0.0)).normalized()
        # The guns and balls are drawn smaller than the game's: at true size a
        # gun is a third of the beam and walls off deck cameras.
        self.GUN_SCALE = 0.45
        # Lightning strikes as (frame, strength 0..1), used when the weather
        # has lightning.
        self.LIGHTNING = [(118, 1.0), (120, 0.35), (122, 0.8)]

        # Filled in by the scene.
        self.SHIPS = {}
        self.ship_base = None
        self.W = {}
        self.weather_name = None

    @property
    def DATA(self):
        """The kit's ship assemblies (the site's 3D preview uses the same file)."""
        if self._data is None:
            path = self.REPO / "nuxt-site/shared/data/ship-assemblies.json"
            self._data = json.loads(path.read_text())
        return self._data

    def set_weather(self, name, **overrides):
        from .weather import WEATHERS
        self.W = dict(WEATHERS[name], **overrides)
        self.weather_name = name
        return self.W


ctx = Context()
