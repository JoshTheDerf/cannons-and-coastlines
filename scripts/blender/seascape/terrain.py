import math

import bpy
import bmesh
from mathutils import Matrix, Vector, noise

from .util import link, part_object, set_object_material


def place_piece(coll, stl, name, mat, at, rot_z, scale, sink=0.0, anchor=None):
    o = part_object(name, stl, smooth=40)
    link(o, coll)
    me = o.data
    if anchor is None:
        xs = [v.co.x for v in me.vertices]
        ys = [v.co.y for v in me.vertices]
        anchor = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(v.co.z for v in me.vertices))
    o.matrix_world = (Matrix.Translation(Vector(at) + Vector((0, 0, -sink)))
                      @ Matrix.Rotation(math.radians(rot_z), 4, "Z")
                      @ Matrix.Scale(scale, 4)
                      @ Matrix.Translation(-Vector(anchor)))
    set_object_material(o, mat)
    return o


def backdrop_island(coll, name, center, radius, height, seed, mat):
    """Distant headland: a noise heightfield under a soft radial mask, so it
    rises out of the sea with a ragged ridge line."""
    n = 120
    bm = bmesh.new()
    verts = []
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            u, v = i / n * 2 - 1, j / n * 2 - 1
            r = math.hypot(u * 1.0, v * 1.9)
            mask = max(0.0, 1 - r) ** 1.3
            p = Vector((u * 2.2, v * 1.2, 0)) + off
            h = 0.55 + 0.45 * noise.fractal(p, 0.55, 2.1, 6)
            ridge = 1 - abs(noise.noise(p * 1.7 + Vector((5, 1, 0))))
            z = height * mask * (h * 0.75 + ridge * 0.35)
            row.append(bm.verts.new((center.x + u * radius, center.y + v * radius * 0.55, z - height * 0.04)))
        verts.append(row)
    for j in range(n):
        for i in range(n):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    o = link(bpy.data.objects.new(name, me), coll)
    me.materials.append(mat)
    return o
