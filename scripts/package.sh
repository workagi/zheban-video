#!/usr/bin/env bash
# package.sh <project> [name] -> out/<name>_source.zip (storyboard, facts, custom code, assets, engine + scripts snapshot, QA reports)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; P="$(cd "$1" && pwd)"; NAME="${2:-$(basename "$P")}"; T=$(mktemp -d); D="$T/$NAME"
mkdir -p "$D/project" "$D/skill"
for f in storyboard.json script.json narration-timeline.json narration-timeline.srt facts.md storyboard.md custom.js notes.md render-lock.json; do [ -f "$P/$f" ] && cp "$P/$f" "$D/project/"; done
tts_timeline=$("${CKV_PYTHON:-python3}" -B -c 'import json,sys;from pathlib import Path;p=Path(sys.argv[1]).resolve();t=json.load(open(p/"storyboard.json")).get("narration",{}).get("timeline","");assert not t or (p/t).resolve().is_relative_to(p),"timeline outside project";print(t)' "$P")
if [ -n "$tts_timeline" ]; then
  mkdir -p "$D/project/$(dirname "$tts_timeline")"
  cp "$P/$tts_timeline" "$D/project/$tts_timeline"
  tts_subtitle="${tts_timeline%.*}.srt"
  if [ -f "$P/$tts_subtitle" ]; then cp "$P/$tts_subtitle" "$D/project/$tts_subtitle"; fi
fi
[ -d "$P/assets" ] && cp -r "$P/assets" "$D/project/"
mkdir -p "$D/project/qa"; for f in report.md final_report.md information-report.md information.json motion-report.md motion.json transitions.jpg keyframes_sheet.jpg overview.jpg render-manifest.json; do [ -f "$P/qa/$f" ] && cp "$P/qa/$f" "$D/project/qa/"; done
cp -r "$HERE/../engine" "$HERE/../scripts" "$HERE/../references" "$D/skill/"
cp "$HERE/../SKILL.md" "$D/skill/"
cat > "$D/README.md" <<TXT
有声音轨重渲：bash skill/scripts/build.sh project full   （需要 node + playwright、python3 + numpy + Pillow、ffmpeg、Noto CJK 字体）
旁白文件和时间轴已随 assets 打包，重渲无需重新调用在线服务。仅重新配音时需要 edge-tts；见 skill/references/narration.md。
静帧预览：bash skill/scripts/build.sh project preview
无声预览重渲：bash skill/scripts/build.sh project silent
环境：bash skill/scripts/doctor.sh project
CKV_NODE / CKV_PYTHON / NODE_PATH 可指定本机已有环境。项目 fontFiles 字体随 assets 打包。
TXT
(cd "$T" && zip -qr "$P/out/${NAME}_source.zip" "$NAME"); rm -rf "$T"; echo "zip -> $P/out/${NAME}_source.zip"
