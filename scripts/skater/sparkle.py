"""Step 5: the sparkle.

- Frost veins: branching silver threads grown over the velvet of the front bodice, set with
  crystals that get smaller toward the tips.
- Crystal trims along the scoop neck, the open-back V and the waist seam (zero line of the
  shell's `cover` field, found by marching triangles).
- Glitter in the fabrics: tiny mirror facets with random tilts (shader), so they flicker
  with the light instead of glowing.

Every crystal and thread takes the skin weights of the fabric under it.

    scripts/skater/run.sh sparkle.py [in.blend] [--preview]
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc
from mathutils.kdtree import KDTree

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402
from costume import bind, node_mat  # noqa: E402

V = Vector
rnd = random.Random(11)


# ---------------------------------------------------------------- surface sampling
class Surface:
    """Rest-pose fabric surface with attributes and skin weights."""

    def __init__(self, ob):
        self.ob = ob
        self.bm = bmesh.new()
        self.bm.from_mesh(ob.data)
        self.bm.faces.ensure_lookup_table()
        self.bm.normal_update()
        self.tree = BVHTree.FromBMesh(self.bm)
        self.dl = self.bm.verts.layers.deform.active
        self.fl = {n: self.bm.verts.layers.float.get(n) for n in ("cover", "opaque")}
        self.names = {g.index: g.name for g in ob.vertex_groups}

    def _face_w(self, f, p):
        pts = [v.co for v in f.verts]
        return poly_3d_calc(pts, p)

    def attr(self, fi, p, name):
        f = self.bm.faces[fi]
        w = self._face_w(f, p)
        lay = self.fl[name]
        return sum(v[lay] * k for v, k in zip(f.verts, w))

    def weights(self, fi, p):
        f = self.bm.faces[fi]
        w = self._face_w(f, p)
        out = {}
        for v, k in zip(f.verts, w):
            for gi, gw in v[self.dl].items():
                n = self.names[gi]
                out[n] = out.get(n, 0.0) + gw * k
        return {n: w for n, w in out.items() if w > 0.01}

    def project_front(self, x, z):
        """Point on the fabric seen from the front at (x, z)."""
        loc, nrm, fi, _ = self.tree.ray_cast(V((x, -0.6, z)), V((0, 1, 0)))
        return (loc, nrm, fi) if loc is not None else (None, None, None)

    def zero_line(self, name, keep):
        """Points of the zero contour of an attribute (marching triangles), filtered by keep(p)."""
        lay = self.fl[name]
        pts = []
        for f in self.bm.faces:
            vs = f.verts
            for i in range(1, len(vs) - 1):
                tri = (vs[0], vs[i], vs[i + 1])
                seg = []
                for a, b in ((0, 1), (1, 2), (2, 0)):
                    va, vb = tri[a][lay], tri[b][lay]
                    if (va > 0) != (vb > 0):
                        t = va / (va - vb)
                        seg.append(tri[a].co.lerp(tri[b].co, t))
                if len(seg) == 2 and keep(seg[0]):
                    pts.append((seg[0], seg[1], f.index))
        return pts


# ---------------------------------------------------------------- crystals
def gem(bm, p, n, r, spin):
    """Round-brilliant-ish crystal: table, crown, girdle, pavilion point."""
    a = n.orthogonal().normalized()
    a = a * math.cos(spin) + n.cross(a) * math.sin(spin)
    b = n.cross(a)
    k = 8
    base = p + n * 0.0003
    girdle = [bm.verts.new(base + n * (r * 0.32) + (a * math.cos(i / k * 6.2832) + b * math.sin(i / k * 6.2832)) * r)
              for i in range(k)]
    table = [bm.verts.new(base + n * (r * 0.62) + (a * math.cos((i + 0.5) / k * 6.2832) + b * math.sin((i + 0.5) / k * 6.2832)) * r * 0.55)
             for i in range(k)]
    tip = bm.verts.new(base - n * (r * 0.05))
    bm.faces.new(table)
    for i in range(k):
        j = (i + 1) % k
        bm.faces.new((girdle[i], girdle[j], table[i]))
        bm.faces.new((table[i], girdle[j], table[j]))
        bm.faces.new((girdle[j], girdle[i], tip))
    return girdle + table + [tip]


def tube(bm, pts, r0, r1, sides=6):
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.orthogonal().normalized()
        b = t.cross(a)
        r = r0 + (r1 - r0) * (i / max(1, n - 1))
        rings.append([bm.verts.new(p + (a * math.cos(k / sides * 6.2832) + b * math.sin(k / sides * 6.2832)) * r)
                      for k in range(sides)])
    for ra, rb in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((ra[k], ra[(k + 1) % sides], rb[(k + 1) % sides], rb[k]))
    return [v for r in rings for v in r]


class Builder:
    """Accumulates geometry with per-vertex skin weights."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.vw = []  # (verts, weights)

    def add(self, verts, weights):
        self.vw.append((verts, weights))

    def finish(self, mat, arm):
        self.bm.verts.index_update()
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        me.materials.append(mat)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        groups = {}
        for verts, ws in self.vw:
            idx = [v.index for v in verts]
            for n, w in ws.items():
                g = groups.get(n) or ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
                groups[n] = g
                g.add(idx, w, "REPLACE")
        self.bm.free()
        bind(ob, arm)
        return ob


# ---------------------------------------------------------------- veins
def grow_veins(S, side, out_pts):
    """Leaf venation: the V edge is the midrib; veins sweep out and down from it in long, smooth
    curves, with a few side veins; below the V tip they fan from the centre toward the hips."""
    sx = 1 if side == "l" else -1
    lines = []

    def ok(x, z):
        loc, nrm, fi = S.project_front(x, z)
        if loc is None:
            return None
        if S.attr(fi, loc, "opaque") < 0.003 or loc.y > -0.03:
            return None
        return loc, nrm, fi

    def grow(x, z, ang, bend, length, depth, width):
        pts = []
        step = 0.003
        n = int(length / step)
        seed = rnd.uniform(0, 50)
        for i in range(n):
            hit = ok(x, z)
            if hit is None:
                break
            pts.append((hit, width * (1 - 0.6 * i / max(1, n))))
            ang += (bend + 0.25 * noise.noise(V((seed, i * 0.08, depth)))) * step * 10
            x += math.cos(ang) * step
            z += math.sin(ang) * step
            if depth < 2 and i > 6 and rnd.random() < (0.09 if depth == 0 else 0.05):
                # side vein toward the lower side, curving the same way
                grow(x, z, ang - sx * 0.0 + (-0.42 if sx > 0 else 0.42) * (1 if math.cos(ang) * sx > 0 else -1),
                     bend * 1.3, length * rnd.uniform(0.25, 0.42), depth + 1, width * 0.7)
        if len(pts) > 3:
            lines.append((pts, depth))

    # from the V edges: out and down, bending back up toward the side seam
    for k in range(6):
        z = 1.085 + k * 0.026 + rnd.uniform(-0.004, 0.004)
        wf = 0.052 * max(0.0, (z - 1.06) / (1.235 - 1.06)) ** 0.8
        a0 = -0.95 + 0.07 * k  # steeper near the tip
        ang = a0 if sx > 0 else math.pi - a0
        bend = 0.32 * sx  # positive curvature lifts the right-hand side
        grow(sx * (wf + 0.004), z, ang, bend if sx > 0 else -bend, rnd.uniform(0.09, 0.14), 0, 0.00045)
    # below the V tip: fanning down toward the hips
    for k in range(4):
        a0 = -0.35 - 0.22 * k
        ang = a0 if sx > 0 else math.pi - a0
        grow(sx * (0.006 + 0.004 * k), 1.055 - 0.012 * k, ang, (-0.18 if sx > 0 else 0.18), rnd.uniform(0.07, 0.11), 0, 0.0004)
    out_pts.extend(lines)


# ---------------------------------------------------------------- glitter shader
def glitter(nt, shader_out, scale, density, strength=1.0, color=(0.92, 0.96, 1.0)):
    """Mix tiny randomly tilted mirror facets into a shader; returns the new output socket."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = scale
    nt.links.new(tc.outputs["Generated"], vor.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(vor.outputs["Color"], sep.inputs["Color"])
    sel = nt.nodes.new("ShaderNodeMath")
    sel.operation = "LESS_THAN"
    sel.inputs[1].default_value = density
    nt.links.new(sep.outputs["Red"], sel.inputs[0])
    dot = nt.nodes.new("ShaderNodeMath")
    dot.operation = "LESS_THAN"
    dot.inputs[1].default_value = 0.32
    nt.links.new(vor.outputs["Distance"], dot.inputs[0])
    mask = nt.nodes.new("ShaderNodeMath")
    mask.operation = "MULTIPLY"
    nt.links.new(sel.outputs[0], mask.inputs[0])
    nt.links.new(dot.outputs[0], mask.inputs[1])
    if strength != 1.0:
        m2 = nt.nodes.new("ShaderNodeMath")
        m2.operation = "MULTIPLY"
        m2.inputs[1].default_value = strength
        nt.links.new(mask.outputs[0], m2.inputs[0])
        mask = m2
    # facet normal: geometric normal tilted by the cell's random colour
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    vm = nt.nodes.new("ShaderNodeVectorMath")
    vm.operation = "MULTIPLY_ADD"
    vm.inputs[1].default_value = (1.4, 1.4, 1.4)
    vm.inputs[2].default_value = (-0.7, -0.7, -0.7)
    nt.links.new(vor.outputs["Color"], vm.inputs[0])
    add = nt.nodes.new("ShaderNodeVectorMath")
    add.operation = "ADD"
    nt.links.new(geo.outputs["Normal"], add.inputs[0])
    nt.links.new(vm.outputs[0], add.inputs[1])
    nrm = nt.nodes.new("ShaderNodeVectorMath")
    nrm.operation = "NORMALIZE"
    nt.links.new(add.outputs[0], nrm.inputs[0])
    gl = nt.nodes.new("ShaderNodeBsdfGlossy")
    gl.inputs["Color"].default_value = (*color, 1)
    gl.inputs["Roughness"].default_value = 0.05
    nt.links.new(nrm.outputs[0], gl.inputs["Normal"])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mask.outputs[0], mix.inputs[0])
    nt.links.new(shader_out, mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    return mix.outputs[0]


def add_glitter(mat_name, scale, density, strength=1.0):
    """Insert glitter in front of the material output, or, for the shell, in front of the
    fabric/transparent switch so the bare-skin parts stay clean."""
    m = bpy.data.materials[mat_name]
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial")
    target = out.inputs["Surface"]
    last = target.links[0].from_node
    if mat_name == "costume_shell" and last.bl_idname == "ShaderNodeMixShader":
        target = last.inputs[2]  # the fabric side of the cover switch
    src = target.links[0].from_socket
    new = glitter(nt, src, scale, density, strength)
    nt.links.new(new, target)


def crystal_material():
    m, nt = node_mat("crystal")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    g = nt.nodes.new("ShaderNodeBsdfPrincipled")
    g.inputs["Base Color"].default_value = (0.93, 0.96, 1.0, 1)
    g.inputs["Metallic"].default_value = 1.0
    g.inputs["Roughness"].default_value = 0.14
    g.inputs["Coat Weight"].default_value = 1.0
    g.inputs["Coat Roughness"].default_value = 0.0
    g.inputs["Coat IOR"].default_value = 2.0
    nt.links.new(g.outputs[0], o.inputs["Surface"])
    return m


def thread_material():
    m, nt = node_mat("frost_thread")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.72, 0.8, 0.95, 1)
    b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.22
    nt.links.new(b.outputs[0], o.inputs["Surface"])
    return m


def build(arm):
    shell = bpy.data.objects["costume_shell"]
    S = Surface(shell)
    gems = Builder("crystals")
    threads = Builder("frost_veins")
    placed = []

    def put_gem(p, n, fi, r, weights=None):
        verts = gem(gems.bm, p, n, r, rnd.uniform(0, 1))
        gems.add(verts, weights if weights is not None else S.weights(fi, p))
        placed.append(p)

    # --- veins
    lines = []
    for side in "lr":
        grow_veins(S, side, lines)
    nv = 0
    for pts, depth in lines:
        path = [h[0][0] + h[0][1] * 0.0006 for h in pts]
        w0, w1 = pts[0][1], pts[-1][1]
        verts = tube(threads.bm, path, w0, max(w1, 0.00018))
        loc, nrm, fi = pts[len(pts) // 2][0]
        threads.add(verts, S.weights(fi, loc))
        # crystals along the vein, larger near its root
        acc = 0.0
        spacing = 0.006 if depth == 0 else 0.008
        for i in range(1, len(pts)):
            acc += (pts[i][0][0] - pts[i - 1][0][0]).length
            if acc >= spacing:
                acc = 0.0
                (loc, nrm, fi), _ = pts[i]
                r = (0.0016 if depth == 0 else 0.0012) * (1 - 0.5 * i / len(pts)) * rnd.uniform(0.8, 1.15)
                put_gem(loc + nrm * 0.0005, nrm, fi, r)
        nv += 1

    # --- trims on the zero line of `cover`: neckline, open back, cuffs
    def keep(p):
        neck = p.z > 1.26 and p.y < 0.0
        back = p.y > -0.02 and 0.99 < p.z < 1.36
        return neck or back
    segs = S.zero_line("cover", keep)
    kd_pts = []
    for a, b, fi in segs:
        for t in (0.25, 0.75):
            kd_pts.append((a.lerp(b, t), fi))
    kd = KDTree(len(kd_pts))
    for i, (p, _) in enumerate(kd_pts):
        kd.insert(p, i)
    kd.balance()
    used = set()
    for i, (p, fi) in enumerate(kd_pts):
        if i in used:
            continue
        for _, j, _ in kd.find_range(p, 0.0042):
            used.add(j)
        loc, nrm, fi2, _ = S.tree.find_nearest(p)
        put_gem(loc + nrm * 0.0004, nrm, fi2, 0.0013 * rnd.uniform(0.85, 1.1))

    # --- second trim line: the inner edge of the sheer band along the back V
    segs = S.zero_line("opaque", lambda p: p.y > 0.0 and 1.0 < p.z < 1.33)
    last = None
    for a_, b_, fi in segs:
        p = (a_ + b_) * 0.5
        if last is not None and (p - last).length < 0.005:
            continue
        loc, nrm, fi2, _ = S.tree.find_nearest(p)
        put_gem(loc + nrm * 0.0004, nrm, fi2, 0.0011 * rnd.uniform(0.85, 1.1))
        last = p

    # --- scattered crystals: denser on the velvet, sparser on the mesh
    n_scatter = 0
    cl, ol = S.fl["cover"], S.fl["opaque"]
    for f in S.bm.faces:
        cov = sum(v[cl] for v in f.verts) / len(f.verts)
        if cov <= 0.004:
            continue
        opq = sum(v[ol] for v in f.verts) / len(f.verts)
        density = 380.0 if opq > 0.003 else 150.0  # per m^2
        if rnd.random() < f.calc_area() * density:
            vs = [v.co for v in f.verts]
            u_, w_ = rnd.random(), rnd.random()
            if u_ + w_ > 1:
                u_, w_ = 1 - u_, 1 - w_
            p = vs[0] + (vs[1] - vs[0]) * u_ + (vs[2] - vs[0]) * w_
            put_gem(p + f.normal * 0.0004, f.normal, f.index, rnd.uniform(0.0006, 0.0011))
            n_scatter += 1
    print("scattered crystals", n_scatter)

    # --- waist seam: along the top row of the outer skirt
    sk = bpy.data.objects["skirt_outer"]
    nu = 192
    top = [sk.data.vertices[i].co.copy() for i in range(nu)]
    c = sum(top, V()) / len(top)
    for i in range(0, nu, 2):
        p = top[i]
        n = (V((p.x - c.x, p.y - c.y, 0))).normalized()
        put_gem(p + n * 0.0015, n, None, 0.0014, {"pelvis": 1.0})

    crystals = gems.finish(crystal_material(), arm)
    veins = threads.finish(thread_material(), arm)
    print("veins", nv, "crystals", len(placed))

    # --- glitter in the fabrics
    add_glitter("costume_shell", 520, 0.02)
    add_glitter("chiffon_navy", 420, 0.04)
    add_glitter("chiffon_lavender", 420, 0.02)
    return crystals, veins


if __name__ == "__main__":
    a = [x for x in C.args() if not x.startswith("--")]
    bpy.ops.wm.open_mainfile(filepath=a[0] if a else C.out("haired.blend"))
    arm = bpy.data.objects["skater"]
    build(arm)
    bpy.ops.wm.save_as_mainfile(filepath=C.out("sparkled.blend"))
    if "--preview" in C.args():
        C.cycles(samples=64, res=(900, 1000))
        C.studio()
        C.shoot(C.out("sparkle_front.png"), 0, target=(0, -0.05, 1.12), dist=1.5, elev_deg=4)
        C.shoot(C.out("sparkle_back.png"), 180, target=(0, 0.0, 1.15), dist=1.5, elev_deg=4)
