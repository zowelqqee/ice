"""Step 7: the web model for the hero, from the posed build.

- Pose and corrective smoothing are baked; subdivision is left to smooth normals.
- Hidden geometry is dropped (skin under the velvet and inside the boots, the transparent part
  of the costume shell). The shell is split into an opaque velvet mesh and a sheer mesh that
  carries its velvet / sheer / open masks as vertex colours (R = opaque, G = cover; 0.5 = edge).
- Hair becomes strand lines (glTF LINES) with a scalp cap and a solid bun core under them.
  Line colour attribute: R = position along the strand (0 root, 1 tip), G = per-strand random.
- Parts are merged by material; heavy meshes (boot, crystals, lashes) are decimated.
- Empties mark the spin pivot (blade contact), the free blade and the fingertips for the trails.
- Neutral object and material names; the site picks materials by name.

    scripts/skater/run.sh export_web.py [posed.blend]   ->  $SKATER_OUT/skater_web_raw.glb
"""

import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402

V = Vector
rnd = random.Random(3)
a = [x for x in C.args() if not x.startswith("--")]
bpy.ops.wm.open_mainfile(filepath=a[0] if a else C.out("posed.blend"))
scn = bpy.context.scene
arm = bpy.data.objects["skater"]

for ob in bpy.data.objects:
    for m in ob.modifiers:
        if m.type == "SUBSURF":
            m.show_viewport = False
dg = bpy.context.evaluated_depsgraph_get()

web = bpy.data.collections.new("web")
scn.collection.children.link(web)
# free the plain names for the export materials (the site picks materials by exact name)
for m in bpy.data.materials:
    m.name = "src_" + m.name


# ---------------------------------------------------------------- materials
def image_of(ob):
    """The diffuse image of an object's material (searching inside node groups too): the largest
    image whose name does not mark it as a normal/bump/roughness map."""
    found = []

    def walk(tree):
        for n in tree.nodes:
            if n.bl_idname == "ShaderNodeTexImage" and n.image:
                found.append(n.image)
            elif n.bl_idname == "ShaderNodeGroup" and n.node_tree:
                walk(n.node_tree)

    for slot in ob.material_slots:
        if slot.material and slot.material.node_tree:
            walk(slot.material.node_tree)
    found = [i for i in found if not any(k in i.name.lower() for k in ("normal", "nrm", "bump", "rough", "spec", "ao"))]
    return max(found, key=lambda i: i.size[0] * i.size[1], default=None)


def material(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, image=None, alpha_clip=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if alpha_clip:
            nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
            m.blend_method = "CLIP"
    return m


# ---------------------------------------------------------------- mesh helpers
def evaluated_mesh(ob, decimate=None):
    if decimate:
        d = ob.modifiers.new("web_decimate", "DECIMATE")
        d.ratio = decimate
        bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
    me.transform(ob.matrix_world)
    if decimate:
        ob.modifiers.remove(ob.modifiers["web_decimate"])
    return me


def add(name, me, mat):
    if name != "hair":  # only the hair is lines; drop stray loose edges elsewhere
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_edges], context="VERTS")
        bm.to_mesh(me)
        bm.free()
    me.validate(clean_customdata=False)
    me.name = name
    me.materials.clear()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    web.objects.link(ob)
    return ob


def merge(name, parts, mat):
    """parts: list of (object, decimate ratio or None) -> one mesh."""
    bm = bmesh.new()
    for ob, dec in parts:
        me = evaluated_mesh(ob, dec)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return add(name, me, mat)


def keep_uv_only_first(me):
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[-1])


# ---------------------------------------------------------------- body and face
body = bpy.data.objects["skater.body"]
skin_img = image_of(body)
print("textures:", skin_img and skin_img.name, image_of(bpy.data.objects["skater.high-poly"]).name,
      image_of(bpy.data.objects["skater.mindfront_eyebrows_03"]), image_of(bpy.data.objects["skater.mindfront_eyelashes_02"]))
me = evaluated_mesh(body)  # the mask modifier already drops the hidden skin
# close the legs where the skin inside the boots was removed (seen through glass, an open cut
# shows as a dark ring above the collar)
bmb = bmesh.new()
bmb.from_mesh(me)
edges = [e for e in bmb.edges if e.is_boundary]
seen, loops = set(), []
for e in edges:
    if e in seen:
        continue
    loop, stack = [], [e]
    seen.add(e)
    while stack:
        x = stack.pop()
        loop.append(x)
        for v in x.verts:
            for y in v.link_edges:
                if y.is_boundary and y not in seen:
                    seen.add(y)
                    stack.append(y)
    loops.append(loop)
legs = [lp for lp in loops
        if sum((e.verts[0].co + e.verts[1].co).z / 2 for e in lp) / len(lp) < 0.8 and sum(e.calc_length() for e in lp) < 0.45]
for lp in legs:
    bmesh.ops.holes_fill(bmb, edges=lp, sides=0)
bmb.to_mesh(me)
bmb.free()
print("closed leg openings", len(legs))
keep_uv_only_first(me)
add("skin", me, material("skin", image=skin_img, rough=0.5))

eyes = bpy.data.objects["skater.high-poly"]
me = evaluated_mesh(eyes)
keep_uv_only_first(me)
add("eyes", me, material("eyes", image=image_of(eyes), rough=0.15))

def thin_islands(me, keep_every):
    """Brows and lashes are thousands of separate little cards: keep one in `keep_every`."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen, drop = set(), []
    k = 0
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, island = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            island.append(x)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        if k % keep_every:
            drop += island
        k += 1
    bmesh.ops.delete(bm, geom=drop, context="VERTS")
    bm.to_mesh(me)
    bm.free()


for src, name, every in (("skater.mindfront_eyebrows_03", "brows", 3), ("skater.mindfront_eyelashes_02", "lashes", 4)):
    ob = bpy.data.objects[src]
    me = evaluated_mesh(ob)
    thin_islands(me, every)
    keep_uv_only_first(me)
    add(name, me, material(name, image=image_of(ob), rough=0.6, alpha_clip=True))

# ---------------------------------------------------------------- costume shell: velvet + sheer
shell = bpy.data.objects["costume_shell"]
me = evaluated_mesh(shell)
bm = bmesh.new()
bm.from_mesh(me)
bpy.data.meshes.remove(me)
cov = bm.verts.layers.float.get("cover")
opq = bm.verts.layers.float.get("opaque")
bmesh.ops.delete(bm, geom=[f for f in bm.faces if max(v[cov] for v in f.verts) < -0.002], context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
velvet_faces = {f.index for f in bm.faces if min(v[opq] for v in f.verts) > 0.003}
for part, keep_velvet in (("velvet", True), ("sheer", False)):
    b2 = bm.copy()
    b2.faces.ensure_lookup_table()
    bmesh.ops.delete(b2, geom=[f for f in b2.faces if (f.index in velvet_faces) != keep_velvet], context="FACES")
    bmesh.ops.delete(b2, geom=[v for v in b2.verts if not v.link_faces], context="VERTS")
    m2 = bpy.data.meshes.new(part)
    b2.to_mesh(m2)
    b2.free()
    keep_uv_only_first(m2)
    if part == "sheer":
        ca = m2.color_attributes.new("Col", "BYTE_COLOR", "POINT")
        ao = m2.attributes["opaque"].data
        ac = m2.attributes["cover"].data
        for i in range(len(m2.vertices)):
            ca.data[i].color = (min(1, max(0, 0.5 + ao[i].value * 40)), min(1, max(0, 0.5 + ac[i].value * 40)), 0, 1)
        m2.color_attributes.active_color = ca
    for n in ("cover", "opaque"):
        if n in m2.attributes:
            m2.attributes.remove(m2.attributes[n])
    add(part, m2, material(part, color=(0.01, 0.012, 0.05)))
bm.free()

# ---------------------------------------------------------------- skirt
navy = material("chiffon_navy", color=(0.01, 0.012, 0.045))
lav = material("chiffon_lavender", color=(0.06, 0.04, 0.2))
for src, mat in (("skirt_outer", navy), ("skirt_middle", navy), ("skirt_inner", lav)):
    add(src, evaluated_mesh(bpy.data.objects[src], 0.55), mat)

# ---------------------------------------------------------------- sparkle
merge("crystals", [(bpy.data.objects["crystals"], 0.32)], material("crystal", color=(0.95, 0.97, 1.0), rough=0.1, metal=1.0))
merge("veins", [(bpy.data.objects["frost_veins"], 0.5)], material("thread", color=(0.72, 0.8, 0.95), rough=0.22, metal=1.0))

# ---------------------------------------------------------------- hair
merge("hair_cap", [(bpy.data.objects["hair_cap"], None)], material("hair_cap", color=(0.2, 0.135, 0.08), rough=0.9))


def strands(ob, step, npts):
    """Resampled world-space polylines from a hair curves object."""
    cv = ob.data
    pos = [ob.matrix_world @ p.position for p in cv.points]
    out = []
    for ci, c in enumerate(cv.curves):
        if ci % step:
            continue
        pts = pos[c.first_point_index:c.first_point_index + c.points_length]
        if len(pts) < 2:
            continue
        acc = [0.0]
        for p0, p1 in zip(pts, pts[1:]):
            acc.append(acc[-1] + (p1 - p0).length)
        L = acc[-1]
        res = []
        j = 0
        for k in range(npts):
            s = L * k / (npts - 1)
            while j < len(acc) - 2 and acc[j + 1] < s:
                j += 1
            t = (s - acc[j]) / max(acc[j + 1] - acc[j], 1e-9)
            res.append(pts[j].lerp(pts[j + 1], t))
        out.append(res)
    return out


lines = []
for src, step, npts in (("hair_flow", 4, 9), ("hair_bun", 3, 13), ("hair_strand", 1, 20), ("hair_fuzz", 1, 6), ("hair_wisps", 1, 10)):
    if src in bpy.data.objects:
        lines += strands(bpy.data.objects[src], step, npts)
verts, edges, col = [], [], []
for s in lines:
    base = len(verts)
    r = rnd.random()
    for k, p in enumerate(s):
        verts.append(p)
        col.append((k / (len(s) - 1), r, 0, 1))
    edges += [(base + k, base + k + 1) for k in range(len(s) - 1)]
me = bpy.data.meshes.new("hair")
me.from_pydata(verts, edges, [])
ca = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
for i, c in enumerate(col):
    ca.data[i].color = c
me.color_attributes.active_color = ca
hair_ob = add("hair", me, material("hair_lines", color=(0.3, 0.2, 0.12)))
print("hair lines", len(lines), "segments", len(edges))

# solid core under the bun strands (convex hull, drawn a little inside them)
bun_pts = [p for s in strands(bpy.data.objects["hair_bun"], 4, 8) for p in s]
bmh = bmesh.new()
for p in bun_pts:
    bmh.verts.new(p)
bmesh.ops.convex_hull(bmh, input=bmh.verts)
bmesh.ops.delete(bmh, geom=[v for v in bmh.verts if not v.link_faces], context="VERTS")
cen = sum((v.co for v in bmh.verts), V()) / len(bmh.verts)
for v in bmh.verts:
    v.co = cen + (v.co - cen) * 0.86
me = bpy.data.meshes.new("bun_core")
bmh.to_mesh(me)
bmh.free()
add("bun_core", me, material("bun_core", color=(0.2, 0.135, 0.08), rough=0.9))

# ---------------------------------------------------------------- skates
O = bpy.data.objects
merge("leather", [(O[f"skate_boot_{s}"], 0.08) for s in "lr"] + [(O[f"skate_{p}_{s}"], None) for s in "lr" for p in ("tongue", "collar")],
      material("leather", color=(0.86, 0.855, 0.84), rough=0.38))
merge("laces", [(O[f"skate_laces_{s}"], 0.5) for s in "lr"], material("lace", color=(0.9, 0.9, 0.88), rough=0.7))
merge("hardware", [(O[f"skate_hardware_{s}"], 0.5) for s in "lr"], material("hardware", color=(0.85, 0.86, 0.88), rough=0.15, metal=1.0))
merge("soles", [(O[f"skate_{p}_{s}"], None) for s in "lr" for p in ("sole", "heel")], material("sole", color=(0.42, 0.25, 0.12), rough=0.5))
merge("blades", [(O[f"skate_{p}_{s}"], None) for s in "lr" for p in ("blade", "plates")], material("steel", color=(0.88, 0.9, 0.93), rough=0.24, metal=1.0))


# ---------------------------------------------------------------- anchors
def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    web.objects.link(e)


def world_verts(ob):
    deps = bpy.context.evaluated_depsgraph_get()
    return [ob.matrix_world @ v.co for v in ob.evaluated_get(deps).data.vertices]


blade_l = world_verts(O["skate_blade_l"])
zmin = min(p.z for p in blade_l)
low = [p for p in blade_l if p.z < zmin + 0.0015]
pivot = sum(low, V()) / len(low)
empty("anchor_pivot", pivot)
blade_r = world_verts(O["skate_blade_r"])
toe = max(blade_r, key=lambda p: (p.x - pivot.x) ** 2 + (p.y - pivot.y) ** 2)
empty("anchor_toe", toe)
for s in "lr":
    pb = arm.pose.bones[f"middle_03_{s}"]
    empty(f"anchor_tip_{s}", arm.matrix_world @ pb.tail)
print("pivot", tuple(round(c, 3) for c in pivot), "toe", tuple(round(c, 3) for c in toe))

# ---------------------------------------------------------------- names
for ob in list(web.objects):
    base = ob.name.split(".")[0]
    if base != ob.name:
        clash = bpy.data.objects.get(base)
        if clash and clash.name not in web.objects:
            clash.name = "src_" + base
        ob.name = base

# ---------------------------------------------------------------- export
tris = 0
for ob in web.objects:
    if ob.type == "MESH":
        t = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        tris += t
        print("  ", ob.name, "verts", len(ob.data.vertices), "tris", t)
print("web objects", len(web.objects), "triangles", tris)
for ob in bpy.data.objects:
    ob.select_set(ob.name in web.objects)
path = C.out("skater_web_raw.glb")
bpy.ops.export_scene.gltf(
    filepath=path,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_texcoords=True,
    export_normals=True,
    export_vertex_color="ACTIVE",
    use_mesh_edges=True,  # hair strands as LINES
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_extras=False,
    export_skins=False,
    export_morph=False,
    export_animations=False,
)
print("exported", path, round(os.path.getsize(path) / 1e6, 2), "MB")
