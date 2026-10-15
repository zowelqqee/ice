"""Step 4: hair. Combed back from the hairline into a twisted low bun at the back of the head.

- Scalp cap: the hair region of the skin, offset 1 mm, hair-coloured (no skin between strands).
- Flow strands: rooted on the scalp, following the head surface to the bun base, building
  volume toward the back.
- Bun: strands coiled as a twisted rope wound into a ring.
- A few loose wisps at the temples.

Strands are Blender hair curves (rendered as strands by Cycles), parented to the head bone.

    scripts/skater/run.sh hair.py [in.blend] [--preview]
"""

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402
from costume import bind, node_mat, rest_mesh, smoothstep  # noqa: E402

V = Vector
rnd = random.Random(7)

# minimum elevation of the hairline (rad) by |azimuth| (0 = front, pi = back), not counting the
# ears: Head.hairline() lifts it over each ear, measured from MakeHuman's `ears` group
HAIRLINE = [(0.0, 0.5), (0.45, 0.45), (0.8, 0.3), (1.0, 0.12), (1.2, -0.08), (1.45, -0.2), (1.75, -0.3),
            (2.1, -0.5), (2.45, -0.72), (2.8, -0.82), (math.pi, -0.85)]


def interp(table, x):
    for (x0, y0), (x1, y1) in zip(table, table[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + (y1 - y0) * t
    return table[-1][1]


class Head:
    def __init__(self, bm_rest, body):
        dl = bm_rest.verts.layers.deform.active
        hi = body.vertex_groups["head"].index
        self.verts = [v for v in bm_rest.verts if v[dl].get(hi, 0.0) > 0.5]
        top = [v.co for v in self.verts if v.co.z > 1.58]
        ys = [p.y for p in top]
        zs = [v.co.z for v in self.verts]
        self.c = V((0.0, (min(ys) + max(ys)) / 2, max(zs) - 0.095))
        print("head centre", tuple(round(x, 3) for x in self.c))
        # ear outline: highest elevation of the ear per azimuth bin (both ears folded together)
        ei = body.vertex_groups["ears"].index
        bins = {}
        for v in bm_rest.verts:
            if v[dl].get(ei, 0.0) > 0.5:
                az, el = self.sph(v.co)
                k = round(abs(az) / 0.04)
                bins[k] = max(bins.get(k, -9.0), el)
        ks = sorted(bins)
        self.ear = [(k * 0.04, bins[k]) for k in ks]
        self.ear_lo, self.ear_hi = self.ear[0][0], self.ear[-1][0]
        print("ear azimuth", round(self.ear_lo, 2), "-", round(self.ear_hi, 2), "top el", round(max(b for _, b in self.ear), 3))

    def ear_top(self, az):
        """Elevation just clear of the ear's top edge at this azimuth (or None away from the ear)."""
        a = abs(az)
        if a < self.ear_lo - 0.08 or a > self.ear_hi + 0.08:
            return None
        return interp(self.ear, min(max(a, self.ear_lo), self.ear_hi))

    def hairline(self, az):
        base = interp(HAIRLINE, abs(az))
        top = self.ear_top(az)
        if top is None:
            return base
        a = abs(az)
        w = smoothstep(self.ear_lo - 0.08, self.ear_lo, a) * (1 - smoothstep(self.ear_hi, self.ear_hi + 0.08, a))
        return base + max(0.0, top + 0.05 - base) * w

    def sph(self, p):
        d = (p - self.c).normalized()
        return math.atan2(d.x, -d.y), math.asin(max(-1, min(1, d.z)))

    def on_scalp(self, p, margin=0.0):
        az, el = self.sph(p)
        return el > self.hairline(az) - margin

    def dir(self, az, el):
        return V((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))


def hair_material():
    m, nt = node_mat("hair")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    h = nt.nodes.new("ShaderNodeBsdfHairPrincipled")
    h.parametrization = "MELANIN"
    h.inputs["Melanin"].default_value = 0.62
    h.inputs["Melanin Redness"].default_value = 0.3
    h.inputs["Roughness"].default_value = 0.4
    h.inputs["Radial Roughness"].default_value = 0.32
    h.inputs["Coat"].default_value = 0.0
    h.inputs["Random Color"].default_value = 0.25
    h.inputs["Random Roughness"].default_value = 0.15
    nt.links.new(h.outputs[0], o.inputs["Surface"])
    return m


def cap_material():
    m, nt = node_mat("hair_cap")
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (0.2, 0.135, 0.08, 1)
    b.inputs["Roughness"].default_value = 0.95
    b.inputs["Specular IOR Level"].default_value = 0.1
    a = nt.nodes.new("ShaderNodeAttribute")
    a.attribute_name = "edge"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.04
    mr.inputs["From Max"].default_value = 0.3
    nt.links.new(a.outputs["Fac"], mr.inputs["Value"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mr.outputs["Result"], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(b.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], o.inputs["Surface"])
    return m


def scalp(bm_rest, head, body, arm):
    bm = bm_rest.copy()
    dl = bm.verts.layers.deform.active
    hi = body.vertex_groups["head"].index
    ni = body.vertex_groups["neck_01"].index
    bm.faces.index_update()
    def region(margin):
        return {f.index for f in bm.faces
                if all(v[dl].get(hi, 0) + v[dl].get(ni, 0) > 0.5 and v.co.z > 1.44 and head.on_scalp(v.co, margin)
                       for v in f.verts)}
    wide = region(0.06)
    head_bm = bm.copy()  # whole head skin, for laying strands on the surface
    hdl = head_bm.verts.layers.deform.active
    bmesh.ops.delete(head_bm, geom=[f for f in head_bm.faces
                                    if not all(v[hdl].get(hi, 0) + v[hdl].get(ni, 0) > 0.5 and v.co.z > 1.42
                                               for v in f.verts)],
                     context="FACES")
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in wide], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.normal_update()
    tree_bm = bm.copy()  # skin-level surface for the strands (reaches past the hairline)
    bm.faces.index_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not any(head.on_scalp(v.co, 0.0) for v in f.verts)],
                     context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # `edge`: how far inside the hairline (rad); the cap fades out toward the hairline
    edge = bm.verts.layers.float.new("edge")
    for v in bm.verts:
        az, el = head.sph(v.co)
        v[edge] = el - head.hairline(az)
        v.co += v.normal * 0.001
    me = bpy.data.meshes.new("hair_cap")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(cap_material())
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("hair_cap", me)
    bpy.context.scene.collection.objects.link(ob)
    g = ob.vertex_groups.new(name="head")
    g.add(range(len(me.vertices)), 1.0, "REPLACE")
    bind(ob, arm)
    sub = ob.modifiers.new("Subdivision", "SUBSURF")
    sub.levels, sub.render_levels = 1, 1
    return ob, tree_bm, head_bm


def sample_scalp(tree_bm, head, n):
    tris = []
    for f in tree_bm.faces:
        vs = [v.co for v in f.verts]
        for i in range(1, len(vs) - 1):
            a, b, c = vs[0], vs[i], vs[i + 1]
            tris.append((a, b, c, (b - a).cross(c - a).length / 2))
    total = sum(t[3] for t in tris)
    acc, cdf = 0.0, []
    for t in tris:
        acc += t[3]
        cdf.append(acc / total)
    import bisect
    out = []
    for _ in range(n):
        k = bisect.bisect_left(cdf, rnd.random())
        a, b, c, _ = tris[min(k, len(tris) - 1)]
        u, v = rnd.random(), rnd.random()
        if u + v > 1:
            u, v = 1 - u, 1 - v
        out.append(a + (b - a) * u + (c - a) * v)
    return out


def make_curves(name, strands, radius_root, radius_tip, mat):
    hc = bpy.data.hair_curves.new(name)
    hc.add_curves([len(s) for s in strands])
    flat = [c for s in strands for p in s for c in p]
    hc.position_data.foreach_set("vector", flat)
    rad = hc.attributes.get("radius") or hc.attributes.new("radius", "FLOAT", "POINT")
    vals = []
    for s in strands:
        n = len(s)
        vals += [radius_root + (radius_tip - radius_root) * (i / (n - 1)) ** 2 for i in range(n)]
    rad.data.foreach_set("value", vals)
    hc.materials.append(mat)
    ob = bpy.data.objects.new(name, hc)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def parent_to_bone(ob, arm, bone):
    ob.parent = arm
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    b = arm.data.bones[bone]
    # keep the rest placement: undo the bone's rest matrix (bone parenting uses the tail)
    M = arm.matrix_world @ b.matrix_local @ Matrix.Translation(V((0, b.length, 0)))
    ob.matrix_parent_inverse = M.inverted()


def clump(strands, n_guides):
    """Pull strands toward nearby guide strands, more strongly toward the tips (groomed clumps)."""
    from mathutils.kdtree import KDTree

    guides = rnd.sample(range(len(strands)), min(n_guides, len(strands)))
    kd = KDTree(len(guides))
    for i, g in enumerate(guides):
        kd.insert(strands[g][0], i)
    kd.balance()
    for s in strands:
        _, gi, _ = kd.find(s[0])
        g = strands[guides[gi]]
        n = len(s)
        for i in range(1, n):
            t = i / (n - 1)
            c = 0.12 + 0.5 * t
            target = g[i] + (s[i] - g[i]) * 0.35
            s[i] = s[i].lerp(target, c)


def posed_gravity(arm):
    """World 'down' expressed in the head's rest space, for the pose that pose.py will set."""
    import pose as P

    P.apply_pose(arm)
    pb = arm.pose.bones["head"]
    T = pb.matrix @ pb.bone.matrix_local.inverted()
    down = (T.to_3x3().inverted() @ V((0, 0, -1))).normalized()
    reset_pose(arm)
    return down


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()


def baby_hairs(head, tree, n):
    """Short fine hairs just inside the front hairline, lifting off the scalp."""
    out = []
    for _ in range(n):
        az = rnd.uniform(-1.45, 1.45)
        el = head.hairline(az) + rnd.uniform(-0.01, 0.04)
        d = head.dir(az, el)
        h = tree.ray_cast(head.c + d * 0.25, -d)
        if h[0] is None:
            continue
        p, nrm = h[0], h[1]
        back = (head.dir(az * 0.9, el + 0.3) - d).normalized()
        L = rnd.uniform(0.003, 0.009)
        curl = rnd.uniform(-1, 1)
        pts = []
        for i in range(8):
            t = i / 7
            side = nrm.cross(back).normalized() * curl * 0.003 * t * t
            pts.append(p + nrm * (0.0004 + 0.0022 * t * rnd.uniform(0.5, 1.2)) + back * L * t + side)
        out.append(pts)
    return out


def flyaways(head, tree, bun_c, R, down, n):
    """Stray hairs off the bun and at the nape, arcing out and falling."""
    out = []
    for k in range(n):
        if k < n * 0.4:
            d = (V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))).normalized()
            p = bun_c + d * (R * 0.8)
        else:
            az = rnd.uniform(2.3, 3.14) * rnd.choice((-1, 1))
            el = head.hairline(az) + rnd.uniform(0.0, 0.06)
            dd = head.dir(az, el)
            h = tree.ray_cast(head.c + dd * 0.25, -dd)
            if h[0] is None:
                continue
            p, d = h[0] + dd * 0.002, dd
        L = rnd.uniform(0.015, 0.05)
        pts = []
        q = p.copy()
        v = (d * 0.8 + down * 0.4).normalized()
        for i in range(12):
            pts.append(q.copy())
            v = (v + down * 0.12 + V((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * 0.08).normalized()
            q = q + v * (L / 11)
        out.append(pts)
    return out


def face_strands(head, body, arm, bm_rest):
    """Loose face-framing strands from the temples (the reference's tendril): born from a short
    band of hairline, falling forward along the cheek with soft waves under gravity in the final
    pose, draped around cheek and jaw, tips uneven. Returned in the head's rest space."""
    import pose as P

    P.apply_pose(arm)
    dg = bpy.context.evaluated_depsgraph_get()
    pb = arm.pose.bones["head"]
    T = arm.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()
    Ti = T.inverted()
    R3 = T.to_3x3()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    ev.to_mesh_clear()
    bm.transform(body.matrix_world)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 1.2], context="VERTS")
    skin = BVHTree.FromBMesh(bm)
    rest_tree = BVHTree.FromBMesh(bm_rest)
    down = V((0, 0, -1))
    fwd = (R3 @ V((0, -1, 0))).normalized()  # where the face points

    def root_at(az):
        el = head.hairline(az) + 0.025
        d = head.dir(az, el)
        hit = rest_tree.ray_cast(head.c + d * 0.2, -d)
        p = (hit[0] if hit[0] is not None else head.c + d * 0.09) + d * 0.0012
        return T @ p, (R3 @ d).normalized()

    def hang(root, out_dir, length, wave, seed):
        """Walk down from the root: gravity, a little forward along the cheek, a smooth S-wave
        (amplitude `wave` metres) and a soft push-out from the skin."""
        g = [root.copy()]
        v = (down * 0.8 + fwd * 0.38 + out_dir * 0.1).normalized()
        step = 0.003
        n = int(length / step)
        prev_off = 0.0
        for i in range(1, n):
            t = i / (n - 1)
            v = (v + down * 0.05 - (out_dir * 0.04 if t > 0.75 else V())).normalized()
            lat = v.cross(out_dir).normalized()
            off = wave * math.sin(t * 2.4 * math.pi + seed) * min(1.0, t * 4)
            q = g[-1] + v * step + lat * (off - prev_off)
            prev_off = off
            loc, nrm, _, dist = skin.find_nearest(q)
            if loc is not None and ((q - loc).dot(nrm) < 0 or dist < 0.004):
                q = q.lerp(loc + nrm * 0.004, 0.7)
            g.append(q)
        # light smoothing so collision nudges don't leave kinks
        for _ in range(3):
            g = [g[0]] + [(g[i - 1] + g[i] * 2 + g[i + 1]) / 4 for i in range(1, len(g) - 1)] + [g[-1]]
        return g

    out = []
    # (azimuth band on the hairline, length, hairs, wave)
    for az0, az1, length, count, wave in ((-1.14, -0.8, 0.17, 520, 0.008), (0.86, 1.1, 0.1, 220, 0.005)):
        rmid, out_mid = root_at((az0 + az1) / 2)
        guide = hang(rmid, out_mid, length, wave, 0.5 if az0 < 0 else 2.0)
        for k in range(count):
            r0, _ = root_at(rnd.uniform(az0, az1))
            stray = rnd.random() < 0.05
            a0 = rnd.uniform(0, 6.2832)
            rr = rnd.uniform(0, 1) ** 0.6
            seed = rnd.uniform(0, 100)
            pts = []
            for i, g in enumerate(guide):
                t = i / (len(guide) - 1)
                tg = (guide[min(i + 1, len(guide) - 1)] - guide[max(i - 1, 0)]).normalized()
                a = tg.orthogonal().normalized()
                b = tg.cross(a)
                # gathers from the root band into a ribbon, splays toward the tip
                rad = (0.0032 * (1 - t) ** 2 + 0.0026 + 0.004 * t ** 2 + (0.008 * t if stray else 0)) * rr
                ang = a0 + 0.9 * noise.noise(V((t * 3, seed, 2)))
                q = g + (a * math.cos(ang) * 1.6 + b * math.sin(ang) * 0.6) * rad
                blend = max(0.0, 1 - t * 3.5)  # first ~5 cm: fans in from its own root
                q = q.lerp(r0 + (q - guide[0]) * 0.2, blend * blend)
                pts.append(Ti @ q)
            cut = len(pts) - int(len(pts) * 0.55 * rnd.random() ** 1.5)  # uneven, tapering ends
            out.append(pts[:max(cut, 6)])
    bm.free()
    reset_pose(arm)
    return out


def build(bm_rest, body, arm):
    head = Head(bm_rest, body)
    cap, tree_bm, head_bm = scalp(bm_rest, head, body, arm)
    tree = BVHTree.FromBMesh(head_bm)
    mat = hair_material()

    # bun: ring at the back of the head, axis pointing back and a little down
    # set higher on the back of the head and fuller, as in the reference
    bun_dir = head.dir(math.pi, 0.12)
    hit = tree.ray_cast(head.c + bun_dir * 0.2, -bun_dir)
    surf = hit[0] if hit[0] is not None else head.c + bun_dir * 0.095
    R_major, R_minor = 0.021, 0.02
    bun_c = surf + bun_dir * (R_minor * 0.8 + 0.005)
    ax = bun_dir.copy()
    u = V((1, 0, 0))
    w = ax.cross(u).normalized()

    def ring_point(phi, rr=0.0):
        """Point on the bun's base ring (where strands enter), at angle phi around the bun axis."""
        return bun_c - ax * (R_minor * 0.6) + (u * math.cos(phi) + w * math.sin(phi)) * (R_major + rr)

    # --- flow strands
    roots = sample_scalp(tree_bm, head, 26000)
    # extra roots in the band just inside the hairline, where coverage matters most
    extra = []
    for p in sample_scalp(tree_bm, head, 30000):
        az, el = head.sph(p)
        if 0.0 < el - head.hairline(az) < 0.14:
            extra.append(p)
        if len(extra) >= 7000:
            break
    roots += extra
    strands = []
    for p0 in roots:
        az0, el0 = head.sph(p0)
        # soft hairline: roots thin out over the last few degrees
        if rnd.random() > smoothstep(-0.02, 0.09, el0 - head.hairline(az0)):
            continue
        d0 = (p0 - head.c).normalized()
        # where it enters the bun: angle around the bun from the root's direction
        rel = d0 - ax * d0.dot(ax)
        phi = math.atan2(rel.dot(w), rel.dot(u))
        end = ring_point(phi + rnd.uniform(-0.15, 0.15), rnd.uniform(-0.004, 0.004))
        de = (end - head.c).normalized()
        layer = rnd.uniform(0.0, 1.0)
        pts = []
        n = 26
        jit = rnd.uniform(0, 100)
        for i in range(n):
            t = i / (n - 1)
            dd = d0.slerp(de, t) if d0.angle(de) > 1e-4 else de
            # keep above the ear: hair from the temples is combed back over it, not across it
            az, el = head.sph(head.c + dd)
            top = head.ear_top(az)
            if top is not None and t > 0.02 and el < top + 0.03:
                dd = head.dir(az, top + 0.03 + 0.01 * rnd.random())
            h = tree.ray_cast(head.c + dd * 0.25, -dd)
            surf_p = h[0] if h[0] is not None else head.c + dd * 0.09
            # volume: fuller over the crown, slimmer at the sides and nape; lifts away from the root
            vol = 0.004 + 0.009 * smoothstep(0.2, 0.9, dd.z) + 0.002 * smoothstep(0.3, 0.8, -dd.y)
            # ...and thins out toward the hairline, so the sides have no ledge above the ears
            vol *= smoothstep(0.0, 0.45, el - head.hairline(az))
            off = 0.0006 + vol * (0.2 + 0.8 * layer) * smoothstep(0.0, 0.3, t)
            q = surf_p + dd * off
            # gentle waves across the flow
            q += dd.cross(de).normalized() * 0.0011 * noise.noise(V((t * 6, jit, 0.3)))
            if t > 0.82:  # lift off the scalp into the bun
                k = (t - 0.82) / 0.18
                q = q.lerp(end, k * k)
            pts.append(q)
        strands.append(pts)

    clump(strands, 900)

    # --- bun: twisted rope wound into a ring, a little untidy
    bun = []
    for k in range(6500):
        phi0 = rnd.uniform(0, 2 * math.pi)
        psi0 = rnd.uniform(0, 2 * math.pi)
        rr = R_minor * math.sqrt(rnd.uniform(0.15, 1.0))
        turns = rnd.uniform(1.0, 1.7)
        twist = 3.2 + rnd.uniform(-0.4, 0.4)
        loose = rnd.random() < 0.03  # a few strands bulge out of the twist
        seed = rnd.uniform(0, 100)
        pts = []
        n = 48
        for i in range(n):
            t = i / (n - 1)
            phi = phi0 + t * turns * 2 * math.pi
            psi = psi0 + t * turns * twist * 2 * math.pi
            radial = u * math.cos(phi) + w * math.sin(phi)
            tube_c = bun_c + radial * R_major * (1 + 0.08 * noise.noise(V((phi, seed, 0))))
            r = rr * (1 + 0.18 * noise.noise(V((t * 5, seed, 1)))) + (0.006 * math.sin(t * math.pi) if loose else 0)
            # cross-section slightly flattened against the head
            q = tube_c + (radial * math.cos(psi) * 1.0 + ax * math.sin(psi) * 0.8) * r
            pts.append(q)
        bun.append(pts)

    # --- wisps: a few loose strands at the temples and nape
    wisps = []
    for side in (-1, 1):
        for k in range(10):
            az = side * rnd.uniform(1.0, 1.35)
            el = head.hairline(az) + rnd.uniform(0.0, 0.05)
            d = head.dir(az, el)
            h = tree.ray_cast(head.c + d * 0.25, -d)
            p = (h[0] if h[0] is not None else head.c + d * 0.09) + d * 0.001
            pts = [p]
            dirn = V((side * 0.15, -0.25, -1)).normalized()
            for i in range(1, 22):
                p = p + dirn * 0.0035 + V((side * 0.0004, -0.0006, 0)) * math.sin(i * 0.4 + k)
                pts.append(p)
            wisps.append(pts)

    # --- baby hairs along the front hairline, flyaways at the nape and off the bun
    down_rest = posed_gravity(arm)
    fuzz = baby_hairs(head, tree, 200) + flyaways(head, tree, bun_c, R_major, down_rest, 70)

    # --- face-framing strands, hung in the final pose
    loose = face_strands(head, body, arm, bm_rest)

    # (Blender crashes on add_curves([]), so empty sets are skipped)
    objs = [make_curves(name, s, r0, r1, mat) for name, s, r0, r1 in (
        ("hair_flow", strands, 0.00008, 0.00004),
        ("hair_bun", bun, 0.00008, 0.00006),
        ("hair_wisps", wisps, 0.00005, 0.00002),
        ("hair_fuzz", fuzz, 0.00004, 0.000015),
        ("hair_strand", loose, 0.00009, 0.00003)) if s]
    for ob in objs:
        parent_to_bone(ob, arm, "head")
    tree_bm.free()
    head_bm.free()
    print("hair strands", len(strands), len(bun), len(wisps), len(fuzz), len(loose))
    return [cap] + objs


if __name__ == "__main__":
    a = [x for x in C.args() if not x.startswith("--")]
    bpy.ops.wm.open_mainfile(filepath=a[0] if a else C.out("skated.blend"))
    arm = bpy.data.objects["skater"]
    body = bpy.data.objects["skater.body"]
    bm_rest = rest_mesh(body)
    build(bm_rest, body, arm)
    bm_rest.free()
    bpy.ops.wm.save_as_mainfile(filepath=C.out("haired.blend"))
    if "--preview" in C.args():
        C.cycles(samples=48, res=(800, 800))
        C.studio()
        for name, az in (("front", 25), ("side", -90), ("back", 160)):
            C.shoot(C.out(f"hair_{name}.png"), az, target=(0, -0.01, 1.56), dist=1.0, elev_deg=6)
