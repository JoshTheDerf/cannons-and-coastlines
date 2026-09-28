#!/usr/bin/env python3
"""Generate the Wind Dial (Trade Winds variant) as CubbyCAD scenes.

Writes, into the given output directory:
  part-wind-dial.cubby   all four parts laid out on one plate (the workspace part)
  wind-dial-base.cubby, wind-dial-vane.cubby, wind-dial-cap.cubby, wind-dial-washer.cubby
                         one part each at the origin, for per-part STL export

Scene frame is CubbyCAD's: Y-up, millimetres, every primitive sitting on
y = 0 and centred in x/z; rotations are quaternions [x, y, z, w]. The STL
exporter turns Y-up into Z-up, so the parts land flat on the print bed.

CubbyCAD is the home of the design: part-wind-dial.cubby lives in the
"Cannons and Coastlines" workspace on cubbycad.com, and the STLs in
assets/stls/base-set/wind-dial-*.stl were exported from these scenes by
CubbyCAD's own SceneBuilder + STL exporter. If you edit the part in the
editor, export from there; this script is the parametric starting point.

Fit (radial clearances for FDM, 0.4 mm nozzle):
  vane hole on the 8 mm pin: 0.3 mm, so it spins freely
  printed washer on the pin: 0.2 mm (same bore as an M8 washer)
  cap socket on the 5 mm pin tip: 0.0 mm, a press fit (glue if it's loose)
"""
import json
import math
import sys
import uuid
from pathlib import Path

NS = uuid.UUID("5b0e7f55-8f55-4c3e-9d52-0c2a1c0ffee1")


def uid(key):
    # Stable ids, so a rebuild overwrites the same nodes instead of minting new ones.
    return str(uuid.uuid5(NS, key))


def quat_y(deg):
    h = math.radians(deg) / 2
    return [0, math.sin(h), 0, math.cos(h)]


def prim(key, geom, params, pos=(0, 0, 0), rot_y=0, sub=False, color=None, name=None):
    n = {
        "id": uid(key), "type": "primitive", "name": name or key.split("/")[-1],
        "geometry": {"type": geom, "params": params},
        "transform": {"position": list(pos), "rotation": quat_y(rot_y), "scale": [1, 1, 1]},
    }
    if sub:
        n["contribution"] = "subtract"
    if color:
        n["material"] = {"color": color}
    return n


def group(key, name, children, pos=(0, 0, 0), color=None):
    n = {
        "id": uid(key), "type": "group", "name": name, "children": children,
        "transform": {"position": list(pos), "rotation": [0, 0, 0, 1], "scale": [1, 1, 1]},
    }
    if color:
        n["material"] = {"color": color}
        # Pass the colour down: CubbyCAD colours a cut's walls with the
        # cutter's colour, and the default grey would show in the holes.
        for c in children:
            c.setdefault("material", {"color": color})
    return n


def cyl(key, r, h, y=0, x=0, z=0, sub=False, segs=96, bevel=0):
    return prim(key, "cylinder", {"radius": r, "height": h, "radialSegments": segs,
                                  "bevel": bevel, "bevelSegments": 3 if bevel else 1},
                (x, y, z), sub=sub)


def radial_box(key, angle, r0, r1, width, y, height):
    """A bar from radius r0 to r1 along compass angle `angle` (0 = +Z)."""
    rm = (r0 + r1) / 2
    a = math.radians(angle)
    return prim(key, "box", {"width": width, "height": height + SINK, "depth": r1 - r0, "bevel": 0},
                (rm * math.sin(a), y - SINK, rm * math.cos(a)), rot_y=angle)


def glyph(key, angle, r, y, height, plus):
    """A raised + or - at compass angle/radius, bars aligned to the radius."""
    a = math.radians(angle)
    x, z = r * math.sin(a), r * math.cos(a)
    bars = [prim(key + "/bar", "box", {"width": 6.5, "height": height + SINK, "depth": 1.6, "bevel": 0},
                 (x, y - SINK, z), rot_y=angle)]
    if plus:
        bars.append(prim(key + "/stem", "box", {"width": 1.6, "height": height + SINK, "depth": 6.5, "bevel": 0},
                         (x, y - SINK, z), rot_y=angle))
    return bars


def feather(key, z0, side, y, height, length=7.0, rake=38):
    """One fletching feather leaving the shaft at z0, raking back and out."""
    a = math.radians(rake)
    cx, cz = side * math.sin(a) * length / 2, z0 - math.cos(a) * length / 2
    return prim(key, "box", {"width": 1.8, "height": height, "depth": length, "bevel": 0},
                (cx, y, cz), rot_y=180 - side * rake)


# ---- dimensions (mm) ------------------------------------------------------
BASE_R, BASE_H = 42.0, 4.0
PAD_R, PAD_H = 8.5, 0.4                             # flat seat for the washer, clear of any
                                                    # elephant's foot at the pin root
PIN_R, TIP_R, TIP_H = 4.0, 2.5, 4.0                 # 8 mm pin: fits a standard M8 washer
# The vane rides on a washer, never on the base. A steel M8 flat washer
# (8.4 x 16 x 1.6 mm) spins best; the printed one matches it.
WASHER_R0, WASHER_R1, WASHER_H = 4.2, 8.0, 1.6
VANE_R, VANE_H = 33.0, 2.8
VANE_Y = BASE_H + PAD_H + WASHER_H                  # 2 mm clear of the base
VANE_HOLE_R = PIN_R + 0.3
SHOULDER_Y = VANE_Y + VANE_H + 0.4                  # cap sits here, 0.4 above the vane
CAP_R, CAP_H = 6.0, 5.0
ARROW_H, RIDGE_H = 1.4, 0.8
# Raised features sink this far into the face they stand on, so the union
# overlaps instead of merely touching (touching faces leave non-manifold edges).
SINK = 0.2

BROWN, PARCHMENT, GOLD, BLUE = "#6b4c30", "#e8d8b0", "#a8801a", "#2b5f8e"


def base_part(pos=(0, 0, 0)):
    k = "base"
    kids = [
        cyl(k + "/disc", BASE_R, BASE_H, bevel=0.6),
        cyl(k + "/pad", PAD_R, PAD_H + SINK, y=BASE_H - SINK),
        cyl(k + "/pin", PIN_R, SHOULDER_Y, segs=64),
        cyl(k + "/pin-tip", TIP_R, TIP_H + SINK, y=SHOULDER_Y - SINK, segs=48),
    ]
    # No compass marks: the wind is read off the vane against the table, so
    # the base is a plain, flat stand.
    return group(k, "Wind Dial Base", kids, pos, BROWN)


def vane_part(pos=(0, 0, 0)):
    k = "vane"
    top = VANE_H - SINK
    raised = ARROW_H + SINK
    kids = [
        cyl(k + "/disc", VANE_R, VANE_H, bevel=0.5),
        cyl(k + "/hole", VANE_HOLE_R, VANE_H + 2, y=-1, sub=True, segs=64),
        # Arrow pointing along +Z (the wind): shaft and head ahead of the hub,
        # shaft and split tail behind it. The hub stays clear for the cap.
        prim(k + "/shaft", "box", {"width": 4.0, "height": raised, "depth": 12.0, "bevel": 0}, (0, top, 14.0)),
        prim(k + "/head", "polygon", {"radius": 8.5, "height": raised, "sides": 3, "bevel": 0}, (0, top, 24.0)),
        prim(k + "/tail", "box", {"width": 3.0, "height": raised, "depth": 20.0, "bevel": 0}, (0, top, -18.0)),
    ]
    # Fletching: two pairs of feathers raking back from the tail shaft.
    for j, z0 in enumerate((-17.0, -22.5)):
        for side in (-1, 1):
            kids.append(feather(f"{k}/fletch{j}{side}", z0, side, top, raised))
    # Quarter boundaries at 45 degrees either side of the arrow and of its tail.
    for i, ang in enumerate((45, 135, 225, 315)):
        kids.append(radial_box(f"{k}/ridge{i}", ang, 10.0, VANE_R - 1.5, 1.0, VANE_H, RIDGE_H))
    # Fair wind (+) flanks the head, foul wind (-) flanks the tail.
    for side in (-1, 1):
        kids += glyph(f"{k}/fair{side}", 30 * side, 25.0, VANE_H, RIDGE_H, plus=True)
        kids += glyph(f"{k}/foul{side}", 180 + 30 * side, 25.0, VANE_H, RIDGE_H, plus=False)
    # Everything raised above the disc is the second colour (the filament swap).
    # group() gives the disc and hole the parchment colour.
    for n in kids[2:]:
        n["material"] = {"color": BLUE}
    return group(k, "Wind Dial Vane", kids, pos, PARCHMENT)


def washer_part(pos=(0, 0, 0)):
    k = "washer"
    kids = [
        cyl(k + "/body", WASHER_R1, WASHER_H, segs=64),
        cyl(k + "/hole", WASHER_R0 + 0.1, WASHER_H + 2, y=-1, sub=True, segs=64),
    ]
    return group(k, "Wind Dial Washer", kids, pos, GOLD)


def cap_part(pos=(0, 0, 0)):
    k = "cap"
    kids = [
        cyl(k + "/body", CAP_R, CAP_H, segs=64, bevel=0.8),
        cyl(k + "/socket", TIP_R, TIP_H + 0.01, y=-0.01, sub=True, segs=48),
    ]
    return group(k, "Wind Dial Cap", kids, pos, GOLD)


def scene(name, children):
    return {"version": 1, "unit": "mm", "name": name, "id": uid("scene/" + name), "children": children}


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    parts = {
        "wind-dial-base": scene("wind-dial-base", [base_part()]),
        "wind-dial-vane": scene("wind-dial-vane", [vane_part()]),
        "wind-dial-cap": scene("wind-dial-cap", [cap_part()]),
        "wind-dial-washer": scene("wind-dial-washer", [washer_part()]),
        # Plate layout: base, vane beside it, cap in front.
        "part-wind-dial": scene("part-wind-dial", [
            base_part((-45, 0, 0)), vane_part((38, 0, 0)), cap_part((28, 0, 45)), washer_part((48, 0, 45))]),
    }
    for fname, s in parts.items():
        (out / f"{fname}.cubby").write_text(json.dumps(s, indent=1))
        print("wrote", out / f"{fname}.cubby")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "wind-dial")
