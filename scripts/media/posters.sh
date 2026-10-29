#!/usr/bin/env bash
# Show posters (the client's key art, used as-is since October 2026, see DECISIONS.md D3): each
# show in three cuts, scaled and stripped of metadata, as AVIF + WebP + JPEG.
#   wide   16:9  960x540   showcase tiles on tablets and wider screens
#   square 1:1   480x480   showcase rows on phones
#   tall   9:16  720x1280  the poster on the show page
# Source: the PNGs in "<materials-root>/POSTERS 2026-10-29" (root defaults to ~/ice/materials).
#   usage: scripts/media/posters.sh [materials-root]
set -euo pipefail

ROOT="${1:-$HOME/ice/materials}"
SRC="$ROOT/POSTERS 2026-10-29"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/shows"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

STRIP=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact)

# cut <source png> <WxH> <out-name>
cut() {
  local w="${2%x*}" h="${2#*x}"
  mkdir -p "$OUT/$(dirname "$3")"
  ffmpeg -v error -y -i "$SRC/$1" "${STRIP[@]}" -vf "scale=$w:$h:flags=lanczos,format=rgb24" "$TMP/p.png"
  ffmpeg -v error -y -i "$TMP/p.png" "${STRIP[@]}" -c:v libsvtav1 -crf 34 -frames:v 1 "$OUT/$3.avif" 2>/dev/null
  cwebp -quiet -q 80 -metadata none "$TMP/p.png" -o "$OUT/$3.webp"
  ffmpeg -v error -y -i "$TMP/p.png" "${STRIP[@]}" -q:v 4 "$OUT/$3.jpg"
}

# show <slug> <16:9 file> <1:1 file> <9:16 file>
show() {
  cut "$2" 960x540 "$1/poster-wide"
  cut "$3" 480x480 "$1/poster-square"
  cut "$4" 720x1280 "$1/poster-tall"
}

show aladdin           "Aladdin on ice_16x9.PNG" "Aladdin on ice_sq.PNG" "Aladdin on ice_9x16.PNG"
show dracula           "Dracula_16x9.PNG"        "Dracula_sq.PNG"        "Dracula_9x16.PNG"
show alice             "Alice in W_16x9.PNG"     "Alice in W_sq.PNG"     "Alice in W_9x16.PNG"
show anastasia         "IMG_5424.PNG"            "IMG_5425.PNG"          "IMG_5423.PNG"
show the-little-prince "IMG_5408.PNG"            "IMG_5409.PNG"          "IMG_5407.PNG"

find "$OUT" -name 'poster-*' -type f | sort | xargs ls -la | awk '{printf "%8d %s\n", $5, $9}'
