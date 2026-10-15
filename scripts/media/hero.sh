#!/usr/bin/env bash
# Hero backplate: a wide arena shot (glowing ice, skaters far away), slowed, graded to the
# site palette and softened so no performer is identifiable. Output has no metadata.
#   usage: scripts/media/hero.sh <source-video> [start-seconds] [length-seconds]
set -euo pipefail

SRC="$1"
START="${2:-8.56}"
LEN="${3:-0.8}"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/hero"
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# crop keeps the rink and drops the corner bug; 4x slow-down with frame blending; ping-pong loop
GRADE="crop=1440:810:240:150,scale=1280:720:flags=lanczos,
eq=contrast=1.18:brightness=-0.06:saturation=0.55,
colorchannelmixer=rr=0.55:rg=0.1:gg=0.85:gb=0.15:bb=1.0:bg=0.2,
gblur=sigma=1.6,setpts=4*PTS,minterpolate=fps=25:mi_mode=blend"

ffmpeg -v error -y -ss "$START" -t "$LEN" -i "$SRC" -an -map_metadata -1 -fflags +bitexact \
  -filter_complex "[0:v]${GRADE//$'\n'/},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" \
  -map "[v]" -c:v libx264 -crf 12 -pix_fmt yuv420p "$TMP/master.mp4"

ffmpeg -v error -y -i "$TMP/master.mp4" -map_metadata -1 -fflags +bitexact -flags:v +bitexact -c:v libvpx-vp9 -b:v 0 -crf 38 \
  -row-mt 1 -deadline good -an "$OUT/arena-plate.webm"
ffmpeg -v error -y -i "$TMP/master.mp4" -map_metadata -1 -fflags +bitexact -flags:v +bitexact -metadata:s:v handler_name= -c:v libx264 -crf 26 -preset slow \
  -profile:v high -movflags +faststart -an "$OUT/arena-plate.mp4"

# poster frame (LCP): AVIF + WebP + small JPEG fallback
ffmpeg -v error -y -i "$TMP/master.mp4" -frames:v 1 -map_metadata -1 -fflags +bitexact "$TMP/poster.png"
ffmpeg -v error -y -i "$TMP/poster.png" -map_metadata -1 -fflags +bitexact -c:v libsvtav1 -crf 38 -frames:v 1 "$OUT/arena-plate.avif"
cwebp -quiet -q 72 -metadata none "$TMP/poster.png" -o "$OUT/arena-plate.webp"
ffmpeg -v error -y -i "$TMP/poster.png" -map_metadata -1 -fflags +bitexact -flags:v +bitexact -q:v 5 "$OUT/arena-plate.jpg"

ls -la "$OUT"
