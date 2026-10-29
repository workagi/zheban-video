"""Resolve voice anchors once for rendering, audio and QA. No network or third-party imports."""
import copy
import hashlib
import json
import math
from pathlib import Path
import re


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def local_file(project, value):
    root = Path(project).resolve()
    path = (root / value).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Asset must be inside the project: {value}")
    return path


def finite(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    return float(value)


def normalized(text):
    return re.sub(r"[\W_]", "", text, flags=re.UNICODE).casefold()


def anchor_time(anchor, lines, clips):
    offset = finite(anchor.get("offset", 0), "anchor.offset")
    if "clip" in anchor:
        if anchor["clip"] not in clips:
            raise ValueError(f"Unknown clip: {anchor['clip']}")
        return finite(clips[anchor["clip"]]["at"], "clip.at") + offset
    line = lines.get(anchor.get("line"))
    if not line:
        raise ValueError(f"Unknown narration line: {anchor.get('line')}")
    edge = anchor.get("edge", "start")
    if edge not in ("start", "end"):
        raise ValueError("anchor.edge must be start or end")
    if "word" not in anchor:
        return finite(line[edge], "line." + edge) + offset
    target = normalized(anchor["word"])
    nth = anchor.get("occurrence", 0)
    if not target or isinstance(nth, bool) or not isinstance(nth, int) or nth < 0:
        raise ValueError("A word anchor needs a nonempty word and occurrence >= 0")
    words = line.get("words", [])
    if not words or line.get("timing", "word-boundary") == "estimated":
        raise ValueError(f"{line['id']}: word anchor needs measured word boundaries")
    joined, owners = "", []
    for word in words:
        piece = normalized(word["text"])
        joined += piece
        owners.extend([word] * len(piece))
    cursor, found = 0, -1
    for _ in range(nth + 1):
        found = joined.find(target, cursor)
        if found < 0:
            raise ValueError(f"{line['id']}: cannot find word {anchor['word']!r} occurrence {nth}; fix the anchor, no fallback")
        cursor = found + len(target)
    word = owners[found if edge == "start" else found + len(target) - 1]
    return finite(word[edge], "word." + edge) + offset


def load_project(project):
    p = Path(project)
    sb = json.loads((p / "storyboard.json").read_text())
    narration = sb.setdefault("narration", {})
    timeline = {"lines": []}
    if narration.get("timeline"):
        tp = local_file(p, narration["timeline"])
        if not tp.exists():
            raise ValueError("Narration timeline missing; run build.sh PROJECT tts first")
        timeline = json.loads(tp.read_text())
        if timeline.get("provider") == "edge-tts":
            script = p / "script.json"
            if not script.exists() or digest(script) != timeline.get("scriptHash"):
                raise ValueError("script.json changed; regenerate TTS before rendering")
            for asset in timeline.get("assets", []):
                f = local_file(p, asset["file"])
                if not f.exists() or digest(f) != asset["sha256"]:
                    raise ValueError(f"Narration asset changed or missing: {asset['file']}; regenerate TTS")
        narration["clips"] = copy.deepcopy(narration.get("clips", [])) + copy.deepcopy(timeline.get("clips", []))
    lines, clips = {}, {}
    previous_end = -1
    for line in timeline.get("lines", []):
        if line["id"] in lines:
            raise ValueError("Duplicate narration line id")
        start, end = finite(line["start"], "line.start"), finite(line["end"], "line.end")
        if start < 0 or end <= start or start < previous_end - .002:
            raise ValueError("Narration lines must have ordered non-overlapping times")
        previous_end = end
        prev_word = start
        for word in line.get("words", []):
            a, b = finite(word["start"], "word.start"), finite(word["end"], "word.end")
            if a < start - .05 or b > end + .05 or b < a or a < prev_word - .05:
                raise ValueError("Word times must be ordered and inside the line")
            prev_word = b
        lines[line["id"]] = line
    for clip in narration.get("clips", []):
        if not clip.get("id") or clip["id"] in clips:
            raise ValueError("Missing or duplicate narration clip id")
        if not local_file(p, clip["file"]).is_file():
            raise ValueError(f"Required narration asset missing: {clip['file']}")
        clips[clip["id"]] = clip
    beat = 60 / sb.get("music", {}).get("bpm", 120)
    bar = beat * sb.get("music", {}).get("beatsPerBar", 4)
    start = 0.0
    for scene in sb["scenes"]:
        if "endAnchor" in scene:
            if "durationSec" in scene or "bars" in scene:
                raise ValueError("endAnchor cannot coexist with durationSec/bars")
            scene["durationSec"] = anchor_time(scene["endAnchor"], lines, clips) - start
        duration = finite(scene.get("durationSec", scene.get("bars", 0) * bar), "scene duration")
        if duration <= 0:
            raise ValueError(f"{scene['id']}: nonpositive scene duration")
        for category in ("events", "lines", "sfx"):
            for item in scene.get(category, []):
                if "anchor" in item:
                    key = "at" if category == "events" else "atSec"
                    item[key] = round(anchor_time(item["anchor"], lines, clips) - start, 6)
                    item["resolvedAnchor"] = item.pop("anchor")
                if category == "lines" and "outAnchor" in item:
                    item["outSec"] = round(anchor_time(item.pop("outAnchor"), lines, clips) - start, 6)
                if category == "sfx":
                    at = item.get("atSec", item.get("at", 0) * beat)
                    if not 0 <= finite(at, "sfx time") < duration:
                        raise ValueError(f"{scene['id']}: sfx outside scene")
                if category == "events":
                    if not 0 <= finite(item["at"], "event time") < duration:
                        raise ValueError(f"{scene['id']}: event outside scene")
                    if finite(item.get("duration", 0), "event duration") <= 0 or item["at"] + item["duration"] > duration + .001:
                        raise ValueError(f"{scene['id']}: event duration extends outside scene")
        start += duration
    if sb.get("duration") is not None and abs(finite(sb["duration"], "duration") - start) > .05:
        raise ValueError(f"Scene duration {start:.3f} differs from target {sb['duration']}")
    sb["duration"] = round(start, 6)
    for line in lines.values():
        if line["end"] > start + .001:
            raise ValueError("Narration extends past the final scene")
    for clip in timeline.get("clips", []):
        if clip.get("audioDuration") and clip["at"] + clip["audioDuration"] > start + .03:
            raise ValueError("Generated audio extends past the final scene; extend endAnchor/duration, never silently truncate it")
    point_ids = [point["id"] for point in sb.get("informationPoints", [])]
    if len(set(point_ids)) != len(point_ids):
        raise ValueError("Duplicate information point id")
    for scene in sb["scenes"]:
        markers = set()
        for plan in scene.get("explanations", []):
            if plan.get("line") not in lines:
                raise ValueError("explanations.line needs a valid narration timeline line id")
            if plan.get("exemptReason"):
                continue
            if not plan.get("id") or plan["id"] in markers or not plan.get("kind"):
                raise ValueError("Explanation diagrams need unique id and kind inside each scene")
            if plan.get("point") and plan["point"] not in point_ids:
                raise ValueError("Unknown explanation point")
            markers.add(plan["id"])
    sb["_narrationTimeline"] = list(lines.values())
    from shots import prepare_shots
    prepare_shots(sb, p)
    return sb


if __name__ == "__main__":
    import sys
    try:
        print(json.dumps(load_project(sys.argv[1]), ensure_ascii=False))
    except (ValueError, KeyError, OSError, TypeError) as exc:
        sys.exit("PROJECT: " + str(exc))
