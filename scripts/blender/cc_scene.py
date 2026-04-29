"""Scene reset, camera, and lighting for render_stls."""

import math

import bpy
from mathutils import Vector


def reset_scene(engine: str, samples: int, res: int):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Purge orphan datablocks (materials, meshes, images, node trees) that
    # `read_factory_settings` leaves behind. Without this, every iteration
    # of a batch render leaks the previous run's materials/meshes and Cycles
    # gets progressively slower until OOM.
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True,
                                   do_recursive=True)
    scene = bpy.context.scene

    scene.render.engine = engine
    if engine == "CYCLES":
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        try:
            scene.cycles.device = "GPU"
        except Exception:
            pass

    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    # Standard view transform: predictable colors, no exposure rolloff.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    # World as a vertical gradient: brighter from above, dim from below. This
    # is image-based lighting that fills metallic surfaces from every
    # direction -- without it, vertical walls have no environment to reflect
    # back to the camera and read as flat colour. Film is transparent so the
    # gradient never appears in the saved alpha; only its lighting
    # contribution survives.
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = 1.0

    geom = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    remap = nt.nodes.new("ShaderNodeMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = 0.5
    remap.inputs[2].default_value = 0.5  # remap [-1, 1] -> [0, 1]
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.012, 0.012, 0.015, 1.0)  # below
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.14, 0.14, 0.155, 1.0)    # above
    nt.links.new(geom.outputs["Incoming"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], remap.inputs[0])
    nt.links.new(remap.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])


def add_top_camera():
    """Pure top-down orthographic camera looking along -Z."""
    bpy.ops.object.camera_add(location=(0.0, 0.0, 50.0))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 4.0  # placeholder; overwritten by fit_ortho
    cam.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.scene.camera = cam
    return cam


def _remove_all_lights():
    for obj in [o for o in bpy.context.scene.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)


def add_top_view_lights():
    """Replace the iso rig with lighting tailored to top-down shots:
      1. A mild neutral world environment so metallic surfaces have
         something to reflect back to the camera.
      2. Two offset overhead area lights at unequal intensities to create a
         soft highlight gradient across flat surfaces.
      3. A low rake light to cast shadows from any relief detail.
    """
    _remove_all_lights()
    # World gradient already provides environment reflections (set in
    # reset_scene); we leave it as-is for the top view.

    # 2a. Overhead key, offset toward camera-bottom-left.
    bpy.ops.object.light_add(type="AREA", location=(-2.5, -2.5, 5.0))
    overhead_a = bpy.context.object
    overhead_a.data.energy = 150.0
    overhead_a.data.size = 4.0
    overhead_a.rotation_euler = (
        Vector((0, 0, 0)) - overhead_a.location
    ).to_track_quat("-Z", "Y").to_euler()

    # 2b. Overhead fill, offset opposite, weaker so flat metal shows a gradient.
    bpy.ops.object.light_add(type="AREA", location=(2.5, 2.5, 5.0))
    overhead_b = bpy.context.object
    overhead_b.data.energy = 75.0
    overhead_b.data.size = 4.0
    overhead_b.rotation_euler = (
        Vector((0, 0, 0)) - overhead_b.location
    ).to_track_quat("-Z", "Y").to_euler()

    # 3. Low rake to shadow any relief detail.
    bpy.ops.object.light_add(type="AREA", location=(-3.5, -3.5, 1.0))
    rake = bpy.context.object
    rake.data.energy = 115.0
    rake.data.size = 3.5
    rake.rotation_euler = (
        Vector((0, 0, 0.4)) - rake.location
    ).to_track_quat("-Z", "Y").to_euler()


def add_iso_camera(elevation_deg: float, azimuth_deg: float):
    elev = math.radians(elevation_deg)
    azim = math.radians(azimuth_deg)
    distance = 50.0
    x = distance * math.cos(elev) * math.sin(azim)
    y = -distance * math.cos(elev) * math.cos(azim)
    z = distance * math.sin(elev)
    bpy.ops.object.camera_add(location=(x, y, z))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 4.0  # placeholder; overwritten by fit_ortho
    direction = Vector((0.0, 0.0, 0.0)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def add_lights():
    # Key: directional sun, scale-independent.
    bpy.ops.object.light_add(type="SUN", location=(5.0, -5.0, 8.0))
    key = bpy.context.object
    key.data.energy = 1.4
    key.data.angle = math.radians(10)
    key.rotation_euler = (math.radians(50), 0.0, math.radians(35))

    # Fill from camera-left.
    bpy.ops.object.light_add(type="AREA", location=(-4.0, -3.0, 3.0))
    fill = bpy.context.object
    fill.data.energy = 70.0
    fill.data.size = 6.0
    fill.rotation_euler = (
        Vector((0, 0, 0)) - fill.location
    ).to_track_quat("-Z", "Y").to_euler()

    # Rim from behind to lift silhouette off transparent background.
    bpy.ops.object.light_add(type="AREA", location=(2.0, 5.0, 4.0))
    rim = bpy.context.object
    rim.data.energy = 55.0
    rim.data.size = 4.0
    rim.rotation_euler = (
        Vector((0, 0, 0)) - rim.location
    ).to_track_quat("-Z", "Y").to_euler()

    # Top kicker: helps gold catch a highlight in iso view, and lights the
    # face of coins in top view.
    bpy.ops.object.light_add(type="AREA", location=(0.0, 0.0, 6.0))
    top = bpy.context.object
    top.data.energy = 40.0
    top.data.size = 5.0
    top.rotation_euler = (0.0, 0.0, 0.0)  # pointing straight down (-Z)

    # Low-angle sun from the iso camera's azimuth, ~15 deg above horizon.
    # Sun lights have no distance falloff, so this gives a strong, even
    # grazing highlight along vertical exterior walls (e.g. coin rims) that
    # the overhead lights miss. Aimed by rotating its local -Z toward the
    # equivalent of (-cos15*sin45, +cos15*cos45, -sin15).
    bpy.ops.object.light_add(type="SUN", location=(0.0, 0.0, 0.0))
    rim_sun = bpy.context.object
    rim_sun.data.energy = 2.0
    rim_sun.data.angle = math.radians(4)
    direction = Vector((-math.cos(math.radians(15)) * math.sin(math.radians(45)),
                        +math.cos(math.radians(15)) * math.cos(math.radians(45)),
                        -math.sin(math.radians(15))))
    rim_sun.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def fit_ortho_to_objects(cam, objs, margin: float):
    """Set ortho_scale to enclose all object bbox corners as seen from the camera."""
    # Force a depsgraph evaluation so cam.matrix_world reflects the most recent
    # location/rotation set since the camera was added.
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for o in objs:
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            cc = inv @ wc
            xs.append(cc.x)
            ys.append(cc.y)
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    extent = max(width, height) * margin
    cam.data.ortho_scale = max(extent, 0.01)
