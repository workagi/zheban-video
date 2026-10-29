"""Offline invariants: measured phrase boundaries, explicit failure, old timing compatibility."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from project import anchor_time, load_project


class TimingTests(unittest.TestCase):
    def setUp(self):
        self.line = {"id": "rule", "text": "先合作，再合作", "start": 1, "end": 5, "words": [
            {"text": "先", "start": 1, "end": 1.4}, {"text": "合", "start": 1.5, "end": 1.8},
            {"text": "作", "start": 1.8, "end": 2.2}, {"text": "再", "start": 3, "end": 3.4},
            {"text": "合作", "start": 3.5, "end": 5}]}

    def test_phrase_across_boundaries_and_occurrence(self):
        self.assertEqual(anchor_time({"line": "rule", "word": "合作"}, {"rule": self.line}, {}), 1.5)
        self.assertEqual(anchor_time({"line": "rule", "word": "合作", "occurrence": 1, "edge": "end"}, {"rule": self.line}, {}), 5)

    def test_voice_shift_moves_anchor(self):
        shifted = json.loads(json.dumps(self.line))
        for item in [shifted, *shifted["words"]]:
            item["start"] += .7
            item["end"] += .7
        self.assertAlmostEqual(anchor_time({"line": "rule", "word": "合作"}, {"rule": shifted}, {}), 2.2)

    def test_no_estimated_or_missing_word_fallback(self):
        for request in ({"line": "rule", "word": "背叛"}, {"line": "missing"}, {"line": "rule", "word": "合作", "occurrence": 3}):
            with self.assertRaises(ValueError):
                anchor_time(request, {"rule": self.line}, {})
        self.line["timing"] = "estimated"
        with self.assertRaises(ValueError):
            anchor_time({"line": "rule", "word": "合作"}, {"rule": self.line}, {})

    def test_legacy_bars_clip_and_seconds(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            sb = {"music": {"bpm": 120}, "narration": {"clips": [{"id": "voice", "file": "assets/voice.wav", "at": 1}]}, "scenes": [{"id": "one", "bars": 2, "events": [{"id": "x", "anchor": {"clip": "voice", "offset": .5}, "duration": .4}]}, {"id": "two", "durationSec": 1.3}]}
            (p / "assets").mkdir(exist_ok=True)
            (p / "assets/voice.wav").write_bytes(b"test asset for resolver existence check")
            (p / "storyboard.json").write_text(json.dumps(sb))
            result = load_project(p)
            self.assertAlmostEqual(result["duration"], 5.3)
            self.assertEqual(result["scenes"][0]["events"][0]["at"], 1.5)
            sb["scenes"][0]["events"][0]["anchor"]["offset"] = 20
            (p / "storyboard.json").write_text(json.dumps(sb))
            with self.assertRaises(ValueError):
                load_project(p)


if __name__ == "__main__":
    unittest.main()
