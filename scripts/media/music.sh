#!/usr/bin/env bash
# Show music: soundtracks of the promo masters (checked by speech recognition: no voice-over;
# Dracula carries an English-language song). Trimmed past title/end cards, loudness-normalised,
# metadata-free. Opus/WebM + AAC/M4A.
#   usage: scripts/media/music.sh [materials-root]
set -euo pipefail

ROOT="${1:-$HOME/ice/materials}"
A="$ROOT/drive-download-20261015T073352Z-1-001"
B="$ROOT/drive-download-20261015T073352Z-1-002"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/music"
mkdir -p "$OUT"

STRIP=(-vn -map_metadata -1 -map_chapters -1 -fflags +bitexact -flags:a +bitexact)

# track <src> <start> <end> <name>
track() {
  local src="$1" ss="$2" to="$3" name="$4"
  local len fade
  len=$(echo "$to - $ss" | bc)
  fade=$(echo "$len - 2.5" | bc)
  local AF="afade=t=in:d=0.6,afade=t=out:st=$fade:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11"
  ffmpeg -v error -y -ss "$ss" -to "$to" -i "$src" "${STRIP[@]}" -af "$AF" -ar 48000 -c:a libopus -b:a 112k "$OUT/$name.webm"
  ffmpeg -v error -y -ss "$ss" -to "$to" -i "$src" "${STRIP[@]}" -af "$AF" -ar 44100 -c:a aac -b:a 128k -movflags +faststart "$OUT/$name.m4a"
}

track "$B/ALADDIN ON ICE - ADS/VIDEO/ALADDIN ON ICE_MOI.mp4" 1.0 86.0 aladdin
track "$B/DRACULA ON ICE - ADS/VIDEO/DRACULA ON ICE_MOI.mp4" 0.0 84.0 dracula
track "$A/PRINCESS ANASTASIA ON ICE- ADS/VIDEO/Anastasia_PROMO_2026_1920x1080_1min_01.mp4" 0.0 61.5 anastasia

ls -la "$OUT"
