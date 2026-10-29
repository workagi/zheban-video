#!/usr/bin/env bash
# doctor.sh [project]: actually launch the browser and load the selected fonts.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/runtime.sh"
printf 'node: %s (%s)\npython: %s\n' "$CKV_NODE" "$("$CKV_NODE" -v)" "$CKV_PYTHON"
for tool in ffmpeg ffprobe zip; do command -v "$tool" >/dev/null || { echo "❌ 缺少 $tool"; exit 1; }; done
filters=$(ffmpeg -hide_banner -filters 2>/dev/null)
encoders=$(ffmpeg -hide_banner -encoders 2>/dev/null)
[[ "$filters" == *loudnorm* && "$encoders" == *libx264* ]] || { echo '❌ ffmpeg 需要 loudnorm 和 libx264'; exit 1; }
"$CKV_NODE" "$HERE/render.cjs" "${1:---doctor}" doctor
if [ -n "${1:-}" ] && [ -f "$1/script.json" ]; then
  P="$(cd "$1" && pwd)"
  source "$HERE/tts-runtime.sh"
  "$CKV_TTS_PYTHON" -B -c 'from importlib.metadata import version; print("optional TTS: edge-tts " + version("edge-tts") + " (import only; online synthesis not tested by doctor)")'
fi
echo 'ALL GOOD：浏览器、所选字体、Python、FFmpeg 均实测通过。' 
