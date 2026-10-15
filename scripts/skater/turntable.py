"""Turntable frames of the finished model (same stage as the sheet); ffmpeg makes the video.

    scripts/skater/run.sh turntable.py [posed.blend] [frames] [--quick]
    ffmpeg -framerate 24 -i ~/ice/skater-build/out/turn/%04d.png -c:v libx264 -pix_fmt yuv420p \\
           -crf 18 -map_metadata -1 -fflags +bitexact ~/ice/skater-build/out/turntable.mp4
"""

import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402
import render_sheet as R  # noqa: E402

a = [x for x in C.args() if not x.startswith("--")]
bpy.ops.wm.open_mainfile(filepath=a[0] if a else C.out("posed.blend"))
frames = int(a[1]) if len(a) > 1 else 96
quick = "--quick" in C.args()
for n in ("Key", "Fill", "RimL", "RimR", "Cam"):
    if n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n])
scn = C.cycles(samples=24 if quick else 48, res=(540, 960))
scn.cycles.transparent_max_bounces = 64
scn.view_settings.look = "AgX - Base Contrast"
R.ice_floor()
R.ice_spray()
rig = R.light_rig()
rig.rotation_euler = (0, 0, math.radians(12))
arm = bpy.data.objects["skater"]
os.makedirs(C.out("turn"), exist_ok=True)
cam_az = 12
for i in range(frames):
    arm.rotation_euler = (0, 0, 2 * math.pi * i / frames)
    bpy.context.view_layer.update()
    C.shoot(C.out("turn", f"{i:04d}.png"), cam_az, target=(0, 0, 0.98), dist=6.2, elev_deg=4, lens=70)
