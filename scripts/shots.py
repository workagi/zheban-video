"""Typed shot registry and derived relationships. Standard library only; no model code executes here."""
import copy
import json
import math
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[1] / "engine" / "shots.json"


def field(value, spec, path):
    kind = spec["kind"]
    if kind == "text":
        if not isinstance(value, str) or not spec.get("min", 1) <= len(value) <= spec.get("max", 100):
            raise ValueError(f"{path}: needs text length {spec.get('min', 1)}..{spec.get('max', 100)}")
    elif kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not spec.get("min", -1e12) <= value <= spec.get("max", 1e12):
            raise ValueError(f"{path}: invalid finite number/range")
    elif kind == "enum":
        if value not in spec["choices"]:
            raise ValueError(f"{path}: choose one of {spec['choices']}")
    elif kind == "list":
        if not isinstance(value, list) or not spec.get("min", 0) <= len(value) <= spec.get("max", 100):
            raise ValueError(f"{path}: invalid list length")
        return [field(v, spec["item"], f"{path}[{i}]") for i, v in enumerate(value)]
    elif kind == "record":
        if not isinstance(value, dict):
            raise ValueError(f"{path}: needs an object")
        unknown = set(value) - set(spec["fields"])
        if unknown:
            raise ValueError(f"{path}: unknown fields {sorted(unknown)}")
        out = {}
        for key, descriptor in spec["fields"].items():
            if key in value:
                out[key] = field(value[key], descriptor, path + "." + key)
            elif "default" in descriptor:
                out[key] = copy.deepcopy(descriptor["default"])
            elif descriptor.get("required", False):
                raise ValueError(f"{path}.{key}: required")
        return out
    else:
        raise ValueError("Invalid registry kind " + kind)
    return value


def prepare_shots(sb, project):
    registry = json.loads(REGISTRY.read_text())
    mode = sb.get("productionMode", "custom")
    if mode not in ("stable", "custom"):
        raise ValueError("productionMode must be stable or custom")
    stable = mode == "stable"
    if stable:
        if (Path(project) / "custom.js").exists():
            raise ValueError("Stable mode does not load project custom.js; use a registered shot or explicit custom mode")
        if sb.get("styleOverrides"):
            raise ValueError("Stable mode uses the registered style without styleOverrides")
        if sb.get("format") not in registry["verifiedFormats"] or sb.get("style") not in registry["verifiedStyles"]:
            raise ValueError("Stable shots v1 are verified for landscape/noir-gold only; other combinations need a short validation first")
        for font in sb.get("fontFiles", []):
            target=(Path(project)/font["path"]).resolve()
            if not target.is_relative_to(Path(project).resolve()) or not target.is_file():
                raise ValueError("Stable fontFiles must exist inside the project")
    bar = 60 / sb.get("music", {}).get("bpm", 120) * sb.get("music", {}).get("beatsPerBar", 4)
    for scene in sb["scenes"]:
        v = scene.get("visual", {"type": "none"})
        if stable and v.get("type") != "shot":
            raise ValueError(f"{scene['id']}: stable mode requires visual.type=shot")
        if stable and (scene.get("bg") or scene.get("fg") or scene.get("camera", "still") != "still"):
            raise ValueError(f"{scene['id']}: shot owns background, foreground and camera")
        if stable and any(l.get("role") not in ("caption", "note") for l in scene.get("lines", [])):
            raise ValueError(f"{scene['id']}: shot owns titles; scene.lines accepts caption/note only")
        if v.get("type") != "shot":
            continue
        unknown = set(v) - {"type", "name", "params"}
        if unknown:
            raise ValueError(f"{scene['id']}: unknown shot fields {sorted(unknown)}")
        name = v.get("name")
        if name not in registry["shots"]:
            raise ValueError(f"{scene['id']}: unknown registered shot {name!r}")
        spec = registry["shots"][name]
        params = field(v.get("params", {}), {"kind": "record", "fields": spec["fields"]}, scene["id"] + "." + name)
        events = {e["id"]: e for e in scene.get("events", [])}
        event_name = params.get("event")
        at = 0.0
        if event_name:
            if event_name not in events:
                raise ValueError(f"{scene['id']}: shot references missing event {event_name!r}")
            at = events[event_name]["at"]
        duration = scene.get("durationSec", scene.get("bars", 0) * bar)
        if stable and scene is sb["scenes"][-1]:
            fade = sb.get("fadeOut", 1)
            if isinstance(fade, bool) or not isinstance(fade, (int, float)) or not math.isfinite(fade) or fade < 0:
                raise ValueError("fadeOut must be a finite nonnegative number")
            duration -= fade
        derived = {"at": at, "registryVersion": registry["version"]}
        if name == "lag-copy":
            derived["own"] = [params["initial"]] + params["opponent"][:-1]
            derived["links"] = [[i, i + 1] for i in range(len(params["opponent"]) - 1)]
            complete = at + (len(params["opponent"]) - 1) * params["stepSeconds"] + .75
        elif name == "ranking":
            items = params["items"]
            facts = Path(project)/"facts.md"
            if not facts.is_file() or any(item["source"] not in facts.read_text() for item in items):
                raise ValueError(f"{scene['id']}: ranking source ids must be recorded in facts.md (record check only, not fact verification)")
            if len({item["id"] for item in items}) != len(items):
                raise ValueError(f"{scene['id']}: ranking item ids must be unique")
            if not any(item["value"] > 0 for item in items):
                raise ValueError(f"{scene['id']}: ranking needs at least one positive value")
            if params["variant"] == "horizontal" and len(items) > 6:
                raise ValueError(f"{scene['id']}: horizontal ranking supports at most 6 entries")
            sorted_items = sorted(items, key=lambda item: -item["value"])
            if len(items) > 8 and any(len(item["label"]) > 3 for item in items):
                raise ValueError(f"{scene['id']}: dense column rankings need labels <=3 characters")
            derived.update({"items": sorted_items, "maximum": sorted_items[0]["value"], "winners": [item["id"] for item in items if item["value"] == sorted_items[0]["value"]]})
            complete = at + 1.7
        else:
            complete = at + .7
        # Require time to read the completed relation. An event cannot land at the cut.
        if complete + spec["holdSeconds"] > duration - .05:
            raise ValueError(f"{scene['id']}: {name} needs completion by {complete:.2f}s plus {spec['holdSeconds']}s hold; scene lasts {duration:.2f}s")
        derived["complete"] = complete
        if stable:
            phase = scene.get("staging", "explain")
            if phase not in registry["stagingProfiles"]:
                raise ValueError(f"{scene['id']}: unknown staging profile {phase!r}")
            scene["_staging"] = copy.deepcopy(registry["stagingProfiles"][phase])
            energy = scene.get("energy", scene["_staging"]["energy"])
            if isinstance(energy, bool) or not isinstance(energy, (int, float)) or not math.isfinite(energy) or not 0 <= energy <= 1:
                raise ValueError("scene.energy must be a finite number in 0..1")
            scene["energy"] = energy
        v.update({"params": params, "computed": derived, "preroll": 0})
        scene.update({"camera": "still", "textBed": False})
        if stable:
            scene["transition"] = "cut"
    if stable:
        if not sb.get("fontFiles"):
            raise ValueError("Stable mode needs project-local fontFiles for reproducibility")
        sb["styleOverrides"] = copy.deepcopy(registry["styleOverrides"])
    return sb


if __name__ == "__main__":
    print(REGISTRY.read_text())
