#!/usr/bin/env python3
"""Optional Edge TTS: sentence cache + measured word timeline. No automatic install, account, or endpoint patch."""
import argparse
import asyncio
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from project import digest, finite, local_file


def atomic_json(path, value):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    os.replace(tmp, path)


def duration(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)], capture_output=True, check=True)
    return float(json.loads(result.stdout)["format"]["duration"])


async def build(project, offline=False):
    try:
        import edge_tts
    except ImportError:
        raise ValueError("edge-tts not found; use CKV_TTS_PYTHON or install into a project .venv-tts")
    script_bytes = (project / "script.json").read_bytes()
    script_hash = hashlib.sha256(script_bytes).hexdigest()
    cfg = json.loads(script_bytes)
    if cfg.get("provider", "edge-tts") != "edge-tts":
        raise ValueError("Only provider=edge-tts is supported; existing recordings use narration.clips")
    lines = cfg.get("lines", [])
    identifiers = [line.get("id", "") for line in lines]
    if not lines or len(set(identifiers)) != len(lines) or any(not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", x) for x in identifiers):
        raise ValueError("script lines need unique safe ids (letters/digits/_/-)")
    for line in lines:
        if not isinstance(line.get("text"), str) or not line["text"].strip():
            raise ValueError("Each line needs nonempty text; use pauseBefore/pauseAfter for silence")
        for key in ("pauseBefore", "pauseAfter"):
            if finite(line.get(key, 0), key) < 0:
                raise ValueError("Pauses cannot be negative")
    for key, default in (("leadIn", .6), ("gap", .25), ("tail", 1.0)):
        if finite(cfg.get(key, default), key) < 0:
            raise ValueError(f"{key} cannot be negative")
    cache_dir = project / "assets" / "narration"
    cache_dir.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(2)
    service_version = version("edge-tts")

    async def synth(line):
        spec = {key: line.get(key, cfg.get(key, default)) for key, default in (("voice", "zh-CN-YunxiNeural"), ("rate", "+0%"), ("pitch", "+0Hz"))}
        payload = {**spec, "text": line["text"], "version": service_version, "boundary": "WordBoundary"}
        key = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        mp3, meta = cache_dir / (key + ".mp3"), cache_dir / (key + ".json")
        if mp3.exists() and meta.exists():
            saved = json.loads(meta.read_text())
            if saved.get("key") == key and saved.get("sha256") == digest(mp3):
                print(f"cache {line['id']}")
                return mp3, saved
        if offline:
            raise ValueError(f"No valid cached audio for {line['id']}; offline mode never contacts the service")
        async with sem:
            for attempt in range(3):
                try:
                    async def request():
                        audio, words = bytearray(), []
                        com = edge_tts.Communicate(line["text"], boundary="WordBoundary", **spec)
                        async for message in com.stream():
                            if message["type"] == "audio":
                                audio.extend(message["data"])
                            elif message["type"] == "WordBoundary":
                                a = message["offset"] / 1e7
                                words.append({"text": message["text"], "start": round(a, 6), "end": round(a + message["duration"] / 1e7, 6)})
                        if not audio or not words:
                            raise ValueError("Service returned no audio or measured word boundaries")
                        return audio, words
                    audio, words = await asyncio.wait_for(request(), timeout=50)
                    tmp = mp3.with_suffix(f".part.{os.getpid()}.mp3")
                    tmp.write_bytes(audio)
                    length = duration(tmp)
                    if words[-1]["end"] > length + .15:
                        raise ValueError("Service word times exceed audio duration")
                    os.replace(tmp, mp3)
                    saved = {"key": key, "sha256": digest(mp3), "duration": length, "words": words, **payload}
                    atomic_json(meta, saved)
                    print(f"synth {line['id']}: {length:.2f}s, {len(words)} boundaries")
                    return mp3, saved
                except Exception as exc:
                    # Service errors may contain signed URLs: print type/status only.
                    status_code = getattr(exc, "status", None)
                    if attempt == 2 or status_code in (400, 401, 403) or isinstance(exc, TypeError):
                        raise ValueError(f"{line['id']}: TTS failed ({type(exc).__name__}, HTTP {status_code or 'n/a'}). Check network / installed edge-tts; existing recordings remain supported") from None
                    await asyncio.sleep(1 + attempt)
    # Identical spoken lines share one request/cache file, even if their line ids differ.
    tasks, ordered = {}, []
    for line in lines:
        identity = json.dumps({"text": line["text"], **{key: line.get(key, cfg.get(key, default)) for key, default in (("voice", "zh-CN-YunxiNeural"), ("rate", "+0%"), ("pitch", "+0Hz"))}}, ensure_ascii=False, sort_keys=True)
        if identity not in tasks:
            tasks[identity] = asyncio.create_task(synth(line))
        ordered.append(tasks[identity])
    results = await asyncio.gather(*ordered)
    cursor = float(cfg.get("leadIn", .6))
    timeline, clips, assets = [], [], []
    for line, (mp3, meta) in zip(lines, results):
        cursor += float(line.get("pauseBefore", 0))
        if "at" in line:
            target = finite(line["at"], "line.at")
            if target < cursor - .001:
                raise ValueError(f"{line['id']}: requested audio start overlaps previous audio/pause")
            cursor = target
        words = [{**w, "start": round(w["start"] + cursor, 6), "end": round(w["end"] + cursor, 6)} for w in meta["words"]]
        relative = str(mp3.relative_to(project))
        timeline.append({"id": line["id"], "text": line["text"], "start": words[0]["start"], "end": words[-1]["end"], "words": words, "timing": "word-boundary"})
        clips.append({"id": line["id"], "file": relative, "at": round(cursor, 6), "audioDuration": meta["duration"], "text": line["text"], "origin": {"provider": "edge-tts", "voice": meta["voice"], "version": service_version, "containsMusic": False}})
        assets.append({"file": relative, "sha256": meta["sha256"]})
        cursor += meta["duration"] + float(cfg.get("gap", .25)) + float(line.get("pauseAfter", 0))
    total = cursor - float(cfg.get("gap", .25)) + float(cfg.get("tail", 1.0))
    if digest(project / "script.json") != script_hash:
        raise ValueError("script.json changed during synthesis; rerun TTS for the new script")
    data = {"provider": "edge-tts", "providerVersion": service_version, "scriptHash": script_hash, "duration": round(total, 6), "lines": timeline, "clips": clips, "assets": assets}
    destination = local_file(project, cfg.get("timeline", "narration-timeline.json"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    atomic_json(destination, data)
    def stamp(t):
        ms = round(t * 1000)
        return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"
    destination.with_suffix(".srt").write_text("\n\n".join(f"{i}\n{stamp(l['start'])} --> {stamp(l['end'])}\n{l['text']}" for i, l in enumerate(timeline, 1)) + "\n")
    print(f"timeline {destination.name}: {len(lines)} lines, {total:.3f}s incl tail")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("--offline", action="store_true", help="cache only; never send text")
    args = parser.parse_args()
    try:
        asyncio.run(build(args.project.resolve(), args.offline))
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        sys.exit("TTS: " + str(exc))
