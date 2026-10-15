"""Step 2: the costume, built on the rest-pose body so every piece carries the body's skin weights.

- One fabric shell over torso and arms. Two signed-distance attributes cut it with smooth edges:
  `cover` (fabric exists: scoop neck, open back V, leg line, wrists) and `opaque` (navy velvet
  bodice with the deep front V; everything else covered is sheer navy mesh).
- Skirt: two flared chiffon layers (navy over lavender), fluted hem, attached at a dropped waist.
  Bound to the pelvis; a shrinkwrap keeps it outside the body once posed.

    scripts/skater/run.sh costume.py [--preview]
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402

V = Vector
OUTSIDE = -1.0  # sdf value for "not applicable"


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- rest body
def bake_shape(body):
    """Fold MakeHuman's target shape keys into the mesh, so 'original coordinates' (used by the
    corrective smooth) are the shaped body, not the generic base mesh."""
    if not body.data.shape_keys:
        return
    saved = [(m, m.show_viewport) for m in body.modifiers]
    for m, _ in saved:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg).to_mesh()
    co = [0.0] * (len(ev.vertices) * 3)
    ev.vertices.foreach_get("co", co)
    body.evaluated_get(dg).to_mesh_clear()
    for m, v in saved:
        m.show_viewport = v
    body.shape_key_clear()
    body.data.vertices.foreach_set("co", co)
    body.data.update()


def smooth_bust(body):
    """Flatten the nipples: a bodice holds the bust smooth. Local Laplacian smoothing around each
    breast's apex, on the body itself, so skin and every garment built from it agree."""
    me = body.data
    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.active
    gi = body.vertex_groups["body"].index
    skin = [v for v in bm.verts if v[dl].get(gi, 0.0) > 0.5]
    ni = body.vertex_groups["nipple"].index  # MakeHuman marks the nipples
    for sx in (1, -1):
        nip = [v.co for v in skin if v[dl].get(ni, 0.0) > 0.5 and v.co.x * sx > 0]
        apex = sum(nip, Vector()) / len(nip)
        # the breast around the nipple, as a sphere fitted to a ring of surrounding skin
        ring = [v.co for v in skin if 0.026 < (v.co - apex).length < 0.048]
        import numpy as np
        P_ = np.array([tuple(p) for p in ring])
        A = np.c_[2 * P_, np.ones(len(P_))]
        sol, *_ = np.linalg.lstsq(A, (P_ ** 2).sum(1), rcond=None)
        c = Vector(sol[:3])
        r = math.sqrt(sol[3] + c.length_squared)
        region = [v for v in skin if (v.co - apex).length < 0.03]
        for v in region:
            w = 1.0 - smoothstep(0.02, 0.03, (v.co - apex).length)
            v.co = v.co.lerp(c + (v.co - c).normalized() * r, w)
        for _ in range(6):
            bmesh.ops.smooth_vert(bm, verts=region, factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        print("bust smoothed", "lr"[sx < 0], len(region), "verts, sphere r", round(r, 3))
    bm.to_mesh(me)
    bm.free()
    me.update()


def rest_mesh(body):
    """Body mesh with the shape keys mixed in, helpers removed, weights kept."""
    saved = [(m, m.show_viewport) for m in body.modifiers]
    for m, _ in saved:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    for m, v in saved:
        m.show_viewport = v
    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.active
    gi = body.vertex_groups["body"].index
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[dl].get(gi, 0.0) < 0.5], context="VERTS")
    bm.normal_update()
    bpy.data.meshes.remove(me)
    return bm


class Landmarks:
    def __init__(self, arm):
        b = arm.data.bones
        self.neck = b["neck_01"].head_local.copy()
        self.neck_tail = b["neck_01"].tail_local.copy()
        self.wrist = {s: b[f"lowerarm_{s}"].tail_local.copy() for s in "lr"}
        self.elbow = {s: b[f"lowerarm_{s}"].head_local.copy() for s in "lr"}
        self.crotch = 0.795
        self.waist = 1.03
        self.armpit = 1.185
        self.bust_top = 1.235
        self.skirt_front, self.skirt_back = 0.972, 0.995

    def neck_axis_y(self, z):
        t = (z - self.neck.z) / (self.neck_tail.z - self.neck.z)
        return self.neck.y + (self.neck_tail.y - self.neck.y) * t

    def spine_y(self, z):
        return -0.01


def arm_weight(v, dl, names):
    return sum(v[dl].get(i, 0.0) for i in names)


def fields(bm, body, L):
    """Per-vertex signed distances (m): cover > 0 = fabric, opaque > 0 = velvet."""
    bm.verts.index_update()
    dl = bm.verts.layers.deform.active
    vg = body.vertex_groups
    arm_ids = {s: [g.index for g in vg if g.name.endswith("_" + s) and any(
        g.name.startswith(p) for p in ("upperarm", "lowerarm", "hand", "thumb", "index", "middle", "ring", "pinky"))]
        for s in "lr"}
    cover, opaque = {}, {}
    for v in bm.verts:
        p = v.co
        side = "l" if p.x > 0 else "r"
        is_arm = arm_weight(v, dl, arm_ids[side]) > 0.5 and abs(p.x) > 0.16
        if is_arm:
            fa = (L.wrist[side] - L.elbow[side]).normalized()
            wrist_sd = (L.wrist[side] - p).dot(fa) - 0.006
            cover[v.index] = wrist_sd
            opaque[v.index] = -0.05
            continue
        ax = abs(p.x)
        front = p.y < L.spine_y(p.z) - 0.02
        # leg line: high at the hip, low at the crotch; a little lower behind
        z_leg = L.crotch + 0.42 * max(0.0, ax - 0.015) ** 1.15 - (0.02 if not front else 0.0)
        leg_sd = p.z - z_leg
        # scoop neck
        if p.z > 1.25:
            d = math.hypot(p.x, p.y - L.neck_axis_y(p.z))
            ang = math.atan2(abs(p.x), -(p.y - L.neck_axis_y(p.z)))  # 0 = front
            R = 0.069 + 0.004 * smoothstep(0.5, 1.6, ang)
            neck_sd = d - R
        else:
            neck_sd = 1.0
        # open back: V from the shoulder blades to the low back
        zb, zt, W = 0.985, 1.345, 0.142
        wb = W * max(0.0, (p.z - zb) / (zt - zb)) ** 0.9 if p.z > zb else -1.0
        back_open = min(wb - ax, p.y - (L.spine_y(p.z) + 0.0))
        c = min(leg_sd, neck_sd, -back_open, 1.372 - p.z)
        cover[v.index] = c
        # velvet: up to the bust top in front, under the arm at the side and back
        if front:
            # velvet rises in petals from the V toward the front of the armpit, then drops to it
            z_edge = L.bust_top + 0.032 * smoothstep(0.05, 0.12, ax)
            z_edge += (L.armpit - z_edge) * smoothstep(0.13, 0.17, ax)
            wf = 0.052 * max(0.0, (p.z - 1.06) / (L.bust_top - 1.06)) ** 0.8 if p.z > 1.06 else -1.0
            v_sd = wf - ax  # > 0 inside the sheer V insert
        else:
            z_edge = L.armpit
            v_sd = -1.0
        band = ax - (wb + 0.02) if (not front and p.z > zb) else 1.0  # sheer strip along the back V
        opaque[v.index] = min(z_edge - p.z, -v_sd, c, band)
    return cover, opaque


# ---------------------------------------------------------------- materials
def node_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt


def velvet_bsdf(nt, color=(0.005, 0.007, 0.032)):
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = 0.7
    b.inputs["Specular IOR Level"].default_value = 0.25
    b.inputs["Sheen Weight"].default_value = 0.16
    b.inputs["Sheen Roughness"].default_value = 0.3
    b.inputs["Sheen Tint"].default_value = (0.2, 0.26, 0.75, 1)
    # crushed velvet: soft noise in the normal
    tex = nt.nodes.new("ShaderNodeTexNoise")
    tex.inputs["Scale"].default_value = 260
    tex.inputs["Detail"].default_value = 6
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.0004
    nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return b


def sheer_shader(nt, color=(0.004, 0.005, 0.026), base=0.64, edge=0.15):
    """Mesh fabric: transparent face-on, denser at grazing angles."""
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = 1.6
    nt.links.new(lw.outputs["Facing"], pw.inputs[0])
    ma = nt.nodes.new("ShaderNodeMath")
    ma.operation = "MULTIPLY_ADD"
    ma.inputs[1].default_value = edge
    ma.inputs[2].default_value = base
    ma.use_clamp = True
    nt.links.new(pw.outputs[0], ma.inputs[0])
    fab = nt.nodes.new("ShaderNodeBsdfPrincipled")
    fab.inputs["Base Color"].default_value = (*color, 1)
    fab.inputs["Roughness"].default_value = 0.8
    fab.inputs["Specular IOR Level"].default_value = 0.3
    fab.inputs["Sheen Weight"].default_value = 0.06
    fab.inputs["Sheen Tint"].default_value = (0.3, 0.38, 0.9, 1)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(ma.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(fab.outputs[0], mix.inputs[2])
    return mix


def attr_step(nt, name):
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_name = name
    g = nt.nodes.new("ShaderNodeMath")
    g.operation = "GREATER_THAN"
    g.inputs[1].default_value = 0.0
    nt.links.new(a.outputs["Fac"], g.inputs[0])
    return g


def shell_material():
    m, nt = node_mat("costume_shell")
    outn = nt.nodes.new("ShaderNodeOutputMaterial")
    vel = velvet_bsdf(nt)
    sheer = sheer_shader(nt)
    cov = attr_step(nt, "cover")
    opq = attr_step(nt, "opaque")
    m1 = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(opq.outputs[0], m1.inputs[0])
    nt.links.new(sheer.outputs[0], m1.inputs[1])
    nt.links.new(vel.outputs[0], m1.inputs[2])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    m2 = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(cov.outputs[0], m2.inputs[0])
    nt.links.new(tr.outputs[0], m2.inputs[1])
    nt.links.new(m1.outputs[0], m2.inputs[2])
    nt.links.new(m2.outputs[0], outn.inputs["Surface"])
    return m


def chiffon_material(name, color, base, edge, sheen_tint):
    m, nt = node_mat(name)
    outn = nt.nodes.new("ShaderNodeOutputMaterial")
    sh = sheer_shader(nt, color, base, edge)
    fab = [n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"][0]
    fab.inputs["Sheen Tint"].default_value = (*sheen_tint, 1)
    fab.inputs["Sheen Weight"].default_value = 0.25
    # rolled hem: a thin, denser, lighter thread line along the edge (v near 1)
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "UVMap"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs["Vector"])
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = 0.982
    nt.links.new(sep.outputs["Y"], gt.inputs[0])
    hem = nt.nodes.new("ShaderNodeBsdfPrincipled")
    hem.inputs["Base Color"].default_value = (color[0] * 3 + 0.015, color[1] * 3 + 0.015, color[2] * 2.5 + 0.05, 1)
    hem.inputs["Roughness"].default_value = 0.55
    hem.inputs["Sheen Weight"].default_value = 0.35
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(gt.outputs[0], mix.inputs[0])
    nt.links.new(sh.outputs[0], mix.inputs[1])
    nt.links.new(hem.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], outn.inputs["Surface"])
    return m


# ---------------------------------------------------------------- shell
def build_shell(bm_rest, body, arm, L):
    bm = bm_rest.copy()
    cover, opaque = fields(bm, body, L)
    keep = set()
    for f in bm.faces:
        if max(cover[v.index] for v in f.verts) > -0.03:
            keep.add(f.index)
    cov_l = bm.verts.layers.float.new("cover")
    opq_l = bm.verts.layers.float.new("opaque")
    for v in bm.verts:
        v[cov_l] = cover[v.index]
        v[opq_l] = opaque[v.index]
    # Faces outside the costume stay (fully transparent through `cover`): with the body's exact
    # topology, the corrective smooth moves shell and skin identically, so skin never pokes through.
    # They are dropped when the model is exported.
    bm.normal_update()
    for v in bm.verts:
        off = 0.0022 if v[opq_l] > -0.01 else 0.0014
        v.co += v.normal * off
    me = bpy.data.meshes.new("costume_shell")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("costume_shell", me)
    bpy.context.scene.collection.objects.link(ob)
    for g in body.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    me.materials.append(shell_material())
    for p in me.polygons:
        p.use_smooth = True
    bind(ob, arm, relax=True)
    sub = ob.modifiers.new("Subdivision", "SUBSURF")
    sub.levels, sub.render_levels = 1, 2
    return ob


def bind(ob, arm, relax=False):
    ob.parent = arm
    m = ob.modifiers.new("Armature", "ARMATURE")
    m.object = arm
    m.use_deform_preserve_volume = True
    if relax:
        corrective(ob)


def corrective(ob):
    """Smooth away skinning creases (raised arms) while keeping the rest-pose detail."""
    cs = ob.modifiers.new("Relax deformation", "CORRECTIVE_SMOOTH")
    cs.rest_source = "ORCO"
    cs.smooth_type = "LENGTH_WEIGHTED"
    cs.iterations = 12
    cs.factor = 0.6
    # right after the armature
    ob.modifiers.move(ob.modifiers.find(cs.name), ob.modifiers.find("Armature") + 1)


def hide_skin_under_velvet(body, bm_rest, L):
    """Drop deeply covered skin from the 'body' mask group (less overdraw, no poke-through)."""
    cover, opaque = fields(bm_rest, body, L)
    gi = body.vertex_groups["body"].index
    # rest bmesh lost the helper vertices: map back by position
    from mathutils.kdtree import KDTree

    me = body.data
    kd = KDTree(len(bm_rest.verts))
    for i, v in enumerate(bm_rest.verts):
        kd.insert(v.co, i)
    kd.balance()
    deep = {i for i in range(len(bm_rest.verts)) if opaque[i] > 0.025}
    # shape-key-mixed coordinates of the original mesh
    saved = [(m, m.show_viewport) for m in body.modifiers]
    for m, _ in saved:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg).to_mesh()
    remove = []
    for v in ev.vertices:
        if any(g.group == gi and g.weight > 0.5 for g in me.vertices[v.index].groups):
            co, idx, dist = kd.find(v.co)
            if dist < 1e-5 and idx in deep:
                remove.append(v.index)
    body.evaluated_get(dg).to_mesh_clear()
    for m, v in saved:
        m.show_viewport = v
    body.vertex_groups["body"].remove(remove)
    print("hidden skin vertices", len(remove))


# ---------------------------------------------------------------- skirt
def body_section(bm_rest, zf, zb, yc, n=96):
    """Radius of the body around (0, yc) at the seam height, per angle (0 = front)."""
    r = [0.0] * n
    for v in bm_rest.verts:
        p = v.co
        if abs(p.x) > 0.25:
            continue
        ang = math.atan2(p.x, -(p.y - yc)) % (2 * math.pi)
        t = 0.5 - 0.5 * math.cos(ang)
        zs = zf + (zb - zf) * t
        if abs(p.z - zs) < 0.012:
            k = int(ang / (2 * math.pi) * n) % n
            r[k] = max(r[k], math.hypot(p.x, p.y - yc))
    for _ in range(3):  # fill gaps, smooth
        r = [max(r[i], 0.5 * (r[i - 1] + r[(i + 1) % n])) for i in range(n)]
    r = [(r[i - 1] + 2 * r[i] + r[(i + 1) % n]) / 4 for i in range(n)]
    return r


def skirt_layer(name, ring, yc, zf, zb, length, flare, folds, amp, seed, mat, nu=192, nv=26):
    rnd = random.Random(seed)
    ph = rnd.uniform(0, 6.28)
    n = len(ring)
    verts, faces = [], []
    for j in range(nv + 1):
        t = j / nv
        for i in range(nu):
            th = i / nu * 2 * math.pi
            k = th / (2 * math.pi) * n
            k0 = int(k) % n
            fr = k - int(k)
            r0 = ring[k0] * (1 - fr) + ring[(k0 + 1) % n] * fr + 0.004
            z0 = zf + (zb - zf) * (0.5 - 0.5 * math.cos(th))
            # low-frequency asymmetry of the flare and the hem, plus fluted cone folds
            lf = noise.noise(V((math.cos(th) * 1.3, math.sin(th) * 1.3, seed * 0.37)))
            hf = noise.noise(V((math.cos(th) * 3.1, math.sin(th) * 3.1, seed * 0.91 + 5)))
            L = length * (1 + 0.2 * hf + 0.07 * lf)
            a = math.radians(flare + 9 * lf) + math.radians(amp) * math.sin(folds * th + ph + 0.6 * lf) * t ** 0.8
            # the cloth leaves the waist almost vertically, then flares
            s = t * L
            bend = smoothstep(0.0, 0.35, t)
            ang = a * (0.25 + 0.75 * bend)
            rr = r0 + s * math.sin(ang)
            zz = z0 - s * math.cos(ang)
            # lettuce edge: fine ruffles growing toward the hem
            rr += 0.008 * math.sin(folds * 2.7 * th + ph * 2 + 2 * hf) * t ** 3
            rr += 0.004 * math.sin(folds * 5.3 * th + ph * 5) * t ** 6
            zz += 0.011 * math.sin(folds * 1.9 * th + ph * 3 + 3 * lf) * t ** 2.5
            zz += 0.005 * math.sin(folds * 4.1 * th + ph * 7) * t ** 5
            verts.append((math.sin(th) * rr, yc - math.cos(th) * rr, zz))
    for j in range(nv):
        for i in range(nu):
            a0 = j * nu + i
            a1 = j * nu + (i + 1) % nu
            faces.append((a0, a1, a1 + nu, a0 + nu))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    # UVs: u around, v from waist (0) to hem (1); the rolled hem is drawn from v
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uv.data[li].uv = ((vi % nu) / nu, (vi // nu) / nv)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build_skirt(bm_rest, body, arm, L):
    yc = -0.03
    ring = body_section(bm_rest, L.skirt_front, L.skirt_back, yc)
    navy = chiffon_material("chiffon_navy", (0.004, 0.006, 0.028), 0.58, 0.4, (0.2, 0.25, 0.75))
    lav = chiffon_material("chiffon_lavender", (0.03, 0.02, 0.11), 0.45, 0.4, (0.4, 0.35, 0.9))
    outer = skirt_layer("skirt_outer", ring, yc, L.skirt_front, L.skirt_back, 0.27, 63, 17, 9, 3, navy)
    middle = skirt_layer("skirt_middle", ring, yc, L.skirt_front - 0.002, L.skirt_back - 0.002, 0.255, 59, 15, 9, 5, navy)
    inner = skirt_layer("skirt_inner", ring, yc, L.skirt_front - 0.004, L.skirt_back - 0.004, 0.235, 55, 13, 8, 8, lav)
    for ob in (outer, middle, inner):
        g = ob.vertex_groups.new(name="pelvis")
        g.add(range(len(ob.data.vertices)), 1.0, "REPLACE")
        bind(ob, arm)
        sw = ob.modifiers.new("KeepOutside", "SHRINKWRAP")
        sw.target = body
        sw.wrap_method = "NEAREST_SURFACEPOINT"
        sw.wrap_mode = "OUTSIDE"
        sw.offset = {outer: 0.008, middle: 0.006}.get(ob, 0.004)
        sm = ob.modifiers.new("Relax", "CORRECTIVE_SMOOTH")
        sm.iterations = 4
        sm.rest_source = "ORCO"
        sub = ob.modifiers.new("Subdivision", "SUBSURF")
        sub.levels, sub.render_levels = 1, 1
    return outer, middle, inner


if __name__ == "__main__":
    bpy.ops.wm.open_mainfile(filepath=C.out("body.blend"))
    arm = bpy.data.objects["skater"]
    body = bpy.data.objects["skater.body"]
    L = Landmarks(arm)
    bake_shape(body)
    smooth_bust(body)
    bm_rest = rest_mesh(body)
    shell = build_shell(bm_rest, body, arm, L)
    corrective(body)
    build_skirt(bm_rest, body, arm, L)
    hide_skin_under_velvet(body, bm_rest, L)
    bm_rest.free()
    bpy.ops.wm.save_as_mainfile(filepath=C.out("dressed.blend"))
    if "--preview" in C.args():
        C.cycles(samples=48, res=(700, 1100))
        C.studio()
        for name, az in (("front", 0), ("side", -90), ("back", 180)):
            C.shoot(C.out(f"dress_{name}.png"), az, target=(0, 0, 0.95), dist=5.4)
