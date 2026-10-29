#!/usr/bin/env bash
# build.sh <project> <tts|preview|lock|silent|full|audio|scan> [--offline]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/runtime.sh"
P="$(cd "${1:?usage: build.sh project stage}" && pwd)"; STAGE="${2:-preview}"
if [ "$STAGE" != tts ]; then
NAME=$("$CKV_PYTHON" -B -c 'import json,re,sys; s=json.load(open(sys.argv[1])); n=s.get("slug") or re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+","_",s.get("title","video"))[:40]; assert n and n not in (".","..") and "/" not in n and "\\" not in n, "invalid slug"; print(n)' "$P/storyboard.json")
fi
if [ "$STAGE" = tts ]; then
  source "$HERE/tts-runtime.sh"
  tts_args=(); if [ "${3:-}" = --offline ]; then tts_args=(--offline); fi
  if [ "${#tts_args[@]}" -gt 0 ]; then "$CKV_TTS_PYTHON" -B "$HERE/tts.py" "$P" "${tts_args[@]}"; else "$CKV_TTS_PYTHON" -B "$HERE/tts.py" "$P"; fi
elif [ "$STAGE" = scan ]; then
  "$CKV_PYTHON" -B "$HERE/motion_check.py" "$P" "$P/out/$NAME.mp4"
elif [ "$STAGE" = lock ]; then
  "$CKV_NODE" "$HERE/render.cjs" "$P" lock
elif [ "$STAGE" = preview ]; then
  "$CKV_NODE" "$HERE/render.cjs" "$P" layout
  qa_status=0
  "$CKV_PYTHON" -B "$HERE/check.py" "$P" || qa_status=$?
  "$CKV_PYTHON" -B "$HERE/information_check.py" "$P" || qa_status=$?
  "$CKV_NODE" "$HERE/render.cjs" "$P" keyframes
  "$CKV_PYTHON" -B "$HERE/contact_sheet.py" keyframes "$P"
  echo ">>> 目检 $P/qa/keyframes_sheet.jpg"
  exit "$qa_status"
elif [ "$STAGE" = audio ]; then
  "$CKV_PYTHON" -B "$HERE/audio.py" build "$P"
elif [ "$STAGE" = full ] || [ "$STAGE" = silent ]; then
  "$CKV_NODE" "$HERE/render.cjs" "$P" layout
  "$CKV_PYTHON" -B "$HERE/check.py" "$P"
  "$CKV_PYTHON" -B "$HERE/information_check.py" "$P"
  args=(); if [ -n "${WORKERS:-}" ]; then args=(--workers "$WORKERS"); fi
  if [ "${#args[@]}" -gt 0 ]; then "$CKV_NODE" "$HERE/render.cjs" "$P" full "${args[@]}"; else "$CKV_NODE" "$HERE/render.cjs" "$P" full; fi
  if [ "$STAGE" = silent ]; then
    mkdir -p "$P/out"
    fps=$("$CKV_PYTHON" -B -c 'import json,sys;print(json.load(open(sys.argv[1])).get("fps",30))' "$P/storyboard.json")
    ffmpeg -v error -y -framerate "$fps" -i "$P/build/frames/%05d.jpg" -c:v libx264 -preset medium -crf 20 -profile:v high -vf "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -pix_fmt yuv420p -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart -an "$P/out/$NAME.mp4"
    "$CKV_PYTHON" -B "$HERE/final_check.py" "$P" "$P/out/$NAME.mp4" --silent
  else
    "$CKV_PYTHON" -B "$HERE/audio.py" build "$P"
    bash "$HERE/mux.sh" "$P" "$NAME"
    "$CKV_PYTHON" -B "$HERE/final_check.py" "$P" "$P/out/$NAME.mp4"
  fi
  "$CKV_PYTHON" -B "$HERE/motion_check.py" "$P" "$P/out/$NAME.mp4"
  bash "$HERE/package.sh" "$P" "$NAME"
else echo "unknown stage $STAGE" >&2; exit 2; fi
