import bpy

from .context import ctx


def setup_render(samples, pct):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    # Adaptive sampling stops clean pixels (sky, open water) early; the
    # denoiser does the rest. 64 samples + a 0.03 threshold looked the same
    # as 128 + 0.015 at 1080p and renders about twice as fast.
    sc.cycles.adaptive_threshold = 0.03
    sc.cycles.adaptive_min_samples = 16
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_use_gpu = True
    sc.cycles.tile_size = 2048
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 3
    sc.cycles.transmission_bounces = 4
    sc.cycles.volume_bounces = 1
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 6.0
    # Coarser volume steps: the smoke is soft, it does not need fine ones.
    sc.cycles.volume_step_rate = 4.0
    # Keep the scene resident between frames instead of rebuilding it all.
    sc.render.use_persistent_data = True
    sc.render.resolution_x = 1920
    sc.render.resolution_y = 1080
    sc.render.resolution_percentage = pct
    sc.render.fps = ctx.FPS
    sc.frame_start, sc.frame_end = ctx.F_START, ctx.F_END
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.5
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.color_depth = "8"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    sc.view_settings.exposure = ctx.W["exposure"]
    vl = sc.view_layers[0]
    vl.use_pass_mist = True
    vl.use_pass_environment = True
    build_compositor()


def build_compositor():
    """Aerial perspective. Film is transparent so the sky arrives separately
    (the Environment pass); only the geometry is hazed by the Mist pass, then
    the sky goes back behind it. Hazing the sky too would wash out the
    clouds, which already fade toward the horizon on their own.

    This is only light haze over distance. Real fog is a volume in the scene
    (weather.build_fog_bank): a 2D haze can't scatter light, can't reach
    the sky, and fringes around edges once it gets thick."""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new("Seascape Comp", "CompositorNodeTree")
    sc.compositing_node_group = ng
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    N, L = ng.nodes, ng.links
    rl = N.new("CompositorNodeRLayers")
    out = N.new("NodeGroupOutput")
    fog = ctx.W["fog"]

    def mix(blend, fac, a, b):
        n = N.new("ShaderNodeMix"); n.data_type = "RGBA"; n.blend_type = blend
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = v
            else:
                L.new(v, sock)
        return n.outputs[2]

    f = N.new("ShaderNodeMath"); f.operation = "MULTIPLY"; f.use_clamp = True
    L.new(rl.outputs["Mist"], f.inputs[0]); f.inputs[1].default_value = ctx.W["mist"]
    fog_a = mix("MULTIPLY", 1.0, fog, rl.outputs["Alpha"])
    hazed = mix("MIX", f.outputs[0], rl.outputs["Image"], fog_a)
    inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    L.new(rl.outputs["Alpha"], inv.inputs[1])
    env = mix("MULTIPLY", 1.0, rl.outputs["Environment"], inv.outputs[0])
    final = mix("ADD", 1.0, hazed, env)
    try:
        gl = N.new("CompositorNodeGlare")
        print("[seascape] glare inputs", [i.name for i in gl.inputs])
        if "Type" in gl.inputs:
            gl.inputs["Type"].default_value = "Fog Glow"
        else:
            gl.glare_type = "FOG_GLOW"
        L.new(final, gl.inputs[0])
        for name, v in (("Threshold", 1.6), ("Strength", 0.6), ("Size", 0.6)):
            if name in gl.inputs:
                gl.inputs[name].default_value = v
        final = gl.outputs[0]
    except Exception as e:
        print("[seascape] glare skipped:", e)
    L.new(final, out.inputs[0])
