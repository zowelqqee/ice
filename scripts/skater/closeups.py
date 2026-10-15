"""Detail close-ups on the presentation stage: face and hair, the bun, the skates.

    scripts/skater/run.sh closeups.py [posed.blend]
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402
import render_sheet as R  # noqa: E402

a = [x for x in C.args() if not x.startswith("--")]
bpy.ops.wm.open_mainfile(filepath=a[0] if a else C.out("posed.blend"))
for n in ("Key", "Fill", "RimL", "RimR", "Cam"):
    if n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n])
scn = C.cycles(samples=160)
scn.cycles.transparent_max_bounces = 64
scn.view_settings.look = "AgX - Base Contrast"
R.ice_floor()
R.ice_spray()
rig = R.light_rig()
head = bpy.data.objects["skater"].pose.bones["head"]
hp = bpy.data.objects["skater"].matrix_world @ head.head
for name, az, tgt, dist, res, elev in (
    ("face", -32, (hp.x + 0.01, hp.y - 0.03, hp.z + 0.05), 0.95, (900, 1000), 2),
    ("bun", 150, (hp.x, hp.y + 0.03, hp.z + 0.06), 0.95, (900, 1000), 6),
    ("skates", 25, (0.0, -0.05, 0.28), 1.6, (1000, 1000), 8),
    ("skate_side", -75, (0.03, -0.03, 0.1), 0.85, (1000, 800), 4),
    ("bodice", 4, (0.0, -0.06, 1.2), 1.1, (900, 1000), 3),
):
    R.shoot(rig, C.out(f"close_{name}.png"), az, tgt, dist, res, elev=elev, lens=85, samples=160)
