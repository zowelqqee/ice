"""Step 3: figure skates, built around the rest-pose feet.

Boot: the foot and ankle skin offset outward, toes smoothed into a toe box, cut at mid-shin with
a padded collar, tongue, eyelets below and speed hooks above, criss-cross laces, leather sole
and a stacked heel. Blade: side profile (rocker, toe pick, two stanchions with windows)
extruded to 4 mm, plates on top.

The heel stack is taller than the sole under the ball, so in the rest pose the blade line tips
down at the heel by BETA. The pose lifts each heel by BETA, which levels the blade on the ice.

    scripts/skater/run.sh skates.py [in.blend] [--preview]
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402
from costume import bind, node_mat, rest_mesh  # noqa: E402

V = Vector
BOOT_TOP = 0.215  # rest height of the collar (m)
LEATHER = 0.0055  # boot wall offset from the skin (foot); the shaft is snugger
SOLE_T = 0.006  # sole under the ball
HEEL_T = 0.026  # sole + heel block under the heel
STACK = 0.044  # blade bottom to plate top


# ---------------------------------------------------------------- materials
def leather_material():
    m, nt = node_mat("skate_leather")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.86, 0.855, 0.84, 1)
    b.inputs["Roughness"].default_value = 0.38
    b.inputs["Coat Weight"].default_value = 0.35
    b.inputs["Coat Roughness"].default_value = 0.12
    b.inputs["Subsurface Weight"].default_value = 0.05
    tex = nt.nodes.new("ShaderNodeTexVoronoi")
    tex.inputs["Scale"].default_value = 900
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.03
    bump.inputs["Distance"].default_value = 0.0001
    nt.links.new(tex.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    nt.links.new(b.outputs[0], o.inputs["Surface"])
    return m


def simple_material(name, color, rough, metal=0.0, coat=0.0):
    m, nt = node_mat(name)
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    nt.links.new(b.outputs[0], o.inputs["Surface"])
    return m


# ---------------------------------------------------------------- helpers
def new_object(name, bm, mats, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def weight_to(ob, groups):
    """groups: {name: weight}; every vertex gets the same weights."""
    for n, w in groups.items():
        g = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
        g.add(range(len(ob.data.vertices)), w, "REPLACE")


def tube(bm, pts, r, sides=8, cap=True):
    """Sweep a circle along a polyline into bm."""
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.orthogonal().normalized()
        b = t.cross(a)
        ring = [bm.verts.new(p + (a * math.cos(k / sides * 6.2832) + b * math.sin(k / sides * 6.2832)) * r)
                for k in range(sides)]
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def ring_shape(bm, center, normal, r_out, r_in, sides=10):
    a = normal.orthogonal().normalized()
    b = normal.cross(a)
    pts = [(math.cos(k / sides * 6.2832), math.sin(k / sides * 6.2832)) for k in range(sides)]
    top_o = [bm.verts.new(center + (a * x + b * y) * r_out + normal * 0.0008) for x, y in pts]
    top_i = [bm.verts.new(center + (a * x + b * y) * r_in + normal * 0.0008) for x, y in pts]
    bot_o = [bm.verts.new(center + (a * x + b * y) * r_out - normal * 0.0006) for x, y in pts]
    for k in range(sides):
        j = (k + 1) % sides
        bm.faces.new((top_o[k], top_o[j], top_i[j], top_i[k]))
        bm.faces.new((bot_o[k], bot_o[j], top_o[j], top_o[k]))


# ---------------------------------------------------------------- boot
WALL = 0.004  # leather and lining over the skin


def hull_ring(pts2, offset, n=40, floor=None):
    """Smooth closed outline around 2-D points: convex hull, offset outward, resampled by angle."""
    from mathutils.geometry import convex_hull_2d, intersect_line_line_2d

    if len(pts2) < 3:
        return None
    idx = convex_hull_2d(pts2)
    poly = [V(pts2[i]) for i in idx]
    c = sum(poly, V((0.0, 0.0))) / len(poly)
    far = max((p - c).length for p in poly) * 3 + 0.01
    ring = []
    for k in range(n):
        a = k / n * 2 * math.pi
        d = V((math.cos(a), math.sin(a)))
        r = 0.0
        for i in range(len(poly)):
            hit = intersect_line_line_2d(c, c + d * far, poly[i], poly[(i + 1) % len(poly)])
            if hit is not None:
                r = max(r, (hit - c).length)
        q = c + d * (r + offset)
        if floor is not None:
            q.y = max(q.y, floor)
        ring.append(q)
    return ring


def smooth_rings(rings, passes=6, around=2):
    """Even out a stack of rings: average each ring with its neighbours along the stack, and each
    point with its neighbours around the ring (keeps the ends and the shapes, removes the steps)."""
    rings = [[p.copy() for p in r] for r in rings]
    n = len(rings[0])
    for _ in range(passes):
        rings = [rings[0]] + [[(rings[i - 1][k] + rings[i][k] * 2 + rings[i + 1][k]) / 4 for k in range(n)]
                              for i in range(1, len(rings) - 1)] + [rings[-1]]
    for _ in range(around):
        rings = [[(r[k - 1] + r[k] * 2 + r[(k + 1) % n]) / 4 for k in range(n)] for r in rings]
    return rings


def loft(bm, rings, cap=True):
    """Closed surface through a stack of rings with equal point counts."""
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    if cap:
        bm.faces.new(list(reversed(vs[0])))
        bm.faces.new(vs[-1])


def boot(bm_rest, body, side, mats):
    """Boot shell, made like a shoe last: horizontal slices of the leg for the shaft and cross
    slices along the foot, each a smooth convex outline plus the wall, joined by a voxel remesh.
    No ankle bones or toes push through; the toe box is one rounded shape; the sole is flat."""
    sx = 1 if side == "l" else -1
    dl = bm_rest.verts.layers.deform.active
    vg = body.vertex_groups
    leg = [vg[n].index for n in (f"foot_{side}", f"ball_{side}", f"calf_{side}")]
    pts = [v.co.copy() for v in bm_rest.verts
           if v.co.x * sx > 0.02 and v.co.z < BOOT_TOP + 0.05 and sum(v[dl].get(i, 0) for i in leg) > 0.5]
    ys = [p.y for p in pts if p.z < 0.03]
    toe_y, heel_y = min(ys), max(ys)
    ball_y = toe_y + 0.3 * (heel_y - toe_y)
    bm = bmesh.new()
    # shaft: oval sections up the lower leg
    rings = []
    z = 0.06
    while z < BOOT_TOP + 0.03:
        r = hull_ring([(p.x, p.y) for p in pts if abs(p.z - z) < 0.008], WALL)
        if r:
            rings.append([V((q.x, q.y, z)) for q in r])
        z += 0.006
    loft(bm, smooth_rings(rings))
    # foot: cross sections from the heel to the toe, flat underneath
    rings = []
    y = heel_y + 0.006
    while y > toe_y - 0.004:
        r = hull_ring([(p.x, p.z) for p in pts if abs(p.y - y) < 0.007 and p.z < 0.11], WALL, floor=-0.0005)
        if r:
            rings.append([V((q.x, y, q.y)) for q in r])
        y -= 0.005
    rings = smooth_rings(rings)
    for r in rings:  # smoothing lifts the flat sole a little: put it back
        for q in r:
            q.z = max(q.z, -0.0005) if q.z > 0.004 else -0.0005
    loft(bm, rings)
    me = bpy.data.meshes.new("tmp_last")
    bm.to_mesh(me)
    bm.free()
    tmp = bpy.data.objects.new("tmp_last", me)
    bpy.context.scene.collection.objects.link(tmp)
    rm = tmp.modifiers.new("Remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.0018
    sm = tmp.modifiers.new("Smooth", "SMOOTH")  # softens the slice steps and the shaft/foot join
    sm.factor = 0.8
    sm.iterations = 25
    dg = bpy.context.evaluated_depsgraph_get()
    last = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.meshes.remove(me)
    bm = bmesh.new()
    bm.from_mesh(last)
    bpy.data.meshes.remove(last)
    bm.normal_update()
    # cut at the collar, front a little higher where the tongue sits
    mid_y = (heel_y + toe_y) * 0.5
    def top_z(p):
        return BOOT_TOP + 0.008 * min(1.0, max(0.0, -(p.y - mid_y - 0.02)) / 0.06)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if any(v.co.z > top_z(v.co) for v in f.verts)], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    for e in bm.edges:
        if e.is_boundary:
            for v in e.verts:
                v.co.z = top_z(v.co)
    # flat sole
    for v in bm.verts:
        if v.co.z < 0.004:
            v.co.z = -0.0005
    bm.normal_update()
    top_loop = [v.co.copy() for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    ob = new_object(f"skate_boot_{side}", bm, [mats["leather"]])
    for g in body.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    # skin weights from the nearest leg vertex, ball folded into the foot (rigid toe box)
    copy_weights(ob, bm_rest, body, merge={f"ball_{side}": f"foot_{side}"})
    sub = ob.modifiers.new("Subdivision", "SUBSURF")
    sub.levels, sub.render_levels = 0, 1
    info = dict(toe_y=toe_y, heel_y=heel_y, ball_y=ball_y, top_loop=top_loop)
    return ob, info


def copy_weights(ob, bm_rest, body, merge=None):
    bm_rest.verts.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm_rest)
    dl = bm_rest.verts.layers.deform.active
    names = {g.index: g.name for g in body.vertex_groups}
    merge = merge or {}
    acc = {}
    bm_rest.faces.ensure_lookup_table()
    from mathutils.interpolate import poly_3d_calc

    n_v = len(ob.data.vertices)
    for v in ob.data.vertices:
        loc, _, fi, _ = tree.find_nearest(v.co)
        f = bm_rest.faces[fi]
        bary = poly_3d_calc([fv.co for fv in f.verts], loc)  # continuous across the body's faces
        for fv, k in zip(f.verts, bary):
            for gi, w in fv[dl].items():
                n = names.get(gi)
                if n is None or n == "body" or n.startswith(("helper", "joint")):
                    continue
                n = merge.get(n, n)
                acc.setdefault(n, [0.0] * n_v)[v.index] += w * k
    # a dense mesh on a coarse one: relax the weights along the surface so bending stays smooth
    nb = [[] for _ in range(n_v)]
    for e in ob.data.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    for _ in range(12):
        for n, w in acc.items():
            acc[n] = [0.5 * w[i] + 0.5 * (sum(w[j] for j in nb[i]) / len(nb[i]) if nb[i] else w[i]) for i in range(n_v)]
    for n, w in acc.items():
        g = ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n)
        for i in range(n_v):
            if w[i] > 0.01:
                g.add([i], w[i], "REPLACE")


def surface_point(tree, p, d):
    hit = tree.ray_cast(p - d * 0.05, d)
    return hit if hit[0] is not None else (None, None, None, None)


def boot_details(boot_ob, info, side, mats):
    """Tongue, collar, eyelets, hooks and laces on the front of the boot."""
    me = boot_ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    cx = sum(v.co.x for v in bm.verts) / len(bm.verts)
    # front midline: from the instep (above the toe box) up the shin
    mid = []
    for i in range(16):
        t = i / 15
        z = 0.075 + t * (BOOT_TOP - 0.075)
        loc, nrm, _, _ = surface_point(tree, V((cx, -0.4, z)), V((0, 1, 0)))
        if loc is None:
            continue
        mid.append((loc, nrm))
    det = bmesh.new()
    lace = bmesh.new()
    rows = {-1: [], 1: []}
    for i, (p, n) in enumerate(mid):
        lat = V((1, 0, 0))
        for s in (-1, 1):
            q = p + lat * s * 0.019
            loc, nrm, _, _ = tree.find_nearest(q)
            rows[s].append((loc + nrm * 0.0008, nrm))
    # tongue: a padded tab standing above the collar at the front
    p, n = mid[-1]
    tb = bmesh.new()
    rows_t = []
    for j in range(8):
        h = j / 7 * 0.046
        lean = n * (0.003 + 0.009 * (j / 7) ** 1.5)
        row = []
        for k in range(11):
            u = (k / 10 - 0.5) * 2
            half = 0.024 * math.sqrt(max(0.0, 1 - (h / 0.048) ** 4))
            row.append(tb.verts.new(p + lean + V((u * half, 0, h - 0.02)) + n * 0.003 * (1 - u * u)))
        rows_t.append(row)
    for r0, r1 in zip(rows_t, rows_t[1:]):
        for k in range(10):
            tb.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    tongue = new_object(f"skate_tongue_{side}", tb, [mats["leather"]])
    sol = tongue.modifiers.new("Thick", "SOLIDIFY")
    sol.thickness = 0.008
    sol.offset = -1
    sub = tongue.modifiers.new("Subdivision", "SUBSURF")
    sub.levels, sub.render_levels = 1, 2
    # eyelets low, speed hooks high
    n_rows = len(rows[1])
    for i in range(1, n_rows):
        for s in (-1, 1):
            p, n = rows[s][i]
            if i < n_rows * 0.7:
                ring_shape(det, p, n, 0.0038, 0.0019)
            else:
                # hook: a short bent pin standing off the boot
                d = V((s * 1.0, 0, 0)) * 0.007
                tube(det, [p, p + n * 0.006, p + n * 0.009 + d], 0.0015, 6)
    # laces: criss-cross between successive eyelets/hooks
    pts = []
    for i in range(1, n_rows):
        a = rows[-1][i][0] + rows[-1][i][1] * 0.003
        b = rows[1][i][0] + rows[1][i][1] * 0.003
        pts.append((a, b) if i % 2 == 0 else (b, a))
    for (a0, b0), (a1, b1) in zip(pts, pts[1:]):
        for u, w in ((a0, b1), (b0, a1)):
            m = (u + w) * 0.5
            loc, nrm, _, _ = tree.find_nearest(m)
            m = loc + nrm * 0.0065
            tube(lace, [u, (u + m) * 0.5 + nrm * 0.0012, m, (m + w) * 0.5 + nrm * 0.0012, w], 0.0017, 6)
    # bow at the top
    if pts:
        a, b = pts[-1]
        m = (a + b) * 0.5 + rows[1][-1][1] * 0.006
        for s in (-1, 1):
            loop = [m + V((s * 0.012 * math.sin(t / 8 * 3.1416), -0.004 * math.sin(t / 8 * 6.28), 0.008 * math.sin(t / 8 * 3.1416)))
                    for t in range(9)]
            tube(lace, loop, 0.0017, 6, cap=False)
            tube(lace, [m, m + V((s * 0.008, -0.004, -0.03))], 0.0016, 6)
    metal = new_object(f"skate_hardware_{side}", det, [mats["hardware"]])
    laces = new_object(f"skate_laces_{side}", lace, [mats["lace"]])
    # padded collar along the top edge
    loop = info["top_loop"]
    c = V((sum(p.x for p in loop) / len(loop), sum(p.y for p in loop) / len(loop), 0))
    loop.sort(key=lambda p: math.atan2(p.x - c.x, p.y - c.y))
    cb = bmesh.new()
    pts = [p + (V((p.x, p.y, 0)) - c).normalized() * 0.0012 + V((0, 0, 0.0015)) for p in loop]
    pts.append(pts[0])
    tube(cb, pts, 0.0038, 10, cap=False)
    collar = new_object(f"skate_collar_{side}", cb, [mats["leather"]])
    # stitched edges of the two quarters along the lacing
    qb = bmesh.new()
    for s in (-1, 1):
        line = []
        for p_, n_ in rows[s]:
            loc, nrm, _, _ = tree.find_nearest(p_ + V((s * 0.0075, 0, 0)))
            line.append(loc + nrm * 0.0004)
        if len(line) > 1:
            tube(qb, line, 0.00045, 4, cap=False)
    quarters = new_object(f"skate_stitch_q_{side}", qb, [mats["stitch"]], smooth=False)
    bm.free()
    return [tongue, metal, laces, collar, quarters]


# ---------------------------------------------------------------- sole, heel, blade
def stitching(boot_ob, info, side, mats):
    """Seam lines on the boot: welt above the sole and the toe-cap seam."""
    bm = bmesh.new()
    bm.from_mesh(boot_ob.data)
    bm.normal_update()
    planes = [
        (V((0, 0, 0.012)), V((0, 0, 1)), lambda p: True),  # welt
        (V((0, info["toe_y"] + 0.06, 0.03)), V((0, 0.85, 0.5)).normalized(), lambda p: p.z > 0.012),  # toe cap
    ]
    out = bmesh.new()
    for o, n, keep in planes:
        for f in bm.faces:
            vs = f.verts
            for i in range(1, len(vs) - 1):
                tri = (vs[0], vs[i], vs[i + 1])
                seg = []
                for x, y in ((0, 1), (1, 2), (2, 0)):
                    da, db = (tri[x].co - o).dot(n), (tri[y].co - o).dot(n)
                    if (da > 0) != (db > 0):
                        t = da / (da - db)
                        p = tri[x].co.lerp(tri[y].co, t)
                        nn = tri[x].normal.lerp(tri[y].normal, t).normalized()
                        seg.append(p + nn * 0.0003)
                if len(seg) == 2 and keep(seg[0]) and (seg[0] - seg[1]).length > 1e-5:
                    tube(out, seg, 0.0003, 4, cap=False)
    bm.free()
    return new_object(f"skate_stitch_{side}", out, [mats["stitch"]], smooth=False)


def foot_frame(info, boot_ob, side):
    """Rest-space mounting points under the ball and the heel."""
    xs = [v.co.x for v in boot_ob.data.vertices if v.co.z < 0.01]
    cx = sum(xs) / len(xs)
    front = V((cx, info["toe_y"] + 0.055, -0.001 - SOLE_T))
    rear = V((cx, info["heel_y"] - 0.03, -0.001 - HEEL_T))
    print("mounts", side, "toe", round(info["toe_y"], 3), "heel", round(info["heel_y"], 3), "span", round((front - rear).length, 3))
    return front, rear


def sole_and_heel(boot_ob, info, side, mats):
    """Sole slab following the boot's footprint, heel block under the back."""
    pts = [v.co.copy() for v in boot_ob.data.vertices if v.co.z < 0.004]
    c = V((sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), 0))
    n = 48
    rad = [0.0] * n
    for p in pts:
        k = int((math.atan2(p.x - c.x, p.y - c.y) % 6.2832) / 6.2832 * n) % n
        rad[k] = max(rad[k], math.hypot(p.x - c.x, p.y - c.y))
    for _ in range(4):
        rad = [max(rad[i], 0.5 * (rad[i - 1] + rad[(i + 1) % n])) for i in range(n)]
    outline = [(c.x + math.sin(k / n * 6.2832) * (rad[k] + 0.0025), c.y + math.cos(k / n * 6.2832) * (rad[k] + 0.0025))
               for k in range(n)]
    bm = bmesh.new()
    top = [bm.verts.new((x, y, -0.0005)) for x, y in outline]
    bot = [bm.verts.new((x, y, -0.0005 - SOLE_T)) for x, y in outline]
    bm.faces.new(top[::-1])
    bm.faces.new(bot)
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((top[k], top[j], bot[j], bot[k]))
    sole = new_object(f"skate_sole_{side}", bm, [mats["sole"]], smooth=False)
    bv = sole.modifiers.new("Bevel", "BEVEL")
    bv.width = 0.0015
    bv.segments = 2
    # heel block: the back 7 cm of the footprint, extruded down, slightly tapered
    hb = bmesh.new()
    y_cut = info["heel_y"] - 0.07
    back = [(x, y) for x, y in outline if y > y_cut]
    back.sort(key=lambda q: math.atan2(q[0] - c.x, q[1] - c.y))
    ring_t = [hb.verts.new((x, max(y, y_cut), -0.0005 - SOLE_T)) for x, y in back]
    ring_b = [hb.verts.new((c.x + (x - c.x) * 0.9, max(y_cut, y - 0.004), -0.001 - HEEL_T)) for x, y in back]
    hb.faces.new(ring_t[::-1])
    hb.faces.new(ring_b)
    m = len(back)
    for k in range(m):
        j = (k + 1) % m
        hb.faces.new((ring_t[k], ring_t[j], ring_b[j], ring_b[k]))
    heel = new_object(f"skate_heel_{side}", hb, [mats["sole"]], smooth=False)
    bv = heel.modifiers.new("Bevel", "BEVEL")
    bv.width = 0.0015
    bv.segments = 2
    return [sole, heel]


def blade(front, rear, side, mats):
    """Blade assembly in its own plane, mounted under the plates."""
    a = (front - rear)
    d = a.length
    a.normalize()
    w = V((1, 0, 0))
    up = w.cross(a).normalized()
    if up.z < 0:
        up = -up
    # 2-D outline (s along the blade from the heel mount, h up from the blade bottom), like a real
    # figure-skate blade: slim rockered runner, upturned toe with four picks, two slender stanchions
    # with rounded windows under the toe and heel plates, a rounded tail
    R = 2.1
    H = STACK
    s0, s1 = -0.038, d + 0.072
    sc = s0 + 0.56 * (s1 - s0)

    def rocker(s):
        return (s - sc) ** 2 / (2 * R)

    def arc(c, r, a0, a1, n):
        return [(c[0] + r * math.cos(a0 + (a1 - a0) * i / n), c[1] + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

    def ellipse(c, rx, ry, n=20):
        return [(c[0] + rx * math.cos(i / n * 6.2832), c[1] + ry * math.sin(i / n * 6.2832)) for i in range(n)]

    out = [(s0 + 0.002 + (s1 - 0.03 - s0) * i / 40, rocker(s0 + 0.002 + (s1 - 0.03 - s0) * i / 40)) for i in range(41)]
    # upturned toe; picks as small teeth on its lower front
    rt = 0.03
    tc = (s1 - 0.03, rocker(s1 - 0.03) + rt)
    toe = []
    for i in range(1, 31):
        t = i / 30
        ang = -math.pi / 2 + t * math.pi * 0.78
        bump = 0.0026 * max(0.0, math.sin(t * math.pi * 8)) if 0.08 < t < 0.55 else 0.0
        toe.append((tc[0] + math.cos(ang) * (rt + bump), tc[1] + math.sin(ang) * (rt + bump)))
    out += toe
    # toe top back to the front plate, plate, front stanchion, bridge, rear stanchion, plate, tail
    out += [(d + 0.036, H)]
    # posts sized to the mounting span d (heel mount at 0, toe mount at d)
    fb, rb = d - 0.03, 0.026  # back edge of the toe post, front edge of the heel post
    out += [(d + 0.036 - (d + 0.036 - fb) * i / 6, H) for i in range(1, 7)]  # toe plate underside
    out += [(fb - 0.012 * math.sin(i / 6 * math.pi / 2), H - (H - 0.015) * (i / 6) ** 1.4) for i in range(1, 7)]
    out += [(fb - 0.012 - (fb - 0.012 - (rb + 0.012)) * i / 8, 0.015 - 0.002 * math.sin(i / 8 * math.pi)) for i in range(1, 8)]
    out += [(rb + 0.012 - 0.012 * (i / 6) ** 0.7, 0.015 + (H - 0.015) * (i / 6) ** 1.4) for i in range(1, 7)]
    out += [(rb - (rb + 0.03) * i / 5, H) for i in range(1, 6)]  # heel plate underside
    out += arc((-0.03, H - 0.014), 0.014, math.pi / 2, math.pi * 1.05, 6)[1:]
    out += [(s0, 0.01)]
    mid = 0.5 * (H + 0.016)
    holes = [
        ellipse((d + 0.004, mid + 0.001), 0.017, 0.5 * (H - 0.016) - 0.006),
        ellipse((-0.004, mid + 0.001), 0.012, 0.5 * (H - 0.016) - 0.006),
    ]
    cu = bpy.data.curves.new(f"blade_{side}", "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = 0.0019
    cu.bevel_depth = 0.0004
    for poly in [out] + holes:
        sp = cu.splines.new("POLY")
        sp.points.add(len(poly) - 1)
        for i, (s, h) in enumerate(poly):
            sp.points[i].co = (s, h, 0, 1)
        sp.use_cyclic_u = True
    tmp = bpy.data.objects.new("tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    # place: local x = s, local y = h, local z = lateral
    base = rear - up * H
    M = Matrix((a, up, w)).transposed()
    for v in me.vertices:
        v.co = base + M @ v.co
    me.materials.append(mats["steel"])
    ob = bpy.data.objects.new(f"skate_blade_{side}", me)
    bpy.context.scene.collection.objects.link(ob)
    # plates: thin rounded slabs on top of the stanchions
    bm = bmesh.new()
    for s_a, s_b in ((d - 0.032, d + 0.038), (-0.032, 0.028)):  # plates only over the two posts
        L, Wd, T = s_b - s_a, 0.034, 0.003
        cen = base + a * ((s_a + s_b) / 2) + up * (H + T / 2)
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(cen) @ M.to_4x4() @ Matrix.Diagonal((L, T, Wd, 1)))
    plates = new_object(f"skate_plates_{side}", bm, [mats["steel"]], smooth=False)
    bv = plates.modifiers.new("Bevel", "BEVEL")
    bv.width = 0.0012
    bv.segments = 2
    beta = math.degrees(math.asin(max(-1, min(1, (front.z - rear.z) / d))))
    return [ob, plates], beta


def build(bm_rest, body, arm):
    mats = {
        "leather": leather_material(),
        "sole": simple_material("skate_sole", (0.42, 0.25, 0.12), 0.5, coat=0.35),  # tan leather sole
        "steel": simple_material("skate_steel", (0.88, 0.9, 0.93), 0.24, metal=1.0),
        "stitch": simple_material("skate_stitch", (0.74, 0.72, 0.68), 0.6),
        "hardware": simple_material("skate_hardware", (0.85, 0.86, 0.88), 0.15, metal=1.0),
        "lace": simple_material("skate_lace", (0.9, 0.9, 0.88), 0.7),
    }
    betas = {}
    for side in "lr":
        b, info = boot(bm_rest, body, side, mats)
        parts = boot_details(b, info, side, mats)
        parts.append(stitching(b, info, side, mats))
        parts += sole_and_heel(b, info, side, mats)
        front, rear = foot_frame(info, b, side)
        bl, beta = blade(front, rear, side, mats)
        parts += bl
        betas[side] = beta
        bind(b, arm, relax=True)  # corrective smooth: no skinning lumps at the ankle
        for p in parts:
            weight_to(p, {f"foot_{side}": 1.0})
            bind(p, arm)
            if p.name.startswith(("skate_tongue", "skate_collar", "skate_laces", "skate_hardware", "skate_stitch")):
                # these follow the boot (which bends at the ankle with the leg)
                for g in list(p.vertex_groups):
                    p.vertex_groups.remove(g)
                copy_weights(p, bm_rest, body, merge={f"ball_{side}": f"foot_{side}"})
        print("skate", side, "beta", round(beta, 2))
    arm["skate_beta"] = (betas["l"] + betas["r"]) / 2
    hide_feet(body)
    return betas


def hide_feet(body):
    """Skin inside the boots is never seen: drop it from the body mask."""
    saved = [(m, m.show_viewport) for m in body.modifiers]
    for m, _ in saved:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg).to_mesh()
    idx = [v.index for v in ev.vertices if v.co.z < BOOT_TOP - 0.025]
    body.evaluated_get(dg).to_mesh_clear()
    for m, v in saved:
        m.show_viewport = v
    body.vertex_groups["body"].remove(idx)


if __name__ == "__main__":
    a = [x for x in C.args() if not x.startswith("--")]
    bpy.ops.wm.open_mainfile(filepath=a[0] if a else C.out("dressed.blend"))
    arm = bpy.data.objects["skater"]
    body = bpy.data.objects["skater.body"]
    bm_rest = rest_mesh(body)
    build(bm_rest, body, arm)
    bm_rest.free()
    bpy.ops.wm.save_as_mainfile(filepath=C.out("skated.blend"))
    if "--preview" in C.args():
        C.cycles(samples=48, res=(900, 700))
        C.studio()
        C.shoot(C.out("skate_side.png"), -90, target=(-0.15, -0.06, 0.08), dist=1.2, elev_deg=6)
        C.shoot(C.out("skate_front.png"), -30, target=(-0.15, -0.06, 0.08), dist=1.2, elev_deg=14)
        C.clay()
        C.shoot(C.out("skate_clay.png"), -90, target=(-0.15, -0.06, 0.06), dist=1.0, elev_deg=2)
