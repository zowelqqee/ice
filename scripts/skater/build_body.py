"""Step 1: the body. A young athletic woman from the MakeHuman base (CC0 assets), with the
game-engine rig, high-poly eyes, brows, lashes, teeth, and a natural skin.

    scripts/skater/run.sh build_body.py [--preview]
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402

pkg = C.mpfb()
from importlib import import_module  # noqa: E402

HumanService = import_module(pkg.__name__ + ".services.humanservice").HumanService

bpy.ops.wm.read_factory_settings(use_empty=True)
pkg = C.mpfb()

PHENOTYPE = {
    "gender": 0.0,
    "age": 0.44,  # ~22 years
    "muscle": 0.6,
    "weight": 0.34,
    "proportions": 1.0,
    "height": 0.5,
    "cupsize": 0.45,
    "firmness": 0.7,
    "race": {"caucasian": 0.9, "asian": 0.06, "african": 0.04},
}

# Face and figure refinements (MakeHuman targets, value 0..1 on the named side)
TARGETS = [
    ("head/head-oval", 0.5),
    ("head/head-scale-vert-incr", 0.1),
    ("neck/neck-scale-vert-incr", 0.45),
    ("neck/neck-scale-horiz-decr", 0.25),
    ("chin/chin-width-decr", 0.3),
    ("chin/chin-prominent-incr", 0.15),
    ("nose/nose-scale-horiz-decr", 0.3),
    ("nose/nose-scale-vert-decr", 0.15),
    ("nose/nose-point-width-decr", 0.4),
    ("mouth/mouth-lowerlip-volume-incr", 0.35),
    ("mouth/mouth-upperlip-volume-incr", 0.25),
    ("mouth/mouth-scale-horiz-decr", 0.1),
    ("eyes/r-eye-scale-incr", 0.2),
    ("eyes/l-eye-scale-incr", 0.2),
    ("cheek/r-cheek-bones-incr", 0.35),
    ("cheek/l-cheek-bones-incr", 0.35),
    ("arms/measure-upperarm-length-incr", 0.7),
    ("arms/measure-lowerarm-length-incr", 0.6),
    ("neck/measure-neck-height-incr", 0.35),
    ("legs/upperlegs-height-incr", 0.35),
    ("legs/lowerlegs-height-incr", 0.3),
    ("torso/torso-scale-depth-decr", 0.15),
    ("stomach/stomach-pregnant-decr", 0.4),
    ("hip/hip-scale-horiz-decr", 0.1),
]

info = HumanService._create_default_human_info_dict()
info["name"] = "skater"
info["phenotype"] = PHENOTYPE
info["rig"] = "game_engine"
info["eyes"] = "high-poly.mhclo"
info["eyebrows"] = "mindfront_eyebrows_03.mhclo"
info["eyelashes"] = "mindfront_eyelashes_02.mhclo"
info["teeth"] = "teeth_base.mhclo"
info["tongue"] = "tongue01.mhclo"
info["skin_mhmat"] = "toigo_light_skin_female_bronze.mhmat"
info["skin_material_type"] = "ENHANCED_SSS"
info["eyes_material_type"] = "MAKESKIN"
info["targets"] = []

# keep only targets that exist in this MPFB build
tdir = os.path.join(os.path.dirname(pkg.__file__), "data", "targets")
for name, v in TARGETS:
    if os.path.exists(os.path.join(tdir, name + ".target.gz")):
        info["targets"].append({"target": os.path.basename(name), "value": v})
    else:
        print("missing target", name)

settings = HumanService.get_default_deserialization_settings()
settings["subdiv_levels"] = 1
settings["load_clothes"] = False
body = HumanService.deserialize_from_dict(info, settings)

for ob in bpy.data.objects:
    print("object", ob.name, ob.type, len(ob.data.vertices) if ob.type == "MESH" else "")

bpy.ops.wm.save_as_mainfile(filepath=C.out("body.blend"))

if "--preview" in C.args():
    C.cycles(samples=40, res=(700, 1100))
    C.studio()
    for name, az in (("front", 0), ("side", 90), ("back", 180)):
        C.shoot(C.out(f"body_{name}.png"), az, target=(0, 0, 0.85), dist=5.6)
    C.shoot(C.out("body_face.png"), 20, target=(0, 0, 1.55), dist=1.1, res=(800, 800))
