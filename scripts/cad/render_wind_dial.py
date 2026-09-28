"""Render the assembled Wind Dial for the rulebook (assets/images/renders/wind-dial.png).

  blender -b --python scripts/cad/render_wind_dial.py -- <stl-dir> <out.png> <exploded 0|1>

Raised faces on the vane are coloured (blue) as a filament swap at 2.8 mm
would print them. Crop the transparent margin after.
"""
import bpy, sys, math
S = sys.argv[sys.argv.index('--')+1]
out = sys.argv[sys.argv.index('--')+2]
exploded = sys.argv[sys.argv.index('--')+3] == '1'
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(n, col):
    m = bpy.data.materials.new(n); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = col; b.inputs['Roughness'].default_value = 0.55
    return m
def load(n, z, col, rot=0, swap=None, swap_col=None):
    bpy.ops.wm.stl_import(filepath=f"{S}/{n}.stl")
    o = bpy.context.selected_objects[0]; o.location.z = z; o.rotation_euler.z = math.radians(rot)
    o.data.materials.append(mat(n, col))
    if swap is not None:
        # Filament swap: every face above the swap height prints in the second colour.
        o.data.materials.append(mat(n + '-swap', swap_col))
        for f in o.data.polygons:
            if f.center.z > swap + 0.05: f.material_index = 1
    for f in o.data.polygons: f.use_smooth = False
    return o
e = 14 if exploded else 0
load('wind-dial-base', 0, (0.30, 0.19, 0.11, 1))
load('wind-dial-washer', 4.4 + e * 0.5, (0.66, 0.50, 0.10, 1))
load('wind-dial-vane', 6.0 + e, (0.85, 0.76, 0.55, 1), rot=35, swap=2.8, swap_col=(0.10, 0.28, 0.50, 1))
load('wind-dial-cap', 9.2 + 2 * e, (0.66, 0.50, 0.10, 1))
bpy.ops.object.camera_add(location=(95, -120, 110)); cam = bpy.context.object
c = cam.constraints.new('TRACK_TO'); t = bpy.data.objects.new('t', None); bpy.context.collection.objects.link(t); t.location = (0, 0, 6 + e); c.target = t
bpy.context.scene.camera = cam; cam.data.lens = 60
bpy.ops.object.light_add(type='SUN', location=(50, -50, 100)); bpy.context.object.data.energy = 4; bpy.context.object.rotation_euler = (math.radians(35), 0, math.radians(30))
w = bpy.data.worlds.new('w'); bpy.context.scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.9, 0.87, 0.8, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x = 1000; sc.render.resolution_y = 760; sc.render.film_transparent = True; sc.render.filepath = out
bpy.ops.render.render(write_still=True)
