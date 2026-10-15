# Blender (headless) prep for the hero dancer model; see scripts/media/skater-model.mjs.
#   Blender -b --factory-startup -P scripts/media/skater-prep.py -- <ballerina.glb> <figure.glb> <preview-prefix>
import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index("--") + 1:]
src, out_glb, out_png = argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
# drop the music-box base, keep the dancer
for o in list(bpy.data.objects):
    if o.type == "MESH" and not o.name.lower().startswith("balerina"):
        bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
fig = [o for o in bpy.data.objects if o.type == "MESH"][0]
# bake world transform into the mesh, unparent
mw = fig.matrix_world.copy()
fig.parent = None
fig.matrix_world = mw
bpy.context.view_layer.objects.active = fig
fig.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o != fig: bpy.data.objects.remove(o, do_unlink=True)
me = fig.data
while len(me.uv_layers): me.uv_layers.remove(me.uv_layers[0])
for ca in list(me.color_attributes): me.color_attributes.remove(ca)
# report bounds
xs=[v.co.x for v in me.vertices]; ys=[v.co.y for v in me.vertices]; zs=[v.co.z for v in me.vertices]
print("BOUNDS x", min(xs), max(xs), "y", min(ys), max(ys), "z", min(zs), max(zs), "verts", len(me.vertices), "faces", len(me.polygons))
# merge duplicate verts so smooth shading works, smooth with a crease angle
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=0.0001); bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_smooth()
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
except Exception as e:
    print("autosmooth", e)
print("after weld verts", len(me.vertices))
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=False, export_animations=False, export_texcoords=False, export_normals=True, export_materials="NONE", export_extras=False)
# quick preview renders (front / side / top) with workbench
scn = bpy.context.scene
scn.render.engine = "BLENDER_WORKBENCH"
scn.render.resolution_x, scn.render.resolution_y = 900, 900
scn.display.shading.light = "STUDIO"
scn.display.shading.color_type = "SINGLE"
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam); scn.camera = cam
cam.data.type = "ORTHO"
c = mathutils.Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2))
size = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)) * 1.15
cam.data.ortho_scale = size
for name, d in [("x", (1,0,0)), ("y", (0,-1,0)), ("z", (0,0,1)), ("ny", (0,1,0))]:
    dv = mathutils.Vector(d)
    cam.location = c + dv * size * 3
    cam.rotation_euler = (-dv).to_track_quat("-Z", "Y" if name == "z" else "Z").to_euler()
    scn.render.filepath = f"{out_png}_{name}.png"
    bpy.ops.render.render(write_still=True)
