#!/usr/bin/env bash
# mux.sh <project> [name]  -> out/<name>.mp4  (H.264 High yuv420p + AAC 48k, loudness -14 LUFS / -1 dBTP, two-pass loudnorm)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/runtime.sh"
P="$1"; NAME="${2:-$(basename "$P")}"; FPS=$("$CKV_PYTHON" -B -c 'import json,sys;print(json.load(open(sys.argv[1])).get("fps",30))' "$P/storyboard.json")
mkdir -p "$P/out"
STATS=$(ffmpeg -hide_banner -nostats -i "$P/build/mix.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$STATS" | "$CKV_PYTHON" -B -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
AF="loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000,alimiter=limit=0.84:level=false"
ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$P/build/frames/%05d.jpg" -i "$P/build/mix.wav" \
  -map 0:v -map 1:a -c:v libx264 -preset medium -crf 20 -maxrate 10M -bufsize 20M -profile:v high -vf "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -g $((FPS*2)) -movflags +faststart \
  -c:a aac -b:a 256k -ar 48000 -af "$AF" -shortest "$P/out/$NAME.mp4"
echo "mp4 -> $P/out/$NAME.mp4"
