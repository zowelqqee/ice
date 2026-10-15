#!/usr/bin/env bash
# Runs a skater build step in headless Blender with the MPFB profile kept outside the user's own.
#   scripts/skater/run.sh <step.py> [args...]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export BLENDER_USER_RESOURCES="${BLENDER_USER_RESOURCES:-$HOME/ice/tools/blender-user}"
export SKATER_OUT="${SKATER_OUT:-$HOME/ice/skater-build/out}"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
step="$1"; shift
exec "$BLENDER" -b --python-exit-code 1 --python "$HERE/$step" -- "$@"
