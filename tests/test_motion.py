"""Actual encoded video fixtures: detect an isolated flash, preserve deliberate holds/cuts."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from motion_check import inspect


class MotionTests(unittest.TestCase):
    def test_encoded_flash_and_registered_transitions(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            sb = {"format": "landscape", "style": "noir-gold", "fps": 30, "fadeOut": 0, "music": {"bpm": 120}, "scenes": [{"id": "one", "durationSec": 5}]}
            frames = np.full((150, 36, 64), 90, dtype=np.uint8)
            frames[60] = 255
            video = p / "flash.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "64x36", "-r", "30", "-i", "-", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", str(video)], input=frames.tobytes(), check=True)
            (p / "storyboard.json").write_text(json.dumps(sb))
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(inspect(p, video), 1)
            findings = json.loads((p / "qa/motion.json").read_text())["findings"]
            self.assertTrue(any(f["kind"] == "one-frame-flash" and abs(f["at"] - 2) < .04 for f in findings))
            sb["motionReview"] = {"intentional": [{"start": 1.95, "end": 2.05, "kind": "flash", "reason": "test deliberate flash"}, {"start": 0, "end": 5, "kind": "hold", "reason": "test reading hold"}]}
            (p / "storyboard.json").write_text(json.dumps(sb))
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(inspect(p, video), 0)
            sb["motionReview"]["intentional"] = [sb["motionReview"]["intentional"][1]]
            (p / "storyboard.json").write_text(json.dumps(sb))
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(inspect(p, video), 1)  # a reading hold must not hide a flash
            frames[60:] = 170
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", "64x36", "-r", "30", "-i", "-", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", str(video)], input=frames.tobytes(), check=True)
            sb["motionReview"] = {"intentional": [{"start": 0, "end": 5, "kind": "hold", "reason": "test reading hold"}]}
            sb["scenes"] = [{"id": "one", "durationSec": 2}, {"id": "two", "durationSec": 3, "transition": "cut"}]
            (p / "storyboard.json").write_text(json.dumps(sb))
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(inspect(p, video), 0)


if __name__ == "__main__":
    unittest.main()
