"""The pose from the reference sheet: standing on the left skate, right leg in a turned-out passe
(skate at the supporting knee), arms rounded overhead with the wrists crossed, head turned to her
left and lifted.

Rig: MakeHuman game-engine rig. Armature space: she faces -Y, her left is +X, up is +Z.
Bones are placed by direction (two-bone IK solved here, not with constraints), so the pose is
plain pose-bone transforms and survives export.

    scripts/skater/run.sh pose.py [in.blend] [--preview]
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(__file__))
import common as C  # noqa: E402

V = Vector


def _upd():
    bpy.context.view_layer.update()


def _frame(a, b):
    x = a.normalized()
    z = a.cross(b).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed()


def align(pb, cur_a, cur_b, tgt_a, tgt_b):
    """Rotate pose bone so the (cur_a, cur_b) frame lands on (tgt_a, tgt_b), head fixed."""
    R = _frame(tgt_a, tgt_b) @ _frame(cur_a, cur_b).transposed()
    M = pb.matrix.copy()
    rot = R @ M.to_3x3()
    N = rot.to_4x4()
    N.translation = M.translation
    pb.matrix = N
    _upd()


def ydir(pb):
    return pb.matrix.to_3x3().col[1].normalized()


def rotate(pb, axis, deg, pivot=None):
    M = pb.matrix.copy()
    p = V(pivot) if pivot is not None else M.translation
    R = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, V(axis)) @ Matrix.Translation(-p)
    pb.matrix = R @ M
    _upd()


def set_rot(pb, R):
    """Pose bone orientation = R applied to its rest orientation (armature space), head kept."""
    M = pb.matrix.copy()
    N = (R @ pb.bone.matrix_local.to_3x3()).to_4x4()
    N.translation = M.translation
    pb.matrix = N
    _upd()


def stand_on_blades(arm):
    """Raise the figure so the lowest blade point touches the ice (z = 0)."""
    blades = [o for o in bpy.data.objects if o.name.startswith("skate_blade")]
    if not blades:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    low = min((o.matrix_world @ v.co).z for o in blades for v in o.evaluated_get(dg).data.vertices)
    root = arm.pose.bones["Root"]
    M = root.matrix.copy()
    M.translation.z -= low
    root.matrix = M
    _upd()
    print("lifted onto the blades by", round(-low, 4))


def perp(v, axis):
    axis = axis.normalized()
    return (v - axis * v.dot(axis)).normalized()


def two_bone(root, target, a, b, pole):
    d = target - root
    L = min(max(d.length, abs(a - b) + 1e-4), a + b - 1e-4)
    dn = d.normalized()
    cosA = (a * a + L * L - b * b) / (2 * a * L)
    A = math.acos(max(-1, min(1, cosA)))
    p = perp(pole, dn)
    mid = root + dn * (a * math.cos(A)) + p * (a * math.sin(A))
    end = root + dn * L
    return mid, end


def apply_pose(arm):
    pose = arm.pose
    P = pose.bones
    for pb in P:
        pb.matrix_basis = Matrix()
    _upd()
    head = lambda n: P[n].head.copy()  # noqa: E731
    length = lambda n: (P[n].tail - P[n].head).length  # noqa: E731

    rest_front = V((0, -1, 0))

    # ---- torso: lifted chest, slight arch, shoulders turned a touch to her left
    # (+X rotation tips her forward; negative arches the back)
    rotate(P["spine_01"], (1, 0, 0), 1)
    rotate(P["spine_02"], (1, 0, 0), -2)
    rotate(P["spine_03"], (1, 0, 0), -3)
    rotate(P["spine_02"], (0, 0, 1), 4)
    rotate(P["spine_03"], (0, 0, 1), 4)

    # ---- supporting leg (left): straight, under the body, turned out a little
    hip = head("thigh_l")
    ankle = V((0.035, -0.005, head("foot_l").z + 0.012))
    turn = math.radians(14)
    front = V((math.sin(turn), -math.cos(turn), 0))
    knee, ankle = two_bone(hip, ankle, length("thigh_l"), length("calf_l"), front)
    align(P["thigh_l"], ydir(P["thigh_l"]), perp(rest_front, ydir(P["thigh_l"])), knee - hip, perp(front, knee - hip))
    align(P["calf_l"], ydir(P["calf_l"]), perp(rest_front, ydir(P["calf_l"])), ankle - knee, perp(front, ankle - knee))
    support_knee = knee.copy()
    # foot rigid in the boot, heel lifted by the skate's pitch so the blade lies flat
    beta = math.radians(arm.get("skate_beta", 9.0))
    R = Matrix.Rotation(-turn, 3, "Z") @ Matrix.Rotation(beta, 3, "X")
    set_rot(P["foot_l"], R)
    set_rot(P["ball_l"], R)

    # ---- raised leg (right): passe, knee out to her right and forward, skate at the left knee
    hip = head("thigh_r")
    target = support_knee + V((-0.095, 0.025, 0.05))
    pole = V((-0.72, -0.62, 0.1))
    knee, ankle = two_bone(hip, target, length("thigh_r"), length("calf_r"), pole)
    t = (knee - hip).normalized()
    s = (ankle - knee).normalized()
    thigh_front = perp(-(s - t * s.dot(t)), t)
    shin_front = perp(t, s)
    align(P["thigh_r"], ydir(P["thigh_r"]), perp(rest_front, ydir(P["thigh_r"])), t, thigh_front)
    align(P["calf_r"], ydir(P["calf_r"]), perp(rest_front, ydir(P["calf_r"])), s, shin_front)
    # pointed as far as the boot allows: the foot continues the shin, bent ~25 deg
    fdir = (s * 0.9 + shin_front * 0.42).normalized()
    up = perp(shin_front, fdir)
    align(P["foot_r"], ydir(P["foot_r"]), V((0, 0, 1)), fdir, up)
    Rf = P["foot_r"].matrix.to_3x3() @ P["foot_r"].bone.matrix_local.to_3x3().inverted()
    set_rot(P["ball_r"], Rf)

    # ---- arms: clavicles up, rounded arms overhead, wrists crossed above the head
    rotate(P["clavicle_l"], (0, 1, 0), -14)
    rotate(P["clavicle_r"], (0, 1, 0), 14)
    head_top = P["head"].tail.z + 0.03
    for side, sx in (("l", 1), ("r", -1)):
        sh = head(f"upperarm_{side}")
        a, b = length(f"upperarm_{side}"), length(f"lowerarm_{side}")
        if side == "r":
            wrist = V((0.0, -0.075, head_top + 0.07))
            pole = V((-1.0, 0.05, -0.35))
        else:
            wrist = V((0.06, -0.045, head_top + 0.075))
            pole = V((1.0, 0.1, -0.45))
        elbow, wrist = two_bone(sh, wrist, a, b, pole)
        u0 = ydir(P[f"upperarm_{side}"])
        f0 = ydir(P[f"lowerarm_{side}"])
        n0 = u0.cross(f0)
        u1 = (elbow - sh).normalized()
        f1 = (wrist - elbow).normalized()
        n1 = u1.cross(f1)
        align(P[f"upperarm_{side}"], u0, n0, u1, n1)
        f0 = ydir(P[f"lowerarm_{side}"])
        align(P[f"lowerarm_{side}"], f0, perp(n1, f0), f1, n1)
        print(side, "shoulder", tuple(round(x, 3) for x in sh), "elbow", tuple(round(x, 3) for x in elbow),
              "wrist", tuple(round(x, 3) for x in wrist), "reach", round((wrist - sh).length, 3), "max", round(a + b, 3))

    # hands: fingers continue across the top, palms down (right hand in front, over the left)
    for side, fdir, pdown in (
        ("r", V((1.0, -0.15, -0.28)), V((0.15, -0.35, -1.0))),
        ("l", V((-1.0, 0.2, -0.04)), V((0.0, -0.3, -1.0))),
    ):
        hb = P[f"hand_{side}"]
        mid = P[f"middle_01_{side}"].head - hb.head
        palm = (P[f"index_01_{side}"].head - hb.head).cross(P[f"pinky_01_{side}"].head - hb.head)
        if side == "l":
            palm = -palm
        align(hb, mid, palm, fdir, perp(pdown, fdir))
    # fingers: soft dancer's curve
    for side in ("l", "r"):
        for f, bend in (("index", 8), ("middle", 12), ("ring", 14), ("pinky", 16)):
            for i in (1, 2, 3):
                pb = P[f"{f}_0{i}_{side}"]
                pb.rotation_mode = "XYZ"
                pb.rotation_euler = (math.radians(bend * (0.7 if i == 1 else 1.0)), 0, 0)
        for i in (1, 2, 3):
            pb = P[f"thumb_0{i}_{side}"]
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = (math.radians(6), 0, 0)
    _upd()

    # ---- head: turned well to her left (as in the reference), chin up
    rotate(P["neck_01"], (0, 0, 1), 20)
    rotate(P["neck_01"], (1, 0, 0), -3)
    rotate(P["head"], (0, 0, 1), 34)
    rotate(P["head"], (1, 0, 0), -9)
    rotate(P["head"], (0, -1, 0), 4)
    stand_on_blades(arm)
    return arm


if __name__ == "__main__":
    a = [x for x in C.args() if not x.startswith("--")]
    src = a[0] if a else C.out("body.blend")
    bpy.ops.wm.open_mainfile(filepath=src)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    apply_pose(arm)
    for o in bpy.data.objects:
        m = o.modifiers.get("Armature")
        if m:
            m.use_deform_preserve_volume = True
    bpy.ops.wm.save_as_mainfile(filepath=C.out("posed.blend"))
    if "--preview" in C.args():
        C.cycles(samples=32, res=(700, 1100))
        C.studio()
        for name, az in (("front", 0), ("side", -90), ("back", 180), ("main", 15)):
            C.shoot(C.out(f"pose_{name}.png"), az, target=(0, 0, 1.0), dist=6.4)
        C.shoot(C.out("pose_hands.png"), 10, target=(0.02, -0.05, 1.62), dist=1.6, elev_deg=8, res=(900, 800))
