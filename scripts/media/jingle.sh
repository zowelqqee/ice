#!/usr/bin/env bash
# The Musical on Ice jingle (the brand theme for logo moments): played on the Enter screen and by
# the treble clef. Loudness-normalised like the show tracks, everything above 16 kHz cut (the
# source carries an inaudible 19.6 kHz tone at 1.6–2.2 s), metadata stripped.
#   usage: scripts/media/jingle.sh <source-audio>
set -euo pipefail
SRC="$1"
OUT="$(cd "$(dirname "$0")/../.." && pwd)/public/media/brand"
mkdir -p "$OUT"
COMMON=(-vn -sn -dn -map_metadata -1 -map_chapters -1 -fflags +bitexact -af "lowpass=f=16000,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000)
ffmpeg -v error -y -i "$SRC" "${COMMON[@]}" -c:a aac -b:a 160k -movflags +faststart "$OUT/jingle.m4a"
ffmpeg -v error -y -i "$SRC" "${COMMON[@]}" -c:a libopus -b:a 128k "$OUT/jingle.webm"
ls -la "$OUT"/jingle.*
