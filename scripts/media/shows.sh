#!/usr/bin/env bash
# Show media: short, slowed, ping-pong loops cut from face-safe shots of the promo footage
# (wide shots, backs, skates, aerial work), graded and stripped of metadata.
# Shot list and reasons: DECISIONS.md D5. Source root defaults to ~/ice/materials.
#   usage: scripts/media/shows.sh [materials-root]
set -euo pipefail

ROOT="${1:-$HOME/ice/materials}"
A="$ROOT/drive-download-20261015T073352Z-1-001"
B="$ROOT/drive-download-20261015T073352Z-1-002"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/shows"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ALADDIN="$B/ALADDIN ON ICE - ADS/VIDEO/ALADDIN ON ICE_MOI.mp4"
DRACULA="$A/DRACULA ON ICE - ADS/VIDEO/INSTA - ARENA/DRACULA ON ICE. ICE ARENA. ENG_INSTA_1920x1080_no_logo_01.mp4"
ANASTASIA="$A/PRINCESS ANASTASIA ON ICE- ADS/VIDEO/Anastasia_PROMO_2026_1920x1080_1min_01.mp4"
ALICE_ART="$A/ALICE IN WONDERLAND ON ICE - ADS/POSTER/Alice in W_9x16.PNG"

STRIP=(-map_metadata -1 -fflags +bitexact -flags:v +bitexact)
GRADE="eq=contrast=1.12:saturation=0.82:brightness=-0.03,vignette=PI/4.2"

# clip <src> <start> <len> <slow> <crop> <size WxH> <out-name>
clip() {
  local src="$1" ss="$2" len="$3" slow="$4" crop="$5" size="$6" name="$7"
  local w="${size%x*}" h="${size#*x}"
  mkdir -p "$OUT/$(dirname "$name")"
  ffmpeg -v error -y -ss "$ss" -t "$len" -i "$src" -an "${STRIP[@]}" -filter_complex \
    "[0:v]crop=$crop,scale=$w:$h:flags=lanczos,$GRADE,setpts=$slow*PTS,minterpolate=fps=25:mi_mode=blend,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]" \
    -map "[v]" -c:v libx264 -crf 12 -pix_fmt yuv420p "$TMP/m.mp4"
  ffmpeg -v error -y -i "$TMP/m.mp4" "${STRIP[@]}" -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -an "$OUT/$name.webm"
  ffmpeg -v error -y -i "$TMP/m.mp4" "${STRIP[@]}" -metadata:s:v handler_name= -c:v libx264 -crf 25 \
    -preset slow -movflags +faststart -an "$OUT/$name.mp4"
  still "$TMP/m.mp4" "$name"
}

# still <src> <out-name> : first frame → avif + webp + jpg
still() {
  ffmpeg -v error -y -i "$1" -frames:v 1 "${STRIP[@]}" "$TMP/p.png"
  ffmpeg -v error -y -i "$TMP/p.png" "${STRIP[@]}" -c:v libsvtav1 -crf 36 -frames:v 1 "$OUT/$2.avif" 2>/dev/null
  cwebp -quiet -q 76 -metadata none "$TMP/p.png" -o "$OUT/$2.webp"
  ffmpeg -v error -y -i "$TMP/p.png" "${STRIP[@]}" -q:v 4 "$OUT/$2.jpg"
}

# cards: 4:5, 720x900
clip "$ALADDIN"   53.72 0.42 3 "664:830:474:250" 720x900 aladdin/card
clip "$DRACULA"   13.76 0.44 3 "704:880:240:200" 720x900 dracula/card
clip "$ANASTASIA" 0.70  1.10 2 "720:900:830:150" 720x900 anastasia/card
# show-page heroes: 16:9, 1280x720 (crops drop the corner bug)
clip "$ALADDIN"   56.38 0.44 3 "1600:900:160:140" 1280x720 aladdin/hero
clip "$DRACULA"   19.36 0.68 2 "1920:1080:0:0"    1280x720 dracula/hero
clip "$DRACULA"   15.14 0.54 3 "1920:1080:0:0"    1280x720 dracula/silk
clip "$ANASTASIA" 0.70  1.10 2 "1600:900:160:150" 1280x720 anastasia/hero

# Alice: no footage yet; skates-on-ice crop of the key art (no face), still only
mkdir -p "$OUT/alice"
ffmpeg -v error -y -i "$ALICE_ART" "${STRIP[@]}" -vf "crop=376:470:405:790,scale=720:900:flags=lanczos,$GRADE" "$TMP/alice.png"
cp "$TMP/alice.png" "$TMP/alice-src.png"
still "$TMP/alice-src.png" alice/card

find "$OUT" -type f | sort | xargs ls -la | awk '{printf "%8d %s\n", $5, $9}'
