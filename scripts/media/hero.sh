#!/usr/bin/env bash
# Hero backplate: a skater jumping across blue-lit ice (the "water" projection), behind the glass skater.
# Slowed a little, kept bright and ice-blue, softened just enough that no performer is
# identifiable, and looped with a crossfade (no ping-pong: skaters never glide backwards).
# Output has no metadata.
#   usage: scripts/media/hero.sh <source-video> [start-seconds] [length-seconds]
#   default: Aladdin master 39.84 s + 1.56 s (a run of jumps over the "water" projection; the
#   skater's face is under a headdress and motion-blurred)
set -euo pipefail

SRC="$1"
START="${2:-39.84}"
LEN="${3:-1.56}"
SLOW=2.5
FADE=0.6
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/hero"
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# crop drops the corner bug (top right, down to y≈190), the audience heads along the bottom; a cool grade that keeps the ice blue,
# mutes the costumes a little and lifts the shadows; light blur (faces stay soft)
GRADE="crop=1493:840:70:182,scale=1600:900:flags=lanczos,
eq=contrast=1.06:brightness=0.02:saturation=0.78,
colorchannelmixer=rr=0.82:rg=0.08:rb=0.1:gr=0.04:gg=0.92:gb=0.12:br=0.02:bg=0.08:bb=1.0,
gblur=sigma=0.9,setpts=${SLOW}*PTS,minterpolate=fps=30:mi_mode=blend"

ffmpeg -v error -y -ss "$START" -t "$LEN" -i "$SRC" -an -map_metadata -1 -fflags +bitexact \
  -vf "${GRADE//$'\n'/}" -c:v libx264 -crf 10 -pix_fmt yuv420p "$TMP/forward.mp4"

# seamless loop: the last FADE seconds dissolve into the first FADE seconds
L=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/forward.mp4")
OFFSET=$(awk -v l="$L" -v f="$FADE" 'BEGIN { printf "%.3f", l - 2 * f }')
ffmpeg -v error -y -i "$TMP/forward.mp4" -an -map_metadata -1 -fflags +bitexact -filter_complex \
  "[0:v]split[x][y];[x]trim=start=${FADE},setpts=PTS-STARTPTS[main];[y]trim=end=${FADE},setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=${FADE}:offset=${OFFSET}[v]" \
  -map "[v]" -c:v libx264 -crf 10 -pix_fmt yuv420p "$TMP/master.mp4"

ffmpeg -v error -y -i "$TMP/master.mp4" -map_metadata -1 -fflags +bitexact -flags:v +bitexact -c:v libvpx-vp9 -b:v 0 -crf 36 \
  -row-mt 1 -deadline good -an "$OUT/arena-plate.webm"
ffmpeg -v error -y -i "$TMP/master.mp4" -map_metadata -1 -fflags +bitexact -flags:v +bitexact -metadata:s:v handler_name= -c:v libx264 -crf 25 -preset slow \
  -profile:v high -movflags +faststart -an "$OUT/arena-plate.mp4"

# poster frame (shown until the video plays): AVIF + WebP + small JPEG fallback
ffmpeg -v error -y -i "$TMP/master.mp4" -frames:v 1 -map_metadata -1 -fflags +bitexact "$TMP/poster.png"
ffmpeg -v error -y -i "$TMP/poster.png" -map_metadata -1 -fflags +bitexact -c:v libsvtav1 -crf 38 -frames:v 1 "$OUT/arena-plate.avif"
cwebp -quiet -q 72 -metadata none "$TMP/poster.png" -o "$OUT/arena-plate.webp"
ffmpeg -v error -y -i "$TMP/poster.png" -map_metadata -1 -fflags +bitexact -flags:v +bitexact -q:v 5 "$OUT/arena-plate.jpg"

ls -la "$OUT"/arena-plate.*
