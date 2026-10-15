"""Quick look-dev renders of a build stage.

    scripts/skater/run.sh preview.py <file.blend> <prefix> [full|bodice|head|skates ...]
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402

a = C.args()
bpy.ops.wm.open_mainfile(filepath=a[0])
prefix = a[1]
shots = a[2:] or ["full"]
C.cycles(samples=64, res=(700, 1100))
C.studio()
for s in shots:
    if s == "full":
        for name, az in (("main", 15), ("front", 0), ("side", -90), ("back", 180)):
            C.shoot(C.out(f"{prefix}_{name}.png"), az, target=(0, 0, 1.0), dist=6.4, res=(700, 1100))
    elif s == "bodice":
        C.shoot(C.out(f"{prefix}_bodice.png"), 10, target=(0, -0.05, 1.18), dist=1.6, res=(900, 1000))
        C.shoot(C.out(f"{prefix}_back.png"), 180, target=(0, 0.0, 1.2), dist=1.6, res=(900, 1000))
    elif s == "head":
        C.shoot(C.out(f"{prefix}_head.png"), 20, target=(0, -0.02, 1.68), dist=1.3, res=(900, 900))
    elif s == "skates":
        C.shoot(C.out(f"{prefix}_skates.png"), 30, target=(0, -0.05, 0.3), dist=1.8, res=(900, 900))
