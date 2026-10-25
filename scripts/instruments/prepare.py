# Prepares one CC0 instrument model for the ice orchestra (headless Blender, no embedded scripts run):
# keeps only its meshes (curves become meshes; text, lights, floors dropped), applies modifiers,
# joins everything into one mesh, welds and smooths it, decimates to a triangle budget, puts the
# origin at the centre of its base, and exports a GLB with geometry only (no materials or textures).
#   blender -b --factory-startup --disable-autoexec --python prepare.py -- <src> <out.glb> <max_tris> [drop,names]
# Sources and licences: scripts/instruments/README.md
import bpy, bmesh, sys, mathutils

args = sys.argv[sys.argv.index("--") + 1:]
src, out, max_tris = args[0], args[1], int(args[2])
drop = set(args[3].split(",")) if len(args) > 3 and args[3] else set()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
if src.endswith(".blend"):
    with bpy.data.libraries.load(src, link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)
    for o in data_to.objects:
        if o is not None:
            scene.collection.objects.link(o)
else:
    bpy.ops.wm.stl_import(filepath=src)

# keep meshes and curves (as meshes); drop text, lights, cameras, empties and named extras
for o in list(scene.objects):
    if o.name in drop or o.type not in {"MESH", "CURVE"} or o.hide_render:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
for o in scene.objects:
    o.hide_set(False)
    o.select_set(True)
bpy.context.view_layer.objects.active = next(iter(scene.objects))
bpy.ops.object.convert(target="MESH")  # applies modifiers, turns curves into meshes
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active

# weld (STL files come as loose triangles), drop degenerate faces
bm = bmesh.new()
bm.from_mesh(obj.data)
size = max(obj.dimensions)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=size * 1e-5)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=size * 1e-6)
bm.to_mesh(obj.data)
bm.free()

tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
if tris > max_tris:
    m = obj.modifiers.new("decimate", "DECIMATE")
    m.ratio = max_tris / tris
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.object.shade_smooth_by_angle(angle=0.7)

# origin at the centre of the base (Blender Z-up; the glTF export turns it Y-up)
bb = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
mn = mathutils.Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
mx = mathutils.Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
obj.data.transform(mathutils.Matrix.Translation(-mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
obj.name = obj.data.name = "ice"

final = sum(len(p.vertices) - 2 for p in obj.data.polygons)
print(f"PREPARED {src.split('/')[-1]}: {tris} -> {final} tris, dims {tuple(round(d, 3) for d in obj.dimensions)}")
bpy.ops.export_scene.gltf(
    filepath=out, export_format="GLB", use_selection=False, export_materials="NONE",
    export_normals=True, export_texcoords=False, export_apply=True, export_extras=False,
)
