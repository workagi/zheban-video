#!/usr/bin/env python3
"""Scan decoded video for isolated flashes/jumps, near-black frames and long holds. All timing comes from the project."""
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw
from project import load_project


def inspect(project, video):
    p, video = Path(project), Path(video)
    sb = load_project(p)
    fps = sb.get("fps", 30)
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(video)], check=True, capture_output=True)
    stream = next(s for s in json.loads(probe.stdout)["streams"] if s["codec_type"] == "video")
    num, den = map(int, stream["avg_frame_rate"].split("/"))
    if abs(num / den - fps) > .01:
        raise ValueError("Video frame rate differs from storyboard")
    width, height = (160, 90) if sb["format"] == "landscape" else (90, 160)
    process = subprocess.Popen(["ffmpeg", "-v", "error", "-xerror", "-i", str(video), "-an", "-vf", f"scale={width}:{height}:flags=area,format=gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    previous = previous2 = None
    diffs, across, means = [], [], []
    size = width * height
    while True:
        raw = process.stdout.read(size)
        if not raw:
            break
        if len(raw) != size:
            raise ValueError("Truncated decoded frame")
        frame = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
        means.append(float(frame.mean()))
        diffs.append(float(np.abs(frame - previous).mean()) if previous is not None else 0)
        across.append(float(np.abs(frame - previous2).mean()) if previous2 is not None else 0)
        previous2, previous = previous, frame
    stderr = process.stderr.read()
    return_code = process.wait()
    process.stdout.close()
    process.stderr.close()
    if return_code or stderr.strip() or not diffs:
        raise ValueError("Full video decode failed")
    bar = 60 / sb.get("music", {}).get("bpm", 120) * sb.get("music", {}).get("beatsPerBar", 4)
    td = min(.6, bar / sb.get("music", {}).get("beatsPerBar", 4) * 1.2)
    boundaries, exemptions = [], []
    now = 0.0
    defaults = {"noir-gold": "flash", "ink-wash": "ink", "tech-hud": "glitch", "archive-doc": "slide", "swiss-minimal": "block", "cosmic-blue": "warp"}
    for i, scene in enumerate(sb["scenes"]):
        if i:
            kind = scene.get("transition", defaults[sb["style"]])
            boundaries.append({"at": now, "kind": kind})
            exemptions.append({"start": now - td / 2 - 2 / fps, "end": now + td / 2 + 2 / fps, "kind": "transition", "reason": kind})
        now += scene.get("durationSec", scene.get("bars", 0) * bar)
    for e in sb.get("motionReview", {}).get("intentional", []):
        if e.get("kind") not in ("flash", "cut", "hold") or not e.get("reason") or not (0 <= e["start"] < e["end"] <= now):
            raise ValueError("Intentional motion interval needs kind, valid bounds and a reason")
        exemptions.append(e)
    def exempt(t, kinds):
        if isinstance(kinds, str): kinds = (kinds,)
        return any(e["start"] <= t <= e["end"] and e["kind"] in kinds for e in exemptions)
    findings = []
    for i in range(1, len(diffs) - 1):
        t = i / fps
        if exempt(t, ("transition", "cut", "flash")):
            continue
        before, after = diffs[i], diffs[i + 1]
        if min(before, after) > 18 and across[i + 1] < min(before, after) * .30:
            findings.append({"level": "FAIL", "kind": "one-frame-flash", "at": t, "message": "单帧与前后都明显不同，而前后帧相似"})
        elif before > max(12, 5 * max(diffs[i - 1], after, .3)):
            findings.append({"level": "WARN", "kind": "jump", "at": t, "message": "非登记切点出现突变；查看是否为有意揭晓"})
        if means[i] < 2 and means[i - 1] > 12 and means[i + 1] > 12:
            findings.append({"level": "FAIL", "kind": "black-frame", "at": t, "message": "片中孤立近黑帧"})
    # Median smoothing suppresses grain. A hold is a review hint, never a demand to add decoration.
    window = max(1, round(fps * .15))
    quiet = [float(np.median(diffs[max(1, i - window):min(len(diffs), i + window + 1)])) < .15 for i in range(1, len(diffs))]
    run = None
    for i, is_quiet in enumerate(quiet + [False], 1):
        t = i / fps
        if is_quiet and not exempt(t, "hold") and t < now - sb.get("fadeOut", 1):
            if run is None:
                run = t
        else:
            if run is not None and t - run >= 3:
                findings.append({"level": "WARN", "kind": "hold", "at": round(run, 3), "end": round(t, 3), "message": "画面持续近静止；判断是否为必要阅读/思考，不强制加动作"})
            run = None
    qa = p / "qa"
    qa.mkdir(exist_ok=True)
    # Inspect every cut at full temporal density around its handover; keep the output bounded.
    points = [(b["at"], "cut " + b["kind"]) for b in boundaries] + [(f["at"], f["kind"]) for f in findings[:6]]
    tile_w, tile_h = (320, 180) if sb["format"] == "landscape" else (180, 320)
    if points:
        sheet = Image.new("RGB", (tile_w * 8, (tile_h + 26) * len(points)), "#161616")
        pen = ImageDraw.Draw(sheet)
        for row, (center, label) in enumerate(points):
            a = max(0, center - 4 / fps)
            frames = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(a), "-i", str(video), "-vf", f"scale={tile_w}:{tile_h},format=rgb24", "-frames:v", "8", "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
            stride = tile_w * tile_h * 3
            for col in range(min(8, len(frames) // stride)):
                im = Image.frombytes("RGB", (tile_w, tile_h), frames[col * stride:(col + 1) * stride])
                y = row * (tile_h + 26)
                sheet.paste(im, (col * tile_w, y))
                pen.text((col * tile_w + 4, y + tile_h + 4), f"{a + col / fps:.3f}s {label}", fill="white")
        sheet.save(qa / "transitions.jpg", quality=90)
    fails = sum(f["level"] == "FAIL" for f in findings)
    result = {"scope": "decoded low-resolution frame differences; not semantic or artistic QA", "frames": len(diffs), "fps": fps, "findings": findings, "exemptions": exemptions, "boundaries": boundaries}
    (qa / "motion.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    report = ["# 成片动态检查", "", f"完整解码 {len(diffs)} 帧；FAIL {fails} · WARN {len(findings) - fails}", "", "检查范围：低分辨率帧差筛查孤立闪帧/黑帧、跳变和静止。不能判断动作含义、重影、图解正确性或电影感。登记转场仍需看 qa/transitions.jpg。", ""]
    report += [f"- {f['level']} @{f['at']:.3f}s {f['kind']}：{f['message']}" for f in findings]
    report += ["", "有意区间：", *[f"- {e['start']:.3f}–{e['end']:.3f}s {e['kind']}：{e['reason']}" for e in exemptions]]
    (qa / "motion-report.md").write_text("\n".join(report))
    print(f"motion: {len(diffs)} frames, FAIL {fails}, WARN {len(findings) - fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    try:
        sys.exit(inspect(sys.argv[1], sys.argv[2]))
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as exc:
        sys.exit("MOTION: " + str(exc))
