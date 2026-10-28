#!/usr/bin/env bash
# Builds the skater model end to end (headless Blender). Outputs land in $SKATER_OUT.
#   scripts/skater/build.sh [from-step]    steps: body costume skates hair sparkle pose
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${SKATER_OUT:-$HOME/ice/skater-build/out}"
steps=(body costume skates hair sparkle pose)
from="${1:-body}"
run=0
for s in "${steps[@]}"; do
  [[ "$s" == "$from" ]] && run=1
  [[ $run == 1 ]] || continue
  echo "== $s"
  case "$s" in
    body)    "$HERE/run.sh" build_body.py ;;
    costume) "$HERE/run.sh" costume.py ;;
    skates)  "$HERE/run.sh" skates.py "$OUT/dressed.blend" ;;
    hair)    "$HERE/run.sh" hair.py "$OUT/skated.blend" ;;
    sparkle) "$HERE/run.sh" sparkle.py "$OUT/haired.blend" ;;
    pose)    "$HERE/run.sh" pose.py "$OUT/sparkled.blend" ;;
  esac 2>&1 | grep -E "^(skate|hair|veins|lifted|hidden|mounts|bust|raised)|Error|Traceback|line [0-9]" || true
done
