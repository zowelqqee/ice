"""Shared helpers for the skater build steps (headless Blender)."""

import math
import os
import sys

import bpy
from mathutils import Vector

OUT = os.environ.get("SKATER_OUT", os.path.expanduser("~/ice/skater-build/out"))
os.makedirs(OUT, exist_ok=True)


def args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def mpfb():
    """Import the MPFB services (the add-on lives in the isolated profile)."""
    import importlib
    import addon_utils

    mod = "bl_ext.user_default.mpfb"
    if not addon_utils.check(mod)[1]:
        addon_utils.enable(mod, default_set=True)
    return importlib.import_module(mod)


def out(*parts):
    return os.path.join(OUT, *parts)


def cycles(samples=48, res=(900, 1200), transparent=False):
    scn = bpy.context.scene
    scn.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scn.cycles.device = "GPU"
    scn.cycles.samples = samples
    scn.cycles.use_denoising = True
    scn.cycles.max_bounces = 8
    scn.cycles.transparent_max_bounces = 16
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = transparent
    scn.view_settings.view_transform = "AgX"
    scn.view_settings.look = "AgX - Medium High Contrast"
    return scn


def world(color=(0.012, 0.014, 0.022), strength=1.0):
    w = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (*color, 1)
    bg.inputs[1].default_value = strength


def area(name, loc, target, energy, size=1.0, color=(1, 1, 1), shape="DISK"):
    data = bpy.data.lights.get(name) or bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    data.shape = shape
    data.color = color
    ob = bpy.data.objects.get(name) or bpy.data.objects.new(name, data)
    if ob.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    aim(ob, target)
    return ob


def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def studio():
    """Neutral test lighting: key front-left, fill right, two rims behind."""
    world((0.02, 0.022, 0.03), 1.0)
    area("Key", (-2.2, -3.0, 2.8), (0, 0, 1.0), 420, 2.0)
    area("Fill", (2.8, -2.2, 1.4), (0, 0, 1.0), 110, 3.0, (0.85, 0.9, 1.0))
    area("RimL", (-2.0, 2.6, 2.4), (0, 0, 1.2), 450, 1.0, (0.8, 0.88, 1.0))
    area("RimR", (2.2, 2.4, 2.0), (0, 0, 1.2), 380, 1.0, (0.9, 0.92, 1.0))


def camera(name="Cam", lens=85):
    data = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    data.lens = lens
    data.clip_start = 0.05
    ob = bpy.data.objects.get(name) or bpy.data.objects.new(name, data)
    if ob.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(ob)
    bpy.context.scene.camera = ob
    return ob


def shoot(path, azimuth_deg, target=(0, 0, 0.95), dist=5.2, elev_deg=4, lens=85, res=None):
    """Azimuth 0 = camera in front of the figure (figure faces -Y)."""
    cam = camera(lens=lens)
    a = math.radians(azimuth_deg)
    e = math.radians(elev_deg)
    t = Vector(target)
    cam.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    aim(cam, t)
    scn = bpy.context.scene
    if res:
        scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


def clay(on=True):
    """Grey material override for geometry checks."""
    vl = bpy.context.view_layer
    if not on:
        vl.material_override = None
        return
    m = bpy.data.materials.get("clay") or bpy.data.materials.new("clay")
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (0.5, 0.5, 0.52, 1)
    b.inputs["Roughness"].default_value = 0.6
    vl.material_override = m
