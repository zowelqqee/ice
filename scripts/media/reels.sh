#!/usr/bin/env bash
# Show reels: the video on each show page, 20-25 s at real speed, cut from the promo footage. Only
# face-safe shots (wide arena shots, backs, silhouettes, aerial work, skates) and none of the
# excluded segments of DECISIONS.md D5 (burned-in subtitles and on-screen text, uniforms, the tank
# and the throne, title and end cards). Cropped to drop the corner bug, graded like the other show
# media, silent, metadata stripped. Source root defaults to ~/ice/materials.
#   usage: scripts/media/reels.sh [materials-root]
set -euo pipefail

ROOT="${1:-$HOME/ice/materials}"
A="$ROOT/drive-download-20261015T073352Z-1-001"
B="$ROOT/drive-download-20261015T073352Z-1-002"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/shows"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ALADDIN="$B/ALADDIN ON ICE - ADS/VIDEO/ALADDIN ON ICE_MOI.mp4"
DRACULA="$B/DRACULA ON ICE - ADS/VIDEO/DRACULA ON ICE_MOI.mp4"
ANASTASIA="$A/PRINCESS ANASTASIA ON ICE- ADS/VIDEO/Anastasia_PROMO_2026_1920x1080_1min_01.mp4"

STRIP=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact)
GRADE="eq=contrast=1.12:saturation=0.82:brightness=-0.03,vignette=PI/4.2"
# the corner bug sits top right of the 1920x1080 frame (Aladdin and Dracula: x 1685-1875, y 45-190;
# Anastasia: x 1600-1860, y 40-240): a 16:9 crop that ends left of it
BUG_SMALL="1520:855:160:160"
BUG_LARGE="1584:891:8:100"

# reel <src> <out-name> <crop W:H:X:Y> <start-end>... : the shots in order, hard cuts, one file
reel() {
  local src="$1" name="$2" crop="crop=$3,scale=1280:720:flags=lanczos"
  shift 3
  : > "$TMP/list.txt"
  local i=0
  for seg in "$@"; do
    local ss="${seg%-*}" to="${seg#*-}"
    ffmpeg -v error -y -ss "$ss" -to "$to" -i "$src" -an "${STRIP[@]}" -vf "$crop,$GRADE,fps=25,format=yuv420p" \
      -c:v libx264 -crf 12 -preset fast "$TMP/s$i.mp4"
    echo "file '$TMP/s$i.mp4'" >> "$TMP/list.txt"
    i=$((i + 1))
  done
  ffmpeg -v error -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/m.mp4"
  mkdir -p "$OUT/$(dirname "$name")"
  ffmpeg -v error -y -i "$TMP/m.mp4" "${STRIP[@]}" -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -an "$OUT/$name.webm"
  ffmpeg -v error -y -i "$TMP/m.mp4" "${STRIP[@]}" -metadata:s:v handler_name= -c:v libx264 -crf 27 \
    -preset slow -movflags +faststart -an "$OUT/$name.mp4"
  # the still (shown before the video loads): a frame a second in (the first may be a fade from black)
  ffmpeg -v error -y -ss 1 -i "$TMP/m.mp4" -frames:v 1 "${STRIP[@]}" "$TMP/p.png"
  ffmpeg -v error -y -i "$TMP/p.png" "${STRIP[@]}" -c:v libsvtav1 -crf 36 -frames:v 1 "$OUT/$name.avif" 2>/dev/null
  cwebp -quiet -q 76 -metadata none "$TMP/p.png" -o "$OUT/$name.webp"
  ffmpeg -v error -y -i "$TMP/p.png" "${STRIP[@]}" -q:v 4 "$OUT/$name.jpg"
}

reel "$ALADDIN" aladdin/reel "$BUG_SMALL" \
  3.24-4.70 9.40-11.36 16.88-18.84 26.76-27.68 37.48-41.44 41.44-43.00 48.44-49.84 49.88-51.28 \
  59.36-60.56 62.44-63.60 64.36-65.84 73.12-74.76
# Dracula: 16-27 s carries burned-in subtitles and on-screen text, so nothing from there
reel "$DRACULA" dracula/reel "$BUG_SMALL" \
  0.00-1.12 8.12-10.16 14.72-15.88 30.08-31.00 35.20-37.08 42.68-44.48 50.36-51.60 53.56-54.16 \
  60.30-63.48 63.48-65.50 72.04-73.50 78.50-79.68
# Anastasia: the promo is mostly close-ups, uniforms and the throne, so this one is short
reel "$ANASTASIA" anastasia/reel "$BUG_LARGE" \
  0.40-1.84 4.00-7.00 10.00-11.00 30.60-32.90 32.96-34.40 36.00-36.90

find "$OUT" -name 'reel.*' -type f | sort | xargs ls -la | awk '{printf "%8d %s\n", $5, $9}'
