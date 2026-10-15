"""Presentation renders of the finished model, laid out like a character reference sheet:
main view, FRONT / SIDE / BACK, DETAILS (bodice, back), WIREFRAME.

    scripts/skater/run.sh render_sheet.py [posed.blend] [--quick]
    python3 scripts/skater/compose_sheet.py      # lays the renders out (needs Pillow)
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402
from costume import node_mat  # noqa: E402

V = Vector
QUICK = "--quick" in C.args()
S = 0.5 if QUICK else 1.0  # resolution scale


# ---------------------------------------------------------------- stage
def ice_floor():
    me = bpy.data.meshes.new("ice")
    r = 9.0
    me.from_pydata([(-r, -r, 0), (r, -r, 0), (r, r, 0), (-r, r, 0)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new("ice", me)
    bpy.context.scene.collection.objects.link(ob)
    m, nt = node_mat("ice")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.012, 0.014, 0.02, 1)
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.03
    tc = nt.nodes.new("ShaderNodeTexCoord")
    # skate tracings: rings around the spin centre and a few off-centre arcs
    marks = None
    for cx, cy, sc, dist in ((0.0, 0.0, 2.2, 0.6), (0.7, -0.5, 1.6, 0.8), (-0.9, 0.35, 1.3, 0.7)):
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Location"].default_value = (-cx, -cy, 0)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        w = nt.nodes.new("ShaderNodeTexWave")
        w.wave_type = "RINGS"
        w.rings_direction = "SPHERICAL"
        w.wave_profile = "SAW"
        w.inputs["Scale"].default_value = sc
        w.inputs["Distortion"].default_value = dist
        w.inputs["Detail"].default_value = 4
        nt.links.new(mp.outputs[0], w.inputs["Vector"])
        cr = nt.nodes.new("ShaderNodeValToRGB")
        cr.color_ramp.elements[0].position = 0.988
        cr.color_ramp.elements[0].color = (0, 0, 0, 1)
        cr.color_ramp.elements[1].position = 0.998
        cr.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(w.outputs["Fac"], cr.inputs["Fac"])
        if marks is None:
            marks = cr.outputs["Color"]
        else:
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type = "RGBA"
            mx.blend_type = "LIGHTEN"
            mx.inputs["Factor"].default_value = 1.0
            nt.links.new(marks, mx.inputs["A"])
            nt.links.new(cr.outputs["Color"], mx.inputs["B"])
            marks = mx.outputs["Result"]
    # marks fade out away from the skater
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    gm = nt.nodes.new("ShaderNodeMapping")
    gm.inputs["Scale"].default_value = (0.38, 0.38, 0.38)
    nt.links.new(tc.outputs["Object"], gm.inputs["Vector"])
    nt.links.new(gm.outputs[0], grad.inputs["Vector"])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(marks, mul.inputs["A"])
    nt.links.new(grad.outputs["Color"], mul.inputs["B"])
    frost = nt.nodes.new("ShaderNodeMix")
    frost.data_type = "RGBA"
    frost.inputs["A"].default_value = (0.012, 0.014, 0.02, 1)
    frost.inputs["B"].default_value = (0.11, 0.12, 0.145, 1)
    nt.links.new(mul.outputs["Result"], frost.inputs["Factor"])
    nt.links.new(frost.outputs["Result"], b.inputs["Base Color"])
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.06
    rough.inputs["To Max"].default_value = 0.6
    nt.links.new(mul.outputs["Result"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], b.inputs["Roughness"])
    nt.links.new(b.outputs[0], o.inputs["Surface"])
    me.materials.append(m)
    return ob


def ice_spray():
    """Snow kicked up by the supporting blade: chips fanned out to one side, a few in the air.
    Parented to the armature object so it turns with her in the turntable."""
    blade = bpy.data.objects.get("skate_blade_l")
    if blade is None:
        return None
    dg = bpy.context.evaluated_depsgraph_get()
    pts = [blade.matrix_world @ v.co for v in blade.evaluated_get(dg).data.vertices]
    low = min(pts, key=lambda p: p.z)
    a, b = max(pts, key=lambda p: p.y), min(pts, key=lambda p: p.y)
    d = b - a
    d.z = 0
    d.normalize()
    side = V((-d.y, d.x, 0))
    rnd = random.Random(5)
    bm = bmesh.new()
    for _ in range(450):
        s = rnd.gauss(0.01, 0.035)
        o = (0.012 + abs(rnd.gauss(0, 0.06))) * (1 if rnd.random() < 0.85 else -0.3)
        airborne = rnd.random() < 0.12
        h = abs(rnd.gauss(0, 0.014)) * max(0.0, 1 - abs(o) * 7) if airborne else 0.0
        p = low + d * s + side * o + V((0, 0, h + 0.0003))
        r = rnd.uniform(0.00025, 0.0011)
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=Matrix.Translation(p))
    me = bpy.data.meshes.new("ice_spray")
    bm.to_mesh(me)
    bm.free()
    m, nt = node_mat("snow")
    o_ = nt.nodes.new("ShaderNodeOutputMaterial")
    sb = nt.nodes.new("ShaderNodeBsdfPrincipled")
    sb.inputs["Base Color"].default_value = (0.85, 0.9, 0.96, 1)
    sb.inputs["Roughness"].default_value = 0.3
    sb.inputs["Transmission Weight"].default_value = 0.35
    nt.links.new(sb.outputs[0], o_.inputs["Surface"])
    me.materials.append(m)
    ob = bpy.data.objects.new("ice_spray", me)
    bpy.context.scene.collection.objects.link(ob)
    arm = bpy.data.objects["skater"]
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    return ob


def light_rig():
    rig = bpy.data.objects.new("light_rig", None)
    bpy.context.scene.collection.objects.link(rig)
    C.world((0.0025, 0.003, 0.0045), 1.0)
    t = (0, 0, 1.05)
    specs = [
        ("Key", (-2.6, -3.4, 3.3), t, 520, 2.4, (1.0, 0.95, 0.9), "DISK"),
        ("Fill", (3.2, -2.6, 1.2), t, 90, 3.0, (0.8, 0.87, 1.0), "DISK"),
        ("RimL", (-2.3, 2.9, 2.3), (0, 0, 1.2), 480, 0.7, (0.78, 0.86, 1.0), "DISK"),
        ("RimR", (2.5, 2.7, 2.0), (0, 0, 1.2), 420, 0.7, (0.88, 0.9, 1.0), "DISK"),
        ("Top", (0.3, -0.4, 4.2), (0, 0, 1.4), 220, 1.2, (0.95, 0.97, 1.0), "DISK"),
    ]
    for name, loc, tgt, e, size, col, shape in specs:
        ob = C.area(name, loc, tgt, e, size, col, shape)
        ob.parent = rig
    # pool of light on the ice
    sd = bpy.data.lights.new("Pool", "SPOT")
    sd.energy = 1800
    sd.spot_size = math.radians(34)
    sd.spot_blend = 0.85
    sd.color = (0.85, 0.9, 1.0)
    sd.shadow_soft_size = 0.4
    sp = bpy.data.objects.new("Pool", sd)
    bpy.context.scene.collection.objects.link(sp)
    sp.location = (0, -0.2, 6.0)
    C.aim(sp, (0, 0, 0))
    return rig


def shoot(rig, path, az, target, dist, res, elev=3.0, lens=85, samples=128):
    rig.rotation_euler = (0, 0, math.radians(az))
    scn = bpy.context.scene
    scn.cycles.samples = int(samples * (0.5 if QUICK else 1))
    C.shoot(path, az, target=target, dist=dist, elev_deg=elev, lens=lens,
            res=(int(res[0] * S), int(res[1] * S)))


# ---------------------------------------------------------------- wireframe
def wire_mode(on, saved):
    """Clay figure with every visible edge drawn (Freestyle), at base subdivision level."""
    scn = bpy.context.scene
    vl = bpy.context.view_layer
    if on:
        m, nt = node_mat("clay_wire")
        o = nt.nodes.new("ShaderNodeOutputMaterial")
        b = nt.nodes.new("ShaderNodeBsdfDiffuse")
        b.inputs["Color"].default_value = (0.16, 0.17, 0.2, 1)
        nt.links.new(b.outputs[0], o.inputs["Surface"])
        vl.material_override = m
        scn.render.use_freestyle = True
        scn.render.line_thickness_mode = "ABSOLUTE"
        scn.render.line_thickness = 0.55
        fs = vl.freestyle_settings
        fs.crease_angle = math.pi
        ls = fs.linesets[0] if fs.linesets else fs.linesets.new("edges")
        ls.select_by_edge_types = True
        ls.select_crease = ls.select_silhouette = ls.select_border = True
        if ls.linestyle is None:
            ls.linestyle = bpy.data.linestyles.new("wire")
        ls.linestyle.color = (0.72, 0.78, 0.9)
        ls.linestyle.thickness = 0.55
    else:
        vl.material_override = None
        scn.render.use_freestyle = False
    for ob in bpy.data.objects:
        if ob.type not in ("MESH", "CURVES"):
            continue
        if on:
            saved[ob.name] = ([(md.name, md.render_levels) for md in ob.modifiers if md.type == "SUBSURF"], ob.hide_render)
            if ob.type == "CURVES" or ob.name in ("ice", "crystals", "frost_veins") or "laces" in ob.name or "hardware" in ob.name:
                ob.hide_render = True
            for md in ob.modifiers:
                if md.type == "SUBSURF":
                    md.render_levels = 0
        else:
            subs, hid = saved[ob.name]
            for name, lv in subs:
                ob.modifiers[name].render_levels = lv
            ob.hide_render = hid


def wire_strip(rig):
    """Three small wireframe figures (front, side, back); compose_sheet.py lays them out."""
    saved = {}
    wire_mode(True, saved)
    bpy.data.objects["Pool"].hide_render = True
    for i, az in enumerate((0, -90, 180)):
        # rendered at 3x and reduced when composed, so the lines stay fine
        shoot(rig, C.out(f"sheet_wire_{i}.png"), az, (0, 0, 0.98), 6.0, (516, 855), elev=2, samples=16)
    wire_mode(False, saved)
    bpy.data.objects["Pool"].hide_render = False


if __name__ == "__main__":
    a = [x for x in C.args() if not x.startswith("--")]
    bpy.ops.wm.open_mainfile(filepath=a[0] if a else C.out("posed.blend"))
    for n in ("Key", "Fill", "RimL", "RimR", "Cam"):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    scn = C.cycles(samples=128)
    scn.cycles.transparent_max_bounces = 64
    scn.cycles.max_bounces = 10
    scn.view_settings.look = "AgX - Base Contrast"
    scn.view_settings.exposure = 0.0
    ice_floor()
    ice_spray()
    rig = light_rig()
    shots = [
        ("main", 12, (0, 0, 0.98), 5.6, (1020, 2304), 3, 85, 160),
        ("front", 0, (0, 0, 0.98), 6.0, (516, 578), 2, 70, 96),
        ("side", -90, (0, 0, 0.98), 6.0, (516, 578), 2, 70, 96),
        ("back", 180, (0, 0, 0.98), 6.0, (516, 578), 2, 70, 96),
        ("detail_front", 8, (0, -0.06, 1.2), 1.25, (258, 285), 2, 85, 128),
        ("detail_back", 180, (0, 0.02, 1.22), 1.25, (258, 285), 2, 85, 128),
    ]
    for key, az, tgt, dist, res, elev, lens, smp in shots:
        shoot(rig, C.out(f"sheet_{key}.png"), az, tgt, dist, res, elev, lens, smp)
    wire_strip(rig)
    with open(C.out("sheet_scale.txt"), "w") as f:
        f.write(str(S))
