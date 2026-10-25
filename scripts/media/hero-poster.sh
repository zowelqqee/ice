#!/usr/bin/env bash
# Hero posters: frames rendered from the live 3D scene at its start pose, so the skater is the very
# first thing on screen and the scene takes over invisibly.
# The page opens on the curtains shut (curtain-*), then they part onto the skater (skater-*).
#   1. run the dev server and capture http://localhost:3000/?still (page UI hidden, pose frozen,
#      curtains parted) and ?still=closed (curtains shut) at 1920x1080 @1.5x (landscape) and
#      390x844 @3x (portrait), e.g. with headless Chrome;
#   2. scripts/media/hero-poster.sh <landscape.png> <portrait.png> <closed-landscape.png> <closed-portrait.png>
set -euo pipefail
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/hero"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STRIP=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact)

encode() { # <src> <name> <width>
  ffmpeg -v error -y -i "$1" -vf "scale=$3:-2:flags=lanczos" "${STRIP[@]}" "$TMP/$2.png"
  ffmpeg -v error -y -i "$TMP/$2.png" "${STRIP[@]}" -c:v libsvtav1 -crf 30 -frames:v 1 "$OUT/$2.avif" 2>/dev/null
  cwebp -quiet -q 80 -metadata none "$TMP/$2.png" -o "$OUT/$2.webp"
  ffmpeg -v error -y -i "$TMP/$2.png" "${STRIP[@]}" -q:v 3 "$OUT/$2.jpg"
}
encode "$1" skater-landscape 1920
encode "$2" skater-portrait 900
encode "$3" curtain-landscape 1920
encode "$4" curtain-portrait 900
ls -la "$OUT"/skater-* "$OUT"/curtain-*
